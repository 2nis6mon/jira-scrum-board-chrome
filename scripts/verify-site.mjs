// Site statique local, Chrome vierge et réseau limité au serveur de prévisualisation.
// Construire d'abord avec site:build ; aucune extension ni session Jira n'est ouverte.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";
import { startPreviewServer } from "./preview-site.mjs";

const output = fileURLToPath(new URL("../.vite/", import.meta.url));
const chromeStore =
  "https://chromewebstore.google.com/detail/sprint-goals-board-pour-j/pepbknjnielcbfcoefcdmadmomapicgp?hl=fr";
const guidePages = [
  "demarrer",
  "connecter-jira",
  "ajouter-board",
  "utiliser-board",
  "objectifs",
  "administration",
  "daily",
  "aide",
].map((name) => `guide/${name}.html`);
mkdirSync(output, { recursive: true });
rmSync(`${output}site-preview-failure.png`, { force: true });
const server = await startPreviewServer({ port: 0 });
const origin = new URL(server.url).origin;
let browser;
try {
  browser = launchIsolatedBrowser("1440,1000");
} catch (error) {
  await server.close();
  throw error;
}
const { send, evaluate, waitFor, events } = browser;
const sessions = new Set();
const blocked = [];
const interceptionErrors = [];
let inspectedSession;
let eventIndex = 0;
let handlingRequests = false;
const pump = setInterval(async () => {
  if (handlingRequests) return;
  handlingRequests = true;
  try {
    while (eventIndex < events.length) {
      const event = events[eventIndex++];
      if (event.method !== "Fetch.requestPaused" || !sessions.has(event.sessionId)) continue;
      const { request, requestId } = event.params;
      const target = new URL(request.url);
      const allowed = target.origin === origin || target.protocol === "data:";
      if (!allowed) blocked.push(request.url);
      const method = allowed ? "Fetch.continueRequest" : "Fetch.failRequest";
      try {
        await send(
          method,
          allowed ? { requestId } : { requestId, errorReason: "BlockedByClient" },
          event.sessionId,
        );
      } catch (error) {
        // Une navigation peut annuler une ressource avant sa reprise. Son identifiant
        // n'existe alors plus ; une tentative externe reste enregistrée dans blocked.
        if (error.message !== `${method} : Invalid InterceptionId.`) throw error;
      }
    }
  } catch (error) {
    interceptionErrors.push(error.message);
  } finally {
    handlingRequests = false;
  }
}, 10);

function checked(condition, message) {
  assert.ok(condition, message);
  console.log(`✓ ${message}`);
}

async function createPage(width, height, reducedMotion = false) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  sessions.add(sessionId);
  inspectedSession = sessionId;
  for (const domain of ["Page", "Runtime", "Log", "Network"]) {
    await send(`${domain}.enable`, {}, sessionId);
  }
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
  await resize(sessionId, width, height);
  await send(
    "Emulation.setEmulatedMedia",
    {
      features: [
        { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" },
      ],
    },
    sessionId,
  );
  return sessionId;
}

async function resize(session, width, height) {
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: width < 600 },
    session,
  );
}

async function navigate(session, path = "index.html?lang=fr") {
  const url = new URL(path, server.url).href;
  const response = await fetch(url, { redirect: "error" });
  checked(response.status === 200, `${new URL(url).pathname} répond 200`);
  await response.arrayBuffer();
  await browser.navigateToHarness(session, url);
  await waitFor(
    session,
    `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && !!document.querySelector('main')`,
    `La page ${path || "d’accueil"} est prête`,
  );
  await evaluate(session, "document.fonts.ready.then(() => true)");
}

async function click(session, selector) {
  await waitFor(session, `!!document.querySelector(${JSON.stringify(selector)})`, selector);
  const point = await evaluate(
    session,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element.scrollIntoView({block:'center', behavior:'instant'});
      const rect = element.getBoundingClientRect();
      return {x:rect.x + rect.width / 2, y:rect.y + rect.height / 2};
    })()`,
  );
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send(
      "Input.dispatchMouseEvent",
      { type, ...point, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 },
      session,
    );
  }
}

async function key(session, value, code, virtualKey) {
  for (const type of ["keyDown", "keyUp"]) {
    await send(
      "Input.dispatchKeyEvent",
      {
        type,
        key: value,
        code,
        windowsVirtualKeyCode: virtualKey,
        ...(type === "keyDown" && value === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
      },
      session,
    );
  }
}

async function noOverflow(session, label) {
  const layout = await evaluate(
    session,
    `(() => {
      const root = document.documentElement;
      const top=window.scrollY;
      window.scrollTo({left:root.scrollWidth,top,behavior:'instant'});
      const horizontalScroll=window.scrollX;
      window.scrollTo({left:0,top,behavior:'instant'});
      return {width:root.clientWidth, content:root.scrollWidth, body:document.body.scrollWidth, horizontalScroll,
        overflowing:[...document.querySelectorAll('main *')].filter(element => {
          const r = element.getBoundingClientRect();
          return r.width > 0 && (r.left < -1 || r.right > root.clientWidth + 1);
        }).slice(0,5).map(element => element.tagName + '.' + element.className)};
    })()`,
  );
  checked(
    layout.content <= layout.width + 1 && layout.horizontalScroll === 0,
    `${label} sans débordement horizontal ${JSON.stringify(layout)}`,
  );
}

async function screenshot(session, name, selector) {
  await evaluate(
    session,
    selector
      ? `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`
      : "window.scrollTo({top:0,left:0,behavior:'instant'})",
  );
  await waitFor(
    session,
    `[...document.images].filter(image => {
      const r=image.getBoundingClientRect();
      return r.width>0 && r.bottom>0 && r.top<innerHeight;
    }).every(image => image.complete && image.naturalWidth>0)`,
    "Les images visibles sont chargées avant la capture",
  );
  await evaluate(
    session,
    "document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))",
  );
  await evaluate(
    session,
    "Promise.all(document.getAnimations().filter(animation => animation.playState === 'running' && Number.isFinite(animation.effect.getTiming().iterations)).map(animation => animation.finished.then(() => true, () => false)))",
  );
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 }, session);
  const { data } = await send(
    "Page.captureScreenshot",
    { format: "png", fromSurface: true, captureBeyondViewport: false },
    session,
  );
  writeFileSync(`${output}${name}`, Buffer.from(data, "base64"));
  console.log(`Capture : .vite/${name}`);
}

async function checkPageImages(session) {
  const images = await evaluate(
    session,
    "[...document.images].map(image => ({src:image.currentSrc || image.src,alt:image.getAttribute('alt')}))",
  );
  for (const { src, alt } of images) {
    assert.notEqual(alt, null, `Texte alternatif absent : ${src}`);
    const url = new URL(src);
    assert.equal(url.origin, origin, `Image externe : ${src}`);
    const response = await fetch(src, { redirect: "error" });
    assert.equal(response.status, 200, `Image introuvable : ${src}`);
    assert.match(response.headers.get("content-type") ?? "", /^image\//, `Image invalide : ${src}`);
    await response.arrayBuffer();
  }
  checked(images.length > 0, "Les images locales et leurs textes alternatifs sont présents");
}

async function checkStoreLinks(session, minimum = 1) {
  const language = await evaluate(session, "document.documentElement.lang");
  const links = await evaluate(
    session,
    `([...document.querySelectorAll('a[href]')].map(link => ({
      href:link.href,target:link.target,rel:link.rel,cta:link.classList.contains('button'),
      name:link.getAttribute('aria-label') || link.textContent.trim()
    })))`,
  );
  checked(
    !links.some((link) => new URL(link.href).hostname === "github.com"),
    "Aucun lien du site public ne renvoie au dépôt privé",
  );
  const storeLinks = links.filter(
    (link) => new URL(link.href).hostname === "chromewebstore.google.com",
  );
  checked(storeLinks.length >= minimum, "L’installation est accessible depuis le Chrome Web Store");
  for (const link of storeLinks) {
    assert.equal(
      link.href,
      chromeStore.replace("hl=fr", `hl=${language}`),
      "Le lien doit viser la fiche Store dans la langue de la page",
    );
    if (link.cta || link.target === "_blank") {
      assert.equal(link.target, "_blank", "Le bouton Store ouvre la fiche dans un nouvel onglet");
      assert.ok(link.rel.split(/\s+/).includes("noopener"), "Le nouvel onglet est isolé");
    }
    assert.ok(link.name, "Le lien d’installation possède un nom accessible");
  }
}

async function checkGuide(session, language = "fr") {
  const prefix = language === "fr" ? "" : `${language}/`;
  const localizedPages = guidePages.map((path) => `${prefix}${path}`);
  await navigate(session, `${prefix}guide.html`);
  await checkStoreLinks(session);
  await noOverflow(session, "Accueil du guide 390 px");
  await screenshot(session, `site-guide-${language}-mobile.png`);
  await resize(session, 1440, 1000);
  await noOverflow(session, "Accueil du guide 1440 px");
  const cards = await evaluate(
    session,
    "[...document.querySelectorAll('[data-guide-card]')].map(link => link.href)",
  );
  assert.deepEqual(
    [...cards].sort(),
    localizedPages.map((path) => new URL(path, server.url).href).sort(),
    "Le guide présente exactement les huit fiches prévues",
  );
  checked(
    await evaluate(
      session,
      "document.querySelector('[data-guide-count]')?.getAttribute('aria-live') === 'polite'",
    ),
    "Le nombre de résultats de recherche est annoncé de manière accessible",
  );
  await screenshot(session, `site-guide-${language}-desktop.png`);
  const visibleCards =
    "[...document.querySelectorAll('[data-guide-card]')].filter(card => !card.hidden)";
  await click(session, "[data-guide-search]");
  await send("Input.insertText", { text: "Daily" }, session);
  await waitFor(
    session,
    `${visibleCards}.length > 0 && ${visibleCards}.length < 8 && ${visibleCards}.some(card => card.href.endsWith('/guide/daily.html'))`,
    "La recherche retrouve la fiche Daily",
  );
  checked(
    await evaluate(
      session,
      `parseInt(document.querySelector('[data-guide-count]').textContent,10) === ${visibleCards}.length`,
    ),
    "Le compteur suit les résultats filtrés",
  );
  await send("Input.insertText", { text: " zzz-sans-resultat" }, session);
  await waitFor(
    session,
    `${visibleCards}.length === 0 && !document.querySelector('[data-guide-empty]').hidden`,
    "Une recherche sans résultat affiche une explication",
  );
  await click(session, "[data-guide-reset]");
  await waitFor(
    session,
    `${visibleCards}.length === 8 && document.querySelector('[data-guide-search]').value === '' && document.querySelector('[data-guide-empty]').hidden`,
    "Réinitialiser retrouve les huit fiches",
  );
  await click(session, "[data-guide-card][href$='demarrer.html']");
  await waitFor(
    session,
    "location.pathname.endsWith('/guide/demarrer.html') && !!document.querySelector('article.guide-article h1')",
    "Une carte du guide ouvre réellement sa fiche",
  );

  const titles = new Set();
  for (const path of localizedPages) {
    await navigate(session, path);
    await resize(session, 1440, 1000);
    const article = await evaluate(
      session,
      `(() => ({
        title:document.querySelector('article.guide-article h1')?.textContent.trim(),
        current:[...document.querySelectorAll('a[aria-current="page"]:not([data-language])')].map(link => link.href),
        hub:[...document.querySelectorAll('a[href]')].some(link => link.href === ${JSON.stringify(new URL(`${prefix}guide.html`, server.url).href)}),
        language:document.documentElement.lang,
        text:document.body.innerText
      }))()`,
    );
    assert.ok(article.title, `La fiche ${path} possède un titre principal`);
    assert.equal(article.language, language, "La fiche est dans la langue choisie");
    titles.add(article.title);
    assert.ok(article.hub, `La fiche ${path} permet de revenir au guide`);
    assert.ok(article.current.length > 0, `La fiche ${path} est indiquée dans la navigation`);
    for (const href of article.current) {
      assert.equal(
        href,
        new URL(path, server.url).href,
        "La navigation marque la bonne fiche active",
      );
    }
    assert.doesNotMatch(
      article.text,
      /Sprint Planning/i,
      "Le guide public décrit la version distribuée",
    );
    await checkStoreLinks(session);
    await checkPageImages(session);
    await noOverflow(session, `${path} 1440 px`);
    if (path === localizedPages[0])
      await screenshot(session, `site-guide-article-${language}-desktop.png`);
    await resize(session, 390, 844);
    await noOverflow(session, `${path} 390 px`);
    if (path !== localizedPages[0]) continue;
    await screenshot(session, `site-guide-article-${language}-mobile.png`);
    const summary = await evaluate(
      session,
      "document.querySelector('details.guide-mobile-outline summary')?.textContent.trim()",
    );
    checked(summary?.length > 0, "Le guide propose une commande de navigation mobile nommée");
    await click(session, "details.guide-mobile-outline summary");
    await waitFor(
      session,
      "document.querySelector('details.guide-mobile-outline').open",
      "La navigation des fiches s’ouvre",
    );
    await key(session, "Enter", "Enter", 13);
    await waitFor(
      session,
      "!document.querySelector('details.guide-mobile-outline').open",
      "Le clavier referme la navigation",
    );
    await key(session, "Enter", "Enter", 13);
    await waitFor(
      session,
      "document.querySelector('details.guide-mobile-outline').open",
      "Le clavier ouvre la navigation",
    );
    await noOverflow(session, "Navigation des fiches ouverte à 390 px");
    await click(session, "details.guide-mobile-outline a[href$='connecter-jira.html']");
    await waitFor(
      session,
      "location.pathname.endsWith('/guide/connecter-jira.html') && !!document.querySelector('article.guide-article h1')",
      "La navigation mobile ouvre une autre fiche",
    );
  }
  checked(
    titles.size === 8,
    "Les huit fiches ont un contenu identifié et une navigation cohérente",
  );
}

async function checkLanguageNavigation(session) {
  await resize(session, 1440, 1000);
  await navigate(session, "en/guide/administration.html");
  await click(session, 'a[data-language="fr"]');
  await waitFor(
    session,
    "location.pathname.endsWith('/guide/administration.html') && !location.pathname.includes('/en/') && document.documentElement.lang === 'fr' && document.readyState === 'complete'",
    "Changer de langue conserve la fiche administration",
  );
  assert.equal(await evaluate(session, "localStorage.getItem('sprint-goals-site-language')"), "fr");
  await click(session, 'a[data-language="en"]');
  await waitFor(
    session,
    "location.pathname.endsWith('/en/guide/administration.html') && document.documentElement.lang === 'en' && document.readyState === 'complete'",
    "Le retour anglais retrouve la même fiche",
  );
  await browser.navigateToHarness(session, server.url);
  await waitFor(
    session,
    "location.pathname.endsWith('/en/index.html') && document.readyState === 'complete'",
    "L’accueil mémorise le choix anglais",
  );
  await navigate(session, "en/guide/administration.html");
  await click(session, 'a[data-language="es"]');
  await waitFor(
    session,
    "location.pathname.endsWith('/es/guide/administration.html') && document.documentElement.lang === 'es' && document.readyState === 'complete'",
    "La fiche équivalente est disponible en espagnol",
  );
  assert.equal(await evaluate(session, "localStorage.getItem('sprint-goals-site-language')"), "es");
  await browser.navigateToHarness(session, server.url);
  await waitFor(
    session,
    "location.pathname.endsWith('/es/index.html') && document.readyState === 'complete'",
    "L’accueil mémorise le choix espagnol",
  );
  await navigate(session, "guide/administration.html");
  assert.equal(
    await evaluate(session, "document.documentElement.lang"),
    "fr",
    "Un lien direct français est respecté malgré la préférence anglaise",
  );
  await click(session, '.guide-header a[href$="index.html?lang=fr"]');
  await waitFor(
    session,
    "document.documentElement.lang === 'fr' && location.search.includes('lang=fr') && document.readyState === 'complete'",
    "Le retour au site depuis une fiche française conserve le français",
  );
  await evaluate(session, "localStorage.removeItem('sprint-goals-site-language')");
  for (const [locale, expected] of [
    ["fr-CA", "fr"],
    ["es-MX", "es"],
    ["es-419", "es"],
    ["de-DE", "en"],
  ]) {
    const { identifier } = await send(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source: `Object.defineProperty(navigator, 'language', {get: () => ${JSON.stringify(locale)}});`,
      },
      session,
    );
    await browser.navigateToHarness(session, server.url);
    await waitFor(
      session,
      `document.readyState === 'complete' && document.documentElement.lang === '${expected}'`,
      `Accueil automatique ${locale} → ${expected}`,
    );
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier }, session);
    await evaluate(session, "localStorage.removeItem('sprint-goals-site-language')");
  }
  const { identifier } = await send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source:
        "Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('Blocked', 'SecurityError'); }});",
    },
    session,
  );
  await navigate(session, "en/index.html");
  await click(session, 'a[data-language="fr"]');
  await waitFor(
    session,
    "document.documentElement.lang === 'fr' && location.search.includes('lang=fr') && document.readyState === 'complete'",
    "Le choix explicite fonctionne même sans stockage local",
  );
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier }, session);
  await send("Emulation.setScriptExecutionDisabled", { value: true }, session);
  try {
    await navigate(session, "es/guide/demarrer.html");
    await click(session, 'a[data-language="fr"]');
    await waitFor(
      session,
      "document.documentElement.lang === 'fr' && location.pathname.endsWith('/guide/demarrer.html') && document.readyState === 'complete'",
      "Les liens de langue fonctionnent aussi sans JavaScript",
    );
  } finally {
    await send("Emulation.setScriptExecutionDisabled", { value: false }, session);
  }
}

try {
  console.log((await send("Browser.getVersion")).product);
  const desktop = await createPage(1440, 1000);
  await navigate(desktop);
  await checkStoreLinks(desktop, 3);
  await noOverflow(desktop, "Accueil 1440 px");
  const demoRoot = "document.querySelector('[data-demo-scene]')";
  const play = "document.querySelector('[data-demo-play]')";
  await waitFor(
    desktop,
    `${play}?.hasAttribute('aria-pressed')`,
    "Le lecteur expose son état accessible",
  );
  checked(
    await evaluate(desktop, `${play}.getAttribute('aria-pressed') === 'true'`),
    "L’animation démarre sans préférence de mouvement réduit",
  );
  await click(desktop, "[data-demo-play]");
  checked(
    await evaluate(desktop, `${play}.getAttribute('aria-pressed') === 'false'`),
    "La démo peut être mise en pause",
  );
  await click(desktop, "[data-demo-play]");
  checked(
    await evaluate(desktop, `${play}.getAttribute('aria-pressed') === 'true'`),
    "La lecture peut reprendre",
  );
  const beforeAutoplay = await evaluate(desktop, `${demoRoot}.dataset.demoScene`);
  await waitFor(
    desktop,
    `${demoRoot}.dataset.demoScene !== ${JSON.stringify(beforeAutoplay)}`,
    "Une démo visible en lecture avance automatiquement après six secondes",
    8500,
  );
  checked(true, "La lecture automatique fait réellement avancer la scène visible");
  await click(desktop, "[data-demo-play]");
  const descriptions = new Set();
  for (const scene of ["goals", "focus", "daily"]) {
    await click(desktop, `[data-scene='${scene}']`);
    await waitFor(
      desktop,
      `${demoRoot}?.dataset.demoScene === '${scene}'`,
      `La scène ${scene} apparaît`,
    );
    const description = await evaluate(
      desktop,
      "document.querySelector('[data-demo-description]')?.textContent.trim()",
    );
    assert.ok(description, `La scène ${scene} doit avoir une description`);
    descriptions.add(description);
  }
  checked(descriptions.size === 3, "Les trois scènes changent la démonstration et son explication");
  await click(desktop, "[data-scene='goals']");
  await key(desktop, "ArrowRight", "ArrowRight", 39);
  checked(
    await evaluate(
      desktop,
      `${demoRoot}.dataset.demoScene === 'focus' && document.activeElement.matches('[data-scene="focus"][aria-selected="true"]')`,
    ),
    "Les scènes sont sélectionnables avec les flèches du clavier",
  );
  await key(desktop, "Home", "Home", 36);
  const captureSources = new Set();
  for (const view of ["scrum", "kanban", "settings"]) {
    await click(desktop, `[data-view='${view}']`);
    await waitFor(
      desktop,
      "document.querySelector('[data-product-image]')?.complete && document.querySelector('[data-product-image]').naturalWidth > 0",
      `La capture ${view} est chargée`,
    );
    captureSources.add(
      await evaluate(desktop, "document.querySelector('[data-product-image]').currentSrc"),
    );
  }
  checked(
    captureSources.size === 3,
    "Les onglets Scrum, Kanban et réglages affichent trois captures distinctes",
  );
  await key(desktop, "Home", "Home", 36);
  checked(
    await evaluate(
      desktop,
      `document.activeElement.matches('[data-view="scrum"][aria-selected="true"]')`,
    ),
    "Les captures sont aussi sélectionnables au clavier",
  );
  await click(desktop, "[data-open-capture]");
  await waitFor(
    desktop,
    "document.getElementById('capture-dialog')?.open",
    "La capture agrandie est ouverte",
  );
  await key(desktop, "Escape", "Escape", 27);
  await waitFor(
    desktop,
    "!document.getElementById('capture-dialog').open",
    "Échap ferme la capture agrandie",
  );
  checked(
    await evaluate(desktop, "document.activeElement.matches('[data-open-capture]')"),
    "La fermeture rend le focus au bouton de capture",
  );
  await checkPageImages(desktop);
  await screenshot(desktop, "site-preview-desktop.png");
  await screenshot(desktop, "site-preview-demo.png", "#experience");
  await screenshot(desktop, "site-preview-gallery.png", "#apercu");

  await resize(desktop, 390, 844);
  await noOverflow(desktop, "Accueil 390 px");
  const menuSelector = "button[aria-controls][aria-expanded]";
  const menu = await evaluate(
    desktop,
    `(() => {const b=document.querySelector(${JSON.stringify(menuSelector)});return b && {id:b.getAttribute('aria-controls'),label:b.getAttribute('aria-label') || b.textContent.trim(),visible:b.getBoundingClientRect().width>0};})()`,
  );
  checked(
    menu?.visible && menu.label && menu.id,
    "Le menu mobile est un bouton nommé et relié à la navigation",
  );
  await click(desktop, menuSelector);
  await waitFor(
    desktop,
    `document.querySelector(${JSON.stringify(menuSelector)}).getAttribute('aria-expanded') === 'true'`,
    "Le menu mobile annonce son ouverture",
  );
  checked(
    await evaluate(
      desktop,
      `(() => {const nav=document.getElementById(${JSON.stringify(menu.id)});return nav && !nav.hidden && nav.getBoundingClientRect().height>0 && !!nav.querySelector('a[href]');})()`,
    ),
    "La navigation mobile ouverte contient des liens visibles",
  );
  await noOverflow(desktop, "Menu mobile ouvert à 390 px");
  await key(desktop, "Escape", "Escape", 27);
  await waitFor(
    desktop,
    `document.querySelector(${JSON.stringify(menuSelector)}).getAttribute('aria-expanded') === 'false'`,
    "Échap ferme le menu mobile",
  );
  checked(
    await evaluate(desktop, `document.activeElement.matches(${JSON.stringify(menuSelector)})`),
    "Le focus revient au bouton du menu mobile",
  );
  await key(desktop, "Enter", "Enter", 13);
  await waitFor(
    desktop,
    `document.querySelector(${JSON.stringify(menuSelector)}).getAttribute('aria-expanded') === 'true'`,
    "Le menu mobile s’ouvre aussi au clavier",
  );
  await key(desktop, "Tab", "Tab", 9);
  checked(
    await evaluate(
      desktop,
      `document.getElementById(${JSON.stringify(menu.id)}).contains(document.activeElement) && document.activeElement.matches('a[href]')`,
    ),
    "Les liens du menu mobile sont accessibles par Tab",
  );
  await key(desktop, "Escape", "Escape", 27);
  await screenshot(desktop, "site-preview-mobile.png");

  await checkGuide(desktop);
  await checkGuide(desktop, "en");
  await checkGuide(desktop, "es");
  for (const path of ["confidentialite.html", "en/privacy.html", "es/privacidad.html"]) {
    await navigate(desktop, path);
    await noOverflow(desktop, `${path} 390 px`);
    if (path === "guide.html") await checkPageImages(desktop);
    await resize(desktop, 1440, 1000);
    await noOverflow(desktop, `${path} 1440 px`);
    await resize(desktop, 390, 844);
  }

  for (const language of ["en", "es"]) {
    await resize(desktop, 1440, 1000);
    await navigate(desktop, `${language}/index.html`);
    await checkStoreLinks(desktop, 3);
    await noOverflow(desktop, `Accueil ${language} 1440 px`);
    await screenshot(desktop, `site-preview-${language}-desktop.png`);
    for (const scene of ["goals", "focus", "daily"]) {
      await click(desktop, `[data-scene='${scene}']`);
      const text = await evaluate(
        desktop,
        "document.querySelector('[data-demo-description]').textContent",
      );
      assert.doesNotMatch(
        text,
        /objectifs|équipe|réunion|tickets terminés/i,
        "La démonstration traduite ne reprend pas les légendes françaises",
      );
    }
    await click(desktop, "[data-view='settings']");
    await checkPageImages(desktop);
    await resize(desktop, 390, 844);
    await noOverflow(desktop, `Accueil ${language} 390 px`);
    await screenshot(desktop, `site-preview-${language}-mobile.png`);
    await click(desktop, menuSelector);
    await waitFor(
      desktop,
      "document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true'",
      "Le menu anglais expose le choix de langue sur mobile",
    );
    await click(desktop, 'a[data-language="fr"]');
    await waitFor(
      desktop,
      "document.documentElement.lang === 'fr' && document.readyState === 'complete'",
      "Changer de langue depuis le menu mobile ouvre le français",
    );
  }
  await checkLanguageNavigation(desktop);

  const reduced = await createPage(1440, 1000, true);
  await navigate(reduced);
  await waitFor(
    reduced,
    `${play}?.hasAttribute('aria-pressed')`,
    "Le lecteur adapté au mouvement réduit est prêt",
  );
  checked(
    await evaluate(reduced, `${play}.getAttribute('aria-pressed') === 'false'`),
    "La préférence de mouvement réduit désactive la lecture automatique",
  );
  const initialScene = await evaluate(reduced, `${demoRoot}.dataset.demoScene`);
  await evaluate(reduced, `${demoRoot}.scrollIntoView({block:'center',behavior:'instant'})`);
  // Une séquence complète dure six secondes : vérifier aussi la démo visible.
  await sleep(6500);
  checked(
    await evaluate(reduced, `${demoRoot}.dataset.demoScene === ${JSON.stringify(initialScene)}`),
    "La démo reste immobile avec mouvement réduit",
  );

  assert.deepEqual(blocked, [], `Requêtes externes bloquées : ${blocked.join(", ")}`);
  assert.deepEqual(interceptionErrors, [], "L’interception du réseau est restée active");
  const apiRequests = events.filter(
    (event) =>
      sessions.has(event.sessionId) &&
      event.method === "Network.requestWillBeSent" &&
      ["Fetch", "XHR"].includes(event.params.type),
  );
  assert.deepEqual(apiRequests, [], "Le site statique ne doit appeler aucune API");
  const failures = events.filter(
    (event) =>
      sessions.has(event.sessionId) &&
      (event.method === "Runtime.exceptionThrown" ||
        (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") ||
        (event.method === "Log.entryAdded" && event.params.entry.level === "error") ||
        (event.method === "Network.responseReceived" && event.params.response.status >= 400)),
  );
  assert.deepEqual(failures, [], `Erreurs navigateur : ${JSON.stringify(failures).slice(0, 4000)}`);
  checked(
    true,
    "Aucune erreur navigateur, ressource manquante ou requête extérieure au site local",
  );
} catch (error) {
  if (inspectedSession) {
    const capture = await send(
      "Page.captureScreenshot",
      { format: "png", fromSurface: true, captureBeyondViewport: false },
      inspectedSession,
    ).catch(() => null);
    if (capture)
      writeFileSync(`${output}site-preview-failure.png`, Buffer.from(capture.data, "base64"));
  }
  throw error;
} finally {
  clearInterval(pump);
  try {
    await browser.close();
  } finally {
    await server.close();
  }
}
