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

describe("manuel public bilingue", () => {
  it("génère les huit mêmes fiches et leur accueil dans les deux langues", () => {
    expect(pages.size).toBe(18);
    expect([...pages.keys()]).toEqual(guidePaths);
    for (const [path, html] of pages) {
      const english = path.startsWith("en/");
      const document = parse(html);
      expect(document.documentElement.lang).toBe(english ? "en" : "fr");
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(
        document.querySelector('meta[name="description"]')?.getAttribute("content"),
      ).toBeTruthy();
      if (path.endsWith("guide.html")) {
        expect(document.querySelectorAll("[data-guide-card]")).toHaveLength(8);
      } else {
        expect(document.querySelectorAll(".guide-prose h2").length).toBeGreaterThanOrEqual(2);
        const counterpart = documentFor(english ? path.slice(3) : `en/${path}`);
        expect(document.querySelectorAll(".guide-prose h2").length).toBe(
          counterpart.querySelectorAll(".guide-prose h2").length,
        );
      }
    }
  });

  it("change de langue sur la même fiche et conserve la langue dans la navigation", () => {
    for (const [path, html] of pages) {
      const document = parse(html);
      const english = path.startsWith("en/");
      const localPath = english ? path.slice(3) : path;
      for (const language of ["fr", "en"]) {
        const expected = `${base}${language === "en" ? "en/" : ""}${localPath}`;
        const link = document.querySelector<HTMLAnchorElement>(`[data-language="${language}"]`);
        expect(new URL(link?.getAttribute("href") ?? "", `${base}${path}`).href).toBe(expected);
        expect(link?.getAttribute("hreflang")).toBe(language);
        const alternative = document.querySelector(`link[rel="alternate"][hreflang="${language}"]`);
        expect(alternative?.getAttribute("href")).toBe(
          expected.replace("https://example.test/", "https://2nis6mon.github.io/"),
        );
      }
      expect(document.querySelector('link[hreflang="x-default"]')).not.toBeNull();
      for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        if (link.dataset.language) continue;
        const href = link.getAttribute("href") ?? "";
        if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
        const targetUrl = new URL(href, `${base}${path}`);
        const target = targetUrl.href;
        if (target.includes("/assets/")) continue;
        expect(target.startsWith(`${base}en/`), `${path} → ${href}`).toBe(english);
        const targetPath = targetUrl.pathname.slice(new URL(base).pathname.length);
        if (!english && targetPath === "index.html")
          expect(targetUrl.searchParams.get("lang"), `${path} → ${href}`).toBe("fr");
        expect(
          pages.has(targetPath) ||
            ["index.html", "en/index.html", "confidentialite.html", "en/privacy.html"].includes(
              targetPath,
            ),
          `${path} → ${href}`,
        ).toBe(true);
      }
    }
  });

  it("réutilise les mêmes captures sans dupliquer ni traduire les images", () => {
    for (const [path, html] of pages) {
      if (path.startsWith("en/")) continue;
      const french = parse(html);
      const english = documentFor(`en/${path}`);
      const sources = (document: Document, current: string) =>
        [...document.querySelectorAll(".guide-prose img")].map(
          (image) => new URL(image.getAttribute("src") ?? "", `${base}${current}`).href,
        );
      expect(sources(english, `en/${path}`)).toEqual(sources(french, path));
      if (sources(french, path).length) {
        expect(english.querySelector(".guide-screenshot-note")?.textContent).toContain(
          "French interface",
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
      "Card colours",
      "Excluded",
    ])
      expect(configuration).toContain(label);
    expect(configuration).toContain("not shared with");
    expect(configuration).toContain("without reloading the board");
    for (const html of pages.values()) {
      expect(html).not.toMatch(
        /github\.com\/2nis6mon|chrome:\/\/extensions|\.zip\b|Sprint Planning|Référence fonctionnelle|Functional reference/i,
      );
    }
  });

  it("cherche dans les fiches anglaises et annonce le résultat dans leur langue", () => {
    document.documentElement.lang = "en";
    document.body.innerHTML = documentFor("en/guide.html").body.innerHTML;
    const script = readFileSync(new URL("../site/guide.js", import.meta.url), "utf8");
    const run = new Function("document", "window", script);
    run(document, window);
    const input = document.querySelector<HTMLInputElement>("[data-guide-search]");
    if (!input) throw new Error("Recherche absente.");
    input.value = "interface language";
    input.dispatchEvent(new window.Event("input"));
    expect(document.querySelector("[data-guide-count]")?.textContent).toBe("1 guide found");
    const visible = [...document.querySelectorAll<HTMLElement>("[data-guide-card]")].filter(
      (card) => !card.hidden,
    );
    expect(visible[0]?.querySelector("h3")?.textContent).toBe("Configure the board");
    input.value = "unknown-unmatched-query";
    input.dispatchEvent(new window.Event("input"));
    expect(document.querySelector("[data-guide-count]")?.textContent).toBe("0 guides found");
    expect(document.querySelector<HTMLElement>("[data-guide-empty]")?.hidden).toBe(false);
    document.querySelector<HTMLButtonElement>("[data-guide-show-all]")?.click();
    expect(input.value).toBe("");
    expect(document.querySelector("[data-guide-count]")?.textContent).toBe(
      "8 guides to help you get started",
    );
  });
});
