import { describe, expect, it } from "vitest";
import {
  buildConfiguration,
  colorRules,
  type DiscoveredBoard,
  defaultCategory,
  isBugType,
  looksLikeBug,
  mergeConfiguration,
  swimlaneName,
  visibleColumns,
} from "../../src/core/boardConfiguration";
import { withSwimlaneName } from "../../src/core/boardSettings";
import {
  decodeIssueType,
  decodeStatus,
  type JiraIssueType,
  type JiraStatus,
} from "../../src/jira/models";
import { column, makeConfiguration, STORY_TYPE, statusJson } from "../support/jiraFixtures";

const BOARD: DiscoveredBoard = {
  boardId: 7,
  boardName: "Board de test",
  boardType: "scrum",
  projectKey: "ABC",
  columns: [
    { name: "À faire", statusIds: ["1"], max: null },
    { name: "En cours", statusIds: ["3", "4"], max: 5 },
    { name: "Terminé", statusIds: ["6"], max: null },
    { name: "Orpheline", statusIds: [], max: null },
  ],
  estimationFieldId: "customfield_10016",
};

const STATUSES = [
  statusJson("1", "To Do", "new"),
  statusJson("3", "In Progress"),
  statusJson("4", "Review"),
  statusJson("6", "Done", "done"),
].map((json) => decodeStatus(json) as JiraStatus);

const TYPES = [
  { id: "3", name: "Sous-tâche", subtask: true },
  { id: "2", name: "Story", subtask: false },
  { id: "1", name: "Anomalie de Recette", subtask: false },
].map((json) => decodeIssueType(json) as JiraIssueType);

function discovered() {
  return buildConfiguration({
    board: BOARD,
    siteOrigin: "https://acme.atlassian.net",
    statuses: STATUSES,
    issueTypes: TYPES,
    estimationFieldName: "Story Points",
    goalsFieldId: "customfield_10100",
    flaggedFieldId: null,
  });
}

describe("classement par défaut des types", () => {
  it("range les types d'anomalie français hors objectifs", () => {
    expect(defaultCategory("Anomalie de Recette")).toBe("SWIMLANE");
    expect(defaultCategory("Anomalie Prod")).toBe("SWIMLANE");
    expect(defaultCategory("Story")).toBe("GOAL");
    expect(defaultCategory("User Story")).toBe("GOAL");
  });

  it("reconnaît un bug à son nom, sans tenir compte des accents", () => {
    expect(looksLikeBug("Bogue")).toBe(true);
    expect(looksLikeBug("Défect majeur")).toBe(true);
    expect(looksLikeBug("Story")).toBe(false);
  });

  it("le réglage du board l'emporte ; un type inconnu est jugé sur son nom", () => {
    const config = makeConfiguration({
      issueTypes: [{ ...STORY_TYPE, id: "9", name: "Bug", countsAsBug: false }],
    });
    expect(isBugType(config, "9", "Bug")).toBe(false);
    expect(isBugType(config, "autre", "Bug")).toBe(true);
    expect(isBugType(config, null, null)).toBe(false);
  });
});

describe("buildConfiguration", () => {
  it("reprend de Jira colonnes, statuts, limites et champ d'estimation", () => {
    const config = discovered();
    expect(
      config.columns.map((c) => [c.name, c.statusIds, c.wipLimit, c.isDone, c.hidden]),
    ).toEqual([
      ["À faire", ["1"], null, false, false],
      ["En cours", ["3", "4"], 5, false, false],
      ["Terminé", ["6"], null, true, false],
      ["Orpheline", [], null, false, true],
    ]);
    expect(visibleColumns(config.columns).map((c) => c.name)).toEqual([
      "À faire",
      "En cours",
      "Terminé",
    ]);
    expect(config.estimationFieldId).toBe("customfield_10016");
    expect(config.projectKeys).toEqual(["ABC"]);
  });

  it("écarte les sous-tâches, classe et trie les types", () => {
    expect(discovered().issueTypes.map((t) => [t.name, t.category])).toEqual([
      ["Anomalie de Recette", "SWIMLANE"],
      ["Story", "GOAL"],
    ]);
  });

  it("les types hors objectifs forment une première swimlane par type, au nom calculé", () => {
    const config = discovered();
    expect(config.ticketSwimlanes).toEqual([{ id: "1", name: "", typeIds: ["1"], hidden: false }]);
    const [swimlane] = config.ticketSwimlanes;
    if (!swimlane) throw new Error("swimlane attendue");
    expect(swimlaneName(config, swimlane)).toBe("Anomalie de Recette");
  });

  it("n'impose aucune préférence par défaut", () => {
    const config = discovered();
    expect(config.blockedLabels).toEqual([]);
    expect(config.blockOrder).toEqual([]);
    expect(config.cardColorRules).toEqual([]);
    expect(config.goalSource).toBe("atlassianGoals");
    expect(colorRules(config).map((r) => r.name)).toEqual(["Ajouté en cours de sprint"]);
  });
});

// ConfigurationCompatibilityTests.testMergeKeepsColorRulesAndBugChoices + CollapsedBlocksTests
describe("mergeConfiguration", () => {
  it("Jira fait foi pour la structure, l'utilisateur pour ses préférences", () => {
    const existing = {
      ...discovered(),
      issueTypes: discovered().issueTypes.map((t) => ({
        ...t,
        category: "GOAL" as const,
        countsAsBug: true,
      })),
      cardColorRules: [
        { id: "r1", name: "P2", jql: "priority = High", color: "red", enabled: true, kind: null },
      ],
      collapsedBlockIds: ["build"],
      hiddenGoalIds: ["g9"],
      blockOrder: ["build", "goal:g1"],
      goalColorIndex: { g1: 4 },
      buildSectionLabel: "Hors objectif",
      columns: discovered().columns.map((c) =>
        c.name === "En cours" ? { ...c, name: "Doing", wipLimit: 3, hidden: true } : c,
      ),
    };
    const fresh = buildConfiguration({
      board: {
        ...BOARD,
        boardName: "Renommé dans Jira",
        columns: [{ name: "Work", statusIds: ["4", "3"], max: 8 }],
      },
      siteOrigin: "https://acme.atlassian.net",
      statuses: STATUSES,
      issueTypes: TYPES,
      estimationFieldName: null,
      goalsFieldId: null,
      flaggedFieldId: "customfield_10021",
    });

    const merged = mergeConfiguration(fresh, existing);

    expect(merged.boardName).toBe("Renommé dans Jira");
    expect(merged.goalsFieldId).toBe("customfield_10100");
    expect(merged.flaggedFieldId).toBe("customfield_10021");
    expect(colorRules(merged).map((r) => r.name)).toEqual(["P2", "Ajouté en cours de sprint"]);
    expect(merged.issueTypes.every((t) => t.category === "GOAL" && t.countsAsBug === true)).toBe(
      true,
    );
    expect(merged.ticketSwimlanes).toEqual([]);
    expect(merged.collapsedBlockIds).toEqual(["build"]);
    expect(merged.hiddenGoalIds).toEqual(["g9"]);
    expect(merged.blockOrder).toEqual(["build", "goal:g1"]);
    expect(merged.goalColorIndex).toEqual({ g1: 4 });
    expect(merged.buildSectionLabel).toBe("Hors objectif");
    // Colonne reconnue à ses statuts, quel que soit leur ordre : nom, masquage et WIP conservés.
    expect(merged.columns).toHaveLength(1);
    expect(merged.columns[0]).toMatchObject({ name: "Doing", wipLimit: 3, hidden: true });
  });

  it("un type apparu dans Jira et classé hors objectifs rejoint la première swimlane par type", () => {
    const existing = withSwimlaneName(discovered(), "1", "RUN");
    const fresh = buildConfiguration({
      board: BOARD,
      siteOrigin: "https://acme.atlassian.net",
      statuses: STATUSES,
      issueTypes: [
        ...TYPES,
        decodeIssueType({ id: "9", name: "Incident", subtask: false }) as JiraIssueType,
      ],
      estimationFieldName: null,
      goalsFieldId: null,
      flaggedFieldId: null,
    });
    expect(mergeConfiguration(fresh, existing).ticketSwimlanes).toEqual([
      { id: "1", name: "RUN", typeIds: ["1", "9"], hidden: false },
    ]);
  });

  it("un autre board, ou aucun existant : la configuration fraîche telle quelle", () => {
    const fresh = discovered();
    expect(mergeConfiguration(fresh, null)).toBe(fresh);
    expect(mergeConfiguration(fresh, makeConfiguration({ boardId: 99 }))).toBe(fresh);
  });

  it("une colonne devenue sans statut reste masquée", () => {
    const existing = makeConfiguration({ boardId: 7, columns: [column("a", "A", [], 0)] });
    const fresh = { ...discovered(), columns: [{ ...column("a", "A", [], 0), hidden: true }] };
    expect(mergeConfiguration(fresh, existing).columns[0]?.hidden).toBe(true);
  });
});
