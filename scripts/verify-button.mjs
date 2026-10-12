// Chrome réel, profil vierge et pages Jira FICTIVES. Une copie temporaire du paquet accorde
// les deux hôtes fictifs à l'installation pour tester le vrai script de contenu et le vrai
// chrome.storage.local sans boîte de permission native. Le manifest distribué n'est pas changé.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchIsolatedBrowser } from "./browser-check.mjs";

const dist = process.env.EXTENSION_DIR ?? fileURLToPath(new URL("../dist", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "sprint-goals-button-"));
const unpacked = join(temp, "extension");
const site = "https://acme.atlassian.net";
const otherSite = "https://other.atlassian.net";
const board = `${site}/jira/software/c/projects/ABC/boards/7`;
const key = `jira-button-position.v1:${site}`;
const otherKey = `jira-button-position.v1:${otherSite}`;
cpSync(dist, unpacked, { recursive: true });
const manifest = JSON.parse(readFileSync(join(unpacked, "manifest.json"), "utf8"));
manifest.host_permissions = [`${site}/*`, `${otherSite}/*`];
writeFileSync(join(unpacked, "manifest.json"), JSON.stringify(manifest));
const browser = launchIsolatedBrowser("1600,900");
const { send, evaluate, waitFor, events } = browser;
let pump;
let inspectedSession;
function assert(ok, message) {
  if (!ok) throw new Error(message);
  console.log(`✓ ${message}`);
}
try {
  console.log((await send("Browser.getVersion")).product);
  const { id } = await browser.loadExtension(unpacked);
  const storageTab = await send("Target.createTarget", {
    url: `chrome-extension://${id}/board.html`,
  });
  const storage = await send("Target.attachToTarget", {
    targetId: storageTab.targetId,
    flatten: true,
  });
  const readPosition = () =>
    evaluate(
      storage.sessionId,
      `chrome.storage.local.get(${JSON.stringify(key)}).then(v=>v[${JSON.stringify(key)}]??null)`,
    );
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  inspectedSession = sessionId;
  await send("Page.enable", {}, sessionId);
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://*/*" }] }, sessionId);
  const fixture = `<!doctype html><html><head><style>body{margin:0;font:16px system-ui;background:#f4f5f7;color:#172b4d}header{background:white;padding:32px}main{height:2000px;padding:32px}.columns{display:flex;gap:16px}.columns div{background:#dfe1e6;padding:16px;width:220px;height:400px;border-radius:8px}</style></head><body><header>Jira fictif — test du bouton déplaçable</header><main><h1>Board de vérification</h1><div class="columns"><div>À faire</div><div>En cours</div><div>Terminé</div></div></main></body></html>`;
  let handling = false;
  pump = setInterval(async () => {
    if (handling) return;
    handling = true;
    try {
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event.method !== "Fetch.requestPaused" || event.sessionId !== sessionId) continue;
        events.splice(i, 1);
        await send(
          "Fetch.fulfillRequest",
          {
            requestId: event.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
            body: Buffer.from(fixture).toString("base64"),
          },
          sessionId,
        );
      }
    } finally {
      handling = false;
    }
  }, 20);
  const host = "document.getElementById('sprint-goals-open')";
  const grip = `${host}.shadowRoot.querySelector('.grip')`;
  const rectangle = `(()=>{const r=${host}?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}:null})()`;
  const rect = () => evaluate(sessionId, rectangle);
  const near = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  const visible = `(()=>{const r=${host}?.getBoundingClientRect();const v=visualViewport;return r&&r.left>=v.offsetLeft+11&&r.top>=v.offsetTop+11&&r.right<=v.offsetLeft+v.width-11&&r.bottom<=v.offsetTop+v.height-11})()`;
  async function navigate(url) {
    await send("Page.navigate", { url }, sessionId);
    await waitFor(
      sessionId,
      `${host}?.shadowRoot.querySelector('.open')&&document.readyState==='complete'`,
      "le script de contenu n'a pas affiché le bouton",
    );
  }
  async function size(width, height) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await waitFor(sessionId, visible, "le bouton sort de la fenêtre redimensionnée");
    // Le résultat CDP précède les événements resize : attendre le placement recalculé,
    // même si l'ancienne position reste déjà à l'intérieur de la nouvelle fenêtre.
    const wanted = await readPosition();
    await waitFor(
      sessionId,
      `(()=>{const r=${rectangle},p=${JSON.stringify(wanted)};if(!r)return false;return Math.abs(r.x-(12+(p?p.x*Math.max(0,innerWidth-r.width-24):Math.max(0,innerWidth-r.width-108))))<1&&Math.abs(r.y-(12+(p?p.y*Math.max(0,innerHeight-r.height-24):Math.max(0,innerHeight-r.height-40))))<1})()`,
      "le placement ne suit pas le redimensionnement",
    );
  }
  async function mouse(type, x, y) {
    await send(
      "Input.dispatchMouseEvent",
      { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 },
      sessionId,
    );
  }
  async function dragBy(dx, dy, cancel = false) {
    const p = await evaluate(
      sessionId,
      `(()=>{const r=${grip}.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
    );
    await mouse("mouseMoved", p.x, p.y);
    await mouse("mousePressed", p.x, p.y);
    for (let i = 1; i <= 5; i++) await mouse("mouseMoved", p.x + (dx * i) / 5, p.y + (dy * i) / 5);
    if (cancel)
      await send(
        "Input.dispatchKeyEvent",
        { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
        sessionId,
      );
    await mouse("mouseReleased", p.x + dx, p.y + dy);
    if (cancel)
      await send(
        "Input.dispatchKeyEvent",
        { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
        sessionId,
      );
  }
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await navigate(board);
  const initial = await rect();
  assert(
    (await evaluate(sessionId, visible)) && initial.right === 1504,
    "position initiale visible, à gauche de l'emplacement de Rovo",
  );
  await dragBy(-350, -220);
  const moved = await rect();
  assert(
    near(moved, { x: initial.x - 350, y: initial.y - 220 }) &&
      (await evaluate(sessionId, "!location.search")),
    "le geste souris déplace le bouton sans ouvrir Sprint Goals",
  );
  await waitFor(
    storage.sessionId,
    `chrome.storage.local.get(${JSON.stringify(key)}).then(v=>Boolean(v[${JSON.stringify(key)}]))`,
    "position non enregistrée dans Chrome",
  );
  const saved = await readPosition();
  assert(
    saved.x >= 0 && saved.x <= 1 && saved.y >= 0 && saved.y <= 1,
    "Chrome conserve une position relative par site",
  );

  await send("Page.reload", {}, sessionId);
  await waitFor(
    sessionId,
    `(()=>{const r=${rectangle};return r&&Math.abs(r.x-${moved.x})<1&&Math.abs(r.y-${moved.y})<1})()`,
    "position perdue après rechargement",
  );
  assert(true, "le rechargement restaure la position via le vrai stockage Chrome");
  await size(420, 300);
  assert(
    await evaluate(sessionId, visible),
    "la petite fenêtre garde le bouton entièrement visible avec sa marge",
  );
  assert(
    JSON.stringify(await readPosition()) === JSON.stringify(saved),
    "réduire la fenêtre ne remplace pas la préférence enregistrée",
  );
  await size(1600, 900);
  assert(near(await rect(), moved), "agrandir la fenêtre restitue le placement choisi");
  await send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 }, sessionId);
  await waitFor(sessionId, visible, "le bouton sort du viewport après zoom");
  assert(true, "le zoom visuel garde le bouton à portée");
  await send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }, sessionId);
  await waitFor(
    sessionId,
    `Math.abs(${host}.getBoundingClientRect().x-${moved.x})<1`,
    "placement non restauré après zoom",
  );
  await evaluate(sessionId, "scrollTo(0,600)");
  assert(near(await rect(), moved), "le défilement de Jira ne déplace pas le bouton fixe");
  await dragBy(-100, -100, true);
  assert(near(await rect(), moved), "Échap annule le déplacement en cours");
  await evaluate(sessionId, `${grip}.focus()`);
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
    sessionId,
  );
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
    sessionId,
  );
  assert(Math.abs((await rect()).x - (moved.x - 10)) < 1, "la poignée se déplace aussi au clavier");
  await dragBy(-3000, -2000);
  assert(
    near(await rect(), { x: 12, y: 12 }),
    "un geste hors écran est borné aux marges de la page",
  );
  await dragBy(4000, 3000);
  assert(
    await evaluate(sessionId, visible),
    "le coin inférieur droit reste entièrement accessible",
  );
  await navigate(`${site}/jira/software/c/projects/XYZ/boards/12`);
  await waitFor(
    sessionId,
    `${host}.getBoundingClientRect().right>1587`,
    "le second board ne reprend pas la position",
  );
  assert(true, "les boards d'un même site partagent la position");
  await navigate(`${otherSite}/jira/software/c/projects/XYZ/boards/12`);
  assert(near(await rect(), initial), "un autre site Jira garde son placement par défaut");
  await navigate(board);
  await evaluate(
    storage.sessionId,
    `chrome.storage.local.set({[${JSON.stringify(key)}]:{x:40,y:-8},[${JSON.stringify(otherKey)}]:{x:0.2,y:0.3}})`,
  );
  await waitFor(
    sessionId,
    `(()=>{const r=${rectangle};return r&&r.y===12&&r.right>1587})()`,
    "position hors écran non corrigée",
  );
  assert(true, "une ancienne position hors limites est corrigée à l'affichage");
  await evaluate(storage.sessionId, `chrome.storage.local.remove(${JSON.stringify(key)})`);
  await waitFor(
    sessionId,
    `(()=>{const r=${rectangle};return r&&Math.abs(r.x-${initial.x})<1&&Math.abs(r.y-${initial.y})<1})()`,
    "la remise à zéro n'a pas rejoint le bouton ouvert",
  );
  assert(
    await evaluate(
      storage.sessionId,
      `chrome.storage.local.get(${JSON.stringify(otherKey)}).then(v=>v[${JSON.stringify(otherKey)}].x===0.2)`,
    ),
    "la remise à zéro revient au défaut sans toucher l'autre site",
  );
  await evaluate(sessionId, "history.pushState(null,'','/browse/ABC-1')");
  await waitFor(sessionId, `!${host}`, "bouton resté visible hors board");
  await evaluate(sessionId, "history.pushState(null,'','/jira/software/c/projects/ABC/boards/7')");
  await waitFor(sessionId, `Boolean(${host})`, "bouton absent après navigation Jira");
  await send("Emulation.clearDeviceMetricsOverride", {}, sessionId);
  const full = await send(
    "Runtime.evaluate",
    {
      expression: "document.documentElement.requestFullscreen().then(()=>true)",
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    },
    sessionId,
  );
  assert(full.result?.value === true, "Chrome accepte le passage en plein écran du banc d'essai");
  await waitFor(sessionId, visible, "le bouton sort en plein écran");
  await evaluate(sessionId, "document.exitFullscreen()");
  await waitFor(sessionId, "!document.fullscreenElement", "le plein écran n'est pas fermé");
  await evaluate(
    sessionId,
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
  );
  await waitFor(
    sessionId,
    `(()=>{const r=${rectangle};return r&&Math.abs(r.right-(innerWidth-96))<1&&Math.abs(r.bottom-(innerHeight-28))<1})()`,
    "placement non restauré après le plein écran",
  );
  await waitFor(sessionId, visible, "le bouton sort après le plein écran");
  assert(true, "entrée et sortie du plein écran conservent le bouton visible");
  const open = await evaluate(
    sessionId,
    `(()=>{const r=${host}.shadowRoot.querySelector('.open').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,
  );
  await mouse("mousePressed", open.x, open.y);
  await mouse("mouseReleased", open.x, open.y);
  await waitFor(
    sessionId,
    "location.search.includes('sprintGoals=1')&&Boolean(document.getElementById('sprint-goals-direct'))",
    "le clic du bouton ne lance plus le board",
  );
  assert(true, "le clic normal ouvre toujours Sprint Goals après les déplacements");
} catch (error) {
  console.error(`✗ ${error.stack ?? error.message}`);
  if (inspectedSession)
    console.error(
      await evaluate(
        inspectedSession,
        `(()=>{const h=document.getElementById('sprint-goals-open'),r=h?.getBoundingClientRect();return {url:location.href,ready:document.readyState,rect:r?.toJSON(),viewport:{width:innerWidth,height:innerHeight,visual:visualViewport.height},fullscreen:Boolean(document.fullscreenElement),frame:Boolean(document.querySelector('#sprint-goals-direct')),button:h?.shadowRoot.querySelector('.open')?.outerHTML}})()`,
      ).catch(() => null),
    );
  process.exitCode = 1;
} finally {
  clearInterval(pump);
  await browser.close();
  rmSync(temp, { recursive: true, force: true });
}
