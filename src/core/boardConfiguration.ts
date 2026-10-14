import type { JiraBoardStructure } from "../jira/client";
import type { JsonObject } from "../jira/json";
import type { JiraIssueType, JiraStatus } from "../jira/models";
import { isDoneStatus } from "../jira/models";
import { type BoardBlock, blockIdentifier } from "./boardBlocks";
import { type CardColorRule, withBuiltInRules } from "./cardColors";
import { type CardField, MAX_CARD_FIELDS } from "./cardFields";
import { foldText } from "./text";

/**
 * Destination par défaut d'un type Jira : Build (`GOAL`), swimlane par type (`SWIMLANE`), ou
 * exclusion (`IGNORED`). Pour tout type affichable, un objectif rattaché est prioritaire.
 */
export type IssueCategory = "GOAL" | "SWIMLANE" | "IGNORED";

/**
 * Swimlane par type : destination sans objectif d'un groupe de types (demande de Denis du
 * 25/09/2026, remplace l'unique swimlane Kanban). Un type n'appartient qu'à une swimlane, et y est
 * si et seulement si son mode est `SWIMLANE` (`normalizeSwimlanes` tient cet invariant).
 */
export interface TicketSwimlane {
  /** Identifiant stable (« 1 », « 2 »…), repris dans l'ordre et le repli des blocs. */
  readonly id: string;
  /** Nom choisi dans l'administration ; vide = nom calculé à partir des types (`swimlaneName`). */
  readonly name: string;
  /** Types regroupés, dans l'ordre du nom calculé. */
  readonly typeIds: readonly string[];
  /** Masquée : ses tickets ne sont pas affichés. */
  readonly hidden: boolean;
}

/**
 * Colonne du board Jira, telle que Jira la déclare. Depuis 0.31.0, l'extension ne la renomme, ne la
 * masque ni ne change sa limite WIP : seules les colonnes sans statut Jira restent écartées.
 */
export interface ColumnConfiguration {
  readonly id: string;
  /** Nom de la colonne dans le board Jira. */
  readonly name: string;
  /** Statuts Jira regroupés dans cette colonne (identifiants Jira). */
  readonly statusIds: readonly string[];
  readonly position: number;
  /** Colonne sans statut Jira : inutilisable, donc jamais affichée. */
  readonly hidden: boolean;
  /** Limite WIP du board Jira (`columns[].max`). */
  readonly wipLimit: number | null;
  /** Vrai si tous les statuts de la colonne sont de catégorie « done ». */
  readonly isDone: boolean;
}

export interface IssueTypeConfiguration {
  readonly id: string;
  readonly name: string;
  readonly iconUrl: string | null;
  readonly category: IssueCategory;
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
 * Les préférences sont gardées dans ce navigateur ; celles de l'équipe (ordre, couleurs, masquage,
 * swimlanes, champs et règles de couleur des cartes) sont aussi partagées par la propriété du board
 * (`teamSettings.ts`). Les autres (repli, rafraîchissement automatique…) restent personnelles.
 */
export interface BoardConfiguration {
  readonly boardId: number;
  readonly boardName: string;
  readonly boardType: string;
  /** Sous-filtre Kanban lu dans la structure Jira, jamais édité par l'extension. */
  readonly kanbanSubQuery: string | null;
  readonly projectKeys: readonly string[];
  readonly siteOrigin: string;
  /** Champ d'estimation déclaré par le board Jira (`estimation.field.fieldId`). */
  readonly estimationFieldId: string | null;
  readonly estimationFieldName: string | null;
  /** Champ Jira portant les Goals Atlassian rattachés à un ticket (le lien natif). */
  readonly goalsFieldId: string | null;
  /** Champ Jira « Flagged » (drapeau posé depuis le board Jira). Lu seulement. */
  readonly flaggedFieldId: string | null;

  /** Colonnes du board, les mêmes pour toutes les swimlanes. */
  readonly columns: readonly ColumnConfiguration[];
  readonly issueTypes: readonly IssueTypeConfiguration[];
  /** Swimlanes par type, dans l'ordre de leur création. */
  readonly ticketSwimlanes: readonly TicketSwimlane[];

  /** Seuil d'ancienneté dans une colonne, en jours. */
  readonly agingThresholdDays: number;
  /** Rafraîchissement automatique, en secondes. `null` = désactivé. */
  readonly autoRefreshSeconds: number | null;
  /** Durée du minuteur du mode Daily, en minutes. Réglage local, jamais publié à l'équipe. */
  readonly dailyMinutes: number;
  /**
   * Daily : cartes affichées dans la première colonne de chaque swimlane avant le bouton
   * « + N autres ».
   */
  readonly dailyStockLimit: number;
  /** Objectifs masqués de l'affichage. Rien n'est supprimé dans Jira. */
  readonly hiddenGoalIds: readonly string[];
  /** Ordre d'affichage des blocs (identifiants `BoardBlock`). */
  readonly blockOrder: readonly string[];
  /** Blocs repliés (identifiants `BoardBlock`), comme les swimlanes de Jira. */
  readonly collapsedBlockIds: readonly string[];
  /** Libellé du bloc regroupant les tickets non rattachés à un objectif. */
  readonly buildSectionLabel: string;
  readonly goalSource: GoalSource;
  /** Goals épinglés au board Kanban, partagés par la propriété de réglages du board. */
  readonly boardPinnedGoalIds: readonly string[];
  /** Couleur de chaque objectif (indice de palette), mémorisée d'un sprint à l'autre. */
  readonly goalColorIndex: Readonly<Record<string, number>>;
  /** Champs supplémentaires des cartes (`MAX_CARD_FIELDS` au plus). */
  readonly cardFields: readonly CardField[];
  /** Règles de couleur des cartes, hors règle intégrée. */
  readonly cardColorRules: readonly CardColorRule[];
  /**
   * Goals épinglés gardés dans ce navigateur quand Jira a refusé de les enregistrer sur le sprint
   * (par identifiant de sprint). Choix explicite de l'utilisateur ; ils ne servent que si Jira
   * n'a aucune sélection pour ce sprint, et ne sont partagés avec personne.
   */
  readonly localPinnedGoalIds: Readonly<Record<string, readonly string[]>>;
  /**
   * Dernière version des réglages d'équipe (propriété du board dans Jira) appliquée, publiée ou
   * acceptée dans ce navigateur. Sert de référence : ce qui en diffère est une modification locale
   * non publiée. `null` : aucune. Réglages gardés sous leur forme JSON (voir `teamSettings.ts`).
   */
  readonly teamBase: TeamBase | null;
}

export interface TeamBase {
  readonly publishedAt: string;
  readonly settings: JsonObject;
}

export const DEFAULT_BUILD_LABEL = "Build";
/** Nom par défaut de l'ancienne swimlane Kanban (avant 0.23.0) : il laisse place au nom calculé. */
const LEGACY_KANBAN_LABEL = "Kanban";

/** Minuteur du mode Daily : 15 minutes par défaut, de 1 à 120. */
export const DEFAULT_DAILY_MINUTES = 15;
export const MAX_DAILY_MINUTES = 120;
/** Stock en daily : 3 cartes par défaut avant le bouton, de 1 à 50. */
export const DEFAULT_DAILY_STOCK = 3;
export const MAX_DAILY_STOCK = 50;

export function categoryForIssueType(config: BoardConfiguration, typeId: string): IssueCategory {
  return config.issueTypes.find((type) => type.id === typeId)?.category ?? "GOAL";
}

/** Swimlane sans objectif d'un type de ticket ; `null` pour Build ou un type ignoré. */
export function swimlaneOfType(config: BoardConfiguration, typeId: string): TicketSwimlane | null {
  return config.ticketSwimlanes.find((swimlane) => swimlane.typeIds.includes(typeId)) ?? null;
}

export function findSwimlane(config: BoardConfiguration, id: string): TicketSwimlane | null {
  return config.ticketSwimlanes.find((swimlane) => swimlane.id === id) ?? null;
}

/** Swimlanes par type affichées (non masquées), dans leur ordre de création. */
export function shownSwimlaneIds(config: BoardConfiguration): string[] {
  return config.ticketSwimlanes.filter((swimlane) => !swimlane.hidden).map((s) => s.id);
}

/** Nom calculé : les noms de ses types, dans l'ordre du groupe. */
export function computedSwimlaneName(
  config: Pick<BoardConfiguration, "issueTypes">,
  swimlane: TicketSwimlane,
): string {
  const names = swimlane.typeIds.flatMap((id) => {
    const type = config.issueTypes.find((candidate) => candidate.id === id);
    return type ? [type.name] : [];
  });
  return names.join(" / ");
}

/** Nom affiché d'une swimlane par type : celui choisi, sinon le nom calculé. */
export function swimlaneName(
  config: Pick<BoardConfiguration, "issueTypes">,
  swimlane: TicketSwimlane,
): string {
  return swimlane.name.trim() || computedSwimlaneName(config, swimlane) || "Swimlane";
}

/** Plus petit identifiant libre (« 1 », « 2 »…). */
export function nextSwimlaneId(swimlanes: readonly TicketSwimlane[]): string {
  const used = new Set(swimlanes.map((swimlane) => swimlane.id));
  let id = 1;
  while (used.has(String(id))) id += 1;
  return String(id);
}

/**
 * Remet types et swimlanes d'accord. Le mode du type fait foi : une swimlane ne garde que des
 * types connus en mode `SWIMLANE`, chacun une seule fois ; un type en mode `SWIMLANE` qui n'est dans
 * aucune rejoint la première, ou une nouvelle (`orphans`) s'il n'y en a pas ; une swimlane vide
 * disparaît. Sert à la découverte d'un board, aux types apparus depuis, à la relecture des anciens
 * formats (tous les types Kanban dans une seule swimlane) et aux réglages écrits par une version
 * qui ne connaît pas les swimlanes par type.
 */
export function normalizeSwimlanes(
  issueTypes: readonly IssueTypeConfiguration[],
  swimlanes: readonly TicketSwimlane[],
  orphans: { readonly name: string; readonly hidden: boolean } = { name: "", hidden: false },
): TicketSwimlane[] {
  const inSwimlane = new Set(
    issueTypes.filter((type) => type.category === "SWIMLANE").map((type) => type.id),
  );
  const placed = new Set<string>();
  const result = swimlanes.map((swimlane) => ({
    ...swimlane,
    typeIds: swimlane.typeIds.filter((id) => {
      if (!inSwimlane.has(id) || placed.has(id)) return false;
      placed.add(id);
      return true;
    }),
  }));
  const homeless = issueTypes
    .filter((type) => type.category === "SWIMLANE" && !placed.has(type.id))
    .map((type) => type.id);
  if (homeless.length > 0) {
    const first = result.find((swimlane) => swimlane.typeIds.length > 0);
    if (first) {
      const index = result.indexOf(first);
      result[index] = { ...first, typeIds: [...first.typeIds, ...homeless] };
    } else {
      result.push({ id: nextSwimlaneId(result), typeIds: homeless, ...orphans });
    }
  }
  return result.filter((swimlane) => swimlane.typeIds.length > 0);
}

export function isGoalHidden(config: BoardConfiguration, goalId: string): boolean {
  return config.hiddenGoalIds.includes(goalId);
}

/**
 * Objectif sous lequel afficher un ticket sur le board.
 *
 * `null` quand le ticket n'a pas d'objectif, OU que le sien est masqué : ses tickets rejoignent
 * alors leur bloc par défaut au lieu de disparaître du board. Le rattachement Jira est conservé.
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

/**
 * Motifs des types dont la destination sans objectif est une première swimlane par type.
 * Ajustables ensuite par board.
 */
const SWIMLANE_TYPE_PATTERNS = [
  "anomalie",
  "incident",
  "bug",
  "support",
  "hotfix",
  "production",
  "recette",
];
export function defaultCategory(typeName: string): IssueCategory {
  const folded = foldText(typeName);
  return SWIMLANE_TYPE_PATTERNS.some((pattern) => folded.includes(pattern)) ? "SWIMLANE" : "GOAL";
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
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" }));

  return {
    boardId: input.board.boardId,
    boardName: input.board.boardName,
    boardType: input.board.boardType,
    kanbanSubQuery: input.board.kanbanSubQuery,
    projectKeys: input.board.projectKey === null ? [] : [input.board.projectKey],
    siteOrigin: input.siteOrigin,
    estimationFieldId: input.board.estimationFieldId,
    estimationFieldName: input.estimationFieldName,
    goalsFieldId: input.goalsFieldId,
    flaggedFieldId: input.flaggedFieldId,
    columns,
    issueTypes,
    ticketSwimlanes: normalizeSwimlanes(issueTypes, []),
    agingThresholdDays: 3,
    autoRefreshSeconds: null,
    dailyMinutes: DEFAULT_DAILY_MINUTES,
    dailyStockLimit: DEFAULT_DAILY_STOCK,
    hiddenGoalIds: [],
    blockOrder: [],
    collapsedBlockIds: [],
    buildSectionLabel: DEFAULT_BUILD_LABEL,
    // Texte du sprint par défaut (demande de Denis du 09/10/2026) ; un board Kanban n'a pas de sprint.
    goalSource: input.board.boardType === "kanban" ? "atlassianGoals" : "sprintText",
    boardPinnedGoalIds: [],
    goalColorIndex: {},
    cardFields: [],
    cardColorRules: [],
    localPinnedGoalIds: {},
    teamBase: null,
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
    return previous ? { ...type, category: previous.category } : type;
  });

  return {
    ...fresh,
    goalsFieldId: fresh.goalsFieldId ?? existing.goalsFieldId,
    flaggedFieldId: fresh.flaggedFieldId ?? existing.flaggedFieldId,
    issueTypes,
    // Un nouveau type doté d'une swimlane par défaut rejoint la première swimlane par type.
    ticketSwimlanes: normalizeSwimlanes(issueTypes, existing.ticketSwimlanes),
    // Colonnes : telles que Jira les déclare (noms, affichage et limites WIP ne se règlent plus ici).
    columns: fresh.columns,
    agingThresholdDays: existing.agingThresholdDays,
    autoRefreshSeconds: existing.autoRefreshSeconds,
    dailyMinutes: existing.dailyMinutes,
    dailyStockLimit: existing.dailyStockLimit,
    hiddenGoalIds: existing.hiddenGoalIds,
    blockOrder: existing.blockOrder,
    collapsedBlockIds: existing.collapsedBlockIds,
    buildSectionLabel: existing.buildSectionLabel,
    goalSource: fresh.boardType === "kanban" ? "atlassianGoals" : existing.goalSource,
    boardPinnedGoalIds: existing.boardPinnedGoalIds,
    goalColorIndex: existing.goalColorIndex,
    cardFields: existing.cardFields,
    cardColorRules: existing.cardColorRules,
    localPinnedGoalIds: existing.localPinnedGoalIds,
    teamBase: existing.teamBase,
  };
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
  // Avant 0.23.0, les colonnes des objectifs s'appelaient `scrumColumns` ; celles du Kanban
  // (`kanbanColumns`) disparaissent : une seule série de colonnes pour toutes les swimlanes.
  const columns = decodeColumns(value.columns ?? value.scrumColumns);
  const issueTypes = decodeList(value.issueTypes, decodeIssueTypeConfiguration);
  if (columns === null || issueTypes === null) return null;

  return {
    boardId: value.boardId,
    boardName: value.boardName,
    boardType: textOr(value.boardType, ""),
    kanbanSubQuery: value.boardType === "kanban" ? textOrNull(value.kanbanSubQuery) : null,
    projectKeys: strings(value.projectKeys),
    siteOrigin: value.siteOrigin,
    estimationFieldId: textOrNull(value.estimationFieldId),
    estimationFieldName: textOrNull(value.estimationFieldName),
    goalsFieldId: textOrNull(value.goalsFieldId),
    flaggedFieldId: textOrNull(value.flaggedFieldId),
    columns,
    issueTypes,
    ticketSwimlanes: decodeSwimlanes(value, issueTypes),
    agingThresholdDays: isPositiveInteger(value.agingThresholdDays) ? value.agingThresholdDays : 3,
    autoRefreshSeconds: isPositiveInteger(value.autoRefreshSeconds)
      ? value.autoRefreshSeconds
      : null,
    dailyMinutes:
      isPositiveInteger(value.dailyMinutes) && value.dailyMinutes <= MAX_DAILY_MINUTES
        ? value.dailyMinutes
        : DEFAULT_DAILY_MINUTES,
    dailyStockLimit: decodeStockLimit(
      value.dailyStockLimit ?? value.dailyKanbanStockLimit ?? value.dailyRunStockLimit,
    ),
    hiddenGoalIds: strings(value.hiddenGoalIds),
    blockOrder: legacyBlockIds(strings(value.blockOrder)),
    collapsedBlockIds: legacyBlockIds(strings(value.collapsedBlockIds)),
    buildSectionLabel: textOr(value.buildSectionLabel, DEFAULT_BUILD_LABEL),
    goalSource:
      value.boardType !== "kanban" && value.goalSource === "sprintText"
        ? "sprintText"
        : "atlassianGoals",
    boardPinnedGoalIds: [...new Set(strings(value.boardPinnedGoalIds))],
    goalColorIndex: decodeColorIndex(value.goalColorIndex),
    cardFields: decodeList(value.cardFields, decodeCardField) ?? [],
    cardColorRules: decodeList(value.cardColorRules, decodeColorRule) ?? [],
    localPinnedGoalIds: decodeLocalPins(value.localPinnedGoalIds),
    teamBase: decodeTeamBase(value.teamBase),
  };
}

function decodeStockLimit(value: unknown): number {
  return isPositiveInteger(value) && value <= MAX_DAILY_STOCK ? value : DEFAULT_DAILY_STOCK;
}

/**
 * Swimlanes par type. Sans la clé `ticketSwimlanes` (format d'avant 0.23.0, ou réglages écrits par
 * une version qui ne la connaît pas), les types Kanban forment une seule swimlane, l'ancienne : elle
 * garde son nom s'il avait été changé, son masquage, et l'identifiant « 1 » (`legacyBlockIds`).
 */
function decodeSwimlanes(
  value: Record<string, unknown>,
  issueTypes: readonly IssueTypeConfiguration[],
): TicketSwimlane[] {
  const stored = decodeList(value.ticketSwimlanes, decodeSwimlane);
  if (stored !== null) return normalizeSwimlanes(issueTypes, stored);
  const label = textOr(value.kanbanSectionLabel, "").trim();
  const shown = value.showKanbanSection ?? value.showRunSection;
  return normalizeSwimlanes(issueTypes, [], {
    name: label === LEGACY_KANBAN_LABEL ? "" : label,
    hidden: shown === false,
  });
}

function decodeSwimlane(item: unknown): TicketSwimlane | null {
  if (!isObject(item) || typeof item.id !== "string" || item.id === "") return null;
  return {
    id: item.id,
    name: textOr(item.name, ""),
    typeIds: strings(item.typeIds),
    hidden: item.hidden === true,
  };
}

/**
 * Bloc enregistré sous un ancien nom : `run` (avant 0.21.0) puis `kanban` (avant 0.23.0), l'unique
 * swimlane hors objectifs, devenue la swimlane par type « 1 ».
 */
function legacyBlockIds(ids: string[]): string[] {
  return ids.map((id) => (id === "run" || id === "kanban" ? "swimlane:1" : id));
}

function decodeTeamBase(value: unknown): TeamBase | null {
  if (!isObject(value) || typeof value.publishedAt !== "string" || !isObject(value.settings)) {
    return null;
  }
  return { publishedAt: value.publishedAt, settings: value.settings as JsonObject };
}

function decodeLocalPins(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!isObject(value)) return result;
  for (const [sprintId, ids] of Object.entries(value)) {
    const goals = strings(ids);
    if (/^\d+$/.test(sprintId) && goals.length > 0) result[sprintId] = goals;
  }
  return result;
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
    const statusIds = strings(item.statusIds);
    return {
      id: item.id,
      name: item.name,
      statusIds,
      position: typeof item.position === "number" ? item.position : 0,
      // Le masquage choisi avant 0.31.0 n'est plus repris : seule une colonne sans statut l'est.
      hidden: statusIds.length === 0,
      wipLimit: isPositiveInteger(item.wipLimit) ? item.wipLimit : null,
      isDone: item.isDone === true,
    };
  });
}

function decodeIssueTypeConfiguration(item: unknown): IssueTypeConfiguration | null {
  if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
  // « RUN » (avant 0.21.0) puis « KANBAN » (avant 0.23.0, et toujours écrit dans les réglages
  // partagés) : hors objectifs. « SCRUM » : par objectif.
  const category: IssueCategory =
    item.category === "SWIMLANE" || item.category === "KANBAN" || item.category === "RUN"
      ? "SWIMLANE"
      : item.category === "IGNORED"
        ? "IGNORED"
        : "GOAL";
  return {
    id: item.id,
    name: item.name,
    iconUrl: textOrNull(item.iconUrl),
    category,
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
