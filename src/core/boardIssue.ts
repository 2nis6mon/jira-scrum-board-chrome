import {
  blockingIssues,
  estimate,
  isBlockedByLink,
  isDoneStatus,
  isFlagged,
  type JiraIssue,
  type JiraSprint,
  type JiraUser,
  lastStatusChange,
  relatedIssues,
  sprintActivated,
  sprintScope,
} from "../jira/models";
import {
  type BoardConfiguration,
  type ColumnConfiguration,
  categoryForIssueType,
  type GoalSource,
  type IssueCategory,
  isBugType,
  swimlaneOfType,
} from "./boardConfiguration";
import type { SprintGoal } from "./sprintGoals";

/** Bug rattaché à un ticket (lien Jira ou sous-tâche). */
export interface LinkedBug {
  readonly key: string;
  readonly summary: string | null;
  readonly statusName: string | null;
  /** `null` si Jira n'a pas fourni le statut : le bug est alors compté comme ouvert. */
  readonly isDone: boolean | null;
}

export function isOpenBug(bug: LinkedBug): boolean {
  return bug.isDone !== true;
}

/**
 * Ticket qui en bloque un autre (lien Jira « est bloqué par »), tel que Jira le décrit dans le
 * lien : rien n'est demandé en plus.
 */
export interface Blocker {
  readonly key: string;
  readonly summary: string | null;
  readonly statusName: string | null;
  /** `new` | `indeterminate` | `done`, ou `null` si Jira ne l'a pas fourni. */
  readonly statusCategoryKey: string | null;
  readonly typeName: string | null;
}

/** Projet du bloquant, déduit de sa clé (`OPS-412` → `OPS`). */
export function blockerProjectKey(blocker: Blocker): string {
  return blocker.key.split("-").slice(0, -1).join("-");
}

/**
 * Sous-tâche d'un ticket du board. Elle n'a pas de carte : elle est repliée dans celle de son
 * parent, qui en montre l'avancement. Les sous-tâches ne se déplacent pas sur le board.
 */
export interface Subtask {
  readonly key: string;
  readonly summary: string | null;
  readonly statusName: string | null;
  /** `new` | `indeterminate` | `done`, ou `null` si Jira ne l'a pas fourni. */
  readonly statusCategoryKey: string | null;
  /** Assigné, connu quand la sous-tâche figure parmi les tickets du sprint ; sinon `null`. */
  readonly assignee: JiraUser | null;
}

/**
 * Famille d'une carte, pour la mettre en évidence avec les siennes : la story elle-même, ou la
 * story d'une sous-tâche. Le parent d'une story (son epic) n'en fait pas partie.
 */
export function familyKey(issue: BoardIssue): string {
  const fields = issue.issue.fields;
  return fields.issuetype.subtask === true && fields.parent ? fields.parent.key : issue.issue.key;
}

/** Une sous-tâche sans statut connu compte comme ouverte : on ne présume jamais la fin. */
export function isSubtaskDone(subtask: Subtask): boolean {
  return subtask.statusCategoryKey === "done";
}

/** Où se trouve un bloquant, pour la bulle de survol. */
export type BlockerLocation =
  /** Le bloquant est sur le board : sa colonne et son assigné sont connus. */
  | { kind: "onBoard"; columnName: string | null; assigneeName: string | null }
  /** Hors du board (autre sprint, autre projet) : seuls projet et type sont connus. */
  | { kind: "elsewhere"; projectKey: string; typeName: string | null };

/**
 * Ticket enrichi des informations calculées par l'application. Toutes les valeurs proviennent
 * de Jira ; celles qui ne peuvent pas être déterminées restent `null` plutôt que d'être estimées.
 */
export interface BoardIssue {
  readonly issue: JiraIssue;
  readonly category: IssueCategory;
  /** Swimlane par type du ticket ; `null` pour un ticket par objectif. */
  readonly swimlaneId: string | null;
  readonly columnId: string | null;
  readonly goalId: string | null;
  readonly estimate: number | null;
  /** Bloqué par un lien Jira natif « est bloqué par » (seule source depuis 0.31.0). */
  readonly isBlocked: boolean;
  /** Tickets qui bloquent celui-ci, dans l'ordre des liens Jira. */
  readonly blockers: readonly Blocker[];
  /** Drapeau Jira (« Flagged »). Indépendant de `isBlocked` : c'est un signal à part. */
  readonly isFlagged: boolean;
  /**
   * Jours passés dans la colonne courante. `null` si Jira n'a fourni ni historique ni date de
   * création — aucune approximation n'est faite.
   */
  readonly daysInColumn: number | null;
  /** Date d'ajout du ticket au sprint, lue dans le changelog Jira. */
  readonly addedToSprintAt: Date | null;
  /**
   * Vrai si le ticket a rejoint le sprint APRÈS son démarrage. `null` quand l'information n'est
   * pas déterminable — on n'affiche alors rien.
   */
  readonly addedAfterSprintStart: boolean | null;
  /** Bugs rattachés à ce ticket, ouverts ou non. */
  readonly linkedBugs: readonly LinkedBug[];
  /** Sous-tâches du ticket, dans l'ordre de Jira. Vide pour une sous-tâche. */
  readonly subtasks: readonly Subtask[];
}

export function isIssueDone(issue: BoardIssue): boolean {
  return isDoneStatus(issue.issue.fields.status);
}

export function openBugCount(issue: BoardIssue): number {
  return issue.linkedBugs.filter(isOpenBug).length;
}

export function blockingKeys(issue: BoardIssue): string[] {
  return issue.blockers.map((blocker) => blocker.key);
}

export function browseUrl(siteOrigin: string, issueKey: string): string {
  return `${siteOrigin}/browse/${encodeURIComponent(issueKey)}`;
}

/** Avancement des sous-tâches d'un ticket, et ses incohérences avec la place du ticket. */
export interface SubtaskProgress {
  readonly total: number;
  readonly done: number;
  /** Toutes les sous-tâches sont terminées alors que le ticket n'a pas atteint la dernière colonne. */
  readonly allDoneBeforeLastColumn: boolean;
  /** Ticket dans la dernière colonne alors que des sous-tâches restent ouvertes. */
  readonly openInLastColumn: readonly Subtask[];
}

/**
 * `lastColumnId` : dernière colonne visible du bloc du ticket, comme pour les Goals atteints.
 * `null` pour un ticket sans sous-tâche.
 */
export function subtaskProgress(
  issue: BoardIssue,
  lastColumnId: string | null,
): SubtaskProgress | null {
  if (issue.subtasks.length === 0) return null;
  const done = issue.subtasks.filter(isSubtaskDone).length;
  const inLastColumn = lastColumnId !== null && issue.columnId === lastColumnId;
  return {
    total: issue.subtasks.length,
    done,
    allDoneBeforeLastColumn: done === issue.subtasks.length && !inLastColumn,
    openInLastColumn: inLastColumn ? issue.subtasks.filter((sub) => !isSubtaskDone(sub)) : [],
  };
}

// ─── Avancement d'un objectif ────────────────────────────────────────────────

/** État factuel, sans notion inventée de « risque ». */
export type GoalProgressState = "empty" | "completed" | "inProgress";

/** Avancement d'un objectif, calculé sur les tickets qui lui sont rattachés. */
export interface GoalProgress {
  readonly goal: SprintGoal;
  readonly issues: readonly BoardIssue[];
  readonly total: number;
  readonly done: number;
  readonly remaining: number;
  readonly blocked: number;
  /** Story points totaux, ou `null` si aucun ticket n'est estimé. */
  readonly totalPoints: number | null;
  readonly donePoints: number | null;
  /** Progression en tickets. Les points sont un affichage complémentaire, jamais un substitut. */
  readonly completionRatio: number;
  readonly state: GoalProgressState;
}

export function goalProgress(
  goal: SprintGoal,
  issues: readonly BoardIssue[],
  lastColumnId?: string | null,
): GoalProgress {
  const total = issues.length;
  const doneIssues = issues.filter((issue) =>
    lastColumnId === undefined
      ? isIssueDone(issue)
      : lastColumnId !== null && issue.columnId === lastColumnId,
  );
  const done = doneIssues.length;
  const totalPoints = sumEstimates(issues);
  return {
    goal,
    issues,
    total,
    done,
    remaining: total - done,
    blocked: issues.filter((issue) => issue.isBlocked).length,
    totalPoints,
    donePoints: totalPoints === null ? null : (sumEstimates(doneIssues) ?? 0),
    completionRatio: total === 0 ? 0 : done / total,
    state: total === 0 ? "empty" : done === total ? "completed" : "inProgress",
  };
}

function sumEstimates(issues: readonly BoardIssue[]): number | null {
  const values = issues
    .map((issue) => issue.estimate)
    .filter((value): value is number => value !== null);
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

// ─── Photographie du board ───────────────────────────────────────────────────

/** Indicateurs du sprint. Uniquement des comptages sur les données Jira. */
export interface SprintMetrics {
  readonly totalIssues: number;
  readonly done: number;
  readonly inProgress: number;
  readonly toDo: number;
  readonly swimlaneCount: number;
  readonly blockedCount: number;
  readonly agingCount: number;
  readonly withoutGoalCount: number;
  readonly addedAfterStartCount: number;
  readonly totalPoints: number | null;
  readonly donePoints: number | null;
  readonly goalCount: number;
  readonly completionRatio: number;
}

/** Photographie complète du board à un instant donné. */
export interface BoardSnapshot {
  /** Sprint de référence : le premier sprint actif du board (dates, titre, épinglage). */
  readonly sprint: JiraSprint | null;
  /** Tous les sprints actifs du board. Le board affiche leurs tickets réunis. */
  readonly activeSprints: readonly JiraSprint[];
  readonly goals: readonly SprintGoal[];
  /**
   * D'où viennent les objectifs AFFICHÉS : peut différer de la source configurée quand la
   * lecture des Goals Atlassian a échoué et que le board s'est rabattu sur le texte du sprint.
   * Un rattachement s'écrit là où l'objectif affiché existe.
   */
  readonly goalsOrigin: GoalSource;
  readonly goalIssues: readonly BoardIssue[];
  /** Tickets DU SPRINT rangés dans une swimlane par type (`swimlaneId`). */
  readonly swimlaneIssues: readonly BoardIssue[];
  readonly syncedAt: Date;
  readonly currentUser: JiraUser | null;
  /** Vrai si la lecture des objectifs a échoué faute de droits Jira. */
  readonly goalsReadOnly: boolean;
  /**
   * Goals Atlassian épinglés au sprint de référence, tels que lus dans sa propriété. `null` si
   * cette propriété n'a pas pu être lue : l'épinglage n'est alors pas connu, ni modifiable.
   */
  readonly pinnedGoalIds: readonly string[] | null;
  /**
   * Goals épinglés gardés dans ce navigateur, affichés faute de sélection dans Jira pour ce sprint.
   * `null` : la sélection affichée est celle de Jira (ou il n'y en a aucune).
   */
  readonly localPinnedGoalIds: readonly string[] | null;
}

export function allIssues(snapshot: BoardSnapshot): BoardIssue[] {
  return [...snapshot.goalIssues, ...snapshot.swimlaneIssues];
}

export function findIssue(snapshot: BoardSnapshot, key: string): BoardIssue | null {
  return allIssues(snapshot).find((issue) => issue.issue.key === key) ?? null;
}

/** Situe un bloquant : sur le board (colonne, assigné) ou ailleurs (projet, type). */
export function locateBlocker(
  snapshot: BoardSnapshot,
  blocker: Blocker,
  columns: readonly ColumnConfiguration[],
): BlockerLocation {
  const onBoard = findIssue(snapshot, blocker.key);
  if (!onBoard) {
    return {
      kind: "elsewhere",
      projectKey: blockerProjectKey(blocker),
      typeName: blocker.typeName,
    };
  }
  return {
    kind: "onBoard",
    columnName: columns.find((column) => column.id === onBoard.columnId)?.name ?? null,
    assigneeName: onBoard.issue.fields.assignee?.displayName ?? null,
  };
}

export function issuesWithoutGoal(snapshot: BoardSnapshot): BoardIssue[] {
  return snapshot.goalIssues.filter((issue) => issue.goalId === null);
}

export function snapshotGoalProgress(snapshot: BoardSnapshot): GoalProgress[] {
  return [...snapshot.goals]
    .sort((a, b) => a.position - b.position)
    .map((goal) =>
      goalProgress(
        goal,
        snapshot.goalIssues.filter((issue) => issue.goalId === goal.id),
      ),
    );
}

export function sprintMetrics(snapshot: BoardSnapshot, agingThresholdDays: number): SprintMetrics {
  const scrum = snapshot.goalIssues;
  const everything = allIssues(snapshot);
  const categoryKey = (issue: BoardIssue) => issue.issue.fields.status.statusCategory?.key;
  const totalPoints = sumEstimates(scrum);
  const done = scrum.filter(isIssueDone).length;
  return {
    totalIssues: scrum.length,
    done,
    inProgress: scrum.filter((issue) => categoryKey(issue) === "indeterminate").length,
    toDo: scrum.filter((issue) => categoryKey(issue) === "new").length,
    swimlaneCount: snapshot.swimlaneIssues.length,
    blockedCount: everything.filter((issue) => issue.isBlocked).length,
    agingCount: everything.filter(
      (issue) =>
        issue.daysInColumn !== null &&
        !isIssueDone(issue) &&
        issue.daysInColumn >= agingThresholdDays,
    ).length,
    withoutGoalCount: issuesWithoutGoal(snapshot).length,
    addedAfterStartCount: everything.filter((issue) => issue.addedAfterSprintStart === true).length,
    totalPoints,
    donePoints: totalPoints === null ? null : (sumEstimates(scrum.filter(isIssueDone)) ?? 0),
    goalCount: snapshot.goals.length,
    completionRatio: scrum.length === 0 ? 0 : done / scrum.length,
  };
}

// ─── Assemblage ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Construit les tickets enrichis à partir des données Jira brutes. */
export function assembleBoardIssues(input: {
  issues: readonly JiraIssue[];
  configuration: BoardConfiguration;
  columns: readonly ColumnConfiguration[];
  /** Rattachement ticket → objectif, clé = clé Jira du ticket. */
  links: Readonly<Record<string, string>>;
  sprint?: JiraSprint | null;
  /** Sous-tâches présentes parmi les tickets du sprint, par clé : leur assigné en vient. */
  subtaskIssues?: ReadonlyMap<string, JiraIssue>;
  /**
   * Swimlane par type où ranger ces tickets (une sous-tâche suit celle de son parent). Absent : celle
   * de leur type.
   */
  swimlaneId?: string | null;
  now?: Date;
}): BoardIssue[] {
  const { configuration } = input;
  const subtaskIssues = input.subtaskIssues ?? new Map<string, JiraIssue>();
  const now = input.now ?? new Date();
  const sprint = input.sprint ?? null;

  const columnByStatus = new Map<string, string>();
  for (const column of input.columns) {
    for (const statusId of column.statusIds) columnByStatus.set(statusId, column.id);
  }

  return input.issues.map((issue): BoardIssue => {
    const fields = issue.fields;

    const since = (issue.changelog ? lastStatusChange(issue.changelog) : null) ?? fields.created;
    const daysInColumn =
      since === null ? null : Math.floor((now.getTime() - since.getTime()) / DAY_MS);

    // Périmètre : le ticket était-il dans le sprint à son démarrage (`sprintScope`) ? Sans
    // historique, on ne sait pas : `null`, rien n'est affiché.
    let addedToSprintAt: Date | null = null;
    let addedAfterSprintStart: boolean | null = null;
    const activated = sprint ? sprintActivated(sprint) : null;
    if (sprint && activated && issue.changelog) {
      const scope = sprintScope({
        changelog: issue.changelog,
        sprintName: sprint.name,
        startedAt: activated,
        created: fields.created,
      });
      addedToSprintAt = scope.enteredAt;
      addedAfterSprintStart = scope.inSprintAtStart === null ? null : !scope.inSprintAtStart;
    }

    const swimlaneId =
      input.swimlaneId !== undefined
        ? input.swimlaneId
        : (swimlaneOfType(configuration, fields.issuetype.id)?.id ?? null);
    return {
      issue,
      category:
        swimlaneId !== null ? "SWIMLANE" : categoryForIssueType(configuration, fields.issuetype.id),
      swimlaneId,
      columnId: columnByStatus.get(fields.status.id) ?? null,
      goalId: input.links[issue.key] ?? null,
      estimate: estimate(fields, configuration.estimationFieldId),
      isBlocked: isBlockedByLink(fields),
      blockers: blockingIssues(fields).map((ref) => ({
        key: ref.key,
        summary: ref.summary,
        statusName: ref.status?.name ?? null,
        statusCategoryKey: ref.status?.statusCategory?.key ?? null,
        typeName: ref.issuetype?.name ?? null,
      })),
      isFlagged: isFlagged(fields, configuration.flaggedFieldId),
      daysInColumn,
      addedToSprintAt,
      addedAfterSprintStart,
      linkedBugs: relatedIssues(fields)
        .filter((ref) =>
          isBugType(configuration, ref.issuetype?.id ?? null, ref.issuetype?.name ?? null),
        )
        .map((ref) => ({
          key: ref.key,
          summary: ref.summary,
          statusName: ref.status?.name ?? null,
          isDone: ref.status ? isDoneStatus(ref.status) : null,
        })),
      subtasks: subtasksOf(issue, subtaskIssues),
    };
  });
}

/**
 * Sous-tâches d'un ticket : la liste complète que Jira joint au ticket (`subtasks`), complétée par
 * celles du sprint qui y manqueraient. Le statut et l'assigné viennent du ticket du sprint quand il
 * y est : c'est la lecture la plus complète.
 */
function subtasksOf(issue: JiraIssue, sprintSubtasks: ReadonlyMap<string, JiraIssue>): Subtask[] {
  if (issue.fields.issuetype.subtask === true) return [];
  const fromSprint = (key: string) => sprintSubtasks.get(key) ?? null;
  const listed = issue.fields.subtasks.map((ref): Subtask => {
    const full = fromSprint(ref.key);
    const status = full?.fields.status ?? ref.status;
    return {
      key: ref.key,
      summary: full?.fields.summary ?? ref.summary,
      statusName: status?.name ?? null,
      statusCategoryKey: status?.statusCategory?.key ?? null,
      assignee: full?.fields.assignee ?? null,
    };
  });
  const known = new Set(listed.map((subtask) => subtask.key));
  const missing = [...sprintSubtasks.values()]
    .filter((sub) => sub.fields.parent?.key === issue.key && !known.has(sub.key))
    .map(
      (sub): Subtask => ({
        key: sub.key,
        summary: sub.fields.summary,
        statusName: sub.fields.status.name,
        statusCategoryKey: sub.fields.status.statusCategory?.key ?? null,
        assignee: sub.fields.assignee,
      }),
    );
  return [...listed, ...missing];
}
