import type { IssueQuery, JiraClient } from "../jira/client";
import type { JiraIssue, JiraSprint } from "../jira/models";
import { isIssueKey, SPRINT_PROPERTY_KEYS } from "../jira/writes";
import { readSprintGoalProperty, reconcileSprintGoals, stableGoalIds } from "./sprintGoals";

// Avancement des objectifs du Sprint Planning (story 8.16). Lectures seules : ce qui est déjà
// livré avant le sprint en préparation est indiqué à part, jamais compté dans sa charge.

/** Tickets terminés avant le sprint en préparation, par objectif. */
export interface GoalHistory {
  readonly delivered: Readonly<Record<string, readonly JiraIssue[]>>;
  /** Une lecture a échoué, ou la remontée s'est arrêtée à sa limite : il peut en manquer. */
  readonly incomplete: boolean;
}

/** Sprints clos relus au plus en remontant la chaîne des reports (coût mesuré en 8.10). */
export const MAX_HISTORY_SPRINTS = 10;

type ClosedSprintData = {
  readonly goalIds: ReadonlySet<string>;
  readonly links: Readonly<Record<string, string>>;
  /** Tickets du sprint clos, lus une fois et seulement à la demande ; `null` : lecture en échec. */
  issues(): Promise<readonly JiraIssue[] | null>;
};

/**
 * Lectures des sprints clos, partagées tant que l'appelant garde le cache : un sprint clos ne
 * change plus. L'appelant le vide à l'actualisation et au changement de board.
 */
export interface ClosedSprintCache {
  closedSprints?: Promise<readonly JiraSprint[]>;
  readonly sprints: Map<number, Promise<ClosedSprintData>>;
}

export function closedSprintCache(): ClosedSprintCache {
  return { sprints: new Map() };
}

export type HistoryReader = Pick<JiraClient, "sprints" | "sprintProperty" | "sprintIssues">;

/**
 * Objectifs texte reportés : en remontant les sprints clos du board, du plus récent au plus
 * ancien, tant que l'identifiant de l'objectif figure dans leur propriété, les tickets terminés
 * (statut aujourd'hui dans la dernière colonne du board, `doneStatusIds`, story 8.21) qui y étaient
 * rattachés. Un report renommé `<id>-<sprint>` (collision d'identifiant) est suivi
 * jusqu'à son identifiant d'origine. Un ticket compte une fois ; ceux du sprint en préparation
 * sont exclus.
 */
export async function textGoalHistory(
  reader: HistoryReader,
  input: {
    boardId: number;
    sprintId: number;
    goalIds: readonly string[];
    sprintKeys: ReadonlySet<string>;
    query: IssueQuery;
    /** Statuts de la dernière colonne visible du board : seule règle de « terminé ». */
    doneStatusIds: readonly string[];
  },
  cache: ClosedSprintCache = closedSprintCache(),
): Promise<GoalHistory> {
  const doneStatuses = new Set(input.doneStatusIds);
  const delivered: Record<string, JiraIssue[]> = {};
  let incomplete = false;
  /** Objectif affiché → identifiant à chercher dans le sprint clos suivant (plus ancien). */
  const alive = new Map(input.goalIds.map((id) => [id, id]));
  if (alive.size === 0) return { delivered, incomplete };

  let closed: readonly JiraSprint[];
  try {
    cache.closedSprints ??= reader.sprints(input.boardId, ["closed"]);
    closed = [...(await cache.closedSprints)]
      .filter((sprint) => sprint.state === "closed")
      .sort(byMostRecent);
  } catch {
    delete cache.closedSprints;
    return { delivered, incomplete: true };
  }

  let previousSprintId = input.sprintId;
  let read = 0;
  for (const sprint of closed) {
    if (alive.size === 0) break;
    if (read >= MAX_HISTORY_SPRINTS) {
      incomplete = true;
      break;
    }
    read += 1;
    let data: ClosedSprintData;
    try {
      data = await closedSprintData(reader, cache, sprint, input);
    } catch {
      // Propriété illisible ou lecture en échec : la chaîne s'arrête là, et on le dit.
      incomplete = true;
      break;
    }
    const found = new Map<string, string>();
    for (const [goalId, wanted] of [...alive]) {
      const suffix = `-${previousSprintId}`;
      const base = wanted.endsWith(suffix) ? wanted.slice(0, -suffix.length) : null;
      const id = data.goalIds.has(wanted) ? wanted : base && data.goalIds.has(base) ? base : null;
      if (id === null) {
        alive.delete(goalId);
        continue;
      }
      alive.set(goalId, id);
      found.set(goalId, id);
    }
    // Tickets lus seulement si un objectif suivi figure dans ce sprint et y a des liens.
    const ids = new Set(found.values());
    const linked = Object.values(data.links).some((id) => ids.has(id));
    const issues = linked ? await data.issues() : [];
    if (issues === null) incomplete = true;
    for (const [goalId, id] of issues === null ? [] : found) {
      const list = delivered[goalId] ?? [];
      for (const issue of issues ?? []) {
        if (data.links[issue.key] !== id || !doneStatuses.has(issue.fields.status?.id ?? ""))
          continue;
        if (input.sprintKeys.has(issue.key) || list.some((known) => known.key === issue.key))
          continue;
        list.push(issue);
      }
      delivered[goalId] = list;
    }
    previousSprintId = sprint.id;
  }
  return { delivered: withoutEmpty(delivered), incomplete };
}

function byMostRecent(a: JiraSprint, b: JiraSprint): number {
  const time = (sprint: JiraSprint) =>
    (sprint.completeDate ?? sprint.endDate ?? sprint.startDate)?.getTime() ?? 0;
  return time(b) - time(a) || b.id - a.id;
}

async function closedSprintData(
  reader: HistoryReader,
  cache: ClosedSprintCache,
  sprint: JiraSprint,
  input: { boardId: number; query: IssueQuery },
): Promise<ClosedSprintData> {
  let data = cache.sprints.get(sprint.id);
  if (!data) {
    data = (async () => {
      const raw = await reader.sprintProperty(sprint.id, SPRINT_PROPERTY_KEYS.goals);
      const read = readSprintGoalProperty(raw);
      if (read.kind === "unreadable") throw new Error("propriété illisible");
      const document = read.kind === "document" ? read.document : null;
      const reconciled = reconcileSprintGoals(sprint.goal, document, stableGoalIds(sprint.id));
      const goalIds = new Set(reconciled.goals.map((goal) => goal.id));
      let issues: Promise<readonly JiraIssue[] | null> | null = null;
      return {
        goalIds,
        links: reconciled.links,
        issues: () => {
          issues ??= reader.sprintIssues(input.boardId, sprint.id, input.query).catch(() => {
            // Une lecture en échec n'est pas gardée : la remontée suivante la refait.
            issues = null;
            return null;
          });
          return issues;
        },
      };
    })();
    cache.sprints.set(sprint.id, data);
    // Une lecture en échec n'est pas gardée : l'actualisation suivante la refait.
    data.catch(() => cache.sprints.delete(sprint.id));
  }
  return data;
}

/** Tickets lus par paquets de clés : une lecture par paquet, jamais rejouée par `core`. */
const KEYS_PER_READ = 50;

/**
 * Goals Atlassian : tickets liés au Goal (`workItems` de l'API Goals) déjà terminés hors du sprint
 * en préparation, lus parmi les tickets du board par JQL (`key in (…) AND status in (…)`, statuts de
 * la dernière colonne visible du board, story 8.21).
 * `workItemsComplete` faux (lecture partielle des Goals) rend l'historique incomplet.
 */
export async function atlassianGoalHistory(
  reader: Pick<JiraClient, "boardIssues">,
  input: {
    boardId: number;
    goalIds: readonly string[];
    workItems: Readonly<Record<string, readonly string[]>>;
    workItemsComplete: boolean;
    sprintKeys: ReadonlySet<string>;
    query: IssueQuery;
    /** Statuts de la dernière colonne visible du board : seule règle de « terminé ». */
    doneStatusIds: readonly string[];
  },
): Promise<GoalHistory> {
  let incomplete = !input.workItemsComplete;
  // Seuls des identifiants numériques entrent dans le JQL ; sans dernière colonne, rien n'est terminé.
  const doneIds = input.doneStatusIds.filter((id) => /^\d+$/.test(id));
  const doneStatuses = new Set(doneIds);
  const wanted = new Set<string>();
  for (const goalId of input.goalIds)
    for (const key of input.workItems[goalId] ?? [])
      if (isIssueKey(key) && !input.sprintKeys.has(key)) wanted.add(key);
  const keys = doneIds.length > 0 ? [...wanted].sort() : [];
  const done = new Map<string, JiraIssue>();
  for (let start = 0; start < keys.length; start += KEYS_PER_READ) {
    const chunk = keys.slice(start, start + KEYS_PER_READ);
    try {
      const issues = await reader.boardIssues(
        input.boardId,
        `key in (${chunk.join(", ")}) AND status in (${doneIds.join(",")})`,
        input.query,
      );
      for (const issue of issues)
        if (doneStatuses.has(issue.fields.status?.id ?? "")) done.set(issue.key, issue);
    } catch {
      incomplete = true;
    }
  }
  const delivered: Record<string, JiraIssue[]> = {};
  for (const goalId of input.goalIds) {
    delivered[goalId] = (input.workItems[goalId] ?? [])
      .map((key) => done.get(key))
      .filter((issue) => issue !== undefined);
  }
  return { delivered: withoutEmpty(delivered), incomplete };
}

function withoutEmpty(
  delivered: Readonly<Record<string, readonly JiraIssue[]>>,
): Record<string, readonly JiraIssue[]> {
  return Object.fromEntries(Object.entries(delivered).filter(([, issues]) => issues.length > 0));
}
