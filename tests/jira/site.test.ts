import { describe, expect, it } from "vitest";
import { JiraError } from "../../src/jira/errors";
import { atlassianLink, isTrustedHost, normalizeSiteUrl, parseBoardUrl } from "../../src/jira/site";

// Cas de validation et de restriction des hôtes :
// l'extension n'admet que *.atlassian.net (ni *.jira.com, ni domaine personnalisé).

describe("normalizeSiteUrl", () => {
  it("accepte un hôte nu comme une adresse complète", () => {
    expect(normalizeSiteUrl("acme.atlassian.net").origin).toBe("https://acme.atlassian.net");
    expect(normalizeSiteUrl("  https://acme.atlassian.net/jira/software/x?y=1#z ").origin).toBe(
      "https://acme.atlassian.net",
    );
  });

  it("met l'hôte en minuscules et produit le motif de permission de ce seul site", () => {
    const site = normalizeSiteUrl("ACME.Atlassian.NET");
    expect(site.host).toBe("acme.atlassian.net");
    expect(site.permissionPattern).toBe("https://acme.atlassian.net/*");
  });

  it("retire les identifiants embarqués dans l'adresse", () => {
    const site = normalizeSiteUrl("https://user:secret@acme.atlassian.net/x");
    expect(site.origin).toBe("https://acme.atlassian.net");
    expect(JSON.stringify(site)).not.toContain("secret");
  });

  it.each([
    "acme.atlassian.ne",
    "acme.atlassian.net.evil.example",
    "evilatlassian.net",
    "atlassian.net",
    "jira.acme.example",
    "acme.jira.com",
    "acme.atlassian.com",
  ])("refuse l'hôte %s", (host) => {
    expect(() => normalizeSiteUrl(host)).toThrowError(JiraError);
    try {
      normalizeSiteUrl(host);
    } catch (error) {
      expect((error as JiraError).info.kind).toBe("untrustedSiteHost");
    }
  });

  it.each([
    "",
    "   ",
    "http://acme.atlassian.net",
    "https://acme.atlassian.net:8443",
    "acme",
    "ht!tp://x",
  ])("refuse l'adresse invalide « %s »", (raw) => {
    try {
      normalizeSiteUrl(raw);
      expect.unreachable();
    } catch (error) {
      expect((error as JiraError).info.kind).toBe("invalidSiteUrl");
    }
  });
});

describe("isTrustedHost", () => {
  it("compare sur une frontière de libellé DNS", () => {
    expect(isTrustedHost("acme.atlassian.net")).toBe(true);
    expect(isTrustedHost("a.b.atlassian.net")).toBe(true);
    expect(isTrustedHost("evil-atlassian.net")).toBe(false);
    expect(isTrustedHost(".atlassian.net")).toBe(false);
  });
});

describe("parseBoardUrl", () => {
  it("lit le format moderne avec projet", () => {
    const parsed = parseBoardUrl(
      "https://acme.atlassian.net/jira/software/c/projects/ABC/boards/123",
    );
    expect(parsed).toEqual({
      site: normalizeSiteUrl("acme.atlassian.net"),
      boardId: 123,
      projectKey: "ABC",
    });
  });

  it("lit le format moderne suivi d'une vue", () => {
    const parsed = parseBoardUrl(
      "acme.atlassian.net/jira/software/projects/ABC/boards/45/backlog?issueLimit=100",
    );
    expect(parsed?.boardId).toBe(45);
    expect(parsed?.projectKey).toBe("ABC");
  });

  it("lit le format classique rapidView", () => {
    const parsed = parseBoardUrl(
      "https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=77&projectKey=XYZ",
    );
    expect(parsed?.boardId).toBe(77);
    expect(parsed?.projectKey).toBe("XYZ");
  });

  it("ne devine pas : pas d'identifiant, pas de board", () => {
    expect(parseBoardUrl("https://acme.atlassian.net/jira/software/c/projects/ABC")).toBeNull();
    expect(parseBoardUrl("https://acme.atlassian.net/jira/boards/abc")).toBeNull();
    expect(parseBoardUrl("https://acme.atlassian.net/jira/boards/0")).toBeNull();
    expect(parseBoardUrl("")).toBeNull();
  });

  it("refuse un board hébergé hors *.atlassian.net", () => {
    expect(parseBoardUrl("https://jira.acme.example/boards/12")).toBeNull();
  });
});

describe("atlassianLink — lien vers une page d'Atlassian reçu de Jira", () => {
  it("garde un lien HTTPS vers atlassian.com ou un sous-domaine d'Atlassian", () => {
    expect(atlassianLink("https://home.atlassian.com/o/1/s/2/goal/ABC-1")).toBe(
      "https://home.atlassian.com/o/1/s/2/goal/ABC-1",
    );
    expect(atlassianLink("https://acme.atlassian.net/browse/ABC-1")).toBe(
      "https://acme.atlassian.net/browse/ABC-1",
    );
    expect(atlassianLink("https://atlassian.com/goal")).toBe("https://atlassian.com/goal");
    expect(atlassianLink("https://HOME.Atlassian.com/x")).toBe("https://home.atlassian.com/x");
  });

  it("écarte tout autre site, schéma, identifiant ou port", () => {
    for (const raw of [
      "https://evil.example/goal",
      "https://evilatlassian.com/goal",
      "https://atlassian.com.evil.example/goal",
      "https://atlassian.net/goal",
      "http://home.atlassian.com/goal",
      "javascript:alert(1)",
      "data:text/html,<p>x</p>",
      "https://user:secret@home.atlassian.com/goal",
      "https://home.atlassian.com:8443/goal",
      "pas une adresse",
      "",
      null,
      undefined,
    ]) {
      expect(atlassianLink(raw)).toBeNull();
    }
  });
});
