import type { JiraClient } from "../jira/client";
import { isRecord, type JsonObject } from "../jira/json";
import type { JiraTransport } from "../jira/transport";
import { buildWriteRequest, SPRINT_PROPERTY_KEYS } from "../jira/writes";
import { CoreError } from "./reasons";

/**
 * Un objectif de sprint tel que manipulé par l'application.
 *
 * Rappel de la contrainte réelle (docs/technique/integration-jira.md, section Contrats API) : Jira
 * ne connaît qu'UN SEUL champ texte `goal` par sprint. En mode « texte du sprint », les objectifs
 * sont les lignes de ce champ et leurs identifiants stables sont conservés
 * dans une propriété d'entité du sprint, c'est-à-dire un stockage Jira officiel.
 */
export interface SprintGoal {
  readonly id: string;
  readonly title: string;
  readonly color: string;
  readonly position: number;
  /** Identifiant du véritable objet Goal Atlassian. `null` pour une ligne du champ texte. */
  readonly atlassianGoalId: string | null;
  /** Clé lisible du Goal Atlassian, utilisée dans les requêtes JQL `goals = …`. */
  readonly atlassianKey: string | null;
  /** Statut du Goal tel que déclaré par Atlassian. Jamais calculé par l'application. */
  readonly atlassianStatus: string | null;
  /** Page du Goal dans Atlassian. */
  readonly atlassianUrl: string | null;
}

export function makeSprintGoal(
  goal: Pick<SprintGoal, "id" | "title" | "position"> & Partial<SprintGoal>,
): SprintGoal {
  return {
    color: DEFAULT_GOAL_COLOR,
    atlassianGoalId: null,
    atlassianKey: null,
    atlassianStatus: null,
    atlassianUrl: null,
    ...goal,
  };
}

/** Terme à utiliser dans une requête `goals = …`. */
export function jqlReference(goal: SprintGoal): string | null {
  return goal.atlassianKey ?? goal.atlassianGoalId;
}

// ─── Couleurs des objectifs ──────────────────────────────────────────────────

/** Le cœur ne manipule que des noms stables `goal1` … `goal9` ; les valeurs sont dans le thème. */
export const GOAL_COLOR_COUNT = 9;
export const DEFAULT_GOAL_COLOR = "goal1";

export function goalColorName(index: number): string {
  return `goal${(Math.max(0, index) % GOAL_COLOR_COUNT) + 1}`;
}

/**
 * Couleur de chaque objectif, stable dans le temps.
 *
 * Un objectif déjà coloré garde sa couleur, même s'il disparaît puis revient au sprint suivant.
 * Un nouvel objectif reçoit, dans l'ordre d'apparition, la première couleur que n'utilise aucun
 * des objectifs affichés ; quand toutes sont prises, les couleurs recommencent.
 */
export function assignGoalColors(
  goalIds: readonly string[],
  existing: Readonly<Record<string, number>>,
): Record<string, number> {
  const result: Record<string, number> = { ...existing };
  const used = new Set<number>();
  for (const id of goalIds) {
    const index = existing[id];
    if (index !== undefined) used.add(index);
  }

  let next = 0;
  for (const id of goalIds) {
    if (result[id] !== undefined) continue;
    let index = -1;
    for (let candidate = 0; candidate < GOAL_COLOR_COUNT; candidate++) {
      if (!used.has(candidate)) {
        index = candidate;
        break;
      }
    }
    if (index < 0) {
      index = next % GOAL_COLOR_COUNT;
      next += 1;
    }
    result[id] = index;
    used.add(index);
  }
  return result;
}

// ─── Propriété d'entité du sprint ────────────────────────────────────────────

/**
 * Contenu de la propriété d'entité `com.scrumboardmac.sprintgoals.v1`, conservée entre versions :
 * son format ne doit pas diverger.
 */
export interface SprintGoalDocument {
  readonly version: number;
  readonly goals: readonly SprintGoal[];
  /**
   * Rattachement ticket → identifiant d'objectif, en mode « texte du sprint » uniquement. En
   * mode Goals Atlassian, le rattachement est un lien Jira natif : rien n'est stocké ici.
   */
  readonly links: Readonly<Record<string, string>>;
  /**
   * Objets Goal Atlassian épinglés à ce sprint. Jira n'a aucune relation native entre un sprint
   * et un Goal : cette sélection est la seule donnée applicative du dispositif.
   */
  readonly atlassianGoalIds: readonly string[];
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

export const SPRINT_GOAL_DOCUMENT_VERSION = 1;

export function makeSprintGoalDocument(
  parts: Partial<SprintGoalDocument> = {},
): SprintGoalDocument {
  return {
    version: SPRINT_GOAL_DOCUMENT_VERSION,
    goals: [],
    links: {},
    atlassianGoalIds: [],
    updatedAt: null,
    updatedBy: null,
    ...parts,
  };
}

/** Lecture tolérante : un champ absent ou mal formé prend sa valeur par défaut. */
export function decodeSprintGoalDocument(value: unknown): SprintGoalDocument {
  if (!isRecord(value)) return makeSprintGoalDocument();

  const goals: SprintGoal[] = [];
  if (Array.isArray(value.goals)) {
    for (const item of value.goals) {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.title !== "string")
        continue;
      goals.push(
        makeSprintGoal({
          id: item.id,
          title: item.title,
          position: typeof item.position === "number" ? item.position : goals.length,
          color: typeof item.color === "string" ? item.color : DEFAULT_GOAL_COLOR,
          atlassianGoalId: optionalText(item.atlassianGoalId),
          atlassianKey: optionalText(item.atlassianKey),
          atlassianStatus: optionalText(item.atlassianStatus),
          atlassianUrl: optionalText(item.atlassianURL),
        }),
      );
    }
  }

  const links: Record<string, string> = {};
  if (isRecord(value.links)) {
    for (const [issueKey, goalId] of Object.entries(value.links)) {
      if (typeof goalId === "string") links[issueKey] = goalId;
    }
  }

  return {
    version: typeof value.version === "number" ? value.version : SPRINT_GOAL_DOCUMENT_VERSION,
    goals,
    links,
    atlassianGoalIds: Array.isArray(value.atlassianGoalIds)
      ? value.atlassianGoalIds.filter((id): id is string => typeof id === "string")
      : [],
    updatedAt: optionalText(value.updatedAt),
    updatedBy: optionalText(value.updatedBy),
  };
}

/** Forme JSON écrite dans Jira. Les champs vides sont omis. */
export function encodeSprintGoalDocument(document: SprintGoalDocument): JsonObject {
  const encoded: JsonObject = {
    version: document.version,
    goals: document.goals.map((goal) => {
      const item: JsonObject = {
        id: goal.id,
        title: goal.title,
        color: goal.color,
        position: goal.position,
      };
      if (goal.atlassianGoalId !== null) item.atlassianGoalId = goal.atlassianGoalId;
      if (goal.atlassianKey !== null) item.atlassianKey = goal.atlassianKey;
      if (goal.atlassianStatus !== null) item.atlassianStatus = goal.atlassianStatus;
      if (goal.atlassianUrl !== null) item.atlassianURL = goal.atlassianUrl;
      return item;
    }),
    links: { ...document.links },
    atlassianGoalIds: [...document.atlassianGoalIds],
  };
  if (document.updatedAt !== null) encoded.updatedAt = document.updatedAt;
  if (document.updatedBy !== null) encoded.updatedBy = document.updatedBy;
  return encoded;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// ─── Mise à jour de la propriété (seul écrivain de `sprintgoals.v1`) ─────────

/** Lecture de la propriété dont la mise à jour a besoin. `JiraClient` la fournit. */
export type SprintGoalPropertyReader = Pick<JiraClient, "sprintProperty">;
/** Seule porte d'écriture : l'inventaire fermé de `writes.ts`. */
export type SprintGoalPropertyWriter = Pick<JiraTransport, "write">;

/** Clés du document connues de cette version. Les autres sont conservées telles quelles. */
const DOCUMENT_KEYS = new Set([
  "version",
  "goals",
  "links",
  "atlassianGoalIds",
  "updatedAt",
  "updatedBy",
]);
/** Clés d'un objectif connues de cette version. Les autres sont conservées, par `id`. */
const GOAL_KEYS = new Set([
  "id",
  "title",
  "color",
  "position",
  "atlassianGoalId",
  "atlassianKey",
  "atlassianStatus",
  "atlassianURL",
]);

/** Lecture stricte, avant toute écriture : une donnée qu'on ne comprend pas n'est jamais écrasée. */
export type StrictSprintGoalRead =
  /** Propriété absente du sprint. */
  | { kind: "absent" }
  | { kind: "document"; raw: JsonObject; document: SprintGoalDocument }
  /** Valeur qui n'est pas un objet JSON, version inconnue ou champ connu mal formé. */
  | { kind: "unreadable"; reason: "notObject" | "unknownFormat"; detail: string };

export function readSprintGoalProperty(raw: unknown): StrictSprintGoalRead {
  if (raw === null || raw === undefined) return { kind: "absent" };
  if (!isRecord(raw)) {
    return {
      kind: "unreadable",
      reason: "notObject",
      detail: Array.isArray(raw) ? "tableau" : typeof raw,
    };
  }
  const malformed =
    (raw.version !== undefined && raw.version !== SPRINT_GOAL_DOCUMENT_VERSION) ||
    (raw.atlassianGoalIds !== undefined &&
      (!Array.isArray(raw.atlassianGoalIds) ||
        raw.atlassianGoalIds.some((id) => typeof id !== "string"))) ||
    (raw.goals !== undefined &&
      (!Array.isArray(raw.goals) ||
        raw.goals.some(
          (goal) =>
            !isRecord(goal) || typeof goal.id !== "string" || typeof goal.title !== "string",
        ))) ||
    (raw.links !== undefined &&
      (!isRecord(raw.links) || Object.values(raw.links).some((id) => typeof id !== "string")));
  if (malformed) {
    return {
      kind: "unreadable",
      reason: "unknownFormat",
      detail: raw.version === undefined ? "champ mal formé" : `version ${String(raw.version)}`,
    };
  }
  return { kind: "document", raw: raw as JsonObject, document: decodeSprintGoalDocument(raw) };
}

/** Erreur levée quand la propriété relue ne peut pas être mise à jour sans risque. */
function unreadableError(read: Extract<StrictSprintGoalRead, { kind: "unreadable" }>): CoreError {
  return new CoreError({ code: "sprintGoalsUnreadable", reason: read.reason });
}

/**
 * Forme JSON à écrire : le document encodé, posé sur la valeur brute relue dans Jira. Les clés
 * inconnues sont gardées à la racine et dans chaque objectif (retrouvé par son `id`) ; les clés
 * connues sont celles du document, un champ vide disparaît.
 */
export function encodeSprintGoalPropertyOver(
  raw: JsonObject | null,
  document: SprintGoalDocument,
): JsonObject {
  const encoded = encodeSprintGoalDocument(document);
  const rawGoals = new Map<string, JsonObject>();
  for (const item of raw && Array.isArray(raw.goals) ? raw.goals : []) {
    if (isRecord(item) && typeof item.id === "string" && !rawGoals.has(item.id))
      rawGoals.set(item.id, item as JsonObject);
  }
  const goals = (encoded.goals as JsonObject[]).map((goal) => {
    const previous = rawGoals.get(goal.id as string);
    return previous ? { ...unknownEntries(previous, GOAL_KEYS), ...goal } : goal;
  });
  return { ...(raw ? unknownEntries(raw, DOCUMENT_KEYS) : {}), ...encoded, goals };
}

function unknownEntries(value: JsonObject, known: ReadonlySet<string>): JsonObject {
  const kept: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!known.has(key)) kept[key] = entry;
  }
  return kept;
}

/** Horodatage persisté par tous les écrivains : ISO 8601, à la seconde. */
export function sprintGoalTimestamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Deux valeurs de la propriété portent-elles le même contenu, horodatage et auteur mis à part ?
 * Les deux sont normalisées par le même encodage : une propriété absente vaut un document vide.
 */
export function sameSprintGoalContent(a: unknown, b: unknown): boolean {
  const normalized = (value: unknown): string | null => {
    const read = readSprintGoalProperty(value);
    if (read.kind === "unreadable") return null;
    const raw = read.kind === "document" ? read.raw : null;
    const document = read.kind === "document" ? read.document : makeSprintGoalDocument();
    return contentKey(encodeSprintGoalPropertyOver(raw, document));
  };
  const left = normalized(a);
  return left !== null && left === normalized(b);
}

function contentKey(value: JsonObject): string {
  const { updatedAt: _at, updatedBy: _by, ...content } = value;
  return stableJson(content);
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

export interface SprintGoalUpdate {
  readonly sprintId: number;
  /**
   * Vrai si la zone que l'appelant modifie n'a pas changé depuis sa lecture de base. Reçoit le
   * document frais décodé (`null` : propriété absente) et sa valeur brute.
   */
  readonly unchangedSince: (fresh: SprintGoalDocument | null, raw: JsonObject | null) => boolean;
  /** Mutation pure du document frais (`null` : propriété absente). */
  readonly mutate: (fresh: SprintGoalDocument | null) => SprintGoalDocument;
  readonly accountId: string | null;
  readonly now: Date;
}

export type PreparedSprintGoalUpdate =
  /** La zone modifiée a changé depuis la lecture de base : `mutate` n'a pas été appelée. */
  | { kind: "conflict"; fresh: SprintGoalDocument | null }
  /** Valeur à écrire, déjà validée ; `changed` faux si Jira porte déjà ce contenu. */
  | { kind: "ready"; value: JsonObject; document: SprintGoalDocument; changed: boolean };

/**
 * Prépare la mise à jour sur la valeur brute relue, sans rien écrire : lecture stricte (lève une
 * erreur de décodage si la propriété est illisible ou d'une version inconnue), contrôle de la zone
 * modifiée, mutation, horodatage, encodage conservant les inconnus et validation de la requête
 * (taille comprise).
 */
export function prepareSprintGoalUpdate(
  raw: unknown,
  input: SprintGoalUpdate,
): PreparedSprintGoalUpdate {
  const read = readSprintGoalProperty(raw);
  if (read.kind === "unreadable") throw unreadableError(read);
  const freshRaw = read.kind === "document" ? read.raw : null;
  const fresh = read.kind === "document" ? read.document : null;
  if (!input.unchangedSince(fresh, freshRaw)) return { kind: "conflict", fresh };

  const document: SprintGoalDocument = {
    ...input.mutate(fresh),
    version: SPRINT_GOAL_DOCUMENT_VERSION,
    updatedAt: sprintGoalTimestamp(input.now),
    updatedBy: input.accountId,
  };
  const value = encodeSprintGoalPropertyOver(freshRaw, document);
  buildWriteRequest({
    kind: "sprintProperty.put",
    sprintId: input.sprintId,
    key: SPRINT_PROPERTY_KEYS.goals,
    value,
  });
  const before = encodeSprintGoalPropertyOver(freshRaw, fresh ?? makeSprintGoalDocument());
  return { kind: "ready", value, document, changed: contentKey(value) !== contentKey(before) };
}

export type SprintGoalUpdateOutcome =
  | { kind: "conflict"; fresh: SprintGoalDocument | null }
  /** Jira porte déjà ce contenu : rien n'a été écrit. */
  | { kind: "unchanged"; value: JsonObject; document: SprintGoalDocument }
  /** Écrit une fois ; la valeur envoyée est renvoyée pour une éventuelle relecture de contrôle. */
  | { kind: "written"; value: JsonObject; document: SprintGoalDocument };

/**
 * Seule mise à jour de `com.scrumboardmac.sprintgoals.v1` : relecture juste avant l'écriture,
 * refus si la zone modifiée a changé (fusion sur le document frais sinon), une seule écriture,
 * jamais rejouée. Une relecture impossible ou une propriété illisible n'écrit rien.
 */
export async function updateSprintGoalProperty(
  reader: SprintGoalPropertyReader,
  writer: SprintGoalPropertyWriter,
  input: SprintGoalUpdate,
): Promise<SprintGoalUpdateOutcome> {
  const raw = await reader.sprintProperty(input.sprintId, SPRINT_PROPERTY_KEYS.goals);
  const prepared = prepareSprintGoalUpdate(raw, input);
  if (prepared.kind === "conflict") return prepared;
  const { value, document } = prepared;
  if (!prepared.changed) return { kind: "unchanged", value, document };
  await writer.write({
    kind: "sprintProperty.put",
    sprintId: input.sprintId,
    key: SPRINT_PROPERTY_KEYS.goals,
    value,
  });
  return { kind: "written", value, document };
}

// ─── Champ texte natif `sprint.goal` ─────────────────────────────────────────

/** Préfixes décoratifs couramment utilisés par les équipes dans le champ Jira. */
const BULLET_PREFIXES = ["🎯", "-", "–", "—", "*", "•", "‣"];

/**
 * Découpe le champ natif en titres d'objectifs : une ligne non vide = un objectif.
 *
 * La lecture du board n'écrit jamais ce champ. Sa publication explicite vers un sprint futur
 * appartient au module Sprint Planning.
 */
export function parseSprintGoalText(raw: string | null | undefined): string[] {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(/\r\n|\r|\n|\p{Zl}|\p{Zp}/u)
    .map(cleanGoalLine)
    .filter((line) => line !== "");
}

function cleanGoalLine(line: string): string {
  let text = line.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of BULLET_PREFIXES) {
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trim();
        changed = true;
      }
    }
    // Puces numérotées : « 1. », « 2) »
    const numbered = /^\d+[.)]\s*/.exec(text);
    if (numbered) {
      text = text.slice(numbered[0].length).trim();
      changed = true;
    }
  }
  return text;
}

// ─── Réconciliation ──────────────────────────────────────────────────────────

/** Résultat de la réconciliation entre le champ natif et la propriété d'entité. */
export interface ReconciledGoals {
  readonly goals: SprintGoal[];
  readonly links: Record<string, string>;
  /**
   * Vrai si la propriété d'entité ne correspond plus au champ natif (quelqu'un a modifié
   * l'objectif directement dans Jira). Elle ne sera réécrite que sur un geste de l'utilisateur.
   */
  readonly propertyNeedsUpdate: boolean;
}

/**
 * Le champ natif Jira fait foi pour la PRÉSENCE et le LIBELLÉ des objectifs ; la propriété
 * d'entité fournit les identifiants stables, l'ordre et les liens.
 *
 * Conséquence voulue : si un Scrum Master modifie l'objectif dans Jira, l'application s'aligne
 * sur Jira — jamais l'inverse.
 */
export function reconcileSprintGoals(
  nativeGoalText: string | null | undefined,
  document: SprintGoalDocument | null,
  newId: (title: string) => string = () => crypto.randomUUID(),
): ReconciledGoals {
  const titles = parseSprintGoalText(nativeGoalText);
  const stored = document?.goals ?? [];
  const storedLinks = document?.links ?? {};

  // Aucun objectif dans Jira : tout objectif encore stocké est obsolète.
  if (titles.length === 0) {
    const needsUpdate = stored.length > 0 || Object.keys(storedLinks).length > 0;
    return { goals: [], links: {}, propertyNeedsUpdate: needsUpdate };
  }

  const remaining = [...stored];
  const goals: SprintGoal[] = [];
  let changed = false;

  titles.forEach((title, index) => {
    const matchIndex = remaining.findIndex((goal) => goal.title === title);
    const match = matchIndex >= 0 ? remaining.splice(matchIndex, 1)[0] : undefined;
    if (match) {
      if (match.position !== index) changed = true;
      goals.push({ ...match, position: index });
    } else {
      // Objectif ajouté dans Jira : on lui crée un identifiant stable.
      goals.push(
        makeSprintGoal({ id: newId(title), title, color: goalColorName(index), position: index }),
      );
      changed = true;
    }
  });

  // Objectifs disparus du champ natif : supprimés dans Jira, donc supprimés ici.
  if (remaining.length > 0) changed = true;

  const validIds = new Set(goals.map((goal) => goal.id));
  const links: Record<string, string> = {};
  for (const [issueKey, goalId] of Object.entries(storedLinks)) {
    if (validIds.has(goalId)) links[issueKey] = goalId;
    else changed = true;
  }

  return { goals, links, propertyNeedsUpdate: changed };
}

/**
 * Identifiants des objectifs du texte que la propriété du sprint ne connaît pas encore. Ils sont
 * déduits du sprint et du libellé : identiques d'une lecture à l'autre, ils permettent à un
 * ticket d'un autre sprint du board de s'y rattacher avant que cette propriété ne soit écrite.
 */
export function stableGoalIds(sprintId: number): (title: string) => string {
  const used = new Set<string>();
  return (title) => {
    const base = `text-${sprintId}-${titleHash(title)}`;
    let id = base;
    for (let occurrence = 2; used.has(id); occurrence++) id = `${base}-${occurrence}`;
    used.add(id);
    return id;
  };
}

/** Empreinte FNV-1a 32 bits, en base 36 : courte et stable, sans portée cryptographique. */
function titleHash(text: string): string {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Objectifs réunis de plusieurs sprints du board. */
export interface ReconciledSprintsGoals {
  /** Objectifs de chaque sprint dans l'ordre des sprints, positions numérotées à la suite. */
  readonly goals: SprintGoal[];
  readonly links: Record<string, string>;
  /** Sprint de chaque objectif. */
  readonly goalSprintOf: Record<string, number>;
}

/**
 * Réconcilie chaque sprint avec sa propriété, puis réunit objectifs et liens. Un lien peut viser
 * l'objectif de n'importe quel sprint réuni ; pour un ticket noté dans plusieurs propriétés, celle
 * de son propre sprint fait foi, sinon la première dans l'ordre des sprints.
 */
export function reconcileSprintsGoals(
  sprints: readonly {
    sprintId: number;
    nativeGoalText: string | null | undefined;
    document: SprintGoalDocument | null;
  }[],
  sprintOfIssue: (issueKey: string) => number | null,
): ReconciledSprintsGoals {
  const goals: SprintGoal[] = [];
  const goalSprintOf: Record<string, number> = {};
  for (const sprint of sprints) {
    const reconciled = reconcileSprintGoals(
      sprint.nativeGoalText,
      sprint.document,
      stableGoalIds(sprint.sprintId),
    );
    for (const goal of reconciled.goals) {
      goals.push({ ...goal, position: goals.length });
      goalSprintOf[goal.id] = sprint.sprintId;
    }
  }

  const links: Record<string, string> = {};
  const fromOwnSprint = new Set<string>();
  for (const sprint of sprints) {
    for (const [issueKey, goalId] of Object.entries(sprint.document?.links ?? {})) {
      // Un lien vers un objectif disparu ne mène plus nulle part.
      if (goalSprintOf[goalId] === undefined || fromOwnSprint.has(issueKey)) continue;
      const own = sprintOfIssue(issueKey) === sprint.sprintId;
      if (own || links[issueKey] === undefined) links[issueKey] = goalId;
      if (own) fromOwnSprint.add(issueKey);
    }
  }
  return { goals, links, goalSprintOf };
}
