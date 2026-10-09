import { describe, expect, it, vi } from "vitest";
import { BoardModel, type HostBoardAnswer } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { normalizeSiteUrl } from "../../src/jira/site";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  withSecondBoard,
} from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Données FICTIVES : le board 7 de la fixture, plus un second board (12, projet XYZ).

const SITE = normalizeSiteUrl("acme.atlassian.net");

async function twoBoards() {
  const jira = withSecondBoard(boardSiteJira());
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform);
  await board.load();
  await board.detect(BOARD_URL);
  await board.detect(SECOND_BOARD_URL);
  return {
    board,
    platform,
    jira,
    active: async () => (await loadActiveBoard(platform.store, SITE.origin))?.boardId,
  };
}

const keys = (board: BoardModel) =>
  [...(board.snapshot.value?.goalIssues ?? [])].map((issue) => issue.issue.key).sort();

describe("BoardModel — plusieurs boards", () => {
  it("les boards ajoutés sont listés par nom ; le dernier ajouté est affiché", async () => {
    const { board, active } = await twoBoards();
    expect(board.boards.value.map((item) => [item.boardId, item.boardName])).toEqual([
      [12, "Équipe Compte"],
      [7, "Équipe Paiement"],
    ]);
    expect(board.configuration.value?.boardId).toBe(12);
    expect(await active()).toBe(12);
    expect(keys(board)).toEqual(["XYZ-1"]);
  });

  it("changer de board relit l'autre dans Jira, avec ses propres réglages, sans rien écrire", async () => {
    const { board, jira, active } = await twoBoards();
    await board.switchBoard(7);
    expect(board.configuration.value?.boardId).toBe(7);
    expect(await active()).toBe(7);
    expect(keys(board)).toContain("ABC-101");

    // Un réglage du board 7 reste au board 7.
    await board.setAllLanesCollapsed(true);
    const collapsed = board.configuration.value?.collapsedBlockIds;
    expect(collapsed?.length).toBeGreaterThan(0);

    await board.switchBoard(12);
    expect(board.configuration.value?.collapsedBlockIds).toEqual([]);
    expect(keys(board)).toEqual(["XYZ-1"]);
    await board.switchBoard(7);
    expect(board.configuration.value?.collapsedBlockIds).toEqual(collapsed);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("les filtres et l'état du board quitté ne suivent pas", async () => {
    const { board } = await twoBoards();
    await board.switchBoard(7);
    board.setSearch("paiement");
    board.toggleQuickFilter("blocked");
    await board.switchBoard(12);
    expect(board.filters.value.searchText).toBe("");
    expect(board.filters.value.quickFilters.size).toBe(0);
  });

  it("pas de changement de board pendant une écriture dans Jira", async () => {
    const { board, active } = await twoBoards();
    board.pendingKeys.value = new Set(["XYZ-1"]);
    expect(board.canSwitchBoard.value).toBe(false);
    await board.switchBoard(7);
    await board.removeBoard(12);
    expect(board.configuration.value?.boardId).toBe(12);
    expect(board.boards.value).toHaveLength(2);
    expect(await active()).toBe(12);
  });

  it("retirer le board affiché montre le suivant ; retirer le dernier redemande une adresse", async () => {
    const { board, jira, active } = await twoBoards();
    await board.removeBoard(12);
    expect(board.boards.value.map((item) => item.boardId)).toEqual([7]);
    expect(board.configuration.value?.boardId).toBe(7);
    expect(await active()).toBe(7);
    expect(keys(board)).toContain("ABC-101");

    await board.removeBoard(7);
    expect(board.boards.value).toEqual([]);
    expect(board.configuration.value).toBeNull();
    expect(board.snapshot.value).toBeNull();
    expect(board.editingBoard.value).toBe(true);
    expect(await active()).toBeUndefined();
    // Retirer un board n'efface rien dans Jira.
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("retirer un board qui n'est pas affiché ne change pas l'affichage", async () => {
    const { board } = await twoBoards();
    await board.removeBoard(7);
    expect(board.configuration.value?.boardId).toBe(12);
    expect(board.boards.value.map((item) => item.boardId)).toEqual([12]);
  });

  it("à la réouverture, le dernier board affiché revient", async () => {
    const { board, platform } = await twoBoards();
    await board.switchBoard(7);
    const reopened = new BoardModel(SITE, platform);
    await reopened.load();
    expect(reopened.configuration.value?.boardId).toBe(7);
    expect(reopened.boards.value).toHaveLength(2);
  });
});

describe("BoardModel — changement de board dans une page Jira hôte", () => {
  async function hosted(answer: HostBoardAnswer) {
    const context = await twoBoards();
    const navigator = vi.fn((): HostBoardAnswer => answer);
    context.board.hostBoardNavigator = navigator;
    return { ...context, navigator };
  }

  it("un autre board enregistré s'ouvre par la page Jira : rien n'est affiché ni relu ici", async () => {
    const { board, jira, navigator, active } = await hosted("leaving");
    const before = jira.requests.length;
    await board.switchBoard(7);
    expect(navigator).toHaveBeenCalledOnce();
    expect(navigator.mock.calls[0]).toMatchObject([{ boardId: 7, projectKeys: ["ABC"] }]);
    // Le board affiché reste celui de la page tant qu'elle n'a pas changé.
    expect(board.configuration.value?.boardId).toBe(12);
    expect(keys(board)).toEqual(["XYZ-1"]);
    expect(jira.requests).toHaveLength(before);
    // La nouvelle page retrouvera ce board comme board actif.
    expect(await active()).toBe(7);
  });

  it("un board ajouté par la recherche est enregistré puis ouvert par la page Jira", async () => {
    const { board, navigator, active } = await hosted("leaving");
    await board.removeBoard(7);
    navigator.mockClear();
    await board.detect(BOARD_URL);
    expect(navigator.mock.calls[0]).toMatchObject([{ boardId: 7 }]);
    expect(board.configuration.value?.boardId).toBe(12);
    expect(await active()).toBe(7);
    expect(board.setupBusy.value).toBe(false);
  });

  it("retirer le board affiché ouvre le suivant par la page Jira", async () => {
    const { board, navigator, active } = await hosted("leaving");
    await board.removeBoard(12);
    expect(navigator.mock.calls[0]).toMatchObject([{ boardId: 7 }]);
    expect(await active()).toBe(7);
  });

  it("le board de la page s'affiche sur place", async () => {
    const { board, navigator } = await hosted("current");
    await board.switchBoard(7);
    expect(navigator).toHaveBeenCalledOnce();
    expect(board.configuration.value?.boardId).toBe(7);
    expect(board.writeNotice.value).toBeNull();
    expect(keys(board)).toContain("ABC-101");
  });

  it("sans adresse constructible, le board s'affiche sur place et le dit", async () => {
    const { board } = await hosted("unreachable");
    await board.switchBoard(7);
    expect(board.configuration.value?.boardId).toBe(7);
    expect(board.writeNotice.value).toMatchObject({ tone: "warning" });
    expect(board.writeNotice.value?.text).toContain("la page Jira derrière reste");
  });

  it("pas de changement de page pendant une écriture dans Jira", async () => {
    const { board, navigator } = await hosted("leaving");
    board.pendingKeys.value = new Set(["XYZ-1"]);
    await board.switchBoard(7);
    expect(navigator).not.toHaveBeenCalled();
  });
});
