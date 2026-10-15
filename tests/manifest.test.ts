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

  it("limite les droits au stockage, à la règle d'en-tête et à l'intégration Jira", () => {
    // declarativeNetRequestWithHostAccess : n'agit que sur les hôtes déjà accordés (un seul site
    // *.atlassian.net), et seulement par la règle de session de originRule.ts. Validée par Denis
    // le 18/09/2026.
    // scripting et l'hébergement dans Jira deviennent le mode unique à la demande de Denis.
    // activeTab (choix de Denis du 09/10/2026) : adresse de l'onglet courant au clic sur l'icône,
    // pour reconnaître le board sans saisie ; ni avertissement à l'installation, ni accès durable.
    expect(manifest.permissions).toEqual([
      "storage",
      "declarativeNetRequestWithHostAccess",
      "scripting",
      "activeTab",
    ]);
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("ne peut demander l'accès qu'à un site *.atlassian.net, en HTTPS", () => {
    expect(manifest.optional_host_permissions).toEqual(["https://*.atlassian.net/*"]);
    expect(manifest.optional_permissions).toBeUndefined();
  });

  it("expose la vue uniquement aux sites Jira, sans exposer le lanceur", () => {
    // Les scripts de contenu ne sont enregistrés qu'après autorisation du site par l'utilisateur.
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ["board.html", "assets/*", "icons/*"],
        matches: ["https://*.atlassian.net/*"],
      },
    ]);
    expect(manifest.externally_connectable).toBeUndefined();
    expect(manifest.declarative_net_request).toBeUndefined();
  });

  it("ouvre le lanceur Jira depuis l'icône et utilise le worker d'intégration", () => {
    expect(manifest.action).toMatchObject({ default_popup: "launcher.html" });
    expect(manifest.background).toEqual({
      service_worker: "jira-worker.js",
      type: "module",
    });
  });

  it("métadonnées FR/EN/ES dans les limites de Chrome, avec le nom « … pour/for/para Jira »", () => {
    // Limites du Chrome Web Store : nom 75, nom court 12, description 132 caractères.
    expect([...(manifest.short_name as string)].length).toBeLessThanOrEqual(12);
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_extensionName__");
    expect(manifest.description).toBe("__MSG_extensionDescription__");
    expect(manifest.action).toMatchObject({ default_title: "__MSG_extensionAction__" });
    for (const language of ["fr", "en", "es"]) {
      const messages = JSON.parse(
        readFileSync(
          new URL(`../public/_locales/${language}/messages.json`, import.meta.url),
          "utf8",
        ),
      );
      expect([...messages.extensionName.message].length).toBeLessThanOrEqual(75);
      expect([...messages.extensionDescription.message].length).toBeLessThanOrEqual(132);
      expect(messages.extensionName.message).toMatch(/ (pour|for|para) Jira$/);
      expect(messages.extensionAction.message).toBeTruthy();
    }
  });

  it("icônes : des fichiers PNG de l'extension elle-même, présents dans public/", () => {
    const icons = manifest.icons as Record<string, string>;
    const action = (manifest.action as { default_icon: Record<string, string> }).default_icon;
    expect(Object.keys(icons)).toEqual(["16", "32", "48", "128"]);
    for (const [size, path] of [...Object.entries(icons), ...Object.entries(action)]) {
      expect(path).toBe(`icons/icon-${size}.png`);
      const bytes = readFileSync(new URL(`../public/${path}`, import.meta.url));
      // Signature PNG, puis largeur et hauteur de l'en-tête IHDR.
      expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        Number(size),
        Number(size),
      ]);
    }
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

    it("réserve l'encadrement à Jira et interdit les formulaires et la balise base", () => {
      expect(csp.get("frame-ancestors")).toEqual(["https://*.atlassian.net"]);
      expect(csp.get("form-action")).toEqual(["'none'"]);
      expect(csp.get("base-uri")).toEqual(["'none'"]);
    });
  });
});
