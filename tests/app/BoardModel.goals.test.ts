import { describe, expect, it } from "vitest";
import { auditText } from "../../src/app/model/auditLog";
import { BoardModel } from "../../src/app/model/BoardModel";
import { BUILD_BLOCK, goalBlock, swimlaneBlock } from "../../src/core/boardBlocks";
import { withLocalPins } from "../../src/core/boardPreferences";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { atlassianGoalsPlatform } from "../support/atlassianGoalsBoard";
import {
  BOARD_URL,
  boardSiteJira,
  CORS_REFUSAL,
  GOALS_DOCUMENT,
  SPRINT_ISSUES,
} from "../support/boardFixture";
import { isWriteRequest, type Reply } from "../support/fakeJira";
import { type FakePlatform, fakePlatform } from "../support/fakePlatform";
import { type FakeGoal, goalsGateway } from "../support/goalsGateway";
import { issueJson } from "../support/jiraFixtures";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const TODO = "col-0-À faire";
const PAIEMENT = "ari:cloud:townsquare:c:goal/paiement";
const STABILITE = "ari:cloud:townsquare:c:goal/stabilite";

// Les liens de lecture fictifs utilisent les clés ; les mutations utilisent les IDs numériques.
const GOALS: FakeGoal[] = [
  {
    id: PAIEMENT,
    key: "GOAL-1",
    name: "Paiement en une étape",
    status: "on_track",
    url: "https://home.atlassian.com/goal/1",
    workItems: ["ABC-101", "ABC-102"],
  },
  {
    id: STABILITE,
    key: "GOAL-2",
    name: "Zéro incident",
    status: "at_risk",
    workItems: ["ABC-103"],
  },
];

async function goalsBoard(
  options: {
    goals?: FakeGoal[];
    mutation?: (input: { goalId: string; workItemId: string }, field: string) => Reply;
  } = {},
) {
  const mutations: { field: string; goalId: string; workItemId: string }[] = [];
  const jira = boardSiteJira({
    graphql: goalsGateway({
      goals: options.goals ?? GOALS,
      mutation: (input, field) => {
        mutations.push({ field, ...input });
        return (
          options.mutation?.(input, field) ?? {
            status: 200,
            json: { data: { [field]: { success: true } } },
          }
        );
      },
    }),
  });
  const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira), {
    now: () => new Date("2026-09-18T10:00:00Z"),
  });
  await board.load();
  await board.detect(BOARD_URL);
  return { board, jira, mutations };
}

describe("BoardModel — Goals Atlassian", () => {
  it("affiche les Goals rattachés aux tickets du sprint, avec leur statut", async () => {
    const { board } = await goalsBoard();
    const snapshot = board.snapshot.value;
    expect(snapshot?.goalsOrigin).toBe("atlassianGoals");
    expect(snapshot?.goals.map((g) => [g.title, g.atlassianStatus])).toEqual([
      ["Paiement en une étape", "on_track"],
      ["Zéro incident", "at_risk"],
    ]);
    expect(snapshot?.goalIssues.map((i) => [i.issue.key, i.goalId])).toEqual([
      ["ABC-101", PAIEMENT],
      ["ABC-102", PAIEMENT],
      ["ABC-103", STABILITE],
      ["ABC-104", null],
      ["ABC-105", null],
    ]);
    expect(board.goalsNotice.value).toBeNull();
    expect(board.layout.value?.lanes.map((lane) => lane.title)).toEqual([
      "Paiement en une étape",
      "Zéro incident",
      "Build",
      "Anomalie Prod",
    ]);
  });

  it("passerelle qui refuse (CORS) : repli sur le texte du sprint, cause dite clairement", async () => {
    const jira = boardSiteJira();
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira));
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(board.goalsNotice.value).toContain("Invalid CORS request");
    expect(board.goalsNotice.value).toContain("Diagnostic");
  });

  it("vers un autre Goal : détache de l'ancien, puis rattache au nouveau (lien natif)", async () => {
    const { board, mutations } = await goalsBoard();
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock(STABILITE),
      columnId: TODO,
      beforeKey: null,
    });

    expect(mutations).toEqual([
      {
        field: "goals_unlinkWorkItem",
        goalId: PAIEMENT,
        workItemId: `ari:cloud:jira:cloud-test:issue/${SPRINT_ISSUES.find((issue) => issue.key === "ABC-102")?.id}`,
      },
      {
        field: "goals_linkWorkItem",
        goalId: STABILITE,
        workItemId: `ari:cloud:jira:cloud-test:issue/${SPRINT_ISSUES.find((issue) => issue.key === "ABC-102")?.id}`,
      },
    ]);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({
      action: "rattachement",
      to: "Zéro incident",
      outcome: "réussi",
      detail: null,
      detailMessage: { key: "lien Goal Atlassian natif" },
    });
  });

  it("vers Build : détache seulement", async () => {
    const { board, mutations } = await goalsBoard();
    await board.dropIssue({
      issueKey: "ABC-103",
      block: BUILD_BLOCK,
      columnId: "col-2-Terminé",
      beforeKey: null,
    });
    expect(mutations.map((m) => m.field)).toEqual(["goals_unlinkWorkItem"]);
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({
      action: "rattachement",
      outcome: "réussi",
      detail: null,
      detailMessage: { key: "lien Goal retiré" },
    });
  });

  it("depuis Build : rattache seulement", async () => {
    const { board, mutations } = await goalsBoard();
    await board.dropIssue({
      issueKey: "ABC-105",
      block: goalBlock(PAIEMENT),
      columnId: TODO,
      beforeKey: null,
    });
    expect(mutations.map((m) => [m.field, m.goalId])).toEqual([["goals_linkWorkItem", PAIEMENT]]);
  });

  it("RUN rejoint un Goal natif puis retrouve sa swimlane après détachement", async () => {
    const goals = GOALS.map((goal) => ({ ...goal, workItems: [...(goal.workItems ?? [])] }));
    const { board, jira, mutations } = await goalsBoard({
      goals,
      mutation: (input, field) => {
        const goal = goals.find((candidate) => candidate.id === input.goalId);
        if (!goal) throw new Error("Goal fictif attendu");
        const issueId = input.workItemId.split("/").at(-1);
        const key = SPRINT_ISSUES.find((issue) => issue.id === issueId)?.key as string | undefined;
        if (!key) throw new Error("Ticket fictif attendu");
        goal.workItems =
          field === "goals_linkWorkItem"
            ? [...goal.workItems, key]
            : goal.workItems.filter((item) => item !== key);
        return { status: 200, json: { data: { [field]: { success: true } } } };
      },
    });
    const before = jira.requests.length;
    const drop = { issueKey: "RUN-7", columnId: "col-1-En cours", beforeKey: null };
    await board.dropIssue({ ...drop, block: goalBlock(STABILITE) });
    expect(
      board.snapshot.value?.goalIssues.find((issue) => issue.issue.key === "RUN-7"),
    ).toMatchObject({ goalId: STABILITE, swimlaneId: "1" });
    expect(board.layout.value?.lanes.some((lane) => lane.id === "swimlane:1")).toBe(false);
    await board.dropIssue({ ...drop, block: swimlaneBlock("1") });
    expect(
      board.snapshot.value?.swimlaneIssues.find((issue) => issue.issue.key === "RUN-7")?.goalId,
    ).toBeNull();
    expect(mutations.map((mutation) => [mutation.field, mutation.goalId])).toEqual([
      ["goals_linkWorkItem", STABILITE],
      ["goals_unlinkWorkItem", STABILITE],
    ]);
    expect(
      jira.requests
        .slice(before)
        .filter(isWriteRequest)
        .map((request) => request.path),
    ).toEqual(["/gateway/api/graphql", "/gateway/api/graphql"]);
    board.dispose();
  });

  it("détachement refusé par Atlassian : on s'arrête, le ticket n'est pas lié à deux Goals", async () => {
    const { board, mutations, jira } = await goalsBoard({
      mutation: (_input, field) =>
        field === "goals_unlinkWorkItem"
          ? {
              status: 200,
              json: {
                data: { [field]: { success: false, errors: [{ message: "Droits insuffisants" }] } },
              },
            }
          : { status: 200, json: { data: { [field]: { success: true } } } },
    });
    const before = jira.requests.length;
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock(STABILITE),
      columnId: "col-0-À faire",
      beforeKey: null,
    });

    expect(mutations.every((m) => m.field === "goals_unlinkWorkItem")).toBe(true);
    expect(board.writeNotice.value?.text).toContain("détacher");
    expect(board.writeNotice.value?.suggestion).toContain("Droits insuffisants");
    // Ni rattachement, ni transition.
    expect(
      jira.requests
        .slice(before)
        .filter(isWriteRequest)
        .map((r) => r.path),
    ).toEqual(mutations.map(() => "/gateway/api/graphql"));
    expect(jira.sent("GET", "/rest/api/3/issue/ABC-102")).toEqual([]);
  });

  it("refus Atlassian sans message : le journal dit qu'aucun détail n'a été fourni", async () => {
    const { board } = await goalsBoard({
      mutation: (_input, field) =>
        field === "goals_unlinkWorkItem"
          ? { status: 200, json: { data: { [field]: { success: false, errors: [] } } } }
          : { status: 200, json: { data: { [field]: { success: true } } } },
    });
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock(STABILITE),
      columnId: "col-0-À faire",
      beforeKey: null,
    });
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "rattachement", outcome: "échec", detail: null });
    expect(entry && auditText(entry, "detail", "fr")).toBe("aucun détail fourni par Atlassian");
    expect(entry && auditText(entry, "detail", "en")).toBe("no details provided by Atlassian");
  });

  it("issue incertaine d'une mutation : pas de nouvelle tentative, et on le dit", async () => {
    const { board, mutations } = await goalsBoard({ mutation: () => ({ status: 503 }) });
    await board.dropIssue({
      issueKey: "ABC-105",
      block: goalBlock(PAIEMENT),
      columnId: TODO,
      beforeKey: null,
    });
    expect(mutations).toHaveLength(1);
    expect(board.writeNotice.value?.text).toContain("n'a pas confirmé");
  });

  it("aucun Goal rattaché aux tickets : board sans swimlane d'objectif, sans erreur", async () => {
    const jira = boardSiteJira({
      sprintIssues: SPRINT_ISSUES.map((issue) => issueJson(issue.key as string)),
      graphql: goalsGateway({ goals: [{ id: "g-vide", name: "Sans ticket", workItems: [] }] }),
    });
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira));
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.goalsOrigin).toBe("atlassianGoals");
    expect(board.snapshot.value?.goals).toEqual([]);
    expect(board.goalsNotice.value).toBeNull();
  });
});

describe("Goal Atlassian inconnu après la première lecture", () => {
  const NOUVEAU = "ari:cloud:townsquare:c:goal/nouveau";
  const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
  const goalLane = (board: BoardModel, goalId: string) =>
    board.layout.value?.lanes
      .find((lane) => lane.id === `goal:${goalId}`)
      ?.cells.flatMap((cell) => cell.issues)
      .map((issue) => issue.issue.key);

  /** Board lu une première fois, puis un Goal neuf rattaché à ABC-104 apparaît sur le site. */
  async function boardWithNewGoal() {
    const goals = [...GOALS];
    const context = await goalsBoard({ goals });
    expect(context.board.snapshot.value?.goals.map((goal) => goal.id)).toEqual([
      PAIEMENT,
      STABILITE,
    ]);
    goals.push({ id: NOUVEAU, key: "GOAL-3", name: "Nouveau Goal", workItems: ["ABC-104"] });
    return context;
  }

  it("découvert par un ticket, non épinglé : arrive masqué, puis se réaffiche", async () => {
    const { board, jira } = await boardWithNewGoal();

    await board.sync();

    expect(board.snapshot.value?.goals.some((goal) => goal.id === NOUVEAU)).toBe(true);
    expect(board.configuration.value?.hiddenGoalIds).toEqual([NOUVEAU]);
    expect(board.hiddenGoals.value.map((goal) => goal.id)).toEqual([NOUVEAU]);
    expect(goalLane(board, NOUVEAU)).toBeUndefined();
    // Masquage local : rien n'est écrit dans Jira.
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);

    await board.setGoalHidden(NOUVEAU, false);

    expect(board.hiddenGoals.value).toEqual([]);
    expect(goalLane(board, NOUVEAU)).toEqual(["ABC-104"]);
    await board.sync();
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
  });

  it("épinglé au sprint dans Jira : visible, rien n'est masqué", async () => {
    const { board, jira } = await boardWithNewGoal();
    jira.on("GET", PROPERTY, {
      status: 200,
      json: {
        key: SPRINT_PROPERTY_KEYS.goals,
        value: { ...GOALS_DOCUMENT, atlassianGoalIds: [NOUVEAU] },
      },
    });

    await board.sync();

    expect(board.snapshot.value?.pinnedGoalIds).toEqual([NOUVEAU]);
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect(goalLane(board, NOUVEAU)).toEqual(["ABC-104"]);
  });

  it("épinglé dans ce navigateur (repli local) : visible, rien n'est masqué", async () => {
    const { board } = await boardWithNewGoal();
    await board.applySettings((current) => withLocalPins(current, 42, [NOUVEAU]), {
      resync: true,
    });

    expect(board.snapshot.value?.localPinnedGoalIds).toEqual([NOUVEAU]);
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect(goalLane(board, NOUVEAU)).toEqual(["ABC-104"]);
  });

  it("propriété du sprint illisible : épinglage inconnu, rien n'est masqué", async () => {
    const { board, jira } = await boardWithNewGoal();
    jira.on("GET", PROPERTY, { status: 500, json: { errorMessages: ["Erreur interne"] } });

    await board.sync();

    expect(board.syncProblem.value).toBeNull();
    expect(board.snapshot.value?.pinnedGoalIds).toBeNull();
    expect(board.snapshot.value?.goals.some((goal) => goal.id === NOUVEAU)).toBe(true);
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect(goalLane(board, NOUVEAU)).toEqual(["ABC-104"]);
  });
});

describe("changement de Goal partiel", () => {
  it.each([false, true])(
    "ancien lien retiré, création refusée ou incertaine (%s) : le dit sans restauration",
    async (uncertain) => {
      const { board, mutations } = await goalsBoard({
        mutation: (_input, field) => {
          if (field === "goals_unlinkWorkItem")
            return { status: 200, json: { data: { [field]: { success: true } } } };
          return uncertain
            ? { status: 503 }
            : {
                status: 200,
                json: { data: { [field]: { success: false, errors: [{ message: "Refus" }] } } },
              };
        },
      });
      await board.dropIssue({
        issueKey: "ABC-102",
        block: goalBlock(STABILITE),
        columnId: TODO,
        beforeKey: null,
      });
      expect(board.writeNotice.value?.text).toContain("l’ancien Goal a déjà été retiré");
      expect(mutations.filter((m) => m.field === "goals_unlinkWorkItem")).toHaveLength(1);
      expect(
        mutations
          .filter((m) => m.field === "goals_linkWorkItem")
          .every((m) => m.goalId === STABILITE),
      ).toBe(true);
      if (uncertain) expect(mutations).toHaveLength(2);
    },
  );
});

describe("première lecture des Goals Atlassian après une lecture en texte (story 8.25)", () => {
  it("repli texte puis Goals lisibles : aucun Goal lié n'est masqué ; les suivants le sont", async () => {
    const goals = [...GOALS];
    const gateway = goalsGateway({ goals });
    let readable = false;
    const jira = boardSiteJira({
      graphql: (request) => (readable ? gateway(request) : CORS_REFUSAL),
    });
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira), {
      now: () => new Date("2026-09-18T10:00:00Z"),
    });
    await board.load();
    await board.detect(BOARD_URL);
    // Repli : les objectifs du texte du sprint reçoivent des couleurs, et sont donc « connus ».
    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(Object.keys(board.configuration.value?.goalColorIndex ?? {}).length).toBeGreaterThan(0);

    readable = true;
    await board.sync();
    expect(board.snapshot.value?.goalsOrigin).toBe("atlassianGoals");
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect(board.hiddenGoals.value).toEqual([]);

    // Lecture suivante : un Goal inconnu, non épinglé, introduit par un ticket arrive masqué.
    const NOUVEAU = "ari:cloud:townsquare:c:goal/nouveau";
    goals.push({ id: NOUVEAU, key: "GOAL-3", name: "Nouveau Goal", workItems: ["ABC-104"] });
    await board.sync();
    expect(board.configuration.value?.hiddenGoalIds).toEqual([NOUVEAU]);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("source texte puis bascule vers les Goals Atlassian : aucun Goal lié n'est masqué", async () => {
    const jira = boardSiteJira({ graphql: goalsGateway({ goals: [...GOALS] }) });
    const board = new BoardModel(SITE, fakePlatform(jira), {
      now: () => new Date("2026-09-18T10:00:00Z"),
    });
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.goalsOrigin).toBe("sprintText");
    expect(Object.keys(board.configuration.value?.goalColorIndex ?? {}).length).toBeGreaterThan(0);

    await board.applySettings((current) => ({ ...current, goalSource: "atlassianGoals" }), {
      resync: true,
    });

    expect(board.snapshot.value?.goalsOrigin).toBe("atlassianGoals");
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
    expect(board.hiddenGoals.value).toEqual([]);
  });

  /** Board réglé sur les Goals Atlassian dont les préférences locales connaissent ces couleurs. */
  async function boardWithKnownColors(goalColorIndex: Record<string, number>) {
    const platform: FakePlatform = await atlassianGoalsPlatform(
      boardSiteJira({ graphql: goalsGateway({ goals: [...GOALS] }) }),
    );
    const boards = (await platform.store.get("boards.v1")) as Record<
      string,
      { boards: Record<string, object> }
    >;
    const site = boards[SITE.origin];
    if (!site) throw new Error("site attendu");
    site.boards["7"] = { ...site.boards["7"], goalColorIndex };
    await platform.store.set("boards.v1", boards);
    const board = new BoardModel(SITE, platform, { now: () => new Date("2026-09-18T10:00:00Z") });
    await board.load();
    await board.detect(BOARD_URL);
    return board;
  }

  it("rechargement après une session en texte : première lecture, rien n'est masqué", async () => {
    const board = await boardWithKnownColors({ "text-42-a1b2c3": 0, "0f8e2d3c-uuid": 1 });

    expect(board.snapshot.value?.goalsOrigin).toBe("atlassianGoals");
    expect(board.configuration.value?.hiddenGoalIds).toEqual([]);
  });

  it("un Goal Atlassian connu par sa clé consomme la première lecture", async () => {
    const board = await boardWithKnownColors({ "GOAL-9": 0 });

    expect(board.snapshot.value?.goalsOrigin).toBe("atlassianGoals");
    expect(board.configuration.value?.hiddenGoalIds).toEqual([PAIEMENT, STABILITE]);
  });
});
