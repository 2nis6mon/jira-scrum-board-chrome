import { describe, expect, it } from "vitest";
import { JiraError } from "../../src/jira/errors";
import { type GoalsQuery, GoalsSchema } from "../../src/jira/goals/schema";
import type { JsonObject } from "../../src/jira/json";

const scalar = (name: string) => ({ kind: "SCALAR", name });
const object = (name: string) => ({ kind: "OBJECT", name });
const field = (name: string, type: JsonObject) => ({ name, type });

/** Schéma fictif indépendant du transport HTTP et des réponses de tickets. */
function schemaFixture(options: { fail?: (operation: string, name: string) => boolean } = {}) {
  const calls: { operation: string; name: string }[] = [];
  const fields: Record<string, JsonObject[]> = {
    GoalConnection: [field("edges", object("GoalEdge")), field("pageInfo", object("PageInfo"))],
    GoalEdge: [field("node", object("Goal"))],
    Goal: [
      field("id", scalar("ID")),
      field("name", scalar("String")),
      field("workItems", object("WorkItems")),
    ],
    WorkItems: [field("nodes", object("WorkItem")), field("pageInfo", object("PageInfo"))],
    WorkItem: [field("issueKey", scalar("String"))],
    PageInfo: [field("hasNextPage", scalar("Boolean")), field("nextCursor", scalar("String"))],
  };
  const execute: GoalsQuery = async (operation, variables = {}) => {
    const name = String(variables.name ?? "");
    calls.push({ operation, name });
    if (options.fail?.(operation, name))
      throw new Error("Introspection momentanément indisponible");
    if (operation.includes("__schema")) {
      return {
        __schema: { queryType: { fields: [field("goals_search", object("GoalConnection"))] } },
      };
    }
    if (operation.includes("query fieldArgs")) {
      return {
        __type: {
          fields: [
            {
              name: "workItems",
              args: [
                { name: "first", type: { kind: "NON_NULL", ofType: scalar("Int") } },
                { name: "after", type: scalar("ID") },
              ],
            },
          ],
        },
      };
    }
    return { __type: { fields: fields[name] ?? [] } };
  };
  return { schema: new GoalsSchema(execute), calls, fields };
}

describe("GoalsSchema — découverte et cache sans transport", () => {
  it("partage les champs en cours de lecture entre plusieurs sélections puis les réutilise", async () => {
    const { schema, calls } = schemaFixture();
    await schema.goalTypeName();
    const [available, selection, workItems] = await Promise.all([
      schema.availableGoalFields(),
      schema.selection(),
      schema.workItemsSelection(),
    ]);
    expect(available).toEqual(["id", "name", "workItems"]);
    expect(selection).toBe("id name");
    expect(workItems.issue).toBeNull();
    expect(
      calls.filter((call) => call.name === "Goal" && call.operation.includes("query typeFields")),
    ).toHaveLength(1);
    const count = calls.length;
    await Promise.all([
      schema.availableGoalFields(),
      schema.selection(),
      schema.workItemsSelection(),
    ]);
    expect(calls).toHaveLength(count);
  });

  it("une lecture de champs échouée est partagée puis retirée du cache pour le prochain essai", async () => {
    let fail = true;
    const { schema, calls } = schemaFixture({
      fail: (_operation, name) => fail && name === "Goal",
    });
    await schema.goalTypeName();
    const failed = await Promise.allSettled([schema.availableGoalFields(), schema.selection()]);
    expect(failed.map((item) => item.status)).toEqual(["rejected", "rejected"]);
    expect(calls.filter((call) => call.name === "Goal")).toHaveLength(1);
    fail = false;
    expect(await schema.selection()).toBe("id name");
    expect(calls.filter((call) => call.name === "Goal")).toHaveLength(2);
  });

  it("ne confond pas une panne d'arguments avec une absence durable de lien", async () => {
    let fail = true;
    const { schema } = schemaFixture({
      fail: (operation) => fail && operation.includes("query fieldArgs"),
    });
    expect(await schema.workItemsSelection()).toEqual({
      selection: null,
      issue: "Introspection momentanément indisponible",
    });
    fail = false;
    expect(await schema.workItemsSelection()).toEqual({
      selection: {
        first: true,
        after: true,
        fields: "nodes { issueKey }",
        pagination: { hasNext: "hasNextPage", cursor: "nextCursor" },
      },
      issue: null,
    });
  });

  it("conserve l'avertissement d'un schéma incompatible sans refaire l'introspection", async () => {
    const { schema, calls, fields } = schemaFixture();
    fields.Goal = [field("id", scalar("ID"))];
    const first = await schema.workItemsSelection();
    expect(first.selection).toBeNull();
    expect(first.issue).toContain("n'expose pas de lien");
    const count = calls.length;
    expect(await schema.workItemsSelection()).toEqual(first);
    expect(calls).toHaveLength(count);
  });

  it("déballe LIST/NON_NULL et découvre les libellés d'interface sans inventer de champ", async () => {
    const { schema, fields } = schemaFixture();
    fields.GoalEdge = [field("node", { kind: "NON_NULL", ofType: object("Goal") })];
    fields.Goal = [
      field("id", scalar("ID")),
      field("owner", {
        kind: "LIST",
        ofType: { kind: "NON_NULL", ofType: { kind: "INTERFACE", name: "Owner" } },
      }),
      field("targetDate", scalar("String")),
      field("status", object("UnknownStatus")),
    ];
    fields.Owner = [field("displayName", scalar("String"))];
    expect(await schema.selection()).toBe("id targetDate owner { displayName }");
    expect(await schema.paginationFields()).toEqual({
      hasNext: "hasNextPage",
      cursor: "nextCursor",
    });
  });

  it("propage une session expirée au lieu de présenter le schéma comme incompatible", async () => {
    const expired = new JiraError({ kind: "unauthorized" });
    const schema = new GoalsSchema(async () => {
      throw expired;
    });
    await expect(schema.workItemsSelection()).rejects.toBe(expired);
  });
});
