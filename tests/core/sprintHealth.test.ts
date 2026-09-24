import { describe, expect, it } from "vitest";
import {
  assembleBoardIssues,
  type BoardIssue,
  type BoardSnapshot,
} from "../../src/core/boardIssue";
import { withBlockOrder, withGoalHidden } from "../../src/core/boardPreferences";
import { NO_FILTERS } from "../../src/core/filters";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { percent, sprintHealth } from "../../src/core/sprintHealth";
import { type IssueOptions, makeConfiguration, makeIssue } from "../support/jiraFixtures";

// Données FICTIVES. Les comptages sont vérifiés à la main : aucun score, aucune projection.

const config = makeConfiguration({
  scrumColumns: makeConfiguration().scrumColumns.map((column) =>
    column.id === "prog" ? { ...column, wipLimit: 1 } : column,
  ),
});
const GOALS = [
  makeSprintGoal({ id: "g1", title: "Paiement", position: 0 }),
  makeSprintGoal({ id: "g2", title: "Stabilité", position: 1 }),
];

/** Ticket assemblé, puis ajusté sur ce que le test regarde (ancienneté, ajout, rattachement…). */
function issue(key: string, options: IssueOptions, parts: Partial<BoardIssue> = {}): BoardIssue {
  const [assembled] = assembleBoardIssues({
    issues: [makeIssue(key, options)],
    configuration: config,
    columns: config.scrumColumns,
    links: {},
  });
  if (!assembled) throw new Error("ticket attendu");
  return { ...assembled, addedAfterSprintStart: false, ...parts };
}

const DONE = { statusId: "6", category: "done" } as const;
const DOING = { statusId: "3", category: "indeterminate" } as const;
const TODO = { statusId: "1", category: "new" } as const;

const SCRUM = [
  issue("ABC-1", { ...DONE, points: 5 }, { goalId: "g1" }),
  issue("ABC-2", { ...DOING, points: 3 }, { goalId: "g1", isBlocked: true, daysInColumn: 1 }),
  issue("ABC-3", { ...DOING, points: 2 }, { goalId: "g2", daysInColumn: 9 }),
  issue(
    "ABC-4",
    { ...TODO },
    {
      addedAfterSprintStart: true,
      addedToSprintAt: new Date("2026-09-20T10:00:00Z"),
      daysInColumn: 2,
    },
  ),
  issue(
    "ABC-5",
    { ...DONE, points: 1 },
    {
      addedAfterSprintStart: true,
      addedToSprintAt: new Date("2026-09-15T10:00:00Z"),
      daysInColumn: 30,
    },
  ),
];
const Kanban = [issue("RUN-1", { ...DOING, typeId: "10004" }, { daysInColumn: 4 })];

function snapshot(parts: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    sprint: null,
    activeSprints: [],
    goals: GOALS,
    goalsOrigin: "sprintText",
    scrumIssues: SCRUM,
    kanbanIssues: Kanban,
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
    pinnedGoalIds: [],
    localPinnedGoalIds: null,
    ...parts,
  };
}

describe("Sprint Health : comptages directs", () => {
  it("indicateurs clés : points livrés, tickets terminés, bloqués, périmètre ajouté", () => {
    expect(sprintHealth(snapshot(), config, NO_FILTERS).kpis).toEqual({
      totalPoints: 11,
      donePoints: 6,
      scrumCount: 5,
      done: 2,
      inProgress: 2,
      toDo: 1,
      allCount: 6,
      blocked: 1,
      added: 2,
    });
  });

  it("sans estimation, pas de points ; sans historique, pas de périmètre ajouté affirmé", () => {
    const unknown = (list: BoardIssue[]) =>
      list.map((item) => ({ ...item, estimate: null, addedAfterSprintStart: null }));
    const health = sprintHealth(
      snapshot({ scrumIssues: unknown(SCRUM), kanbanIssues: unknown(Kanban) }),
      config,
      NO_FILTERS,
    );
    expect(health.kpis.totalPoints).toBeNull();
    expect(health.kpis.added).toBeNull();
    expect(health.scope.known).toBe(false);
    expect(health.composition.added).toBeNull();
  });

  it("avancement par objectif, dans l'ordre du board", () => {
    const moved = withBlockOrder(config, ["goal:g2", "goal:g1", "build", "kanban"]);
    const goals = sprintHealth(snapshot(), moved, NO_FILTERS).goals.map((progress) => [
      progress.goal.id,
      progress.done,
      progress.total,
      progress.donePoints,
      progress.totalPoints,
    ]);
    expect(goals).toEqual([
      ["g2", 0, 1, 0, 2],
      ["g1", 1, 2, 5, 8],
    ]);
  });

  it("un objectif masqué n'apparaît pas, ses tickets comptent dans Build", () => {
    const health = sprintHealth(snapshot(), withGoalHidden(config, "g2", true), NO_FILTERS);
    expect(health.goals.map((progress) => progress.goal.id)).toEqual(["g1"]);
    expect(health.composition).toEqual({ total: 6, linked: 2, build: 3, kanban: 1, added: 2 });
  });

  it("périmètre : tickets entrés après le démarrage, les plus récents d'abord", () => {
    const scope = sprintHealth(snapshot(), config, NO_FILTERS).scope;
    expect(scope.added.map((item) => item.issue.key)).toEqual(["ABC-4", "ABC-5"]);
    expect([scope.before, scope.after]).toEqual([4, 6]);
    expect(percent(2, 4)).toBe(50);
    expect(percent(1, 0)).toBe(0);
  });

  it("charge par colonne : charge réelle, filtres ignorés, limite WIP comparée", () => {
    const filtered = { ...NO_FILTERS, searchText: "ABC-1" };
    const columns = sprintHealth(snapshot(), config, filtered).columns.map((entry) => [
      entry.column.id,
      entry.count,
      entry.over,
    ]);
    expect(columns).toEqual([
      ["todo", 1, false],
      ["prog", 2, true],
      ["done", 2, false],
    ]);
  });

  it("composition : rattachés, Build, Kanban (si la section est affichée), ajoutés", () => {
    expect(sprintHealth(snapshot(), config, NO_FILTERS).composition).toEqual({
      total: 6,
      linked: 3,
      build: 2,
      kanban: 1,
      added: 2,
    });
    const noKanban = { ...config, showKanbanSection: false };
    expect(sprintHealth(snapshot(), noKanban, NO_FILTERS).composition.kanban).toBeNull();
  });

  it("à surveiller : non terminés, bloqués d'abord, puis du plus ancien au plus récent", () => {
    const watched = sprintHealth(snapshot(), config, NO_FILTERS).watched.map((entry) => [
      entry.issue.issue.key,
      entry.reason,
      entry.goal?.id ?? null,
    ]);
    // ABC-5 a 30 jours mais il est terminé ; ABC-4 (2 j) est sous le seuil de 3 jours.
    expect(watched).toEqual([
      ["ABC-2", "blocked", "g1"],
      ["ABC-3", "aging", "g2"],
      ["RUN-1", "aging", null],
    ]);
  });

  it("les filtres de la barre s'appliquent aux comptages", () => {
    const health = sprintHealth(snapshot(), config, { ...NO_FILTERS, searchText: "ABC-3" });
    expect(health.kpis.allCount).toBe(1);
    expect(health.goals.map((progress) => [progress.goal.id, progress.total])).toEqual([
      ["g1", 0],
      ["g2", 1],
    ]);
    expect(health.watched.map((entry) => entry.issue.issue.key)).toEqual(["ABC-3"]);
  });
});
