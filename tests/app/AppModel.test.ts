import { describe, expect, it } from "vitest";
import { AppModel, clampSidebarWidth, SIDEBAR_WIDTH } from "../../src/app/model/AppModel";
import { saveBoard } from "../../src/app/model/boardStore";
import { FakeJira } from "../support/fakeJira";
import { activeOriginOperation, fakePlatform } from "../support/fakePlatform";
import { makeConfiguration } from "../support/jiraFixtures";

const PATTERN = "https://acme.atlassian.net/*";

function readsOnlyJira(): FakeJira {
  return new FakeJira()
    .on("GET", "/rest/api/3/myself", { status: 200, json: { displayName: "Personne Test" } })
    .on("POST", "/rest/api/3/jql/parse", { status: 200, json: {} })
    .on("POST", "/gateway/api/graphql", {
      status: 200,
      json: { data: { tenantContexts: [{ cloudId: "cloud-test" }] } },
    });
}

describe("AppModel — connexion", () => {
  it("démarre déconnecté, sans rien demander ni émettre", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    const model = new AppModel(platform);
    await model.start();

    expect(model.connection.value).toEqual({ state: "disconnected", lastInput: "" });
    expect(platform.requested).toEqual([]);
    expect(jira.requests).toEqual([]);
  });

  it("refuse un hôte hors *.atlassian.net AVANT toute demande d'accès et toute requête", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    const model = new AppModel(platform);
    await model.connect("acme.atlassian.net.evil.example");

    expect(model.connectionError.value?.text).toContain("n'est pas un site Jira Cloud");
    expect(platform.requested).toEqual([]);
    expect(jira.requests).toEqual([]);
    expect(platform.stored.size).toBe(0);
  });

  it("ne demande l'accès qu'au site saisi, puis propose de choisir un board", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    const model = new AppModel(platform);
    await model.connect("https://ACME.atlassian.net/jira/software/c/projects/ABC/boards/7");

    expect(platform.requested).toEqual([PATTERN]);
    expect(platform.stored.get("connection.v1")).toEqual({ origin: "https://acme.atlassian.net" });
    const connection = model.connection.value;
    expect(connection.state).toBe("connected");
    if (connection.state !== "connected") return;
    expect(connection.site.host).toBe("acme.atlassian.net");
    expect(connection.board.loaded.value).toBe(true);
    expect(connection.board.configuration.value).toBeNull();
    // Aucun board enregistré : rien n'est encore demandé à Jira.
    expect(jira.requests).toEqual([]);
  });

  it("pose la règle Origin du site à la connexion, et la retire à la déconnexion", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform);
    await model.connect("acme.atlassian.net");
    expect(activeOriginOperation(platform)).toBe("set");
    expect(platform.appliedRules.at(-1)?.condition.urlFilter).toBe(
      "|https://acme.atlassian.net/gateway/api/graphql|",
    );

    await model.disconnect();
    expect(platform.appliedRules.at(-1)).toBeNull();
  });

  it("repose la règle à la réouverture (les règles de session ne survivent pas au navigateur)", async () => {
    const platform = fakePlatform(new FakeJira());
    platform.stored.set("connection.v1", { origin: "https://acme.atlassian.net" });
    platform.granted.add(PATTERN);
    await new AppModel(platform).start();
    expect(activeOriginOperation(platform)).toBe("set");
  });

  it("accès refusé dans Chrome : reste déconnecté, n'enregistre rien, n'émet rien", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    platform.userAccepts = false;
    const model = new AppModel(platform);
    await model.connect("acme.atlassian.net");

    expect(model.connection.value.state).toBe("loading");
    expect(model.connectionError.value?.text).toContain("n'a pas accordé l'accès");
    expect(platform.stored.size).toBe(0);
    expect(platform.appliedRules).toEqual([]);
    expect(jira.requests).toEqual([]);
  });

  it("reprend le site enregistré si l'accès est toujours accordé", async () => {
    const platform = fakePlatform(new FakeJira());
    platform.stored.set("connection.v1", { origin: "https://acme.atlassian.net" });
    platform.granted.add(PATTERN);
    const model = new AppModel(platform);
    await model.start();

    expect(model.connection.value.state).toBe("connected");
    expect(platform.requested).toEqual([]);
  });

  it("accès retiré depuis Chrome : revient à la connexion, sans requête", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    platform.stored.set("connection.v1", { origin: "https://acme.atlassian.net" });
    const model = new AppModel(platform);
    await model.start();

    expect(model.connection.value).toEqual({
      state: "disconnected",
      lastInput: "acme.atlassian.net",
    });
    expect(jira.requests).toEqual([]);
  });

  it("ignore un site enregistré qui ne serait pas *.atlassian.net", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    platform.stored.set("connection.v1", { origin: "https://evil.example" });
    platform.granted.add("https://evil.example/*");
    const model = new AppModel(platform);
    await model.start();

    expect(model.connection.value.state).toBe("disconnected");
    expect(jira.requests).toEqual([]);
  });

  it("se déconnecter rend l'accès à Chrome et oublie le site, boards compris", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform);
    await model.connect("acme.atlassian.net");
    await saveBoard(platform.store, makeConfiguration({ boardId: 7 }));
    expect(platform.stored.has("boards.v1")).toBe(true);

    await model.disconnect();

    expect(platform.granted.size).toBe(0);
    expect(platform.stored.size).toBe(0);
    expect(model.connection.value).toEqual({
      state: "disconnected",
      lastInput: "acme.atlassian.net",
    });
  });
});

describe("AppModel — vues", () => {
  it("le diagnostic lance ses lectures à la première ouverture seulement", async () => {
    const jira = readsOnlyJira();
    const model = new AppModel(fakePlatform(jira));
    await model.connect("acme.atlassian.net");
    const connection = model.connection.value;
    if (connection.state !== "connected") throw new Error("connexion attendue");

    model.showDiagnostic();
    await expect.poll(() => connection.diagnostic.read.value).not.toBeNull();
    expect(model.view.value).toBe("admin");
    expect(model.adminSection.value).toBe("diagnostic");
    const requestsAfterFirstOpen = jira.requests.length;

    model.showBoard();
    model.showDiagnostic();
    expect(jira.requests).toHaveLength(requestsAfterFirstOpen);
    expect(jira.requests.every((r) => r.method === "GET" || r.method === "POST")).toBe(true);
  });
});

describe("AppModel — mode présentation", () => {
  it("sur la vue du sprint ; l'administration et la déconnexion en sortent ; jamais gardé", async () => {
    const platform = fakePlatform(readsOnlyJira());
    const model = new AppModel(platform);
    await model.connect("acme.atlassian.net");
    model.showAdmin("board");

    model.enterPresentation();
    expect(model.view.value).toBe("board");
    expect(model.presenting.value).toBe(true);
    model.showAdmin();
    expect(model.presenting.value).toBe(false);

    model.enterPresentation();
    model.showDiagnostic();
    expect(model.presenting.value).toBe(false);

    model.enterPresentation();
    await model.disconnect();
    expect(model.presenting.value).toBe(false);
    expect(JSON.stringify(platform.stored.get("interface.v1") ?? {})).not.toContain("present");
  });
});

describe("AppModel — largeur de la barre latérale", () => {
  it("de 200 px à la moitié de la fenêtre, arrondie", () => {
    expect(clampSidebarWidth(120, 1600)).toBe(200);
    expect(clampSidebarWidth(420.6, 1600)).toBe(421);
    expect(clampSidebarWidth(1200, 1600)).toBe(800);
    // Fenêtre étroite : le minimum l'emporte.
    expect(clampSidebarWidth(300, 300)).toBe(200);
  });

  it("gardée dans ce navigateur, reprise au démarrage ; double-clic : largeur par défaut", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform);
    expect(model.sidebarWidth.value).toBe(SIDEBAR_WIDTH.default);

    // Pendant le geste, rien n'est enregistré ; au relâchement, la largeur l'est.
    await model.resizeSidebar(360, 1600, false);
    expect(platform.stored.get("interface.v1")).toBeUndefined();
    await model.resizeSidebar(380, 1600, true);
    expect(platform.stored.get("interface.v1")).toEqual({ sidebarWidth: 380, healthOpen: false });

    const reopened = new AppModel(platform);
    await reopened.start();
    expect(reopened.sidebarWidth.value).toBe(380);

    await reopened.resetSidebarWidth();
    expect(reopened.sidebarWidth.value).toBe(248);
    expect(platform.stored.get("interface.v1")).toEqual({ sidebarWidth: 248, healthOpen: false });
  });
});

describe("AppModel — santé du sprint", () => {
  it("panneau replié par défaut ; déplié, il le reste à la réouverture, sans toucher la largeur", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform);
    await model.start();
    expect(model.healthOpen.value).toBe(false);
    await model.resizeSidebar(300, 1600, true);

    await model.toggleHealth();
    expect(model.healthOpen.value).toBe(true);
    expect(platform.stored.get("interface.v1")).toEqual({ sidebarWidth: 300, healthOpen: true });

    const reopened = new AppModel(platform);
    await reopened.start();
    expect(reopened.healthOpen.value).toBe(true);
    expect(reopened.sidebarWidth.value).toBe(300);

    await reopened.toggleHealth();
    expect(reopened.healthOpen.value).toBe(false);
  });

  it("ancien enregistrement, sans l'état du panneau : replié", async () => {
    const platform = fakePlatform(new FakeJira());
    await platform.store.set("interface.v1", { sidebarWidth: 320 });
    const model = new AppModel(platform);
    await model.start();
    expect(model.sidebarWidth.value).toBe(320);
    expect(model.healthOpen.value).toBe(false);
  });

  it("une valeur enregistrée invalide est ignorée", async () => {
    for (const saved of [{ sidebarWidth: "large" }, { sidebarWidth: 40 }, "380", null]) {
      const platform = fakePlatform(new FakeJira());
      platform.stored.set("interface.v1", saved);
      const model = new AppModel(platform);
      await model.start();
      expect(model.sidebarWidth.value).toBe(SIDEBAR_WIDTH.default);
    }
  });
});
