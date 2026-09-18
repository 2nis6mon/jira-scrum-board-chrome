import { describe, expect, it } from "vitest";
import { DEFAULT_ORIGIN_MODE, GraphqlOrigin } from "../../src/app/model/graphqlOrigin";
import { graphqlOriginRule } from "../../src/app/platform/originRule";
import { normalizeSiteUrl } from "../../src/jira/site";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform, TEST_EXTENSION_ID } from "../support/fakePlatform";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const OTHER = normalizeSiteUrl("autre.atlassian.net");

describe("règle Origin", () => {
  it("retire l'en-tête : POST de l'extension vers la seule passerelle GraphQL du site", () => {
    expect(graphqlOriginRule(SITE, "remove", TEST_EXTENSION_ID)).toEqual({
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "origin", operation: "remove" }],
      },
      condition: {
        urlFilter: "|https://acme.atlassian.net/gateway/api/graphql|",
        requestMethods: ["post"],
        resourceTypes: ["xmlhttprequest"],
        initiatorDomains: [TEST_EXTENSION_ID],
      },
    });
  });

  it("variante « site » : remplace par l'adresse du site, même périmètre", () => {
    const rule = graphqlOriginRule(SITE, "site", TEST_EXTENSION_ID);
    expect(rule?.action.requestHeaders).toEqual([
      { header: "origin", operation: "set", value: "https://acme.atlassian.net" },
    ]);
    expect(rule?.condition.initiatorDomains).toEqual([TEST_EXTENSION_ID]);
  });

  it("« keep » : aucune règle", () => {
    expect(graphqlOriginRule(SITE, "keep", TEST_EXTENSION_ID)).toBeNull();
  });

  it("refuse un identifiant d'extension inattendu (la règle toucherait d'autres initiateurs)", () => {
    for (const id of ["", "acme.atlassian.net", "*", "abc"]) {
      expect(() => graphqlOriginRule(SITE, "remove", id)).toThrowError();
    }
  });
});

describe("GraphqlOrigin", () => {
  it("variante par défaut : l'adresse du site, seule acceptée sur l'instance réelle", async () => {
    const platform = fakePlatform(new FakeJira());
    const origin = new GraphqlOrigin(platform, SITE);
    expect(await origin.preferred()).toBe(DEFAULT_ORIGIN_MODE);
    expect(DEFAULT_ORIGIN_MODE).toBe("site");
    await origin.restore();
    expect(platform.appliedRules.at(-1)?.action.requestHeaders[0].operation).toBe("set");
  });

  it("mémorise la variante retenue par site, et l'oublie à la déconnexion", async () => {
    const platform = fakePlatform(new FakeJira());
    const acme = new GraphqlOrigin(platform, SITE);
    const other = new GraphqlOrigin(platform, OTHER);
    await acme.remember("site");
    await other.remember("remove");

    expect(await acme.preferred()).toBe("site");
    await acme.restore();
    expect(platform.appliedRules.at(-1)?.action.requestHeaders[0].operation).toBe("set");

    await acme.forget();
    expect(platform.appliedRules.at(-1)).toBeNull();
    expect(await acme.preferred()).toBe(DEFAULT_ORIGIN_MODE);
    expect(await other.preferred()).toBe("remove");
    await other.forget();
    expect(platform.stored.has("graphqlOrigin.v1")).toBe(false);
  });
});
