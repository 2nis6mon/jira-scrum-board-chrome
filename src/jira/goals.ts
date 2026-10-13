import { JiraError } from "./errors";
import {
  graphqlData,
  type LinkOutcome,
  linkOutcome,
  parseGoal,
  parseWorkItems,
} from "./goals/decode";
import { GoalsSchema } from "./goals/schema";
import { isRecord, type JsonObject, type JsonValue } from "./json";
import type { AtlassianGoal } from "./models";
import type { JiraTransport } from "./transport";
import { buildGraphqlWrite, type GraphqlWrite } from "./writes";

// Compatibilité des imports existants : les décodeurs sont désormais indépendants du client.
export { graphqlData, type LinkOutcome, linkOutcome, parseGoal } from "./goals/decode";

// Client de l'API GraphQL Goals d'Atlassian, adapté au schéma exposé par le site.
//
// RIEN n'est supposé du schéma : le nom réel du type des objectifs (`TownsquareGoal` sur Jira
// Cloud), ses champs, leur nature (scalaire, objet, INTERFACE), la forme du lien Goal → tickets
// et ses arguments sont découverts par introspection. Une instance au schéma différent dégrade
// l'affichage au lieu de faire échouer la requête entière.
//
// La passerelle `/gateway/api/graphql` n'accepte les requêtes de l'extension qu'avec la règle
// `Origin` posée par l'interface (voir app/platform/originRule.ts).

/** Garde-fou de pagination de `goals_search`. */
const MAX_PAGES = 20;
/** Taille des lots d'identifiants envoyés à `goals_byIds`. */
const IDS_PER_REQUEST = 50;

export class GoalsClient {
  readonly #transport: JiraTransport;
  #cloudId: string | null = null;
  #containerId: string | null = null;
  readonly #schema: GoalsSchema;
  /** Forme d'identifiant de ticket acceptée par les mutations, une fois trouvée. */
  #workItemForm: "ari" | "raw" | null = null;

  /** Pourquoi le lien Goal → tickets n'a pas pu être lu, s'il y a une raison. */
  lastWorkItemsIssue: string | null = null;

  constructor(transport: JiraTransport) {
    this.#transport = transport;
    this.#schema = new GoalsSchema((operation, variables) => this.#execute(operation, variables));
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

  goalTypeName(): Promise<string | null> {
    return this.#schema.goalTypeName();
  }

  availableGoalFields(): Promise<string[]> {
    return this.#schema.availableGoalFields();
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
    const selection = await this.#schema.selection();
    const pagination = options.loadAll ? await this.#schema.paginationFields() : null;
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
        const seenCursors = new Set<string>();
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
            if (!goal && options.loadAll) {
              throw new Error(
                "Recherche des objectifs incomplète : un objectif est illisible dans la réponse Atlassian.",
              );
            }
            if (goal) collected.push(goal);
          }
          if (!options.loadAll) break;
          if (!pagination) {
            if (search.edges.length >= (options.limit ?? 50)) {
              throw new Error(
                "Recherche des objectifs incomplète : Atlassian n'expose pas de pagination exploitable.",
              );
            }
            break;
          }
          if (!isRecord(search.pageInfo)) {
            throw new Error(
              "Recherche des objectifs incomplète : pagination absente de la réponse Atlassian.",
            );
          }
          const info = search.pageInfo;
          const next = info[pagination.cursor];
          if (info[pagination.hasNext] === false) break;
          if (
            info[pagination.hasNext] !== true ||
            typeof next !== "string" ||
            next === "" ||
            seenCursors.has(next) ||
            page + 1 >= MAX_PAGES
          ) {
            throw new Error(
              "Recherche des objectifs incomplète : limite ou incohérence de pagination Atlassian.",
            );
          }
          seenCursors.add(next);
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
    const selection = await this.#schema.selection();
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
   * Clés des tickets rattachés à chaque objectif, telles qu'Atlassian les connaît. Lecture de
   * référence du lien : elle ne dépend pas du format, non documenté, du champ Goals des tickets.
   */
  async workItemKeys(goalIds: readonly string[]): Promise<Record<string, string[]>> {
    if (goalIds.length === 0) return {};
    const { selection, issue } = await this.#schema.workItemsSelection();
    this.lastWorkItemsIssue = issue;
    if (selection === null) return {};
    this.lastWorkItemsIssue = null;
    const operation = (after: string | null) => {
      const args = [
        ...(selection.first ? ["first: 100"] : []),
        ...(after !== null ? [`after: ${JSON.stringify(after)}`] : []),
      ];
      const call = args.length > 0 ? `workItems(${args.join(", ")})` : "workItems";
      const pagination = selection.pagination;
      const info = pagination ? ` pageInfo { ${pagination.hasNext} ${pagination.cursor} }` : "";
      return `query goalWorkItems($goalIds: [ID!]!) { goals_byIds(goalIds: $goalIds) { id ${call} { ${selection.fields}${info} } } }`;
    };

    const result: Record<string, string[]> = {};
    for (const chunk of chunks(goalIds, IDS_PER_REQUEST)) {
      const pending: { ids: string[]; after: string | null; page: number; cursors: Set<string> }[] =
        [{ ids: chunk, after: null, page: 0, cursors: new Set() }];
      while (pending.length > 0) {
        const current = pending.shift();
        if (!current) break;
        const data = await this.#execute(operation(current.after), { goalIds: current.ids });
        if (!Array.isArray(data.goals_byIds)) {
          throw new Error(
            "Lecture incomplète des liens des objectifs : liste absente de la réponse Atlassian.",
          );
        }
        const nodes = data.goals_byIds;
        const returnedIds = new Set<string>();
        for (const node of nodes) {
          if (!isRecord(node) || typeof node.id !== "string" || !isRecord(node.workItems)) {
            this.lastWorkItemsIssue = "un objectif ne fournit pas ses liens vers les tickets";
            continue;
          }
          returnedIds.add(node.id);
          const decoded = parseWorkItems(node.workItems);
          if (decoded === null) {
            this.lastWorkItemsIssue = "les tickets rattachés à un objectif sont illisibles";
            continue;
          }
          const { keys } = decoded;
          if (decoded.issue) this.lastWorkItemsIssue = decoded.issue;
          if (keys.length > 0)
            result[node.id] = [...new Set([...(result[node.id] ?? []), ...keys])];
          const pagination = selection.pagination;
          if (pagination) {
            const info = decoded.pageInfo;
            if (!isRecord(info) || typeof info[pagination.hasNext] !== "boolean") {
              this.lastWorkItemsIssue = "la pagination des liens des objectifs est illisible";
            } else if (info[pagination.hasNext] === true) {
              const next = info[pagination.cursor];
              if (
                !selection.after ||
                typeof next !== "string" ||
                next === "" ||
                current.cursors.has(next) ||
                current.page + 1 >= MAX_PAGES
              ) {
                this.lastWorkItemsIssue =
                  "la lecture complète des liens des objectifs dépasse la pagination prise en charge";
              } else {
                pending.push({
                  ids: [node.id],
                  after: next,
                  page: current.page + 1,
                  cursors: new Set([...current.cursors, next]),
                });
              }
            }
          } else if (decoded.itemCount >= 100) {
            this.lastWorkItemsIssue =
              "un objectif atteint 100 liens sans pagination exploitable ; certains tickets peuvent manquer";
          }
        }
        if (current.ids.some((id) => !returnedIds.has(id))) {
          this.lastWorkItemsIssue =
            "certains objectifs demandés sont absents ou inaccessibles dans la réponse des liens";
        }
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

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}
