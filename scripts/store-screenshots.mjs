// Captures du Chrome Web Store (1280 × 800) prises sur le banc d'essai : données FICTIVES, jamais
// le Jira de quelqu'un. Chrome sans interface, profil vierge.
//
// Usage : node scripts/store-screenshots.mjs  →  docs/store/captures/*.png
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1280;
const HEIGHT = 800;
// Le banc d'essai affiche une version fictive : la capture montre celle du paquet publié.
const VERSION = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).version;
const out = fileURLToPath(new URL("../docs/store/captures/", import.meta.url));
mkdirSync(out, { recursive: true });

const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 5202, strictPort: true },
});
await server.listen();
const profile = mkdtempSync(join(tmpdir(), "scrum-board-captures-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-pipe",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--window-size=${WIDTH},${HEIGHT}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pending = new Map();
let nextId = 0;
let buffer = "";
chrome.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  }
});

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`délai dépassé : ${method}`)), 15_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(`${method} : ${message.error.message}`));
      else resolve(message.result);
    });
    chrome.stdio[3].write(
      `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
    );
  });
}

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async (expression) =>
    (
      await send(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      )
    ).result.value;
  const waitFor = async (expression, what) => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`jamais affiché : ${what}`);
  };
  const click = (selector) =>
    evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("absent : " + ${JSON.stringify(selector)}); el.click(); })()`);
  const hover = async (selector) => {
    const box =
      await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})
      .getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...box }, sessionId);
  };
  const shoot = async (name) => {
    await sleep(400);
    await evaluate(`document.querySelectorAll(".app-version").forEach((el) => {
      el.textContent = ${JSON.stringify(VERSION)}; })`);
    const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
    console.log(`✓ docs/store/captures/${name}.png`);
  };
  const open = async (scenario) => {
    await send("Page.navigate", { url: `http://127.0.0.1:5202/?scenario=${scenario}` }, sessionId);
    await waitFor("document.querySelectorAll('section.lane').length > 1", "le board");
    // Pas de curseur de texte ni de survol parasite.
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: HEIGHT - 1 }, sessionId);
  };

  await send("Page.enable", {}, sessionId);
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );

  // 1. Le board : une swimlane par Sprint Goal.
  await open("board-soustaches");
  await shoot("01-board");

  // 2. Une story et ses sous-tâches éclairées au survol.
  const story = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-issue-key]')];
    const story = cards.find((card) => card.querySelector('.card-subtasks'));
    return story ? story.dataset.issueKey : null; })()`);
  if (story) {
    await hover(`[data-issue-key="${story}"]`);
    await shoot("02-famille");
  }

  // 3. Réglages du board, onglet Objectifs : couleur, masquage et épinglage de chaque objectif.
  await send("Page.navigate", { url: "http://127.0.0.1:5202/?scenario=board-epingle" }, sessionId);
  await waitFor(
    "document.querySelectorAll('.settings-goal').length > 0 && document.querySelector('.pin-list') !== null",
    "les objectifs du sprint",
  );
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: HEIGHT - 1 }, sessionId);
  await shoot("03-objectifs");

  // 4. Mode Daily (le plein écran est refusé sans interface : la page reste la même).
  await open("board-soustaches");
  await click(".daily-start");
  await waitFor("document.querySelector('.daily-bar') !== null", "la daily");
  await shoot("04-daily");

  // 5. Mode présentation.
  await open("board-soustaches");
  await click('button[aria-label="Mode présentation"]');
  await waitFor("document.querySelector('.board-screen-presenting') !== null", "la présentation");
  // La bulle « Échap pour revenir » s'efface d'elle-même au bout de 5 s.
  await waitFor("document.querySelector('.presentation-hint') === null", "la fin de la bulle");
  await shoot("05-presentation");
} finally {
  await send("Browser.close").catch(() => {});
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
  await server.close();
}
