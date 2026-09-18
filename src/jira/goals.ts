import { JiraError } from "./errors";
import { isRecord, type JsonObject, type JsonValue } from "./json";
import type { AtlassianGoal } from "./models";
import type { JiraTransport } from "./transport";
import { buildGraphqlWrite, type GraphqlWrite } from "./writes";

// Client de l'API GraphQL Goals d'Atlassian. Portage de GoalsClient.swift (app Mac).
//
// RIEN n'est supposé du schéma : le nom réel du type des objectifs (`TownsquareGoal` sur Jira
// Cloud), ses champs, leur nature (scalaire, objet, INTERFACE), la forme du lien Goal → tickets
// et ses arguments sont découverts par introspection. Une instance au schéma différent dégrade
// l'affichage au lieu de faire échouer la requête entière.
//
// La passerelle `/gateway/api/graphql` n'accepte les requêtes de l'extension qu'avec la règle
// `Origin` posée par l'interface (voir app/platform/originRule.ts).

/** Résultat d'une mutation de rattachement : GraphQL répond 200 même quand il refuse. */
export interface LinkOutcome {
  readonly success: boolean;
  readonly messages: string[];
}

interface TypeRef {
  readonly name: string;
  readonly kind: string;
}

interface FieldInfo {
  readonly name: string;
  readonly type: TypeRef | null;
}

interface FieldArgument {
  readonly name: string;
  readonly required: boolean;
}

/** Fragment d'introspection qui déballe les enveloppes `NON_NULL` et `LIST`. */
const TYPE_REF =
  "kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }";

/**
 * Champs que l'application sait afficher, par ordre de préférence. Leur nature est lue dans le
 * schéma : un même nom peut être scalaire sur une instance et objet sur une autre.
 */
const DISPLAY_CANDIDATES = [
  "key",
  "name",
  "title",
  "summary",
  "url",
  "isArchived",
  "status",
  "state",
  "targetDate",
  "dueDate",
  "owner",
];
/** Sous-champs acceptables pour tirer un libellé d'un champ composite. */
const LABEL_CANDIDATES = ["label", "name", "displayName", "value", "text"];
/** `owner` est une INTERFACE (`User`) : l'oublier fait disparaître le propriétaire. */
const COMPOSITE_KINDS = new Set(["OBJECT", "INTERFACE", "UNION"]);
/** Garde-fou de pagination de `goals_search`. */
const MAX_PAGES = 20;
/** Taille des lots d'identifiants envoyés à `goals_byIds`. */
const IDS_PER_REQUEST = 50;

export class GoalsClient {
  readonly #transport: JiraTransport;
  #cloudId: string | null = null;
  #containerId: string | null = null;
  #goalTypeName: string | null | undefined;
  #connectionTypeName: string | null = null;
  #selection: string | null = null;
  #pagination: { hasNext: string; cursor: string } | null | undefined;
  #workItemsSelection: string | null | undefined;
  /** Forme d'identifiant de ticket acceptée par les mutations, une fois trouvée. */
  #workItemForm: "ari" | "raw" | null = null;
  readonly #typeFields = new Map<string, Promise<FieldInfo[]>>();

  /** Pourquoi le lien Goal → tickets n'a pas pu être lu, s'il y a une raison. */
  lastWorkItemsIssue: string | null = null;

  constructor(transport: JiraTransport) {
    this.#transport = transport;
  }

  /** Exécute une requête de LECTURE et rend `data`. Les erreurs GraphQL sont remontées. */
  async #execute(
    operation: string,
    variables: JsonObject = {},
  ): Promise<Record<string, JsonValue>> {
    const { body } = await this.#transport.graphqlQuery(operation, variables, {
      resource: "l'API Goals d'Atlassian",
    });
    return graphqlData(body);
  }

  // ─── Site ──────────────────────────────────────────────────────────────────

  /** Identifiant cloud du site, par la requête documentée `tenantContexts`. */
  async cloudId(): Promise<string> {
    if (this.#cloudId) return this.#cloudId;
    const data = await this.#execute(
      "query siteCloudId($hosts: [String!]!) { tenantContexts(hostNames: $hosts) { cloudId } }",
      { hosts: [this.#transport.site.host] },
    );
    const contexts = data.tenantContexts;
    const first: unknown = Array.isArray(contexts) ? contexts[0] : null;
    if (!isRecord(first) || typeof first.cloudId !== "string" || first.cloudId === "") {
      throw new JiraError({
        kind: "decoding",
        context: "identifiant du site",
        detail: "tenantContexts vide",
      });
    }
    this.#cloudId = first.cloudId;
    return first.cloudId;
  }

  /**
   * ARI de site candidats : `goals_search` accepte l'ARI « goal » et l'ancien ARI « townsquare »,
   * sans gabarit publié. Les deux sont essayés ; celui qui répond est retenu.
   */
  static containerCandidates(cloudId: string): string[] {
    return [`ari:cloud:goal::site/${cloudId}`, `ari:cloud:townsquare::site/${cloudId}`];
  }

  // ─── Introspection ─────────────────────────────────────────────────────────

  #fields(typeName: string): Promise<FieldInfo[]> {
    const cached = this.#typeFields.get(typeName);
    if (cached) return cached;
    const pending = this.#execute(
      `query typeFields($name: String!) { __type(name: $name) { fields { name type { ${TYPE_REF} } } } }`,
      { name: typeName },
    ).then((data) => {
      const type = data.__type;
      const fields = isRecord(type) && Array.isArray(type.fields) ? type.fields : [];
      return fields.flatMap((field) =>
        isRecord(field) && typeof field.name === "string"
          ? [{ name: field.name, type: namedType(field.type) }]
          : [],
      );
    });
    this.#typeFields.set(typeName, pending);
    pending.catch(() => this.#typeFields.delete(typeName));
    return pending;
  }

  async #arguments(fieldName: string, typeName: string): Promise<FieldArgument[]> {
    try {
      const data = await this.#execute(
        `query fieldArgs($name: String!) { __type(name: $name) { fields { name args { name type { ${TYPE_REF} } } } } }`,
        { name: typeName },
      );
      const type = data.__type;
      const fields = isRecord(type) && Array.isArray(type.fields) ? type.fields : [];
      const field = fields.find((candidate) => isRecord(candidate) && candidate.name === fieldName);
      const args = isRecord(field) && Array.isArray(field.args) ? field.args : [];
      return args.flatMap((arg) =>
        isRecord(arg) && typeof arg.name === "string"
          ? [{ name: arg.name, required: isRecord(arg.type) && arg.type.kind === "NON_NULL" }]
          : [],
      );
    } catch {
      return [];
    }
  }

  /**
   * Nom réel du type des objectifs, découvert en suivant `goals_search` → `edges` → `node`.
   * Deviner « Goal » produisait une introspection vide et une requête réduite à `id`.
   */
  async goalTypeName(): Promise<string | null> {
    if (this.#goalTypeName !== undefined) return this.#goalTypeName;
    const data = await this.#execute(
      `query rootFields { __schema { queryType { fields { name type { ${TYPE_REF} } } } } }`,
    );
    const schema = data.__schema;
    const queryType = isRecord(schema) ? schema.queryType : null;
    const rootFields =
      isRecord(queryType) && Array.isArray(queryType.fields) ? queryType.fields : [];
    const search = rootFields.find((field) => isRecord(field) && field.name === "goals_search");
    const connection = isRecord(search) ? namedType(search.type)?.name : undefined;

    let goalType: string | null = null;
    if (connection) {
      this.#connectionTypeName = connection;
      const edges = (await this.#fields(connection)).find((field) => field.name === "edges")?.type
        ?.name;
      const node = edges
        ? (await this.#fields(edges)).find((field) => field.name === "node")?.type?.name
        : undefined;
      goalType = node ?? null;
    }
    this.#goalTypeName = goalType;
    return goalType;
  }

  /** Noms des champs réellement exposés par le type des objectifs (au moins `id`). */
  async availableGoalFields(): Promise<string[]> {
    const typeName = await this.goalTypeName();
    const fields = typeName ? await this.#fields(typeName) : [];
    return fields.length === 0 ? ["id"] : fields.map((field) => field.name);
  }

  /** Sélection GraphQL construite à partir du schéma réel ; `id` au minimum. */
  async #buildSelection(): Promise<string> {
    if (this.#selection !== null) return this.#selection;
    const typeName = await this.goalTypeName();
    const byName = new Map(
      (typeName ? await this.#fields(typeName) : []).map((field) => [field.name, field]),
    );

    const lines = ["id"];
    for (const candidate of DISPLAY_CANDIDATES) {
      const field = byName.get(candidate);
      if (!field?.type) continue;
      if (field.type.kind === "SCALAR" || field.type.kind === "ENUM") {
        lines.push(candidate);
        continue;
      }
      if (!COMPOSITE_KINDS.has(field.type.kind)) continue;
      const subFields = new Set(
        (await this.#fields(field.type.name).catch(() => [])).map((sub) => sub.name),
      );
      const label = LABEL_CANDIDATES.find((name) => subFields.has(name));
      // Sans libellé exploitable, on omet le champ plutôt que d'émettre une requête invalide.
      if (label) lines.push(`${candidate} { ${label} }`);
    }
    this.#selection = lines.join(" ");
    return this.#selection;
  }

  /** Champs de pagination de la connexion, s'ils existent : aucun nom n'est supposé. */
  async #paginationFields(): Promise<{ hasNext: string; cursor: string } | null> {
    if (this.#pagination !== undefined) return this.#pagination;
    let result: { hasNext: string; cursor: string } | null = null;
    const connection = this.#connectionTypeName;
    if (connection) {
      const pageInfo = (await this.#fields(connection).catch(() => [])).find(
        (field) => field.name === "pageInfo",
      );
      if (pageInfo?.type) {
        const names = new Set(
          (await this.#fields(pageInfo.type.name).catch(() => [])).map((field) => field.name),
        );
        const cursor = ["endCursor", "nextCursor", "cursor"].find((name) => names.has(name));
        if (names.has("hasNextPage") && cursor) result = { hasNext: "hasNextPage", cursor };
      }
    }
    this.#pagination = result;
    return result;
  }

  // ─── Lectures ──────────────────────────────────────────────────────────────

  /**
   * Objectifs du site. `tql` est transmis tel quel à Atlassian s'il n'est pas vide. Avec
   * `loadAll`, la pagination est suivie jusqu'au bout quand la connexion l'expose.
   */
  async searchGoals(
    options: { tql?: string; limit?: number; loadAll?: boolean } = {},
  ): Promise<AtlassianGoal[]> {
    const cloudId = await this.cloudId();
    const selection = await this.#buildSelection();
    const pagination = options.loadAll ? await this.#paginationFields() : null;
    const pageInfo = pagination ? `pageInfo { ${pagination.hasNext} ${pagination.cursor} }` : "";
    const operation = `query searchGoals($containerId: ID!, $q: String, $first: Int, $after: String) {
  goals_search(containerId: $containerId, searchString: $q, first: $first, after: $after) {
    ${pageInfo} edges { node { ${selection} } }
  }
}`;

    const containers = this.#containerId
      ? [this.#containerId]
      : GoalsClient.containerCandidates(cloudId);
    let lastError: unknown = null;
    for (const containerId of containers) {
      try {
        const collected: AtlassianGoal[] = [];
        let after: string | null = null;
        for (let page = 0; page < MAX_PAGES; page++) {
          const data = await this.#execute(operation, {
            containerId,
            q: options.tql ?? "",
            first: options.limit ?? 50,
            after,
          });
          const search = data.goals_search;
          if (!isRecord(search) || !Array.isArray(search.edges)) {
            throw new JiraError({
              kind: "decoding",
              context: "goals_search",
              detail: "edges absent",
            });
          }
          for (const edge of search.edges) {
            const goal = isRecord(edge) ? parseGoal(edge.node) : null;
            if (goal) collected.push(goal);
          }
          if (!pagination || !isRecord(search.pageInfo)) break;
          const info = search.pageInfo;
          const next = info[pagination.cursor];
          if (info[pagination.hasNext] !== true || typeof next !== "string" || next === "") break;
          after = next;
        }
        this.#containerId = containerId;
        return collected;
      } catch (error) {
        lastError = error; // ARI de site suivant
      }
    }
    throw (
      lastError ??
      new JiraError({ kind: "decoding", context: "goals_search", detail: "aucun ARI de site" })
    );
  }

  /** Objectifs correspondant à des identifiants (argument `goalIds`, relevé du schéma). */
  async goalsByIds(ids: readonly string[]): Promise<AtlassianGoal[]> {
    if (ids.length === 0) return [];
    const selection = await this.#buildSelection();
    const operation = `query goalsByIds($goalIds: [ID!]!) { goals_byIds(goalIds: $goalIds) { ${selection} } }`;
    const goals: AtlassianGoal[] = [];
    for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
      const data = await this.#execute(operation, { goalIds: chunk });
      if (!Array.isArray(data.goals_byIds)) {
        throw new JiraError({ kind: "decoding", context: "goals_byIds", detail: "liste attendue" });
      }
      for (const node of data.goals_byIds) {
        const goal = parseGoal(node);
        if (goal) goals.push(goal);
      }
    }
    return goals;
  }

  /**
   * Sélection donnant les tickets d'un objectif (champ `workItems`), sens Goal → tickets. Sa forme
   * (connexion `edges { node }` ou liste `nodes`), le champ portant la clé Jira et ses arguments
   * sont découverts. Un argument obligatoire inconnu rend le champ inexploitable : on le dit.
   */
  async #workItemsSelectionFor(): Promise<string | null> {
    if (this.#workItemsSelection !== undefined) return this.#workItemsSelection;
    let result: string | null = null;
    try {
      const goalType = await this.goalTypeName();
      const workItems = goalType
        ? (await this.#fields(goalType)).find((field) => field.name === "workItems")
        : undefined;
      if (goalType && workItems?.type) {
        const args = await this.#arguments("workItems", goalType);
        const unsupported = args.filter((arg) => arg.required && arg.name !== "first");
        if (unsupported.length > 0) {
          this.lastWorkItemsIssue = `le champ workItems exige des arguments non pris en charge : ${unsupported
            .map((arg) => arg.name)
            .join(", ")}`;
        } else {
          const call = args.some((arg) => arg.name === "first")
            ? "workItems(first: 100)"
            : "workItems";
          const connection = await this.#fields(workItems.type.name);
          const keyOn = async (typeName: string) => {
            const names = new Set((await this.#fields(typeName)).map((field) => field.name));
            return ["key", "issueKey", "id"].find((name) => names.has(name)) ?? null;
          };
          const edges = connection.find((field) => field.name === "edges")?.type?.name;
          const edgeNode = edges
            ? (await this.#fields(edges)).find((field) => field.name === "node")?.type?.name
            : undefined;
          const edgeKey = edgeNode ? await keyOn(edgeNode) : null;
          if (edgeKey) {
            result = `${call} { edges { node { ${edgeKey} } } }`;
          } else {
            const nodes = connection.find((field) => field.name === "nodes")?.type?.name;
            const nodeKey = nodes ? await keyOn(nodes) : null;
            if (nodeKey) result = `${call} { nodes { ${nodeKey} } }`;
          }
        }
      }
    } catch (error) {
      this.lastWorkItemsIssue = error instanceof Error ? error.message : String(error);
    }
    this.#workItemsSelection = result;
    return result;
  }

  /**
   * Clés des tickets rattachés à chaque objectif, telles qu'Atlassian les connaît. Lecture de
   * référence du lien : elle ne dépend pas du format, non documenté, du champ Goals des tickets.
   */
  async workItemKeys(goalIds: readonly string[]): Promise<Record<string, string[]>> {
    if (goalIds.length === 0) return {};
    const selection = await this.#workItemsSelectionFor();
    if (selection === null) return {};
    const operation = `query goalWorkItems($goalIds: [ID!]!) { goals_byIds(goalIds: $goalIds) { id ${selection} } }`;

    const result: Record<string, string[]> = {};
    for (const chunk of chunks(goalIds, IDS_PER_REQUEST)) {
      const data = await this.#execute(operation, { goalIds: chunk });
      const nodes = Array.isArray(data.goals_byIds) ? data.goals_byIds : [];
      for (const node of nodes) {
        if (!isRecord(node) || typeof node.id !== "string" || !isRecord(node.workItems)) continue;
        const container = node.workItems;
        const items = Array.isArray(container.edges)
          ? container.edges.map((edge) => (isRecord(edge) ? edge.node : null))
          : Array.isArray(container.nodes)
            ? container.nodes
            : [];
        const keys = items.flatMap((item) => {
          if (!isRecord(item)) return [];
          const key = item.key ?? item.issueKey ?? item.id;
          return typeof key === "string" && key !== "" ? [key] : [];
        });
        if (keys.length > 0) result[node.id] = keys;
      }
    }
    return result;
  }

  // ─── Rattachement ──────────────────────────────────────────────────────────

  /**
   * Pose (`goal.link`) ou retire (`goal.unlink`) le lien natif ticket↔Goal.
   *
   * La forme de `workItemId` n'est pas documentée : l'ARI Jira du ticket est essayé d'abord, puis
   * l'identifiant brut — mais la seconde forme n'est envoyée qu'après un REFUS explicite
   * d'Atlassian pour la première (rien n'a donc été écrit). Une issue incertaine (réseau, délai)
   * remonte aussitôt : aucune écriture n'est rejouée. La forme acceptée est ensuite réutilisée.
   */
  async setLink(kind: GraphqlWrite["kind"], goalId: string, issueId: string): Promise<LinkOutcome> {
    const cloudId = await this.cloudId();
    const forms: ("ari" | "raw")[] = this.#workItemForm ? [this.#workItemForm] : ["ari", "raw"];
    let last: LinkOutcome = { success: false, messages: [] };
    for (const form of forms) {
      const workItemId = form === "ari" ? `ari:cloud:jira:${cloudId}:issue/${issueId}` : issueId;
      const write: GraphqlWrite = { kind, goalId, workItemId };
      let body: JsonValue | null;
      try {
        body = (await this.#transport.graphqlWrite(write)).body;
      } catch (error) {
        if (error instanceof JiraError && !error.isOutcomeUnknown && error.httpStatus === 400) {
          last = { success: false, messages: [error.message] };
          continue; // validation refusée pour cette forme : rien n'a été écrit
        }
        throw error;
      }
      last = linkOutcome(body, buildGraphqlWrite(write).field);
      if (last.success) {
        this.#workItemForm = form;
        return last;
      }
    }
    return last;
  }
}

// ─── Décodage ────────────────────────────────────────────────────────────────

/** `data` d'une réponse GraphQL ; ses `errors` sont remontées : GraphQL répond 200 même en échec. */
export function graphqlData(body: JsonValue | null): Record<string, JsonValue> {
  if (!isRecord(body)) {
    throw new JiraError({ kind: "decoding", context: "réponse GraphQL", detail: "objet attendu" });
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new JiraError({ kind: "graphql", messages: errorMessages(body.errors) });
  }
  if (!isRecord(body.data)) {
    throw new JiraError({
      kind: "decoding",
      context: "réponse GraphQL",
      detail: "champ « data » absent",
    });
  }
  return body.data;
}

/**
 * Résultat d'une mutation de rattachement. Des erreurs GraphQL de premier niveau (validation) ou
 * `success: false` valent refus explicite : rien n'a été écrit.
 */
export function linkOutcome(body: JsonValue | null, field: string): LinkOutcome {
  if (isRecord(body) && Array.isArray(body.errors) && body.errors.length > 0) {
    return { success: false, messages: errorMessages(body.errors) };
  }
  const data = isRecord(body) ? body.data : null;
  const payload = isRecord(data) ? data[field] : null;
  if (!isRecord(payload)) {
    throw new JiraError({ kind: "decoding", context: field, detail: "résultat absent" });
  }
  const errors = payload.errors;
  const messages = Array.isArray(errors)
    ? errorMessages(errors)
    : isRecord(errors) && typeof errors.message === "string"
      ? [errors.message]
      : [];
  return { success: payload.success === true, messages };
}

function errorMessages(errors: readonly JsonValue[]): string[] {
  return errors.flatMap((error) =>
    isRecord(error) && typeof error.message === "string" ? [error.message] : [],
  );
}

function namedType(node: unknown): TypeRef | null {
  let current: unknown = node;
  for (let depth = 0; depth < 6 && isRecord(current); depth++) {
    if (typeof current.name === "string" && current.name !== "") {
      return { name: current.name, kind: typeof current.kind === "string" ? current.kind : "" };
    }
    current = current.ofType;
  }
  return null;
}

/** Objectif tel que la sélection découverte l'a rendu. Seul `id` est garanti. */
export function parseGoal(node: unknown): AtlassianGoal | null {
  if (!isRecord(node) || typeof node.id !== "string") return null;
  const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
  const label = (value: unknown) => {
    if (!isRecord(value)) return null;
    for (const key of LABEL_CANDIDATES) {
      const found = text(value[key]);
      if (found) return found;
    }
    return null;
  };
  return {
    id: node.id,
    key: text(node.key),
    name: text(node.name) ?? text(node.title) ?? text(node.summary),
    statusLabel: label(node.status) ?? label(node.state),
    ownerName: label(node.owner),
    // `targetDate` est scalaire sur certaines instances, composite sur d'autres.
    targetDate:
      text(node.targetDate) ?? label(node.targetDate) ?? text(node.dueDate) ?? label(node.dueDate),
    url: text(node.url),
    isArchived: node.isArchived === true,
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}
