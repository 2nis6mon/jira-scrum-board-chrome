import { describe, expect, it } from "vitest";
import { JiraError } from "../../src/jira/errors";
import { GoalsClient, graphqlData, linkOutcome, parseGoal } from "../../src/jira/goals";
import { goalDisplayName } from "../../src/jira/models";
import { JiraTransport } from "../../src/jira/transport";
import { buildGraphqlWrite } from "../../src/jira/writes";
import { ACME, FakeJira, type RecordedRequest, type Reply } from "../support/fakeJira";
import { type GatewayOptions, goalsGateway, graphqlQueries } from "../support/goalsGateway";

// GoalsClientTests, GoalsRealSchemaTests, GoalLinkMutationTests, GoalWorkItemsTests et
// Arguments workItems, contre une fausse passerelle.

const GRAPHQL = "/gateway/api/graphql";

function clientFor(options: GatewayOptions | ((request: RecordedRequest) => Reply)) {
  const jira = new FakeJira().on(
    "POST",
    GRAPHQL,
    typeof options === "function" ? options : goalsGateway(options),
  );
  const transport = new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 });
  return { client: new GoalsClient(transport), jira };
}

const PAIEMENT = {
  id: "ari:cloud:townsquare:c:goal/u1",
  key: "ACME-1",
  name: "Paiement",
  url: "https://home.atlassian.com/goal/u1",
  status: "pending",
  targetDate: "T3 2026",
  owner: "Alex Martin",
  workItems: ["ABC-1", "ABC-2"],
};
const ARCHIVE = {
  id: "ari:cloud:townsquare:c:goal/u2",
  key: "ACME-2",
  name: "Archivé",
  status: "done",
  isArchived: true,
};

describe("GoalsClient — passerelle", () => {
  it("lit l'identifiant du site par tenantContexts, une seule fois", async () => {
    const { client, jira } = clientFor({ goals: [], cloudId: "abc-123" });
    expect(await client.cloudId()).toBe("abc-123");
    expect(await client.cloudId()).toBe("abc-123");
    expect(jira.requests).toHaveLength(1);
    expect(jira.requests[0]?.body).toMatchObject({ variables: { hosts: ["acme.atlassian.net"] } });
  });

  it("les erreurs GraphQL (HTTP 200) sont remontées, pas ignorées", async () => {
    const { client } = clientFor(() => ({
      status: 200,
      json: { errors: [{ message: "Field 'nope' doesn't exist" }] },
    }));
    await expect(client.cloudId()).rejects.toMatchObject({
      info: { kind: "graphql", messages: ["Field 'nope' doesn't exist"] },
    });
  });

  it("refus de la passerelle (403 CORS) : l'erreur garde la réponse", async () => {
    const { client } = clientFor(() => ({
      status: 403,
      json: { code: 403, message: "Invalid CORS request" },
    }));
    await expect(client.cloudId()).rejects.toMatchObject({
      info: { kind: "forbidden", bodyExcerpt: expect.stringContaining("Invalid CORS request") },
    });
  });

  it("graphqlData refuse une réponse sans data", () => {
    expect(() => graphqlData({ foo: 1 })).toThrowError(JiraError);
    expect(graphqlData({ data: { a: 1 } })).toEqual({ a: 1 });
  });
});

describe("GoalsClient — schéma découvert", () => {
  it("découvre le type TownsquareGoal en suivant goals_search → edges → node", async () => {
    const { client } = clientFor({ goals: [] });
    expect(await client.goalTypeName()).toBe("TownsquareGoal");
  });

  it("construit la sélection à partir du schéma réel : INTERFACE et composites compris", async () => {
    const { client, jira } = clientFor({ goals: [PAIEMENT] });
    await client.searchGoals();
    const search = graphqlQueries(jira.requests).find((q) => q.includes("goals_search(")) ?? "";
    expect(search).toContain("owner { name }");
    expect(search).toContain("targetDate { label }");
    expect(search).toContain("status { value }");
    expect(search).toContain("isArchived");
  });

  it("lit toutes les valeurs découvertes", async () => {
    const { client } = clientFor({ goals: [PAIEMENT, ARCHIVE] });
    const [first, second] = await client.searchGoals();
    expect(first).toEqual({
      id: PAIEMENT.id,
      key: "ACME-1",
      name: "Paiement",
      statusLabel: "pending",
      ownerName: "Alex Martin",
      targetDate: "T3 2026",
      url: "https://home.atlassian.com/goal/u1",
      isArchived: false,
    });
    expect(second?.isArchived).toBe(true);
  });

  it("un champ absent du schéma n'est pas demandé ; un objet sans libellé est omis", async () => {
    const fields = [
      { name: "id", type: { kind: "SCALAR", name: "ID" } },
      { name: "name", type: { kind: "SCALAR", name: "String" } },
      { name: "status", type: { kind: "OBJECT", name: "SansLibelle" } },
    ];
    const { client, jira } = clientFor({ goals: [PAIEMENT], goalFields: fields });
    await client.searchGoals();
    const search = graphqlQueries(jira.requests).find((q) => q.includes("goals_search(")) ?? "";
    expect(search).toContain("name");
    expect(search).not.toContain("url");
    expect(search).not.toContain("owner");
    expect(search).not.toContain("status");
  });

  it("type introuvable : mode dégradé à `id` seul, l'application reste fonctionnelle", async () => {
    const gateway = goalsGateway({ goals: [{ id: "g1" }] });
    const { client } = clientFor((request) => {
      const body = request.body as { query: string };
      if (body.query.includes("__schema"))
        return { status: 200, json: { data: { __schema: { queryType: { fields: [] } } } } };
      return gateway(request);
    });
    expect((await client.searchGoals()).map((goal) => goal.id)).toEqual(["g1"]);
    expect(await client.availableGoalFields()).toEqual(["id"]);
  });

  it("essaie l'ARI de site suivant quand le premier est refusé, puis le retient", async () => {
    const { client, jira } = clientFor({
      goals: [PAIEMENT],
      rejectContainer: "ari:cloud:goal::site/cloud-test",
    });
    expect(await client.searchGoals()).toHaveLength(1);
    await client.searchGoals();
    const containers = jira.requests
      .filter((r) => String((r.body as { query: string }).query).includes("goals_search("))
      .map((r) => (r.body as { variables: { containerId: string } }).variables.containerId);
    expect(containers).toEqual([
      "ari:cloud:goal::site/cloud-test",
      "ari:cloud:townsquare::site/cloud-test",
      "ari:cloud:townsquare::site/cloud-test",
    ]);
  });

  it("suit la pagination jusqu'au bout avec loadAll", async () => {
    const goals = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i + 1}`,
      name: `Objectif ${i + 1}`,
    }));
    const { client } = clientFor({ goals, pageSize: 2 });
    expect((await client.searchGoals({ limit: 2, loadAll: true })).map((goal) => goal.id)).toEqual([
      "g1",
      "g2",
      "g3",
      "g4",
      "g5",
    ]);
  });

  it("loadAll refuse une pagination répétée plutôt qu'une recherche partielle", async () => {
    const gateway = goalsGateway({ goals: [PAIEMENT] });
    const { client } = clientFor((request) => {
      const { query } = request.body as { query: string };
      if (query.includes("goals_search("))
        return {
          status: 200,
          json: {
            data: {
              goals_search: {
                edges: [{ node: { id: PAIEMENT.id } }],
                pageInfo: { hasNextPage: true, endCursor: "toujours-identique" },
              },
            },
          },
        };
      return gateway(request);
    });
    await expect(client.searchGoals({ loadAll: true })).rejects.toThrow(
      "Recherche des objectifs incomplète",
    );
  });

  it("goals_byIds : argument goalIds, par lots", async () => {
    const goals = Array.from({ length: 60 }, (_, i) => ({ id: `g${i}` }));
    const { client, jira } = clientFor({ goals });
    expect(await client.goalsByIds(goals.map((g) => g.id))).toHaveLength(60);
    const byIds = graphqlQueries(jira.requests).filter((q) => q.includes("goals_byIds("));
    expect(byIds).toHaveLength(2);
    expect(byIds[0]).toContain("goals_byIds(goalIds: $goalIds)");
    expect(await client.goalsByIds([])).toEqual([]);
  });

  it("le libellé affiché n'est jamais inventé", () => {
    const base = parseGoal({ id: "g1" });
    if (!base) throw new Error("objectif attendu");
    expect(goalDisplayName({ ...base, name: "Paiement" })).toBe("Paiement");
    expect(goalDisplayName({ ...base, key: "ACME-1" })).toBe("ACME-1");
    expect(goalDisplayName(base)).toBe("g1");
    expect(parseGoal({ key: "sans id" })).toBeNull();
  });
});

describe("GoalsClient — lien Goal → tickets (workItems)", () => {
  it("une introspection en panne peut récupérer au prochain rafraîchissement", async () => {
    const gateway = goalsGateway({ goals: [PAIEMENT] });
    let failed = false;
    const { client } = clientFor((request) => {
      const { query } = request.body as { query: string };
      if (query.includes("query fieldArgs") && !failed) {
        failed = true;
        return { status: 503 };
      }
      return gateway(request);
    });
    expect(await client.workItemKeys([PAIEMENT.id])).toEqual({});
    expect(client.lastWorkItemsIssue).not.toBeNull();
    expect(await client.workItemKeys([PAIEMENT.id])).toEqual({ [PAIEMENT.id]: ["ABC-1", "ABC-2"] });
    expect(client.lastWorkItemsIssue).toBeNull();
  });
  it("forme connexion découverte ; `first` fourni quand il est déclaré", async () => {
    const { client, jira } = clientFor({ goals: [PAIEMENT] });
    expect(await client.workItemKeys([PAIEMENT.id])).toEqual({ [PAIEMENT.id]: ["ABC-1", "ABC-2"] });
    const query =
      graphqlQueries(jira.requests).find(
        (q) => q.includes("goals_byIds(") && q.includes("workItems"),
      ) ?? "";
    expect(query).toContain("workItems(first: 100) { edges { node { key } } }");
  });

  it("sans argument déclaré : champ simple", async () => {
    const { client, jira } = clientFor({ goals: [PAIEMENT], workItemsArgs: [] });
    await client.workItemKeys([PAIEMENT.id]);
    const query = graphqlQueries(jira.requests).find((q) => q.includes("goals_byIds(")) ?? "";
    expect(query).toContain("workItems { edges");
    expect(query).not.toContain("workItems(");
  });

  it("argument obligatoire non géré : rien, mais la raison est dite", async () => {
    const { client } = clientFor({
      goals: [PAIEMENT],
      workItemsArgs: [
        {
          name: "cloudId",
          type: { kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "ID" } },
        },
      ],
    });
    expect(await client.workItemKeys([PAIEMENT.id])).toEqual({});
    expect(client.lastWorkItemsIssue).toContain("cloudId");
  });

  it("objectif sans ticket : omis ; aucune entrée : aucune requête", async () => {
    const { client, jira } = clientFor({ goals: [{ ...PAIEMENT, workItems: [] }] });
    expect(await client.workItemKeys([PAIEMENT.id])).toEqual({});
    const before = jira.requests.length;
    expect(await client.workItemKeys([])).toEqual({});
    expect(jira.requests).toHaveLength(before);
  });

  it("champ workItems absent du schéma : raison signalée, jamais assimilée à aucun lien", async () => {
    const fields = [{ name: "id", type: { kind: "SCALAR", name: "ID" } }];
    const { client } = clientFor({ goals: [PAIEMENT], goalFields: fields });
    expect(await client.workItemKeys([PAIEMENT.id])).toEqual({});
    expect(client.lastWorkItemsIssue).toContain("n'expose pas de lien");
    client.lastWorkItemsIssue = null;
    expect(await client.workItemKeys([PAIEMENT.id])).toEqual({});
    expect(client.lastWorkItemsIssue).toContain("n'expose pas de lien");
  });

  it("sans pagination exploitable, 100 liens produisent un avertissement explicite", async () => {
    const workItems = Array.from({ length: 100 }, (_, i) => `ABC-${i + 1}`);
    const { client } = clientFor({ goals: [{ ...PAIEMENT, workItems }] });
    expect((await client.workItemKeys([PAIEMENT.id]))[PAIEMENT.id]).toHaveLength(100);
    expect(client.lastWorkItemsIssue).toContain("100 liens sans pagination");
  });

  it.each([
    { nodes: [{ id: PAIEMENT.id, workItems: {} }] },
    { nodes: [{ id: PAIEMENT.id, workItems: { edges: [{ node: {} }] } }] },
    { nodes: [] },
  ])(
    "signale une réponse de liens illisible ou un objectif inaccessible : %j",
    async ({ nodes }) => {
      const gateway = goalsGateway({ goals: [PAIEMENT] });
      const { client } = clientFor((request) => {
        const { query } = request.body as { query: string };
        if (query.includes("query goalWorkItems"))
          return {
            status: 200,
            json: { data: { goals_byIds: nodes } },
          };
        return gateway(request);
      });
      await client.workItemKeys([PAIEMENT.id]);
      expect(client.lastWorkItemsIssue).not.toBeNull();
    },
  );

  it("suit les liens au-delà de 100 lorsque after et pageInfo sont découverts", async () => {
    const gateway = goalsGateway({
      goals: [PAIEMENT],
      workItemsArgs: [
        { name: "first", type: { kind: "SCALAR", name: "Int" } },
        { name: "after", type: { kind: "SCALAR", name: "String" } },
      ],
    });
    const { client, jira } = clientFor((request) => {
      const { query, variables } = request.body as { query: string; variables: { name?: string } };
      if (query.includes("__type") && variables.name === "TownsquareWorkItemConnection") {
        return {
          status: 200,
          json: {
            data: {
              __type: {
                fields: [
                  { name: "edges", type: { kind: "OBJECT", name: "TownsquareWorkItemEdge" } },
                  { name: "pageInfo", type: { kind: "OBJECT", name: "PageInfo" } },
                ],
              },
            },
          },
        };
      }
      if (query.includes("goals_byIds(") && query.includes("workItems")) {
        const start = query.includes('after: "100"')
          ? 100
          : query.includes('after: "200"')
            ? 200
            : 0;
        const length = Math.min(100, 205 - start);
        return {
          status: 200,
          json: {
            data: {
              goals_byIds: [
                {
                  id: PAIEMENT.id,
                  workItems: {
                    edges: Array.from({ length }, (_, i) => ({
                      node: { key: `ABC-${start + i + 1}` },
                    })),
                    pageInfo: {
                      hasNextPage: start + length < 205,
                      endCursor: String(start + length),
                    },
                  },
                },
              ],
            },
          },
        };
      }
      return gateway(request);
    });
    const links = await client.workItemKeys([PAIEMENT.id]);
    expect(links[PAIEMENT.id]).toHaveLength(205);
    expect(links[PAIEMENT.id]?.[204]).toBe("ABC-205");
    expect(client.lastWorkItemsIssue).toBeNull();
    expect(
      graphqlQueries(jira.requests).filter((q) => q.includes("query goalWorkItems")),
    ).toHaveLength(3);
  });
});

describe("GoalsClient — rattachement (mutations)", () => {
  it("forme documentée de l'entrée ; ARI Jira du ticket en premier", async () => {
    const { client, jira } = clientFor({ goals: [] });
    const outcome = await client.setLink("goal.link", "goal-1", "10001");
    expect(outcome.success).toBe(true);

    const mutations = jira.requests.filter((r) =>
      String((r.body as { query: string }).query).startsWith("mutation"),
    );
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.body).toEqual({
      query: buildGraphqlWrite({ kind: "goal.link", goalId: "goal-1", workItemId: "x" }).operation,
      variables: {
        input: { goalId: "goal-1", workItemId: "ari:cloud:jira:cloud-test:issue/10001" },
      },
    });
    const firstQuery = (mutations[0]?.body as { query?: string } | undefined)?.query ?? "";
    expect(firstQuery).toContain("TownsquareGoalsLinkWorkItemInput!");
  });

  it("le détachement a son propre type d'entrée", () => {
    const request = buildGraphqlWrite({ kind: "goal.unlink", goalId: "g", workItemId: "w" });
    expect(request.operation).toContain("goals_unlinkWorkItem(input: $input)");
    expect(request.operation).toContain("TownsquareGoalsUnlinkWorkItemInput!");
    expect(() =>
      buildGraphqlWrite({ kind: "goal.link", goalId: " ", workItemId: "w" }),
    ).toThrowError(JiraError);
  });

  it("refus explicite de la forme ARI : essaie l'identifiant brut, puis le retient", async () => {
    const seen: string[] = [];
    const { client } = clientFor({
      goals: [],
      mutation: (input, field) => {
        seen.push(input.workItemId);
        return {
          status: 200,
          json: {
            data: {
              [field]: input.workItemId.startsWith("ari:")
                ? { success: false, errors: [{ message: "Invalid work item" }] }
                : { success: true },
            },
          },
        };
      },
    });
    expect((await client.setLink("goal.link", "g", "10001")).success).toBe(true);
    expect((await client.setLink("goal.unlink", "g", "10002")).success).toBe(true);
    expect(seen).toEqual(["ari:cloud:jira:cloud-test:issue/10001", "10001", "10002"]);
  });

  it("refus pour les deux formes : échec, avec le message d'Atlassian", async () => {
    const { client } = clientFor({
      goals: [],
      mutation: (_input, field) => ({
        status: 200,
        json: { data: { [field]: { success: false, errors: { message: "Droits insuffisants" } } } },
      }),
    });
    expect(await client.setLink("goal.link", "g", "1")).toEqual({
      success: false,
      messages: ["Droits insuffisants"],
    });
  });

  it("issue incertaine : AUCUNE seconde tentative", async () => {
    let calls = 0;
    const { client } = clientFor({
      goals: [],
      mutation: () => {
        calls += 1;
        return { status: 503 };
      },
    });
    await expect(client.setLink("goal.link", "g", "1")).rejects.toMatchObject({
      isOutcomeUnknown: true,
    });
    expect(calls).toBe(1);
  });

  it("linkOutcome : erreurs de premier niveau = refus", () => {
    expect(linkOutcome({ errors: [{ message: "Validation" }] }, "goals_linkWorkItem")).toEqual({
      success: false,
      messages: ["Validation"],
    });
    expect(() => linkOutcome({ data: {} }, "goals_linkWorkItem")).toThrowError(JiraError);
  });
});
