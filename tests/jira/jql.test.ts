import { describe, expect, it } from "vitest";
import { JiraClient } from "../../src/jira/client";
import { decodeJqlValidation } from "../../src/jira/jql";
import { JiraTransport } from "../../src/jira/transport";
import { ACME, FakeJira } from "../support/fakeJira";

const client = (jira: FakeJira) =>
  new JiraClient(new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 }));

describe("contrats JQL Jira", () => {
  it("valide strictement le texte exact par une lecture POST", async () => {
    const jira = new FakeJira().on("POST", "/rest/api/3/jql/parse", {
      status: 200,
      json: { queries: [{ query: "labels = run", structure: { where: {} } }] },
    });
    expect(await client(jira).validateJql(" labels = run ")).toEqual({ errors: [], warnings: [] });
    expect(jira.requests[0]?.body).toEqual({ queries: [" labels = run "] });
    expect(jira.requests[0]?.url.searchParams.get("validation")).toBe("strict");
  });
  it("préserve erreurs et avertissements, refuse une réponse non concluante", () => {
    expect(decodeJqlValidation({ queries: [{ warnings: ["Valeur inconnue"] }] })).toEqual({
      errors: [],
      warnings: ["Valeur inconnue"],
    });
    expect(decodeJqlValidation({ queries: [{ errors: ["Champ inconnu"] }] }).errors).toEqual([
      "Champ inconnu",
    ]);
    expect(() => decodeJqlValidation({ queries: [{}] })).toThrow();
    expect(() => decodeJqlValidation({ queries: [{ errors: [42] }] })).toThrow();
  });
  it("décode les références et les suggestions comme texte, et conserve l'identité des champs personnalisés", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/api/3/jql/autocompletedata", {
        status: 200,
        json: {
          visibleFieldNames: [
            {
              value: "Priorité incident",
              displayName: "Priorité incident - cf[123]",
              cfid: "cf[123]",
              auto: "true",
              searchable: "true",
              operators: ["="],
              types: ["string"],
            },
          ],
          visibleFunctionNames: [],
        },
      })
      .on("GET", "/rest/api/3/jql/autocompletedata/suggestions", {
        status: 200,
        json: { results: [{ value: "P1", displayName: "<b>P</b>1" }] },
      });
    const api = client(jira);
    expect((await api.jqlAutocompleteData()).fields[0]).toMatchObject({
      value: "cf[123]",
      auto: true,
      operators: ["="],
    });
    expect(await api.jqlValueSuggestions("cf[123]", "P")).toEqual([{ value: "P1", label: "P1" }]);
    expect(jira.requests[1]?.url.searchParams.get("fieldName")).toBe("cf[123]");
  });
  it("évalue des identifiants numériques avec résultats et erreurs par requête", async () => {
    const jira = new FakeJira().on("POST", "/rest/api/3/jql/match", {
      status: 200,
      json: {
        matches: [
          { matchedIssues: [10001], errors: [] },
          { matchedIssues: [], errors: ["JQL invalide"] },
        ],
      },
    });
    expect(await client(jira).matchJql(["10001"], ["labels = run", "invalide"])).toEqual([
      { issueIds: ["10001"], errors: [] },
      { issueIds: [], errors: ["JQL invalide"] },
    ]);
    expect(jira.requests[0]?.body).toEqual({
      issueIds: [10001],
      jqls: ["labels = run", "invalide"],
    });
    await expect(client(jira).matchJql(["ABC-1"], ["labels = run"])).rejects.toThrow("Identifiant");
    await expect(
      client(jira).matchJql(
        Array.from({ length: 51 }, (_, i) => String(i + 1)),
        ["labels = run"],
      ),
    ).rejects.toThrow("50");
    expect(jira.requests).toHaveLength(1);
  });
});
