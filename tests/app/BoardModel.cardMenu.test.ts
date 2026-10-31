import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { goalBlock } from "../../src/core/boardBlocks";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { atlassianGoalsPlatform } from "../support/atlassianGoalsBoard";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT } from "../support/boardFixture";
import { type FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway } from "../support/goalsGateway";
import { statusJson } from "../support/jiraFixtures";

// Menu d'une carte : « Envoyer vers un goal » réutilise le chemin du dépôt. Données FICTIVES.

const SITE = normalizeSiteUrl("acme.atlassian.net");
const NOW = new Date("2026-09-18T10:00:00Z");
const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
const SPRINT_READ = "/rest/agile/1.0/board/7/sprint/42/issue";
const POINT = { x: 120, y: 240 };

async function boardWith(jira: FakeJira = boardSiteJira()) {
  const board = new BoardModel(SITE, fakePlatform(jira), { now: () => NOW });
  await board.load();
  await board.detect(BOARD_URL);
  const before = jira.requests.length;
  const writes = () => jira.requests.slice(before).filter(isWriteRequest);
  return { board, jira, writes };
}

const columnOf = (board: BoardModel, key: string) =>
  board.layout.value?.lanes
    .flatMap((lane) => lane.cells.map((cell) => [lane.id, cell.column.id, cell.issues] as const))
    .find(([, , issues]) => issues.some((issue) => issue.issue.key === key));

describe("menu d'une carte — ouverture", () => {
  it("s'ouvre sur un ticket affiché, se ferme, et ignore un ticket absent du board", async () => {
    const { board } = await boardWith();
    board.openCardMenu("XYZ-1", POINT);
    expect(board.cardMenu.value).toBeNull();
    board.openCardMenu("ABC-102", POINT);
    expect(board.cardMenu.value).toEqual({ issueKey: "ABC-102", ...POINT });
    board.closeCardMenu();
    expect(board.cardMenu.value).toBeNull();
  });

  it("fermé dès que son ticket disparaît du board (filtre, relecture)", async () => {
    const { board } = await boardWith();
    board.openCardMenu("ABC-102", POINT);
    board.setSearch("ABC-105");
    expect(board.cardMenu.value).toBeNull();
    board.dispose();
  });
});

describe("menu d'une carte — options", () => {
  it("ticket sous un objectif : les autres objectifs puis le retrait", async () => {
    const { board } = await boardWith();
    expect(board.cardMenuOptions("ABC-102", { daily: false })).toEqual({
      sendToGoal: {
        blocked: null,
        goals: [{ id: "g-stabilite", title: "Améliorer la stabilité", sprintName: null }],
        canDetach: true,
      },
    });
  });

  it("en daily : envoi désactivé, avec sa raison", async () => {
    const { board } = await boardWith();
    expect(board.cardMenuOptions("ABC-102", { daily: true })?.sendToGoal.blocked).toBe("daily");
  });

  it("une écriture en cours désactive l'envoi, quelle qu'elle soit", async () => {
    const { board } = await boardWith();
    board.pendingKeys.value = new Set(["ABC-101"]);
    expect(board.cardMenuOptions("ABC-102", { daily: true })?.sendToGoal.blocked).toBe("writing");
    board.pendingKeys.value = new Set();
    board.nativeTransitionPending.value = true;
    expect(board.cardMenuOptions("ABC-102", { daily: false })?.sendToGoal.blocked).toBe("writing");
  });

  it("board sans objectif, ticket sans objectif : « Aucun objectif où l'envoyer »", async () => {
    const jira = boardSiteJira().on("GET", PROPERTY, { status: 404, json: {} });
    jira.on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { isLast: true, values: [{ id: 42, name: "Sprint 42", state: "active", goal: "" }] },
    });
    const { board } = await boardWith(jira);
    expect(board.snapshot.value?.goals).toEqual([]);
    expect(board.cardMenuOptions("ABC-105", { daily: false })?.sendToGoal).toEqual({
      blocked: "noGoal",
      goals: [],
      canDetach: false,
    });
  });
});

describe("menu d'une carte — envoi vers un goal (texte du sprint)", () => {
  it("UNE écriture, celle du rattachement ; colonne et rang inchangés ; board relu", async () => {
    // Propriété tenue comme dans Jira : ce qui est écrit est relu ensuite.
    let document = { ...GOALS_DOCUMENT };
    const jira = boardSiteJira()
      .on("GET", PROPERTY, () => ({ status: 200, json: { value: document } }))
      .on("PUT", PROPERTY, (request) => {
        document = request.body as typeof document;
        return { status: 200 };
      });
    const { board, writes } = await boardWith(jira);
    const before = columnOf(board, "ABC-105")?.[1];
    const syncs = jira.sent("GET", SPRINT_READ).length;
    board.openCardMenu("ABC-105", POINT);

    await board.sendToGoal("ABC-105", "g-stabilite", { daily: false });

    expect(board.cardMenu.value).toBeNull();
    expect(writes().map((request) => [request.method, request.path])).toEqual([["PUT", PROPERTY]]);
    expect(writes()[0]?.body).toMatchObject({
      links: { ...GOALS_DOCUMENT.links, "ABC-105": "g-stabilite" },
    });
    expect(jira.sent("GET", SPRINT_READ).length).toBe(syncs + 1);
    expect(columnOf(board, "ABC-105")).toEqual(["goal:g-stabilite", before, expect.anything()]);
    expect(board.writeNotice.value).toBeNull();
    expect(board.moveFeedback.value).toBeNull();
  });

  it("« Retirer du goal » : détachement, retour dans la destination par défaut", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", PROPERTY, { status: 200 });
    await board.sendToGoal("ABC-101", null, { daily: false });
    expect(writes()).toHaveLength(1);
    const links = (writes()[0]?.body as { links?: Record<string, string> } | undefined)?.links;
    expect(links).not.toHaveProperty("ABC-101");
    expect(links).toHaveProperty("ABC-102", "g-paiement");
  });

  it("une carte d'une swimlane par type retirée de son objectif retrouve sa swimlane", async () => {
    let document = { ...GOALS_DOCUMENT, links: { ...GOALS_DOCUMENT.links, "RUN-7": "g-paiement" } };
    const jira = boardSiteJira()
      .on("GET", PROPERTY, () => ({ status: 200, json: { value: document } }))
      .on("PUT", PROPERTY, (request) => {
        document = request.body as typeof document;
        return { status: 200 };
      });
    const { board, writes } = await boardWith(jira);
    expect(columnOf(board, "RUN-7")?.[0]).toBe("goal:g-paiement");
    await board.sendToGoal("RUN-7", null, { daily: false });
    expect(writes().map((request) => request.path)).toEqual([PROPERTY]);
    expect(columnOf(board, "RUN-7")?.[0]).toBe("swimlane:1");
  });

  it("refus de Jira (403) : avis d'erreur, repère sur la carte, aucune nouvelle tentative", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", PROPERTY, { status: 403, json: {} });
    const syncs = jira.sent("GET", SPRINT_READ).length;
    await board.sendToGoal("ABC-105", "g-stabilite", { daily: false });
    expect(writes()).toHaveLength(1);
    expect(board.writeNotice.value?.tone).toBe("error");
    expect(board.moveFeedback.value).toEqual({ issueKey: "ABC-105", kind: "warning" });
    expect(jira.sent("GET", SPRINT_READ).length).toBe(syncs + 1);
    board.dispose();
  });

  it.each([
    ["en daily", { daily: true }, () => {}],
    [
      "pendant une écriture",
      { daily: false },
      (board: BoardModel) => {
        board.pendingKeys.value = new Set(["ABC-101"]);
      },
    ],
  ])("aucune écriture %s", async (_, context, prepare) => {
    const { board, writes } = await boardWith();
    prepare(board);
    await board.sendToGoal("ABC-105", "g-stabilite", context);
    expect(writes()).toEqual([]);
  });

  it("objectif non proposé (masqué, ou déjà celui du ticket) : rien n'est écrit", async () => {
    const { board, writes } = await boardWith();
    // Masquage appliqué à l'écran seulement : la publication du réglage n'est pas l'objet du test.
    const configuration = board.configuration.value;
    if (!configuration) throw new Error("configuration attendue");
    board.configuration.value = { ...configuration, hiddenGoalIds: ["g-stabilite"] };
    expect(board.cardMenuOptions("ABC-105", { daily: false })?.sendToGoal.goals).toEqual([
      { id: "g-paiement", title: "Finaliser le parcours de paiement", sprintName: null },
    ]);
    await board.sendToGoal("ABC-105", "g-stabilite", { daily: false });
    await board.sendToGoal("ABC-102", "g-paiement", { daily: false });
    await board.sendToGoal("ABC-105", "g-inconnu", { daily: false });
    await board.sendToGoal("ABC-105", null, { daily: false });
    expect(writes()).toEqual([]);
  });

  it("choix de transition en attente : envoi désactivé, rien n'est écrit", async () => {
    const { board, jira, writes } = await boardWith();
    const path = "/rest/api/3/issue/ABC-102/transitions";
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", {
        status: 200,
        json: { fields: { status: statusJson("1", "À faire") } },
      })
      .on("GET", path, {
        status: 200,
        json: {
          transitions: [
            ["21", "3", "En cours"],
            ["23", "4", "Revue"],
          ].map(([id, toId, toName]) => ({
            id,
            name: `Vers ${toName}`,
            to: statusJson(toId as string, toName as string),
            isAvailable: true,
          })),
        },
      });
    // Colonne « En cours » à deux statuts : Jira demande de choisir avant toute écriture.
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-stabilite"),
      columnId: "col-1-En cours",
      beforeKey: null,
    });
    expect(board.transitionChoice.value).not.toBeNull();
    expect(board.cardMenuOptions("ABC-105", { daily: false })?.sendToGoal.blocked).toBe("writing");
    await board.sendToGoal("ABC-105", "g-stabilite", { daily: false });
    expect(writes()).toEqual([]);
    board.cancelTransitionChoice();
  });
});

describe("menu d'une carte — envoi vers un Goal Atlassian", () => {
  it("détache de l'ancien Goal puis lie au nouveau, sans transition ni rang", async () => {
    const PAIEMENT = "ari:cloud:townsquare:c:goal/paiement";
    const STABILITE = "ari:cloud:townsquare:c:goal/stabilite";
    const mutations: string[] = [];
    const jira = boardSiteJira({
      graphql: goalsGateway({
        goals: [
          {
            id: PAIEMENT,
            key: "GOAL-1",
            name: "Paiement",
            status: "on_track",
            workItems: ["ABC-102"],
          },
          {
            id: STABILITE,
            key: "GOAL-2",
            name: "Stabilité",
            status: "at_risk",
            workItems: ["ABC-103"],
          },
        ],
        mutation: (input, field) => {
          mutations.push(`${field} ${input.goalId}`);
          return { status: 200, json: { data: { [field]: { success: true } } } };
        },
      }),
    });
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira), { now: () => NOW });
    await board.load();
    await board.detect(BOARD_URL);
    const before = jira.requests.length;

    await board.sendToGoal("ABC-102", STABILITE, { daily: false });

    expect(mutations).toEqual([
      `goals_unlinkWorkItem ${PAIEMENT}`,
      `goals_linkWorkItem ${STABILITE}`,
    ]);
    const written = jira.requests.slice(before).filter(isWriteRequest);
    expect(written.every((request) => request.path === "/gateway/api/graphql")).toBe(true);
  });
});
