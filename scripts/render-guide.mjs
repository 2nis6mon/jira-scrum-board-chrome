// Chaque manuel reste la source des fiches dans sa langue ; ce module porte leur présentation.
import { readFileSync } from "node:fs";
import { Marked } from "marked";
import { guideCardsByLanguage } from "../site/guide-content.mjs";

const languages = ["fr", "en", "es"];
const directoryFor = (language) => (language === "fr" ? "" : `${language}/`);
const privacyFor = (language) =>
  ({ fr: "confidentialite.html", en: "privacy.html", es: "privacidad.html" })[language];
const storeUrl = (language) =>
  `https://chromewebstore.google.com/detail/sprint-goals-board-pour-j/pepbknjnielcbfcoefcdmadmomapicgp?hl=${language}`;
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

const copy = {
  fr: {
    titleSuffix: "Le guide Sprint Goals",
    skip: "Aller au contenu",
    brand: "Sprint Goals, accueil",
    navigation: "Navigation principale",
    guide: "Le guide",
    product: "Le plugin",
    install: "Installer sur Chrome",
    newTab: "Chrome Web Store, nouvel onglet",
    language: "Langue",
    usefulLinks: "Liens utiles",
    all: "Toutes les fiches",
    privacy: "Confidentialité",
    tagline: "Une autre vue. Votre Jira.",
    enlargeLabel: "agrandir dans un nouvel onglet",
    enlarge: "Agrandir la capture",
    browse: "Parcourir les fiches",
    outline: "Les fiches du guide",
    open: "Ouvrir la fiche",
    homeTitle: "Le guide, à votre rythme",
    homeDescription:
      "Huit fiches simples pour installer Sprint Goals depuis le Chrome Web Store, connecter Jira et organiser votre board par objectifs.",
    heroEyebrow: "LE GUIDE SPRINT GOALS",
    heroTitle: "Les bons gestes.<br><span>Au bon endroit.</span>",
    heroDescription:
      "Du premier clic à votre prochaine Daily.<br>Une question, une fiche. À votre rythme.",
    heroNote: "Votre board. Votre cap.",
    explore: "EXPLOREZ LE GUIDE",
    need: "De quoi avez-vous besoin ?",
    search: "Rechercher dans les fiches",
    searchPlaceholder: "Un objectif, une couleur, un board…",
    searchClear: "Effacer la recherche",
    count: "8 fiches pour prendre vos repères",
    noMatch: "Aucune fiche ne correspond.",
    searchExamples: "Essayez « board », « objectif » ou « couleur ».",
    showAll: "Afficher toutes les fiches",
    firstBoard: "VOTRE PREMIER BOARD",
    firstTitle: "Un nouveau regard.<br>Trois premiers pas.",
    start: "Je commence",
    steps: [
      ["Installer dans Chrome", "Depuis la fiche officielle du Store."],
      ["Connecter votre Jira", "Votre session, vos droits."],
      ["Ouvrir votre board", "Vos objectifs prennent leur place."],
    ],
    previous: "← Fiche précédente",
    next: "Fiche suivante →",
    exploreLink: "Explorer le guide",
    guideLabel: "LE GUIDE",
    stillQuestion: "Une question reste ouverte ?",
    contact: "Contacter l’éditeur",
    breadcrumb: "Fil d’Ariane",
    inGuide: "Dans le guide",
    pagination: "Fiches précédente et suivante",
    endNote: "Les bons repères, au fil du travail.",
    screenshotNote:
      "Les captures utilisent des données fictives et montrent l’interface en français.",
  },
  en: {
    titleSuffix: "The Sprint Goals guide",
    skip: "Skip to content",
    brand: "Sprint Goals, home",
    navigation: "Main navigation",
    guide: "The guide",
    product: "The extension",
    install: "Add to Chrome",
    newTab: "Chrome Web Store, new tab",
    language: "Language",
    usefulLinks: "Useful links",
    all: "All guides",
    privacy: "Privacy",
    tagline: "A fresh view. Your Jira.",
    enlargeLabel: "enlarge in a new tab",
    enlarge: "Enlarge screenshot",
    browse: "Browse the guides",
    outline: "Guides",
    open: "Open the guide",
    homeTitle: "The guide, at your own pace",
    homeDescription:
      "Eight short guides to install Sprint Goals from the Chrome Web Store, connect Jira and organize your board around goals.",
    heroEyebrow: "THE SPRINT GOALS GUIDE",
    heroTitle: "The right steps.<br><span>In the right place.</span>",
    heroDescription:
      "From your first click to your next Daily.<br>One question, one guide. At your own pace.",
    heroNote: "Your board. Your direction.",
    explore: "EXPLORE THE GUIDE",
    need: "What do you need?",
    search: "Search the guides",
    searchPlaceholder: "A goal, a color, a board…",
    searchClear: "Clear search",
    count: "8 guides to help you get started",
    noMatch: "No guides match your search.",
    searchExamples: "Try “board”, “goal” or “color”.",
    showAll: "Show all guides",
    firstBoard: "YOUR FIRST BOARD",
    firstTitle: "A fresh perspective.<br>Three first steps.",
    start: "Get started",
    steps: [
      ["Add to Chrome", "From the official Store listing."],
      ["Connect your Jira", "Your session, your permissions."],
      ["Open your board", "Give your goals their place."],
    ],
    previous: "← Previous guide",
    next: "Next guide →",
    exploreLink: "Explore the guide",
    guideLabel: "THE GUIDE",
    stillQuestion: "Still have a question?",
    contact: "Contact the publisher",
    breadcrumb: "Breadcrumb",
    inGuide: "In this guide",
    pagination: "Previous and next guides",
    endNote: "The right guidance, as you work.",
    screenshotNote: "Screenshots use sample data and show the French interface.",
  },
  es: {
    titleSuffix: "La guía de Sprint Goals",
    skip: "Ir al contenido",
    brand: "Sprint Goals, inicio",
    navigation: "Navegación principal",
    guide: "La guía",
    product: "La extensión",
    install: "Añadir a Chrome",
    newTab: "Chrome Web Store, nueva pestaña",
    language: "Idioma",
    usefulLinks: "Enlaces útiles",
    all: "Todas las fichas",
    privacy: "Privacidad",
    tagline: "Otra perspectiva. Tu Jira.",
    enlargeLabel: "ampliar en una nueva pestaña",
    enlarge: "Ampliar la captura",
    browse: "Explorar las fichas",
    outline: "Fichas de la guía",
    open: "Abrir la ficha",
    homeTitle: "La guía, a tu ritmo",
    homeDescription:
      "Ocho fichas sencillas para instalar Sprint Goals desde Chrome Web Store, conectar Jira y organizar tu tablero por objetivos.",
    heroEyebrow: "LA GUÍA DE SPRINT GOALS",
    heroTitle: "Los pasos adecuados.<br><span>En el lugar indicado.</span>",
    heroDescription:
      "Desde el primer clic hasta tu próxima Daily.<br>Una pregunta, una ficha. A tu ritmo.",
    heroNote: "Tu tablero. Tu rumbo.",
    explore: "EXPLORA LA GUÍA",
    need: "¿Qué necesitas?",
    search: "Buscar en las fichas",
    searchPlaceholder: "Un objetivo, un color, un tablero…",
    searchClear: "Borrar la búsqueda",
    count: "8 fichas para empezar",
    noMatch: "Ninguna ficha coincide con tu búsqueda.",
    searchExamples: "Prueba con «tablero», «objetivo» o «color».",
    showAll: "Mostrar todas las fichas",
    firstBoard: "TU PRIMER TABLERO",
    firstTitle: "Una nueva perspectiva.<br>Tres primeros pasos.",
    start: "Empezar",
    steps: [
      ["Añadir a Chrome", "Desde la ficha oficial de la tienda."],
      ["Conectar tu Jira", "Tu sesión, tus permisos."],
      ["Abrir tu tablero", "Tus objetivos encuentran su lugar."],
    ],
    previous: "← Ficha anterior",
    next: "Ficha siguiente →",
    exploreLink: "Explorar la guía",
    guideLabel: "LA GUÍA",
    stillQuestion: "¿Te queda alguna duda?",
    contact: "Contactar con el editor",
    breadcrumb: "Ruta de navegación",
    inGuide: "En esta guía",
    pagination: "Fichas anterior y siguiente",
    endNote: "La orientación que necesitas, mientras trabajas.",
    screenshotNote: "Las capturas utilizan datos ficticios y muestran la interfaz en francés.",
  },
};

export const guidePaths = languages.flatMap((language) => {
  const directory = directoryFor(language);
  return [
    `${directory}guide.html`,
    ...guideCardsByLanguage[language].map((card) => `${directory}guide/${card.slug}.html`),
  ];
});

function layout({ title, description, content, language, slug }) {
  const text = copy[language];
  const article = Boolean(slug);
  const prefix = `${language !== "fr" ? "../" : ""}${article ? "../" : ""}`;
  const localPrefix = article ? "../" : "";
  const home = `${localPrefix}index.html${language === "fr" ? "?lang=fr" : ""}`;
  const path = article ? `guide/${slug}.html` : "guide.html";
  const alternatives = Object.fromEntries(
    languages.map((item) => [item, `${prefix}${directoryFor(item)}${path}`]),
  );
  const publicBase = "https://2nis6mon.github.io/jira-scrum-board-chrome/";
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b1026">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)} — ${text.titleSuffix}</title>
  <link rel="canonical" href="${publicBase}${directoryFor(language)}${path}">
  <link rel="alternate" hreflang="fr" href="${publicBase}${path}">
  <link rel="alternate" hreflang="en" href="${publicBase}en/${path}">
  <link rel="alternate" hreflang="es" href="${publicBase}es/${path}">
  <link rel="alternate" hreflang="x-default" href="${publicBase}en/${path}">
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${prefix}styles.css">
  <link rel="stylesheet" href="${prefix}guide.css">
  <link rel="stylesheet" href="${prefix}language.css">
  <script src="${prefix}language.js" defer></script>
  <script src="${prefix}guide.js" defer></script>
</head>
<body class="guide-page${article ? " guide-detail-page" : ""}">
  <a class="skip-link" href="#contenu">${text.skip}</a>
  <header class="site-header guide-header">
    <a class="brand" href="${home}" aria-label="${text.brand}"><img src="${prefix}assets/brand-mark.svg" width="36" height="36" alt=""><span>Sprint<span class="brand-light">Goals</span></span></a>
    <div class="guide-header-actions"><nav class="guide-top-links" aria-label="${text.navigation}"><a href="${localPrefix}guide.html"${article ? "" : ' aria-current="page"'}>${text.guide}</a><a class="guide-product-link" href="${home}">${text.product} <span aria-hidden="true">↗</span></a><a class="button button-small button-dark" href="${storeUrl(language)}" target="_blank" rel="noopener noreferrer" aria-label="${text.install} — ${text.newTab}">${text.install} <span aria-hidden="true">↗</span></a></nav><nav class="language-switch" aria-label="${text.language}">${languages.map((item) => `<a href="${alternatives[item]}" lang="${item}" hreflang="${item}" data-language="${item}"${item === language ? ' aria-current="page"' : ""}>${item.toUpperCase()}</a>`).join("")}</nav></div>
  </header>
  <main id="contenu">${content}</main>
  <footer class="guide-footer section-shell"><a class="brand" href="${home}"><img src="${prefix}assets/brand-mark.svg" width="28" height="28" alt=""><span>Sprint<span class="brand-light">Goals</span></span></a><nav aria-label="${text.usefulLinks}"><a href="${localPrefix}guide.html">${text.all}</a><a href="${localPrefix}${privacyFor(language)}">${text.privacy}</a><a href="mailto:denis.simon.consulting@gmail.com">${language === "es" ? "Contacto" : "Contact"} ↗</a></nav><small>${text.tagline}</small></footer>
</body>
</html>`;
}

function readSections(language) {
  const cards = guideCardsByLanguage[language];
  const source = language === "fr" ? "manuel-utilisateur.md" : `user-guide.${language}.md`;
  const markdown = readFileSync(new URL(`../docs/${source}`, import.meta.url), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  const headings = [...markdown.matchAll(/^## (.+)$/gm)];
  const sections = new Map(
    headings.map((heading, index) => [
      heading[1],
      markdown
        .slice(heading.index + heading[0].length, headings[index + 1]?.index ?? markdown.length)
        .trim(),
    ]),
  );
  if (sections.size !== cards.length || headings.length !== cards.length)
    throw new Error(
      `Le manuel ${language} doit contenir exactement une section par fiche du guide.`,
    );
  for (const card of cards) {
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(card.slug) || !sections.has(card.sourceHeading))
      throw new Error(`Fiche du guide ${language} invalide ou absente : ${card.slug}`);
  }
  if (new Set(cards.map((card) => card.slug)).size !== cards.length)
    throw new Error(`Identifiants de fiches dupliqués (${language}).`);
  return sections;
}

function renderBody(markdown, language) {
  const text = copy[language];
  const prefix = language !== "fr" ? "../../" : "../";
  const sectionsByAnchor = new Map(
    guideCardsByLanguage[language].map((card) => [anchor(card.sourceHeading), card.slug]),
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
      image({ href, text: alt }) {
        return `<a class="guide-image-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(alt)} — ${text.enlargeLabel}"><img src="${escapeHtml(href)}" alt="${escapeHtml(alt)}" width="1280" height="800" loading="lazy"><span>${text.enlarge} <span aria-hidden="true">↗</span></span></a>`;
      },
    },
    walkTokens(token) {
      if (token.type !== "link" && token.type !== "image") return;
      if (token.href.startsWith("store/captures/"))
        token.href = token.href.replace("store/captures/", `${prefix}assets/screenshots/`);
      else if (token.href === "privacy/index.html") token.href = `../${privacyFor(language)}`;
      else if (token.href.startsWith("#")) {
        const slug = sectionsByAnchor.get(decodeURIComponent(token.href.slice(1)));
        if (slug) token.href = `${slug}.html`;
      }
    },
  });
  return parser.parse(markdown);
}

function outline(card, language, mobile = false) {
  const text = copy[language];
  const links = guideCardsByLanguage[language]
    .map(
      (item) =>
        `<a href="${item.slug}.html"${item.slug === card.slug ? ' aria-current="page"' : ""}><span>${escapeHtml(item.number)}</span>${escapeHtml(item.title)}${item.slug === card.slug ? '<i aria-hidden="true">↗</i>' : ""}</a>`,
    )
    .join("");
  return `<nav class="guide-outline-links" aria-label="${mobile ? text.browse : text.outline}">${links}</nav>`;
}

function guideHome(sections, language) {
  const text = copy[language];
  const cards = guideCardsByLanguage[language]
    .map((card) => {
      const keywords =
        `${card.title} ${card.description} ${sections.get(card.sourceHeading)}`.replace(
          /!\[[^\]]*\]\([^)]*\)/g,
          "",
        );
      return `<a class="guide-card" data-guide-card data-guide-keywords="${escapeHtml(keywords)}" href="guide/${card.slug}.html"><div class="guide-card-meta"><span class="guide-card-icon">${icon(card.icon)}</span><span>${escapeHtml(card.number)} / ${escapeHtml(card.eyebrow)}</span></div><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.description)}</p><span class="guide-card-action">${text.open} <span aria-hidden="true">↗</span></span></a>`;
    })
    .join("\n");
  const steps = text.steps
    .map(
      ([title, description], index) =>
        `<li><span>0${index + 1}</span><a href="guide/${guideCardsByLanguage[language][index].slug}.html"><strong>${title}</strong><small>${description}</small></a></li>`,
    )
    .join("");
  return layout({
    language,
    title: text.homeTitle,
    description: text.homeDescription,
    content: `<section class="guide-hero section-shell"><p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> ${text.heroEyebrow}</p><h1>${text.heroTitle}</h1><div class="guide-hero-bottom"><p>${text.heroDescription}</p><span class="guide-hero-note"><span aria-hidden="true">◎</span> ${text.heroNote}</span></div></section>
    <section class="guide-library section-shell" aria-labelledby="fiches-title"><div class="guide-library-heading"><div><p class="eyebrow">${text.explore}</p><h2 id="fiches-title">${text.need}</h2></div><form class="guide-search" role="search"><label class="guide-sr-only" for="guide-search">${text.search}</label><span aria-hidden="true">⌕</span><input id="guide-search" data-guide-search type="search" placeholder="${text.searchPlaceholder}" autocomplete="off"><button data-guide-reset type="button" aria-label="${text.searchClear}" hidden>×</button></form></div><p class="guide-result-count" data-guide-count role="status" aria-live="polite">${text.count}</p><div class="guide-grid">${cards}</div><div class="guide-empty" data-guide-empty hidden><span aria-hidden="true">⌕</span><h3>${text.noMatch}</h3><p>${text.searchExamples}</p><button type="button" data-guide-show-all>${text.showAll} <span aria-hidden="true">↗</span></button></div></section>
    <section class="guide-start section-shell"><div class="guide-start-inner"><div><p class="eyebrow eyebrow-mint">${text.firstBoard}</p><h2>${text.firstTitle}</h2><a class="button button-mint" href="guide/demarrer.html">${text.start} <span aria-hidden="true">↗</span></a></div><ol>${steps}</ol></div></section>`,
  });
}

function guideArticle(card, index, body, language) {
  const text = copy[language];
  const cards = guideCardsByLanguage[language];
  const previous = cards[index - 1];
  const next = cards[index + 1];
  const stepLink = (item, direction) =>
    item
      ? `<a href="${item.slug}.html"><small>${direction === "prev" ? text.previous : text.next}</small><strong>${escapeHtml(item.title)}</strong></a>`
      : `<a href="../guide.html"><small>← ${text.exploreLink}</small><strong>${text.all}</strong></a>`;
  const screenshotNote = body.includes("store/captures/")
    ? `<p class="guide-screenshot-note">${text.screenshotNote}</p>`
    : "";
  return layout({
    language,
    slug: card.slug,
    title: card.title,
    description: card.description,
    content: `<div class="guide-reading-shell section-shell"><aside class="guide-sidebar"><a class="guide-back" href="../guide.html">← ${text.all}</a><p class="eyebrow">${text.guideLabel}</p>${outline(card, language)}<div class="guide-sidebar-help"><span aria-hidden="true">↗</span><p>${text.stillQuestion}</p><a href="mailto:denis.simon.consulting@gmail.com">${text.contact}</a></div></aside><div class="guide-reading"><nav class="guide-breadcrumb" aria-label="${text.breadcrumb}"><a href="../guide.html">${text.guide}</a><span aria-hidden="true">/</span><span>${escapeHtml(card.title)}</span></nav><details class="guide-mobile-outline"><summary>${text.inGuide} <span aria-hidden="true">↓</span></summary>${outline(card, language, true)}</details><article class="guide-article"><header class="guide-article-heading"><p class="eyebrow"><span class="guide-fiche-number">${escapeHtml(card.number)}</span> ${escapeHtml(card.eyebrow)}</p><h1>${escapeHtml(card.title)}</h1><p>${escapeHtml(card.description)}</p></header><div class="guide-prose">${screenshotNote}${renderBody(body, language)}</div></article><nav class="guide-pagination" aria-label="${text.pagination}">${stepLink(previous, "prev")}${stepLink(next, "next")}</nav><div class="guide-end-note"><span aria-hidden="true">◎</span><p>${text.endNote}</p><a href="../guide.html">${text.exploreLink} ↗</a></div></div></div>`,
  });
}

export function renderGuidePages() {
  return new Map(
    languages.flatMap((language) => {
      const sections = readSections(language);
      const directory = directoryFor(language);
      return [
        [`${directory}guide.html`, guideHome(sections, language)],
        ...guideCardsByLanguage[language].map((card, index) => [
          `${directory}guide/${card.slug}.html`,
          guideArticle(card, index, sections.get(card.sourceHeading), language),
        ]),
      ];
    }),
  );
}
