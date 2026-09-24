// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { issueJson } from "../support/jiraFixtures";

// Mode Daily : plein écran, une swimlane à la fois, minuteur. Données FICTIVES.

afterEach(() => {
  render(null, document.body);
  vi.restoreAllMocks();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
/** Laisse Preact poser les effets (écouteur du clavier), différés après l'affichage. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const labelled = (label: string) => {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`bouton « ${label} » introuvable`);
  return found;
};
const boardLanes = () =>
  [...document.querySelectorAll<HTMLElement>("section.lane")].map((lane) =>
    lane.getAttribute("aria-label"),
  );
const step = () => document.querySelector(".daily-step")?.textContent ?? "";
const key = (name: string, target: EventTarget = document) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

async function connectedBoard(sprintIssues?: unknown[]) {
  const jira = boardSiteJira(sprintIssues ? { sprintIssues } : {});
  const model = new AppModel(fakePlatform(jira));
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  await connection.board.detect(BOARD_URL);
  await tick();
  return { model, jira };
}

describe("mode Daily", () => {
  it("demande le plein écran et présente les swimlanes une à une, dans l'ordre du board", async () => {
    const { model, jira } = await connectedBoard();
    const all = boardLanes();
    expect(all.length).toBeGreaterThan(2);
    const fullscreen = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = fullscreen;

    labelled("Lancer la daily").click();
    await settle();
    expect(fullscreen).toHaveBeenCalledOnce();
    expect(model.daily.value).not.toBeNull();
    expect(document.querySelector(".sidebar")).toBeNull();
    expect(document.querySelector(".sprint-header")).toBeNull();
    expect(document.querySelector(".daily-clock")?.textContent).toBe("15:00");
    // Ordre de la barre : minuteur, Précédent, Suivant, swimlane présentée.
    const bar = [...(document.querySelector(".daily-bar")?.children ?? [])];
    expect(
      bar.map((element) => element.getAttribute("aria-label") ?? element.className).slice(0, 4),
    ).toEqual(["daily-clock", "Swimlane précédente", "Swimlane suivante", "daily-step"]);
    expect(boardLanes()).toEqual([all[0]]);
    expect(step()).toContain(`1/${all.length}`);
    // L'étape se choisit dans la barre : ni poignée, ni repli, ni menu sur la swimlane.
    expect(document.querySelector(".lane-grip, .lane-toggle, .lane-menu")).toBeNull();

    labelled("Swimlane suivante").click();
    await tick();
    expect(boardLanes()).toEqual([all[1]]);
    key("ArrowRight");
    await settle();
    expect(boardLanes()).toEqual([all[2]]);
    key("ArrowLeft");
    await settle();
    expect(boardLanes()).toEqual([all[1]]);
    expect(labelled("Swimlane précédente").disabled).toBe(false);

    // Présenter ne touche à rien dans Jira.
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("Espace met en pause, Échap termine et rend l'écran habituel", async () => {
    const { model } = await connectedBoard();
    const all = boardLanes();
    labelled("Lancer la daily").click();
    await settle();

    key(" ");
    await settle();
    expect(model.daily.value?.pausedAt).not.toBeNull();
    expect(document.querySelector(".daily-paused-label")?.textContent).toBe("En pause");
    key(" ");
    await settle();
    expect(model.daily.value?.pausedAt).toBeNull();

    // Dans la recherche, les flèches et Échap restent au champ.
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Rechercher"]');
    if (!search) throw new Error("recherche attendue");
    key("ArrowRight", search);
    await tick();
    expect(boardLanes()).toEqual([all[0]]);

    key("Escape");
    await settle();
    expect(model.daily.value).toBeNull();
    expect(boardLanes()).toEqual(all);
    expect(document.querySelector(".sidebar")).not.toBeNull();
    expect(document.querySelector(".daily-bar")).toBeNull();
  });

  it("le bouton Terminer arrête la daily ; l'administration aussi", async () => {
    const { model } = await connectedBoard();
    labelled("Lancer la daily").click();
    await settle();
    const stop = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Terminer",
    );
    stop?.click();
    await tick();
    expect(model.daily.value).toBeNull();

    model.startDaily(15, null);
    model.showAdmin("board");
    expect(model.daily.value).toBeNull();
  });

  it("la durée vient de l'administration du board", async () => {
    const { model } = await connectedBoard();
    const connection = model.connection.value;
    if (connection.state !== "connected") throw new Error("connexion attendue");
    await connection.board.applySettings((current) => ({ ...current, dailyMinutes: 5 }), {
      resync: false,
    });
    await tick();
    labelled("Lancer la daily").click();
    await settle();
    expect(document.querySelector(".daily-clock")?.textContent).toBe("05:00");
  });

  describe("stock du RUN", () => {
    // Six anomalies à faire, dans l'ordre de Jira, en plus de RUN-7 en cours.
    const stock = ["RUN-11", "RUN-12", "RUN-13", "RUN-14", "RUN-15", "RUN-16"];
    const withStock = [
      ...SPRINT_ISSUES,
      ...stock.map((key) =>
        issueJson(key, {
          summary: `Anomalie ${key}`,
          statusId: "1",
          statusName: "À faire",
          category: "new",
          typeId: "10004",
          typeName: "Anomalie Prod",
        }),
      ),
    ];
    const runCell = (column: string) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `ul[aria-label="RUN — ${column}"] [data-issue-key]`,
        ),
      ].map((card) => card.dataset.issueKey);
    const toggle = () => document.querySelector<HTMLButtonElement>(".stock-toggle-button");
    async function showRun() {
      for (let i = 0; i < 10 && !step().includes("RUN"); i++) {
        key("ArrowRight");
        await settle();
      }
      expect(step()).toContain("RUN");
    }

    it("hors daily, tout le stock est affiché", async () => {
      await connectedBoard(withStock);
      expect(runCell("À faire")).toEqual(stock);
      expect(toggle()).toBeNull();
    });

    it("en daily, les 3 premières dans l'ordre de Jira, puis « + 3 autres » ; déplié jusqu'à la fin", async () => {
      await connectedBoard(withStock);
      labelled("Lancer la daily").click();
      await settle();
      await showRun();
      expect(runCell("À faire")).toEqual(stock.slice(0, 3));
      // Les autres colonnes du RUN ne sont pas plafonnées.
      expect(runCell("En cours")).toEqual(["RUN-7"]);
      expect(toggle()?.textContent).toBe("+ 3 autres");

      toggle()?.click();
      await settle();
      expect(runCell("À faire")).toEqual(stock);
      expect(toggle()?.textContent).toBe("Afficher moins");

      // Revenir sur le RUN pendant la même daily : toujours déplié.
      key("ArrowLeft");
      await settle();
      key("ArrowRight");
      await settle();
      expect(runCell("À faire")).toEqual(stock);
    });
  });
});
