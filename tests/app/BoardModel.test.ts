import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard, saveBoard } from "../../src/app/model/boardStore";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import {
  BOARD_URL,
  boardSiteJira,
  GOALS_DOCUMENT,
  SPRINT_GOAL_TEXT,
  SPRINT_ISSUES,
} from "../support/boardFixture";
import { type FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { issueJson, makeConfiguration } from "../support/jiraFixtures";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const NOW = new Date("2026-09-18T10:00:00Z");

function modelFor(jira: FakeJira) {
  const platform = fakePlatform(jira);
  return { board: new BoardModel(SITE, platform, { now: () => NOW }), platform };
}

async function detected(jira: FakeJira = boardSiteJira()) {
  const context = modelFor(jira);
  await context.board.load();
  await context.board.detect(BOARD_URL);
  return { ...context, jira };
}

describe("BoardModel — mise en place", () => {
  it("sans board enregistré : ne demande rien à Jira", async () => {
    const jira = boardSiteJira();
    const { board } = modelFor(jira);
    await board.load();

    expect(board.loaded.value).toBe(true);
    expect(board.configuration.value).toBeNull();
    expect(jira.requests).toEqual([]);
  });

  it("détecte le board, l'enregistre localement, puis le synchronise", async () => {
    const { board, platform } = await detected();

    expect(board.configuration.value?.boardName).toBe("Équipe Paiement");
    expect(board.snapshot.value?.sprint?.name).toBe("Sprint 42");
    expect(board.snapshot.value?.scrumIssues).toHaveLength(5);
    expect(board.snapshot.value?.runIssues.map((i) => i.issue.key)).toEqual(["RUN-7"]);
    expect(board.syncProblem.value).toBeNull();
    const stored = await loadActiveBoard(platform.store, SITE.origin);
    expect(stored?.boardId).toBe(7);
  });

  it("objectifs : texte du sprint et liens de la propriété, avec la limitation affichée", async () => {
    const { board } = await detected();
    const snapshot = board.snapshot.value;

    expect(snapshot?.goals.map((goal) => goal.title)).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
    ]);
    expect(snapshot?.scrumIssues.find((i) => i.issue.key === "ABC-101")?.goalId).toBe("g-paiement");
    expect(board.goalsNotice.value).toContain("Goals Atlassian illisibles");
  });

  it("board relu au lancement suivant, avec ses réglages locaux", async () => {
    const { platform } = await detected();
    const stored = await loadActiveBoard(platform.store, SITE.origin);
    if (!stored) throw new Error("board attendu");
    await saveBoard(platform.store, { ...stored, buildSectionLabel: "Hors objectif" });

    const jira = boardSiteJira();
    const next = new BoardModel(SITE, { ...platform, fetch: jira.fetch }, { now: () => NOW });
    await next.load();

    expect(next.configuration.value?.buildSectionLabel).toBe("Hors objectif");
    expect(next.snapshot.value?.sprint?.id).toBe(42);
    // Relecture : pas de nouvelle découverte de la structure du board.
    expect(jira.sent("GET", "/rest/agile/1.0/board/7/configuration")).toEqual([]);
  });

  it("adresse invalide : message, rien d'enregistré, rien demandé", async () => {
    const jira = boardSiteJira();
    const { board, platform } = modelFor(jira);
    await board.load();
    await board.detect("https://acme.atlassian.net/browse/ABC-1");

    expect(board.setupError.value?.text).toContain("ne désigne pas un board");
    expect(board.configuration.value).toBeNull();
    expect(platform.stored.size).toBe(0);
    expect(jira.requests).toEqual([]);
  });

  it("re-détecter un board connu garde ses réglages locaux", async () => {
    const { board, platform } = await detected();
    const stored = await loadActiveBoard(platform.store, SITE.origin);
    if (!stored) throw new Error("board attendu");
    await saveBoard(platform.store, { ...stored, hiddenGoalIds: ["g-stabilite"] });

    board.editBoard();
    await board.detect(BOARD_URL);

    expect(board.editingBoard.value).toBe(false);
    expect(board.configuration.value?.hiddenGoalIds).toEqual(["g-stabilite"]);
  });

  it("mémorise localement les couleurs attribuées aux objectifs", async () => {
    const { board, platform } = await detected();
    const stored = await loadActiveBoard(platform.store, SITE.origin);
    expect(stored?.goalColorIndex).toEqual({ "g-paiement": 0, "g-stabilite": 1 });
    expect(board.snapshot.value?.goals.map((g) => g.color)).toEqual(["goal1", "goal2"]);
  });
});

describe("BoardModel — synchronisation", () => {
  it("masque un Goal inconnu introduit par un ticket, puis permet de le réafficher", async () => {
    const { jira, board, platform } = await detected();
    const newGoalId = "g-nouveau";
    const newIssue = issueJson("ABC-106", {
      summary: "Ticket ajouté au sprint avec un nouveau Goal",
      statusId: "3",
      statusName: "En cours",
    });
    jira
      .on("GET", "/rest/agile/1.0/board/7/sprint", {
        status: 200,
        json: {
          isLast: true,
          values: [
            {
              id: 42,
              name: "Sprint 42",
              state: "active",
              goal: `${SPRINT_GOAL_TEXT}\n🎯 Nouveau Goal`,
            },
          ],
        },
      })
      .on("GET", "/rest/agile/1.0/board/7/sprint/42/issue", {
        status: 200,
        json: { issues: [...SPRINT_ISSUES, newIssue], total: SPRINT_ISSUES.length + 1 },
      })
      .on("GET", `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 200,
        json: {
          value: {
            ...GOALS_DOCUMENT,
            goals: [
              ...GOALS_DOCUMENT.goals,
              { id: newGoalId, title: "Nouveau Goal", color: "goal3", position: 2 },
            ],
            links: { ...GOALS_DOCUMENT.links, "ABC-106": newGoalId },
          },
        },
      });

    await board.sync();

    expect(board.snapshot.value?.goals.some((goal) => goal.id === newGoalId)).toBe(true);
    expect(board.configuration.value?.hiddenGoalIds).toContain(newGoalId);
    expect(board.hiddenGoals.value.map((goal) => goal.id)).toContain(newGoalId);
    expect(
      board.layout.value?.lanes
        .find((lane) => lane.id === "build")
        ?.cells.flatMap((cell) => cell.issues)
        .map((issue) => issue.issue.key),
    ).toContain("ABC-106");
    expect((await loadActiveBoard(platform.store, SITE.origin))?.hiddenGoalIds).toContain(
      newGoalId,
    );

    await board.setGoalHidden(newGoalId, false);

    expect(board.hiddenGoals.value.map((goal) => goal.id)).not.toContain(newGoalId);
    expect(
      board.layout.value?.lanes
        .find((lane) => lane.id === `goal:${newGoalId}`)
        ?.cells.flatMap((cell) => cell.issues)
        .map((issue) => issue.issue.key),
    ).toEqual(["ABC-106"]);

    await board.sync();
    expect(board.configuration.value?.hiddenGoalIds).not.toContain(newGoalId);
  });

  it("ne fait que lire", async () => {
    const { jira, board } = await detected();
    await board.sync();
    await board.refreshStructure();
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("session perdue : le dit, garde le board affiché, puis se rétablit", async () => {
    const { jira, board } = await detected();
    jira.on("GET", "/rest/agile/1.0/board/7/sprint", { status: 401 });
    await board.sync();

    expect(board.syncProblem.value?.sessionLost).toBe(true);
    expect(board.snapshot.value?.sprint?.id).toBe(42);

    jira.on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [{ id: 42, name: "Sprint 42", state: "active" }], isLast: true },
    });
    await board.sync();
    expect(board.syncProblem.value).toBeNull();
  });

  it("réseau coupé : message distinct d'une perte de session", async () => {
    const { jira, board } = await detected();
    jira.on("GET", "/rest/agile/1.0/board/7/sprint", { networkError: "Failed to fetch" });
    await board.sync();

    expect(board.syncProblem.value?.sessionLost).toBe(false);
    expect(board.syncProblem.value?.text).toContain("Connexion à Jira impossible");
  });

  it("une demande pendant une synchronisation en relance une seule après elle", async () => {
    const { jira, board } = await detected();
    const before = jira.sent("GET", "/rest/agile/1.0/board/7/sprint/42/issue").length;

    const first = board.sync();
    void board.sync();
    void board.sync();
    await first;

    expect(jira.sent("GET", "/rest/agile/1.0/board/7/sprint/42/issue").length - before).toBe(2);
    expect(board.syncing.value).toBe(false);
  });

  it("board sans sprint actif : photographie vide, sans erreur", async () => {
    const jira = boardSiteJira().on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [], isLast: true },
    });
    const { board } = await detected(jira);
    expect(board.snapshot.value?.sprint).toBeNull();
    expect(board.syncProblem.value).toBeNull();
  });

  it("n'utilise pas un board d'un autre site trouvé dans le stockage", async () => {
    const jira = boardSiteJira();
    const { board, platform } = modelFor(jira);
    await saveBoard(
      platform.store,
      makeConfiguration({ siteOrigin: "https://autre.atlassian.net" }),
    );
    await board.load();
    expect(board.configuration.value).toBeNull();
    expect(jira.requests).toEqual([]);
  });
});

describe("BoardModel — filtres et mise en page", () => {
  it("met le board en swimlanes : objectifs, Build, RUN", async () => {
    const { board } = await detected();
    const layout = board.layout.value;
    expect(layout?.lanes.map((lane) => [lane.title, lane.totalCount])).toEqual([
      ["Finaliser le parcours de paiement", 2],
      ["Améliorer la stabilité", 1],
      ["Build", 2],
      ["RUN", 1],
    ]);
    expect(layout?.columns.map((column) => column.name)).toEqual([
      "À faire",
      "En cours",
      "Terminé",
    ]);
  });

  it("recherche, filtres rapides, objectif ciblé, remise à zéro", async () => {
    const { board } = await detected();
    const keys = () =>
      board.layout.value?.lanes.flatMap((lane) =>
        lane.cells.flatMap((cell) => cell.issues.map((i) => i.issue.key)),
      );

    board.setSearch("panier");
    expect(keys()).toEqual(["ABC-103", "RUN-7"]);

    board.setSearch("");
    board.toggleQuickFilter("blocked");
    expect(keys()).toEqual(["ABC-102"]);

    board.resetFilters();
    board.focusGoal("g-stabilite");
    expect(keys()).toEqual(["ABC-103"]);
    board.focusGoal("g-stabilite");
    expect(keys()).toHaveLength(6);
  });

  it("options de filtre : valeurs réellement présentes", async () => {
    const { board } = await detected();
    const options = board.options.value;
    expect(options?.assignees.map((o) => [o.label, o.count])).toEqual([
      ["Alex Martin", 2],
      ["Camille Durand", 2],
    ]);
    expect(options?.unassignedCount).toBe(2);
    expect(options?.goals.map((o) => o.count)).toEqual([2, 1]);
    expect(options?.withoutGoalCount).toBe(2);
  });

  it("drapeau Jira repéré à la détection et lu sur les tickets", async () => {
    const { board } = await detected();
    const flagged = board.snapshot.value?.scrumIssues.filter((issue) => issue.isFlagged);
    expect(flagged?.map((issue) => issue.issue.key)).toEqual(["ABC-104"]);
  });
});
