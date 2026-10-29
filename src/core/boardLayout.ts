import { type BoardBlock, blockIdentifier, displayedBlocks, resolveBlocks } from "./boardBlocks";
import {
  type BoardConfiguration,
  type ColumnConfiguration,
  displayedGoalId,
  isBlockCollapsed,
  isGoalHidden,
  shownSwimlaneIds,
  swimlaneName,
  visibleColumns,
} from "./boardConfiguration";
import {
  allIssues,
  type BoardIssue,
  type BoardSnapshot,
  type GoalProgress,
  goalProgress,
  isForeignSprint,
} from "./boardIssue";
import { applyFilters, areFiltersActive, type BoardFilters } from "./filters";
import type { SprintGoal } from "./sprintGoals";

/** Une case du board : une colonne d'une swimlane, avec ses tickets dans l'ordre de Jira. */
export interface LaneCell {
  readonly column: ColumnConfiguration;
  readonly issues: readonly BoardIssue[];
}

/** Une swimlane affichée : un objectif, Build ou une swimlane par type. */
export interface Lane {
  readonly block: BoardBlock;
  readonly id: string;
  readonly title: string;
  readonly goal: SprintGoal | null;
  /** Sprint de l'objectif, affiché en préfixe quand plusieurs sprints du board sont réunis. */
  readonly sprintName: string | null;
  /** Avancement de l'objectif, calculé sur TOUS ses tickets, filtres ignorés. */
  readonly progress: GoalProgress | null;
  readonly cells: readonly LaneCell[];
  /** Tickets retenus par les filtres, toutes colonnes confondues. */
  readonly visibleCount: number;
  /** Tickets de la swimlane, filtres ignorés. */
  readonly totalCount: number;
  /** Swimlane repliée : seul son en-tête s'affiche (réglage local). */
  readonly collapsed: boolean;
}

export interface BoardLayout {
  readonly columns: readonly ColumnConfiguration[];
  readonly lanes: readonly Lane[];
  readonly filtersActive: boolean;
  readonly visibleCount: number;
  readonly totalCount: number;
  /**
   * Tickets retenus dont le statut n'appartient à aucune colonne visible. Jira ne les montre pas
   * non plus sur son board ; on les compte pour ne pas les faire disparaître en silence.
   */
  readonly unmappedCount: number;
}

/**
 * Répartit une photographie du board en swimlanes et en colonnes, selon la configuration locale
 * (ordre des blocs, objectifs masqués) et les filtres. Ne lit ni n'écrit rien dans Jira.
 */
export function buildBoardLayout(
  snapshot: BoardSnapshot,
  configuration: BoardConfiguration,
  filters: BoardFilters,
  options: { showEmptyBuild?: boolean; showEmptySwimlaneId?: string } = {},
): BoardLayout {
  const columns = visibleColumns(configuration.columns);
  const filtersActive = areFiltersActive(filters);

  const visibleGoals = snapshot.goals.filter((goal) => !isGoalHidden(configuration, goal.id));
  const blocks = resolveBlocks({
    goals: visibleGoals,
    storedOrder: configuration.blockOrder,
    includeBuild: true,
    swimlaneIds: shownSwimlaneIds(configuration),
  });

  const everything = allIssues(snapshot);
  const byLane = groupBy(everything, (issue) => laneKey(configuration, issue));
  const filteredByLane = groupBy(applyFilters(filters, everything), (issue) =>
    laneKey(configuration, issue),
  );
  const allIssuesOf = (block: BoardBlock): readonly BoardIssue[] =>
    byLane.get(blockIdentifier(block)) ?? [];
  const visibleIssuesOf = (block: BoardBlock): readonly BoardIssue[] =>
    filteredByLane.get(blockIdentifier(block)) ?? [];

  const goalsById = new Map(visibleGoals.map((goal) => [goal.id, goal]));
  // Le filtre Sprint ne retient que des tickets : un objectif reste affiché s'il passe les autres.
  const withoutSprint = { ...filters, sprintIds: new Set<string>() };
  const goalCountByLane =
    filters.sprintIds.size === 0
      ? filteredByLane
      : groupBy(applyFilters(withoutSprint, everything), (issue) => laneKey(configuration, issue));
  const goalFiltersActive = areFiltersActive(withoutSprint);
  const sprintNames = new Map(snapshot.activeSprints.map((sprint) => [sprint.id, sprint.name]));
  const prefixSprint = (snapshot.goalSprintIds?.length ?? 0) > 1;
  const sprintNameOf = (goal: SprintGoal | null): string | null => {
    const sprintId = goal && prefixSprint ? snapshot.goalSprintOf?.[goal.id] : undefined;
    return sprintId === undefined ? null : (sprintNames.get(sprintId) ?? null);
  };
  const shown = displayedBlocks({
    blocks,
    filtersActive,
    filteredCount: (block) =>
      block.kind === "goal"
        ? goalFiltersActive
          ? (goalCountByLane.get(blockIdentifier(block)) ?? []).length
          : allIssuesOf(block).length
        : visibleIssuesOf(block).length,
    totalCount: (block) => allIssuesOf(block).length,
    showEmptyBuild: options.showEmptyBuild === true,
    ...(options.showEmptySwimlaneId ? { showEmptySwimlaneId: options.showEmptySwimlaneId } : {}),
  });

  let unmappedCount = 0;
  const lanes = shown.map((block): Lane => {
    const visible = visibleIssuesOf(block);
    const revealedDestination =
      visible.length === 0 &&
      ((block.kind === "build" && options.showEmptyBuild === true) ||
        (block.kind === "swimlane" && block.swimlaneId === options.showEmptySwimlaneId));
    const cells = columns.map((column) => ({
      column,
      issues: visible.filter((issue) => issue.columnId === column.id),
    }));
    const placed = cells.reduce((sum, cell) => sum + cell.issues.length, 0);
    unmappedCount += visible.length - placed;

    const goal = block.kind === "goal" ? (goalsById.get(block.goalId) ?? null) : null;
    return {
      block,
      id: blockIdentifier(block),
      title: blockTitle(configuration, block, goal),
      goal,
      sprintName: sprintNameOf(goal),
      // L'avancement d'un objectif compte ses tickets RATTACHÉS, même masqués ou filtrés.
      progress: goal
        ? goalProgress(
            goal,
            everything.filter((issue) => issue.goalId === goal.id),
            columns.at(-1)?.id ?? null,
          )
        : null,
      cells,
      visibleCount: placed,
      totalCount: allIssuesOf(block).length,
      // Une destination révélée doit offrir ses cases de dépôt, sans modifier le repli mémorisé.
      collapsed: !revealedDestination && isBlockCollapsed(configuration, block),
    };
  });

  return {
    columns,
    lanes,
    filtersActive,
    visibleCount: lanes.reduce((sum, lane) => sum + lane.visibleCount, 0),
    totalCount: everything.length,
    unmappedCount,
  };
}

/**
 * Bloc d'un ticket : son objectif affiché en priorité, sinon sa destination par défaut.
 * Masquer l'objectif ne modifie jamais le rattachement Jira.
 */
export function laneKey(configuration: BoardConfiguration, issue: BoardIssue): string {
  const goalId = displayedGoalId(configuration, issue.goalId);
  if (goalId !== null) return `goal:${goalId}`;
  return issue.swimlaneId === null ? "build" : `swimlane:${issue.swimlaneId}`;
}

/** Titre d'une swimlane : l'objectif, le nom de la swimlane par type, ou celui de Build. */
export function blockTitle(
  configuration: BoardConfiguration,
  block: BoardBlock,
  goal: SprintGoal | null,
): string {
  if (goal) return goal.title;
  if (block.kind === "swimlane") {
    const swimlane = configuration.ticketSwimlanes.find((item) => item.id === block.swimlaneId);
    return swimlane ? swimlaneName(configuration, swimlane) : "Swimlane";
  }
  return configuration.buildSectionLabel || "Build";
}

/**
 * Nombre de tickets par colonne, pour les limites WIP. TOUS les tickets du board y comptent —
 * objectifs, Build et swimlanes par type (demande de Denis du 24/09/2026, après avoir vu en daily une colonne
 * annoncer 13 au-dessus de la swimlane Run qui montrait 17 cartes) : une colonne du board Jira
 * porte les uns et les autres, et sa limite WIP aussi. Les filtres n'y changent rien : une limite
 * se compare à la charge réelle de la colonne, pas à ce qui est affiché.
 */
export function columnLoad(snapshot: BoardSnapshot): Map<string, number> {
  const load = new Map<string, number>();
  for (const issue of [...snapshot.goalIssues, ...snapshot.swimlaneIssues]) {
    if (issue.columnId !== null) load.set(issue.columnId, (load.get(issue.columnId) ?? 0) + 1);
  }
  return load;
}

// ─── Options des menus de filtre ─────────────────────────────────────────────

export interface FilterOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface FilterOptions {
  readonly assignees: readonly FilterOption[];
  readonly unassignedCount: number;
  readonly issueTypes: readonly FilterOption[];
  readonly priorities: readonly FilterOption[];
  readonly statuses: readonly FilterOption[];
  readonly labels: readonly FilterOption[];
  readonly components: readonly FilterOption[];
  readonly parents: readonly FilterOption[];
  readonly withoutParentCount: number;
  readonly goals: readonly FilterOption[];
  readonly withoutGoalCount: number;
  /** Sprints actifs affichés, dans l'ordre du board ; un sprint d'un autre board est signalé. */
  readonly sprints: readonly (FilterOption & { readonly foreign: boolean })[];
}

/** Valeurs réellement présentes dans le sprint, avec leur nombre de tickets. Rien n'est inventé. */
export function filterOptions(snapshot: BoardSnapshot, boardId?: number): FilterOptions {
  const issues = [...snapshot.goalIssues, ...snapshot.swimlaneIssues];
  const tally = () => new Map<string, { label: string; count: number }>();
  const add = (map: ReturnType<typeof tally>, value: string, label: string) => {
    const entry = map.get(value);
    if (entry) entry.count += 1;
    else map.set(value, { label, count: 1 });
  };

  const assignees = tally();
  const types = tally();
  const priorities = tally();
  const statuses = tally();
  const labels = tally();
  const components = tally();
  const parents = tally();
  let unassignedCount = 0;
  let withoutParentCount = 0;

  for (const { issue } of issues) {
    const fields = issue.fields;
    if (fields.assignee?.accountId) {
      add(assignees, fields.assignee.accountId, fields.assignee.displayName);
    } else if (fields.assignee === null) {
      unassignedCount += 1;
    }
    add(types, fields.issuetype.id, fields.issuetype.name);
    if (fields.priority) add(priorities, fields.priority.name, fields.priority.name);
    add(statuses, fields.status.id, fields.status.name);
    for (const label of fields.labels) add(labels, label, label);
    for (const component of fields.components) add(components, component.name, component.name);
    if (fields.parent) {
      const summary = fields.parent.summary;
      add(
        parents,
        fields.parent.key,
        summary ? `${fields.parent.key} · ${summary}` : fields.parent.key,
      );
    } else {
      withoutParentCount += 1;
    }
  }

  const goalCounts = new Map<string, number>();
  for (const issue of issues) {
    if (issue.goalId !== null)
      goalCounts.set(issue.goalId, (goalCounts.get(issue.goalId) ?? 0) + 1);
  }

  return {
    assignees: sorted(assignees),
    unassignedCount,
    issueTypes: sorted(types),
    priorities: sorted(priorities),
    statuses: sorted(statuses),
    labels: sorted(labels),
    components: sorted(components),
    parents: sorted(parents),
    withoutParentCount,
    goals: [...snapshot.goals]
      .sort((a, b) => a.position - b.position)
      .map((goal) => ({ value: goal.id, label: goal.title, count: goalCounts.get(goal.id) ?? 0 })),
    withoutGoalCount: issues.filter((issue) => issue.goalId === null).length,
    sprints: snapshot.activeSprints.map((sprint) => ({
      value: String(sprint.id),
      label: sprint.name,
      count: issues.filter((issue) => issue.sprintId === sprint.id).length,
      foreign: boardId !== undefined && isForeignSprint(sprint, boardId),
    })),
  };
}

function sorted(map: Map<string, { label: string; count: number }>): FilterOption[] {
  return [...map.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base", numeric: true }));
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

// ─── En-tête du sprint ───────────────────────────────────────────────────────

/**
 * Jours de calendrier (heure locale) entre aujourd'hui et la fin prévue du sprint : 0 si elle
 * tombe aujourd'hui, négatif une fois passée. `null` si Jira ne fournit pas de date de fin.
 */
export function daysRemaining(endDate: Date | null, now: Date): number | null {
  if (endDate === null) return null;
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day(endDate) - day(now)) / (24 * 60 * 60 * 1000));
}
