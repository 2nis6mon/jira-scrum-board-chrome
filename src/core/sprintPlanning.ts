import type { IssueQuery, JiraClient } from "../jira/client";
import { isRecord, type JsonValue } from "../jira/json";
import { isDoneStatus, type JiraIssue, type JiraSprint } from "../jira/models";
import type { JiraTransport } from "../jira/transport";
import { buildWriteRequest, SPRINT_PROPERTY_KEYS } from "../jira/writes";
import { CoreError } from "./reasons";
import {
  makeSprintGoal,
  makeSprintGoalDocument,
  parseSprintGoalText,
  prepareSprintGoalUpdate,
  readSprintGoalProperty,
  reconcileSprintGoals,
  type SprintGoal,
  type SprintGoalDocument,
  type SprintGoalUpdate,
  sameSprintGoalContent,
  updateSprintGoalProperty,
} from "./sprintGoals";

export type PlanningReader = Pick<
  JiraClient,
  "sprint" | "sprints" | "sprintIssues" | "backlogIssues" | "sprintProperty"
>;
export type PlanningWriter = Pick<JiraTransport, "write">;

/** Photographie Jira servant de base au brouillon et à la détection des conflits. */
export interface PlanningSnapshot {
  readonly boardId: number;
  readonly query: IssueQuery;
  readonly sprint: JiraSprint;
  readonly nativeGoalText: string;
  readonly rawGoalProperty: JsonValue | null;
  readonly goals: readonly SprintGoal[];
  readonly links: Readonly<Record<string, string>>;
  readonly sprintIssues: readonly JiraIssue[];
  readonly backlogIssues: readonly JiraIssue[];
  /** RAF consultatif : ces tickets ne peuvent pas être déplacés par le planning. */
  readonly remainingIssues: readonly JiraIssue[];
}

export interface PlanningPublication {
  readonly snapshot: PlanningSnapshot;
  readonly goals: readonly SprintGoal[];
  readonly links: Readonly<Record<string, string>>;
  /** Tous les tickets retenus, y compris ceux déjà présents dans le sprint futur. */
  readonly selectedIssueKeys: readonly string[];
  readonly accountId: string | null;
  readonly now: Date;
}

/** Étape confirmée par une relecture de Jira avant l'arrêt d'une publication. */
export type PlanningStep =
  | { readonly kind: "goalText" }
  | { readonly kind: "issuesAdded"; readonly count: number }
  | { readonly kind: "links" };

/**
 * Raison typée du résultat ; `PlanningModel` en produit le texte. `error` est la cause d'origine :
 * une `CoreError` du planning, une erreur Jira, ou toute autre valeur levée.
 */
export type PlanningReason =
  | { readonly code: "published" }
  /** La relecture préalable a échoué : rien n'a été écrit. */
  | { readonly code: "suspended"; readonly error: unknown }
  | { readonly code: "notFuture" }
  | { readonly code: "sprintChanged" }
  /** La publication est refusée avant toute écriture. */
  | { readonly code: "refused"; readonly error: unknown }
  /** Arrêt après une écriture : `confirmed` liste ce que Jira a confirmé. */
  | {
      readonly code: "unconfirmed";
      readonly confirmed: readonly PlanningStep[];
      readonly error: unknown;
    };

export interface PlanningOutcome {
  readonly kind: "confirmed" | "partial" | "conflict";
  readonly reason: PlanningReason;
  readonly snapshot?: PlanningSnapshot;
}

/** Révision du contenu partagé, indépendante des identifiants locaux générés à la lecture. */
export function planningRevision(snapshot: PlanningSnapshot): string {
  return stableJson({
    nativeGoalText: snapshot.nativeGoalText,
    rawGoalProperty: snapshot.rawGoalProperty,
    issueKeys: snapshot.sprintIssues.map((issue) => issue.key).sort(),
  });
}

/** Lecture sans Goal Atlassian et sans aucune écriture, même si le texte a changé dans Jira. */
export async function loadSprintPlanning(
  reader: PlanningReader,
  input: { boardId: number; sprintId: number; query: IssueQuery },
): Promise<PlanningSnapshot> {
  const [sprint, rawGoalProperty, sprintIssues, backlogIssues, activeSprints] = await Promise.all([
    reader.sprint(input.sprintId),
    reader.sprintProperty(input.sprintId, SPRINT_PROPERTY_KEYS.goals),
    reader.sprintIssues(input.boardId, input.sprintId, input.query),
    reader.backlogIssues(input.boardId, input.query),
    reader.sprints(input.boardId, ["active"]),
  ]);
  if (sprint.id !== input.sprintId) throw new CoreError({ code: "planningOtherSprint" });
  const read = readSprintGoalProperty(rawGoalProperty);
  if (read.kind === "unreadable") throw new CoreError({ code: "planningUnreadableProperty" });
  const reconciled = reconcileSprintGoals(
    sprint.goal,
    read.kind === "document" ? read.document : null,
  );
  const activeIssues = await Promise.all(
    activeSprints
      .filter((active) => active.state === "active")
      .map((active) => reader.sprintIssues(input.boardId, active.id, input.query)),
  );
  const seen = new Set<string>();
  const remainingIssues = activeIssues.flat().filter((issue) => {
    if (isDoneStatus(issue.fields.status) || seen.has(issue.key)) return false;
    seen.add(issue.key);
    return true;
  });
  return {
    boardId: input.boardId,
    query: input.query,
    sprint,
    nativeGoalText: sprint.goal ?? "",
    rawGoalProperty,
    goals: reconciled.goals.map(({ id, title, color, position }) =>
      makeSprintGoal({ id, title, color, position }),
    ),
    links: reconciled.links,
    sprintIssues,
    backlogIssues,
    remainingIssues,
  };
}

/**
 * Publication explicite vers un sprint futur. Ordre : texte → ajouts → rattachements.
 * Une réponse incertaine arrête la séquence, même si sa relecture confirme une partie.
 * Jira n'offre pas de transaction : les étapes confirmées restent visibles, sans rollback.
 */
export async function publishSprintPlanning(
  reader: PlanningReader,
  writer: PlanningWriter,
  input: PlanningPublication,
): Promise<PlanningOutcome> {
  const { snapshot } = input;
  const load = () =>
    loadSprintPlanning(reader, {
      boardId: snapshot.boardId,
      sprintId: snapshot.sprint.id,
      query: snapshot.query,
    });
  let current: PlanningSnapshot;
  try {
    current = await load();
  } catch (error) {
    return { kind: "conflict", reason: { code: "suspended", error } };
  }
  if (current.sprint.state !== "future") {
    return { kind: "conflict", reason: { code: "notFuture" }, snapshot: current };
  }
  if (
    current.nativeGoalText !== snapshot.nativeGoalText ||
    !sameJson(current.rawGoalProperty, snapshot.rawGoalProperty) ||
    !sameKeys(current.sprintIssues, snapshot.sprintIssues)
  ) {
    return { kind: "conflict", reason: { code: "sprintChanged" }, snapshot: current };
  }
  // Zone modifiée : le document entier, qui doit être resté celui de la photographie.
  const baseProperty = current.rawGoalProperty;
  const propertyUpdate: SprintGoalUpdate = {
    sprintId: snapshot.sprint.id,
    unchangedSince: (_fresh, raw) => sameJson(raw, baseProperty),
    mutate: (fresh) => planningDocument(fresh, input),
    accountId: input.accountId,
    now: input.now,
  };
  let goalText: string;
  let additions: string[];
  try {
    goalText = validateGoals(input.goals);
    // Un ajout de ticket ne reformate pas les puces ou espaces saisis directement dans Jira.
    if (sameJson(parseSprintGoalText(current.nativeGoalText), parseSprintGoalText(goalText))) {
      goalText = current.nativeGoalText;
    }
    const selected = new Set(input.selectedIssueKeys);
    if (selected.size !== input.selectedIssueKeys.length)
      throw new CoreError({ code: "planningDuplicateSelection" });
    const existing = new Set(current.sprintIssues.map((issue) => issue.key));
    if ([...existing].some((key) => !selected.has(key))) {
      throw new CoreError({ code: "planningExistingIssuesKept" });
    }
    const available = new Map(current.backlogIssues.map((issue) => [issue.key, issue]));
    const activeKeys = new Set(current.remainingIssues.map((issue) => issue.key));
    additions = input.selectedIssueKeys.filter((key) => !existing.has(key));
    for (const key of additions) {
      const issue = available.get(key);
      if (
        !issue ||
        activeKeys.has(key) ||
        isDoneStatus(issue.fields.status) ||
        issue.fields.issuetype.subtask === true
      ) {
        throw new CoreError({ code: "planningIssueUnavailable", issueKey: key });
      }
    }
    // Refus des valeurs invalides et de la taille avant la première écriture métier.
    prepareSprintGoalUpdate(current.rawGoalProperty, propertyUpdate);
    for (let index = 0; index < additions.length; index += 50) {
      buildWriteRequest({
        kind: "sprint.issues.add",
        sprintId: snapshot.sprint.id,
        issueKeys: additions.slice(index, index + 50),
      });
    }
  } catch (error) {
    return { kind: "conflict", reason: { code: "refused", error }, snapshot: current };
  }

  const confirmed: PlanningStep[] = [];
  try {
    if (goalText !== current.nativeGoalText) {
      await ensureFuture(reader, snapshot.sprint.id, current.nativeGoalText);
      await writer.write({ kind: "sprint.goal", sprintId: snapshot.sprint.id, goal: goalText });
      const read = await reader.sprint(snapshot.sprint.id);
      if ((read.goal ?? "") !== goalText)
        throw new CoreError({ code: "planningGoalTextUnconfirmed" });
      confirmed.push({ kind: "goalText" });
    }
    for (let index = 0; index < additions.length; index += 50) {
      await ensureFuture(reader, snapshot.sprint.id, goalText);
      const batch = additions.slice(index, index + 50);
      // Le sprint actif peut évoluer pendant l’atelier : ne jamais en retirer un ticket.
      const freshBacklog = new Set(
        (await reader.backlogIssues(snapshot.boardId, snapshot.query))
          .filter(
            (issue) =>
              !isDoneStatus(issue.fields.status) && issue.fields.issuetype.subtask !== true,
          )
          .map((issue) => issue.key),
      );
      const activeSprints = await reader.sprints(snapshot.boardId, ["active"]);
      const activeIssues = await Promise.all(
        activeSprints
          .filter((sprint) => sprint.state === "active")
          .map((sprint) => reader.sprintIssues(snapshot.boardId, sprint.id, snapshot.query)),
      );
      const activeKeys = new Set(activeIssues.flat().map((issue) => issue.key));
      if (batch.some((key) => !freshBacklog.has(key) || activeKeys.has(key))) {
        throw new CoreError({ code: "planningIssueLeftBacklog" });
      }
      await writer.write({
        kind: "sprint.issues.add",
        sprintId: snapshot.sprint.id,
        issueKeys: batch,
      });
      const read = new Set(
        (await reader.sprintIssues(snapshot.boardId, snapshot.sprint.id, snapshot.query)).map(
          (issue) => issue.key,
        ),
      );
      if (batch.some((key) => !read.has(key)))
        throw new CoreError({ code: "planningAdditionsUnconfirmed" });
      confirmed.push({ kind: "issuesAdded", count: batch.length });
    }
    await ensureFuture(reader, snapshot.sprint.id, goalText);
    const update = await updateSprintGoalProperty(reader, writer, propertyUpdate);
    if (update.kind === "conflict") {
      throw new CoreError({ code: "planningLinksChanged" });
    }
    const property = update.value;
    if (update.kind === "written") {
      const read = await reader.sprintProperty(snapshot.sprint.id, SPRINT_PROPERTY_KEYS.goals);
      if (!sameJson(read, property)) throw new CoreError({ code: "planningLinksUnconfirmed" });
      confirmed.push({ kind: "links" });
    }
    const final = await load();
    if (
      final.sprint.state !== "future" ||
      final.sprint.id !== snapshot.sprint.id ||
      final.nativeGoalText !== goalText ||
      !sameSprintGoalContent(final.rawGoalProperty, property) ||
      input.selectedIssueKeys.some((key) => !final.sprintIssues.some((issue) => issue.key === key))
    ) {
      throw new CoreError({ code: "planningFinalCheckChanged" });
    }
    return { kind: "confirmed", reason: { code: "published" }, snapshot: final };
  } catch (error) {
    let refreshed: PlanningSnapshot | undefined;
    try {
      refreshed = await load();
    } catch {
      /* La relecture peut aussi échouer : rien n’est rejoué. */
    }
    return {
      kind: "partial",
      reason: { code: "unconfirmed", confirmed, error },
      ...(refreshed ? { snapshot: refreshed } : {}),
    };
  }
}

async function ensureFuture(
  reader: PlanningReader,
  sprintId: number,
  goalText: string,
): Promise<void> {
  const sprint = await reader.sprint(sprintId);
  if (sprint.id !== sprintId || sprint.state !== "future" || (sprint.goal ?? "") !== goalText) {
    throw new CoreError({ code: "planningSprintChanged" });
  }
}

function validateGoals(goals: readonly SprintGoal[]): string {
  const ids = new Set<string>();
  for (const goal of goals) {
    const titles = parseSprintGoalText(goal.title);
    if (
      !goal.id.trim() ||
      ids.has(goal.id) ||
      goal.atlassianGoalId !== null ||
      titles.length !== 1 ||
      titles[0] !== goal.title.trim()
    ) {
      throw new CoreError({ code: "planningInvalidGoals" });
    }
    ids.add(goal.id);
  }
  return goals.map((goal) => goal.title.trim()).join("\n");
}

/** Mutation pure de la publication : objectifs du brouillon et liens des tickets retenus. */
function planningDocument(
  fresh: SprintGoalDocument | null,
  input: PlanningPublication,
): SprintGoalDocument {
  const stored = fresh ?? makeSprintGoalDocument();
  const ids = new Set(input.goals.map((goal) => goal.id));
  const selected = new Set(input.selectedIssueKeys);
  const links: Record<string, string> = {};
  for (const [key, id] of Object.entries(stored.links)) {
    if (ids.has(id) && !selected.has(key)) links[key] = id;
  }
  for (const [key, id] of Object.entries(input.links)) {
    if (!selected.has(key) || !ids.has(id)) throw new CoreError({ code: "planningLinkMismatch" });
    links[key] = id;
  }
  // Les attributs natifs connus cèdent la place au texte ; les extensions de format restent.
  return {
    ...stored,
    goals: input.goals.map((goal, position) => ({ ...goal, title: goal.title.trim(), position })),
    links,
  };
}

function sameKeys(a: readonly JiraIssue[], b: readonly JiraIssue[]): boolean {
  return sameJson(a.map((issue) => issue.key).sort(), b.map((issue) => issue.key).sort());
}

function sameJson(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(input: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (isRecord(value))
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, normalize(value[key])]),
      );
    return value;
  };
  return JSON.stringify(normalize(input));
}
