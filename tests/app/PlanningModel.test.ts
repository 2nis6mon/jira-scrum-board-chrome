import { signal } from "@preact/signals";
import { describe, expect, it, vi } from "vitest";
import { renderMessage, sourceText } from "../../src/app/model/appMessage";
import { AuditLog } from "../../src/app/model/auditLog";
import { BoardWriteGate } from "../../src/app/model/BoardWriteGate";
import { forgetPlanningDrafts, PlanningModel } from "../../src/app/model/PlanningModel";
import type { BoardConfiguration } from "../../src/core/boardConfiguration";
import { NO_PLANNING_FILTERS } from "../../src/core/filters";
import { JiraClient, type JiraQuickFilter } from "../../src/jira/client";
import { GoalsClient } from "../../src/jira/goals";
import type { AtlassianGoal } from "../../src/jira/models";
import { normalizeSiteUrl } from "../../src/jira/site";
import { JiraTransport } from "../../src/jira/transport";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { column, issueJson, makeConfiguration, statusJson } from "../support/jiraFixtures";
import { planningFixture, SECOND_ACTIVE_GOAL } from "../support/planningFixture";

const DRAFT_KEY = "sprint-planning.v1:https://acme.atlassian.net";
const PROPERTY = "/rest/agile/1.0/sprint/43/properties/com.scrumboardmac.sprintgoals.v1";
const PREPARED = "Sprint 43 — Paiement sans friction";

/** Goals Atlassian fictifs : lectures et liens E3/E4 en mémoire. */
function fakeGoals(input: { workItems: Record<string, string[]>; names: Record<string, string> }) {
  const setLink = vi.fn(async (_kind: string, _goalId: string, _issueId: string) => ({
    success: true,
    messages: [] as string[],
  }));
  const goal = (id: string): AtlassianGoal => ({
    id,
    key: null,
    name: input.names[id] ?? null,
    statusLabel: null,
    ownerName: null,
    targetDate: null,
    url: null,
    isArchived: false,
  });
  return {
    setLink,
    cloudId: async () => "cloud-1",
    searchGoals: async () => Object.keys(input.names).map(goal),
    workItemKeys: async (ids: readonly string[]) =>
      Object.fromEntries(ids.map((id) => [id, input.workItems[id] ?? []])),
    goalsByIds: async (ids: readonly string[]) => ids.map(goal),
    lastWorkItemsIssue: null,
  };
}

function context(
  options: {
    configuration?: Partial<BoardConfiguration>;
    goals?: ReturnType<typeof fakeGoals>;
    issueFields?: Record<string, Record<string, unknown>>;
    /** Délai d'abandon d'une requête (30 s par défaut). */
    timeoutMs?: number;
    /** Tentatives d'une lecture (3 par défaut) : 1 pour une erreur transitoire sans rejeu. */
    maxGetAttempts?: number;
    /** Second sprint actif 45, dont l'objectif a un ticket non terminé. */
    secondActiveSprint?: boolean;
  } = {},
) {
  const fixture = planningFixture(undefined, {
    issueFields: options.issueFields ?? {},
    secondActiveSprint: options.secondActiveSprint ?? false,
  });
  const platform = fakePlatform(fixture.jira);
  const transport = new JiraTransport({
    site: normalizeSiteUrl("acme.atlassian.net"),
    fetch: platform.fetch,
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
    ...(options.maxGetAttempts !== undefined && { maxGetAttempts: options.maxGetAttempts }),
  });
  const client = new JiraClient(transport);
  const goals = options.goals ?? new GoalsClient(transport);
  const audit = new AuditLog(platform.store);
  let generation = 0;
  const gate = new BoardWriteGate({
    writer: transport,
    goals,
    scope: { generation: () => generation, disposed: () => false },
    canEditSettings: () => true,
  });
  const configuration = signal(
    makeConfiguration({
      boardId: 7,
      estimationFieldId: "customfield_10016",
      ...options.configuration,
    }),
  );
  const canWrite = signal(true);
  const quickFilters = signal<readonly JiraQuickFilter[]>([]);
  const openIssue = vi.fn();
  const openSprintDialog = vi.fn(() => true);
  /** Attente entre deux relectures de l'état du sprint : immédiate, sauf simulation. */
  const wait = vi.fn(async (_ms: number) => {});
  const create = () =>
    new PlanningModel(client, platform, {
      configuration: () => configuration.value,
      canWrite: () => canWrite.value,
      accountId: () => "u1",
      openIssue,
      openSprintDialog,
      goals,
      write: (task) => gate.run(task),
      record: (entry) =>
        audit.append({ ...entry, at: new Date().toISOString(), site: client.site.origin }),
      wait,
      jiraQuickFilters: () => quickFilters.value,
    });
  return {
    ...fixture,
    wait,
    platform,
    configuration,
    canWrite,
    quickFilters,
    openIssue,
    openSprintDialog,
    create,
    gate,
    audit,
    /** Le board a changé : un geste préparé avant est refusé par la porte. */
    staleBoard: () => {
      generation += 1;
    },
    planning: create(),
  };
}

/** Retient la porte du board jusqu'à `release()`. */
function holdGate(gate: BoardWriteGate) {
  let release = () => {};
  // Promesse créée tout de suite : la tâche de la porte ne démarre qu'au tour suivant.
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = gate.run(() => done);
  return { held, release: () => release() };
}

const goalTitles = (planning: PlanningModel) => planning.lanes.value.map((lane) => lane.goal.title);
const notice = (planning: PlanningModel) =>
  planning.notice.value ? sourceText(planning.notice.value) : null;
/** Résumé du compte rendu de la dernière clôture, en texte source. */
const report = (planning: PlanningModel) =>
  planning.carryOverReport.value ? sourceText(planning.carryOverReport.value.summary) : null;

describe("Sprint Planning en direct : lecture", () => {
  it("lit à la demande sprint préparé, backlog, autres sprints et RAF actif, sans écrire ni lire les Goals", async () => {
    const { planning, jira } = context();
    expect(jira.requests).toHaveLength(0);
    await planning.load();
    expect(planning.error.value).toBeNull();
    expect(planning.selectedSprintId.value).toBe(43);
    expect(planning.sprints.value.map((sprint) => sprint.id)).toEqual([43]);
    expect(goalTitles(planning)).toEqual([
      "Simplifier le paiement",
      "Rendre le panier plus rapide",
    ]);
    expect(planning.unassigned.value.map((item) => item.issue.key)).toEqual(["ABC-210"]);
    const [backlog, active] = planning.sections.value;
    expect(backlog?.kind).toBe("backlog");
    expect(backlog?.issues).toHaveLength(4);
    expect(active).toMatchObject({ kind: "active", sprint: { id: 42 } });
    // Reste à faire : les tickets terminés du sprint actif n'y figurent pas.
    expect(active?.issues.map((item) => item.issue.key)).not.toContain("ABC-103");
    expect(planning.sprintLoad.value).toEqual({
      total: 2,
      unestimated: 0,
      velocity: null,
      unit: "pts",
    });
    expect(planning.activeSprints.value.map((sprint) => sprint.id)).toEqual([42]);
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(0);
    expect(jira.requests.some((request) => request.path.includes("graphql"))).toBe(false);
  });

  it("efface une fois l'ancien brouillon local, sans jamais en écrire", async () => {
    const { planning, platform } = context();
    platform.stored.set(DRAFT_KEY, { "7:43": { version: 1 } });
    const set = vi.spyOn(platform.store, "set");
    await planning.load();
    await vi.waitFor(() => expect(platform.stored.has(DRAFT_KEY)).toBe(false));
    await planning.addGoal("Un objectif");
    expect(set.mock.calls.some(([key]) => key.startsWith("sprint-planning."))).toBe(false);
  });

  it("la recherche filtre la colonne de gauche et les swimlanes", async () => {
    const { planning } = context();
    await planning.load();
    planning.setSearch("panier");
    const backlog = planning.sections.value.find((section) => section.kind === "backlog");
    expect(backlog?.issues.map((item) => item.issue.key)).toEqual(["ABC-202", "ABC-204"]);
    expect(planning.unassigned.value.map((item) => item.issue.key)).toEqual(["ABC-210"]);
    planning.setSearch("introuvable");
    expect(planning.unassigned.value).toEqual([]);
    // La charge ignore la recherche.
    expect(planning.sprintLoad.value?.total).toBe(2);
  });

  it("reste absent en Kanban et ignore les lectures d'un board quitté", async () => {
    const { planning, configuration, jira } = context();
    configuration.value = { ...configuration.value, boardType: "kanban" };
    await planning.load();
    expect(jira.requests).toHaveLength(0);
    configuration.value = { ...configuration.value, boardType: "scrum" };
    const pending = planning.load();
    planning.reset();
    await pending;
    expect(planning.snapshot.value).toBeNull();
    expect(planning.loading.value).toBe(false);
    planning.dispose();
    await planning.load();
    expect(planning.snapshot.value).toBeNull();
  });

  it("la déconnexion efface les anciens brouillons du site", async () => {
    const { platform } = context();
    platform.stored.set(DRAFT_KEY, {});
    await forgetPlanningDrafts(platform.store, "https://acme.atlassian.net");
    expect(platform.stored.has(DRAFT_KEY)).toBe(false);
  });
});

describe("Sprint Planning en direct : objectifs texte", () => {
  it("ajouter un objectif écrit E8 puis E5 une fois, relit le sprint et le journalise", async () => {
    const { planning, inspect, audit } = context();
    await planning.load();
    await planning.addGoal("Améliorer la compréhension des erreurs");
    expect(planning.error.value).toBeNull();
    expect(planning.notice.value).toBeNull();
    expect(inspect().writes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /rest/agile/1.0/sprint/43",
      "PUT /rest/agile/1.0/sprint/43/properties/com.scrumboardmac.sprintgoals.v1",
    ]);
    expect(goalTitles(planning)).toEqual([
      "Simplifier le paiement",
      "Rendre le panier plus rapide",
      "Améliorer la compréhension des erreurs",
    ]);
    expect(planning.busy.value).toBe(false);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({
      action: "sprint planning",
      issueKey: null,
      to: PREPARED,
      outcome: "réussi",
      detail: null,
      detailMessage: { key: "Enregistré et vérifié dans Jira." },
    });
  });

  it("renommer garde l'identifiant : le ticket posé reste sur son objectif", async () => {
    const { planning, inspect } = context();
    await planning.load();
    const goal = planning.lanes.value[0]?.goal;
    if (!goal) throw new Error("objectif attendu");
    await planning.placeIssue("ABC-201", goal.id);
    expect(planning.lanes.value[0]?.issues.map((item) => item.issue.key)).toEqual(["ABC-201"]);
    expect(inspect().issueKeys).toContain("ABC-201");
    await planning.renameGoal(goal.id, "Fluidifier la commande");
    expect(planning.lanes.value[0]?.goal).toMatchObject({
      id: goal.id,
      title: "Fluidifier la commande",
    });
    expect(planning.lanes.value[0]?.issues.map((item) => item.issue.key)).toEqual(["ABC-201"]);
    // Titre inchangé : rien n'est écrit.
    const writes = inspect().writes.length;
    await planning.renameGoal(goal.id, " Fluidifier la commande ");
    expect(inspect().writes).toHaveLength(writes);
  });

  it("déplacer et supprimer réécrivent l'ordre et le texte", async () => {
    const { planning, inspect } = context();
    await planning.load();
    const [first, second] = planning.lanes.value.map((lane) => lane.goal.id);
    await planning.moveGoal(second ?? "", -1);
    expect(goalTitles(planning)).toEqual([
      "Rendre le panier plus rapide",
      "Simplifier le paiement",
    ]);
    await planning.removeGoal(first ?? "");
    expect(goalTitles(planning)).toEqual(["Rendre le panier plus rapide"]);
    // La ligne gardée conserve sa puce saisie dans Jira.
    expect(inspect().sprint.goal).toBe("🎯 Rendre le panier plus rapide");
  });

  it("texte changé dans Jira depuis l'affichage : rien n'est écrit, la page est relue", async () => {
    const { planning, inspect, audit } = context();
    await planning.load();
    inspect().sprint.goal = "Objectif modifié par un collègue";
    await planning.addGoal("Notre proposition");
    expect(inspect().writes).toHaveLength(0);
    expect(notice(planning)).toBe(
      "Le texte des objectifs a changé dans Jira depuis son affichage. Rien n’a été écrit : la page a été relue, refaites votre modification.",
    );
    expect(goalTitles(planning)).toEqual(["Objectif modifié par un collègue"]);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry?.outcome).toBe("échec");
  });

  it("E8 confirmé puis E5 refusé : avis partiel, aucune écriture rejouée", async () => {
    const { planning, jira, inspect } = context();
    await planning.load();
    jira.on("PUT", "/rest/agile/1.0/sprint/43/properties/com.scrumboardmac.sprintgoals.v1", {
      status: 403,
    });
    await planning.addGoal("Un nouvel objectif");
    expect(notice(planning)).toMatch(/^Étapes confirmées : texte des objectifs\. /);
    expect(notice(planning)).toContain("Aucune écriture n’a été rejouée");
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(2);
    expect(inspect().sprint.goal).toContain("Un nouvel objectif");
    // La page relue montre le texte confirmé.
    expect(goalTitles(planning)).toContain("Un nouvel objectif");
  });

  it("un refus de la porte avant l'envoi se lit « rien n'a été envoyé »", async () => {
    const { planning, gate, staleBoard, inspect, audit } = context();
    await planning.load();
    const hold = holdGate(gate);
    const adding = planning.addGoal("Trop tard");
    staleBoard();
    hold.release();
    await Promise.all([hold.held, adding]);
    expect(inspect().writes).toHaveLength(0);
    expect(notice(planning)).toBe("Rien n'a été envoyé à Jira : le board a changé avant l'envoi.");
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({
      outcome: "échec",
      detailMessage: { key: "Rien n'a été envoyé à Jira : le board a changé avant l'envoi." },
    });
  });
});

describe("Sprint Planning en direct : tickets", () => {
  it("un ticket du backlog posé sur un objectif rejoint le sprint, avec sa provenance", async () => {
    const { planning, inspect } = context();
    await planning.load();
    const goal = planning.lanes.value[1]?.goal;
    await planning.placeIssue("ABC-202", goal?.id ?? null);
    expect(inspect().writes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /rest/agile/1.0/sprint/43/issue",
      "PUT /rest/agile/1.0/sprint/43/properties/com.scrumboardmac.sprintgoals.v1",
    ]);
    const [item] = planning.lanes.value[1]?.issues ?? [];
    expect(item).toMatchObject({ issue: { key: "ABC-202" }, origin: { kind: "backlog" } });
    expect(planning.lanes.value[1]).toMatchObject({ issueCount: 1, points: 3 });
    expect(planning.sprintLoad.value?.total).toBe(5);
  });

  it("« Sans objectif » depuis le backlog : E9 seulement", async () => {
    const { planning, inspect } = context();
    await planning.load();
    await planning.placeIssue("ABC-204", null);
    expect(inspect().writes.map(({ path }) => path)).toEqual(["/rest/agile/1.0/sprint/43/issue"]);
    expect(planning.unassigned.value.map((item) => item.issue.key)).toEqual(["ABC-210", "ABC-204"]);
  });

  it("Goals Atlassian : un ticket du backlog est détaché du Goal de son champ natif, puis lié", async () => {
    const GOAL_A = "ari:cloud:townsquare:site:goal/a";
    const GOAL_OLD = "ari:cloud:townsquare:site:goal/old";
    const goals = fakeGoals({
      workItems: { [GOAL_A]: ["ABC-210"] },
      names: { [GOAL_A]: "Paiement", [GOAL_OLD]: "Ancien" },
    });
    const { planning, inspect } = context({
      configuration: { goalSource: "atlassianGoals", goalsFieldId: "customfield_10500" },
      goals,
      issueFields: { "ABC-202": { customfield_10500: [{ id: GOAL_OLD }] } },
    });
    await planning.load();
    expect(planning.lanes.value.map((lane) => lane.goal.id)).toEqual([GOAL_A]);
    const issueId = planning.sections.value
      .find((section) => section.kind === "backlog")
      ?.issues.find((item) => item.issue.key === "ABC-202")?.issue.id;
    await planning.placeIssue("ABC-202", GOAL_A);
    expect(inspect().writes.map(({ path }) => path)).toEqual(["/rest/agile/1.0/sprint/43/issue"]);
    expect(goals.setLink.mock.calls).toEqual([
      ["goal.unlink", GOAL_OLD, issueId],
      ["goal.link", GOAL_A, issueId],
    ]);
  });

  it("Goals Atlassian : « Sans objectif » depuis le backlog détache le ticket du Goal de son champ natif", async () => {
    const GOAL_A = "ari:cloud:townsquare:site:goal/a";
    const GOAL_OLD = "ari:cloud:townsquare:site:goal/old";
    const goals = fakeGoals({
      workItems: { [GOAL_A]: ["ABC-210"] },
      names: { [GOAL_A]: "Paiement", [GOAL_OLD]: "Ancien" },
    });
    const { planning, inspect } = context({
      configuration: { goalSource: "atlassianGoals", goalsFieldId: "customfield_10500" },
      goals,
      issueFields: { "ABC-202": { customfield_10500: [{ id: GOAL_OLD }] } },
    });
    await planning.load();
    const issueId = planning.sections.value
      .find((section) => section.kind === "backlog")
      ?.issues.find((item) => item.issue.key === "ABC-202")?.issue.id;
    await planning.placeIssue("ABC-202", null);
    expect(inspect().writes.map(({ path }) => path)).toEqual(["/rest/agile/1.0/sprint/43/issue"]);
    expect(goals.setLink.mock.calls).toEqual([["goal.unlink", GOAL_OLD, issueId]]);
  });

  it("Goals Atlassian : une relecture pendant une recherche de Goal ne la laisse pas en cours", async () => {
    const goals = fakeGoals({
      workItems: {},
      names: { "ari:cloud:townsquare:site:goal/a": "Paiement" },
    });
    const { planning } = context({
      configuration: { goalSource: "atlassianGoals", goalsFieldId: "customfield_10500" },
      goals,
    });
    await planning.load();
    // Seule la recherche du site est retenue ; la relecture du planning passe.
    const search = goals.searchGoals;
    let release = () => {};
    goals.searchGoals = () =>
      new Promise((resolve) => {
        release = () => resolve(search());
      });
    const searching = planning.searchGoals("pai");
    expect(planning.goalSearch.value?.loading).toBe(true);
    goals.searchGoals = search;
    await planning.refresh();
    release();
    await searching;
    expect(planning.goalSearch.value).toMatchObject({ query: "pai", loading: false });
  });

  it("le reste à faire du sprint actif et un objectif inconnu ne déclenchent rien", async () => {
    const { planning, jira } = context();
    await planning.load();
    const before = jira.requests.length;
    await planning.placeIssue("ABC-101", planning.lanes.value[0]?.goal.id ?? null);
    await planning.placeIssue("ABC-201", "objectif-inconnu");
    await planning.placeIssue("FOREIGN-1", null);
    expect(jira.requests).toHaveLength(before);
  });

  it("renvoyer au backlog écrit E10 puis relit : le ticket quitte le sprint", async () => {
    const { planning, inspect } = context();
    await planning.load();
    await planning.removeIssue("ABC-210", { kind: "backlog" });
    expect(inspect().writes.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: "POST", path: "/rest/agile/1.0/backlog/issue", body: { issues: ["ABC-210"] } },
    ]);
    expect(planning.unassigned.value).toEqual([]);
    const backlog = planning.sections.value.find((section) => section.kind === "backlog");
    expect(backlog?.issues.map((item) => item.issue.key)).toContain("ABC-210");
  });

  it("aucun retrait d'un ticket hors du sprint ni vers un sprint inconnu", async () => {
    const { planning, jira } = context();
    await planning.load();
    const before = jira.requests.length;
    await planning.removeIssue("ABC-201", { kind: "backlog" });
    await planning.removeIssue("ABC-210", { kind: "sprint", sprintId: 42 });
    expect(jira.requests).toHaveLength(before);
  });

  it("ouvre la fiche native d'un ticket connu du planning seulement", async () => {
    const { planning, openIssue } = context();
    await planning.load();
    planning.openIssue("ABC-201");
    planning.openIssue("ABC-101");
    planning.openIssue("FOREIGN-1");
    expect(openIssue.mock.calls).toEqual([["ABC-201"], ["ABC-101"]]);
  });
});

describe("Sprint Planning en direct : vélocité", () => {
  it("vélocité validée : E5 relu, comparée à la charge", async () => {
    const { planning, inspect } = context();
    await planning.load();
    await planning.saveVelocity(20);
    expect(inspect().writes.map(({ method }) => method)).toEqual(["PUT"]);
    expect(inspect().document).toMatchObject({ velocity: 20 });
    expect(planning.sprintLoad.value).toMatchObject({ total: 2, velocity: 20 });
    await planning.saveVelocity(20);
    expect(inspect().writes).toHaveLength(1);
  });

  it("vélocité invalide : refusée sans écriture", async () => {
    const { planning, inspect } = context();
    await planning.load();
    await planning.saveVelocity(-1);
    expect(inspect().writes).toHaveLength(0);
    expect(notice(planning)).toBe(
      "La vélocité doit être un nombre entre 0 et 100 000. Rien n’a été écrit.",
    );
  });
});

describe("Sprint Planning en direct : issue inconnue", () => {
  it("écriture sans réponse (délai dépassé) : jamais rejouée, journalisée « incertain »", async () => {
    const { planning, jira, audit } = context({ timeoutMs: 20 });
    await planning.load();
    jira.on("PUT", PROPERTY, { hang: true });
    await planning.saveVelocity(20);
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(planning.busy.value).toBe(false);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({ action: "sprint planning", to: PREPARED, outcome: "incertain" });
  });
});

describe("Sprint Planning en direct : un geste à la fois", () => {
  it("un geste attend la porte du board ; pendant ce temps, les autres sont ignorés", async () => {
    const { planning, gate, inspect } = context();
    await planning.load();
    const hold = holdGate(gate);
    const adding = planning.addGoal("Attendre son tour");
    expect(planning.busy.value).toBe(true);
    expect(planning.gesturesDisabled.value).toBe(true);
    await planning.addGoal("Geste ignoré");
    await planning.saveVelocity(12);
    await planning.selectSprint(43);
    await planning.refresh();
    expect(inspect().writes).toHaveLength(0);
    hold.release();
    await Promise.all([hold.held, adding]);
    expect(planning.busy.value).toBe(false);
    expect(goalTitles(planning)).toContain("Attendre son tour");
    expect(goalTitles(planning)).not.toContain("Geste ignoré");
    expect(inspect().writes.filter(({ method }) => method === "POST")).toHaveLength(1);
  });

  it("une autre écriture du board en cours désactive les gestes", async () => {
    const { planning, canWrite, inspect } = context();
    await planning.load();
    canWrite.value = false;
    expect(planning.gesturesDisabled.value).toBe(true);
    await planning.addGoal("Sécuriser le parcours");
    planning.closeActiveSprint(42);
    expect(inspect().writes).toHaveLength(0);
    expect(planning.pendingClosure.value).toBeNull();
    canWrite.value = true;
    expect(planning.gesturesDisabled.value).toBe(false);
  });
});

describe("Sprint Planning en direct : fenêtres natives", () => {
  it("clôture native fermée, sprint relu clos : les objectifs non atteints sont reportés", async () => {
    const { planning, openSprintDialog, activeSprint, inspect, wait } = context();
    await planning.load();
    planning.closeActiveSprint(42);
    expect(openSprintDialog).toHaveBeenCalledExactlyOnceWith(
      "complete",
      expect.objectContaining({ id: 42 }),
    );
    expect(planning.pendingClosure.value).toEqual({
      closedSprintId: 42,
      closedSprintName: "Sprint 42",
      targetSprintId: 43,
      targetSprintName: PREPARED,
    });
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    expect(planning.pendingClosure.value).toBeNull();
    // « Améliorer la stabilité » est atteint : son seul ticket est dans la dernière colonne.
    expect(goalTitles(planning)).toEqual([
      "Simplifier le paiement",
      "Rendre le panier plus rapide",
      "Finaliser le parcours de paiement",
    ]);
    expect(report(planning)).toBe(`Objectifs non atteints reportés dans ${PREPARED}.`);
    expect(planning.carryOverReport.value).toMatchObject({
      closedSprintName: "Sprint 42",
      targetSprintName: PREPARED,
      written: true,
      goals: [
        {
          title: "Finaliser le parcours de paiement",
          status: "carried",
          linkedKeys: ["ABC-101", "ABC-102"],
        },
        { title: "Améliorer la stabilité", status: "allDone", linkedKeys: ["ABC-103"] },
      ],
      incomplete: false,
    });
    expect(inspect().writes.map(({ method }) => method)).toEqual(["POST", "PUT"]);
    // Sprint clos dès la première relecture : aucune attente.
    expect(wait).not.toHaveBeenCalled();
    // Plus aucun sprint actif : démarrer devient possible.
    expect(planning.activeSprints.value).toEqual([]);
    expect(planning.startDisabledReason.value).toBeNull();
    planning.startSprint();
    expect(openSprintDialog).toHaveBeenLastCalledWith("start", expect.objectContaining({ id: 43 }));
  });

  it("report : « terminé » veut dire dernière colonne VISIBLE, quelle que soit la catégorie du statut", async () => {
    const { planning, activeSprint } = context({
      configuration: {
        columns: [
          column("todo", "À faire", ["4"], 0),
          // Dernière colonne visible : statuts « À faire » (1) et « En cours » (3), non terminés.
          column("ready", "Prêt à livrer", ["1", "3"], 1),
          // Dernière colonne réelle, masquée : « Terminé » (6) n'y compte pas.
          { ...column("done", "Terminé", ["6"], 2), hidden: true, isDone: true },
        ],
      },
    });
    await planning.load();
    planning.closeActiveSprint(42);
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    // « Finaliser le parcours de paiement » (ABC-101, ABC-102) est atteint ; « Améliorer la
    // stabilité » (ABC-103, colonne masquée) ne l'est pas et seul lui est reporté.
    expect(goalTitles(planning)).toEqual([
      "Simplifier le paiement",
      "Rendre le panier plus rapide",
      "Améliorer la stabilité",
    ]);
  });

  it("report en Goals Atlassian : le Goal non atteint est épinglé (E5), sans E8", async () => {
    const PAY = "ari:cloud:townsquare:site:goal/pay";
    const STAB = "ari:cloud:townsquare:site:goal/stab";
    const goals = fakeGoals({
      workItems: { [PAY]: ["ABC-101", "ABC-102"], [STAB]: ["ABC-103"] },
      names: { [PAY]: "Finaliser le paiement", [STAB]: "Stabilité" },
    });
    const { planning, activeSprint, inspect } = context({
      configuration: { goalSource: "atlassianGoals", goalsFieldId: "customfield_10500" },
      goals,
    });
    await planning.load();
    planning.closeActiveSprint(42);
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    expect(planning.error.value).toBeNull();
    // ABC-102 n'est pas terminé : seul « Finaliser le paiement » est épinglé dans le sprint 43.
    expect(inspect().writes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `PUT ${PROPERTY}`,
    ]);
    expect(inspect().document).toMatchObject({ atlassianGoalIds: [PAY] });
    expect(goals.setLink).not.toHaveBeenCalled();
    expect(planning.carryOverReport.value?.incomplete).toBe(false);
  });

  it("report en Goals Atlassian lus en partie : le compte rendu le signale", async () => {
    const PAY = "ari:cloud:townsquare:site:goal/pay";
    const goals = fakeGoals({
      workItems: { [PAY]: ["ABC-101", "ABC-102"] },
      names: { [PAY]: "Finaliser le paiement" },
    });
    (goals as { lastWorkItemsIssue: string | null }).lastWorkItemsIssue = "réponse tronquée";
    const { planning, activeSprint } = context({
      configuration: { goalSource: "atlassianGoals", goalsFieldId: "customfield_10500" },
      goals,
    });
    await planning.load();
    planning.closeActiveSprint(42);
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    expect(planning.carryOverReport.value?.incomplete).toBe(true);
  });

  it("fenêtre de clôture annulée : relu à 0, 1, 3, 6 et 10 s, sprint encore actif, rien n'est reporté", async () => {
    const { planning, inspect, wait, jira, audit } = context();
    await planning.load();
    planning.closeActiveSprint(42);
    const before = jira.requests.length;
    await planning.afterNativeDialog();
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 3000, 4000]);
    expect(
      jira.requests.slice(before).filter(({ path }) => path === "/rest/agile/1.0/sprint/42"),
    ).toHaveLength(5);
    expect(planning.pendingClosure.value).toBeNull();
    expect(inspect().writes).toHaveLength(0);
    expect(report(planning)).toBe("Le sprint est toujours actif : rien n'a été reporté.");
    expect(planning.carryOverReport.value).toMatchObject({ written: false, goals: [] });
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({
      action: "sprint planning",
      issueKey: null,
      from: "Sprint 42",
      to: PREPARED,
      outcome: "échec",
      detailMessage: { key: "Le sprint est toujours actif : rien n'a été reporté." },
    });
  });

  it("clôture lente : sprint encore actif à 0 et 1 s, clos à 3 s, les objectifs sont reportés", async () => {
    const { planning, activeSprint, inspect, wait, audit } = context();
    await planning.load();
    planning.closeActiveSprint(42);
    wait.mockImplementation(async () => {
      // Jira clôt le sprint pendant la deuxième attente (entre 1 et 3 s).
      if (wait.mock.calls.length === 2) activeSprint.state = "closed";
    });
    const checking = planning.afterNativeDialog();
    // Pendant la vérification, l'en-tête dit « Clôture en cours » et les gestes attendent.
    expect(planning.pendingClosure.value).not.toBeNull();
    expect(planning.gesturesDisabled.value).toBe(true);
    await checking;
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    expect(inspect().writes.map(({ method }) => method)).toEqual(["POST", "PUT"]);
    expect(report(planning)).toBe(`Objectifs non atteints reportés dans ${PREPARED}.`);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({ from: "Sprint 42", to: PREPARED, outcome: "réussi" });
  });

  it("un second refresh pendant la vérification est ignoré : un seul report", async () => {
    const { planning, activeSprint, inspect, wait, audit } = context();
    await planning.load();
    planning.closeActiveSprint(42);
    let release = () => {};
    wait.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = planning.afterNativeDialog();
    await vi.waitFor(() => expect(wait).toHaveBeenCalledTimes(1));
    await planning.afterNativeDialog();
    expect(wait).toHaveBeenCalledTimes(1);
    activeSprint.state = "closed";
    release();
    await first;
    expect(inspect().writes.map(({ method }) => method)).toEqual(["POST", "PUT"]);
    expect(await audit.list("https://acme.atlassian.net")).toHaveLength(1);
    expect(planning.pendingClosure.value).toBeNull();
  });

  it("le compte rendu reste affiché après un autre geste, jusqu'à sa fermeture ou au changement de board", async () => {
    const { planning, activeSprint, configuration, openSprintDialog, audit } = context();
    await planning.load();
    planning.closeActiveSprint(42);
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    expect(planning.carryOverReport.value).not.toBeNull();
    await planning.addGoal("Sécuriser le parcours");
    expect(planning.carryOverReport.value).not.toBeNull();
    planning.dismissCarryOverReport();
    expect(planning.carryOverReport.value).toBeNull();

    // Sprint de nouveau actif : le compte rendu précédent reste tant qu'aucune fenêtre ne s'ouvre.
    activeSprint.state = "active";
    await planning.refresh();
    planning.closeActiveSprint(42);
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    expect(planning.carryOverReport.value).not.toBeNull();
    activeSprint.state = "active";
    await planning.refresh();
    openSprintDialog.mockReturnValueOnce(false);
    planning.closeActiveSprint(42);
    expect(planning.carryOverReport.value).not.toBeNull();
    // Nouvelle fenêtre de clôture demandée : l'ancien compte rendu est effacé pendant la vérification.
    planning.closeActiveSprint(42);
    expect(planning.pendingClosure.value).not.toBeNull();
    expect(planning.carryOverReport.value).toBeNull();
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    // Objectif non atteint déjà dans la cible : « rien de nouveau », journalisé « réussi ».
    expect(report(planning)).toBe("Sprint clos : rien de nouveau à reporter.");
    expect(planning.carryOverReport.value?.goals[0]).toMatchObject({ status: "alreadyThere" });
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({
      from: "Sprint 42",
      to: PREPARED,
      outcome: "réussi",
      detailMessage: { key: "Sprint clos : rien de nouveau à reporter." },
    });
    configuration.value = { ...configuration.value, boardId: 8 };
    await planning.load();
    expect(planning.carryOverReport.value).toBeNull();
  });

  it("relectures en erreur aux cinq passages : résumé d'échec, aucune écriture, journal « échec »", async () => {
    const { planning, jira, inspect, audit } = context({ maxGetAttempts: 1 });
    await planning.load();
    planning.closeActiveSprint(42);
    jira.on("GET", "/rest/agile/1.0/sprint/42", { status: 500 });
    await planning.afterNativeDialog();
    expect(jira.sent("GET", "/rest/agile/1.0/sprint/42").length).toBeGreaterThanOrEqual(5);
    expect(inspect().writes).toHaveLength(0);
    expect(report(planning)).toMatch(/^Report des objectifs non atteints : /);
    expect(report(planning)).not.toContain("toujours actif");
    expect(planning.carryOverReport.value).toMatchObject({ written: false, goals: [] });
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({ from: "Sprint 42", outcome: "échec" });
  });

  it("une relecture en erreur puis le sprint actif : « toujours actif »", async () => {
    const { planning, jira, activeSprint, inspect } = context({ maxGetAttempts: 1 });
    await planning.load();
    planning.closeActiveSprint(42);
    jira.on("GET", "/rest/agile/1.0/sprint/42", { status: 500 }, () => ({
      status: 200,
      json: activeSprint,
    }));
    await planning.afterNativeDialog();
    expect(inspect().writes).toHaveLength(0);
    expect(report(planning)).toBe("Le sprint est toujours actif : rien n'a été reporté.");
  });

  it("report refusé par Jira après la clôture : non écrit au compte rendu, journal « échec »", async () => {
    const { planning, jira, activeSprint, audit } = context();
    await planning.load();
    planning.closeActiveSprint(42);
    activeSprint.state = "closed";
    jira.on("PUT", PROPERTY, { status: 403 });
    await planning.afterNativeDialog();
    expect(planning.carryOverReport.value).toMatchObject({
      written: false,
      goals: [{ title: "Finaliser le parcours de paiement", status: "carried" }, {}],
    });
    expect(report(planning)).toMatch(/^Report des objectifs non atteints : Étapes confirmées/);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({ from: "Sprint 42", to: PREPARED, outcome: "échec" });
  });

  it("report sans réponse de Jira : journal « incertain », rien n'est rejoué", async () => {
    const { planning, jira, activeSprint, audit } = context({ timeoutMs: 20 });
    await planning.load();
    planning.closeActiveSprint(42);
    activeSprint.state = "closed";
    jira.on("PUT", PROPERTY, { hang: true });
    await planning.afterNativeDialog();
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(planning.carryOverReport.value?.written).toBe(false);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({ from: "Sprint 42", outcome: "incertain" });
  });

  it("deux sprints actifs : le sprint choisi ouvre sa fenêtre et le report lit ses objectifs", async () => {
    const { planning, openSprintDialog, secondActiveSprint, inspect, audit } = context({
      secondActiveSprint: true,
    });
    await planning.load();
    expect(planning.activeSprints.value.map((sprint) => sprint.id)).toEqual([42, 45]);
    planning.closeActiveSprint(45);
    expect(openSprintDialog).toHaveBeenCalledExactlyOnceWith(
      "complete",
      expect.objectContaining({ id: 45, name: "Sprint 45 — Notifications" }),
    );
    expect(planning.pendingClosure.value).toMatchObject({
      closedSprintId: 45,
      closedSprintName: "Sprint 45 — Notifications",
      targetSprintId: 43,
    });
    if (secondActiveSprint) secondActiveSprint.state = "closed";
    await planning.afterNativeDialog();
    expect(goalTitles(planning)).toEqual([
      "Simplifier le paiement",
      "Rendre le panier plus rapide",
      SECOND_ACTIVE_GOAL,
    ]);
    expect(planning.carryOverReport.value).toMatchObject({
      closedSprintName: "Sprint 45 — Notifications",
      written: true,
      goals: [{ title: SECOND_ACTIVE_GOAL, status: "carried", linkedKeys: ["ABC-301"] }],
    });
    expect(inspect().sprint.goal).not.toContain("Finaliser le parcours de paiement");
    // Le sprint 42 reste actif : démarrer reste désactivé.
    expect(planning.activeSprints.value.map((sprint) => sprint.id)).toEqual([42]);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({ from: "Sprint 45 — Notifications", to: PREPARED });
  });

  it("un sprint qui n'est pas actif sur le board n'ouvre aucune fenêtre", async () => {
    const { planning, openSprintDialog } = context();
    await planning.load();
    planning.closeActiveSprint(45);
    expect(openSprintDialog).not.toHaveBeenCalled();
    expect(planning.pendingClosure.value).toBeNull();
  });

  it("une relecture sans clôture demandée ne reporte rien", async () => {
    const { planning, activeSprint, inspect } = context();
    await planning.load();
    activeSprint.state = "closed";
    await planning.afterNativeDialog();
    expect(inspect().writes).toHaveLength(0);
    expect(planning.activeSprints.value).toEqual([]);
    expect(planning.carryOverReport.value).toBeNull();
  });

  it("démarrer reste désactivé, avec sa raison, tant qu'un sprint est actif", async () => {
    const { planning, openSprintDialog } = context();
    await planning.load();
    expect(planning.startDisabledReason.value).toEqual({
      key: "Un sprint est actif : clôturez-le avant de démarrer celui-ci.",
    });
    planning.startSprint();
    expect(openSprintDialog).not.toHaveBeenCalled();
  });

  it("sans page Jira hôte : la fenêtre n'est pas ouverte et aucune clôture n'attend", async () => {
    const { planning, openSprintDialog } = context();
    openSprintDialog.mockReturnValue(false);
    await planning.load();
    planning.closeActiveSprint(42);
    expect(planning.pendingClosure.value).toBeNull();
    expect(notice(planning)).toBe(
      "La fenêtre de Jira ne s'ouvre que depuis le board Jira qui héberge Sprint Goals Board.",
    );
  });
});

describe("Sprint Planning en direct : filtres (lecture seule)", () => {
  const BOARD_ISSUES = "/rest/agile/1.0/board/7/issue";
  const SCOPE =
    "sprint in (43,42) OR sprint is EMPTY OR (sprint in closedSprints() AND statusCategory != Done)";
  const ALEX = { assignee: { accountId: "acc-1", displayName: "Alex Martin" } };
  const BUG = { issuetype: { id: "10004", name: "Bug", subtask: false } };
  const BLOCKED = {
    issuelinks: [
      {
        type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
        inwardIssue: { key: "ABC-999", fields: { status: statusJson("3", "Open") } },
      },
    ],
  };
  const quick = (id: number, jql: string): JiraQuickFilter => ({
    id,
    name: `Filtre ${id}`,
    jql,
    description: null,
    position: id,
  });
  const keysOf = (items: readonly { issue: { key: string } }[]) =>
    items.map((item) => item.issue.key);
  /** Cartes affichées : swimlanes, « Sans objectif » et colonne de gauche. */
  const shown = (planning: PlanningModel) => ({
    lanes: planning.lanes.value.flatMap((lane) => keysOf(lane.issues)),
    unassigned: keysOf(planning.unassigned.value),
    sources: planning.sections.value.flatMap((section) => keysOf(section.issues)),
  });
  const totals = (planning: PlanningModel) => ({
    load: planning.sprintLoad.value,
    lanes: planning.lanes.value.map(({ issueCount, points, unestimated }) => ({
      issueCount,
      points,
      unestimated,
    })),
  });
  const issueFields = {
    "ABC-210": ALEX,
    "ABC-201": ALEX,
    "ABC-202": BUG,
    "ABC-203": BLOCKED,
    "ABC-204": { ...BUG, status: statusJson("3", "En cours") },
  };
  /** Faux Jira qui évalue les filtres rapides selon le JQL reçu ; un JQL inconnu est refusé. */
  function answering(
    jira: ReturnType<typeof context>["jira"],
    byJql: Record<string, readonly string[]>,
  ) {
    jira.on("GET", BOARD_ISSUES, (request) => {
      const keys = byJql[request.url.searchParams.get("jql") ?? ""];
      if (!keys) return { status: 400, json: { errorMessages: ["JQL refusé par Jira"] } };
      return {
        status: 200,
        json: { total: keys.length, issues: keys.map((key) => issueJson(key)) },
      };
    });
  }

  it("menu Personne : swimlanes, « Sans objectif » et sources réduites, totaux et charge inchangés", async () => {
    const { planning } = context({ issueFields });
    await planning.load();
    const before = totals(planning);
    planning.setFilters({ ...NO_PLANNING_FILTERS, assigneeIds: new Set(["acc-1"]) });
    expect(shown(planning)).toEqual({ lanes: [], unassigned: ["ABC-210"], sources: ["ABC-201"] });
    expect(totals(planning)).toEqual(before);
    planning.setFilters({ ...NO_PLANNING_FILTERS, includeUnassigned: true });
    expect(shown(planning).unassigned).toEqual([]);
    expect(shown(planning).sources).toEqual(
      expect.arrayContaining(["ABC-202", "ABC-203", "ABC-204"]),
    );
    expect(shown(planning).sources).not.toContain("ABC-201");
  });

  it("Type + Statut + recherche : intersection", async () => {
    const { planning } = context({ issueFields });
    await planning.load();
    planning.setSearch("panier");
    planning.setFilters({
      ...NO_PLANNING_FILTERS,
      issueTypeIds: new Set(["10004"]),
      statusIds: new Set(["1"]),
    });
    expect(shown(planning)).toEqual({ lanes: [], unassigned: [], sources: ["ABC-202"] });
    expect(planning.activeFilterCount.value).toBe(3);
  });

  it("options : valeurs réellement présentes dans le sprint et les sources, avec leur nombre", async () => {
    const { planning } = context({ issueFields });
    await planning.load();
    const options = planning.filterOptions.value;
    expect(options?.assignees).toContainEqual({ value: "acc-1", label: "Alex Martin", count: 2 });
    // Deux Bugs du backlog et une anomalie du reste à faire du sprint actif.
    expect(options?.issueTypes).toContainEqual({ value: "10004", label: "Bug", count: 3 });
    expect(options?.parents.map((option) => option.value)).toEqual(
      expect.arrayContaining(["ABC-90", "ABC-91"]),
    );
    // Les options ne dépendent pas des filtres actifs.
    planning.setFilters({ ...NO_PLANNING_FILTERS, assigneeIds: new Set(["acc-1"]) });
    expect(planning.filterOptions.value).toEqual(options);
  });

  it("« Bloqués » : seuls les tickets bloqués par un lien, les autres pastilles sont ignorées", async () => {
    const { planning } = context({ issueFields });
    await planning.load();
    planning.toggleBlocked();
    // Backlog, puis reste à faire du sprint actif.
    expect(shown(planning)).toEqual({ lanes: [], unassigned: [], sources: ["ABC-203", "ABC-102"] });
    planning.setFilters({
      ...planning.filters.value,
      quickFilters: new Set(["blocked", "addedAfterStart", "carriedOver"]),
    });
    expect([...planning.filters.value.quickFilters]).toEqual(["blocked"]);
    planning.toggleBlocked();
    expect(planning.filters.value.quickFilters.size).toBe(0);
  });

  it("filtre rapide Jira : Jira évalue son JQL sur le périmètre du planning, croisé avec les cartes", async () => {
    const { planning, jira, quickFilters } = context({ issueFields });
    quickFilters.value = [quick(1, "assignee = currentUser() ORDER BY rank")];
    answering(jira, {
      [`(assignee = currentUser()) AND (${SCOPE})`]: ["ABC-201", "ABC-210", "ABC-999"],
    });
    await planning.load();
    const before = totals(planning);
    const writes = jira.requests.filter(isWriteRequest).length;
    await planning.toggleJiraQuickFilter(1);
    expect(planning.applyingQuickFilters.value).toBe(false);
    expect(shown(planning)).toEqual({ lanes: [], unassigned: ["ABC-210"], sources: ["ABC-201"] });
    expect(totals(planning)).toEqual(before);
    const [request] = jira.sent("GET", BOARD_ISSUES);
    expect(request?.url.searchParams.get("fields")).toBe("issuetype,status");
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(writes);
    // Désactivé : plus aucune restriction, sans nouvelle lecture.
    await planning.toggleJiraQuickFilter(1);
    expect(planning.filters.value.jiraQuickFilterKeys).toBeNull();
    expect(jira.sent("GET", BOARD_ISSUES)).toHaveLength(1);
  });

  it("deux filtres rapides Jira : intersection", async () => {
    const { planning, jira, quickFilters } = context({ issueFields });
    quickFilters.value = [quick(1, "a = 1"), quick(2, "b = 2")];
    answering(jira, {
      [`(a = 1) AND (${SCOPE})`]: ["ABC-201", "ABC-202", "ABC-210"],
      [`(b = 2) AND (${SCOPE})`]: ["ABC-202", "ABC-210"],
    });
    await planning.load();
    await planning.toggleJiraQuickFilter(1);
    await planning.toggleJiraQuickFilter(2);
    expect(shown(planning)).toEqual({ lanes: [], unassigned: ["ABC-210"], sources: ["ABC-202"] });
  });

  it("JQL refusé : filtres rapides désactivés, avis traduit, autres filtres gardés, une seule lecture", async () => {
    const { planning, jira, quickFilters } = context({ issueFields });
    quickFilters.value = [quick(1, "champ ~ ")];
    answering(jira, {});
    await planning.load();
    planning.setFilters({ ...NO_PLANNING_FILTERS, assigneeIds: new Set(["acc-1"]) });
    await planning.toggleJiraQuickFilter(1);
    expect(jira.sent("GET", BOARD_ISSUES)).toHaveLength(1);
    expect(planning.filters.value.jiraQuickFilterIds.size).toBe(0);
    expect(planning.filters.value.jiraQuickFilterKeys).toBeNull();
    expect([...planning.filters.value.assigneeIds]).toEqual(["acc-1"]);
    expect(notice(planning)).toMatch(
      /^Filtre rapide Jira inapplicable : .+ Les filtres rapides Jira ont été désactivés\.$/,
    );
    const notified = planning.notice.value;
    if (!notified) throw new Error("avis attendu");
    expect(renderMessage(notified, "en")).toMatch(
      /^Jira quick filter cannot be applied: .+ Jira quick filters have been disabled\.$/,
    );
    expect(shown(planning)).toEqual({ lanes: [], unassigned: ["ABC-210"], sources: ["ABC-201"] });
  });

  it("une réponse arrivée après la réinitialisation est ignorée", async () => {
    const { planning, jira, quickFilters } = context({ issueFields });
    quickFilters.value = [quick(1, "a = 1")];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    answering(jira, { [`(a = 1) AND (${SCOPE})`]: ["ABC-201"] });
    await planning.load();
    // Réponse de Jira retenue jusqu'à `release()`.
    const read = planning.client.boardIssues.bind(planning.client);
    planning.client.boardIssues = async (...args) => {
      await held;
      return read(...args);
    };
    const pending = planning.toggleJiraQuickFilter(1);
    expect(planning.applyingQuickFilters.value).toBe(true);
    planning.resetFilters();
    release();
    await pending;
    expect(planning.filters.value).toEqual(NO_PLANNING_FILTERS);
    expect(planning.applyingQuickFilters.value).toBe(false);
  });

  it("Réinitialiser : le compteur réunit recherche et filtres, tout est vidé", async () => {
    const { planning, jira, quickFilters } = context({ issueFields });
    quickFilters.value = [quick(1, "a = 1")];
    answering(jira, { [`(a = 1) AND (${SCOPE})`]: ["ABC-201"] });
    await planning.load();
    const all = shown(planning);
    planning.setSearch("paiement");
    planning.setFilters({ ...NO_PLANNING_FILTERS, assigneeIds: new Set(["acc-1"]) });
    planning.toggleBlocked();
    await planning.toggleJiraQuickFilter(1);
    expect(planning.activeFilterCount.value).toBe(4);
    planning.resetFilters();
    expect(planning.activeFilterCount.value).toBe(0);
    expect(planning.search.value).toBe("");
    expect(planning.filters.value).toEqual(NO_PLANNING_FILTERS);
    expect(shown(planning)).toEqual(all);
  });

  it("changement de board : les filtres du planning sont vidés, comme la recherche", async () => {
    const { planning } = context({ issueFields });
    await planning.load();
    planning.setSearch("panier");
    planning.setFilters({ ...NO_PLANNING_FILTERS, labels: new Set(["tech"]) });
    planning.toggleBlocked();
    planning.reset();
    expect(planning.search.value).toBe("");
    expect(planning.filters.value).toEqual(NO_PLANNING_FILTERS);
    expect(planning.activeFilterCount.value).toBe(0);
  });

  it("filtre actif : poser un ticket filtré sur un objectif écrit comme avant et la carte reste visible", async () => {
    const { planning, inspect, jira, quickFilters } = context({ issueFields });
    quickFilters.value = [quick(1, "a = 1")];
    answering(jira, { [`(a = 1) AND (${SCOPE})`]: ["ABC-201", "ABC-210"] });
    await planning.load();
    planning.setFilters({ ...NO_PLANNING_FILTERS, assigneeIds: new Set(["acc-1"]) });
    await planning.toggleJiraQuickFilter(1);
    const goal = planning.lanes.value[0]?.goal;
    await planning.placeIssue("ABC-201", goal?.id ?? null);
    expect(inspect().writes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /rest/agile/1.0/sprint/43/issue",
      "PUT /rest/agile/1.0/sprint/43/properties/com.scrumboardmac.sprintgoals.v1",
    ]);
    expect(shown(planning)).toEqual({ lanes: ["ABC-201"], unassigned: ["ABC-210"], sources: [] });
    expect(planning.lanes.value[0]).toMatchObject({ issueCount: 1, points: 5 });
  });

  it("filtre rapide Jira réévalué après actualisation, choix du sprint et geste", async () => {
    const { planning, jira, quickFilters } = context({ issueFields });
    quickFilters.value = [quick(1, "sprint = 43")];
    const jql = `(sprint = 43) AND (${SCOPE})`;
    const answers: Record<string, readonly string[]> = { [jql]: ["ABC-210"] };
    answering(jira, answers);
    await planning.load();
    await planning.toggleJiraQuickFilter(1);
    expect(shown(planning)).toEqual({ lanes: [], unassigned: ["ABC-210"], sources: [] });
    /** Attend une lecture de plus, avec le JQL du planning, puis les cartes de la réponse. */
    const reevaluated = async (count: number, expected: ReturnType<typeof shown>) => {
      await vi.waitFor(() => {
        expect(jira.sent("GET", BOARD_ISSUES)).toHaveLength(count);
        expect(planning.applyingQuickFilters.value).toBe(false);
      });
      expect(jira.sent("GET", BOARD_ISSUES).at(-1)?.url.searchParams.get("jql")).toBe(jql);
      expect(shown(planning)).toEqual(expected);
    };

    answers[jql] = ["ABC-210", "ABC-201"];
    await planning.refresh();
    await reevaluated(2, { lanes: [], unassigned: ["ABC-210"], sources: ["ABC-201"] });

    answers[jql] = ["ABC-201"];
    await planning.selectSprint(43);
    await reevaluated(3, { lanes: [], unassigned: [], sources: ["ABC-201"] });

    // ABC-202 rejoint le sprint 43 : Jira le retient désormais.
    answers[jql] = ["ABC-201", "ABC-202"];
    const goal = planning.lanes.value[0]?.goal;
    await planning.placeIssue("ABC-202", goal?.id ?? null);
    await reevaluated(4, { lanes: ["ABC-202"], unassigned: [], sources: ["ABC-201"] });
  });

  it("la recherche suit la règle du board : accents et casse ignorés, personne comprise", async () => {
    const { planning } = context({ issueFields });
    await planning.load();
    planning.setSearch("MEMORISER");
    expect(shown(planning)).toEqual({ lanes: [], unassigned: [], sources: ["ABC-201"] });
    planning.setSearch("alex martin");
    expect(shown(planning)).toEqual({
      lanes: [],
      unassigned: ["ABC-210"],
      sources: ["ABC-201", "ABC-104"],
    });
  });
});
