import { describe, expect, it } from "vitest";
import { GoalsClient } from "../../src/jira/goals";
import { JiraTransport } from "../../src/jira/transport";
import { ACME, FakeJira, type RecordedRequest, type Reply } from "../support/fakeJira";
import { goalsGateway } from "../support/goalsGateway";

const GRAPHQL = "/gateway/api/graphql";

function clientFor(respond: (request: RecordedRequest) => Reply) {
  const jira = new FakeJira().on("POST", GRAPHQL, respond);
  return new GoalsClient(new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 }));
}

describe("GoalsClient — bornes de pagination conservées", () => {
  it("refuse une recherche complète au-delà de vingt pages sans en publier le résultat partiel", async () => {
    const gateway = goalsGateway({ goals: [{ id: "g1" }] });
    let paginate = false;
    let pages = 0;
    const client = clientFor((request) => {
      const { query } = request.body as { query: string };
      if (paginate && query.includes("query searchGoals")) {
        pages += 1;
        return {
          status: 200,
          json: {
            data: {
              goals_search: {
                edges: [{ node: { id: `g${pages}` } }],
                pageInfo: { hasNextPage: true, endCursor: `page-${pages}` },
              },
            },
          },
        };
      }
      return gateway(request);
    });
    // Une recherche réussie a fixé le conteneur du site, indépendamment de la pagination.
    await client.searchGoals();
    paginate = true;
    await expect(client.searchGoals({ loadAll: true })).rejects.toThrow(
      "limite ou incohérence de pagination",
    );
    expect(pages).toBe(20);
  });

  it.each([
    { reason: "curseur répété", repeat: true, expectedPages: 2 },
    { reason: "vingtième page", repeat: false, expectedPages: 20 },
  ])(
    "arrête les liens à la $reason et conserve un avertissement avec les liens déjà lus",
    async ({ repeat, expectedPages }) => {
      const gateway = goalsGateway({
        goals: [{ id: "g1" }],
        workItemsArgs: [
          { name: "first", type: { kind: "SCALAR", name: "Int" } },
          { name: "after", type: { kind: "SCALAR", name: "String" } },
        ],
      });
      let pages = 0;
      const client = clientFor((request) => {
        const { query, variables } = request.body as {
          query: string;
          variables: { name?: string };
        };
        if (
          query.includes("query typeFields") &&
          variables.name === "TownsquareWorkItemConnection"
        ) {
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
        if (query.includes("query goalWorkItems")) {
          pages += 1;
          return {
            status: 200,
            json: {
              data: {
                goals_byIds: [
                  {
                    id: "g1",
                    workItems: {
                      edges: [{ node: { key: `ABC-${pages}` } }],
                      pageInfo: {
                        hasNextPage: true,
                        endCursor: repeat ? "même-curseur" : `page-${pages}`,
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
      const result = await client.workItemKeys(["g1"]);
      expect(pages).toBe(expectedPages);
      expect(result.g1).toHaveLength(expectedPages);
      expect(client.lastWorkItemsIssue).toContain("dépasse la pagination prise en charge");
    },
  );
});
