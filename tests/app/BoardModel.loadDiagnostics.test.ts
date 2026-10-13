import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { LOAD_HISTORY_KEY, LoadDiagnostics } from "../../src/app/model/LoadDiagnostics";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { ACME } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const ISSUES = "/rest/agile/1.0/board/7/sprint/42/issue";
const STRUCTURE = "/rest/agile/1.0/board/7/configuration";
const FILTERS = "/rest/agile/1.0/board/7/quickfilter";
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

function context(jira = boardSiteJira()) {
  const base = fakePlatform(jira);
  const pauses = new Map<
    string,
    { entered: ReturnType<typeof deferred>; gate: ReturnType<typeof deferred> }
  >();
  const releases: (() => void)[] = [];
  let clock = 0;
  const platform = {
    ...base,
    fetch: async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      const pause = pauses.get(path);
      if (pause) pauses.delete(path);
      const response = await base.fetch(url, init);
      if (pause) {
        pause.entered.resolve();
        await pause.gate.promise;
      }
      return response;
    },
  };
  const diagnostics = new LoadDiagnostics(platform, () => clock);
  const board = new BoardModel(ACME, platform, { loadDiagnostics: diagnostics });
  cleanups.push(() => {
    board.dispose();
    for (const release of releases) release();
  });
  return {
    board,
    diagnostics,
    jira,
    platform,
    advance: (duration: number) => {
      clock += duration;
    },
    pauseNext(path: string) {
      const entered = deferred();
      const gate = deferred();
      pauses.set(path, { entered, gate });
      releases.push(gate.resolve);
      return { entered: entered.promise, release: gate.resolve };
    },
  };
}

describe("BoardModel — diagnostic du chargement", () => {
  it("garde l'ouverture en cours après les données, jusqu'à la fin des filtres et couleurs", async () => {
    const { board, diagnostics, pauseNext, advance } = context();
    const filters = pauseNext(FILTERS);
    const loading = board.load(BOARD_URL);
    await filters.entered;

    const pending = diagnostics.current.value;
    expect(pending).toMatchObject({
      kind: "opening",
      status: "loading",
      boardType: "scrum",
      issues: 6,
      goals: 2,
    });
    expect(pending?.dataReadyMs).not.toBeNull();
    expect(pending?.visibleMs).toBeNull();
    expect(board.loaded.value).toBe(false);
    expect(board.snapshot.value?.goalIssues).toHaveLength(5);
    expect(
      pending?.spans.find((span) => span.label === "filters" && span.kind === "phase")?.status,
    ).toBe("running");

    advance(125);
    filters.release();
    await loading;
    const completed = diagnostics.current.value;
    expect(completed).toMatchObject({ id: pending?.id, status: "ok", durationMs: 125 });
    expect(board.loaded.value).toBe(true);
    expect(
      completed?.spans.filter((span) => span.kind === "phase").map((span) => span.label),
    ).toEqual([
      "structure",
      "statuses",
      "fields",
      "types",
      "settings",
      "user",
      "sprints",
      "issues",
      "goalSettings",
      "goals",
      "assemble",
      "filters",
      "colors",
    ]);
    expect(completed?.spans.every((span) => span.status !== "running")).toBe(true);
    expect(diagnostics.history.value).toHaveLength(1);
  });

  it("distingue une actualisation de l'ouverture et conserve le premier rapport", async () => {
    const { board, diagnostics, advance } = context();
    await board.load(BOARD_URL);
    const first = diagnostics.current.value;
    advance(25);
    await board.sync();

    const refresh = diagnostics.current.value;
    expect(refresh?.id).not.toBe(first?.id);
    expect(refresh).toMatchObject({ kind: "refresh", status: "ok", issues: 6, goals: 2 });
    expect(refresh?.spans.some((span) => span.label === "structure")).toBe(false);
    expect(diagnostics.history.value.map((run) => run.id)).toEqual([refresh?.id, first?.id]);
  });

  it("enregistre la phase et le code d'erreur, sans donnée du board ou message Jira brut", async () => {
    const jira = boardSiteJira({
      myself: {
        status: 401,
        json: { errorMessages: ["Erreur privée pour Camille, secret-session-123"] },
      },
    });
    const { board, diagnostics } = context(jira);
    await board.load(BOARD_URL);

    expect(diagnostics.current.value?.status).toBe("error");
    expect(diagnostics.current.value?.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "phase",
          label: "user",
          status: "error",
          error: "unauthorized",
        }),
        expect.objectContaining({
          kind: "request",
          status: "error",
          httpStatus: 401,
          error: "unauthorized",
        }),
      ]),
    );
    const report = diagnostics.report();
    expect(report).toContain("unauthorized");
    expect(report).toContain("HTTP 401");
    for (const privateValue of [
      "secret-session-123",
      "Camille",
      "Équipe Paiement",
      "ABC-101",
      ACME.host,
      "customfield_10016",
    ]) {
      expect(report).not.toContain(privateValue);
    }
    expect(board.syncProblem.value?.sessionLost).toBe(true);
  });

  it("annule une lecture de réglages et sa relance en attente sans recréer l'historique effacé", async () => {
    const { board, diagnostics, jira, platform, pauseNext } = context();
    await board.load(BOARD_URL);
    const issuesBefore = jira.sent("GET", ISSUES).length;
    const snapshotBefore = board.snapshot.value;
    const settings = pauseNext(SETTINGS);
    const first = board.sync();
    await settings.entered;
    const queued = board.sync();
    board.dispose();
    await diagnostics.clear();

    settings.release();
    await Promise.all([first, queued]);
    await board.sync();
    expect(jira.sent("GET", ISSUES)).toHaveLength(issuesBefore);
    expect(board.snapshot.value).toBe(snapshotBefore);
    expect(diagnostics.current.value).toBeNull();
    expect(diagnostics.history.value).toEqual([]);
    expect(platform.stored.has(LOAD_HISTORY_KEY)).toBe(false);
  });

  it("garde le diagnostic ouvert si la structure termine après la synchronisation déjà lancée", async () => {
    const { board, diagnostics, jira, pauseNext, advance } = context();
    await board.load(BOARD_URL);
    const previousHistory = diagnostics.history.value.length;
    const structure = pauseNext(STRUCTURE);
    const syncing = board.sync();
    const refreshingStructure = board.refreshStructure();
    await structure.entered;
    const runId = diagnostics.current.value?.id;
    await syncing;

    expect(board.setupBusy.value).toBe(true);
    expect(diagnostics.current.value).toMatchObject({ id: runId, status: "loading" });
    expect(diagnostics.history.value).toHaveLength(previousHistory);
    expect(
      diagnostics.current.value?.spans.find((span) => span.label === "structure")?.status,
    ).toBe("running");

    advance(210);
    structure.release();
    await refreshingStructure;
    expect(diagnostics.current.value).toMatchObject({ id: runId, status: "ok", durationMs: 210 });
    expect(
      diagnostics.current.value?.spans.find((span) => span.label === "structure")?.durationMs,
    ).toBe(210);
    expect(diagnostics.history.value).toHaveLength(previousHistory + 1);
    expect(jira.sent("GET", ISSUES)).toHaveLength(3);
  });

  it("réutilise le diagnostic quand la structure termine avant la synchronisation en cours", async () => {
    const { board, diagnostics, jira, pauseNext } = context();
    await board.load(BOARD_URL);
    const issues = pauseNext(ISSUES);
    const syncing = board.sync();
    await issues.entered;
    const runId = diagnostics.current.value?.id;
    const refreshingStructure = board.refreshStructure();
    await vi.waitFor(() => expect(board.setupBusy.value).toBe(false));

    expect(jira.sent("GET", STRUCTURE)).toHaveLength(2);
    expect(jira.sent("GET", ISSUES)).toHaveLength(2);
    expect(diagnostics.current.value).toMatchObject({ id: runId, status: "loading" });
    expect(
      diagnostics.current.value?.spans.find((span) => span.label === "structure")?.status,
    ).toBe("ok");

    issues.release();
    await Promise.all([syncing, refreshingStructure]);
    expect(jira.sent("GET", ISSUES)).toHaveLength(3);
    expect(diagnostics.current.value).toMatchObject({ id: runId, status: "ok" });
    expect(diagnostics.history.value).toHaveLength(2);
    expect(
      diagnostics.current.value?.spans.filter(
        (span) => span.kind === "phase" && span.label === "issues",
      ),
    ).toHaveLength(2);
    expect(board.snapshot.value?.goalIssues.length).toBe(SPRINT_ISSUES.length - 1);
  });
});
