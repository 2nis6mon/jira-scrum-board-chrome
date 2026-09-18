import { describe, expect, it } from "vitest";
import { quickFilterKeys } from "../../src/core/jiraQuickFilters";
import { JiraClient, type JiraQuickFilter } from "../../src/jira/client";
import { JiraTransport } from "../../src/jira/transport";
import { ACME, FakeJira, type RecordedRequest } from "../support/fakeJira";
import { issueJson } from "../support/jiraFixtures";

const ISSUES = "/rest/agile/1.0/board/7/issue";
const filter = (id: number, jql: string): JiraQuickFilter => ({
  id,
  name: `Filtre ${id}`,
  jql,
  description: null,
  position: id,
});

/** Faux Jira qui répond selon le JQL reçu : c'est lui, et lui seul, qui l'évalue. */
function jiraAnswering(byJql: Record<string, string[]>) {
  const jira = new FakeJira().on("GET", ISSUES, (request: RecordedRequest) => {
    const jql = request.url.searchParams.get("jql") ?? "";
    const keys = byJql[jql];
    if (!keys) return { status: 400, json: { errorMessages: [`JQL inattendu : ${jql}`] } };
    return { status: 200, json: { total: keys.length, issues: keys.map((key) => issueJson(key)) } };
  });
  const client = new JiraClient(new JiraTransport({ site: ACME, fetch: jira.fetch }));
  return { jira, client };
}

describe("filtres rapides du board Jira", () => {
  it("fait évaluer le JQL par Jira, restreint aux sprints actifs, sans tri", async () => {
    const { jira, client } = jiraAnswering({
      "(assignee = currentUser()) AND sprint in (42,43)": ["ABC-1", "ABC-2"],
    });
    const keys = await quickFilterKeys(client, {
      boardId: 7,
      filters: [filter(1, "assignee = currentUser() ORDER BY rank")],
      sprintIds: [42, 43],
    });
    expect(keys).toEqual(new Set(["ABC-1", "ABC-2"]));
    const [request] = jira.sent("GET", ISSUES);
    expect(request?.url.searchParams.get("fields")).toBe("issuetype,status");
    expect(jira.requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("plusieurs filtres : intersection, comme sur le board Jira", async () => {
    const { client } = jiraAnswering({
      "(a = 1) AND sprint in (42)": ["ABC-1", "ABC-2", "ABC-3"],
      "(b = 2) AND sprint in (42)": ["ABC-2", "ABC-3", "ABC-9"],
    });
    const keys = await quickFilterKeys(client, {
      boardId: 7,
      filters: [filter(1, "a = 1"), filter(2, "b = 2")],
      sprintIds: [42],
    });
    expect(keys).toEqual(new Set(["ABC-2", "ABC-3"]));
  });

  it("aucun ticket retenu par Jira : ensemble vide, le board n'affiche rien", async () => {
    const { client } = jiraAnswering({ "(a = 1) AND sprint in (42)": [] });
    expect(
      await quickFilterKeys(client, { boardId: 7, filters: [filter(1, "a = 1")], sprintIds: [42] }),
    ).toEqual(new Set());
  });

  it("un filtre au JQL vide ne restreint rien", async () => {
    const { jira, client } = jiraAnswering({});
    expect(
      await quickFilterKeys(client, { boardId: 7, filters: [filter(1, "  ")], sprintIds: [42] }),
    ).toBeNull();
    expect(jira.requests).toEqual([]);
  });

  it("aucun sprint actif : rien à afficher, aucune requête", async () => {
    const { jira, client } = jiraAnswering({});
    expect(
      await quickFilterKeys(client, { boardId: 7, filters: [filter(1, "a = 1")], sprintIds: [] }),
    ).toEqual(new Set());
    expect(jira.requests).toEqual([]);
  });

  it("JQL refusé par Jira : l'erreur remonte", async () => {
    const { client } = jiraAnswering({});
    await expect(
      quickFilterKeys(client, { boardId: 7, filters: [filter(1, "champ ~ ")], sprintIds: [42] }),
    ).rejects.toMatchObject({ info: { kind: "badRequest" } });
  });
});
