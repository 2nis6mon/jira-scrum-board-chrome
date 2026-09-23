// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, PRESENTATION_HINT_MS } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
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

// Barre latérale, en-tête, barre de filtres et administration (maquette de l'app Mac).

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
    const last = visibleColumns(config.scrumColumns).at(-1);
    if (!last) throw new Error("dernière colonne attendue");
    expect(snapshot.scrumIssues.some((issue) => issue.goalId === goal.id)).toBe(true);
    board.snapshot.value = {
      ...snapshot,
      scrumIssues: snapshot.scrumIssues.map((issue) =>
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

  it("board affiché, vue du sprint, swimlanes dans l'ordre du board, Administration en pied", async () => {
    await connectedBoard();
    const sidebar = document.querySelector(".sidebar");

    expect(sidebar?.querySelector(".board-switcher-name")?.textContent).toBe("Équipe Paiement");
    const nav = [...(sidebar?.querySelectorAll(".sidebar-nav-item") ?? [])].map((item) => [
      item.textContent,
      item.getAttribute("aria-current"),
    ]);
    // La vue s'appelle « Sprint » ; la santé du sprint n'est plus une vue à part.
    expect(nav).toEqual([
      ["Sprint", "page"],
      ["Administration", null],
    ]);
    expect(sidebar?.querySelector(".sidebar-section-title")?.textContent).toBe(
      "Objectifs du sprint2",
    );
    expect([...document.querySelectorAll(".sidebar-lane")].map((row) => row.textContent)).toEqual([
      "Finaliser le parcours de paiement0/2",
      "Améliorer la stabilité1/1",
      "Build2",
      "RUN1",
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
    expect(sidebarLink("RUN").getAttribute("draggable")).toBe("true");
    const stability = board.laneOrder.value[1] ?? "";

    board.startLaneDrag("run");
    board.setLaneDropTarget(stability);
    await tick();
    expect(sidebarRow("RUN").classList.contains("lane-dragging")).toBe(true);
    expect(document.querySelector(".sidebar-drop-line")).not.toBeNull();
    expect(document.querySelector(".lane-drop-line")).not.toBeNull();

    await board.dropLane("run", stability);
    await tick();
    const expected = [
      "Finaliser le parcours de paiement",
      "RUN",
      "Améliorer la stabilité",
      "Build",
    ];
    expect(boardLanes()).toEqual(expected);
    expect(sidebarLanes()).toEqual(expected);
    expect(document.querySelector(".sidebar-drop-line")).toBeNull();
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("l'œil d'un objectif le masque ; celui d'un objectif masqué le réaffiche", async () => {
    const { jira } = await connectedBoard();
    // Seuls les objectifs ont un œil : Build et RUN ne se masquent pas.
    expect(sidebarRow("Build").querySelector(".eye-toggle")).toBeNull();
    expect(sidebarRow("RUN").querySelector(".eye-toggle")).toBeNull();

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
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
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

  it("santé du sprint : panneau au-dessus des swimlanes, comptages, filtres appliqués", async () => {
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
  });
});

describe("en-tête du sprint", () => {
  it("sprint actif, avancement en points, compteurs, heure de la dernière lecture", async () => {
    await withScrollSpy(async (scrolled) => {
      await connectedBoard();
      expect(document.querySelector(".sprint-name")?.textContent).toBe("Sprint 42actif");
      expect(document.querySelector(".sprint-progress strong")?.textContent).toBe("3/17 pts");
      expect(document.querySelector(".sprint-percent")?.textContent).toBe("18 %");
      expect(document.querySelector(".counter-blocked")?.textContent).toBe("1bloqué");
      expect(document.querySelector(".sync-status")?.textContent).toMatch(/^Jira · \d\d:\d\d$/);

      button("2dans Build").click();
      await expect.poll(() => scrolled).toEqual(["build"]);
    });
  });

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
    expect(document.querySelector(".filter-bar")?.lastElementChild).toBe(exitButton());

    exitButton()?.click();
    await tick();
    expect(model.presenting.value).toBe(false);
    expect(document.querySelector(".sidebar")).not.toBeNull();
    expect(document.querySelector(".sprint-header")).not.toBeNull();
    expect(document.querySelector(".presentation-hint")).toBeNull();
    expect(exitButton()).toBeNull();
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
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

describe("administration", () => {
  it("réglages d'équipe : publiés après confirmation, relus dans Jira, proposés à un collègue", async () => {
    const property = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;
    let stored: Record<string, unknown> | null = null;
    const jira = boardSiteJira()
      .on("GET", property, () =>
        stored === null ? { status: 404 } : { status: 200, json: { value: stored } },
      )
      .on("PUT", property, (request) => {
        stored = request.body as Record<string, unknown>;
        return { status: 201 };
      });
    const { board } = await connectedBoard(jira);
    button("Administration").click();
    await tick();
    button("Réglages d'équipe").click();
    await tick();
    expect(text()).toContain("Aucun réglage d'équipe n'est encore publié");

    button("Publier pour l'équipe…").click();
    await tick();
    const dialog = document.querySelector("[role=dialog]");
    expect(dialog?.textContent).toContain("Première publication");
    // Rien n'est écrit avant la confirmation.
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    dialog?.querySelector<HTMLButtonElement>("button.primary")?.click();
    await expect.poll(() => jira.sent("PUT", property).length).toBe(1);
    await expect.poll(() => text()).toContain("Réglages publiés pour l'équipe.");
    expect(text()).toContain("Ce navigateur est à jour avec l'équipe.");
    expect(document.querySelector(".report")?.textContent).toContain('"version": 1');

    // Un collègue publie une autre version ; ici, une modification locale n'est pas publiée.
    await board.moveLane("build", -1);
    stored = {
      ...(stored ?? {}),
      publishedAt: "2030-01-01T08:00:00Z",
      publishedBy: { accountId: "u9", displayName: "Alex Martin" },
    };
    button("Sprint").click();
    await board.sync();
    await tick();
    expect(text()).toContain("Alex Martin a publié de nouveaux réglages d'équipe");
    button("Garder les miens").click();
    await tick();
    expect(text()).not.toContain("a publié de nouveaux réglages");
    expect(jira.sent("PUT", property)).toHaveLength(1);
  });

  it("se déplie dans la barre latérale, sous son bouton, et se replie", async () => {
    const { model } = await connectedBoard();
    expect(document.querySelector(".sidebar-admin")).toBeNull();

    button("Administration").click();
    await tick();
    const menu = document.querySelector(".sidebar .sidebar-admin");
    expect(menu).not.toBeNull();
    expect(button("Administration").getAttribute("aria-expanded")).toBe("true");
    // Le bouton reste en tête de son panneau, ses sections juste au-dessous, sur un fond à part.
    expect(menu?.previousElementSibling).toBe(button("Administration"));
    expect(button("Administration").parentElement?.classList.contains("is-open")).toBe(true);
    expect(menu?.querySelector(".settings-site")?.textContent).toBe("acme.atlassian.net");

    // Un second clic replie et ramène au sprint.
    button("Administration").click();
    await tick();
    expect(document.querySelector(".sidebar-admin")).toBeNull();
    expect(model.view.value).toBe("board");
    expect(cardKeys()).toContain("ABC-101");

    // Choisir une autre entrée de la barre replie aussi.
    button("Administration").click();
    await tick();
    button("Sprint").click();
    await tick();
    expect(document.querySelector(".sidebar-admin")).toBeNull();
    expect(model.view.value).toBe("board");
  });

  it("regroupe les réglages du board, le diagnostic et la déconnexion", async () => {
    await connectedBoard();
    button("Administration").click();
    await tick();

    expect(button("Administration").getAttribute("aria-current")).toBe("page");
    expect([...document.querySelectorAll(".settings-tab")].map((tab) => tab.textContent)).toEqual([
      "Réglages d'équipe",
      "Board",
      "Objectifs",
      "Champs des cartes",
      "Couleurs des cartes",
      "Diagnostic",
    ]);
    expect(document.querySelector(".settings-group")?.textContent).toBe("Équipe Paiement");

    button("Diagnostic").click();
    await expect.poll(() => document.querySelectorAll(".probe").length).toBeGreaterThan(0);

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
    board.startDrag("ABC-102", "scrum");
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
