import { describe, expect, it, vi } from "vitest";
import {
  LOAD_HISTORY_KEY,
  LoadDiagnostics,
  MAX_LOAD_SPANS,
} from "../../src/app/model/LoadDiagnostics";
import type { Platform } from "../../src/app/platform/types";
import { JiraError } from "../../src/jira/errors";
import { JiraTransport } from "../../src/jira/transport";
import { ACME, FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

function setup() {
  let now = 100;
  const platform = fakePlatform(new FakeJira());
  const diagnostics = new LoadDiagnostics(platform, () => now);
  return {
    diagnostics,
    platform,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("diagnostic local du chargement", () => {
  it("garde les départs parallèles, les jalons et la durée réelle sans additionner les appels", async () => {
    const { diagnostics, advance } = setup();
    const id = diagnostics.begin("opening", 15);
    const a = deferred();
    const b = deferred();
    const phaseA = diagnostics.measure("issues", () => a.promise);
    advance(10);
    const phaseB = diagnostics.measure("goals", () => b.promise);
    advance(40);
    a.resolve();
    await phaseA;
    advance(20);
    b.resolve();
    await phaseB;
    diagnostics.markDataReady();
    advance(5);
    diagnostics.finish();
    advance(16);
    diagnostics.markVisible(id);
    expect(diagnostics.current.value).toMatchObject({
      initialMs: 15,
      durationMs: 90,
      dataReadyMs: 85,
      visibleMs: 106,
      status: "ok",
      spans: [
        { label: "startup", startMs: 0, durationMs: 15 },
        { label: "issues", startMs: 15, durationMs: 50 },
        { label: "goals", startMs: 25, durationMs: 60 },
      ],
    });
    expect(diagnostics.history.value[0]?.visibleMs).toBe(106);
  });

  it("conserve le résultat et l'erreur d'origine, et exporte seulement une catégorie fermée", async () => {
    const { diagnostics, advance, platform } = setup();
    diagnostics.begin("refresh");
    const failure = new JiraError({
      kind: "forbidden",
      detail: "SECRET client AB-12",
      bodyExcerpt: "secret@acme.example",
      responseHints: "https://acme.atlassian.net",
    });
    expect(
      diagnostics.measureSync("assemble", () => {
        advance(5);
        return 42;
      }),
    ).toBe(42);
    await expect(
      diagnostics.measure("issues", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(() =>
      diagnostics.measureSync("colors", () => {
        throw new Error("SECRET");
      }),
    ).toThrow("SECRET");
    diagnostics.setContext({ boardType: "kanban", issues: 35, goals: 4 });
    diagnostics.finish("error");
    await diagnostics.copyReport();
    const report = platform.copied[0] ?? "";
    expect(report).toContain("Version : 9.9.9");
    expect(report).toContain("tickets : 35 ; objectifs : 4");
    expect(report).toContain("erreur forbidden");
    expect(report).toContain("erreur other");
    expect(report).not.toMatch(/SECRET|AB-12|acme|secret@/);
    await diagnostics.loadHistory();
    expect(JSON.stringify(platform.stored.get(LOAD_HISTORY_KEY))).not.toMatch(
      /SECRET|AB-12|acme|secret@/,
    );
  });

  it("exporte les phases en cours sans attendre un chargement bloqué", async () => {
    const { diagnostics, advance } = setup();
    diagnostics.begin("opening");
    const pending = deferred();
    const phase = diagnostics.measure("goals", () => pending.promise);
    advance(5000);
    expect(diagnostics.report()).toContain("Temps écoulé : 5000 ms");
    expect(diagnostics.report()).toContain("Objectifs et rattachements | en cours");
    diagnostics.finish("cancelled");
    pending.resolve();
    await phase;
    expect(diagnostics.current.value?.spans[0]?.status).toBe("cancelled");
  });

  it("isole les anciennes phases, réponses et reprises d'un nouveau chargement", async () => {
    const { diagnostics, advance } = setup();
    const oldId = diagnostics.begin("opening");
    const pending = deferred();
    const phase = diagnostics.measure("goals", () => pending.promise);
    const observer = diagnostics.observeTransport("get");
    const attempt = observer?.attempt(1);
    advance(12);
    const newId = diagnostics.begin("refresh");
    expect(newId).not.toBe(oldId);
    attempt?.finish({ status: 200, error: null });
    observer?.wait(600)?.finish();
    observer?.attempt(2)?.finish({ status: 200, error: null });
    pending.resolve();
    await phase;
    diagnostics.markVisible(oldId);
    expect(diagnostics.current.value?.spans).toEqual([]);
    expect(diagnostics.current.value?.visibleMs).toBeNull();
    expect(diagnostics.history.value[0]?.status).toBe("cancelled");
  });

  it("borne la collecte et conserve seulement les cinq derniers chargements", async () => {
    const { diagnostics, platform } = setup();
    for (let index = 0; index < 7; index += 1) {
      diagnostics.begin(index === 0 ? "opening" : "refresh");
      diagnostics.measureSync("assemble", () => index);
      diagnostics.finish();
    }
    const last = diagnostics.begin("refresh");
    for (let index = 0; index < MAX_LOAD_SPANS + 4; index += 1)
      diagnostics.measureSync("fields", () => index);
    diagnostics.finish();
    expect(diagnostics.current.value?.spans).toHaveLength(MAX_LOAD_SPANS);
    expect(diagnostics.current.value?.truncated).toBe(4);
    expect(diagnostics.history.value).toHaveLength(5);
    const restored = new LoadDiagnostics(platform);
    // Attend les écritures séquentielles avant de simuler une réouverture.
    await diagnostics.loadHistory();
    await restored.loadHistory();
    expect(restored.history.value).toHaveLength(5);
    expect(restored.history.value[0]?.id).toBe(last);
    expect(restored.history.value[0]?.spans).toHaveLength(MAX_LOAD_SPANS);
  });

  it("reconstruit l'historique sans champs supplémentaires et refuse les labels injectés", async () => {
    const { diagnostics, platform } = setup();
    diagnostics.begin("refresh");
    diagnostics.measureSync("fields", () => 1);
    diagnostics.finish();
    const good = diagnostics.current.value;
    if (!good) throw new Error("mesure attendue");
    await diagnostics.loadHistory();
    platform.stored.set(LOAD_HISTORY_KEY, [
      { ...good, site: "SECRET", spans: good.spans.map((span) => ({ ...span, raw: "SECRET" })) },
      { ...good, id: "123-8", version: "SECRET" },
      { ...good, id: "123-9", spans: [{ ...good.spans[0], label: "SECRET" }] },
    ]);
    const restored = new LoadDiagnostics(platform);
    await restored.loadHistory();
    expect(restored.history.value).toHaveLength(1);
    expect(JSON.stringify(restored.history.value)).not.toContain("SECRET");
    expect(restored.report(restored.history.value[0])).not.toContain("SECRET");
  });

  it("ignore un stockage indisponible sans modifier le résultat des mesures", async () => {
    const { platform } = setup();
    const broken: Platform = {
      ...platform,
      store: {
        get: async () => {
          throw new Error("quota lecture");
        },
        set: async () => {
          throw new Error("quota écriture");
        },
        remove: async () => {
          throw new Error("suppression refusée");
        },
      },
    };
    const diagnostics = new LoadDiagnostics(broken);
    await expect(diagnostics.loadHistory()).resolves.toBeUndefined();
    diagnostics.begin("opening");
    await expect(diagnostics.measure("issues", async () => 7)).resolves.toBe(7);
    diagnostics.finish();
    await expect(diagnostics.clear()).resolves.toBeUndefined();
    expect(diagnostics.current.value).toBeNull();
    expect(diagnostics.history.value).toEqual([]);
  });

  it("ne prétend pas avoir effacé l'historique lorsque Chrome refuse la suppression", async () => {
    const { diagnostics, platform } = setup();
    diagnostics.begin("opening");
    diagnostics.finish();
    const original = diagnostics.history.value;
    const remove = vi.spyOn(platform.store, "remove").mockRejectedValueOnce(new Error("quota"));
    await expect(diagnostics.clearHistory()).rejects.toThrow("quota");
    expect(diagnostics.history.value).toEqual(original);
    expect(diagnostics.current.value).toEqual(original[0]);
    expect(platform.stored.has(LOAD_HISTORY_KEY)).toBe(true);
    await expect(diagnostics.clearHistory()).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(diagnostics.history.value).toEqual([]);
    expect(diagnostics.current.value).toEqual(original[0]);
    expect(platform.stored.has(LOAD_HISTORY_KEY)).toBe(false);
  });

  it("garde le même temps mesuré quand l'horloge système est corrigée", () => {
    const { diagnostics, advance } = setup();
    const wallClock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    try {
      diagnostics.begin("opening", 12);
      const initial = diagnostics.current.value;
      if (!initial) throw new Error("mesure attendue");
      wallClock.mockReturnValue(3_700_000);
      advance(25);
      expect(diagnostics.elapsedMs()).toBe(37);
      expect(diagnostics.report()).toContain("Temps écoulé : 37 ms");
      wallClock.mockReturnValue(1);
      advance(5);
      diagnostics.finish();
      expect(diagnostics.elapsedMs(initial)).toBe(42);
      const finished = diagnostics.current.value;
      if (!finished) throw new Error("mesure attendue");
      diagnostics.begin("refresh");
      advance(400);
      expect(diagnostics.elapsedMs(finished)).toBe(42);
    } finally {
      wallClock.mockRestore();
    }
  });

  it("ne ressuscite pas un historique effacé pendant sa lecture", async () => {
    const { diagnostics, platform } = setup();
    diagnostics.begin("opening");
    diagnostics.finish();
    const saved = diagnostics.history.value;
    const read = deferred();
    const store = {
      ...platform.store,
      get: vi.fn(async () => {
        await read.promise;
        return saved;
      }),
    };
    const restored = new LoadDiagnostics({ ...platform, store });
    const loading = restored.loadHistory();
    await Promise.resolve();
    const clearing = restored.clearHistory();
    read.resolve();
    await Promise.all([loading, clearing]);
    expect(restored.history.value).toEqual([]);
    expect(platform.stored.has(LOAD_HISTORY_KEY)).toBe(false);
  });

  it("chronomètre une reprise HTTP et son attente sans stocker l'URL, le JQL ou le corps", async () => {
    const { diagnostics, advance } = setup();
    const jira = new FakeJira().on(
      "GET",
      "/rest/api/3/search/jql",
      { status: 429, headers: { "Retry-After": "2" }, json: { errorMessages: ["SECRET"] } },
      { status: 200, json: { issues: [{ key: "PRIVATE-1", summary: "SECRET" }] } },
    );
    const transport = new JiraTransport({
      site: ACME,
      fetch: async (url, init) => {
        advance(30);
        return jira.fetch(url, init);
      },
      sleep: async (ms) => {
        advance(ms);
      },
      observeRead: diagnostics.observeTransport,
    });
    diagnostics.begin("refresh");
    await transport.get("/rest/api/3/search/jql", { resource: "SECRET", query: { jql: "SECRET" } });
    diagnostics.finish();
    expect(diagnostics.current.value).toMatchObject({
      durationMs: 2060,
      spans: [
        {
          kind: "request",
          startMs: 0,
          durationMs: 30,
          attempt: 1,
          httpStatus: 429,
          error: "rateLimited",
        },
        { kind: "wait", startMs: 30, durationMs: 2000, delayMs: 2000 },
        {
          kind: "request",
          startMs: 2030,
          durationMs: 30,
          attempt: 2,
          httpStatus: 200,
          error: null,
        },
      ],
    });
    expect(diagnostics.report()).not.toMatch(/SECRET|PRIVATE-1|acme|\/rest\/api/);
    expect(diagnostics.report()).toContain("nouvelles tentatives : 1 ; attentes : 1");
  });
});
