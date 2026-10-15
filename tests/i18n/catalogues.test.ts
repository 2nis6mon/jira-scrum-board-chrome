import { describe, expect, it } from "vitest";
import { catalogs, english, localize, spanish, translate } from "../../src/i18n";
import { spanishCatalogs } from "../../src/i18n/es";
import {
  languageLocale,
  languagePreference,
  normalizeLocale,
  resolveLanguage,
} from "../../src/i18n/language";

describe("langue de l'interface", () => {
  it.each(["fr", "fr-FR", "fr_FR", "fr-CA", " FR_be "])(
    "reconnaît le français Jira %s",
    (locale) => {
      expect(resolveLanguage("auto", locale)).toBe("fr");
    },
  );

  it.each(["en", "en_US", "de", "zh-Hans-CN", "", null, undefined, "french", "fr<script>", 4])(
    "se replie en anglais pour %s",
    (locale) => {
      expect(resolveLanguage("auto", locale)).toBe("en");
      expect(resolveLanguage("fr", locale)).toBe("fr");
    },
  );

  it("fait toujours primer un choix explicite et ignore les préférences inconnues", () => {
    expect(resolveLanguage("en", "fr-FR")).toBe("en");
    expect(languagePreference("de")).toBe("auto");
    expect(normalizeLocale("FR_ca")).toBe("fr-ca");
    expect(normalizeLocale("fr--FR")).toBeNull();
    expect(resolveLanguage("es", "fr-FR")).toBe("es");
    expect(languagePreference("es")).toBe("es");
    expect(languageLocale("es")).toBe("es-ES");
  });
  it.each(["es", "es-ES", "es_MX", "es-419", " ES_ar "])(
    "reconnaît l'espagnol Jira %s",
    (locale) => {
      expect(resolveLanguage("auto", locale)).toBe("es");
      expect(resolveLanguage("en", locale)).toBe("en");
      expect(resolveLanguage("fr", locale)).toBe("fr");
    },
  );
});

describe("catalogues multilingues", () => {
  it.each(["constructor", "toString", "__proto__"])(
    "laisse intact un message inconnu nommé %s",
    (text) => {
      expect(localize(text, "en")).toBe(text);
      expect(localize(text, "es")).toBe(text);
    },
  );

  it("possède une traduction et les mêmes paramètres pour chaque message", () => {
    const params = (value: string) =>
      [...value.matchAll(/\{([a-zA-Z]\w*)\}/g)].map((match) => match[1]).sort();
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
    for (const dictionary of [english, spanish]) {
      for (const [source, target] of Object.entries(dictionary)) {
        expect(target.trim(), source).not.toBe("");
        expect(params(target), source).toEqual(params(source));
      }
    }
  });

  it("garde une traduction identique quand plusieurs vues partagent un message", () => {
    for (const collection of [catalogs, spanishCatalogs]) {
      const seen = new Map<string, string>();
      for (const catalog of collection) {
        for (const [source, target] of Object.entries(catalog)) {
          if (seen.has(source)) expect(target, source).toBe(seen.get(source));
          seen.set(source, target);
        }
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
  it("traduit les causes en espagnol tout en conservant titres, clés et paramètres Jira", () => {
    const title = "Retour à Jira <script> {name} ABC-1";
    const translated = translate("Ouverture de « {name} »…", { name: title }, "es");
    expect(translated).toBe(`Abriendo «${title}»…`);
    expect(localize(`Ouverture de « ${title} »…`, "es")).toBe(translated);
    expect(localize(`Mon texte Jira : ${title}`, "es")).toBe(`Mon texte Jira : ${title}`);
    const failure = localize(
      "Objectifs du board Kanban indisponibles : Tickets rattachés aux objectifs : le schéma Atlassian n'expose pas de lien Goal → tickets exploitable",
      "es",
    );
    expect(failure).not.toMatch(/indisponibles|Tickets rattachés|exploitable/);
    expect(failure).toContain("Atlassian");
  });
});
