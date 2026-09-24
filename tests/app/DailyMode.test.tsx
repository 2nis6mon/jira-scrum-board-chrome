// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

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

async function connectedBoard() {
  const jira = boardSiteJira();
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
});
