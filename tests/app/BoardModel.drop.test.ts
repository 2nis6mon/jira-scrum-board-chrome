import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { BUILD_BLOCK, goalBlock, RUN_BLOCK } from "../../src/core/boardBlocks";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT, SPRINT_ISSUES } from "../support/boardFixture";
import type { FakeJira, Reply } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { issueJson, statusJson } from "../support/jiraFixtures";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const NOW = new Date("2026-09-18T10:00:00Z");
const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
const RANK = "/rest/agile/1.0/issue/rank";
// Colonnes du board de test : col-0 « À faire » (1), col-1 « En cours » (3, 4), col-2 « Terminé » (6).
const TODO = "col-0-À faire";
const DOING = "col-1-En cours";
const DONE = "col-2-Terminé";

const statusReply = (id: string, name: string): Reply => ({
  status: 200,
  json: { fields: { status: statusJson(id, name) } },
});
const transitions = (...list: [id: string, toId: string, toName: string][]): Reply => ({
  status: 200,
  json: {
    transitions: list.map(([id, toId, toName]) => ({
      id,
      name: `Vers ${toName}`,
      to: statusJson(toId, toName),
      isAvailable: true,
    })),
  },
});

async function boardWith(jira: FakeJira = boardSiteJira()) {
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform, { now: () => NOW });
  await board.load();
  await board.detect(BOARD_URL);
  const before = jira.requests.length;
  const writes = () => jira.requests.slice(before).filter((r) => r.method !== "GET");
  return { board, jira, platform, writes };
}

describe("glisser-déposer — changement de colonne", () => {
  it("transition directe : relecture, transitions, UNE écriture, puis relecture du board", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 204 });
    const syncsBefore = jira.sent("GET", "/rest/agile/1.0/sprint/42/issue").length;

    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });

    expect(writes().map((r) => [r.method, r.path, r.body])).toEqual([
      ["POST", "/rest/api/3/issue/ABC-102/transitions", { transition: { id: "21" } }],
    ]);
    expect(jira.sent("GET", "/rest/agile/1.0/sprint/42/issue").length).toBe(syncsBefore + 1);
    expect(board.writeNotice.value).toBeNull();
    expect(board.pendingKeys.value.size).toBe(0);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({
      action: "transition",
      issueKey: "ABC-102",
      from: "À faire",
      to: "En cours",
      outcome: "réussi",
    });
  });

  it("ticket modifié dans Jira entre-temps : rien n'est écrit, le board est relu, on le dit", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("GET", "/rest/api/3/issue/ABC-102", statusReply("6", "Terminé"));

    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });

    expect(writes()).toEqual([]);
    expect(board.writeNotice.value).toMatchObject({
      tone: "warning",
      text: expect.stringContaining("Terminé"),
    });
  });

  it("pas de transition directe : propose les transitions de Jira, puis exécute celle choisie", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on(
        "GET",
        "/rest/api/3/issue/ABC-102/transitions",
        transitions(["21", "3", "En cours"], ["41", "9", "Abandonné"]),
      )
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 204 });

    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DONE,
      beforeKey: null,
    });
    expect(writes()).toEqual([]);
    const choice = board.transitionChoice.value;
    expect(choice?.columnName).toBe("Terminé");
    expect(choice?.available.map((t) => t.name)).toEqual(["Vers En cours", "Vers Abandonné"]);

    const chosen = choice?.available[0];
    if (!chosen) throw new Error("transition attendue");
    await board.chooseTransition(chosen);
    expect(writes().map((r) => r.body)).toEqual([{ transition: { id: "21" } }]);
    expect(board.transitionChoice.value).toBeNull();
  });

  it("choisir « ne rien changer » n'écrit rien", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["41", "9", "Abandonné"]));
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DONE,
      beforeKey: null,
    });
    board.cancelTransitionChoice();
    expect(board.transitionChoice.value).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("réponse perdue : pas de nouvelle tentative, issue signalée comme incertaine", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 503 });

    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });

    expect(writes()).toHaveLength(1);
    expect(board.writeNotice.value).toMatchObject({
      tone: "warning",
      text: expect.stringContaining("n'a pas confirmé"),
    });
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry?.outcome).toBe("incertain");
  });

  it("session perdue pendant l'écriture : le dit, avec le lien vers Jira", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("GET", "/rest/api/3/issue/ABC-102", { status: 401 });
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    expect(writes()).toEqual([]);
    expect(board.writeNotice.value?.sessionLost).toBe(true);
  });

  it("un second dépôt du même ticket pendant l'écriture est ignoré", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 204 });
    const drop = {
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    };
    await Promise.all([board.dropIssue(drop), board.dropIssue(drop)]);
    expect(writes()).toHaveLength(1);
  });
});

describe("glisser-déposer — rattachement à un objectif du texte du sprint", () => {
  it("vers un autre objectif, même colonne : seule la propriété du sprint est écrite", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", PROPERTY, { status: 200 });

    await board.dropIssue({
      issueKey: "ABC-105",
      block: goalBlock("g-stabilite"),
      columnId: TODO,
      beforeKey: null,
    });

    const [put] = writes();
    expect(writes()).toHaveLength(1);
    expect(put?.path).toBe(PROPERTY);
    expect(put?.body).toMatchObject({
      links: { ...GOALS_DOCUMENT.links, "ABC-105": "g-stabilite" },
      atlassianGoalIds: [],
      goals: GOALS_DOCUMENT.goals,
      updatedBy: "u1",
    });
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({
      action: "rattachement",
      to: "Améliorer la stabilité",
      outcome: "réussi",
    });
  });

  it("vers Build : détache le ticket", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", PROPERTY, { status: 200 });
    await board.dropIssue({
      issueKey: "ABC-101",
      block: BUILD_BLOCK,
      columnId: DOING,
      beforeKey: null,
    });
    const body = writes()[0]?.body as { links: Record<string, string> } | undefined;
    const links = body?.links;
    expect(links).not.toHaveProperty("ABC-101");
    expect(links).toHaveProperty("ABC-102", "g-paiement");
  });

  it("objectif et colonne : rattachement d'abord, transition ensuite", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("PUT", PROPERTY, { status: 200 })
      .on("GET", "/rest/api/3/issue/ABC-105", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-105/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-105/transitions", { status: 204 });

    await board.dropIssue({
      issueKey: "ABC-105",
      block: goalBlock("g-stabilite"),
      columnId: DOING,
      beforeKey: null,
    });
    expect(writes().map((r) => r.path)).toEqual([
      PROPERTY,
      "/rest/api/3/issue/ABC-105/transitions",
    ]);
  });

  it("rattachement refusé : la transition n'est pas tentée", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("PUT", PROPERTY, { status: 403, json: {} });
    await board.dropIssue({
      issueKey: "ABC-105",
      block: goalBlock("g-stabilite"),
      columnId: DOING,
      beforeKey: null,
    });

    expect(writes().map((r) => r.path)).toEqual([PROPERTY]);
    expect(jira.sent("GET", "/rest/api/3/issue/ABC-105")).toEqual([]);
    expect(board.writeNotice.value?.suggestion).toContain("gérer les sprints");
  });

  it("déposer dans le même bloc, même colonne, à la même place : rien n'est écrit", async () => {
    const { board, writes } = await boardWith();
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: TODO,
      beforeKey: null,
    });
    expect(writes()).toEqual([]);
  });
});

describe("glisser-déposer — rang", () => {
  const withExtra = () =>
    boardSiteJira({
      sprintIssues: [
        ...SPRINT_ISSUES,
        issueJson("ABC-106", {
          summary: "Sixième",
          statusId: "1",
          statusName: "À faire",
          category: "new",
        }),
      ],
    });

  it("devant une autre carte de la même case : PUT du rang", async () => {
    const { board, jira, writes } = await boardWith(withExtra());
    jira.on("PUT", RANK, { status: 204 });
    await board.dropIssue({
      issueKey: "ABC-106",
      block: BUILD_BLOCK,
      columnId: TODO,
      beforeKey: "ABC-105",
    });

    expect(writes().map((r) => [r.path, r.body])).toEqual([
      [RANK, { issues: ["ABC-106"], rankBeforeIssue: "ABC-105" }],
    ]);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "classement", to: "avant ABC-105", outcome: "réussi" });
  });

  it("en bas alors qu'elle y est déjà : rien", async () => {
    const { board, writes } = await boardWith(withExtra());
    await board.dropIssue({
      issueKey: "ABC-106",
      block: BUILD_BLOCK,
      columnId: TODO,
      beforeKey: null,
    });
    expect(writes()).toEqual([]);
  });

  it("vers une autre colonne, devant une carte : transition puis rang", async () => {
    const { board, jira, writes } = await boardWith(withExtra());
    jira
      .on("GET", "/rest/api/3/issue/ABC-106", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-106/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-106/transitions", { status: 204 })
      .on("PUT", RANK, { status: 204 });
    await board.dropIssue({
      issueKey: "ABC-106",
      block: BUILD_BLOCK,
      columnId: DOING,
      beforeKey: "ABC-104",
    });

    expect(writes().map((r) => r.path)).toEqual(["/rest/api/3/issue/ABC-106/transitions", RANK]);
  });

  it("transition non faite : pas de rang", async () => {
    const { board, jira, writes } = await boardWith(withExtra());
    jira.on("GET", "/rest/api/3/issue/ABC-106", statusReply("3", "En cours"));
    await board.dropIssue({
      issueKey: "ABC-106",
      block: BUILD_BLOCK,
      columnId: DONE,
      beforeKey: null,
    });
    expect(writes()).toEqual([]);
  });

  it("rang refusé (403) : message sur la permission « Planifier les tickets »", async () => {
    const { board, jira } = await boardWith(withExtra());
    jira.on("PUT", RANK, { status: 403, json: {} });
    await board.dropIssue({
      issueKey: "ABC-106",
      block: BUILD_BLOCK,
      columnId: TODO,
      beforeKey: "ABC-105",
    });
    expect(board.writeNotice.value?.suggestion).toContain("Planifier les tickets");
  });
});

describe("glisser-déposer — dépôts refusés sans requête", () => {
  it.each([
    ["ticket inconnu du board", { issueKey: "XYZ-1", block: BUILD_BLOCK, columnId: DOING }],
    ["carte Scrum dans RUN", { issueKey: "ABC-102", block: RUN_BLOCK, columnId: DOING }],
    [
      "carte RUN dans un objectif",
      { issueKey: "RUN-7", block: goalBlock("g-paiement"), columnId: DONE },
    ],
    ["colonne inconnue", { issueKey: "ABC-102", block: BUILD_BLOCK, columnId: "col-99" }],
  ])("%s", async (_, drop) => {
    const { board, writes, jira } = await boardWith();
    const before = jira.requests.length;
    await board.dropIssue({ ...drop, beforeKey: null });
    expect(writes()).toEqual([]);
    expect(jira.requests).toHaveLength(before);
  });

  it("une carte RUN change de colonne dans le bloc RUN", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/RUN-7", statusReply("3", "En cours"))
      .on("GET", "/rest/api/3/issue/RUN-7/transitions", transitions(["31", "6", "Terminé"]))
      .on("POST", "/rest/api/3/issue/RUN-7/transitions", { status: 204 });
    await board.dropIssue({ issueKey: "RUN-7", block: RUN_BLOCK, columnId: DONE, beforeKey: null });
    expect(writes().map((r) => r.path)).toEqual(["/rest/api/3/issue/RUN-7/transitions"]);
  });
});
