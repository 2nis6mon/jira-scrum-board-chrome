import { type ColumnConfiguration, visibleColumns } from "./boardConfiguration";

/**
 * État d'un ticket, toujours lu dans les colonnes visibles du board (décisions de Denis du
 * 02/11/2026), jamais dans la catégorie de statut Jira : première colonne « à faire », colonnes du
 * milieu « en cours », dernière « terminé ». Un board à une seule colonne n'a que « terminé », un
 * board à deux colonnes n'a pas d'« en cours ». Un statut rattaché à aucune colonne visible n'a pas
 * d'état : le ticket est ignoré partout, comme Jira le fait sur son board.
 */
export type ColumnState = "todo" | "inProgress" | "done";

/** Ordre de lecture des états : la barre se remplit de terminé vers à faire. */
export const COLUMN_STATES: readonly ColumnState[] = ["todo", "inProgress", "done"];

/** Tickets et somme de leurs estimations connues. */
export interface StateTally {
  readonly count: number;
  readonly points: number;
}

export type StateTallies = Readonly<Record<ColumnState, StateTally>>;

export interface ColumnStates {
  /** État d'une colonne visible ; `null` pour une colonne inconnue ou sans statut. */
  ofColumn(columnId: string | null): ColumnState | null;
  /** État d'un statut Jira ; `null` s'il n'appartient à aucune colonne visible. */
  ofStatus(statusId: string | null | undefined): ColumnState | null;
  /** Statuts de la dernière colonne visible (« terminé »). */
  readonly doneStatusIds: readonly string[];
}

/** Seule règle d'état du board et du planning. */
export function columnStates(columns: readonly ColumnConfiguration[]): ColumnStates {
  const visible = visibleColumns(columns);
  const last = visible.length - 1;
  const byColumn = new Map<string, ColumnState>();
  const byStatus = new Map<string, ColumnState>();
  visible.forEach((column, index) => {
    const state: ColumnState = index === last ? "done" : index === 0 ? "todo" : "inProgress";
    byColumn.set(column.id, state);
    for (const statusId of column.statusIds)
      if (!byStatus.has(statusId)) byStatus.set(statusId, state);
  });
  return {
    ofColumn: (columnId) => (columnId === null ? null : (byColumn.get(columnId) ?? null)),
    ofStatus: (statusId) => (statusId ? (byStatus.get(statusId) ?? null) : null),
    doneStatusIds: [...(visible.at(-1)?.statusIds ?? [])],
  };
}

/** Répartition par état ; les éléments sans état (sans colonne) ne sont pas comptés. */
export function tallyByState<T>(
  items: readonly T[],
  stateOf: (item: T) => ColumnState | null,
  pointsOf: (item: T) => number | null,
): StateTallies {
  const tallies: Record<ColumnState, { count: number; points: number }> = {
    todo: { count: 0, points: 0 },
    inProgress: { count: 0, points: 0 },
    done: { count: 0, points: 0 },
  };
  for (const item of items) {
    const state = stateOf(item);
    if (state === null) continue;
    tallies[state].count += 1;
    tallies[state].points += pointsOf(item) ?? 0;
  }
  return tallies;
}
