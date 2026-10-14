import { JiraError } from "../jira/errors";
import type { GoalsClient } from "../jira/goals";
import { goalDisplayName, type JiraIssue, linkedGoalIds } from "../jira/models";
import type { BoardConfiguration } from "./boardConfiguration";
import { goalColorName, makeSprintGoal, type SprintGoal } from "./sprintGoals";

/** Lectures de l'API Goals dont le board a besoin. `GoalsClient` les fournit. */
export type GoalsReader = Pick<
  GoalsClient,
  "cloudId" | "searchGoals" | "workItemKeys" | "goalsByIds" | "lastWorkItemsIssue"
>;

export interface AtlassianSprintGoals {
  readonly goals: SprintGoal[];
  /** Ticket → objectif affiché (un ticket lié à plusieurs objectifs suit le premier affiché). */
  readonly links: Record<string, string>;
  /** Lectures partielles : le board s'affiche, mais il manque quelque chose — et on le dit. */
  readonly warnings: string[];
}

/**
 * Objectifs du sprint en mode « Goals Atlassian ».
 *
 * Les Goals se rattachent aux TICKETS, jamais aux sprints : les objectifs d'un sprint sont
 * DÉDUITS de ses tickets, par deux lectures combinées :
 * 1. Goal → tickets, par le champ `workItems` de l'API Goals (lecture de référence) ;
 * 2. ticket → Goals, par le champ Jira « Goals » du ticket (découvre des objectifs inconnus).
 * S'y ajoutent les objectifs épinglés au sprint (propriété du sprint), visibles même sans ticket.
 *
 * Si le site lui-même ne répond pas (identifiant de site illisible, passerelle qui refuse), la
 * fonction échoue : le board se rabat alors sur le texte du sprint en affichant la cause. Les
 * échecs partiels, eux, deviennent des avertissements plutôt qu'un board vide sans explication.
 */
export async function loadAtlassianSprintGoals(input: {
  reader: GoalsReader;
  pinnedGoalIds: readonly string[];
  issues: readonly JiraIssue[];
  configuration: BoardConfiguration;
}): Promise<AtlassianSprintGoals> {
  const { reader, configuration } = input;
  const warnings: string[] = [];
  const describe = (operation: string, error: unknown) =>
    `${operation} : ${error instanceof Error ? error.message : String(error)}`;

  // La passerelle doit répondre : sinon, repli explicite sur le texte du sprint.
  await reader.cloudId();

  const sprintKeys = new Set(input.issues.map((issue) => issue.key));
  const categoryByType = new Map(configuration.issueTypes.map((type) => [type.id, type.category]));
  const goalIssues = input.issues.filter(
    (issue) => (categoryByType.get(issue.fields.issuetype.id) ?? "GOAL") !== "IGNORED",
  );
  // Le champ natif Goals est fiable comme source de repli uniquement s'il figure dans chaque
  // ticket affichable, y compris ceux d'une swimlane par défaut : tous peuvent être rattachés.
  // `null` signifie « aucun Goal » ; un champ absent peut cacher un lien.
  const goalFieldId = configuration.goalsFieldId;
  const issueLinksComplete =
    goalIssues.length === 0 ||
    (goalFieldId !== null &&
      goalIssues.every((issue) => Object.hasOwn(issue.fields.customFields, goalFieldId)));
  const incompleteIssueField =
    goalFieldId === null
      ? "Le champ Goals Jira n'a pas été identifié ; relisez la structure du board."
      : `Le champ Goals Jira est absent de certains tickets du board (${goalFieldId}).`;

  // Lecture 2 — ce que les tickets déclarent.
  const linksFromIssues = new Map<string, string[]>();
  const discovered: string[] = [];
  for (const issue of input.issues) {
    const ids = linkedGoalIds(issue.fields, configuration.goalsFieldId);
    if (ids.length === 0) continue;
    linksFromIssues.set(issue.key, ids);
    for (const id of ids) if (!discovered.includes(id)) discovered.push(id);
  }

  // Objectifs à interroger : épinglés et découverts sur les tickets.
  let candidates = unique([...input.pinnedGoalIds, ...discovered]);

  // Aucun objectif déclaré par les tickets : on interroge les objectifs du site, pour que le
  // board fonctionne sans réglage, même avec des Goals épinglés et un champ Goals illisible.
  if (discovered.length === 0) {
    try {
      const site = await reader.searchGoals({ limit: 100, loadAll: true });
      candidates = unique([...candidates, ...site.map((goal) => goal.id)]);
    } catch (error) {
      if (configuration.boardType === "kanban") {
        if (error instanceof JiraError && error.isAuthenticationFailure) throw error;
        throw new Error(describe("Recherche des objectifs du board", error));
      }
      warnings.push(describe("Recherche des objectifs du site", error));
    }
  }
  if (candidates.length === 0) return { goals: [], links: {}, warnings };

  // Lecture 1 — ce qu'Atlassian déclare, restreint aux tickets du sprint. Un échec ne doit pas
  // passer pour « aucun ticket rattaché ».
  let workItems: Record<string, string[]> = {};
  try {
    workItems = await reader.workItemKeys(candidates);
  } catch (error) {
    if (error instanceof JiraError && error.isAuthenticationFailure) throw error;
    if (configuration.boardType === "kanban" && !issueLinksComplete) {
      throw new Error(
        `${describe("Tickets rattachés aux objectifs", error)}. ${incompleteIssueField}`,
      );
    }
    warnings.push(describe("Tickets rattachés aux objectifs", error));
  }
  if (reader.lastWorkItemsIssue) {
    if (configuration.boardType === "kanban" && !issueLinksComplete) {
      throw new Error(
        `Tickets rattachés aux objectifs : ${reader.lastWorkItemsIssue}. ${incompleteIssueField}`,
      );
    }
    warnings.push(`Tickets rattachés aux objectifs : ${reader.lastWorkItemsIssue}`);
    if (configuration.boardType === "kanban") workItems = {};
  }

  const linksByGoal = new Map<string, Set<string>>();
  const addLink = (goalId: string, issueKey: string) => {
    const keys = linksByGoal.get(goalId) ?? new Set<string>();
    keys.add(issueKey);
    linksByGoal.set(goalId, keys);
  };
  for (const [goalId, keys] of Object.entries(workItems)) {
    for (const key of keys) if (sprintKeys.has(key)) addLink(goalId, key);
  }
  // Les déclarations des tickets complètent, sans écraser.
  for (const [issueKey, goalIds] of linksFromIssues) {
    for (const goalId of goalIds) addLink(goalId, issueKey);
  }

  // Objectifs retenus : les épinglés, puis ceux qui portent des tickets du sprint.
  const retained = unique([...input.pinnedGoalIds, ...linksByGoal.keys()]);
  if (retained.length === 0) return { goals: [], links: {}, warnings };

  const resolved = new Map<
    string,
    { name: string; key: string | null; status: string | null; url: string | null }
  >();
  try {
    for (const goal of await reader.goalsByIds(retained)) {
      resolved.set(goal.id, {
        name: goalDisplayName(goal),
        key: goal.key,
        status: goal.statusLabel,
        url: goal.url,
      });
    }
  } catch (error) {
    warnings.push(describe("Libellés des objectifs", error));
  }

  const goals = retained.map((goalId, index) => {
    // Un objectif qu'Atlassian ne résout pas reste visible sous son identifiant brut plutôt que
    // de disparaître sans explication.
    const goal = resolved.get(goalId);
    return makeSprintGoal({
      id: goalId,
      title: goal?.name ?? goalId,
      position: index,
      color: goalColorName(index),
      atlassianGoalId: goalId,
      atlassianKey: goal?.key ?? null,
      atlassianStatus: goal?.status ?? null,
      atlassianUrl: goal?.url ?? null,
    });
  });

  // Un ticket rattaché à plusieurs objectifs suit le premier affiché.
  const links: Record<string, string> = {};
  for (const goal of goals) {
    for (const key of linksByGoal.get(goal.id) ?? []) links[key] ??= goal.id;
  }
  return { goals, links, warnings };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
