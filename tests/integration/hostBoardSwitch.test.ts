// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { installEmbeddedLinks } from "../../src/integration/embedded";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  withSecondBoard,
} from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";

// Données FICTIVES : la vue encadrée dans la page Jira du board 7, plus un second board (12, XYZ).
const SITE = "https://acme.atlassian.net";
const postMessage = vi.fn();
let originalParent: PropertyDescriptor | undefined;

beforeEach(() => {
  postMessage.mockClear();
  originalParent = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", { configurable: true, value: { postMessage } });
});

afterEach(() => {
  if (originalParent) Object.defineProperty(window, "parent", originalParent);
});

async function hosted() {
  const platform = fakePlatform(withSecondBoard(boardSiteJira()));
  platform.granted.add(`${SITE}/*`);
  const model = new AppModel(platform, BOARD_URL);
  installEmbeddedLinks(model, SITE, BOARD_URL);
  await model.start(BOARD_URL);
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  return Object.assign(connection.board, { app: model });
}

describe("changement de board demandé à la page Jira hôte", () => {
  it("seule la fermeture reçue de l'hôte libère une transition native et relit le board", async () => {
    const board = await hosted();
    const sync = vi.spyOn(board, "sync").mockResolvedValue();
    board.nativeTransitionPending.value = true;
    board.writeNotice.value = {
      tone: "warning",
      text: "Complétez la transition dans Jira.",
      suggestion: null,
      sessionLost: false,
      issueKey: "ABC-102",
    };
    expect(board.canSwitchBoard.value).toBe(false);

    for (const event of [
      { origin: "https://autre.atlassian.net", source: window.parent },
      { origin: SITE, source: window },
    ]) {
      window.dispatchEvent(
        new MessageEvent("message", {
          ...event,
          data: { type: "sprint-goals:refresh" },
        }),
      );
    }
    expect(board.nativeTransitionPending.value).toBe(true);
    expect(sync).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: SITE,
        source: window.parent,
        data: { type: "sprint-goals:refresh" },
      }),
    );
    expect(board.nativeTransitionPending.value).toBe(false);
    expect(board.writeNotice.value).toBeNull();
    expect(board.canSwitchBoard.value).toBe(true);
    expect(sync).toHaveBeenCalledTimes(1);
    board.dispose();
  });

  it("le board de la page s'affiche sans rien demander à l'hôte", async () => {
    const board = await hosted();
    expect(board.configuration.value?.boardId).toBe(7);
    expect(postMessage).not.toHaveBeenCalled();
    board.dispose();
  });

  it("un autre board part vers l'hôte par son identifiant et sa clé de projet, jamais une adresse", async () => {
    const board = await hosted();
    await board.detect(SECOND_BOARD_URL);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "sprint-goals:open-board", boardId: 12, projectKey: "XYZ" },
      SITE,
    );
    expect(board.configuration.value?.boardId).toBe(7);
    board.dispose();
  });

  it("« Retour à Jira » demande à l'hôte de fermer la vue, sans adresse, et quitte la présentation", async () => {
    const board = await hosted();
    board.app.presenting.value = true;
    await board.app.hostReturn.value?.();
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: "sprint-goals:close" }, SITE);
    expect(board.app.presenting.value).toBe(false);
    board.dispose();
  });

  it("le retour attend la sauvegarde du brouillon et refuse de quitter pendant une publication", async () => {
    const board = await hosted();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(board.planning, "flushDraft").mockImplementation(() => gate);
    const leaving = board.app.hostReturn.value?.();
    expect(postMessage).not.toHaveBeenCalled();
    release();
    await leaving;
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: "sprint-goals:close" }, SITE);
    postMessage.mockClear();
    board.planning.publishing.value = true;
    await board.app.hostReturn.value?.();
    expect(postMessage).not.toHaveBeenCalled();
    board.dispose();
  });

  it("revenir au board de la page ne demande rien à l'hôte", async () => {
    const board = await hosted();
    await board.detect(SECOND_BOARD_URL);
    postMessage.mockClear();
    await board.switchBoard(7);
    expect(postMessage).not.toHaveBeenCalled();
    board.dispose();
  });
});
