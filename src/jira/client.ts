import { JiraError } from "./errors";
import { isRecord, type JsonValue } from "./json";
import {
  decodeIssue,
  decodeSprint,
  decodeStatus,
  decodeUser,
  type JiraIssue,
  type JiraSprint,
  type JiraStatus,
  type JiraUser,
} from "./models";
import type { JiraTransport } from "./transport";
import { assertEntityId, type SprintPropertyKey, sprintPropertyPath } from "./writes";

/** Champ Jira, tel que listé par `GET /rest/api/3/field`. */
export interface JiraField {
  readonly id: string;
  readonly name: string;
  readonly schemaType: string | null;
  /** Type technique d'un champ personnalisé (`…:multicheckboxes`, par exemple). */
  readonly schemaCustom: string | null;
}

/** Ce que Jira déclare d'un board : `board/{id}` et `board/{id}/configuration` réunis. */
export interface JiraBoardStructure {
  readonly boardId: number;
  readonly boardName: string;
  readonly boardType: string;
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
const MAX_ISSUES = 5000;

/**
 * Lectures REST de Jira Cloud. Portée limitée aux endpoints vérifiés dans
 * docs/reference-app-mac/ATLASSIAN-API-CAPABILITIES.md. Aucune écriture ici : elles passent
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

  /** Compte Jira de la session du navigateur. Sert aussi de test de connexion. */
  async myself(): Promise<JiraUser> {
    const { body } = await this.#transport.get("/rest/api/3/myself", {
      resource: "votre compte Jira",
    });
    return decodeUser(body) ?? decodingFailure("myself", "displayName absent");
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

  sprintIssues(sprintId: number, query: IssueQuery): Promise<JiraIssue[]> {
    assertEntityId(sprintId, "sprint");
    return this.#paginatedIssues(
      `/rest/agile/1.0/sprint/${sprintId}/issue`,
      null,
      query,
      `les tickets du sprint ${sprintId}`,
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
      result.push(...body.issues.map(decodeIssue));

      if (body.issues.length === 0) break;
      startAt += body.issues.length;
      if (typeof body.total === "number" && startAt >= body.total) break;
      if (startAt > MAX_ISSUES) break;
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
  return {
    boardId,
    boardName: board.name,
    boardType: typeof board.type === "string" ? board.type : "",
    projectKey: typeof location.projectKey === "string" ? location.projectKey : null,
    columns,
    estimationFieldId: typeof estimationField.fieldId === "string" ? estimationField.fieldId : null,
  };
}

function decodingFailure(context: string, detail: string): never {
  throw new JiraError({ kind: "decoding", context, detail });
}
