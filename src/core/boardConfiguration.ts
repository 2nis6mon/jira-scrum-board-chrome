import type { JiraBoardStructure } from "../jira/client";
import type { JiraIssueType, JiraStatus } from "../jira/models";
import { isDoneStatus } from "../jira/models";
import { type BoardBlock, blockIdentifier } from "./boardBlocks";
import { type CardColorRule, withBuiltInRules } from "./cardColors";
import { type CardField, MAX_CARD_FIELDS } from "./cardFields";
import { foldText } from "./text";

/** Classement d'un type de ticket Jira dans l'application. */
export type IssueCategory = "SCRUM" | "RUN" | "IGNORED";

/** Colonne affichée par l'application, adossée à des statuts Jira réels. */
export interface ColumnConfiguration {
  readonly id: string;
  /** Libellé affiché. Par défaut celui du board Jira. */
  readonly name: string;
  /** Statuts Jira regroupés dans cette colonne (identifiants Jira). */
  readonly statusIds: readonly string[];
  readonly position: number;
  readonly hidden: boolean;
  /** Limite WIP. Reprise de `columns[].max` du board Jira, surchargeable. */
  readonly wipLimit: number | null;
  /** Vrai si tous les statuts de la colonne sont de catégorie « done ». */
  readonly isDone: boolean;
}

export interface IssueTypeConfiguration {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly category: IssueCategory;
  /**
   * Ce type compte-t-il comme « bug » pour le signalement des bugs liés ?
   * `null` = non réglé : on se fie au nom du type (voir `looksLikeBug`).
   */
  readonly countsAsBug: boolean | null;
}

export function isBugTypeConfiguration(type: IssueTypeConfiguration): boolean {
  return type.countsAsBug ?? looksLikeBug(type.name);
}

/** D'où viennent les objectifs affichés sur le board. */
export type GoalSource =
  /** Objets Goal Atlassian réels, lus par l'API GraphQL ; rattachement = lien Jira natif. */
  | "atlassianGoals"
  /** Lignes du champ texte `goal` du sprint, en lecture seule. Repli si les Goals ne répondent pas. */
  | "sprintText";

/**
 * Configuration complète d'un board : structure déduite de Jira, préférences de l'utilisateur.
 *
 * Rien n'est codé en dur : colonnes, statuts, types et champs proviennent de l'instance Jira.
 * Tout ce qui est préférence (ordre, couleurs, masquage, champs des cartes, règles de couleur)
 * est LOCAL à ce navigateur et n'est jamais écrit dans Jira.
 */
export interface BoardConfiguration {
  readonly boardId: number;
  readonly boardName: string;
  readonly boardType: string;
  readonly projectKeys: readonly string[];
  readonly siteOrigin: string;
  /** Champ d'estimation déclaré par le board Jira (`estimation.field.fieldId`). */
  readonly estimationFieldId: string | null;
  readonly estimationFieldName: string | null;
  /** Champ Jira portant les Goals Atlassian rattachés à un ticket (le lien natif). */
  readonly goalsFieldId: string | null;
  /** Champ Jira « Flagged » (drapeau posé depuis le board Jira). Lu seulement. */
  readonly flaggedFieldId: string | null;

  readonly scrumColumns: readonly ColumnConfiguration[];
  readonly runColumns: readonly ColumnConfiguration[];
  readonly issueTypes: readonly IssueTypeConfiguration[];

  /**
   * Libellés considérés comme marqueurs de blocage, en complément du lien natif
   * « is blocked by ». Vide par défaut : aucune heuristique imposée.
   */
  readonly blockedLabels: readonly string[];
  /** Seuil d'ancienneté dans une colonne, en jours. */
  readonly agingThresholdDays: number;
  /** Rafraîchissement automatique, en secondes. `null` = désactivé. */
  readonly autoRefreshSeconds: number | null;
  readonly showRunSection: boolean;
  /** Objectifs masqués de l'affichage. Rien n'est supprimé dans Jira. */
  readonly hiddenGoalIds: readonly string[];
  /** Ordre d'affichage des blocs (identifiants `BoardBlock`). */
  readonly blockOrder: readonly string[];
  /** Blocs repliés (identifiants `BoardBlock`), comme les swimlanes de Jira. */
  readonly collapsedBlockIds: readonly string[];
  /** Libellé du bloc regroupant les tickets non rattachés à un objectif. */
  readonly buildSectionLabel: string;
  readonly goalSource: GoalSource;
  /** Goals Atlassian associés à ce board, proposés en priorité à l'épinglage. */
  readonly boardGoalIds: readonly string[];
  /** Couleur de chaque objectif (indice de palette), mémorisée d'un sprint à l'autre. */
  readonly goalColorIndex: Readonly<Record<string, number>>;
  /** Champs supplémentaires des cartes (`MAX_CARD_FIELDS` au plus). */
  readonly cardFields: readonly CardField[];
  /** Règles de couleur des cartes, hors règle intégrée. */
  readonly cardColorRules: readonly CardColorRule[];
}

export const DEFAULT_BUILD_LABEL = "Build";

export function categoryForIssueType(config: BoardConfiguration, typeId: string): IssueCategory {
  return config.issueTypes.find((type) => type.id === typeId)?.category ?? "SCRUM";
}

/**
 * Un ticket lié de ce type compte-t-il comme bug ? Un type inconnu de ce board (ticket d'un
 * autre projet) est jugé sur son nom.
 */
export function isBugType(
  config: BoardConfiguration,
  typeId: string | null,
  typeName: string | null,
): boolean {
  const known = typeId === null ? undefined : config.issueTypes.find((type) => type.id === typeId);
  if (known) return isBugTypeConfiguration(known);
  return typeName === null ? false : looksLikeBug(typeName);
}

export function isGoalHidden(config: BoardConfiguration, goalId: string): boolean {
  return config.hiddenGoalIds.includes(goalId);
}

/**
 * Objectif sous lequel afficher un ticket sur le board.
 *
 * `null` quand le ticket n'a pas d'objectif, OU que le sien est masqué : ses tickets rejoignent
 * alors le bloc Build au lieu de disparaître du board. Le rattachement dans Jira n'est pas touché.
 */
export function displayedGoalId(config: BoardConfiguration, goalId: string | null): string | null {
  return goalId !== null && !isGoalHidden(config, goalId) ? goalId : null;
}

export function isBlockCollapsed(config: BoardConfiguration, block: BoardBlock): boolean {
  return config.collapsedBlockIds.includes(blockIdentifier(block));
}

/** Règles dans leur ordre de priorité, règle intégrée comprise. */
export function colorRules(config: BoardConfiguration): CardColorRule[] {
  return withBuiltInRules(config.cardColorRules);
}

/** Champs affichés sur les cartes, dans l'ordre choisi, limités au maximum. */
export function displayedCardFields(config: BoardConfiguration): CardField[] {
  return config.cardFields.slice(0, MAX_CARD_FIELDS);
}

export function visibleColumns(columns: readonly ColumnConfiguration[]): ColumnConfiguration[] {
  return columns.filter((column) => !column.hidden).sort((a, b) => a.position - b.position);
}

// ─── Découverte : de ce que Jira déclare à la configuration ──────────────────

/** Motifs par défaut pour classer un type de ticket en RUN. Ajustables ensuite par board. */
const RUN_TYPE_PATTERNS = [
  "anomalie",
  "incident",
  "bug",
  "support",
  "hotfix",
  "production",
  "recette",
];
const BUG_TYPE_PATTERNS = ["bug", "bogue", "anomalie", "defect"];

export function looksLikeBug(typeName: string): boolean {
  const folded = foldText(typeName);
  return BUG_TYPE_PATTERNS.some((pattern) => folded.includes(pattern));
}

export function defaultCategory(typeName: string): IssueCategory {
  const folded = foldText(typeName);
  return RUN_TYPE_PATTERNS.some((pattern) => folded.includes(pattern)) ? "RUN" : "SCRUM";
}

/** Ce que Jira déclare d'un board : `GET board/{id}` et `GET board/{id}/configuration`. */
export type DiscoveredBoard = JiraBoardStructure;

export function buildConfiguration(input: {
  board: DiscoveredBoard;
  siteOrigin: string;
  statuses: readonly JiraStatus[];
  issueTypes: readonly JiraIssueType[];
  estimationFieldName: string | null;
  goalsFieldId: string | null;
  flaggedFieldId: string | null;
}): BoardConfiguration {
  const statusById = new Map(input.statuses.map((status) => [status.id, status]));

  const columns = input.board.columns.map((column, index): ColumnConfiguration => {
    // Une colonne est « terminée » si Jira classe tous ses statuts en catégorie done.
    const resolved = column.statusIds
      .map((id) => statusById.get(id))
      .filter((status): status is JiraStatus => status !== undefined);
    return {
      id: `col-${index}-${column.name}`,
      name: column.name,
      statusIds: [...column.statusIds],
      position: index,
      hidden: column.statusIds.length === 0, // colonne sans statut mappé : inutilisable
      wipLimit: column.max,
      isDone: resolved.length > 0 && resolved.every(isDoneStatus),
    };
  });

  const issueTypes = input.issueTypes
    .filter((type) => type.subtask !== true)
    .map(
      (type): IssueTypeConfiguration => ({
        id: type.id,
        name: type.name,
        iconUrl: type.iconUrl,
        category: defaultCategory(type.name),
        countsAsBug: null,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" }));

  return {
    boardId: input.board.boardId,
    boardName: input.board.boardName,
    boardType: input.board.boardType,
    projectKeys: input.board.projectKey === null ? [] : [input.board.projectKey],
    siteOrigin: input.siteOrigin,
    estimationFieldId: input.board.estimationFieldId,
    estimationFieldName: input.estimationFieldName,
    goalsFieldId: input.goalsFieldId,
    flaggedFieldId: input.flaggedFieldId,
    scrumColumns: columns,
    runColumns: columns, // le RUN part du même workflow Jira, puis s'ajuste
    issueTypes,
    blockedLabels: [],
    agingThresholdDays: 3,
    autoRefreshSeconds: null,
    showRunSection: true,
    hiddenGoalIds: [],
    blockOrder: [],
    collapsedBlockIds: [],
    buildSectionLabel: DEFAULT_BUILD_LABEL,
    goalSource: "atlassianGoals",
    boardGoalIds: [],
    goalColorIndex: {},
    cardFields: [],
    cardColorRules: [],
  };
}

/**
 * Réapplique les choix de l'utilisateur sur une configuration fraîchement lue dans Jira : Jira
 * fait foi pour la structure, l'utilisateur pour ses préférences.
 */
export function mergeConfiguration(
  fresh: BoardConfiguration,
  existing: BoardConfiguration | null,
): BoardConfiguration {
  if (!existing || existing.boardId !== fresh.boardId) return fresh;

  // Catégories de types : on garde les choix faits, on classe les nouveaux types.
  const previousTypes = new Map(existing.issueTypes.map((type) => [type.id, type]));
  const issueTypes = fresh.issueTypes.map((type) => {
    const previous = previousTypes.get(type.id);
    return previous
      ? { ...type, category: previous.category, countsAsBug: previous.countsAsBug }
      : type;
  });

  return {
    ...fresh,
    goalsFieldId: fresh.goalsFieldId ?? existing.goalsFieldId,
    flaggedFieldId: fresh.flaggedFieldId ?? existing.flaggedFieldId,
    issueTypes,
    // Colonnes : la structure vient de Jira, l'affichage vient de l'utilisateur.
    scrumColumns: applyColumnPreferences(fresh.scrumColumns, existing.scrumColumns),
    runColumns: applyColumnPreferences(fresh.runColumns, existing.runColumns),
    blockedLabels: existing.blockedLabels,
    agingThresholdDays: existing.agingThresholdDays,
    autoRefreshSeconds: existing.autoRefreshSeconds,
    showRunSection: existing.showRunSection,
    hiddenGoalIds: existing.hiddenGoalIds,
    blockOrder: existing.blockOrder,
    collapsedBlockIds: existing.collapsedBlockIds,
    buildSectionLabel: existing.buildSectionLabel,
    goalSource: existing.goalSource,
    boardGoalIds: existing.boardGoalIds,
    goalColorIndex: existing.goalColorIndex,
    cardFields: existing.cardFields,
    cardColorRules: existing.cardColorRules,
  };
}

function applyColumnPreferences(
  fresh: readonly ColumnConfiguration[],
  existing: readonly ColumnConfiguration[],
): ColumnConfiguration[] {
  // Une colonne se reconnaît à l'ensemble de ses statuts Jira, pas à son nom ni à son rang.
  const signature = (column: ColumnConfiguration) => JSON.stringify([...column.statusIds].sort());
  const bySignature = new Map<string, ColumnConfiguration>();
  for (const column of existing) {
    if (!bySignature.has(signature(column))) bySignature.set(signature(column), column);
  }
  return fresh.map((column) => {
    const previous = bySignature.get(signature(column));
    if (!previous) return column;
    return {
      ...column,
      name: previous.name, // renommage conservé
      hidden: column.statusIds.length === 0 ? true : previous.hidden,
      wipLimit: previous.wipLimit ?? column.wipLimit,
    };
  });
}

// ─── Relecture d'une configuration enregistrée localement ────────────────────

/**
 * Relit une configuration enregistrée dans `chrome.storage.local`. Seule l'extension y écrit,
 * mais le format peut avoir évolué d'une version à l'autre : la structure lue dans Jira doit être
 * complète, sinon `null` (le board sera relu dans Jira) ; une préférence absente ou illisible
 * reprend sa valeur par défaut.
 */
export function decodeStoredConfiguration(value: unknown): BoardConfiguration | null {
  if (!isObject(value)) return null;
  if (
    !isPositiveInteger(value.boardId) ||
    typeof value.boardName !== "string" ||
    typeof value.siteOrigin !== "string"
  ) {
    return null;
  }
  const scrumColumns = decodeColumns(value.scrumColumns);
  const runColumns = decodeColumns(value.runColumns);
  const issueTypes = decodeList(value.issueTypes, decodeIssueTypeConfiguration);
  if (scrumColumns === null || runColumns === null || issueTypes === null) return null;

  return {
    boardId: value.boardId,
    boardName: value.boardName,
    boardType: textOr(value.boardType, ""),
    projectKeys: strings(value.projectKeys),
    siteOrigin: value.siteOrigin,
    estimationFieldId: textOrNull(value.estimationFieldId),
    estimationFieldName: textOrNull(value.estimationFieldName),
    goalsFieldId: textOrNull(value.goalsFieldId),
    flaggedFieldId: textOrNull(value.flaggedFieldId),
    scrumColumns,
    runColumns,
    issueTypes,
    blockedLabels: strings(value.blockedLabels),
    agingThresholdDays: isPositiveInteger(value.agingThresholdDays) ? value.agingThresholdDays : 3,
    autoRefreshSeconds: isPositiveInteger(value.autoRefreshSeconds)
      ? value.autoRefreshSeconds
      : null,
    showRunSection: typeof value.showRunSection === "boolean" ? value.showRunSection : true,
    hiddenGoalIds: strings(value.hiddenGoalIds),
    blockOrder: strings(value.blockOrder),
    collapsedBlockIds: strings(value.collapsedBlockIds),
    buildSectionLabel: textOr(value.buildSectionLabel, DEFAULT_BUILD_LABEL),
    goalSource: value.goalSource === "sprintText" ? "sprintText" : "atlassianGoals",
    boardGoalIds: strings(value.boardGoalIds),
    goalColorIndex: decodeColorIndex(value.goalColorIndex),
    cardFields: decodeList(value.cardFields, decodeCardField) ?? [],
    cardColorRules: decodeList(value.cardColorRules, decodeColorRule) ?? [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** `null` si ce n'est pas un tableau ; les éléments illisibles sont écartés. */
function decodeList<T>(value: unknown, decode: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(decode).filter((item): item is T => item !== null);
}

function decodeColumns(value: unknown): ColumnConfiguration[] | null {
  return decodeList(value, (item) => {
    if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string")
      return null;
    return {
      id: item.id,
      name: item.name,
      statusIds: strings(item.statusIds),
      position: typeof item.position === "number" ? item.position : 0,
      hidden: item.hidden === true,
      wipLimit: isPositiveInteger(item.wipLimit) ? item.wipLimit : null,
      isDone: item.isDone === true,
    };
  });
}

function decodeIssueTypeConfiguration(item: unknown): IssueTypeConfiguration | null {
  if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
  const category: IssueCategory =
    item.category === "RUN" || item.category === "IGNORED" ? item.category : "SCRUM";
  return {
    id: item.id,
    name: item.name,
    iconUrl: textOrNull(item.iconUrl),
    category,
    countsAsBug: typeof item.countsAsBug === "boolean" ? item.countsAsBug : null,
  };
}

function decodeColorIndex(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!isObject(value)) return result;
  for (const [goalId, index] of Object.entries(value)) {
    if (typeof index === "number" && Number.isInteger(index) && index >= 0) result[goalId] = index;
  }
  return result;
}

function decodeCardField(item: unknown): CardField | null {
  if (!isObject(item)) return null;
  if (item.kind === "custom") {
    return typeof item.customFieldId === "string"
      ? {
          kind: "custom",
          customFieldId: item.customFieldId,
          customFieldName: textOrNull(item.customFieldName),
        }
      : null;
  }
  return item.kind === "fixVersions" ||
    item.kind === "affectsVersions" ||
    item.kind === "labels" ||
    item.kind === "components"
    ? { kind: item.kind }
    : null;
}

function decodeColorRule(item: unknown): CardColorRule | null {
  if (!isObject(item) || typeof item.id !== "string" || typeof item.color !== "string") return null;
  return {
    id: item.id,
    name: textOr(item.name, ""),
    jql: textOr(item.jql, ""),
    color: item.color,
    enabled: item.enabled !== false,
    kind: item.kind === "addedAfterSprintStart" ? "addedAfterSprintStart" : null,
  };
}
