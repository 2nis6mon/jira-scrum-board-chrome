import { describe, expect, it, vi } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { AuditLog } from "../../src/app/model/auditLog";
import { BoardModel } from "../../src/app/model/BoardModel";
import { DiagnosticModel } from "../../src/app/model/DiagnosticModel";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Interrupteurs coupés de force : les points d'entrée des modèles ne lisent ni n'écrivent rien,
// même appelés sans passer par la vue (AD-5).
vi.mock("../../src/app/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/app/featureFlags")>()),
  SPRINT_HEALTH_ENABLED: false,
  DIAGNOSTIC_ENABLED: false,
}));

const SITE = normalizeSiteUrl("acme.atlassian.net");

describe("santé du sprint désactivée", () => {
  it("ne calcule rien, même sur un sprint actif", async () => {
    const board = new BoardModel(SITE, fakePlatform(boardSiteJira()));
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.sprint).toBeTruthy();
    expect(board.health.value).toBeNull();
    board.dispose();
  });

  it("le geste ne change ni n'enregistre rien ; l'état retenu reste relu et conservé", async () => {
    const platform = fakePlatform(new FakeJira());
    platform.stored.set("interface.v1", { sidebarWidth: 320, healthOpen: true });
    const model = new AppModel(platform);
    await model.start();
    expect(model.healthOpen.value).toBe(true);
    const set = vi.spyOn(platform.store, "set");
    await model.toggleHealth();
    expect(model.healthOpen.value).toBe(true);
    expect(set).not.toHaveBeenCalled();
    await model.resizeSidebar(300, 1600, true);
    expect(platform.stored.get("interface.v1")).toEqual({ sidebarWidth: 300, healthOpen: true });
  });
});

describe("diagnostic désactivé", () => {
  it("aucun point d'entrée du modèle ne lit ni n'écrit", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    const audit = new AuditLog(platform.store);
    const get = vi.spyOn(platform.store, "get");
    const diagnostic = new DiagnosticModel(SITE, platform, audit);

    await diagnostic.runReads();
    await diagnostic.findSprint(BOARD_URL);
    diagnostic.sprint.value = { id: 42, name: "Sprint de test" };
    await diagnostic.runWriteTest();
    await diagnostic.loadJournal();
    await diagnostic.copyReport();

    expect(jira.requests).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(platform.copied).toEqual([]);
    expect(diagnostic.read.value).toBeNull();
    expect(diagnostic.write.value).toBeNull();
  });

  it("l'effacement du journal reste permis", async () => {
    const platform = fakePlatform(new FakeJira());
    const audit = new AuditLog(platform.store);
    await audit.append({
      at: "2026-10-30T10:00:00.000Z",
      site: SITE.origin,
      action: "transition",
      issueKey: "ABC-1",
      from: null,
      to: "Terminé",
      outcome: "échec",
      detail: null,
    });
    expect(await audit.list(SITE.origin)).toHaveLength(1);
    const diagnostic = new DiagnosticModel(SITE, platform, audit);
    await diagnostic.clearJournal();
    expect(await audit.list(SITE.origin)).toEqual([]);
    expect(diagnostic.journal.value).toEqual([]);
  });

  it("la vue diagnostic ne s'ouvre pas, même appelée directement", async () => {
    const jira = boardSiteJira();
    const model = new AppModel(fakePlatform(jira));
    await model.connect("acme.atlassian.net");
    const connection = model.connection.value;
    if (connection.state !== "connected") throw new Error("connexion attendue");
    const before = jira.requests.length;
    model.showDiagnostic();
    expect(model.view.value).toBe("board");
    expect(connection.diagnostic.read.value).toBeNull();
    expect(jira.requests).toHaveLength(before);
    connection.board.dispose();
  });
});
