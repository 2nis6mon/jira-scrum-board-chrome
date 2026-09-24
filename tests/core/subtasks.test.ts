import { describe, expect, it } from "vitest";
import {
  assembleBoardIssues,
  familyKey,
  sprintMetrics,
  subtaskProgress,
} from "../../src/core/boardIssue";
import { type AtlassianGoalsLoader, loadSnapshot, subtaskFamilies } from "../../src/core/boardSync";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
import { decodeIssue } from "../../src/jira/models";
import { JiraTransport } from "../../src/jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { ACME, FakeJira } from "../support/fakeJira";
import { issueJson, makeConfiguration, makeIssue, statusJson } from "../support/jiraFixtures";

// Données FICTIVES. Les sous-tâches gardent leur carte et suivent leur story : son Goal quand elles
// n'en ont pas en propre, son bloc (Scrum ou RUN) quand elle est sur le board. La story montre
// l'avancement de ses sous-tâches et signale les incohérences.

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

describe("familles des sous-tâches", () => {
  it("relie chaque sous-tâche à son parent quand il est un ticket du sprint", () => {
    const issues = [
      makeIssue("ABC-1"),
      decode(subtaskJson("ABC-2", "ABC-1")),
      decode(subtaskJson("ABC-3", "XYZ-9")),
    ];
    const { parentOf, subtaskIssues } = subtaskFamilies(issues, {});
    expect([...parentOf].map(([key, parent]) => [key, parent.key])).toEqual([["ABC-2", "ABC-1"]]);
    expect([...subtaskIssues.keys()].sort()).toEqual(["ABC-2", "ABC-3"]);
  });

  it("donne le Goal du parent à toute sous-tâche qui n'en a pas en propre", () => {
    const issues = [
      makeIssue("ABC-1"),
      decode(subtaskJson("ABC-2", "ABC-1")),
      decode(subtaskJson("ABC-3", "XYZ-9")),
      decode(subtaskJson("ABC-4", "XYZ-9")),
    ];
    const { inheritedLinks } = subtaskFamilies(issues, {
      "ABC-1": "g-1",
      "XYZ-9": "g-2",
      "ABC-4": "g-3",
    });
    // Parent sur le board ou non, le Goal suit ; ABC-4 a son propre rattachement, il l'emporte.
    expect(inheritedLinks).toEqual({ "ABC-2": "g-1", "ABC-3": "g-2" });
  });

  it("une story et ses sous-tâches forment une famille ; l'epic d'une story n'en fait pas partie", () => {
    const configuration = makeConfiguration();
    const cards = assembleBoardIssues({
      issues: [makeIssue("ABC-1", { parent: "EPIC-1" }), decode(subtaskJson("ABC-2", "ABC-1"))],
      configuration,
      columns: configuration.scrumColumns,
      links: {},
      now: NOW,
    });
    expect(cards.map(familyKey)).toEqual(["ABC-1", "ABC-1"]);
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

describe("board complet", () => {
  function sprintJira(issues: unknown[]) {
    return new FakeJira()
      .on("GET", "/rest/agile/1.0/board/1/sprint", {
        status: 200,
        json: { values: [{ id: 42, name: "Sprint 42", state: "active" }], isLast: true },
      })
      .on("GET", "/rest/agile/1.0/board/1/sprint/42/issue", {
        status: 200,
        json: { issues, total: issues.length },
      })
      .on("GET", `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 404,
      });
  }
  const loader: AtlassianGoalsLoader = {
    load: async () => ({
      goals: [makeSprintGoal({ id: "g-1", title: "Paiement", position: 0 })],
      links: { "ABC-1": "g-1" },
    }),
  };
  const sync = (issues: unknown[]) =>
    loadSnapshot({
      reader: new JiraClient(
        new JiraTransport({ site: ACME, fetch: sprintJira(issues).fetch, maxGetAttempts: 1 }),
      ),
      configuration: makeConfiguration({ goalSource: "atlassianGoals" }),
      currentUser: null,
      goalsLoader: loader,
      now: NOW,
    });

  it("la story et ses sous-tâches gardent chacune leur carte, dans la swimlane de la story", async () => {
    const { snapshot } = await sync([
      storyJson("ABC-1", [subtaskRef("ABC-2", "done"), subtaskRef("ABC-3", "new")]),
      subtaskJson("ABC-2", "ABC-1", { category: "done" }),
      subtaskJson("ABC-3", "ABC-1"),
    ]);
    expect(snapshot.scrumIssues.map((issue) => [issue.issue.key, issue.goalId])).toEqual([
      ["ABC-1", "g-1"],
      ["ABC-2", "g-1"],
      ["ABC-3", "g-1"],
    ]);
    // La story garde l'avancement de ses sous-tâches ; chacune compte comme un ticket.
    expect(snapshot.scrumIssues[0]?.subtasks.map((sub) => sub.key)).toEqual(["ABC-2", "ABC-3"]);
    expect(sprintMetrics(snapshot, 99).totalIssues).toBe(3);
  });

  it("les sous-tâches d'un ticket RUN vont dans le bloc RUN, avec lui", async () => {
    const { snapshot } = await sync([
      issueJson("RUN-1", {
        typeId: "10004",
        typeName: "Anomalie Prod",
        extraFields: { subtasks: [subtaskRef("RUN-2", "new")] },
      }),
      subtaskJson("RUN-2", "RUN-1"),
    ]);
    expect(snapshot.runIssues.map((issue) => issue.issue.key)).toEqual(["RUN-1", "RUN-2"]);
    expect(snapshot.scrumIssues).toEqual([]);
  });
});
