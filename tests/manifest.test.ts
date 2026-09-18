import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Garde-fou : toute extension des droits de l'extension doit casser ce test et donc
// être décidée explicitement, jamais glissée dans un commit.

const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

function cspDirectives(): Map<string, string[]> {
  const policy = (manifest.content_security_policy as { extension_pages: string }).extension_pages;
  const directives = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name, values);
  }
  return directives;
}

describe("manifest", () => {
  it("est un Manifest V3 à la version du paquet", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe(pkg.version);
  });

  it("ne demande à l'installation que le stockage local", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("ne peut demander l'accès qu'à un site *.atlassian.net, en HTTPS", () => {
    expect(manifest.optional_host_permissions).toEqual(["https://*.atlassian.net/*"]);
    expect(manifest.optional_permissions).toBeUndefined();
  });

  it("n'injecte rien dans les pages et n'expose rien aux sites web", () => {
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
    expect(manifest.declarative_net_request).toBeUndefined();
  });

  it("fige l'identifiant de l'extension par une clé publique", () => {
    expect(manifest.key).toMatch(/^[A-Za-z0-9+/]{300,}={0,2}$/);
  });

  describe("politique de sécurité du contenu", () => {
    const csp = cspDirectives();

    it("n'exécute que les scripts de l'extension", () => {
      expect(csp.get("default-src")).toEqual(["'self'"]);
      expect(csp.get("script-src")).toEqual(["'self'"]);
      expect(csp.get("object-src")).toEqual(["'none'"]);
    });

    it("ne se connecte qu'à *.atlassian.net", () => {
      expect(csp.get("connect-src")).toEqual(["https://*.atlassian.net"]);
    });

    it("ne charge aucune image ni feuille de style distante", () => {
      expect(csp.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
      expect(csp.get("style-src")).toEqual(["'self'"]);
    });

    it("n'autorise ni code en ligne ni eval", () => {
      const everything = [...csp.values()].flat().join(" ");
      expect(everything).not.toContain("unsafe-inline");
      expect(everything).not.toContain("unsafe-eval");
      expect(everything).not.toContain("http:");
    });

    it("interdit l'encadrement, les formulaires et la balise base", () => {
      expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
      expect(csp.get("form-action")).toEqual(["'none'"]);
      expect(csp.get("base-uri")).toEqual(["'none'"]);
    });
  });
});
