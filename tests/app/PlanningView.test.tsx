// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppMessage, message } from "../../src/app/model/appMessage";
import type { UserMessage } from "../../src/app/model/messages";
import type {
  PendingClosure,
  PlanningGoalSearch,
  PlanningIssue,
  PlanningLane,
  PlanningLoad,
  PlanningSection,
  PlanningViewModel,
} from "../../src/app/model/PlanningTypes";
import {
  PLANNING_DRAG_TYPE,
  PLANNING_SPRINT_DRAG_TYPE,
  PlanningView,
} from "../../src/app/views/planning/PlanningView";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import type { PlanningSnapshot } from "../../src/core/sprintPlanning";
import { setLanguage } from "../../src/i18n";
import { type AtlassianGoal, decodeSprint, type JiraSprint } from "../../src/jira/models";
import { makeIssue } from "../support/jiraFixtures";

// Données FICTIVES : un sprint futur préparé, un autre sprint futur, le backlog et un sprint actif.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = () => document.body.textContent ?? "";
// Happy DOM ne déclare pas les événements de glissé natifs ; Preact choisit leur casse via le DOM.
Object.defineProperty(HTMLElement.prototype, "ondrop", { value: null, configurable: true });
Object.defineProperty(HTMLElement.prototype, "ondragstart", { value: null, configurable: true });
Object.defineProperty(HTMLElement.prototype, "ondragover", { value: null, configurable: true });

const SPRINT_43 = decodeSprint({
  id: 43,
  name: "Sprint 43",
  state: "future",
  startDate: "2026-11-09",
  endDate: "2026-11-20",
});
const SPRINT_44 = decodeSprint({ id: 44, name: "Sprint 44", state: "future" });
const SPRINT_42 = decodeSprint({ id: 42, name: "Sprint 42", state: "active" });

const item = (
  key: string,
  summary: string,
  estimate: number | null,
  origin: PlanningIssue["origin"] = null,
): PlanningIssue => ({ issue: makeIssue(key, { summary }), estimate, origin });

const IN_G1 = item("ABC-10", "Panier existant", 5);
const ARRIVED = item("ABC-14", "Paiement fractionné", 3, { kind: "backlog" });
const UNASSIGNED = item("ABC-12", "Recherche rapide", null);
const BACKLOG = item("ABC-11", "Paiement en ligne", 5);
const OTHER_SPRINT = item("ABC-15", "Suivi de colis", 2);
const REMAINING = item("ABC-13", "Ancienne story inachevée", 8);
const GOALS = [
  makeSprintGoal({ id: "g1", title: "Simplifier les achats", position: 0 }),
  makeSprintGoal({ id: "g2", title: "Sécuriser le paiement", color: "goal3", position: 1 }),
];

function lane(index: 0 | 1, issues: readonly PlanningIssue[]): PlanningLane {
  const goal = GOALS[index];
  if (!goal) throw new Error("objectif attendu");
  return {
    goal,
    issues,
    issueCount: issues.length,
    points: issues.reduce((sum, entry) => sum + (entry.estimate ?? 0), 0),
    unestimated: 0,
  };
}

function setup(options: { goalMode?: "text" | "atlassian" } = {}) {
  const snapshot = {
    boardId: 7,
    query: { estimationFieldId: "customfield_10016", includeChangelog: false },
    sprint: SPRINT_43,
    nativeGoalText: GOALS.map((goal) => goal.title).join("\n"),
    rawGoalProperty: null,
    goals: GOALS,
    links: { "ABC-10": "g1", "ABC-14": "g2" },
    storedLinks: {},
    storedGoalIds: [],
    velocity: 20,
    pinnedGoalIds: [],
    sprintIssues: [IN_G1.issue, ARRIVED.issue, UNASSIGNED.issue],
    backlogIssues: [BACKLOG.issue],
    futureSprints: [{ sprint: SPRINT_44, issues: [OTHER_SPRINT.issue] }],
    activeSprints: [{ sprint: SPRINT_42, issues: [REMAINING.issue] }],
  } satisfies PlanningSnapshot;
  const gesturesDisabled = signal(false);
  const planning = {
    sprints: signal<readonly JiraSprint[]>([SPRINT_43, SPRINT_44]),
    selectedSprintId: signal<number | null>(43),
    snapshot: signal<PlanningSnapshot | null>(snapshot),
    loading: signal(false),
    busy: signal(false),
    notice: signal<AppMessage | null>(null),
    error: signal<UserMessage | null>(null),
    goalsWarning: signal<AppMessage | null>(null),
    search: signal(""),
    goalMode: signal<"text" | "atlassian">(options.goalMode ?? "text"),
    lanes: signal<readonly PlanningLane[]>([lane(0, [IN_G1]), lane(1, [ARRIVED])]),
    unassigned: signal<readonly PlanningIssue[]>([UNASSIGNED]),
    sections: signal<readonly PlanningSection[]>([
      { kind: "sprint", sprint: SPRINT_44, issues: [OTHER_SPRINT] },
      { kind: "backlog", issues: [BACKLOG] },
      { kind: "active", sprint: SPRINT_42, issues: [REMAINING] },
    ]),
    sprintLoad: signal<PlanningLoad | null>({
      total: 8,
      unestimated: 1,
      velocity: 20,
      unit: "pts",
    }),
    activeSprint: signal<JiraSprint | null>(SPRINT_42),
    startDisabledReason: signal<AppMessage | null>(
      message("Un sprint est actif : clôturez-le avant de démarrer celui-ci."),
    ),
    pendingClosure: signal<PendingClosure | null>(null),
    goalSearch: signal<PlanningGoalSearch | null>(null),
    gesturesDisabled,
    selectSprint: vi.fn(async (_id: number) => {}),
    refresh: vi.fn(async () => {}),
    setSearch: vi.fn((value: string) => {
      planning.search.value = value;
    }),
    addGoal: vi.fn(async (_title: string) => {}),
    renameGoal: vi.fn(async (_id: string, _title: string) => {}),
    removeGoal: vi.fn(async (_id: string) => {}),
    moveGoal: vi.fn(async (_id: string, _delta: -1 | 1) => {}),
    placeIssue: vi.fn(async (_key: string, _goalId: string | null) => {}),
    removeIssue: vi.fn(async () => {}),
    saveVelocity: vi.fn(async (_velocity: number | null) => {}),
    searchGoals: vi.fn(async (_query: string) => {}),
    pinGoal: vi.fn(async (_id: string) => {}),
    unpinGoal: vi.fn(async (_id: string) => {}),
    closeActiveSprint: vi.fn(),
    startSprint: vi.fn(),
    openIssue: vi.fn(),
  } satisfies PlanningViewModel;
  const onBack = vi.fn();
  const onToggleSidebar = vi.fn();
  render(
    <PlanningView
      planning={planning}
      sidebarCollapsed={false}
      onBack={onBack}
      onToggleSidebar={onToggleSidebar}
    />,
    document.body,
  );
  return { planning, onBack, onToggleSidebar };
}

function find<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Élément attendu : ${selector}`);
  return found;
}

function button(label: string, root: ParentNode = document) {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) =>
      element.textContent?.trim() === label || element.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`Bouton attendu : ${label}`);
  return found;
}

const field = <T extends HTMLElement = HTMLInputElement>(label: string) =>
  find<T>(`[aria-label="${label}"]`);

function key(element: Element, value: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
}

async function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

function blur(input: HTMLInputElement) {
  input.dispatchEvent(new FocusEvent("blur"));
}

function cardOf(issueKey: string) {
  return find<HTMLElement>(`[data-planning-issue="${issueKey}"]`);
}

/** Menu ⋯ d'une carte, ouvert. */
function menuOf(issueKey: string) {
  const details = cardOf(issueKey).querySelector<HTMLDetailsElement>("details");
  if (!details) throw new Error(`Menu attendu : ${issueKey}`);
  details.open = true;
  return details;
}

function drop(zone: Element, issueKey: string, types: readonly string[]) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types, getData: (kind: string) => (types.includes(kind) ? issueKey : "") },
  });
  zone.dispatchEvent(event);
}

function dragStart(card: Element) {
  const data = new Map<string, string>();
  const event = new Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      effectAllowed: "none",
      setData: (kind: string, value: string) => data.set(kind, value),
    },
  });
  card.dispatchEvent(event);
  return { data, prevented: event.defaultPrevented };
}

afterEach(() => {
  render(null, document.body);
  setLanguage("fr");
});

describe("Sprint Planning en direct : écran", () => {
  it("montre le sprint préparé, la vélocité, la charge, les sources et les swimlanes", async () => {
    const { planning, onBack, onToggleSidebar } = setup();
    await tick();
    expect(find(".sprint-name h2").textContent).toBe("Sprint 43");
    expect(find(".sprint-future").textContent).toBe("futur");
    expect(find(".sprint-dates").textContent).toContain("→");
    const select = field<HTMLSelectElement>("Sprint à préparer");
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Sprint 43",
      "Sprint 44",
    ]);
    select.value = "44";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(planning.selectSprint).toHaveBeenCalledWith(44);

    expect(find<HTMLInputElement>(".planning-velocity input").value).toBe("20");
    expect(find(".planning-load strong").textContent).toBe("8 / 20 pts");
    expect(find(".planning-load").textContent).toContain("40 %");
    expect(find(".planning-load").textContent).toContain("1 ticket sans estimation");

    const sections = [...document.querySelectorAll<HTMLElement>("[data-planning-section]")];
    expect(sections.map((section) => section.dataset.planningSection)).toEqual([
      "sprint-44",
      "backlog",
      "active-42",
    ]);
    expect(sections[2]?.textContent).toContain("en consultation");
    const lanes = [
      ...document.querySelectorAll<HTMLElement>(".planning-lanes [data-planning-goal]"),
    ];
    expect(lanes.map((element) => element.dataset.planningGoal)).toEqual([
      "g1",
      "g2",
      "unassigned",
    ]);
    expect(lanes[2]?.querySelector('[data-planning-issue="ABC-12"]')).not.toBeNull();
    expect(cardOf("ABC-14").textContent).toContain("Vient du backlog");
    expect(cardOf("ABC-14").classList.contains("planning-card-arrived")).toBe(true);
    expect(cardOf("ABC-12").querySelector(".card-points")?.textContent).toBe("?");

    button("Ouvrir ABC-13 dans Jira").click();
    expect(planning.openIssue).toHaveBeenCalledWith("ABC-13");
    button("Actualiser").click();
    expect(planning.refresh).toHaveBeenCalled();
    button("Retour au board").click();
    expect(onBack).toHaveBeenCalled();
    button("Masquer la barre latérale").click();
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it("le reste à faire du sprint actif reste en consultation : ni menu ni glissé", async () => {
    setup();
    await tick();
    const remaining = cardOf("ABC-13");
    expect(remaining.classList.contains("planning-card-readonly")).toBe(true);
    expect(remaining.getAttribute("draggable")).not.toBe("true");
    expect(remaining.querySelector("details")).toBeNull();
    expect(dragStart(remaining).prevented).toBe(true);
  });

  it("Démarrer reste désactivé avec sa raison ; Clôturer ouvre la fenêtre de Jira", async () => {
    const { planning } = setup();
    await tick();
    const start = button("Démarrer Sprint 43");
    expect(start.disabled).toBe(true);
    expect(find("#planning-start-reason").textContent).toBe(
      "Un sprint est actif : clôturez-le avant de démarrer celui-ci.",
    );
    button("Clôturer Sprint 42").click();
    expect(planning.closeActiveSprint).toHaveBeenCalledTimes(1);

    planning.activeSprint.value = null;
    planning.startDisabledReason.value = null;
    await tick();
    expect(() => button("Clôturer Sprint 42")).toThrow();
    expect(document.querySelector("#planning-start-reason")).toBeNull();
    button("Démarrer Sprint 43").click();
    expect(planning.startSprint).toHaveBeenCalledTimes(1);
  });

  it("vélocité : Entrée ou sortie écrivent une fois, Échap rend la valeur de Jira", async () => {
    const { planning } = setup();
    await tick();
    const input = find<HTMLInputElement>(".planning-velocity input");
    await type(input, "25");
    key(input, "Enter");
    blur(input);
    expect(planning.saveVelocity.mock.calls).toEqual([[25]]);

    await type(input, "30");
    key(input, "Escape");
    await tick();
    expect(input.value).toBe("20");
    blur(input);
    expect(planning.saveVelocity).toHaveBeenCalledTimes(1);

    await type(input, "20");
    blur(input);
    expect(planning.saveVelocity).toHaveBeenCalledTimes(1);
    await type(input, "");
    blur(input);
    expect(planning.saveVelocity.mock.calls.at(-1)).toEqual([null]);
  });

  it("titre d'objectif : Entrée écrit, Échap annule, un titre vide n'écrit rien", async () => {
    const { planning } = setup();
    await tick();
    const title = field("Titre de l’objectif 1");
    await type(title, "Simplifier le panier");
    key(title, "Enter");
    blur(title);
    expect(planning.renameGoal.mock.calls).toEqual([["g1", "Simplifier le panier"]]);

    const second = field("Titre de l’objectif 2");
    await type(second, "Autre chose");
    key(second, "Escape");
    await tick();
    expect(second.value).toBe("Sécuriser le paiement");
    blur(second);
    await type(second, "   ");
    blur(second);
    await tick();
    expect(second.value).toBe("Sécuriser le paiement");
    expect(planning.renameGoal).toHaveBeenCalledTimes(1);
  });

  it("objectifs texte : ajouter, monter, descendre, supprimer", async () => {
    const { planning } = setup();
    await tick();
    expect(button("Monter l’objectif 1").disabled).toBe(true);
    expect(button("Descendre l’objectif 2").disabled).toBe(true);
    button("Descendre l’objectif 1").click();
    button("Monter l’objectif 2").click();
    button("Supprimer l’objectif 2").click();
    expect(planning.moveGoal.mock.calls).toEqual([
      ["g1", 1],
      ["g2", -1],
    ]);
    expect(planning.removeGoal).toHaveBeenCalledWith("g2");

    await type(field("Nouvel objectif du sprint"), "  Livrer le suivi de colis ");
    find<HTMLFormElement>(".planning-add-goal").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await tick();
    expect(planning.addGoal).toHaveBeenCalledWith("Livrer le suivi de colis");
  });

  it("menu ⋯ d'un ticket du sprint : objectif, sans objectif, backlog, autre sprint futur", async () => {
    const { planning } = setup();
    await tick();
    const menu = menuOf("ABC-10");
    expect(button("Simplifier les achats", menu).disabled).toBe(true);
    button("Sécuriser le paiement", menu).click();
    expect(menu.open).toBe(false);
    button("Sans objectif", menuOf("ABC-10")).click();
    button("Renvoyer au backlog", menuOf("ABC-10")).click();
    button("Vers Sprint 44", menuOf("ABC-10")).click();
    expect(planning.placeIssue.mock.calls).toEqual([
      ["ABC-10", "g2"],
      ["ABC-10", null],
    ]);
    expect(planning.removeIssue.mock.calls).toEqual([
      ["ABC-10", { kind: "backlog" }],
      ["ABC-10", { kind: "sprint", sprintId: 44 }],
    ]);
    expect(button("Sans objectif", menuOf("ABC-12")).disabled).toBe(true);
  });

  it("menu ⋯ d'un ticket du backlog : le poser l'ajoute au sprint, sans retrait possible", async () => {
    const { planning } = setup();
    await tick();
    const menu = menuOf("ABC-11");
    expect(menu.textContent).toContain("Ajouter au sprint");
    expect(() => button("Renvoyer au backlog", menu)).toThrow();
    button("Simplifier les achats", menu).click();
    button("Sans objectif", menuOf("ABC-15")).click();
    expect(planning.placeIssue.mock.calls).toEqual([
      ["ABC-11", "g1"],
      ["ABC-15", null],
    ]);
  });

  it("Échap referme le menu et rend le focus à son bouton", async () => {
    setup();
    await tick();
    const menu = menuOf("ABC-10");
    key(button("Renvoyer au backlog", menu), "Escape");
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.querySelector("summary"));
  });

  it("glisser-déposer : poser sur un objectif ou sans objectif, retirer vers le backlog ou un sprint", async () => {
    const { planning } = setup();
    await tick();
    const fromSprint = dragStart(cardOf("ABC-10"));
    expect([...fromSprint.data.keys()]).toEqual([PLANNING_DRAG_TYPE, PLANNING_SPRINT_DRAG_TYPE]);
    const fromBacklog = dragStart(cardOf("ABC-11"));
    expect([...fromBacklog.data.keys()]).toEqual([PLANNING_DRAG_TYPE]);

    drop(find('[data-planning-goal="g2"]'), "ABC-11", [PLANNING_DRAG_TYPE]);
    drop(find('[data-planning-goal="unassigned"]'), "ABC-15", [PLANNING_DRAG_TYPE]);
    drop(find('[data-planning-goal="g1"]'), "ABC-11", ["text/plain"]);
    expect(planning.placeIssue.mock.calls).toEqual([
      ["ABC-11", "g2"],
      ["ABC-15", null],
    ]);

    const sprintTypes = [PLANNING_DRAG_TYPE, PLANNING_SPRINT_DRAG_TYPE];
    drop(find('[data-planning-section="backlog"]'), "ABC-10", sprintTypes);
    drop(find('[data-planning-section="sprint-44"]'), "ABC-14", sprintTypes);
    // Un ticket du backlog ou déposé sur le reste à faire actif ne déclenche aucun retrait.
    drop(find('[data-planning-section="backlog"]'), "ABC-11", [PLANNING_DRAG_TYPE]);
    drop(find('[data-planning-section="active-42"]'), "ABC-10", sprintTypes);
    expect(planning.removeIssue.mock.calls).toEqual([
      ["ABC-10", { kind: "backlog" }],
      ["ABC-14", { kind: "sprint", sprintId: 44 }],
    ]);
  });

  it("pendant un geste, tout est désactivé et aucun dépôt n'est accepté", async () => {
    const { planning } = setup();
    planning.busy.value = true;
    planning.gesturesDisabled.value = true;
    await tick();
    expect(find("main.planning-screen").getAttribute("aria-busy")).toBe("true");
    expect(find(".sync-status").textContent).toBe("Écriture dans Jira…");
    expect(find<HTMLInputElement>(".planning-velocity input").disabled).toBe(true);
    expect(field("Titre de l’objectif 1").disabled).toBe(true);
    expect(button("Clôturer Sprint 42").disabled).toBe(true);
    expect(button("Renvoyer au backlog", menuOf("ABC-10")).disabled).toBe(true);
    expect(cardOf("ABC-11").getAttribute("draggable")).not.toBe("true");
    drop(find('[data-planning-goal="g1"]'), "ABC-11", [PLANNING_DRAG_TYPE]);
    expect(planning.placeIssue).not.toHaveBeenCalled();
  });

  it("« / » place le curseur dans la recherche partagée", async () => {
    const { planning } = setup();
    await tick();
    const search = field("Rechercher un ticket à planifier");
    key(document.body, "/");
    expect(document.activeElement).toBe(search);
    await type(search, "panier");
    expect(planning.setSearch).toHaveBeenCalledWith("panier");
    planning.sections.value = [{ kind: "backlog", issues: [] }];
    await tick();
    expect(find('[data-planning-section="backlog"]').textContent).toContain(
      "Aucun ticket ne correspond à cette recherche.",
    );
  });

  it("Goals Atlassian : chercher par nom, épingler, retirer l'épinglage, sans titre modifiable", async () => {
    const { planning } = setup({ goalMode: "atlassian" });
    await tick();
    expect(document.querySelector("input.planning-goal-title")).toBeNull();
    expect(document.querySelector('[aria-label="Nouvel objectif du sprint"]')).toBeNull();
    button("Retirer l'épinglage de Simplifier les achats").click();
    expect(planning.unpinGoal).toHaveBeenCalledWith("g1");

    await type(field("Chercher un Goal à épingler"), "colis");
    expect(planning.searchGoals).toHaveBeenCalledWith("colis");
    const goal: AtlassianGoal = {
      id: "ari:cloud:townsquare:site:goal/9",
      key: "TOWN-9",
      name: "Livrer le suivi de colis",
      statusLabel: null,
      ownerName: null,
      targetDate: null,
      url: null,
      isArchived: false,
    };
    planning.goalSearch.value = { query: "colis", loading: false, results: [goal], error: null };
    await tick();
    button("Épingler Livrer le suivi de colis").click();
    expect(planning.pinGoal).toHaveBeenCalledWith(goal.id);
    planning.goalSearch.value = { query: "rien", loading: false, results: [], error: null };
    await tick();
    expect(text()).toContain("Aucun Goal ne correspond à cette recherche.");
  });

  it("avis et écran suivent la langue, sans traduire les données Jira", async () => {
    const { planning } = setup();
    planning.notice.value = message(
      "{p0} Rien n’a été écrit : la page a été relue, refaites votre modification.",
      { p0: message("Le texte des objectifs a changé dans Jira depuis son affichage.") },
    );
    planning.goalsWarning.value = message("Le sprint n'est pas clos dans Jira.");
    setLanguage("en");
    await tick();
    expect(text()).toContain("Where the issues are");
    expect(text()).toContain("Team velocity");
    expect(text()).toContain("Complete Sprint 42");
    expect(find(".planning-notice").textContent).toBe(
      "The goal text changed in Jira after it was displayed. Nothing was written: the page was reloaded, make your change again.",
    );
    expect(find(".planning-goals-warning").textContent).toBe("The sprint is not closed in Jira.");
    expect(text()).toContain("Panier existant");
    setLanguage("es");
    await tick();
    expect(text()).toContain("Velocidad del equipo");
    expect(text()).toContain("Dónde están las incidencias");
  });

  it("sans sprint futur : invite à en créer un dans Jira", async () => {
    const { planning } = setup();
    planning.snapshot.value = null;
    planning.sprints.value = [];
    planning.activeSprint.value = null;
    await tick();
    expect(text()).toContain("Aucun sprint futur");
    expect(document.querySelector(".planning-body")).toBeNull();
    expect(document.querySelector(".planning-velocity")).toBeNull();
  });
});
