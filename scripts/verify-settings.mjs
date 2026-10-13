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
const { send, evaluate, waitFor, events } = browser;

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
    await send(
      "Page.navigate",
      { url: `http://127.0.0.1:${PORT}/?scenario=board-reglages&onglet=${tab}` },
      sessionId,
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
} finally {
  await browser.close();
  await server.close();
}
