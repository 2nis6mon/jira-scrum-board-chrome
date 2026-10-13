import { JiraError } from "../errors";
import { isRecord, type JsonObject, type JsonValue } from "../json";
import { LABEL_CANDIDATES } from "./decode";

/** Seule la lecture GraphQL est injectée : ce cache n'émet aucune mutation. */
export type GoalsQuery = (
  operation: string,
  variables?: JsonObject,
) => Promise<Record<string, JsonValue>>;

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
  readonly type: TypeRef | null;
}

export interface WorkItemsSelection {
  readonly first: boolean;
  readonly after: boolean;
  readonly fields: string;
  readonly pagination: { hasNext: string; cursor: string } | null;
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
/** `owner` est une INTERFACE (`User`) : l'oublier fait disparaître le propriétaire. */
const COMPOSITE_KINDS = new Set(["OBJECT", "INTERFACE", "UNION"]);

export interface WorkItemsSchema {
  readonly selection: WorkItemsSelection | null;
  readonly issue: string | null;
}

/** Introspection et sélections propres au schéma du site ; les échecs restent relisibles. */
export class GoalsSchema {
  readonly #execute: GoalsQuery;
  #goalTypeName: string | null | undefined;
  #connectionTypeName: string | null = null;
  #selection: string | null = null;
  #pagination: { hasNext: string; cursor: string } | null | undefined;
  #workItemsSelection: WorkItemsSchema | undefined;
  readonly #typeFields = new Map<string, Promise<FieldInfo[]>>();

  constructor(execute: GoalsQuery) {
    this.#execute = execute;
  }

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
    // Une introspection en échec n'indique pas que le champ n'a aucun argument.
    const data = await this.#execute(
      `query fieldArgs($name: String!) { __type(name: $name) { fields { name args { name type { ${TYPE_REF} } } } } }`,
      { name: typeName },
    );
    const type = data.__type;
    const fields = isRecord(type) && Array.isArray(type.fields) ? type.fields : [];
    const field = fields.find((candidate) => isRecord(candidate) && candidate.name === fieldName);
    if (!isRecord(field) || !Array.isArray(field.args)) {
      throw new Error("Arguments du lien Goal → tickets illisibles dans le schéma Atlassian.");
    }
    return field.args.flatMap((arg) =>
      isRecord(arg) && typeof arg.name === "string"
        ? [
            {
              name: arg.name,
              required: isRecord(arg.type) && arg.type.kind === "NON_NULL",
              type: namedType(arg.type),
            },
          ]
        : [],
    );
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
  async selection(): Promise<string> {
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
  async paginationFields(): Promise<{ hasNext: string; cursor: string } | null> {
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

  /**
   * Sélection donnant les tickets d'un objectif (champ `workItems`), sens Goal → tickets. Sa forme
   * (connexion `edges { node }` ou liste `nodes`), le champ portant la clé Jira et ses arguments
   * sont découverts. Un argument obligatoire inconnu rend le champ inexploitable : on le dit.
   */
  async workItemsSelection(): Promise<WorkItemsSchema> {
    if (this.#workItemsSelection !== undefined) return this.#workItemsSelection;
    let issue: string | null = null;
    let result: WorkItemsSelection | null = null;
    try {
      const goalType = await this.goalTypeName();
      const workItems = goalType
        ? (await this.#fields(goalType)).find((field) => field.name === "workItems")
        : undefined;
      if (goalType && workItems?.type) {
        const args = await this.#arguments("workItems", goalType);
        const unsupported = args.filter((arg) => arg.required && arg.name !== "first");
        if (unsupported.length > 0) {
          issue = `le champ workItems exige des arguments non pris en charge : ${unsupported
            .map((arg) => arg.name)
            .join(", ")}`;
        } else {
          const connection = await this.#fields(workItems.type.name);
          let pagination: WorkItemsSelection["pagination"] = null;
          const pageInfo = connection.find((field) => field.name === "pageInfo");
          if (pageInfo?.type) {
            const names = new Set(
              (await this.#fields(pageInfo.type.name)).map((field) => field.name),
            );
            const cursor = ["endCursor", "nextCursor", "cursor"].find((name) => names.has(name));
            if (names.has("hasNextPage") && cursor) pagination = { hasNext: "hasNextPage", cursor };
          }
          const keyOn = async (typeName: string) => {
            const names = new Set((await this.#fields(typeName)).map((field) => field.name));
            return ["key", "issueKey", "id"].find((name) => names.has(name)) ?? null;
          };
          const edges = connection.find((field) => field.name === "edges")?.type?.name;
          const edgeNode = edges
            ? (await this.#fields(edges)).find((field) => field.name === "node")?.type?.name
            : undefined;
          const edgeKey = edgeNode ? await keyOn(edgeNode) : null;
          let fields: string | null = null;
          if (edgeKey) {
            fields = `edges { node { ${edgeKey} } }`;
          } else {
            const nodes = connection.find((field) => field.name === "nodes")?.type?.name;
            const nodeKey = nodes ? await keyOn(nodes) : null;
            if (nodeKey) fields = `nodes { ${nodeKey} }`;
          }
          if (fields)
            result = {
              first: args.some((arg) => arg.name === "first"),
              after: args.some(
                (arg) =>
                  arg.name === "after" &&
                  arg.type?.kind === "SCALAR" &&
                  ["String", "ID"].includes(arg.type.name),
              ),
              fields,
              pagination,
            };
        }
      }
    } catch (error) {
      if (error instanceof JiraError && error.isAuthenticationFailure) throw error;
      issue = error instanceof Error ? error.message : String(error);
      // Une panne de lecture n'est pas un schéma incompatible : le prochain rafraîchissement
      // doit pouvoir refaire l'introspection, sans imposer de recharger toute l'extension.
      return { selection: null, issue };
    }
    if (result === null && issue === null) {
      issue = "le schéma Atlassian n'expose pas de lien Goal → tickets exploitable";
    }
    this.#workItemsSelection = { selection: result, issue };
    return this.#workItemsSelection;
  }
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
