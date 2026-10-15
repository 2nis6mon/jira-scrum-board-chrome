import { describe, expect, it } from "vitest";
import { catalogs, english, localize, translate } from "../../src/i18n";
import { languagePreference, normalizeLocale, resolveLanguage } from "../../src/i18n/language";

describe("langue de l'interface", () => {
  it.each(["fr", "fr-FR", "fr_FR", "fr-CA", " FR_be "])(
    "reconnaît le français Jira %s",
    (locale) => {
      expect(resolveLanguage("auto", locale)).toBe("fr");
    },
  );

  it.each([
    "en",
    "en_US",
    "es-ES",
    "de",
    "zh-Hans-CN",
    "",
    null,
    undefined,
    "french",
    "fr<script>",
    4,
  ])("se replie en anglais pour %s", (locale) => {
    expect(resolveLanguage("auto", locale)).toBe("en");
    expect(resolveLanguage("fr", locale)).toBe("fr");
  });

  it("fait toujours primer un choix explicite et ignore les préférences inconnues", () => {
    expect(resolveLanguage("en", "fr-FR")).toBe("en");
    expect(languagePreference("de")).toBe("auto");
    expect(normalizeLocale("FR_ca")).toBe("fr-ca");
    expect(normalizeLocale("fr--FR")).toBeNull();
  });
});

describe("catalogues bilingues", () => {
  it.each(["constructor", "toString", "__proto__"])(
    "laisse intact un message inconnu nommé %s",
    (text) => {
      expect(localize(text, "en")).toBe(text);
    },
  );

  it("possède une traduction et les mêmes paramètres pour chaque message", () => {
    const params = (value: string) =>
      [...value.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((match) => match[1]).sort();
    for (const [source, target] of Object.entries(english)) {
      expect(target.trim(), source).not.toBe("");
      expect(params(target), source).toEqual(params(source));
    }
  });

  it("garde une traduction identique quand plusieurs vues partagent un message", () => {
    const seen = new Map<string, string>();
    for (const catalog of catalogs) {
      for (const [source, target] of Object.entries(catalog)) {
        if (seen.has(source)) expect(target, source).toBe(seen.get(source));
        seen.set(source, target);
      }
    }
  });

  it("traduit seulement les messages déclarés, en conservant intégralement leurs données", () => {
    const title = "Paiement « été » <script> {name}";
    expect(translate("Ouverture de « {name} »…", { name: title }, "en")).toBe(
      `Opening “${title}”…`,
    );
    expect(localize(`Ouverture de « ${title} »…`, "en")).toBe(`Opening “${title}”…`);
    expect(localize(`Mon texte Jira : ${title}`, "en")).toBe(`Mon texte Jira : ${title}`);
    expect(localize("Retour à Jira", "fr")).toBe("Retour à Jira");
  });

  it("traduit les causes imbriquées explicitement marquées, sans modifier le nom d'un ticket", () => {
    const source =
      "Objectifs du board Kanban indisponibles : Tickets rattachés aux objectifs : le schéma Atlassian n'expose pas de lien Goal → tickets exploitable";
    const translated = localize(source, "en");
    expect(translated).not.toContain("indisponibles");
    expect(translated).not.toContain("Tickets rattachés");
    expect(localize("Ouverture de « Retour à Jira »…", "en")).toBe("Opening “Retour à Jira”…");
  });
});
