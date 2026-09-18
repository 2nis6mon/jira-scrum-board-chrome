import type { RecordedRequest, Reply } from "./fakeJira";

// Fausse passerelle GraphQL Goals, calquée sur le schéma relevé par l'app Mac sur une instance
// Jira Cloud réelle : type `TownsquareGoal`, `owner` en INTERFACE, `status` et `targetDate`
// composites, lien Goal → tickets par `workItems { edges { node { key } } }`. Données FICTIVES.

export interface FakeGoal {
  id: string;
  key?: string;
  name?: string;
  status?: string;
  owner?: string;
  targetDate?: string;
  url?: string;
  isArchived?: boolean;
  workItems?: string[];
}

export interface GatewayOptions {
  goals: FakeGoal[];
  cloudId?: string;
  /** Réponse imposée à `tenantContexts` (pour simuler un refus de la passerelle). */
  tenantReply?: Reply;
  /** Champs de `TownsquareGoal` ; par défaut, ceux du schéma réel. */
  goalFields?: unknown[];
  /** Arguments de `workItems` ; par défaut `first` facultatif. */
  workItemsArgs?: unknown[];
  /** Réponse aux mutations : par défaut succès. */
  mutation?: (input: { goalId: string; workItemId: string }, field: string) => Reply;
  /** ARI de site refusé (pour vérifier l'essai du format suivant). */
  rejectContainer?: string;
  /** Pagination de goals_search : taille de page, et exposition de pageInfo. */
  pageSize?: number;
}

const type = (kind: string, name: string | null, ofType: unknown = null) => ({
  kind,
  name,
  ofType,
});
const field = (name: string, fieldType: unknown) => ({ name, type: fieldType });

export const REAL_GOAL_FIELDS = [
  field("id", type("SCALAR", "ID")),
  field("key", type("SCALAR", "String")),
  field("name", type("SCALAR", "String")),
  field("url", type("SCALAR", "String")),
  field("isArchived", type("SCALAR", "Boolean")),
  field("status", type("OBJECT", "TownsquareStatus")),
  field("targetDate", type("OBJECT", "TownsquareTargetDate")),
  field("owner", type("INTERFACE", "User")),
  field("workItems", type("OBJECT", "TownsquareWorkItemConnection")),
];

const TYPES: Record<string, unknown[]> = {
  TownsquareGoalConnection: [
    field("edges", type("LIST", null, type("OBJECT", "TownsquareGoalEdge"))),
    field("pageInfo", type("NON_NULL", null, type("OBJECT", "PageInfo"))),
  ],
  TownsquareGoalEdge: [field("node", type("OBJECT", "TownsquareGoal"))],
  PageInfo: [
    field("hasNextPage", type("SCALAR", "Boolean")),
    field("endCursor", type("SCALAR", "String")),
  ],
  TownsquareStatus: [
    field("value", type("SCALAR", "String")),
    field("score", type("SCALAR", "Float")),
  ],
  TownsquareTargetDate: [field("label", type("SCALAR", "String"))],
  User: [field("accountId", type("SCALAR", "ID")), field("name", type("SCALAR", "String"))],
  TownsquareWorkItemConnection: [
    field("edges", type("LIST", null, type("OBJECT", "TownsquareWorkItemEdge"))),
  ],
  TownsquareWorkItemEdge: [field("node", type("OBJECT", "JiraIssue"))],
  JiraIssue: [field("id", type("SCALAR", "ID")), field("key", type("SCALAR", "String"))],
};

function node(goal: FakeGoal, query: string): Record<string, unknown> {
  const result: Record<string, unknown> = { id: goal.id };
  if (query.includes("key")) result.key = goal.key ?? null;
  if (query.includes("name")) result.name = goal.name ?? null;
  if (query.includes("url")) result.url = goal.url ?? null;
  if (query.includes("isArchived")) result.isArchived = goal.isArchived ?? false;
  if (query.includes("status {")) result.status = goal.status ? { value: goal.status } : null;
  if (query.includes("targetDate {"))
    result.targetDate = goal.targetDate ? { label: goal.targetDate } : null;
  if (query.includes("owner {")) result.owner = goal.owner ? { name: goal.owner } : null;
  if (query.includes("workItems")) {
    result.workItems = { edges: (goal.workItems ?? []).map((key) => ({ node: { key } })) };
  }
  return result;
}

/** Répondeur pour `FakeJira.on("POST", "/gateway/api/graphql", …)`. */
export function goalsGateway(options: GatewayOptions): (request: RecordedRequest) => Reply {
  return (request) => {
    const body = (request.body ?? {}) as { query?: string; variables?: Record<string, unknown> };
    const query = body.query ?? "";
    const variables = body.variables ?? {};
    const ok = (data: unknown): Reply => ({ status: 200, json: { data } });

    if (query.includes("tenantContexts")) {
      return (
        options.tenantReply ??
        ok({ tenantContexts: [{ cloudId: options.cloudId ?? "cloud-test" }] })
      );
    }
    if (query.includes("__schema")) {
      return ok({
        __schema: {
          queryType: {
            fields: [field("goals_search", type("OBJECT", "TownsquareGoalConnection"))],
          },
        },
      });
    }
    if (query.includes("__type")) {
      const name = String(variables.name ?? "");
      if (name === "TownsquareGoal") {
        const fields = options.goalFields ?? REAL_GOAL_FIELDS;
        if (query.includes("args {")) {
          return ok({
            __type: {
              fields: fields.map((f) => ({
                ...(f as object),
                args:
                  (f as { name: string }).name === "workItems"
                    ? (options.workItemsArgs ?? [{ name: "first", type: type("SCALAR", "Int") }])
                    : [],
              })),
            },
          });
        }
        return ok({ __type: { fields } });
      }
      return ok({ __type: TYPES[name] ? { fields: TYPES[name] } : null });
    }
    if (query.includes("goals_search(")) {
      if (options.rejectContainer && variables.containerId === options.rejectContainer) {
        return { status: 200, json: { errors: [{ message: "Invalid containerId" }] } };
      }
      const pageSize = options.pageSize ?? options.goals.length;
      const start = typeof variables.after === "string" ? Number(variables.after) : 0;
      const page = options.goals.slice(start, start + Math.max(pageSize, 1));
      const next = start + page.length;
      return ok({
        goals_search: {
          ...(query.includes("pageInfo")
            ? { pageInfo: { hasNextPage: next < options.goals.length, endCursor: String(next) } }
            : {}),
          edges: page.map((goal) => ({ node: node(goal, query) })),
        },
      });
    }
    if (query.includes("goals_byIds(")) {
      const ids = (variables.goalIds as string[]) ?? [];
      return ok({
        goals_byIds: options.goals
          .filter((goal) => ids.includes(goal.id))
          .map((goal) => node(goal, query)),
      });
    }
    for (const mutationField of ["goals_linkWorkItem", "goals_unlinkWorkItem"]) {
      if (query.includes(`${mutationField}(`)) {
        const input = variables.input as { goalId: string; workItemId: string };
        return (
          options.mutation?.(input, mutationField) ??
          ok({ [mutationField]: { success: true, errors: null } })
        );
      }
    }
    return {
      status: 200,
      json: {
        errors: [
          { message: `requête non prévue par la fausse passerelle : ${query.slice(0, 80)}` },
        ],
      },
    };
  };
}

/** Requêtes GraphQL émises, par document (pour vérifier ce qui a été demandé). */
export function graphqlQueries(requests: readonly RecordedRequest[]): string[] {
  return requests
    .filter((request) => request.path === "/gateway/api/graphql")
    .map((request) => String((request.body as { query?: string } | null)?.query ?? ""));
}
