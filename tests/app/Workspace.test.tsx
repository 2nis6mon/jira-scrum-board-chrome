// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

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
  it("board affiché, vues, swimlanes dans l'ordre du board, Administration en pied", async () => {
    await connectedBoard();
    const sidebar = document.querySelector(".sidebar");

    expect(sidebar?.querySelector(".board-switcher-name")?.textContent).toBe("Équipe Paiement");
    const nav = [...(sidebar?.querySelectorAll(".sidebar-nav-item") ?? [])].map((item) => [
      item.textContent,
      item.getAttribute("aria-current"),
    ]);
    expect(nav).toEqual([
      ["Board", "page"],
      ["Sprint Health", null],
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

  it("le menu du board mène au changement de board", async () => {
    await connectedBoard();
    expect(button("Relire colonnes et types depuis Jira")).toBeDefined();
    button("Changer de board…").click();
    await tick();
    expect(document.querySelector(".connection h2")?.textContent).toBe("Quel board afficher ?");
  });

  it("Sprint Health : comptages du sprint, filtres appliqués, tickets à surveiller vers Jira", async () => {
    const { jira, board } = await connectedBoard();
    button("Sprint Health").click();
    await tick();
    expect(button("Sprint Health").getAttribute("aria-current")).toBe("page");
    expect(cardKeys()).toEqual([]);

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

describe("barre de filtres", () => {
  it("chaque filtre a son icône, dans l'ordre de la maquette", async () => {
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
      ["Priorité", true],
      ["Objectif", true],
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
  it("regroupe les réglages du board, le diagnostic et la déconnexion", async () => {
    await connectedBoard();
    button("Administration").click();
    await tick();

    expect(button("Administration").getAttribute("aria-current")).toBe("page");
    expect([...document.querySelectorAll(".settings-tab")].map((tab) => tab.textContent)).toEqual([
      "Board",
      "Objectifs",
      "Champs des cartes",
      "Couleurs des cartes",
      "Diagnostic",
    ]);
    expect(document.querySelector(".settings-group")?.textContent).toBe("Équipe Paiement");

    button("Diagnostic").click();
    await expect.poll(() => document.querySelectorAll(".probe").length).toBeGreaterThan(0);

    button("Se déconnecter").click();
    await expect.poll(() => document.querySelector("h2")?.textContent).toBe("Connexion à Jira");
    expect(document.querySelector(".sidebar")).toBeNull();
  });
});
