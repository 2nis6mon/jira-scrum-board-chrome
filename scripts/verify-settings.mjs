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
  const click = async (selector) => {
    await run(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Cible de clic introuvable');
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    })()`);
    // Un scroll du board referme normalement son menu flottant. Laisser le navigateur
    // traiter ce défilement avant le clic, comme lorsqu'une personne rejoint le bouton.
    await run(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    const target = await run(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const r = element.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      return r.width > 0 && r.height > 0 && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
        && element.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
    })()`);
    assert(target, `cible de clic masquée ou recouverte : ${selector}`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...target }, sessionId);
    for (const type of ["mousePressed", "mouseReleased"])
      await send(
        "Input.dispatchMouseEvent",
        {
          type,
          ...target,
          button: "left",
          buttons: type === "mousePressed" ? 1 : 0,
          clickCount: 1,
        },
        sessionId,
      );
  };
  // ─── Onglet Board : swimlanes et types ─────────────────────────────────────
  const grips = `[...document.querySelectorAll('.settings-lanes .settings-grip')].map((g) => g.getAttribute('aria-label').replace('Déplacer la swimlane ', ''))`;
  const lane = (name) =>
    `[...document.querySelectorAll('.settings-lanes > li')].find((li) => li.querySelector('.settings-grip')?.getAttribute('aria-label') === 'Déplacer la swimlane ${name}')`;
  await open("board", "document.querySelectorAll('.settings-lanes .settings-grip').length === 3");
  let order = await run(grips);
  assert(same(order, ["Build", "RUN", "OPS"]), `swimlanes au départ : ${order}`);
  assert(
    await run(`!document.querySelector('.settings-types-card')
      && document.querySelector('.settings-lane-build [data-type-id="10001"]') !== null
      && document.querySelector('.settings-lanes-card [aria-label="Types ignorés"]') !== null`),
    "les types Default et Ignorés ne sont pas intégrés à la section Swimlanes",
  );
  assert(
    await run(`document.querySelector('.settings-lanes-card > header .settings-help')
      .textContent.trim() === 'Les objectifs sont prioritaires sur les swimlanes.'`),
    "l'introduction des swimlanes doit rappeler simplement la priorité des objectifs",
  );
  const typeIds = `[...document.querySelectorAll('.settings-chip')].map((chip) => chip.dataset.typeId).sort()`;
  const initialTypeIds = await run(typeIds);
  const assertTypes = async () => {
    const ids = await run(typeIds);
    assert(
      same(ids, initialTypeIds) && ids.length === new Set(ids).size,
      `chaque type doit apparaître une seule fois après son déplacement : ${ids}`,
    );
  };

  const marker = await drag(
    `${lane("Build")}.querySelector('.settings-grip')`,
    lane("OPS"),
    "bottom",
    `${lane("OPS")}.dataset.drop ?? null`,
  );
  assert(marker === "after", `repère de dépôt sous OPS attendu, vu : ${marker}`);
  order = await run(grips);
  assert(same(order, ["RUN", "OPS", "Build"]), `Build glissée en fin de liste : ${order}`);
  console.log("✓ Board : Build glissée sous OPS, repère affiché pendant le survol");

  await drag(`${lane("OPS")}.querySelector('.settings-grip')`, lane("RUN"), "top");
  order = await run(grips);
  assert(same(order, ["OPS", "RUN", "Build"]), `OPS glissée en tête : ${order}`);
  console.log("✓ Board : OPS glissée au-dessus de RUN");

  const chip = (typeId) => `document.querySelector('[data-type-id="${typeId}"]')`;
  const orderBeforeType = await run(grips);
  for (const destination of [lane("OPS"), "document.querySelector('.settings-lane-build')"]) {
    const hovered = await drag(
      chip("10001"),
      destination,
      "center",
      `({ target: ${destination}.classList.contains('is-type-target'),
        reorder: Boolean(document.querySelector('.settings-lanes > li[data-drop]')) })`,
    );
    assert(hovered.target, "la swimlane destinataire ne se signale pas au survol du type");
    assert(!hovered.reorder, "glisser un type ne doit pas préparer un déplacement de swimlane");
    await waitFor(
      sessionId,
      `${destination}?.querySelector('[data-type-id="10001"]') != null`,
      "le type Story n'a pas rejoint sa destination",
    );
    assert(same(await run(grips), orderBeforeType), "déplacer un type a réordonné les swimlanes");
    await assertTypes();
  }
  console.log(
    "✓ Board : Story glissée de Default à OPS puis de retour, sans doublon ni réordonnancement",
  );

  const hover = await drag(
    chip("10007"),
    "document.querySelector('.settings-new-lane')",
    "center",
    "document.querySelector('.settings-new-lane').classList.contains('is-type-target')",
  );
  assert(hover === true, "la zone « Nouvelle swimlane » ne s'est pas signalée au survol");
  await waitFor(
    sessionId,
    "document.querySelectorAll('.settings-lanes .settings-grip').length === 4",
    "aucune swimlane créée par le dépôt d'un type",
  );
  order = await run(grips);
  assert(
    same(order, ["OPS", "RUN", "Build", "Demande de service"]),
    `nouvelle swimlane en fin de liste : ${order}`,
  );
  console.log("✓ Board : « Demande de service » déposé sur « Nouvelle swimlane » crée sa swimlane");

  await drag(
    chip("10007"),
    "document.querySelector('[aria-label=\"Types ignorés\"]').closest('.settings-type-group')",
  );
  await waitFor(
    sessionId,
    'document.querySelector(\'[aria-label="Types ignorés"] [data-type-id="10007"]\') !== null',
    "le type déposé dans « Ignorés » n'y est pas",
  );
  order = await run(grips);
  assert(same(order, ["OPS", "RUN", "Build"]), `la swimlane vide a disparu : ${order}`);
  await assertTypes();
  console.log("✓ Board : le type déposé dans « Ignorés » emporte sa swimlane devenue vide");

  await drag(chip("10005"), `${lane("OPS")}`);
  await waitFor(
    sessionId,
    `${lane("OPS")}?.querySelector('[data-type-id="10005"]') != null`,
    "le type n'a pas rejoint la swimlane OPS",
  );
  console.log("✓ Board : « Anomalie de Recette » glissé dans la swimlane OPS");

  // Le menu décrit le classement sans objectif ; changer ce défaut reste possible au clavier.
  const pressEnter = async () => {
    for (const type of ["keyDown", "keyUp"]) {
      await send(
        "Input.dispatchKeyEvent",
        {
          type,
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
        },
        sessionId,
      );
    }
  };
  const chooseDefault = async (label) => {
    await run(`${chip("10005")}.querySelector('summary').focus()`);
    await pressEnter();
    await waitFor(
      sessionId,
      `${chip("10005")}.querySelector('details').open`,
      "le menu de déplacement du type ne s'ouvre pas au clavier",
    );
    const chosen = await run(`(() => {
      const button = [...${chip("10005")}.querySelectorAll('button')]
        .find((item) => item.textContent.trim() === ${JSON.stringify(label)});
      if (!button || button.disabled) return false;
      button.focus();
      return true;
    })()`);
    assert(chosen, `classement par défaut indisponible : ${label}`);
    await pressEnter();
  };
  await chooseDefault("Default");
  await waitFor(
    sessionId,
    "document.querySelector('.settings-lane-build [data-type-id=\"10005\"]') !== null",
    "le type n'a pas rejoint Default",
  );
  await assertTypes();
  await chooseDefault("RUN");
  await waitFor(
    sessionId,
    `${lane("RUN")}?.querySelector('[data-type-id="10005"]') != null`,
    "le classement RUN par défaut n'a pas été rétabli",
  );
  await assertTypes();
  assert(same(await run(grips), orderBeforeType), "le menu de type a réordonné les swimlanes");
  console.log("✓ Board : menu de type au clavier vers Default puis RUN");

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
  await input(colorInput, "pri");
  await waitFor(
    sessionId,
    `${rule("Bloquant")}.querySelector('[role=option]')?.textContent.includes('priority')`,
    "l'autocomplétion Jira ne propose pas priority pour une couleur",
  );
  await press("ArrowDown", "ArrowDown", 40);
  await press("Enter");
  await waitFor(
    sessionId,
    `${colorInput}.value.trim() === 'priority'`,
    "Entrée n'insère pas la suggestion JQL dans la couleur",
  );
  assert(
    !(await run(`${colorInput}.value.includes(String.fromCharCode(10))`)),
    "Entrée a inséré un saut de ligne à la place du champ",
  );
  console.log("✓ Couleurs : suggestion JQL Jira insérée au clavier");
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
    "✓ Couleurs : validation JQL avant application, brouillon invalide conservé puis corrigé",
  );

  const persistedColors = await run("window.__equipe.document().settings.cardColorRules");
  await open("cardColors", "document.querySelectorAll('.color-rule').length >= 2");
  assert(
    same(await run("window.__equipe.document().settings.cardColorRules"), persistedColors),
    "les couleurs JQL n'ont pas survécu au rechargement",
  );
  assert(
    await run(`${colorInput}.value === 'priority = High' && window.__equipe.writes() === 0`),
    "le rechargement doit relire le JQL sans le republier",
  );
  console.log("✓ Couleurs : règles et priorité relues après rechargement, aucune republication");

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
      `${width}px : les réglages de couleur débordent horizontalement`,
    );
    const shot = await send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: true },
      sessionId,
    );
    writeFileSync(resolve(`.vite/jql-colors-${width}.png`), Buffer.from(shot.data, "base64"));
  }

  // Retour à Jira ancré dans la barre ; replier celle-ci retire aussi le bouton et son bandeau.
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
      "!document.querySelector('.host-return, .workspace-return, .sidebar') && Boolean(document.querySelector('[aria-label=\"Afficher la barre latérale\"]'))",
      "Le retour à Jira ou son bandeau reste affiché lorsque la barre est repliée",
    );
    assert(
      await run(`document.querySelector('.sprint-header').getBoundingClientRect().top <= 1
        && document.querySelector('.board-screen').getBoundingClientRect().top <= 1
        && document.querySelector('.board-screen').getBoundingClientRect().bottom <= innerHeight + 1`),
      `${width}px : le bandeau retiré laisse encore un espace au-dessus du board`,
    );
    // L'en-tête n'a plus de bouton Réglages. Le menu d'une swimlane reste accessible
    // quand la barre latérale est repliée, ce que ce parcours doit conserver.
    await click('[data-lane-id="build"] .lane-menu > summary');
    await waitFor(
      sessionId,
      "Boolean(document.querySelector('[data-lane-id=\"build\"] .lane-menu[open][data-placed] .menu-settings'))",
      "Le menu de réglages de la swimlane Build ne s'ouvre pas",
    );
    await click('[data-lane-id="build"] .menu-settings');
    await waitFor(
      sessionId,
      "Boolean(document.querySelector('.settings-screen'))",
      "Réglages absents",
    );
    await run("window.scrollTo(0, document.body.scrollHeight)");
    await sleep(100);
    assert(
      await run("!document.querySelector('.host-return, .workspace-return')"),
      `${width}px : le retour réapparaît dans les réglages malgré la barre repliée`,
    );
    assert(
      await run(
        `Math.abs(document.querySelector('.settings-header').getBoundingClientRect().top) <= 1`,
      ),
      `${width}px : les onglets gardent un espace au-dessus après suppression du bandeau`,
    );
    await run("document.querySelector('.settings-back').click()");
    await waitFor(sessionId, "Boolean(document.querySelector('.board-screen'))", "Board absent");
    await run(`document.querySelector('[aria-label="Afficher la barre latérale"]').click()`);
    await waitFor(
      sessionId,
      "Boolean(document.querySelector('.sidebar-return .host-return'))",
      "Le retour à Jira n'est pas restauré avec la barre latérale",
    );
    assert(
      await run(visibleReturn),
      `${width}px : retour inaccessible après réouverture de la barre`,
    );
    console.log(
      `✓ Navigation ${width}px : retour masqué avec la barre, aucun bandeau résiduel, bouton restauré à la réouverture`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
