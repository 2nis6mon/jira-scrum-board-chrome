import { signal } from "@preact/signals";
import { describe, expect, it, vi } from "vitest";
import { AuditLog } from "../../src/app/model/auditLog";
import { BoardWriteGate } from "../../src/app/model/BoardWriteGate";
import { PlanningModel } from "../../src/app/model/PlanningModel";
import { setLanguage } from "../../src/i18n";
import { JiraClient } from "../../src/jira/client";
import { GoalsClient } from "../../src/jira/goals";
import { normalizeSiteUrl } from "../../src/jira/site";
import { JiraTransport } from "../../src/jira/transport";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { makeConfiguration } from "../support/jiraFixtures";
import { planningFixture } from "../support/planningFixture";

function context() {
  const fixture = planningFixture();
  const platform = fakePlatform(fixture.jira);
  const transport = new JiraTransport({
    site: normalizeSiteUrl("acme.atlassian.net"),
    fetch: platform.fetch,
  });
  const client = new JiraClient(transport);
  const audit = new AuditLog(platform.store);
  const gate = new BoardWriteGate({
    writer: transport,
    goals: new GoalsClient(transport),
    scope: { generation: () => 0, disposed: () => false },
    canEditSettings: () => true,
  });
  const configuration = signal(
    makeConfiguration({ boardId: 7, estimationFieldId: "customfield_10016" }),
  );
  const canWrite = signal(true);
  const openIssue = vi.fn();
  const create = () =>
    new PlanningModel(client, platform, {
      configuration: () => configuration.value,
      canWrite: () => canWrite.value,
      accountId: () => "u1",
      openIssue,
      write: (task) => gate.run(task),
      record: (entry) =>
        audit.append({ ...entry, at: new Date().toISOString(), site: client.site.origin }),
    });
  return {
    ...fixture,
    platform,
    configuration,
    canWrite,
    openIssue,
    create,
    gate,
    audit,
    transport,
    planning: create(),
  };
}

describe("atelier Sprint Planning", () => {
  it("copie la synthèse dans la langue courante tout en préservant le contenu du brouillon", async () => {
    const { planning, platform, jira } = context();
    await planning.load();
    planning.assignIssue("ABC-201", null);
    planning.setCapacity(12.5);
    const before = JSON.stringify(planning.draft.value);
    setLanguage("en");
    await planning.copySummary();
    expect(platform.copied.at(-1)).toContain("Planning proposal");
    expect(platform.copied.at(-1)).toContain("Proposed capacity: 12.5 pts");
    expect(platform.copied.at(-1)).toContain("To organise");
    expect(platform.copied.at(-1)).toContain("Simplifier le paiement");
    expect(JSON.stringify(planning.draft.value)).toBe(before);
    setLanguage("fr");
    await planning.copySummary();
    expect(platform.copied.at(-1)).toContain("Proposition de préparation");
    expect(platform.copied.at(-1)).toContain("Capacité envisagée : 12,5 pts");
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(0);
  });

  it("charge seulement à la demande, depuis le backlog paginé et les sprints, sans écrire ni lire les Goals", async () => {
    const { planning, jira } = context();
    expect(jira.requests).toHaveLength(0);
    await planning.load();
    expect(planning.error.value).toBeNull();
    expect(planning.selectedSprintId.value).toBe(43);
    expect(planning.issues.value.filter((item) => item.source === "backlog")).toHaveLength(4);
    expect(
      planning.issues.value
        .filter((item) => item.source === "remaining")
        .map((item) => item.issue.key),
    ).not.toContain("ABC-103");
    expect(planning.draft.value?.goals.map((goal) => goal.title)).toEqual([
      "Simplifier le paiement",
      "Rendre le panier plus rapide",
    ]);
    expect(planning.dirty.value).toBe(false);
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(0);
    expect(jira.requests.some((request) => request.path.includes("graphql"))).toBe(false);
  });

  it("conserve sélection, objectifs renommés et capacité après réouverture sans publier", async () => {
    const { planning, create, jira } = context();
    await planning.load();
    const goal = planning.draft.value?.goals[0];
    if (!goal) throw new Error("objectif attendu");
    planning.renameGoal(goal.id, "Fluidifier la commande");
    planning.assignIssue("ABC-201", goal.id);
    planning.setCapacity(21);
    await planning.refresh();
    planning.dispose();
    const reopened = create();
    await reopened.load();
    expect(reopened.draft.value?.selectedIssueKeys).toEqual(["ABC-210", "ABC-201"]);
    expect(reopened.draft.value?.links["ABC-201"]).toBe(goal.id);
    expect(reopened.draft.value?.goals[0]?.title).toBe("Fluidifier la commande");
    expect(reopened.draft.value?.capacity).toBe(21);
    expect(reopened.canPublish.value).toBe(true);
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(0);
  });

  it("la capacité seule ne transforme pas un plan inchangé en publication Jira", async () => {
    const { planning } = context();
    await planning.load();
    planning.setCapacity(30);
    await planning.refresh();
    expect(planning.draft.value?.capacity).toBe(30);
    expect(planning.dirty.value).toBe(false);
    expect(planning.canPublish.value).toBe(false);
  });

  it("une panne de stockage ne perd pas le brouillon lors d'une actualisation", async () => {
    const { planning, platform } = context();
    await planning.load();
    platform.store.set = async () => {
      throw new Error("Stockage indisponible");
    };
    planning.addGoal("Ne pas perdre notre proposition");
    await planning.refresh();
    expect(planning.draft.value?.goals.at(-1)?.title).toBe("Ne pas perdre notre proposition");
    expect(planning.dirty.value).toBe(true);
  });

  it("un échec de relecture Jira conserve le brouillon visible et copiable", async () => {
    const { planning, jira, platform } = context();
    await planning.load();
    planning.addGoal("Notre travail doit rester visible");
    jira.on("GET", "/rest/software/1.0/board/7/backlog", { status: 403 });
    await planning.refresh();
    expect(planning.error.value).not.toBeNull();
    expect(planning.draft.value?.goals.at(-1)?.title).toBe("Notre travail doit rester visible");
    expect(planning.canPublish.value).toBe(false);
    await planning.copySummary();
    expect(platform.copied[0]).toContain("Notre travail doit rester visible");
    expect(planning.canPublish.value).toBe(false);
  });

  it("un sprint démarré ailleurs garde son brouillon accessible après actualisation et réouverture", async () => {
    const { planning, inspect, create } = context();
    await planning.load();
    planning.addGoal("Proposition à conserver");
    inspect().sprint.state = "active";
    await planning.refresh();
    expect(planning.selectedSprintId.value).toBe(43);
    expect(planning.draft.value?.goals.at(-1)?.title).toBe("Proposition à conserver");
    expect(planning.validation.value).toContain("plus un sprint futur");
    expect(planning.canPublish.value).toBe(false);
    const reopened = create();
    await reopened.load();
    expect(reopened.selectedSprintId.value).toBe(43);
    expect(reopened.draft.value?.goals.at(-1)?.title).toBe("Proposition à conserver");
    expect(reopened.canPublish.value).toBe(false);
  });

  it("un changement de board pendant une sauvegarde lente ne réinstalle pas l'ancien planning", async () => {
    const { planning, platform } = context();
    await planning.load();
    const original = platform.store.set;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    platform.store.set = async (key, value) => {
      await gate;
      await original(key, value);
    };
    planning.addGoal("Dernière saisie");
    expect(planning.saving.value).toBe(1);
    const selection = planning.selectSprint(43);
    planning.reset();
    release();
    await selection;
    await planning.flushDraft();
    expect(planning.saving.value).toBe(0);
    expect(planning.snapshot.value).toBeNull();
    expect(planning.draft.value).toBeNull();
  });

  it("le RAF reste consultatif et un ticket déjà dans le sprint ne peut être retiré", async () => {
    const { planning } = context();
    await planning.load();
    const id = planning.draft.value?.goals[0]?.id ?? null;
    planning.assignIssue("ABC-101", id);
    planning.removeIssue("ABC-210");
    expect(planning.draft.value?.selectedIssueKeys).toEqual(["ABC-210"]);
    planning.assignIssue("ABC-201", id);
    planning.removeGoal(id ?? "");
    expect(planning.draft.value?.selectedIssueKeys).toContain("ABC-201");
    expect(planning.draft.value?.links["ABC-201"]).toBeUndefined();
    planning.removeIssue("ABC-201");
    expect(planning.draft.value?.selectedIssueKeys).toEqual(["ABC-210"]);
  });

  it("copie une synthèse et ouvre la fiche native sans publier", async () => {
    const { planning, platform, openIssue, jira } = context();
    await planning.load();
    planning.assignIssue("ABC-201", planning.draft.value?.goals[0]?.id ?? null);
    await planning.copySummary();
    expect(platform.copied[0]).toContain("ABC-201");
    expect(platform.copied[0]).toContain("Simplifier le paiement");
    planning.openIssue("ABC-201");
    planning.openIssue("FOREIGN-1");
    expect(openIssue).toHaveBeenCalledExactlyOnceWith("ABC-201");
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(0);
  });

  it("publie une seule fois, relit le résultat et repart d'un plan propre", async () => {
    const { planning, inspect } = context();
    await planning.load();
    planning.assignIssue("ABC-201", planning.draft.value?.goals[0]?.id ?? null);
    planning.addGoal("Améliorer la compréhension des erreurs");
    await Promise.all([planning.publish(), planning.publish()]);
    expect(planning.error.value).toBeNull();
    expect(planning.notice.value).toContain("publié et vérifié");
    expect(inspect().issueKeys).toContain("ABC-201");
    expect(inspect().writes.filter((write) => write.path.endsWith("/43/issue"))).toHaveLength(1);
    expect(planning.dirty.value).toBe(false);
    expect(planning.canPublish.value).toBe(false);
    expect(planning.publishing.value).toBe(false);
  });

  it("publie par la porte du board : attend le geste en cours, journal du board inchangé", async () => {
    const { planning, gate, audit, inspect } = context();
    await planning.load();
    planning.addGoal("Attendre son tour");
    let release = () => {};
    const held = gate.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const publishing = planning.publish();
    await vi.waitFor(() => expect(gate.busy.value).toBe(2));
    expect(inspect().writes).toHaveLength(0);
    release();
    await Promise.all([held, publishing]);
    expect(planning.notice.value).toContain("publié et vérifié");
    expect(inspect().writes.length).toBeGreaterThan(0);
    const [entry] = await audit.list("https://acme.atlassian.net");
    expect(entry).toMatchObject({
      action: "sprint planning",
      issueKey: null,
      from: null,
      to: "43",
      outcome: "réussi",
      site: "https://acme.atlassian.net",
    });
  });

  it("protège une publication contre les écritures déjà en cours", async () => {
    const { planning, canWrite, inspect } = context();
    await planning.load();
    planning.addGoal("Sécuriser le parcours");
    canWrite.value = false;
    expect(planning.canPublish.value).toBe(false);
    await planning.publish();
    expect(inspect().writes).toHaveLength(0);
    canWrite.value = true;
    expect(planning.canPublish.value).toBe(true);
  });

  it("une modification concurrente garde le brouillon copiable mais bloque la publication", async () => {
    const { planning, inspect, platform } = context();
    await planning.load();
    planning.addGoal("Notre proposition");
    inspect().sprint.goal = "Objectif modifié par un collègue";
    await planning.refresh();
    expect(planning.canPublish.value).toBe(false);
    expect(planning.validation.value).toContain("Jira a changé");
    expect(planning.draft.value?.goals.at(-1)?.title).toBe("Notre proposition");
    await planning.copySummary();
    expect(platform.copied[0]).toContain("Notre proposition");
    await planning.discardDraft();
    expect(planning.draft.value?.goals.map((goal) => goal.title)).toEqual([
      "Objectif modifié par un collègue",
    ]);
    expect(planning.dirty.value).toBe(false);
    expect(inspect().writes).toHaveLength(0);
  });

  it("un refus de publication conserve le brouillon, sans nouvelle tentative automatique", async () => {
    const { planning, jira } = context();
    await planning.load();
    planning.addGoal("Un nouvel objectif");
    jira.on("POST", "/rest/agile/1.0/sprint/43", { status: 403 });
    await planning.publish();
    await planning.publish();
    expect(planning.canPublish.value).toBe(false);
    expect(planning.draft.value?.goals.at(-1)?.title).toBe("Un nouvel objectif");
    expect(jira.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  });

  it("un changement de board ou une fermeture ignore les anciennes lectures", async () => {
    const { planning } = context();
    const pending = planning.load();
    planning.reset();
    await pending;
    expect(planning.snapshot.value).toBeNull();
    expect(planning.loading.value).toBe(false);
    await planning.load();
    planning.dispose();
    await planning.load();
    expect(planning.snapshot.value).toBeNull();
  });

  it("reste absent en Kanban et efface les brouillons lors de l'oubli du site", async () => {
    const { planning, configuration, platform, jira } = context();
    configuration.value = { ...configuration.value, boardType: "kanban" };
    await planning.load();
    expect(jira.requests).toHaveLength(0);
    configuration.value = { ...configuration.value, boardType: "scrum" };
    await planning.load();
    planning.addGoal("À préparer");
    planning.dispose();
    await planning.forgetSite();
    expect([...platform.stored.keys()].some((key) => key.startsWith("sprint-planning.v1:"))).toBe(
      false,
    );
  });
});
