import { describe, expect, it } from "vitest";
import {
  findActiveSprint,
  formatReport,
  probeSprintPropertyWrite,
  runReadProbes,
  writeConclusion,
} from "../../src/jira/diagnostics";
import { JiraTransport } from "../../src/jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { ACME, FakeJira, XSRF_REFUSAL } from "../support/fakeJira";

const MYSELF = "/rest/api/3/myself";
const JQL_PARSE = "/rest/api/3/jql/parse";
const GRAPHQL = "/gateway/api/graphql";
const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.diagnostic}`;

const CLOUD_ID = { status: 200, json: { data: { tenantContexts: [{ cloudId: "cloud-test" }] } } };
const STORED = {
  status: 200,
  json: { key: SPRINT_PROPERTY_KEYS.diagnostic, value: { probe: true } },
};

function transportFor(jira: FakeJira) {
  return new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 });
}

describe("runReadProbes", () => {
  it("tout passe sans en-tête", async () => {
    const jira = new FakeJira()
      .on("GET", MYSELF, { status: 200, json: { displayName: "Personne Test" } })
      .on("POST", JQL_PARSE, { status: 200, json: { queries: [] } })
      .on("POST", GRAPHQL, CLOUD_ID);

    const result = await runReadProbes(transportFor(jira));

    expect(result.sessionRecognized).toBe(true);
    expect(result.displayName).toBe("Personne Test");
    expect(result.probes.map((p) => p.status)).toEqual(["ok", "ok", "ok"]);
    expect(result.probes[1]?.detail).toContain("sans en-tête particulier");
    expect(jira.requests).toHaveLength(3);
    expect(jira.sent("POST", GRAPHQL)[0]?.body).toMatchObject({
      variables: { hosts: ["acme.atlassian.net"] },
    });
  });

  it("session absente : s'arrête là et n'émet aucun POST", async () => {
    const jira = new FakeJira().on("GET", MYSELF, { status: 401 });
    const result = await runReadProbes(transportFor(jira));

    expect(result.sessionRecognized).toBe(false);
    expect(result.probes.map((p) => p.status)).toEqual(["failed", "skipped", "skipped"]);
    expect(result.probes[0]?.httpStatus).toBe(401);
    expect(jira.sent("POST")).toHaveLength(0);
  });

  it("refus XSRF sans en-tête : réessaie la LECTURE avec no-check et le rapporte", async () => {
    const jira = new FakeJira()
      .on("GET", MYSELF, { status: 200, json: {} })
      .on("POST", JQL_PARSE, XSRF_REFUSAL, { status: 200, json: {} })
      .on("POST", GRAPHQL, XSRF_REFUSAL, XSRF_REFUSAL);

    const result = await runReadProbes(transportFor(jira));
    const [, rest, graphql] = result.probes;

    expect(rest?.status).toBe("ok");
    expect(rest?.detail).toContain("refus XSRF sans en-tête, puis");
    expect(rest?.detail).toContain("no-check");
    expect(graphql?.status).toBe("failed");
    expect(graphql?.httpStatus).toBe(403);
    expect(jira.sent("POST", JQL_PARSE).map((r) => r.headers["X-Atlassian-Token"])).toEqual([
      undefined,
      "no-check",
    ]);
  });

  it("une réponse GraphQL sans cloudId est un échec, pas un succès", async () => {
    const jira = new FakeJira()
      .on("GET", MYSELF, { status: 200, json: {} })
      .on("POST", JQL_PARSE, { status: 200, json: {} })
      .on("POST", GRAPHQL, { status: 200, json: { errors: [{ message: "nope" }] } });

    const result = await runReadProbes(transportFor(jira));
    expect(result.probes[2]?.status).toBe("failed");
  });
});

describe("findActiveSprint", () => {
  it("retourne le premier sprint actif", async () => {
    const jira = new FakeJira().on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [{ id: 42, name: "Sprint de test", state: "active" }] },
    });
    expect(await findActiveSprint(transportFor(jira), 7)).toEqual({
      id: 42,
      name: "Sprint de test",
    });
    expect(jira.requests[0]?.url.searchParams.get("state")).toBe("active");
  });

  it("retourne null sans sprint actif", async () => {
    const jira = new FakeJira().on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [] },
    });
    expect(await findActiveSprint(transportFor(jira), 7)).toBeNull();
  });
});

describe("probeSprintPropertyWrite", () => {
  it("écrit, relit, supprime — sans en-tête", async () => {
    const jira = new FakeJira()
      .on("GET", PROPERTY, { status: 404 }, STORED)
      .on("PUT", PROPERTY, { status: 201 })
      .on("DELETE", PROPERTY, { status: 204 });

    const result = await probeSprintPropertyWrite(transportFor(jira), 42);

    expect(result.acceptedWith).toBe("absent");
    expect(result.probes.map((p) => [p.id, p.status])).toEqual([
      ["prop-read", "ok"],
      ["put-absent", "ok"],
      ["prop-verify", "ok"],
      ["delete", "ok"],
    ]);
    expect(jira.sent("PUT")).toHaveLength(1);
    expect(jira.sent("PUT")[0]?.body).toEqual({ probe: true });
    expect(writeConclusion(result)).toContain("sans en-tête particulier");
  });

  it("refus XSRF puis succès avec no-check ; la suppression reprend le même réglage", async () => {
    const jira = new FakeJira()
      .on("GET", PROPERTY, { status: 404 }, STORED)
      .on("PUT", PROPERTY, XSRF_REFUSAL, { status: 201 })
      .on("DELETE", PROPERTY, { status: 204 });

    const result = await probeSprintPropertyWrite(transportFor(jira), 42);

    expect(result.acceptedWith).toBe("no-check");
    expect(jira.sent("PUT").map((r) => r.headers["X-Atlassian-Token"])).toEqual([
      undefined,
      "no-check",
    ]);
    expect(jira.sent("DELETE")[0]?.headers["X-Atlassian-Token"]).toBe("no-check");
    expect(writeConclusion(result)).toContain("no-check");
  });

  it("refus XSRF dans les deux cas : le dit, et ne supprime rien", async () => {
    const jira = new FakeJira()
      .on("GET", PROPERTY, { status: 404 })
      .on("PUT", PROPERTY, XSRF_REFUSAL);

    const result = await probeSprintPropertyWrite(transportFor(jira), 42);

    expect(result.acceptedWith).toBeNull();
    expect(jira.sent("PUT")).toHaveLength(2);
    expect(jira.sent("DELETE")).toHaveLength(0);
    expect(writeConclusion(result)).toContain("une autre voie est nécessaire");
  });

  it("refus de droits : un seul PUT, pas de second essai", async () => {
    const jira = new FakeJira().on("GET", PROPERTY, { status: 404 }).on("PUT", PROPERTY, {
      status: 403,
      json: { errorMessages: ["Gestion des sprints requise"] },
    });

    const result = await probeSprintPropertyWrite(transportFor(jira), 42);

    expect(jira.sent("PUT")).toHaveLength(1);
    expect(result.probes.at(-1)?.detail).toContain("Gestion des sprints requise");
    expect(writeConclusion(result)).toContain("autre que le contrôle XSRF");
  });

  it("issue inconnue : un seul PUT, puis une relecture qui dit ce qui est resté", async () => {
    const jira = new FakeJira()
      .on("GET", PROPERTY, { status: 404 }, STORED)
      .on("PUT", PROPERTY, { networkError: "Failed to fetch" });

    const result = await probeSprintPropertyWrite(transportFor(jira), 42);

    expect(jira.sent("PUT")).toHaveLength(1);
    expect(jira.sent("DELETE")).toHaveLength(0);
    expect(result.acceptedWith).toBeNull();
    expect(result.probes.at(-1)?.id).toBe("leftover");
    expect(result.probes.at(-1)?.detail).toContain("EXISTE");
  });

  it("lecture refusée : s'arrête avant toute écriture", async () => {
    const jira = new FakeJira().on("GET", PROPERTY, { status: 403, json: {} });
    const result = await probeSprintPropertyWrite(transportFor(jira), 42);

    expect(jira.sent("PUT")).toHaveLength(0);
    expect(result.probes).toHaveLength(1);
  });

  it("valeur absente à la relecture : échec signalé, nettoyage tenté quand même", async () => {
    const jira = new FakeJira()
      .on("GET", PROPERTY, { status: 404 }, { status: 200, json: { value: {} } })
      .on("PUT", PROPERTY, { status: 200 })
      .on("DELETE", PROPERTY, { status: 204 });

    const result = await probeSprintPropertyWrite(transportFor(jira), 42);
    expect(result.probes.find((p) => p.id === "prop-verify")?.status).toBe("failed");
    expect(jira.sent("DELETE")).toHaveLength(1);
  });

  it("n'écrit jamais ailleurs que sur la propriété de diagnostic", async () => {
    const jira = new FakeJira()
      .on("GET", PROPERTY, { status: 404 }, STORED)
      .on("PUT", PROPERTY, { status: 201 })
      .on("DELETE", PROPERTY, { status: 204 });
    await probeSprintPropertyWrite(transportFor(jira), 42);

    const writes = jira.requests.filter((r) => r.method !== "GET");
    expect(writes.every((r) => r.path === PROPERTY)).toBe(true);
  });
});

describe("formatReport", () => {
  it("ne contient ni le site, ni le nom du compte", async () => {
    const jira = new FakeJira()
      .on("GET", MYSELF, { status: 200, json: { displayName: "Personne Test" } })
      .on("POST", JQL_PARSE, { status: 200, json: {} })
      .on("POST", GRAPHQL, CLOUD_ID);
    const read = await runReadProbes(transportFor(jira));

    const report = formatReport({
      extensionVersion: "9.9.9",
      userAgent: "UA de test",
      read,
      write: null,
    });

    expect(report).toContain("9.9.9");
    expect(report).toContain("✓ Session Jira du navigateur (GET) [200]");
    expect(report).toContain("Écriture : test non lancé");
    expect(report).not.toContain("acme");
    expect(report).not.toContain("Personne Test");
    expect(report).not.toContain("cloud-test");
  });
});
