import type { JiraClient } from "../jira/client";
import { JiraError } from "../jira/errors";
import { isRecord, type JsonObject, type JsonValue } from "../jira/json";
import type { JiraStatus, JiraTransition } from "../jira/models";
import { resolveTransition } from "../jira/transitionPlanner";
import type { JiraTransport } from "../jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../jira/writes";
import type { RankChange } from "./dropPlan";
import {
  decodeSprintGoalDocument,
  encodeSprintGoalDocument,
  goalColorName,
  makeSprintGoal,
  SPRINT_GOAL_DOCUMENT_VERSION,
  type SprintGoal,
  type SprintGoalDocument,
} from "./sprintGoals";

// Écritures du board, dans les catégories validées : transition, rang, rattachement à un
// objectif et épinglage de Goals (propriété du sprint). Chacune part UNE fois ; une lecture la précède quand elle
// sert à vérifier que Jira est toujours dans l'état affiché.

/** Lectures dont les écritures ont besoin. `JiraClient` les fournit. */
export type WriteReader = Pick<JiraClient, "issueStatus" | "transitions" | "sprintProperty">;
/** Seule porte d'écriture : l'inventaire fermé de `writes.ts`. */
export type JiraWriter = Pick<JiraTransport, "write">;

// ─── Transition ──────────────────────────────────────────────────────────────

export type MoveOutcome =
  /** Jira a confirmé la transition. */
  | { kind: "moved"; transition: JiraTransition }
  /** Le ticket est déjà dans un statut de la colonne visée : rien n'a été écrit. */
  | { kind: "alreadyThere" }
  /** Le ticket a changé de statut dans Jira depuis l'affichage : rien n'a été écrit. */
  | { kind: "conflict"; currentStatus: JiraStatus }
  /** La transition exige des champs que l'extension ne remplit pas : rien n'a été écrit. */
  | { kind: "requiresFields"; transition: JiraTransition; fields: string[] }
  /** Aucune transition directe : voici ce que Jira autorise réellement. Rien n'a été écrit. */
  | { kind: "choose"; available: JiraTransition[] }
  /** Jira ne propose aucune transition depuis le statut courant. Rien n'a été écrit. */
  | { kind: "noTransition"; currentStatus: JiraStatus };

/**
 * Amène un ticket dans une colonne par une transition DIRECTE proposée par Jira.
 *
 * 1. Relecture du statut : si le ticket a changé dans Jira depuis l'affichage, on s'arrête.
 * 2. Lecture des transitions proposées depuis ce statut.
 * 3. Une seule écriture, jamais rejouée. Pas d'enchaînement de transitions à l'aveugle.
 */
export async function moveToColumn(
  reader: WriteReader,
  writer: JiraWriter,
  input: { issueKey: string; knownStatusId: string; targetStatusIds: readonly string[] },
): Promise<MoveOutcome> {
  const currentStatus = await reader.issueStatus(input.issueKey);
  if (currentStatus.id !== input.knownStatusId) return { kind: "conflict", currentStatus };

  const transitions = await reader.transitions(input.issueKey);
  const resolution = resolveTransition(currentStatus.id, input.targetStatusIds, transitions);
  switch (resolution.kind) {
    case "alreadyInTargetColumn":
      return { kind: "alreadyThere" };
    case "requiresFields":
      return {
        kind: "requiresFields",
        transition: resolution.transition,
        fields: resolution.fields,
      };
    case "unreachable":
      return resolution.available.length === 0
        ? { kind: "noTransition", currentStatus }
        : { kind: "choose", available: resolution.available };
    case "ready":
      await writer.write({
        kind: "issue.transition",
        issueKey: input.issueKey,
        transitionId: resolution.transition.id,
      });
      return { kind: "moved", transition: resolution.transition };
  }
}

/** Transition choisie explicitement par l'utilisateur parmi celles que Jira propose. */
export async function performTransition(
  writer: JiraWriter,
  issueKey: string,
  transition: JiraTransition,
): Promise<void> {
  await writer.write({ kind: "issue.transition", issueKey, transitionId: transition.id });
}

// ─── Rang ────────────────────────────────────────────────────────────────────

/**
 * Écrit le rang du board. Jira répond 204, ou 207 quand il a refusé le classement ticket par
 * ticket : ce second cas passe par le chemin du succès HTTP, on relit donc le corps pour ne pas
 * présenter comme réussi un classement refusé.
 */
export async function rankIssue(
  writer: JiraWriter,
  issueKey: string,
  change: RankChange,
): Promise<void> {
  if (change.kind === "none") return;
  const response = await writer.write(
    change.kind === "before"
      ? { kind: "issue.rank", issueKey, before: change.issueKey }
      : { kind: "issue.rank", issueKey, after: change.issueKey },
  );
  const failures = rankFailures(response.body);
  if (failures !== null) {
    throw new JiraError({
      kind: "badRequest",
      messages: failures.length > 0 ? failures : [`Jira a refusé de classer ${issueKey}.`],
      fieldErrors: {},
    });
  }
}

/**
 * Messages des tickets refusés dans une réponse 207 (`entries[].status >= 400`), `null` si rien
 * n'a été refusé. La documentation décrit `errors` comme un tableau de chaînes ; un objet de
 * chaînes est aussi lu, par prudence.
 */
export function rankFailures(body: JsonValue | null): string[] | null {
  if (!isRecord(body) || !Array.isArray(body.entries)) return null;
  const failed = body.entries.filter(
    (entry) => isRecord(entry) && typeof entry.status === "number" && entry.status >= 400,
  );
  if (failed.length === 0) return null;
  return failed.flatMap((entry) => {
    const errors = isRecord(entry) ? entry.errors : null;
    const values = Array.isArray(errors) ? errors : isRecord(errors) ? Object.values(errors) : [];
    return values.filter((message): message is string => typeof message === "string");
  });
}

// ─── Rattachement à un objectif du texte du sprint ───────────────────────────

/**
 * Rattache (ou détache, `goalId` à `null`) un ticket à un objectif du TEXTE du sprint.
 *
 * Le lien est stocké dans la propriété d'entité du sprint, partagée avec l'app Mac. La
 * propriété est relue juste avant l'écriture et seule l'entrée du ticket change : ce que l'autre
 * application y a mis (Goals épinglés, liens d'autres tickets) est conservé. Le champ
 * « Objectif » du sprint, lui, n'est jamais touché.
 */
export async function linkToTextGoal(
  reader: WriteReader,
  writer: JiraWriter,
  input: {
    sprintId: number;
    issueKey: string;
    goalId: string | null;
    /** Objectifs affichés, tels que réconciliés à la dernière synchronisation. */
    goals: readonly SprintGoal[];
    accountId: string | null;
    now: Date;
  },
): Promise<void> {
  if (input.goalId !== null && !input.goals.some((goal) => goal.id === input.goalId)) {
    throw new Error("Cet objectif n'existe plus dans le sprint. Actualisez le board.");
  }
  const stored = await readStoredDocument(reader, input.sprintId);
  const document = withTextGoalLink(stored.document, input);
  await writer.write({
    kind: "sprintProperty.put",
    sprintId: input.sprintId,
    key: SPRINT_PROPERTY_KEYS.goals,
    value: documentValue(stored, document),
  });
}

/**
 * Document à écrire : le document lu dans Jira, avec les objectifs affichés (pour que leurs
 * identifiants restent stables) et le seul lien du ticket modifié.
 *
 * La couleur écrite est celle déjà présente dans Jira, à défaut la couleur par défaut de sa
 * position — jamais la couleur choisie localement, qui reste un réglage de ce navigateur.
 */
export function withTextGoalLink(
  fresh: SprintGoalDocument | null,
  input: {
    issueKey: string;
    goalId: string | null;
    goals: readonly SprintGoal[];
    accountId: string | null;
    now: Date;
  },
): SprintGoalDocument {
  const storedById = new Map((fresh?.goals ?? []).map((goal) => [goal.id, goal]));
  const goals = [...input.goals]
    .sort((a, b) => a.position - b.position)
    .map((goal) => {
      const stored = storedById.get(goal.id);
      return stored
        ? { ...stored, title: goal.title, position: goal.position }
        : makeSprintGoal({
            id: goal.id,
            title: goal.title,
            position: goal.position,
            color: goalColorName(goal.position),
          });
    });

  const validIds = new Set(goals.map((goal) => goal.id));
  const links: Record<string, string> = {};
  for (const [issueKey, goalId] of Object.entries(fresh?.links ?? {})) {
    // Un lien vers un objectif disparu du texte du sprint ne mène plus nulle part.
    if (validIds.has(goalId)) links[issueKey] = goalId;
  }
  if (input.goalId === null) delete links[input.issueKey];
  else links[input.issueKey] = input.goalId;

  return {
    version: fresh?.version ?? SPRINT_GOAL_DOCUMENT_VERSION,
    goals,
    links,
    atlassianGoalIds: [...(fresh?.atlassianGoalIds ?? [])],
    updatedAt: timestamp(input.now),
    updatedBy: input.accountId,
  };
}

// ─── Épinglage de Goals Atlassian au sprint ──────────────────────────────────

export type PinOutcome =
  /** Jira a confirmé l'enregistrement de la nouvelle sélection. */
  | { kind: "pinned"; goalIds: string[] }
  /** Jira porte déjà exactement cette sélection : rien n'a été écrit. */
  | { kind: "unchanged" }
  /** La sélection a changé dans Jira depuis son affichage : rien n'a été écrit. */
  | { kind: "conflict"; current: string[] };

/**
 * Épingle des Goals Atlassian au sprint, pour les afficher même sans ticket rattaché. Jira n'a
 * aucune relation native entre un sprint et un Goal : la sélection est enregistrée dans la
 * propriété d'entité du sprint, partagée avec l'app Mac. Le champ « Objectif » du sprint n'est
 * jamais touché. Portage de `SprintGoalStore.saveAtlassianSelection` (Mac), avec deux écarts
 * voulus :
 * - si la relecture de la propriété échoue, RIEN n'est écrit (le Mac écrivait alors un document
 *   privé de ses objectifs et de ses liens du mode texte) ;
 * - si la sélection relue n'est plus celle que l'utilisateur avait sous les yeux (`shownGoalIds`),
 *   rien n'est écrit : quelqu'un l'a modifiée entre-temps, on la relit plutôt que de l'écraser.
 * Seul `atlassianGoalIds` change : objectifs, liens du mode texte et clés inconnues sont gardés.
 */
export async function pinAtlassianGoals(
  reader: WriteReader,
  writer: JiraWriter,
  input: {
    sprintId: number;
    /** Sélection lue dans Jira quand l'utilisateur a commencé à la modifier. */
    shownGoalIds: readonly string[];
    goalIds: readonly string[];
    accountId: string | null;
    now: Date;
  },
): Promise<PinOutcome> {
  const goalIds = normalizedGoalIds(input.goalIds);
  const stored = await readStoredDocument(reader, input.sprintId);
  const current = [...(stored.document?.atlassianGoalIds ?? [])];
  if (!sameIds(current, normalizedGoalIds(input.shownGoalIds))) {
    return { kind: "conflict", current };
  }
  if (sameIds(current, goalIds)) return { kind: "unchanged" };

  const document = withPinnedGoals(stored.document, { ...input, goalIds });
  await writer.write({
    kind: "sprintProperty.put",
    sprintId: input.sprintId,
    key: SPRINT_PROPERTY_KEYS.goals,
    value: documentValue(stored, document),
  });
  return { kind: "pinned", goalIds };
}

/** Document à écrire : celui lu dans Jira, avec la seule sélection de Goals remplacée. */
export function withPinnedGoals(
  fresh: SprintGoalDocument | null,
  input: { goalIds: readonly string[]; accountId: string | null; now: Date },
): SprintGoalDocument {
  return {
    version: fresh?.version ?? SPRINT_GOAL_DOCUMENT_VERSION,
    goals: [...(fresh?.goals ?? [])],
    links: { ...(fresh?.links ?? {}) },
    atlassianGoalIds: normalizedGoalIds(input.goalIds),
    updatedAt: timestamp(input.now),
    updatedBy: input.accountId,
  };
}

/** Identifiants non vides, sans doublon, dans l'ordre choisi (il fixe l'ordre des swimlanes). */
function normalizedGoalIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id !== ""))];
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

// ─── Propriété d'entité du sprint ────────────────────────────────────────────

/** Clés du document connues de cette version. */
const DOCUMENT_KEYS = new Set([
  "version",
  "goals",
  "links",
  "atlassianGoalIds",
  "updatedAt",
  "updatedBy",
]);

interface StoredDocument {
  readonly document: SprintGoalDocument | null;
  /**
   * Clés que cette version ne connaît pas — ajoutées par une version plus récente de l'app Mac,
   * par exemple. Elles sont réécrites telles quelles : le document est partagé.
   */
  readonly unknownKeys: JsonObject;
}

/**
 * Relit la propriété juste avant de l'écrire. Une valeur qui n'est pas un objet JSON n'est pas
 * écrasée : on ne sait ni ce qu'elle contient, ni qui l'a posée.
 */
async function readStoredDocument(reader: WriteReader, sprintId: number): Promise<StoredDocument> {
  const stored = await reader.sprintProperty(sprintId, SPRINT_PROPERTY_KEYS.goals);
  if (stored === null) return { document: null, unknownKeys: {} };
  if (!isRecord(stored)) {
    throw new JiraError({
      kind: "decoding",
      context: "propriété des objectifs du sprint : objet JSON attendu, rien n'a été écrit",
      detail: Array.isArray(stored) ? "tableau" : typeof stored,
    });
  }
  const unknownKeys: JsonObject = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!DOCUMENT_KEYS.has(key)) unknownKeys[key] = value as JsonValue;
  }
  return { document: decodeSprintGoalDocument(stored), unknownKeys };
}

function documentValue(stored: StoredDocument, document: SprintGoalDocument): JsonObject {
  return { ...stored.unknownKeys, ...encodeSprintGoalDocument(document) };
}

/** Horodatage au format écrit par l'app Mac (ISO 8601, à la seconde). */
function timestamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}
