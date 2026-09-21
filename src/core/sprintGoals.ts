import { isRecord, type JsonObject } from "../jira/json";

/**
 * Un objectif de sprint tel que manipulé par l'application.
 *
 * Rappel de la contrainte réelle (docs/reference-app-mac/ATLASSIAN-API-CAPABILITIES.md) : Jira
 * ne connaît qu'UN SEUL champ texte `goal` par sprint. En mode « texte du sprint », les objectifs
 * sont les lignes de ce champ — lu, jamais écrit — et leurs identifiants stables sont conservés
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
 * Contenu de la propriété d'entité `com.scrumboardmac.sprintgoals.v1`, PARTAGÉE avec l'app Mac :
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

/** Forme JSON écrite dans Jira. Les champs vides sont omis, comme le fait l'app Mac. */
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

// ─── Champ texte natif `sprint.goal` ─────────────────────────────────────────

/** Préfixes décoratifs couramment utilisés par les équipes dans le champ Jira. */
const BULLET_PREFIXES = ["🎯", "-", "–", "—", "*", "•", "‣"];

/**
 * Découpe le champ natif en titres d'objectifs : une ligne non vide = un objectif.
 *
 * Il n'existe volontairement pas de fonction inverse : le champ appartient à l'équipe et
 * l'application ne le réécrit jamais.
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
  newId: () => string = () => crypto.randomUUID(),
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
        makeSprintGoal({ id: newId(), title, color: goalColorName(index), position: index }),
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
