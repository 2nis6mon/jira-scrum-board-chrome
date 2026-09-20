// Régression du glisser-déposer sur les vues réelles, avec Jira fictif et profil Chrome vierge.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 5202, strictPort: true },
});
await server.listen();
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
    "--window-size=1600,1200",
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  const open = async (suffix = "") => {
    await send(
      "Page.navigate",
      { url: `http://127.0.0.1:5202/?scenario=board-form${suffix}` },
      sessionId,
    );
    await sleep(1200);
  };
  const drop = async () =>
    evaluate(
      sessionId,
      `(async()=>{
    const data=new DataTransfer();
    const card=document.querySelector('[data-issue-key="ABC-102"]');
    card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));
    await new Promise(r=>setTimeout(r,200));
    const zone=document.querySelector('[data-lane-id="goal:g-paiement"] [data-status-id="3"]');
    zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
    await new Promise(r=>setTimeout(r,200));
    return Boolean(document.querySelector('dialog[open]'));
  })()`,
    );
  await open();
  assert(await drop(), "Le formulaire natif doit s’ouvrir");
  assert(
    await evaluate(
      sessionId,
      "document.querySelector('#transition-field-summary').value === 'Résumé existant' && window.__transitionProbe.length === 0",
    ),
    "Préremplissage sans écriture",
  );
  await evaluate(
    sessionId,
    "[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Annuler').click()",
  );
  await sleep(100);
  assert(
    await evaluate(
      sessionId,
      "!document.querySelector('dialog[open]') && window.__transitionProbe.length === 0",
    ),
    "Annuler ne doit rien envoyer",
  );
  assert(await drop(), "Le formulaire doit pouvoir être rouvert");
  await evaluate(sessionId, "document.querySelector('dialog form').requestSubmit()");
  await sleep(150);
  assert(
    await evaluate(
      sessionId,
      "document.querySelector('dialog').textContent.includes('Champ obligatoire') && window.__transitionProbe.length === 0",
    ),
    "Champ obligatoire validé avant envoi",
  );
  await evaluate(
    sessionId,
    `(()=>{
    const select=document.querySelector('#transition-field-resolution');select.value='{"id":"1"}';select.dispatchEvent(new Event('change',{bubbles:true}));
    const comment=document.querySelector('#transition-field-comment');comment.value='Validation effectuée';comment.dispatchEvent(new Event('input',{bubbles:true}));
  })()`,
  );
  await sleep(100);
  await evaluate(sessionId, "document.querySelector('dialog form').requestSubmit()");
  await sleep(250);
  assert(
    await evaluate(
      sessionId,
      "document.querySelector('dialog').textContent.includes('Refus du validateur') && document.querySelector('#transition-field-comment').value === 'Validation effectuée' && window.__transitionProbe.length === 1",
    ),
    "Le refus doit conserver le formulaire et ses valeurs",
  );
  await evaluate(sessionId, "document.querySelector('dialog form').requestSubmit()");
  await sleep(400);
  const result = await evaluate(
    sessionId,
    `({closed:!document.querySelector('dialog[open]'), requests:window.__transitionProbe, cell:document.querySelector('[data-issue-key="ABC-102"]').closest('.lane-cell').getAttribute('aria-label')})`,
  );
  assert(
    result.closed && result.cell.endsWith("— En cours") && result.requests.length === 2,
    "La correction doit terminer le déplacement",
  );
  assert(
    result.requests[1].fields.resolution.id === "1" &&
      !("summary" in result.requests[1].fields) &&
      result.requests[1].update.comment[0].add.body.type === "doc",
    "Valeurs et commentaire envoyés dans la seule transition, sans écraser le résumé",
  );
  console.log(
    "✓ Formulaire Chrome : préremplissage, annulation, champ obligatoire, refus Jira, conservation de saisie et réussite",
  );
  await open("&unsupported=1");
  assert(await drop(), "Formulaire du champ tiers attendu");
  assert(
    await evaluate(
      sessionId,
      "document.querySelector('dialog button[type=submit]').disabled && document.querySelector('dialog a').href.endsWith('/browse/ABC-102') && window.__transitionProbe.length===0",
    ),
    "Champ obligatoire inconnu : pas d’écriture, lien Jira disponible",
  );
  console.log("✓ Champ obligatoire non pris en charge : envoi bloqué et lien vers Jira");
} finally {
  await send("Browser.close").catch(() => {});
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
  await server.close();
}
