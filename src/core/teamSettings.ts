import type { JiraClient } from "../jira/client";
import { JiraError } from "../jira/errors";
import { isRecord, type JsonObject, type JsonValue } from "../jira/json";
import { BOARD_PROPERTY_KEYS } from "../jira/writes";
import {
  type BoardConfiguration,
  type ColumnConfiguration,
  decodeStoredConfiguration,
  type GoalSource,
  type IssueCategory,
  normalizeSwimlanes,
  swimlaneName,
  type TicketSwimlane,
} from "./boardConfiguration";
import type { JiraWriter } from "./boardWrites";
import type { CardColorRule } from "./cardColors";
import type { CardField } from "./cardFields";

/**
 * Réglages d'équipe d'un board, partagés par une propriété du board dans Jira
 * (`com.scrumboardmac.boardsettings.v1`) et publiés sur un geste explicite. Validé par Denis le
 * 19/09/2026 : cinquième catégorie d'écriture. Depuis 0.22.0 (demande de Denis du 24/09/2026), toute
 * modification d'un de ces réglages par l'utilisateur est écrite aussitôt, et la version de Jira est
 * appliquée à chaque chargement du board. Les réglages PERSONNELS n'en font jamais partie : swimlanes
 * repliées, rafraîchissement automatique, épinglage gardé localement, filtres, largeur de la barre
 * latérale.
 *
 * Toute personne qui voit le board peut lire la propriété : elle ne contient que des réglages
 * d'affichage, le nom et l'identifiant de compte de qui a publié, rien de personnel au-delà.
 */
export const TEAM_SETTINGS_VERSION = 1;

export interface TeamColumn {
  readonly id: string;
  readonly name: string;
  readonly hidden: boolean;
  readonly wipLimit: number | null;
}

/**
 * Mode d'un type tel qu'il est ÉCRIT dans la propriété du board : les mots d'avant 0.23.0, que la
 * 0.22.7 comprend encore (`SCRUM` = par objectif, `KANBAN` = dans une swimlane par type).
 */
export type TeamCategory = "SCRUM" | "KANBAN" | "IGNORED";

const WRITTEN_CATEGORY: Record<IssueCategory, TeamCategory> = {
  GOAL: "SCRUM",
  SWIMLANE: "KANBAN",
  IGNORED: "IGNORED",
};

export interface TeamIssueType {
  readonly id: string;
  readonly name: string;
  readonly category: TeamCategory;
  readonly countsAsBug: boolean | null;
}

/**
 * Réglages tels qu'ils sont écrits dans Jira. Depuis 0.23.0, des collègues peuvent encore utiliser la
 * 0.22.7 sur le même board : elle exige `scrumColumns` et `kanbanColumns`, et réécrit telles quelles
 * les clés qu'elle ne connaît pas (`ticketSwimlanes`, `dailyStockLimit`). Les champs marqués
 * « 0.22.7 » sont donc DÉDUITS des autres, écrits pour elle et jamais relus quand
 * `ticketSwimlanes` est là : elle y voit une seule swimlane Kanban qui réunit tous ces tickets.
 */
export interface TeamSettings {
  /** Colonnes du board (nom de clé d'avant 0.23.0, gardé). */
  readonly scrumColumns: readonly TeamColumn[];
  /** 0.22.7 : copie de `scrumColumns`. */
  readonly kanbanColumns: readonly TeamColumn[];
  readonly issueTypes: readonly TeamIssueType[];
  readonly ticketSwimlanes: readonly TicketSwimlane[];
  /** 0.22.7 : au moins une swimlane par type affichée. */
  readonly showKanbanSection: boolean;
  readonly buildSectionLabel: string;
  /** 0.22.7 : noms des swimlanes par type, réunis. */
  readonly kanbanSectionLabel: string;
  readonly agingThresholdDays: number;
  /** Daily : durée du minuteur et cartes du stock (même daily pour toute l'équipe). */
  readonly dailyMinutes: number;
  readonly dailyStockLimit: number;
  /** 0.22.7 : copie de `dailyStockLimit`. */
  readonly dailyKanbanStockLimit: number;
  readonly blockedLabels: readonly string[];
  readonly goalSource: GoalSource;
  /** Goals épinglés au board Kanban, indépendants des épinglages de sprint. */
  readonly boardPinnedGoalIds: readonly string[];
  readonly goalColorIndex: Readonly<Record<string, number>>;
  readonly blockOrder: readonly string[];
  readonly hiddenGoalIds: readonly string[];
  readonly cardFields: readonly CardField[];
  readonly cardColorRules: readonly CardColorRule[];
}

const SETTINGS_KEYS = [
  "scrumColumns",
  "kanbanColumns",
  "issueTypes",
  "ticketSwimlanes",
  "showKanbanSection",
  "buildSectionLabel",
  "kanbanSectionLabel",
  "agingThresholdDays",
  "dailyMinutes",
  "dailyStockLimit",
  "dailyKanbanStockLimit",
  "blockedLabels",
  "goalSource",
  "boardPinnedGoalIds",
  "goalColorIndex",
  "blockOrder",
  "hiddenGoalIds",
  "cardFields",
  "cardColorRules",
] as const satisfies readonly (keyof TeamSettings)[];

const DOCUMENT_KEYS = new Set(["version", "publishedAt", "publishedBy", "settings"]);

/**
 * Clés abandonnées, retirées à la publication suivante : `runColumns` et `showRunSection` (RUN
 * devenu Kanban en 0.21.0, relues), `boardGoalIds` (Goals associés au board, retirés en 0.22.4).
 */
const LEGACY_SETTINGS_KEYS = ["runColumns", "showRunSection", "boardGoalIds"] as const;

export interface TeamPublisher {
  readonly accountId: string | null;
  readonly displayName: string | null;
}

export interface TeamDocument {
  readonly version: number;
  /** Horodatage ISO 8601 de la publication : identifie la version. */
  readonly publishedAt: string;
  readonly publishedBy: TeamPublisher;
  readonly settings: TeamSettings;
}

// ─── Configuration ↔ réglages d'équipe ───────────────────────────────────────

export function teamSettingsOf(configuration: BoardConfiguration): TeamSettings {
  const columns = configuration.columns.map(({ id, name, hidden, wipLimit }) => ({
    id,
    name,
    hidden,
    wipLimit,
  }));
  const swimlanes = configuration.ticketSwimlanes;
  return {
    scrumColumns: columns,
    kanbanColumns: columns,
    issueTypes: configuration.issueTypes.map(({ id, name, category, countsAsBug }) => ({
      id,
      name,
      category: WRITTEN_CATEGORY[category],
      countsAsBug,
    })),
    ticketSwimlanes: swimlanes.map(({ id, name, typeIds, hidden }) => ({
      id,
      name,
      typeIds: [...typeIds],
      hidden,
    })),
    showKanbanSection: swimlanes.some((swimlane) => !swimlane.hidden),
    buildSectionLabel: configuration.buildSectionLabel,
    kanbanSectionLabel:
      swimlanes.map((swimlane) => swimlaneName(configuration, swimlane)).join(" / ") || "Kanban",
    dailyMinutes: configuration.dailyMinutes,
    dailyStockLimit: configuration.dailyStockLimit,
    dailyKanbanStockLimit: configuration.dailyStockLimit,
    agingThresholdDays: configuration.agingThresholdDays,
    blockedLabels: [...configuration.blockedLabels],
    goalSource: configuration.goalSource,
    boardPinnedGoalIds: [...configuration.boardPinnedGoalIds],
    goalColorIndex: { ...configuration.goalColorIndex },
    blockOrder: [...configuration.blockOrder],
    hiddenGoalIds: [...configuration.hiddenGoalIds],
    cardFields: [...configuration.cardFields],
    cardColorRules: [...configuration.cardColorRules],
  };
}

/**
 * Applique les réglages d'équipe à la configuration de ce navigateur. Les colonnes restent celles
 * lues dans Jira, celles sans statut restent masquées. Les types partagés absents des tickets
 * chargés sont conservés : leurs catégories et leurs swimlanes doivent survivre à une publication.
 * Un type inconnu de l'équipe garde son réglage local. Les couleurs d'objectifs se combinent : celle
 * de l'équipe l'emporte, un objectif qu'elle ne connaît pas garde la sienne.
 */
export function withTeamSettings(
  configuration: BoardConfiguration,
  settings: TeamSettings,
): BoardConfiguration {
  const columns = (local: readonly ColumnConfiguration[], team: readonly TeamColumn[]) =>
    local.map((column) => {
      const shared = team.find((candidate) => candidate.id === column.id);
      if (!shared) return column;
      return {
        ...column,
        name: shared.name.trim() || column.name,
        hidden: column.statusIds.length === 0 ? true : shared.hidden,
        wipLimit: shared.wipLimit,
      };
    });
  const typesById = new Map(configuration.issueTypes.map((type) => [type.id, type]));
  for (const shared of settings.issueTypes) {
    typesById.set(shared.id, {
      id: shared.id,
      name: shared.name,
      iconUrl: null,
      // Le nom et l'icône lus dans Jira restent prioritaires lorsqu'ils sont disponibles.
      ...typesById.get(shared.id),
      category: readCategory(shared.category),
      countsAsBug: shared.countsAsBug,
    });
  }
  const issueTypes = [...typesById.values()];
  return {
    ...configuration,
    columns: columns(configuration.columns, settings.scrumColumns),
    issueTypes,
    ticketSwimlanes: normalizeSwimlanes(issueTypes, settings.ticketSwimlanes),
    buildSectionLabel: settings.buildSectionLabel,
    dailyMinutes: settings.dailyMinutes,
    dailyStockLimit: settings.dailyStockLimit,
    agingThresholdDays: settings.agingThresholdDays,
    blockedLabels: [...settings.blockedLabels],
    goalSource: configuration.boardType === "kanban" ? "atlassianGoals" : settings.goalSource,
    boardPinnedGoalIds: [...settings.boardPinnedGoalIds],
    goalColorIndex: { ...configuration.goalColorIndex, ...settings.goalColorIndex },
    blockOrder: [...settings.blockOrder],
    hiddenGoalIds: [...settings.hiddenGoalIds],
    cardFields: [...settings.cardFields],
    cardColorRules: [...settings.cardColorRules],
  };
}

function readCategory(category: TeamCategory): IssueCategory {
  return category === "KANBAN" ? "SWIMLANE" : category === "IGNORED" ? "IGNORED" : "GOAL";
}

/**
 * Familles de réglages, pour dire ce qu'une publication ou une mise à jour change. Les champs
 * déduits pour la 0.22.7 n'y sont pas : ils suivent les autres.
 */
const FAMILIES: readonly (readonly [string, (settings: TeamSettings) => unknown])[] = [
  ["Colonnes : noms, affichage, limites WIP", (s) => s.scrumColumns],
  ["Types de tickets et swimlanes par type", (s) => [s.issueTypes, s.ticketSwimlanes]],
  ["Nom de Build, seuil de vieillissement", (s) => [s.buildSectionLabel, s.agingThresholdDays]],
  ["Labels de blocage", (s) => s.blockedLabels],
  ["Daily : durée et stock", (s) => [s.dailyMinutes, s.dailyStockLimit]],
  ["Source des objectifs", (s) => s.goalSource],
  ["Goals épinglés au board", (s) => s.boardPinnedGoalIds],
  ["Couleurs des objectifs", (s) => s.goalColorIndex],
  ["Ordre des swimlanes", (s) => s.blockOrder],
  ["Objectifs masqués", (s) => s.hiddenGoalIds],
  ["Champs des cartes", (s) => s.cardFields],
  ["Règles de couleur des cartes", (s) => s.cardColorRules],
];

export const TEAM_FAMILIES: readonly string[] = FAMILIES.map(([label]) => label);

/**
 * Familles de réglages où ce navigateur diffère de `settings`. La comparaison se fait après avoir
 * appliqué `settings` à la structure locale : une colonne que l'équipe ne connaît pas, ou une
 * couleur attribuée ici à un nouvel objectif, ne comptent pas comme une modification.
 */
export function teamDifferences(
  configuration: BoardConfiguration,
  settings: TeamSettings,
): string[] {
  const mine = teamSettingsOf(configuration);
  const theirs = teamSettingsOf(withTeamSettings(configuration, settings));
  return FAMILIES.filter(([, pick]) => canonical(pick(mine)) !== canonical(pick(theirs))).map(
    ([label]) => label,
  );
}

// ─── Document JSON ───────────────────────────────────────────────────────────

/** Deux configurations ont-elles exactement les mêmes réglages d'équipe ? */
export function sameTeamSettings(a: BoardConfiguration, b: BoardConfiguration): boolean {
  return JSON.stringify(teamSettingsOf(a)) === JSON.stringify(teamSettingsOf(b));
}

export function encodeTeamSettings(settings: TeamSettings): JsonObject {
  return JSON.parse(JSON.stringify(settings)) as JsonObject;
}

/**
 * Réglages lus dans Jira (ou gardés localement), validés champ par champ avec les décodeurs de la
 * configuration. `null` si colonnes et types manquent : le document n'est pas exploitable.
 */
export function decodeTeamSettings(value: unknown): TeamSettings | null {
  if (!isRecord(value)) return null;
  const decoded = decodeStoredConfiguration({
    ...value,
    boardId: 1,
    boardName: "réglages d'équipe",
    siteOrigin: "",
  });
  return decoded ? teamSettingsOf(decoded) : null;
}

export function encodeTeamDocument(document: TeamDocument): JsonObject {
  return {
    version: document.version,
    publishedAt: document.publishedAt,
    publishedBy: {
      accountId: document.publishedBy.accountId,
      displayName: document.publishedBy.displayName,
    },
    settings: encodeTeamSettings(document.settings),
  };
}

/** `null` si la valeur n'est pas un document de cette version : on ne l'interprète pas. */
export function decodeTeamDocument(value: unknown): TeamDocument | null {
  if (!isRecord(value) || value.version !== TEAM_SETTINGS_VERSION) return null;
  if (typeof value.publishedAt !== "string" || value.publishedAt === "") return null;
  const settings = decodeTeamSettings(value.settings);
  if (!settings) return null;
  const by = isRecord(value.publishedBy) ? value.publishedBy : {};
  return {
    version: TEAM_SETTINGS_VERSION,
    publishedAt: value.publishedAt,
    publishedBy: {
      accountId: typeof by.accountId === "string" ? by.accountId : null,
      displayName: typeof by.displayName === "string" ? by.displayName : null,
    },
    settings,
  };
}

// ─── Publication ─────────────────────────────────────────────────────────────

export type TeamReader = Pick<JiraClient, "boardProperty">;

export type PublishOutcome =
  /** Jira a confirmé l'enregistrement. */
  | { kind: "published"; document: TeamDocument }
  /**
   * Quelqu'un a publié depuis la version que ce navigateur connaît : rien n'a été écrit.
   * `current` est ce que Jira porte maintenant.
   */
  | { kind: "conflict"; current: TeamDocument | null };

/**
 * Publie les réglages d'équipe de ce navigateur. Règles des écritures de l'extension :
 *
 * 1. Relecture juste avant d'écrire : si la version publiée n'est plus celle que ce navigateur
 *    connaît (`basePublishedAt`), rien n'est écrit (conflit).
 * 2. Une valeur illisible (pas un objet, ou une version inconnue) n'est jamais écrasée.
 * 3. Les clés inconnues, du document comme des réglages, sont réécrites telles quelles.
 * 4. Une seule écriture, jamais rejouée.
 */
export async function publishTeamSettings(
  reader: TeamReader,
  writer: JiraWriter,
  input: {
    boardId: number;
    settings: TeamSettings;
    basePublishedAt: string | null;
    publishedBy: TeamPublisher;
    now: Date;
  },
): Promise<PublishOutcome> {
  const stored = await reader.boardProperty(input.boardId, BOARD_PROPERTY_KEYS.teamSettings);
  let current: TeamDocument | null = null;
  let extraKeys: JsonObject = {};
  let extraSettings: JsonObject = {};
  if (stored !== null) {
    if (!isRecord(stored)) {
      throw new JiraError({
        kind: "decoding",
        context: "réglages d'équipe du board : objet JSON attendu, rien n'a été écrit",
        detail: Array.isArray(stored) ? "tableau" : typeof stored,
      });
    }
    current = decodeTeamDocument(stored);
    if (!current) {
      throw new JiraError({
        kind: "decoding",
        context: "réglages d'équipe du board dans un format inconnu (version plus récente ?)",
        detail: "rien n'a été écrit",
      });
    }
    extraKeys = pickUnknown(stored, DOCUMENT_KEYS);
    if (isRecord(stored.settings)) {
      extraSettings = pickUnknown(
        stored.settings,
        new Set<string>([...SETTINGS_KEYS, ...LEGACY_SETTINGS_KEYS]),
      );
    }
  }
  // Publié par quelqu'un depuis la version connue ici (ou jamais vu ici) : on ne l'écrase pas.
  if ((current?.publishedAt ?? null) !== input.basePublishedAt) {
    return { kind: "conflict", current };
  }

  const previousTime = current ? Date.parse(current.publishedAt) : Number.NaN;
  const publishedAt = new Date(
    Number.isFinite(previousTime)
      ? Math.max(input.now.getTime(), previousTime + 1)
      : input.now.getTime(),
  ).toISOString();
  const document: TeamDocument = {
    version: TEAM_SETTINGS_VERSION,
    // Horodatage à la milliseconde : il identifie la version ; deux publications dans la même
    // seconde ne doivent pas se confondre, même si l'horloge locale est figée ou en retard.
    publishedAt,
    publishedBy: input.publishedBy,
    settings: input.settings,
  };
  const encoded = encodeTeamDocument(document);
  await writer.write({
    kind: "boardProperty.put",
    boardId: input.boardId,
    key: BOARD_PROPERTY_KEYS.teamSettings,
    value: {
      ...extraKeys,
      ...encoded,
      settings: { ...extraSettings, ...(encoded.settings as JsonObject) },
    },
  });
  return { kind: "published", document };
}

function pickUnknown(value: Record<string, unknown>, known: ReadonlySet<string>): JsonObject {
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (!known.has(key)) result[key] = item as JsonValue;
  }
  return result;
}

/** JSON aux clés triées : deux objets égaux donnent le même texte, quel que soit leur ordre. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item) && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  );
}
