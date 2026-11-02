// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { installEmbeddedLinks } from "../../src/integration/embedded";
import type { JiraSprint } from "../../src/jira/models";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  withSecondBoard,
} from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";

// Interrupteur Sprint Planning pilotable par test (actif par défaut, comme dans les builds locaux).
const flags = vi.hoisted(() => ({ planning: true }));
vi.mock("../../src/app/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/app/featureFlags")>()),
  get SPRINT_PLANNING_ENABLED() {
    return flags.planning;
  },
}));

// Données FICTIVES : la vue encadrée dans la page Jira du board 7, plus un second board (12, XYZ).
const SITE = "https://acme.atlassian.net";
const postMessage = vi.fn();
const cleanups: (() => void)[] = [];
let originalParent: PropertyDescriptor | undefined;

beforeEach(() => {
  postMessage.mockClear();
  originalParent = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", { configurable: true, value: { postMessage } });
});

afterEach(() => {
  flags.planning = true;
  for (const cleanup of cleanups.splice(0)) cleanup();
  if (originalParent) Object.defineProperty(window, "parent", originalParent);
});

async function hosted() {
  const platform = fakePlatform(withSecondBoard(boardSiteJira()));
  platform.granted.add(`${SITE}/*`);
  const model = new AppModel(platform, BOARD_URL, "fr");
  await model.prepareLanguage();
  cleanups.push(installEmbeddedLinks(model, SITE, BOARD_URL));
  await model.start(BOARD_URL);
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(
    { type: "sprint-goals:language", language: "fr" },
    SITE,
  );
  postMessage.mockClear();
  return Object.assign(connection.board, { app: model });
}

describe("changement de board demandé à la page Jira hôte", () => {
  it("transmet le choix de langue uniquement à l'hôte sans relire le board", async () => {
    const board = await hosted();
    const sync = vi.spyOn(board, "sync");
    await board.app.setLanguagePreference("en");
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "sprint-goals:language", language: "en" },
      SITE,
    );
    expect(sync).not.toHaveBeenCalled();
    board.dispose();
  });

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

  it("le retour refuse de quitter pendant un geste en cours, puis le permet", async () => {
    const board = await hosted();
    board.pendingKeys.value = new Set(["ABC-101"]);
    await board.app.hostReturn.value?.();
    expect(postMessage).not.toHaveBeenCalled();
    board.pendingKeys.value = new Set();
    await board.app.hostReturn.value?.();
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: "sprint-goals:close" }, SITE);
    board.dispose();
  });

  it("la fenêtre native de sprint part vers l'hôte par l'action et le nom, puis la fermeture relit le planning", async () => {
    const board = await hosted();
    const sprint = (name: string) => ({ id: 31, name, state: "future" }) as unknown as JiraSprint;
    board.app.presenting.value = true;
    expect(board.nativeSprintDialogHandler?.("start", sprint("Sprint 13"))).toBe(true);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "sprint-goals:sprint-dialog", action: "start", sprintName: "Sprint 13" },
      SITE,
    );
    expect(board.app.presenting.value).toBe(false);
    postMessage.mockClear();
    // Un nom trop long part tronqué : l'hôte refuserait le message entier.
    board.nativeSprintDialogHandler?.("complete", sprint("x".repeat(250)));
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "sprint-goals:sprint-dialog", action: "complete", sprintName: "x".repeat(199) },
      SITE,
    );

    vi.spyOn(board, "sync").mockResolvedValue();
    const after = vi.spyOn(board.planning, "afterNativeDialog").mockResolvedValue();
    board.planning.pendingClosure.value = {
      closedSprintId: 30,
      closedSprintName: "Sprint 30",
      targetSprintId: 31,
      targetSprintName: "Sprint 31",
    };
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: SITE,
        source: window.parent,
        data: { type: "sprint-goals:refresh" },
      }),
    );
    expect(after).toHaveBeenCalledTimes(1);
    board.dispose();
  });

  it("sans page hôte, aucune fenêtre native de sprint n'est demandée", async () => {
    const board = await hosted();
    for (const cleanup of cleanups.splice(0)) cleanup();
    expect(board.nativeSprintDialogHandler).toBeNull();
    board.dispose();
  });

  it("Sprint Planning coupé (paquet) : aucune fenêtre native de sprint ne peut être demandée", async () => {
    flags.planning = false;
    const board = await hosted();
    expect(board.nativeSprintDialogHandler).toBeNull();
    expect(board.nativeIssueHandler).not.toBeNull();
    board.dispose();
  });

  it("vue planning sans clôture en attente : la fermeture d'une fenêtre native relit le planning", async () => {
    const board = await hosted();
    vi.spyOn(board, "sync").mockResolvedValue();
    const after = vi.spyOn(board.planning, "afterNativeDialog").mockResolvedValue();
    board.app.view.value = "planning";
    expect(board.planning.pendingClosure.value).toBeNull();
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: SITE,
        source: window.parent,
        data: { type: "sprint-goals:refresh" },
      }),
    );
    expect(after).toHaveBeenCalledTimes(1);
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
