import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { BUILD_BLOCK, goalBlock } from "../../src/core/boardBlocks";
import { encodeTeamDocument, type TeamDocument, teamSettingsOf } from "../../src/core/teamSettings";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { isWriteRequest, type Reply } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway } from "../support/goalsGateway";
import { makeConfiguration, statusJson } from "../support/jiraFixtures";

// Données FICTIVES : board Kanban sans sprint, deux Goals et un Goal vide à épingler.
const SITE = normalizeSiteUrl("acme.atlassian.net");
const PROPERTY = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;
const PAIEMENT = "ari:cloud:townsquare:c:goal/paiement";
const STABILITE = "ari:cloud:townsquare:c:goal/stabilite";
const SECURITE = "ari:cloud:townsquare:c:goal/securite";
const TODO = "col-0-À faire";

async function kanbanBoard(options: { canEdit?: boolean; put?: Reply; property?: unknown } = {}) {
  const mutations: { field: string; goalId: string; workItemId: string }[] = [];
  const property = {
    value: options.property ?? (null as unknown),
    onRead: () => {},
    onPut: () => {},
  };
  const jira = boardSiteJira({
    ...(options.canEdit === undefined ? {} : { canEdit: options.canEdit }),
    quickFilters: [{ id: 1, name: "Urgent", jql: "labels = urgent", position: 0 }],
    graphql: goalsGateway({
      goals: [
        { id: PAIEMENT, key: "GOAL-1", name: "Paiement", workItems: ["ABC-101", "ABC-102"] },
        { id: STABILITE, key: "GOAL-2", name: "Stabilité", workItems: ["ABC-103"] },
        { id: SECURITE, key: "GOAL-3", name: "Sécurité" },
      ],
      mutation: (input, field) => {
        mutations.push({ field, ...input });
        return { status: 200, json: { data: { [field]: { success: true } } } };
      },
    }),
  })
    .on("GET", "/rest/agile/1.0/board/7", {
      status: 200,
      json: { id: 7, name: "Flux Paiement", type: "kanban", location: { projectKey: "ABC" } },
    })
    .on("GET", PROPERTY, () => {
      property.onRead();
      return property.value === null
        ? { status: 404 }
        : { status: 200, json: { value: property.value } };
    })
    .on("PUT", PROPERTY, (request) => {
      property.onPut();
      if (options.put) return options.put;
      property.value = request.body;
      return { status: 200 };
    });
  const board = new BoardModel(SITE, fakePlatform(jira), {
    now: () => new Date("2026-10-01T10:00:00Z"),
  });
  await board.load();
  await board.detect(BOARD_URL);
  return { board, jira, property, mutations };
}

function document(
  board: BoardModel,
  pins: readonly string[],
  publishedAt = "2026-10-01T09:00:00Z",
) {
  const config = board.configuration.value;
  if (!config) throw new Error("Configuration attendue");
  return encodeTeamDocument({
    version: 1,
    publishedAt,
    publishedBy: { accountId: "u9", displayName: "Alex Martin" },
    settings: { ...teamSettingsOf(config), boardPinnedGoalIds: pins },
  });
}

describe("BoardModel — Kanban sans sprint", () => {
  it("un Goal épinglé supprimé reste retirable même si le premier chargement a échoué", async () => {
    const missing = "ari:cloud:townsquare:c:goal/supprime";
    const property = encodeTeamDocument({
      version: 1,
      publishedAt: "2026-10-01T09:00:00Z",
      publishedBy: { accountId: "u9", displayName: "Alex Martin" },
      settings: teamSettingsOf(
        makeConfiguration({ boardType: "kanban", boardPinnedGoalIds: [missing] }),
      ),
    });
    const { board, jira } = await kanbanBoard({ property });
    expect(board.snapshot.value).toBeNull();
    expect(board.syncProblem.value?.text).toContain("Objectifs du board Kanban indisponibles");
    expect(board.canPinGoals.value).toBe(true);
    board.openPinEditor();
    expect(board.pinEditor.value).toMatchObject({
      sprintId: null,
      base: [missing],
      selection: [missing],
      fromLocal: false,
      canKeepLocally: false,
    });
    board.togglePinned(missing);
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.pinEditor.value).toBeNull();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([]);
    expect(board.syncProblem.value).toBeNull();
    expect(board.configuration.value?.localPinnedGoalIds).toEqual({});
  });

  it("charge Goals, Build et RUN ; l'épinglage désigne le board sans repli local", async () => {
    const { board, jira } = await kanbanBoard();
    expect(board.snapshot.value?.sprint).toBeNull();
    expect(board.snapshot.value?.activeSprints).toEqual([]);
    expect(board.layout.value?.lanes.map((lane) => lane.title)).toEqual([
      "Paiement",
      "Stabilité",
      "Build",
      "Anomalie Prod",
    ]);
    expect(board.canPinGoals.value).toBe(true);
    board.openPinEditor();
    expect(board.pinEditor.value).toMatchObject({
      sprintId: null,
      sprintName: "Flux Paiement",
      base: [],
      fromLocal: false,
      canKeepLocally: false,
    });
    expect(jira.requests.filter((r) => r.path.includes("/sprint"))).toEqual([]);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("écrit une fois les pins dans les réglages du board, conserve les clés et modifications du collègue", async () => {
    const { board, jira, property } = await kanbanBoard();
    board.openPinEditor();
    board.togglePinned(SECURITE);
    const shared = document(board, []);
    property.value = {
      ...shared,
      futur: { valeur: 1 },
      settings: { ...(shared.settings as object), agingThresholdDays: 17, futurReglage: true },
    };
    property.onPut = () => {
      expect(board.configuration.value?.boardPinnedGoalIds).toEqual([]);
      expect(board.snapshot.value?.pinnedGoalIds).toEqual([]);
      expect(board.pinEditor.value?.saving).toBe(true);
    };
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(property.value).toMatchObject({
      futur: { valeur: 1 },
      settings: { boardPinnedGoalIds: [SECURITE], agingThresholdDays: 17, futurReglage: true },
    });
    expect(board.pinEditor.value).toBeNull();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([SECURITE]);
    expect(board.layout.value?.lanes[0]?.title).toBe("Sécurité");
    expect((await board.audit.list(SITE.origin))[0]).toMatchObject({
      action: "épinglage",
      outcome: "réussi",
      detail: null,
      detailMessage: { key: "propriété du board Kanban" },
    });
  });

  it("sélection distante modifiée : refuse l'écrasement et repart de Jira", async () => {
    const { board, jira, property } = await kanbanBoard();
    board.openPinEditor();
    board.togglePinned(SECURITE);
    property.value = document(board, [STABILITE]);
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    expect(board.pinEditor.value).toMatchObject({
      base: [STABILITE],
      selection: [STABILITE],
      saving: false,
      notice: { tone: "warning" },
    });
  });

  it("modification entre les deux lectures : conflit sans aucune écriture", async () => {
    const { board, jira, property } = await kanbanBoard();
    board.openPinEditor();
    board.togglePinned(SECURITE);
    property.value = document(board, []);
    let reads = 0;
    property.onRead = () => {
      reads += 1;
      if (reads === 2) property.value = document(board, [STABILITE], "2026-10-01T09:01:00Z");
    };
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    expect(board.pinEditor.value?.base).toEqual([STABILITE]);
  });

  it("suppression entre les deux lectures : ne recrée pas la propriété", async () => {
    const { board, jira, property } = await kanbanBoard();
    board.openPinEditor();
    board.togglePinned(SECURITE);
    property.value = document(board, []);
    let reads = 0;
    property.onRead = () => {
      reads += 1;
      if (reads === 2) property.value = null;
    };
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    expect(board.pinEditor.value).toMatchObject({
      base: [],
      selection: [],
      notice: { tone: "warning" },
    });
  });

  it("lecture devenue illisible depuis l'ouverture : aucun écrasement et sélection conservée", async () => {
    const { board, jira, property } = await kanbanBoard();
    board.openPinEditor();
    board.togglePinned(SECURITE);
    property.value = { version: 99 };
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    expect(board.pinEditor.value).toMatchObject({
      selection: [SECURITE],
      saving: false,
      notice: { tone: "error" },
    });
    expect(board.canPinGoals.value).toBe(false);
  });

  it("sélection inchangée : ferme l'éditeur sans écrire", async () => {
    const { board, jira } = await kanbanBoard();
    board.openPinEditor();
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    expect(board.pinEditor.value).toBeNull();
  });

  it("droits refusés : une tentative, lecture seule et aucun repli local", async () => {
    const { board, jira } = await kanbanBoard({ put: { status: 403, json: {} } });
    board.openPinEditor();
    board.togglePinned(SECURITE);
    await board.savePinnedGoals();
    await board.keepPinnedLocally();
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.canEditBoard.value).toBe(false);
    expect(board.pinEditor.value).toMatchObject({
      selection: [SECURITE],
      canKeepLocally: false,
      notice: { tone: "error" },
    });
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([]);
    expect(board.configuration.value?.localPinnedGoalIds).toEqual({});
  });

  it("droit déjà refusé ou propriété illisible : éditeur indisponible", async () => {
    for (const options of [{ canEdit: false }, { property: { version: 99 } }]) {
      const { board, jira } = await kanbanBoard(options);
      expect(board.canPinGoals.value).toBe(false);
      board.openPinEditor();
      expect(board.pinEditor.value).toBeNull();
      expect(jira.sent("PUT", PROPERTY)).toEqual([]);
    }
  });

  it("réponse perdue : aucune répétition ; relit la sélection réellement enregistrée", async () => {
    const { board, jira, property } = await kanbanBoard();
    board.openPinEditor();
    board.togglePinned(SECURITE);
    jira.on("PUT", PROPERTY, (request) => {
      property.value = request.body;
      return { networkError: "Réponse perdue" };
    });
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([SECURITE]);
    expect(board.pinEditor.value?.notice?.tone).toBe("warning");
    expect((await board.audit.list(SITE.origin))[0]?.outcome).toBe("incertain");
  });

  it("éditeur disparu pendant l'écriture : le refus ne le rouvre pas", async () => {
    const { board, jira } = await kanbanBoard();
    board.openPinEditor();
    board.togglePinned(SECURITE);
    jira.on("PUT", PROPERTY, () => {
      board.pinEditor.value = null;
      return { status: 403, json: {} };
    });
    await board.savePinnedGoals();
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.pinEditor.value).toBeNull();
  });

  it("propriété supprimée : les pins précédemment lus sont effacés à la prochaine lecture", async () => {
    const { board, property } = await kanbanBoard();
    property.value = document(board, [SECURITE]);
    await board.sync();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([SECURITE]);
    property.value = null;
    await board.sync();
    expect(board.snapshot.value?.pinnedGoalIds).toEqual([]);
  });

  it("transition puis relecture du board, sans sprint", async () => {
    const { board, jira } = await kanbanBoard();
    jira
      .on("GET", "/rest/api/3/issue/ABC-102", {
        status: 200,
        json: { fields: { status: statusJson("1", "À faire") } },
      })
      .on("GET", "/rest/api/3/issue/ABC-102/transitions", {
        status: 200,
        json: {
          transitions: [
            { id: "21", name: "Démarrer", to: statusJson("3", "En cours"), isAvailable: true },
          ],
        },
      })
      .on("POST", "/rest/api/3/issue/ABC-102/transitions", { status: 204 });
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock(PAIEMENT),
      columnId: "col-1-En cours",
      beforeKey: null,
    });
    expect(jira.sent("POST", "/rest/api/3/issue/ABC-102/transitions")).toHaveLength(1);
    expect(board.writeNotice.value).toBeNull();
    expect(jira.requests.filter((r) => r.path.includes("/sprint"))).toEqual([]);
  });

  it("rattachement et détachement natifs d'un Goal, sans propriété de sprint", async () => {
    const { board, mutations, jira } = await kanbanBoard();
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock(STABILITE),
      columnId: TODO,
      beforeKey: null,
    });
    expect(mutations.map((m) => [m.field, m.goalId])).toEqual([
      ["goals_unlinkWorkItem", PAIEMENT],
      ["goals_linkWorkItem", STABILITE],
    ]);
    mutations.length = 0;
    await board.dropIssue({
      issueKey: "ABC-102",
      block: BUILD_BLOCK,
      columnId: TODO,
      beforeKey: null,
    });
    expect(mutations.map((m) => m.field)).toEqual(["goals_unlinkWorkItem"]);
    expect(jira.requests.filter((r) => r.path.includes("/sprint"))).toEqual([]);
  });

  it("rang dans Build : une écriture de rang sans sprint", async () => {
    const { board, jira } = await kanbanBoard();
    jira.on("PUT", "/rest/agile/1.0/issue/rank", { status: 204 });
    // Deux cartes sans Goal dans la même colonne.
    jira.on("GET", "/rest/agile/1.0/board/7/issue", {
      status: 200,
      json: {
        issues: [SPRINT_ISSUES[4], { ...SPRINT_ISSUES[4], id: "ABC-106", key: "ABC-106" }],
        total: 2,
      },
    });
    await board.sync();
    await board.dropIssue({
      issueKey: "ABC-106",
      block: BUILD_BLOCK,
      columnId: TODO,
      beforeKey: "ABC-105",
    });
    expect(jira.sent("PUT", "/rest/agile/1.0/issue/rank")[0]?.body).toMatchObject({
      issues: ["ABC-106"],
      rankBeforeIssue: "ABC-105",
    });
  });

  it("filtres rapides et couleurs s'évaluent malgré l'absence de sprint", async () => {
    const { board, jira } = await kanbanBoard();
    jira.on("POST", "/rest/api/3/jql/match", {
      status: 200,
      json: {
        matches: [{ matchedIssues: [Number(SPRINT_ISSUES[0]?.id)], errors: [] }],
      },
    });
    board.toggleQuickFilter("addedAfterStart");
    expect(board.filters.value.quickFilters.has("addedAfterStart")).toBe(false);
    await board.toggleJiraQuickFilter(1);
    expect(board.filters.value.jiraQuickFilterKeys).not.toBeNull();
    await board.applyColorRules([
      {
        id: "urgent",
        name: "Urgent",
        jql: "labels = urgent",
        color: "red",
        enabled: true,
        kind: null,
      },
    ]);
    expect(board.cardColors.value["ABC-101"]).toBe("red");
    const queries = jira
      .sent("GET", "/rest/agile/1.0/board/7/issue")
      .map((r) => r.url.searchParams.get("jql"));
    expect(queries.filter((jql) => jql === "labels = urgent")).toHaveLength(2);
    expect(queries.some((jql) => jql?.includes("sprint in"))).toBe(false);
    expect(propertySettings(board)?.boardPinnedGoalIds).toEqual([]);
  });
});

function propertySettings(board: BoardModel): TeamDocument["settings"] | null {
  const state = board.team.value;
  return state.kind === "published" ? state.document.settings : null;
}
