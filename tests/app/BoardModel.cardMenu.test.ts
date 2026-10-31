import { describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { goalBlock } from "../../src/core/boardBlocks";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { atlassianGoalsPlatform } from "../support/atlassianGoalsBoard";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT, SPRINT_ISSUES } from "../support/boardFixture";
import { type FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway } from "../support/goalsGateway";
import { issueJson, statusJson } from "../support/jiraFixtures";

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
      // Ordre de lecture du sprint (ABC-101 puis ABC-102) : ABC-102 est déjà dernier.
      top: { blocked: null },
      bottom: { blocked: "last" },
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

describe("menu d'une carte — top et basse priorité", () => {
  const RANK = "/rest/agile/1.0/issue/rank";
  const RANK_FIELD = "customfield_10019";
  // Rangs FICTIFS : l'ordre de rang Jira (ABC-102 avant ABC-101) diffère de l'ordre de lecture.
  const RANKS: Record<string, string> = {
    "ABC-101": "0|i0000c:",
    "ABC-102": "0|i0000a:",
    "ABC-103": "0|i0000b:",
    "ABC-104": "0|i0000d:",
    "ABC-105": "0|i0000e:",
    "RUN-7": "0|i0000f:",
  };
  function rankedJira() {
    const issues = SPRINT_ISSUES.map((raw) => {
      const issue = raw as { key: string; fields: Record<string, unknown> };
      return { ...issue, fields: { ...issue.fields, [RANK_FIELD]: RANKS[issue.key] } };
    });
    return boardSiteJira({ sprintIssues: issues }).on(
      "GET",
      "/rest/agile/1.0/board/7/configuration",
      {
        status: 200,
        json: {
          columnConfig: {
            columns: [
              { name: "À faire", statuses: [{ id: "1" }] },
              { name: "En cours", statuses: [{ id: "3" }, { id: "4" }], max: 2 },
              { name: "Terminé", statuses: [{ id: "6" }] },
            ],
          },
          estimation: { field: { fieldId: "customfield_10016" } },
          ranking: { rankCustomFieldId: 10019 },
        },
      },
    );
  }

  it("top : UNE écriture de rang avant le premier de la swimlane, board relu, journal", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", RANK, { status: 204 });
    const syncs = jira.sent("GET", SPRINT_READ).length;
    board.openCardMenu("ABC-102", POINT);

    await board.rankToEdge("ABC-102", "top", { daily: false });

    expect(board.cardMenu.value).toBeNull();
    expect(writes().map((request) => [request.method, request.path, request.body])).toEqual([
      ["PUT", RANK, { issues: ["ABC-102"], rankBeforeIssue: "ABC-101" }],
    ]);
    expect(jira.sent("GET", SPRINT_READ).length).toBe(syncs + 1);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "classement", issueKey: "ABC-102", outcome: "réussi" });
    expect(board.writeNotice.value).toBeNull();
    expect(board.moveFeedback.value).toBeNull();
    expect(board.pendingMove.value).toBeNull();
  });

  it("basse : après le dernier ; déjà dernier : rien n'est écrit", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", RANK, { status: 204 });
    await board.rankToEdge("ABC-102", "bottom", { daily: false });
    expect(writes()).toEqual([]);
    await board.rankToEdge("ABC-101", "bottom", { daily: false });
    expect(writes().map((request) => request.body)).toEqual([
      { issues: ["ABC-101"], rankAfterIssue: "ABC-102" },
    ]);
  });

  it("champ de rang du board lu avec les tickets ; l'ordre de rang Jira fait foi", async () => {
    const jira = rankedJira();
    const { board, writes } = await boardWith(jira);
    expect(board.configuration.value?.rankFieldId).toBe(RANK_FIELD);
    const read = jira.sent("GET", SPRINT_READ).at(-1);
    expect(read?.url.searchParams.get("fields")?.split(",")).toContain(RANK_FIELD);
    // Rang Jira : ABC-102 est en tête de « Finaliser le parcours de paiement ».
    expect(board.cardMenuOptions("ABC-102", { daily: false })).toMatchObject({
      top: { blocked: "first" },
      bottom: { blocked: null },
    });
    jira.on("PUT", RANK, { status: 204 });
    await board.rankToEdge("ABC-101", "top", { daily: false });
    expect(writes().map((request) => request.body)).toEqual([
      { issues: ["ABC-101"], rankBeforeIssue: "ABC-102" },
    ]);
  });

  it("filtre actif : la référence est le premier ticket de la swimlane, même masqué", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", RANK, { status: 204 });
    board.setSearch("ABC-102");
    expect(columnOf(board, "ABC-101")).toBeUndefined();
    await board.rankToEdge("ABC-102", "top", { daily: false });
    expect(writes().map((request) => request.body)).toEqual([
      { issues: ["ABC-102"], rankBeforeIssue: "ABC-101" },
    ]);
    board.dispose();
  });

  it("en daily : les deux actions restent permises", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", RANK, { status: 204 });
    expect(board.cardMenuOptions("ABC-102", { daily: true })?.top.blocked).toBeNull();
    await board.rankToEdge("ABC-102", "top", { daily: true });
    expect(writes()).toHaveLength(1);
  });

  it("écriture en cours : actions désactivées « writing », rien n'est écrit", async () => {
    const { board, writes } = await boardWith();
    board.pendingKeys.value = new Set(["ABC-105"]);
    expect(board.cardMenuOptions("ABC-102", { daily: false })).toMatchObject({
      top: { blocked: "writing" },
      bottom: { blocked: "writing" },
    });
    await board.rankToEdge("ABC-102", "top", { daily: false });
    expect(writes()).toEqual([]);
  });

  it("refus de Jira (403) : avis, repère sur la carte, aucune nouvelle tentative, board relu", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", RANK, { status: 403, json: {} });
    const syncs = jira.sent("GET", SPRINT_READ).length;
    await board.rankToEdge("ABC-102", "top", { daily: false });
    expect(writes()).toHaveLength(1);
    expect(board.writeNotice.value?.tone).toBe("error");
    expect(board.writeNotice.value?.suggestion).toContain("Planifier les tickets");
    expect(board.moveFeedback.value).toEqual({ issueKey: "ABC-102", kind: "warning" });
    expect(jira.sent("GET", SPRINT_READ).length).toBe(syncs + 1);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "classement", outcome: "échec" });
    board.dispose();
  });
  it.each([
    ["top", "ABC-106", ["ABC-106", "ABC-105"]],
    ["bottom", "ABC-105", ["ABC-106", "ABC-105"]],
  ] as const)(
    "%s : pendant l'écriture, la carte reste dans sa case, à l'extrémité visée",
    async (edge, key, during) => {
      const extra = issueJson("ABC-106", {
        summary: "Sixième",
        statusId: "1",
        statusName: "À faire",
        category: "new",
      });
      const { board, jira } = await boardWith(
        boardSiteJira({ sprintIssues: [...SPRINT_ISSUES, extra] }),
      );
      jira.on("PUT", RANK, { status: 204 });
      const TODO = "col-0-À faire";
      const cellKeys = () =>
        board.layout.value?.lanes
          .find((lane) => lane.id === "build")
          ?.cells.find((cell) => cell.column.id === TODO)
          ?.issues.map((issue) => issue.issue.key);
      expect(cellKeys()).toEqual(["ABC-105", "ABC-106"]);
      let release: () => void = () => {};
      const sync = vi.spyOn(board, "sync").mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const ranking = board.rankToEdge(key, edge, { daily: false });
      await expect.poll(() => sync.mock.calls.length).toBe(1);
      expect(board.pendingKeys.value.has(key)).toBe(true);
      expect(cellKeys()).toEqual(during);
      release();
      await ranking;
      expect(board.pendingMove.value).toBeNull();
      board.dispose();
    },
  );
});
