import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { type CardColorRule, SCOPE_CHANGE_RULE } from "../../src/core/cardColors";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { isWriteRequest, type RecordedRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const ISSUES = "/rest/agile/1.0/board/7/issue";

// Réponses FICTIVES de Jira, par JQL : seul Jira évalue les règles.
const ANSWERS: Record<string, string[]> = {
  "(priority = High) AND sprint in (42)": ["ABC-101"],
  "(labels = perf) AND sprint in (42)": ["ABC-101", "ABC-103"],
};

const rule = (id: string, jql: string, color: string): CardColorRule => ({
  id,
  name: id,
  jql,
  color,
  enabled: true,
  kind: null,
});

async function colorBoard() {
  const jira = boardSiteJira().on("GET", ISSUES, (request: RecordedRequest) => {
    const jql = request.url.searchParams.get("jql");
    if (jql === null) return { status: 200, json: { issues: SPRINT_ISSUES, total: 6 } };
    const keys = ANSWERS[jql];
    if (!keys) return { status: 400, json: { errorMessages: [`Champ inconnu dans « ${jql} »`] } };
    const issues = SPRINT_ISSUES.filter((issue) => keys.includes(issue.key as string));
    return { status: 200, json: { issues, total: issues.length } };
  });
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform);
  await board.load();
  await board.detect(BOARD_URL);
  const jqlReads = () =>
    jira.sent("GET", ISSUES).filter((r) => r.url.searchParams.get("jql") !== null).length;
  return { board, jira, platform, jqlReads };
}

describe("BoardModel — couleurs des cartes", () => {
  it("sans règle JQL : aucune requête ni couleur", async () => {
    const { board, jqlReads } = await colorBoard();
    expect(jqlReads()).toBe(0);
    expect(board.cardColors.value).toEqual({});
  });

  it("appliquer une règle : Jira dit quels tickets colorer, la règle est enregistrée et partagée", async () => {
    const { board, jira, platform } = await colorBoard();
    await board.applyColorRules([rule("haute", "priority = High", "red"), SCOPE_CHANGE_RULE]);

    expect(board.cardColors.value).toEqual({ "ABC-101": "red" });
    expect(board.colorRuleCounts.value.haute).toBe(1);
    const stored = await loadActiveBoard(platform.store, SITE.origin);
    expect(stored?.cardColorRules.map((r) => r.id)).toEqual(["haute", SCOPE_CHANGE_RULE.id]);
    // Seule écriture : les réglages partagés du board, une fois.
    expect(jira.requests.filter(isWriteRequest).map((r) => `${r.method} ${r.path}`)).toEqual([
      "PUT /rest/agile/1.0/board/7/properties/com.scrumboardmac.boardsettings.v1",
    ]);
  });

  it("deux règles pour un même ticket : la plus haute dans la liste l'emporte", async () => {
    const { board } = await colorBoard();
    await board.applyColorRules([
      rule("haute", "priority = High", "red"),
      rule("perf", "labels = perf", "teal"),
    ]);
    expect(board.cardColors.value).toEqual({ "ABC-101": "red", "ABC-103": "teal" });

    await board.applyColorRules([
      rule("perf", "labels = perf", "teal"),
      rule("haute", "priority = High", "red"),
    ]);
    expect(board.cardColors.value).toEqual({ "ABC-101": "teal", "ABC-103": "teal" });
  });

  it("JQL refusé : le refus est dit sous la règle, les autres colorent quand même", async () => {
    const { board } = await colorBoard();
    await board.applyColorRules([
      rule("cassee", "champ ~~ x", "pink"),
      rule("haute", "priority = High", "red"),
    ]);
    expect(board.colorRuleIssues.value.cassee).toContain("Champ inconnu");
    expect(board.cardColors.value).toEqual({ "ABC-101": "red" });
  });

  it("chaque actualisation fait réévaluer les règles par Jira", async () => {
    const { board, jqlReads } = await colorBoard();
    await board.applyColorRules([rule("haute", "priority = High", "red")]);
    const before = jqlReads();
    await board.sync();
    expect(jqlReads()).toBe(before + 1);
    expect(board.cardColors.value).toEqual({ "ABC-101": "red" });
  });

  it("règle suspendue : plus de couleur, plus de requête", async () => {
    const { board, jqlReads } = await colorBoard();
    await board.applyColorRules([{ ...rule("haute", "priority = High", "red"), enabled: false }]);
    expect(board.cardColors.value).toEqual({});
    expect(jqlReads()).toBe(0);
  });
});
