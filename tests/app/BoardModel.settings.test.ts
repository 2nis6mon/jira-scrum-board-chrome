import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway } from "../support/goalsGateway";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const SPRINTS = "/rest/agile/1.0/board/7/sprint";
const SPRINT_ISSUES = "/rest/agile/1.0/board/7/sprint/42/issue";

async function settingsBoard(jira = boardSiteJira()) {
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform);
  await board.load();
  await board.detect(BOARD_URL);
  const writesBefore = jira.requests.filter(isWriteRequest).length;
  return {
    board,
    jira,
    stored: () => loadActiveBoard(platform.store, SITE.origin),
    jiraWrites: () => jira.requests.filter(isWriteRequest).length - writesBefore,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("BoardModel — page Réglages", () => {
  it("un type passé en « Ignoré » disparaît du board après relecture ; réglage partagé écrit une fois", async () => {
    const { board, stored, jiraWrites } = await settingsBoard();
    expect(board.snapshot.value?.swimlaneIssues.map((issue) => issue.issue.key)).toEqual(["RUN-7"]);

    await board.applySettings(
      (current) => ({
        ...current,
        issueTypes: current.issueTypes.map((type) =>
          type.id === "10004" ? { ...type, category: "IGNORED" as const } : type,
        ),
      }),
      { resync: true },
    );

    expect(board.snapshot.value?.swimlaneIssues).toEqual([]);
    expect(board.layout.value?.lanes.map((lane) => lane.id)).not.toContain("swimlane:1");
    expect((await stored())?.issueTypes.find((type) => type.id === "10004")?.category).toBe(
      "IGNORED",
    );
    // Une seule écriture : la propriété du board (réglages partagés), rien d'autre.
    expect(jiraWrites()).toBe(1);
  });

  it("source des objectifs : le texte du sprint, même quand les Goals répondent", async () => {
    const { board } = await settingsBoard(boardSiteJira({ graphql: goalsGateway({ goals: [] }) }));
    expect(board.snapshot.value?.goalsOrigin).toBe("atlassianGoals");

    await board.applySettings((current) => ({ ...current, goalSource: "sprintText" }), {
      resync: true,
    });
    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(board.snapshot.value?.goals.map((goal) => goal.title)).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
    ]);
  });

  it("un champ de carte ajouté est demandé à Jira dès la relecture", async () => {
    const { board, jira } = await settingsBoard();
    await board.applySettings(
      (current) => ({
        ...current,
        cardFields: [
          { kind: "custom", customFieldId: "customfield_10777", customFieldName: "Équipe" },
        ],
      }),
      { resync: true },
    );
    const fields = jira.sent("GET", SPRINT_ISSUES).at(-1)?.url.searchParams.get("fields");
    expect(fields?.split(",")).toContain("customfield_10777");
  });

  it("champs personnalisés de l'instance : lus une fois, triés, sans les champs système", async () => {
    const { board } = await settingsBoard();
    await board.loadCustomFields();
    expect(board.customFields.value?.map((field) => field.name)).toEqual([
      "Flagged",
      "Story Points",
    ]);
  });

  it("rafraîchissement automatique : relit Jira à l'intervalle choisi, saute son tour pendant un geste", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { board, jira, jiraWrites } = await settingsBoard();
    const reads = () => jira.sent("GET", SPRINTS).length;

    await board.applySettings((current) => ({ ...current, autoRefreshSeconds: 60 }), {
      resync: false,
    });
    const before = reads();
    vi.advanceTimersByTime(60_000);
    await vi.waitFor(() => expect(reads()).toBe(before + 1));

    // Pendant un glisser-déposer, pas de relecture sous le curseur.
    board.startDrag("ABC-101", null);
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(reads()).toBe(before + 1);
    board.endDrag();

    // Désactivé : plus rien.
    await board.applySettings((current) => ({ ...current, autoRefreshSeconds: null }), {
      resync: false,
    });
    vi.advanceTimersByTime(300_000);
    await Promise.resolve();
    expect(reads()).toBe(before + 1);
    expect(jiraWrites()).toBe(0);
  });

  it("le rafraîchissement automatique s'arrête avec le board", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { board, jira } = await settingsBoard();
    await board.applySettings((current) => ({ ...current, autoRefreshSeconds: 60 }), {
      resync: false,
    });
    const before = jira.sent("GET", SPRINTS).length;
    board.dispose();
    vi.advanceTimersByTime(180_000);
    await Promise.resolve();
    expect(jira.sent("GET", SPRINTS).length).toBe(before);
  });

  it("le rafraîchissement enregistré reprend au rechargement du board", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const jira = boardSiteJira();
    const platform = fakePlatform(jira);
    const first = new BoardModel(SITE, platform);
    await first.load();
    await first.detect(BOARD_URL);
    await first.applySettings((current) => ({ ...current, autoRefreshSeconds: 120 }), {
      resync: false,
    });
    first.dispose();

    const reopened = new BoardModel(SITE, platform);
    await reopened.load();
    const before = jira.sent("GET", SPRINTS).length;
    vi.advanceTimersByTime(120_000);
    await vi.waitFor(() => expect(jira.sent("GET", SPRINTS).length).toBe(before + 1));
    reopened.dispose();
  });
});
