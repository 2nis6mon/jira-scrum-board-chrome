import { describe, expect, it } from "vitest";
import { assembleBoardIssues, type BoardSnapshot } from "../../src/core/boardIssue";
import {
  buildBoardLayout,
  columnLoad,
  daysRemaining,
  filterOptions,
} from "../../src/core/boardLayout";
import { focusGoal, NO_FILTERS } from "../../src/core/filters";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import type { JiraIssue } from "../../src/jira/models";
import { makeConfiguration, makeIssue } from "../support/jiraFixtures";

const config = makeConfiguration({ runColumns: makeConfiguration().scrumColumns });
const GOALS = [
  makeSprintGoal({ id: "g1", title: "Paiement", position: 0 }),
  makeSprintGoal({ id: "g2", title: "Stabilité", position: 1 }),
];

function snapshot(
  scrum: JiraIssue[],
  run: JiraIssue[] = [],
  links: Record<string, string> = {},
): BoardSnapshot {
  const assemble = (issues: JiraIssue[], l: Record<string, string>) =>
    assembleBoardIssues({ issues, configuration: config, columns: config.scrumColumns, links: l });
  return {
    sprint: null,
    activeSprints: [],
    goals: GOALS,
    scrumIssues: assemble(scrum, links),
    runIssues: assemble(run, {}),
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
  };
}

const lanesOf = (layout: ReturnType<typeof buildBoardLayout>) =>
  layout.lanes.map((lane) => [
    lane.id,
    lane.cells.map((cell) => cell.issues.map((issue) => issue.issue.key)),
  ]);

describe("buildBoardLayout", () => {
  const board = snapshot(
    [
      makeIssue("ABC-1", { statusId: "1", category: "new" }),
      makeIssue("ABC-2", { statusId: "3" }),
      makeIssue("ABC-3", { statusId: "6", category: "done" }),
      makeIssue("ABC-4", { statusId: "3" }),
    ],
    [makeIssue("RUN-1", { statusId: "3", typeId: "10004" })],
    { "ABC-1": "g1", "ABC-2": "g1", "ABC-3": "g2" },
  );

  it("range chaque ticket dans sa swimlane et sa colonne, dans l'ordre de Jira", () => {
    expect(lanesOf(buildBoardLayout(board, config, NO_FILTERS))).toEqual([
      ["goal:g1", [["ABC-1"], ["ABC-2"], []]],
      ["goal:g2", [[], [], ["ABC-3"]]],
      ["build", [[], ["ABC-4"], []]],
      ["run", [[], ["RUN-1"], []]],
    ]);
  });

  it("l'avancement d'un objectif ignore les filtres", () => {
    const layout = buildBoardLayout(board, config, { ...NO_FILTERS, searchText: "ABC-1" });
    const lane = layout.lanes.find((l) => l.id === "goal:g1");
    expect(lane?.visibleCount).toBe(1);
    expect(lane?.totalCount).toBe(2);
    expect(lane?.progress?.total).toBe(2);
    expect(layout.visibleCount).toBe(1);
    expect(layout.totalCount).toBe(5);
  });

  it("filtre actif : les swimlanes sans ticket retenu disparaissent", () => {
    const layout = buildBoardLayout(board, config, focusGoal(NO_FILTERS, "g2"));
    expect(layout.lanes.map((lane) => lane.id)).toEqual(["goal:g2"]);
  });

  it("objectif masqué : sa swimlane disparaît, ses tickets rejoignent Build", () => {
    const hidden = { ...config, hiddenGoalIds: ["g1"] };
    expect(lanesOf(buildBoardLayout(board, hidden, NO_FILTERS)).map(([id]) => id)).toEqual([
      "goal:g2",
      "build",
      "run",
    ]);
    const build = buildBoardLayout(board, hidden, NO_FILTERS).lanes.find((l) => l.id === "build");
    expect(build?.cells.flatMap((cell) => cell.issues.map((i) => i.issue.key))).toEqual([
      "ABC-1",
      "ABC-2",
      "ABC-4",
    ]);
  });

  it("respecte l'ordre local des swimlanes et le libellé de Build", () => {
    const ordered = {
      ...config,
      blockOrder: ["run", "goal:g2", "build", "goal:g1"],
      buildSectionLabel: "Hors objectif",
    };
    const layout = buildBoardLayout(board, ordered, NO_FILTERS);
    expect(layout.lanes.map((lane) => lane.title)).toEqual([
      "RUN",
      "Stabilité",
      "Hors objectif",
      "Paiement",
    ]);
  });

  it("RUN masqué par réglage, ou absent faute de ticket RUN", () => {
    expect(
      buildBoardLayout(board, { ...config, showRunSection: false }, NO_FILTERS).lanes.map(
        (l) => l.id,
      ),
    ).not.toContain("run");
    expect(buildBoardLayout(snapshot([]), config, NO_FILTERS).lanes.map((l) => l.id)).toEqual([
      "goal:g1",
      "goal:g2",
      "build",
    ]);
  });

  it("compte les tickets dont le statut n'est dans aucune colonne visible", () => {
    const withOrphan = snapshot([
      makeIssue("ABC-9", { statusId: "99" }),
      makeIssue("ABC-1", { statusId: "1" }),
    ]);
    const layout = buildBoardLayout(withOrphan, config, NO_FILTERS);
    expect(layout.unmappedCount).toBe(1);
    expect(layout.visibleCount).toBe(1);

    const hiddenColumn = {
      ...config,
      scrumColumns: config.scrumColumns.map((c) => (c.id === "todo" ? { ...c, hidden: true } : c)),
    };
    expect(buildBoardLayout(withOrphan, hiddenColumn, NO_FILTERS).unmappedCount).toBe(2);
  });

  it("charge par colonne, hors RUN et sans tenir compte des filtres, pour les limites WIP", () => {
    expect(Object.fromEntries(columnLoad(board))).toEqual({ todo: 1, prog: 2, done: 1 });
    const hidden = snapshot([makeIssue("ABC-9", { statusId: "99" })]);
    expect(Object.fromEntries(columnLoad(hidden))).toEqual({});
  });
});

describe("filterOptions", () => {
  it("liste les valeurs présentes, triées, avec leur nombre de tickets", () => {
    const options = filterOptions(
      snapshot(
        [
          makeIssue("ABC-1", {
            assigneeId: "u2",
            assigneeName: "Zoé",
            labels: ["b", "a"],
            priority: "High",
            parent: "ABC-90",
          }),
          makeIssue("ABC-2", { assigneeId: "u1", assigneeName: "Élodie", labels: ["a"] }),
          makeIssue("ABC-3"),
        ],
        [],
        { "ABC-1": "g2" },
      ),
    );
    expect(options.assignees.map((o) => o.label)).toEqual(["Élodie", "Zoé"]);
    expect(options.unassignedCount).toBe(1);
    expect(options.labels).toEqual([
      { value: "a", label: "a", count: 2 },
      { value: "b", label: "b", count: 1 },
    ]);
    expect(options.priorities.map((o) => o.value)).toEqual(["High"]);
    expect(options.parents).toEqual([{ value: "ABC-90", label: "ABC-90 · Epic ABC-90", count: 1 }]);
    expect(options.withoutParentCount).toBe(2);
    expect(options.goals.map((o) => [o.value, o.count])).toEqual([
      ["g1", 0],
      ["g2", 1],
    ]);
    expect(options.withoutGoalCount).toBe(2);
  });
});

describe("daysRemaining", () => {
  // Dates construites en heure locale : le calcul se fait en jours de calendrier locaux.
  const now = new Date(2026, 8, 18, 10, 0);
  it("compte en jours de calendrier : 0 le dernier jour, négatif une fois la date passée", () => {
    expect(daysRemaining(new Date(2026, 8, 25, 18, 0), now)).toBe(7);
    expect(daysRemaining(new Date(2026, 8, 19, 0, 30), now)).toBe(1);
    expect(daysRemaining(new Date(2026, 8, 18, 23, 59), now)).toBe(0);
    expect(daysRemaining(new Date(2026, 8, 18, 8, 0), now)).toBe(0);
    expect(daysRemaining(new Date(2026, 8, 16, 18, 0), now)).toBe(-2);
    expect(daysRemaining(null, now)).toBeNull();
  });

  it("traverse un changement d'heure sans décalage", () => {
    expect(daysRemaining(new Date(2026, 9, 26, 9, 0), new Date(2026, 9, 24, 9, 0))).toBe(2);
    expect(daysRemaining(new Date(2026, 2, 30, 9, 0), new Date(2026, 2, 28, 9, 0))).toBe(2);
  });
});
