import type { JiraClient, JiraQuickFilter } from "../jira/client";
import { inActiveSprints } from "./jql";

/** Lecture dont les filtres rapides ont besoin. `JiraClient` la fournit. */
export type QuickFilterReader = Pick<JiraClient, "boardIssues">;

/**
 * Tickets des sprints actifs retenus par les filtres rapides du board Jira actifs. Portage de
 * `BoardController.refreshQuickFilterSelection` (Mac). Lecture seule.
 *
 * - Le JQL de chaque filtre est évalué PAR JIRA, jamais interprété ici.
 * - Plusieurs filtres se combinent en intersection, comme sur le board Jira.
 * - Écart voulu avec le Mac, qui interrogeait tous les tickets du board : chaque JQL est restreint
 *   aux sprints actifs, les seuls affichés. Même résultat à l'écran, beaucoup moins de requêtes.
 *
 * `null` : aucun filtre ne restreint rien (JQL vide). Un ensemble vide : Jira ne retient aucun
 * ticket, le board n'en affiche donc aucun.
 */
export async function quickFilterKeys(
  reader: QuickFilterReader,
  input: {
    boardId: number;
    filters: readonly JiraQuickFilter[];
    sprintIds: readonly number[];
  },
): Promise<Set<string> | null> {
  if (input.filters.length === 0) return null;
  if (input.sprintIds.length === 0) return new Set();

  const selections: Set<string>[] = [];
  for (const filter of input.filters) {
    const jql = inActiveSprints(filter.jql, input.sprintIds);
    if (jql === null) continue;
    const issues = await reader.boardIssues(input.boardId, jql, {
      estimationFieldId: null,
      includeChangelog: false,
      onlyFields: ["issuetype", "status"],
    });
    selections.push(new Set(issues.map((issue) => issue.key)));
  }
  const [first, ...others] = selections;
  if (!first) return null;
  return new Set([...first].filter((key) => others.every((keys) => keys.has(key))));
}
