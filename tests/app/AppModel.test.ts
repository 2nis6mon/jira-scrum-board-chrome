import { describe, expect, it } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const PATTERN = "https://acme.atlassian.net/*";
const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.diagnostic}`;

function healthyJira(): FakeJira {
  return new FakeJira()
    .on("GET", "/rest/api/3/myself", { status: 200, json: { displayName: "Personne Test" } })
    .on("POST", "/rest/api/3/jql/parse", { status: 200, json: {} })
    .on("POST", "/gateway/api/graphql", {
      status: 200,
      json: { data: { tenantContexts: [{ cloudId: "cloud-test" }] } },
    })
    .on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [{ id: 42, name: "Sprint de test" }] },
    })
    .on("GET", PROPERTY, { status: 404 }, { status: 200, json: { value: { probe: true } } })
    .on("PUT", PROPERTY, { status: 201 })
    .on("DELETE", PROPERTY, { status: 204 });
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

  it("ne demande l'accès qu'au site saisi, puis lance les lectures", async () => {
    const jira = healthyJira();
    const platform = fakePlatform(jira);
    const model = new AppModel(platform);
    await model.connect("https://ACME.atlassian.net/jira/software/c/projects/ABC/boards/7");

    expect(platform.requested).toEqual([PATTERN]);
    expect(model.connection.value).toMatchObject({
      state: "connected",
      site: { host: "acme.atlassian.net" },
    });
    expect(platform.stored.get("connection.v1")).toEqual({ origin: "https://acme.atlassian.net" });
    expect(model.read.value?.sessionRecognized).toBe(true);
    expect(jira.requests.every((r) => r.url.origin === "https://acme.atlassian.net")).toBe(true);
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
    expect(jira.requests).toEqual([]);
  });

  it("reprend le site enregistré si l'accès est toujours accordé", async () => {
    const platform = fakePlatform(healthyJira());
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

  it("se déconnecter rend l'accès à Chrome et oublie le site", async () => {
    const platform = fakePlatform(healthyJira());
    const model = new AppModel(platform);
    await model.connect("acme.atlassian.net");
    await model.disconnect();

    expect(platform.granted.size).toBe(0);
    expect(platform.stored.size).toBe(0);
    expect(model.read.value).toBeNull();
    expect(model.connection.value).toEqual({
      state: "disconnected",
      lastInput: "acme.atlassian.net",
    });
  });
});

describe("AppModel — test d'écriture", () => {
  async function connected(jira: FakeJira) {
    const platform = fakePlatform(jira);
    const model = new AppModel(platform);
    await model.connect("acme.atlassian.net");
    return { model, platform };
  }

  it("n'écrit rien tant que l'utilisateur n'a pas lancé le test", async () => {
    const jira = healthyJira();
    const { model } = await connected(jira);
    await model.findSprint("https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7");

    expect(model.sprint.value).toEqual({ id: 42, name: "Sprint de test" });
    expect(jira.requests.filter((r) => r.method === "PUT" || r.method === "DELETE")).toEqual([]);
  });

  it("sans sprint trouvé, le test d'écriture ne fait rien", async () => {
    const jira = healthyJira();
    const { model } = await connected(jira);
    await model.runWriteTest();

    expect(model.write.value).toBeNull();
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("refuse le board d'un autre site sans émettre de requête", async () => {
    const jira = healthyJira();
    const { model } = await connected(jira);
    const before = jira.requests.length;
    await model.findSprint("https://autre.atlassian.net/jira/software/c/projects/ABC/boards/7");

    expect(model.sprintError.value?.text).toContain("autre.atlassian.net");
    expect(jira.requests).toHaveLength(before);
  });

  it("refuse une adresse qui n'est pas un board", async () => {
    const { model } = await connected(healthyJira());
    await model.findSprint("https://acme.atlassian.net/browse/ABC-1");
    expect(model.sprintError.value?.text).toContain("ne désigne pas un board");
  });

  it("déroule le test et copie un rapport sans donnée identifiante", async () => {
    const jira = healthyJira();
    const { model, platform } = await connected(jira);
    await model.findSprint("acme.atlassian.net/jira/software/c/projects/ABC/boards/7");
    await model.runWriteTest();
    await model.copyReport();

    expect(model.write.value?.acceptedWith).toBe("absent");
    expect(model.reportCopied.value).toBe(true);
    const [report] = platform.copied;
    expect(report).toContain("Conclusion : Jira accepte les écritures");
    for (const secret of ["acme", "Personne Test", "Sprint de test", "cloud-test"]) {
      expect(report).not.toContain(secret);
    }
  });
});
