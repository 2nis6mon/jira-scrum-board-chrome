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
