import { describe, expect, it } from "vitest";
import {
  buildConfiguration,
  colorRules,
  type DiscoveredBoard,
  decodeStoredConfiguration,
  defaultCategory,
  mergeConfiguration,
  swimlaneName,
  visibleColumns,
} from "../../src/core/boardConfiguration";
import { withSwimlaneName, withTypeDestination } from "../../src/core/boardSettings";
import {
  decodeIssueType,
  decodeStatus,
  type JiraIssueType,
  type JiraStatus,
} from "../../src/jira/models";
import { column, makeConfiguration, statusJson } from "../support/jiraFixtures";

const BOARD: DiscoveredBoard = {
  boardId: 7,
  boardName: "Board de test",
  boardType: "scrum",
  kanbanSubQuery: null,
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
    expect(defaultCategory("Bug")).toBe("SWIMLANE");
    expect(defaultCategory("Story")).toBe("GOAL");
    expect(defaultCategory("User Story")).toBe("GOAL");
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
    expect(config.blockOrder).toEqual([]);
    expect(config.cardColorRules).toEqual([]);
    // Source des objectifs d'un board Scrum : le texte du sprint (demande de Denis du 09/10/2026).
    expect(config.goalSource).toBe("sprintText");
    expect(colorRules(config).map((r) => r.name)).toEqual(["Ajouté en cours de sprint"]);
  });
});

describe("mergeConfiguration", () => {
  it("Kanban conserve les Goals épinglés mais reprend le sous-filtre Jira et impose les Goals Atlassian", () => {
    const fresh = { ...discovered(), boardType: "kanban", kanbanSubQuery: "resolution is EMPTY" };
    const existing = {
      ...fresh,
      kanbanSubQuery: "labels = ancien",
      goalSource: "sprintText" as const,
      boardPinnedGoalIds: ["goal-1"],
    };
    const merged = mergeConfiguration(fresh, existing);
    expect(merged.kanbanSubQuery).toBe("resolution is EMPTY");
    expect(merged.goalSource).toBe("atlassianGoals");
    expect(merged.boardPinnedGoalIds).toEqual(["goal-1"]);
  });
  it("Jira fait foi pour la structure, l'utilisateur pour ses préférences", () => {
    const existing = {
      ...discovered(),
      issueTypes: discovered().issueTypes.map((t) => ({
        ...t,
        category: "GOAL" as const,
      })),
      cardColorRules: [
        { id: "r1", name: "P2", jql: "priority = High", color: "red", enabled: true, kind: null },
      ],
      collapsedBlockIds: ["build"],
      hiddenGoalIds: ["g9"],
      blockOrder: ["build", "goal:g1"],
      goalColorIndex: { g1: 4 },
      buildSectionLabel: "Hors objectif",
      // Personnalisation de colonne d'avant 0.31.0 : abandonnée, Jira fait foi.
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
    expect(merged.issueTypes.every((t) => t.category === "GOAL")).toBe(true);
    expect(merged.ticketSwimlanes).toEqual([]);
    expect(merged.collapsedBlockIds).toEqual(["build"]);
    expect(merged.hiddenGoalIds).toEqual(["g9"]);
    expect(merged.blockOrder).toEqual(["build", "goal:g1"]);
    expect(merged.goalColorIndex).toEqual({ g1: 4 });
    expect(merged.buildSectionLabel).toBe("Hors objectif");
    // Colonnes telles que Jira les déclare : nom, affichage et limite WIP ne se règlent plus ici.
    expect(merged.columns).toHaveLength(1);
    expect(merged.columns[0]).toMatchObject({ name: "Work", wipLimit: 8, hidden: false });
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

describe("anciens réglages d'identification des bugs", () => {
  it("ignore le marquage des types et conserve leur classement et leurs swimlanes", () => {
    const configuration = withSwimlaneName(discovered(), "1", "RUN");
    const stored = decodeStoredConfiguration({
      ...configuration,
      issueTypes: configuration.issueTypes.map((type) => ({
        ...type,
        countsAsBug: type.category === "GOAL",
      })),
    });

    expect(stored?.issueTypes).toEqual(configuration.issueTypes);
    expect(stored?.ticketSwimlanes).toEqual(configuration.ticketSwimlanes);
    expect(stored?.issueTypes.every((type) => !("countsAsBug" in type))).toBe(true);
    const merged = mergeConfiguration(discovered(), stored);
    expect(merged.issueTypes).toEqual(configuration.issueTypes);
    expect(merged.ticketSwimlanes).toEqual(configuration.ticketSwimlanes);
    expect(merged.issueTypes.every((type) => !("countsAsBug" in type))).toBe(true);
  });
});

describe("configuration Kanban enregistrée", () => {
  it("relit les épinglages partagés et ignore une ancienne source texte", () => {
    const stored = decodeStoredConfiguration({
      ...makeConfiguration(),
      boardType: "kanban",
      goalSource: "sprintText",
      kanbanSubQuery: "resolution is EMPTY",
      boardPinnedGoalIds: ["goal-1", "goal-1", 8, "goal-2"],
    });
    expect(stored?.goalSource).toBe("atlassianGoals");
    expect(stored?.kanbanSubQuery).toBe("resolution is EMPTY");
    expect(stored?.boardPinnedGoalIds).toEqual(["goal-1", "goal-2"]);
  });

  it("une ancienne configuration Scrum reçoit des valeurs neutres", () => {
    const { boardPinnedGoalIds: _pins, kanbanSubQuery: _query, ...old } = makeConfiguration();
    const stored = decodeStoredConfiguration(old);
    expect(stored?.goalSource).toBe("sprintText");
    expect(stored?.boardPinnedGoalIds).toEqual([]);
    expect(stored?.kanbanSubQuery).toBeNull();
  });
});

describe("configuration enregistrée avant 0.31.0", () => {
  it("abandonne le masquage de colonne et les labels de blocage choisis localement", () => {
    const old = {
      ...makeConfiguration(),
      blockedLabels: ["bloqué"],
      columns: [
        { ...column("todo", "À faire", ["1"], 0), hidden: true, wipLimit: 4 },
        column("vide", "Sans statut", [], 1),
      ],
    };
    const stored = decodeStoredConfiguration(old);
    // Le nom et la limite restent ceux de la dernière lecture, remplacés à la prochaine.
    expect(stored?.columns.map((c) => [c.name, c.hidden, c.wipLimit])).toEqual([
      ["À faire", false, 4],
      ["Sans statut", true, null],
    ]);
    expect(stored && "blockedLabels" in stored).toBe(false);
  });
});

describe("relecture des groupes par type après la 0.34", () => {
  it("rétablit les types conservés, les noms, les identifiants et le masquage sans conserver de JQL", () => {
    const original = makeConfiguration();
    const old = {
      ...original,
      swimlaneMode: "jql",
      issueTypes: original.issueTypes.map((type) => ({ ...type, category: "GOAL" })),
      ticketSwimlanes: original.ticketSwimlanes.map((lane) => ({
        ...lane,
        name: "RUN",
        hidden: true,
        jql: "labels = run",
        enabled: false,
      })),
      blockOrder: ["swimlane:1", "build"],
      collapsedBlockIds: ["swimlane:1"],
    };
    const decoded = decodeStoredConfiguration(old);
    expect(decoded?.issueTypes).toEqual(original.issueTypes);
    expect(decoded?.ticketSwimlanes).toEqual([
      { id: "1", name: "RUN", hidden: true, typeIds: ["10004"] },
    ]);
    expect(decoded?.blockOrder).toEqual(old.blockOrder);
    expect(decoded?.collapsedBlockIds).toEqual(old.collapsedBlockIds);
    expect(decoded && "swimlaneMode" in decoded).toBe(false);
    expect(decodeStoredConfiguration(decoded)).toEqual(decoded);
  });

  it("conserve les types ignorés et ne crée pas de groupe depuis une règle JQL sans types", () => {
    const original = makeConfiguration();
    const decoded = decodeStoredConfiguration({
      ...original,
      swimlaneMode: "jql",
      issueTypes: original.issueTypes.map((type) => ({
        ...type,
        category: type.id === "10004" ? "IGNORED" : "GOAL",
      })),
      ticketSwimlanes: [
        ...original.ticketSwimlanes,
        {
          id: "jql-only",
          name: "Prioritaires",
          typeIds: [],
          hidden: false,
          jql: "priority = High",
        },
      ],
    });
    expect(decoded?.issueTypes.find((type) => type.id === "10004")?.category).toBe("IGNORED");
    expect(decoded?.ticketSwimlanes).toEqual([]);
  });

  it("la clé partagée n'est pas interprétée et ne ressuscite pas un type replacé dans Default", () => {
    const original = makeConfiguration();
    const shared = {
      ...original,
      issueTypes: original.issueTypes.map((type) => ({ ...type, category: "GOAL" })),
      jqlSwimlanes: { version: 999, lanes: [{ id: "inconnue", jql: "texte non lu" }] },
    };
    const decoded = decodeStoredConfiguration(shared);
    if (!decoded) throw new Error("configuration attendue");
    expect(decoded.issueTypes).toEqual(original.issueTypes);
    const changed = withTypeDestination(decoded, "10004", { kind: "goal" });
    const reread = decodeStoredConfiguration({ ...changed, jqlSwimlanes: shared.jqlSwimlanes });
    expect(reread?.issueTypes.find((type) => type.id === "10004")?.category).toBe("GOAL");
    expect(reread?.ticketSwimlanes).toEqual([]);
    expect(reread && "jqlSwimlanes" in reread).toBe(false);
  });
});
