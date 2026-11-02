// JQL saisi par l'utilisateur ou défini dans Jira, préparé pour être évalué PAR JIRA. Il n'est
// jamais interprété localement : on se contente de le combiner avec une restriction.

/**
 * JQL prêt à être combiné : sans clause `ORDER BY`, que Jira refuserait entre parenthèses. Un JQL
 * réduit à un tri devient vide.
 */
export function withoutOrderBy(jql: string): string {
  return jql
    .trim()
    .replace(/(^|\s+)order\s+by\s+.*$/is, "")
    .trim();
}

/**
 * JQL restreint aux sprints actifs du board : le board n'affiche qu'eux, inutile de faire
 * parcourir à Jira tout l'historique. `null` s'il n'y a rien à restreindre ou aucun sprint.
 */
export function inActiveSprints(jql: string, sprintIds: readonly number[]): string | null {
  const base = withoutOrderBy(jql);
  if (base === "" || sprintIds.length === 0) return null;
  return `(${base}) AND sprint in (${sprintIds.join(",")})`;
}

/** Périmètre déjà limité par l'endpoint du board ; Kanban ajoute son sous-filtre Jira. */
export interface BoardJqlScope {
  readonly sprintIds: readonly number[];
  readonly boardType?: string;
  readonly kanbanSubQuery?: string | null;
}

export function inBoardScope(jql: string, scope: BoardJqlScope): string | null {
  if (scope.boardType !== "kanban") return inActiveSprints(jql, scope.sprintIds);
  const base = withoutOrderBy(jql);
  if (base === "") return null;
  const subQuery = withoutOrderBy(scope.kanbanSubQuery ?? "");
  return subQuery === "" ? base : `(${base}) AND (${subQuery})`;
}

/**
 * JQL restreint au périmètre du Sprint Planning : sprints `sprintIds` (le sprint en préparation,
 * les autres sprints futurs et les sprints actifs) et backlog, c'est-à-dire les tickets sans
 * sprint ou passés par un sprint clos sans être terminés : l'historique terminé des sprints clos
 * dépasserait vite la limite de lecture. « Terminé » = statut de la dernière colonne visible du
 * board (`doneStatusIds`, règle d'état unique, story 8.20). `sprint is EMPTY` et
 * `sprint in closedSprints()` sont du JQL standard de Jira Software Cloud (champ Sprint : `IS`,
 * `IN` ; fonction `closedSprints()` : `IN`, `NOT IN`), vérifiés le 02/11/2026 ; `status not in`
 * est l'opérateur `NOT IN` du champ Status, avec des identifiants de statut. Le résultat est
 * croisé avec les tickets affichés.
 * `null` s'il n'y a rien à restreindre.
 */
export function inPlanningScope(
  jql: string,
  sprintIds: readonly number[],
  doneStatusIds: readonly string[],
): string | null {
  const base = withoutOrderBy(jql);
  if (base === "") return null;
  const sprints = sprintIds.length > 0 ? `sprint in (${sprintIds.join(",")}) OR ` : "";
  // Seuls des identifiants numériques entrent dans le JQL.
  const done = doneStatusIds.filter((id) => /^\d+$/.test(id));
  const closed =
    done.length > 0
      ? `(sprint in closedSprints() AND status not in (${done.join(",")}))`
      : "sprint in closedSprints()";
  return `(${base}) AND (${sprints}sprint is EMPTY OR ${closed})`;
}
