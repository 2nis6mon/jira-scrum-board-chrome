// Vérification Chrome isolée de la vue Jira directe, sans session ni données de l'utilisateur.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const chromePath =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// JIRA_DIRECT_DIST : un autre dossier construit, pour ne pas reconstruire le paquet en essai.
const dist =
  process.env.JIRA_DIRECT_DIST ??
  fileURLToPath(new URL("../dist-jira-direct-test", import.meta.url));
if (!existsSync(join(dist, "manifest.json"))) process.exit(2);

const profile = mkdtempSync(join(tmpdir(), "sprint-goals-direct-"));
const chromeProcess = spawn(
  chromePath,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-pipe",
    "--enable-unsafe-extension-debugging",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1600,900",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
);

const pending = new Map();
const events = [];
let nextId = 0;
let buffer = "";
chromeProcess.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else events.push(message);
  }
});

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`délai dépassé : ${method}`)), 15000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(`${method} : ${message.error.message}`));
      else resolve(message.result);
    });
    chromeProcess.stdio[3].write(
      `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
    );
  });
}
const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
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
  console.log(`✓ ${message}`);
}

try {
  const { id: extensionId } = await send("Extensions.loadUnpacked", { path: dist });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://*/*" }] }, sessionId);
  const fixture = `<!doctype html><html><body><main id="jira">Board Jira normal</main>
    <aside id="ticket" hidden style="position:fixed;right:0;top:0;width:600px;height:100vh;background:white">
      <button aria-label="Fermer" onclick="history.pushState(null,'',location.pathname);this.parentElement.hidden=true">Fermer</button>
      <a href="/browse/ABC-102">ABC-102</a><h1>Ticket Jira réel</h1>
      <button aria-label="Code Review - Changer le statut" onclick="openStatusMenu()">Code Review</button>
    </aside>
    <script>if(new URL(location.href).searchParams.has('selectedIssue'))document.querySelector('#ticket').hidden=false;
    // Menu de statut du faux Jira : 21 a un écran moderne, 31 s'exécute sans écran, 41 a un écran
    // « classique » dont le titre et les champs sont dans une iframe qui grandit en se chargeant.
    function openStatusMenu(){setTimeout(function(){
      var menu=document.createElement('div');menu.setAttribute('role','menu');
      menu.innerHTML='<button role=menuitem data-transition-id=21>Démarrer</button><button role=menuitem data-transition-id=31>Démarrer la revue</button><button role=menuitem data-transition-id=41>Merge into develop</button>';
      var items=menu.querySelectorAll('button');
      items[0].onclick=function(){var form=document.createElement('div');form.setAttribute('role','dialog');form.style.cssText='position:fixed;width:680px;height:500px';form.innerHTML='<h2>Démarrer</h2><form id=transition-jira><label>Temps passé <input required></label><button type=submit>Valider</button></form>';document.body.append(form);};
      items[1].onclick=function(){document.body.dataset.executed='31';};
      items[2].onclick=function(){
        var legacy=document.createElement('div');legacy.setAttribute('role','dialog');legacy.id='legacy-dialog';
        legacy.style.cssText='position:fixed;left:100px;top:40px;width:620px;height:200px;background:white';
        var frame=document.createElement('iframe');frame.style.cssText='border:0;width:100%;height:100%';
        frame.srcdoc='<h2>Merge into develop</h2><form id=legacy-form><label>Time Spent <input required></label></form>';
        legacy.append(frame);document.body.append(legacy);
        setTimeout(function(){legacy.style.height='560px';},400);
      };
      document.body.append(menu);
    },100);}
    </script>
  </body></html>`;
  let handling = false;
  const pump = setInterval(async () => {
    if (handling) return;
    handling = true;
    try {
      for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event.method !== "Fetch.requestPaused") continue;
        events.splice(index, 1);
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
  try {
    const special =
      "https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7?sprintGoals=1";
    await send("Page.navigate", { url: special }, sessionId);
    await sleep(500);
    const injectSource = stripTypeScriptTypes(
      readFileSync(new URL("../src/experiment/injectBoard.ts", import.meta.url), "utf8"),
    ).replace("export function", "function");
    await evaluate(
      sessionId,
      `${injectSource};injectBoard('chrome-extension://${extensionId}/board.html',${JSON.stringify(special)})`,
    );
    await sleep(1600);
    assert(
      await evaluate(sessionId, "Boolean(document.querySelector('#sprint-goals-direct'))"),
      "l'URL spéciale affiche le board Sprint Goals",
    );
    assert(
      await evaluate(
        sessionId,
        "(()=>{const r=document.querySelector('#sprint-goals-direct').getBoundingClientRect();return r.left===0&&r.top===0&&r.width===innerWidth&&r.height===innerHeight})()",
      ),
      "le board masque toute la page Jira",
    );
    const { targetInfos } = await send("Target.getTargets");
    const boardFrame = targetInfos.find(
      (target) =>
        target.type === "iframe" &&
        target.url.startsWith(`chrome-extension://${extensionId}/board.html`),
    );
    assert(boardFrame, "l'application réelle est chargée dans la page Jira");
    const child = await send("Target.attachToTarget", {
      targetId: boardFrame.targetId,
      flatten: true,
    });
    const REFUSAL = "ne s'affiche que dans la page Jira de votre site connecté";
    // Profil vierge : le site n'est pas autorisé dans Chrome, la page encadrée ne lit rien.
    assert(
      await evaluate(
        child.sessionId,
        `document.body.innerText.includes(${JSON.stringify(REFUSAL)}) && !document.querySelector('.workspace, .connection')`,
      ),
      "sans autorisation Chrome du site, la page encadrée n'affiche que le refus",
    );
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-issue',key:'ABC-102'},'https://acme.atlassian.net')",
    );
    await sleep(900);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;const r=d.getBoundingClientRect();const margin=Math.min(60,Math.max(16,innerHeight*.05));return Math.abs(r.width-1280)<2&&Math.abs(r.height-(innerHeight-margin*2))<2})()",
      ),
      "la popin ticket reprend 1 280 px et les marges Jira mesurées",
    );
    assert(
      await evaluate(
        sessionId,
        "document.querySelector('dialog iframe').style.visibility==='visible'",
      ),
      "le panneau natif du ticket est visible dans la popin",
    );
    await evaluate(
      sessionId,
      "document.querySelector('dialog iframe').contentDocument.querySelector('#ticket [aria-label=Fermer]').click()",
    );
    await sleep(700);
    assert(
      await evaluate(sessionId, "!document.querySelector('dialog[open]')"),
      "fermer une fiche conserve le board",
    );
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-issue',key:'ABC-102',transition:{id:'21',name:'Démarrer'}},'https://acme.atlassian.net')",
    );
    await sleep(600);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const d=document.querySelector('dialog[open]');return Boolean(d)&&d.querySelector('iframe').style.visibility==='hidden'&&d.textContent.includes('Ouverture de « Démarrer »')})()",
      ),
      "pendant l'ouverture d'une transition, la fiche du ticket reste cachée",
    );
    await sleep(2000);
    assert(
      await evaluate(
        sessionId,
        "Boolean(document.querySelector('dialog iframe').contentDocument.querySelector('#transition-jira'))",
      ),
      "le formulaire Jira de la transition est ouvert directement",
    );
    assert(
      await evaluate(
        sessionId,
        "(()=>{const outer=document.querySelector('dialog[open]').getBoundingClientRect();const doc=document.querySelector('dialog iframe').contentDocument;const transition=doc.querySelector('[data-sprint-goals-transition]');return outer.width<1280&&getComputedStyle(doc.querySelector('#ticket')).visibility==='hidden'&&transition&&getComputedStyle(transition).visibility==='visible'})()",
      ),
      "une transition recadre la popin sur le seul formulaire Jira",
    );
    assert(
      await evaluate(
        sessionId,
        "!document.querySelector('dialog iframe').contentDocument.querySelector('#transition-jira').matches(':valid')",
      ),
      "le formulaire requis reste à remplir et n'est jamais validé automatiquement",
    );
    // Transition ambiguë : « Démarrer la revue » (31, sans écran : la cliquer l'exécute) mentionne
    // « Revue » (99) sans porter son identifiant ni avoir exactement ce libellé. Rien n'est cliqué ;
    // le menu reste ouvert pour l'utilisateur.
    await evaluate(
      sessionId,
      "document.querySelector('dialog[open]').dispatchEvent(new Event('cancel'))",
    );
    await sleep(300);
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-issue',key:'ABC-102',transition:{id:'99',name:'Revue'}},'https://acme.atlassian.net')",
    );
    await sleep(1600);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const doc=document.querySelector('dialog iframe').contentDocument;return !doc.body.dataset.executed&&!doc.querySelector('#transition-jira')&&Boolean(doc.querySelector('[role=menu]'))})()",
      ),
      "une transition ambiguë n'est jamais cliquée : le menu Jira reste au choix de l'utilisateur",
    );
    // Écran de transition « classique » : rien dans la fenêtre elle-même, titre et champs dans une
    // iframe. La popin se recadre sur cette seule fenêtre, à sa taille une fois chargée.
    await evaluate(
      sessionId,
      "document.querySelector('dialog[open]').dispatchEvent(new Event('cancel'))",
    );
    await sleep(300);
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-issue',key:'ABC-102',transition:{id:'41',name:'Merge into develop'}},'https://acme.atlassian.net')",
    );
    await sleep(3200);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const popin=document.querySelector('dialog[open]');const doc=document.querySelector('dialog iframe').contentDocument;const legacy=doc.querySelector('#legacy-dialog');if(!popin||!legacy)return false;const r=popin.getBoundingClientRect();return legacy.hasAttribute('data-sprint-goals-transition')&&getComputedStyle(doc.querySelector('#ticket')).visibility==='hidden'&&Math.abs(r.width-620)<4&&r.height>Math.min(540,innerHeight-40)})()",
      ),
      "un écran de transition classique (champs dans une iframe) s'affiche seul, à sa taille",
    );
    // Un autre site Atlassian qui encadre la page du board, en annonçant le vôtre : refusé.
    await send(
      "Page.navigate",
      { url: "https://evil.atlassian.net/jira/software/c/projects/ABC/boards/7" },
      sessionId,
    );
    await sleep(700);
    await evaluate(
      sessionId,
      `(()=>{const frame=document.createElement('iframe');const url=new URL('chrome-extension://${extensionId}/board.html');url.searchParams.set('jiraHost','https://acme.atlassian.net');url.searchParams.set('jiraBoard',${JSON.stringify(special)});url.searchParams.set('probe','autre-site');frame.src=url.href;document.body.append(frame)})()`,
    );
    await sleep(1200);
    const { targetInfos: afterEvil } = await send("Target.getTargets");
    const evilFrame = afterEvil.find(
      (target) => target.type === "iframe" && target.url.includes("probe=autre-site"),
    );
    assert(evilFrame, "un autre site Atlassian peut charger la page (ressource exposée)");
    const evil = await send("Target.attachToTarget", {
      targetId: evilFrame.targetId,
      flatten: true,
    });
    assert(
      await evaluate(
        evil.sessionId,
        `document.body.innerText.includes(${JSON.stringify(REFUSAL)}) && !document.querySelector('.workspace, .connection')`,
      ),
      "encadrée par un autre site Atlassian, la page n'affiche que le refus",
    );
    await send(
      "Page.navigate",
      { url: "https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7" },
      sessionId,
    );
    await sleep(900);
    assert(
      await evaluate(sessionId, "!document.querySelector('#sprint-goals-direct')"),
      "une URL Jira normale reste entièrement normale",
    );
  } finally {
    clearInterval(pump);
  }
} finally {
  await send("Browser.close").catch(() => {});
  await sleep(200);
  chromeProcess.kill();
  rmSync(profile, { recursive: true, force: true });
}
