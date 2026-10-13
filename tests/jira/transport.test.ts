import { describe, expect, it, vi } from "vitest";
import type { ObserveRead, ReadResult } from "../../src/core/loadTrace";
import { JiraError, type JiraErrorInfo } from "../../src/jira/errors";
import { isReadOnlyGraphql, JiraTransport } from "../../src/jira/transport";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { ACME, FakeJira, XSRF_REFUSAL } from "../support/fakeJira";

const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.diagnostic}`;
const PUT_PROBE = {
  kind: "sprintProperty.put",
  sprintId: 42,
  key: SPRINT_PROPERTY_KEYS.diagnostic,
  value: { probe: true },
} as const;

function transportFor(jira: FakeJira, options: { timeoutMs?: number } = {}) {
  const sleeps: number[] = [];
  const transport = new JiraTransport({
    site: ACME,
    fetch: jira.fetch,
    sleep: async (ms) => void sleeps.push(ms),
    ...options,
  });
  return { transport, sleeps };
}

async function errorOf(promise: Promise<unknown>): Promise<JiraErrorInfo> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(JiraError);
    return (error as JiraError).info;
  }
  throw new Error("une erreur était attendue");
}

describe("JiraTransport — forme des requêtes", () => {
  it("s'appuie sur la session du navigateur, sans aucun en-tête d'identification", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 200, json: {} });
    await transportFor(jira).transport.get("/rest/api/3/myself", { resource: "compte" });

    const [request] = jira.requests;
    expect(request?.init.credentials).toBe("include");
    expect(request?.init.redirect).toBe("manual");
    expect(request?.init.cache).toBe("no-store");
    expect(request?.headers).toEqual({ Accept: "application/json" });
    expect(Object.keys(request?.headers ?? {})).not.toContain("Authorization");
  });

  it("encode les paramètres de requête", async () => {
    const jira = new FakeJira().on("GET", "/rest/agile/1.0/board/7/issue", {
      status: 200,
      json: {},
    });
    await transportFor(jira).transport.get("/rest/agile/1.0/board/7/issue", {
      query: { jql: 'labels = "a&b"' },
      resource: "tickets",
    });
    expect(jira.requests[0]?.url.searchParams.get("jql")).toBe('labels = "a&b"');
    expect(jira.requests[0]?.url.search).toContain("%26");
  });

  it("n'ajoute X-Atlassian-Token que sur demande", async () => {
    const jira = new FakeJira().on("PUT", PROPERTY, { status: 201 });
    const { transport } = transportFor(jira);
    await transport.write(PUT_PROBE);
    await transport.write(PUT_PROBE, { atlassianToken: "no-check" });

    expect(jira.requests[0]?.headers["X-Atlassian-Token"]).toBeUndefined();
    expect(jira.requests[1]?.headers["X-Atlassian-Token"]).toBe("no-check");
    expect(jira.requests[1]?.headers["Content-Type"]).toBe("application/json");
    expect(jira.requests[1]?.body).toEqual({ probe: true });
  });

  it.each(["//evil.example/x", "https://evil.example/x", "rest/api/3/myself"])(
    "refuse avant l'envoi le chemin %s",
    async (path) => {
      const jira = new FakeJira();
      await expect(
        transportFor(jira).transport.get(path, { resource: "x" }),
      ).rejects.toThrowError();
      expect(jira.requests).toHaveLength(0);
    },
  );
});

describe("JiraTransport — erreurs", () => {
  it.each([
    [401, {}, "unauthorized"],
    [404, {}, "notFound"],
    [500, {}, "serviceUnavailable"],
    [503, {}, "serviceUnavailable"],
    [418, {}, "unexpected"],
  ] as const)("traduit un %i", async (status, json, kind) => {
    const jira = new FakeJira().on("PUT", PROPERTY, { status, json });
    const info = await errorOf(transportFor(jira).transport.write(PUT_PROBE));
    expect(info.kind).toBe(kind);
  });

  it("distingue le refus XSRF d'un refus de droits", async () => {
    const jira = new FakeJira().on("PUT", PROPERTY, XSRF_REFUSAL, {
      status: 403,
      json: { errorMessages: ["Vous ne pouvez pas gérer ce sprint."] },
    });
    const { transport } = transportFor(jira);

    expect((await errorOf(transport.write(PUT_PROBE))).kind).toBe("xsrf");
    expect(await errorOf(transport.write(PUT_PROBE))).toMatchObject({
      kind: "forbidden",
      detail: "Vous ne pouvez pas gérer ce sprint.",
    });
  });

  it("garde le corps et les en-têtes utiles d'un 403 sans message Jira", async () => {
    const jira = new FakeJira().on("POST", "/gateway/api/graphql", {
      status: 403,
      text: "<html><body>Forbidden by gateway</body></html>",
      headers: {
        "Content-Type": "text/html",
        "X-Failure-Category": "EXEMPLE_DE_TEST",
        "Set-Cookie": "session=secret",
        "Atl-Traceid": "trace-123",
      },
    });
    const info = await errorOf(
      transportFor(jira).transport.graphqlQuery("query q { a }", {}, { resource: "site" }),
    );
    expect(info).toEqual({
      kind: "forbidden",
      detail: null,
      bodyExcerpt: "<html><body>Forbidden by gateway</body></html>",
      responseHints: "content-type: text/html ; x-failure-category: EXEMPLE_DE_TEST",
    });
  });

  it("remonte les messages d'un 400", async () => {
    const jira = new FakeJira().on("PUT", PROPERTY, {
      status: 400,
      json: { errorMessages: ["JSON invalide"], errors: { value: "attendu : objet" } },
    });
    expect(await errorOf(transportFor(jira).transport.write(PUT_PROBE))).toEqual({
      kind: "badRequest",
      messages: ["JSON invalide"],
      fieldErrors: { value: "attendu : objet" },
    });
  });

  it("lit Retry-After sur un 429", async () => {
    const jira = new FakeJira().on("PUT", PROPERTY, {
      status: 429,
      headers: { "Retry-After": "7" },
    });
    expect(await errorOf(transportFor(jira).transport.write(PUT_PROBE))).toEqual({
      kind: "rateLimited",
      retryAfterSeconds: 7,
    });
  });

  it("ne suit jamais une redirection", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { redirect: true });
    const info = await errorOf(
      transportFor(jira).transport.get("/rest/api/3/myself", { resource: "compte" }),
    );
    expect(info.kind).toBe("redirected");
    expect(jira.requests).toHaveLength(1);
  });

  it("signale une réponse 200 illisible", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 200, text: "<html>" });
    const info = await errorOf(
      transportFor(jira).transport.get("/rest/api/3/myself", { resource: "compte" }),
    );
    expect(info.kind).toBe("decoding");
  });

  it("abandonne au délai imparti", async () => {
    const jira = new FakeJira().on("PUT", PROPERTY, { hang: true });
    const info = await errorOf(transportFor(jira, { timeoutMs: 10 }).transport.write(PUT_PROBE));
    expect(info.kind).toBe("timeout");
  });
});

describe("JiraTransport — nouvelles tentatives", () => {
  it("rejoue un GET sur erreur transitoire, en respectant Retry-After", async () => {
    const jira = new FakeJira().on(
      "GET",
      "/rest/api/3/myself",
      { status: 503 },
      { status: 429, headers: { "Retry-After": "4" } },
      { status: 200, json: { displayName: "A" } },
    );
    const { transport, sleeps } = transportFor(jira);
    const response = await transport.get("/rest/api/3/myself", { resource: "compte" });

    expect(response.status).toBe(200);
    expect(jira.requests).toHaveLength(3);
    expect(sleeps).toEqual([600, 4000]);
  });

  it("ne rejoue pas un GET refusé (401, 403, 404)", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 401 });
    await errorOf(transportFor(jira).transport.get("/rest/api/3/myself", { resource: "compte" }));
    expect(jira.requests).toHaveLength(1);
  });

  it.each([
    ["503", { status: 503 }],
    ["429", { status: 429 }],
    ["coupure réseau", { networkError: "Failed to fetch" }],
  ] as const)("n'émet JAMAIS une écriture deux fois (%s)", async (_, reply) => {
    const jira = new FakeJira().on("PUT", PROPERTY, reply).on("DELETE", PROPERTY, reply);
    const { transport, sleeps } = transportFor(jira);

    await errorOf(transport.write(PUT_PROBE));
    await errorOf(
      transport.write({
        kind: "sprintProperty.delete",
        sprintId: 42,
        key: SPRINT_PROPERTY_KEYS.diagnostic,
      }),
    );

    expect(jira.sent("PUT")).toHaveLength(1);
    expect(jira.sent("DELETE")).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("ne rejoue pas non plus une lecture par POST", async () => {
    const jira = new FakeJira().on("POST", "/rest/api/3/jql/parse", { status: 503 });
    await errorOf(
      transportFor(jira).transport.readByPost(
        "/rest/api/3/jql/parse",
        { queries: ["created >= -1d"] },
        { resource: "jql" },
      ),
    );
    expect(jira.requests).toHaveLength(1);
  });
});

describe("JiraTransport — POST", () => {
  it("refuse un POST de lecture hors liste, avant l'envoi", async () => {
    const jira = new FakeJira();
    const { transport } = transportFor(jira);
    await expect(
      // @ts-expect-error — le type interdit déjà ce chemin ; on vérifie aussi la garde à l'exécution.
      transport.readByPost("/rest/agile/1.0/sprint/42", { goal: "x" }, { resource: "x" }),
    ).rejects.toThrowError(/non répertorié/);
    expect(jira.requests).toHaveLength(0);
  });

  it("refuse une mutation GraphQL, avant l'envoi", async () => {
    const jira = new FakeJira();
    const { transport } = transportFor(jira);
    for (const document of [
      "mutation { goals_linkWorkItem(input: {}) { success } }",
      "# commentaire\nmutation X { a }",
      "query A { a } mutation B { b }",
      "{ tenantContexts { cloudId } }",
    ]) {
      await expect(transport.graphqlQuery(document, {}, { resource: "x" })).rejects.toThrowError();
    }
    expect(jira.requests).toHaveLength(0);
  });

  it("émet une requête GraphQL de lecture vers la passerelle du site", async () => {
    const jira = new FakeJira().on("POST", "/gateway/api/graphql", {
      status: 200,
      json: { data: {} },
    });
    await transportFor(jira).transport.graphqlQuery(
      "query q($h: [String!]!) { tenantContexts(hostNames: $h) { cloudId } }",
      { h: ["acme.atlassian.net"] },
      { resource: "site" },
    );
    expect(jira.requests[0]?.url.origin).toBe("https://acme.atlassian.net");
    expect(jira.requests[0]?.body).toMatchObject({ variables: { h: ["acme.atlassian.net"] } });
  });

  it("isReadOnlyGraphql ignore le mot « mutation » dans un commentaire", () => {
    expect(isReadOnlyGraphql("# pas une mutation\nquery A { a }")).toBe(true);
  });
});

describe("JiraTransport — images", () => {
  const ICON = "/rest/api/2/universal_avatar/view/type/issuetype/avatar/10315";

  it("télécharge une icône du site avec la session", async () => {
    const jira = new FakeJira().on("GET", ICON, {
      status: 200,
      text: "<svg/>",
      headers: { "Content-Type": "image/svg+xml" },
    });
    const blob = await transportFor(jira).transport.fetchImage(
      `https://acme.atlassian.net${ICON}?size=medium`,
    );

    expect(await blob.text()).toBe("<svg/>");
    expect(jira.requests[0]?.init.credentials).toBe("include");
    expect(jira.requests[0]?.init.redirect).toBe("manual");
    expect(jira.requests[0]?.url.searchParams.get("size")).toBe("medium");
  });

  it.each([
    "https://secure.gravatar.com/avatar/x",
    "http://acme.atlassian.net/icone.png",
    "https://acme.atlassian.net.evil.example/icone.png",
    "pas une adresse",
  ])("ne demande jamais une image hors du site : %s", async (url) => {
    const jira = new FakeJira();
    await expect(transportFor(jira).transport.fetchImage(url)).rejects.toThrowError();
    expect(jira.requests).toHaveLength(0);
  });

  it("refuse ce qui n'est pas une image, ou une image trop lourde", async () => {
    const jira = new FakeJira().on(
      "GET",
      ICON,
      { status: 200, text: "<html>", headers: { "Content-Type": "text/html" } },
      { status: 200, text: "x".repeat(300 * 1024), headers: { "Content-Type": "image/png" } },
    );
    const { transport } = transportFor(jira);
    const url = `https://acme.atlassian.net${ICON}`;
    await expect(transport.fetchImage(url)).rejects.toThrowError(JiraError);
    await expect(transport.fetchImage(url)).rejects.toThrowError(JiraError);
  });

  it("ne suit pas une redirection et remonte un refus", async () => {
    const jira = new FakeJira().on("GET", ICON, { redirect: true }, { status: 401 });
    const { transport } = transportFor(jira);
    const url = `https://acme.atlassian.net${ICON}`;
    await expect(transport.fetchImage(url)).rejects.toThrowError(JiraError);
    await expect(transport.fetchImage(url)).rejects.toThrowError(JiraError);
    expect(jira.requests).toHaveLength(2);
  });
});

describe("JiraTransport — observation des lectures", () => {
  it.each(["observer", "attempt", "finish", "wait", "waitFinish"])(
    "un diagnostic qui échoue à %s ne change ni réponse ni reprise",
    async (step) => {
      const failure = () => {
        throw new Error("diagnostic défaillant");
      };
      const jira = new FakeJira().on(
        "GET",
        "/rest/api/3/myself",
        { status: 503 },
        { status: 200, json: { ok: true } },
      );
      const observeRead: ObserveRead = () => {
        if (step === "observer") failure();
        return {
          attempt: () => {
            if (step === "attempt") failure();
            return {
              finish: () => {
                if (step === "finish") failure();
              },
            };
          },
          wait: () => {
            if (step === "wait") failure();
            return {
              finish: () => {
                if (step === "waitFinish") failure();
              },
            };
          },
        };
      };
      const sleep = vi.fn(async () => {});
      const transport = new JiraTransport({ site: ACME, fetch: jira.fetch, observeRead, sleep });
      await expect(transport.get("/rest/api/3/myself", { resource: "SECRET" })).resolves.toEqual({
        status: 200,
        body: { ok: true },
      });
      expect(jira.requests).toHaveLength(2);
      expect(sleep).toHaveBeenCalledExactlyOnceWith(600);
    },
  );

  it("un observateur qui jette n'altère pas l'erreur HTTP finale", async () => {
    const jira = new FakeJira().on("GET", "/rest/api/3/myself", { status: 401 });
    const transport = new JiraTransport({
      site: ACME,
      fetch: jira.fetch,
      observeRead: () => {
        throw new Error("diagnostic");
      },
    });
    expect(await errorOf(transport.get("/rest/api/3/myself", { resource: "compte" }))).toEqual({
      kind: "unauthorized",
    });
    expect(jira.requests).toHaveLength(1);
  });

  it("observe les POST de lecture et erreurs GraphQL sans transmettre le corps à l'observateur", async () => {
    const jira = new FakeJira()
      .on("POST", "/rest/api/3/jql/parse", { status: 200, json: { ok: true } })
      .on("POST", "/gateway/api/graphql", {
        status: 200,
        json: { errors: [{ message: "SECRET" }] },
      });
    const results: ReadResult[] = [];
    const observeRead = vi.fn<ObserveRead>(() => ({
      attempt: () => ({
        finish: (result) => {
          results.push(result);
        },
      }),
      wait: () => undefined,
    }));
    const transport = new JiraTransport({ site: ACME, fetch: jira.fetch, observeRead });
    await transport.readByPost(
      "/rest/api/3/jql/parse",
      { queries: ["SECRET"] },
      { resource: "SECRET" },
    );
    const response = await transport.graphqlQuery(
      "query Secret { data }",
      { id: "SECRET" },
      { resource: "SECRET" },
    );
    expect(response.body).toEqual({ errors: [{ message: "SECRET" }] });
    expect(observeRead.mock.calls).toEqual([["readPost"], ["graphql"]]);
    expect(results).toEqual([
      { status: 200, error: null },
      { status: 200, error: "graphql" },
    ]);
    expect(JSON.stringify(results)).not.toContain("SECRET");
  });

  it("n'observe ni écritures ni icônes", async () => {
    const jira = new FakeJira()
      .on("PUT", PROPERTY, { status: 204 })
      .on("POST", "/gateway/api/graphql", { status: 200, json: { data: { success: true } } })
      .on("GET", "/icon", {
        status: 200,
        text: "<svg/>",
        headers: { "Content-Type": "image/svg+xml" },
      });
    const observeRead = vi.fn<ObserveRead>(() => undefined);
    const transport = new JiraTransport({ site: ACME, fetch: jira.fetch, observeRead });
    await transport.write(PUT_PROBE);
    await transport.graphqlWrite({
      kind: "goal.link",
      goalId: "goal-fictif",
      workItemId: "ticket-fictif",
    });
    await transport.fetchImage(`${ACME.origin}/icon`);
    expect(observeRead).not.toHaveBeenCalled();
  });
});
