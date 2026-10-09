// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { installEmbeddedLinks } from "../../src/experiment/embedded";
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
  return connection.board;
}

describe("changement de board demandé à la page Jira hôte", () => {
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

  it("revenir au board de la page ne demande rien à l'hôte", async () => {
    const board = await hosted();
    await board.detect(SECOND_BOARD_URL);
    postMessage.mockClear();
    await board.switchBoard(7);
    expect(postMessage).not.toHaveBeenCalled();
    board.dispose();
  });
});
