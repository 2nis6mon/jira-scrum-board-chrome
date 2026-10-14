import { describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { BUILD_BLOCK, goalBlock, swimlaneBlock } from "../../src/core/boardBlocks";

const RUN_BLOCK = swimlaneBlock("1");

import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT, SPRINT_ISSUES } from "../support/boardFixture";
import { type FakeJira, isWriteRequest, type Reply } from "../support/fakeJira";
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
  const writes = () => jira.requests.slice(before).filter(isWriteRequest);
  return { board, jira, platform, writes };
}

describe("glisser-déposer — changement de colonne", () => {
  it("transition directe : relecture, transitions, UNE écriture, puis relecture du board", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 204 });
    const syncsBefore = jira.sent("GET", "/rest/agile/1.0/board/7/sprint/42/issue").length;

    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });

    expect(writes().map((r) => [r.method, r.path, r.body])).toEqual([
      ["POST", "/rest/api/3/issue/ABC-102/transitions", { transition: { id: "21" } }],
    ]);
    expect(jira.sent("GET", "/rest/agile/1.0/board/7/sprint/42/issue").length).toBe(
      syncsBefore + 1,
    );
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

  it("destination inaccessible : aucune écriture, ni choix vers une autre colonne", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]));
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-stabilite"),
      columnId: DONE,
      beforeKey: null,
    });
    expect(writes()).toEqual([]);
    expect(board.transitionChoice.value).toBeNull();
    expect(board.writeNotice.value?.text).toContain("Aucune transition disponible");
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

  it("objectif et colonne : transition avant le rattachement", async () => {
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
      "/rest/api/3/issue/ABC-105/transitions",
      PROPERTY,
    ]);
  });

  it("rattachement refusé après la transition : réussite partielle explicite", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("PUT", PROPERTY, { status: 403, json: {} })
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
      "/rest/api/3/issue/ABC-105/transitions",
      PROPERTY,
    ]);
    expect(board.writeNotice.value?.text).toContain("Déjà effectué : statut modifié");
    expect(board.moveFeedback.value?.kind).toBe("warning");
    expect(board.pendingMove.value).toBeNull();
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
    [
      "carte par objectif dans une swimlane par type",
      { issueKey: "ABC-102", block: RUN_BLOCK, columnId: DOING },
    ],
    [
      "carte d'une swimlane par type dans Build",
      { issueKey: "RUN-7", block: BUILD_BLOCK, columnId: DONE },
    ],
    [
      "carte d'une swimlane par type dans une autre",
      { issueKey: "RUN-7", block: swimlaneBlock("2"), columnId: DONE },
    ],
    ["colonne inconnue", { issueKey: "ABC-102", block: BUILD_BLOCK, columnId: "col-99" }],
  ])("%s", async (_, drop) => {
    const { board, writes, jira } = await boardWith();
    const before = jira.requests.length;
    await board.dropIssue({ ...drop, beforeKey: null });
    expect(writes()).toEqual([]);
    expect(jira.requests).toHaveLength(before);
  });

  it("une carte d'une swimlane par type change de colonne dans sa swimlane", async () => {
    const { board, jira, writes } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/RUN-7", statusReply("3", "En cours"))
      .on("GET", "/rest/api/3/issue/RUN-7/transitions", transitions(["31", "6", "Terminé"]))
      .on("POST", "/rest/api/3/issue/RUN-7/transitions", { status: 204 });
    await board.dropIssue({
      issueKey: "RUN-7",
      block: RUN_BLOCK,
      columnId: DONE,
      beforeKey: null,
    });
    expect(writes().map((r) => r.path)).toEqual(["/rest/api/3/issue/RUN-7/transitions"]);
  });
});

describe("glisser-déposer — objectif prioritaire sur la swimlane par type", () => {
  it("rattache RUN à un objectif, change d'objectif puis retourne dans RUN après détachement", async () => {
    let document = {
      ...GOALS_DOCUMENT,
      links: { ...GOALS_DOCUMENT.links } as Record<string, string>,
    };
    const jira = boardSiteJira()
      .on("PUT", RANK, { status: 204 })
      .on("GET", "/rest/api/3/issue/RUN-7/transitions", transitions())
      .on("GET", PROPERTY, () => ({ status: 200, json: { value: document } }))
      .on("PUT", PROPERTY, (request) => {
        document = request.body as typeof document;
        return { status: 200 };
      });
    const { board, writes } = await boardWith(jira);
    const laneOfRun = () =>
      board.layout.value?.lanes.find((lane) =>
        lane.cells.some((cell) => cell.issues.some((issue) => issue.issue.key === "RUN-7")),
      )?.id;
    expect(laneOfRun()).toBe("swimlane:1");
    expect(board.accepts(goalBlock("g-paiement"), "1")).toBe(true);
    expect(board.accepts(BUILD_BLOCK, "1")).toBe(false);
    expect(board.accepts(swimlaneBlock("2"), "1")).toBe(false);

    await board.dropIssue({
      issueKey: "RUN-7",
      block: goalBlock("g-stabilite"),
      columnId: DOING,
      beforeKey: null,
    });
    expect(laneOfRun()).toBe("goal:g-stabilite");
    expect(
      board.snapshot.value?.goalIssues.find((issue) => issue.issue.key === "RUN-7"),
    ).toMatchObject({ goalId: "g-stabilite", swimlaneId: "1" });
    expect(board.layout.value?.lanes.some((lane) => lane.id === "swimlane:1")).toBe(false);

    await board.dropIssue({
      issueKey: "RUN-7",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: "ABC-101",
    });
    expect(laneOfRun()).toBe("goal:g-paiement");
    expect(document.links["RUN-7"]).toBe("g-paiement");
    board.startDrag("RUN-7", "1");
    expect(board.layout.value?.lanes.at(-1)?.id).toBe("swimlane:1");
    board.endDrag();
    expect(board.layout.value?.lanes.some((lane) => lane.id === "swimlane:1")).toBe(false);

    await board.dropIssue({
      issueKey: "RUN-7",
      block: RUN_BLOCK,
      columnId: DOING,
      beforeKey: null,
    });
    expect(document.links).not.toHaveProperty("RUN-7");
    expect(laneOfRun()).toBe("swimlane:1");
    expect(
      board.snapshot.value?.swimlaneIssues.find((issue) => issue.issue.key === "RUN-7")?.goalId,
    ).toBeNull();
    expect(writes().filter((request) => request.path === PROPERTY)).toHaveLength(3);
    expect(writes().every((request) => request.path === PROPERTY || request.path === RANK)).toBe(
      true,
    );
    board.dispose();
  });
});

describe("choix du statut et de la transition avant toute écriture", () => {
  const path = "/rest/api/3/issue/ABC-102/transitions";
  const drop = {
    issueKey: "ABC-102",
    block: goalBlock("g-stabilite"),
    columnId: DOING,
    beforeKey: null,
    targetStatusId: "3",
  };
  async function prepare() {
    const setup = await boardWith();
    setup.jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on(
        "GET",
        path,
        transitions(["21", "3", "En cours"], ["22", "3", "En cours"], ["23", "4", "Revue"]),
      )
      .on("POST", path, { status: 204 })
      .on("PUT", PROPERTY, { status: 200 });
    return setup;
  }

  it("plusieurs transitions vers le statut ciblé : la première est appliquée sans fenêtre", async () => {
    const { board, writes } = await prepare();
    await board.dropIssue(drop);
    expect(board.transitionChoice.value).toBeNull();
    expect(writes().map((request) => request.path)).toEqual([path, PROPERTY]);
    expect(writes()[0]?.body).toEqual({ transition: { id: "21" } });
    expect(board.canSwitchBoard.value).toBe(true);
  });

  it("différents statuts d'une même colonne : un choix par statut, annulation sans changer le Goal", async () => {
    const { board, writes } = await prepare();
    await board.dropIssue({
      issueKey: drop.issueKey,
      block: drop.block,
      columnId: drop.columnId,
      beforeKey: null,
    });
    expect(
      board.transitionChoice.value?.available.map((transition) => [
        transition.id,
        transition.to.id,
      ]),
    ).toEqual([
      ["21", "3"],
      ["23", "4"],
    ]);
    expect(writes()).toEqual([]);
    expect(board.canSwitchBoard.value).toBe(false);
    board.cancelTransitionChoice();
    expect(writes()).toEqual([]);
    expect(board.canSwitchBoard.value).toBe(true);
  });

  it("reprend tout le déplacement après choix : transition, Goal, rang", async () => {
    const { board, jira, writes } = await prepare();
    jira.on("PUT", RANK, { status: 204 });
    await board.dropIssue({
      issueKey: drop.issueKey,
      columnId: drop.columnId,
      block: BUILD_BLOCK,
      beforeKey: "ABC-104",
    });
    const chosen = board.transitionChoice.value?.available[1];
    if (!chosen) throw new Error("choix attendu");
    await board.chooseTransition(chosen);
    expect(writes().map((r) => r.path)).toEqual([path, PROPERTY, RANK]);
    expect(writes()[0]?.body).toEqual({ transition: { id: "23" } });
    expect(jira.sent("GET", path)).toHaveLength(2);
  });

  it.each(["statut", "transition"])(
    "revalide le %s après l'ouverture de la fenêtre",
    async (change) => {
      const { board, jira, writes } = await prepare();
      await board.dropIssue({
        issueKey: drop.issueKey,
        columnId: drop.columnId,
        block: drop.block,
        beforeKey: null,
      });
      const chosen = board.transitionChoice.value?.available[0];
      if (!chosen) throw new Error("choix attendu");
      if (change === "statut")
        jira.on("GET", "/rest/api/3/issue/ABC-102", statusReply("6", "Terminé"));
      else jira.on("GET", path, transitions(["22", "3", "En cours"]));
      await board.chooseTransition(chosen);
      expect(writes()).toEqual([]);
      expect(board.writeNotice.value).not.toBeNull();
    },
  );

  it("statut explicite Revue : ne choisit pas En cours", async () => {
    const { board, writes } = await prepare();
    await board.dropIssue({ ...drop, targetStatusId: "4" });
    expect(writes()[0]?.body).toEqual({ transition: { id: "23" } });
    expect(board.transitionChoice.value).toBeNull();
  });

  it("première transition avec formulaire : délégation à Jira même si la suivante est directe", async () => {
    const { board, jira, writes } = await prepare();
    jira.on("GET", path, {
      status: 200,
      json: {
        transitions: [
          {
            id: "21",
            name: "Démarrer",
            to: statusJson("3", "En cours"),
            hasScreen: true,
            fields: {},
          },
          {
            id: "22",
            name: "Démarrer directement",
            to: statusJson("3", "En cours"),
            hasScreen: false,
            fields: {},
          },
        ],
      },
    });
    const open = vi.fn(() => true);
    board.nativeTransitionHandler = open;
    await board.dropIssue(drop);
    expect(writes()).toEqual([]);
    expect(open).toHaveBeenCalledWith("ABC-102", expect.objectContaining({ id: "21" }));
    expect(board.nativeTransitionPending.value).toBe(true);
  });

  it("verrouille la première transition au glissé même si Jira réordonne les alternatives au dépôt", async () => {
    const { board, jira, writes } = await prepare();
    board.startDrag("ABC-102", null);
    await expect.poll(() => board.dragTransitions.value.kind).toBe("ready");
    jira.on(
      "GET",
      path,
      transitions(["22", "3", "En cours"], ["21", "3", "En cours"], ["23", "4", "Revue"]),
    );
    await board.dropIssue(drop);
    expect(writes()[0]?.body).toEqual({ transition: { id: "21" } });
    expect(board.transitionChoice.value).toBeNull();
    expect(writes().map((request) => request.path)).toEqual([path, PROPERTY]);
  });

  it.each(["disparaît", "change de destination"])(
    "la transition montrée au glissé %s : aucune alternative, aucun objectif ni rang écrit",
    async (change) => {
      const { board, jira, writes } = await prepare();
      board.startDrag("ABC-102", null);
      await expect.poll(() => board.dragTransitions.value.kind).toBe("ready");
      jira.on(
        "GET",
        path,
        change === "disparaît"
          ? transitions(["22", "3", "En cours"])
          : transitions(["21", "4", "Revue"], ["22", "3", "En cours"]),
      );
      await board.dropIssue({ ...drop, block: BUILD_BLOCK, beforeKey: "ABC-104" });
      expect(writes()).toEqual([]);
      expect(board.transitionChoice.value).toBeNull();
      expect(board.writeNotice.value).not.toBeNull();
    },
  );

  it("un statut actualisé pendant le glissé interdit aussi le dépôt devenu dans la même colonne", async () => {
    const { board, jira, writes } = await prepare();
    board.startDrag("ABC-102", null);
    await expect.poll(() => board.dragTransitions.value.kind).toBe("ready");
    const issues = SPRINT_ISSUES.map((issue) =>
      issue.key === "ABC-102"
        ? issueJson("ABC-102", { statusId: "4", statusName: "Revue" })
        : issue,
    );
    jira.on("GET", "/rest/agile/1.0/board/7/sprint/42/issue", {
      status: 200,
      json: { issues, total: issues.length },
    });
    await board.sync();
    const doing = board.configuration.value?.columns.find((column) => column.id === DOING);
    if (!doing) throw new Error("Colonne En cours attendue");
    expect(
      board.snapshot.value?.goalIssues.find((issue) => issue.issue.key === "ABC-102")?.issue.fields
        .status.id,
    ).toBe("4");
    expect(board.columnDrop(doing).kind).toBe("error");
    await board.dropIssue({ ...drop, block: BUILD_BLOCK, beforeKey: "ABC-104" });
    expect(writes()).toEqual([]);
    expect(board.writeNotice.value?.text).toContain("statut");
    expect(board.transitionChoice.value).toBeNull();
  });

  it("même colonne à plusieurs statuts : aucune lecture ni écriture de transition", async () => {
    const { board, jira, writes } = await prepare();
    await board.dropIssue({
      issueKey: "ABC-101",
      block: goalBlock("g-stabilite"),
      columnId: DOING,
      beforeKey: null,
      targetStatusId: "4",
    });
    expect(writes().map((r) => r.path)).toEqual([PROPERTY]);
    expect(jira.sent("GET", "/rest/api/3/issue/ABC-101/transitions")).toEqual([]);
  });

  it("échec de la transition : ni objectif ni rang modifié", async () => {
    const { board, jira, writes } = await prepare();
    jira.on("POST", path, { status: 400, json: { errorMessages: ["Refus du validateur"] } });
    await board.dropIssue({
      ...drop,
      targetStatusId: "4",
      beforeKey: "ABC-104",
      block: BUILD_BLOCK,
    });
    expect(writes().map((r) => r.path)).toEqual([path]);
  });

  it("zone sans position précise : conserve le rang même si la destination contient une carte", async () => {
    const { board, writes } = await prepare();
    await board.dropIssue({ ...drop, targetStatusId: "4", block: BUILD_BLOCK });
    expect(writes().map((r) => r.path)).toEqual([path, PROPERTY]);
  });

  it("précharge les statuts, distingue la colonne actuelle et les destinations interdites", async () => {
    const { board } = await prepare();
    const columns = board.configuration.value?.columns;
    if (!columns?.[0] || !columns[1] || !columns[2]) throw new Error("colonnes attendues");
    board.startDrag("ABC-102", null);
    expect(board.columnDrop(columns[0]).kind).toBe("same");
    expect(board.columnDrop(columns[1]).kind).toBe("loading");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(board.columnDrop(columns[1]).statuses.map((s) => s.id)).toEqual(["3", "4"]);
    expect(board.columnDrop(columns[2]).kind).toBe("blocked");
    board.endDrag();
    expect(board.columnDrop(columns[1]).kind).toBe("idle");
  });

  it("lecture refusée : erreur distincte, colonne actuelle toujours utilisable", async () => {
    const { board, jira } = await prepare();
    jira.on("GET", path, { status: 403 });
    board.startDrag("ABC-102", null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(board.dragTransitions.value.kind).toBe("error");
    board.endDrag();
  });
});

describe("retour visuel du déplacement", () => {
  const cellOf = (board: BoardModel, key: string) =>
    board.layout.value?.lanes.flatMap((lane) =>
      lane.cells
        .filter((cell) => cell.issues.some((issue) => issue.issue.key === key))
        .map((cell) => `${lane.id}/${cell.column.id}`),
    );

  it("projette une seule carte à destination sans modifier le snapshot et attend la relecture", async () => {
    const { board, jira } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 204 });
    const snapshot = board.snapshot.value;
    let release: () => void = () => {};
    const sync = vi.spyOn(board, "sync").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const moving = board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    expect(cellOf(board, "ABC-102")).toEqual([`goal:g-paiement/${DOING}`]);
    expect(board.snapshot.value).toBe(snapshot);
    await expect.poll(() => sync.mock.calls.length).toBe(1);
    expect(board.pendingKeys.value.has("ABC-102")).toBe(true);
    expect(board.moveFeedback.value).toBeNull();
    release();
    await moving;
    expect(board.pendingMove.value).toBeNull();
    expect(board.pendingKeys.value.size).toBe(0);
    expect(board.moveFeedback.value).toBeNull();
    board.dispose();
    expect(board.moveFeedback.value).toBeNull();
  });

  it("restaure l’état relu après un refus et signale le déplacement incomplet", async () => {
    const { board, jira } = await boardWith();
    const origin = cellOf(board, "ABC-102");
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]))
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 403 });
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    expect(cellOf(board, "ABC-102")).toEqual(origin);
    expect(board.moveFeedback.value?.kind).toBe("warning");
    expect(board.writeNotice.value).not.toBeNull();
    expect(board.pendingMove.value).toBeNull();
    board.dispose();
  });

  it("ne laisse pas de projection pendant le choix d’une transition", async () => {
    const { board, jira } = await boardWith();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
      .on(
        "GET",
        "/rest/api/3/issue/ABC-102/transitions",
        transitions(["21", "3", "En cours"], ["22", "4", "Revue"]),
      );
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    expect(board.transitionChoice.value).not.toBeNull();
    expect(board.pendingMove.value).toBeNull();
    expect(board.moveFeedback.value).toBeNull();
    board.cancelTransitionChoice();
    board.dispose();
  });
});

it("retire le repère de déplacement après quatre secondes", async () => {
  const { board, jira } = await boardWith();
  jira
    .on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"))
    .on("GET", "/rest/api/3/issue/ABC-102/transitions", transitions(["21", "3", "En cours"]))
    .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 403 });
  vi.useFakeTimers();
  try {
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    expect(board.moveFeedback.value?.kind).toBe("warning");
    vi.advanceTimersByTime(3999);
    expect(board.moveFeedback.value).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(board.moveFeedback.value).toBeNull();
  } finally {
    board.dispose();
    vi.useRealTimers();
  }
});

describe("formulaire de transition natif Jira", () => {
  const path = "/rest/api/3/issue/ABC-102/transitions";
  it("vue intégrée à Jira : l'écran de la transition est délégué par identifiants, sans écriture", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("GET", "/rest/api/3/issue/ABC-102", {
      status: 200,
      json: { fields: { status: statusJson("1", "À faire") } },
    });
    jira.on("GET", path, {
      status: 200,
      json: {
        transitions: [
          {
            id: "21",
            name: "Démarrer",
            hasScreen: true,
            to: statusJson("3", "En cours"),
            fields: {
              resolution: {
                name: "Résolution",
                required: true,
                operations: ["set"],
                schema: { type: "resolution" },
                allowedValues: [{ id: "1", name: "Résolu" }],
              },
            },
          },
        ],
      },
    });
    const calls: [string, string][] = [];
    board.nativeTransitionHandler = (key, transition) => {
      calls.push([key, transition.id]);
      return true;
    };
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    // Clé du ticket et identifiant de la transition : de quoi ouvrir la fiche et y désigner la
    // transition dans le menu de statut de Jira.
    expect(calls).toEqual([["ABC-102", "21"]]);
    expect(board.nativeTransitionPending.value).toBe(true);
    expect(writes()).toEqual([]);
    board.dispose();
  });
  it.each(["absent", "refusé"])(
    "hôte %s : erreur explicite, aucune écriture ni formulaire local",
    async (mode) => {
      const { board, jira, writes } = await boardWith();
      jira.on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"));
      jira.on("GET", path, {
        status: 200,
        json: {
          transitions: [
            {
              id: "21",
              name: "Démarrer",
              hasScreen: true,
              to: statusJson("3", "En cours"),
              fields: {},
            },
          ],
        },
      });
      if (mode === "refusé") board.nativeTransitionHandler = () => false;
      await board.dropIssue({
        issueKey: "ABC-102",
        block: goalBlock("g-paiement"),
        columnId: DOING,
        beforeKey: null,
      });
      expect(board.writeNotice.value).toMatchObject({ tone: "error", issueKey: "ABC-102" });
      expect(board.writeNotice.value?.text).toContain("formulaire Jira");
      expect(board.nativeTransitionPending.value).toBe(false);
      expect(board.pendingMove.value).toBeNull();
      expect(board.canSwitchBoard.value).toBe(true);
      expect(writes()).toEqual([]);
      // Aucune lecture de valeurs pour reconstruire un formulaire de secours.
      expect(
        jira
          .sent("GET", "/rest/api/3/issue/ABC-102")
          .every((request) => request.url.searchParams.get("fields") === "status"),
      ).toBe(true);
      board.dispose();
    },
  );

  it("une transition native ouverte bloque un second déplacement jusqu'à sa fermeture", async () => {
    const { board, jira, writes } = await boardWith();
    jira.on("GET", "/rest/api/3/issue/ABC-102", statusReply("1", "À faire"));
    jira.on("GET", path, {
      status: 200,
      json: {
        transitions: [
          {
            id: "21",
            name: "Démarrer",
            hasScreen: true,
            to: statusJson("3", "En cours"),
            fields: {},
          },
        ],
      },
    });
    const open = vi.fn(() => true);
    board.nativeTransitionHandler = open;
    const drop = {
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    };
    await board.dropIssue(drop);
    await board.dropIssue(drop);
    expect(open).toHaveBeenCalledTimes(1);
    expect(board.canSwitchBoard.value).toBe(false);
    expect(writes()).toEqual([]);
    board.dispose();
  });
});
