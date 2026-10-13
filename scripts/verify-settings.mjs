// Glisser-déposer des réglages du board, sur le banc d'essai (Jira fictif, profil Chrome vierge) :
// swimlanes, types de tickets, champs et règles de couleur des cartes. Les écritures ne touchent que
// la mémoire du banc d'essai.
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
      `http://127.0.0.1:${PORT}/?scenario=board-reglages&onglet=${tab}`,
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

  // ─── Onglet Board : swimlanes et types ─────────────────────────────────────
  const grips = `[...document.querySelectorAll('.settings-lanes .settings-grip')].map((g) => g.getAttribute('aria-label').replace('Déplacer la swimlane ', ''))`;
  const lane = (name) =>
    `[...document.querySelectorAll('.settings-lanes > li')].find((li) => li.querySelector('.settings-grip')?.getAttribute('aria-label') === 'Déplacer la swimlane ${name}')`;
  await open("board", "document.querySelectorAll('.settings-lanes .settings-grip').length === 3");
  let order = await run(grips);
  assert(same(order, ["Build", "RUN", "OPS"]), `swimlanes au départ : ${order}`);

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
  console.log("✓ Board : le type déposé dans « Ignorés » emporte sa swimlane devenue vide");

  await drag(chip("10005"), `${lane("OPS")}`);
  await waitFor(
    sessionId,
    `${lane("OPS")}?.querySelector('[data-type-id="10005"]') != null`,
    "le type n'a pas rejoint la swimlane OPS",
  );
  console.log("✓ Board : « Anomalie de Recette » glissé dans la swimlane OPS");

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
    await run("document.querySelector('.settings-open').click()");
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
