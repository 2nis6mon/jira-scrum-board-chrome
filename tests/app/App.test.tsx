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

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
  if (!found) throw new Error(`bouton « ${label} » introuvable`);
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

  it("connecté sans board : demande l'adresse du board", async () => {
    const model = new AppModel(fakePlatform(new FakeJira()));
    render(<App model={model} />, document.body);
    await model.connect("acme.atlassian.net");
    await tick();

    expect(document.querySelector(".app-site")?.textContent).toContain("acme.atlassian.net");
    expect(document.querySelector("h2")?.textContent).toBe("Quel board afficher ?");
  });

  it("board : swimlanes par objectif, Build et RUN, cartes vers la page Jira", async () => {
    await connectedBoard();

    const lanes = [...document.querySelectorAll(".lane")].map((lane) =>
      lane.getAttribute("aria-label"),
    );
    expect(lanes).toEqual([
      "Finaliser le parcours de paiement",
      "Améliorer la stabilité",
      "Build",
      "RUN",
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

  it("WIP : la colonne au-delà de sa limite est signalée, filtres ou non", async () => {
    const overLoaded = () => document.querySelector(".column-over .column-name")?.textContent;
    // 2 tickets Scrum « En cours » ou « Revue » pour une limite de 2 : pas de dépassement.
    await connectedBoard();
    expect(overLoaded()).toBeUndefined();
    render(null, document.body);

    // Un troisième : dépassement, que le filtre n'efface pas. Le ticket RUN n'est pas compté.
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
    button("Améliorer la stabilité").click();
    await tick();
    expect(cardKeys()).toEqual(["ABC-103"]);

    button("Améliorer la stabilité").click();
    await tick();
    expect(cardKeys()).toHaveLength(6);
  });

  it("l'affichage n'émet que des lectures", async () => {
    const { jira } = await connectedBoard();
    button("Actualiser").click();
    await tick();
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("épingler un Goal : fenêtre de choix, une seule écriture sur « Enregistrer »", async () => {
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

    button("Enregistrer dans Jira").click();
    await expect.poll(() => document.querySelector("[role=dialog]")).toBeNull();
    expect(jira.requests.filter(isWriteRequest).map((r) => r.method)).toEqual(["PUT"]);
    await expect.poll(() => text()).toContain("Sécurité des comptes");
    expect(document.querySelector(".goal-pinned")?.textContent).toBe("épinglé");
  });

  it("menu d'une swimlane : descendre, replier, masquer, sans rien écrire dans Jira", async () => {
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
      "RUN",
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
    expect(text()).toContain("Un objectif est masqué du board");
    button("Réafficher « Améliorer la stabilité »").click();
    await tick();
    expect(laneTitles()).toContain("Améliorer la stabilité");
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
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

  it("le diagnostic reste accessible depuis l'en-tête", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 401 });
    const model = new AppModel(fakePlatform(jira));
    render(<App model={model} />, document.body);
    await model.connect("acme.atlassian.net");
    await tick();

    button("Diagnostic").click();
    await expect.poll(() => document.querySelectorAll(".probe").length).toBe(3);
    expect(document.querySelector(".probe-failed .probe-code")?.textContent).toBe("401");
    expect(text()).toContain("Ouvrir acme.atlassian.net");
  });
});
