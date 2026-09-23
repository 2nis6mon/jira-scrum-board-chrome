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
const dist = process.env.JIRA_DIRECT_DIST ?? fileURLToPath(new URL("../dist", import.meta.url));
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
    // Menu de statut du faux Jira, libellés « nom → statut d'arrivée » sans identifiant, comme
    // dans Jira Cloud. « TEST OK → Validé » ouvre la fenêtre moderne ; « TEST OK → Refusé », même
    // nom mais autre statut, s'exécuterait sans écran et ne doit jamais être cliqué.
    function openStatusMenu(){setTimeout(function(){
      var menu=document.createElement('div');menu.setAttribute('role','menu');
      menu.innerHTML='<button role=menuitem>TEST OK<span aria-hidden=true> → </span><span>Validé</span></button><button role=menuitem>TEST OK<span>Refusé</span></button>';
      var items=menu.querySelectorAll('button');
      items[0].onclick=function(){
        var modal=document.createElement('div');modal.setAttribute('role','dialog');modal.id='jira-modal';
        modal.style.cssText='position:fixed;left:120px;top:60px;width:640px;height:480px;background:white';
        modal.innerHTML='<h2>TEST OK</h2><form id=jira-modal-form><label>Requested Version/s <input required></label><button type=submit>Update</button></form>';
        document.body.append(modal);
      };
      items[1].onclick=function(){document.body.dataset.executed='refuse';};
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
    // Transition du workflow qui exige des champs : Jira Cloud n'a AUCUNE adresse qui serve sa
    // fenêtre. On ouvre donc la fiche sans la montrer, on déroule le menu de statut et on n'y clique
    // que l'élément qui porte le nom de la transition ET son statut d'arrivée ; celui de même nom
    // vers un autre statut, qui s'exécuterait sans écran, n'est jamais cliqué.
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-issue',key:'ABC-102',transition:{id:'51',name:'TEST OK',to:'Validé'}},'https://acme.atlassian.net')",
    );
    await sleep(600);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const d=document.querySelector('dialog[open]');return Boolean(d)&&d.querySelector('iframe').style.visibility==='hidden'&&d.textContent.includes('Ouverture de « TEST OK »')})()",
      ),
      "pendant l'ouverture de la transition, ni la fiche ni le menu ne s'affichent",
    );
    await sleep(2400);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const d=document.querySelector('dialog[open]');const doc=d&&d.querySelector('iframe').contentDocument;const modal=doc&&doc.querySelector('#jira-modal');if(!modal)return false;const r=d.getBoundingClientRect();return !doc.body.dataset.executed&&modal.hasAttribute('data-sprint-goals-transition')&&getComputedStyle(doc.querySelector('#ticket')).visibility==='hidden'&&getComputedStyle(modal).visibility==='visible'&&Math.abs(r.width-640)<4&&Math.abs(r.height-480)<4})()",
      ),
      "la fenêtre de Jira s'ouvre seule, à sa taille, sans la fiche autour",
    );
    assert(
      await evaluate(
        sessionId,
        "!document.querySelector('dialog[open] iframe').contentDocument.querySelector('#jira-modal-form').matches(':valid')",
      ),
      "le formulaire de Jira reste à remplir et n'est jamais validé automatiquement",
    );
    await evaluate(
      sessionId,
      "document.querySelector('dialog[open] iframe').contentDocument.querySelector('#jira-modal').remove()",
    );
    await sleep(1200);
    assert(
      await evaluate(sessionId, "!document.querySelector('dialog[open]')"),
      "quitter la fenêtre de Jira referme la popin et garde le board",
    );
    // Même transition annoncée sans son statut d'arrivée : deux éléments du menu portent ce nom,
    // aucun n'est cliqué, la fiche est montrée pour que l'utilisateur choisisse lui-même.
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-issue',key:'ABC-102',transition:{id:'51',name:'TEST OK'}},'https://acme.atlassian.net')",
    );
    await sleep(3000);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const d=document.querySelector('dialog[open]');const doc=d&&d.querySelector('iframe').contentDocument;return Boolean(doc)&&!doc.body.dataset.executed&&!doc.querySelector('#jira-modal')&&d.querySelector('iframe').style.visibility==='visible'})()",
      ),
      "transition ambiguë : rien n'est cliqué et la fiche est rendue à l'utilisateur",
    );
    await evaluate(
      sessionId,
      "document.querySelector('dialog[open]').dispatchEvent(new Event('cancel'))",
    );
    await sleep(400);
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
