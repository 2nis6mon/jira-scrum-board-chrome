import { afterEach, describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { encodeTeamDocument, teamSettingsOf } from "../../src/core/teamSettings";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { ACME, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway, REAL_GOAL_FIELDS } from "../support/goalsGateway";
import { issueJson, makeConfiguration, STORY_TYPE } from "../support/jiraFixtures";

const BOARD_ISSUES = "/rest/agile/1.0/board/7/issue";
const ACTIVE_ISSUES = "/rest/agile/1.0/board/7/sprint/42/issue";
const PROPERTY = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;
const models: BoardModel[] = [];

afterEach(() => {
  for (const board of models.splice(0)) board.dispose();
});

function model(platform: ReturnType<typeof fakePlatform>) {
  const board = new BoardModel(ACME, platform);
  models.push(board);
  return board;
}

describe("BoardModel — types tirés des tickets affichés", () => {
  it("ouvre et rouvre un Scrum sans parcourir son backlog, avec les catégories dès le premier affichage", async () => {
    const jira = boardSiteJira();
    const platform = fakePlatform(jira);
    const board = model(platform);
    await board.load(BOARD_URL);

    expect(board.syncProblem.value).toBeNull();
    expect(board.snapshot.value?.goalIssues).toHaveLength(5);
    expect(board.snapshot.value?.swimlaneIssues.map((item) => item.issue.key)).toEqual(["RUN-7"]);
    expect(board.configuration.value?.issueTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "10001", category: "GOAL" }),
        expect.objectContaining({ id: "10004", category: "SWIMLANE" }),
      ]),
    );
    expect((await loadActiveBoard(platform.store, ACME.origin))?.issueTypes).toEqual(
      board.configuration.value?.issueTypes,
    );
    board.dispose();

    const reopened = model(platform);
    await reopened.load(BOARD_URL);
    expect(reopened.snapshot.value?.swimlaneIssues.map((item) => item.issue.key)).toEqual([
      "RUN-7",
    ]);
    expect(jira.sent("GET", ACTIVE_ISSUES)).toHaveLength(2);
    expect(jira.sent("GET", BOARD_ISSUES)).toEqual([]);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("mémorise un nouveau type observé à l'actualisation et le garde quand il quitte le sprint", async () => {
    const jira = boardSiteJira({ sprintIssues: [SPRINT_ISSUES[0]] });
    const platform = fakePlatform(jira);
    const board = model(platform);
    await board.load(BOARD_URL);
    expect(board.configuration.value?.issueTypes.map((type) => type.id)).toEqual(["10001"]);

    jira.on("GET", ACTIVE_ISSUES, {
      status: 200,
      json: {
        issues: [SPRINT_ISSUES[0], issueJson("ABC-900", { typeId: "20000", typeName: "Support" })],
        total: 2,
      },
    });
    await board.sync();
    expect(board.configuration.value?.issueTypes).toContainEqual(
      expect.objectContaining({ id: "20000", name: "Support", category: "SWIMLANE" }),
    );
    expect(board.snapshot.value?.swimlaneIssues.map((item) => item.issue.key)).toEqual(["ABC-900"]);
    expect((await loadActiveBoard(platform.store, ACME.origin))?.issueTypes).toEqual(
      board.configuration.value?.issueTypes,
    );

    jira.on("GET", ACTIVE_ISSUES, {
      status: 200,
      json: { issues: [SPRINT_ISSUES[0]], total: 1 },
    });
    board.dispose();
    const reopened = model(platform);
    await reopened.load(BOARD_URL);
    expect(reopened.configuration.value?.issueTypes).toContainEqual(
      expect.objectContaining({ id: "20000", name: "Support", category: "SWIMLANE" }),
    );
    expect(reopened.snapshot.value?.swimlaneIssues).toEqual([]);
    expect(jira.sent("GET", BOARD_ISSUES)).toEqual([]);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("garde les types partagés absents du sprint et leurs groupes lors d'une autre publication", async () => {
    const sharedConfiguration = makeConfiguration({
      boardId: 7,
      issueTypes: [
        STORY_TYPE,
        { id: "20001", name: "Archive", iconUrl: null, category: "IGNORED" },
        { id: "20002", name: "Demande", iconUrl: null, category: "SWIMLANE" },
      ],
      ticketSwimlanes: [{ id: "7", name: "RUN équipe", typeIds: ["20002"], hidden: false }],
    });
    let document: unknown = encodeTeamDocument({
      version: 1,
      publishedAt: "2026-10-13T09:00:00Z",
      publishedBy: { accountId: "u9", displayName: "Alex Martin" },
      settings: {
        ...teamSettingsOf(sharedConfiguration),
        // Document d'une ancienne version : ce marquage doit être ignoré au chargement.
        issueTypes: teamSettingsOf(sharedConfiguration).issueTypes.map((type) => ({
          ...type,
          countsAsBug: type.id === "20002",
        })),
      },
    });
    const jira = boardSiteJira({ sprintIssues: [SPRINT_ISSUES[0]] })
      .on("GET", PROPERTY, () => ({ status: 200, json: { value: document } }))
      .on("PUT", PROPERTY, (request) => {
        document = request.body;
        return { status: 200 };
      });
    const platform = fakePlatform(jira);
    const board = model(platform);
    await board.load(BOARD_URL);

    expect(board.configuration.value?.issueTypes).toEqual(
      expect.arrayContaining([...sharedConfiguration.issueTypes]),
    );
    expect(board.configuration.value?.ticketSwimlanes).toEqual(sharedConfiguration.ticketSwimlanes);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    await board.applySettings((current) => ({ ...current, agingThresholdDays: 12 }), {
      resync: false,
    });
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(document).toMatchObject({
      settings: {
        agingThresholdDays: 12,
        issueTypes: expect.arrayContaining([
          { id: "20001", name: "Archive", category: "IGNORED" },
          { id: "20002", name: "Demande", category: "KANBAN" },
        ]),
        ticketSwimlanes: sharedConfiguration.ticketSwimlanes,
      },
    });

    // Ces types arrivent ensuite dans le sprint : leur choix partagé s'applique immédiatement.
    jira.on("GET", ACTIVE_ISSUES, {
      status: 200,
      json: {
        issues: [
          SPRINT_ISSUES[0],
          issueJson("ABC-901", { typeId: "20001", typeName: "Archive" }),
          issueJson("ABC-902", { typeId: "20002", typeName: "Demande" }),
        ],
        total: 3,
      },
    });
    await board.sync();
    expect(board.snapshot.value?.goalIssues.map((item) => item.issue.key)).toEqual(["ABC-101"]);
    expect(board.snapshot.value?.swimlaneIssues.map((item) => item.issue.key)).toEqual(["ABC-902"]);
    expect(board.layout.value?.lanes.map((lane) => lane.title)).toContain("RUN équipe");
    expect(jira.sent("GET", BOARD_ISSUES)).toEqual([]);
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
  });

  it("ne parcourt qu'une fois les tickets Kanban pour les afficher et découvrir leurs types", async () => {
    const jira = boardSiteJira({ graphql: goalsGateway({ goals: [] }) }).on(
      "GET",
      "/rest/agile/1.0/board/7",
      {
        status: 200,
        json: { id: 7, name: "Flux Paiement", type: "kanban", location: { projectKey: "ABC" } },
      },
    );
    const board = model(fakePlatform(jira));
    await board.load(BOARD_URL);

    expect(board.syncProblem.value).toBeNull();
    expect(board.snapshot.value?.goalIssues).toHaveLength(5);
    expect(board.snapshot.value?.swimlaneIssues.map((item) => item.issue.key)).toEqual(["RUN-7"]);
    expect(jira.sent("GET", BOARD_ISSUES)).toHaveLength(1);
    expect(jira.sent("GET", ACTIVE_ISSUES)).toEqual([]);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("permet toujours le recensement complet explicite des types du backlog", async () => {
    const jira = boardSiteJira({ sprintIssues: [SPRINT_ISSUES[0]] }).on("GET", BOARD_ISSUES, {
      status: 200,
      json: {
        issues: [SPRINT_ISSUES[0], issueJson("ABC-950", { typeId: "20050", typeName: "Incident" })],
        total: 2,
      },
    });
    const board = model(fakePlatform(jira));
    await board.load(BOARD_URL);
    expect(board.configuration.value?.issueTypes.map((type) => type.id)).toEqual(["10001"]);

    await board.refreshStructure();
    expect(board.configuration.value?.issueTypes).toContainEqual(
      expect.objectContaining({ id: "20050", name: "Incident", category: "SWIMLANE" }),
    );
    expect(jira.sent("GET", BOARD_ISSUES)).toHaveLength(1);
    expect(jira.sent("GET", BOARD_ISSUES)[0]?.url.searchParams.get("fields")).toBe(
      "issuetype,status",
    );
    expect(board.snapshot.value?.goalIssues.map((item) => item.issue.key)).toEqual(["ABC-101"]);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("classe les types Kanban avant les Goals mais exige aussi leurs liens pour les tickets RUN", async () => {
    const jira = boardSiteJira({
      sprintIssues: [SPRINT_ISSUES[5]],
      graphql: goalsGateway({
        goals: [{ id: "ari:cloud:townsquare:c:goal/paiement", name: "Paiement" }],
        goalFields: REAL_GOAL_FIELDS.filter((field) => field.name !== "workItems"),
      }),
    }).on("GET", "/rest/agile/1.0/board/7", {
      status: 200,
      json: { id: 7, name: "Flux Paiement", type: "kanban", location: { projectKey: "ABC" } },
    });
    const board = model(fakePlatform(jira));
    await board.load(BOARD_URL);

    // RUN peut désormais porter un Goal : ne pas inventer un classement sans objectif.
    expect(board.syncProblem.value?.text).toContain("Objectifs du board Kanban indisponibles");
    expect(board.snapshot.value).toBeNull();
    expect(board.syncProblem.value?.text).toContain("schéma Atlassian");
    expect(board.configuration.value?.issueTypes).toContainEqual(
      expect.objectContaining({ id: "10004", category: "SWIMLANE" }),
    );
    expect(jira.sent("GET", BOARD_ISSUES)).toHaveLength(1);
  });

  it("garde les types observés modifiables et en cache si les Goals bloquent la première ouverture Kanban", async () => {
    // Cache neuf et passerelle Goals refusée : les tickets, eux, ont bien été lus.
    const jira = boardSiteJira().on("GET", "/rest/agile/1.0/board/7", {
      status: 200,
      json: { id: 7, name: "Flux Paiement", type: "kanban", location: { projectKey: "ABC" } },
    });
    const platform = fakePlatform(jira);
    const board = model(platform);
    await board.load(BOARD_URL);

    expect(board.snapshot.value).toBeNull();
    expect(board.syncProblem.value?.text).toContain("Objectifs du board Kanban indisponibles");
    expect(jira.sent("GET", BOARD_ISSUES)).toHaveLength(1);
    expect(board.configuration.value?.issueTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "10001", category: "GOAL" }),
        expect.objectContaining({ id: "10004", category: "SWIMLANE" }),
      ]),
    );
    expect((await loadActiveBoard(platform.store, ACME.origin))?.issueTypes).toEqual(
      board.configuration.value?.issueTypes,
    );
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);

    // L'administration reste utilisable malgré cet échec de lecture des objectifs.
    expect(board.canEditSettings.value).toBe(true);
    await board.applySettings(
      (current) => ({
        ...current,
        issueTypes: current.issueTypes.map((type) =>
          type.id === "10004" ? { ...type, category: "IGNORED" as const } : type,
        ),
      }),
      { resync: false },
    );
    expect(board.configuration.value?.issueTypes).toContainEqual(
      expect.objectContaining({ id: "10004", category: "IGNORED" }),
    );
    expect((await loadActiveBoard(platform.store, ACME.origin))?.issueTypes).toEqual(
      board.configuration.value?.issueTypes,
    );
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(1);
  });
});
