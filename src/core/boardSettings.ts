import type { JiraField } from "../jira/client";
import {
  type BoardConfiguration,
  type ColumnConfiguration,
  DEFAULT_BUILD_LABEL,
  type IssueCategory,
  type IssueTypeConfiguration,
} from "./boardConfiguration";
import { type CardField, cardFieldId, MAX_CARD_FIELDS } from "./cardFields";
import { foldText } from "./text";

// Réglages de la page « Réglages », portés de l'administration du Mac (`AdminView`,
// `CardFieldsAdminView`). Tous sont LOCAUX à ce navigateur : rien n'est écrit dans Jira.

export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  SCRUM: "Scrum",
  RUN: "RUN",
  IGNORED: "Ignoré",
};

/** Rafraîchissements automatiques proposés, en secondes (`null` = désactivé), comme le Mac. */
export const AUTO_REFRESH_CHOICES: readonly (number | null)[] = [null, 60, 120, 300];

// ─── Section Board : brouillon, validé puis appliqué d'un coup ───────────────

/**
 * Réglages de la section Board, modifiés en brouillon puis appliqués ensemble. Les autres
 * réglages (objectifs, couleurs, ordre, champs des cartes) n'en font pas partie : un brouillon
 * ouvert ne peut donc pas les écraser avec une copie périmée.
 */
export interface BoardSectionDraft {
  readonly scrumColumns: readonly ColumnConfiguration[];
  readonly runColumns: readonly ColumnConfiguration[];
  readonly issueTypes: readonly IssueTypeConfiguration[];
  readonly showRunSection: boolean;
  readonly buildSectionLabel: string;
  /** Saisie brute : validée à l'application. */
  readonly agingThresholdDays: string;
  readonly autoRefreshSeconds: number | null;
  /** Labels séparés par des virgules, tels que saisis. */
  readonly blockedLabels: string;
  /** Limites WIP saisies, par identifiant de colonne ; vide = aucune limite. */
  readonly wipLimits: Readonly<Record<string, string>>;
}

export function boardSectionDraft(configuration: BoardConfiguration): BoardSectionDraft {
  const wipLimits: Record<string, string> = {};
  const record = (columns: readonly ColumnConfiguration[], kind: "scrum" | "run") => {
    for (const column of columns) {
      wipLimits[wipKey(column, kind)] = column.wipLimit === null ? "" : String(column.wipLimit);
    }
  };
  record(configuration.scrumColumns, "scrum");
  record(configuration.runColumns, "run");
  return {
    scrumColumns: configuration.scrumColumns,
    runColumns: configuration.runColumns,
    issueTypes: configuration.issueTypes,
    showRunSection: configuration.showRunSection,
    buildSectionLabel: configuration.buildSectionLabel,
    agingThresholdDays: String(configuration.agingThresholdDays),
    autoRefreshSeconds: configuration.autoRefreshSeconds,
    blockedLabels: configuration.blockedLabels.join(", "),
    wipLimits,
  };
}

/** Clé d'une limite WIP : les colonnes Scrum et RUN peuvent partager un identifiant. */
export function wipKey(column: ColumnConfiguration, kind: "scrum" | "run"): string {
  return `${kind}:${column.id}`;
}

export type BoardSectionResult =
  | { readonly ok: true; readonly configuration: BoardConfiguration }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Valide le brouillon et le reporte sur la configuration ACTUELLE (pas sur une copie ancienne). */
export function applyBoardSection(
  configuration: BoardConfiguration,
  draft: BoardSectionDraft,
): BoardSectionResult {
  const ids = (items: readonly { id: string }[]) => items.map((item) => item.id).join("\n");
  if (
    ids(draft.scrumColumns) !== ids(configuration.scrumColumns) ||
    ids(draft.runColumns) !== ids(configuration.runColumns) ||
    ids(draft.issueTypes) !== ids(configuration.issueTypes)
  ) {
    return {
      ok: false,
      errors: [
        "Les colonnes ou les types du board ont été relus dans Jira depuis l'ouverture de ce brouillon. Annulez-le, puis refaites vos réglages.",
      ],
    };
  }

  const errors: string[] = [];

  const aging = Number(draft.agingThresholdDays.trim());
  if (!Number.isInteger(aging) || aging < 1 || aging > 365) {
    errors.push("Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.");
  }

  const savedName = new Map(
    [...configuration.scrumColumns, ...configuration.runColumns].map((c) => [c.id, c.name]),
  );
  const withWip = (columns: readonly ColumnConfiguration[], kind: "scrum" | "run") =>
    columns.map((column) => {
      const raw = (draft.wipLimits[wipKey(column, kind)] ?? "").trim();
      if (raw === "") return { ...column, wipLimit: null };
      const limit = Number(raw);
      if (!Number.isInteger(limit) || limit < 1 || limit > 999) {
        errors.push(
          `La limite WIP de « ${savedName.get(column.id) ?? column.name} » doit être un entier entre 1 et 999, ou vide.`,
        );
        return column;
      }
      return { ...column, wipLimit: limit };
    });
  const scrumColumns = withWip(draft.scrumColumns, "scrum");
  const runColumns = withWip(draft.runColumns, "run");

  for (const column of [...scrumColumns, ...runColumns]) {
    if (column.name.trim() === "") errors.push("Chaque colonne doit garder un nom.");
  }

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  return {
    ok: true,
    configuration: {
      ...configuration,
      scrumColumns: scrumColumns.map((column) => ({ ...column, name: column.name.trim() })),
      runColumns: runColumns.map((column) => ({ ...column, name: column.name.trim() })),
      issueTypes: draft.issueTypes,
      showRunSection: draft.showRunSection,
      buildSectionLabel: draft.buildSectionLabel.trim() || DEFAULT_BUILD_LABEL,
      agingThresholdDays: aging,
      autoRefreshSeconds: draft.autoRefreshSeconds,
      blockedLabels: parseLabels(draft.blockedLabels),
    },
  };
}

/** Le brouillon diffère-t-il de ce qui est enregistré ? */
export function isBoardSectionChanged(
  configuration: BoardConfiguration,
  draft: BoardSectionDraft,
): boolean {
  return JSON.stringify(boardSectionDraft(configuration)) !== JSON.stringify(draft);
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

/** Remet l'ordre des swimlanes à l'ordre d'arrivée des objectifs, Build et RUN en bas. */
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
