import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard, saveBoard } from "../../src/app/model/boardStore";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { atlassianGoalsPlatform } from "../support/atlassianGoalsBoard";
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
    expect(board.snapshot.value?.goalIssues).toHaveLength(5);
    expect(board.snapshot.value?.swimlaneIssues.map((i) => i.issue.key)).toEqual(["RUN-7"]);
    expect(board.syncProblem.value).toBeNull();
    const stored = await loadActiveBoard(platform.store, SITE.origin);
    expect(stored?.boardId).toBe(7);
  });

  it("objectifs : texte du sprint et liens de la propriété par défaut, sans interroger les Goals", async () => {
    const { board, jira } = await detected();
    const snapshot = board.snapshot.value;

    expect(snapshot?.goals.map((goal) => goal.title)).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
    ]);
    expect(snapshot?.goalIssues.find((i) => i.issue.key === "ABC-101")?.goalId).toBe("g-paiement");
    expect(board.goalsNotice.value).toBeNull();
    expect(jira.sent("POST", "/gateway/api/graphql")).toEqual([]);
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
  const goalLane = (board: BoardModel, goalId: string) =>
    board.layout.value?.lanes
      .find((lane) => lane.id === `goal:${goalId}`)
      ?.cells.flatMap((cell) => cell.issues)
      .map((issue) => issue.issue.key);

  /** Objectif texte « Nouveau Goal » ajouté au sprint 42, avec un ticket rattaché. */
  function withNewTextGoal(jira: FakeJira, newGoalId: string): FakeJira {
    const newIssue = issueJson("ABC-106", {
      summary: "Ticket ajouté au sprint avec un nouvel objectif",
      statusId: "3",
      statusName: "En cours",
    });
    return jira
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
  }

  it("un objectif texte inconnu introduit par un ticket reste visible, rien n'est masqué", async () => {
    const { jira, board, platform } = await detected();
    const newGoalId = "g-nouveau";
    withNewTextGoal(jira, newGoalId);

    await board.sync();

    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect(board.hiddenGoals.value.map((goal) => goal.id)).not.toContain(newGoalId);
    expect(goalLane(board, newGoalId)).toEqual(["ABC-106"]);
    expect((await loadActiveBoard(platform.store, SITE.origin))?.hiddenGoalIds).toEqual([]);
  });

  it("repli texte (Goals illisibles) : un objectif texte inconnu lié reste visible", async () => {
    // Board réglé sur les Goals Atlassian ; la passerelle refuse (CORS) : repli sur le texte.
    const jira = boardSiteJira();
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira), { now: () => NOW });
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(board.goalsNotice.value).not.toBeNull();
    const newGoalId = "g-nouveau";
    withNewTextGoal(jira, newGoalId);

    await board.sync();

    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect(goalLane(board, newGoalId)).toEqual(["ABC-106"]);
  });

  it("démarrage du sprint préparé : ses objectifs texte neufs s'affichent avec leurs tickets", async () => {
    // Première lecture : sprint actif 42. Le sprint préparé 43 démarre ensuite, avec des objectifs
    // créés pendant le planning (identifiants neufs), chacun rattaché à un ticket.
    const { jira, board, platform } = await detected();
    const issues = [
      issueJson("ABC-201", { summary: "Mémoriser le moyen de paiement", statusId: "1" }),
      issueJson("ABC-202", { summary: "Charger le panier plus vite", statusId: "3" }),
      issueJson("ABC-203", { summary: "Rédiger l'aide", statusId: "1" }),
    ];
    jira
      .on("GET", "/rest/agile/1.0/board/7/sprint", {
        status: 200,
        json: {
          isLast: true,
          values: [
            {
              id: 43,
              name: "Sprint 43",
              state: "active",
              originBoardId: 7,
              startDate: "2026-09-28T08:00:00.000+0200",
              endDate: "2026-10-09T18:00:00.000+0200",
              goal: "🎯 Simplifier le paiement\n🎯 Rendre le panier plus rapide",
            },
          ],
        },
      })
      .on("GET", "/rest/agile/1.0/board/7/sprint/43/issue", {
        status: 200,
        json: { issues, total: issues.length },
      })
      .on("GET", `/rest/agile/1.0/sprint/43/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 200,
        json: {
          value: {
            version: 1,
            goals: [
              { id: "g-planning-1", title: "Simplifier le paiement", color: "goal1", position: 0 },
              {
                id: "g-planning-2",
                title: "Rendre le panier plus rapide",
                color: "goal2",
                position: 1,
              },
            ],
            links: { "ABC-201": "g-planning-1", "ABC-202": "g-planning-2" },
            atlassianGoalIds: [],
          },
        },
      });

    await board.sync();

    expect(board.snapshot.value?.sprint?.id).toBe(43);
    expect(board.snapshot.value?.goals.map((goal) => goal.id)).toEqual([
      "g-planning-1",
      "g-planning-2",
    ]);
    expect(board.hiddenGoals.value).toEqual([]);
    expect(goalLane(board, "g-planning-1")).toEqual(["ABC-201"]);
    expect(goalLane(board, "g-planning-2")).toEqual(["ABC-202"]);
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect((await loadActiveBoard(platform.store, SITE.origin))?.hiddenGoalIds).toEqual([]);
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
  it("met le board en swimlanes : objectifs, Build, Kanban", async () => {
    const { board } = await detected();
    const layout = board.layout.value;
    expect(layout?.lanes.map((lane) => [lane.title, lane.totalCount])).toEqual([
      ["Finaliser le parcours de paiement", 2],
      ["Améliorer la stabilité", 1],
      ["Build", 2],
      ["Anomalie Prod", 1],
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
    expect(options?.withoutGoalCount).toBe(3);
  });

  it("drapeau Jira repéré à la détection et lu sur les tickets", async () => {
    const { board } = await detected();
    const flagged = board.snapshot.value?.goalIssues.filter((issue) => issue.isFlagged);
    expect(flagged?.map((issue) => issue.issue.key)).toEqual(["ABC-104"]);
  });
});
