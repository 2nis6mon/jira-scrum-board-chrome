// Captures Web Store : interface réelle, données FICTIVES, build du banc en mode package.
// Le ZIP de distribution n'est pas chargé ici. Aucun accès à une session Jira ou Chrome réelle.
// Usage : npm run store:screenshots ; CHROME_PATH permet de choisir le navigateur isolé.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const WIDTH = 1280;
const HEIGHT = 800;
const root = fileURLToPath(new URL("../", import.meta.url));
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const output = join(root, "docs/store/captures");
const buildDirectory = resolve(root, ".vite/store-captures/harness");
assert.equal(dirname(buildDirectory), resolve(root, ".vite/store-captures"));
const configFile = join(root, "vite.harness.config.ts");

// La valeur du drapeau est figée par le même mode de compilation que le paquet publié.
await build({
  configFile,
  mode: "package",
  build: { outDir: buildDirectory, emptyOutDir: true, target: "es2023" },
});
const server = await preview({
  configFile,
  mode: "package",
  build: { outDir: buildDirectory },
  preview: { host: "127.0.0.1", port: 5202, strictPort: true },
});
const browser = launchIsolatedBrowser(`${WIDTH},${HEIGHT}`);
const { send, evaluate, waitFor, navigateToHarness } = browser;
const captures = [];

// Conserver les pixels natifs de Chrome : PNG 24 bits sans canal alpha ni couleur transparente.
function opaquePng(input, width, height) {
  assert.equal(input.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(input.readUInt32BE(8), 13, "En-tête PNG inattendu");
  assert.equal(input.toString("ascii", 12, 16), "IHDR");
  assert.equal(input.readUInt32BE(16), width);
  assert.equal(input.readUInt32BE(20), height);
  assert.equal(input[24], 8, "PNG attendu sur 8 bits par canal");
  assert.equal(input[25], 2, "Chrome doit fournir directement un PNG RGB sans canal alpha");
  for (let offset = 8; offset < input.length; ) {
    assert.ok(offset + 12 <= input.length, "Fragment PNG tronqué");
    const length = input.readUInt32BE(offset);
    assert.ok(offset + length + 12 <= input.length, "Fragment PNG tronqué");
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
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  const click = (selector) =>
    evaluate(
      sessionId,
      `(() => { const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error('Élément absent : ' + ${JSON.stringify(selector)});
        element.click(); })()`,
    );
  const fill = async (selector, text) => {
    await evaluate(
      sessionId,
      `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      input.focus(); input.select();
    })()`,
    );
    await send("Input.insertText", { text }, sessionId);
  };
  const open = async (scenario, tab) => {
    const parameters = new URLSearchParams({ scenario, hote: "1" });
    if (tab) parameters.set("onglet", tab);
    await navigateToHarness(sessionId, `http://127.0.0.1:5202/?${parameters}`);
    await waitFor(
      sessionId,
      "window.__storeCapture?.ready() && document.querySelector('.sidebar-return button')",
      "Le scénario de capture intégré à Jira n'est pas prêt",
    );
    assert.equal(
      await evaluate(sessionId, "document.querySelector('.app-version')?.textContent"),
      version,
    );
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: HEIGHT - 1 }, sessionId);
  };
  const capture = async (file, scenario, expected) => {
    await waitFor(sessionId, expected, `Vue attendue absente : ${scenario}`);
    await evaluate(sessionId, "document.fonts.ready");
    await sleep(400);
    const proof = await evaluate(
      sessionId,
      `(() => {
        const state = window.__storeCapture.inspect();
        const canOpenPlanning = window.__storeCapture.canOpenPlanning();
        const after = window.__storeCapture.inspect();
        const back = document.querySelector('.sidebar-return button');
        const rect = back?.getBoundingClientRect();
        return {
          ...state, canOpenPlanning, viewUnchanged: state.view === after.view,
          planningNavigationAbsent: ![...document.querySelectorAll('button, a')]
            .some(element => /sprint planning/i.test(element.textContent)),
          planningViewAbsent: !document.querySelector('.planning-screen'),
          versionDisplayed: document.querySelector('.app-version')?.textContent ?? null,
          dailyImmersive: !!document.querySelector('.daily-bar'),
          finishDailyVisible: !!document.querySelector('.daily-stop')?.getBoundingClientRect().width,
          returnJiraVisible: !!rect && rect.width > 0 && rect.top >= 0 && rect.bottom <= innerHeight
            && /Retour à Jira/i.test(back.textContent),
          viewport: { width: innerWidth, height: innerHeight }
        };
      })()`,
    );
    assert.equal(proof.version, version);
    assert.equal(proof.versionDisplayed, proof.dailyImmersive ? null : version);
    assert.equal(proof.planningEnabled, false, "Sprint Planning doit être compilé désactivé");
    assert.equal(proof.canOpenPlanning, false, "Le modèle ne doit pas ouvrir Sprint Planning");
    assert.equal(proof.viewUnchanged, true);
    assert.equal(proof.planningNavigationAbsent, true);
    assert.equal(proof.planningViewAbsent, true);
    assert.equal(
      proof.returnJiraVisible,
      !proof.dailyImmersive,
      "Retour Jira hors Daily immersive",
    );
    if (proof.dailyImmersive) assert.equal(proof.finishDailyVisible, true);
    assert.deepEqual(proof.viewport, { width: WIDTH, height: HEIGHT });
    const { data } = await send(
      "Page.captureScreenshot",
      { format: "png", fromSurface: true, captureBeyondViewport: false },
      sessionId,
    );
    const png = opaquePng(Buffer.from(data, "base64"), WIDTH, HEIGHT);
    captures.push({ file, scenario, proof, png });
    console.log(`✓ ${file} : mode package, Planning inaccessible, contexte Jira, PNG RGB`);
  };

  await open("board-soustaches");
  await capture(
    "01-board.png",
    "Board Scrum avec objectifs et sous-tâches",
    "document.querySelectorAll('section.lane').length > 1",
  );

  await open("board-kanban");
  await capture(
    "02-kanban.png",
    "Board Kanban avec objectifs, Build, RUN et OPS",
    "document.querySelectorAll('section.lane').length > 2",
  );

  await open("board-reglages", "board");
  await capture(
    "03-swimlanes.png",
    "Réglages des swimlanes par types de tickets",
    "document.querySelectorAll('.settings-lane').length > 1 && document.querySelectorAll('.sidebar-lane').length > 3",
  );

  await open("board-reglages", "cardColors");
  // Véritable saisie puis publication dans la mémoire du faux Jira. Sa table JQL prend en
  // charge cette requête et renvoie les cartes de priorité haute montrées dans l'aperçu.
  await fill(".color-rule-name", "Priorité haute");
  await fill(".color-rule-jql", "priority = High");
  await waitFor(
    sessionId,
    "document.querySelector('.jql-validation-valid') && !document.querySelector('.settings-savebar .primary').disabled",
    "La règle JQL doit être validée avant application",
  );
  await click(".settings-savebar .primary");
  await waitFor(
    sessionId,
    "!document.querySelector('.settings-savebar.is-changed') && document.querySelector('.color-rule:first-child .color-rule-ok')",
    "La règle JQL doit être enregistrée et colorer les tickets fictifs",
  );
  await capture(
    "04-couleurs.png",
    "Couleurs des cartes : règles JQL et aperçu",
    "document.querySelector('.color-rule-ok') && document.querySelector('.jql-editor')",
  );

  await open("board-soustaches");
  await click(".daily-start");
  await waitFor(sessionId, "document.querySelector('.daily-bar')", "La Daily n'est pas ouverte");
  await click('button[aria-label="Mettre le minuteur en pause"]');
  await capture(
    "05-daily.png",
    "Daily guidée par objectifs, minuteur en pause",
    "document.querySelector('.daily-paused')",
  );

  // Composition promotionnelle distincte des captures : icône existante et véritable aperçu.
  const icon = readFileSync(join(root, "public/icons/icon-128.png")).toString("base64");
  const board = captures[0].png.toString("base64");
  const promoHtml = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:440px;height:280px;overflow:hidden}
    body{font-family:Arial,sans-serif;background:#f2f6fc;color:#172b4d}
    main{height:280px;padding:22px 24px;background:linear-gradient(135deg,#fff,#edf3ff)}
    header{display:flex;align-items:center;gap:12px}header img{width:44px;height:44px}
    h1{font-size:23px;letter-spacing:-.6px;line-height:1.15;margin:0;font-weight:700}
    p{margin:15px 0 10px;font-size:22px;letter-spacing:-.4px;font-weight:500}
    .modes{font-size:12px;letter-spacing:.3px;color:#355fb4;font-weight:700}
    .preview{position:absolute;top:151px;left:24px;width:520px;height:325px;border:1px solid #d2ddef;
      border-radius:9px;overflow:hidden;box-shadow:0 10px 28px #19376924;background:#fff}
    .preview img{display:block;width:520px;height:325px}
  </style></head><body><main><header><img alt="" src="data:image/png;base64,${icon}"><h1>Sprint Goals Board</h1></header>
    <p>Vos objectifs, dans Jira</p><span class="modes">Scrum · Kanban</span>
    <div class="preview"><img alt="Aperçu réel du board avec données fictives" src="data:image/png;base64,${board}"></div>
  </main></body></html>`;
  const { frameTree } = await send("Page.getFrameTree", {}, sessionId);
  await send(
    "Page.setDocumentContent",
    { frameId: frameTree.frame.id, html: promoHtml },
    sessionId,
  );
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 440, height: 280, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await waitFor(
    sessionId,
    "[...document.images].length === 2 && [...document.images].every(image => image.complete && image.naturalWidth > 0)",
    "Les images promotionnelles ne sont pas chargées",
  );
  await evaluate(sessionId, "document.fonts.ready");
  const { data: promoData } = await send(
    "Page.captureScreenshot",
    { format: "png", fromSurface: true, captureBeyondViewport: false },
    sessionId,
  );
  const promoPng = opaquePng(Buffer.from(promoData, "base64"), 440, 280);

  // Publier les fichiers seulement après le succès de tous les contrôles.
  mkdirSync(output, { recursive: true });
  const metadata = (file, png, width, height) => ({
    file,
    width,
    height,
    format: "PNG RGB 24 bits, opaque",
    bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
  });
  for (const capture of captures) writeFileSync(join(output, capture.file), capture.png);
  writeFileSync(join(root, "docs/store/promo-440x280.png"), promoPng);
  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    source:
      "Interface réelle sur données fictives dans le banc d'essai local, contexte Jira simulé",
    build: {
      mode: "package",
      production: true,
      sprintPlanningEnabled: false,
      distributionZipLoaded: false,
    },
    browser: browserVersion.product,
    captures: captures.map(({ file, scenario, proof, png }) => ({
      ...metadata(file, png, WIDTH, HEIGHT),
      scenario,
      proof,
    })),
    promotion: {
      ...metadata("../promo-440x280.png", promoPng, 440, 280),
      source: "Composition HTML/CSS : icône du produit et aperçu de 01-board.png",
    },
  };
  writeFileSync(join(output, "captures.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // Anciens fichiers nommés explicitement : aucune suppression globale des captures du dossier.
  for (const obsolete of [
    "02-famille.png",
    "03-objectifs.png",
    "04-daily.png",
    "05-presentation.png",
    "06-connexion.png",
    "07-recherche-board.png",
  ]) {
    const target = resolve(output, obsolete);
    assert.equal(dirname(target), resolve(output));
    rmSync(target, { force: true });
  }
  console.log(
    `✓ Version ${version} : 5 captures, promotion 440 × 280 et preuves dans captures.json`,
  );
} finally {
  await browser.close();
  await new Promise((resolveClose, reject) => {
    server.httpServer.close((error) => (error ? reject(error) : resolveClose()));
  });
}
