// Chrome réel, profil vierge et pages Jira FICTIVES. Une copie temporaire du paquet accorde
// les deux hôtes fictifs à l'installation pour tester le vrai script de contenu et le vrai
// chrome.storage.local sans boîte de permission native. Le manifest distribué n'est pas changé.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
function removeTemporaryCopy() {
  const resolvedTemp = resolve(temp);
  if (
    dirname(resolvedTemp) !== resolve(tmpdir()) ||
    !resolvedTemp.startsWith(join(resolve(tmpdir()), "sprint-goals-button-"))
  )
    throw new Error("Nettoyage refusé : copie de test hors du dossier temporaire attendu.");
  rmSync(resolvedTemp, { recursive: true, force: true });
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
  const fixture = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;font:16px system-ui;background:#f4f5f7;color:#172b4d}
    header{height:56px;display:flex;align-items:center;gap:36px;padding:0 24px;background:#0c66e4;color:white}
    header strong{font-size:18px}header nav{display:flex;gap:28px;font-size:14px}
    .header-space{margin-left:auto;width:140px;height:48px;flex:none}
    main{height:2000px;padding:32px}h1{margin:4px 0 12px;font-size:28px}
    .hint{margin:0 0 32px;color:#626f86}.columns{display:flex;gap:20px}
    .column{background:#ebedf0;padding:16px;width:300px;min-height:400px;border-radius:8px}
    .column h2{font-size:13px;font-weight:600;margin:0 0 18px;text-transform:uppercase}
    .card{padding:16px;margin:12px 0;background:white;border-radius:6px;box-shadow:0 1px 2px #172b4d1a}
    .card span{display:block;font-size:12px;color:#626f86;margin-top:14px}
  </style></head><body><header><strong>Jira fictif</strong><nav><span>Projets</span><span>Tableaux</span><span>Recherche</span></nav><div class="header-space" aria-label="Emplacement libre pour le raccourci"></div></header>
    <main><h1>Board de démonstration</h1><p class="hint">Données fictives · Vérification du raccourci Sprint Goals dans un en-tête de 56 px</p>
      <div class="columns"><section class="column"><h2>À faire</h2><div class="card">Préparer la prochaine démonstration<span>DEMO-1</span></div></section>
        <section class="column"><h2>En cours</h2><div class="card">Améliorer le parcours de navigation<span>DEMO-2</span></div></section>
        <section class="column"><h2>Terminé</h2><div class="card">Documenter les objectifs d’équipe<span>DEMO-3</span></div></section></div>
    </main></body></html>`;
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
  // Sous Windows, la barre de défilement réduit le viewport visible sans réduire innerWidth.
  const atRightMargin = (margin) =>
    `(()=>{const r=${rectangle},v=visualViewport;return r&&Math.abs(r.right-(v.offsetLeft+v.width-${margin}))<1})()`;
  const visible = `(()=>{const r=${host}?.getBoundingClientRect();const v=visualViewport;return r&&r.left>=v.offsetLeft+3&&r.top>=v.offsetTop+3&&r.right<=v.offsetLeft+v.width-3&&r.bottom<=v.offsetTop+v.height-3})()`;
  async function navigate(url) {
    await send("Page.navigate", { url }, sessionId);
    await waitFor(
      sessionId,
      `${host}?.shadowRoot.querySelector('.open img')?.complete&&${host}.shadowRoot.querySelector('.open img').naturalWidth>0&&document.readyState==='complete'`,
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
      `(()=>{const r=${rectangle},p=${JSON.stringify(wanted)},v=visualViewport;if(!r)return false;return Math.abs(r.x-(v.offsetLeft+4+(p?p.x*Math.max(0,v.width-r.width-8):Math.max(0,v.width-r.width-100))))<1&&Math.abs(r.y-(v.offsetTop+4+(p?p.y*Math.max(0,v.height-r.height-8):Math.max(0,v.height-r.height-32))))<1})()`,
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
  const compact = await evaluate(
    sessionId,
    `(() => {
    const shadow = ${host}.shadowRoot;
    const open = shadow.querySelector('.open');
    const grip = shadow.querySelector('.grip');
    const label = open.querySelector('.label');
    const labelRect = label?.getBoundingClientRect();
    const labelStyle = label && getComputedStyle(label);
    return {
      gripWidth: grip.getBoundingClientRect().width,
      openWidth: open.getBoundingClientRect().width,
      openHeight: open.getBoundingClientRect().height,
      labelHidden: !label || (labelRect.width <= 1 && labelRect.height <= 1 &&
        labelStyle.position === 'absolute' && labelStyle.clipPath === 'inset(50%)'),
      label: open.getAttribute('aria-label'),
      title: open.title,
      icon: !!open.querySelector('img')?.complete && open.querySelector('img')?.naturalWidth > 0
    };
  })()`,
  );
  assert(
    initial.width === 58 &&
      initial.height === 34 &&
      compact.gripWidth === 24 &&
      compact.openWidth === 32 &&
      compact.openHeight === 32,
    "le raccourci compact mesure 58 × 34 px, avec poignée de 24 px et ouverture de 32 px",
  );
  assert(
    compact.labelHidden &&
      compact.icon &&
      /Sprint Goals/.test(compact.label ?? "") &&
      /Sprint Goals/.test(compact.title),
    "l’icône seule conserve son nom accessible et son infobulle Sprint Goals",
  );
  assert(
    (await evaluate(sessionId, visible)) &&
      (await evaluate(sessionId, atRightMargin(96))) &&
      (await evaluate(
        sessionId,
        `Math.abs(${host}.getBoundingClientRect().bottom-(visualViewport.offsetTop+visualViewport.height-28))<1`,
      )),
    "position initiale visible, à 96 px de la droite et 28 px du bas près de Rovo",
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
  assert(near(await rect(), { x: 4, y: 4 }), "un geste hors écran est borné aux marges de la page");
  await dragBy(4000, 3000);
  assert(
    await evaluate(sessionId, visible),
    "le coin inférieur droit reste entièrement accessible",
  );
  await navigate(`${site}/jira/software/c/projects/XYZ/boards/12`);
  await waitFor(sessionId, atRightMargin(4), "le second board ne reprend pas la position");
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
    `(${atRightMargin(4)})&&Math.abs(${host}.getBoundingClientRect().y-(visualViewport.offsetTop+4))<1`,
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
  // Vrai glissé depuis le coin inférieur vers l’espace libre d’un en-tête de 56 px.
  const headerTarget = await evaluate(
    sessionId,
    `(() => {
    const header = document.querySelector('header').getBoundingClientRect();
    const button = ${host}.getBoundingClientRect();
    return {x:header.right-button.width-24,y:header.top+(header.height-button.height)/2};
  })()`,
  );
  const beforeHeader = await rect();
  await dragBy(headerTarget.x - beforeHeader.x, headerTarget.y - beforeHeader.y);
  assert(
    near(await rect(), headerTarget) &&
      (await evaluate(
        sessionId,
        `(() => {const r=${host}.getBoundingClientRect(),h=document.querySelector('header').getBoundingClientRect();return h.height===56&&r.top>=h.top+4&&r.bottom<=h.bottom-4&&!location.search})()`,
      )),
    "un vrai glissé place entièrement le bouton compact dans l’en-tête de 56 px sans l’ouvrir",
  );
  await waitFor(
    storage.sessionId,
    `chrome.storage.local.get(${JSON.stringify(key)}).then(v=>v[${JSON.stringify(key)}]?.y<0.02)`,
    "la position dans l’en-tête n’est pas enregistrée",
  );
  await send("Page.reload", {}, sessionId);
  await waitFor(
    sessionId,
    `(() => {const r=${rectangle};return r&&Math.abs(r.x-${headerTarget.x})<1&&Math.abs(r.y-${headerTarget.y})<1})()`,
    "le rechargement ne restaure pas la position dans l’en-tête",
  );
  assert(true, "le rechargement restitue le raccourci au même endroit dans l’en-tête");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 24, y: 110 }, sessionId);
  await waitFor(
    sessionId,
    `${host}?.shadowRoot.querySelector('.open img')?.complete&&${host}.shadowRoot.querySelector('.open img').naturalWidth>0`,
    "l’icône du bouton n’est pas chargée après rechargement",
  );
  await evaluate(sessionId, "document.fonts.ready");
  const { data: screenshot } = await send(
    "Page.captureScreenshot",
    { format: "png", fromSurface: true, captureBeyondViewport: false },
    sessionId,
  );
  const screenshotPath = fileURLToPath(
    new URL("../.vite/bouton-jira-discret.png", import.meta.url),
  );
  mkdirSync(dirname(screenshotPath), { recursive: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot, "base64"));
  console.log(`✓ Capture de revue sur données fictives : ${screenshotPath}`);
  await evaluate(storage.sessionId, `chrome.storage.local.remove(${JSON.stringify(key)})`);
  await waitFor(
    sessionId,
    `(() => {const r=${rectangle};return r&&Math.abs(r.x-${initial.x})<1&&Math.abs(r.y-${initial.y})<1})()`,
    "la position par défaut n’est pas restaurée après le contrôle de l’en-tête",
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
    `(${atRightMargin(96)})&&Math.abs(${host}.getBoundingClientRect().bottom-(visualViewport.offsetTop+visualViewport.height-28))<1`,
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
        `(()=>{const h=document.getElementById('sprint-goals-open'),r=h?.getBoundingClientRect(),v=visualViewport;return {url:location.href,ready:document.readyState,rect:r?.toJSON(),viewport:{width:innerWidth,height:innerHeight,visual:{width:v.width,height:v.height,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop}},fullscreen:Boolean(document.fullscreenElement),frame:Boolean(document.querySelector('#sprint-goals-direct')),button:h?.shadowRoot.querySelector('.open')?.outerHTML}})()`,
      ).catch(() => null),
    );
  process.exitCode = 1;
} finally {
  clearInterval(pump);
  await browser.close();
  removeTemporaryCopy();
}
