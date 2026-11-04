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
  PlanningRankOptions,
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

// Données FICTIVES : un sprint futur préparé, un autre sprint futur, le backlog et un sprint actif
// (clôture seulement, absent de « Où sont les tickets » depuis la story 8.31).
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
// Sous-tâche du backlog : Jira refuse de l'ajouter au sprint, elle reste en consultation.
const REMAINING = item("ABC-13", "Ancienne story inachevée", 8, null, {
  extraFields: { issuetype: { id: "10003", name: "Sub-task", subtask: true } },
});
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
    progress: {
      todo: {
        count: issues.length,
        points: issues.reduce((sum, entry) => sum + (entry.estimate ?? 0), 0),
      },
      inProgress: { count: 0, points: 0 },
      done: { count: 0, points: 0 },
    },
    delivered: null,
    deliveredIncomplete: false,
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
    backlogIssues: [BACKLOG.issue, REMAINING.issue],
    futureSprints: [{ sprint: SPRINT_44, issues: [OTHER_SPRINT.issue] }],
    activeSprints: [SPRINT_42],
    closableSprintIds: [42],
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
      { kind: "backlog", issues: [BACKLOG, REMAINING] },
    ]),
    unmappedCount: signal(0),
    sprintIssueCount: signal(snapshot.sprintIssues.length),
    sprintLoad: signal<PlanningLoad | null>({
      total: 8,
      unestimated: 1,
      velocity: 20,
      unit: "pts",
    }),
    activeSprints: signal<readonly JiraSprint[]>([SPRINT_42]),
    closableSprints: signal<readonly JiraSprint[]>([SPRINT_42]),
    noEditableSprint: signal(false),
    startDisabledReason: signal<AppMessage | null>(
      message("Un sprint est actif : clôturez-le avant de démarrer celui-ci."),
    ),
    pendingClosure: signal<PendingClosure | null>(null),
    carryOverReport: signal<PlanningCarryOverReport | null>(null),
    goalSearch: signal<PlanningGoalSearch | null>(null),
    selection: signal<ReadonlySet<string>>(new Set()),
    canEstimate: signal(false),
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
    toggleSelection: vi.fn((key: string) => {
      const next = new Set(planning.selection.value);
      if (!next.delete(key)) next.add(key);
      planning.selection.value = next;
    }),
    extendSelection: vi.fn((_key: string, _sectionKeys: readonly string[]) => {}),
    clearSelection: vi.fn(() => {
      planning.selection.value = new Set();
    }),
    placeIssues: vi.fn(async (_keys: readonly string[], _goalId: string | null) => {}),
    removeIssues: vi.fn(async () => {}),
    saveVelocity: vi.fn(async (_velocity: number | null) => {}),
    estimateIssue: vi.fn(async (_key: string, _value: number) => {}),
    rankOptions: vi.fn((_key: string): PlanningRankOptions | null => null),
    rankIssue: vi.fn(async (_key: string, _edge: "top" | "bottom") => {}),
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

/** Menu de carte ouvert, commun au board (story 8.19). */
const openedMenu = () => document.querySelector<HTMLElement>(".card-menu");

/** Ouvre le menu d'une carte par son bouton ⋯ (un menu déjà ouvert est d'abord refermé). */
async function menuOf(issueKey: string) {
  const open = openedMenu();
  if (open) {
    key(document.activeElement ?? open, "Escape");
    await tick();
  }
  menuButton(issueKey).click();
  await tick();
  const menu = openedMenu();
  if (!menu) throw new Error(`Menu attendu : ${issueKey}`);
  return menu;
}

function menuButton(issueKey: string) {
  return find<HTMLButtonElement>(`[data-planning-issue="${issueKey}"] .planning-card-menu`);
}

/** Entrée d'un menu par le début de son libellé (sous-menus compris). */
function entry(label: string, root: ParentNode = document) {
  const found = [...root.querySelectorAll<HTMLElement>("[role='menuitem']")].find((element) =>
    (element.textContent ?? "").trim().startsWith(label),
  );
  if (!found) throw new Error(`Entrée de menu attendue : ${label}`);
  return found;
}

/** Ouvre un sous-menu (« Envoyer vers un goal », « Retirer du sprint »…) et rend sa liste. */
async function openSub(label: string) {
  entry(label, find(".card-menu")).click();
  await tick();
  return find<HTMLElement>(".card-menu-goals");
}

/** Choisit une entrée d'un sous-menu de la carte, menu ouvert par ⋯. */
async function choose(issueKey: string, submenu: string, label: string) {
  await menuOf(issueKey);
  entry(label, await openSub(submenu)).click();
  await tick();
}

const disabledEntry = (element: Element) => element.getAttribute("aria-disabled") === "true";

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
    // Le sprint actif n'est pas une source (story 8.31).
    expect(sections.map((section) => section.dataset.planningSection)).toEqual([
      "sprint-44",
      "backlog",
    ]);
    expect(find(".planning-sources").textContent).not.toContain("Sprint 42");
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

  it("une carte en consultation (sous-tâche) : ni menu ni glissé", async () => {
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
    planning.closableSprints.value = [];
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

  it("menu ⋯ d'un ticket du sprint : même menu que le board, objectifs et sprints en sous-menus", async () => {
    const { planning } = setup();
    await tick();
    const menu = await menuOf("ABC-10");
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menuButton("ABC-10").getAttribute("aria-expanded")).toBe("true");
    const goals = await openSub("Envoyer vers un goal");
    // Objectif courant marqué et désactivé ; pastille de couleur à gauche de chaque objectif.
    const currentGoal = entry("Simplifier les achats", goals);
    expect(disabledEntry(currentGoal)).toBe(true);
    expect(currentGoal.getAttribute("aria-current")).toBe("true");
    expect(currentGoal.getAttribute("data-goal-color")).toBe(GOALS[0]?.color);
    expect(currentGoal.querySelector(".menu-goal-dot")).not.toBeNull();
    entry("Sécuriser le paiement", goals).click();
    await tick();
    expect(openedMenu()).toBeNull();
    await choose("ABC-10", "Envoyer vers un goal", "Sans objectif");
    await choose("ABC-10", "Retirer du sprint", "Renvoyer au backlog");
    await choose("ABC-10", "Retirer du sprint", "Vers Sprint 44");
    expect(planning.placeIssue.mock.calls).toEqual([
      ["ABC-10", "g2"],
      ["ABC-10", null],
    ]);
    expect(planning.removeIssue.mock.calls).toEqual([
      ["ABC-10", { kind: "backlog" }],
      ["ABC-10", { kind: "sprint", sprintId: 44 }],
    ]);
    await menuOf("ABC-12");
    expect(disabledEntry(entry("Sans objectif", await openSub("Envoyer vers un goal")))).toBe(true);
  });

  it("menu ⋯ d'un ticket du backlog : le poser l'ajoute au sprint, sans retrait ni priorité", async () => {
    const { planning } = setup();
    await tick();
    const menu = await menuOf("ABC-11");
    expect(() => entry("Retirer du sprint", menu)).toThrow();
    expect(() => entry("Mettre en top priorité", menu)).toThrow();
    entry("Simplifier les achats", await openSub("Ajouter au sprint")).click();
    await tick();
    await choose("ABC-15", "Ajouter au sprint", "Sans objectif");
    expect(planning.placeIssue.mock.calls).toEqual([
      ["ABC-11", "g1"],
      ["ABC-15", null],
    ]);
  });

  it("top et basse priorité : ticket seul du sprint, raison si déjà à sa place (8.19)", async () => {
    const { planning } = setup();
    planning.rankOptions.mockImplementation((key: string) =>
      key === "ABC-10" ? { top: null, bottom: "last" } : null,
    );
    await tick();
    const menu = await menuOf("ABC-10");
    const bottom = entry("Mettre en basse priorité", menu);
    expect(disabledEntry(bottom)).toBe(true);
    expect(bottom.textContent).toContain("Déjà en fin de sa swimlane");
    bottom.click();
    entry("Mettre en top priorité", menu).click();
    await tick();
    expect(planning.rankIssue.mock.calls).toEqual([["ABC-10", "top"]]);
    // En lot, pas de priorité : un geste d'un seul ticket.
    planning.selection.value = new Set(["ABC-10", "ABC-14"]);
    await tick();
    const batch = await menuOf("ABC-10");
    expect(() => entry("Mettre en top priorité", batch)).toThrow();
  });

  it("Échap referme le menu et rend le focus à son bouton", async () => {
    setup();
    await tick();
    await menuOf("ABC-10");
    key(document.activeElement as Element, "Escape");
    await tick();
    expect(openedMenu()).toBeNull();
    expect(document.activeElement).toBe(menuButton("ABC-10"));
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
    // Un ticket du backlog déposé sur le backlog ne déclenche aucun retrait.
    drop(find('[data-planning-section="backlog"]'), "ABC-11", [PLANNING_DRAG_TYPE]);
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
    const busy = entry("Retirer du sprint", await menuOf("ABC-10"));
    expect(disabledEntry(busy)).toBe(true);
    expect(busy.textContent).toContain("Une écriture est en cours");
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
    planning.closableSprints.value = [SPRINT_42, SPRINT_45];
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
    planning.closableSprints.value = [];
    await tick();
    expect(text()).toContain("Aucun sprint futur");
    expect(document.querySelector(".planning-body")).toBeNull();
    expect(document.querySelector(".planning-velocity")).toBeNull();
  });

  it("avancement d'un objectif : n/N terminés et barre par état ; sans déjà livré, barre du sprint seul", async () => {
    const { planning } = setup();
    const first = lane(0, [IN_G1]);
    planning.lanes.value = [
      {
        ...first,
        issueCount: 3,
        points: 10,
        progress: {
          todo: { count: 1, points: 5 },
          inProgress: { count: 1, points: 3 },
          done: { count: 1, points: 2 },
        },
        delivered: null,
        deliveredIncomplete: true,
      },
      lane(1, [ARRIVED]),
    ];
    await tick();
    const header = find('[data-planning-goal="g1"] .lane-header');
    expect(header.textContent).toContain("1/3 terminés · 2/10 pts");
    const parts = [...header.querySelectorAll(".state-chip")].map(
      (part) => part.querySelector(".visually-hidden")?.textContent,
    );
    // Barre empilée : terminé, en cours, à faire, en proportion des points (2, 3, 5 sur 10).
    const segments = [...header.querySelectorAll(".state-bar i")].map((segment) => [
      segment.getAttribute("data-state"),
      (segment as HTMLElement).style.width,
    ]);
    expect(segments).toEqual([
      ["done", "20%"],
      ["inProgress", "30%"],
      ["todo", "50%"],
    ]);
    expect(header.querySelector(".state-bar")?.getAttribute("aria-label")).toContain(
      "Terminé : 1 ticket · 2 pts",
    );
    expect(header.classList.contains("lane-header-completed")).toBe(false);
    expect(parts).toEqual([
      "À faire : 1 ticket · 5 pts",
      "En cours : 1 ticket · 3 pts",
      "Terminé : 1 ticket · 2 pts",
    ]);
    expect(text()).toContain("Lecture incomplète de ce qui a déjà été livré");
  });

  it("déjà livré dans la partie terminée : segment hachuré, légende de « Terminé », totaux du sprint seul (8.21)", async () => {
    const { planning } = setup();
    const first = lane(0, [IN_G1]);
    planning.lanes.value = [
      {
        ...first,
        issueCount: 3,
        points: 10,
        progress: {
          todo: { count: 1, points: 5 },
          inProgress: { count: 1, points: 3 },
          done: { count: 1, points: 2 },
        },
        delivered: { count: 2, points: 8 },
      },
      lane(1, [ARRIVED]),
    ];
    await tick();
    const header = find('[data-planning-goal="g1"] .lane-header');
    // Les totaux ne comptent que le sprint en préparation.
    expect(header.textContent).toContain("1/3 terminés · 2/10 pts");
    // Largeurs sur 18 pts : terminé 2, déjà livré 8, en cours 3, à faire 5.
    const segments = [...header.querySelectorAll<HTMLElement>(".state-bar i")].map((segment) => [
      segment.dataset.state,
      Math.round(Number.parseFloat(segment.style.width) * 10) / 10,
    ]);
    expect(segments).toEqual([
      ["done", 11.1],
      ["delivered", 44.4],
      ["inProgress", 16.7],
      ["todo", 27.8],
    ]);
    const done = header.querySelector('.state-chip[data-state="done"]');
    expect(done?.querySelector(".visually-hidden")?.textContent).toBe(
      "Terminé : 1 ticket · 2 pts, plus déjà livré : 2 tickets · 8 pts",
    );
    expect(done?.querySelector(".state-chip-delivered")?.textContent).toBe(" +8");
    expect(header.querySelector(".state-bar")?.getAttribute("aria-label")).toContain(
      "Déjà livré : 2 tickets · 8 pts",
    );
    // Plus de mention à part ; un objectif sans déjà livré n'a pas de segment hachuré.
    expect(text()).not.toContain("Déjà livré : 2 tickets · 8 pts");
    expect(
      find('[data-planning-goal="g2"] .lane-header').querySelector('[data-state="delivered"]'),
    ).toBeNull();
  });

  it("objectif atteint et objectif vide : même en-tête que le board ; tickets sans colonne signalés", async () => {
    const { planning } = setup();
    const first = lane(0, [IN_G1]);
    planning.lanes.value = [
      {
        ...first,
        progress: {
          todo: { count: 0, points: 0 },
          inProgress: { count: 0, points: 0 },
          done: first.progress.todo,
        },
      },
      { ...lane(1, []), issueCount: 0 },
    ];
    planning.unmappedCount.value = 2;
    await tick();
    const reached = find('[data-planning-goal="g1"] .lane-header');
    expect(reached.classList.contains("lane-header-completed")).toBe(true);
    expect(reached.querySelector(".goal-completed")?.getAttribute("aria-label")).toBe(
      "Objectif atteint",
    );
    expect(find('[data-planning-goal="g2"] .lane-header').textContent).toContain(
      "Aucun ticket rattaché",
    );
    expect(text()).toContain(
      "2 tickets du sprint ont un statut qui n'appartient à aucune colonne visible du board : non affichés, comme dans Jira.",
    );
  });

  it("aucun sprint futur modifiable : le dit, sans inviter à en créer un", async () => {
    const { planning } = setup();
    planning.snapshot.value = null;
    planning.sprints.value = [];
    planning.noEditableSprint.value = true;
    await tick();
    expect(text()).toContain("Aucun sprint futur que vous pouvez modifier");
    expect(text()).toContain("Gérer les sprints");
    expect(text()).not.toContain("Créez un sprint futur");
  });

  it("un sprint actif non modifiable n'est pas proposé à la clôture", async () => {
    const { planning } = setup();
    planning.closableSprints.value = [];
    await tick();
    expect(() => button("Clôturer Sprint 42")).toThrow();
    expect(find("#planning-start-reason").textContent).toContain("Un sprint est actif");
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

  it("clic droit sur une carte du sprint : menu au point du pointeur, mêmes écritures", async () => {
    const { planning } = setup();
    await tick();
    const event = contextMenu(find('[data-planning-issue="ABC-10"] .planning-card-title'), {
      button: 2,
      clientX: 300,
      clientY: 200,
    });
    expect(event.defaultPrevented).toBe(true);
    await tick();
    const menu = find<HTMLElement>(".card-menu");
    expect(menu.hasAttribute("data-placed")).toBe(true);
    expect(menu.style.getPropertyValue("--menu-left")).toBe("300px");
    expect(menu.style.getPropertyValue("--menu-top")).toBe("200px");
    // Le focus va à la première entrée active.
    expect(document.activeElement).toBe(entry("Envoyer vers un goal", menu));
    entry("Sécuriser le paiement", await openSub("Envoyer vers un goal")).click();
    await tick();
    expect(openedMenu()).toBeNull();
    // Aucun élément de la carte n'avait le focus : il revient au ⋯.
    expect(document.activeElement).toBe(menuButton("ABC-10"));

    contextMenu(cardOf("ABC-10"), { button: 2, clientX: 40, clientY: 60 });
    await tick();
    entry("Renvoyer au backlog", await openSub("Retirer du sprint")).click();
    await tick();
    contextMenu(cardOf("ABC-11"), { button: 2, clientX: 40, clientY: 60 });
    await tick();
    entry("Simplifier les achats", await openSub("Ajouter au sprint")).click();
    await tick();
    expect(planning.placeIssue.mock.calls).toEqual([
      ["ABC-10", "g2"],
      ["ABC-11", "g1"],
    ]);
    expect(planning.removeIssue.mock.calls).toEqual([["ABC-10", { kind: "backlog" }]]);
  });

  it("clic droit près du bord : le menu reste dans la fenêtre", async () => {
    setup();
    await tick();
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains("card-menu")
        ? ({ left: 0, top: 0, right: 240, bottom: 160, width: 240, height: 160 } as DOMRect)
        : original.call(this);
    });
    contextMenu(cardOf("ABC-12"), {
      button: 2,
      clientX: window.innerWidth - 20,
      clientY: window.innerHeight - 20,
    });
    await tick();
    const menu = find<HTMLElement>(".card-menu");
    // Faute de place à droite et en dessous : à gauche du point et au-dessus de lui.
    expect(menu.style.getPropertyValue("--menu-left")).toBe(`${window.innerWidth - 260}px`);
    expect(menu.style.getPropertyValue("--menu-top")).toBe(`${window.innerHeight - 180}px`);
    vi.restoreAllMocks();
  });

  it("Maj+F10 et touche Menu : même menu sous la carte ; Échap le referme et rend le focus", async () => {
    setup();
    await tick();
    const { card, link } = focusedCard();
    expect(shiftF10(link).defaultPrevented).toBe(true);
    await tick();
    let menu = find<HTMLElement>(".card-menu");
    expect(menu.style.getPropertyValue("--menu-left")).toBe("120px");
    expect(menu.style.getPropertyValue("--menu-top")).toBe("180px");
    expect(menu.contains(document.activeElement)).toBe(true);
    key(document.activeElement as Element, "Escape");
    await tick();
    expect(openedMenu()).toBeNull();
    expect(document.activeElement).toBe(link);

    // Touche Menu depuis le ⋯ : le focus lui revient.
    const dots = menuButton("ABC-12");
    dots.focus();
    key(dots, "ContextMenu");
    await tick();
    expect(openedMenu()).not.toBeNull();
    key(document.activeElement as Element, "Escape");
    await tick();
    expect(document.activeElement).toBe(dots);

    // Menu du clavier transmis comme `contextmenu` sans bouton droit ni position : sous la carte.
    link.focus();
    expect(contextMenu(card).defaultPrevented).toBe(true);
    await tick();
    menu = find<HTMLElement>(".card-menu");
    expect(menu.style.getPropertyValue("--menu-top")).toBe("180px");
    entry("Renvoyer au backlog", await openSub("Retirer du sprint")).click();
    await tick();
    expect(document.activeElement).toBe(link);
  });

  it("bouton ⋯ : le menu s'ouvre sous lui, et un second clic le referme", async () => {
    setup();
    await tick();
    const dots = menuButton("ABC-10");
    dots.getBoundingClientRect = () =>
      ({ left: 260, right: 284, top: 40, bottom: 62, width: 24, height: 22 }) as DOMRect;
    const menu = await menuOf("ABC-10");
    expect(menu.style.getPropertyValue("--menu-left")).toBe("260px");
    expect(menu.style.getPropertyValue("--menu-top")).toBe("62px");
    dots.click();
    await tick();
    expect(openedMenu()).toBeNull();
    expect(document.activeElement).toBe(dots);
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

  it("menu déjà ouvert : un clic droit sur une entrée ne le rouvre pas ailleurs", async () => {
    setup();
    await tick();
    const { link } = focusedCard();
    shiftF10(link);
    await tick();
    const menu = find<HTMLElement>(".card-menu");
    const current = document.activeElement as Element;
    expect(menu.contains(current)).toBe(true);
    expect(contextMenu(current, { button: 2, clientX: 500, clientY: 400 }).defaultPrevented).toBe(
      true,
    );
    shiftF10(current);
    await tick();
    expect(find<HTMLElement>(".card-menu").style.getPropertyValue("--menu-left")).toBe("120px");
    expect(find<HTMLElement>(".card-menu").style.getPropertyValue("--menu-top")).toBe("180px");
    expect(document.activeElement).toBe(current);
    key(current, "Escape");
    await tick();
    expect(document.activeElement).toBe(link);
  });

  it("refermé par un défilement : le focus revient à l'élément de la carte, sinon au ⋯", async () => {
    setup();
    await tick();
    const { link } = focusedCard();
    shiftF10(link);
    await tick();
    window.dispatchEvent(new Event("scroll"));
    await tick();
    expect(openedMenu()).toBeNull();
    expect(document.activeElement).toBe(link);

    link.blur();
    contextMenu(cardOf("ABC-12"), { button: 2, clientX: 300, clientY: 200 });
    await tick();
    expect(openedMenu()).not.toBeNull();
    window.dispatchEvent(new Event("scroll"));
    await tick();
    expect(openedMenu()).toBeNull();
    expect(document.activeElement).toBe(menuButton("ABC-12"));
  });

  it("carte en consultation : ni menu de l'extension, ni menu du navigateur empêché", async () => {
    setup();
    await tick();
    const remaining = cardOf("ABC-13");
    expect(contextMenu(remaining, { button: 2, clientX: 30, clientY: 30 }).defaultPrevented).toBe(
      false,
    );
    expect(shiftF10(remaining).defaultPrevented).toBe(false);
    await tick();
    expect(remaining.querySelector(".planning-card-menu")).toBeNull();
    expect(openedMenu()).toBeNull();
  });

  it("pendant un geste, le menu ouvert au clic droit a ses entrées désactivées", async () => {
    const { planning } = setup();
    planning.gesturesDisabled.value = true;
    await tick();
    contextMenu(cardOf("ABC-10"), { button: 2, clientX: 50, clientY: 50 });
    await tick();
    const menu = find<HTMLElement>(".card-menu");
    const entries = [...menu.querySelectorAll<HTMLElement>("[role='menuitem']")];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(disabledEntry)).toBe(true);
    // Aucune entrée active : le focus va à la première, dans le menu, pour qu'Échap le referme.
    expect(menu.contains(document.activeElement)).toBe(true);
    entries[0]?.click();
    await tick();
    expect(document.querySelector(".card-menu-goals")).toBeNull();
    key(document.activeElement as Element, "Escape");
    await tick();
    expect(openedMenu()).toBeNull();
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

describe("Sprint Planning en direct : plusieurs tickets ensemble (8.15)", () => {
  const click = (element: Element, init: MouseEventInit = {}) =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));

  it("Ctrl/Cmd+clic et Maj+clic sélectionnent ; ni un clic simple ni une carte en consultation", async () => {
    const { planning } = setup();
    await tick();
    click(cardOf("ABC-10"), { ctrlKey: true });
    click(cardOf("ABC-11"), { metaKey: true });
    click(cardOf("ABC-12"), { shiftKey: true });
    click(cardOf("ABC-13"), { ctrlKey: true });
    click(cardOf("ABC-14"));
    expect(planning.toggleSelection.mock.calls).toEqual([["ABC-10"], ["ABC-11"]]);
    expect(planning.extendSelection.mock.calls).toEqual([["ABC-12", ["ABC-12"]]]);
    // Ctrl+clic sur la clé : sélection, pas d'ouverture de la fiche.
    click(find('[data-planning-issue="ABC-14"] .planning-issue-link'), { ctrlKey: true });
    expect(planning.openIssue).not.toHaveBeenCalled();
    expect(planning.toggleSelection).toHaveBeenLastCalledWith("ABC-14");
  });

  it("le nombre de tickets sélectionnés s'affiche ; « Vider » et Échap vident la sélection", async () => {
    const { planning } = setup();
    planning.selection.value = new Set(["ABC-10", "ABC-11"]);
    await tick();
    expect(text()).toContain("2 tickets sélectionnés");
    expect(cardOf("ABC-10").classList.contains("planning-card-selected")).toBe(true);
    expect(cardOf("ABC-12").classList.contains("planning-card-selected")).toBe(false);
    button("Vider la sélection").click();
    expect(planning.clearSelection).toHaveBeenCalledTimes(1);
    planning.selection.value = new Set(["ABC-10"]);
    await tick();
    expect(text()).toContain("1 ticket sélectionné");
    key(document.body, "Escape");
    expect(planning.clearSelection).toHaveBeenCalledTimes(2);
  });

  it("une carte sélectionnée emmène toute la sélection ; le dépôt d'un lot est un seul geste", async () => {
    const { planning } = setup();
    planning.selection.value = new Set(["ABC-10", "ABC-14"]);
    await tick();
    const inSprint = dragStart(cardOf("ABC-10"));
    expect(inSprint.data.get(PLANNING_DRAG_TYPE)).toBe("ABC-10 ABC-14");
    expect(inSprint.data.get(PLANNING_SPRINT_DRAG_TYPE)).toBe("ABC-10 ABC-14");
    planning.selection.value = new Set(["ABC-10", "ABC-11"]);
    await tick();
    const mixed = dragStart(cardOf("ABC-11"));
    expect(mixed.data.get(PLANNING_DRAG_TYPE)).toBe("ABC-10 ABC-11");
    // Un lot qui n'est pas tout entier dans le sprint ne peut pas en être retiré.
    expect(mixed.data.has(PLANNING_SPRINT_DRAG_TYPE)).toBe(false);
    // Une carte hors de la sélection ne part que seule.
    expect(dragStart(cardOf("ABC-12")).data.get(PLANNING_DRAG_TYPE)).toBe("ABC-12");

    drop(find('[data-planning-goal="g2"]'), "ABC-10 ABC-11", [PLANNING_DRAG_TYPE]);
    drop(find('[data-planning-section="backlog"]'), "ABC-10 ABC-14", [
      PLANNING_DRAG_TYPE,
      PLANNING_SPRINT_DRAG_TYPE,
    ]);
    expect(planning.placeIssues.mock.calls).toEqual([[["ABC-10", "ABC-11"], "g2"]]);
    expect(planning.removeIssues.mock.calls).toEqual([[["ABC-10", "ABC-14"], { kind: "backlog" }]]);
    expect(planning.placeIssue).not.toHaveBeenCalled();
  });

  it("le menu d'une carte sélectionnée agit sur toute la sélection", async () => {
    const { planning } = setup();
    planning.selection.value = new Set(["ABC-10", "ABC-11"]);
    await tick();
    const menu = await menuOf("ABC-10");
    expect(menu.querySelector(".card-menu-heading")?.textContent).toBe("2 tickets sélectionnés");
    // ABC-11 est au backlog : le lot ne peut pas quitter le sprint.
    expect(() => entry("Retirer du sprint", menu)).toThrow();
    const goals = await openSub("Envoyer vers un goal");
    // Un lot n'a pas d'objectif courant : aucun objectif n'est désactivé.
    expect(disabledEntry(entry("Simplifier les achats", goals))).toBe(false);
    entry("Sécuriser le paiement", goals).click();
    await tick();
    expect(planning.placeIssues.mock.calls).toEqual([[["ABC-10", "ABC-11"], "g2"]]);

    planning.selection.value = new Set(["ABC-10", "ABC-14"]);
    await tick();
    await choose("ABC-14", "Retirer du sprint", "Vers Sprint 44");
    expect(planning.removeIssues.mock.calls).toEqual([
      [["ABC-10", "ABC-14"], { kind: "sprint", sprintId: 44 }],
    ]);
  });
});

describe("Sprint Planning en direct : estimation sur la carte (8.17)", () => {
  const estimateButton = (issueKey: string) =>
    cardOf(issueKey).querySelector<HTMLButtonElement>("button.planning-estimate");

  it("clic sur la valeur, saisie, Entrée : une seule demande ; la sortie juste après ne renvoie rien", async () => {
    const { planning } = setup();
    planning.canEstimate.value = true;
    await tick();
    estimateButton("ABC-12")?.click();
    await tick();
    const input = find<HTMLInputElement>('[aria-label="Estimation de ABC-12"]');
    expect(cardOf("ABC-12").getAttribute("draggable")).not.toBe("true");
    input.value = "3";
    key(input, "Enter");
    blur(input);
    expect(planning.estimateIssue.mock.calls).toEqual([["ABC-12", 3]]);
  });

  it("Échap annule, une valeur vide ou inchangée n'écrit rien", async () => {
    const { planning } = setup();
    planning.canEstimate.value = true;
    await tick();
    estimateButton("ABC-10")?.click();
    await tick();
    let input = find<HTMLInputElement>('[aria-label="Estimation de ABC-10"]');
    input.value = "8";
    key(input, "Escape");
    await tick();
    estimateButton("ABC-10")?.click();
    await tick();
    input = find<HTMLInputElement>('[aria-label="Estimation de ABC-10"]');
    input.value = "5";
    key(input, "Enter");
    await tick();
    estimateButton("ABC-10")?.click();
    await tick();
    input = find<HTMLInputElement>('[aria-label="Estimation de ABC-10"]');
    input.value = "";
    blur(input);
    expect(planning.estimateIssue).not.toHaveBeenCalled();
  });

  it("sans estimation possible, ou en consultation, la valeur n'est pas un bouton", async () => {
    const { planning } = setup();
    await tick();
    expect(estimateButton("ABC-10")).toBeNull();
    planning.canEstimate.value = true;
    await tick();
    expect(estimateButton("ABC-10")).not.toBeNull();
    expect(estimateButton("ABC-13")).toBeNull();
  });
});
