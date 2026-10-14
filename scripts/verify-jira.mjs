// Vérification Chrome isolée de l'intégration Jira, sans session ni données de l'utilisateur.
// Toutes les pages Jira utilisées ci-dessous sont interceptées et remplacées par un faux Jira.
import { existsSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

// EXTENSION_DIR permet de contrôler une construction isolée.
const dist = process.env.EXTENSION_DIR ?? fileURLToPath(new URL("../dist", import.meta.url));
if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/manifest.json introuvable : lancer `npm run build` d'abord.");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const browser = launchIsolatedBrowser("1600,900");
const { send, evaluate, waitFor, events } = browser;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

try {
  console.log((await send("Browser.getVersion")).product);
  assert(
    manifest.background?.service_worker === "jira-worker.js" &&
      manifest.action?.default_popup === "launcher.html",
    "le paquet utilise le lanceur et le service worker Jira intégrés",
  );
  const { id: extensionId } = await browser.loadExtension(dist);
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://*/*" }] }, sessionId);
  const fixture = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;font:14px system-ui;background:#eef0f4;overflow:hidden}
    [hidden]{display:none!important}
    #ticket-layer{position:fixed;inset:0;pointer-events:none}
    #ticket{position:fixed;left:50%;top:60px;transform:translateX(-50%);width:min(1280px,calc(100vw - 120px));max-width:1280px;height:calc(100vh - 120px);margin:0;display:grid;grid-template-rows:84px minmax(0,1fr);overflow:hidden;box-sizing:border-box;background:white;pointer-events:auto;border-radius:12px;box-shadow:0 12px 36px #0003}
    #ticket-header{display:flex;align-items:center;gap:20px;padding:16px 24px;box-sizing:border-box;background:#fafbfc;border-bottom:1px solid #ccc}
    #ticket-header h1{flex:1;margin:0;font-size:20px}
    #ticket-body{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);min-height:0;overflow:hidden}
    .native-column{min-height:0;overflow:auto;padding:20px;box-sizing:border-box}
    #ticket-left{border-right:1px solid #ddd}
    .native-column p{min-height:60px;margin:0 0 12px;padding:8px;box-sizing:border-box;background:#f5f7fa}
    .native-bottom{height:48px;display:flex;align-items:center;background:#e4f2ed}
  </style></head><body><main id="jira">Board Jira normal</main>
    <div id="ticket-layer"><aside id="ticket" role="dialog" aria-label="Ticket ABC-102" hidden>
      <header id="ticket-header"><button aria-label="Fermer" onclick="history.pushState(null,'',location.pathname);this.closest('#ticket').hidden=true">Fermer</button>
      <a href="/browse/ABC-102">ABC-102</a><h1>Ticket Jira réel</h1>
      <button aria-label="Code Review - Changer le statut" onclick="openStatusMenu()">Code Review</button></header>
      <div id="ticket-body"><section id="ticket-left" class="native-column" aria-label="Description native"><button onclick="openPortalMenu()">Menu natif</button><div id="native-description"></div><div class="native-bottom" id="left-bottom">Fin de la description</div></section>
      <section id="ticket-right" class="native-column" aria-label="Détails natifs"><div id="native-details"></div><div class="native-bottom" id="right-bottom">Fin des détails</div></section></div>
    </aside></div>
    <script>
    document.querySelector('#native-description').innerHTML=Array.from({length:28},function(_,index){return '<p>Description native, paragraphe '+index+'</p>'}).join('');
    document.querySelector('#native-details').innerHTML=Array.from({length:34},function(_,index){return '<p>Détail Jira, ligne '+index+'</p>'}).join('');
    if(new URL(location.href).searchParams.has('selectedIssue'))document.querySelector('#ticket').hidden=false;
    function nativeIssueLayout(){return ['ticket','ticket-header','ticket-body','ticket-left','ticket-right'].map(function(id){var element=document.getElementById(id),style=getComputedStyle(element),rect=element.getBoundingClientRect();return {id:id,inline:element.getAttribute('style'),display:style.display,position:style.position,overflowX:style.overflowX,overflowY:style.overflowY,grid:style.gridTemplateColumns,rows:style.gridTemplateRows,margin:style.margin,padding:style.padding,left:rect.left,top:rect.top,width:rect.width,height:rect.height};});}
    window.__nativeIssueInitialLayout=nativeIssueLayout();
    window.__nativeIssueInitialMarkup=document.querySelector('#ticket').outerHTML;
    function replaceNativeIssuePanel(){var container=document.createElement('div');container.innerHTML=window.__nativeIssueInitialMarkup;document.querySelector('#ticket').replaceWith(container.firstElementChild);}
    function openPortalMenu(){var menu=document.createElement('div');menu.id='native-portal';menu.setAttribute('role','listbox');menu.style.cssText='position:fixed;left:8px;top:210px;width:140px;height:150px;background:white;z-index:10000;border:1px solid #ccc';menu.innerHTML='<button role=option style="width:100%;height:48px">Option native</button>';menu.querySelector('button').onclick=function(){document.body.dataset.nativeSelection='ok';menu.remove();};document.body.append(menu);}
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
      readFileSync(new URL("../src/integration/injectBoard.ts", import.meta.url), "utf8"),
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
    const REFUSAL = "Sprint Goals s'utilise dans Jira.";
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
    const nativeViewport = `(()=>{const dialog=document.querySelector('dialog[open]'),frame=dialog?.querySelector('iframe'),win=frame?.contentWindow,doc=frame?.contentDocument,panel=doc?.querySelector('#ticket');if(!panel)return false;const r=dialog.getBoundingClientRect(),f=frame.getBoundingClientRect(),p=panel.getBoundingClientRect();return Math.abs(r.left)<1&&Math.abs(r.top)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1&&Math.abs(f.width-innerWidth)<1&&Math.abs(f.height-innerHeight)<1&&win.innerWidth===innerWidth&&win.innerHeight===innerHeight&&Math.abs(p.width-Math.min(1280,innerWidth-120))<1&&Math.abs(p.height-(innerHeight-120))<1&&Math.abs(p.left-(innerWidth-p.width)/2)<1&&Math.abs(p.top-60)<1})()`;
    assert(
      await evaluate(sessionId, nativeViewport),
      "le cadre conserve le viewport Jira complet et la fiche garde sa taille native et ses marges uniques",
    );
    assert(
      await evaluate(
        sessionId,
        "(()=>{const win=document.querySelector('dialog iframe').contentWindow;return JSON.stringify(win.nativeIssueLayout())===JSON.stringify(win.__nativeIssueInitialLayout)})()",
      ),
      "l'isolation ne modifie aucun style, dimension ou disposition du panneau natif et de ses colonnes",
    );
    assert(
      await evaluate(
        sessionId,
        "document.querySelector('dialog iframe').style.visibility==='visible'",
      ),
      "le panneau natif du ticket est visible dans la popin",
    );
    const originalViewport = await evaluate(sessionId, "({width:innerWidth,height:innerHeight})");
    const wheelInColumn = async (id, deltaY) => {
      const point = await evaluate(
        sessionId,
        `(()=>{const frame=document.querySelector('dialog iframe'),element=frame.contentDocument.getElementById(${JSON.stringify(id)}),rect=element.getBoundingClientRect(),outer=frame.getBoundingClientRect();return {x:outer.left+rect.left+rect.width/2,y:outer.top+rect.top+80}})()`,
      );
      await send(
        "Input.dispatchMouseEvent",
        { type: "mouseWheel", ...point, deltaX: 0, deltaY },
        sessionId,
      );
    };
    const headerTop = await evaluate(
      sessionId,
      "document.querySelector('dialog iframe').contentDocument.querySelector('#ticket-header').getBoundingClientRect().top",
    );
    await wheelInColumn("ticket-left", 450);
    await waitFor(
      sessionId,
      "document.querySelector('dialog iframe').contentDocument.querySelector('#ticket-left').scrollTop > 0",
      "la molette ne fait pas défiler la description native",
    );
    assert(
      await evaluate(
        sessionId,
        `(()=>{const doc=document.querySelector('dialog iframe').contentDocument;return doc.querySelector('#ticket-right').scrollTop===0&&doc.querySelector('#ticket').scrollTop===0&&doc.querySelector('#ticket-header').getBoundingClientRect().top===${headerTop}})()`,
      ),
      "la description défile seule : en-tête et colonne des détails restent immobiles",
    );
    const leftScroll = await evaluate(
      sessionId,
      "document.querySelector('dialog iframe').contentDocument.querySelector('#ticket-left').scrollTop",
    );
    await wheelInColumn("ticket-right", 380);
    await waitFor(
      sessionId,
      "document.querySelector('dialog iframe').contentDocument.querySelector('#ticket-right').scrollTop > 0",
      "la molette ne fait pas défiler les détails natifs",
    );
    assert(
      await evaluate(
        sessionId,
        `(()=>{const doc=document.querySelector('dialog iframe').contentDocument;return doc.querySelector('#ticket-left').scrollTop===${leftScroll}&&doc.querySelector('#ticket-header').getBoundingClientRect().top===${headerTop}})()`,
      ),
      "les détails défilent indépendamment de la description et de l'en-tête",
    );
    for (const id of ["ticket-left", "ticket-right"]) {
      await wheelInColumn(id, 100000);
      await waitFor(
        sessionId,
        `(()=>{const doc=document.querySelector('dialog iframe').contentDocument,column=doc.getElementById(${JSON.stringify(id)}),bottom=column.querySelector('.native-bottom').getBoundingClientRect(),rect=column.getBoundingClientRect();return column.scrollHeight-column.scrollTop-column.clientHeight<2&&bottom.top>=rect.top&&bottom.bottom<=rect.bottom+1})()`,
        `le bas de ${id} est inaccessible`,
      );
    }
    assert(
      await evaluate(
        sessionId,
        `(()=>{const frame=document.querySelector('dialog iframe'),doc=frame.contentDocument;return frame.contentWindow.scrollY===0&&doc.querySelector('#ticket').scrollTop===0&&doc.querySelector('#ticket-header').getBoundingClientRect().top===${headerTop}})()`,
      ),
      "les deux bas de colonnes restent accessibles sans défilement global ni perte de l'en-tête",
    );
    await evaluate(
      sessionId,
      "document.querySelector('dialog iframe').contentWindow.openPortalMenu()",
    );
    const portal = await evaluate(
      sessionId,
      "(()=>{const frame=document.querySelector('dialog iframe'),doc=frame.contentDocument,menu=doc.querySelector('#native-portal'),button=menu.querySelector('button'),rect=button.getBoundingClientRect(),panel=doc.querySelector('#ticket').getBoundingClientRect(),outer=frame.getBoundingClientRect(),x=rect.left+12,y=rect.top+20;return {x:outer.left+x,y:outer.top+y,outside:x<panel.left,visible:menu.contains(doc.elementFromPoint(x,y))&&frame===document.elementFromPoint(outer.left+x,outer.top+y)}})()",
    );
    assert(
      portal.outside && portal.visible,
      "un menu Jira porté hors de la fiche reste visible et accessible dans le viewport complet",
    );
    for (const type of ["mousePressed", "mouseReleased"])
      await send(
        "Input.dispatchMouseEvent",
        {
          type,
          x: portal.x,
          y: portal.y,
          button: "left",
          buttons: type === "mousePressed" ? 1 : 0,
          clickCount: 1,
        },
        sessionId,
      );
    await waitFor(
      sessionId,
      "document.querySelector('dialog iframe').contentDocument.body.dataset.nativeSelection==='ok'",
      "le menu natif hors panneau n'est pas cliquable",
    );
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 820, height: 740, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await waitFor(
      sessionId,
      nativeViewport,
      "la fiche ne conserve pas ses dimensions natives après rétrécissement du viewport",
    );
    assert(
      await evaluate(
        sessionId,
        "(()=>{const doc=document.querySelector('dialog iframe').contentDocument;return getComputedStyle(doc.querySelector('#ticket')).overflow==='hidden'&&getComputedStyle(doc.querySelector('#ticket-body')).display==='grid'&&getComputedStyle(doc.querySelector('#ticket-left')).overflowY==='auto'&&getComputedStyle(doc.querySelector('#ticket-right')).overflowY==='auto'})()",
      ),
      "à largeur réduite, le panneau garde son overflow natif et ses deux défilements internes",
    );
    await send(
      "Emulation.setDeviceMetricsOverride",
      { ...originalViewport, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await waitFor(
      sessionId,
      nativeViewport,
      "la fiche native ne reprend pas sa taille après restauration du viewport",
    );
    await evaluate(
      sessionId,
      "document.querySelector('dialog iframe').contentWindow.replaceNativeIssuePanel()",
    );
    await waitFor(
      sessionId,
      "(()=>{const frame=document.querySelector('dialog iframe'),doc=frame.contentDocument,panel=doc.querySelector('#ticket');return panel.hasAttribute('data-sprint-goals-ticket')&&getComputedStyle(panel).visibility==='visible'&&JSON.stringify(frame.contentWindow.nativeIssueLayout())===JSON.stringify(frame.contentWindow.__nativeIssueInitialLayout)})()",
      "le panneau natif remplacé par Jira n'est pas reconnu sans modification de sa disposition",
    );
    assert(
      await evaluate(
        sessionId,
        "document.querySelector('dialog iframe').contentDocument.querySelectorAll('[data-sprint-goals-ticket-style]').length===1",
      ),
      "le remplacement natif conserve une seule feuille d'isolation et un panneau intact",
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
    // Changement de board demandé par la vue : la page hôte n'accepte qu'un identifiant et une clé
    // de projet valides, venus de son cadre, et forme elle-même l'adresse sur son propre site.
    await evaluate(
      child.sessionId,
      "['../../x','xyz','XYZ/boards/9?x='].forEach(projectKey=>window.parent.postMessage({type:'sprint-goals:open-board',boardId:8,projectKey,url:'https://evil.atlassian.net/'},'https://acme.atlassian.net'));window.parent.postMessage({type:'sprint-goals:open-board',boardId:'8',projectKey:'XYZ'},'https://acme.atlassian.net')",
    );
    await evaluate(
      sessionId,
      "window.postMessage({type:'sprint-goals:open-board',boardId:8,projectKey:'XYZ'},location.origin)",
    );
    await sleep(600);
    assert(
      (await evaluate(sessionId, "location.href")) === special,
      "demande de board forgée ou venue d'ailleurs que la vue : la page ne bouge pas",
    );
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-board',boardId:8,projectKey:'XYZ'},'https://acme.atlassian.net')",
    );
    await waitFor(
      sessionId,
      "location.href==='https://acme.atlassian.net/jira/software/c/projects/XYZ/boards/8?sprintGoals=1'&&document.readyState==='complete'",
      "le changement de board n'a pas changé la page Jira",
    );
    assert(true, "changer de board charge la page Jira de ce board, marquée pour la vue");
    // « Retour à Jira » : seule la vue peut le demander ; la page revient à son adresse sans marqueur.
    const second = "https://acme.atlassian.net/jira/software/c/projects/XYZ/boards/8?sprintGoals=1";
    await evaluate(
      sessionId,
      `${injectSource};injectBoard('chrome-extension://${extensionId}/board.html',${JSON.stringify(second)})`,
    );
    await sleep(1200);
    const secondFrame = (await send("Target.getTargets")).targetInfos.find(
      (target) =>
        target.type === "iframe" &&
        target.url.startsWith(`chrome-extension://${extensionId}/board.html`) &&
        target.url.includes("boards%2F8"),
    );
    assert(secondFrame, "la vue est de nouveau encadrée sur la page du second board");
    const secondChild = await send("Target.attachToTarget", {
      targetId: secondFrame.targetId,
      flatten: true,
    });
    await evaluate(sessionId, "window.postMessage({type:'sprint-goals:close'},location.origin)");
    await sleep(500);
    assert(
      (await evaluate(sessionId, "location.href")) === second,
      "une demande de fermeture venue d'ailleurs que la vue est ignorée",
    );
    await evaluate(
      secondChild.sessionId,
      "window.parent.postMessage({type:'sprint-goals:close'},'https://acme.atlassian.net')",
    );
    await waitFor(
      sessionId,
      "location.href==='https://acme.atlassian.net/jira/software/c/projects/XYZ/boards/8'&&document.readyState==='complete'&&!document.querySelector('#sprint-goals-direct')",
      "« Retour à Jira » n'a pas rendu la page du board",
    );
    assert(true, "« Retour à Jira » recharge le board Jira sans le marqueur ni la vue");
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
    // Bouton du script de contenu. Profil vierge : le site n'est pas autorisé, Chrome n'injecte
    // donc pas le script ; le fichier construit est exécuté ici avec un faux `chrome.runtime`.
    const bootstrap = readFileSync(join(dist, "jira-bootstrap.js"), "utf8");
    const runBootstrap = `(()=>{window.chrome=Object.assign(window.chrome||{},{storage:{local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:()=>{},removeListener:()=>{}}},runtime:{sendMessage:async()=>{window.__launches=(window.__launches||0)+1},getURL:p=>'chrome-extension://${extensionId}/'+p}});})();${bootstrap}`;
    const openButton =
      "document.querySelector('#sprint-goals-open')?.shadowRoot.querySelector('.open')";
    await evaluate(sessionId, runBootstrap);
    await waitFor(
      sessionId,
      `(()=>{const b=${openButton};if(!b)return false;const r=b.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return b.textContent==='Sprint Goals'&&r.right<=innerWidth-88&&r.bottom<=innerHeight&&r.left>innerWidth/2&&r.top>innerHeight/2&&top?.id==='sprint-goals-open'&&b.querySelector('img').naturalWidth===32&&!window.__launches})()`,
      "le bouton Sprint Goals n'est pas affiché en bas à droite du board Jira",
    );
    assert(
      true,
      "sur un board Jira, le bouton Sprint Goals s'affiche en bas à droite, à gauche de l'emplacement de Rovo, sans rien lancer",
    );
    await evaluate(sessionId, `${openButton}.click()`);
    await waitFor(
      sessionId,
      // Page rechargée : le faux `chrome.runtime` posé plus haut n'existe plus.
      "location.href==='https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7?sprintGoals=1'&&document.readyState==='complete'&&window.__launches===undefined",
      "le clic sur le bouton n'a pas chargé l'adresse marquée",
    );
    assert(true, "le clic charge la page du board marquée pour la vue");
    await evaluate(sessionId, runBootstrap);
    await waitFor(
      sessionId,
      "window.__launches===1&&!document.querySelector('#sprint-goals-open')",
      "la page marquée n'a pas demandé la vue",
    );
    assert(true, "sur la page marquée, la vue est demandée et le bouton n'est pas affiché");
    await evaluate(sessionId, "history.back()");
    await waitFor(
      sessionId,
      "!location.search&&document.readyState==='complete'&&window.__launches===undefined",
      "le retour arrière n'a pas ramené au board Jira",
    );
    await evaluate(sessionId, runBootstrap);
    await waitFor(
      sessionId,
      `Boolean(${openButton})&&!window.__launches`,
      "le bouton n'est pas revenu après le retour arrière",
    );
    assert(true, "retour arrière : le board Jira natif retrouve son bouton");
    await send("Page.navigate", { url: "https://acme.atlassian.net/browse/ABC-102" }, sessionId);
    await sleep(700);
    await evaluate(sessionId, runBootstrap);
    await sleep(700);
    assert(
      await evaluate(
        sessionId,
        "!document.querySelector('#sprint-goals-open')&&!window.__launches",
      ),
      "hors d'un board, le script de contenu n'ajoute rien à la page Jira",
    );
  } finally {
    clearInterval(pump);
  }
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
