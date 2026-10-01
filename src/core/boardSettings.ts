import type { JiraField } from "../jira/client";
import {
  type BoardConfiguration,
  type ColumnConfiguration,
  computedSwimlaneName,
  DEFAULT_BUILD_LABEL,
  type IssueCategory,
  MAX_DAILY_MINUTES,
  MAX_DAILY_STOCK,
  nextSwimlaneId,
  normalizeSwimlanes,
  type TicketSwimlane,
} from "./boardConfiguration";
import { type CardField, cardFieldId, MAX_CARD_FIELDS } from "./cardFields";
import { foldText } from "./text";

// Réglages de l'administration, portés de l'administration du Mac (`AdminView`,
// `CardFieldsAdminView`). Tous sont LOCAUX à ce navigateur : rien n'est écrit dans Jira.

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  GOAL: "Par objectif",
  SWIMLANE: "Swimlane par type",
  IGNORED: "Ignoré",
};

/** Rafraîchissements automatiques proposés, en secondes (`null` = désactivé), comme le Mac. */
export const AUTO_REFRESH_CHOICES: readonly (number | null)[] = [null, 60, 120, 300];

// ─── Section Board : chaque réglage s'applique seul, dès qu'il est validé ────
//
// Chaque fonction part de la configuration QU'ON LUI DONNE (la plus récente au moment d'écrire) et
// ne touche qu'à son réglage : deux modifications rapprochées s'additionnent, et une colonne ou un
// type disparu entre-temps (structure relue dans Jira) laisse la configuration intacte.

export type SettingResult =
  | { readonly ok: true; readonly configuration: BoardConfiguration }
  | { readonly ok: false; readonly error: string };

function editColumn(
  configuration: BoardConfiguration,
  columnId: string,
  parts: Partial<ColumnConfiguration>,
): BoardConfiguration {
  return {
    ...configuration,
    columns: configuration.columns.map((column) =>
      column.id === columnId ? { ...column, ...parts } : column,
    ),
  };
}

function columnName(configuration: BoardConfiguration, columnId: string) {
  return configuration.columns.find((column) => column.id === columnId)?.name ?? columnId;
}

export function withColumnName(
  configuration: BoardConfiguration,
  columnId: string,
  name: string,
): SettingResult {
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, error: "Chaque colonne doit garder un nom." };
  return { ok: true, configuration: editColumn(configuration, columnId, { name: trimmed }) };
}

export function withColumnHidden(
  configuration: BoardConfiguration,
  columnId: string,
  hidden: boolean,
): BoardConfiguration {
  return editColumn(configuration, columnId, { hidden });
}

/** Limite WIP saisie : vide = aucune limite, sinon un entier de 1 à 999. */
export function withWipLimit(
  configuration: BoardConfiguration,
  columnId: string,
  raw: string,
): SettingResult {
  const text = raw.trim();
  if (text === "") {
    return {
      ok: true,
      configuration: editColumn(configuration, columnId, { wipLimit: null }),
    };
  }
  const limit = Number(text);
  if (!Number.isInteger(limit) || limit < 1 || limit > 999) {
    return {
      ok: false,
      error: `La limite WIP de « ${columnName(configuration, columnId)} » doit être un entier entre 1 et 999, ou vide.`,
    };
  }
  return {
    ok: true,
    configuration: editColumn(configuration, columnId, { wipLimit: limit }),
  };
}

/** Où ranger un type de ticket : par objectif, ignoré, dans une swimlane par type ou une nouvelle. */
export type TypeDestination =
  | { readonly kind: "goal" }
  | { readonly kind: "ignored" }
  | { readonly kind: "swimlane"; readonly swimlaneId: string }
  | { readonly kind: "newSwimlane" };

/**
 * Déplace un type de ticket. Une swimlane par type se crée en y mettant un premier type, et
 * disparaît avec son dernier type : sa place dans l'ordre et son repli sont alors oubliés.
 */
export function withTypeDestination(
  configuration: BoardConfiguration,
  typeId: string,
  destination: TypeDestination,
): BoardConfiguration {
  if (!configuration.issueTypes.some((type) => type.id === typeId)) return configuration;
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
    swimlanes.push({
      id: nextSwimlaneId(configuration.ticketSwimlanes),
      name: "",
      typeIds: [typeId],
      hidden: false,
    });
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

/** Labels de blocage saisis, séparés par des virgules. */
export function withBlockedLabels(
  configuration: BoardConfiguration,
  raw: string,
): BoardConfiguration {
  return { ...configuration, blockedLabels: parseLabels(raw) };
}

/** Labels séparés par des virgules, sans vide ni doublon (à la casse près, comme Jira). */
export function parseLabels(text: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of text.split(",")) {
    const label = raw.trim();
    if (label === "" || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    labels.push(label);
  }
  return labels;
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

/** Déplace le champ d'un rang (`-1` monte, `+1` descend), sans sortir de la liste. */
export function shiftCardField(fields: readonly CardField[], index: number, offset: number) {
  const to = index + offset;
  if (index < 0 || index >= fields.length || to < 0 || to >= fields.length) return [...fields];
  const result = [...fields];
  const [moved] = result.splice(index, 1);
  if (moved) result.splice(to, 0, moved);
  return result;
}

export function sameCardFields(a: readonly CardField[], b: readonly CardField[]): boolean {
  const ids = b.map(cardFieldId);
  return a.length === b.length && a.every((field, index) => cardFieldId(field) === ids[index]);
}
