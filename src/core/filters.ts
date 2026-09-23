import { type AtlassianGoal, goalDisplayName } from "../jira/models";
import type { BoardIssue } from "./boardIssue";
import { foldText } from "./text";

/**
 * Filtres rapides, volontairement réduits aux deux qui ne sont couverts par aucun autre bloc de
 * filtres : les autres critères (personne, type, statut, objectif, label) ont leurs menus dédiés.
 */
export type QuickFilter = "blocked" | "addedAfterStart";

export const QUICK_FILTERS: readonly QuickFilter[] = ["blocked", "addedAfterStart"];

export const QUICK_FILTER_LABEL: Record<QuickFilter, string> = {
  blocked: "Bloqués",
  addedAfterStart: "Ajoutés",
};

/** Libellé complet, pour l'infobulle. */
export const QUICK_FILTER_HELP: Record<QuickFilter, string> = {
  blocked: "Tickets bloqués par un lien Jira ou un label",
  addedAfterStart: "Tickets ajoutés au sprint après son démarrage",
};

/** Critères de filtrage. Combinables ; n'affectent jamais les données Jira. */
export interface BoardFilters {
  readonly searchText: string;
  readonly assigneeIds: ReadonlySet<string>;
  readonly includeUnassigned: boolean;
  readonly issueTypeIds: ReadonlySet<string>;
  readonly priorityNames: ReadonlySet<string>;
  readonly labels: ReadonlySet<string>;
  readonly componentNames: ReadonlySet<string>;
  readonly statusIds: ReadonlySet<string>;
  /** Parents sélectionnés (clés Jira). */
  readonly parentKeys: ReadonlySet<string>;
  readonly includeWithoutParent: boolean;
  /** Objectifs sélectionnés. */
  readonly goalIds: ReadonlySet<string>;
  readonly includeWithoutGoal: boolean;
  readonly quickFilters: ReadonlySet<QuickFilter>;
  /** Filtres rapides du board Jira actuellement actifs (identifiants Jira). */
  readonly jiraQuickFilterIds: ReadonlySet<number>;
  /**
   * Clés retournées par Jira pour les filtres rapides actifs. `null` = aucun filtre rapide Jira
   * appliqué. Un ensemble vide signifie que Jira n'a renvoyé aucun ticket : on n'affiche rien.
   */
  readonly jiraQuickFilterKeys: ReadonlySet<string> | null;
}

export const NO_FILTERS: BoardFilters = {
  searchText: "",
  assigneeIds: new Set(),
  includeUnassigned: false,
  issueTypeIds: new Set(),
  priorityNames: new Set(),
  labels: new Set(),
  componentNames: new Set(),
  statusIds: new Set(),
  parentKeys: new Set(),
  includeWithoutParent: false,
  goalIds: new Set(),
  includeWithoutGoal: false,
  quickFilters: new Set(),
  jiraQuickFilterIds: new Set(),
  jiraQuickFilterKeys: null,
};

/**
 * Bascule l'affichage sur un seul objectif : le premier clic ne garde que celui-ci, un second
 * rétablit tous les objectifs.
 */
export function focusGoal(filters: BoardFilters, goalId: string): BoardFilters {
  const alreadyAlone =
    filters.goalIds.size === 1 && filters.goalIds.has(goalId) && !filters.includeWithoutGoal;
  return {
    ...filters,
    goalIds: alreadyAlone ? new Set() : new Set([goalId]),
    includeWithoutGoal: false,
  };
}

export function isGoalFocused(filters: BoardFilters, goalId: string): boolean {
  return filters.goalIds.has(goalId);
}

export function activeFilterCount(filters: BoardFilters): number {
  let count = 0;
  if (filters.searchText.trim() !== "") count += 1;
  if (filters.assigneeIds.size > 0 || filters.includeUnassigned) count += 1;
  if (filters.issueTypeIds.size > 0) count += 1;
  if (filters.priorityNames.size > 0) count += 1;
  if (filters.labels.size > 0) count += 1;
  if (filters.componentNames.size > 0) count += 1;
  if (filters.statusIds.size > 0) count += 1;
  if (filters.parentKeys.size > 0 || filters.includeWithoutParent) count += 1;
  if (filters.goalIds.size > 0 || filters.includeWithoutGoal) count += 1;
  return count + filters.quickFilters.size + filters.jiraQuickFilterIds.size;
}

export function areFiltersActive(filters: BoardFilters): boolean {
  return activeFilterCount(filters) > 0;
}

/** Applique les filtres à une liste de tickets. */
export function applyFilters(filters: BoardFilters, issues: readonly BoardIssue[]): BoardIssue[] {
  if (!areFiltersActive(filters)) return [...issues];
  const needle = foldText(filters.searchText.trim());

  return issues.filter((issue) => {
    const fields = issue.issue.fields;

    // Filtres rapides du board : la sélection a été faite par Jira via JQL.
    if (filters.jiraQuickFilterKeys && !filters.jiraQuickFilterKeys.has(issue.issue.key)) {
      return false;
    }
    if (needle !== "" && !matchesSearch(issue, needle)) return false;

    if (filters.assigneeIds.size > 0 || filters.includeUnassigned) {
      const accountId = fields.assignee?.accountId ?? null;
      const matchesAssignee = accountId !== null && filters.assigneeIds.has(accountId);
      const matchesUnassigned = filters.includeUnassigned && fields.assignee === null;
      if (!matchesAssignee && !matchesUnassigned) return false;
    }

    if (filters.issueTypeIds.size > 0 && !filters.issueTypeIds.has(fields.issuetype.id)) {
      return false;
    }
    if (filters.priorityNames.size > 0) {
      if (fields.priority === null || !filters.priorityNames.has(fields.priority.name)) {
        return false;
      }
    }
    if (filters.labels.size > 0 && !fields.labels.some((label) => filters.labels.has(label))) {
      return false;
    }
    if (
      filters.componentNames.size > 0 &&
      !fields.components.some((component) => filters.componentNames.has(component.name))
    ) {
      return false;
    }
    if (filters.statusIds.size > 0 && !filters.statusIds.has(fields.status.id)) return false;

    if (filters.parentKeys.size > 0 || filters.includeWithoutParent) {
      const matchesParent = fields.parent !== null && filters.parentKeys.has(fields.parent.key);
      const matchesNone = filters.includeWithoutParent && fields.parent === null;
      if (!matchesParent && !matchesNone) return false;
    }

    if (filters.goalIds.size > 0 || filters.includeWithoutGoal) {
      const matchesGoal = issue.goalId !== null && filters.goalIds.has(issue.goalId);
      const matchesNone = filters.includeWithoutGoal && issue.goalId === null;
      if (!matchesGoal && !matchesNone) return false;
    }

    if (filters.quickFilters.has("blocked") && !issue.isBlocked) return false;
    // Sans information (`null`), le ticket n'est pas présenté comme ajouté en cours de sprint.
    if (filters.quickFilters.has("addedAfterStart") && issue.addedAfterSprintStart !== true) {
      return false;
    }
    return true;
  });
}

function matchesSearch(issue: BoardIssue, needle: string): boolean {
  const fields = issue.issue.fields;
  const contains = (text: string | null | undefined) =>
    text !== null && text !== undefined && foldText(text).includes(needle);

  return (
    contains(issue.issue.key) ||
    contains(fields.summary) ||
    contains(fields.assignee?.displayName) ||
    contains(fields.issuetype.name) ||
    fields.labels.some(contains) ||
    contains(fields.parent?.key) ||
    contains(fields.parent?.summary)
  );
}

/**
 * Filtrage local de la liste des objectifs Atlassian. Le filtre porte sur un nom : il ne justifie
 * pas d'interroger Atlassian à chaque frappe alors que la liste complète est déjà chargée.
 */
export function filterAtlassianGoals(
  search: string,
  goals: readonly AtlassianGoal[],
): AtlassianGoal[] {
  const needle = foldText(search.trim());
  if (needle === "") return [...goals];
  return goals.filter(
    (goal) =>
      foldText(goalDisplayName(goal)).includes(needle) ||
      (goal.key !== null && foldText(goal.key).includes(needle)) ||
      (goal.ownerName !== null && foldText(goal.ownerName).includes(needle)),
  );
}
