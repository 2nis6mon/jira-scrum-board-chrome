// Vérification FR/EN/ES sur le seul banc fictif, dans un profil Chrome temporaire vierge.
// Aucun accès à une session Jira réelle ; aucune écriture de configuration hors du banc.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchIsolatedBrowser } from "./browser-check.mjs";

const origin = "http://127.0.0.1:5199";
const output = fileURLToPath(new URL("../.vite/", import.meta.url));
mkdirSync(output, { recursive: true });
let server;
const existing = await fetch(origin, { signal: AbortSignal.timeout(1500) }).catch(() => null);
if (existing) {
  assert.ok(
    existing.ok && (await existing.text()).includes("harness.tsx"),
    "Le port 5199 est occupé par un serveur qui n'est pas le banc fictif attendu.",
  );
} else {
  server = await createServer({
    configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
    // Un contrôle doit garder son document même si une édition locale arrive en parallèle.
    server: { host: "127.0.0.1", port: 5199, strictPort: true, hmr: false, watch: null },
  });
  await server.listen();
}

let browser;
let session;
try {
  browser = launchIsolatedBrowser("1440,1000");
  const { send, evaluate, waitFor, navigateToHarness } = browser;
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  session = sessionId;
  await send("Page.enable", {}, sessionId);
  const run = (expression) => evaluate(sessionId, expression);
  const frames = () =>
    run("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const viewport = async (width) => {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 1000, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await frames();
  };
  const checkWidth = async (label) => {
    const size = await run(
      "({ viewport: innerWidth, page: document.documentElement.scrollWidth })",
    );
    assert.ok(size.page <= size.viewport + 1, `${label} déborde : ${JSON.stringify(size)}`);
  };
  const capture = async (name) => {
    const shot = await send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(`${output}${name}.png`, Buffer.from(shot.data, "base64"));
  };
  const open = async (scenario, locale, extra = {}) => {
    const params = new URLSearchParams({ scenario, jiraLocale: locale, hote: "1", ...extra });
    await navigateToHarness(sessionId, `${origin}/?${params}`);
    await waitFor(
      sessionId,
      "window.__storeCapture?.ready() && document.querySelectorAll('[data-issue-key], .settings-screen').length > 0",
      `Le scénario ${scenario} (${locale}) n'est pas prêt`,
    );
    await frames();
  };
  const click = async (selector) => {
    await run(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Cible de clic absente');
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    })()`);
    await frames();
    const point = await run(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return rect.width > 0 && rect.height > 0 && x >= 0 && y >= 0
        && x < innerWidth && y < innerHeight
        && element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
    })()`);
    assert.ok(point, `Cible de clic masquée : ${selector}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point }, sessionId);
    for (const type of ["mousePressed", "mouseReleased"])
      await send(
        "Input.dispatchMouseEvent",
        { type, ...point, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 },
        sessionId,
      );
    await frames();
  };
  const choose = async (preference, expected) => {
    await click(`.settings-segment:has(input[name="interface-language"][value="${preference}"])`);
    await waitFor(
      sessionId,
      `document.documentElement.lang === ${JSON.stringify(expected)}
        && document.querySelector('input[name="interface-language"][value="${preference}"]')?.checked`,
      `La préférence ${preference} n'est pas appliquée en ${expected}`,
    );
  };

  // La langue appartient à Jira : fr-CA reste français, l'allemand se replie en anglais.
  for (const [scenario, locale, language] of [
    ["board", "fr-FR", "fr"],
    ["board", "en-US", "en"],
    ["board", "de", "en"],
    ["board", "fr-CA", "fr"],
    ["board", "es-ES", "es"],
    ["board", "es-MX", "es"],
    ["board", "es-419", "es"],
    ["board-kanban", "de", "en"],
    ["board-kanban", "es", "es"],
  ]) {
    await viewport(1440);
    await open(scenario, locale);
    const expectedRefresh = { fr: "Actualiser", en: "Refresh", es: "Actualizar" }[language];
    const expectedReturn = { fr: "Retour à Jira", en: "Back to Jira", es: "Volver a Jira" }[
      language
    ];
    const observed = await run(`({
      language: document.documentElement.lang,
      refresh: Boolean(document.querySelector('button[aria-label=${JSON.stringify(expectedRefresh)}]')),
      returnLabel: document.querySelector('.host-return')?.textContent.trim(),
      issueTitle: document.querySelector('[data-issue-key="ABC-101"] .card-summary')?.textContent,
      quickFilter: document.querySelector('.quick-filter')?.textContent ?? document.body.textContent
    })`);
    assert.equal(observed.language, language, `${scenario} : langue pour ${locale}`);
    assert.ok(observed.refresh, `${scenario} : actualisation non traduite pour ${locale}`);
    assert.equal(observed.returnLabel, expectedReturn, `${scenario} : retour Jira`);
    assert.equal(
      observed.issueTitle,
      "Afficher le récapitulatif avant paiement",
      "Le titre Jira a été traduit",
    );
    assert.ok(observed.quickFilter.includes("Mes tickets"), "Le nom du filtre Jira a été traduit");
    for (const width of [1440, 640]) {
      await viewport(width);
      await checkWidth(`${scenario}, ${locale}, ${width}px`);
    }
    if (scenario === "board" && ["en-US", "es-ES"].includes(locale)) {
      await viewport(1440);
      await capture(`i18n-board-${language}-1440`);
    }
    console.log(`✓ ${scenario} : Jira ${locale} → ${language}, noms Jira conservés, 1440/640 px`);
  }

  await viewport(1440);
  await open("board-reglages", "en-US", { onglet: "cardColors" });
  assert.equal(
    await run("document.querySelector('#settings-title').textContent"),
    "Board settings",
  );
  const writes = await run("window.__equipe.writes()");
  const data = await run(`(() => {
    const row = [...document.querySelectorAll('.color-rule')]
      .find(item => item.querySelector('.color-rule-name')?.value === 'Bloquant');
    if (!row) throw new Error('Règle fictive Bloquant absente');
    const field = row.querySelector('textarea');
    window.__i18nDraft = field;
    field.focus(); field.value = 'labels = "urgence"';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return { name: row.querySelector('.color-rule-name').value, value: field.value };
  })()`);
  await waitFor(
    sessionId,
    "document.querySelector('.settings-savebar.is-changed') && window.__i18nDraft.getAttribute('aria-invalid') === 'false'",
    "Le brouillon JQL fictif n'est pas validé",
  );
  for (const [preference, language, title] of [
    ["fr", "fr", "Réglages du board"],
    ["en", "en", "Board settings"],
    ["es", "es", "Configuración del tablero"],
    ["auto", "en", "Board settings"],
  ]) {
    await choose(preference, language);
    const draft = await run(`({
      connected: window.__i18nDraft.isConnected,
      value: window.__i18nDraft.value,
      name: window.__i18nDraft.closest('.color-rule').querySelector('.color-rule-name').value,
      valid: window.__i18nDraft.getAttribute('aria-invalid'),
      title: document.querySelector('#settings-title').textContent,
      writes: window.__equipe.writes(),
      changed: Boolean(document.querySelector('.settings-savebar.is-changed'))
    })`);
    assert.deepEqual(
      draft,
      {
        connected: true,
        value: data.value,
        name: data.name,
        valid: "false",
        title,
        writes,
        changed: true,
      },
      `Le changement ${preference} a modifié ou remonté le brouillon JQL`,
    );
  }
  for (const width of [1440, 640]) {
    await viewport(width);
    await checkWidth(`Réglages anglais ${width}px`);
    await run("window.scrollTo(0, 0)");
    await frames();
    await capture(`i18n-settings-en-${width}`);
  }
  console.log(
    "✓ Préférence FR/EN/ES/Auto à chaud : même champ JQL, validation et brouillon conservés, aucune écriture Jira",
  );
  await choose("es", "es");
  for (const width of [1440, 640]) {
    await viewport(width);
    await checkWidth(`Réglages espagnols ${width}px`);
    await run("window.scrollTo(0, 0)");
    await frames();
    await capture(`i18n-settings-es-${width}`);
  }

  // Les préférences restent accessibles lorsque les réglages du board sont interdits.
  await viewport(1440);
  await open("board-lecture-seule", "de");
  assert.ok(
    await run("!document.querySelector('.board-switcher .menu-settings')"),
    "Le scénario sans droit propose encore l'administration du board",
  );
  await click(".sidebar-site-toggle");
  await click(".sidebar-site-entry:has(svg.icon-sliders)");
  await waitFor(
    sessionId,
    "document.querySelector('#personal-preferences-title')?.textContent === 'Personal preferences'",
    "Les préférences personnelles ne sont pas accessibles sans droit d'administration",
  );
  const personalWrites = await run("window.__equipe.writes()");
  await choose("fr", "fr");
  await choose("es", "es");
  await choose("auto", "en");
  assert.equal(await run("window.__equipe.writes()"), personalWrites);
  for (const width of [1440, 640]) {
    await viewport(width);
    await checkWidth(`Préférences anglaises sans droit ${width}px`);
  }
  await run("window.scrollTo(0, 0)");
  await frames();
  await capture("i18n-preferences-en-640");
  console.log(
    "✓ Préférences personnelles accessibles sans droit d'administration, sans publication Jira, 1440/640 px",
  );
  const exceptions = browser.events.filter(
    (event) => event.sessionId === sessionId && event.method === "Runtime.exceptionThrown",
  );
  assert.equal(exceptions.length, 0, `Exceptions navigateur : ${JSON.stringify(exceptions)}`);
} catch (error) {
  if (browser && session) {
    const shot = await browser
      .send("Page.captureScreenshot", { format: "png" }, session)
      .catch(() => null);
    if (shot) writeFileSync(`${output}i18n-failure.png`, Buffer.from(shot.data, "base64"));
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
