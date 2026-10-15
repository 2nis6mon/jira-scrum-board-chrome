import { readFileSync } from "node:fs";
import {
  type Document,
  type HTMLAnchorElement,
  type HTMLButtonElement,
  type HTMLElement,
  type HTMLInputElement,
  Window,
} from "happy-dom";
import { afterAll, describe, expect, it } from "vitest";
import { guidePaths, renderGuidePages } from "../scripts/render-guide.mjs";

const window = new Window();
const document = window.document;
afterAll(() => window.happyDOM.close());
const pages = renderGuidePages();
const base = "https://example.test/jira-scrum-board-chrome/";
const parse = (html: string) => new window.DOMParser().parseFromString(html, "text/html");
const documentFor = (path: string) => {
  const html = pages.get(path);
  if (!html) throw new Error(`Fiche absente : ${path}`);
  return parse(html);
};

const languages = ["fr", "en", "es"];
const directory = (language: string) => (language === "fr" ? "" : `${language}/`);
const languageOf = (path: string) =>
  path.startsWith("en/") ? "en" : path.startsWith("es/") ? "es" : "fr";
const localPathOf = (path: string) => path.replace(/^(?:en|es)\//, "");

describe("manuel public trilingue", () => {
  it("génère les huit mêmes fiches et leur accueil dans les trois langues", () => {
    expect(pages.size).toBe(27);
    expect([...pages.keys()]).toEqual(guidePaths);
    for (const [path, html] of pages) {
      const language = languageOf(path);
      const document = parse(html);
      expect(document.documentElement.lang).toBe(language);
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(
        document.querySelector('meta[name="description"]')?.getAttribute("content"),
      ).toBeTruthy();
      if (path.endsWith("guide.html")) {
        expect(document.querySelectorAll("[data-guide-card]")).toHaveLength(8);
      } else {
        expect(document.querySelectorAll(".guide-prose h2").length).toBeGreaterThanOrEqual(2);
        const counterpart = documentFor(localPathOf(path));
        expect(document.querySelectorAll(".guide-prose h2").length).toBe(
          counterpart.querySelectorAll(".guide-prose h2").length,
        );
      }
    }
  });

  it("change de langue sur la même fiche et conserve la langue dans la navigation", () => {
    for (const [path, html] of pages) {
      const document = parse(html);
      const pageLanguage = languageOf(path);
      const localPath = localPathOf(path);
      expect(document.querySelectorAll("[data-language]")).toHaveLength(3);
      for (const language of languages) {
        const expected = `${base}${directory(language)}${localPath}`;
        const link = document.querySelector<HTMLAnchorElement>(`[data-language="${language}"]`);
        expect(new URL(link?.getAttribute("href") ?? "", `${base}${path}`).href).toBe(expected);
        expect(link?.getAttribute("hreflang")).toBe(language);
        expect(link?.getAttribute("aria-current")).toBe(language === pageLanguage ? "page" : null);
        const alternative = document.querySelector(`link[rel="alternate"][hreflang="${language}"]`);
        expect(alternative?.getAttribute("href")).toBe(
          expected.replace("https://example.test/", "https://2nis6mon.github.io/"),
        );
      }
      expect(document.querySelector('link[hreflang="x-default"]')?.getAttribute("href")).toBe(
        `https://2nis6mon.github.io/jira-scrum-board-chrome/en/${localPath}`,
      );
      for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        if (link.dataset.language) continue;
        const href = link.getAttribute("href") ?? "";
        if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
        const targetUrl = new URL(href, `${base}${path}`);
        const target = targetUrl.href;
        if (target.includes("/assets/")) continue;
        const targetPath = targetUrl.pathname.slice(new URL(base).pathname.length);
        expect(languageOf(targetPath), `${path} → ${href}`).toBe(pageLanguage);
        if (pageLanguage === "fr" && targetPath === "index.html")
          expect(targetUrl.searchParams.get("lang"), `${path} → ${href}`).toBe("fr");
        expect(
          pages.has(targetPath) ||
            [
              "index.html",
              "en/index.html",
              "es/index.html",
              "confidentialite.html",
              "en/privacy.html",
              "es/privacidad.html",
            ].includes(targetPath),
          `${path} → ${href}`,
        ).toBe(true);
      }
    }
  });

  it("réutilise les mêmes captures sans dupliquer ni traduire les images", () => {
    for (const [path, html] of pages) {
      if (languageOf(path) !== "fr") continue;
      const french = parse(html);
      const english = documentFor(`en/${path}`);
      const spanish = documentFor(`es/${path}`);
      const sources = (document: Document, current: string) =>
        [...document.querySelectorAll(".guide-prose img")].map(
          (image) => new URL(image.getAttribute("src") ?? "", `${base}${current}`).href,
        );
      expect(sources(english, `en/${path}`)).toEqual(sources(french, path));
      expect(sources(spanish, `es/${path}`)).toEqual(sources(french, path));
      if (sources(french, path).length) {
        expect(english.querySelector(".guide-screenshot-note")?.textContent).toContain(
          "French interface",
        );
        expect(spanish.querySelector(".guide-screenshot-note")?.textContent).toContain(
          "interfaz en francés",
        );
      }
    }
  });

  it("présente l'installation Store, les préférences de langue et les libellés anglais actuels", () => {
    const install = documentFor("en/guide/demarrer.html");
    const storeLink = install.querySelector<HTMLAnchorElement>(".guide-prose a");
    expect(storeLink?.getAttribute("href")).toContain("chromewebstore.google.com/detail/");
    expect(storeLink?.getAttribute("href")).toContain("?hl=en");
    const configuration = documentFor("en/guide/administration.html").querySelector(
      ".guide-prose",
    )?.textContent;
    for (const label of [
      "Automatic — follow Jira",
      "Personal preferences",
      "English",
      "Français",
      "Español",
      "Card colours",
      "Excluded",
    ])
      expect(configuration).toContain(label);
    expect(configuration).toContain("not shared with");
    expect(configuration).toContain("without reloading the board");
    expect(configuration).toContain("Spanish when your Jira is in Spanish");
    const spanish = documentFor("es/guide/administration.html").querySelector(
      ".guide-prose",
    )?.textContent;
    for (const label of [
      "Automático — seguir Jira",
      "Preferencias personales",
      "Español",
      "sin recargar el tablero",
      "ni se guarda en Jira",
    ])
      expect(spanish).toContain(label);
    expect(
      documentFor("es/guide/demarrer.html").querySelector(".guide-prose a")?.getAttribute("href"),
    ).toContain("?hl=es");
    for (const html of pages.values()) {
      expect(html).not.toMatch(
        /github\.com\/2nis6mon|chrome:\/\/extensions|\.zip\b|Sprint Planning|Référence fonctionnelle|Functional reference|Referencia funcional/i,
      );
    }
  });

  it.each([
    {
      language: "fr",
      query: "langue interface",
      found: "1 fiche trouvée",
      none: "0 fiches trouvées",
      all: "8 fiches pour prendre vos repères",
      title: "Configurer le board",
    },
    {
      language: "en",
      query: "interface language",
      found: "1 guide found",
      none: "0 guides found",
      all: "8 guides to help you get started",
      title: "Configure the board",
    },
    {
      language: "es",
      query: "IDIÓMA interfaz",
      found: "1 ficha encontrada",
      none: "0 fichas encontradas",
      all: "8 fichas para empezar",
      title: "Configurar el tablero",
    },
  ])(
    "cherche dans les fiches $language et annonce le résultat dans leur langue",
    ({ language, query, found, none, all, title }) => {
      document.documentElement.lang = language;
      document.body.innerHTML = documentFor(`${directory(language)}guide.html`).body.innerHTML;
      const script = readFileSync(new URL("../site/guide.js", import.meta.url), "utf8");
      const run = new Function("document", "window", script);
      run(document, window);
      const input = document.querySelector<HTMLInputElement>("[data-guide-search]");
      if (!input) throw new Error("Recherche absente.");
      input.value = query;
      input.dispatchEvent(new window.Event("input"));
      expect(document.querySelector("[data-guide-count]")?.textContent).toBe(found);
      const visible = [...document.querySelectorAll<HTMLElement>("[data-guide-card]")].filter(
        (card) => !card.hidden,
      );
      expect(visible[0]?.querySelector("h3")?.textContent).toBe(title);
      input.value = "unknown-unmatched-query";
      input.dispatchEvent(new window.Event("input"));
      expect(document.querySelector("[data-guide-count]")?.textContent).toBe(none);
      expect(document.querySelector<HTMLElement>("[data-guide-empty]")?.hidden).toBe(false);
      document.querySelector<HTMLButtonElement>("[data-guide-show-all]")?.click();
      expect(input.value).toBe("");
      expect(document.querySelector("[data-guide-count]")?.textContent).toBe(all);
    },
  );
});
