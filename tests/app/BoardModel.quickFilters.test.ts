import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { isWriteRequest, type RecordedRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const ISSUES = "/rest/agile/1.0/board/7/issue";

// Filtres rapides FICTIFS du board 7. Jira seul évalue leur JQL : le faux Jira répond par JQL.
const QUICK_FILTERS = [
  { id: 21, boardId: 7, name: "Mes tickets", jql: "assignee = currentUser()", position: 0 },
  {
    id: 22,
    boardId: 7,
    name: "Priorité haute",
    jql: "priority in (High, Highest)",
    description: "Priorités hautes et critiques",
    position: 1,
  },
];
const ANSWERS: Record<string, string[]> = {
  "(assignee = currentUser()) AND sprint in (42)": ["ABC-101", "RUN-7"],
  "(priority in (High, Highest)) AND sprint in (42)": ["ABC-101", "ABC-103"],
};

async function quickFilterBoard(answers: Record<string, string[]> = ANSWERS) {
  const jira = boardSiteJira({ quickFilters: QUICK_FILTERS }).on(
    "GET",
    ISSUES,
    (request: RecordedRequest) => {
      const jql = request.url.searchParams.get("jql");
      // Sans JQL : découverte des types de tickets du board.
      if (jql === null) return { status: 200, json: { issues: SPRINT_ISSUES, total: 6 } };
      const keys = answers[jql];
      if (!keys) return { status: 400, json: { errorMessages: [`Champ inconnu dans « ${jql} »`] } };
      const issues = SPRINT_ISSUES.filter((issue) => keys.includes(issue.key as string));
      return { status: 200, json: { issues, total: issues.length } };
    },
  );
  const board = new BoardModel(SITE, fakePlatform(jira));
  await board.load();
  await board.detect(BOARD_URL);
  return { board, jira };
}

const shownKeys = (board: BoardModel) =>
  board.layout.value?.lanes.flatMap((lane) =>
    lane.cells.flatMap((cell) => cell.issues.map((issue) => issue.issue.key)),
  ) ?? [];

describe("BoardModel — filtres rapides du board Jira", () => {
  it("lit les filtres rapides du board à la synchronisation", async () => {
    const { board } = await quickFilterBoard();
    expect(board.jiraQuickFilters.value.map((filter) => filter.name)).toEqual([
      "Mes tickets",
      "Priorité haute",
    ]);
  });

  it("activer un filtre : Jira dit quels tickets garder ; le désactiver rétablit tout", async () => {
    const { board, jira } = await quickFilterBoard();
    await board.toggleJiraQuickFilter(21);
    expect(shownKeys(board).sort()).toEqual(["ABC-101", "RUN-7"]);
    expect(board.layout.value?.filtersActive).toBe(true);

    await board.toggleJiraQuickFilter(21);
    expect(shownKeys(board)).toHaveLength(6);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("deux filtres actifs se combinent, comme dans Jira", async () => {
    const { board } = await quickFilterBoard();
    await board.toggleJiraQuickFilter(21);
    await board.toggleJiraQuickFilter(22);
    expect(shownKeys(board)).toEqual(["ABC-101"]);
  });

  it("« Réinitialiser » désactive aussi les filtres rapides Jira", async () => {
    const { board } = await quickFilterBoard();
    await board.toggleJiraQuickFilter(22);
    board.resetFilters();
    expect(board.filters.value.jiraQuickFilterIds.size).toBe(0);
    expect(shownKeys(board)).toHaveLength(6);
  });

  it("chaque relecture du board fait réévaluer les filtres actifs par Jira", async () => {
    const { board, jira } = await quickFilterBoard();
    await board.toggleJiraQuickFilter(21);
    const asked = () =>
      jira.sent("GET", ISSUES).filter((r) => r.url.searchParams.get("jql") !== null).length;
    const before = asked();
    await board.sync();
    expect(asked()).toBe(before + 1);
    expect(shownKeys(board).sort()).toEqual(["ABC-101", "RUN-7"]);
  });

  it("JQL refusé par Jira : le filtre n'est pas appliqué à moitié, et on le dit", async () => {
    const { board } = await quickFilterBoard({});
    await board.toggleJiraQuickFilter(22);
    expect(board.filters.value.jiraQuickFilterIds.size).toBe(0);
    expect(shownKeys(board)).toHaveLength(6);
    expect(board.writeNotice.value?.text).toContain("Filtre rapide Jira inapplicable");
    expect(board.writeNotice.value?.text).toContain("Champ inconnu");
    expect(board.applyingQuickFilters.value).toBe(false);
  });

  it("board sans filtre rapide, ou qui ne les expose pas : aucun bouton, aucune erreur", async () => {
    const jira = boardSiteJira().on("GET", "/rest/agile/1.0/board/7/quickfilter", {
      status: 404,
      json: { errorMessages: ["Introuvable"] },
    });
    const board = new BoardModel(SITE, fakePlatform(jira));
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.jiraQuickFilters.value).toEqual([]);
    expect(board.syncProblem.value).toBeNull();
    expect(board.snapshot.value?.sprint).not.toBeNull();
  });
});
