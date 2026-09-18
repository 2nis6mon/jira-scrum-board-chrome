import { describe, expect, it } from "vitest";
import {
  fieldList,
  flaggedFieldId,
  goalsFieldId,
  JiraClient,
  type JiraField,
} from "../../src/jira/client";
import { JiraError } from "../../src/jira/errors";
import { JiraTransport } from "../../src/jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { ACME, FakeJira } from "../support/fakeJira";
import { issueJson } from "../support/jiraFixtures";

function clientFor(jira: FakeJira) {
  return new JiraClient(new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 }));
}

const field = (id: string, name: string, schemaCustom: string | null = null): JiraField => ({
  id,
  name,
  schemaType: null,
  schemaCustom,
});

describe("fieldList", () => {
  it("demande le nécessaire, le champ d'estimation et les extras, sans doublon", () => {
    const fields = fieldList("customfield_10016", [
      "customfield_10100",
      "labels",
      "fixVersions",
    ]).split(",");
    expect(fields).toContain("parent");
    expect(fields).toContain("issuelinks");
    expect(fields).toContain("customfield_10016");
    expect(fields).toContain("fixVersions");
    expect(fields.filter((name) => name === "labels")).toHaveLength(1);
    expect(fieldList(null).split(",")).not.toContain("null");
  });
});

// GoalsFieldDiscoveryTests / FlaggedFieldTests (GoalFieldTests.swift)
describe("repérage des champs", () => {
  it("champ Goals : nom exact d'abord, puis type, puis nom approchant", () => {
    const byType = field("customfield_2", "Objectifs", "com.atlassian.townsquare:goals-field");
    expect(
      goalsFieldId([field("customfield_1", "Team goals"), field("customfield_3", "Goals")]),
    ).toBe("customfield_3");
    expect(goalsFieldId([field("customfield_1", "Team goals"), byType])).toBe("customfield_2");
    expect(goalsFieldId([field("customfield_1", "Team goals")])).toBe("customfield_1");
    expect(goalsFieldId([field("customfield_9", "Story Points")])).toBeNull();
  });

  it("drapeau : nom anglais ou français", () => {
    expect(flaggedFieldId([field("customfield_10021", "Flagged")])).toBe("customfield_10021");
    expect(flaggedFieldId([field("customfield_10030", "Signalé")])).toBe("customfield_10030");
  });

  it("drapeau : à nom égal, le champ à cases à cocher est préféré", () => {
    const list = [
      field("customfield_1", "Flagged", "x:textfield"),
      field(
        "customfield_2",
        "Flagged",
        "com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes",
      ),
    ];
    expect(flaggedFieldId(list)).toBe("customfield_2");
  });

  it("drapeau : aucun champ sur l'instance", () => {
    expect(flaggedFieldId([field("customfield_1", "Story Points")])).toBeNull();
  });
});

describe("JiraClient", () => {
  it("lit la structure du board en deux requêtes", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/agile/1.0/board/7", {
        status: 200,
        json: { id: 7, name: "Board de test", type: "scrum", location: { projectKey: "ABC" } },
      })
      .on("GET", "/rest/agile/1.0/board/7/configuration", {
        status: 200,
        json: {
          columnConfig: {
            columns: [
              { name: "À faire", statuses: [{ id: "1" }] },
              { name: "En cours", statuses: [{ id: "3" }, { id: "4" }], max: 5 },
              { name: "Vide", statuses: [] },
            ],
          },
          estimation: { type: "field", field: { fieldId: "customfield_10016" } },
        },
      });

    expect(await clientFor(jira).boardStructure(7)).toEqual({
      boardId: 7,
      boardName: "Board de test",
      boardType: "scrum",
      projectKey: "ABC",
      columns: [
        { name: "À faire", statusIds: ["1"], max: null },
        { name: "En cours", statusIds: ["3", "4"], max: 5 },
        { name: "Vide", statusIds: [], max: null },
      ],
      estimationFieldId: "customfield_10016",
    });
  });

  it("signale une configuration de board illisible", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/agile/1.0/board/7", { status: 200, json: { name: "B" } })
      .on("GET", "/rest/agile/1.0/board/7/configuration", { status: 200, json: {} });
    await expect(clientFor(jira).boardStructure(7)).rejects.toThrowError(JiraError);
  });

  it("suit la pagination des sprints jusqu'au bout", async () => {
    const sprint = (id: number) => ({ id, name: `Sprint ${id}`, state: "active" });
    const jira = new FakeJira().on(
      "GET",
      "/rest/agile/1.0/board/7/sprint",
      { status: 200, json: { values: [sprint(1), sprint(2)], isLast: false } },
      { status: 200, json: { values: [sprint(3)], isLast: true } },
    );
    const sprints = await clientFor(jira).sprints(7, ["active"]);

    expect(sprints.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(jira.requests.map((r) => r.url.searchParams.get("startAt"))).toEqual(["0", "2"]);
    expect(jira.requests[0]?.url.searchParams.get("state")).toBe("active");
  });

  it("lit les tickets d'un sprint : champs utiles, historique, pagination par total", async () => {
    const jira = new FakeJira().on(
      "GET",
      "/rest/agile/1.0/sprint/42/issue",
      { status: 200, json: { issues: [issueJson("ABC-1"), issueJson("ABC-2")], total: 3 } },
      { status: 200, json: { issues: [issueJson("ABC-3")], total: 3 } },
    );
    const issues = await clientFor(jira).sprintIssues(42, {
      estimationFieldId: "customfield_10016",
      includeChangelog: true,
      extraFieldIds: ["customfield_10100"],
    });

    expect(issues.map((i) => i.key)).toEqual(["ABC-1", "ABC-2", "ABC-3"]);
    const params = jira.requests[0]?.url.searchParams;
    expect(params?.get("expand")).toBe("changelog");
    expect(params?.get("maxResults")).toBe("100");
    expect(params?.get("fields")?.split(",")).toEqual(
      expect.arrayContaining(["summary", "customfield_10016", "customfield_10100"]),
    );
    expect(params?.has("jql")).toBe(false);
    expect(jira.requests[1]?.url.searchParams.get("startAt")).toBe("2");
  });

  it("transmet le JQL du board tel quel, et sait ne demander que quelques champs", async () => {
    const jira = new FakeJira().on("GET", "/rest/agile/1.0/board/7/issue", {
      status: 200,
      json: { issues: [] },
    });
    await clientFor(jira).boardIssues(7, 'labels = "a&b"', {
      estimationFieldId: null,
      includeChangelog: false,
      onlyFields: ["issuetype", "status"],
    });
    const params = jira.requests[0]?.url.searchParams;
    expect(params?.get("jql")).toBe('labels = "a&b"');
    expect(params?.get("fields")).toBe("issuetype,status");
    expect(params?.has("expand")).toBe(false);
  });

  it("propriété de sprint : absente = null, présente = sa valeur, refus = erreur", async () => {
    const path = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
    const jira = new FakeJira().on(
      "GET",
      path,
      { status: 404 },
      { status: 200, json: { key: SPRINT_PROPERTY_KEYS.goals, value: { version: 1 } } },
      { status: 403, json: {} },
    );
    const client = clientFor(jira);

    expect(await client.sprintProperty(42, SPRINT_PROPERTY_KEYS.goals)).toBeNull();
    expect(await client.sprintProperty(42, SPRINT_PROPERTY_KEYS.goals)).toEqual({ version: 1 });
    await expect(client.sprintProperty(42, SPRINT_PROPERTY_KEYS.goals)).rejects.toThrowError(
      JiraError,
    );
  });

  it("lit statuts et champs, en ignorant les entrées illisibles", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/api/3/status", {
        status: 200,
        json: [
          { id: "1", name: "To Do", statusCategory: { id: 2, key: "new", name: "À faire" } },
          42,
        ],
      })
      .on("GET", "/rest/api/3/field", {
        status: 200,
        json: [
          {
            id: "customfield_1",
            name: "Flagged",
            schema: { type: "array", custom: "x:multicheckboxes" },
          },
          { id: "summary", name: "Résumé" },
          { nom: "illisible" },
        ],
      });
    const client = clientFor(jira);

    expect((await client.statuses()).map((s) => s.name)).toEqual(["To Do"]);
    expect(await client.fields()).toEqual([
      {
        id: "customfield_1",
        name: "Flagged",
        schemaType: "array",
        schemaCustom: "x:multicheckboxes",
      },
      { id: "summary", name: "Résumé", schemaType: null, schemaCustom: null },
    ]);
  });

  it("n'émet que des GET", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/api/3/myself", { status: 200, json: { displayName: "Personne Test" } })
      .on("GET", "/rest/agile/1.0/board/7/sprint", { status: 200, json: { values: [] } });
    const client = clientFor(jira);
    await client.myself();
    await client.sprints(7, []);
    expect(jira.requests.every((r) => r.method === "GET")).toBe(true);
    expect(jira.requests[1]?.url.searchParams.has("state")).toBe(false);
  });
});

describe("filtres rapides du board", () => {
  const PATH = "/rest/agile/1.0/board/7/quickfilter";
  const quick = (id: number, name: string, position: number, extra: object = {}) => ({
    id,
    boardId: 7,
    name,
    jql: `assignee = u${id}`,
    position,
    ...extra,
  });

  it("lit toutes les pages, dans l'ordre de Jira, sans écrire", async () => {
    const jira = new FakeJira().on(
      "GET",
      PATH,
      {
        status: 200,
        json: {
          isLast: false,
          total: 3,
          values: [quick(12, "Mes tickets", 1), quick(11, "Bugs", 0)],
        },
      },
      { status: 200, json: { isLast: true, total: 3, values: [quick(13, "Urgent", 2)] } },
    );
    const filters = await clientFor(jira).quickFilters(7);

    expect(filters.map((filter) => [filter.id, filter.name])).toEqual([
      [11, "Bugs"],
      [12, "Mes tickets"],
      [13, "Urgent"],
    ]);
    expect(jira.sent("GET", PATH).map((r) => r.url.searchParams.get("startAt"))).toEqual([
      "0",
      "2",
    ]);
    expect(jira.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("garde description et JQL ; écarte un filtre sans identifiant ni nom", async () => {
    const jira = new FakeJira().on("GET", PATH, {
      status: 200,
      json: {
        isLast: true,
        values: [
          quick(1, "Bloqués", 0, { description: "Liens « est bloqué par »" }),
          { name: "sans identifiant", jql: "x = 1" },
          { id: 3, jql: "sans nom" },
          { id: 4, name: "Sans JQL", position: 1, description: "  " },
        ],
      },
    });
    expect(await clientFor(jira).quickFilters(7)).toEqual([
      {
        id: 1,
        name: "Bloqués",
        jql: "assignee = u1",
        description: "Liens « est bloqué par »",
        position: 0,
      },
      { id: 4, name: "Sans JQL", jql: "", description: null, position: 1 },
    ]);
  });

  it("réponse inattendue : erreur de décodage", async () => {
    const jira = new FakeJira().on("GET", PATH, { status: 200, json: { filtres: [] } });
    await expect(clientFor(jira).quickFilters(7)).rejects.toMatchObject({
      info: { kind: "decoding" },
    });
  });
});
