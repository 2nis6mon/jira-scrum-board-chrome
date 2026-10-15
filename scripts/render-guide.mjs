// Le Markdown reste la source unique des fiches ; ce module porte leur présentation.
import { readFileSync } from "node:fs";
import { Marked } from "marked";
import { guideCards } from "../site/guide-content.mjs";

const storeUrl =
  "https://chromewebstore.google.com/detail/sprint-goals-board-pour-j/pepbknjnielcbfcoefcdmadmomapicgp?hl=fr";
const escapeHtml = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const anchor = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/\s/g, "-");
const symbols = {
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  boards:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M6 8v3m6-3v6m6-6v3"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sliders:
    '<path d="M3 6h7m5 0h6M3 12h2m5 0h11M3 18h11m5 0h2"/><circle cx="12" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 3a6 6 0 0 1 2 4v3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3h.01"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] ?? symbols.help}</svg>`;

export const guidePaths = ["guide.html", ...guideCards.map((card) => `guide/${card.slug}.html`)];

function layout({ title, description, content, prefix = "", article = false }) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b1026">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} — Le guide Sprint Goals</title>
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${prefix}styles.css">
  <link rel="stylesheet" href="${prefix}guide.css">
  <script src="${prefix}guide.js" defer></script>
</head>
<body class="guide-page${article ? " guide-detail-page" : ""}">
  <a class="skip-link" href="#contenu">Aller au contenu</a>
  <header class="site-header guide-header">
    <a class="brand" href="${prefix}index.html" aria-label="Sprint Goals, accueil"><img src="${prefix}assets/brand-mark.svg" width="36" height="36" alt=""><span>Sprint<span class="brand-light">Goals</span></span></a>
    <nav class="guide-top-links" aria-label="Navigation principale"><a href="${prefix}guide.html"${article ? "" : ' aria-current="page"'}>Le guide</a><a class="guide-product-link" href="${prefix}index.html">Le plugin <span aria-hidden="true">↗</span></a><a class="button button-small button-dark" href="${storeUrl}" target="_blank" rel="noopener noreferrer" aria-label="Installer sur Chrome — Chrome Web Store, nouvel onglet">Installer sur Chrome <span aria-hidden="true">↗</span></a></nav>
  </header>
  <main id="contenu">${content}</main>
  <footer class="guide-footer section-shell"><a class="brand" href="${prefix}index.html"><img src="${prefix}assets/brand-mark.svg" width="28" height="28" alt=""><span>Sprint<span class="brand-light">Goals</span></span></a><nav aria-label="Liens utiles"><a href="${prefix}guide.html">Toutes les fiches</a><a href="${prefix}confidentialite.html">Confidentialité</a><a href="mailto:denis.simon.consulting@gmail.com">Contact ↗</a></nav><small>Une autre vue. Votre Jira.</small></footer>
</body>
</html>`;
}

function readSections() {
  const markdown = readFileSync(
    new URL("../docs/manuel-utilisateur.md", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const headings = [...markdown.matchAll(/^## (.+)$/gm)];
  const sections = new Map(
    headings.map((heading, index) => [
      heading[1],
      markdown
        .slice(heading.index + heading[0].length, headings[index + 1]?.index ?? markdown.length)
        .trim(),
    ]),
  );
  if (sections.size !== guideCards.length || headings.length !== guideCards.length)
    throw new Error("Le manuel doit contenir exactement une section par fiche du guide.");
  for (const card of guideCards) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(card.slug) || !sections.has(card.sourceHeading))
      throw new Error(`Fiche du guide invalide ou absente : ${card.slug}`);
  }
  if (new Set(guideCards.map((card) => card.slug)).size !== guideCards.length)
    throw new Error("Identifiants de fiches dupliqués.");
  return sections;
}

function renderBody(markdown) {
  const sectionsByAnchor = new Map(
    guideCards.map((card) => [anchor(card.sourceHeading), card.slug]),
  );
  const ids = new Map();
  const parser = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const base = anchor(text.replace(/<[^>]+>/g, ""));
        const count = ids.get(base) ?? 0;
        ids.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        const level = Math.max(2, depth - 1);
        return `<h${level} id="${escapeHtml(id)}">${text}</h${level}>\n`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      image({ href, text }) {
        return `<a class="guide-image-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(text)} — agrandir dans un nouvel onglet"><img src="${escapeHtml(href)}" alt="${escapeHtml(text)}" width="1280" height="800" loading="lazy"><span>Agrandir la capture <span aria-hidden="true">↗</span></span></a>`;
      },
    },
    walkTokens(token) {
      if (token.type !== "link" && token.type !== "image") return;
      if (token.href.startsWith("store/captures/"))
        token.href = token.href.replace("store/captures/", "../assets/screenshots/");
      else if (token.href === "privacy/index.html") token.href = "../confidentialite.html";
      else if (token.href.startsWith("#")) {
        const slug = sectionsByAnchor.get(decodeURIComponent(token.href.slice(1)));
        if (slug) token.href = `${slug}.html`;
      }
    },
  });
  return parser.parse(markdown);
}

function outline(card, mobile = false) {
  const links = guideCards
    .map(
      (item) =>
        `<a href="${item.slug}.html"${item.slug === card.slug ? ' aria-current="page"' : ""}><span>${escapeHtml(item.number)}</span>${escapeHtml(item.title)}${item.slug === card.slug ? '<i aria-hidden="true">↗</i>' : ""}</a>`,
    )
    .join("");
  return `<nav class="guide-outline-links" aria-label="${mobile ? "Parcourir les fiches" : "Les fiches du guide"}">${links}</nav>`;
}

function guideHome(sections) {
  const cards = guideCards
    .map((card) => {
      const keywords =
        `${card.title} ${card.description} ${sections.get(card.sourceHeading)}`.replace(
          /!\[[^\]]*\]\([^)]*\)/g,
          "",
        );
      return `<a class="guide-card" data-guide-card data-guide-keywords="${escapeHtml(keywords)}" href="guide/${card.slug}.html"><div class="guide-card-meta"><span class="guide-card-icon">${icon(card.icon)}</span><span>${escapeHtml(card.number)} / ${escapeHtml(card.eyebrow)}</span></div><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description)}</p><span class="guide-card-action">Ouvrir la fiche <span aria-hidden="true">↗</span></span></a>`;
    })
    .join("\n");
  return layout({
    title: "Le guide, à votre rythme",
    description:
      "Huit fiches simples pour installer Sprint Goals depuis le Chrome Web Store, connecter Jira et organiser votre board par objectifs.",
    content: `<section class="guide-hero section-shell"><p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> LE GUIDE SPRINT GOALS</p><h1>Les bons gestes.<br><span>Au bon endroit.</span></h1><div class="guide-hero-bottom"><p>Du premier clic à votre prochaine Daily.<br>Une question, une fiche. À votre rythme.</p><span class="guide-hero-note"><span aria-hidden="true">◎</span> Votre board. Votre cap.</span></div></section>
    <section class="guide-library section-shell" aria-labelledby="fiches-title"><div class="guide-library-heading"><div><p class="eyebrow">EXPLOREZ LE GUIDE</p><h2 id="fiches-title">De quoi avez-vous besoin ?</h2></div><form class="guide-search" role="search"><label class="guide-sr-only" for="guide-search">Rechercher dans les fiches</label><span aria-hidden="true">⌕</span><input id="guide-search" data-guide-search type="search" placeholder="Un objectif, une couleur, un board…" autocomplete="off"><button data-guide-reset type="button" aria-label="Effacer la recherche" hidden>×</button></form></div><p class="guide-result-count" data-guide-count role="status" aria-live="polite">8 fiches pour prendre vos repères</p><div class="guide-grid">${cards}</div><div class="guide-empty" data-guide-empty hidden><span aria-hidden="true">⌕</span><h3>Aucune fiche ne correspond.</h3><p>Essayez « board », « objectif » ou « couleur ».</p><button type="button" data-guide-show-all>Afficher toutes les fiches <span aria-hidden="true">↗</span></button></div></section>
    <section class="guide-start section-shell"><div class="guide-start-inner"><div><p class="eyebrow eyebrow-mint">VOTRE PREMIER BOARD</p><h2>Un nouveau regard.<br>Trois premiers pas.</h2><a class="button button-mint" href="guide/demarrer.html">Je commence <span aria-hidden="true">↗</span></a></div><ol><li><span>01</span><a href="guide/demarrer.html"><strong>Installer dans Chrome</strong><small>Depuis la fiche officielle du Store.</small></a></li><li><span>02</span><a href="guide/connecter-jira.html"><strong>Connecter votre Jira</strong><small>Votre session, vos droits.</small></a></li><li><span>03</span><a href="guide/ajouter-board.html"><strong>Ouvrir votre board</strong><small>Vos objectifs prennent leur place.</small></a></li></ol></div></section>`,
  });
}

function guideArticle(card, index, body) {
  const prev = guideCards[index - 1];
  const next = guideCards[index + 1];
  const stepLink = (item, direction) =>
    item
      ? `<a href="${item.slug}.html"><small>${direction === "prev" ? "← Fiche précédente" : "Fiche suivante →"}</small><strong>${escapeHtml(item.title)}</strong></a>`
      : '<a href="../guide.html"><small>← Explorer le guide</small><strong>Toutes les fiches</strong></a>';
  return layout({
    title: card.title,
    description: card.description,
    prefix: "../",
    article: true,
    content: `<div class="guide-reading-shell section-shell"><aside class="guide-sidebar"><a class="guide-back" href="../guide.html">← Toutes les fiches</a><p class="eyebrow">LE GUIDE</p>${outline(card)}<div class="guide-sidebar-help"><span aria-hidden="true">↗</span><p>Une question reste ouverte ?</p><a href="mailto:denis.simon.consulting@gmail.com">Contacter l’éditeur</a></div></aside><div class="guide-reading"><nav class="guide-breadcrumb" aria-label="Fil d’Ariane"><a href="../guide.html">Le guide</a><span aria-hidden="true">/</span><span>${escapeHtml(card.title)}</span></nav><details class="guide-mobile-outline"><summary>Dans le guide <span aria-hidden="true">↓</span></summary>${outline(card, true)}</details><article class="guide-article"><header class="guide-article-heading"><p class="eyebrow"><span class="guide-fiche-number">${escapeHtml(card.number)}</span> ${escapeHtml(card.eyebrow)}</p><h1>${escapeHtml(card.title)}</h1><p>${escapeHtml(card.description)}</p></header><div class="guide-prose">${renderBody(body)}</div></article><nav class="guide-pagination" aria-label="Fiches précédente et suivante">${stepLink(prev, "prev")}${stepLink(next, "next")}</nav><div class="guide-end-note"><span aria-hidden="true">◎</span><p>Les bons repères, au fil du travail.</p><a href="../guide.html">Explorer le guide ↗</a></div></div></div>`,
  });
}

export function renderGuidePages() {
  const sections = readSections();
  return new Map([
    ["guide.html", guideHome(sections)],
    ...guideCards.map((card, index) => [
      `guide/${card.slug}.html`,
      guideArticle(card, index, sections.get(card.sourceHeading)),
    ]),
  ]);
}
