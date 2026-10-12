import { describe, expect, it } from "vitest";
import { type GoalsReader, loadAtlassianSprintGoals } from "../../src/core/atlassianGoals";
import { JiraError } from "../../src/jira/errors";
import type { AtlassianGoal } from "../../src/jira/models";
import { makeConfiguration, makeIssue, SWIMLANE_TYPE } from "../support/jiraFixtures";

const goal = (id: string, name?: string): AtlassianGoal => ({
  id,
  key: null,
  name: name ?? null,
  statusLabel: name ? "on_track" : null,
  ownerName: null,
  targetDate: null,
  url: null,
  isArchived: false,
});

function reader(options: {
  site?: AtlassianGoal[];
  workItems?: Record<string, string[]>;
  known?: AtlassianGoal[];
  fail?: Partial<Record<"cloudId" | "search" | "workItems" | "byIds", Error>>;
  lastWorkItemsIssue?: string;
}): GoalsReader & { asked: string[][] } {
  const asked: string[][] = [];
  return {
    asked,
    lastWorkItemsIssue: options.lastWorkItemsIssue ?? null,
    cloudId: async () => {
      if (options.fail?.cloudId) throw options.fail.cloudId;
      return "cloud-test";
    },
    searchGoals: async () => {
      if (options.fail?.search) throw options.fail.search;
      return options.site ?? [];
    },
    workItemKeys: async (ids) => {
      asked.push([...ids]);
      if (options.fail?.workItems) throw options.fail.workItems;
      return Object.fromEntries(
        Object.entries(options.workItems ?? {}).filter(([id]) => ids.includes(id)),
      );
    },
    goalsByIds: async (ids) => {
      if (options.fail?.byIds) throw options.fail.byIds;
      return (options.known ?? []).filter((g) => ids.includes(g.id));
    },
  } as GoalsReader & { asked: string[][] };
}

const GOALS_FIELD = "customfield_10100";
const config = makeConfiguration({ goalsFieldId: GOALS_FIELD });
const issues = [
  makeIssue("ABC-1", { extraFields: { [GOALS_FIELD]: ["ari:cloud:goal:c:goal/declare"] } }),
  makeIssue("ABC-2"),
  makeIssue("ABC-3"),
];

describe("loadAtlassianSprintGoals", () => {
  it("Kanban : une recherche impossible ne devient pas une absence d'objectifs", async () => {
    await expect(
      loadAtlassianSprintGoals({
        reader: reader({ fail: { search: new Error("quota") } }),
        configuration: { ...config, boardType: "kanban" },
        pinnedGoalIds: [],
        issues: [makeIssue("ABC-1")],
      }),
    ).rejects.toThrow("Recherche des objectifs du board : quota");
  });

  it("Kanban : les liens partiels empêchent un classement erroné dans Build", async () => {
    for (const r of [
      reader({ fail: { workItems: new Error("refus") } }),
      reader({
        lastWorkItemsIssue: "pagination incomplète",
        workItems: {
          "ari:cloud:goal:c:goal/declare": ["ABC-2"],
        },
      }),
    ]) {
      await expect(
        loadAtlassianSprintGoals({
          reader: r,
          configuration: { ...config, boardType: "kanban" },
          pinnedGoalIds: [],
          issues,
        }),
      ).rejects.toThrow("Tickets rattachés aux objectifs");
    }
  });

  it("Kanban : sans workItems, utilise le champ Goals présent sur tous les tickets", async () => {
    const goalId = "ari:cloud:goal:c:goal/declare";
    const boardIssues = [
      makeIssue("ABC-1", { extraFields: { [GOALS_FIELD]: [{ id: goalId }] } }),
      makeIssue("ABC-2", { extraFields: { [GOALS_FIELD]: null } }),
      makeIssue("ABC-3", { extraFields: { [GOALS_FIELD]: [] } }),
      makeIssue("RUN-1", { typeId: SWIMLANE_TYPE.id }),
    ];
    const r = reader({
      lastWorkItemsIssue: "le schéma Atlassian n'expose pas de lien Goal → tickets exploitable",
      workItems: { [goalId]: ["ABC-2"] },
      known: [goal(goalId, "Objectif du board")],
    });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      configuration: { ...config, boardType: "kanban" },
      pinnedGoalIds: [],
      issues: boardIssues,
    });
    expect(result.goals.map((goal) => goal.title)).toEqual(["Objectif du board"]);
    expect(result.links).toEqual({ "ABC-1": goalId });
    expect(result.warnings).toEqual([
      "Tickets rattachés aux objectifs : le schéma Atlassian n'expose pas de lien Goal → tickets exploitable",
    ]);
  });

  it("Kanban : un champ Goals absent d'un ticket interdit le repli", async () => {
    const boardIssues = [
      makeIssue("ABC-1", {
        extraFields: { [GOALS_FIELD]: ["ari:cloud:goal:c:goal/declare"] },
      }),
      makeIssue("ABC-2"),
    ];
    await expect(
      loadAtlassianSprintGoals({
        reader: reader({ lastWorkItemsIssue: "schéma incompatible" }),
        configuration: { ...config, boardType: "kanban" },
        pinnedGoalIds: [],
        issues: boardIssues,
      }),
    ).rejects.toThrow("Tickets rattachés aux objectifs : schéma incompatible");
  });

  it("Kanban : une perte de session reste une erreur de connexion même avec le champ Goals", async () => {
    const sessionLost = new JiraError({ kind: "unauthorized" });
    await expect(
      loadAtlassianSprintGoals({
        reader: reader({ fail: { workItems: sessionLost } }),
        configuration: { ...config, boardType: "kanban" },
        pinnedGoalIds: [],
        issues: [
          makeIssue("ABC-1", { extraFields: { [GOALS_FIELD]: ["ari:cloud:goal:c:goal/declare"] } }),
        ],
      }),
    ).rejects.toBe(sessionLost);
  });

  it("Kanban : aucune donnée est valide, les libellés illisibles restent des avertissements", async () => {
    const empty = await loadAtlassianSprintGoals({
      reader: reader({}),
      configuration: { ...config, boardType: "kanban" },
      pinnedGoalIds: [],
      issues: [],
    });
    expect(empty).toEqual({ goals: [], links: {}, warnings: [] });
    const missingTitles = await loadAtlassianSprintGoals({
      reader: reader({ fail: { byIds: new Error("indisponible") } }),
      configuration: { ...config, boardType: "kanban" },
      pinnedGoalIds: [],
      issues,
    });
    expect(missingTitles.links["ABC-1"]).toBe("ari:cloud:goal:c:goal/declare");
    expect(missingTitles.warnings).toEqual(["Libellés des objectifs : indisponible"]);
  });
  it("déduit les objectifs des tickets : Goal → tickets, complété par le champ des tickets", async () => {
    const r = reader({
      site: [goal("g-site")],
      workItems: { "ari:cloud:goal:c:goal/declare": ["ABC-2", "HORS-9"] },
      known: [goal("ari:cloud:goal:c:goal/declare", "Paiement")],
    });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: [],
      issues,
      configuration: config,
    });

    expect(result.goals.map((g) => [g.id, g.title, g.atlassianStatus])).toEqual([
      ["ari:cloud:goal:c:goal/declare", "Paiement", "on_track"],
    ]);
    // Le ticket hors sprint n'est pas retenu ; le champ du ticket complète workItems.
    expect(result.links).toEqual({
      "ABC-1": "ari:cloud:goal:c:goal/declare",
      "ABC-2": "ari:cloud:goal:c:goal/declare",
    });
    expect(result.warnings).toEqual([]);
  });

  it("un objectif épinglé s'affiche même sans ticket, en premier", async () => {
    const r = reader({ known: [goal("g-epingle", "Préparer la release")] });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: ["g-epingle"],
      issues,
      configuration: config,
    });
    expect(result.goals.map((g) => g.id)).toEqual(["g-epingle", "ari:cloud:goal:c:goal/declare"]);
    expect(result.goals[0]?.position).toBe(0);
  });

  it("sans aucun candidat : interroge les objectifs du site", async () => {
    const r = reader({
      site: [goal("g1"), goal("g2")],
      workItems: { g2: ["ABC-3"] },
      known: [goal("g2", "Stabilité")],
    });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: [],
      issues: [makeIssue("ABC-3")],
      configuration: config,
    });
    expect(r.asked).toEqual([["g1", "g2"]]);
    expect(result.goals.map((g) => g.title)).toEqual(["Stabilité"]);
    expect(result.links).toEqual({ "ABC-3": "g2" });
  });

  it("un Goal épinglé ne masque pas ceux que portent les tickets quand leur champ est muet", async () => {
    // Rechercher les Goals du site même lorsqu'un Goal a déjà été épinglé.
    const r = reader({
      site: [goal("g-site")],
      workItems: { "g-site": ["ABC-3"] },
      known: [goal("g-epingle", "Préparer la release"), goal("g-site", "Stabilité")],
    });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: ["g-epingle"],
      issues: [makeIssue("ABC-3")],
      configuration: config,
    });
    expect(r.asked).toEqual([["g-epingle", "g-site"]]);
    expect(result.goals.map((g) => g.title)).toEqual(["Préparer la release", "Stabilité"]);
    expect(result.links).toEqual({ "ABC-3": "g-site" });
  });

  it("recherche du site en échec : les Goals épinglés s'affichent quand même, avec l'avertissement", async () => {
    const r = reader({
      fail: { search: new Error("délai dépassé") },
      known: [goal("g-epingle", "Préparer la release")],
    });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: ["g-epingle"],
      issues: [makeIssue("ABC-3")],
      configuration: config,
    });
    expect(result.goals.map((g) => g.title)).toEqual(["Préparer la release"]);
    expect(result.warnings).toEqual(["Recherche des objectifs du site : délai dépassé"]);
  });

  it("un ticket lié à deux objectifs suit le premier affiché", async () => {
    const r = reader({
      workItems: { g1: ["ABC-2"], g2: ["ABC-2"] },
      known: [goal("g1"), goal("g2")],
    });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: ["g2", "g1"],
      issues: [makeIssue("ABC-2")],
      configuration: config,
    });
    expect(result.links).toEqual({ "ABC-2": "g2" });
  });

  it("un objectif non résolu garde son identifiant brut plutôt que de disparaître", async () => {
    const r = reader({ fail: { byIds: new Error("délai dépassé") } });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: [],
      issues,
      configuration: config,
    });
    expect(result.goals.map((g) => g.title)).toEqual(["ari:cloud:goal:c:goal/declare"]);
    expect(result.warnings).toEqual(["Libellés des objectifs : délai dépassé"]);
  });

  it("lectures partielles : des avertissements, pas un board vide sans explication", async () => {
    const r = reader({
      fail: { workItems: new Error("refus") },
      lastWorkItemsIssue: "arguments non pris en charge",
    });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: [],
      issues,
      configuration: config,
    });
    expect(result.warnings).toEqual([
      "Tickets rattachés aux objectifs : refus",
      "Tickets rattachés aux objectifs : arguments non pris en charge",
    ]);
    // Le lien déclaré par le ticket suffit à afficher l'objectif.
    expect(result.links).toEqual({ "ABC-1": "ari:cloud:goal:c:goal/declare" });
  });

  it("recherche du site en échec et aucun candidat : rien, avec la cause", async () => {
    const r = reader({ fail: { search: new Error("quota") } });
    const result = await loadAtlassianSprintGoals({
      reader: r,
      pinnedGoalIds: [],
      issues: [makeIssue("ABC-2")],
      configuration: config,
    });
    expect(result).toEqual({
      goals: [],
      links: {},
      warnings: ["Recherche des objectifs du site : quota"],
    });
  });

  it("passerelle muette : échec, pour que le board se rabatte sur le texte du sprint", async () => {
    const r = reader({ fail: { cloudId: new Error("Invalid CORS request") } });
    await expect(
      loadAtlassianSprintGoals({ reader: r, pinnedGoalIds: [], issues, configuration: config }),
    ).rejects.toThrowError("Invalid CORS request");
  });
});
