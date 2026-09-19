import {
  type BoardConfiguration,
  type ColumnConfiguration,
  displayedGoalId,
  visibleColumns,
} from "./boardConfiguration";
import {
  type BoardIssue,
  type BoardSnapshot,
  type GoalProgress,
  goalProgress,
  isIssueDone,
} from "./boardIssue";
import { columnLoad } from "./boardLayout";
import { laneOrder } from "./boardPreferences";
import { applyFilters, type BoardFilters } from "./filters";
import type { SprintGoal } from "./sprintGoals";

/**
 * Sprint Health, porté de `SprintHealthView` (Mac) : des COMPTAGES directs sur les données Jira
 * lues, filtres de la barre appliqués. Aucun score, aucune projection, aucune pondération.
 *
 * Écart voulu avec le Mac : la charge par colonne ignore les filtres, comme les limites WIP du
 * board ; une limite se compare à la charge réelle de la colonne, pas à ce qu'un filtre montre.
 */
export interface SprintHealth {
  readonly kpis: HealthKpis;
  /** Objectifs affichés, dans l'ordre du board ; avancement sur leurs tickets filtrés. */
  readonly goals: readonly GoalProgress[];
  readonly scope: ScopeChange;
  readonly columns: readonly ColumnHealth[];
  readonly composition: Composition;
  readonly watched: readonly WatchedIssue[];
  readonly agingThresholdDays: number;
}

export interface HealthKpis {
  /** `null` : aucun ticket Scrum n'est estimé. */
  readonly totalPoints: number | null;
  readonly donePoints: number;
  readonly scrumCount: number;
  readonly done: number;
  readonly inProgress: number;
  readonly toDo: number;
  /** Tickets Scrum et RUN. */
  readonly allCount: number;
  readonly blocked: number;
  /** `null` : Jira n'a pas fourni l'historique, on ne sait pas ce qui a été ajouté. */
  readonly added: number | null;
}

export interface ScopeChange {
  /** Faux si Jira n'a pas fourni l'historique du sprint : rien n'est alors affirmé. */
  readonly known: boolean;
  /** Tickets entrés après le démarrage, les plus récents d'abord. */
  readonly added: readonly BoardIssue[];
  readonly before: number;
  readonly after: number;
}

export interface ColumnHealth {
  readonly column: ColumnConfiguration;
  readonly count: number;
  readonly over: boolean;
}

export interface Composition {
  readonly total: number;
  readonly linked: number;
  readonly build: number;
  /** `null` : la section RUN est désactivée dans les réglages. */
  readonly run: number | null;
  readonly added: number | null;
}

export interface WatchedIssue {
  readonly issue: BoardIssue;
  readonly reason: "blocked" | "aging";
  readonly goal: SprintGoal | null;
}

export function sprintHealth(
  snapshot: BoardSnapshot,
  configuration: BoardConfiguration,
  filters: BoardFilters,
): SprintHealth {
  const scrum = applyFilters(filters, snapshot.scrumIssues);
  const run = applyFilters(filters, snapshot.runIssues);
  const all = [...scrum, ...run];
  const threshold = configuration.agingThresholdDays;
  const categoryKey = (issue: BoardIssue) => issue.issue.fields.status.statusCategory?.key;

  // Historique connu dès qu'un ticket du sprint (filtres ignorés) sait s'il a été ajouté.
  const historyKnown = [...snapshot.scrumIssues, ...snapshot.runIssues].some(
    (issue) => issue.addedAfterSprintStart !== null,
  );
  const added = all
    .filter((issue) => issue.addedAfterSprintStart === true)
    .sort((a, b) => (b.addedToSprintAt?.getTime() ?? 0) - (a.addedToSprintAt?.getTime() ?? 0));

  const estimates = scrum.map((issue) => issue.estimate).filter((v): v is number => v !== null);
  const doneScrum = scrum.filter(isIssueDone);

  const goalsById = new Map(snapshot.goals.map((goal) => [goal.id, goal]));
  const goals = laneOrder(snapshot, configuration).flatMap((id) => {
    const goal = id.startsWith("goal:") ? goalsById.get(id.slice("goal:".length)) : undefined;
    return goal
      ? [
          goalProgress(
            goal,
            scrum.filter((issue) => issue.goalId === goal.id),
          ),
        ]
      : [];
  });

  const load = columnLoad(snapshot);
  const columns = visibleColumns(configuration.scrumColumns).map((column) => {
    const count = load.get(column.id) ?? 0;
    return { column, count, over: column.wipLimit !== null && count > column.wipLimit };
  });

  const linked = scrum.filter((issue) => displayedGoalId(configuration, issue.goalId) !== null);

  const watched = all
    .filter((issue) => !isIssueDone(issue))
    .filter((issue) => issue.isBlocked || (issue.daysInColumn ?? -1) >= threshold)
    .sort(
      (a, b) =>
        Number(b.isBlocked) - Number(a.isBlocked) || (b.daysInColumn ?? 0) - (a.daysInColumn ?? 0),
    )
    .map((issue): WatchedIssue => {
      // Objectif masqué : le ticket est affiché dans Build, on ne cite pas l'objectif.
      const goalId = displayedGoalId(configuration, issue.goalId);
      return {
        issue,
        reason: issue.isBlocked ? "blocked" : "aging",
        goal: goalId === null ? null : (goalsById.get(goalId) ?? null),
      };
    });

  return {
    kpis: {
      totalPoints: estimates.length === 0 ? null : sum(estimates),
      donePoints: sum(doneScrum.map((issue) => issue.estimate ?? 0)),
      scrumCount: scrum.length,
      done: doneScrum.length,
      inProgress: scrum.filter((issue) => categoryKey(issue) === "indeterminate").length,
      toDo: scrum.filter((issue) => categoryKey(issue) === "new").length,
      allCount: all.length,
      blocked: all.filter((issue) => issue.isBlocked).length,
      added: historyKnown ? added.length : null,
    },
    goals,
    scope: {
      known: historyKnown,
      added,
      before: all.length - added.length,
      after: all.length,
    },
    columns,
    composition: {
      total: all.length,
      linked: linked.length,
      build: scrum.length - linked.length,
      run: configuration.showRunSection ? run.length : null,
      added: historyKnown ? added.length : null,
    },
    watched,
    agingThresholdDays: threshold,
  };
}

/** Pourcentage arrondi ; 0 si le tout est nul. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
