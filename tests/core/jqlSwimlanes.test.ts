import { describe, expect, it } from "vitest";
import {
  decodeStoredConfiguration,
  mergeConfiguration,
  shownSwimlaneIds,
  type TicketSwimlane,
} from "../../src/core/boardConfiguration";
import { allIssues, assembleBoardIssues, type BoardSnapshot } from "../../src/core/boardIssue";
import { buildBoardLayout } from "../../src/core/boardLayout";
import { withTypeDestination } from "../../src/core/boardSettings";
import { NO_FILTERS } from "../../src/core/filters";
import { withObservedIssueTypes } from "../../src/core/issueTypeDiscovery";
import {
  classifyJqlSwimlanes,
  migrateToJqlSwimlanes,
  previewJqlSwimlanes,
  withJqlSwimlanes,
} from "../../src/core/jqlSwimlanes";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import {
  decodeTeamDocument,
  encodeTeamDocument,
  publishTeamSettings,
  teamSettingsOf,
  withTeamSettings,
} from "../../src/core/teamSettings";
import type { JsonObject } from "../../src/jira/json";
import type { JiraWrite } from "../../src/jira/writes";
import { makeConfiguration, makeIssue, STORY_TYPE, SWIMLANE_TYPE } from "../support/jiraFixtures";

const lanes: readonly TicketSwimlane[] = [
  { id: "run", name: "RUN", typeIds: [], hidden: false, jql: 'labels = "run"', enabled: true },
  {
    id: "maintenance",
    name: "Maintenance",
    typeIds: [],
    hidden: false,
    jql: 'component = "Maintenance"',
    enabled: true,
  },
];
const config = withJqlSwimlanes(makeConfiguration(), lanes);

function snapshot(): BoardSnapshot {
  const issues = assembleBoardIssues({
    issues: [
      makeIssue("ABC-1"),
      makeIssue("ABC-2"),
      makeIssue("ABC-3"),
      makeIssue("ABC-4"),
      makeIssue("ABC-5", {
        parent: "ABC-1",
        extraFields: { issuetype: { id: "sub", name: "Sous-tâche", subtask: true } },
      }),
    ],
    configuration: config,
    columns: config.columns,
    links: { "ABC-2": "g1" },
  });
  return {
    sprint: null,
    activeSprints: [],
    goals: [makeSprintGoal({ id: "g1", title: "Objectif", position: 0 })],
    goalsOrigin: "sprintText",
    goalIssues: issues,
    swimlaneIssues: [],
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
    pinnedGoalIds: [],
    localPinnedGoalIds: null,
  };
}

const matches = new Map([
  ["run", new Set(["ABC-1", "ABC-2"])],
  ["maintenance", new Set(["ABC-1", "ABC-2", "ABC-3", "ABC-5", "OUTSIDE-1"])],
]);

describe("conversion explicite des swimlanes par type", () => {
  it("conserve ordre visuel, identifiants, noms, masquage, replis et types ignorés", () => {
    const legacy = makeConfiguration({
      issueTypes: [
        STORY_TYPE,
        SWIMLANE_TYPE,
        { ...SWIMLANE_TYPE, id: "other", name: "Service" },
        { ...STORY_TYPE, id: "ignored", name: "Exclu", category: "IGNORED" },
      ],
      ticketSwimlanes: [
        { id: "1", name: "", typeIds: [SWIMLANE_TYPE.id], hidden: false },
        { id: "2", name: "Exploitation", typeIds: ["other"], hidden: true },
      ],
      blockOrder: ["swimlane:2", "goal:g1", "build", "swimlane:1"],
      collapsedBlockIds: ["swimlane:1"],
    });
    const converted = migrateToJqlSwimlanes(legacy);
    expect(converted.swimlaneMode).toBe("jql");
    expect(
      converted.ticketSwimlanes.map((lane) => [lane.id, lane.name, lane.jql, lane.hidden]),
    ).toEqual([
      ["2", "Exploitation", 'issuetype in ("other")', true],
      ["1", "Anomalie Prod", 'issuetype in ("10004")', false],
    ]);
    expect(converted.blockOrder).toEqual(legacy.blockOrder);
    expect(converted.collapsedBlockIds).toEqual(legacy.collapsedBlockIds);
    expect(converted.issueTypes.map((type) => type.category)).toEqual([
      "GOAL",
      "GOAL",
      "GOAL",
      "IGNORED",
    ]);
    expect(legacy.swimlaneMode).toBeUndefined();
    expect(migrateToJqlSwimlanes(converted)).toBe(converted);
  });

  it("réordonne les slots des swimlanes sans déplacer les objectifs et Default", () => {
    const ordered = {
      ...config,
      blockOrder: ["goal:g1", "swimlane:run", "build", "swimlane:maintenance"],
      collapsedBlockIds: ["goal:g1", "swimlane:run", "swimlane:maintenance"],
    };
    const reversed = withJqlSwimlanes(ordered, [...lanes].reverse());
    expect(reversed.blockOrder).toEqual([
      "goal:g1",
      "swimlane:maintenance",
      "build",
      "swimlane:run",
    ]);
    const removed = withJqlSwimlanes(ordered, lanes.slice(1));
    expect(removed.blockOrder).toEqual(["goal:g1", "swimlane:maintenance", "build"]);
    expect(removed.collapsedBlockIds).toEqual(["goal:g1", "swimlane:maintenance"]);
  });

  it("garde les règles sans types et place les types découverts dans Default", () => {
    const observed = withObservedIssueTypes(config, [
      { id: "new", name: "Incident", iconUrl: null, subtask: false },
    ]);
    expect(observed.issueTypes.find((type) => type.id === "new")?.category).toBe("GOAL");
    expect(observed.ticketSwimlanes).toEqual(lanes);
    const fresh = makeConfiguration({ issueTypes: [STORY_TYPE, { ...SWIMLANE_TYPE, id: "new" }] });
    const merged = mergeConfiguration(fresh, config);
    expect(merged.issueTypes.every((type) => type.category === "GOAL")).toBe(true);
    expect(merged.ticketSwimlanes).toEqual(lanes);
    expect(decodeStoredConfiguration(JSON.parse(JSON.stringify(config)))?.ticketSwimlanes).toEqual(
      lanes,
    );
    expect(
      withTypeDestination(config, STORY_TYPE.id, { kind: "swimlane", swimlaneId: "run" }),
    ).toBe(config);
    expect(withTypeDestination(config, STORY_TYPE.id, { kind: "ignored" }).ticketSwimlanes).toEqual(
      lanes,
    );
  });
});

describe("classement Jira des swimlanes JQL", () => {
  it("un seul classement, objectif prioritaire, première règle gagnante, reste dans Default", () => {
    const result = classifyJqlSwimlanes(config, snapshot(), matches);
    expect(result.unresolvedIssueKeys.size).toBe(0);
    expect(allIssues(result.snapshot).map((issue) => [issue.issue.key, issue.swimlaneId])).toEqual([
      ["ABC-1", "run"],
      ["ABC-2", "run"],
      ["ABC-3", "maintenance"],
      ["ABC-4", null],
      ["ABC-5", "maintenance"],
    ]);
    expect(result.snapshot.goalIssues.map((issue) => issue.issue.key)).toEqual(["ABC-2", "ABC-4"]);
    expect(result.snapshot.swimlaneIssues.map((issue) => issue.issue.key)).toEqual([
      "ABC-1",
      "ABC-3",
      "ABC-5",
    ]);
    const layout = buildBoardLayout(result.snapshot, config, NO_FILTERS);
    expect(
      layout.lanes.map((lane) => [
        lane.id,
        lane.cells.flatMap((cell) => cell.issues.map((issue) => issue.issue.key)),
      ]),
    ).toEqual([
      ["goal:g1", ["ABC-2"]],
      ["build", ["ABC-4"]],
      ["swimlane:run", ["ABC-1"]],
      ["swimlane:maintenance", ["ABC-3", "ABC-5"]],
    ]);
  });

  it("les sous-tâches suivent leur propre correspondance et gardent l'objectif hérité", () => {
    const source = snapshot();
    const linked = {
      ...source,
      goalIssues: source.goalIssues.map((issue) =>
        issue.issue.key === "ABC-5" ? { ...issue, goalId: "g1" } : issue,
      ),
    };
    const classified = classifyJqlSwimlanes(config, linked, matches).snapshot;
    expect(classified.goalIssues.find((issue) => issue.issue.key === "ABC-5")).toMatchObject({
      swimlaneId: "maintenance",
      goalId: "g1",
    });
    expect(previewJqlSwimlanes(config, source, matches).subtaskChanges).toBe(1);
  });

  it("désactiver redistribue, masquer conserve la priorité sans cacher un objectif", () => {
    const disabled = withJqlSwimlanes(
      config,
      lanes.map((lane) => (lane.id === "run" ? { ...lane, enabled: false } : lane)),
    );
    expect(shownSwimlaneIds(disabled)).toEqual(["maintenance"]);
    expect(
      classifyJqlSwimlanes(disabled, snapshot(), matches).snapshot.swimlaneIssues[0]?.swimlaneId,
    ).toBe("maintenance");
    const hidden = withJqlSwimlanes(
      config,
      lanes.map((lane) => (lane.id === "run" ? { ...lane, hidden: true } : lane)),
    );
    const classified = classifyJqlSwimlanes(hidden, snapshot(), matches).snapshot;
    expect(classified.swimlaneIssues[0]?.swimlaneId).toBe("run");
    const visible = buildBoardLayout(classified, hidden, NO_FILTERS).lanes.flatMap((lane) =>
      lane.cells.flatMap((cell) => cell.issues.map((issue) => issue.issue.key)),
    );
    expect(visible).toContain("ABC-2");
    expect(visible).not.toContain("ABC-1");
  });

  it("une règle inconnue bloque les suivantes et conserve le dernier classement visible", () => {
    const old = classifyJqlSwimlanes(config, snapshot(), matches).snapshot;
    const partial = new Map([["maintenance", matches.get("maintenance") as Set<string>]]);
    const result = classifyJqlSwimlanes(config, snapshot(), partial, old);
    expect([...result.unresolvedIssueKeys]).toEqual(["ABC-1", "ABC-2", "ABC-3", "ABC-4", "ABC-5"]);
    expect(allIssues(result.snapshot).map((issue) => issue.swimlaneId)).toEqual([
      "run",
      "run",
      "maintenance",
      null,
      "maintenance",
    ]);
    const initial = classifyJqlSwimlanes(config, snapshot(), partial);
    expect(initial.snapshot.swimlaneIssues).toEqual([]);
    const hidden = withJqlSwimlanes(
      config,
      lanes.map((lane) => ({ ...lane, hidden: true })),
    );
    expect(classifyJqlSwimlanes(hidden, snapshot(), partial, old).snapshot.swimlaneIssues).toEqual(
      [],
    );
  });

  it("une erreur de règle inférieure ne remet pas en cause les correspondances déjà connues", () => {
    const result = classifyJqlSwimlanes(config, snapshot(), new Map([["run", new Set(["ABC-1"])]]));
    expect(result.snapshot.swimlaneIssues.map((issue) => issue.issue.key)).toEqual(["ABC-1"]);
    expect([...result.unresolvedIssueKeys]).toEqual(["ABC-2", "ABC-3", "ABC-4", "ABC-5"]);
  });

  it("l'aperçu distingue objectifs, règles précédentes et correspondances hors board", () => {
    expect(previewJqlSwimlanes(config, snapshot(), matches)).toMatchObject({
      lanes: [
        { id: "run", matched: 2, assigned: 1, goals: 1, earlier: 0, issueKeys: ["ABC-1", "ABC-2"] },
        { id: "maintenance", matched: 4, assigned: 2, goals: 1, earlier: 1 },
      ],
      defaultCount: 1,
    });
    const hiddenGoal = { ...config, hiddenGoalIds: ["g1"] };
    expect(previewJqlSwimlanes(hiddenGoal, snapshot(), matches).lanes[0]).toMatchObject({
      matched: 2,
      assigned: 2,
      goals: 0,
    });
  });
});

describe("persistance JQL partagée et anciennes versions", () => {
  const document = {
    version: 1,
    publishedAt: "2026-10-14T08:00:00.000Z",
    publishedBy: { accountId: null, displayName: null },
    settings: teamSettingsOf(config),
  };

  it("un ancien client peut réécrire les types et groupes sans détruire les règles JQL", () => {
    const encoded = encodeTeamDocument(document);
    const settings = encoded.settings as JsonObject;
    const fromOldClient = {
      ...encoded,
      settings: {
        ...settings,
        ticketSwimlanes: [],
        issueTypes: [{ id: "10001", name: "Story", category: "KANBAN" }],
      },
    };
    const decoded = decodeTeamDocument(fromOldClient);
    expect(decoded?.settings.jqlSwimlanes).toEqual({ version: 1, lanes });
    const applied = withTeamSettings(makeConfiguration(), decoded?.settings ?? document.settings);
    expect(applied.swimlaneMode).toBe("jql");
    expect(applied.ticketSwimlanes).toEqual(lanes);
    expect(applied.issueTypes.every((type) => type.category === "GOAL")).toBe(true);
    expect(teamSettingsOf(withTeamSettings(makeConfiguration(), document.settings))).toEqual(
      document.settings,
    );
  });

  it("une version JQL inconnue ou une règle tronquée n'est ni interprétée ni écrasée", async () => {
    const encoded = encodeTeamDocument(document);
    for (const jqlSwimlanes of [
      { version: 2, lanes },
      { version: 1, lanes: [{ id: "run" }] },
    ]) {
      const stored = {
        ...encoded,
        settings: { ...(encoded.settings as JsonObject), jqlSwimlanes },
      };
      expect(decodeTeamDocument(stored)).toBeNull();
      const writes: JiraWrite[] = [];
      await expect(
        publishTeamSettings(
          { boardProperty: async () => stored as unknown as JsonObject },
          {
            write: async (write) => {
              writes.push(write);
              return { status: 204, body: null };
            },
          },
          {
            boardId: 1,
            settings: document.settings,
            columns: config.columns,
            basePublishedAt: document.publishedAt,
            publishedBy: document.publishedBy,
            now: new Date(),
          },
        ),
      ).rejects.toThrow();
      expect(writes).toEqual([]);
    }
  });
});
