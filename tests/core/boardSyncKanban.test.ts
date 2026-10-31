import { describe, expect, it } from "vitest";
import { buildBoardLayout } from "../../src/core/boardLayout";
import { type AtlassianGoalsLoader, loadSnapshot } from "../../src/core/boardSync";
import { NO_FILTERS } from "../../src/core/filters";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
import { JiraError } from "../../src/jira/errors";
import { JiraTransport } from "../../src/jira/transport";
import { ACME, FakeJira } from "../support/fakeJira";
import { issueJson, makeConfiguration, STORY_TYPE, SWIMLANE_TYPE } from "../support/jiraFixtures";
import { rejectionText } from "../support/messages";

const PATH = "/rest/agile/1.0/board/1/issue";
const NOW = new Date("2026-10-01T10:00:00Z");
const noGoals: AtlassianGoalsLoader = { load: async () => ({ goals: [], links: {} }) };

function sync(
  jira: FakeJira,
  configuration = makeConfiguration({ boardType: "kanban" }),
  goalsLoader: AtlassianGoalsLoader | null = noGoals,
) {
  return loadSnapshot({
    reader: new JiraClient(new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 })),
    configuration,
    goalsLoader,
    currentUser: null,
    now: NOW,
  });
}

describe("photographie Kanban", () => {
  it("découvre les types avec les tickets, avant les Goals et sans second parcours du board", async () => {
    const jira = new FakeJira().on("GET", PATH, {
      status: 200,
      json: {
        total: 2,
        issues: [
          issueJson("ABC-1"),
          issueJson("RUN-1", { typeId: "incident", typeName: "Incident" }),
        ],
      },
    });
    const result = await sync(
      jira,
      makeConfiguration({ boardType: "kanban", issueTypes: [], ticketSwimlanes: [] }),
      {
        load: async ({ configuration }) => {
          expect(configuration.issueTypes.map((type) => [type.id, type.category])).toEqual([
            ["incident", "SWIMLANE"],
            ["10001", "GOAL"],
          ]);
          return { goals: [], links: {} };
        },
      },
    );

    expect(result.snapshot.goalIssues.map((issue) => issue.issue.key)).toEqual(["ABC-1"]);
    expect(result.snapshot.swimlaneIssues.map((issue) => issue.issue.key)).toEqual(["RUN-1"]);
    expect(result.discoveredIssueTypes.map((type) => type.id)).toEqual(["10001", "incident"]);
    expect(jira.sent("GET", PATH)).toHaveLength(1);
  });

  it("board vide : aucune lecture ni faux objet sprint, Goals épinglés conservés", async () => {
    const jira = new FakeJira().on("GET", PATH, { status: 200, json: { issues: [], total: 0 } });
    const result = await sync(
      jira,
      makeConfiguration({
        boardType: "kanban",
        boardPinnedGoalIds: ["g1"],
        localPinnedGoalIds: { "42": ["ancien"] },
      }),
      {
        load: async (input) => {
          expect(input.pinnedGoalIds).toEqual(["g1"]);
          expect(input.issues).toEqual([]);
          return {
            goals: [makeSprintGoal({ id: "g1", title: "Objectif continu", position: 0 })],
            links: {},
          };
        },
      },
    );
    expect(result.snapshot).toMatchObject({
      sprint: null,
      activeSprints: [],
      goalIssues: [],
      swimlaneIssues: [],
      pinnedGoalIds: ["g1"],
      localPinnedGoalIds: null,
      goalsOrigin: "atlassianGoals",
    });
    expect(result.snapshot.goals[0]?.title).toBe("Objectif continu");
    expect(result.document).toBeNull();
    expect(jira.requests.map((r) => [r.method, r.path])).toEqual([["GET", PATH]]);
  });

  it("charge toutes les pages avec le sous-filtre Jira et conserve les terminés mappés", async () => {
    const jira = new FakeJira().on(
      "GET",
      PATH,
      { status: 200, json: { issues: [issueJson("ABC-1")], total: 3 } },
      {
        status: 200,
        json: {
          issues: [
            issueJson("ABC-2", { statusId: "6", category: "done" }),
            issueJson("ABC-3", { statusId: "99" }),
          ],
          total: 3,
        },
      },
    );
    const query = "fixVersion in unreleasedVersions() OR fixVersion is EMPTY";
    const configuration = makeConfiguration({
      boardType: "kanban",
      kanbanSubQuery: query,
      goalsFieldId: "customfield_10100",
      flaggedFieldId: "customfield_10021",
      rankFieldId: "customfield_10019",
      cardFields: [{ kind: "fixVersions" }],
    });
    const result = await sync(jira, configuration);
    expect(result.snapshot.goalIssues.map((i) => i.issue.key)).toEqual(["ABC-1", "ABC-2", "ABC-3"]);
    // Le board Jira a acquis un statut depuis la dernière lecture de structure locale.
    // Le ticket reste compté et signalé jusqu'à « Relire la structure », comme en Scrum.
    expect(result.snapshot.goalIssues.find((i) => i.issue.key === "ABC-3")?.columnId).toBeNull();
    expect(buildBoardLayout(result.snapshot, configuration, NO_FILTERS)).toMatchObject({
      totalCount: 3,
      visibleCount: 2,
      unmappedCount: 1,
    });
    expect(
      result.snapshot.goalIssues.every(
        (i) => i.addedAfterSprintStart === null && i.addedToSprintAt === null,
      ),
    ).toBe(true);
    expect(jira.requests.map((r) => r.url.searchParams.get("jql"))).toEqual([query, query]);
    expect(jira.requests.map((r) => r.url.searchParams.get("startAt"))).toEqual(["0", "1"]);
    expect(jira.requests[0]?.url.searchParams.get("fields")?.split(",")).toEqual(
      // Champ de rang du board : ordre de rang Jira pour « top / basse priorité ».
      expect.arrayContaining([
        "customfield_10100",
        "customfield_10021",
        "customfield_10019",
        "fixVersions",
      ]),
    );
    expect(jira.requests[0]?.url.searchParams.get("fields")?.split(",")).not.toContain(
      "closedSprints",
    );
    expect(result.snapshot.goalIssues.every((i) => !i.carriedOver)).toBe(true);
    expect(jira.requests[0]?.url.searchParams.get("expand")).toBe("changelog");
  });

  it("classe objectifs, Build, plusieurs swimlanes et familles, ignore les types exclus", async () => {
    const subtask = (key: string, parent: string) =>
      issueJson(key, {
        parent,
        extraFields: { issuetype: { id: "sub", name: "Sous-tâche", subtask: true } },
      });
    const jira = new FakeJira().on("GET", PATH, {
      status: 200,
      json: {
        total: 8,
        issues: [
          issueJson("ABC-1"),
          issueJson("ABC-2"),
          issueJson("RUN-1", { typeId: SWIMLANE_TYPE.id }),
          subtask("RUN-2", "RUN-1"),
          issueJson("RUN-3", { typeId: SWIMLANE_TYPE.id }),
          issueJson("OPS-1", { typeId: "ops" }),
          subtask("ABC-3", "ABC-1"),
          issueJson("ABC-4", { typeId: "excluded" }),
        ],
      },
    });
    const configuration = makeConfiguration({
      boardType: "kanban",
      boardPinnedGoalIds: ["g1"],
      issueTypes: [
        STORY_TYPE,
        SWIMLANE_TYPE,
        { ...SWIMLANE_TYPE, id: "ops", name: "Service" },
        { ...STORY_TYPE, id: "excluded", category: "IGNORED" },
      ],
      ticketSwimlanes: [
        { id: "1", name: "RUN", typeIds: [SWIMLANE_TYPE.id], hidden: false },
        { id: "2", name: "OPS", typeIds: ["ops"], hidden: false },
      ],
    });
    const result = await sync(jira, configuration, {
      load: async () => ({
        goals: [makeSprintGoal({ id: "g1", title: "Améliorer", position: 0 })],
        links: { "ABC-1": "g1", "RUN-1": "g1", "ABC-4": "g1" },
      }),
    });
    expect(result.snapshot.goalIssues.map((i) => [i.issue.key, i.goalId])).toEqual([
      ["ABC-1", "g1"],
      ["ABC-2", null],
      ["RUN-1", "g1"],
      ["RUN-2", "g1"],
      ["ABC-3", "g1"],
    ]);
    expect(result.snapshot.swimlaneIssues.map((i) => [i.issue.key, i.swimlaneId])).toEqual([
      ["RUN-3", "1"],
      ["OPS-1", "2"],
    ]);
    expect(result.snapshot.issueOrder?.slice(2, 5)).toEqual(["RUN-1", "RUN-2", "RUN-3"]);
    expect(
      result.snapshot.goalIssues
        .filter((issue) => issue.issue.key.startsWith("RUN-"))
        .map((issue) => issue.swimlaneId),
    ).toEqual(["1", "1"]);
  });

  it("Goals indisponibles : échec explicite, aucun classement inventé dans Build", async () => {
    const jira = new FakeJira().on("GET", PATH, {
      status: 200,
      json: { issues: [issueJson("ABC-1")], total: 1 },
    });
    expect(
      await rejectionText(
        sync(jira, makeConfiguration({ boardType: "kanban" }), {
          load: async () => {
            throw new Error("refus GraphQL");
          },
        }),
      ),
    ).toBe("Objectifs du board Kanban indisponibles : refus GraphQL");
    expect(await rejectionText(sync(jira, makeConfiguration({ boardType: "kanban" }), null))).toBe(
      "Lecture des Goals Atlassian indisponible : le board Kanban ne peut pas déterminer ses objectifs.",
    );
    expect(jira.requests.every((r) => r.path === PATH)).toBe(true);
  });

  it("un refus de lecture des tickets n'est pas un board vide", async () => {
    const jira = new FakeJira().on("GET", PATH, { status: 403 });
    await expect(sync(jira)).rejects.toMatchObject({ info: { kind: "forbidden" } });
  });

  it("préserve une perte de session Goals pour déclencher la reconnexion", async () => {
    const jira = new FakeJira().on("GET", PATH, { status: 200, json: { issues: [], total: 0 } });
    const failure = new JiraError({ kind: "unauthorized" });
    await expect(
      sync(jira, makeConfiguration({ boardType: "kanban" }), {
        load: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });
});
