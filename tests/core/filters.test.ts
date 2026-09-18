import { describe, expect, it } from "vitest";
import { assembleBoardIssues, type BoardIssue } from "../../src/core/boardIssue";
import {
  activeFilterCount,
  applyFilters,
  areFiltersActive,
  type BoardFilters,
  filterAtlassianGoals,
  focusGoal,
  isGoalFocused,
  NO_FILTERS,
  QUICK_FILTERS,
} from "../../src/core/filters";
import type { AtlassianGoal, JiraIssue } from "../../src/jira/models";
import { makeConfiguration, makeIssue } from "../support/jiraFixtures";

function assemble(issues: JiraIssue[], links: Record<string, string> = {}): BoardIssue[] {
  const configuration = makeConfiguration();
  return assembleBoardIssues({ issues, configuration, columns: configuration.scrumColumns, links });
}

const keys = (filters: Partial<BoardFilters>, issues: BoardIssue[]) =>
  applyFilters({ ...NO_FILTERS, ...filters }, issues).map((issue) => issue.issue.key);

// BoardFilterEngineTests
describe("applyFilters", () => {
  const issues = assemble(
    [
      makeIssue("ABC-1", { summary: "Tunnel de paiement", assigneeId: "acc-1", priority: "High" }),
      makeIssue("ABC-2", { summary: "Stabilité", assigneeId: "acc-2", labels: ["tech"] }),
      makeIssue("BUG-3", {
        summary: "Erreur 500",
        typeId: "10004",
        typeName: "Anomalie Prod",
        blockedBy: "ABC-9",
      }),
    ],
    { "ABC-1": "g1" },
  );

  it("sans filtre, tout est retourné", () => {
    expect(keys({}, issues)).toHaveLength(3);
  });

  it("recherche par clé et par résumé, insensible aux accents et à la casse", () => {
    expect(keys({ searchText: "abc-1" }, issues)).toEqual(["ABC-1"]);
    expect(keys({ searchText: "stabilite" }, issues)).toEqual(["ABC-2"]);
    expect(keys({ searchText: "  STABILITÉ " }, issues)).toEqual(["ABC-2"]);
  });

  it("recherche par assigné, type et label", () => {
    expect(keys({ searchText: "alex" }, issues)).toEqual(["ABC-1", "ABC-2"]);
    expect(keys({ searchText: "anomalie" }, issues)).toEqual(["BUG-3"]);
    expect(keys({ searchText: "tech" }, issues)).toEqual(["ABC-2"]);
  });

  it("le filtre rapide « bloqués » s'appuie sur le lien natif", () => {
    expect(keys({ quickFilters: new Set(["blocked"]) }, issues)).toEqual(["BUG-3"]);
  });

  it("il ne reste que deux filtres rapides", () => {
    expect([...QUICK_FILTERS].sort()).toEqual(["addedAfterStart", "blocked"]);
  });

  it("le filtre par assigné reste disponible par son menu", () => {
    expect(keys({ assigneeIds: new Set(["acc-1"]) }, issues)).toEqual(["ABC-1"]);
    expect(keys({ includeUnassigned: true }, issues)).toEqual(["BUG-3"]);
    expect(keys({ assigneeIds: new Set(["acc-2"]), includeUnassigned: true }, issues)).toEqual([
      "ABC-2",
      "BUG-3",
    ]);
  });

  it("les filtres se combinent", () => {
    const combined = { assigneeIds: new Set(["acc-1"]) };
    expect(keys({ ...combined, priorityNames: new Set(["High"]) }, issues)).toEqual(["ABC-1"]);
    expect(keys({ ...combined, priorityNames: new Set(["Low"]) }, issues)).toEqual([]);
  });

  it("type, label, statut, objectif", () => {
    expect(keys({ issueTypeIds: new Set(["10004"]) }, issues)).toEqual(["BUG-3"]);
    expect(keys({ labels: new Set(["tech", "autre"]) }, issues)).toEqual(["ABC-2"]);
    expect(keys({ statusIds: new Set(["6"]) }, issues)).toEqual([]);
    expect(keys({ goalIds: new Set(["g1"]) }, issues)).toEqual(["ABC-1"]);
    expect(keys({ includeWithoutGoal: true }, issues)).toEqual(["ABC-2", "BUG-3"]);
  });

  it("aucun filtre actif par défaut", () => {
    expect(areFiltersActive(NO_FILTERS)).toBe(false);
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(areFiltersActive({ ...NO_FILTERS, searchText: "   " })).toBe(false);
    const some = { ...NO_FILTERS, searchText: "x", quickFilters: new Set(["blocked"] as const) };
    expect(activeFilterCount(some)).toBe(2);
  });
});

// JiraQuickFilterRestrictionTests
describe("filtres rapides du board Jira", () => {
  const issues = assemble([makeIssue("ABC-1"), makeIssue("ABC-2"), makeIssue("ABC-3")]);

  it("ne garde que les clés renvoyées par Jira", () => {
    const filters = {
      jiraQuickFilterIds: new Set([10]),
      jiraQuickFilterKeys: new Set(["ABC-1", "ABC-3"]),
    };
    expect(keys(filters, issues)).toEqual(["ABC-1", "ABC-3"]);
  });

  it("un résultat vide de Jira n'affiche rien, plutôt que tout", () => {
    const filters = { jiraQuickFilterIds: new Set([10]), jiraQuickFilterKeys: new Set<string>() };
    expect(keys(filters, issues)).toEqual([]);
  });

  it("null signifie qu'aucun filtre rapide n'est appliqué", () => {
    expect(keys({ searchText: "ABC", jiraQuickFilterKeys: null }, issues)).toHaveLength(3);
  });

  it("un filtre rapide Jira compte comme filtre actif", () => {
    const filters = { ...NO_FILTERS, jiraQuickFilterIds: new Set([10, 11]) };
    expect(areFiltersActive(filters)).toBe(true);
    expect(activeFilterCount(filters)).toBe(2);
  });
});

// AddedAfterStartQuickFilterTests
describe("filtre rapide « ajoutés »", () => {
  const withFlag = (flag: boolean | null) =>
    assemble([makeIssue("ABC-1")]).map((issue) => ({ ...issue, addedAfterSprintStart: flag }));
  const added = { quickFilters: new Set(["addedAfterStart"] as const) };

  it("garde les tickets ajoutés après le démarrage", () => {
    expect(keys(added, withFlag(true))).toEqual(["ABC-1"]);
  });

  it("écarte les tickets présents dès le départ", () => {
    expect(keys(added, withFlag(false))).toEqual([]);
  });

  it("écarte les tickets dont l'historique est inconnu", () => {
    expect(keys(added, withFlag(null))).toEqual([]);
  });
});

// GoalFocusTests
describe("focusGoal", () => {
  it("un clic sur un objectif ne garde que lui", () => {
    const filters = focusGoal(NO_FILTERS, "g1");
    expect([...filters.goalIds]).toEqual(["g1"]);
    expect(isGoalFocused(filters, "g1")).toBe(true);
    expect(areFiltersActive(filters)).toBe(true);
  });

  it("un second clic sur le même objectif les rétablit tous", () => {
    const filters = focusGoal(focusGoal(NO_FILTERS, "g1"), "g1");
    expect(filters.goalIds.size).toBe(0);
    expect(filters.includeWithoutGoal).toBe(false);
  });

  it("cliquer un autre objectif remplace la sélection", () => {
    const filters = focusGoal({ ...NO_FILTERS, goalIds: new Set(["g1", "g2"]) }, "g2");
    expect([...filters.goalIds]).toEqual(["g2"]);
  });

  it("cliquer un objectif retire le filtre « sans objectif »", () => {
    const first = focusGoal({ ...NO_FILTERS, includeWithoutGoal: true }, "g1");
    expect(first.includeWithoutGoal).toBe(false);
    expect(areFiltersActive(focusGoal(first, "g1"))).toBe(false);
  });

  it("un ticket RUN, sans objectif, sort de l'affichage quand on cible un objectif", () => {
    const issues = assemble(
      [makeIssue("ABC-1"), makeIssue("ABC-2"), makeIssue("RUN-9", { typeId: "10004" })],
      { "ABC-1": "g1", "ABC-2": "g2" },
    );
    expect(keys(focusGoal(NO_FILTERS, "g1"), issues)).toEqual(["ABC-1"]);
  });

  it("ne modifie pas les filtres reçus", () => {
    focusGoal(NO_FILTERS, "g1");
    expect(NO_FILTERS.goalIds.size).toBe(0);
  });
});

// CardFieldAndParentTests (filtre Parent)
describe("filtre et recherche par parent", () => {
  const issues = assemble([
    makeIssue("ABC-1", { parent: "ABC-100" }),
    makeIssue("ABC-2", { parent: "ABC-200" }),
    makeIssue("ABC-3"),
  ]);

  it("filtre par parent, et « sans parent »", () => {
    const filters = { ...NO_FILTERS, parentKeys: new Set(["ABC-100"]) };
    expect(areFiltersActive(filters)).toBe(true);
    expect(activeFilterCount(filters)).toBe(1);
    expect(keys(filters, issues)).toEqual(["ABC-1"]);
    expect(keys({ ...filters, includeWithoutParent: true }, issues)).toEqual(["ABC-1", "ABC-3"]);
  });

  it("la recherche porte aussi sur la clé et le résumé du parent", () => {
    expect(keys({ searchText: "epic abc-200" }, issues)).toEqual(["ABC-2"]);
    expect(keys({ searchText: "abc-100" }, issues)).toEqual(["ABC-1"]);
  });
});

// AtlassianGoalFilterTests
describe("filterAtlassianGoals", () => {
  const goal = (id: string, parts: Partial<AtlassianGoal> = {}): AtlassianGoal => ({
    id,
    key: null,
    name: null,
    statusLabel: null,
    ownerName: null,
    targetDate: null,
    url: null,
    isArchived: false,
    ...parts,
  });
  const goals = [
    goal("1", {
      key: "ACME-1",
      name: "Finaliser le parcours de paiement",
      ownerName: "Alex Martin",
    }),
    goal("2", { key: "ACME-2", name: "Améliorer la stabilité", ownerName: "Claire Petit" }),
    goal("3", { key: "OPS-7", name: "Préparer la release" }),
  ];
  const found = (search: string) => filterAtlassianGoals(search, goals).map((g) => g.id);

  it("une recherche vide garde tout", () => {
    expect(found("")).toEqual(["1", "2", "3"]);
    expect(found("   ")).toEqual(["1", "2", "3"]);
  });

  it("par nom, sans tenir compte de la casse ni des accents", () => {
    expect(found("PAIEMENT")).toEqual(["1"]);
    expect(found("ameliorer")).toEqual(["2"]);
    expect(found("stabilite")).toEqual(["2"]);
  });

  it("par clé et par propriétaire", () => {
    expect(found("ops")).toEqual(["3"]);
    expect(found("ACME")).toEqual(["1", "2"]);
    expect(found("claire")).toEqual(["2"]);
  });

  it("aucune correspondance : liste vide", () => {
    expect(found("inexistant")).toEqual([]);
  });

  it("un Goal sans nom se cherche par son identifiant", () => {
    expect(filterAtlassianGoals("xyz", [goal("ari:cloud:townsquare:c:goal/xyz")])).toHaveLength(1);
  });
});
