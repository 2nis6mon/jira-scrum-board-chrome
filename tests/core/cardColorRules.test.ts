import { describe, expect, it } from "vitest";
import {
  type CardColorRule,
  cleanedColorRules,
  evaluateColorRules,
  nextRuleColor,
  SCOPE_CHANGE_RULE,
} from "../../src/core/cardColors";
import { JiraClient } from "../../src/jira/client";
import { JiraTransport } from "../../src/jira/transport";
import { ACME, FakeJira, type RecordedRequest } from "../support/fakeJira";
import { issueJson } from "../support/jiraFixtures";

const ISSUES = "/rest/agile/1.0/board/7/issue";
const rule = (id: string, jql: string, color = "red", enabled = true): CardColorRule => ({
  id,
  name: id,
  jql,
  color,
  enabled,
  kind: null,
});

/** Faux Jira qui répond selon le JQL reçu : c'est lui, et lui seul, qui l'évalue. */
function jiraAnswering(byJql: Record<string, string[]>) {
  const jira = new FakeJira().on("GET", ISSUES, (request: RecordedRequest) => {
    const jql = request.url.searchParams.get("jql") ?? "";
    const keys = byJql[jql];
    if (!keys) return { status: 400, json: { errorMessages: [`Champ inconnu : ${jql}`] } };
    return { status: 200, json: { total: keys.length, issues: keys.map((key) => issueJson(key)) } };
  });
  return { jira, client: new JiraClient(new JiraTransport({ site: ACME, fetch: jira.fetch })) };
}

describe("évaluation des règles de couleur par Jira", () => {
  it("chaque règle active est évaluée par Jira, restreinte aux sprints actifs et aux tickets affichés", async () => {
    const { jira, client } = jiraAnswering({
      "(priority = Highest) AND sprint in (42)": ["ABC-1", "HORS-9"],
    });
    const evaluation = await evaluateColorRules(client, {
      boardId: 7,
      rules: [rule("r1", "priority = Highest ORDER BY rank")],
      sprintIds: [42],
      displayedKeys: new Set(["ABC-1", "ABC-2"]),
    });
    expect(evaluation.matches).toEqual({ r1: new Set(["ABC-1"]) });
    expect(evaluation.issues).toEqual({});
    expect(jira.sent("GET", ISSUES)[0]?.url.searchParams.get("fields")).toBe("issuetype,status");
    expect(jira.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("un JQL refusé est signalé sous sa règle ; les autres restent évaluées", async () => {
    const { client } = jiraAnswering({ "(labels = urgent) AND sprint in (42)": ["ABC-2"] });
    const evaluation = await evaluateColorRules(client, {
      boardId: 7,
      rules: [rule("cassee", "champ ~~ inconnu"), rule("ok", "labels = urgent")],
      sprintIds: [42],
      displayedKeys: new Set(["ABC-1", "ABC-2"]),
    });
    expect(evaluation.issues.cassee).toContain("Champ inconnu");
    expect(evaluation.matches).toEqual({ ok: new Set(["ABC-2"]) });
  });

  it("ni règle suspendue, ni règle intégrée, ni sprint : aucune requête", async () => {
    const { jira, client } = jiraAnswering({});
    const suspended = await evaluateColorRules(client, {
      boardId: 7,
      rules: [rule("off", "a = 1", "red", false), SCOPE_CHANGE_RULE],
      sprintIds: [42],
      displayedKeys: new Set(["ABC-1"]),
    });
    const noSprint = await evaluateColorRules(client, {
      boardId: 7,
      rules: [rule("r", "a = 1")],
      sprintIds: [],
      displayedKeys: new Set(["ABC-1"]),
    });
    expect(suspended.matches).toEqual({});
    expect(noSprint.matches).toEqual({ r: new Set() });
    expect(jira.requests).toEqual([]);
  });

  it("Kanban : couleurs JQL sur le périmètre du board, sans règle de changement de sprint", async () => {
    const { jira, client } = jiraAnswering({
      "(labels = urgent) AND (fixVersion is EMPTY)": ["ABC-1", "HORS-9"],
    });
    const result = await evaluateColorRules(client, {
      boardId: 7,
      boardType: "kanban",
      kanbanSubQuery: "fixVersion is EMPTY",
      sprintIds: [],
      rules: [rule("urgence", "labels = urgent ORDER BY rank"), SCOPE_CHANGE_RULE],
      displayedKeys: new Set(["ABC-1"]),
    });
    expect(result).toEqual({ matches: { urgence: new Set(["ABC-1"]) }, issues: {} });
    expect(jira.sent("GET", ISSUES)).toHaveLength(1);
  });
});

describe("édition des règles", () => {
  it("les règles sans JQL ne sont pas enregistrées ; la règle intégrée l'est toujours", () => {
    expect(
      cleanedColorRules([
        { ...rule("vide", "   "), name: " Vide " },
        { ...rule("ok", "  a = 1  "), name: "  Incident  " },
        SCOPE_CHANGE_RULE,
      ]),
    ).toEqual([{ ...rule("ok", "a = 1"), name: "Incident" }, SCOPE_CHANGE_RULE]);
  });

  it("une nouvelle règle prend la première couleur libre", () => {
    expect(nextRuleColor([])).toBe("blue");
    expect(nextRuleColor([rule("a", "x", "blue"), rule("b", "y", "teal")])).toBe("green");
  });
});
