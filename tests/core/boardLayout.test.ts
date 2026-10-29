import { describe, expect, it } from "vitest";
import { assembleBoardIssues, type BoardSnapshot } from "../../src/core/boardIssue";
import {
  buildBoardLayout,
  columnLoad,
  daysRemaining,
  filterOptions,
} from "../../src/core/boardLayout";
import {
  withSwimlaneHidden,
  withSwimlaneName,
  withTypeDestination,
} from "../../src/core/boardSettings";
import { focusGoal, NO_FILTERS } from "../../src/core/filters";
import { withPendingMove } from "../../src/core/pendingMove";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import type { JiraIssue } from "../../src/jira/models";
import {
  makeConfiguration,
  makeIssue,
  makeSprint,
  STORY_TYPE,
  SWIMLANE_TYPE,
} from "../support/jiraFixtures";

const config = makeConfiguration();
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
    assembleBoardIssues({ issues, configuration: config, columns: config.columns, links: l });
  return {
    sprint: null,
    activeSprints: [],
    goals: GOALS,
    goalsOrigin: "sprintText",
    goalIssues: assemble(scrum, links),
    swimlaneIssues: assemble(run, {}),
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
    pinnedGoalIds: [],
    localPinnedGoalIds: null,
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
      ["swimlane:1", [[], ["RUN-1"], []]],
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
      "swimlane:1",
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
      blockOrder: ["swimlane:1", "goal:g2", "build", "goal:g1"],
      buildSectionLabel: "Hors objectif",
    };
    const layout = buildBoardLayout(board, ordered, NO_FILTERS);
    expect(layout.lanes.map((lane) => lane.title)).toEqual([
      "Anomalie Prod",
      "Stabilité",
      "Hors objectif",
      "Paiement",
    ]);
  });

  it("swimlane par type masquée par réglage, ou absente faute de ses tickets", () => {
    expect(
      buildBoardLayout(board, withSwimlaneHidden(config, "1", true), NO_FILTERS).lanes.map(
        (l) => l.id,
      ),
    ).not.toContain("swimlane:1");
    expect(buildBoardLayout(snapshot([]), config, NO_FILTERS).lanes.map((l) => l.id)).toEqual([
      "goal:g1",
      "goal:g2",
    ]);
  });

  it("Build vide apparaît seulement pendant le glisser-déposer d'un ticket par objectif", () => {
    expect(
      buildBoardLayout(snapshot([]), config, NO_FILTERS, { showEmptyBuild: true }).lanes.map(
        (lane) => lane.id,
      ),
    ).toEqual(["goal:g1", "goal:g2", "build"]);
  });

  it("un objectif accueille un type dédié, même si sa swimlane par défaut est masquée", () => {
    const linked = snapshot(
      [makeIssue("RUN-1", { typeId: SWIMLANE_TYPE.id, points: 3, statusId: "6" })],
      [],
      { "RUN-1": "g1" },
    );
    const layout = buildBoardLayout(linked, withSwimlaneHidden(config, "1", true), NO_FILTERS);
    expect(lanesOf(layout)).toEqual([
      ["goal:g1", [[], [], ["RUN-1"]]],
      ["goal:g2", [[], [], []]],
    ]);
    expect(layout.lanes[0]?.progress).toMatchObject({ total: 1, done: 1, totalPoints: 3 });
    expect(filterOptions(linked).goals[0]?.count).toBe(1);
  });

  it("un objectif masqué rend le ticket à sa swimlane par défaut sans effacer le lien", () => {
    const linked = snapshot([makeIssue("RUN-1", { typeId: SWIMLANE_TYPE.id, statusId: "1" })], [], {
      "RUN-1": "g1",
    });
    const hidden = { ...config, hiddenGoalIds: ["g1"] };
    expect(lanesOf(buildBoardLayout(linked, hidden, NO_FILTERS))).toEqual([
      ["goal:g2", [[], [], []]],
      ["swimlane:1", [["RUN-1"], [], []]],
    ]);
    expect(linked.goalIssues[0]?.goalId).toBe("g1");
    expect(
      buildBoardLayout(linked, withSwimlaneHidden(hidden, "1", true), NO_FILTERS).visibleCount,
    ).toBe(0);
  });

  it("révèle la destination vide en bas pendant le déplacement, sans déplacer la source", () => {
    const ordered = {
      ...config,
      blockOrder: ["swimlane:1", "build", "goal:g1", "goal:g2"],
      collapsedBlockIds: ["swimlane:1", "build"],
    };
    const empty = snapshot([]);
    expect(
      buildBoardLayout(empty, ordered, NO_FILTERS, { showEmptySwimlaneId: "1" }).lanes.map(
        (lane) => lane.id,
      ),
    ).toEqual(["goal:g1", "goal:g2", "swimlane:1"]);
    expect(
      buildBoardLayout(empty, ordered, NO_FILTERS, { showEmptyBuild: true }).lanes.map(
        (lane) => lane.id,
      ),
    ).toEqual(["goal:g1", "goal:g2", "build"]);
    expect(
      buildBoardLayout(empty, ordered, NO_FILTERS, { showEmptyBuild: true }).lanes.at(-1)
        ?.collapsed,
    ).toBe(false);
    expect(
      buildBoardLayout(empty, ordered, NO_FILTERS, { showEmptySwimlaneId: "1" }).lanes.at(-1)
        ?.collapsed,
    ).toBe(false);
    expect(
      buildBoardLayout(empty, withSwimlaneHidden(ordered, "1", true), NO_FILTERS, {
        showEmptySwimlaneId: "1",
      }).lanes.map((lane) => lane.id),
    ).toEqual(["goal:g1", "goal:g2"]);
    // Une destination déjà peuplée garde son ordre normal pendant le déplacement.
    expect(
      buildBoardLayout(board, ordered, NO_FILTERS, { showEmptySwimlaneId: "1" }).lanes[0]?.id,
    ).toBe("swimlane:1");
    expect(buildBoardLayout(board, ordered, NO_FILTERS).lanes[0]?.collapsed).toBe(true);
    expect(ordered.collapsedBlockIds).toEqual(["swimlane:1", "build"]);
  });

  it("l'objectif masqué retrouve le rang Jira entre tickets rattachés et sans objectif", () => {
    const board: BoardSnapshot = {
      ...snapshot(
        [makeIssue("RUN-2", { typeId: SWIMLANE_TYPE.id })],
        [
          makeIssue("RUN-1", { typeId: SWIMLANE_TYPE.id }),
          makeIssue("RUN-3", { typeId: SWIMLANE_TYPE.id }),
        ],
        { "RUN-2": "g1" },
      ),
      issueOrder: ["RUN-1", "RUN-2", "RUN-3"],
    };
    const hidden = { ...config, hiddenGoalIds: ["g1"] };
    const lane = buildBoardLayout(board, hidden, NO_FILTERS).lanes.find(
      (lane) => lane.id === "swimlane:1",
    );
    expect(lane?.cells.flatMap((cell) => cell.issues.map((issue) => issue.issue.key))).toEqual([
      "RUN-1",
      "RUN-2",
      "RUN-3",
    ]);
    expect(board.goalIssues[0]?.goalId).toBe("g1");
  });

  it.each(["objectif", "recherche"] as const)(
    "un filtre %s révèle la destination du déplacement sans révéler ses autres tickets",
    (kind) => {
      const filteredBoard = snapshot(
        [makeIssue("RUN-1", { typeId: SWIMLANE_TYPE.id }), makeIssue("ABC-1"), makeIssue("ABC-2")],
        [makeIssue("RUN-2", { typeId: SWIMLANE_TYPE.id })],
        { "RUN-1": "g1", "ABC-1": "g1" },
      );
      const ordered = {
        ...config,
        blockOrder: ["swimlane:1", "build", "goal:g1", "goal:g2"],
        collapsedBlockIds: ["swimlane:1", "build"],
      };
      const filters =
        kind === "objectif" ? focusGoal(NO_FILTERS, "g1") : { ...NO_FILTERS, searchText: "-1" };
      expect(
        buildBoardLayout(filteredBoard, ordered, filters).lanes.map((lane) => lane.id),
      ).toEqual(["goal:g1", "goal:g2"]);
      for (const [id, options] of [
        ["swimlane:1", { showEmptySwimlaneId: "1" }],
        ["build", { showEmptyBuild: true }],
      ] as const) {
        const layout = buildBoardLayout(filteredBoard, ordered, filters, options);
        expect(layout.lanes.map((lane) => lane.id)).toEqual(["goal:g1", "goal:g2", id]);
        const target = layout.lanes.at(-1);
        expect(target).toMatchObject({ totalCount: 1, visibleCount: 0, collapsed: false });
        expect(target?.cells.every((cell) => cell.issues.length === 0)).toBe(true);
        expect(layout).toMatchObject({ totalCount: 4, visibleCount: 2, filtersActive: true });
      }
      expect(
        buildBoardLayout(filteredBoard, withSwimlaneHidden(ordered, "1", true), filters, {
          showEmptySwimlaneId: "1",
        }).lanes.map((lane) => lane.id),
      ).toEqual(["goal:g1", "goal:g2"]);
      expect(ordered.collapsedBlockIds).toEqual(["swimlane:1", "build"]);
      expect(buildBoardLayout(filteredBoard, ordered, NO_FILTERS).lanes[0]?.collapsed).toBe(true);
    },
  );

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
      columns: config.columns.map((c) => (c.id === "todo" ? { ...c, hidden: true } : c)),
    };
    expect(buildBoardLayout(withOrphan, hiddenColumn, NO_FILTERS).unmappedCount).toBe(2);
  });

  it("plusieurs swimlanes par type : une par groupe, avec son nom calculé ou choisi", () => {
    const service = { ...SWIMLANE_TYPE, id: "10005", name: "Demande de service" };
    const config2 = withSwimlaneName(
      withTypeDestination(
        makeConfiguration({ issueTypes: [STORY_TYPE, SWIMLANE_TYPE, service] }),
        "10005",
        { kind: "newSwimlane" },
      ),
      "2",
      "OPS",
    );
    const assemble = (issues: JiraIssue[]) =>
      assembleBoardIssues({ issues, configuration: config2, columns: config2.columns, links: {} });
    const two: BoardSnapshot = {
      ...board,
      goalIssues: [],
      swimlaneIssues: assemble([
        makeIssue("RUN-1", { statusId: "1", typeId: "10004" }),
        makeIssue("OPS-1", { statusId: "3", typeId: "10005" }),
      ]),
    };
    const layout = buildBoardLayout(two, config2, NO_FILTERS);
    expect(layout.lanes.map((lane) => [lane.id, lane.title])).toEqual([
      ["goal:g1", "Paiement"],
      ["goal:g2", "Stabilité"],
      ["swimlane:1", "Anomalie Prod"],
      ["swimlane:2", "OPS"],
    ]);
    expect(lanesOf(layout).slice(2)).toEqual([
      ["swimlane:1", [["RUN-1"], [], []]],
      ["swimlane:2", [[], ["OPS-1"], []]],
    ]);
  });

  it("charge par colonne : swimlanes par type comprises, sans tenir compte des filtres, pour les limites WIP", () => {
    // « prog » compte 2 tickets par objectif et 1 d'une swimlane par type : la colonne du board
    // Jira porte les deux.
    expect(Object.fromEntries(columnLoad(board))).toEqual({ todo: 1, prog: 3, done: 1 });
    const hidden = snapshot([makeIssue("ABC-9", { statusId: "99" })]);
    expect(Object.fromEntries(columnLoad(hidden))).toEqual({});
  });
});

describe("filterOptions", () => {
  it("sans objectif compte aussi les tickets des swimlanes par défaut", () => {
    const board = snapshot(
      [makeIssue("ABC-1")],
      [makeIssue("RUN-1", { typeId: SWIMLANE_TYPE.id })],
    );
    expect(filterOptions(board).withoutGoalCount).toBe(2);
    expect(
      buildBoardLayout(board, config, { ...NO_FILTERS, includeWithoutGoal: true }).visibleCount,
    ).toBe(2);
  });
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

describe("position provisoire d’un ticket", () => {
  it("change de Goal et respecte la position d’insertion sans toucher aux données Jira", () => {
    const board = snapshot(
      [
        makeIssue("ABC-1", { statusId: "1" }),
        makeIssue("ABC-2", { statusId: "1" }),
        makeIssue("ABC-3", { statusId: "1" }),
      ],
      [],
      { "ABC-1": "g1", "ABC-2": "g2", "ABC-3": "g2" },
    );
    const layout = buildBoardLayout(board, config, NO_FILTERS);
    const issue = board.goalIssues[0];
    if (!issue) throw new Error("ticket absent");
    const projected = withPendingMove(layout, {
      issue,
      block: { kind: "goal", goalId: "g2" },
      columnId: "todo",
      beforeKey: "ABC-3",
    });
    expect(
      projected.lanes
        .find((lane) => lane.id === "goal:g2")
        ?.cells[0]?.issues.map((item) => item.issue.key),
    ).toEqual(["ABC-2", "ABC-1", "ABC-3"]);
    expect(
      projected.lanes
        .flatMap((lane) => lane.cells.flatMap((cell) => cell.issues))
        .filter((item) => item.issue.key === "ABC-1"),
    ).toHaveLength(1);
    expect(issue.goalId).toBe("g1");
    expect(layout.lanes.find((lane) => lane.id === "goal:g1")?.cells[0]?.issues).toEqual([issue]);
    const reordered = withPendingMove(layout, {
      issue,
      block: { kind: "goal", goalId: "g1" },
      columnId: "todo",
      beforeKey: null,
    });
    expect(reordered.lanes[0]?.cells[0]?.issues[0]?.issue.fields.status.id).toBe("1");
  });
});

describe("plusieurs sprints actifs", () => {
  const S42 = { ...makeSprint(null), id: 42, name: "Sprint 42", originBoardId: 1 };
  const S43 = { ...makeSprint(null), id: 43, name: "Sprint 43", originBoardId: 1 };
  const OTHER = { ...makeSprint(null), id: 50, name: "Autre équipe", originBoardId: 99 };
  const links = { "ABC-1": "g1", "ABC-2": "g2" };
  const assemble = (issues: JiraIssue[], sprint: typeof S42) =>
    assembleBoardIssues({ issues, configuration: config, columns: config.columns, links, sprint });
  const board: BoardSnapshot = {
    ...snapshot([]),
    sprint: S42,
    activeSprints: [S42, S43, OTHER],
    goalSprintIds: [42, 43],
    goalSprintOf: { g1: 42, g2: 43 },
    goalIssues: [
      ...assemble([makeIssue("ABC-1", { statusId: "3" })], S42),
      ...assemble([makeIssue("ABC-2", { statusId: "3" })], S43),
      ...assemble([makeIssue("ABC-3", { statusId: "3" })], OTHER),
    ],
  };
  const keys = (layout: ReturnType<typeof buildBoardLayout>) =>
    layout.lanes.flatMap((lane) =>
      lane.cells.flatMap((cell) => cell.issues.map((i) => i.issue.key)),
    );

  it("préfixe chaque objectif du nom de son sprint", () => {
    const layout = buildBoardLayout(board, config, NO_FILTERS);
    expect(layout.lanes.map((lane) => [lane.id, lane.sprintName])).toEqual([
      ["goal:g1", "Sprint 42"],
      ["goal:g2", "Sprint 43"],
      ["build", null],
    ]);
  });

  it("un seul sprint du board : aucun préfixe", () => {
    const single = { ...board, goalSprintIds: [42], goalSprintOf: { g1: 42, g2: 42 } };
    expect(buildBoardLayout(single, config, NO_FILTERS).lanes.map((l) => l.sprintName)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("le filtre Sprint ne retient que les tickets du sprint, sans masquer aucun objectif", () => {
    const filters = { ...NO_FILTERS, sprintIds: new Set(["42"]) };
    const layout = buildBoardLayout(board, config, filters);
    expect(keys(layout)).toEqual(["ABC-1"]);
    expect(layout.lanes.map((lane) => lane.id)).toEqual(["goal:g1", "goal:g2"]);
  });

  it("combiné à un autre filtre, un objectif sans ticket retenu par cet autre filtre se masque", () => {
    const filters = { ...NO_FILTERS, sprintIds: new Set(["42"]), searchText: "ABC-1" };
    expect(buildBoardLayout(board, config, filters).lanes.map((lane) => lane.id)).toEqual([
      "goal:g1",
    ]);
  });

  it("propose chaque sprint affiché, celui d'un autre board signalé", () => {
    expect(filterOptions(board, 1).sprints).toEqual([
      { value: "42", label: "Sprint 42", count: 1, foreign: false },
      { value: "43", label: "Sprint 43", count: 1, foreign: false },
      { value: "50", label: "Autre équipe", count: 1, foreign: true },
    ]);
  });
});
