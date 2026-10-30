import { describe, expect, it } from "vitest";
import type { BoardConfiguration } from "../../src/core/boardConfiguration";
import { snapshotGoalProgress, sprintMetrics } from "../../src/core/boardIssue";
import {
  type AtlassianGoalsLoader,
  BoardSetupError,
  detectBoard,
  loadSnapshot,
  refreshBoardStructure,
} from "../../src/core/boardSync";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
import { JiraError } from "../../src/jira/errors";
import type { LoadPhase, LoadTrace } from "../../src/jira/loadTrace";
import { JiraTransport } from "../../src/jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { ACME, FakeJira, type Reply } from "../support/fakeJira";
import { issueJson, makeConfiguration, statusJson } from "../support/jiraFixtures";

const BOARD_URL = "https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7";
const GOALS_PROPERTY = (sprintId: number) =>
  `/rest/agile/1.0/sprint/${sprintId}/properties/${SPRINT_PROPERTY_KEYS.goals}`;
const NOW = new Date("2026-09-18T12:00:00Z");

function readerFor(jira: FakeJira) {
  return new JiraClient(new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 }));
}

function sprintJson(id: number, parts: Record<string, unknown> = {}) {
  return {
    id,
    name: `Sprint ${id}`,
    state: "active",
    startDate: "2026-09-12T09:00:00.000+0200",
    ...parts,
  };
}

/** Faux Jira d'un board à un sprint actif. */
function boardJira(options: {
  sprints?: unknown[];
  issues?: Record<number, unknown[]>;
  property?: Reply;
}): FakeJira {
  const sprints = options.sprints ?? [sprintJson(42)];
  const jira = new FakeJira().on("GET", "/rest/agile/1.0/board/1/sprint", {
    status: 200,
    json: { values: sprints, isLast: true },
  });
  for (const sprint of sprints as { id: number }[]) {
    const issues = options.issues?.[sprint.id] ?? [];
    jira.on("GET", `/rest/agile/1.0/board/1/sprint/${sprint.id}/issue`, {
      status: 200,
      json: { issues, total: issues.length },
    });
    jira.on("GET", GOALS_PROPERTY(sprint.id), options.property ?? { status: 404 });
  }
  return jira;
}

function sync(
  jira: FakeJira,
  configuration: BoardConfiguration = makeConfiguration(),
  goalsLoader: AtlassianGoalsLoader | null = null,
  trace?: LoadTrace,
) {
  return loadSnapshot({
    reader: readerFor(jira),
    configuration,
    currentUser: null,
    goalsLoader,
    now: NOW,
    ...(trace ? { trace } : {}),
  });
}

function recordingTrace() {
  const completed: { phase: LoadPhase; error: unknown | null }[] = [];
  const trace: LoadTrace = {
    async measure(phase, work) {
      try {
        const value = await work();
        completed.push({ phase, error: null });
        return value;
      } catch (error) {
        completed.push({ phase, error });
        throw error;
      }
    },
    measureSync(phase, work) {
      try {
        const value = work();
        completed.push({ phase, error: null });
        return value;
      } catch (error) {
        completed.push({ phase, error });
        throw error;
      }
    },
  };
  return { trace, completed };
}

describe("detectBoard", () => {
  function discoveryJira(): FakeJira {
    return new FakeJira()
      .on("GET", "/rest/agile/1.0/board/7", {
        status: 200,
        json: { id: 7, name: "Board de test", type: "scrum", location: { projectKey: "ABC" } },
      })
      .on("GET", "/rest/agile/1.0/board/7/configuration", {
        status: 200,
        json: {
          columnConfig: {
            columns: [
              { name: "À faire", statuses: [{ id: "1" }] },
              { name: "Terminé", statuses: [{ id: "6" }] },
            ],
          },
          estimation: { field: { fieldId: "customfield_10016" } },
        },
      })
      .on("GET", "/rest/api/3/status", {
        status: 200,
        json: [statusJson("1", "To Do", "new"), statusJson("6", "Done", "done")],
      })
      .on("GET", "/rest/api/3/field", {
        status: 200,
        json: [
          { id: "customfield_10016", name: "Story Points" },
          { id: "customfield_10100", name: "Goals" },
          { id: "customfield_10021", name: "Flagged" },
        ],
      })
      .on("GET", "/rest/agile/1.0/board/7/issue", {
        status: 200,
        json: {
          issues: [
            issueJson("ABC-1"),
            issueJson("ABC-2", { typeId: "10004", typeName: "Anomalie Prod" }),
            issueJson("ABC-3"),
          ],
          total: 3,
        },
      });
  }

  it("refuse une adresse qui n'est pas un board, sans rien demander à Jira", async () => {
    const jira = new FakeJira();
    const attempt = detectBoard(readerFor(jira), "https://acme.atlassian.net/browse/ABC-1", null);
    await expect(attempt).rejects.toThrowError(BoardSetupError);
    expect(jira.requests).toEqual([]);
  });

  it("refuse le board d'un autre site, sans rien demander à Jira", async () => {
    const jira = new FakeJira();
    const attempt = detectBoard(
      readerFor(jira),
      "https://autre.atlassian.net/jira/software/c/projects/ABC/boards/7",
      null,
    );
    await expect(attempt).rejects.toThrowError(/autre\.atlassian\.net/);
    expect(jira.requests).toEqual([]);
  });

  it.each(["scrum", "kanban"])(
    "première ouverture %s : lit la structure sans recenser les tickets pour leurs types",
    async (boardType) => {
      const jira = discoveryJira()
        .on("GET", "/rest/agile/1.0/board/7", {
          status: 200,
          json: { id: 7, name: "Board de test", type: boardType },
        })
        .on("GET", "/rest/agile/1.0/board/7/issue", { status: 500 });
      const config = await detectBoard(readerFor(jira), BOARD_URL, null);

      expect(config.issueTypes).toEqual([]);
      expect(config.ticketSwimlanes).toEqual([]);
      expect(config.boardType).toBe(boardType);
      expect(config.goalsFieldId).toBe("customfield_10100");
      expect(jira.sent("GET", "/rest/agile/1.0/board/7/issue")).toEqual([]);
      expect(jira.requests).toHaveLength(4);
    },
  );

  it("la relecture explicite recense les types de tout le board", async () => {
    const jira = discoveryJira();
    const config = await refreshBoardStructure(readerFor(jira), 7, null);

    expect(config.boardId).toBe(7);
    expect(config.siteOrigin).toBe("https://acme.atlassian.net");
    expect(config.columns.map((c) => [c.name, c.isDone])).toEqual([
      ["À faire", false],
      ["Terminé", true],
    ]);
    expect(config.issueTypes.map((t) => [t.name, t.category])).toEqual([
      ["Anomalie Prod", "SWIMLANE"],
      ["Story", "GOAL"],
    ]);
    expect(config.estimationFieldName).toBe("Story Points");
    expect(config.goalsFieldId).toBe("customfield_10100");
    expect(config.flaggedFieldId).toBe("customfield_10021");
    // La découverte des types ne lit que le strict nécessaire.
    expect(
      jira.sent("GET", "/rest/agile/1.0/board/7/issue")[0]?.url.searchParams.get("fields"),
    ).toBe("issuetype,status");
    expect(jira.requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("garde les réglages locaux d'un board déjà enregistré", async () => {
    const existing = makeConfiguration({
      boardId: 7,
      hiddenGoalIds: ["g9"],
      blockOrder: ["build"],
      buildSectionLabel: "Hors objectif",
    });
    const jira = discoveryJira();
    const config = await detectBoard(readerFor(jira), BOARD_URL, existing);
    expect(config.boardName).toBe("Board de test");
    expect(config.hiddenGoalIds).toEqual(["g9"]);
    expect(config.blockOrder).toEqual(["build"]);
    expect(config.buildSectionLabel).toBe("Hors objectif");
    expect(config.issueTypes).toEqual(expect.arrayContaining([...existing.issueTypes]));
    expect(config.ticketSwimlanes).toEqual(existing.ticketSwimlanes);
    expect(jira.sent("GET", "/rest/agile/1.0/board/7/issue")).toEqual([]);
  });

  it.each([
    { boardId: 8, siteOrigin: ACME.origin },
    { boardId: 7, siteOrigin: "https://autre.atlassian.net" },
  ])("ne reprend pas les types d'un autre board ou site : %j", async (identity) => {
    const config = await detectBoard(
      readerFor(discoveryJira()),
      BOARD_URL,
      makeConfiguration({ ...identity, buildSectionLabel: "Autre board" }),
    );
    expect(config.issueTypes).toEqual([]);
    expect(config.ticketSwimlanes).toEqual([]);
    expect(config.buildSectionLabel).toBe("Build");
  });

  it("la relecture explicite des types Kanban respecte le sous-filtre", async () => {
    const query = "fixVersion in unreleasedVersions() OR fixVersion is EMPTY";
    const jira = discoveryJira()
      .on("GET", "/rest/agile/1.0/board/7", {
        status: 200,
        json: { id: 7, name: "Flux", type: "kanban" },
      })
      .on("GET", "/rest/agile/1.0/board/7/configuration", {
        status: 200,
        json: {
          columnConfig: { columns: [{ name: "En cours", statuses: [{ id: "3" }] }] },
          subQuery: { query },
        },
      });
    const config = await refreshBoardStructure(readerFor(jira), 7, null);
    expect(config.boardType).toBe("kanban");
    expect(config.kanbanSubQuery).toBe(query);
    expect(jira.sent("GET", "/rest/agile/1.0/board/7/issue")[0]?.url.searchParams.get("jql")).toBe(
      query,
    );
  });

  it("statuts ou champs illisibles : la configuration est dégradée, pas refusée", async () => {
    const jira = discoveryJira()
      .on("GET", "/rest/api/3/status", { status: 403, json: {} })
      .on("GET", "/rest/api/3/field", { status: 500 });
    const config = await detectBoard(readerFor(jira), BOARD_URL, null);
    expect(config.columns.every((c) => !c.isDone)).toBe(true);
    expect(config.goalsFieldId).toBeNull();
    expect(config.estimationFieldId).toBe("customfield_10016");
  });

  it("mesure la découverte et ses replis sans changer les données ni les lectures", async () => {
    const unavailableFields = () =>
      discoveryJira()
        .on("GET", "/rest/api/3/status", { status: 403, json: {} })
        .on("GET", "/rest/api/3/field", { status: 500 });
    const plainJira = unavailableFields();
    const tracedJira = unavailableFields();
    const { trace, completed } = recordingTrace();
    const expected = await detectBoard(readerFor(plainJira), BOARD_URL, null);
    const actual = await detectBoard(readerFor(tracedJira), BOARD_URL, null, trace);

    expect(actual).toEqual(expected);
    expect(tracedJira.requests.map((request) => request.url.href)).toEqual(
      plainJira.requests.map((request) => request.url.href),
    );
    expect(completed.map(({ phase, error }) => [phase, error !== null])).toEqual([
      ["structure", false],
      ["statuses", true],
      ["fields", true],
    ]);
  });
});

describe("loadSnapshot", () => {
  it("sans sprint actif : board vide, et rien d'autre n'est lu", async () => {
    const jira = boardJira({ sprints: [] });
    const result = await sync(jira);

    expect(result.snapshot.sprint).toBeNull();
    expect(result.snapshot.goalIssues).toEqual([]);
    expect(result.discoveredIssueTypes).toEqual([]);
    expect(jira.requests).toHaveLength(1);
  });

  it("mode texte : objectifs du champ goal, liens de la propriété de sprint", async () => {
    const jira = boardJira({
      sprints: [sprintJson(42, { goal: "🎯 Paiement\n- Stabilité" })],
      issues: { 42: [issueJson("ABC-1"), issueJson("ABC-2")] },
      property: {
        status: 200,
        json: {
          value: {
            version: 1,
            goals: [{ id: "g1", title: "Paiement", color: "goal1", position: 0 }],
            links: { "ABC-1": "g1", "ABC-9": "disparu" },
          },
        },
      },
    });
    const { snapshot, document, goalsIssue } = await sync(jira);

    expect(snapshot.goals.map((g) => g.title)).toEqual(["Paiement", "Stabilité"]);
    expect(snapshot.goals[0]?.id).toBe("g1");
    expect(snapshot.goalIssues.map((i) => [i.issue.key, i.goalId])).toEqual([
      ["ABC-1", "g1"],
      ["ABC-2", null],
    ]);
    expect(document?.links).toEqual({ "ABC-1": "g1", "ABC-9": "disparu" });
    expect(goalsIssue).toBeNull();
    expect(snapshot.syncedAt).toEqual(NOW);
  });

  it("sépare tickets par objectif et swimlanes par type, écarte les types ignorés", async () => {
    const configuration = makeConfiguration({
      issueTypes: [
        ...makeConfiguration().issueTypes,
        { id: "10099", name: "Epic", iconUrl: null, category: "IGNORED" },
      ],
    });
    const jira = boardJira({
      issues: {
        42: [
          issueJson("ABC-1"),
          issueJson("RUN-1", { typeId: "10004", typeName: "Anomalie Prod" }),
          issueJson("EPIC-1", { typeId: "10099", typeName: "Epic" }),
        ],
      },
    });
    const { snapshot, discoveredIssueTypes } = await sync(jira, configuration);

    expect(snapshot.goalIssues.map((i) => i.issue.key)).toEqual(["ABC-1"]);
    expect(snapshot.swimlaneIssues.map((i) => i.issue.key)).toEqual(["RUN-1"]);
    expect(snapshot.swimlaneIssues[0]?.columnId).toBe("prog");
    expect(snapshot.swimlaneIssues[0]?.swimlaneId).toBe("1");
    expect(discoveredIssueTypes.map((type) => type.id)).toContain("10099");
  });

  it("texte : l'objectif prime sur le type, conserve le rang Jira et la destination des sous-tâches", async () => {
    const subtask = (key: string, parent: string) =>
      issueJson(key, {
        parent,
        extraFields: { issuetype: { id: "custom-sub", name: "Analyse", subtask: true } },
      });
    const jira = boardJira({
      sprints: [sprintJson(42, { goal: "Paiement\nStabilité" })],
      issues: {
        42: [
          issueJson("RUN-1", { typeId: "10004", category: "done", statusId: "6", points: 3 }),
          subtask("RUN-2", "RUN-1"),
          issueJson("ABC-1"),
          subtask("RUN-3", "RUN-1"),
          issueJson("RUN-4", { typeId: "10004" }),
          issueJson("EPIC-1", { typeId: "10099" }),
          subtask("EPIC-2", "EPIC-1"),
        ],
      },
      property: {
        status: 200,
        json: {
          value: {
            version: 1,
            goals: [
              { id: "g1", title: "Paiement", color: "goal1", position: 0 },
              { id: "g2", title: "Stabilité", color: "goal2", position: 1 },
            ],
            links: { "RUN-1": "g1", "ABC-1": "g1", "RUN-3": "g2", "EPIC-1": "g1" },
          },
        },
      },
    });
    const configuration = makeConfiguration({
      issueTypes: [
        ...makeConfiguration().issueTypes,
        { id: "10099", name: "Epic", iconUrl: null, category: "IGNORED" },
      ],
    });
    const { snapshot } = await sync(jira, configuration);
    expect(
      snapshot.goalIssues.map((issue) => [issue.issue.key, issue.goalId, issue.swimlaneId]),
    ).toEqual([
      ["RUN-1", "g1", "1"],
      ["RUN-2", "g1", "1"],
      ["ABC-1", "g1", null],
      ["RUN-3", "g2", "1"],
    ]);
    expect(snapshot.swimlaneIssues.map((issue) => [issue.issue.key, issue.goalId])).toEqual([
      ["RUN-4", null],
    ]);
    expect(snapshot.issueOrder?.slice(0, 5)).toEqual(["RUN-1", "RUN-2", "ABC-1", "RUN-3", "RUN-4"]);
    expect(snapshotGoalProgress(snapshot).map((goal) => [goal.total, goal.done])).toEqual([
      [3, 1],
      [1, 0],
    ]);
    expect(sprintMetrics(snapshot, 3)).toMatchObject({
      totalIssues: 4,
      totalPoints: 3,
      donePoints: 3,
      swimlaneCount: 1,
      withoutGoalCount: 0,
    });
  });

  it("complète les types avant les Goals et classe immédiatement un nouveau parent Incident", async () => {
    const jira = boardJira({
      issues: {
        42: [
          issueJson("ABC-1"),
          issueJson("RUN-1", { typeId: "incident", typeName: "Incident" }),
          issueJson("RUN-2", {
            parent: "RUN-1",
            extraFields: { issuetype: { id: "sub", name: "Sous-tâche", subtask: true } },
          }),
        ],
      },
    });
    const configuration = makeConfiguration({ goalSource: "atlassianGoals" });
    const result = await sync(jira, configuration, {
      load: async ({ configuration: enriched }) => {
        expect(enriched.issueTypes.find((type) => type.id === "incident")?.category).toBe(
          "SWIMLANE",
        );
        expect(enriched.issueTypes.find((type) => type.id === "10004")?.category).toBe("SWIMLANE");
        expect(enriched.issueTypes.some((type) => type.id === "sub")).toBe(false);
        expect(enriched.ticketSwimlanes[0]?.typeIds).toEqual(["10004", "incident"]);
        return { goals: [], links: {} };
      },
    });

    expect(result.snapshot.goalIssues.map((issue) => issue.issue.key)).toEqual(["ABC-1"]);
    expect(
      result.snapshot.swimlaneIssues.map((issue) => [issue.issue.key, issue.swimlaneId]),
    ).toEqual([
      ["RUN-1", "1"],
      ["RUN-2", "1"],
    ]);
    expect(result.discoveredIssueTypes.map((type) => type.id)).toEqual([
      "10001",
      "incident",
      "sub",
    ]);
    expect(jira.sent("GET", "/rest/agile/1.0/board/1/issue")).toEqual([]);
  });

  it("réunit les sprints actifs ; un ticket présent dans deux sprints n'apparaît qu'une fois", async () => {
    const jira = boardJira({
      sprints: [
        sprintJson(43, { startDate: "2026-09-14T09:00:00.000+0200" }),
        sprintJson(42),
        { ...sprintJson(41), state: "closed" },
      ],
      issues: {
        42: [issueJson("ABC-1"), issueJson("ABC-2")],
        43: [issueJson("ABC-2"), issueJson("ABC-3")],
      },
    });
    const { snapshot } = await sync(jira);

    expect(snapshot.activeSprints.map((s) => s.id)).toEqual([42, 43]);
    expect(snapshot.sprint?.id).toBe(42);
    expect(snapshot.goalIssues.map((i) => i.issue.key)).toEqual(["ABC-1", "ABC-2", "ABC-3"]);
    expect(jira.sent("GET", "/rest/agile/1.0/board/1/sprint/41/issue")).toEqual([]);
  });

  describe("plusieurs sprints actifs", () => {
    it("un sprint d'un autre board passe après ceux du board, sans objectifs ni propriété lus", async () => {
      const jira = boardJira({
        sprints: [
          sprintJson(40, {
            originBoardId: 99,
            startDate: "2026-09-01T09:00:00.000+0200",
            goal: "Objectif d'une autre équipe",
          }),
          sprintJson(42, { originBoardId: 1, goal: "Notre objectif" }),
        ],
        issues: { 40: [issueJson("ABC-2"), issueJson("ABC-3")], 42: [issueJson("ABC-2")] },
      });
      const { snapshot } = await sync(jira);

      expect(snapshot.activeSprints.map((s) => s.id)).toEqual([42, 40]);
      expect(snapshot.sprint?.id).toBe(42);
      expect(snapshot.goals.map((goal) => goal.title)).toEqual(["Notre objectif"]);
      // Présent dans les deux sprints : rattaché au sprint du board.
      const sprintOf = (key: string) =>
        [...snapshot.goalIssues, ...snapshot.swimlaneIssues].find((i) => i.issue.key === key)
          ?.sprintId;
      expect(sprintOf("ABC-2")).toBe(42);
      expect(sprintOf("ABC-3")).toBe(40);
      expect(jira.sent("GET", GOALS_PROPERTY(40))).toEqual([]);
    });

    it("réunit les objectifs des sprints du board ; un lien peut viser l'autre sprint", async () => {
      const jira = boardJira({
        sprints: [
          sprintJson(42, { goal: "Paiement\nRecherche" }),
          sprintJson(43, { startDate: "2026-09-14T09:00:00.000+0200", goal: "Pixel" }),
        ],
        issues: { 42: [issueJson("ABC-1"), issueJson("ABC-3")], 43: [issueJson("ABC-2")] },
      })
        .on("GET", GOALS_PROPERTY(42), {
          status: 200,
          json: { value: { version: 1, goals: [{ id: "g-pay", title: "Paiement" }], links: {} } },
        })
        .on("GET", GOALS_PROPERTY(43), { status: 404 });
      const first = (await sync(jira)).snapshot;
      const pixel = first.goals.find((goal) => goal.title === "Pixel");
      expect(first.goals.map((goal) => [goal.title, goal.position])).toEqual([
        ["Paiement", 0],
        ["Recherche", 1],
        ["Pixel", 2],
      ]);
      expect(first.goalSprintIds).toEqual([42, 43]);
      expect(first.goalSprintOf?.["g-pay"]).toBe(42);
      expect(pixel && first.goalSprintOf?.[pixel.id]).toBe(43);

      // Objectif encore inconnu de sa propriété : même identifiant d'une lecture à l'autre, et un
      // ticket de l'autre sprint peut s'y rattacher.
      jira.on("GET", GOALS_PROPERTY(42), {
        status: 200,
        json: {
          value: {
            version: 1,
            goals: [{ id: "g-pay", title: "Paiement" }],
            links: { "ABC-1": pixel?.id, "ABC-2": "g-pay" },
          },
        },
      });
      const second = (await sync(jira)).snapshot;
      expect(second.goals.find((goal) => goal.title === "Pixel")?.id).toBe(pixel?.id);
      const goalOf = (key: string) => second.goalIssues.find((i) => i.issue.key === key)?.goalId;
      expect(goalOf("ABC-1")).toBe(pixel?.id);
      expect(goalOf("ABC-2")).toBe("g-pay");
      // Liens bruts de chaque sprint, sous son propre id : base du contrôle de conflit.
      expect(first.storedTextLinks).toEqual({ 42: {}, 43: {} });
      expect(second.storedTextLinks).toEqual({
        42: { "ABC-1": pixel?.id, "ABC-2": "g-pay" },
        43: {},
      });
    });

    it("liens bruts : un sprint dont la propriété n'a pas pu être lue est absent", async () => {
      const jira = boardJira({
        sprints: [
          sprintJson(42, { goal: "Paiement" }),
          sprintJson(43, { startDate: "2026-09-14T09:00:00.000+0200", goal: "Pixel" }),
        ],
        issues: { 42: [issueJson("ABC-1")], 43: [issueJson("ABC-2")] },
      })
        .on("GET", GOALS_PROPERTY(42), {
          status: 200,
          json: { value: { version: 1, goals: [], links: { "ABC-1": "g-x" } } },
        })
        .on("GET", GOALS_PROPERTY(43), { status: 500, json: {} });
      const { snapshot } = await sync(jira);
      expect(snapshot.storedTextLinks).toEqual({ 42: { "ABC-1": "g-x" } });
      expect(snapshot.goalsReadOnly).toBe(false);
    });

    it("pour un ticket noté dans deux propriétés, celle de son propre sprint fait foi", async () => {
      const property = (links: Record<string, string>) => ({
        status: 200,
        json: { value: { version: 1, goals: [], links } },
      });
      const jira = boardJira({
        sprints: [
          sprintJson(42, { goal: "A" }),
          sprintJson(43, { startDate: "2026-09-14T09:00:00.000+0200", goal: "B" }),
        ],
        issues: { 42: [issueJson("ABC-1")], 43: [issueJson("ABC-2")] },
      });
      const ids = (await sync(jira)).snapshot.goals.map((goal) => goal.id);
      const [goalA, goalB] = ids as [string, string];
      jira
        .on("GET", GOALS_PROPERTY(42), property({ "ABC-2": goalA }))
        .on("GET", GOALS_PROPERTY(43), property({ "ABC-2": goalB }));
      const { snapshot } = await sync(jira);
      expect(snapshot.goalIssues.find((i) => i.issue.key === "ABC-2")?.goalId).toBe(goalB);
    });
  });

  it("ne lit que les tickets du sprint retenus par le board, par l'adresse du board", async () => {
    const jira = boardJira({ issues: { 42: [issueJson("ABC-1")] } });
    await sync(jira);
    expect(jira.sent("GET", "/rest/agile/1.0/board/1/sprint/42/issue")).toHaveLength(1);
    // L'adresse du sprint seul ramènerait aussi les tickets des autres boards de ce sprint.
    expect(
      jira.requests.filter((r) => /^\/rest\/agile\/1\.0\/sprint\/\d+\/issue/.test(r.url.pathname)),
    ).toEqual([]);
  });

  it("un sprint actif sans ticket du board (celui d'un autre board) n'est pas affiché", async () => {
    const jira = boardJira({
      sprints: [sprintJson(40, { startDate: "2026-09-01T09:00:00.000+0200" }), sprintJson(42)],
      issues: { 40: [], 42: [issueJson("ABC-1")] },
    });
    const { snapshot } = await sync(jira);
    expect(snapshot.activeSprints.map((s) => s.id)).toEqual([42]);
    // L'épinglage des Goals se lit (et s'écrira) sur le sprint du board, pas sur l'autre.
    expect(snapshot.sprint?.id).toBe(42);
    expect(jira.sent("GET", GOALS_PROPERTY(40))).toEqual([]);
    expect(jira.sent("GET", GOALS_PROPERTY(42))).toHaveLength(1);
  });

  it("sprint qui démarre sans ticket : il reste affiché, le premier seulement", async () => {
    const jira = boardJira({
      sprints: [sprintJson(42), sprintJson(43, { startDate: "2026-09-14T09:00:00.000+0200" })],
    });
    const { snapshot } = await sync(jira);
    expect(snapshot.activeSprints.map((s) => s.id)).toEqual([42]);
    expect(snapshot.goalIssues).toEqual([]);
  });

  it("date chaque ticket par rapport à SON sprint", async () => {
    const addedOn = (date: string, sprintName: string) => ({
      histories: [
        { created: date, items: [{ field: "Sprint", fromString: null, toString: sprintName }] },
      ],
    });
    const jira = boardJira({
      sprints: [sprintJson(42), sprintJson(43, { startDate: "2026-09-16T09:00:00.000+0200" })],
      issues: {
        42: [
          issueJson("ABC-1", { changelog: addedOn("2026-09-15T10:00:00.000+0200", "Sprint 42") }),
        ],
        43: [
          issueJson("ABC-2", { changelog: addedOn("2026-09-15T10:00:00.000+0200", "Sprint 43") }),
        ],
      },
    });
    const { snapshot } = await sync(jira);

    expect(snapshot.goalIssues.map((i) => [i.issue.key, i.addedAfterSprintStart])).toEqual([
      ["ABC-1", true],
      ["ABC-2", false],
    ]);
  });

  it("demande à Jira les champs Goals, drapeau et champs de carte choisis", async () => {
    const configuration = makeConfiguration({
      goalsFieldId: "customfield_10100",
      flaggedFieldId: "customfield_10021",
      cardFields: [{ kind: "fixVersions" }, { kind: "labels" }],
    });
    const jira = boardJira({});
    await sync(jira, configuration);

    const params = jira.sent("GET", "/rest/agile/1.0/board/1/sprint/42/issue")[0]?.url.searchParams;
    expect(params?.get("expand")).toBe("changelog");
    expect(params?.get("fields")?.split(",")).toEqual(
      expect.arrayContaining([
        "customfield_10016",
        "customfield_10100",
        "customfield_10021",
        "fixVersions",
      ]),
    );
  });

  it("couleurs des objectifs : attribuées localement et conservées", async () => {
    const jira = boardJira({ sprints: [sprintJson(42, { goal: "A\nB" })] });
    const first = await sync(jira);
    const [a, b] = first.snapshot.goals;
    expect([a?.color, b?.color]).toEqual(["goal1", "goal2"]);

    // Au sprint suivant, l'objectif B garde sa couleur parce que son identifiant est connu.
    const kept = makeConfiguration({ goalColorIndex: { [b?.id ?? ""]: 5 } });
    const property: Reply = {
      status: 200,
      json: { value: { goals: [{ id: b?.id, title: "B", position: 0 }] } },
    };
    const second = await sync(
      boardJira({ sprints: [sprintJson(42, { goal: "B" })], property }),
      kept,
    );
    expect(second.snapshot.goals[0]?.color).toBe("goal6");
    expect(second.goalColorIndex[b?.id ?? ""]).toBe(5);
  });

  it("propriété de sprint refusée : objectifs en lecture seule, board affiché quand même", async () => {
    const jira = boardJira({
      sprints: [sprintJson(42, { goal: "Paiement" })],
      issues: { 42: [issueJson("ABC-1")] },
      property: { status: 403, json: {} },
    });
    const { snapshot, document } = await sync(jira);

    expect(snapshot.goalsReadOnly).toBe(true);
    expect(snapshot.pinnedGoalIds).toBeNull();
    expect(document).toBeNull();
    expect(snapshot.goals.map((g) => g.title)).toEqual(["Paiement"]);
    expect(snapshot.goalIssues).toHaveLength(1);
  });

  it("Goals épinglés : lus dans la propriété, vides si elle n'existe pas, inconnus si illisible", async () => {
    const withProperty = (property: Reply) =>
      sync(
        boardJira({
          sprints: [sprintJson(42, { goal: "Paiement" })],
          issues: { 42: [issueJson("ABC-1")] },
          property,
        }),
      );

    const pinned = await withProperty({
      status: 200,
      json: { value: { atlassianGoalIds: ["ari:goal/1", "ari:goal/2"] } },
    });
    expect(pinned.snapshot.pinnedGoalIds).toEqual(["ari:goal/1", "ari:goal/2"]);

    const absent = await withProperty({ status: 404 });
    expect(absent.snapshot.pinnedGoalIds).toEqual([]);

    // Une erreur de lecture n'est pas une sélection vide : l'épinglage n'est alors pas modifiable.
    const unreadable = await withProperty({ status: 400, json: { errorMessages: ["Refus"] } });
    expect(unreadable.snapshot.pinnedGoalIds).toBeNull();
    expect(unreadable.snapshot.goalsReadOnly).toBe(false);
  });

  describe("source « Goals Atlassian »", () => {
    const configuration = makeConfiguration({ goalSource: "atlassianGoals" });
    const jiraWithPins = () =>
      boardJira({
        sprints: [sprintJson(42, { goal: "Texte du sprint" })],
        issues: { 42: [issueJson("ABC-1")] },
        property: { status: 200, json: { value: { atlassianGoalIds: ["ari:goal/1"] } } },
      });

    it("confie au lecteur de Goals les épinglages et les tickets du sprint", async () => {
      const calls: unknown[] = [];
      const loader: AtlassianGoalsLoader = {
        load: async (input) => {
          calls.push([input.pinnedGoalIds, input.issues.map((i) => i.key)]);
          return {
            goals: [makeSprintGoal({ id: "ari:goal/1", title: "Goal réel", position: 0 })],
            links: { "ABC-1": "ari:goal/1" },
          };
        },
      };
      const { snapshot, goalsIssue } = await sync(jiraWithPins(), configuration, loader);

      expect(calls).toEqual([[["ari:goal/1"], ["ABC-1"]]]);
      expect(snapshot.goals.map((g) => g.title)).toEqual(["Goal réel"]);
      expect(snapshot.goalIssues[0]?.goalId).toBe("ari:goal/1");
      expect(goalsIssue).toBeNull();
    });

    it("lecture des Goals en échec : repli sur le texte du sprint, cause conservée", async () => {
      const loader: AtlassianGoalsLoader = {
        load: async () => {
          throw new Error("La passerelle a répondu 403.");
        },
      };
      const { snapshot, goalsIssue } = await sync(jiraWithPins(), configuration, loader);

      expect(snapshot.goals.map((g) => g.title)).toEqual(["Texte du sprint"]);
      expect(goalsIssue).toBe("La passerelle a répondu 403.");
    });

    it("sans lecteur de Goals : même repli, et il est signalé", async () => {
      const { snapshot, goalsIssue } = await sync(jiraWithPins(), configuration, null);
      expect(snapshot.goals.map((g) => g.title)).toEqual(["Texte du sprint"]);
      expect(goalsIssue).not.toBeNull();
    });
  });

  it("une synchronisation ne fait que lire", async () => {
    const jira = boardJira({
      sprints: [sprintJson(42, { goal: "Nouveau dans Jira" })],
      issues: { 42: [issueJson("ABC-1")] },
    });
    await sync(jira);
    // Même quand la propriété de sprint ne correspond plus au texte, rien n'est réécrit.
    expect(jira.requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("une erreur de lecture des tickets remonte telle quelle", async () => {
    const jira = boardJira({}).on("GET", "/rest/agile/1.0/board/1/sprint/42/issue", {
      status: 401,
    });
    await expect(sync(jira)).rejects.toMatchObject({ info: { kind: "unauthorized" } });
  });
});

describe("phases de chargement", () => {
  const configuration = makeConfiguration({ goalSource: "atlassianGoals" });
  const loader: AtlassianGoalsLoader = {
    load: async () => ({
      goals: [makeSprintGoal({ id: "g1", title: "Objectif", position: 0 })],
      links: { "ABC-1": "g1" },
    }),
  };

  it("mesure les tickets de chaque sprint, les objectifs et l'assemblage sans changer le résultat", async () => {
    const jira = () =>
      boardJira({
        sprints: [sprintJson(42), sprintJson(43)],
        issues: { 42: [issueJson("ABC-1")], 43: [issueJson("ABC-2")] },
      });
    const { trace, completed } = recordingTrace();
    const expected = await sync(jira(), configuration, loader);
    const actual = await sync(jira(), configuration, loader, trace);

    expect(actual).toEqual(expected);
    expect(completed).toEqual(
      // Une lecture de propriété par sprint du board réuni.
      [
        "sprints",
        "issues",
        "issues",
        "types",
        "goalSettings",
        "goalSettings",
        "goals",
        "assemble",
      ].map((phase) => ({
        phase,
        error: null,
      })),
    );
  });

  it("termine l'assemblage d'un board sans sprint, sans inventer de lectures", async () => {
    const { trace, completed } = recordingTrace();
    const jira = boardJira({ sprints: [] });
    const actual = await sync(jira, configuration, loader, trace);

    expect(actual.snapshot.sprint).toBeNull();
    expect(completed.map(({ phase }) => phase)).toEqual(["sprints", "assemble"]);
    expect(jira.requests).toHaveLength(1);
  });

  it("garde visibles les échecs récupérés de propriété et de Goals avant le repli texte", async () => {
    const { trace, completed } = recordingTrace();
    const failure = new Error("Objectifs temporairement indisponibles");
    const result = await sync(
      boardJira({
        sprints: [sprintJson(42, { goal: "Texte de repli" })],
        property: { status: 403 },
      }),
      configuration,
      { load: async () => Promise.reject(failure) },
      trace,
    );

    expect(result.snapshot.goals[0]?.title).toBe("Texte de repli");
    expect(result.snapshot.goalsReadOnly).toBe(true);
    expect(result.goalsIssue).toBe(failure.message);
    expect(completed.map(({ phase, error }) => [phase, error !== null])).toEqual([
      ["sprints", false],
      ["issues", false],
      ["types", false],
      ["goalSettings", true],
      ["goals", true],
      ["goals", false],
      ["assemble", false],
    ]);
    expect(completed[4]?.error).toBe(failure);
  });

  it("conserve l'erreur des tickets et n'annonce aucune phase ultérieure", async () => {
    const { trace, completed } = recordingTrace();
    const jira = boardJira({}).on("GET", "/rest/agile/1.0/board/1/sprint/42/issue", {
      status: 401,
    });
    const failure = await sync(jira, configuration, loader, trace).catch((error: unknown) => error);

    expect(failure).toMatchObject({ info: { kind: "unauthorized" } });
    expect(completed.map(({ phase }) => phase)).toEqual(["sprints", "issues"]);
    expect(completed[1]?.error).toBe(failure);
  });

  it("englobe toutes les pages Kanban dans les tickets et produit le même board", async () => {
    const jira = () =>
      new FakeJira().on(
        "GET",
        "/rest/agile/1.0/board/1/issue",
        { status: 200, json: { issues: [issueJson("ABC-1")], total: 2 } },
        { status: 200, json: { issues: [issueJson("ABC-2")], total: 2 } },
      );
    const kanban = makeConfiguration({ boardType: "kanban" });
    const tracedJira = jira();
    const { trace, completed } = recordingTrace();
    const expected = await sync(jira(), kanban, loader);
    const actual = await sync(tracedJira, kanban, loader, trace);

    expect(actual).toEqual(expected);
    expect(completed).toEqual(
      ["issues", "types", "goals", "assemble"].map((phase) => ({ phase, error: null })),
    );
    expect(tracedJira.requests).toHaveLength(2);
  });

  it("conserve la perte de session Kanban après la mesure des Goals en échec", async () => {
    const { trace, completed } = recordingTrace();
    const failure = new JiraError({ kind: "unauthorized" });
    const jira = new FakeJira().on("GET", "/rest/agile/1.0/board/1/issue", {
      status: 200,
      json: { issues: [], total: 0 },
    });
    await expect(
      sync(
        jira,
        makeConfiguration({ boardType: "kanban" }),
        { load: async () => Promise.reject(failure) },
        trace,
      ),
    ).rejects.toBe(failure);
    expect(completed).toEqual([
      { phase: "issues", error: null },
      { phase: "types", error: null },
      { phase: "goals", error: failure },
    ]);
  });
});
