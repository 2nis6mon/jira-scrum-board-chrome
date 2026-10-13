// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserMessage } from "../../src/app/model/messages";
import type {
  PlanningDraft,
  PlanningIssue,
  PlanningViewModel,
} from "../../src/app/model/PlanningTypes";
import { PLANNING_DRAG_TYPE, PlanningView } from "../../src/app/views/planning/PlanningView";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { decodeSprint, type JiraSprint } from "../../src/jira/models";
import { makeIssue } from "../support/jiraFixtures";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = () => document.body.textContent ?? "";
// Happy DOM ne déclare pas les événements de glissé natifs ; Preact choisit leur casse via le DOM.
Object.defineProperty(HTMLElement.prototype, "ondrop", { value: null, configurable: true });

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) =>
      element.textContent?.trim() === label || element.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`Bouton attendu : ${label}`);
  return found;
}

function field<T extends HTMLInputElement | HTMLSelectElement>(label: string): T {
  const found = document.querySelector<T>(`[aria-label="${label}"]`);
  if (!found) throw new Error(`Champ attendu : ${label}`);
  return found;
}

async function enter(label: string, value: string) {
  const element = field<HTMLInputElement>(label);
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

async function assign(key: string, goal: string) {
  const element = field<HTMLSelectElement>(`Affecter ${key} à un objectif`);
  element.value = goal;
  element.dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
}

function setup() {
  const initialDraft: PlanningDraft = {
    sprintId: 43,
    goals: [
      makeSprintGoal({ id: "g1", title: "Simplifier les achats", position: 0 }),
      makeSprintGoal({ id: "g2", title: "Sécuriser le paiement", color: "goal3", position: 1 }),
    ],
    links: { "ABC-10": "g1" },
    selectedIssueKeys: ["ABC-10"],
    capacity: null,
  };
  const draft = signal<PlanningDraft | null>(initialDraft);
  const update = (change: (current: PlanningDraft) => PlanningDraft) => {
    if (draft.value) draft.value = change(draft.value);
  };
  const planning = {
    draft,
    sprints: signal<readonly JiraSprint[]>([
      decodeSprint({
        id: 43,
        name: "Sprint 43",
        state: "future",
        startDate: "2026-10-20",
        endDate: "2026-11-03",
      }),
      decodeSprint({ id: 44, name: "Sprint 44", state: "future" }),
    ]),
    selectedSprintId: signal<number | null>(43),
    loading: signal(false),
    publishing: signal(false),
    dirty: signal(true),
    error: signal<UserMessage | null>(null),
    notice: signal<string | null>(null),
    validation: signal<string | null>(null),
    canPublish: signal(true),
    estimationLabel: "Story Points",
    issues: signal<readonly PlanningIssue[]>([
      { issue: makeIssue("ABC-10", { summary: "Panier existant" }), estimate: 3, source: "sprint" },
      {
        issue: makeIssue("ABC-11", { summary: "Paiement en ligne", parent: "ABC-100" }),
        estimate: 5,
        source: "backlog",
      },
      {
        issue: makeIssue("ABC-12", { summary: "Recherche rapide" }),
        estimate: null,
        source: "backlog",
      },
      {
        issue: makeIssue("ABC-13", { summary: "Ancienne story inachevée" }),
        estimate: 8,
        source: "remaining",
        sprintName: "Sprint 42",
      },
    ]),
    selectSprint: vi.fn(async (id: number) => {
      planning.selectedSprintId.value = id;
    }),
    refresh: vi.fn(async () => {}),
    addGoal: vi.fn((title: string) =>
      update((current) => ({
        ...current,
        goals: [
          ...current.goals,
          makeSprintGoal({ id: "new", title, position: current.goals.length }),
        ],
      })),
    ),
    renameGoal: vi.fn((id: string, title: string) =>
      update((current) => ({
        ...current,
        goals: current.goals.map((goal) => (goal.id === id ? { ...goal, title } : goal)),
      })),
    ),
    removeGoal: vi.fn((id: string) =>
      update((current) => ({ ...current, goals: current.goals.filter((goal) => goal.id !== id) })),
    ),
    moveGoal: vi.fn(),
    assignIssue: vi.fn((key: string, goalId: string | null) =>
      update((current) => ({
        ...current,
        selectedIssueKeys: [...new Set([...current.selectedIssueKeys, key])],
        links: { ...current.links, [key]: goalId ?? "" },
      })),
    ),
    removeIssue: vi.fn((key: string) =>
      update((current) => ({
        ...current,
        selectedIssueKeys: current.selectedIssueKeys.filter((item) => item !== key),
      })),
    ),
    setCapacity: vi.fn((capacity: number | null) =>
      update((current) => ({ ...current, capacity })),
    ),
    publish: vi.fn(async () => {}),
    discardDraft: vi.fn(async () => {
      draft.value = initialDraft;
    }),
    openIssue: vi.fn(),
    copySummary: vi.fn(async () => {
      planning.notice.value = "Synthèse copiée.";
    }),
  } satisfies PlanningViewModel;
  const onBack = vi.fn();
  const onToggleSidebar = vi.fn();
  render(
    <PlanningView
      planning={planning}
      sidebarCollapsed
      onBack={onBack}
      onToggleSidebar={onToggleSidebar}
    />,
    document.body,
  );
  return { planning, onBack, onToggleSidebar };
}

afterEach(() => render(null, document.body));

describe("atelier Sprint Planning", () => {
  it("sépare backlog, proposition et RAF, et conserve les accès au board et à Jira", async () => {
    const { planning, onBack, onToggleSidebar } = setup();
    await tick();
    expect(document.querySelectorAll(".planning-pool-list .planning-card")).toHaveLength(2);
    expect(document.querySelectorAll(".planning-goal .planning-card")).toHaveLength(1);
    expect(text()).not.toContain("Ancienne story inachevée");
    expect(text()).toContain("Brouillon local");
    button("Retour au board").click();
    button("Afficher la barre latérale").click();
    button("Ouvrir ABC-10 dans Jira").click();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onToggleSidebar).toHaveBeenCalledOnce();
    expect(planning.openIssue).toHaveBeenCalledWith("ABC-10");
    expect(document.querySelector('[aria-label="Retirer ABC-10 de la proposition"]')).toBeNull();
    expect(text()).not.toMatch(/minuteur|timer|Goals Atlassian/);
    expect(planning.publish).not.toHaveBeenCalled();
  });

  it("recherche puis affecte une story au clavier, la retire et ne publie rien", async () => {
    const { planning } = setup();
    await tick();
    await enter("Rechercher un ticket à planifier", "paiement");
    expect(document.querySelectorAll(".planning-pool-list .planning-card")).toHaveLength(1);
    await assign("ABC-11", "g2");
    expect(
      document.querySelector('[data-planning-goal="g2"] [data-planning-issue="ABC-11"]'),
    ).not.toBeNull();
    expect(planning.assignIssue).toHaveBeenCalledWith("ABC-11", "g2");
    button("Retirer ABC-11 de la proposition").click();
    await tick();
    expect(
      document.querySelector('.planning-pool-list [data-planning-issue="ABC-11"]'),
    ).not.toBeNull();
    expect(planning.publish).not.toHaveBeenCalled();
  });

  it("laisse le RAF et les sous-tâches ou tickets terminés en consultation", async () => {
    const { planning } = setup();
    planning.issues.value = [
      ...planning.issues.value,
      {
        issue: makeIssue("ABC-20", { summary: "Déjà terminé", category: "done" }),
        estimate: 2,
        source: "backlog",
      },
      {
        issue: makeIssue("ABC-21", {
          typeName: "Sous-tâche",
          extraFields: { issuetype: { id: "5", name: "Sous-tâche", subtask: true } },
        }),
        estimate: 1,
        source: "backlog",
      },
    ];
    await tick();
    for (const key of ["ABC-20", "ABC-21"]) {
      const card = document.querySelector<HTMLElement>(`[data-planning-issue="${key}"]`);
      expect(card).not.toBeNull();
      expect(card?.getAttribute("draggable")).not.toBe("true");
      expect(card?.querySelector("select")).toBeNull();
    }
    button("Reste à faire 1").click();
    await tick();
    const card = document.querySelector<HTMLElement>('[data-planning-issue="ABC-13"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute("draggable")).not.toBe("true");
    expect(card?.querySelector("select")).toBeNull();
    expect(text()).toContain("Leur présence ici ne les déplace pas");
    expect(planning.assignIssue).not.toHaveBeenCalled();
  });

  it("accepte seulement les glissés de tickets valides du planning", async () => {
    const { planning } = setup();
    await tick();
    const zone = document.querySelector('[data-planning-goal="g2"]');
    if (!zone) throw new Error("zone attendue");
    const drop = (key: string, type = PLANNING_DRAG_TYPE) => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: { types: [type], getData: () => key },
      });
      zone.dispatchEvent(event);
    };
    drop("ABC-13");
    drop("INCONNU-1");
    drop("ABC-11", "text/plain");
    expect(planning.assignIssue).not.toHaveBeenCalled();
    drop("ABC-11");
    await tick();
    expect(planning.assignIssue).toHaveBeenCalledWith("ABC-11", "g2");
    planning.publishing.value = true;
    await tick();
    drop("ABC-12");
    expect(planning.assignIssue).toHaveBeenCalledTimes(1);
  });

  it("édite les objectifs, propose un focus et garde les stories d’un objectif supprimé à organiser", async () => {
    const { planning } = setup();
    await tick();
    await enter("Titre de l’objectif 1", "Améliorer le panier");
    expect(planning.renameGoal).toHaveBeenCalledWith("g1", "Améliorer le panier");
    button("Isoler l’objectif 1").click();
    await tick();
    expect(document.querySelectorAll(".planning-goal")).toHaveLength(1);
    button("Tous les objectifs").click();
    await tick();
    await enter("Nouvel objectif du sprint", "Simplifier la recherche");
    button("Ajouter l’objectif").click();
    await tick();
    expect(planning.addGoal).toHaveBeenCalledWith("Simplifier la recherche");
    expect(field<HTMLInputElement>("Nouvel objectif du sprint").value).toBe("");
    button("Monter l’objectif 2").click();
    expect(planning.moveGoal).toHaveBeenCalledWith("g2", -1);
    button("Supprimer l’objectif 1").click();
    await tick();
    expect(
      document.querySelector('.planning-unassigned [data-planning-issue="ABC-10"]'),
    ).not.toBeNull();
  });

  it("calcule la capacité sans considérer les tickets non estimés comme une estimation complète", async () => {
    const { planning } = setup();
    await tick();
    await assign("ABC-11", "g1");
    await assign("ABC-12", "");
    await enter("Capacité cible en Story Points", "5");
    expect(planning.setCapacity).toHaveBeenLastCalledWith(5);
    expect(document.querySelector(".planning-summary")?.textContent).toContain(
      "1 ticket sans estimation",
    );
    expect(document.querySelector(".planning-capacity-progress")?.textContent).toContain(
      "3 au-dessus de la cible · estimation partielle",
    );
    await enter("Capacité cible en Story Points", "");
    expect(planning.setCapacity).toHaveBeenLastCalledWith(null);
  });

  it("affiche les sélections devenues indisponibles et permet de les retirer", async () => {
    const { planning } = setup();
    planning.draft.value = {
      ...(planning.draft.value as PlanningDraft),
      selectedIssueKeys: ["ABC-10", "ABC-404"],
    };
    await tick();
    expect(document.querySelector(".planning-unavailable")?.textContent).toContain("ABC-404");
    button("Retirer ABC-404 de la proposition").click();
    await tick();
    expect(document.querySelector(".planning-unavailable")).toBeNull();
  });

  it("permet de sortir un ticket devenu terminé du brouillon et revient aux objectifs disponibles après une relecture", async () => {
    const { planning } = setup();
    await tick();
    await assign("ABC-11", "g2");
    button("Isoler l’objectif 2").click();
    await tick();
    planning.issues.value = planning.issues.value.map((item) =>
      item.issue.key === "ABC-11"
        ? { ...item, issue: makeIssue("ABC-11", { category: "done" }) }
        : item,
    );
    await tick();
    expect(document.querySelector('[aria-label="Affecter ABC-11 à un objectif"]')).toBeNull();
    button("Retirer ABC-11 de la proposition").click();
    await tick();
    expect(planning.removeIssue).toHaveBeenCalledWith("ABC-11");
    planning.draft.value = {
      ...(planning.draft.value as PlanningDraft),
      goals: [makeSprintGoal({ id: "new-id", title: "Objectif relu", position: 0 })],
    };
    await tick();
    expect(field<HTMLInputElement>("Titre de l’objectif 1").value).toBe("Objectif relu");
    expect(field<HTMLInputElement>("Nouvel objectif du sprint")).not.toBeNull();
  });

  it("demande une confirmation lisible, piège le focus et publie seulement au second geste", async () => {
    const { planning } = setup();
    await tick();
    await assign("ABC-11", "g2");
    const publish = button("Publier dans Jira");
    publish.focus();
    publish.click();
    await tick();
    expect(planning.publish).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLTextAreaElement>("#planning-goal-preview")?.value).toBe(
      "Simplifier les achats\nSécuriser le paiement",
    );
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("1 ticket à ajouter au sprint");
    expect(dialog?.textContent).toContain("ABC-11");
    expect(dialog?.textContent).toContain("Le sprint restera futur");
    const close = button("Fermer la confirmation");
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(button("Confirmer la publication"));
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await tick();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(publish);
    publish.click();
    await tick();
    button("Confirmer la publication").click();
    await tick();
    expect(planning.publish).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("garde la confirmation ouverte après une erreur de publication et ne la rejoue pas", async () => {
    const { planning } = setup();
    planning.publish.mockImplementation(async () => {
      planning.error.value = { text: "Publication interrompue", suggestion: "Relisez Jira." };
    });
    await tick();
    button("Publier dans Jira").click();
    await tick();
    button("Confirmer la publication").click();
    await tick();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Publication interrompue",
    );
    expect(planning.publish).toHaveBeenCalledOnce();
  });

  it("empêche de fermer la confirmation et de modifier le plan pendant la publication", async () => {
    const { planning } = setup();
    await tick();
    button("Publier dans Jira").click();
    await tick();
    planning.publishing.value = true;
    await tick();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await tick();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button("Fermer la confirmation").disabled).toBe(true);
    expect(button("Continuer la préparation").disabled).toBe(true);
    expect(button("Retour au board").disabled).toBe(true);
    expect(field<HTMLInputElement>("Titre de l’objectif 1").disabled).toBe(true);
  });

  it("confirme l’abandon, copie la synthèse et réagit aux droits ou états indisponibles", async () => {
    const { planning } = setup();
    await tick();
    button("Copier la synthèse").click();
    await tick();
    expect(planning.copySummary).toHaveBeenCalledOnce();
    expect(text()).toContain("Synthèse copiée.");
    button("Repartir de Jira").click();
    await tick();
    expect(planning.discardDraft).not.toHaveBeenCalled();
    button("Garder le brouillon").click();
    await tick();
    button("Repartir de Jira").click();
    await tick();
    button("Reprendre depuis Jira").click();
    await tick();
    expect(planning.discardDraft).toHaveBeenCalledOnce();
    planning.canPublish.value = false;
    planning.validation.value = "Vous ne pouvez pas modifier ce sprint.";
    planning.loading.value = true;
    await tick();
    expect(button("Publier dans Jira").disabled).toBe(true);
    expect(field<HTMLSelectElement>("Affecter ABC-11 à un objectif").disabled).toBe(true);
    expect(field<HTMLInputElement>("Titre de l’objectif 1").disabled).toBe(true);
    expect(text()).toContain("Vous ne pouvez pas modifier ce sprint.");
    planning.draft.value = null;
    planning.loading.value = false;
    planning.sprints.value = [];
    await tick();
    expect(text()).toContain("Créez un sprint futur dans le backlog Jira");
  });
});
