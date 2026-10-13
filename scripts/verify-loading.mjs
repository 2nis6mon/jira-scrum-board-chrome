// Diagnostic de chargement : interface réelle, Jira fictif, profil Chrome temporaire vierge.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchIsolatedBrowser } from "./browser-check.mjs";

const output = fileURLToPath(new URL("../.vite/", import.meta.url));
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 5203, strictPort: true },
});
await server.listen();
const browser = launchIsolatedBrowser("1440,1000");
const { send, evaluate, waitFor } = browser;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
let session;
try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  ({ sessionId: session } = await send("Target.attachToTarget", { targetId, flatten: true }));
  await send("Page.enable", {}, session);
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
    session,
  );
  await send("Page.navigate", { url: "http://127.0.0.1:5203/?scenario=board-chargement" }, session);
  await waitFor(
    session,
    "document.querySelector('.load-diagnostics-active')?.textContent.includes('Tickets')",
    "La phase des tickets lente n’est pas indiquée",
  );
  assert(
    await evaluate(session, "!document.querySelector('[role=dialog]')"),
    "La popin s'est ouverte automatiquement",
  );
  await evaluate(
    session,
    "document.querySelector('.load-diagnostics-launcher button').focus(); document.querySelector('.load-diagnostics-launcher button').click()",
  );
  await waitFor(
    session,
    "Boolean(document.querySelector('[role=dialog]'))",
    "La popin ne s’ouvre pas",
  );
  assert(
    await evaluate(
      session,
      "document.activeElement?.getAttribute('aria-label')==='Fermer le diagnostic du chargement'",
    ),
    "Le focus initial n'est pas placé sur la fermeture",
  );
  assert(
    await evaluate(
      session,
      "document.querySelector('[role=dialog]').textContent.includes('état provisoire')",
    ),
    "Le caractère provisoire du rapport n'est pas indiqué",
  );
  await waitFor(
    session,
    "document.querySelector('.load-diagnostics-summary')?.textContent.match(/Ouverture · [1-9]/)",
    "Le temps écoulé ne progresse pas pendant la phase lente",
  );
  await screenshot("loading-active.png");
  await evaluate(session, "window.__chargement.continuer()");
  await waitFor(
    session,
    "document.querySelector('.load-diagnostics-launcher')?.textContent.includes('Chargé en')",
    "Le rendu terminé du board n'a pas été mesuré",
  );
  await evaluate(
    session,
    "[...document.querySelectorAll('button')].find(button=>button.textContent==='Copier le rapport').click()",
  );
  await waitFor(
    session,
    "document.querySelector('[role=status]')?.textContent.includes('Rapport copié')",
    "La copie n'est pas confirmée",
  );
  const report = await evaluate(session, "window.__chargement.rapports.at(-1)");
  assert(
    typeof report === "string" &&
      report.includes("Chronologie") &&
      report.includes("board affiché"),
    "Rapport incomplet",
  );
  assert(
    !/ABC-|acme\.atlassian|Camille|paiement/i.test(report),
    "Le rapport expose du contenu métier fictif",
  );
  writeFileSync(`${output}/loading-report.txt`, report);
  await screenshot("loading-desktop.png");
  console.log(
    "✓ phase lente observable, popin manuelle, focus initial, rendu mesuré et rapport copié sans contenu métier",
  );

  await send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    session,
  );
  await send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    session,
  );
  await waitFor(session, "!document.querySelector('[role=dialog]')", "Échap ne ferme pas la popin");
  assert(
    await evaluate(
      session,
      "document.activeElement===document.querySelector('.load-diagnostics-launcher button')",
    ),
    "Focus non restauré",
  );
  await evaluate(session, "window.__chargement.actualiser()");
  await evaluate(session, "document.querySelector('.load-diagnostics-launcher button').click()");
  await waitFor(
    session,
    "document.querySelector('#load-diagnostics-run')?.options.length===2",
    "Les deux chargements ne figurent pas dans l'historique",
  );
  const labels = await evaluate(
    session,
    "[...document.querySelector('#load-diagnostics-run').options].map(option=>option.textContent)",
  );
  assert(
    labels.some((label) => label.includes("Ouverture")) &&
      labels.some((label) => label.includes("Actualisation")),
    "Historique sans distinction des actions",
  );
  console.log(
    "✓ Échap restaure le focus ; ouverture et actualisation consultables dans l'historique",
  );

  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 420, height: 760, deviceScaleFactor: 1, mobile: false },
    session,
  );
  await waitFor(
    session,
    "innerWidth===420 && innerHeight===760",
    "Le format étroit ne s'applique pas",
  );
  const fit = await evaluate(
    session,
    "(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect(),f=d.querySelector('footer').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,scroll:d.scrollWidth,width:d.clientWidth,footerBottom:f.bottom,footerTop:f.top}})()",
  );
  assert(
    fit.left >= 0 &&
      fit.top >= 0 &&
      fit.right <= 420 &&
      fit.bottom <= 760 &&
      fit.scroll <= fit.width + 1 &&
      fit.footerBottom <= 760 &&
      fit.footerTop >= 0,
    `Popin hors écran étroit : ${JSON.stringify(fit)}`,
  );
  await screenshot("loading-mobile.png");
  console.log("✓ popin et actions accessibles sans débordement à 420 × 760 ; captures dans .vite/");
} finally {
  await browser.close();
  await server.close();
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" }, session);
  writeFileSync(`${output}/${name}`, Buffer.from(data, "base64"));
}
