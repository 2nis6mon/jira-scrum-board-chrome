import { JiraError } from "./errors";
import {
  decodeJqlMatches,
  decodeJqlReference,
  decodeJqlValidation,
  decodeJqlValues,
  type JiraJqlMatch,
  type JiraJqlReference,
  type JiraJqlValidation,
  type JiraJqlValue,
} from "./jql";
import { isRecord, type JsonValue } from "./json";
import {
  decodeIssue,
  decodeSprint,
  decodeStatus,
  decodeTransition,
  decodeUser,
  type JiraIssue,
  type JiraSprint,
  type JiraStatus,
  type JiraTransition,
  type JiraUser,
} from "./models";
import type { JiraTransport } from "./transport";
import {
  assertEntityId,
  assertIssueKey,
  type BoardPropertyKey,
  boardPropertyPath,
  type SprintPropertyKey,
  sprintPropertyPath,
} from "./writes";

export interface JiraBoardChoice {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly projectKey: string | null;
}

/** Champ Jira, tel que listé par `GET /rest/api/3/field`. */
export interface JiraField {
  readonly id: string;
  readonly name: string;
  readonly schemaType: string | null;
  /** Type technique d'un champ personnalisé (`…:multicheckboxes`, par exemple). */
  readonly schemaCustom: string | null;
}

/** Filtre rapide défini sur le board Jira. Son JQL est évalué par Jira, jamais interprété ici. */
export interface JiraQuickFilter {
  readonly id: number;
  readonly name: string;
  readonly jql: string;
  readonly description: string | null;
  readonly position: number;
}

/** Ce que Jira déclare d'un board : `board/{id}` et `board/{id}/configuration` réunis. */
export interface JiraBoardStructure {
  readonly boardId: number;
  readonly boardName: string;
  readonly boardType: string;
  /** Sous-filtre natif Kanban (`configuration.subQuery.query`), évalué par Jira. */
  readonly kanbanSubQuery: string | null;
  readonly projectKey: string | null;
  readonly columns: readonly {
    readonly name: string;
    readonly statusIds: readonly string[];
    /** Limite WIP native de la colonne. */
    readonly max: number | null;
  }[];
  /** Champ d'estimation déclaré par le board (`estimation.field.fieldId`). */
  readonly estimationFieldId: string | null;
}

export interface IssueQuery {
  readonly estimationFieldId: string | null;
  readonly includeChangelog: boolean;
  readonly extraFieldIds?: readonly string[];
  /**
   * Remplace la liste de champs de base, pour une lecture qui n'a besoin que de quelques champs.
   * `status` et `issuetype` doivent en faire partie : un ticket ne se décode pas sans eux.
   */
  readonly onlyFields?: readonly string[];
}

/** Champs de base demandés à Jira. On ne récupère que le nécessaire. */
const BASE_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "assignee",
  "priority",
  "labels",
  "components",
  "issuelinks",
  "subtasks",
  "created",
  "updated",
  "parent",
];

export function fieldList(
  estimationFieldId: string | null,
  extraFieldIds: readonly string[] = [],
): string {
  const fields = [
    ...BASE_FIELDS,
    ...(estimationFieldId ? [estimationFieldId] : []),
    ...extraFieldIds,
  ];
  return [...new Set(fields)].join(",");
}

/**
 * Identifiant du champ Jira portant les Goals Atlassian, s'il est exposé. Repéré par son nom ou
 * par son type de champ, jamais codé en dur.
 */
export function goalsFieldId(fields: readonly JiraField[]): string | null {
  const exact = fields.find((field) => field.name.toLowerCase() === "goals");
  if (exact) return exact.id;
  const byType = fields.find((field) => {
    const custom = field.schemaCustom?.toLowerCase() ?? "";
    return custom.includes("goal") || custom.includes("townsquare");
  });
  if (byType) return byType.id;
  return fields.find((field) => field.name.toLowerCase().includes("goal"))?.id ?? null;
}

/**
 * Identifiant du champ « Flagged » de Jira (le drapeau « Impediment » posé par « Ajouter un
 * drapeau »). Champ personnalisé dont l'identifiant varie d'une instance à l'autre : repéré par
 * son nom, anglais ou français.
 */
export function flaggedFieldId(fields: readonly JiraField[]): string | null {
  const names = new Set(["flagged", "signalé", "signale", "marqué", "marqué d'un drapeau"]);
  const candidates = fields.filter((field) => names.has(field.name.toLowerCase()));
  // À nom égal, on préfère le champ à cases à cocher : c'est le type du champ natif.
  const checkbox = candidates.find((field) => field.schemaCustom?.includes("multicheckboxes"));
  return (checkbox ?? candidates[0])?.id ?? null;
}

const SPRINT_PAGE_SIZE = 50;
const ISSUE_PAGE_SIZE = 100;
/** Garde-fous de pagination : on s'arrête plutôt que de boucler sur une réponse incohérente. */
const MAX_SPRINTS = 2000;
const MAX_QUICK_FILTERS = 500;
const MAX_ISSUES = 5000;
/** Boards parcourus au plus pour retrouver les droits sur un board (recherche par nom). */
const MAX_BOARD_SEARCH = 500;

/**
 * Lectures REST de Jira Cloud. Portée limitée aux endpoints vérifiés dans
 * DEVELOPER.md (section Contrats API). Aucune écriture ici : elles passent
 * toutes par `JiraTransport.write` et l'inventaire `writes.ts`.
 */
export class JiraClient {
  readonly #transport: JiraTransport;

  constructor(transport: JiraTransport) {
    this.#transport = transport;
  }

  get site() {
    return this.#transport.site;
  }

  /** Préférence de langue Atlassian du compte courant ; aucun réglage Jira n'est modifié. */
  async locale(): Promise<string> {
    const { body } = await this.#transport.get("/rest/api/3/mypreferences/locale", {
      resource: "la langue Jira",
    });
    if (
      !isRecord(body) ||
      typeof body.locale !== "string" ||
      !/^[a-z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(body.locale)
    )
      return decodingFailure("locale", "locale absente ou invalide");
    return body.locale;
  }

  /** Analyse et validation sémantique dans les droits de la session Jira courante. */
  async validateJql(jql: string): Promise<JiraJqlValidation> {
    const { body } = await this.#transport.readByPost(
      "/rest/api/3/jql/parse",
      { queries: [jql] },
      {
        query: { validation: "strict" },
        resource: "la validation JQL",
      },
    );
    return decodeJqlValidation(body);
  }

  async jqlAutocompleteData(): Promise<JiraJqlReference> {
    const { body } = await this.#transport.get("/rest/api/3/jql/autocompletedata", {
      resource: "l'aide à la saisie JQL",
    });
    return decodeJqlReference(body);
  }

  async jqlValueSuggestions(field: string, value: string): Promise<JiraJqlValue[]> {
    const { body } = await this.#transport.get("/rest/api/3/jql/autocompletedata/suggestions", {
      query: { fieldName: field, fieldValue: value },
      resource: "les suggestions JQL",
    });
    return decodeJqlValues(body);
  }

  /** Lecture seule : au plus 50 tickets et 10 requêtes par appel (contrat Atlassian). */
  async matchJql(issueIds: readonly string[], jqls: readonly string[]): Promise<JiraJqlMatch[]> {
    if (issueIds.length > 50 || jqls.length > 10 || issueIds.length === 0 || jqls.length === 0) {
      throw new Error("Une correspondance JQL accepte de 1 à 50 tickets et de 1 à 10 requêtes.");
    }
    const ids = issueIds.map((id) => {
      const number = Number(id);
      if (!/^\d+$/.test(id) || !Number.isSafeInteger(number) || number <= 0)
        throw new Error("Identifiant de ticket invalide.");
      return number;
    });
    const { body } = await this.#transport.readByPost(
      "/rest/api/3/jql/match",
      { issueIds: ids, jqls: [...jqls] },
      { resource: "les correspondances JQL" },
    );
    return decodeJqlMatches(body, jqls.length);
  }

  /** Compte Jira de la session du navigateur. Sert aussi de test de connexion. */
  async myself(): Promise<JiraUser> {
    const { body } = await this.#transport.get("/rest/api/3/myself", {
      resource: "votre compte Jira",
    });
    return decodeUser(body) ?? decodingFailure("myself", "displayName absent");
  }

  /** Recherche native par nom, limitée aux cinq premiers boards accessibles, Scrum et Kanban.
   * Paramètres vérifiés : developer.atlassian.com/cloud/jira/software/rest/api-group-board/
   */
  async searchBoards(name: string): Promise<JiraBoardChoice[]> {
    if (!name.trim()) return [];
    const { body } = await this.#transport.get("/rest/agile/1.0/board", {
      query: { name: name.trim(), startAt: "0", maxResults: "5" },
      resource: "les boards accessibles",
    });
    if (!isRecord(body) || !Array.isArray(body.values)) decodingFailure("boards", "values absent");
    return body.values.slice(0, 5).map((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== "number" ||
        !Number.isSafeInteger(item.id) ||
        item.id <= 0 ||
        typeof item.name !== "string"
      ) {
        return decodingFailure("boards", "identifiant ou nom absent");
      }
      const location = isRecord(item.location) ? item.location : {};
      return {
        id: item.id,
        name: item.name,
        type: typeof item.type === "string" ? item.type : "",
        projectKey: typeof location.projectKey === "string" ? location.projectKey : null,
      };
    });
  }

  /**
   * Le compte peut-il modifier ce board (et donc écrire ses propriétés) ? Champ `canEdit` du board,
   * rempli par `GET /rest/agile/1.0/board` avec `expand=permissions` (spécification OpenAPI de Jira
   * Software vérifiée le 24/09/2026 : « Valid values: admins, permissions », `canEdit` : « Whether
   * the board can be edited »). La liste est filtrée par nom (et projet) puis le board retrouvé
   * par identifiant. `null` : board introuvable dans la liste ou champ absent — on ne sait pas.
   */
  async boardCanEdit(
    boardId: number,
    name: string,
    projectKey: string | null,
  ): Promise<boolean | null> {
    assertEntityId(boardId, "board");
    let startAt = 0;
    for (;;) {
      const { body } = await this.#transport.get("/rest/agile/1.0/board", {
        query: {
          name,
          ...(projectKey ? { projectKeyOrId: projectKey } : {}),
          expand: "permissions",
          startAt: String(startAt),
          maxResults: "50",
        },
        resource: `les droits sur le board ${boardId}`,
      });
      if (!isRecord(body) || !Array.isArray(body.values)) {
        decodingFailure("boards", "values absent");
      }
      const found = body.values.find((item) => isRecord(item) && item.id === boardId);
      if (found && isRecord(found)) {
        return typeof found.canEdit === "boolean" ? found.canEdit : null;
      }
      if (body.isLast === true || body.values.length === 0) return null;
      startAt += body.values.length;
      if (startAt >= MAX_BOARD_SEARCH) return null;
    }
  }

  async boardStructure(boardId: number): Promise<JiraBoardStructure> {
    assertEntityId(boardId, "board");
    const board = await this.#transport.get(`/rest/agile/1.0/board/${boardId}`, {
      resource: `le board ${boardId}`,
    });
    const configuration = await this.#transport.get(
      `/rest/agile/1.0/board/${boardId}/configuration`,
      { resource: `la configuration du board ${boardId}` },
    );
    return decodeBoardStructure(boardId, board.body, configuration.body);
  }

  async statuses(): Promise<JiraStatus[]> {
    const { body } = await this.#transport.get("/rest/api/3/status", {
      resource: "les statuts Jira",
    });
    if (!Array.isArray(body)) decodingFailure("statuses", "tableau attendu");
    return body.map(decodeStatus).filter((status): status is JiraStatus => status !== null);
  }

  async fields(): Promise<JiraField[]> {
    const { body } = await this.#transport.get("/rest/api/3/field", {
      resource: "les champs Jira",
    });
    if (!Array.isArray(body)) decodingFailure("fields", "tableau attendu");
    const fields: JiraField[] = [];
    for (const item of body) {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
      const schema = isRecord(item.schema) ? item.schema : {};
      fields.push({
        id: item.id,
        name: item.name,
        schemaType: typeof schema.type === "string" ? schema.type : null,
        schemaCustom: typeof schema.custom === "string" ? schema.custom : null,
      });
    }
    return fields;
  }

  /** Sprints du board. `states` accepte `active`, `future`, `closed`. */
  async sprints(boardId: number, states: readonly string[]): Promise<JiraSprint[]> {
    assertEntityId(boardId, "board");
    const result: JiraSprint[] = [];
    let startAt = 0;
    for (;;) {
      const { body } = await this.#transport.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
        query: {
          startAt: String(startAt),
          maxResults: String(SPRINT_PAGE_SIZE),
          ...(states.length > 0 ? { state: states.join(",") } : {}),
        },
        resource: `les sprints du board ${boardId}`,
      });
      if (!isRecord(body) || !Array.isArray(body.values))
        decodingFailure("sprints", "values absent");
      result.push(...body.values.map(decodeSprint));

      if (body.isLast === true || body.values.length === 0) break;
      startAt += body.values.length;
      if (typeof body.total === "number" && startAt >= body.total) break;
      if (startAt > MAX_SPRINTS) break;
    }
    return result;
  }

  /** Relecture du sprint avant publication du planning : l'état et le texte natif font foi. */
  async sprint(sprintId: number): Promise<JiraSprint> {
    assertEntityId(sprintId, "sprint");
    const { body } = await this.#transport.get(`/rest/agile/1.0/sprint/${sprintId}`, {
      resource: `le sprint ${sprintId}`,
    });
    return decodeSprint(body);
  }

  /**
   * Backlog sans sprint futur/actif. Contrat Software « enhanced », vérifié le 14/10/2026 :
   * pagination par jeton, filtre du board conservé, ordre natif du rang.
   */
  async backlogIssues(boardId: number, query: IssueQuery): Promise<JiraIssue[]> {
    assertEntityId(boardId, "board");
    const fields = query.onlyFields
      ? [...new Set(query.onlyFields)].join(",")
      : fieldList(query.estimationFieldId, query.extraFieldIds);
    const result: JiraIssue[] = [];
    const seenKeys = new Set<string>();
    const seenTokens = new Set<string>();
    let nextPageToken: string | null = null;
    for (;;) {
      const { body } = await this.#transport.get(`/rest/software/1.0/board/${boardId}/backlog`, {
        query: {
          maxResults: String(ISSUE_PAGE_SIZE),
          fields,
          ...(query.includeChangelog ? { expand: "changelog" } : {}),
          ...(nextPageToken ? { nextPageToken } : {}),
        },
        resource: `le backlog du board ${boardId}`,
      });
      if (!isRecord(body) || !Array.isArray(body.issues))
        decodingFailure("backlog", "issues absent");
      for (const raw of body.issues) {
        const issue = decodeIssue(raw);
        if (seenKeys.has(issue.key)) {
          throw new Error("Chargement incomplet : Jira a répété des tickets du backlog.");
        }
        seenKeys.add(issue.key);
        result.push(issue);
      }
      if (result.length > MAX_ISSUES) {
        throw new Error(`Le backlog dépasse la limite de ${MAX_ISSUES} tickets.`);
      }
      const token = typeof body.nextPageToken === "string" ? body.nextPageToken : null;
      if (body.isLast === true) break;
      if (!token || seenTokens.has(token) || body.issues.length === 0) {
        throw new Error("Chargement incomplet : la pagination du backlog Jira est incohérente.");
      }
      if (result.length >= MAX_ISSUES) {
        throw new Error(`Le backlog dépasse la limite de ${MAX_ISSUES} tickets.`);
      }
      seenTokens.add(token);
      nextPageToken = token;
    }
    return result;
  }

  /**
   * Filtres rapides du board, dans l'ordre de Jira. `GET /rest/agile/1.0/board/{id}/quickfilter`
   * est absent de ATLASSIAN-API-CAPABILITIES.md ; forme vérifiée dans la spécification OpenAPI de
   * Jira Software (`values[]` : `id`, `name`, `jql`, `description`, `position`).
   */
  async quickFilters(boardId: number): Promise<JiraQuickFilter[]> {
    assertEntityId(boardId, "board");
    const result: JiraQuickFilter[] = [];
    let startAt = 0;
    for (;;) {
      const { body } = await this.#transport.get(`/rest/agile/1.0/board/${boardId}/quickfilter`, {
        query: { startAt: String(startAt), maxResults: String(SPRINT_PAGE_SIZE) },
        resource: `les filtres rapides du board ${boardId}`,
      });
      if (!isRecord(body) || !Array.isArray(body.values))
        decodingFailure("quickfilter", "values absent");
      for (const value of body.values) {
        const filter = decodeQuickFilter(value);
        if (filter) result.push(filter);
      }
      if (body.isLast === true || body.values.length === 0) break;
      startAt += body.values.length;
      if (typeof body.total === "number" && startAt >= body.total) break;
      if (startAt > MAX_QUICK_FILTERS) break;
    }
    return result.sort((a, b) => a.position - b.position);
  }

  /**
   * Tickets d'un sprint vus depuis le board : `GET /rest/agile/1.0/board/{boardId}/sprint/
   * {sprintId}/issue` (spécification OpenAPI de Jira Software, vérifiée le 24/09/2026 : « issues
   * […] that belong to the sprint from the board », mêmes paramètres que `sprint/{id}/issue`).
   * L'ancienne lecture par le sprint seul ramenait aussi les tickets des autres boards du sprint.
   */
  sprintIssues(boardId: number, sprintId: number, query: IssueQuery): Promise<JiraIssue[]> {
    assertEntityId(boardId, "board");
    assertEntityId(sprintId, "sprint");
    return this.#paginatedIssues(
      `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`,
      null,
      query,
      `les tickets du sprint ${sprintId} sur le board ${boardId}`,
    );
  }

  /** Tickets du board, éventuellement restreints par un JQL que Jira évalue lui-même. */
  boardIssues(boardId: number, jql: string | null, query: IssueQuery): Promise<JiraIssue[]> {
    assertEntityId(boardId, "board");
    return this.#paginatedIssues(
      `/rest/agile/1.0/board/${boardId}/issue`,
      jql,
      query,
      `les tickets du board ${boardId}`,
    );
  }

  /** Statut actuel d'un ticket dans Jira : relu juste avant une transition. */
  async issueStatus(issueKey: string): Promise<JiraStatus> {
    assertIssueKey(issueKey);
    const { body } = await this.#transport.get(`/rest/api/3/issue/${issueKey}`, {
      query: { fields: "status" },
      resource: `le ticket ${issueKey}`,
    });
    const fields = isRecord(body) ? body.fields : null;
    return (
      decodeStatus(isRecord(fields) ? fields.status : null) ??
      decodingFailure(`ticket ${issueKey}`, "statut absent")
    );
  }

  /**
   * Transitions que Jira propose depuis le statut COURANT du ticket, avec les champs exigés par
   * leur écran. Le graphe complet du workflow n'est pas lisible sans droits d'administration.
   */
  async transitions(issueKey: string): Promise<JiraTransition[]> {
    assertIssueKey(issueKey);
    const { body } = await this.#transport.get(`/rest/api/3/issue/${issueKey}/transitions`, {
      query: { expand: "transitions.fields", sortByOpsBarAndStatus: "true" },
      resource: `les transitions de ${issueKey}`,
    });
    if (!isRecord(body) || !Array.isArray(body.transitions)) {
      decodingFailure("transitions", "transitions absent");
    }
    return body.transitions.map(decodeTransition);
  }

  /**
   * Lit une propriété d'entité du board. `null` si elle n'existe pas encore. Endpoint vérifié
   * dans la spécification OpenAPI de Jira Software (19/09/2026) : lecture pour qui voit le board.
   */
  async boardProperty(boardId: number, key: BoardPropertyKey): Promise<JsonValue | null> {
    try {
      const { body } = await this.#transport.get(boardPropertyPath(boardId, key), {
        resource: `les réglages d'équipe du board ${boardId}`,
      });
      return isRecord(body) && body.value !== undefined ? (body.value as JsonValue) : null;
    } catch (error) {
      // Absence normale : personne n'a encore publié de réglages d'équipe sur ce board.
      if (error instanceof JiraError && error.info.kind === "notFound") return null;
      throw error;
    }
  }

  /** Lit une propriété d'entité du sprint. `null` si elle n'existe pas encore. */
  async sprintProperty(sprintId: number, key: SprintPropertyKey): Promise<JsonValue | null> {
    try {
      const { body } = await this.#transport.get(sprintPropertyPath(sprintId, key), {
        resource: `la propriété « ${key} » du sprint ${sprintId}`,
      });
      return isRecord(body) && body.value !== undefined ? (body.value as JsonValue) : null;
    } catch (error) {
      // Absence normale : rien n'a encore été enregistré sur ce sprint.
      if (error instanceof JiraError && error.info.kind === "notFound") return null;
      throw error;
    }
  }

  async #paginatedIssues(
    path: string,
    jql: string | null,
    query: IssueQuery,
    resource: string,
  ): Promise<JiraIssue[]> {
    const fields = query.onlyFields
      ? [...new Set(query.onlyFields)].join(",")
      : fieldList(query.estimationFieldId, query.extraFieldIds);
    const result: JiraIssue[] = [];
    const seenKeys = new Set<string>();
    let startAt = 0;
    for (;;) {
      const { body } = await this.#transport.get(path, {
        query: {
          startAt: String(startAt),
          maxResults: String(ISSUE_PAGE_SIZE),
          fields,
          ...(query.includeChangelog ? { expand: "changelog" } : {}),
          ...(jql !== null && jql.trim() !== "" ? { jql } : {}),
        },
        resource,
      });
      if (!isRecord(body) || !Array.isArray(body.issues))
        decodingFailure("issues", "issues absent");
      if (typeof body.startAt === "number" && body.startAt !== startAt) {
        throw new Error(
          "Chargement incomplet : Jira a renvoyé une page de tickets inattendue. Actualisez le board.",
        );
      }
      const total = typeof body.total === "number" ? body.total : null;
      if (body.issues.length === 0) {
        if (total !== null && startAt < total) {
          throw new Error(
            "Chargement incomplet : Jira a renvoyé une page vide avant la fin des tickets. Actualisez le board.",
          );
        }
        break;
      }
      const page = body.issues.map(decodeIssue);
      // Une page répétée ne doit pas gonfler les compteurs ni masquer des tickets manquants.
      for (const issue of page) {
        if (seenKeys.has(issue.key)) {
          throw new Error(
            "Chargement incomplet : la pagination Jira contient des tickets répétés. Actualisez le board.",
          );
        }
        seenKeys.add(issue.key);
      }
      result.push(...page);
      startAt += body.issues.length;
      if (total !== null && startAt >= total) break;
      if (startAt >= MAX_ISSUES) {
        throw new Error(
          `Chargement incomplet : le périmètre dépasse la limite de ${MAX_ISSUES} tickets. Réduisez le filtre du board dans Jira.`,
        );
      }
    }
    return result;
  }
}

function decodeBoardStructure(
  boardId: number,
  board: JsonValue | null,
  configuration: JsonValue | null,
): JiraBoardStructure {
  if (!isRecord(board) || typeof board.name !== "string") decodingFailure("board", "name absent");
  if (!isRecord(configuration) || !isRecord(configuration.columnConfig)) {
    decodingFailure("boardConfiguration", "columnConfig absent");
  }
  const rawColumns = configuration.columnConfig.columns;
  if (!Array.isArray(rawColumns)) decodingFailure("boardConfiguration", "columns absent");

  const columns = rawColumns.flatMap((column) => {
    if (!isRecord(column) || typeof column.name !== "string") return [];
    const statuses = Array.isArray(column.statuses) ? column.statuses : [];
    return [
      {
        name: column.name,
        statusIds: statuses.flatMap((status) =>
          isRecord(status) && typeof status.id === "string" ? [status.id] : [],
        ),
        max: typeof column.max === "number" ? column.max : null,
      },
    ];
  });

  const location = isRecord(board.location) ? board.location : {};
  const estimation = isRecord(configuration.estimation) ? configuration.estimation : {};
  const estimationField = isRecord(estimation.field) ? estimation.field : {};
  const subQuery = isRecord(configuration.subQuery) ? configuration.subQuery : {};
  return {
    boardId,
    boardName: board.name,
    boardType: typeof board.type === "string" ? board.type : "",
    kanbanSubQuery:
      board.type === "kanban" && typeof subQuery.query === "string" && subQuery.query.trim()
        ? subQuery.query
        : null,
    projectKey: typeof location.projectKey === "string" ? location.projectKey : null,
    columns,
    estimationFieldId: typeof estimationField.fieldId === "string" ? estimationField.fieldId : null,
  };
}

/** Un filtre sans identifiant ni nom est ignoré : on ne saurait ni l'afficher ni l'appliquer. */
function decodeQuickFilter(value: unknown): JiraQuickFilter | null {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.name !== "string") {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    jql: typeof value.jql === "string" ? value.jql : "",
    description:
      typeof value.description === "string" && value.description.trim() !== ""
        ? value.description
        : null,
    position: typeof value.position === "number" ? value.position : 0,
  };
}

function decodingFailure(context: string, detail: string): never {
  throw new JiraError({ kind: "decoding", context, detail });
}
