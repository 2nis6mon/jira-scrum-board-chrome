import type { JiraClient, JiraQuickFilter } from "../jira/client";
import { type BoardJqlScope, inBoardScope, inPlanningScope } from "./jql";

/** Lecture dont les filtres rapides ont besoin. `JiraClient` la fournit. */
export type QuickFilterReader = Pick<JiraClient, "boardIssues">;

/**
 * Tickets du périmètre affiché retenus par les filtres rapides du board Jira. Lecture seule.
 *
 * - Le JQL de chaque filtre est évalué PAR JIRA, jamais interprété ici.
 * - Plusieurs filtres se combinent en intersection, comme sur le board Jira.
 * - Scrum : chaque JQL est restreint aux sprints actifs. Kanban : le sous-filtre du board est
 *   ajouté, sans restriction de sprint. L'endpoint Jira applique toujours le filtre du board.
 * - `scope: "planning"` (Sprint Planning) : chaque JQL est restreint aux sprints `sprintIds` et
 *   au backlog (`inPlanningScope`), même sans aucun sprint.
 *
 * `null` : aucun filtre ne restreint rien (JQL vide). Un ensemble vide : Jira ne retient aucun
 * ticket, le board n'en affiche donc aucun.
 */
export async function quickFilterKeys(
  reader: QuickFilterReader,
  input: BoardJqlScope & {
    boardId: number;
    filters: readonly JiraQuickFilter[];
    /** Périmètre évalué : le board affiché (par défaut) ou le Sprint Planning. */
    scope?: "board" | "planning";
  },
): Promise<Set<string> | null> {
  if (input.filters.length === 0) return null;
  const planning = input.scope === "planning";
  if (!planning && input.boardType !== "kanban" && input.sprintIds.length === 0) return new Set();

  const selections: Set<string>[] = [];
  for (const filter of input.filters) {
    const jql = planning
      ? inPlanningScope(filter.jql, input.sprintIds)
      : inBoardScope(filter.jql, input);
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
