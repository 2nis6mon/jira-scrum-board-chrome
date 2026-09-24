// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway } from "../support/goalsGateway";
import { issueJson } from "../support/jiraFixtures";

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

describe("App", () => {
  it("sans site connecté : formulaire de connexion, aucune donnée", async () => {
    const model = new AppModel(fakePlatform(new FakeJira()));
    await model.start();
    render(<App model={model} />, document.body);

    expect(document.querySelector(".app-version")?.textContent).toBe("9.9.9");
    expect(document.querySelector("h2")?.textContent).toBe("Connexion à Jira");
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

  it("connecté sans board : propose la recherche du board ; l'administration reste accessible", async () => {
    const model = new AppModel(fakePlatform(new FakeJira()));
    render(<App model={model} />, document.body);
    await model.connect("acme.atlassian.net");
    await tick();

    expect(document.querySelector("h2")?.textContent).toBe("Quel board afficher ?");
    expect(document.querySelector(".board-switcher-button")?.textContent).toBe("Choisir un board");

    button("Administration").click();
    await tick();
    expect(document.querySelector(".settings-site")?.textContent).toBe("acme.atlassian.net");
    expect(button("Couleurs des cartes").disabled).toBe(true);
    expect(button("Diagnostic").disabled).toBe(false);
    expect(text()).toContain("Aucun board n'est encore choisi");
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
      "Kanban",
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
    expect(text()).toContain("Goals Atlassian illisibles");
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
    // 2 tickets Scrum « En cours » ou « Revue » pour une limite de 2 : pas de dépassement.
    await connectedBoard();
    expect(overLoaded()).toBeUndefined();
    render(null, document.body);

    // Un troisième : dépassement, que le filtre n'efface pas. Le ticket Kanban n'est pas compté.
    const extra = issueJson("ABC-106", { summary: "Troisième en cours", statusId: "3" });
    const { board } = await connectedBoard(
      boardSiteJira({ sprintIssues: [...SPRINT_ISSUES, extra] }),
    );
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

  it("épingler un Goal : dans l'administration, une seule écriture sur « Enregistrer »", async () => {
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
    const { board } = await connectedBoard(jira);

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

    // Pas de fenêtre : la liste est dans la section Goals de l'administration.
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.querySelector("#settings-pin")).not.toBeNull();
    button("Enregistrer dans Jira").click();
    await expect.poll(() => text()).toContain("Enregistré dans Jira.");
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
    const laneTitles = () =>
      [...document.querySelectorAll<HTMLElement>("section.lane")].map((lane) =>
        lane.getAttribute("aria-label"),
      );
    const menuButton = (lane: string, label: string) => {
      const section = [...document.querySelectorAll<HTMLElement>("section.lane")].find(
        (candidate) => candidate.getAttribute("aria-label") === lane,
      );
      const found = [...(section?.querySelectorAll(".lane-menu button") ?? [])].find(
        (b) => b.textContent?.trim() === label,
      );
      if (!found) throw new Error(`« ${label} » introuvable dans ${lane}`);
      return found as HTMLButtonElement;
    };
    expect(laneTitles()).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
      "Build",
      "Kanban",
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

  it("Administration, section Board : chaque champ validé est enregistré dans Jira pour l'équipe", async () => {
    const { jira } = await connectedBoard();
    button("Administration").click();
    await tick();
    expect(document.querySelector(".settings")).not.toBeNull();
    const labels = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Appliquer");
    expect(labels).not.toContain("Annuler");

    const field = (label: string) => {
      const found = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
      if (!found) throw new Error(`champ « ${label} » attendu`);
      return found;
    };
    // Saisie puis validation (Entrée ou sortie du champ) : le navigateur émet « change ».
    const type = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const validate = (input: HTMLInputElement) =>
      input.dispatchEvent(new Event("change", { bubbles: true }));

    const name = field("Nom de la colonne À faire (Scrum)");
    type(name, "À prendre");
    await tick();
    // Rien n'est enregistré pendant la frappe.
    expect(field("Nom de la colonne À faire (Scrum)")).toBe(name);
    validate(name);
    await tick();
    const wip = field("Limite WIP de À prendre (Scrum)");

    type(wip, "abc");
    validate(wip);
    await tick();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("limite WIP");
    expect(wip.getAttribute("aria-invalid")).toBe("true");
    expect(wip.value).toBe("abc");

    // Échap revient à la valeur enregistrée.
    wip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect(wip.value).toBe("");
    expect(document.querySelector("[role=alert]")).toBeNull();

    type(wip, "1");
    validate(wip);
    await tick();
    expect(document.querySelector("[role=alert]")).toBeNull();

    button("Sprint").click();
    await tick();
    const heads = [...document.querySelectorAll(".column-band .column-name")].map(
      (head) => head.textContent,
    );
    expect(heads[0]).toBe("À prendre");
    expect(document.querySelector(".column-over .column-count")?.textContent).toBe("2 / 1");
    // Nom de colonne et limite WIP : une écriture partagée chacun ; la saisie invalide, aucune.
    expect(otherWrites(jira)).toEqual([]);
    expect(teamWrites(jira)).toBe(2);
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
    button("Administration").click();
    await tick();
    button("Couleurs des cartes").click();
    await tick();
    button("Ajouter une règle").click();
    await tick();

    const jql = document.querySelector<HTMLTextAreaElement>(".color-rule-jql");
    if (!jql) throw new Error("champ JQL attendu");
    jql.value = "priority = High";
    jql.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.querySelector(".color-rule")?.textContent).toContain("Non appliquée");

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

  it("le diagnostic reste accessible depuis l'administration, même session perdue", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 401 });
    const model = new AppModel(fakePlatform(jira));
    render(<App model={model} />, document.body);
    await model.connect("acme.atlassian.net");
    await tick();

    button("Administration").click();
    await tick();
    button("Diagnostic").click();
    await expect.poll(() => document.querySelectorAll(".probe").length).toBe(3);
    expect(document.querySelector(".probe-failed .probe-code")?.textContent).toBe("401");
    expect(text()).toContain("Ouvrir acme.atlassian.net");
  });
});
