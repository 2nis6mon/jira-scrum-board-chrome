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
  /** Touche réelle sur l'élément qui a le focus ; `modifiers` : 8 pour Maj. */
  const press = async (key, code = key, keyCode = 13, modifiers = 0) => {
    for (const type of ["keyDown", "keyUp"]) {
      await send(
        "Input.dispatchKeyEvent",
        {
          type,
          key,
          code,
          modifiers,
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
  /** Clic réel sur la carte `key` avec des touches (2 : Ctrl, 4 : Cmd, 8 : Maj). */
  const clickCard = async (key, modifiers) => {
    const at = await point(`[data-planning-issue="${key}"] .planning-card-title`);
    assert(at, `La carte ${key} n'est pas accessible pour le clic`);
    for (const type of ["mousePressed", "mouseReleased"])
      await send(
        "Input.dispatchMouseEvent",
        {
          type,
          ...at,
          button: "left",
          buttons: type === "mousePressed" ? 1 : 0,
          clickCount: 1,
          modifiers,
        },
        sessionId,
      );
  };
  /**
   * Glissé natif de Chrome : carte `key` déposée sur `target` (qui doit signaler le survol) ;
   * `carried` : clés transmises, la seule carte par défaut, toute la sélection sinon.
   */
  const drag = async (key, target, activeSelector, carried = key) => {
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
          item.mimeType === "application/x-sprint-goals-planning-issue" && item.data === carried,
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
  const openBoard = async (scenario = "board-planning") => {
    const url = `http://127.0.0.1:${PORT}/?scenario=${scenario}&hote=1&essai=${++navigation}`;
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

    // Filtres de la page du sprint : menu Personne, puis filtre rapide Jira évalué par le faux
    // Jira sur le périmètre du planning. Totaux des objectifs et charge ne bougent pas.
    const shownCards =
      "[...document.querySelectorAll('.planning-body [data-planning-issue]')].map(card => card.dataset.planningIssue).sort().join(',')";
    const totalsText = `[document.querySelector('.planning-load').textContent,
      ...[...document.querySelectorAll('section.planning-lane[data-planning-goal]:not([data-planning-goal="unassigned"]) .lane-count')].map(count => count.textContent)].join('|')`;
    const allCards = await run(shownCards);
    const totalsBefore = await run(totalsText);
    const filterWrites = await writes();
    assert(
      JSON.stringify(
        await run(
          "[...document.querySelectorAll('.planning-filter-bar details.filter-menu > summary')].map(summary => summary.textContent.trim())",
        ),
      ) === JSON.stringify(["Personne", "Type", "Parent", "Statut", "Label"]) &&
        (await run(`Boolean(${buttonNamed("Bloqués")})`)),
      "La barre du planning doit proposer Bloqués, Personne, Type, Parent, Statut et Label",
    );
    await run(
      "document.querySelector('.planning-filter-bar details.filter-menu > summary').click()",
    );
    const camille =
      "[...document.querySelectorAll('.planning-filter-bar details.filter-menu[open] .filter-option')].find(option => option.textContent.startsWith('Camille Durand'))?.querySelector('input')";
    await click(camille);
    await wait(
      `${shownCards} === 'ABC-101,RUN-7'`,
      "Le menu Personne ne réduit pas les cartes du planning",
    );
    assert(
      (await run(totalsText)) === totalsBefore,
      "Le menu Personne a changé les totaux ou la charge",
    );
    await run("document.querySelector('.planning-filter-bar details.filter-menu').open = false");
    await click("document.querySelector('.planning-filter-bar .filter-reset')");
    await wait(
      `${shownCards} === ${JSON.stringify(allCards)}`,
      "Réinitialiser ne vide pas les filtres",
    );
    const beforeQuick = await run("window.__planning.requestCount()");
    await click(buttonNamed("Mes tickets"));
    await wait(
      `${shownCards} === 'ABC-101,ABC-201,ABC-210' && !document.querySelector('.planning-filter-bar .chip-jira[disabled]')`,
      "Le filtre rapide Jira ne réduit pas les cartes du planning",
    );
    const sentJql = await run(`window.__planning.quickFilterJql(${beforeQuick})`);
    assert(
      JSON.stringify(sentJql) ===
        JSON.stringify([
          "(assignee = currentUser()) AND (sprint in (43,44,42) OR sprint is EMPTY OR (sprint in closedSprints() AND status not in (6)))",
        ]),
      `JQL du filtre rapide inattendu : ${JSON.stringify(sentJql)}`,
    );
    assert(
      (await run(totalsText)) === totalsBefore,
      "Le filtre rapide Jira a changé les totaux ou la charge",
    );
    await capture("planning-filtres");
    // Les contrôles du petit écran ont besoin de toutes les cartes.
    await click("document.querySelector('.planning-filter-bar .filter-reset')");
    await wait(
      `${shownCards} === ${JSON.stringify(allCards)}`,
      "Réinitialiser ne vide pas les filtres",
    );
    assert(
      JSON.stringify(await writes()) === JSON.stringify(filterWrites),
      "Les filtres du planning ont écrit dans Jira",
    );
    console.log(
      "✓ Filtres : menu Personne et filtre rapide Jira (périmètre du planning) réduisent les cartes, totaux et charge inchangés, sans écriture",
    );

    // Clic droit réel : le menu ⋯ d'une carte du sprint s'ouvre au pointeur, à l'écran ; une carte
    // en consultation garde le menu du navigateur.
    await run(`(() => {
      window.__contextMenus = [];
      window.addEventListener('contextmenu', event => window.__contextMenus.push(event.defaultPrevented));
    })()`);
    const rightClick = async (at) => {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at }, sessionId);
      for (const [type, buttons] of [
        ["mousePressed", 2],
        ["mouseReleased", 0],
      ]) {
        await send(
          "Input.dispatchMouseEvent",
          { type, ...at, button: "right", buttons, clickCount: 1 },
          sessionId,
        );
      }
    };
    const beforeMenu = await writes();
    const sprintCard = await point('[data-planning-issue="ABC-210"] .planning-card-title');
    assert(sprintCard, "La carte ABC-210 du sprint n'est pas accessible au clic droit");
    await rightClick(sprintCard);
    await wait(
      "Boolean(document.querySelector('.card-menu[data-placed]'))",
      "Le clic droit sur ABC-210 n'a pas ouvert le menu de la carte",
    );
    const opened = await run(`(() => {
      const panel = document.querySelector('.card-menu');
      const r = panel.getBoundingClientRect();
      const labels = [...panel.querySelectorAll('[role=menuitem]')].map(item => item.textContent.replace('›', '').trim());
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, labels,
        focusInside: panel.contains(document.activeElement),
        hit: panel.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 12)) };
    })()`);
    assert(
      opened.width > 0 &&
        opened.left >= 0 &&
        opened.top >= 0 &&
        opened.right <= 1441 &&
        opened.bottom <= 961 &&
        Math.abs(opened.left - sprintCard.x) <= 1 &&
        Math.abs(opened.top - sprintCard.y) <= 1 &&
        opened.focusInside &&
        opened.hit &&
        opened.labels[0] === "Envoyer vers un goal" &&
        opened.labels.includes("Retirer du sprint") &&
        opened.labels.some((label) => label.startsWith("Mettre en top priorité")),
      `Menu du clic droit mal placé ou recouvert : ${JSON.stringify({ opened, sprintCard })}`,
    );
    assert(
      JSON.stringify(await run("window.__contextMenus")) === JSON.stringify([true]),
      "Le clic droit sur une carte du sprint doit remplacer le menu du navigateur",
    );
    await capture("planning-menu-clic-droit");
    await press("Escape", "Escape", 27);
    await wait(
      `!document.querySelector('.card-menu')
        && document.activeElement?.matches('[data-planning-issue="ABC-210"] .planning-card-menu')`,
      "Échap ne referme pas le menu du clic droit ou ne rend pas le focus au ⋯",
    );
    // Au clavier : Maj+F10 puis la touche Menu, depuis le lien de la carte ; un seul menu, sous la
    // carte, le focus dedans, rendu au lien par Échap.
    const link210 = `document.querySelector('[data-planning-issue="ABC-210"] .planning-issue-link')`;
    for (const [label, key, keyCode, modifiers] of [
      ["Maj+F10", "F10", 121, 8],
      ["Touche Menu", "ContextMenu", 93, 0],
    ]) {
      await run(`${link210}.focus()`);
      await press(key, key, keyCode, modifiers);
      await wait(
        "Boolean(document.querySelector('.card-menu[data-placed]'))",
        `${label} n'a pas ouvert le menu de ABC-210`,
      );
      // Le « contextmenu » que Chrome envoie ensuite ne doit ni rouvrir ni déplacer le menu.
      await sleep(150);
      const below = await run(`(() => {
        const card = document.querySelector('[data-planning-issue="ABC-210"]').getBoundingClientRect();
        const panel = document.querySelector('.card-menu');
        const r = panel.getBoundingClientRect();
        return { open: document.querySelectorAll('.card-menu').length,
          dx: r.left - card.left, dy: r.top - card.bottom, width: r.width,
          focusInside: panel.contains(document.activeElement) };
      })()`);
      assert(
        below.open === 1 &&
          below.width > 0 &&
          Math.abs(below.dx) <= 1 &&
          Math.abs(below.dy) <= 1 &&
          below.focusInside,
        `${label} : menu absent, en double, mal placé sous la carte ou sans le focus : ${JSON.stringify(below)}`,
      );
      await press("Escape", "Escape", 27);
      await wait(
        `!document.querySelector('.card-menu') && document.activeElement === ${link210}`,
        `${label} : Échap ne referme pas le menu ou ne rend pas le focus au lien`,
      );
    }
    const readOnlyCard = await point('[data-planning-section="active-42"] .planning-card-title');
    assert(readOnlyCard, "Aucune carte du sprint actif n'est accessible au clic droit");
    // Les touches du clavier ont pu envoyer leurs propres « contextmenu » : seul ce clic compte.
    await run("window.__contextMenus = []");
    await rightClick(readOnlyCard);
    await wait("window.__contextMenus.length === 1", "Le clic droit en consultation est absent");
    assert(
      JSON.stringify(await run("window.__contextMenus")) === JSON.stringify([false]) &&
        !(await run("Boolean(document.querySelector('.card-menu'))")),
      "Une carte en consultation ne doit ouvrir aucun menu de l'extension",
    );
    assert(
      JSON.stringify(await writes()) === JSON.stringify(beforeMenu),
      "Ouvrir et refermer un menu de carte a écrit dans Jira",
    );
    console.log(
      "✓ Clic droit, Maj+F10 et touche Menu réels : un seul menu, au pointeur ou sous la carte, Échap rend le focus ; consultation sans menu",
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

    // Story 8.15 : Ctrl+clic sur deux cartes du backlog, puis un seul glissé pour le lot.
    await clickCard("ABC-202", 2);
    await clickCard("ABC-204", 2);
    await wait(
      "document.querySelector('.planning-selection')?.textContent.includes('2 tickets sélectionnés')",
      "Le nombre de tickets sélectionnés n'est pas affiché",
    );
    await drag(
      "ABC-202",
      laneCell(secondGoal),
      `[data-planning-goal="${secondGoal}"]`,
      "ABC-202 ABC-204",
    );
    done = await expectWrites(done, [E9, E5], "Lot posé sur un objectif");
    state = await inspect();
    assert(
      ["ABC-202", "ABC-204"].every(
        (key) => state.issueKeys.includes(key) && state.document.links[key] === secondGoal,
      ),
      "Le lot n'a pas rejoint l'objectif en un seul geste",
    );
    await wait("!document.querySelector('.planning-selection')", "La sélection n'a pas été vidée");
    console.log("✓ Lot : Ctrl+clic sur deux cartes, un glissé, une seule E9 puis une seule E5");

    // Story 8.17 : estimation saisie sur la carte d'un ticket du backlog, E11 seule puis relue.
    const estimateOf = (key) =>
      `document.querySelector('[data-planning-issue="${key}"] button.planning-estimate')`;
    await click(estimateOf("ABC-203"));
    await setValue('[aria-label="Estimation de ABC-203"]', "3");
    await press("Enter");
    done = await expectWrites(
      done,
      ["PUT /rest/agile/1.0/issue/ABC-203/estimation"],
      "Estimation sur la carte",
    );
    await wait(
      `${estimateOf("ABC-203")}?.textContent === "3"`,
      "La carte n'affiche pas l'estimation relue",
    );
    console.log("✓ Estimation sur la carte : Entrée écrit E11 une fois, valeur relue affichée");

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
      // La barre de filtres passe à la ligne sans déborder de l'écran.
      const barOutside = await run(`(() => {
        const bar = document.querySelector('.planning-filter-bar');
        const outside = [bar, ...bar.querySelectorAll('*')].filter(element => {
          const r = element.getBoundingClientRect();
          // Le panneau d'un menu fermé n'est pas affiché : seul ce qui se voit compte.
          return element.checkVisibility() && r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
        }).map(element => element.className || element.tagName);
        return bar.scrollWidth > bar.clientWidth + 1 ? ['planning-filter-bar (défilement)', ...outside] : outside;
      })()`);
      assert(
        barOutside.length === 0,
        `${width}px : barre de filtres hors de l'écran : ${barOutside.join(", ")}`,
      );
      // Chaque menu ouvert tient dans la largeur de l'écran, une fois placé par la vue.
      const menusOutside = await run(`(async () => {
        const outside = [];
        for (const menu of document.querySelectorAll('.planning-filter-bar details.filter-menu')) {
          menu.open = true;
          await new Promise(resolve => setTimeout(resolve, 50));
          const r = menu.querySelector('.filter-menu-panel').getBoundingClientRect();
          if (r.width === 0 || r.left < -1 || r.right > innerWidth + 1)
            outside.push(menu.querySelector('summary').textContent.trim());
          menu.open = false;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        return outside;
      })()`);
      assert(
        menusOutside.length === 0,
        `${width}px : menu de filtre hors de l'écran : ${menusOutside.join(", ")}`,
      );
      for (const selector of [
        '[aria-label="Sprint à préparer"]',
        '[aria-label="Rechercher un ticket à planifier"]',
        ".planning-filter-bar .chip-blocked",
        ".planning-filter-bar details.filter-menu:last-of-type > summary",
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
    // Relectures de l'état du sprint pendant 10 s : l'en-tête dit la clôture en cours.
    await wait(
      "document.querySelector('.sync-status')?.textContent === 'Clôture en cours dans Jira…'",
      "La vérification de la clôture n'est pas annoncée",
    );
    await wait(
      `document.querySelector('.planning-carry-over-summary')?.textContent.includes('toujours actif') && ${idle}`,
      "Une fenêtre de clôture annulée doit être signalée dans le compte rendu",
    );
    assert(
      JSON.stringify(await writes()) === JSON.stringify(done),
      "Une clôture annulée a écrit dans Jira",
    );
    const goalLinesBefore = (await inspect()).sprint.goal.split("\n");
    await click("document.querySelector('.planning-close-sprint')");
    // Clôture lente : Jira clôt le sprint 2 s après la fermeture de sa fenêtre.
    await run("window.__planning.closeNativeDialog(true, 2000)");
    await wait(
      `!document.querySelector('[data-planning-section="active-42"]') && !document.querySelector('.planning-close-sprint') && document.querySelector('.planning-carry-over-summary')?.textContent.includes('reportés') && ${idle}`,
      "Le planning n'a pas été relu après la clôture lente",
    );
    const lines = await run(`[...document.querySelectorAll('.planning-carry-over li')].map(line =>
      [line.dataset.carryOverStatus, line.querySelector('.planning-carry-over-title').textContent])`);
    assert(
      JSON.stringify(lines) ===
        JSON.stringify([
          ["carried", "Finaliser le parcours de paiement"],
          ["allDone", "Améliorer la stabilité"],
        ]),
      `Compte rendu de clôture inattendu : ${JSON.stringify(lines)}`,
    );
    const carried = (await writes()).slice(done.length);
    state = await inspect();
    // Seul « Finaliser le parcours de paiement » (ABC-101 et ABC-102 hors de la dernière colonne)
    // est non atteint ; « Améliorer la stabilité » (ABC-103 terminé) ne doit pas être reporté.
    assert(
      JSON.stringify(carried) === JSON.stringify([E8, E5]) &&
        state.sprint.state === "future" &&
        JSON.stringify(state.sprint.goal.split("\n")) ===
          JSON.stringify([...goalLinesBefore, "Finaliser le parcours de paiement"]) &&
        !state.sprint.goal.includes("Améliorer la stabilité"),
      `Report après clôture inattendu : ${JSON.stringify(carried)} ; texte ${JSON.stringify(state.sprint.goal)}`,
    );
    done = [...done, ...carried];
    console.log(
      "✓ Clôture : fenêtre annulée signalée après 10 s sans écriture ; validée lentement, objectifs non atteints reportés (E8 puis E5) avec leur compte rendu",
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
    // Le compte rendu reste affiché après un autre geste, jusqu'à sa fermeture.
    assert(
      await run("Boolean(document.querySelector('.planning-carry-over'))"),
      "Le compte rendu de clôture a disparu au geste suivant",
    );
    await click("document.querySelector('.planning-carry-over-head button')");
    await wait(
      "!document.querySelector('.planning-carry-over')",
      "Le compte rendu ne se ferme pas",
    );
    console.log("✓ Démarrer, sans sprint actif : fenêtre native demandée, aucune écriture");

    // Deux sprints actifs : le menu choisit le sprint, sa fenêtre et ses objectifs.
    await openBoard("board-planning-deux-actifs");
    await click(buttonNamed("Sprint Planning"));
    await wait(
      `Boolean(document.querySelector('.planning-close-menu')) && !document.querySelector('button.planning-close-sprint') && ${idle}`,
      "Deux sprints actifs : le menu « Clôturer un sprint » est absent",
    );
    const twoBefore = await writes();
    await run("document.querySelector('.planning-close-menu > summary').click()");
    await wait(
      `(() => {
        const panel = document.querySelector('.planning-close-menu[data-placed] .menu-panel');
        if (!panel) return false;
        const r = panel.getBoundingClientRect();
        return r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      })()`,
      "Le menu « Clôturer un sprint » ne s'affiche pas dans la fenêtre",
    );
    await capture("planning-menu-cloture");
    await click(
      `[...document.querySelectorAll('.planning-close-menu .menu-panel button')].find(button => button.textContent.trim() === 'Sprint 45 — Notifications')`,
    );
    assert(
      JSON.stringify(await run("window.__planning.sprintDialogs()")) ===
        JSON.stringify([{ action: "complete", sprintId: 45 }]),
      "Le menu n'a pas demandé la fenêtre native du sprint choisi",
    );
    await run("window.__planning.closeNativeDialog(true, 0, 45)");
    await wait(
      `document.querySelector('.planning-carry-over h3')?.textContent === 'Clôture de Sprint 45 — Notifications' && ${idle}`,
      "Le compte rendu de la clôture du sprint 45 est absent",
    );
    const twoState = await inspect();
    const twoWrites = (await writes()).slice(twoBefore.length);
    assert(
      JSON.stringify(twoWrites) === JSON.stringify([E8, E5]) &&
        twoState.sprint.goal.split("\n").at(-1) === "Fiabiliser les notifications" &&
        !twoState.sprint.goal.includes("Finaliser le parcours de paiement"),
      `Report du sprint 45 inattendu : ${JSON.stringify(twoWrites)} ; texte ${JSON.stringify(twoState.sprint.goal)}`,
    );
    assert(
      await run(
        "Boolean(document.querySelector('button.planning-close-sprint')) && !document.querySelector('.planning-close-menu')",
      ),
      "Après la clôture du sprint 45, « Clôturer Sprint 42 » doit revenir",
    );
    await capture("planning-deux-actifs");
    console.log(
      "✓ Deux sprints actifs : menu des sprints, fenêtre du sprint choisi, report de ses objectifs",
    );
  }
} finally {
  await browser.close();
  await server.close();
}
