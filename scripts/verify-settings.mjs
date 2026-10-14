// Glisser-déposer des réglages du board, sur le banc d'essai (Jira fictif, profil Chrome vierge) :
// swimlanes, types de tickets, champs et règles de couleur des cartes. Les écritures ne touchent que
// la mémoire du banc d'essai.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const PORT = 5203;
const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: PORT, strictPort: true },
});
await server.listen();
const browser = launchIsolatedBrowser("1440,1000");
const { send, evaluate, waitFor, navigateToHarness, events } = browser;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Input.setInterceptDrags", { enabled: true }, sessionId);
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  const run = (expression) => evaluate(sessionId, expression);

  const open = async (tab, ready) => {
    await navigateToHarness(
      sessionId,
      `http://127.0.0.1:${PORT}/?scenario=board-reglages&onglet=${tab}&persist=1`,
    );
    // Premier chargement : le serveur du banc d'essai compile encore, pas d'attente fixe.
    await waitFor(sessionId, ready, `Le banc d'essai n'a pas affiché l'onglet ${tab}`);
    await sleep(300);
  };

  /** Centre d'un élément, rendu visible ; `part` vise sa moitié haute ou basse. */
  const point = (selector, part = "center") =>
    run(`(() => {
      const element = ${selector};
      if (!element) return null;
      element.scrollIntoView({ block: "center" });
      const r = element.getBoundingClientRect();
      const y = ${JSON.stringify(part)} === "top" ? r.top + r.height / 4
        : ${JSON.stringify(part)} === "bottom" ? r.bottom - r.height / 4 : r.top + r.height / 2;
      return { x: r.left + Math.min(r.width / 2, 24), y };
    })()`);

  /**
   * Glisse `source` (expression JS d'un élément) jusqu'à `target`, comme à la souris : le
   * navigateur démarre le glissé, la page reçoit dragenter, dragover puis drop. `during` est évalué
   * pendant le survol, avant le dépôt (repère affiché).
   */
  const drag = async (source, target, part = "center", during = "null") => {
    const from = await point(source);
    assert(from, `source introuvable : ${source}`);
    const since = events.length;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from }, sessionId);
    await send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", ...from, button: "left", buttons: 1, clickCount: 1 },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: from.x + 12, y: from.y + 6, button: "left", buttons: 1 },
      sessionId,
    );
    await sleep(300);
    const intercepted = events
      .slice(since)
      .find((event) => event.method === "Input.dragIntercepted");
    assert(intercepted, `le navigateur n'a pas démarré le glissement de ${source}`);
    const to = await point(target, part);
    assert(to, `destination introuvable : ${target}`);
    for (const type of ["dragEnter", "dragOver"]) {
      await send(
        "Input.dispatchDragEvent",
        { type, ...to, data: intercepted.params.data },
        sessionId,
      );
      await sleep(150);
    }
    const seen = await run(during);
    await send(
      "Input.dispatchDragEvent",
      { type: "drop", ...to, data: intercepted.params.data },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", ...to, button: "left", buttons: 0, clickCount: 1 },
      sessionId,
    );
    await sleep(600);
    return seen;
  };

  // ─── Swimlanes JQL : migration explicite, validation et priorité ────────────
  const input = async (selector, value) => {
    await run(`(() => {
      const field = ${selector};
      if (!field) throw new Error('Champ introuvable');
      field.focus(); field.value = ${JSON.stringify(value)};
      field.setSelectionRange(field.value.length, field.value.length);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  const press = async (key, code = key, keyCode = 13) => {
    for (const type of ["keyDown", "keyUp"])
      await send(
        "Input.dispatchKeyEvent",
        {
          type,
          key,
          code,
          windowsVirtualKeyCode: keyCode,
          ...(key === "Enter" && type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
        },
        sessionId,
      );
  };
  const save = "document.querySelector('.settings-lanes-card .settings-savebar .primary')";
  const preview = "document.querySelector('.jql-preview-actions button')";
  const grips = `[...document.querySelectorAll('.jql-swimlane .settings-grip')].map((g) => g.getAttribute('aria-label').replace('Déplacer la swimlane ', ''))`;
  const lane = (name) =>
    `[...document.querySelectorAll('.jql-swimlane')].find((li) => li.querySelector('.jql-swimlane-name')?.value === ${JSON.stringify(name)})`;
  await open("board", "document.querySelectorAll('.jql-swimlane').length === 2");
  assert(
    same(await run(grips), ["RUN", "OPS"]),
    "les deux anciennes swimlanes doivent être proposées en JQL",
  );
  assert(
    await run(
      "document.querySelector('.jql-migration-note') !== null && !window.__equipe.document().settings.jqlSwimlanes",
    ),
    "ouvrir les réglages ne doit pas publier la migration",
  );
  assert(
    await run(
      "document.querySelector('.settings-lanes-card > header .settings-help').textContent.trim() === 'Les objectifs sont prioritaires, puis la première règle correspondante.'",
    ),
    "introduction des priorités absente",
  );
  const runEditor = `${lane("RUN")}.querySelector('.jql-editor-input')`;
  const original = await run(`${runEditor}.value`);
  const initialWrites = await run("window.__equipe.writes()");
  await input(runEditor, "invalid =");
  await waitFor(
    sessionId,
    `${runEditor}.getAttribute('aria-invalid') === 'true'`,
    "le JQL invalide n'est pas signalé avant application",
  );
  assert(
    await run(
      `${save}.disabled && ${preview}.disabled && window.__equipe.writes() === ${initialWrites}`,
    ),
    "une règle invalide peut être publiée ou prévisualisée",
  );
  console.log("✓ Swimlanes : erreur JQL avant enregistrement, aucune écriture du brouillon");

  await input(runEditor, "lab");
  await waitFor(
    sessionId,
    `${lane("RUN")}.querySelector('[role=option]')?.textContent.includes('labels')`,
    "l'autocomplétion Jira ne propose pas labels",
  );
  await press("ArrowDown", "ArrowDown", 40);
  await press("Enter");
  await waitFor(
    sessionId,
    `${runEditor}.value.trim() === 'labels'`,
    "Entrée n'insère pas la suggestion JQL",
  );
  assert(
    !(await run(`${runEditor}.value.includes(String.fromCharCode(10))`)),
    "Entrée a inséré un saut de ligne à la place du champ",
  );
  console.log("✓ JQL : suggestion de champ Jira insérée au clavier");
  await input(runEditor, original);
  await run(`${runEditor}.blur()`);
  await waitFor(
    sessionId,
    "document.querySelectorAll('.jql-swimlane .jql-validation-valid').length === 2",
    "les règles converties ne sont pas validées",
  );

  const marker = await drag(
    `${lane("OPS")}.querySelector('.settings-grip')`,
    lane("RUN"),
    "top",
    `${lane("RUN")}.dataset.drop ?? null`,
  );
  assert(marker === "before", `repère avant RUN attendu : ${marker}`);
  assert(same(await run(grips), ["OPS", "RUN"]), "l'ordre JQL n'a pas changé au glisser-déposer");
  // Cette règle correspond aux deux cartes de paiement déjà rattachées à un objectif.
  const opsEditor = `${lane("OPS")}.querySelector('.jql-editor-input')`;
  await input(opsEditor, "priority = High");
  await run(`${opsEditor}.blur()`);
  await waitFor(
    sessionId,
    `${lane("OPS")}.querySelector('.jql-validation-valid') !== null`,
    "le JQL OPS n'est pas validé",
  );
  assert(await run(`${save}.disabled`), "l'aperçu doit précéder l'application de la migration");
  await run(`${preview}.click()`);
  await waitFor(
    sessionId,
    "document.querySelectorAll('.jql-swimlane-preview').length === 2",
    "l'aperçu Jira n'a pas été affiché",
  );
  assert(
    await run("!document.querySelector('.jql-swimlane-preview .settings-error')"),
    "l'aperçu contient une erreur",
  );
  assert(
    await run(
      `${lane("OPS")}.querySelector('.jql-swimlane-preview').textContent.includes('2 dans un objectif')`,
    ),
    "l'aperçu ne distingue pas les objectifs prioritaires",
  );
  await waitFor(sessionId, `!${save}.disabled`, "la migration vérifiée ne peut pas être appliquée");
  await run(`${save}.click()`);
  await waitFor(
    sessionId,
    "window.__equipe.document()?.settings.jqlSwimlanes?.version === 1 && !document.querySelector('.jql-migration-note')",
    "la migration JQL n'a pas été confirmée",
  );
  const persisted = await run("window.__equipe.document().settings.jqlSwimlanes");
  assert(
    same(
      persisted.lanes.map((item) => item.name),
      ["OPS", "RUN"],
    ),
    "l'ordre des règles publiées est incorrect",
  );
  console.log("✓ Swimlanes : priorité réordonnée, aperçu puis migration publiée explicitement");

  await open(
    "board",
    "document.querySelectorAll('.jql-swimlane').length === 2 && !document.querySelector('.jql-migration-note')",
  );
  assert(
    same(await run("window.__equipe.document().settings.jqlSwimlanes"), persisted),
    "la migration n'a pas survécu au rechargement",
  );
  assert(
    same(await run(grips), ["OPS", "RUN"]),
    "la priorité n'a pas été relue après rechargement",
  );
  assert(await run("window.__equipe.writes() === 0"), "le rechargement doit relire sans republier");
  console.log("✓ Persistance : règles et priorité relues après rechargement, aucune republication");

  mkdirSync(resolve(".vite"), { recursive: true });
  for (const width of [1280, 640]) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 1000, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await run("document.activeElement?.blur(); window.scrollTo(0, 0)");
    await sleep(300);
    assert(
      await run("document.documentElement.scrollWidth <= innerWidth + 1"),
      `${width}px : les réglages débordent horizontalement`,
    );
    const shot = await send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: true },
      sessionId,
    );
    writeFileSync(resolve(`.vite/jql-settings-${width}.png`), Buffer.from(shot.data, "base64"));
  }
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await run("document.querySelector('.settings-back').click()");
  await waitFor(
    sessionId,
    "document.querySelectorAll('.board-screen [data-issue-key]').length > 0",
    "le board n'est pas affiché après migration",
  );
  assert(
    await run(`(() => {
    const cards = [...document.querySelectorAll('.board-screen [data-issue-key]')];
    const keys = cards.map((card) => card.dataset.issueKey);
    const payment = cards.find((card) => card.dataset.issueKey === 'ABC-101');
    return keys.length === new Set(keys).size && payment?.closest('[data-lane-id]')?.dataset.laneId.startsWith('goal:')
      && !document.querySelector('[data-lane-id="swimlane:2"]');
  })()`),
    "un objectif a perdu sa priorité, un ticket est dupliqué ou OPS vide reste visible",
  );
  console.log("✓ Board JQL : objectifs prioritaires, cartes uniques et swimlane vide masquée");

  // ─── Onglet Champs des cartes ──────────────────────────────────────────────
  const fields = `[...document.querySelectorAll('.settings-item .settings-grip')].map((g) => g.getAttribute('aria-label').replace('Déplacer ', ''))`;
  const field = (name) =>
    `[...document.querySelectorAll('.settings-item')].find((li) => li.querySelector('.settings-grip')?.getAttribute('aria-label') === 'Déplacer ${name}')`;
  await open("cardFields", "document.querySelectorAll('.settings-item').length === 3");
  const initial = await run(fields);
  const [firstField, , lastField] = initial;
  await drag(`${field(lastField)}.querySelector('.settings-grip')`, field(firstField), "top");
  const moved = await run(fields);
  assert(
    same(moved, [lastField, initial[0], initial[1]]),
    `champ glissé en tête : ${moved} (au départ ${initial})`,
  );
  assert(
    await run("document.querySelector('.settings-savebar').classList.contains('is-changed')"),
    "le brouillon des champs n'est pas signalé comme modifié",
  );
  console.log(`✓ Champs des cartes : « ${lastField} » glissé en tête, brouillon à appliquer`);

  // ─── Onglet Couleurs des cartes ────────────────────────────────────────────
  const rules = `[...document.querySelectorAll('.color-rule .settings-grip')].map((g) => g.getAttribute('aria-label').replace('Déplacer la règle ', ''))`;
  const rule = (name) =>
    `[...document.querySelectorAll('.color-rule')].find((li) => li.querySelector('.settings-grip')?.getAttribute('aria-label') === 'Déplacer la règle ${name}')`;
  await open("cardColors", "document.querySelectorAll('.color-rule').length === 3");
  const rulesBefore = await run(rules);
  await drag(`${rule("Support N3")}.querySelector('.settings-grip')`, rule("Bloquant"), "top");
  const rulesAfter = await run(rules);
  assert(
    rulesAfter[0] === "Support N3" && rulesAfter.length === rulesBefore.length,
    `règle glissée en tête : ${rulesAfter} (au départ ${rulesBefore})`,
  );
  console.log("✓ Couleurs des cartes : « Support N3 » glissée en tête, priorité changée");

  const colorInput = `${rule("Bloquant")}.querySelector('.jql-editor-input')`;
  const colorSave = "document.querySelector('.settings-savebar .primary')";
  const colorWrites = await run("window.__equipe.writes()");
  await input(colorInput, "invalid =");
  await waitFor(
    sessionId,
    `${colorInput}.getAttribute('aria-invalid') === 'true'`,
    "la couleur invalide n'a pas de retour avant application",
  );
  assert(
    await run(`${colorSave}.disabled && window.__equipe.writes() === ${colorWrites}`),
    "une couleur invalide a été acceptée",
  );
  await input(colorInput, "priority = High");
  await run(`${colorInput}.blur()`);
  await waitFor(
    sessionId,
    `${rule("Bloquant")}.querySelector('.jql-validation-valid') && !${colorSave}.disabled`,
    "la couleur corrigée n'est pas applicable",
  );
  await run(`${colorSave}.click()`);
  await waitFor(
    sessionId,
    "window.__equipe.document().settings.cardColorRules.some((rule) => rule.id === 'incident' && rule.jql === 'priority = High') && !document.querySelector('.settings-savebar.is-changed')",
    "la couleur valide n'a pas été enregistrée",
  );
  console.log(
    "✓ Couleurs : même validation JQL avant application, brouillon invalide conservé puis corrigé",
  );

  // Retour à Jira ancré : aucune carte ni information n'est recouverte, barre ouverte ou repliée.
  for (const width of [1440, 640]) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 760, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await navigateToHarness(sessionId, `http://127.0.0.1:${PORT}/?scenario=board&hote=1&masques=1`);
    await waitFor(
      sessionId,
      "Boolean(document.querySelector('.sidebar-return .host-return')) && document.querySelectorAll('.sidebar-hidden-item').length === 30",
      "Le retour à Jira n'est pas visible dans la barre latérale",
    );
    const visibleReturn = `(() => {
      const button = document.querySelector('.host-return');
      const r = button.getBoundingClientRect();
      return getComputedStyle(button).position !== 'fixed'
        && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
        && r.left >= 0 && r.right <= innerWidth
        && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    })()`;
    assert(
      await run(visibleReturn),
      `${width}px : retour masqué ou flottant dans la barre latérale`,
    );
    assert(
      await run(`document.querySelector('.host-return').getBoundingClientRect().right
        <= document.querySelector('.workspace-main').getBoundingClientRect().left`),
      `${width}px : le retour latéral recouvre le contenu`,
    );
    await run(
      "document.querySelector('.sidebar-hidden-item:last-child').scrollIntoView({ block: 'nearest' })",
    );
    assert(
      await run(visibleReturn),
      `${width}px : retour inaccessible après défilement des objectifs masqués`,
    );
    await run(`document.querySelector('[aria-label="Masquer la barre latérale"]').click()`);
    await waitFor(
      sessionId,
      "Boolean(document.querySelector('.workspace-return .host-return')) && !document.querySelector('.sidebar')",
      "Le retour à Jira n'est pas conservé lorsque la barre est repliée",
    );
    assert(await run(visibleReturn), `${width}px : retour masqué ou flottant après repli`);
    assert(
      await run(`document.querySelector('.host-return').getBoundingClientRect().bottom
        <= document.querySelector('.sprint-header').getBoundingClientRect().top
        && document.querySelector('.board-screen').getBoundingClientRect().bottom <= innerHeight + 1`),
      `${width}px : le retour réduit mal l'espace disponible du board`,
    );
    // L'en-tête n'a plus de bouton Réglages. Le menu d'une swimlane reste accessible
    // quand la barre latérale est repliée, ce que ce parcours doit conserver.
    await run(`(() => {
      const summary = document.querySelector('[data-lane-id="build"] .lane-menu > summary');
      summary.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      summary.click();
    })()`);
    await waitFor(
      sessionId,
      "Boolean(document.querySelector('[data-lane-id=\"build\"] .lane-menu[open] .menu-settings'))",
      "Le menu de réglages de la swimlane Build ne s'ouvre pas",
    );
    await run("document.querySelector('[data-lane-id=\"build\"] .menu-settings').click()");
    await waitFor(
      sessionId,
      "Boolean(document.querySelector('.settings-screen'))",
      "Réglages absents",
    );
    await run("window.scrollTo(0, document.body.scrollHeight)");
    await sleep(100);
    assert(
      await run(visibleReturn),
      `${width}px : retour inaccessible après défilement des réglages`,
    );
    assert(
      await run(`document.querySelector('.settings-header').getBoundingClientRect().top
        >= document.querySelector('.workspace-return').getBoundingClientRect().bottom - 1`),
      `${width}px : les onglets passent sous le retour à Jira`,
    );
    console.log(
      `✓ Navigation ${width}px : retour visible avec 30 objectifs masqués, après repli et sans recouvrement`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
