// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  withSecondBoard,
} from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";

// Données FICTIVES. Les explications du board flottent au-dessus de lui ; leur croix les ferme
// pour de bon sur ce board, rechargement compris. Les erreurs, elles, restent dans le flux.

afterEach(() => {
  render(null, document.body);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const READ_ONLY = "Votre compte ne peut pas lire la propriété du sprint";

const floating = () => document.querySelector(".floating-notices");
const floatingText = () => floating()?.textContent ?? "";

/** Ouvre la page sur `platform` (même stockage = même navigateur), board affiché. */
async function openBoard(platform: ReturnType<typeof fakePlatform>, url = BOARD_URL) {
  const model = new AppModel(platform);
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  const board = connection.board;
  await board.detect(url);
  await tick();
  return { model, board };
}

/** Rend visible l'explication « propriété du sprint illisible par votre compte ». */
async function showReadOnly(board: Awaited<ReturnType<typeof openBoard>>["board"]) {
  const snapshot = board.snapshot.value;
  if (!snapshot) throw new Error("board attendu");
  board.snapshot.value = { ...snapshot, goalsReadOnly: true };
  await tick();
}

describe("explications flottantes du board", () => {
  it("flottent au-dessus du board, hors du flux des bandeaux", async () => {
    const { board } = await openBoard(fakePlatform(withSecondBoard(boardSiteJira())));
    await showReadOnly(board);

    expect(floatingText()).toContain(READ_ONLY);
    // Elles ne sont plus dans le flux, où elles décalaient les swimlanes.
    const inFlow = [...document.querySelectorAll(".notice")].filter(
      (notice) => !notice.closest(".floating-notices") && notice.textContent?.includes(READ_ONLY),
    );
    expect(inFlow).toEqual([]);
  });

  it("une fois fermées, ne reviennent plus, même après rechargement", async () => {
    const platform = fakePlatform(withSecondBoard(boardSiteJira()));
    const first = await openBoard(platform);
    await showReadOnly(first.board);

    const close = floating()?.querySelector<HTMLButtonElement>(".floating-notice-close");
    if (!close) throw new Error("croix attendue");
    close.click();
    await tick();
    expect(floatingText()).not.toContain(READ_ONLY);
    first.board.dispose();
    render(null, document.body);

    // Rechargement : même navigateur (même stockage), nouvelle page.
    const again = await openBoard(platform);
    await showReadOnly(again.board);
    expect(floatingText()).not.toContain(READ_ONLY);
    again.board.dispose();
  });

  it("restent affichées sur un autre board du même site", async () => {
    const platform = fakePlatform(withSecondBoard(boardSiteJira()));
    const first = await openBoard(platform);
    await showReadOnly(first.board);
    floating()?.querySelector<HTMLButtonElement>(".floating-notice-close")?.click();
    await tick();
    first.board.dispose();
    render(null, document.body);

    const other = await openBoard(platform, SECOND_BOARD_URL);
    await showReadOnly(other.board);
    expect(floatingText()).toContain(READ_ONLY);
    other.board.dispose();
  });

  it("une erreur de synchronisation reste dans le flux, sans fermeture définitive", async () => {
    const { board } = await openBoard(fakePlatform(withSecondBoard(boardSiteJira())));
    board.syncProblem.value = {
      text: "Jira n'a pas répondu.",
      suggestion: null,
      sessionLost: false,
    };
    await tick();
    const error = document.querySelector(".notice-error");
    expect(error?.textContent).toContain("Jira n'a pas répondu.");
    expect(error?.closest(".floating-notices")).toBeNull();
    expect(error?.querySelector(".floating-notice-close")).toBeNull();
    board.dispose();
  });
});
