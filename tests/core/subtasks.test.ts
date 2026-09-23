import { describe, expect, it } from "vitest";
import {
  assembleBoardIssues,
  type BoardIssue,
  sprintMetrics,
  subtaskProgress,
} from "../../src/core/boardIssue";
import { filterOptions } from "../../src/core/boardLayout";
import { foldSubtasks, loadSnapshot } from "../../src/core/boardSync";
import { applyFilters, NO_FILTERS } from "../../src/core/filters";
import { JiraClient } from "../../src/jira/client";
import { decodeIssue } from "../../src/jira/models";
import { JiraTransport } from "../../src/jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { ACME, FakeJira } from "../support/fakeJira";
import { issueJson, makeConfiguration, makeIssue, statusJson } from "../support/jiraFixtures";

// Données FICTIVES. Sous-tâches repliées dans la carte de leur parent (elles ne se déplacent pas
// sur le board), Goal du parent pour celles dont le parent n'est pas sur le board.

const NOW = new Date("2026-09-18T12:00:00Z");
const SUBTASK_TYPE = { id: "10003", name: "Sous-tâche", subtask: true };
const decode = (json: Record<string, unknown>) => decodeIssue(json);

/** Sous-tâche du sprint, avec son parent, son statut et, au besoin, son assigné. */
function subtaskJson(
  key: string,
  parent: string,
  options: { category?: string; assigneeId?: string; assigneeName?: string } = {},
) {
  const category = options.category ?? "new";
  const status = { new: "1", indeterminate: "3", done: "6" }[category] ?? "1";
  return issueJson(key, {
    summary: `Morceau ${key}`,
    statusId: status,
    statusName: category,
    category,
    ...(options.assigneeId !== undefined
      ? { assigneeId: options.assigneeId, assigneeName: options.assigneeName ?? "Dev" }
      : {}),
    extraFields: { issuetype: SUBTASK_TYPE, parent: { key: parent, fields: { summary: "Story" } } },
  });
}

/** Référence de sous-tâche telle que Jira la joint à son parent (`fields.subtasks`). */
function subtaskRef(key: string, category: string) {
  return {
    key,
    fields: {
      summary: `Morceau ${key}`,
      status: statusJson(
        { new: "1", indeterminate: "3", done: "6" }[category] ?? "1",
        category,
        category,
      ),
      issuetype: SUBTASK_TYPE,
    },
  };
}

function storyJson(key: string, subtasks: unknown[], options: { assigneeId?: string } = {}) {
  return issueJson(key, {
    summary: `Story ${key}`,
    ...(options.assigneeId !== undefined ? { assigneeId: options.assigneeId } : {}),
    extraFields: { subtasks },
  });
}

describe("répartition des sous-tâches", () => {
  it("replie celles dont le parent est sur le board, et seulement celles-là", () => {
    const issues = [
      makeIssue("ABC-1"),
      decode(subtaskJson("ABC-2", "ABC-1")),
      decode(subtaskJson("ABC-3", "XYZ-9")),
    ];
    const { folded, subtaskIssues } = foldSubtasks(issues, {});
    expect([...folded]).toEqual(["ABC-2"]);
    expect([...subtaskIssues.keys()].sort()).toEqual(["ABC-2", "ABC-3"]);
  });

  it("donne à une sous-tâche sans parent sur le board le Goal de son parent", () => {
    const decoded = [decode(subtaskJson("ABC-3", "XYZ-9")), decode(subtaskJson("ABC-4", "XYZ-9"))];
    const { inheritedLinks } = foldSubtasks(decoded, { "XYZ-9": "g-1", "ABC-4": "g-2" });
    // ABC-4 a son propre rattachement : il l'emporte, rien n'est hérité.
    expect(inheritedLinks).toEqual({ "ABC-3": "g-1" });
  });
});

describe("avancement des sous-tâches", () => {
  const configuration = makeConfiguration();
  const assemble = (
    issue: Record<string, unknown>,
    sprintSubtasks: Record<string, unknown>[] = [],
  ) => {
    const [card] = assembleBoardIssues({
      issues: [decode(issue)],
      configuration,
      columns: configuration.scrumColumns,
      links: {},
      subtaskIssues: new Map(sprintSubtasks.map((json) => [json.key as string, decode(json)])),
      now: NOW,
    });
    if (!card) throw new Error("carte attendue");
    return card;
  };

  it("lit la liste complète de Jira, et l'assigné dans les tickets du sprint", () => {
    const card = assemble(
      storyJson("ABC-1", [subtaskRef("ABC-2", "done"), subtaskRef("ABC-3", "new")]),
      [subtaskJson("ABC-3", "ABC-1", { category: "indeterminate", assigneeId: "dev-1" })],
    );
    expect(
      card.subtasks.map((sub) => [sub.key, sub.statusCategoryKey, sub.assignee?.accountId]),
    ).toEqual([
      ["ABC-2", "done", undefined],
      // Le ticket du sprint fait foi pour le statut et donne l'assigné.
      ["ABC-3", "indeterminate", "dev-1"],
    ]);
  });

  it("compte les terminées ; un statut inconnu compte comme ouvert", () => {
    const card = assemble(
      storyJson("ABC-1", [
        subtaskRef("ABC-2", "done"),
        { key: "ABC-3", fields: { summary: "Sans statut" } },
      ]),
    );
    expect(subtaskProgress(card, "col-done")).toMatchObject({ total: 2, done: 1 });
  });

  it("signale les sous-tâches terminées avant la dernière colonne, et les ouvertes après", () => {
    const allDone = assemble(storyJson("ABC-1", [subtaskRef("ABC-2", "done")]));
    const last = allDone.columnId === null ? "autre" : `pas-${allDone.columnId}`;
    expect(subtaskProgress(allDone, last)).toMatchObject({
      allDoneBeforeLastColumn: true,
      openInLastColumn: [],
    });
    // Le même ticket dans la dernière colonne : plus rien à signaler, tout est cohérent.
    expect(subtaskProgress(allDone, allDone.columnId)).toMatchObject({
      allDoneBeforeLastColumn: false,
      openInLastColumn: [],
    });

    const open = assemble(
      storyJson("ABC-1", [subtaskRef("ABC-2", "done"), subtaskRef("ABC-3", "indeterminate")]),
    );
    expect(subtaskProgress(open, open.columnId)?.openInLastColumn.map((sub) => sub.key)).toEqual([
      "ABC-3",
    ]);
    expect(subtaskProgress(open, "autre")?.allDoneBeforeLastColumn).toBe(false);
  });

  it("rien pour un ticket sans sous-tâche", () => {
    expect(subtaskProgress(assemble(storyJson("ABC-1", [])), null)).toBeNull();
  });
});

describe("filtres et sous-tâches repliées", () => {
  const configuration = makeConfiguration();
  const [story] = assembleBoardIssues({
    issues: [decode(storyJson("ABC-1", [subtaskRef("ABC-2", "new")], { assigneeId: "po" }))],
    configuration,
    columns: configuration.scrumColumns,
    links: {},
    subtaskIssues: new Map([
      [
        "ABC-2",
        decode(subtaskJson("ABC-2", "ABC-1", { assigneeId: "dev-1", assigneeName: "Dana Dev" })),
      ],
    ]),
    now: NOW,
  });
  if (!story) throw new Error("carte attendue");
  const cards: BoardIssue[] = [story];

  it("le filtre Personne retrouve la story par l'assigné d'une de ses sous-tâches", () => {
    expect(applyFilters({ ...NO_FILTERS, assigneeIds: new Set(["dev-1"]) }, cards)).toEqual(cards);
    expect(applyFilters({ ...NO_FILTERS, assigneeIds: new Set(["autre"]) }, cards)).toEqual([]);
  });

  it("« Non assigné » ne regarde que le ticket lui-même", () => {
    expect(applyFilters({ ...NO_FILTERS, includeUnassigned: true }, cards)).toEqual([]);
  });

  it("la recherche trouve la story par la clé, le résumé ou l'assigné d'une sous-tâche", () => {
    for (const text of ["ABC-2", "morceau", "dana"]) {
      expect(applyFilters({ ...NO_FILTERS, searchText: text }, cards)).toEqual(cards);
    }
  });

  it("un filtre rapide Jira qui retient une sous-tâche retient sa story", () => {
    expect(applyFilters({ ...NO_FILTERS, jiraQuickFilterKeys: new Set(["ABC-2"]) }, cards)).toEqual(
      cards,
    );
  });

  it("le menu Personne propose l'assigné d'une sous-tâche, compté une fois par carte", () => {
    const snapshot = {
      sprint: null,
      activeSprints: [],
      goals: [],
      goalsOrigin: "sprintText" as const,
      scrumIssues: cards,
      runIssues: [],
      syncedAt: NOW,
      currentUser: null,
      goalsReadOnly: false,
      pinnedGoalIds: null,
      localPinnedGoalIds: null,
    };
    const people = filterOptions(snapshot).assignees;
    expect(people.map((person) => [person.value, person.count]).sort()).toEqual([
      ["dev-1", 1],
      ["po", 1],
    ]);
  });
});

describe("board complet", () => {
  it("une story et ses deux sous-tâches font une seule carte, comptée une fois", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/agile/1.0/board/1/sprint", {
        status: 200,
        json: { values: [{ id: 42, name: "Sprint 42", state: "active" }], isLast: true },
      })
      .on("GET", "/rest/agile/1.0/sprint/42/issue", {
        status: 200,
        json: {
          issues: [
            storyJson("ABC-1", [subtaskRef("ABC-2", "done"), subtaskRef("ABC-3", "new")]),
            subtaskJson("ABC-2", "ABC-1", { category: "done" }),
            subtaskJson("ABC-3", "ABC-1"),
          ],
          total: 3,
        },
      })
      .on("GET", `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 404,
      });
    const { snapshot } = await loadSnapshot({
      reader: new JiraClient(
        new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 }),
      ),
      configuration: makeConfiguration(),
      currentUser: null,
      goalsLoader: null,
      now: NOW,
    });
    expect(snapshot.scrumIssues.map((issue) => issue.issue.key)).toEqual(["ABC-1"]);
    expect(snapshot.scrumIssues[0]?.subtasks.map((sub) => sub.key)).toEqual(["ABC-2", "ABC-3"]);
    expect(sprintMetrics(snapshot, 99).totalIssues).toBe(1);
  });
});
