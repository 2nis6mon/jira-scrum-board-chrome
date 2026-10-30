// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { DIAGNOSTIC_ENABLED } from "../../src/app/featureFlags";
import { AppModel } from "../../src/app/model/AppModel";
import { atlassianGoalsPlatform } from "../support/atlassianGoalsBoard";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway } from "../support/goalsGateway";
import { issueJson, statusJson } from "../support/jiraFixtures";

afterEach(() => {
  render(null, document.body);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = () => document.body.textContent ?? "";
const cardKeys = () =>
  [...document.querySelectorAll<HTMLElement>("[data-issue-key]")].map(
    (card) => card.dataset.issueKey,
  );

/** Bouton d'icône seule, désigné par son aria-label. */
function labelled(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`bouton « ${label} » introuvable`);
  return found;
}

/** Titre d'une swimlane sur le board (un clic n'affiche que son objectif). */
function laneTitle(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button.lane-title")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`titre de swimlane « ${label} » introuvable`);
  return found;
}

/** Onglet des réglages du board. */
function tab(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("[role=tab]")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`onglet « ${label} » introuvable`);
  return found;
}

/** Champ désigné par son aria-label. */
function field(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`champ « ${label} » attendu`);
  return found;
}

/** Saisie puis validation (Entrée ou sortie du champ) : le navigateur émet « change ». */
function enter(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Titres des swimlanes du board, dans l'ordre. */
const laneTitles = () =>
  [...document.querySelectorAll<HTMLElement>("section.lane")].map((lane) =>
    lane.getAttribute("aria-label"),
  );

/** Entrée du menu « ⋯ » d'une swimlane du board. */
function laneMenuButton(lane: string, label: string): HTMLButtonElement {
  const section = [...document.querySelectorAll<HTMLElement>("section.lane")].find(
    (candidate) => candidate.getAttribute("aria-label") === lane,
  );
  const found = [...(section?.querySelectorAll(".lane-menu button") ?? [])].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`« ${label} » introuvable dans ${lane}`);
  return found as HTMLButtonElement;
}

/** Entrée de la navigation de la barre latérale. */
function navButton(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>(".sidebar-nav button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`entrée « ${label} » introuvable dans la barre latérale`);
  return found;
}

/** Ouvre les réglages depuis le menu du nom du board. */
async function openSettings() {
  document.querySelector<HTMLElement>(".board-switcher-summary")?.click();
  await tick();
  const open = document.querySelector<HTMLButtonElement>(".board-switcher .menu-settings");
  if (!open) throw new Error("entrée « Réglages de ce board » attendue");
  open.click();
  await tick();
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
  if (!found) throw new Error(`bouton « ${label} » introuvable`);
  return found;
}

/** Écritures des réglages partagés du board (propriété du board), et toutes les autres. */
const TEAM_PROPERTY = "/rest/agile/1.0/board/7/properties/com.scrumboardmac.boardsettings.v1";
const teamWrites = (jira: FakeJira) => jira.sent("PUT", TEAM_PROPERTY).length;
const otherWrites = (jira: FakeJira) =>
  jira.requests.filter((r) => isWriteRequest(r) && r.path !== TEAM_PROPERTY);

async function connectedBoard(jira = boardSiteJira(), platform = fakePlatform(jira)) {
  const model = new AppModel(platform);
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  await connection.board.detect(BOARD_URL);
  await tick();
  return { model, jira, board: connection.board };
}

describe("App", () => {
  it("sans site connecté : formulaire de connexion, aucune donnée", async () => {
    const model = new AppModel(fakePlatform(new FakeJira()));
    await model.start();
    render(<App model={model} />, document.body);

    expect(document.querySelector(".app-version")?.textContent).toBe("9.9.9");
    expect(document.querySelector("h2")?.textContent).toBe("Connect to Jira");
    expect(document.querySelector<HTMLButtonElement>("button.primary")?.disabled).toBe(true);
    expect(cardKeys()).toEqual([]);
  });

  it("affiche le refus d'un hôte non Atlassian", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform);
    await model.start();
    render(<App model={model} />, document.body);

    await model.connect("jira.acme.example");
    await tick();

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("jira.acme.example");
    expect(platform.requested).toEqual([]);
  });

  it("connecté sans board : propose la recherche du board ; le menu « Site Jira » reste accessible", async () => {
    const model = new AppModel(fakePlatform(new FakeJira()));
    render(<App model={model} />, document.body);
    await model.connect("acme.atlassian.net");
    await tick();

    expect(document.querySelector("h2")?.textContent).toBe("Quel board afficher ?");
    expect(document.querySelector(".board-switcher-button")?.textContent).toBe("Choisir un board");
    // Sans board, pas de réglages de board.
    expect(document.querySelector(".menu-settings")).toBeNull();
    expect(text()).not.toContain("Réglages");

    button("Site Jira").click();
    await tick();
    expect(document.querySelector(".settings-site")?.textContent).toBe("acme.atlassian.net");
    if (DIAGNOSTIC_ENABLED) expect(button("Diagnostic").disabled).toBe(false);
    expect(button("Se déconnecter").disabled).toBe(false);
  });

  it("board : swimlanes par objectif, Build et Kanban, cartes vers la page Jira", async () => {
    await connectedBoard();

    const lanes = [...document.querySelectorAll(".lane")].map((lane) =>
      lane.getAttribute("aria-label"),
    );
    expect(lanes).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
      "Build",
      "Anomalie Prod",
    ]);
    expect(cardKeys()).toEqual(["ABC-102", "ABC-101", "ABC-103", "ABC-105", "ABC-104", "RUN-7"]);

    const card = document.querySelector<HTMLAnchorElement>('[data-issue-key="ABC-101"]');
    expect(card?.href).toBe("https://acme.atlassian.net/browse/ABC-101");
    expect(card?.target).toBe("_blank");
    expect(card?.rel).toBe("noopener noreferrer");
    expect(
      document.querySelector('[data-issue-key="ABC-102"] .badge-blocked')?.getAttribute("title"),
    ).toContain("OPS-412");
    expect(document.querySelector('[data-issue-key="ABC-104"] .card-flag')).not.toBeNull();
    expect(text()).toContain("Sprint 42");
    // Texte du sprint par défaut : les Goals Atlassian ne sont pas interrogés.
    expect(text()).not.toContain("Goals Atlassian illisibles");
  });

  it("les bugs liés n'ont plus d'indicateur ni de réglage ; les types Jira et les liens bloquants restent visibles", async () => {
    const bugType = { id: "10005", name: "Bug", subtask: false };
    const story = issueJson("ABC-106", {
      summary: "Story avec des tickets liés",
      extraFields: {
        issuelinks: [
          {
            type: { name: "Relates", inward: "relates to", outward: "relates to" },
            outwardIssue: {
              key: "ABC-107",
              fields: { issuetype: bugType, status: statusJson("3", "En cours") },
            },
          },
          {
            type: { name: "Relates", inward: "relates to", outward: "relates to" },
            outwardIssue: {
              key: "ABC-108",
              fields: { issuetype: bugType, status: statusJson("6", "Terminé", "done") },
            },
          },
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            inwardIssue: {
              key: "OPS-9",
              fields: {
                issuetype: { id: "10004", name: "Anomalie Prod", subtask: false },
                status: statusJson("3", "En cours"),
              },
            },
          },
        ],
      },
    });
    const bug = issueJson("ABC-107", { typeId: bugType.id, typeName: bugType.name });
    const { jira } = await connectedBoard(
      boardSiteJira({ sprintIssues: [...SPRINT_ISSUES, story, bug] }),
    );

    const card = document.querySelector('[data-issue-key="ABC-106"]');
    expect(card?.querySelector(".card-summary")?.textContent).toBe("Story avec des tickets liés");
    expect(card?.querySelector(".badge-blocked")?.getAttribute("title")).toContain("OPS-9");
    expect(
      [...(card?.querySelectorAll(".card-alerts [role=img]") ?? [])].map((alert) =>
        alert.getAttribute("aria-label"),
      ),
    ).toEqual(["Bloqué"]);
    expect(document.querySelector(".badge-bugs-open, .badge-bugs-done")).toBeNull();
    expect(
      document.querySelector('[data-issue-key="ABC-107"] .jira-icon[aria-label="Bug"]'),
    ).not.toBeNull();

    await openSettings();
    expect(document.querySelector('[data-type-id="10005"] .settings-chip-name')?.textContent).toBe(
      "Bug",
    );
    expect(document.querySelector('[aria-label="Déplacer Bug"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label$="compte comme bug"]')).toBeNull();
    expect(text()).not.toContain("Bug activé");
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("« Retour à Jira » : ancré dans la navigation, protégé pendant une écriture et masqué avec la barre latérale", async () => {
    const { model, board } = await connectedBoard();
    const back = () => document.querySelector<HTMLButtonElement>("button.host-return");
    expect(back()).toBeNull();

    const leave = vi.fn();
    model.hostReturn.value = leave;
    await tick();
    board.pendingKeys.value = new Set(["ABC-101"]);
    await tick();
    expect(back()?.disabled).toBe(true);
    board.pendingKeys.value = new Set();
    await tick();
    expect(back()?.textContent?.trim()).toBe("Retour à Jira");
    expect(back()?.closest(".sidebar-return")).not.toBeNull();
    back()?.click();
    expect(leave).toHaveBeenCalledOnce();

    // Replier la barre latérale masque aussi le retour, sans bandeau de remplacement.
    model.toggleSidebar();
    await tick();
    expect(back()).toBeNull();
    expect(document.querySelector(".workspace-return")).toBeNull();
    expect(document.querySelector(".workspace-main-with-return")).toBeNull();
    expect(document.querySelector(".sidebar")).toBeNull();
    labelled("Afficher la barre latérale");
    expect(leave).toHaveBeenCalledOnce();

    // Les réglages et le diagnostic suivent également la visibilité de la barre latérale.
    model.showSettings("board");
    await tick();
    expect(back()).toBeNull();
    model.view.value = "diagnostic";
    await tick();
    expect(back()).toBeNull();
    model.toggleSidebar();
    await tick();
    expect(back()?.closest(".sidebar-return")).not.toBeNull();
    back()?.click();
    expect(leave).toHaveBeenCalledTimes(2);
    model.showBoard();
    model.presenting.value = true;
    await tick();
    expect(back()).toBeNull();
    model.presenting.value = false;
    model.startDaily(15, "build");
    await tick();
    expect(back()).toBeNull();
    model.stopDaily();
    await tick();
    expect(back()?.closest(".sidebar-return")).not.toBeNull();
  });

  it("carte : parent en badge coloré sans sa clé, champs en badges, drapeau près de la priorité, sans statut", async () => {
    const extra = [
      issueJson("ABC-106", { summary: "Même parent", statusId: "4", parent: "ABC-90" }),
      issueJson("ABC-107", {
        summary: "Autre parent",
        statusId: "1",
        parent: "ABC-12",
        labels: ["web", "mobile"],
        extraFields: { components: [{ id: "1", name: "Front" }] },
      }),
    ];
    const { board } = await connectedBoard(
      boardSiteJira({ sprintIssues: [...SPRINT_ISSUES, ...extra] }),
    );
    await board.applySettings(
      (current) => ({ ...current, cardFields: [{ kind: "labels" }, { kind: "components" }] }),
      { resync: true },
    );
    await tick();

    const card = (key: string) => document.querySelector<HTMLElement>(`[data-issue-key="${key}"]`);
    const parent = (key: string) => card(key)?.querySelector<HTMLElement>(".badge-parent");
    const hue = (key: string) => parent(key)?.style.getPropertyValue("--parent-hue");
    // Le titre du parent, pas sa clé (gardée pour l'info-bulle).
    expect(parent("ABC-101")?.textContent).toBe("Epic ABC-90");
    expect(parent("ABC-101")?.getAttribute("title")).toBe("Parent ABC-90 — Epic ABC-90");
    // Même parent, même couleur ; autre parent, autre couleur.
    expect(hue("ABC-101")).toMatch(/^\d+$/);
    expect(hue("ABC-106")).toBe(hue("ABC-101"));
    expect(hue("ABC-107")).not.toBe(hue("ABC-101"));
    expect(parent("ABC-102")).toBeNull();

    // Champs choisis : un badge par valeur, le nom du champ seulement en info-bulle.
    const tags = [...(card("ABC-107")?.querySelectorAll(".badge-field") ?? [])].map((tag) => [
      tag.textContent,
      tag.getAttribute("title"),
    ]);
    expect(tags).toEqual([
      ["web", "Labels : web"],
      ["mobile", "Labels : mobile"],
      ["Front", "Composants : Front"],
    ]);
    expect(card("ABC-107")?.textContent).not.toContain("Labels");
    expect(card("ABC-107")?.textContent).not.toContain("Composants");
    // Un ticket a un composant, mais la barre de filtres ne propose plus ce filtre (0.14.2).
    expect(board.options.value?.components.length).toBeGreaterThan(0);
    const menus = [...document.querySelectorAll("details.filter-menu > summary")].map(
      (summary) => summary.textContent,
    );
    expect(menus).not.toContain("Composant");

    // Le statut n'est plus écrit, même dans une colonne qui en regroupe plusieurs.
    expect(card("ABC-104")?.textContent).not.toContain("Revue");
    // Drapeau à droite, juste avant la priorité ; titre complet en info-bulle.
    const flag = card("ABC-104")?.querySelector(".card-flag");
    expect(flag?.parentElement?.classList.contains("card-marks")).toBe(true);
    expect(flag?.parentElement?.previousElementSibling?.classList.contains("card-key")).toBe(true);
    expect(card("ABC-101")?.querySelector(".card-summary")?.getAttribute("title")).toBe(
      "Afficher le récapitulatif avant paiement",
    );
  });

  it("carte : alertes, points et assigné sur la dernière ligne ; clé sur une seule ligne", async () => {
    const old = issueJson("ABC-108", {
      summary: "Ticket ancien et bloqué",
      statusId: "3",
      points: 5,
      assigneeId: "u2",
      assigneeName: "Alex Martin",
      blockedBy: "OPS-9",
      extraFields: { created: "2026-01-05T09:00:00.000+0000" },
    });
    await connectedBoard(boardSiteJira({ sprintIssues: [...SPRINT_ISSUES, old] }));
    const card = document.querySelector<HTMLElement>('[data-issue-key="ABC-108"]');
    const bottom = card?.querySelector(".card-bottom");
    if (!card || !bottom) throw new Error("carte attendue");

    const blocked = bottom.querySelector(".badge-blocked");
    expect(blocked?.getAttribute("aria-label")).toBe("Bloqué");
    expect(blocked?.querySelector("svg.icon")).not.toBeNull();
    expect(blocked?.getAttribute("title")).toContain("OPS-9");
    expect(bottom.querySelector(".badge-aging")?.textContent).toMatch(/^\d+ j$/);
    expect(bottom.querySelector(".card-points")?.textContent).toBe("5");
    expect(bottom.querySelector(".avatar")?.getAttribute("aria-label")).toBe("Alex Martin");
    // Plus de ligne d'alertes à part : seuls parent et champs choisis restent au-dessus.
    expect(
      card.querySelectorAll(".card-badges .badge-blocked, .card-badges .badge-aging"),
    ).toHaveLength(0);
    expect(card.querySelector(".card-key")?.getAttribute("title")).toBe("ABC-108");
  });

  it("WIP : la colonne au-delà de sa limite est signalée, filtres ou non", async () => {
    const overLoaded = () => document.querySelector(".column-over .column-name")?.textContent;
    // 2 tickets Scrum et 1 Kanban « En cours » pour une limite de 2 : la colonne du board Jira
    // porte les trois, donc la limite est déjà dépassée (0.22.7).
    const { board } = await connectedBoard();
    expect(overLoaded()).toBe("En cours");
    expect(document.querySelector(".column-over .column-count")?.textContent).toBe("3 / 2");
    board.setSearch("note de version");
    await tick();
    expect(overLoaded()).toBe("En cours");
  });

  it("le filtre rapide « Bloqués » ne garde que le ticket bloqué", async () => {
    await connectedBoard();
    button("Bloqués").click();
    await tick();

    expect(cardKeys()).toEqual(["ABC-102"]);
    button("Réinitialiser").click();
    await tick();
    expect(cardKeys()).toHaveLength(6);
  });

  it("un clic sur un objectif n'affiche que lui ; un second rétablit tout", async () => {
    await connectedBoard();
    laneTitle("Améliorer la stabilité").click();
    await tick();
    expect(cardKeys()).toEqual(["ABC-103"]);

    laneTitle("Améliorer la stabilité").click();
    await tick();
    expect(cardKeys()).toHaveLength(6);
  });

  it("l'affichage n'émet que des lectures", async () => {
    const { jira } = await connectedBoard();
    labelled("Actualiser").click();
    await tick();
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("épingler un Goal : dans les réglages, une seule écriture sur « Enregistrer »", async () => {
    const pinned = "ari:cloud:townsquare:c:goal/securite";
    const property = "/rest/agile/1.0/sprint/42/properties/com.scrumboardmac.sprintgoals.v1";
    // La propriété ne change qu'avec l'écriture, comme dans Jira.
    let stored: unknown = { atlassianGoalIds: [] };
    const jira = boardSiteJira({
      graphql: goalsGateway({
        goals: [
          { id: "ari:cloud:townsquare:c:goal/paiement", name: "Paiement", workItems: ["ABC-101"] },
          { id: pinned, key: "GOAL-3", name: "Sécurité des comptes" },
          { id: "ari:cloud:townsquare:c:goal/ancien", name: "Ancien objectif", isArchived: true },
        ],
      }),
    })
      .on("GET", property, () => ({ status: 200, json: { value: stored } }))
      .on("PUT", property, (request) => {
        stored = request.body;
        return { status: 200 };
      });
    const { board } = await connectedBoard(jira, await atlassianGoalsPlatform(jira));

    button("Épingler des Goals au sprint").click();
    await expect.poll(() => document.querySelectorAll(".pin-option").length).toBe(2);
    expect(text()).not.toContain("Ancien objectif");
    const save = button("Enregistrer dans Jira");
    expect(save.disabled).toBe(true);

    const search = document.querySelector<HTMLInputElement>(".pin-search");
    if (!search) throw new Error("champ de filtre attendu");
    search.value = "securite";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.querySelectorAll(".pin-option")).toHaveLength(1);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);

    document.querySelector<HTMLInputElement>(".pin-option input")?.click();
    await tick();
    expect(board.pinEditor.value?.selection).toEqual([pinned]);
    expect(button("Enregistrer dans Jira").disabled).toBe(false);

    // Pas de fenêtre : la liste est dans l'onglet Objectifs des réglages.
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(tab("Objectifs").getAttribute("aria-selected")).toBe("true");
    // Un seul onglet : couleur, masquage et épinglage de chaque objectif.
    const section = document.querySelector("#settings-sprint-goals")?.closest("section");
    expect(section?.querySelector(".settings-color-menu")).not.toBeNull();
    expect(document.querySelector(".pin-list")).not.toBeNull();
    expect(document.querySelector("#settings-goal-colors")).toBeNull();
    button("Enregistrer dans Jira").click();
    await expect.poll(() => text()).toContain("Épinglage enregistré dans Jira.");
    expect(jira.requests.filter(isWriteRequest).map((r) => r.method)).toEqual(["PUT"]);
    // Le brouillon repart de la sélection relue dans Jira : plus rien à enregistrer.
    await expect.poll(() => button("Enregistrer dans Jira").disabled).toBe(true);
    expect(board.pinEditor.value?.base).toEqual([pinned]);
    button("Sprint").click();
    await expect.poll(() => text()).toContain("Sécurité des comptes");
    expect(document.querySelector(".goal-pinned")).toBeNull();
    expect(document.querySelector(".goal-status")).toBeNull();
    expect(document.querySelector(".goal-link")).toBeNull();
  });

  it("menu d'une swimlane : descendre et masquer partagés, replier personnel", async () => {
    const { jira } = await connectedBoard();
    const menuButton = laneMenuButton;
    expect(laneTitles()).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
      "Build",
      "Anomalie Prod",
    ]);
    expect(menuButton("Finaliser le parcours de paiement", "Monter").disabled).toBe(true);

    menuButton("Finaliser le parcours de paiement", "Descendre").click();
    await tick();
    expect(laneTitles()[0]).toBe("Améliorer la stabilité");

    document.querySelector<HTMLButtonElement>("[aria-label='Replier Build']")?.click();
    await tick();
    expect(document.querySelector("[aria-label='Déplier Build']")).not.toBeNull();
    expect(cardKeys()).not.toContain("ABC-104");

    menuButton("Améliorer la stabilité", "Masquer cet objectif du board").click();
    await tick();
    // Les objectifs masqués se retrouvent en bas de la barre latérale.
    expect(laneTitles()).not.toContain("Améliorer la stabilité");
    labelled("Réafficher « Améliorer la stabilité » sur le board").click();
    await tick();
    expect(laneTitles()).toContain("Améliorer la stabilité");
    // Descendre, masquer et réafficher sont partagés (une écriture chacun) ; replier est personnel.
    expect(otherWrites(jira)).toEqual([]);
    expect(teamWrites(jira)).toBe(3);
  });

  it("filtres rapides du board Jira : des boutons comme dans Jira, évalués par Jira", async () => {
    const jira = boardSiteJira({
      quickFilters: [{ id: 5, name: "Mes tickets", jql: "assignee = currentUser()", position: 0 }],
    }).on("GET", "/rest/agile/1.0/board/7/issue", (request) => {
      const jql = request.url.searchParams.get("jql");
      const issues =
        jql === null ? SPRINT_ISSUES : SPRINT_ISSUES.filter((issue) => issue.key === "ABC-103");
      return { status: 200, json: { issues, total: issues.length } };
    });
    await connectedBoard(jira);
    const chip = button("Mes tickets");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.title).toContain("assignee = currentUser()");

    chip.click();
    await expect.poll(() => cardKeys()).toEqual(["ABC-103"]);
    expect(button("Mes tickets").getAttribute("aria-pressed")).toBe("true");
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("réglages : ouverts depuis l'en-tête et les menus, sans entrée sous Sprint", async () => {
    const { model } = await connectedBoard();
    expect(document.querySelector(".settings-screen")).toBeNull();

    await openSettings();
    expect(document.querySelector("h1")?.textContent).toBe("Réglages du board");
    expect(document.querySelector(".settings-board")?.textContent).toContain("Équipe Paiement");
    expect(tab("Board").getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector(".sidebar-nav")?.textContent).not.toContain("Réglages");
    expect(navButton("Sprint").getAttribute("aria-current")).toBeNull();
    // Les colonnes et les labels de blocage ne se règlent plus ici (0.31.0).
    expect(document.querySelector('input[aria-label^="Nom de la colonne"]')).toBeNull();
    expect(text()).not.toContain("Labels marquant un ticket bloqué");

    // Le dernier onglet ouvert reste celui des réglages.
    tab("Champs des cartes").click();
    await tick();
    expect(document.querySelector("#settings-card-fields")).not.toBeNull();
    button("Retour au board").click();
    await tick();
    expect(document.querySelector(".settings-screen")).toBeNull();
    await openSettings();
    expect(tab("Champs des cartes").getAttribute("aria-selected")).toBe("true");

    // Depuis le menu d'une swimlane : l'onglet qui la concerne.
    model.showBoard();
    await tick();
    laneMenuButton("Anomalie Prod", "Configurer les swimlanes…").click();
    await tick();
    expect(tab("Board").getAttribute("aria-selected")).toBe("true");
    model.showBoard();
    await tick();
    laneMenuButton("Améliorer la stabilité", "Gérer les objectifs…").click();
    await tick();
    expect(tab("Objectifs").getAttribute("aria-selected")).toBe("true");

    // Onglets au clavier : flèches, Début et Fin.
    tab("Objectifs").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await tick();
    expect(tab("Champs des cartes").getAttribute("aria-selected")).toBe("true");
    tab("Champs des cartes").dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    await tick();
    expect(tab("Couleurs des cartes").getAttribute("aria-selected")).toBe("true");
    tab("Couleurs des cartes").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await tick();
    expect(tab("Board").getAttribute("aria-selected")).toBe("true");
  });

  it("réglages : la langue, personnelle, n'apparaît dans aucun onglet partagé du board", async () => {
    const { model } = await connectedBoard();
    for (const section of ["board", "goals", "cardFields", "cardColors"] as const) {
      model.showSettings(section);
      await tick();
      expect(document.querySelector("#settings-panel")).not.toBeNull();
      expect(document.querySelector('input[name="interface-language"]')).toBeNull();
      expect(text()).not.toContain("Langue de l'interface");
    }
  });

  it("réglages, onglet Board : chaque champ validé est enregistré dans Jira pour l'équipe", async () => {
    const { jira } = await connectedBoard();
    await openSettings();
    const labels = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Appliquer");
    expect(labels).not.toContain("Annuler");
    // Les objectifs ne sont pas dans la liste : leur ordre se règle sur le board.
    expect(
      [...document.querySelectorAll(".settings-lanes .settings-grip")].map((grip) =>
        grip.getAttribute("aria-label"),
      ),
    ).toEqual(["Déplacer la swimlane Build", "Déplacer la swimlane Anomalie Prod"]);

    // Nom de Build : dans la liste des swimlanes, enregistré à la validation, pas à la frappe.
    const build = document.querySelector<HTMLInputElement>("#settings-build-label");
    if (!build) throw new Error("nom de Build attendu");
    build.value = "Sprint Backlog";
    build.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(teamWrites(jira)).toBe(0);
    build.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(teamWrites(jira)).toBe(1);

    enter(field("Nom de la swimlane Anomalie Prod"), "RUN");
    await tick();
    expect(field("Nom de la swimlane RUN").value).toBe("RUN");

    // Seuil « vieillissant » : saisie refusée, Échap, puis le bouton +.
    const aging = document.querySelector<HTMLInputElement>("#settings-aging");
    if (!aging) throw new Error("seuil attendu");
    enter(aging, "abc");
    await tick();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("vieillissant");
    expect(aging.getAttribute("aria-invalid")).toBe("true");
    expect(aging.value).toBe("abc");
    aging.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect(aging.value).toBe("3");
    expect(document.querySelector("[role=alert]")).toBeNull();
    labelled("Augmenter : Seuil « vieillissant »").click();
    await tick();
    expect(aging.value).toBe("4");

    button("Retour au board").click();
    await tick();
    expect(laneTitles()).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
      "Sprint Backlog",
      "RUN",
    ]);
    // Build, swimlane, seuil : une écriture partagée chacun ; la saisie invalide, aucune.
    expect(otherWrites(jira)).toEqual([]);
    expect(teamWrites(jira)).toBe(3);
  });

  it("réunit les types dans Swimlanes et permet un aller-retour depuis Default sans changer leurs objectifs", async () => {
    const { board, jira } = await connectedBoard();
    await openSettings();
    const lanes = document.querySelector(".settings-lanes-card");
    expect(document.querySelector(".settings-types-card")).toBeNull();
    expect(
      lanes?.querySelector('[aria-label="Types Default"] [data-type-id="10001"]'),
    ).not.toBeNull();
    expect(document.querySelectorAll('[data-type-id="10001"]')).toHaveLength(1);
    expect(teamWrites(jira)).toBe(0);
    const goalBefore = board.snapshot.value?.goalIssues.find(
      (issue) => issue.issue.key === "ABC-101",
    )?.goalId;
    const choose = (destination: string) => {
      const menu = document.querySelector('[data-type-id="10001"] .settings-chip-menu');
      const target = [...(menu?.querySelectorAll("button") ?? [])].find(
        (item) => item.textContent?.trim() === destination,
      );
      if (!(target instanceof HTMLButtonElement))
        throw new Error(`Destination ${destination} absente`);
      target.click();
    };
    choose("Anomalie Prod");
    await expect.poll(() => teamWrites(jira)).toBe(1);
    await expect
      .poll(() => document.querySelector('.settings-lane-swimlane [data-type-id="10001"]'))
      .not.toBeNull();
    expect(
      document.querySelector('[aria-label="Types Default"] [data-type-id="10001"]'),
    ).toBeNull();
    expect(document.querySelectorAll('[data-type-id="10001"]')).toHaveLength(1);
    expect(
      board.snapshot.value?.goalIssues.find((issue) => issue.issue.key === "ABC-101")?.goalId,
    ).toBe(goalBefore);
    choose("Default");
    await expect.poll(() => teamWrites(jira)).toBe(2);
    await expect
      .poll(() => document.querySelector('[aria-label="Types Default"] [data-type-id="10001"]'))
      .not.toBeNull();
    expect(document.querySelectorAll('[data-type-id="10001"]')).toHaveLength(1);
    expect(
      board.snapshot.value?.goalIssues.find((issue) => issue.issue.key === "ABC-101")?.goalId,
    ).toBe(goalBefore);
    expect(board.configuration.value?.buildSectionLabel).toBe("Build");
    expect(otherWrites(jira)).toEqual([]);
  });

  it("réglages, onglet Board : sans souris, la poignée déplace une swimlane et le menu d'un type le range", async () => {
    const { jira } = await connectedBoard();
    await openSettings();

    // Build descend sous « Anomalie Prod » ; les objectifs gardent leur place.
    labelled("Déplacer la swimlane Build").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await tick();
    expect(teamWrites(jira)).toBe(1);
    // Déjà en fin de liste : rien ne change, rien n'est écrit.
    labelled("Déplacer la swimlane Build").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await tick();
    expect(teamWrites(jira)).toBe(1);

    // Le type « Anomalie Prod » va dans « Ignorés » : sa swimlane disparaît avec son dernier type.
    const chip = document.querySelector('.settings-lanes [data-type-id="10004"]');
    const current = [...(chip?.querySelectorAll(".settings-chip-menu button") ?? [])].find(
      (b) => b.textContent?.trim() === "Anomalie Prod",
    );
    expect((current as HTMLButtonElement | undefined)?.disabled).toBe(true);
    const ignore = [...(chip?.querySelectorAll(".settings-chip-menu button") ?? [])].find(
      (b) => b.textContent?.trim() === "Ignorés",
    );
    if (!(ignore instanceof HTMLButtonElement)) throw new Error("« Ignorés » attendu");
    ignore.click();
    await expect.poll(() => teamWrites(jira)).toBe(2);
    await tick();
    expect(
      document.querySelector('input[aria-label="Nom de la swimlane Anomalie Prod"]'),
    ).toBeNull();
    expect(
      [...document.querySelectorAll('[aria-label="Types ignorés"] [data-type-id]')].map((item) =>
        item.getAttribute("data-type-id"),
      ),
    ).toContain("10004");

    button("Retour au board").click();
    await expect
      .poll(() => laneTitles())
      .toEqual(["Finaliser le parcours de paiement", "Améliorer la stabilité", "Build"]);
    expect(cardKeys()).not.toContain("RUN-7");
    expect(otherWrites(jira)).toEqual([]);
  });

  it("réglages, onglet Board : une nouvelle swimlane reçoit un nom et son premier type", async () => {
    const { jira } = await connectedBoard();
    await openSettings();
    button("Nouvelle swimlane").click();
    await tick();
    const name = document.querySelector<HTMLInputElement>("#settings-new-swimlane");
    if (!name) throw new Error("nom de la nouvelle swimlane attendu");
    name.value = "Support";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    // Rien n'est créé tant qu'aucun type n'est choisi.
    expect(teamWrites(jira)).toBe(0);
    const first = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Premier type de la nouvelle swimlane"]',
    );
    if (!first) throw new Error("choix du premier type attendu");
    first.value = "10004";
    first.dispatchEvent(new Event("change", { bubbles: true }));
    await expect.poll(() => teamWrites(jira)).toBe(1);
    await tick();
    expect(document.querySelector("#settings-new-swimlane")).toBeNull();
    expect(field("Nom de la swimlane Support").value).toBe("Support");
    // Son dernier type parti, l'ancienne swimlane a disparu.
    expect(
      document.querySelector('input[aria-label="Nom de la swimlane Anomalie Prod"]'),
    ).toBeNull();
    expect(otherWrites(jira)).toEqual([]);
  });

  it("couleurs des cartes : une règle JQL ajoutée dans Réglages colore la carte que Jira désigne", async () => {
    const jira = boardSiteJira().on("GET", "/rest/agile/1.0/board/7/issue", (request) => {
      const jql = request.url.searchParams.get("jql");
      const issues =
        jql === null
          ? SPRINT_ISSUES
          : jql === "(priority = High) AND sprint in (42)"
            ? SPRINT_ISSUES.filter((issue) => issue.key === "ABC-101")
            : [];
      return { status: 200, json: { issues, total: issues.length } };
    });
    await connectedBoard(jira);
    await openSettings();
    tab("Couleurs des cartes").click();
    await tick();
    button("Nouvelle règle").click();
    await tick();

    const jql = document.querySelector<HTMLTextAreaElement>(".color-rule-jql");
    if (!jql) throw new Error("champ JQL attendu");
    jql.value = "priority = High";
    jql.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.querySelector(".color-rule")?.textContent).toContain("Non appliquée");

    expect(button("Appliquer").disabled).toBe(true);
    await expect.poll(() => button("Appliquer").disabled).toBe(false);

    button("Appliquer").click();
    await expect
      .poll(() => document.querySelector(".color-rule-ok")?.textContent)
      .toContain("1 ticket affiché satisfait");

    button("Sprint").click();
    await tick();
    const colored = [...document.querySelectorAll<HTMLElement>("[data-card-color]")].map((card) => [
      card.dataset.issueKey,
      card.dataset.cardColor,
    ]);
    // Le bleu est pris par la règle intégrée : la nouvelle règle prend la première couleur libre.
    expect(colored).toEqual([["ABC-101", "teal"]]);
    expect(otherWrites(jira)).toEqual([]);
    expect(teamWrites(jira)).toBeGreaterThan(0);
  });

  // Diagnostic masqué pour l'instant (0.22.7) : son écran reste testé, prêt à revenir.
  it.skipIf(!DIAGNOSTIC_ENABLED)(
    "le diagnostic reste accessible depuis le menu « Site Jira », même session perdue",
    async () => {
      const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 401 });
      const model = new AppModel(fakePlatform(jira));
      render(<App model={model} />, document.body);
      await model.connect("acme.atlassian.net");
      await tick();

      button("Site Jira").click();
      await tick();
      button("Diagnostic").click();
      await expect.poll(() => document.querySelectorAll(".probe").length).toBe(3);
      expect(document.querySelector(".probe-failed .probe-code")?.textContent).toBe("401");
      expect(text()).toContain("Ouvrir acme.atlassian.net");
    },
  );
});
