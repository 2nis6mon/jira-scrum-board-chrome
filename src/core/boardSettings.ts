import type { JiraField } from "../jira/client";
import {
  type BoardConfiguration,
  computedSwimlaneName,
  DEFAULT_BUILD_LABEL,
  type IssueCategory,
  MAX_DAILY_MINUTES,
  MAX_DAILY_STOCK,
  nextSwimlaneId,
  normalizeSwimlanes,
  swimlaneOfType,
  type TicketSwimlane,
} from "./boardConfiguration";
import { type CardField, cardFieldId, MAX_CARD_FIELDS } from "./cardFields";
import { moveAmongShown } from "./reorder";
import { foldText } from "./text";

// Transformations pures des réglages. Le modèle publie ensuite les changements partagés dans Jira.

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  GOAL: "Par objectif",
  SWIMLANE: "Swimlane par type",
  IGNORED: "Ignoré",
};

/** Rafraîchissements automatiques proposés, en secondes (`null` = désactivé). */
export const AUTO_REFRESH_CHOICES: readonly (number | null)[] = [null, 60, 120, 300];

// ─── Section Board : chaque réglage s'applique seul, dès qu'il est validé ────
//
// Chaque fonction part de la configuration QU'ON LUI DONNE (la plus récente au moment d'écrire) et
// ne touche qu'à son réglage : deux modifications rapprochées s'additionnent, et un type ou une
// swimlane disparus entre-temps (structure relue dans Jira) laissent la configuration intacte.

export type SettingResult =
  | { readonly ok: true; readonly configuration: BoardConfiguration }
  | { readonly ok: false; readonly error: string };

/**
 * Où ranger un type de ticket : par objectif, ignoré, dans une swimlane par type ou une nouvelle.
 * Une nouvelle swimlane peut recevoir son nom en même temps que son premier type (vide ou absent :
 * le nom suit ses types).
 */
export type TypeDestination =
  | { readonly kind: "goal" }
  | { readonly kind: "ignored" }
  | { readonly kind: "swimlane"; readonly swimlaneId: string }
  | { readonly kind: "newSwimlane"; readonly name?: string };

/** Le type est-il déjà rangé là ? (Une nouvelle swimlane n'est jamais celle d'un type.) */
export function isTypeIn(
  configuration: BoardConfiguration,
  typeId: string,
  destination: TypeDestination,
): boolean {
  const type = configuration.issueTypes.find((candidate) => candidate.id === typeId);
  if (!type) return false;
  switch (destination.kind) {
    case "goal":
      return type.category === "GOAL";
    case "ignored":
      return type.category === "IGNORED";
    case "swimlane":
      return swimlaneOfType(configuration, typeId)?.id === destination.swimlaneId;
    case "newSwimlane":
      return false;
  }
}

/**
 * Déplace un type de ticket. Une swimlane par type se crée en y mettant un premier type, et
 * disparaît avec son dernier type : sa place dans l'ordre et son repli sont alors oubliés. Un type
 * déposé là où il est déjà laisse la configuration telle quelle (même objet) : rien à écrire.
 */
export function withTypeDestination(
  configuration: BoardConfiguration,
  typeId: string,
  destination: TypeDestination,
): BoardConfiguration {
  if (!configuration.issueTypes.some((type) => type.id === typeId)) return configuration;
  if (isTypeIn(configuration, typeId, destination)) return configuration;
  const swimlanes: TicketSwimlane[] = configuration.ticketSwimlanes.map((swimlane) => ({
    ...swimlane,
    typeIds: swimlane.typeIds.filter((id) => id !== typeId),
  }));
  let category: IssueCategory;
  if (destination.kind === "swimlane") {
    const index = swimlanes.findIndex((swimlane) => swimlane.id === destination.swimlaneId);
    const target = swimlanes[index];
    if (!target) return configuration;
    swimlanes[index] = { ...target, typeIds: [...target.typeIds, typeId] };
    category = "SWIMLANE";
  } else if (destination.kind === "newSwimlane") {
    const created: TicketSwimlane = {
      id: nextSwimlaneId(configuration.ticketSwimlanes),
      name: "",
      typeIds: [typeId],
      hidden: false,
    };
    const name = (destination.name ?? "").trim();
    // Un nom identique au nom calculé n'est pas retenu : le nom suit alors ses types.
    swimlanes.push(
      name === computedSwimlaneName(configuration, created) ? created : { ...created, name },
    );
    category = "SWIMLANE";
  } else {
    category = destination.kind === "goal" ? "GOAL" : "IGNORED";
  }
  const issueTypes = configuration.issueTypes.map((type) =>
    type.id === typeId ? { ...type, category } : type,
  );
  const ticketSwimlanes = normalizeSwimlanes(issueTypes, swimlanes);
  const kept = new Set(ticketSwimlanes.map((swimlane) => `swimlane:${swimlane.id}`));
  const gone = (id: string) => id.startsWith("swimlane:") && !kept.has(id);
  return {
    ...configuration,
    issueTypes,
    ticketSwimlanes,
    blockOrder: configuration.blockOrder.filter((id) => !gone(id)),
    collapsedBlockIds: configuration.collapsedBlockIds.filter((id) => !gone(id)),
  };
}

/**
 * Nom d'une swimlane par type. Vide, ou identique au nom calculé : le nom suit ses types.
 */
export function withSwimlaneName(
  configuration: BoardConfiguration,
  swimlaneId: string,
  name: string,
): BoardConfiguration {
  return editSwimlane(configuration, swimlaneId, (swimlane) => {
    const trimmed = name.trim();
    return {
      ...swimlane,
      name: trimmed === computedSwimlaneName(configuration, swimlane) ? "" : trimmed,
    };
  });
}

export function withSwimlaneHidden(
  configuration: BoardConfiguration,
  swimlaneId: string,
  hidden: boolean,
): BoardConfiguration {
  return editSwimlane(configuration, swimlaneId, (swimlane) => ({ ...swimlane, hidden }));
}

function editSwimlane(
  configuration: BoardConfiguration,
  swimlaneId: string,
  edit: (swimlane: TicketSwimlane) => TicketSwimlane,
): BoardConfiguration {
  return {
    ...configuration,
    ticketSwimlanes: configuration.ticketSwimlanes.map((swimlane) =>
      swimlane.id === swimlaneId ? edit(swimlane) : swimlane,
    ),
  };
}

export function withBugType(
  configuration: BoardConfiguration,
  typeId: string,
  countsAsBug: boolean,
): BoardConfiguration {
  return {
    ...configuration,
    issueTypes: configuration.issueTypes.map((type) =>
      type.id === typeId ? { ...type, countsAsBug } : type,
    ),
  };
}

/** Nom du bloc Build ; vide = le nom par défaut. */
export function withBuildLabel(
  configuration: BoardConfiguration,
  label: string,
): BoardConfiguration {
  return { ...configuration, buildSectionLabel: label.trim() || DEFAULT_BUILD_LABEL };
}

/** Seuil « vieillissant » saisi : un entier de 1 à 365 jours. */
export function withAgingThreshold(configuration: BoardConfiguration, raw: string): SettingResult {
  const days = Number(raw.trim());
  if (raw.trim() === "" || !Number.isInteger(days) || days < 1 || days > 365) {
    return {
      ok: false,
      error: "Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.",
    };
  }
  return { ok: true, configuration: { ...configuration, agingThresholdDays: days } };
}

/** Durée du minuteur du mode Daily saisie : un entier de 1 à 120 minutes. */
export function withDailyMinutes(configuration: BoardConfiguration, raw: string): SettingResult {
  const minutes = Number(raw.trim());
  if (
    raw.trim() === "" ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > MAX_DAILY_MINUTES
  ) {
    return {
      ok: false,
      error: `La durée de la daily doit être un nombre entier de minutes, entre 1 et ${MAX_DAILY_MINUTES}.`,
    };
  }
  return { ok: true, configuration: { ...configuration, dailyMinutes: minutes } };
}

/** Cartes affichées en daily dans la première colonne d'une swimlane : un entier de 1 à 50. */
export function withDailyStockLimit(configuration: BoardConfiguration, raw: string): SettingResult {
  const count = Number(raw.trim());
  if (raw.trim() === "" || !Number.isInteger(count) || count < 1 || count > MAX_DAILY_STOCK) {
    return {
      ok: false,
      error: `Le nombre de cartes du stock en daily doit être un entier, entre 1 et ${MAX_DAILY_STOCK}.`,
    };
  }
  return { ok: true, configuration: { ...configuration, dailyStockLimit: count } };
}

/** Remet l'ordre des swimlanes à l'ordre d'arrivée des objectifs, Build et swimlanes par type en bas. */
export function withDefaultBlockOrder(configuration: BoardConfiguration): BoardConfiguration {
  return { ...configuration, blockOrder: [] };
}

// ─── Champs des cartes ───────────────────────────────────────────────────────

/** Champs personnalisés de l'instance, proposés comme champs de carte, triés par nom. */
export function customFieldChoices(fields: readonly JiraField[]): JiraField[] {
  return fields
    .filter((field) => field.id.startsWith("customfield_"))
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" }));
}

/** Recherche par nom (sans accents ni casse) ou par identifiant. Vide : rien n'est proposé. */
export function searchFields(search: string, fields: readonly JiraField[]): JiraField[] {
  const needle = foldText(search.trim());
  if (needle === "") return [];
  return fields.filter(
    (field) => foldText(field.name).includes(needle) || field.id.toLowerCase().includes(needle),
  );
}

/** Ajoute un champ en fin de liste, sans doublon ni dépassement du maximum. */
export function withCardField(fields: readonly CardField[], field: CardField): CardField[] {
  if (fields.length >= MAX_CARD_FIELDS) return [...fields];
  if (fields.some((existing) => cardFieldId(existing) === cardFieldId(field))) return [...fields];
  return [...fields, field];
}

/** Place le champ `id` juste avant le champ `before` (`null` : en dernier). */
export function moveCardField(
  fields: readonly CardField[],
  id: string,
  before: string | null,
): CardField[] {
  const byId = new Map(fields.map((field) => [cardFieldId(field), field]));
  return moveAmongShown([...byId.keys()], id, before, () => true).flatMap((fieldId) => {
    const field = byId.get(fieldId);
    return field ? [field] : [];
  });
}

export function sameCardFields(a: readonly CardField[], b: readonly CardField[]): boolean {
  const ids = b.map(cardFieldId);
  return a.length === b.length && a.every((field, index) => cardFieldId(field) === ids[index]);
}
