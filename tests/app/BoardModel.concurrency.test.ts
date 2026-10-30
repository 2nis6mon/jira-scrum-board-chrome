import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { goalBlock } from "../../src/core/boardBlocks";
import { executeMove } from "../../src/core/boardMove";
import { saveTeamSettings } from "../../src/core/teamSettings";
import { JiraTransport } from "../../src/jira/transport";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  withSecondBoard,
} from "../support/boardFixture";
import { ACME, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { statusJson } from "../support/jiraFixtures";
import { planningFixture } from "../support/planningFixture";

// Espions transparents : `core` ne doit recevoir que le décorateur de la porte du board.
vi.mock("../../src/core/boardMove", async (original) => {
  const actual = await original<typeof import("../../src/core/boardMove")>();
  return { ...actual, executeMove: vi.fn(actual.executeMove) };
});
vi.mock("../../src/core/teamSettings", async (original) => {
  const actual = await original<typeof import("../../src/core/teamSettings")>();
  return { ...actual, saveTeamSettings: vi.fn(actual.saveTeamSettings) };
});

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
    pauseNext(path: string, method = "GET") {
      const entered = deferred();
      const gate = deferred();
      pauses.set(`${method} ${path}`, { entered, gate });
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

const TRANSITION = "/rest/api/3/issue/ABC-102/transitions";
const DOING = "col-1-En cours";

function withTransition(jira: ReturnType<typeof boardSiteJira>) {
  return jira
    .on("GET", "/rest/api/3/issue/ABC-102", {
      status: 200,
      json: { fields: { status: statusJson("1", "À faire") } },
    })
    .on("GET", TRANSITION, {
      status: 200,
      json: {
        transitions: [
          { id: "21", name: "Démarrer", to: statusJson("3", "En cours"), isAvailable: true },
        ],
      },
    })
    .on("POST", TRANSITION, { status: 204 });
}

describe("BoardModel — porte d'écriture unique (AD-6)", () => {
  it("un réglage demandé pendant un dépôt n'est publié qu'après les écritures du dépôt", async () => {
    const { board, jira, pauseNext } = context();
    await board.load(BOARD_URL);
    withTransition(jira);
    const transition = pauseNext(TRANSITION, "POST");
    const dropping = board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    await transition.entered;

    const saving = board.applySettings((current) => ({ ...current, agingThresholdDays: 9 }), {
      resync: false,
    });
    await vi.waitFor(() => expect(board.teamSaving.value).toBe(1));
    expect(jira.sent("PUT", SETTINGS)).toHaveLength(0);
    expect(board.canSwitchBoard.value).toBe(false);

    transition.release();
    await Promise.all([dropping, saving]);
    const writes = jira.requests.filter(isWriteRequest).map((request) => request.method);
    expect(writes).toEqual(["POST", "PUT"]);
    expect(board.teamSaving.value).toBe(0);
    expect(board.canSwitchBoard.value).toBe(true);
  });

  it("ne remet jamais le transport brut à core, seulement le décorateur de la porte", async () => {
    vi.mocked(executeMove).mockClear();
    vi.mocked(saveTeamSettings).mockClear();
    const { board, jira } = context();
    await board.load(BOARD_URL);
    withTransition(jira);
    await board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    await board.applySettings((current) => ({ ...current, agingThresholdDays: 9 }), {
      resync: false,
    });

    expect(executeMove).toHaveBeenCalledOnce();
    const ports = vi.mocked(executeMove).mock.calls[0]?.[0];
    expect(ports?.writer).not.toBeInstanceOf(JiraTransport);
    expect(ports?.goals).not.toBeInstanceOf(JiraTransport);
    expect(saveTeamSettings).toHaveBeenCalledOnce();
    expect(vi.mocked(saveTeamSettings).mock.calls[0]?.[1]).not.toBeInstanceOf(JiraTransport);
    expect(jira.sent("POST", TRANSITION)).toHaveLength(1);
    expect(jira.sent("PUT", SETTINGS)).toHaveLength(1);
  });

  it("un réglage en attente pendant un changement de board n'écrit rien", async () => {
    const { board, jira, pauseNext } = context();
    await board.load(BOARD_URL);
    withTransition(jira);
    const transition = pauseNext(TRANSITION, "POST");
    const dropping = board.dropIssue({
      issueKey: "ABC-102",
      block: goalBlock("g-paiement"),
      columnId: DOING,
      beforeKey: null,
    });
    await transition.entered;
    const saving = board.applySettings((current) => ({ ...current, agingThresholdDays: 9 }), {
      resync: false,
    });
    await vi.waitFor(() => expect(board.teamSaving.value).toBe(1));
    board.dispose();
    transition.release();
    await Promise.all([dropping, saving]);
    expect(jira.sent("PUT", SETTINGS)).toHaveLength(0);
  });

  it("la publication du planning ne s'attend pas elle-même et se journalise par le board", async () => {
    const { jira } = planningFixture();
    const base = fakePlatform(jira);
    const held = deferred();
    const entered = deferred();
    const platform = {
      ...base,
      fetch: async (url: string, init: RequestInit) => {
        const response = await base.fetch(url, init);
        if (init.method === "POST" && new URL(url).pathname === "/rest/agile/1.0/sprint/43") {
          entered.resolve();
          await held.promise;
        }
        return response;
      },
    };
    const board = new BoardModel(ACME, platform);
    cleanups.push(() => {
      board.dispose();
      held.resolve();
    });
    await board.load(BOARD_URL);
    await board.planning.load();
    board.planning.addGoal("Attendre son tour");
    expect(board.planning.canPublish.value).toBe(true);

    const publishing = board.planning.publish();
    await entered.promise;
    expect(board.planning.publishing.value).toBe(true);
    expect(board.planning.validation.value).not.toBe(
      "Attendez la fin de l'opération en cours sur le board.",
    );
    held.resolve();
    await publishing;

    expect(board.planning.notice.value).toContain("publié et vérifié");
    const entries = await board.audit.list(ACME.origin);
    expect(entries.find((entry) => entry.action === "sprint planning")).toMatchObject({
      to: "43",
      outcome: "réussi",
      site: ACME.origin,
    });
  });
});
