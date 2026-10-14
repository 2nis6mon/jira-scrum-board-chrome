import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { type CardColorRule, SCOPE_CHANGE_RULE } from "../../src/core/cardColors";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { isWriteRequest, type RecordedRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const SITE = normalizeSiteUrl("acme.atlassian.net");

// Réponses FICTIVES de Jira, par JQL : seul Jira évalue les règles.
const ANSWERS: Record<string, string[]> = {
  "priority = High": ["ABC-101"],
  "labels = perf": ["ABC-101", "ABC-103"],
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
  const jira = boardSiteJira().on("POST", "/rest/api/3/jql/match", (request: RecordedRequest) => {
    const body = request.body as { jqls: string[]; issueIds: number[] };
    return {
      status: 200,
      json: {
        matches: body.jqls.map((jql) => ({
          matchedIssues: SPRINT_ISSUES.filter(
            (issue) =>
              ANSWERS[jql]?.includes(issue.key as string) &&
              body.issueIds.includes(Number(issue.id)),
          ).map((issue) => Number(issue.id)),
          errors: ANSWERS[jql] ? [] : [`Champ inconnu dans « ${jql} »`],
        })),
      },
    };
  });
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform);
  await board.load();
  await board.detect(BOARD_URL);
  const jqlReads = () => jira.sent("POST", "/rest/api/3/jql/match").length;
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

  it("JQL refusé avant publication : les règles précédentes restent actives sans écriture", async () => {
    const { board, jira } = await colorBoard();
    await board.applyColorRules([rule("haute", "priority = High", "red")]);
    const before = jira.requests.filter(isWriteRequest).length;
    expect(
      await board.applyColorRules([
        rule("cassee", "champ ~~ x", "pink"),
        rule("haute", "priority = High", "red"),
      ]),
    ).toBe(false);
    expect(board.colorRuleIssues.value.cassee).toContain("inconnu");
    expect(board.cardColors.value).toEqual({ "ABC-101": "red" });
    expect(board.configuration.value?.cardColorRules.map((rule) => rule.id)).toEqual(["haute"]);
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(before);
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

  it("préserve un brouillon vide désactivé et refuse son activation sans JQL", async () => {
    const { board } = await colorBoard();
    const draft = { ...rule("brouillon", "", "teal"), enabled: false };
    expect(await board.applyColorRules([draft])).toBe(true);
    expect(board.configuration.value?.cardColorRules).toEqual([draft]);
    expect(await board.applyColorRules([{ ...draft, enabled: true }])).toBe(false);
    expect(board.configuration.value?.cardColorRules[0]?.enabled).toBe(false);
  });
});
