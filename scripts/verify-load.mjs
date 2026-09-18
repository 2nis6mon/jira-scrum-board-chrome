// Vérifie que Chrome accepte l'extension construite dans dist/.
//
// Lance un Chrome sans interface sur un PROFIL TEMPORAIRE VIERGE (aucune session, aucun
// cookie, rien de commun avec le profil de l'utilisateur), y charge dist/ par la commande
// CDP Extensions.loadUnpacked, puis contrôle : identifiant, service worker, rendu de la
// page, permissions accordées, et blocage par la CSP d'une connexion hors *.atlassian.net.
// Aucune requête n'est émise vers Jira.
//
// Usage : node scripts/verify-load.mjs [capture.png]

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXPECTED_ID = "efhpkdoiimdggndnfcgdoaniobdcmokb";
const dist = fileURLToPath(new URL("../dist", import.meta.url));
const screenshotPath = process.argv[2];

if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/manifest.json introuvable : lancer `npm run build` d'abord.");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));

const profile = mkdtempSync(join(tmpdir(), "scrum-board-verif-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-pipe",
    "--enable-unsafe-extension-debugging",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,800",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pending = new Map();
const events = [];
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
    } else {
      events.push(message);
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
    const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    chrome.stdio[3].write(`${JSON.stringify(payload)}\0`);
  });
}

async function evaluate(sessionId, expression) {
  const { result } = await send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  return result.value;
}

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

try {
  console.log((await send("Browser.getVersion")).product);

  const { id } = await send("Extensions.loadUnpacked", { path: dist });
  check("Chrome accepte le manifest", true);
  check("identifiant figé par la clé", id === EXPECTED_ID, id);

  await sleep(1000);
  const { targetInfos } = await send("Target.getTargets");
  const worker = targetInfos.find((t) => t.type === "service_worker" && t.url.includes(id));
  check("service worker enregistré", Boolean(worker), worker?.url ?? "absent");

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  await send("Log.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url: `chrome-extension://${id}/board.html` }, sessionId);
  await sleep(1500);

  const text = await evaluate(sessionId, "document.body.innerText");
  check("la page s'affiche", text.includes("Scrum Board"), JSON.stringify(text.slice(0, 80)));
  check("version du manifest affichée", text.includes(manifest.version), manifest.version);

  const inlineScripts = await evaluate(
    sessionId,
    "document.querySelectorAll('script:not([src])').length",
  );
  check("aucun script en ligne", inlineScripts === 0);

  const pageProblems = events.filter(
    (e) =>
      e.sessionId === sessionId &&
      (e.method === "Runtime.exceptionThrown" ||
        (e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level))),
  );
  check("aucune erreur ni avertissement au chargement", pageProblems.length === 0);
  for (const e of pageProblems) {
    console.log(`    ${(e.params.entry?.text ?? JSON.stringify(e.params)).slice(0, 240)}`);
  }

  const granted = JSON.parse(
    await evaluate(sessionId, "chrome.permissions.getAll().then(JSON.stringify)"),
  );
  check(
    "aucune permission d'hôte accordée à l'installation",
    granted.origins.length === 0,
    JSON.stringify(granted),
  );

  // Sonde volontaire : la CSP doit refuser tout hôte hors *.atlassian.net.
  const probe = await evaluate(
    sessionId,
    "fetch('https://example.com/').then(() => 'autorisé', () => 'bloqué')",
  );
  check("connexion hors *.atlassian.net bloquée par la CSP", probe === "bloqué", probe);

  if (screenshotPath) {
    const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(screenshotPath, Buffer.from(data, "base64"));
    console.log(`Capture : ${screenshotPath}`);
  }
} catch (error) {
  check("exécution de la vérification", false, error.message);
} finally {
  chrome.kill("SIGTERM");
  await sleep(800);
  rmSync(profile, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("\nTous les contrôles passent.");
