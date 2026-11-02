// Sprint Planning en direct, dans un vrai Chrome sur un profil vierge et un Jira FICTIF en mémoire.
// Chaque geste écrit aussitôt dans le faux Jira : on vérifie les écritures exactes et leur ordre,
// le conflit sans écriture, la consultation du sprint actif, les fenêtres natives simulées et le
// petit écran. `--package` : la compilation du paquet n'a ni entrée, ni lecture, ni écriture.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const PORT = 5205;
const packageCheck = process.argv.includes("--package");
const SPRINT = "/rest/agile/1.0/sprint/43";
const PROPERTY = `${SPRINT}/properties/com.scrumboardmac.sprintgoals.v1`;
const E8 = `POST ${SPRINT}`;
const E5 = `PUT ${PROPERTY}`;
const E9 = `POST ${SPRINT}/issue`;
const E10 = "POST /rest/agile/1.0/backlog/issue";

async function serve(mode) {
  const instance = await createServer({
    configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
    mode,
    server: { host: "127.0.0.1", port: PORT, strictPort: true, watch: null, hmr: false },
  });
  await instance.listen();
  return instance;
}
// Le mode de compilation fixe l'interrupteur : `package` reproduit la valeur du paquet distribué.
const server = await serve(packageCheck ? "package" : "dist");
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
  const buttonNamed = (name) =>
    `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(name)})`;
  const inspect = () => run("window.__planning.inspect()");
  /** Écritures reçues par le faux Jira, sous la forme « MÉTHODE chemin ». */
  const writes = async () =>
    (await inspect()).writes.map((write) => `${write.method} ${write.path}`);
  const idle =
    "document.querySelector('main.planning-screen')?.getAttribute('aria-busy') !== 'true'";
  /** Attend exactement `expected` nouvelles écritures après `before`, puis la fin du geste. */
  const expectWrites = async (before, expected, label) => {
    await wait(
      `window.__planning.inspect().writes.length >= ${before.length + expected.length} && ${idle}`,
      `${label} : écritures attendues absentes`,
    );
    const after = await writes();
    const added = after.slice(before.length);
    assert(
      JSON.stringify(added) === JSON.stringify(expected),
      `${label} : écritures ${JSON.stringify(added)} au lieu de ${JSON.stringify(expected)}`,
    );
    return after;
  };
  const click = async (expression) => {
    await wait(`Boolean(${expression}) && !(${expression}).disabled`, `Absent : ${expression}`);
    await run(`(${expression}).click()`);
  };
  /** Saisie dans un champ contrôlé par Preact, focus compris. */
  const setValue = async (selector, value) => {
    const expression = `document.querySelector(${JSON.stringify(selector)})`;
    await wait(`Boolean(${expression}) && !(${expression}).disabled`, `Champ absent : ${selector}`);
    await run(`(() => {
      const field = ${expression};
      field.focus();
      field.value = ${JSON.stringify(value)};
      field.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  /** Touche réelle sur l'élément qui a le focus. */
  const press = async (key, code = key, keyCode = 13) => {
    for (const type of ["keyDown", "keyUp"]) {
      await send(
        "Input.dispatchKeyEvent",
        {
          type,
          key,
          code,
          windowsVirtualKeyCode: keyCode,
          ...(type === "keyDown" && key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
        },
        sessionId,
      );
    }
  };
  /** Point visible d'un élément non interactif de la carte ou de la zone de dépôt. */
  const point = (selector) =>
    run(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: 'nearest' });
    const r = element.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 24);
    const y = r.top + Math.min(r.height / 2, 12);
    if (x < 0 || x > innerWidth || y < 0 || y > innerHeight
      || !element.contains(document.elementFromPoint(x, y))) return null;
    return { x, y };
  })()`);
  /** Glissé natif de Chrome : carte `key` déposée sur `target` (qui doit signaler le survol). */
  const drag = async (key, target, activeSelector) => {
    await wait(idle, "Un geste est encore en cours avant le glissé");
    const from = await point(`[data-planning-issue="${key}"] .planning-card-title`);
    assert(from, `La carte ${key} n'est pas accessible pour le glisser-déposer`);
    const since = events.length;
    const mouse = (type, at, buttons) =>
      send(
        "Input.dispatchMouseEvent",
        { type, ...at, button: "left", buttons, clickCount: 1 },
        sessionId,
      );
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from }, sessionId);
    await mouse("mousePressed", from, 1);
    await mouse("mouseMoved", { x: from.x + 12, y: from.y + 6 }, 1);
    let intercepted;
    for (let attempt = 0; attempt < 40 && !intercepted; attempt++) {
      intercepted = events.slice(since).find((event) => event.method === "Input.dragIntercepted");
      if (!intercepted) await sleep(50);
    }
    assert(intercepted, `Chrome n'a pas démarré le glissement natif de ${key}`);
    const { data } = intercepted.params;
    assert(
      data.items.some(
        (item) =>
          item.mimeType === "application/x-sprint-goals-planning-issue" && item.data === key,
      ),
      "La carte n'a pas transmis son identifiant dans le glissement natif",
    );
    const to = await point(target);
    assert(to, `Destination inaccessible : ${target}`);
    for (const type of ["dragEnter", "dragOver"]) {
      await send("Input.dispatchDragEvent", { type, ...to, data }, sessionId);
    }
    await wait(
      `document.querySelector(${JSON.stringify(activeSelector)})?.classList.contains('planning-drop-active')`,
      `La destination de ${key} ne signale pas le survol`,
    );
    await send("Input.dispatchDragEvent", { type: "drop", ...to, data }, sessionId);
    await mouse("mouseReleased", to, 0);
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
  const capture = async (name) => {
    const directory = resolve(".vite/planning-check");
    mkdirSync(directory, { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(resolve(directory, `${name}.png`), Buffer.from(data, "base64"));
  };

  await viewport(1440);
  // Un ancien brouillon (décision du 14/10) dans le stockage, relu par le document suivant.
  await openBoard();
  await run("window.__planning.seedLegacyDraft()");
  await openBoard();
  const drafts = await run("window.__planning.storedDrafts()");
  assert(drafts.length === 1, "L'ancien brouillon n'a pas été placé dans le stockage du banc");

  if (packageCheck) {
    const requestsBefore = await run("window.__planning.requestCount()");
    const absentPlanning = `!(${buttonNamed("Sprint Planning")}) && !document.querySelector('.planning-screen') && Boolean(document.querySelector('.board-screen'))`;
    assert(await run(absentPlanning), "Le paquet présente encore Sprint Planning");
    assert(
      JSON.stringify(await run("window.__planning.storedDrafts()")) === JSON.stringify(drafts),
      "Le paquet a altéré l'ancien brouillon au chargement",
    );
    const result = await run("window.__planning.exerciseEntrypoints()");
    await run(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    assert(await run(absentPlanning), "Un appel direct a ouvert Sprint Planning dans le paquet");
    assert(
      result.snapshot === null &&
        result.sprints === 0 &&
        result.gesturesEnabled === false &&
        result.sprintDialogs === 0,
      `Le paquet a lu le planning, activé un geste ou ouvert une fenêtre native : ${JSON.stringify(result)}`,
    );
    const extra = await run(`window.__planning.requestsSince(${requestsBefore})`);
    assert(
      extra.length === 0,
      `Un appel direct au planning a émis des requêtes dans le paquet : ${extra.join(", ")}`,
    );
    assert((await inspect()).writes.length === 0, "Le planning du paquet a écrit dans Jira");
    assert(
      JSON.stringify(await run("window.__planning.storedDrafts()")) === JSON.stringify(drafts),
      "Un appel direct du paquet a lu ou effacé l'ancien brouillon",
    );
    console.log(
      "✓ Mode package réel : aucune entrée ni vue Planning ; appels directs sans requête, écriture ni fenêtre native ; ancien brouillon intact",
    );
  } else {
    await click(buttonNamed("Sprint Planning"));
    await wait(
      `Boolean(document.querySelector('main.planning-screen')) && ${idle}
        && document.querySelectorAll('section.planning-lane[data-planning-goal]:not([data-planning-goal="unassigned"])').length === 2`,
      "Le sprint futur et ses objectifs ne sont pas chargés",
    );
    assert(
      await run(`document.querySelector('select[aria-label="Sprint à préparer"]').value === '43'
        && Boolean(document.querySelector('[data-planning-section="sprint-44"] [data-planning-issue="ABC-220"]'))
        && document.querySelectorAll('[data-planning-section="backlog"] [data-planning-issue]').length === 4
        && Boolean(document.querySelector('[data-planning-goal="unassigned"] [data-planning-issue="ABC-210"]'))
        && Boolean(document.querySelector('[data-planning-section="active-42"]'))`),
      "Sprint préparé, autre sprint futur, backlog paginé ou ticket déjà planifié incorrect",
    );
    assert((await inspect()).writes.length === 0, "La lecture du planning a écrit dans Jira");
    await wait(
      "window.__planning.storedDrafts().length === 0",
      "L'ancien brouillon n'a pas été effacé à l'ouverture du planning",
    );
    console.log(
      "✓ Ouverture : sprint 43, autre sprint futur, backlog paginé et sprint actif lus sans écriture ; ancien brouillon effacé",
    );

    assert(
      await run(`(() => {
        const cards = [...document.querySelectorAll('[data-planning-section="active-42"] article.planning-card')];
        return cards.length > 0 && cards.every(card => card.classList.contains('planning-card-readonly')
          && card.getAttribute('draggable') !== 'true' && !card.querySelector('details'));
      })()`),
      "Le reste à faire du sprint actif doit rester en consultation",
    );
    assert(
      await run(`document.querySelector('.planning-start-sprint').disabled
        && document.querySelector('#planning-start-reason')?.textContent.includes('Un sprint est actif')`),
      "« Démarrer » doit être désactivé avec sa raison tant qu'un sprint est actif",
    );
    await setValue('[aria-label="Rechercher un ticket à planifier"]', "ABC-203");
    assert(
      await run(`document.querySelectorAll('.planning-sources [data-planning-issue]').length === 1
        && !document.querySelector('[data-planning-goal="unassigned"] [data-planning-issue]')`),
      "La recherche ne filtre pas la colonne de gauche et les swimlanes",
    );
    await setValue('[aria-label="Rechercher un ticket à planifier"]', "");
    console.log(
      "✓ Sprint actif en consultation ; « Démarrer » désactivé avec sa raison ; recherche partagée",
    );

    const lane = (index) =>
      `document.querySelectorAll('section.planning-lane[data-planning-goal]:not([data-planning-goal="unassigned"])')[${index}]`;
    let done = await writes();
    await setValue("form.planning-add-goal input", "Fiabiliser la reprise du panier");
    await click("document.querySelector('form.planning-add-goal button[type=submit]')");
    done = await expectWrites(done, [E8, E5], "Ajout d'objectif");
    let state = await inspect();
    assert(
      state.sprint.goal.split("\n").length === 3 &&
        state.sprint.goal.includes("Fiabiliser la reprise du panier") &&
        state.document?.goals?.length === 3,
      "L'objectif ajouté n'est pas dans le texte et la propriété du sprint",
    );
    await wait(`Boolean(${lane(2)})`, "La swimlane du nouvel objectif est absente");
    const firstGoal = await run(`${lane(0)}.dataset.planningGoal`);
    const secondGoal = await run(`${lane(1)}.dataset.planningGoal`);
    console.log("✓ Ajout d'objectif : E8 puis E5, relus dans le faux Jira");

    await setValue(
      "section.planning-lane input.planning-goal-title",
      "Simplifier le paiement en une étape",
    );
    await press("Enter");
    done = await expectWrites(done, [E8, E5], "Renommage");
    state = await inspect();
    assert(
      state.sprint.goal.includes("Simplifier le paiement en une étape") &&
        state.document.goals.some(
          (goal) => goal.id === firstGoal && goal.title === "Simplifier le paiement en une étape",
        ) &&
        (await run(`${lane(0)}.dataset.planningGoal`)) === firstGoal,
      "Le renommage n'a pas gardé l'identifiant de l'objectif",
    );
    console.log("✓ Renommage validé par Entrée : E8 puis E5, même identifiant");

    const laneCell = (id) => `[data-planning-goal="${id}"] .planning-lane-cell`;
    await drag("ABC-201", laneCell(firstGoal), `[data-planning-goal="${firstGoal}"]`);
    done = await expectWrites(done, [E9, E5], "Ticket du backlog posé");
    await wait(
      `document.querySelector('[data-planning-goal="${firstGoal}"] [data-planning-issue="ABC-201"] .planning-origin')?.textContent.includes('Vient du backlog')
        && !document.querySelector('.planning-sources [data-planning-issue="ABC-201"]')`,
      "ABC-201 n'a pas rejoint l'objectif avec sa provenance",
    );
    state = await inspect();
    assert(
      state.issueKeys.includes("ABC-201") && state.document.links["ABC-201"] === firstGoal,
      "ABC-201 n'est pas dans le sprint 43 ou pas rattaché à son objectif",
    );
    console.log("✓ Glissé du backlog sur un objectif : E9 puis E5, provenance affichée");

    await drag("ABC-220", laneCell(secondGoal), `[data-planning-goal="${secondGoal}"]`);
    done = await expectWrites(done, [E9, E5], "Ticket d'un autre sprint futur posé");
    await wait(
      `document.querySelector('[data-planning-goal="${secondGoal}"] [data-planning-issue="ABC-220"] .planning-origin')?.textContent.includes('Sprint 44')
        && !document.querySelector('[data-planning-section="sprint-44"] [data-planning-issue]')`,
      "ABC-220 n'a pas quitté le sprint 44 pour l'objectif",
    );
    state = await inspect();
    assert(
      state.otherSprintKeys.length === 0 && state.document.links["ABC-220"] === secondGoal,
      "ABC-220 n'a pas été déplacé puis rattaché",
    );
    console.log("✓ Glissé depuis un autre sprint futur : E9 (déplacement) puis E5");

    await drag("ABC-210", ".planning-sources-title", "aside.planning-sources");
    done = await expectWrites(done, [E10], "Retour au backlog");
    await wait(
      `Boolean(document.querySelector('[data-planning-section="backlog"] [data-planning-issue="ABC-210"]'))
        && !document.querySelector('.planning-lanes [data-planning-issue="ABC-210"]')`,
      "ABC-210 n'est pas revenu dans le backlog",
    );
    assert(!(await inspect()).issueKeys.includes("ABC-210"), "ABC-210 est encore dans le sprint");
    console.log("✓ Renvoi au backlog par glissé : E10 seul, relu");

    await setValue(".planning-velocity input", "20");
    await press("Enter");
    done = await expectWrites(done, [E5], "Vélocité");
    assert(
      (await inspect()).document.velocity === 20 &&
        (await run("document.querySelector('.planning-load').textContent.includes('/ 20')")),
      "La vélocité n'est pas écrite ou la charge ne s'y compare pas",
    );
    console.log("✓ Vélocité validée par Entrée : E5 seul, charge comparée");
    await capture("planning-desktop");

    // Quelqu'un modifie le texte de l'objectif dans Jira : le geste suivant n'écrit rien.
    await run("window.__planning.changeGoalText('🎯 Objectif modifié dans Jira')");
    await setValue("form.planning-add-goal input", "Encore un objectif");
    await click("document.querySelector('form.planning-add-goal button[type=submit]')");
    await wait(
      `Boolean(document.querySelector('.planning-messages .planning-notice')) && ${idle}`,
      "Le conflit sur le texte n'est pas signalé",
    );
    assert(
      JSON.stringify(await writes()) === JSON.stringify(done),
      "Le conflit sur le texte a écrit dans Jira",
    );
    await wait(
      "[...document.querySelectorAll('input.planning-goal-title')].some(input => input.value === 'Objectif modifié dans Jira')",
      "La page n'a pas été relue après le conflit",
    );
    assert(
      await run(
        "document.querySelector('form.planning-add-goal input').value === 'Encore un objectif'",
      ),
      "La saisie refusée doit rester à reprendre",
    );
    console.log("✓ Texte changé dans Jira : rien écrit, avis affiché, page relue, saisie gardée");

    // Le panneau latéral peut rester ouvert ; les contrôles doivent aussi tenir dans l'espace réduit.
    for (const width of [640, 390]) {
      await viewport(width, 844);
      if (width === 390)
        await click("document.querySelector('[aria-label=\"Masquer la barre latérale\"]')");
      assert(
        await run("document.documentElement.scrollWidth <= innerWidth + 1"),
        `${width}px : la page déborde horizontalement`,
      );
      // Un conteneur masqué peut défiler sous `scrollIntoView` : l'en-tête doit tenir tel quel.
      const outside = await run(`[...document.querySelectorAll('.planning-header *')]
        .filter(element => {
          const r = element.getBoundingClientRect();
          return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
        })
        .map(element => element.className || element.tagName)`);
      assert(outside.length === 0, `${width}px : en-tête hors de l'écran : ${outside.join(", ")}`);
      for (const selector of [
        '[aria-label="Sprint à préparer"]',
        ".planning-velocity input",
        ".planning-close-sprint",
        ".planning-start-sprint",
        "#planning-start-reason",
        "form.planning-add-goal input",
        '[data-planning-section="backlog"] .planning-source-head',
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
          `${width}px : contrôle inaccessible ou recouvert : ${selector}`,
        );
      }
      assert(
        await run(
          "[...document.querySelectorAll('main.planning-screen, main.planning-screen *')].every(element => element.scrollLeft === 0)",
        ),
        `${width}px : un conteneur du planning défile horizontalement`,
      );
      await capture(`planning-${width}`);
      console.log(
        `✓ Planning ${width}px : en-tête, colonnes et saisie accessibles sans débordement`,
      );
    }
    await viewport(1440);

    // Fenêtres natives simulées : l'hôte reçoit la demande, l'utilisateur seul valide.
    await click("document.querySelector('.planning-close-sprint')");
    assert(
      JSON.stringify(await run("window.__planning.sprintDialogs()")) ===
        JSON.stringify([{ action: "complete", sprintId: 42 }]),
      "La clôture n'a pas demandé la fenêtre native du sprint actif",
    );
    await run("window.__planning.closeNativeDialog(false)");
    await wait(
      `document.querySelector('.planning-notice')?.textContent.includes('toujours actif') && ${idle}`,
      "Une fenêtre de clôture annulée doit être signalée",
    );
    assert(
      JSON.stringify(await writes()) === JSON.stringify(done),
      "Une clôture annulée a écrit dans Jira",
    );
    await click("document.querySelector('.planning-close-sprint')");
    await run("window.__planning.closeNativeDialog(true)");
    await wait(
      `!document.querySelector('[data-planning-section="active-42"]') && !document.querySelector('.planning-close-sprint') && ${idle}`,
      "Le planning n'a pas été relu après la clôture",
    );
    const carried = (await writes()).slice(done.length);
    state = await inspect();
    assert(
      JSON.stringify(carried) === JSON.stringify([E8, E5]) &&
        state.sprint.state === "future" &&
        /Finaliser le parcours de paiement|Améliorer la stabilité/.test(state.sprint.goal),
      `Report après clôture inattendu : ${JSON.stringify(carried)} ; texte ${JSON.stringify(state.sprint.goal)}`,
    );
    done = [...done, ...carried];
    console.log(
      "✓ Clôture : fenêtre annulée sans écriture ; validée, objectifs non atteints reportés (E8 puis E5)",
    );

    await click("document.querySelector('.planning-start-sprint')");
    assert(
      JSON.stringify(await run("window.__planning.sprintDialogs()").then((list) => list.at(-1))) ===
        JSON.stringify({ action: "start", sprintId: 43 }),
      "« Démarrer » n'a pas demandé la fenêtre native du sprint préparé",
    );
    assert(
      JSON.stringify(await writes()) === JSON.stringify(done) &&
        (await inspect()).sprint.state === "future",
      "Le démarrage a écrit dans Jira au lieu de laisser la fenêtre native",
    );
    console.log("✓ Démarrer, sans sprint actif : fenêtre native demandée, aucune écriture");
  }
} finally {
  await browser.close();
  await server.close();
}
