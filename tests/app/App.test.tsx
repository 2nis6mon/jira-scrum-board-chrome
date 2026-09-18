// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
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
