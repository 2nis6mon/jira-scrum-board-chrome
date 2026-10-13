import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  withSecondBoard,
} from "../support/boardFixture";
import { ACME, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const ISSUES = "/rest/agile/1.0/board/7/sprint/42/issue";
const SETTINGS = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function context() {
  const jira = withSecondBoard(boardSiteJira());
  const base = fakePlatform(jira);
  const pauses = new Map<
    string,
    { entered: ReturnType<typeof deferred>; gate: ReturnType<typeof deferred> }
  >();
  const releases: (() => void)[] = [];
  const platform = {
    ...base,
    fetch: async (url: string, init: RequestInit) => {
      const key = `${init.method ?? "GET"} ${new URL(url).pathname}`;
      const pause = pauses.get(key);
      if (pause) pauses.delete(key);
      // La réponse est déjà calculée : une écriture ultérieure ne peut pas la rajeunir.
      const response = await base.fetch(url, init);
      if (pause) {
        pause.entered.resolve();
        await pause.gate.promise;
      }
      return response;
    },
  };
  const board = new BoardModel(ACME, platform);
  cleanups.push(() => {
    board.dispose();
    for (const release of releases) release();
  });
  return {
    board,
    jira,
    platform,
    pauseNext(path: string) {
      const entered = deferred();
      const gate = deferred();
      pauses.set(`GET ${path}`, { entered, gate });
      releases.push(gate.resolve);
      return { entered: entered.promise, release: gate.resolve };
    },
  };
}

describe("BoardModel — concurrence entre chargement et commandes", () => {
  it.each(["succès", "session expirée"] as const)(
    "ignore une réponse tardive du board quitté (%s), y compris son erreur",
    async (outcome) => {
      const { board, jira, platform, pauseNext } = context();
      await board.load(BOARD_URL);
      await board.detect(SECOND_BOARD_URL);
      await board.switchBoard(7);
      if (outcome === "session expirée") jira.on("GET", ISSUES, { status: 401 });
      const response = pauseNext(ISSUES);
      const refreshing = board.sync();
      await response.entered;

      const switching = board.switchBoard(12);
      await vi.waitFor(() => expect(board.configuration.value?.boardId).toBe(12));
      response.release();
      await Promise.all([refreshing, switching]);

      expect(board.snapshot.value?.goalIssues.map((item) => item.issue.key)).toEqual(["XYZ-1"]);
      expect(board.syncProblem.value).toBeNull();
      expect(board.syncing.value).toBe(false);
      expect((await loadActiveBoard(platform.store, ACME.origin))?.boardId).toBe(12);
      expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    },
  );

  it("une lecture ancienne des réglages ne défait pas une modification publiée entre-temps", async () => {
    const { board, jira, pauseNext } = context();
    await board.load(BOARD_URL);
    await board.applySettings((current) => ({ ...current, agingThresholdDays: 5 }), {
      resync: false,
    });
    const response = pauseNext(SETTINGS);
    const refreshing = board.sync();
    await response.entered;

    await board.applySettings((current) => ({ ...current, agingThresholdDays: 19 }), {
      resync: false,
    });
    const published = board.team.peek();
    expect(published.kind).toBe("published");
    response.release();
    await refreshing;

    expect(board.configuration.value?.agingThresholdDays).toBe(19);
    expect(board.team.value).toEqual(published);
    expect(board.teamSaving.value).toBe(0);
    expect(board.canSwitchBoard.value).toBe(true);
    expect(jira.sent("PUT", SETTINGS)).toHaveLength(2);
    expect(jira.requests.filter(isWriteRequest)).toHaveLength(2);
  });
});
