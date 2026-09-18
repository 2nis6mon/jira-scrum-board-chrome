import { describe, expect, it } from "vitest";
import { AuditLog } from "../../src/app/model/auditLog";
import { DiagnosticModel } from "../../src/app/model/DiagnosticModel";
import { GraphqlOrigin } from "../../src/app/model/graphqlOrigin";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { FakeJira } from "../support/fakeJira";
import { activeOriginOperation, fakePlatform } from "../support/fakePlatform";

const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.diagnostic}`;
const SITE = normalizeSiteUrl("acme.atlassian.net");

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

function modelFor(jira: FakeJira) {
  const platform = fakePlatform(jira);
  return { model: new DiagnosticModel(SITE, platform, new AuditLog(platform.store)), platform };
}

describe("DiagnosticModel", () => {
  it("n'écrit rien tant que l'utilisateur n'a pas lancé le test", async () => {
    const jira = healthyJira();
    const { model } = modelFor(jira);
    await model.runReads();
    await model.findSprint("https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7");

    expect(model.read.value?.sessionRecognized).toBe(true);
    expect(model.sprint.value).toEqual({ id: 42, name: "Sprint de test" });
    expect(jira.requests.filter((r) => r.method === "PUT" || r.method === "DELETE")).toEqual([]);
  });

  it("sans sprint trouvé, le test d'écriture ne fait rien", async () => {
    const jira = healthyJira();
    const { model } = modelFor(jira);
    await model.runWriteTest();

    expect(model.write.value).toBeNull();
    expect(jira.sent("PUT")).toEqual([]);
  });

  it("refuse le board d'un autre site sans émettre de requête", async () => {
    const jira = healthyJira();
    const { model } = modelFor(jira);
    await model.findSprint("https://autre.atlassian.net/jira/software/c/projects/ABC/boards/7");

    expect(model.sprintError.value?.text).toContain("autre.atlassian.net");
    expect(jira.requests).toEqual([]);
  });

  it("refuse une adresse qui n'est pas un board", async () => {
    const { model } = modelFor(healthyJira());
    await model.findSprint("https://acme.atlassian.net/browse/ABC-1");
    expect(model.sprintError.value?.text).toContain("ne désigne pas un board");
  });

  it("board sans sprint actif : le dit", async () => {
    const jira = new FakeJira().on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [] },
    });
    const { model } = modelFor(jira);
    await model.findSprint("acme.atlassian.net/jira/software/c/projects/ABC/boards/7");
    expect(model.sprintError.value?.text).toContain("aucun sprint actif");
  });

  it("déroule le test et copie un rapport sans donnée identifiante", async () => {
    const jira = healthyJira();
    const { model, platform } = modelFor(jira);
    await model.runReads();
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

describe("DiagnosticModel — règle Origin", () => {
  it("retient la variante acceptée par la passerelle, puis la repose", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/api/3/myself", { status: 200, json: { displayName: "Personne Test" } })
      .on("POST", "/rest/api/3/jql/parse", { status: 200, json: {} });
    const platform = fakePlatform(jira);
    // Passerelle qui n'accepte QUE l'en-tête remplacé par l'adresse du site.
    jira.on("POST", "/gateway/api/graphql", () =>
      activeOriginOperation(platform) === "set"
        ? { status: 200, json: { data: { tenantContexts: [{ cloudId: "cloud-test" }] } } }
        : { status: 403, json: { code: 403, message: "Invalid CORS request" } },
    );
    const origin = new GraphqlOrigin(platform, SITE);
    const model = new DiagnosticModel(SITE, platform, new AuditLog(platform.store), origin);

    await model.runReads();

    expect(model.read.value?.graphqlOrigin).toBe("site");
    expect(await origin.preferred()).toBe("site");
    expect(activeOriginOperation(platform)).toBe("set");
  });

  it("aucune variante acceptée : la variante précédente reste en place", async () => {
    const jira = new FakeJira()
      .on("GET", "/rest/api/3/myself", { status: 200, json: {} })
      .on("POST", "/rest/api/3/jql/parse", { status: 200, json: {} })
      .on("POST", "/gateway/api/graphql", {
        status: 403,
        json: { message: "Invalid CORS request" },
      });
    const platform = fakePlatform(jira);
    const origin = new GraphqlOrigin(platform, SITE);
    const model = new DiagnosticModel(SITE, platform, new AuditLog(platform.store), origin);

    await model.runReads();

    expect(model.read.value?.graphqlOrigin).toBeNull();
    expect(activeOriginOperation(platform)).toBe("remove");
  });
});
