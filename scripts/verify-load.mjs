// Vérifie que Chrome accepte l'extension construite dans dist/.
//
// Lance un Chrome sans interface sur un PROFIL TEMPORAIRE VIERGE (aucune session, aucun
// cookie, rien de commun avec le profil de l'utilisateur), y charge dist/ par la commande
// CDP Extensions.loadUnpacked, puis contrôle : identifiant, service worker, rendu de la
// lanceur, refus du board hors Jira, permissions accordées et blocage par la CSP d'une
// connexion hors *.atlassian.net.
// Aucune requête n'est émise vers Jira.
//
// Usage : node scripts/verify-load.mjs [capture.png]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const EXPECTED_ID = "efhpkdoiimdggndnfcgdoaniobdcmokb";
// EXTENSION_DIR : autre dossier à charger (par exemple un ZIP du Store décompressé).
const dist = process.env.EXTENSION_DIR ?? fileURLToPath(new URL("../dist", import.meta.url));
const screenshotPath = process.argv[2];

if (!existsSync(join(dist, "manifest.json"))) {
  console.error("dist/manifest.json introuvable : lancer `npm run build` d'abord.");
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));

const browser = launchIsolatedBrowser();
const { send, evaluate, events } = browser;

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

try {
  console.log((await send("Browser.getVersion")).product);

  const { id } = await browser.loadExtension(dist);
  check("Chrome accepte le manifest", true);
  // Le paquet du Store n'a pas de clé : c'est le Store qui attribue l'identifiant.
  if ("key" in manifest) check("identifiant figé par la clé", id === EXPECTED_ID, id);
  else console.log(`· sans clé (paquet du Store) : identifiant provisoire ${id}`);

  await sleep(1000);
  const { targetInfos } = await send("Target.getTargets");
  const welcomeTab = targetInfos.find(
    (t) => t.type === "page" && t.url === `chrome-extension://${id}/launcher.html?bienvenue=1`,
  );
  check(
    "à l'installation, le lanceur s'ouvre dans un onglet de bienvenue",
    Boolean(welcomeTab),
    welcomeTab?.url ?? "absent",
  );
  if (welcomeTab) {
    const welcome = await send("Target.attachToTarget", {
      targetId: welcomeTab.targetId,
      flatten: true,
    });
    const page = await evaluate(
      welcome.sessionId,
      "JSON.stringify({text:document.body.innerText,field:Boolean(document.querySelector('form #board-address')),width:document.querySelector('main').getBoundingClientRect().width})",
    );
    const { text, field, width } = JSON.parse(page);
    check(
      "l'onglet de bienvenue demande l'adresse du Jira, sans accès demandé d'office",
      text.includes("Sprint Goals est installé") &&
        text.includes("Autoriser et ouvrir Jira") &&
        field &&
        width <= 460 &&
        JSON.parse(
          await evaluate(welcome.sessionId, "chrome.permissions.getAll().then(JSON.stringify)"),
        ).origins.length === 0,
      `largeur ${width}px`,
    );
  }
  const worker = targetInfos.find((t) => t.type === "service_worker" && t.url.includes(id));
  check(
    "service worker Jira enregistré",
    worker?.url.endsWith("/jira-direct-worker.js"),
    worker?.url ?? "absent",
  );

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  await send("Log.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url: `chrome-extension://${id}/board.html` }, sessionId);
  await sleep(1500);

  const isolated = await evaluate(sessionId, "document.body.innerText");
  check(
    "le board ouvert hors de Jira affiche seulement le refus",
    isolated.includes("Sprint Goals s'utilise dans Jira.") &&
      (await evaluate(sessionId, "!document.querySelector('.workspace, .connection, form')")),
    JSON.stringify(isolated.slice(0, 120)),
  );
  check(
    "aucune donnée enregistrée hors de Jira",
    (await evaluate(sessionId, "chrome.storage.local.get(null).then(JSON.stringify)")) === "{}",
  );

  const forged = new URL(`chrome-extension://${id}/board.html`);
  forged.searchParams.set("jiraHost", "https://verification.atlassian.net");
  forged.searchParams.set(
    "jiraBoard",
    "https://verification.atlassian.net/jira/software/c/projects/ABC/boards/7?sprintGoals=1",
  );
  await send("Page.navigate", { url: forged.href }, sessionId);
  await sleep(600);
  check(
    "des paramètres Jira ne permettent pas d'ouvrir le board seul",
    await evaluate(
      sessionId,
      "document.body.innerText.includes(\"Sprint Goals s'utilise dans Jira.\") && !document.querySelector('.workspace, .connection, form')",
    ),
  );

  await send("Page.navigate", { url: `chrome-extension://${id}/launcher.html` }, sessionId);
  await sleep(800);
  const text = await evaluate(sessionId, "document.body.innerText");
  check(
    "le lanceur propose d'ouvrir un board dans Jira",
    text.includes("Ouvrir dans Jira") &&
      (await evaluate(sessionId, "Boolean(document.querySelector('form #board-address'))")),
  );
  check(
    "le lanceur n'affiche aucun board autonome",
    await evaluate(sessionId, "!document.querySelector('.workspace, .lane, .board-view')"),
  );

  const inlineScripts = await evaluate(
    sessionId,
    "document.querySelectorAll('script:not([src])').length",
  );
  check("aucun script en ligne", inlineScripts === 0);

  // Saisie d'un hôte qui n'est pas *.atlassian.net : refus attendu, sans demande d'accès à
  // Chrome ni requête. (La demande d'accès elle-même est une fenêtre native de Chrome : elle
  // ne se pilote pas sans interface et reste à valider à la main.)
  const refusal = await evaluate(
    sessionId,
    `(async () => {
      const input = document.querySelector("#board-address");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "https://jira.acme.example/jira/software/c/projects/ABC/boards/7");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      input.form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return document.querySelector('[role="alert"]')?.innerText ?? "";
    })()`,
  );
  check(
    "hôte hors *.atlassian.net refusé à la saisie",
    refusal.length > 0,
    JSON.stringify(refusal.slice(0, 70)),
  );

  // Le board règle le nombre de colonnes par une variable CSS posée par script (CSSOM) : la CSP
  // « style-src 'self' » doit la laisser passer, alors qu'elle bloquerait un attribut style.
  const cssom = await evaluate(
    sessionId,
    `(() => {
      const probe = document.createElement("div");
      probe.style.setProperty("--column-count", "3");
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue("--column-count").trim();
      probe.remove();
      return value;
    })()`,
  );
  check("variable CSS posée par script acceptée par la CSP", cssom === "3", JSON.stringify(cssom));

  const stored = await evaluate(sessionId, "chrome.storage.local.get(null).then(JSON.stringify)");
  check("rien n'est enregistré après un refus", stored === "{}", stored);

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
  check(
    "permissions : onglet actif, stockage, injection Jira et règle d'en-tête",
    JSON.stringify([...granted.permissions].sort()) ===
      JSON.stringify(["activeTab", "declarativeNetRequestWithHostAccess", "scripting", "storage"]),
    JSON.stringify(granted.permissions),
  );

  // Règle Origin : Chrome doit accepter sa forme exacte (celle de graphqlOriginRule(), vérifiée par
  // tests/app/originRule.test.ts), pour un site fictif. Elle est retirée aussitôt.
  const ruleCheck = await evaluate(
    sessionId,
    `(async () => {
      const rule = {
        id: 1,
        priority: 1,
        action: { type: "modifyHeaders", requestHeaders: [{ header: "origin", operation: "remove" }] },
        condition: {
          urlFilter: "|https://verification.atlassian.net/gateway/api/graphql|",
          requestMethods: ["post"],
          resourceTypes: ["xmlhttprequest"],
          initiatorDomains: [chrome.runtime.id],
        },
      };
      try {
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [rule] });
        const count = (await chrome.declarativeNetRequest.getSessionRules()).length;
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] });
        const after = (await chrome.declarativeNetRequest.getSessionRules()).length;
        return count === 1 && after === 0 ? "acceptée puis retirée" : "compte inattendu " + count + "/" + after;
      } catch (error) {
        return "refusée : " + error.message;
      }
    })()`,
  );
  check("règle Origin acceptée par Chrome", ruleCheck === "acceptée puis retirée", ruleCheck);

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
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("\nTous les contrôles passent.");
