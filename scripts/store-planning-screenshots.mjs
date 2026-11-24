// Captures Web Store de Sprint Planning (story 8.35) : interface réelle, données FICTIVES, banc
// compilé avec Sprint Planning ACTIF. Les cinq captures du board (`npm run store:screenshots`, mode
// package) ne sont ni régénérées ni modifiées : seules 06-planning.png et 07-cloture.png s'ajoutent,
// avec leur preuve dans captures.json (clé `planning`). Aucun accès à une session Jira réelle.
// Usage : npm run store:screenshots:planning ; CHROME_PATH permet de choisir le navigateur isolé.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const WIDTH = 1280;
const HEIGHT = 800;
const PORT = 5203;
// Date cohérente avec le sprint du jeu de démonstration, indépendante du jour de génération.
const referenceDate = "2026-09-18T10:00:00.000Z";
const root = fileURLToPath(new URL("../", import.meta.url));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const output = join(root, "docs/store/captures");
const buildDirectory = resolve(root, ".vite/store-captures/harness-planning");
assert.equal(dirname(buildDirectory), resolve(root, ".vite/store-captures"));
const configFile = join(root, "vite.harness.config.ts");

// Le mode `development` active Sprint Planning dans le banc, comme `dist/` ; jamais le paquet.
await build({
  configFile,
  mode: "development",
  build: { outDir: buildDirectory, emptyOutDir: true, target: "es2023" },
});
const server = await preview({
  configFile,
  mode: "development",
  build: { outDir: buildDirectory },
  preview: { host: "127.0.0.1", port: PORT, strictPort: true },
});
const browser = launchIsolatedBrowser(`${WIDTH},${HEIGHT}`);
const { send, evaluate, waitFor, navigateToHarness } = browser;
const captures = [];

// Conserver les pixels natifs de Chrome : PNG 24 bits sans canal alpha ni couleur transparente.
function opaquePng(input, width, height) {
  assert.equal(input.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(input.readUInt32BE(16), width);
  assert.equal(input.readUInt32BE(20), height);
  assert.equal(input[24], 8, "PNG attendu sur 8 bits par canal");
  assert.equal(input[25], 2, "Chrome doit fournir directement un PNG RGB sans canal alpha");
  for (let offset = 8; offset < input.length; ) {
    const length = input.readUInt32BE(offset);
    assert.notEqual(input.toString("ascii", offset + 4, offset + 8), "tRNS", "PNG non opaque");
    offset += length + 12;
  }
  return input;
}

try {
  const browserVersion = await send("Browser.getVersion");
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Emulation.setTimezoneOverride", { timezoneId: "Europe/Paris" }, sessionId);
  await send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `(() => {
        const NativeDate = Date;
        const reference = NativeDate.parse(${JSON.stringify(referenceDate)});
        window.Date = class extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [reference])); }
          static now() { return reference; }
        };
      })();`,
    },
    sessionId,
  );
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  const idle =
    "document.querySelector('main.planning-screen')?.getAttribute('aria-busy') !== 'true'";
  const openPlanning = async (scenario, goalLanes) => {
    await navigateToHarness(
      sessionId,
      `http://127.0.0.1:${PORT}/?${new URLSearchParams({ scenario, hote: "1" })}`,
    );
    await waitFor(
      sessionId,
      "window.__storeCapture?.ready() && document.querySelector('.sidebar-return button')",
      "Le scénario de capture intégré à Jira n'est pas prêt",
    );
    assert.equal(
      await evaluate(sessionId, "document.querySelector('.app-version')?.textContent"),
      version,
    );
    await evaluate(
      sessionId,
      `(() => { const button = [...document.querySelectorAll('button')]
        .find((item) => item.textContent.trim() === 'Sprint Planning');
        if (!button) throw new Error('Entrée Sprint Planning absente'); button.click(); })()`,
    );
    await waitFor(
      sessionId,
      `Boolean(document.querySelector('main.planning-screen')) && ${idle}
        && document.querySelectorAll('section.planning-lane[data-planning-goal]:not([data-planning-goal="unassigned"])').length === ${goalLanes}`,
      "Le sprint en préparation n'est pas chargé",
    );
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: HEIGHT - 1 }, sessionId);
  };
  // Geste réel par le menu d'une carte (⋯ puis sous-menu), écrit dans le faux Jira puis relu.
  const place = async (key, submenu, destination) => {
    const card = `[data-planning-issue="${key}"]`;
    const entry = (root, label) =>
      `[...document.querySelectorAll(${JSON.stringify(`${root} [role='menuitem']`)})].find((item) => item.textContent.trim().startsWith(${JSON.stringify(label)}))`;
    await waitFor(
      sessionId,
      `document.querySelector('${card} .planning-card-menu')`,
      `Carte absente : ${key}`,
    );
    await evaluate(sessionId, `document.querySelector('${card} .planning-card-menu').click()`);
    await waitFor(sessionId, entry(".card-menu", submenu), `Menu de ${key} absent`);
    await evaluate(sessionId, `${entry(".card-menu", submenu)}.click()`);
    await waitFor(
      sessionId,
      entry(".card-menu-goals", destination),
      `Destination absente : ${destination}`,
    );
    await evaluate(sessionId, `${entry(".card-menu-goals", destination)}.click()`);
    await waitFor(
      sessionId,
      `!document.querySelector('.card-menu') && ${idle} && Boolean(document.querySelector('.planning-lanes ${card}'))`,
      `${key} n'a pas rejoint le sprint`,
    );
  };
  const prepareSprint = async () => {
    await place("ABC-201", "Ajouter au sprint", "Simplifier le paiement");
    await place("ABC-202", "Ajouter au sprint", "Rendre le panier plus rapide");
    await place("ABC-204", "Ajouter au sprint", "Rendre le panier plus rapide");
    await place("ABC-203", "Ajouter au sprint", "Sans objectif");
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: HEIGHT - 1 }, sessionId);
  };
  const capture = async (file, scenario, expected) => {
    await waitFor(sessionId, expected, `Vue attendue absente : ${scenario}`);
    await evaluate(sessionId, "document.fonts.ready");
    await sleep(400);
    const proof = await evaluate(
      sessionId,
      `(() => ({
        ...window.__storeCapture.inspect(),
        referenceDate: new Date().toISOString(),
        planningScreen: !!document.querySelector('main.planning-screen'),
        versionDisplayed: document.querySelector('.app-version')?.textContent ?? null,
        viewport: { width: innerWidth, height: innerHeight },
      }))()`,
    );
    assert.equal(proof.version, version);
    assert.equal(proof.referenceDate, referenceDate);
    assert.equal(proof.versionDisplayed, version);
    assert.equal(proof.planningEnabled, true, "Sprint Planning doit être actif dans ce banc");
    assert.equal(proof.view, "planning");
    assert.equal(proof.planningScreen, true);
    assert.deepEqual(proof.viewport, { width: WIDTH, height: HEIGHT });
    const { data } = await send(
      "Page.captureScreenshot",
      { format: "png", fromSurface: true, captureBeyondViewport: false },
      sessionId,
    );
    const png = opaquePng(Buffer.from(data, "base64"), WIDTH, HEIGHT);
    captures.push({ file, scenario, proof, png });
    console.log(`✓ ${file} : Sprint Planning actif, contexte Jira simulé, PNG RGB`);
  };

  await openPlanning("board-planning", 2);
  await prepareSprint();
  await capture(
    "06-planning.png",
    "Sprint Planning : sprint en préparation, objectifs, Sans objectif par swimlane et tickets du backlog",
    "document.querySelector('.planning-close-sprint') && document.querySelector('[data-planning-type-lane]') && document.querySelector('.planning-sources')",
  );

  await openPlanning("board-planning-deux-actifs", 2);
  await prepareSprint();
  await evaluate(sessionId, "document.querySelector('summary.planning-close-sprint').click()");
  await capture(
    "07-cloture.png",
    "Sprint Planning : plusieurs sprints actifs, « Clôturer un sprint » ouvre la liste de leurs noms",
    "document.querySelector('details.planning-close-menu[open] .menu-panel [data-close-sprint]')",
  );

  // Publier les fichiers seulement après le succès de tous les contrôles.
  mkdirSync(output, { recursive: true });
  for (const item of captures) writeFileSync(join(output, item.file), item.png);
  const manifestPath = join(output, "captures.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.planning = {
    version,
    generatedAt: new Date().toISOString(),
    referenceDate,
    source:
      "Interface réelle sur données fictives dans le banc d'essai local, contexte Jira simulé, Sprint Planning actif",
    build: {
      mode: "development",
      production: false,
      sprintPlanningEnabled: true,
      distributionZipLoaded: false,
    },
    browser: browserVersion.product,
    note: "Captures du planning, ajoutées sans régénérer les cinq captures du board (mode package, Sprint Planning désactivé).",
    captures: captures.map(({ file, scenario, proof, png }) => ({
      file,
      width: WIDTH,
      height: HEIGHT,
      format: "PNG RGB 24 bits, opaque",
      bytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
      scenario,
      proof,
    })),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✓ Version ${version} : 2 captures du planning, preuves dans captures.json`);
} finally {
  await browser.close();
  await new Promise((resolveClose, reject) => {
    server.httpServer.close((error) => (error ? reject(error) : resolveClose()));
  });
}
