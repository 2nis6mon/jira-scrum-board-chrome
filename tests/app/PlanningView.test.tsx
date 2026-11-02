// @vitest-environment happy-dom
import { signal } from "@preact/signals";
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppMessage, message } from "../../src/app/model/appMessage";
import { ImageCache } from "../../src/app/model/ImageCache";
import type { UserMessage } from "../../src/app/model/messages";
import type {
  PendingClosure,
  PlanningCarryOverReport,
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
import { type IssueFilterOptions, issueFilterOptions } from "../../src/core/boardLayout";
import { NO_PLANNING_FILTERS, type PlanningFilters } from "../../src/core/filters";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import type { PlanningSnapshot } from "../../src/core/sprintPlanning";
import { setLanguage } from "../../src/i18n";
import type { JiraQuickFilter } from "../../src/jira/client";
import { type AtlassianGoal, decodeSprint, type JiraSprint } from "../../src/jira/models";
import { type IssueOptions, makeIssue } from "../support/jiraFixtures";

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
const SPRINT_45 = decodeSprint({ id: 45, name: "Sprint 45", state: "active" });

const item = (
  key: string,
  summary: string,
  estimate: number | null,
  origin: PlanningIssue["origin"] = null,
  options: IssueOptions = {},
): PlanningIssue => ({ issue: makeIssue(key, { summary, ...options }), estimate, origin });

// Icônes FICTIVES : l'adresse ne sert que de clé au cache d'images du test.
const STORY_ICON = "https://acme.atlassian.net/images/icons/issuetypes/story.svg";
const HIGH_ICON = "https://acme.atlassian.net/images/icons/priorities/high.svg";

const IN_G1 = item("ABC-10", "Panier existant", 5, null, {
  statusName: "En cours",
  extraFields: {
    issuetype: { id: "10001", name: "Story", subtask: false, iconUrl: STORY_ICON },
    priority: { id: "2", name: "High", iconUrl: HIGH_ICON },
  },
});
const ARRIVED = item("ABC-14", "Paiement fractionné", 3, { kind: "backlog" });
const UNASSIGNED = item("ABC-12", "Recherche rapide", null, null, {
  statusName: "À faire",
  category: "new",
  priority: "Medium",
});
const BACKLOG = item("ABC-11", "Paiement en ligne", 5);
const OTHER_SPRINT = item("ABC-15", "Suivi de colis", 2, null, {
  extraFields: { status: { id: "9", name: "Bloqué" } },
});
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

/** Cache sans téléchargement : chaque icône garde la lettre de son libellé. */
const noImages = () => new ImageCache(() => Promise.reject(new Error("aucun téléchargement")));

function setup(
  options: {
    goalMode?: "text" | "atlassian";
    pinnedGoalIds?: readonly string[];
    images?: ImageCache;
    quickFilters?: readonly JiraQuickFilter[];
  } = {},
) {
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
    pinnedGoalIds: options.pinnedGoalIds ?? [],
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
    filters: signal<PlanningFilters>(NO_PLANNING_FILTERS),
    filterOptions: signal<IssueFilterOptions | null>(
      issueFilterOptions([
        IN_G1.issue,
        ARRIVED.issue,
        UNASSIGNED.issue,
        BACKLOG.issue,
        OTHER_SPRINT.issue,
        REMAINING.issue,
      ]),
    ),
    jiraQuickFilters: signal<readonly JiraQuickFilter[]>(options.quickFilters ?? []),
    applyingQuickFilters: signal(false),
    activeFilterCount: signal(0),
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
    activeSprints: signal<readonly JiraSprint[]>([SPRINT_42]),
    startDisabledReason: signal<AppMessage | null>(
      message("Un sprint est actif : clôturez-le avant de démarrer celui-ci."),
    ),
    pendingClosure: signal<PendingClosure | null>(null),
    carryOverReport: signal<PlanningCarryOverReport | null>(null),
    goalSearch: signal<PlanningGoalSearch | null>(null),
    gesturesDisabled,
    selectSprint: vi.fn(async (_id: number) => {}),
    refresh: vi.fn(async () => {}),
    setSearch: vi.fn((value: string) => {
      planning.search.value = value;
      // Comme le modèle : la recherche compte parmi les critères actifs.
      planning.activeFilterCount.value = value.trim() === "" ? 0 : 1;
    }),
    setFilters: vi.fn((filters: PlanningFilters) => {
      planning.filters.value = filters;
    }),
    toggleBlocked: vi.fn(),
    toggleJiraQuickFilter: vi.fn(async (_id: number) => {}),
    resetFilters: vi.fn(),
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
    closeActiveSprint: vi.fn((_sprintId: number) => {}),
    dismissCarryOverReport: vi.fn(() => {
      planning.carryOverReport.value = null;
    }),
    startSprint: vi.fn(),
    openIssue: vi.fn(),
  } satisfies PlanningViewModel;
  const onBack = vi.fn();
  const onToggleSidebar = vi.fn();
  render(
    <PlanningView
      planning={planning}
      images={options.images ?? noImages()}
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
    expect(planning.closeActiveSprint).toHaveBeenCalledExactlyOnceWith(42);
    expect(document.querySelector(".planning-close-menu")).toBeNull();

    planning.activeSprints.value = [];
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

  it("vélocité refusée, relue inchangée : le champ rend la valeur de Jira et la même saisie repart", async () => {
    const { planning } = setup();
    await tick();
    const input = find<HTMLInputElement>(".planning-velocity input");
    await type(input, "25");
    key(input, "Enter");
    await tick();
    expect(input.value).toBe("20");
    await type(input, "25");
    key(input, "Enter");
    expect(planning.saveVelocity.mock.calls).toEqual([[25], [25]]);
  });

  it("titre refusé, relu inchangé : le champ rend le titre de Jira et le même titre repart", async () => {
    const { planning } = setup();
    await tick();
    const title = field("Titre de l’objectif 1");
    await type(title, "Simplifier le panier");
    key(title, "Enter");
    await tick();
    expect(title.value).toBe("Simplifier les achats");
    await type(title, "Simplifier le panier");
    key(title, "Enter");
    expect(planning.renameGoal.mock.calls).toEqual([
      ["g1", "Simplifier le panier"],
      ["g1", "Simplifier le panier"],
    ]);
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
      "Aucun ticket ne correspond à la recherche ou aux filtres.",
    );
  });

  it("Goals Atlassian : chercher par nom, épingler, retirer l'épinglage, sans titre modifiable", async () => {
    // g1 épinglé ; g2 affiché seulement parce qu'un ticket s'y rattache.
    const { planning } = setup({ goalMode: "atlassian", pinnedGoalIds: ["g1"] });
    await tick();
    expect(document.querySelector("input.planning-goal-title")).toBeNull();
    expect(document.querySelector('[aria-label="Nouvel objectif du sprint"]')).toBeNull();
    button("Retirer l'épinglage de Simplifier les achats").click();
    expect(planning.unpinGoal).toHaveBeenCalledWith("g1");
    expect(() => button("Retirer l'épinglage de Sécuriser le paiement")).toThrow();

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

  it("plusieurs sprints actifs : « Clôturer un sprint » propose chacun par son nom", async () => {
    const { planning } = setup();
    planning.activeSprints.value = [SPRINT_42, SPRINT_45];
    await tick();
    expect(() => button("Clôturer Sprint 42")).toThrow();
    const menu = find<HTMLDetailsElement>(".planning-close-menu");
    expect(menu.querySelector("summary")?.textContent).toBe("Clôturer un sprint");
    menu.open = true;
    button("Sprint 45", menu).click();
    expect(planning.closeActiveSprint).toHaveBeenCalledExactlyOnceWith(45);
    expect(menu.open).toBe(false);

    // Échap referme le menu ouvert et rend le focus à son bouton.
    menu.open = true;
    const choice = button("Sprint 42", menu);
    choice.focus();
    choice.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.querySelector("summary"));

    // Gestes impossibles : le menu ne reste pas ouvert et ses choix sont désactivés.
    planning.gesturesDisabled.value = true;
    await tick();
    expect(button("Sprint 42", menu).disabled).toBe(true);
    expect(menu.querySelector("summary")?.getAttribute("aria-disabled")).toBe("true");
    menu.open = true;
    menu.dispatchEvent(new Event("toggle"));
    expect(menu.open).toBe(false);
  });

  it("« Clôture en cours dans Jira… » prime sur « Écriture dans Jira… » pendant la vérification", async () => {
    const { planning } = setup();
    planning.busy.value = true;
    await tick();
    expect(find(".sync-status").textContent).toBe("Écriture dans Jira…");
    planning.pendingClosure.value = {
      closedSprintId: 42,
      closedSprintName: "Sprint 42",
      targetSprintId: 43,
      targetSprintName: "Sprint 43",
    };
    await tick();
    expect(find(".sync-status").textContent).toBe("Clôture en cours dans Jira…");
  });

  it("compte rendu de clôture : chaque objectif avec sa raison, au-dessus des swimlanes, jusqu'à sa fermeture", async () => {
    const { planning } = setup();
    planning.carryOverReport.value = {
      closedSprintName: "Sprint 42",
      targetSprintName: "Sprint 43",
      summary: message("Objectifs non atteints reportés dans {p0}.", { p0: "Sprint 43" }),
      written: true,
      goals: [
        { title: "Finaliser le paiement", status: "carried", linkedKeys: ["ABC-1", "ABC-2"] },
        { title: "Documenter l'API", status: "noIssue", linkedKeys: [] },
        { title: "Améliorer la stabilité", status: "allDone", linkedKeys: ["ABC-3"] },
        { title: "Rechercher", status: "alreadyThere", linkedKeys: ["ABC-4"] },
      ],
      incomplete: true,
    };
    await tick();
    const panel = find(".planning-carry-over");
    // Au-dessus des swimlanes.
    expect(panel.nextElementSibling?.classList.contains("planning-lane")).toBe(true);
    expect(panel.querySelector("h3")?.textContent).toBe("Clôture de Sprint 42");
    expect(find(".planning-carry-over-summary").textContent).toBe(
      "Objectifs non atteints reportés dans Sprint 43.",
    );
    const reasons = [...panel.querySelectorAll("li")].map((line) => [
      line.querySelector(".planning-carry-over-title")?.textContent,
      line.querySelector(".planning-carry-over-reason")?.textContent,
    ]);
    expect(reasons).toEqual([
      ["Finaliser le paiement", "Reporté dans Sprint 43."],
      ["Documenter l'API", "Non reporté : aucun ticket rattaché."],
      ["Améliorer la stabilité", "Non reporté : tous ses tickets sont dans la dernière colonne."],
      ["Rechercher", "Non reporté : déjà présent dans Sprint 43."],
    ]);
    expect(panel.textContent).toContain("ABC-1, ABC-2");
    expect(find(".planning-carry-over-incomplete").textContent).toContain(
      "Lecture des Goals incomplète",
    );

    setLanguage("en");
    await tick();
    expect(find(".planning-carry-over h3").textContent).toBe("Completion of Sprint 42");
    expect(find(".planning-carry-over-reason").textContent).toBe("Carried over to Sprint 43.");
    setLanguage("es");
    await tick();
    expect(find(".planning-carry-over-reason").textContent).toBe("Trasladado a Sprint 43.");
    expect(find(".planning-carry-over-summary").textContent).toBe(
      "Objetivos no alcanzados trasladados a Sprint 43.",
    );
    setLanguage("fr");

    // Report non confirmé : l'objectif n'est pas dit reporté.
    planning.carryOverReport.value = { ...planning.carryOverReport.value, written: false };
    await tick();
    expect(find(".planning-carry-over-reason").textContent).toBe(
      "Non atteint, report non confirmé.",
    );

    button("Fermer le compte rendu").click();
    expect(planning.dismissCarryOverReport).toHaveBeenCalledTimes(1);
    await tick();
    expect(document.querySelector(".planning-carry-over")).toBeNull();
  });

  it("sans sprint futur : invite à en créer un dans Jira", async () => {
    const { planning } = setup();
    planning.snapshot.value = null;
    planning.sprints.value = [];
    planning.activeSprints.value = [];
    await tick();
    expect(text()).toContain("Aucun sprint futur");
    expect(document.querySelector(".planning-body")).toBeNull();
    expect(document.querySelector(".planning-velocity")).toBeNull();
  });
});

describe("Sprint Planning en direct : carte (type, priorité, statut) et menu au clic droit", () => {
  /** Clic droit au pointeur ; sans bouton ni position, c'est le menu demandé au clavier. */
  function contextMenu(target: Element, init: MouseEventInit = {}) {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }
  function shiftF10(target: Element) {
    const event = new KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  }
  const detailsOf = (issueKey: string) => {
    const details = cardOf(issueKey).querySelector<HTMLDetailsElement>("details");
    if (!details) throw new Error(`Menu attendu : ${issueKey}`);
    return details;
  };
  const panelOf = (issueKey: string) =>
    find<HTMLElement>(`[data-planning-issue="${issueKey}"] .menu-panel`);

  it("icônes du type et de la priorité téléchargées avec la session, à gauche de la clé et dans les marques", async () => {
    const urls: string[] = [];
    const images = new ImageCache(async (url) => {
      urls.push(url);
      return new Blob(["<svg/>"], { type: "image/svg+xml" });
    });
    setup({ images });
    await tick();
    await tick();
    const top = cardOf("ABC-10").querySelector(".card-top");
    const icons = [...(top?.querySelectorAll<HTMLImageElement>("img.jira-icon") ?? [])];
    expect(icons.map((icon) => icon.alt)).toEqual(["Story", "High"]);
    expect(icons.every((icon) => icon.src.startsWith("blob:"))).toBe(true);
    // Le type précède la clé ; la priorité est dans les marques, avant le menu ⋯.
    expect(top?.firstElementChild).toBe(icons[0]);
    expect(icons[1]?.parentElement?.classList.contains("card-marks")).toBe(true);
    expect(urls).toEqual([STORY_ICON, HIGH_ICON]);
    images.dispose();
  });

  it("image absente ou non téléchargée : lettre du libellé ; sans priorité, aucune icône", async () => {
    setup();
    await tick();
    // ABC-10 : adresses connues, téléchargement refusé.
    const failed = cardOf("ABC-10");
    expect(failed.querySelector("img")).toBeNull();
    expect(
      [...failed.querySelectorAll(".jira-icon-fallback")].map((icon) => [
        icon.textContent,
        icon.getAttribute("aria-label"),
      ]),
    ).toEqual([
      ["S", "Story"],
      ["H", "High"],
    ]);
    // ABC-12 : priorité sans adresse d'icône.
    expect(cardOf("ABC-12").querySelector(".card-marks .jira-icon")?.textContent).toBe("M");
    // ABC-11 : sans priorité, seule l'icône du type reste.
    const backlog = cardOf("ABC-11");
    expect(backlog.querySelectorAll(".jira-icon")).toHaveLength(1);
    expect(backlog.querySelector(".card-marks .jira-icon")).toBeNull();
    // En consultation, sans priorité : aucune marque du tout.
    expect(cardOf("ABC-13").querySelector(".card-marks")).toBeNull();
  });

  it("statut sur toutes les cartes, teinté selon sa catégorie", async () => {
    const { planning } = setup();
    const done = item("ABC-16", "Bannière terminée", 1, null, {
      statusName: "Terminé",
      category: "done",
    });
    planning.unassigned.value = [UNASSIGNED, done];
    await tick();
    const status = (issueKey: string) => {
      const element = cardOf(issueKey).querySelector<HTMLElement>(".planning-status");
      return [element?.textContent, element?.dataset.statusCategory, element?.title];
    };
    expect(status("ABC-12")).toEqual(["À faire", "new", "Statut Jira : À faire"]);
    expect(status("ABC-10")).toEqual(["En cours", "indeterminate", "Statut Jira : En cours"]);
    expect(status("ABC-16")).toEqual(["Terminé", "done", "Statut Jira : Terminé"]);
    expect(status("ABC-15")).toEqual(["Bloqué", "unknown", "Statut Jira : Bloqué"]);
    // Sprint, autre sprint futur, backlog et consultation : une pastille par carte.
    const cards = [...document.querySelectorAll("article.planning-card")];
    expect(cards.length).toBe(7);
    expect(cards.every((card) => card.querySelectorAll(".planning-status").length === 1)).toBe(
      true,
    );
    expect(cardOf("ABC-13").querySelector(".planning-status")?.textContent).toBe("In Progress");
    setLanguage("en");
    await tick();
    expect(status("ABC-12")).toEqual(["À faire", "new", "Jira status: À faire"]);
  });

  it("clic droit sur une carte du sprint : menu ⋯ au point du pointeur, mêmes écritures", async () => {
    const { planning } = setup();
    await tick();
    const event = contextMenu(find('[data-planning-issue="ABC-10"] .planning-card-title'), {
      button: 2,
      clientX: 300,
      clientY: 200,
    });
    expect(event.defaultPrevented).toBe(true);
    const details = detailsOf("ABC-10");
    const panel = panelOf("ABC-10");
    expect(details.open).toBe(true);
    expect(details.hasAttribute("data-placed")).toBe(true);
    expect(panel.hasAttribute("data-at-point")).toBe(true);
    expect(panel.style.getPropertyValue("--menu-left")).toBe("300px");
    expect(panel.style.getPropertyValue("--menu-top")).toBe("200px");
    // Le focus va à la première entrée active : l'objectif courant est désactivé.
    expect(document.activeElement).toBe(button("Sécuriser le paiement", details));
    button("Sécuriser le paiement", details).click();
    expect(details.open).toBe(false);
    // Aucun élément de la carte n'avait le focus : il revient au ⋯.
    expect(document.activeElement).toBe(details.querySelector("summary"));

    contextMenu(cardOf("ABC-10"), { button: 2, clientX: 40, clientY: 60 });
    button("Renvoyer au backlog", detailsOf("ABC-10")).click();
    contextMenu(cardOf("ABC-11"), { button: 2, clientX: 40, clientY: 60 });
    expect(detailsOf("ABC-11").textContent).toContain("Ajouter au sprint");
    button("Simplifier les achats", detailsOf("ABC-11")).click();
    expect(planning.placeIssue.mock.calls).toEqual([
      ["ABC-10", "g2"],
      ["ABC-11", "g1"],
    ]);
    expect(planning.removeIssue.mock.calls).toEqual([["ABC-10", { kind: "backlog" }]]);
  });

  it("clic droit près du bord : le menu reste dans la fenêtre", async () => {
    setup();
    await tick();
    const panel = panelOf("ABC-12");
    panel.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 240, bottom: 160, width: 240, height: 160 }) as DOMRect;
    contextMenu(cardOf("ABC-12"), {
      button: 2,
      clientX: window.innerWidth - 20,
      clientY: window.innerHeight - 20,
    });
    // Faute de place à droite et en dessous : à gauche du point et au-dessus de lui.
    expect(panel.style.getPropertyValue("--menu-left")).toBe(`${window.innerWidth - 260}px`);
    expect(panel.style.getPropertyValue("--menu-top")).toBe(`${window.innerHeight - 180}px`);
  });

  it("Maj+F10 et touche Menu : même menu sous la carte ; Échap le referme et rend le focus", async () => {
    setup();
    await tick();
    const card = cardOf("ABC-12");
    card.getBoundingClientRect = () =>
      ({ left: 120, right: 320, top: 80, bottom: 180, width: 200, height: 100 }) as DOMRect;
    const link = button("Ouvrir ABC-12 dans Jira");
    link.focus();
    expect(shiftF10(link).defaultPrevented).toBe(true);
    const details = detailsOf("ABC-12");
    const panel = panelOf("ABC-12");
    expect(details.open).toBe(true);
    expect(panel.style.getPropertyValue("--menu-left")).toBe("120px");
    expect(panel.style.getPropertyValue("--menu-top")).toBe("180px");
    expect(panel.contains(document.activeElement)).toBe(true);
    key(document.activeElement as Element, "Escape");
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(link);

    // Touche Menu depuis le ⋯ : le focus lui revient.
    const summary = details.querySelector("summary") as HTMLElement;
    summary.focus();
    key(summary, "ContextMenu");
    expect(details.open).toBe(true);
    expect(panel.hasAttribute("data-at-point")).toBe(true);
    key(document.activeElement as Element, "Escape");
    expect(document.activeElement).toBe(summary);

    // Menu du clavier transmis comme `contextmenu` sans bouton droit ni position : sous la carte.
    link.focus();
    expect(contextMenu(card).defaultPrevented).toBe(true);
    expect(panel.style.getPropertyValue("--menu-top")).toBe("180px");
    button("Renvoyer au backlog", details).click();
    expect(document.activeElement).toBe(link);
  });

  it("rouvert par son bouton après un clic droit : le menu retrouve sa place sous le ⋯", async () => {
    setup();
    await tick();
    contextMenu(cardOf("ABC-10"), { button: 2, clientX: 300, clientY: 200 });
    key(document.activeElement as Element, "Escape");
    const details = menuOf("ABC-10");
    expect(details.open).toBe(true);
    expect(panelOf("ABC-10").hasAttribute("data-at-point")).toBe(false);
  });

  /** Carte ABC-12 posée à un endroit connu et son lien, qui a le focus. */
  function focusedCard() {
    const card = cardOf("ABC-12");
    card.getBoundingClientRect = () =>
      ({ left: 120, right: 320, top: 80, bottom: 180, width: 200, height: 100 }) as DOMRect;
    const link = button("Ouvrir ABC-12 dans Jira");
    link.focus();
    return { card, link };
  }

  it("menu déjà ouvert : Maj+F10 ou clic droit sur une entrée ne le rouvre pas ailleurs", async () => {
    setup();
    await tick();
    const { link } = focusedCard();
    shiftF10(link);
    const panel = panelOf("ABC-12");
    const entry = document.activeElement as Element;
    expect(panel.contains(entry)).toBe(true);
    expect(shiftF10(entry).defaultPrevented).toBe(true);
    expect(contextMenu(entry, { button: 2, clientX: 500, clientY: 400 }).defaultPrevented).toBe(
      true,
    );
    expect(panel.style.getPropertyValue("--menu-left")).toBe("120px");
    expect(panel.style.getPropertyValue("--menu-top")).toBe("180px");
    expect(document.activeElement).toBe(entry);
    key(entry, "Escape");
    expect(document.activeElement).toBe(link);
  });

  it("pendant un geste, le `contextmenu` de la touche Menu reçu par ⋯ ne rouvre pas le menu", async () => {
    const { planning } = setup();
    planning.gesturesDisabled.value = true;
    await tick();
    const { link } = focusedCard();
    shiftF10(link);
    const details = detailsOf("ABC-12");
    const summary = details.querySelector("summary") as HTMLElement;
    expect(document.activeElement).toBe(summary);
    // Blink envoie `contextmenu` au relâchement de la touche Menu, à la position de l'élément.
    expect(contextMenu(summary, { clientX: 700, clientY: 30 }).defaultPrevented).toBe(true);
    expect(details.open).toBe(true);
    expect(panelOf("ABC-12").style.getPropertyValue("--menu-left")).toBe("120px");
    key(summary, "Escape");
    expect(document.activeElement).toBe(link);
  });

  it("refermé par un défilement : le focus revient à l'élément de la carte, sinon au ⋯", async () => {
    setup();
    await tick();
    const { link } = focusedCard();
    shiftF10(link);
    const details = detailsOf("ABC-12");
    window.dispatchEvent(new Event("scroll"));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(link);

    link.blur();
    contextMenu(cardOf("ABC-12"), { button: 2, clientX: 300, clientY: 200 });
    expect(details.open).toBe(true);
    window.dispatchEvent(new Event("scroll"));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(details.querySelector("summary"));
  });

  it("carte en consultation : ni menu de l'extension, ni menu du navigateur empêché", async () => {
    setup();
    await tick();
    const remaining = cardOf("ABC-13");
    expect(contextMenu(remaining, { button: 2, clientX: 30, clientY: 30 }).defaultPrevented).toBe(
      false,
    );
    expect(shiftF10(remaining).defaultPrevented).toBe(false);
    expect(remaining.querySelector("details")).toBeNull();
    expect(document.querySelector("details[open]")).toBeNull();
  });

  it("pendant un geste, le menu ouvert au clic droit a ses entrées désactivées", async () => {
    const { planning } = setup();
    planning.gesturesDisabled.value = true;
    await tick();
    contextMenu(cardOf("ABC-10"), { button: 2, clientX: 50, clientY: 50 });
    const details = detailsOf("ABC-10");
    expect(details.open).toBe(true);
    const entries = [...details.querySelectorAll<HTMLButtonElement>(".menu-panel button")];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.disabled)).toBe(true);
    // Aucune entrée active : le focus va au ⋯, dans le menu, pour qu'Échap le referme.
    expect(document.activeElement).toBe(details.querySelector("summary"));
    key(document.activeElement as Element, "Escape");
    expect(details.open).toBe(false);
    expect(planning.placeIssue).not.toHaveBeenCalled();
    expect(planning.removeIssue).not.toHaveBeenCalled();
  });
});

describe("Sprint Planning en direct : filtres comme la page du sprint", () => {
  const menus = () =>
    [...document.querySelectorAll(".planning-filter-bar details.filter-menu > summary")].map(
      (summary) => summary.textContent?.replace(/\d+$/, "").trim(),
    );

  it("mêmes menus que la page du sprint, « Bloqués », sans Priorité, Composant, Sprint ni Objectif", async () => {
    setup();
    await tick();
    expect(menus()).toEqual(["Personne", "Type", "Parent", "Statut", "Label"]);
    const chips = [...document.querySelectorAll(".planning-filter-bar .chip")].map((chip) =>
      chip.textContent?.trim(),
    );
    expect(chips).toEqual(["Bloqués"]);
    expect(document.querySelector(".planning-filter-bar .filter-reset")).toBeNull();
  });

  it("menu Personne : valeurs présentes avec leur nombre, cocher appelle le modèle", async () => {
    const { planning } = setup();
    planning.filterOptions.value = issueFilterOptions([
      makeIssue("ABC-10", { assigneeId: "acc-1", assigneeName: "Alex Martin" }),
      makeIssue("ABC-11", { assigneeId: "acc-1", assigneeName: "Alex Martin" }),
      makeIssue("ABC-12"),
    ]);
    await tick();
    const person = find<HTMLDetailsElement>(".planning-filter-bar details.filter-menu");
    person.open = true;
    const options = [...person.querySelectorAll(".filter-option")].map((option) =>
      option.textContent?.trim(),
    );
    expect(options).toEqual(["Non assigné1", "Alex Martin2"]);
    const alex = [...person.querySelectorAll<HTMLInputElement>("input")][1];
    alex?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(planning.setFilters).toHaveBeenCalledTimes(1);
    expect([...(planning.setFilters.mock.calls[0]?.[0].assigneeIds ?? [])]).toEqual(["acc-1"]);
  });

  it("« Bloqués » et filtres rapides du board Jira passent par le modèle", async () => {
    const { planning } = setup({
      quickFilters: [
        {
          id: 1,
          name: "Mes tickets",
          jql: "assignee = currentUser()",
          description: null,
          position: 0,
        },
      ],
    });
    await tick();
    button("Bloqués").click();
    expect(planning.toggleBlocked).toHaveBeenCalledTimes(1);
    const mine = button("Mes tickets");
    expect(mine.getAttribute("title")).toContain("assignee = currentUser()");
    mine.click();
    expect(planning.toggleJiraQuickFilter).toHaveBeenCalledWith(1);
    planning.applyingQuickFilters.value = true;
    await tick();
    expect(button("Mes tickets").disabled).toBe(true);
    expect(text()).toContain("Jira filtre…");
  });

  it("filtres actifs : « Réinitialiser (n) » vide tout", async () => {
    const { planning } = setup();
    planning.activeFilterCount.value = 3;
    planning.filters.value = { ...NO_PLANNING_FILTERS, quickFilters: new Set(["blocked"]) };
    await tick();
    expect(button("Bloqués").getAttribute("aria-pressed")).toBe("true");
    button("Réinitialiser (3)").click();
    expect(planning.resetFilters).toHaveBeenCalledTimes(1);
  });

  it("les filtres restent utilisables pendant un geste : lecture seule", async () => {
    const { planning } = setup();
    planning.busy.value = true;
    planning.gesturesDisabled.value = true;
    await tick();
    expect(button("Bloqués").disabled).toBe(false);
  });

  it("chaque menu transmet au modèle le critère coché, cases « Non assigné » et « Sans parent » comprises", async () => {
    const { planning } = setup();
    planning.filterOptions.value = {
      assignees: [{ value: "acc-1", label: "Alex Martin", count: 1 }],
      unassignedCount: 2,
      issueTypes: [{ value: "10004", label: "Bug", count: 1 }],
      priorities: [],
      statuses: [{ value: "3", label: "En cours", count: 2 }],
      labels: [{ value: "tech", label: "tech", count: 1 }],
      components: [],
      parents: [{ value: "ABC-90", label: "ABC-90 · Epic", count: 1 }],
      withoutParentCount: 2,
    };
    await tick();
    const cases: [menu: string, input: number, expected: Partial<PlanningFilters>][] = [
      ["Personne", 0, { includeUnassigned: true }],
      ["Personne", 1, { assigneeIds: new Set(["acc-1"]) }],
      ["Type", 0, { issueTypeIds: new Set(["10004"]) }],
      ["Parent", 0, { includeWithoutParent: true }],
      ["Parent", 1, { parentKeys: new Set(["ABC-90"]) }],
      ["Statut", 0, { statusIds: new Set(["3"]) }],
      ["Label", 0, { labels: new Set(["tech"]) }],
    ];
    for (const [label, index, expected] of cases) {
      planning.filters.value = NO_PLANNING_FILTERS;
      planning.setFilters.mockClear();
      await tick();
      const menu = [
        ...document.querySelectorAll<HTMLDetailsElement>(
          ".planning-filter-bar details.filter-menu",
        ),
      ].find((details) => details.querySelector("summary")?.textContent?.startsWith(label));
      if (!menu) throw new Error(`Menu attendu : ${label}`);
      menu.open = true;
      menu.querySelectorAll("input")[index]?.dispatchEvent(new Event("change", { bubbles: true }));
      expect(planning.setFilters, `${label} n° ${index}`).toHaveBeenCalledTimes(1);
      expect(planning.setFilters.mock.calls[0]?.[0]).toEqual({
        ...NO_PLANNING_FILTERS,
        ...expected,
      });
      menu.open = false;
    }
  });

  it("filtres actifs sans recherche : messages des zones vidées et « visibles / total »", async () => {
    const { planning } = setup();
    planning.filters.value = { ...NO_PLANNING_FILTERS, quickFilters: new Set(["blocked"]) };
    planning.activeFilterCount.value = 1;
    planning.lanes.value = [{ ...lane(0, [IN_G1]), issues: [] }, lane(1, [ARRIVED])];
    planning.unassigned.value = [];
    planning.sections.value = [
      { kind: "sprint", sprint: SPRINT_44, issues: [] },
      { kind: "backlog", issues: [BACKLOG] },
      { kind: "active", sprint: SPRINT_42, issues: [] },
    ];
    await tick();
    const filtered = "Aucun ticket ne correspond à la recherche ou aux filtres.";
    expect(find('[data-planning-goal="g1"]').textContent).toContain(filtered);
    expect(find('[data-planning-goal="unassigned"]').textContent).toContain(filtered);
    expect(find('[data-planning-goal="unassigned"]').textContent).not.toContain(
      "Tous les tickets du sprint servent un objectif.",
    );
    expect(find('[data-planning-section="sprint-44"]').textContent).toContain(filtered);
    // Deux cartes retenues sur les six du sprint et de ses sources.
    expect(find(".planning-filter-bar .filter-result").textContent).toBe("2 / 6 tickets");
    planning.activeFilterCount.value = 0;
    await tick();
    expect(document.querySelector(".planning-filter-bar .filter-result")).toBeNull();
    expect(find('[data-planning-goal="unassigned"]').textContent).toContain(
      "Tous les tickets du sprint servent un objectif.",
    );
    expect(find('[data-planning-section="sprint-44"]').textContent).toContain("Aucun ticket.");
  });
});
