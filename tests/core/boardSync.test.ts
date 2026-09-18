import { describe, expect, it } from "vitest";
import type { BoardConfiguration } from "../../src/core/boardConfiguration";
import {
  type AtlassianGoalsLoader,
  BoardSetupError,
  detectBoard,
  loadSnapshot,
} from "../../src/core/boardSync";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
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
    jira.on("GET", `/rest/agile/1.0/sprint/${sprint.id}/issue`, {
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
) {
  return loadSnapshot({
    reader: readerFor(jira),
    configuration,
    currentUser: null,
    goalsLoader,
    now: NOW,
  });
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

  it("lit colonnes, types et champs dans Jira", async () => {
    const jira = discoveryJira();
    const config = await detectBoard(readerFor(jira), BOARD_URL, null);

    expect(config.boardId).toBe(7);
    expect(config.siteOrigin).toBe("https://acme.atlassian.net");
    expect(config.scrumColumns.map((c) => [c.name, c.isDone])).toEqual([
      ["À faire", false],
      ["Terminé", true],
    ]);
    expect(config.issueTypes.map((t) => [t.name, t.category])).toEqual([
      ["Anomalie Prod", "RUN"],
      ["Story", "SCRUM"],
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
    const config = await detectBoard(readerFor(discoveryJira()), BOARD_URL, existing);
    expect(config.boardName).toBe("Board de test");
    expect(config.hiddenGoalIds).toEqual(["g9"]);
    expect(config.blockOrder).toEqual(["build"]);
    expect(config.buildSectionLabel).toBe("Hors objectif");
  });

  it("statuts ou champs illisibles : la configuration est dégradée, pas refusée", async () => {
    const jira = discoveryJira()
      .on("GET", "/rest/api/3/status", { status: 403, json: {} })
      .on("GET", "/rest/api/3/field", { status: 500 });
    const config = await detectBoard(readerFor(jira), BOARD_URL, null);
    expect(config.scrumColumns.every((c) => !c.isDone)).toBe(true);
    expect(config.goalsFieldId).toBeNull();
    expect(config.estimationFieldId).toBe("customfield_10016");
  });
});

describe("loadSnapshot", () => {
  it("sans sprint actif : board vide, et rien d'autre n'est lu", async () => {
    const jira = boardJira({ sprints: [] });
    const result = await sync(jira);

    expect(result.snapshot.sprint).toBeNull();
    expect(result.snapshot.scrumIssues).toEqual([]);
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
    expect(snapshot.scrumIssues.map((i) => [i.issue.key, i.goalId])).toEqual([
      ["ABC-1", "g1"],
      ["ABC-2", null],
    ]);
    expect(document?.links).toEqual({ "ABC-1": "g1", "ABC-9": "disparu" });
    expect(goalsIssue).toBeNull();
    expect(snapshot.syncedAt).toEqual(NOW);
  });

  it("sépare Scrum et RUN, écarte les types ignorés", async () => {
    const configuration = makeConfiguration({
      runColumns: makeConfiguration().scrumColumns,
      issueTypes: [
        ...makeConfiguration().issueTypes,
        { id: "10099", name: "Epic", iconUrl: null, category: "IGNORED", countsAsBug: null },
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
    const { snapshot } = await sync(jira, configuration);

    expect(snapshot.scrumIssues.map((i) => i.issue.key)).toEqual(["ABC-1"]);
    expect(snapshot.runIssues.map((i) => i.issue.key)).toEqual(["RUN-1"]);
    expect(snapshot.runIssues[0]?.columnId).toBe("prog");
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
    expect(snapshot.scrumIssues.map((i) => i.issue.key)).toEqual(["ABC-1", "ABC-2", "ABC-3"]);
    expect(jira.sent("GET", "/rest/agile/1.0/sprint/41/issue")).toEqual([]);
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

    expect(snapshot.scrumIssues.map((i) => [i.issue.key, i.addedAfterSprintStart])).toEqual([
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

    const params = jira.sent("GET", "/rest/agile/1.0/sprint/42/issue")[0]?.url.searchParams;
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
    expect(document).toBeNull();
    expect(snapshot.goals.map((g) => g.title)).toEqual(["Paiement"]);
    expect(snapshot.scrumIssues).toHaveLength(1);
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
      expect(snapshot.scrumIssues[0]?.goalId).toBe("ari:goal/1");
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
    const jira = boardJira({}).on("GET", "/rest/agile/1.0/sprint/42/issue", { status: 401 });
    await expect(sync(jira)).rejects.toMatchObject({ info: { kind: "unauthorized" } });
  });
});
