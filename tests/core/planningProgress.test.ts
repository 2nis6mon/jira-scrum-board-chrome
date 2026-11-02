import { describe, expect, it, vi } from "vitest";
import {
  atlassianGoalHistory,
  closedSprintCache,
  type HistoryReader,
  MAX_HISTORY_SPRINTS,
  progressCategory,
  textGoalHistory,
} from "../../src/core/planningProgress";
import { decodeIssue, decodeSprint, type JiraIssue } from "../../src/jira/models";
import { issueJson } from "../support/jiraFixtures";

const query = { estimationFieldId: "customfield_10016", includeChangelog: false };
const done = (key: string, points?: number) =>
  decodeIssue(
    issueJson(key, {
      category: "done",
      statusName: "Terminé",
      ...(points !== undefined && { points }),
    }),
  );
const ongoing = (key: string) => decodeIssue(issueJson(key, { category: "indeterminate" }));
const todo = (key: string) => decodeIssue(issueJson(key, { category: "new" }));

/** Sprint clos dont le texte porte ses objectifs : la réconciliation part du texte. */
const closed = (id: number, day: number, goals: readonly string[]) =>
  decodeSprint({
    id,
    name: `Sprint ${id}`,
    state: "closed",
    goal: goals.map((goal) => `Objectif ${goal}`).join("\n"),
    completeDate: `2026-10-${String(day).padStart(2, "0")}T18:00:00.000Z`,
  });

interface ClosedFixture {
  readonly day: number;
  readonly goals: readonly string[];
  readonly links: Readonly<Record<string, string>>;
  readonly issues: readonly JiraIssue[];
}

/** Sprints clos fictifs : propriété (objectifs et liens) et tickets de chacun. */
function history(
  sprints: Readonly<Record<number, ClosedFixture>>,
  options: { failProperty?: number; failSprints?: boolean } = {},
) {
  return {
    sprints: vi.fn(async (_board: number, _states: readonly string[]) => {
      if (options.failSprints) throw new Error("lecture");
      return Object.entries(sprints).map(([id, sprint]) =>
        closed(Number(id), sprint.day, sprint.goals),
      );
    }),
    sprintProperty: vi.fn(async (sprintId: number) => {
      if (sprintId === options.failProperty) throw new Error("lecture");
      const sprint = sprints[sprintId];
      return {
        version: 1,
        goals: (sprint?.goals ?? []).map((id, position) => ({
          id,
          title: `Objectif ${id}`,
          color: "goal1",
          position,
        })),
        links: { ...(sprint?.links ?? {}) },
        atlassianGoalIds: [],
      };
    }),
    sprintIssues: vi.fn(async (_board: number, sprintId: number) => [
      ...(sprints[sprintId]?.issues ?? []),
    ]),
  } satisfies HistoryReader;
}

const keys = (issues: readonly JiraIssue[] | undefined) => (issues ?? []).map((issue) => issue.key);

const input = (goalIds: readonly string[], sprintKeys: readonly string[] = []) => ({
  boardId: 7,
  sprintId: 43,
  goalIds,
  sprintKeys: new Set(sprintKeys),
  query,
});

describe("avancement d'un objectif : catégorie du statut", () => {
  it("à faire, en cours, terminé ; une catégorie inconnue compte « à faire »", () => {
    expect(progressCategory(todo("A-1"))).toBe("todo");
    expect(progressCategory(ongoing("A-1"))).toBe("inProgress");
    expect(progressCategory(done("A-1"))).toBe("done");
    expect(progressCategory(decodeIssue(issueJson("A-1", { category: "autre" })))).toBe("todo");
  });
});

describe("déjà livré d'un objectif texte reporté", () => {
  it("remonte les sprints clos tant que l'identifiant y figure, tickets terminés seulement", async () => {
    const reader = history({
      41: {
        day: 20,
        goals: ["g-pay"],
        links: { "ABC-150": "g-pay", "ABC-151": "g-pay", "ABC-152": "autre" },
        issues: [done("ABC-150", 3), ongoing("ABC-151"), done("ABC-152")],
      },
      40: {
        day: 10,
        goals: ["g-pay"],
        links: { "ABC-140": "g-pay", "ABC-150": "g-pay" },
        issues: [done("ABC-140", 5), done("ABC-150", 3)],
      },
      39: {
        day: 1,
        goals: ["g-other"],
        links: { "ABC-130": "g-other" },
        issues: [done("ABC-130")],
      },
    });
    const result = await textGoalHistory(reader, input(["g-pay", "g-new"]));
    expect(keys(result.delivered["g-pay"])).toEqual(["ABC-150", "ABC-140"]);
    expect(result.delivered["g-new"]).toBeUndefined();
    expect(result.incomplete).toBe(false);
    // Le sprint 39 ne porte plus l'objectif : ses tickets ne sont pas lus.
    expect(reader.sprintIssues.mock.calls.map(([, id]) => id)).toEqual([41, 40]);
    expect(reader.sprints).toHaveBeenCalledWith(7, ["closed"]);
  });

  it("suit un report renommé « <id>-<sprint> » jusqu'à son identifiant d'origine", async () => {
    const reader = history({
      41: { day: 20, goals: ["g-pay"], links: { "ABC-150": "g-pay" }, issues: [done("ABC-150")] },
    });
    const result = await textGoalHistory(reader, input(["g-pay-43"]));
    expect(keys(result.delivered["g-pay-43"])).toEqual(["ABC-150"]);
  });

  it("exclut les tickets du sprint en préparation", async () => {
    const reader = history({
      41: { day: 20, goals: ["g"], links: { "ABC-1": "g" }, issues: [done("ABC-1")] },
    });
    expect((await textGoalHistory(reader, input(["g"], ["ABC-1"]))).delivered).toEqual({});
  });

  it("s'arrête à la limite de sprints relus et le dit", async () => {
    const sprints: Record<number, ClosedFixture> = {};
    for (let index = 0; index < MAX_HISTORY_SPRINTS + 2; index++)
      sprints[100 + index] = { day: index + 1, goals: ["g"], links: {}, issues: [] };
    const result = await textGoalHistory(history(sprints), { ...input(["g"]), sprintId: 200 });
    expect(result.incomplete).toBe(true);
  });

  it("propriété illisible ou liste des sprints clos en échec : incomplet, sans erreur", async () => {
    const sprints = {
      41: { day: 20, goals: ["g"], links: { "ABC-1": "g" }, issues: [done("ABC-1")] },
    };
    expect(await textGoalHistory(history(sprints, { failProperty: 41 }), input(["g"]))).toEqual({
      delivered: {},
      incomplete: true,
    });
    expect(await textGoalHistory(history(sprints, { failSprints: true }), input(["g"]))).toEqual({
      delivered: {},
      incomplete: true,
    });
  });

  it("garde les lectures des sprints clos dans le cache de l'appelant", async () => {
    const reader = history({
      41: { day: 20, goals: ["g"], links: { "ABC-1": "g" }, issues: [done("ABC-1")] },
    });
    const cache = closedSprintCache();
    await textGoalHistory(reader, input(["g"]), cache);
    await textGoalHistory(reader, input(["g", "h"]), cache);
    expect(reader.sprints).toHaveBeenCalledTimes(1);
    expect(reader.sprintProperty).toHaveBeenCalledTimes(1);
    expect(reader.sprintIssues).toHaveBeenCalledTimes(1);
  });

  it("sans objectif à suivre, ne lit rien", async () => {
    const reader = history({});
    await textGoalHistory(reader, input([]));
    expect(reader.sprints).not.toHaveBeenCalled();
  });
});

describe("déjà livré d'un Goal Atlassian", () => {
  it("lit par JQL les tickets terminés de ses workItems, hors sprint en préparation", async () => {
    const boardIssues = vi.fn(async (_board: number, _jql: string | null) => [
      done("ABC-1", 2),
      done("ABC-3"),
    ]);
    const result = await atlassianGoalHistory(
      { boardIssues },
      {
        boardId: 7,
        goalIds: ["goal-a", "goal-b"],
        workItems: {
          "goal-a": ["ABC-1", "ABC-2"],
          "goal-b": ["ABC-3", "ABC-9"],
          other: ["ABC-4"],
        },
        workItemsComplete: true,
        sprintKeys: new Set(["ABC-9"]),
        query,
      },
    );
    expect(keys(result.delivered["goal-a"])).toEqual(["ABC-1"]);
    expect(keys(result.delivered["goal-b"])).toEqual(["ABC-3"]);
    expect(result.incomplete).toBe(false);
    expect(boardIssues).toHaveBeenCalledExactlyOnceWith(
      7,
      "key in (ABC-1, ABC-2, ABC-3) AND statusCategory = Done",
      query,
    );
  });

  it("lit par paquets de 50 clés, ignore les clés hors format, signale un échec", async () => {
    const many = Array.from({ length: 60 }, (_, index) => `ABC-${index + 1}`);
    const boardIssues = vi
      .fn(async (_board: number, _jql: string | null): Promise<JiraIssue[]> => [])
      .mockResolvedValueOnce([done("ABC-1")])
      .mockRejectedValueOnce(new Error("JQL refusé"));
    const result = await atlassianGoalHistory(
      { boardIssues },
      {
        boardId: 7,
        goalIds: ["goal-a"],
        workItems: { "goal-a": [...many, "pas une clé"] },
        workItemsComplete: true,
        sprintKeys: new Set(),
        query,
      },
    );
    expect(boardIssues).toHaveBeenCalledTimes(2);
    expect(keys(result.delivered["goal-a"])).toEqual(["ABC-1"]);
    expect(result.incomplete).toBe(true);
  });

  it("des workItems lus en partie rendent l'historique incomplet", async () => {
    const result = await atlassianGoalHistory(
      { boardIssues: vi.fn(async () => []) },
      {
        boardId: 7,
        goalIds: ["goal-a"],
        workItems: {},
        workItemsComplete: false,
        sprintKeys: new Set(),
        query,
      },
    );
    expect(result).toEqual({ delivered: {}, incomplete: true });
  });
});
