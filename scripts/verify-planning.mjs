// Atelier Sprint Planning réel sur un Jira FICTIF en mémoire et un profil Chrome vierge.
// Vérifie la préparation locale, la restauration, la publication explicite et le petit écran.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const PORT = 5205;
const packageCheck = process.argv.includes("--package");
async function serve(mode) {
  const instance = await createServer({
    configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
    mode,
    server: { host: "127.0.0.1", port: PORT, strictPort: true, watch: null, hmr: false },
  });
  await instance.listen();
  return instance;
}
let server = await serve("dist");
const browser = launchIsolatedBrowser("1440,960");
const { send, evaluate, waitFor, navigateToHarness, events } = browser;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Input.setInterceptDrags", { enabled: true }, sessionId);
  const run = (expression) => evaluate(sessionId, expression);
  const wait = (expression, message) => waitFor(sessionId, expression, message);
  const viewport = (width, height = 960) =>
    send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
  const click = async (expression) => {
    await wait(`Boolean(${expression})`, `Élément absent : ${expression}`);
    await run(`(${expression}).click()`);
  };
  const setValue = async (selector, value, event = "input") => {
    const expression = `document.querySelector(${JSON.stringify(selector)})`;
    await wait(`Boolean(${expression})`, `Champ absent : ${selector}`);
    await run(`(() => {
      const field = ${expression};
      field.value = ${JSON.stringify(value)};
      field.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
    })()`);
  };
  const buttonNamed = (name) =>
    `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(name)})`;
  const inspect = () => run("window.__planning.inspect()");
  /** Point visible d'un élément non interactif de la carte ou de la zone de dépôt. */
  const point = (selector) =>
    run(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: 'nearest' });
    const r = element.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 24);
    const y = r.top + r.height / 2;
    if (x < 0 || x > innerWidth || y < 0 || y > innerHeight
      || !element.contains(document.elementFromPoint(x, y))) return null;
    return { x, y };
  })()`);
  const dragIssue = async (key, goalId) => {
    const from = await point(`[data-planning-issue="${key}"] .planning-card-title`);
    assert(from, `La carte ${key} n'est pas accessible pour le glisser-déposer`);
    const since = events.length;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from }, sessionId);
    await send(
      "Input.dispatchMouseEvent",
      {
        type: "mousePressed",
        ...from,
        button: "left",
        buttons: 1,
        clickCount: 1,
      },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseMoved",
        x: from.x + 12,
        y: from.y + 6,
        button: "left",
        buttons: 1,
      },
      sessionId,
    );
    let intercepted;
    for (let attempt = 0; attempt < 40 && !intercepted; attempt++) {
      intercepted = events.slice(since).find((event) => event.method === "Input.dragIntercepted");
      if (!intercepted) await sleep(50);
    }
    assert(intercepted, `Chrome n'a pas démarré le glissement natif de ${key}`);
    const data = intercepted.params.data;
    assert(
      data.items.some(
        (item) =>
          item.mimeType === "application/x-sprint-goals-planning-issue" && item.data === key,
      ),
      "La carte n'a pas transmis son identifiant dans le glissement natif",
    );
    const to = await point(`[data-planning-goal="${goalId}"] .planning-goal-tickets`);
    assert(to, "L'objectif de destination n'est pas accessible");
    for (const type of ["dragEnter", "dragOver"]) {
      await send("Input.dispatchDragEvent", { type, ...to, data }, sessionId);
    }
    await wait(
      `document.querySelector('[data-planning-goal="${goalId}"]').classList.contains('planning-drop-active')`,
      "L'objectif ne signale pas qu'il accepte la carte pendant le survol",
    );
    await send("Input.dispatchDragEvent", { type: "drop", ...to, data }, sessionId);
    await send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        ...to,
        button: "left",
        buttons: 0,
        clickCount: 1,
      },
      sessionId,
    );
    await wait(
      `Boolean(document.querySelector('[data-planning-goal="${goalId}"] [data-planning-issue="${key}"]'))
        && !document.querySelector('.planning-pool-list [data-planning-issue="${key}"]')`,
      `Le ticket ${key} n'a pas rejoint l'objectif après le dépôt`,
    );
  };
  let navigation = 0;
  const openBoard = async () => {
    const url = `http://127.0.0.1:${PORT}/?scenario=board-planning&hote=1&essai=${++navigation}`;
    await navigateToHarness(sessionId, url);
    await wait(
      `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && window.__planning?.ready() && Boolean(document.querySelector('.host-return:not([disabled])'))`,
      "Le nouveau document du banc n'est pas prêt",
    );
  };
  const open = async () => {
    await openBoard();
    await click(buttonNamed("Sprint Planning"));
    await wait(
      "Boolean(document.querySelector('.planning-screen'))",
      "L'atelier ne s'est pas ouvert",
    );
    await wait(
      "document.querySelectorAll('.planning-goal').length >= 2 && !document.querySelector('.planning-screen').getAttribute('aria-busy').includes('true')",
      "Le sprint futur et ses objectifs ne sont pas chargés",
    );
  };
  const capture = async (name) => {
    const directory = resolve(".vite/planning-check");
    mkdirSync(directory, { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(resolve(directory, `${name}.png`), Buffer.from(data, "base64"));
  };

  await viewport(1440);
  await open();
  assert(
    await run(`document.querySelector('[aria-label="Sprint à préparer"]').value === '43'
      && document.querySelectorAll('.planning-pool-list [data-planning-issue]').length === 4
      && Boolean(document.querySelector('.planning-unassigned [data-planning-issue="ABC-210"]'))`),
    "Le sprint futur, le backlog paginé ou le ticket déjà présent est incorrect",
  );
  assert((await inspect()).writes.length === 0, "La lecture de l'atelier a écrit dans Jira");
  console.log("✓ Planning : sprint futur, objectifs texte et backlog paginé chargés sans écriture");

  await click("document.querySelectorAll('.planning-source-tabs button')[1]");
  assert(
    await run(`document.querySelectorAll('.planning-pool-list [data-planning-issue]').length === 5
      && !document.querySelector('.planning-pool-list [data-planning-issue="ABC-103"]')
      && [...document.querySelectorAll('.planning-pool-list [data-planning-issue]')].every(card => !card.draggable && !card.querySelector('select'))`),
    "Le reste à faire doit exclure les tickets terminés et rester consultatif",
  );
  await click("document.querySelectorAll('.planning-source-tabs button')[0]");
  await setValue('[aria-label="Rechercher un ticket à planifier"]', "ABC-203");
  assert(
    await run(
      "document.querySelectorAll('.planning-pool-list [data-planning-issue]').length === 1",
    ),
    "La recherche ne filtre pas le backlog",
  );
  await setValue('[aria-label="Rechercher un ticket à planifier"]', "");
  console.log("✓ RAF : tickets non terminés consultatifs ; recherche du backlog opérationnelle");

  const firstGoal = await run("document.querySelector('.planning-goal').dataset.planningGoal");
  const secondGoal = await run(
    "document.querySelectorAll('.planning-goal')[1].dataset.planningGoal",
  );
  await dragIssue("ABC-201", firstGoal);
  assert((await inspect()).writes.length === 0, "Le glisser-déposer a écrit dans Jira");
  console.log("✓ Glissé natif : ABC-201 affecté à l'objectif, survol signalé, sans écriture Jira");
  await setValue('[aria-label="Affecter ABC-202 à un objectif"]', secondGoal, "change");
  await setValue('[aria-label="Titre de l’objectif 1"]', "Simplifier le paiement en une étape");
  await setValue('[aria-label^="Capacité cible en "]', "8");
  await setValue('[aria-label="Nouvel objectif du sprint"]', "Fiabiliser la reprise du panier");
  await click(buttonNamed("Ajouter l’objectif"));
  await wait("document.querySelectorAll('.planning-goal').length === 3", "Nouvel objectif absent");
  assert(
    await run(`Boolean(document.querySelector('.planning-goal [data-planning-issue="ABC-201"]'))
      && Boolean(document.querySelector('.planning-goal [data-planning-issue="ABC-202"]'))
      && document.querySelector('.planning-capacity-over').textContent.includes('2 au-dessus')`),
    "L'affectation ou le calcul de capacité est incorrect",
  );
  assert((await inspect()).writes.length === 0, "La préparation locale a écrit dans Jira");
  await wait(
    "localStorage.getItem('harness-planning-store')?.includes('Fiabiliser la reprise du panier')",
    "Le brouillon n'a pas été sauvegardé localement",
  );
  await capture("desktop-brouillon");

  await open();
  assert(
    await run(`document.querySelectorAll('.planning-goal').length === 3
      && document.querySelector('[aria-label="Titre de l’objectif 1"]').value === 'Simplifier le paiement en une étape'
      && document.querySelector('[aria-label^="Capacité cible en "]').value === '8'
      && Boolean(document.querySelector('.planning-goal [data-planning-issue="ABC-201"]'))
      && Boolean(document.querySelector('.planning-goal [data-planning-issue="ABC-202"]'))`),
    "Le brouillon local n'a pas survécu au rechargement du document",
  );
  assert((await inspect()).writes.length === 0, "La restauration du brouillon a écrit dans Jira");
  console.log(
    "✓ Brouillon : objectifs, tickets et capacité restaurés après rechargement, sans écriture",
  );

  if (packageCheck) {
    // Le même profil et la même origine conservent un vrai brouillon préparé par la vue active.
    // Nouveau serveur Vite : la valeur désactivée provient bien du mode package de la compilation.
    const savedDrafts = await run("window.__planning.storedDrafts()");
    assert(savedDrafts.length > 0, "Aucun brouillon réel à préserver pour le contrôle du paquet");
    await server.close();
    server = await serve("package");
    await openBoard();
    const requestsBefore = await run("window.__planning.requestCount()");
    const absentPlanning = `!(${buttonNamed("Sprint Planning")}) && !document.querySelector('.planning-screen') && Boolean(document.querySelector('.board-screen'))`;
    assert(await run(absentPlanning), "Le paquet présente encore Sprint Planning");
    assert(
      JSON.stringify(await run("window.__planning.storedDrafts()")) === JSON.stringify(savedDrafts),
      "Le paquet a altéré le brouillon existant au chargement",
    );
    const result = await run("window.__planning.exerciseEntrypoints()");
    await run(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    assert(await run(absentPlanning), "Un appel direct a ouvert Sprint Planning dans le paquet");
    assert(
      result.draft === null && result.canPublish === false,
      "Le paquet a restauré ou activé la publication du planning",
    );
    assert(
      (await run("window.__planning.requestCount()")) === requestsBefore,
      "Un appel direct au planning a émis une requête dans le paquet",
    );
    assert((await inspect()).writes.length === 0, "Le planning du paquet a écrit dans Jira");
    assert(
      JSON.stringify(await run("window.__planning.storedDrafts()")) === JSON.stringify(savedDrafts),
      "Un appel direct du paquet a modifié le brouillon local",
    );
    console.log(
      "✓ Mode package réel : aucune entrée ni vue Planning, appels directs sans requête ou écriture, brouillon conservé",
    );
  } else {
    await click(buttonNamed("Publier dans Jira"));
    await wait("Boolean(document.querySelector('[role=dialog]'))", "Confirmation absente");
    assert(
      await run(`(() => {
    const r = document.querySelector('.planning-dialog-backdrop').getBoundingClientRect();
    return r.left === 0 && r.top === 0 && r.right === innerWidth && r.bottom === innerHeight;
  })()`),
      "La confirmation ne couvre pas tout le viewport",
    );
    assert(
      await run(`document.querySelector('#planning-goal-preview').value === 'Simplifier le paiement en une étape\\nRendre le panier plus rapide\\nFiabiliser la reprise du panier'
      && document.querySelectorAll('.planning-publication-tickets li').length === 2`),
      "La confirmation ne présente pas les modifications exactes",
    );
    assert(
      (await inspect()).writes.length === 0,
      "L'ouverture de la confirmation a écrit dans Jira",
    );
    await click(buttonNamed("Continuer la préparation"));
    await wait("!document.querySelector('[role=dialog]')", "Confirmation non fermée");
    assert(
      (await inspect()).writes.length === 0,
      "L'annulation de la confirmation a écrit dans Jira",
    );
    await click(buttonNamed("Publier dans Jira"));
    await wait("Boolean(document.querySelector('[role=dialog]'))", "Confirmation absente");
    await run(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    await run(`(${buttonNamed("Confirmer la publication")}).focus()`);
    await wait(
      `document.activeElement === (${buttonNamed("Confirmer la publication")})`,
      "Le bouton de publication ne reçoit pas le focus clavier",
    );
    for (const type of ["keyDown", "keyUp"]) {
      await send(
        "Input.dispatchKeyEvent",
        {
          type,
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
        },
        sessionId,
      );
    }
    await wait(
      "document.querySelector('.planning-messages')?.textContent.includes('Planning publié et vérifié dans Jira')",
      "La publication n'a pas été confirmée après ses relectures",
    );
    const published = await inspect();
    assert(published.sprint.state === "future", "La publication a démarré le sprint");
    assert(
      JSON.stringify(published.issueKeys.sort()) ===
        JSON.stringify(["ABC-201", "ABC-202", "ABC-210"]),
      "Les tickets publiés ne correspondent pas à la proposition",
    );
    assert(
      published.writes.length === 3 &&
        published.writes[0].path === "/rest/agile/1.0/sprint/43" &&
        published.writes[1].path === "/rest/agile/1.0/sprint/43/issue" &&
        published.writes[2].path.endsWith("/properties/com.scrumboardmac.sprintgoals.v1") &&
        published.document.links["ABC-201"] === firstGoal &&
        published.document.links["ABC-202"] === secondGoal,
      "La publication n'a pas conservé les rattachements ou émis exactement les trois écritures prévues",
    );
    console.log(
      "✓ Publication : confirmation au clavier, texte + 2 ajouts + rattachements vérifiés, sprint toujours futur",
    );

    // Le panneau latéral peut rester ouvert ; les contrôles doivent aussi tenir dans l'espace réduit.
    for (const width of [640, 390]) {
      await viewport(width, 844);
      if (width === 390)
        await click("document.querySelector('[aria-label=\"Masquer la barre latérale\"]')");
      assert(
        await run("document.documentElement.scrollWidth <= innerWidth + 1"),
        `${width}px : la page déborde horizontalement`,
      );
      for (const selector of [
        '[aria-label="Sprint à préparer"]',
        '[aria-label="Nouvel objectif du sprint"]',
      ]) {
        await run(
          `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`,
        );
        assert(
          await run(`(() => {
        const field = document.querySelector(${JSON.stringify(selector)});
        const r = field.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1
          && r.top >= 0 && r.bottom <= innerHeight + 1
          && field.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })()`),
          `${width}px : champ inaccessible ou recouvert : ${selector}`,
        );
      }
      await capture(`planning-${width}`);
      console.log(
        `✓ Planning ${width}px : navigation, saisie et objectifs accessibles sans débordement`,
      );
    }
  }
} finally {
  await browser.close();
  await server.close();
}
