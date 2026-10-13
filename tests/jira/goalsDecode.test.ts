import { describe, expect, it } from "vitest";
import { JiraError } from "../../src/jira/errors";
import { graphqlData, linkOutcome, parseGoal, parseWorkItems } from "../../src/jira/goals/decode";

describe("Goals — décodage pur", () => {
  it("préfère les erreurs GraphQL aux données partielles et ne transforme pas une réponse invalide en succès", () => {
    expect(() =>
      graphqlData({ data: { value: 1 }, errors: [{ message: "Accès refusé" }, null] }),
    ).toThrowError(
      expect.objectContaining({ info: { kind: "graphql", messages: ["Accès refusé"] } }),
    );
    for (const invalid of [null, [], { data: null }]) {
      expect(() => graphqlData(invalid)).toThrowError(JiraError);
    }
  });

  it("décode les variantes de libellés sans fabriquer de nom", () => {
    expect(
      parseGoal({
        id: "g1",
        title: "Paiement",
        state: { text: "En cours" },
        owner: { displayName: "Alex" },
        dueDate: { label: "2026" },
      }),
    ).toMatchObject({
      id: "g1",
      name: "Paiement",
      statusLabel: "En cours",
      ownerName: "Alex",
      targetDate: "2026",
    });
    expect(parseGoal({ id: "g1", targetDate: "2026-12-31", isArchived: "true" })).toMatchObject({
      name: null,
      targetDate: "2026-12-31",
      isArchived: false,
    });
    expect(parseGoal({ name: "Sans identifiant" })).toBeNull();
  });

  it.each([
    {
      edges: [
        { node: { key: "ABC-1" } },
        { node: { issueKey: "ABC-2" } },
        { node: { id: "ABC-3" } },
      ],
    },
    { nodes: [{ key: "ABC-1" }, { issueKey: "ABC-2" }, { id: "ABC-3" }] },
  ])("décode les deux formes de connexion, sans déduire la pagination : %j", (container) => {
    const pageInfo = { hasNextPage: true, nextCursor: "suivant" };
    expect(parseWorkItems({ ...container, pageInfo })).toEqual({
      keys: ["ABC-1", "ABC-2", "ABC-3"],
      itemCount: 3,
      pageInfo,
      issue: null,
    });
  });

  it("distingue absence de tickets, connexion illisible et tickets partiellement lisibles", () => {
    expect(parseWorkItems({ nodes: [] })).toMatchObject({ keys: [], itemCount: 0, issue: null });
    expect(parseWorkItems({})).toBeNull();
    expect(
      parseWorkItems({ edges: [{ node: { key: "ABC-1" } }, null, { node: { id: 42 } }] }),
    ).toMatchObject({
      keys: ["ABC-1"],
      itemCount: 3,
      issue: expect.stringContaining("clé de ticket lisible"),
    });
  });

  it("garde les refus de mutation explicites et rejette un résultat absent", () => {
    expect(
      linkOutcome(
        { data: { goals_linkWorkItem: { success: false, errors: { message: "Refus" } } } },
        "goals_linkWorkItem",
      ),
    ).toEqual({ success: false, messages: ["Refus"] });
    expect(
      linkOutcome(
        { errors: [{ message: "Validation" }], data: { goals_linkWorkItem: { success: true } } },
        "goals_linkWorkItem",
      ),
    ).toEqual({ success: false, messages: ["Validation"] });
    expect(() => linkOutcome({ data: {} }, "goals_linkWorkItem")).toThrowError(JiraError);
  });
});
