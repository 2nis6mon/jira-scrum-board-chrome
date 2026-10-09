// Régression du formulaire de transition sur les vues réelles, avec Jira fictif et profil Chrome vierge.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 5202, strictPort: true },
});
await server.listen();
const browser = launchIsolatedBrowser("1600,1200");
const { send, evaluate, waitFor } = browser;

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
    // Premier chargement : le serveur du banc d'essai compile encore, pas d'attente fixe.
    await waitFor(
      sessionId,
      `Boolean(document.querySelector('[data-issue-key="ABC-102"]'))`,
      "Le banc d'essai n'a pas affiché la carte ABC-102",
    );
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
  await waitFor(
    sessionId,
    "document.querySelector('#transition-field-summary')?.value === 'Résumé existant' && document.querySelector('#transition-field-customfield_18742')?.value === '3' && document.querySelector('#transition-field-worklog')?.value === '' && window.__transitionProbe.length === 0",
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
    const points=document.querySelector('#transition-field-customfield_18742');points.value='2,5';points.dispatchEvent(new Event('input',{bubbles:true}));
    const worklog=document.querySelector('#transition-field-worklog');worklog.value='1h 30m';worklog.dispatchEvent(new Event('input',{bubbles:true}));
  })()`,
  );
  await sleep(100);
  await evaluate(sessionId, "document.querySelector('dialog form').requestSubmit()");
  await sleep(250);
  assert(
    await evaluate(
      sessionId,
      "document.querySelector('dialog').textContent.includes('Refus du validateur') && document.querySelector('#transition-field-comment').value === 'Validation effectuée' && document.querySelector('#transition-field-worklog').value === '1h 30m' && document.querySelector('#transition-field-customfield_18742').value === '2,5' && window.__transitionProbe.length === 1",
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
      result.requests[1].fields.customfield_18742 === 2.5 &&
      result.requests[1].update.worklog[0].add.timeSpent === "1h 30m" &&
      typeof result.requests[1].update.worklog[0].add.started === "string" &&
      !("worklog" in result.requests[1].fields) &&
      !("summary" in result.requests[1].fields) &&
      result.requests[1].update.comment[0].add.body.type === "doc",
    "Story Points, temps et commentaire envoyés dans la seule transition, sans écraser le résumé",
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
  await browser.close();
  await server.close();
}
