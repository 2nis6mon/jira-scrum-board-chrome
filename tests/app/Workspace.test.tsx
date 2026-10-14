// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, PRESENTATION_HINT_MS } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { SPRINT_HEALTH_ENABLED } from "../../src/app/views/board/BoardView";
import { DIAGNOSTIC_ENABLED } from "../../src/app/views/DiagnosticView";
import { visibleColumns } from "../../src/core/boardConfiguration";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  withSecondBoard,
} from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { statusJson } from "../support/jiraFixtures";

// Barre latérale, en-tête, barre de filtres, réglages du board et menu « Site Jira ».

afterEach(() => {
  render(null, document.body);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = () => document.body.textContent ?? "";
const cardKeys = () =>
  [...document.querySelectorAll<HTMLElement>("[data-issue-key]")].map(
    (card) => card.dataset.issueKey,
  );
const boardLanes = () =>
  [...document.querySelectorAll<HTMLElement>("section.lane")].map((lane) =>
    lane.getAttribute("aria-label"),
  );
const sidebarLanes = () =>
  [...document.querySelectorAll<HTMLElement>(".sidebar-lane .sidebar-lane-title")].map(
    (title) => title.textContent,
  );

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
  if (!found) throw new Error(`bouton « ${label} » introuvable`);
  return found;
}

function labelled(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`bouton « ${label} » introuvable`);
  return found;
}

/** Ligne d'une swimlane dans la barre latérale (glissable), qui porte son bouton et son œil. */
function sidebarRow(title: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(".sidebar-lane")].find(
    (row) => row.querySelector(".sidebar-lane-title")?.textContent === title,
  );
  if (!found) throw new Error(`swimlane « ${title} » absente de la barre latérale`);
  return found;
}

function sidebarLink(title: string): HTMLButtonElement {
  const found = sidebarRow(title).querySelector<HTMLButtonElement>(".sidebar-lane-main");
  if (!found) throw new Error(`bouton de « ${title} » attendu`);
  return found;
}

const TEAM_PROPERTY = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;

async function connectedBoard(jira = boardSiteJira()) {
  const model = new AppModel(fakePlatform(jira));
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  await connection.board.detect(BOARD_URL);
  await tick();
  return { model, jira, board: connection.board };
}

/** Relève les swimlanes que la page fait défiler jusqu'à l'écran. */
async function withScrollSpy(run: (scrolled: string[]) => Promise<void>) {
  const scrolled: string[] = [];
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push((this as HTMLElement).dataset.laneId ?? "?");
  };
  try {
    await run(scrolled);
  } finally {
    Element.prototype.scrollIntoView = original;
  }
}

describe("barre latérale", () => {
  it("met en évidence un Goal atteint dans les deux vues et retire ce repère à sa réouverture", async () => {
    const { board } = await connectedBoard();
    const snapshot = board.snapshot.value;
    const config = board.configuration.value;
    const goal = snapshot?.goals[0];
    if (!snapshot || !config || !goal) throw new Error("board et Goal attendus");
    const last = visibleColumns(config.columns).at(-1);
    if (!last) throw new Error("dernière colonne attendue");
    expect(snapshot.goalIssues.some((issue) => issue.goalId === goal.id)).toBe(true);
    board.snapshot.value = {
      ...snapshot,
      goalIssues: snapshot.goalIssues.map((issue) =>
        issue.goalId === goal.id ? { ...issue, columnId: last.id } : issue,
      ),
    };
    await tick();
    expect(sidebarRow(goal.title).classList.contains("sidebar-lane-completed")).toBe(true);
    expect(sidebarRow(goal.title).querySelector('[aria-label="Objectif atteint"]')).toBeNull();
    expect(
      document.querySelector('.lane-header-completed [aria-label="Objectif atteint"]'),
    ).not.toBeNull();
    expect(sidebarRow(goal.title).querySelector(".sidebar-goal-complete-bar")).toBeNull();
    expect(
      document.querySelector(`[data-lane-id="goal:${goal.id}"] .lane-header-completed`),
    ).not.toBeNull();
    expect(document.querySelector(".counter-goals strong")?.textContent).toBe("2/2");
    expect(document.querySelector(".counter-goals")?.textContent).toContain("Goals atteints");
    expect(sidebarRow(goal.title).querySelector(".eye-toggle")).not.toBeNull();
    board.snapshot.value = snapshot;
    await tick();
    expect(sidebarRow(goal.title).classList.contains("sidebar-lane-completed")).toBe(false);
    expect(sidebarRow(goal.title).querySelector(".sidebar-goal-complete-bar")).toBeNull();
    expect(
      document.querySelector(`[data-lane-id="goal:${goal.id}"] .lane-header-completed`),
    ).toBeNull();
    expect(document.querySelector(".counter-goals strong")?.textContent).toBe("1/2");
    board.dispose();
  });

  it("board affiché, vue du sprint, swimlanes dans l'ordre du board, « Site Jira » en pied", async () => {
    await connectedBoard();
    const sidebar = document.querySelector(".sidebar");

    expect(sidebar?.querySelector(".board-switcher-name")?.textContent).toBe("Équipe Paiement");
    const nav = [...(sidebar?.querySelectorAll(".sidebar-nav .sidebar-nav-item") ?? [])].map(
      (item) => [item.textContent, item.getAttribute("aria-current")],
    );
    // Les réglages restent accessibles dans le menu du board.
    expect(nav).toEqual([
      ["Sprint", "page"],
      ["Sprint Planning", null],
    ]);
    expect(document.querySelector("button.settings-open")).toBeNull();
    expect(document.querySelector(".menu-settings")).not.toBeNull();
    const site = sidebar?.querySelector(".sidebar-site-toggle");
    expect(site?.textContent).toBe("Site Jiraacme.atlassian.net");
    expect(site?.getAttribute("aria-expanded")).toBe("false");
    expect(sidebar?.querySelector(".sidebar-section-title")?.textContent).toBe(
      "Objectifs du sprint2",
    );
    expect([...document.querySelectorAll(".sidebar-lane")].map((row) => row.textContent)).toEqual([
      "Finaliser le parcours de paiement0/2",
      "Améliorer la stabilité1/1",
      "Build2",
      "Anomalie Prod1",
    ]);
    expect(sidebarLanes()).toEqual(boardLanes());
  });

  it("un clic sur une swimlane l'amène à l'écran, dépliée si elle était repliée", async () => {
    await withScrollSpy(async (scrolled) => {
      const { board } = await connectedBoard();
      labelled("Replier Build").click();
      await tick();
      expect(cardKeys()).not.toContain("ABC-104");

      sidebarLink("Build").click();
      await expect.poll(() => scrolled).toEqual(["build"]);
      expect(board.configuration.value?.collapsedBlockIds).not.toContain("build");
      expect(cardKeys()).toContain("ABC-104");
    });
  });

  it("glissé d'une swimlane : ligne d'insertion dans la barre latérale et sur le board, même ordre après", async () => {
    // happy-dom ne relie pas les événements de glissé aux gestionnaires de Preact : le geste
    // lui-même est vérifié dans Chrome (banc d'essai) ; ici, l'état qu'il partage entre les vues.
    const { jira, board } = await connectedBoard();
    expect(sidebarLink("Anomalie Prod").getAttribute("draggable")).toBe("true");
    const stability = board.laneOrder.value[1] ?? "";

    board.startLaneDrag("swimlane:1");
    board.setLaneDropTarget(stability);
    await tick();
    expect(sidebarRow("Anomalie Prod").classList.contains("lane-dragging")).toBe(true);
    expect(document.querySelector(".sidebar-drop-line")).not.toBeNull();
    expect(document.querySelector(".lane-drop-line")).not.toBeNull();

    await board.dropLane("swimlane:1", stability);
    await tick();
    const expected = [
      "Finaliser le parcours de paiement",
      "Anomalie Prod",
      "Améliorer la stabilité",
      "Build",
    ];
    expect(boardLanes()).toEqual(expected);
    expect(sidebarLanes()).toEqual(expected);
    expect(document.querySelector(".sidebar-drop-line")).toBeNull();
    // L'ordre est partagé : une écriture de la propriété du board, rien d'autre.
    expect(jira.requests.filter(isWriteRequest).map((r) => `${r.method} ${r.path}`)).toEqual([
      `PUT ${TEAM_PROPERTY}`,
    ]);
  });

  it("l'œil d'un objectif le masque ; celui d'un objectif masqué le réaffiche", async () => {
    const { jira } = await connectedBoard();
    // Seuls les objectifs ont un œil : Build et Kanban ne se masquent pas.
    expect(sidebarRow("Build").querySelector(".eye-toggle")).toBeNull();
    expect(sidebarRow("Anomalie Prod").querySelector(".eye-toggle")).toBeNull();

    const hide = labelled("Masquer « Améliorer la stabilité » du board");
    expect(hide.classList.contains("eye-toggle-hidden")).toBe(false);
    expect(hide.querySelector(".eye-open")).not.toBeNull();
    expect(hide.querySelector(".eye-shut")).not.toBeNull();
    hide.click();
    await tick();
    expect(sidebarLanes()).not.toContain("Améliorer la stabilité");
    expect(boardLanes()).not.toContain("Améliorer la stabilité");

    // Les objectifs masqués sont listés en bas de la barre, œil fermé.
    const show = labelled("Réafficher « Améliorer la stabilité » sur le board");
    expect(show.classList.contains("eye-toggle-hidden")).toBe(true);
    show.click();
    await tick();
    expect(sidebarLanes()).toEqual(boardLanes());
    expect(sidebarLanes()).toContain("Améliorer la stabilité");
    expect(document.querySelector(".sidebar-hidden")).toBeNull();
    // Masquer puis réafficher : deux écritures des réglages partagés, rien d'autre.
    expect(jira.requests.filter(isWriteRequest).map((r) => `${r.method} ${r.path}`)).toEqual([
      `PUT ${TEAM_PROPERTY}`,
      `PUT ${TEAM_PROPERTY}`,
    ]);
  });

  it("la bordure de la barre latérale se règle au clavier et revient par double-clic", async () => {
    const { model } = await connectedBoard();
    const handle = document.querySelector<HTMLElement>(".sidebar-resizer");
    if (!handle) throw new Error("bordure attendue");
    const sidebar = () => document.querySelector<HTMLElement>(".sidebar");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuemin")).toBe("200");
    expect(handle.getAttribute("aria-valuenow")).toBe("248");
    expect(sidebar()?.style.getPropertyValue("--sidebar-width")).toBe("248px");

    const key = (name: string, shiftKey = false) =>
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true }));
    key("ArrowRight");
    await tick();
    expect(model.sidebarWidth.value).toBe(264);
    expect(sidebar()?.style.getPropertyValue("--sidebar-width")).toBe("264px");
    key("ArrowLeft", true);
    await tick();
    expect(model.sidebarWidth.value).toBe(200);
    key("End");
    await tick();
    expect(model.sidebarWidth.value).toBe(Math.floor(window.innerWidth / 2));

    handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();
    expect(model.sidebarWidth.value).toBe(248);
  });

  it("menu des boards : liste des boards enregistrés, bascule d'un clic, retrait confirmé", async () => {
    const { board, jira } = await connectedBoard(withSecondBoard(boardSiteJira()));
    await board.detect(SECOND_BOARD_URL);
    await tick();
    const name = () => document.querySelector(".board-switcher-name")?.textContent;
    const choices = () =>
      [...document.querySelectorAll(".board-choice")].map((choice) => [
        choice.querySelector(".board-choice-name")?.textContent,
        choice.getAttribute("aria-current"),
      ]);
    expect(name()).toBe("Équipe Compte");
    expect(document.querySelector(".board-switcher-count")?.textContent).toBe("2");
    expect(choices()).toEqual([
      ["Équipe Compte · XYZ", "true"],
      ["Équipe Paiement · ABC", null],
    ]);
    expect(cardKeys()).toEqual(["XYZ-1"]);

    button("Équipe Paiement · ABC").click();
    await expect.poll(() => cardKeys()).toContain("ABC-101");
    expect(name()).toBe("Équipe Paiement");

    // Retrait : une confirmation, qu'on peut annuler.
    button("Retirer « Équipe Paiement » de l'extension…").click();
    await tick();
    expect(document.querySelector("[role=dialog]")?.textContent).toContain(
      "Rien n'est supprimé dans Jira",
    );
    button("Annuler").click();
    await tick();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(choices()).toHaveLength(2);

    button("Retirer « Équipe Paiement » de l'extension…").click();
    await tick();
    button("Retirer de l'extension").click();
    await expect.poll(() => name()).toBe("Équipe Compte");
    expect(choices()).toEqual([["Équipe Compte · XYZ", "true"]]);
    expect(document.querySelector(".board-switcher-count")).toBeNull();
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("le menu du board permet d'en rechercher un par son nom", async () => {
    await connectedBoard();
    expect(button("Relire colonnes et types depuis Jira")).toBeDefined();
    button("Ajouter un board…").click();
    await tick();
    expect(document.querySelector(".connection h2")?.textContent).toBe("Quel board afficher ?");
  });

  it.skipIf(SPRINT_HEALTH_ENABLED)(
    "santé du sprint masquée pour l'instant : ni bouton ni panneau, même laissée ouverte",
    async () => {
      const { model } = await connectedBoard();
      model.healthOpen.value = true;
      await tick();
      expect(document.querySelector('button[aria-label="Santé du sprint"]')).toBeNull();
      expect(document.querySelector(".health-panel")).toBeNull();
    },
  );

  it.skipIf(!SPRINT_HEALTH_ENABLED)(
    "santé du sprint : panneau au-dessus des swimlanes, comptages, filtres appliqués",
    async () => {
      const { jira, board, model } = await connectedBoard();
      const toggle = labelled("Santé du sprint");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(document.querySelector(".health-panel")).toBeNull();

      toggle.click();
      await tick();
      expect(labelled("Santé du sprint").getAttribute("aria-pressed")).toBe("true");
      const panel = document.querySelector(".health-panel");
      expect(panel?.querySelector("h2")?.textContent).toBe("Santé du sprint");
      // Le panneau s'ouvre entre les filtres et les swimlanes, qui restent affichées.
      const screen = document.querySelector("main.board-screen");
      const order = [...(screen?.children ?? [])].map((child) => child.className);
      expect(order.indexOf("health-panel")).toBeGreaterThan(order.indexOf("filter-bar"));
      expect(order.indexOf("health-panel")).toBeLessThan(order.indexOf("board"));
      expect(cardKeys()).toContain("ABC-101");
      expect(model.view.value).toBe("board");

      const kpis = () =>
        [...document.querySelectorAll(".health-kpi")].map((kpi) => kpi.textContent ?? "");
      expect(kpis()).toEqual([
        "Story points livrés3 / 1718 % du sprint",
        "Tickets terminés1 / 52 en cours · 2 à faire",
        "Bloqués1 / 6lien Jira « est bloqué par » ou label",
      ]);
      // Sans historique Jira, rien n'est affirmé sur le périmètre ajouté.
      expect(text()).toContain("Jira n'a pas fourni l'historique du sprint");
      expect(
        [...document.querySelectorAll(".health-goal-title")].map((title) => title.textContent),
      ).toEqual(["Finaliser le parcours de paiement", "Améliorer la stabilité"]);

      const watched = [...document.querySelectorAll(".health-watch tbody tr")];
      expect(watched).toHaveLength(1);
      const link = watched[0]?.querySelector<HTMLAnchorElement>("a");
      expect(link?.textContent).toBe("ABC-102");
      expect(link?.href).toBe("https://acme.atlassian.net/browse/ABC-102");
      expect(link?.target).toBe("_blank");
      expect(watched[0]?.textContent).toContain("Bloqué");

      // Les filtres de la barre s'appliquent.
      board.setSearch("paiement");
      await tick();
      // ABC-101 (en cours) et ABC-102 (à faire) parlent de paiement.
      expect(kpis()[1]).toBe("Tickets terminés0 / 21 en cours · 1 à faire");

      // Le bouton du panneau le referme, comme celui de l'en-tête.
      labelled("Masquer la santé du sprint").click();
      await tick();
      expect(document.querySelector(".health-panel")).toBeNull();
      expect(labelled("Santé du sprint").getAttribute("aria-pressed")).toBe("false");
      expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    },
  );
});

describe("en-tête du sprint", () => {
  it("sprint actif, avancement en points et Goals atteints, sans heure de dernière lecture", async () => {
    await connectedBoard();
    expect(document.querySelector(".sprint-name")?.textContent).toBe("Sprint 42actif");
    expect(document.querySelector(".sprint-progress strong")?.textContent).toBe("3/17 pts");
    expect(document.querySelector(".sprint-percent")?.textContent).toBe("18 %");
    expect(document.querySelector(".counter-goals strong")?.textContent).toBe("1/2");
    expect(document.querySelector(".sync-status")).toBeNull();
  });

  it.each(["scrum", "kanban"] as const)(
    "%s : aucun compteur bloqué, ajouté ou Build, mais les filtres restent utilisables",
    async (boardType) => {
      const { board } = await connectedBoard();
      const snapshot = board.snapshot.value;
      const configuration = board.configuration.value;
      if (!snapshot || !configuration) throw new Error("board attendu");
      board.configuration.value = { ...configuration, boardType };
      board.snapshot.value = {
        ...snapshot,
        sprint: boardType === "kanban" ? null : snapshot.sprint,
        activeSprints: boardType === "kanban" ? [] : snapshot.activeSprints,
        goalIssues: snapshot.goalIssues.map((issue) => ({
          ...issue,
          addedAfterSprintStart: issue.issue.key === "ABC-105",
        })),
      };
      await tick();

      // La fixture contient un ticket bloqué, un ajouté et deux dans Build : aucun compteur
      // ne réapparaît quand sa valeur est positive, en Scrum comme en Kanban.
      const header = document.querySelector(".sprint-header");
      expect(header?.textContent).not.toMatch(/bloqué|ajouté|dans Build/i);
      expect(header?.querySelector(".counter-goals strong")?.textContent).toBe("1/2");
      expect(sidebarLink("Build")).not.toBeNull();
      if (boardType === "kanban") expect(header?.textContent).toContain("6 tickets · 1 terminé");

      button("Bloqués").click();
      await tick();
      expect(cardKeys()).toEqual(["ABC-102"]);
      button("Bloqués").click();
      await tick();
      expect(cardKeys()).toHaveLength(6);
      if (boardType === "scrum") {
        button("Ajoutés").click();
        await tick();
        expect(cardKeys()).toEqual(["ABC-105"]);
      }
    },
  );

  it("le bouton de la barre latérale la masque et la rend", async () => {
    await connectedBoard();
    labelled("Masquer la barre latérale").click();
    await tick();
    expect(document.querySelector(".sidebar")).toBeNull();
    labelled("Afficher la barre latérale").click();
    await tick();
    expect(document.querySelector(".sidebar")).not.toBeNull();
  });
});

describe("mode présentation", () => {
  const exitButton = () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Quitter le mode présentation"]');
  const pressEscape = (target: EventTarget = document) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  it("masque barre latérale et en-tête ; restent les filtres, le board et un bouton pour revenir", async () => {
    const { model, jira } = await connectedBoard();
    labelled("Mode présentation").click();
    await tick();
    expect(model.presenting.value).toBe(true);
    expect(document.querySelector(".sidebar")).toBeNull();
    expect(document.querySelector(".sprint-header")).toBeNull();
    expect(document.querySelector(".filter-bar")).not.toBeNull();
    expect(cardKeys()).toContain("ABC-101");
    expect(document.querySelector(".presentation-hint")?.textContent).toBe(
      "Mode présentation · Échap pour revenir",
    );
    // Le chemin du retour ne disparaît jamais : au bout de la barre de filtres.
    expect(document.querySelector(".filter-bar")?.lastElementChild?.contains(exitButton())).toBe(
      true,
    );

    exitButton()?.click();
    await tick();
    expect(model.presenting.value).toBe(false);
    expect(document.querySelector(".sidebar")).not.toBeNull();
    expect(document.querySelector(".sprint-header")).not.toBeNull();
    expect(document.querySelector(".presentation-hint")).toBeNull();
    expect(exitButton()).toBeNull();
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("demande le plein écran ; Échap (sortie du plein écran) revient au mode normal", async () => {
    const { model } = await connectedBoard();
    // Effets de Preact posés (ils suivent l'affichage) avant le geste.
    await new Promise((resolve) => setTimeout(resolve, 60));
    let fullscreenElement: Element | null = null;
    const request = vi.fn(async () => {
      fullscreenElement = document.documentElement;
    });
    const exit = vi.fn(async () => {
      fullscreenElement = null;
    });
    document.documentElement.requestFullscreen = request;
    document.exitFullscreen = exit;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    try {
      labelled("Mode présentation").click();
      await tick();
      expect(request).toHaveBeenCalledOnce();
      // Échap en plein écran : le navigateur en sort sans transmettre la touche à la page.
      pressEscape();
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(model.presenting.value).toBe(true);
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      await tick();
      expect(model.presenting.value).toBe(false);

      // « Quitter » rend le plein écran.
      labelled("Mode présentation").click();
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(request).toHaveBeenCalledTimes(2);
      exitButton()?.click();
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(model.presenting.value).toBe(false);
      expect(exit).toHaveBeenCalledOnce();
    } finally {
      fullscreenElement = null;
      Reflect.deleteProperty(document, "fullscreenElement");
      Reflect.deleteProperty(document, "exitFullscreen");
      Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    }
  });

  it("Échap revient au mode normal, après un menu ouvert, une fenêtre ou une recherche remplie", async () => {
    const { model } = await connectedBoard();
    labelled("Mode présentation").click();
    await tick();

    // Un menu ouvert se referme d'abord.
    const menu = document.querySelector<HTMLDetailsElement>("details.filter-menu");
    if (!menu) throw new Error("menu de filtre attendu");
    menu.open = true;
    pressEscape();
    expect(menu.open).toBe(false);
    expect(model.presenting.value).toBe(true);

    // Une fenêtre ouverte garde Échap pour elle.
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    pressEscape();
    expect(model.presenting.value).toBe(true);
    dialog.remove();

    // Dans la recherche remplie, Échap efface d'abord le texte.
    const search = document.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error("recherche attendue");
    search.value = "paiement";
    pressEscape(search);
    expect(model.presenting.value).toBe(true);
    search.value = "";

    pressEscape();
    await tick();
    expect(model.presenting.value).toBe(false);
    expect(document.querySelector(".sidebar")).not.toBeNull();
  });

  it("la bulle d'aide s'efface au bout de 5 secondes ; le bouton Quitter reste", async () => {
    await connectedBoard();
    vi.useFakeTimers();
    try {
      labelled("Mode présentation").click();
      await vi.advanceTimersByTimeAsync(PRESENTATION_HINT_MS - 1000);
      expect(document.querySelector(".presentation-hint")).not.toBeNull();
      await vi.advanceTimersByTimeAsync(1500);
      expect(document.querySelector(".presentation-hint")).toBeNull();
      expect(exitButton()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("la barre latérale retrouve son état : repliée avant, repliée après", async () => {
    const { model } = await connectedBoard();
    labelled("Masquer la barre latérale").click();
    await tick();
    labelled("Mode présentation").click();
    await tick();
    exitButton()?.click();
    await tick();
    expect(model.sidebarCollapsed.value).toBe(true);
    expect(document.querySelector(".sidebar")).toBeNull();
    expect(document.querySelector(".sprint-header")).not.toBeNull();
  });
});

describe("barre de filtres", () => {
  it("chaque filtre a son icône ; ni Priorité, ni Objectif, ni Composant", async () => {
    await connectedBoard(
      boardSiteJira({
        quickFilters: [{ id: 5, name: "WEB", jql: "component = Web", position: 0 }],
      }),
    );
    const menus = [...document.querySelectorAll("details.filter-menu > summary")].map((summary) => [
      summary.textContent,
      summary.querySelector("svg.icon") !== null,
    ]);
    expect(menus).toEqual([
      ["Personne", true],
      ["Type", true],
      ["Parent", true],
      ["Statut", true],
      ["Label", true],
    ]);
    expect(document.querySelector(".filter-search svg.icon")).not.toBeNull();
    expect(button("Bloqués").querySelector("svg.icon")).not.toBeNull();
    expect(button("Ajoutés").querySelector("svg.icon")).not.toBeNull();
    // Filtres rapides Jira : une icône à la place du libellé, gardé pour les lecteurs d'écran.
    expect(document.querySelector(".jira-quick-filters-icon svg.icon")).not.toBeNull();
    expect(document.querySelector(".jira-quick-filters legend")?.className).toBe("visually-hidden");
    expect(document.querySelectorAll(".filter-bar .filter-separator")).toHaveLength(3);
  });
});

describe("réglages du board et menu « Site Jira »", () => {
  it("réglages partagés : chaque modification est écrite dans Jira et reprise au chargement", async () => {
    const jira = boardSiteJira();
    const { model, board } = await connectedBoard(jira);
    await board.moveLane("build", -1);
    await expect.poll(() => jira.sent("PUT", TEAM_PROPERTY).length).toBe(1);
    const written = jira.sent("PUT", TEAM_PROPERTY)[0]?.body as {
      publishedBy: { displayName: string };
      settings: { blockOrder: string[] };
    };
    expect(written.publishedBy.displayName).toBe("Camille Durand");
    expect(written.settings.blockOrder.indexOf("build")).toBeLessThan(
      written.settings.blockOrder.indexOf("goal:g-stabilite"),
    );
    // Plus de publication ni de choix à faire : ni onglet ni bandeau ; l'état est dans l'en-tête.
    button("Réglages").click();
    await tick();
    expect(text()).not.toContain("Publier pour l'équipe");
    expect(document.querySelector(".settings-status")?.textContent).toContain(
      "Enregistrés dans Jira par Camille Durand",
    );
    model.showBoard();

    // Un collègue, dans un autre navigateur, retrouve l'ordre au chargement du board.
    render(null, document.body);
    const colleague = new AppModel(fakePlatform(jira));
    render(<App model={colleague} />, document.body);
    await colleague.connect("acme.atlassian.net");
    const connection = colleague.connection.value;
    if (connection.state !== "connected") throw new Error("connexion attendue");
    await connection.board.detect(BOARD_URL);
    await tick();
    expect(boardLanes()).toEqual(sidebarLanes());
    expect(boardLanes().indexOf("Build")).toBeLessThan(
      boardLanes().indexOf("Améliorer la stabilité"),
    );
    // Lire n'écrit rien.
    expect(jira.sent("PUT", TEAM_PROPERTY)).toHaveLength(1);
  });

  it("sans droit de modifier le board dans Jira : ni réglages du board, ni ordre, ni œil, ni couleur", async () => {
    const jira = boardSiteJira({ canEdit: false });
    const { model, board } = await connectedBoard(jira);
    await expect.poll(() => board.canEditBoard.value).toBe(false);
    await tick();
    expect(document.querySelector(".lane-grip")).toBeNull();
    expect(document.querySelector(".sidebar-grip")).toBeNull();
    expect(document.querySelector(".eye-toggle")).toBeNull();
    const laneEntries = [...document.querySelectorAll(".lane-menu button")].map((b) =>
      b.textContent?.trim(),
    );
    expect(laneEntries).not.toContain("Descendre");
    expect(laneEntries).not.toContain("Configurer les swimlanes…");
    expect(laneEntries).not.toContain("Gérer les objectifs…");
    // Le repli reste possible : il est personnel.
    expect(document.querySelector("[aria-label='Replier Build']")).not.toBeNull();

    // Aucune entrée vers les réglages du board, et pas d'accès direct non plus.
    expect(document.querySelector("button.settings-open")).toBeNull();
    expect(document.querySelector(".menu-settings")).toBeNull();
    expect(
      [...document.querySelectorAll(".sidebar-nav .sidebar-nav-item")].map((b) => b.textContent),
    ).toEqual(["Sprint", "Sprint Planning"]);
    model.showSettings("board");
    await tick();
    expect(document.querySelector(".settings-screen")).toBeNull();
    await expect.poll(() => model.view.value).toBe("board");

    // Le menu « Site Jira » reste : diagnostic, site et déconnexion.
    button("Site Jira").click();
    await tick();
    expect(document.querySelector(".sidebar .settings-site")?.textContent).toBe(
      "acme.atlassian.net",
    );
    expect(button("Se déconnecter")).not.toBeNull();
    if (DIAGNOSTIC_ENABLED) expect(button("Diagnostic").disabled).toBe(false);

    // Même appelé directement, un réglage partagé n'est ni appliqué ni écrit.
    const before = board.laneOrder.value;
    await board.moveLane("build", -1);
    expect(board.laneOrder.value).toEqual(before);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("« Site Jira » se déplie sous son bouton et se replie, sans quitter le sprint", async () => {
    const { model } = await connectedBoard();
    expect(document.querySelector(".sidebar-site-menu")).toBeNull();

    button("Site Jira").click();
    await tick();
    const menu = document.querySelector(".sidebar .sidebar-site-menu");
    expect(menu).not.toBeNull();
    expect(button("Site Jira").getAttribute("aria-expanded")).toBe("true");
    // Le bouton reste en tête de son panneau, ses entrées juste au-dessous, sur un fond à part.
    expect(menu?.previousElementSibling).toBe(button("Site Jira"));
    expect(button("Site Jira").parentElement?.classList.contains("is-open")).toBe(true);
    expect(menu?.querySelector(".settings-site")?.textContent).toBe("acme.atlassian.net");
    // Déplier le menu ne change pas de vue.
    expect(model.view.value).toBe("board");
    expect(cardKeys()).toContain("ABC-101");

    button("Site Jira").click();
    await tick();
    expect(document.querySelector(".sidebar-site-menu")).toBeNull();
    expect(model.view.value).toBe("board");

    if (!DIAGNOSTIC_ENABLED) return;
    // Replier le menu pendant le diagnostic ramène au sprint.
    button("Site Jira").click();
    await tick();
    button("Diagnostic").click();
    await tick();
    expect(button("Diagnostic").getAttribute("aria-current")).toBe("page");
    expect(model.view.value).toBe("diagnostic");
    button("Site Jira").click();
    await tick();
    expect(document.querySelector(".sidebar-site-menu")).toBeNull();
    expect(model.view.value).toBe("board");

    // Quitter le diagnostic par une autre entrée de la barre replie aussi le menu.
    button("Site Jira").click();
    await tick();
    button("Diagnostic").click();
    await tick();
    button("Sprint").click();
    await tick();
    expect(document.querySelector(".sidebar-site-menu")).toBeNull();
    expect(model.view.value).toBe("board");
  });

  it("réglages du board affiché en quatre onglets ; « Site Jira » : diagnostic et déconnexion", async () => {
    await connectedBoard();
    button("Réglages").click();
    await tick();

    const nav = [...document.querySelectorAll(".sidebar-nav .sidebar-nav-item")];
    expect(nav.map((item) => item.textContent)).toEqual(["Sprint", "Sprint Planning"]);
    expect(nav.map((item) => item.getAttribute("aria-current"))).toEqual([null, null]);
    expect([...document.querySelectorAll("[role=tab]")].map((tab) => tab.textContent)).toEqual([
      "Board",
      "Objectifs",
      "Champs des cartes",
      "Couleurs des cartes",
    ]);
    expect(document.querySelector(".settings-board")?.textContent).toBe(
      "Équipe Paiement · Scrum · #7",
    );

    button("Site Jira").click();
    await tick();
    if (DIAGNOSTIC_ENABLED) {
      button("Diagnostic").click();
      await expect.poll(() => document.querySelectorAll(".probe").length).toBeGreaterThan(0);
    }

    const confirmation = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmation);
    button("Se déconnecter").click();
    await tick();
    expect(document.querySelector(".sidebar")).not.toBeNull();
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("réglages"));
    confirmation.mockReturnValue(true);
    button("Se déconnecter").click();
    vi.unstubAllGlobals();
    await expect.poll(() => document.querySelector("h2")?.textContent).toBe("Connexion à Jira");
    expect(document.querySelector(".sidebar")).toBeNull();
  });
});

describe("zones de dépôt par statut", () => {
  it("le dépôt DOM garde l'action annoncée avant de terminer le glissé", async () => {
    // Happy DOM omet cette propriété native ; Preact reconnaît ainsi le nom normal « drop ».
    const originalDrop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "ondrop");
    Object.defineProperty(HTMLElement.prototype, "ondrop", {
      configurable: true,
      writable: true,
      value: null,
    });
    try {
      const path = "/rest/api/3/issue/ABC-102/transitions";
      const first = { id: "21", name: "Démarrer", to: statusJson("3", "En cours") };
      const other = { id: "22", name: "Autre démarrage", to: statusJson("3", "En cours") };
      const jira = boardSiteJira()
        .on("GET", "/rest/api/3/issue/ABC-102", {
          status: 200,
          json: { fields: { status: statusJson("1", "À faire") } },
        })
        .on("GET", path, { status: 200, json: { transitions: [first, other] } })
        .on("POST", path, { status: 204 });
      const { board } = await connectedBoard(jira);
      board.startDrag("ABC-102", null);
      await expect.poll(() => board.dragTransitions.value.kind).toBe("ready");
      await tick();
      jira.on("GET", path, { status: 200, json: { transitions: [other, first] } });
      const zone = document.querySelector(
        'ul[aria-label="Finaliser le parcours de paiement — En cours"] [data-status-id="3"]',
      );
      if (!zone) throw new Error("Zone de dépôt vers En cours attendue");
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: {
          getData: (type: string) => (type === "application/x-scrum-board-issue" ? "ABC-102" : ""),
        },
      });
      zone.dispatchEvent(event);
      await expect.poll(() => jira.sent("POST", path).length).toBe(1);
      expect(jira.sent("POST", path)[0]?.body).toEqual({ transition: { id: "21" } });
      expect(board.dragging.value).toBeNull();
      expect(board.transitionChoice.value).toBeNull();
      await expect.poll(() => board.pendingKeys.value.size).toBe(0);
      board.dispose();
    } finally {
      if (originalDrop) Object.defineProperty(HTMLElement.prototype, "ondrop", originalDrop);
      else Reflect.deleteProperty(HTMLElement.prototype, "ondrop");
    }
  });

  it.each([true, false])(
    "le survol indique le formulaire uniquement pour la première transition (formulaire : %s)",
    async (firstHasScreen) => {
      const jira = boardSiteJira().on("GET", "/rest/api/3/issue/ABC-102/transitions", {
        status: 200,
        json: {
          transitions: [
            {
              id: "21",
              name: "Démarrer",
              to: statusJson("3", "En cours"),
              hasScreen: firstHasScreen,
            },
            {
              id: "22",
              name: "Autre démarrage",
              to: statusJson("3", "En cours"),
              hasScreen: !firstHasScreen,
            },
          ],
        },
      });
      const { board } = await connectedBoard(jira);
      board.startDrag("ABC-102", null);
      await expect.poll(() => board.dragTransitions.value.kind).toBe("ready");
      await tick();
      const cell = document.querySelector(
        'ul[aria-label="Finaliser le parcours de paiement — En cours"]',
      );
      const zones = cell?.querySelectorAll(".status-drop-zone");
      expect(zones).toHaveLength(1);
      expect(zones?.[0]?.getAttribute("data-status-id")).toBe("3");
      expect(zones?.[0]?.textContent?.includes("Formulaire à compléter")).toBe(firstHasScreen);
      expect(board.transitionChoice.value).toBeNull();
      expect(jira.requests.filter(isWriteRequest)).toEqual([]);
      board.endDrag();
      board.dispose();
    },
  );

  it("affiche les statuts, grise les destinations impossibles et nettoie la fin du geste", async () => {
    const jira = boardSiteJira().on("GET", "/rest/api/3/issue/ABC-102/transitions", {
      status: 200,
      json: {
        transitions: [
          { id: "21", name: "Démarrer", to: statusJson("3", "En cours") },
          { id: "22", name: "Relire", to: statusJson("4", "Revue"), hasScreen: true },
        ],
      },
    });
    const { board } = await connectedBoard(jira);
    board.startDrag("ABC-102", null);
    await tick();
    await tick();
    const cell = document.querySelector(
      'ul[aria-label="Finaliser le parcours de paiement — En cours"]',
    );
    expect(
      [...(cell?.querySelectorAll(".status-drop-zone") ?? [])].map((zone) =>
        zone.getAttribute("data-status-id"),
      ),
    ).toEqual(["3", "4"]);
    expect(cell?.textContent).toContain("Formulaire à compléter");
    expect(
      document
        .querySelector('ul[aria-label="Finaliser le parcours de paiement — Terminé"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      document.querySelector(
        'ul[aria-label="Finaliser le parcours de paiement — À faire"] .status-drop-zone',
      ),
    ).toBeNull();
    board.endDrag();
    await tick();
    expect(document.querySelector(".status-drop-zone")).toBeNull();
    expect(document.querySelector(".lane-cell-unavailable")).toBeNull();
  });
});
