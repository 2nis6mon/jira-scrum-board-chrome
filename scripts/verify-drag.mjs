// Régression du glisser-déposer sur les vues réelles, avec Jira fictif et profil Chrome vierge.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { checkDragAutoScroll, launchIsolatedBrowser, sleep } from "./browser-check.mjs";

const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.harness.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port: 5201, strictPort: true },
});
await server.listen();
const browser = launchIsolatedBrowser("1600,1200");
const { send, evaluate, waitFor, navigateToHarness, events } = browser;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Input.setInterceptDrags", { enabled: true }, sessionId);
  for (const [height, key] of [1200, 800].flatMap((height) =>
    ["ABC-102", "ABC-103", "ABC-105"].map((key) => [height, key]),
  )) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1600, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await navigateToHarness(sessionId, "http://127.0.0.1:5201/?scenario=board-drag-regression");
    // Premier chargement : le serveur du banc d'essai compile encore, pas d'attente fixe.
    await waitFor(
      sessionId,
      `Boolean(document.querySelector('[data-issue-key="${key}"]'))`,
      `Le banc d'essai n'a pas affiché la carte ${key}`,
    );
    const before = await evaluate(
      sessionId,
      `(() => {
      const card = document.querySelector('[data-issue-key="${key}"]');
      card.scrollIntoView({block: 'center'});
      window.dragSource = card;
      const rect = card.getBoundingClientRect();
      return {x: rect.x + 35, y: rect.y + 35, top: rect.top, lane: card.closest('.lane').dataset.laneId};
    })()`,
    );
    const since = events.length;
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: before.x, y: before.y },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: before.x, y: before.y, button: "left", buttons: 1, clickCount: 1 },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: before.x + 20, y: before.y + 5, button: "left", buttons: 1 },
      sessionId,
    );
    await sleep(300);
    const intercepted = events
      .slice(since)
      .find((event) => event.method === "Input.dragIntercepted");
    assert(intercepted, `${key} : le navigateur n'a pas démarré le glissement`);
    const after = await evaluate(
      sessionId,
      `({top: window.dragSource.getBoundingClientRect().top, connected: window.dragSource.isConnected})`,
    );
    assert(
      after.connected && Math.abs(after.top - before.top) < 1,
      `${key} : la source s'est déplacée de ${after.top - before.top}px`,
    );
    // Story 8.24 : board plus haut que la fenêtre, défilement par la bande basse pendant le glissé.
    if (height === 800 && key === "ABC-102") {
      const { scrolled, overflow } = await checkDragAutoScroll(
        browser,
        sessionId,
        ".board",
        intercepted.params.data,
      );
      // Les swimlanes survolées pendant le contrôle ont pu garder un message de dépôt, retiré au
      // survol suivant : un premier survol de la destination stabilise la mise en page,
      const zone = await evaluate(
        sessionId,
        `(() => {
          const zone = document.querySelector('[data-lane-id="${before.lane}"] [data-status-id="3"]');
          zone.scrollIntoView({block: 'center'});
          const r = zone.getBoundingClientRect();
          return {x: r.left + r.width / 2, y: r.top + r.height / 2};
        })()`,
      );
      await send(
        "Input.dispatchDragEvent",
        { type: "dragOver", ...zone, data: intercepted.params.data },
        sessionId,
      );
      await sleep(300);
      // Puis la position de départ du glissé, comme les autres cas.
      await evaluate(sessionId, "window.dragSource.scrollIntoView({block: 'center'})");
      await sleep(100);
      console.log(
        `✓ Board plus haut que la fenêtre : immobile au milieu, défile dans la bande basse (${scrolled} px sur ${overflow}), s'arrête hors de la bande`,
      );
    }
    const target = await evaluate(
      sessionId,
      `(() => {
      const zone = document.querySelector('[data-lane-id="${before.lane}"] [data-status-id="3"]');
      const r = zone.getBoundingClientRect(); const cell = zone.closest('.lane-cell').getBoundingClientRect();
      const x = r.left + r.width / 2, y = Math.min(r.top + 25, cell.bottom - 10);
      return {x, y, reachable: zone.contains(document.elementFromPoint(x, y))};
    })()`,
    );
    assert(target.reachable, `${key} : destination masquée par une autre swimlane`);
    for (const type of ["dragEnter", "dragOver", "drop"]) {
      await send(
        "Input.dispatchDragEvent",
        { type, x: target.x, y: target.y, data: intercepted.params.data },
        sessionId,
      );
      await sleep(100);
    }
    await send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        x: target.x,
        y: target.y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      },
      sessionId,
    );
    await sleep(500);
    const result = await evaluate(
      sessionId,
      `(() => { const c=document.querySelector('[data-issue-key="${key}"]'); return {cell:c.closest('.lane-cell').getAttribute('aria-label'), pending:c.getAttribute('aria-busy'), feedback:c.dataset.moveFeedback}; })()`,
    );
    assert(
      result.cell.endsWith("— En cours") && result.pending !== "true" && !result.feedback,
      `${key} : déplacement non confirmé : ${JSON.stringify(result)}`,
    );
    console.log(
      `✓ ${key} (${before.lane}, hauteur ${height}px) : source stable, destination accessible, transition confirmée sans repère de réussite`,
    );
  }
  for (const height of [1200, 800]) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1600, height, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await navigateToHarness(sessionId, "http://127.0.0.1:5201/?scenario=board-drag-goal-priority");
    await waitFor(
      sessionId,
      "window.__goalPriority?.ready && document.querySelector('[data-issue-key=\"RUN-7\"]')?.closest('.lane')?.dataset.laneId === 'swimlane:1'",
      "Le scénario RUN / objectifs n'est pas prêt",
    );
    async function moveRun(laneId, allowed, expectedLane, expectedWrites, expectedGoal) {
      const before = await evaluate(
        sessionId,
        `(() => {
          const card = document.querySelector('[data-issue-key="RUN-7"]');
          card.scrollIntoView({block: 'center'});
          window.dragSource = card;
          const rect = card.getBoundingClientRect();
          return {x: rect.x + 35, y: rect.y + 35, top: rect.top};
        })()`,
      );
      const since = events.length;
      await send(
        "Input.dispatchMouseEvent",
        { type: "mouseMoved", x: before.x, y: before.y },
        sessionId,
      );
      await send(
        "Input.dispatchMouseEvent",
        {
          type: "mousePressed",
          x: before.x,
          y: before.y,
          button: "left",
          buttons: 1,
          clickCount: 1,
        },
        sessionId,
      );
      await send(
        "Input.dispatchMouseEvent",
        { type: "mouseMoved", x: before.x + 20, y: before.y + 5, button: "left", buttons: 1 },
        sessionId,
      );
      await sleep(300);
      const intercepted = events
        .slice(since)
        .find((event) => event.method === "Input.dragIntercepted");
      assert(intercepted, "RUN-7 : le navigateur n'a pas démarré le glissement");
      const after = await evaluate(
        sessionId,
        `({top: window.dragSource.getBoundingClientRect().top, connected: window.dragSource.isConnected})`,
      );
      assert(
        after.connected && Math.abs(after.top - before.top) < 1,
        `RUN-7 : la révélation de sa destination a déplacé la source de ${after.top - before.top}px`,
      );
      // Story 8.32 : RUN-7 est « En cours » ; on vise la colonne « Terminé » de l'autre swimlane,
      // qui n'est qu'une seule zone de dépôt : seul l'objectif change, jamais la colonne.
      const target = await evaluate(
        sessionId,
        `(() => {
          const lane = document.querySelector('[data-lane-id="${laneId}"]');
          const cell = lane?.querySelector('.lane-cell:last-child');
          if (!cell) return null;
          // Hors de la bande de défilement du bas du board (story 8.24).
          cell.scrollIntoView({block: 'center'});
          const rect = cell.getBoundingClientRect();
          const x = rect.left + rect.width / 2, y = rect.top + 25;
          return {x, y, reachable: cell.contains(document.elementFromPoint(x, y)),
            column: cell.getAttribute('aria-label'),
            allowed: lane.classList.contains('lane-drop-zone'),
            disabled: lane.getAttribute('aria-disabled') === 'true',
            cellZones: lane.querySelectorAll('.lane-cell-droppable, .status-drop-zone').length};
        })()`,
      );
      assert(target?.reachable, `RUN-7 : destination ${laneId} absente ou inaccessible`);
      assert(
        target.column.endsWith("— Terminé"),
        `RUN-7 : colonne visée inattendue ${target.column}`,
      );
      assert(
        target.allowed === allowed && target.disabled === !allowed && target.cellZones === 0,
        `RUN-7 : la destination ${laneId} n'affiche pas la bonne permission : ${JSON.stringify(target)}`,
      );
      for (const type of ["dragEnter", "dragOver", "drop"]) {
        await send(
          "Input.dispatchDragEvent",
          { type, x: target.x, y: target.y, data: intercepted.params.data },
          sessionId,
        );
        await sleep(100);
      }
      await send(
        "Input.dispatchMouseEvent",
        {
          type: "mouseReleased",
          x: target.x,
          y: target.y,
          button: "left",
          buttons: 0,
          clickCount: 1,
        },
        sessionId,
      );
      await waitFor(
        sessionId,
        `(() => {
          const card = document.querySelector('[data-issue-key="RUN-7"]');
          return card?.closest('.lane')?.dataset.laneId === '${expectedLane}' &&
            card.getAttribute('aria-busy') !== 'true' && !card.dataset.moveFeedback &&
            !document.querySelector('.lane-cell-droppable, .lane-drop-zone');
        })()`,
        `RUN-7 : déplacement vers ${laneId} non confirmé`,
      );
      const result = await evaluate(
        sessionId,
        `({writes: window.__goalPriority.writes(), otherWrites: window.__goalPriority.otherWrites(),
          goal: window.__goalPriority.document().links['RUN-7'] ?? null,
          count: document.querySelectorAll('[data-issue-key="RUN-7"]').length,
          column: document.querySelector('[data-issue-key="RUN-7"]').closest('.lane-cell').getAttribute('aria-label'),
          defaultVisible: Boolean(document.querySelector('[data-lane-id="swimlane:1"]')),
          firstLane: document.querySelector('[data-lane-id]')?.dataset.laneId})`,
      );
      assert(
        result.writes === expectedWrites &&
          result.otherWrites === 0 &&
          result.goal === expectedGoal &&
          result.count === 1 &&
          result.column.endsWith("— En cours"),
        `RUN-7 : rattachement ou nombre d'écritures incorrect : ${JSON.stringify(result)}`,
      );
      assert(
        result.defaultVisible === (expectedLane === "swimlane:1"),
        "RUN-7 : sa swimlane vide reste affichée après le glissement",
      );
      if (expectedLane === "swimlane:1")
        assert(result.firstLane === "swimlane:1", "RUN n'a pas repris sa position après le retour");
    }
    await moveRun("goal:g-stabilite", true, "goal:g-stabilite", 1, "g-stabilite");
    await moveRun("build", false, "goal:g-stabilite", 1, "g-stabilite");
    await moveRun("swimlane:2", false, "goal:g-stabilite", 1, "g-stabilite");
    await moveRun("swimlane:1", true, "swimlane:1", 2, null);
    console.log(
      `✓ RUN ↔ objectif (hauteur ${height}px) : swimlane entière lâchée sur « Terminé », objectif seul (colonne « En cours » et rang inchangés, story 8.32), retour dans RUN vide, refus de Build et OPS sans écriture`,
    );
  }
  // Plusieurs chemins Jira vers un même statut : une zone, premier chemin disponible dans
  // l'ordre de l'API. Un formulaire sur ce premier chemin n'est jamais contourné.
  for (const test of [
    { scenario: "board-drag-transition-auto", status: "3", transition: "90", native: false },
    { scenario: "board-drag-transition-auto", status: "4", transition: "23", native: false },
    { scenario: "board-drag-transition-screen", status: "3", transition: "90", native: true },
  ]) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await navigateToHarness(sessionId, `http://127.0.0.1:5201/?scenario=${test.scenario}`);
    await waitFor(
      sessionId,
      "window.__transitionAuto?.ready() && document.querySelector('[data-issue-key=\"ABC-102\"]')",
      "Le scénario des transitions automatiques n'est pas prêt",
    );
    const source = await evaluate(
      sessionId,
      `(() => {
      const card = document.querySelector('[data-issue-key="ABC-102"]');
      card.scrollIntoView({block: 'center'});
      const rect = card.getBoundingClientRect();
      return { x: rect.x + 35, y: rect.y + 35, lane: card.closest('.lane').dataset.laneId };
    })()`,
    );
    const since = events.length;
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: source.x, y: source.y },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: source.x, y: source.y, button: "left", buttons: 1, clickCount: 1 },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: source.x + 20, y: source.y + 5, button: "left", buttons: 1 },
      sessionId,
    );
    await sleep(300);
    const intercepted = events
      .slice(since)
      .find((event) => event.method === "Input.dragIntercepted");
    assert(intercepted, `${test.scenario} : le navigateur n'a pas démarré le glissement`);
    const lane = `document.querySelector('[data-lane-id="${source.lane}"]')`;
    await waitFor(
      sessionId,
      `${lane}.querySelectorAll('.status-drop-zone').length === 2`,
      "Les transitions ne sont pas regroupées en deux statuts de destination",
    );
    const zones = await evaluate(
      sessionId,
      `[...${lane}.querySelectorAll('.status-drop-zone')].map((zone) => ({ id: zone.dataset.statusId, text: zone.textContent }))`,
    );
    assert(
      JSON.stringify(zones.map((zone) => zone.id)) === '["3","4"]',
      `Une zone unique par statut était attendue : ${JSON.stringify(zones)}`,
    );
    if (test.native)
      assert(
        zones[0].text.includes("Formulaire à compléter"),
        "La zone ne prévient pas du formulaire du premier chemin Jira",
      );
    const target = await evaluate(
      sessionId,
      `(() => {
      const zone = ${lane}.querySelector('[data-status-id="${test.status}"]');
      zone.scrollIntoView({block: 'nearest'});
      const rect = zone.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + 25;
      return { x, y, reachable: zone.contains(document.elementFromPoint(x, y)) };
    })()`,
    );
    assert(target.reachable, `Statut ${test.status} : zone masquée ou inaccessible`);
    for (const type of ["dragEnter", "dragOver", "drop"]) {
      await send(
        "Input.dispatchDragEvent",
        { type, x: target.x, y: target.y, data: intercepted.params.data },
        sessionId,
      );
      await sleep(100);
    }
    await send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        x: target.x,
        y: target.y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      },
      sessionId,
    );
    await waitFor(
      sessionId,
      test.native
        ? "window.__transitionAuto.nativeCalls().length === 1"
        : "window.__transitionAuto.transitionIds().length === 1 && document.querySelector('[data-issue-key=\"ABC-102\"]').getAttribute('aria-busy') !== 'true'",
      "Le dépôt n'a pas choisi automatiquement le premier chemin Jira",
    );
    const result = await evaluate(
      sessionId,
      `({ ids: window.__transitionAuto.transitionIds(), native: window.__transitionAuto.nativeCalls(), otherWrites: window.__transitionAuto.otherWrites(), dialog: Boolean(document.querySelector('[role="dialog"]')), cell: document.querySelector('[data-issue-key="ABC-102"]').closest('.lane-cell').getAttribute('aria-label') })`,
    );
    assert(!result.dialog, "Un dialogue de choix de transition est encore affiché");
    assert(
      result.otherWrites === 0,
      `Le dépôt a déclenché d'autres écritures : ${JSON.stringify(result)}`,
    );
    if (test.native) {
      assert(
        result.ids.length === 0 &&
          result.native[0]?.transitionId === test.transition &&
          result.native[0]?.issueKey === "ABC-102" &&
          result.cell.endsWith("— À faire"),
        `Le formulaire du premier chemin a été contourné : ${JSON.stringify(result)}`,
      );
    } else {
      assert(
        JSON.stringify(result.ids) === JSON.stringify([test.transition]) &&
          result.native.length === 0 &&
          result.cell.endsWith("— En cours"),
        `La première transition de la destination n'a pas été confirmée seule : ${JSON.stringify(result)}`,
      );
    }
    console.log(
      `✓ Statut ${test.status} : zone unique, ${test.native ? "premier chemin avec formulaire conservé dans Jira, aucune écriture" : `transition ${test.transition} choisie automatiquement, une seule écriture`}`,
    );
  }
  // Menu d'une carte : clic droit réel, liste des objectifs ouverte au survol à côté du menu,
  // conservée sur un trajet en diagonale, envoi vers un goal, puis à gauche près du bord droit et
  // refermée quand le pointeur s'en va.
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await navigateToHarness(sessionId, "http://127.0.0.1:5201/?scenario=board-drag-goal-priority");
  await waitFor(
    sessionId,
    "window.__goalPriority?.ready && document.querySelector('[data-issue-key=\"RUN-7\"]')",
    "Le scénario du menu de carte n'est pas prêt",
  );
  const mouse = (type, x, y, extra = {}) =>
    send("Input.dispatchMouseEvent", { type, x, y, ...extra }, sessionId);
  const geometry = () =>
    evaluate(
      sessionId,
      `(() => {
        const menu = document.querySelector('.card-menu');
        const row = menu?.querySelector('[aria-haspopup="menu"]');
        const goals = menu?.querySelector('.card-menu-goals[data-placed]');
        const box = (element) => {
          if (!element) return null;
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return { left, right, top, bottom };
        };
        return { menu: box(menu), row: box(row), goals: box(goals), side: goals?.dataset.side ?? null,
          firstGoal: box(goals?.querySelector('[role="menuitem"]')),
          focusInGoals: Boolean(goals?.contains(document.activeElement)) };
      })()`,
    );
  const run7 = await evaluate(
    sessionId,
    `(() => {
      const card = document.querySelector('[data-issue-key="RUN-7"]');
      card.scrollIntoView({block: 'center'});
      const rect = card.getBoundingClientRect();
      return {x: rect.x + 35, y: rect.y + 20};
    })()`,
  );
  await mouse("mouseMoved", run7.x, run7.y);
  await mouse("mousePressed", run7.x, run7.y, { button: "right", buttons: 2, clickCount: 1 });
  await mouse("mouseReleased", run7.x, run7.y, { button: "right", buttons: 0, clickCount: 1 });
  await waitFor(
    sessionId,
    "Boolean(document.querySelector('.card-menu[data-placed]'))",
    "Le clic droit sur RUN-7 n'a pas ouvert le menu de l'extension",
  );
  const opened = await geometry();
  const rowCenter = {
    x: (opened.row.left + opened.row.right) / 2,
    y: (opened.row.top + opened.row.bottom) / 2,
  };
  await mouse("mouseMoved", rowCenter.x, rowCenter.y);
  await sleep(60);
  assert(!(await geometry()).goals, "La liste des objectifs s'est ouverte sans arrêt du pointeur");
  await sleep(250);
  const hovered = await geometry();
  assert(
    hovered.goals &&
      hovered.side === "right" &&
      hovered.goals.left >= hovered.menu.right &&
      Math.abs(hovered.firstGoal.top - hovered.row.top) <= 1 &&
      !hovered.focusInGoals &&
      JSON.stringify(hovered.menu) === JSON.stringify(opened.menu),
    `Liste des objectifs mal ouverte au survol : ${JSON.stringify(hovered)}`,
  );
  const target = await evaluate(
    sessionId,
    `(() => {
      const item = [...document.querySelectorAll('.card-menu-goals [role="menuitem"]')]
        .find((element) => element.textContent === 'Améliorer la stabilité');
      const rect = item.getBoundingClientRect();
      return {x: rect.left + 30, y: rect.top + rect.height / 2};
    })()`,
  );
  // Départ du côté gauche de la ligne, arrivée sur le second objectif : le trajet descend et
  // passe sur « Mettre en top priorité » avant d'atteindre la liste.
  const start = { x: hovered.row.left + 20, y: rowCenter.y };
  await mouse("mouseMoved", start.x, start.y);
  let crossed = false;
  for (let step = 1; step <= 8; step += 1) {
    const x = start.x + ((target.x - start.x) * step) / 8;
    const y = start.y + ((target.y - start.y) * step) / 8;
    await mouse("mouseMoved", x, y);
    crossed ||= await evaluate(
      sessionId,
      `Boolean(document.elementFromPoint(${x}, ${y})?.closest('[role="menuitem"]')?.textContent?.startsWith('Mettre en top priorité'))`,
    );
    await sleep(60);
  }
  assert(crossed, "Le trajet en diagonale ne passe pas sur une autre action du menu");
  assert((await geometry()).goals, "La liste s'est refermée pendant le trajet vers elle");
  await mouse("mousePressed", target.x, target.y, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", target.x, target.y, { button: "left", buttons: 0, clickCount: 1 });
  await waitFor(
    sessionId,
    `window.__goalPriority.writes() === 1 && !document.querySelector('.card-menu') &&
      document.querySelector('[data-issue-key="RUN-7"]')?.getAttribute('aria-busy') !== 'true'`,
    "L'envoi de RUN-7 vers un goal depuis le menu n'est pas confirmé",
  );
  const sent = await evaluate(
    sessionId,
    `({ goal: window.__goalPriority.document().links['RUN-7'] ?? null,
      otherWrites: window.__goalPriority.otherWrites() })`,
  );
  assert(
    sent.goal === "g-stabilite" && sent.otherWrites === 0,
    `Envoi vers un goal incorrect : ${JSON.stringify(sent)}`,
  );
  // Près du bord droit : menu ouvert au point demandé, liste à gauche.
  await evaluate(
    sessionId,
    `(() => {
      const card = document.querySelector('[data-issue-key="RUN-7"]');
      const rect = card.getBoundingClientRect();
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2,
        clientX: innerWidth - 20, clientY: rect.top + 20 }));
    })()`,
  );
  await waitFor(
    sessionId,
    "Boolean(document.querySelector('.card-menu[data-placed]'))",
    "Le menu ne s'est pas rouvert près du bord droit",
  );
  const edge = await geometry();
  await mouse(
    "mouseMoved",
    (edge.row.left + edge.row.right) / 2,
    (edge.row.top + edge.row.bottom) / 2,
  );
  await sleep(250);
  const left = await geometry();
  assert(
    left.goals && left.side === "left" && left.goals.right <= left.menu.left,
    `Près du bord droit, la liste devait s'ouvrir à gauche : ${JSON.stringify(left)}`,
  );
  for (let step = 0; step < 6; step += 1) {
    await mouse("mouseMoved", 120 + step * 4, 900);
    await sleep(70);
  }
  const away = await geometry();
  assert(
    away.menu && !away.goals,
    `La liste ne s'est pas refermée quand le pointeur est parti : ${JSON.stringify(away)}`,
  );
  console.log(
    "✓ Menu de carte : liste ouverte au survol à droite, gardée en diagonale, envoi vers un goal (une écriture), à gauche près du bord, refermée en partant",
  );

  // Story 8.30 : sur le board, Ctrl/Cmd+clic et Maj+clic sélectionnent comme dans le planning, sans
  // onglet ni fenêtre ; Échap vide la sélection ; le clic du milieu reste celui du lien (nouvel
  // onglet), intercepté ici après coup pour ne rien ouvrir.
  await navigateToHarness(sessionId, "http://127.0.0.1:5201/?scenario=board");
  await waitFor(
    sessionId,
    "document.querySelectorAll('li.lane-item > a.card').length >= 3",
    "Le scénario de la sélection n'est pas prêt",
  );
  const picked = await evaluate(
    sessionId,
    `(() => {
      // Le board fictif n'a qu'une carte par colonne : un Maj+clic sans départ dans sa colonne
      // ajoute la carte, comme Ctrl+clic ; la plage d'une colonne est couverte par les tests.
      const cards = [...document.querySelectorAll('li.lane-item > a.card')].slice(0, 3);
      window.__cardClicks = [];
      window.addEventListener('click', (event) => {
        if (event.target.closest?.('a.card')) window.__cardClicks.push(['click', event.defaultPrevented]);
      });
      window.addEventListener('auxclick', (event) => {
        const card = event.target.closest?.('a.card');
        if (!card) return;
        window.__cardClicks.push(['auxclick', event.defaultPrevented, card.target, card.dataset.issueKey]);
        event.preventDefault();
      });
      cards[0].scrollIntoView({ block: 'center' });
      return cards.map((card) => {
        const r = card.querySelector('.card-summary').getBoundingClientRect();
        return { key: card.dataset.issueKey, x: r.left + 20, y: r.top + r.height / 2 };
      });
    })()`,
  );
  const clickAt = async ({ x, y }, modifiers, button = "left", buttons = 1) => {
    await mouse("mouseMoved", x, y);
    await mouse("mousePressed", x, y, { button, buttons, clickCount: 1, modifiers });
    await mouse("mouseReleased", x, y, { button, buttons: 0, clickCount: 1, modifiers });
  };
  const targetsBefore = (await send("Target.getTargets", {})).targetInfos.length;
  await clickAt(picked[0], 2);
  await clickAt(picked[1], 4);
  await clickAt(picked[2], 8);
  const selectedKeys = JSON.stringify(
    picked
      .map((card) => card.key)
      .sort()
      .join(),
  );
  await waitFor(
    sessionId,
    `document.querySelector('.board-selection')?.textContent.includes('3 tickets sélectionnés')
      && [...document.querySelectorAll('a.card.card-selected')].map((card) => card.dataset.issueKey).sort().join() === ${selectedKeys}`,
    "Ctrl+clic, Cmd+clic et Maj+clic ne sélectionnent pas les trois cartes",
  );
  assert(
    JSON.stringify(await evaluate(sessionId, "window.__cardClicks")) ===
      JSON.stringify([
        ["click", true],
        ["click", true],
        ["click", true],
      ]) && (await send("Target.getTargets", {})).targetInfos.length === targetsBefore,
    "Une sélection au Ctrl+clic ou Maj+clic a ouvert un onglet ou une fenêtre",
  );
  for (const type of ["keyDown", "keyUp"])
    await send(
      "Input.dispatchKeyEvent",
      { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
      sessionId,
    );
  await waitFor(
    sessionId,
    "!document.querySelector('.board-selection') && !document.querySelector('a.card.card-selected')",
    "Échap ne vide pas la sélection du board",
  );
  await clickAt(picked[1], 0, "middle", 4);
  await waitFor(
    sessionId,
    "window.__cardClicks.length === 4",
    "Le clic du milieu n'a pas atteint la carte",
  );
  assert(
    JSON.stringify((await evaluate(sessionId, "window.__cardClicks"))[3]) ===
      JSON.stringify(["auxclick", false, "_blank", picked[1].key]),
    "Le clic du milieu sur une carte du board doit rester celui du lien (nouvel onglet)",
  );
  console.log(
    "✓ Sélection du board (8.30) : Ctrl+clic, Cmd+clic et Maj+clic, repère et compteur, aucun onglet ; Échap vide ; clic du milieu laissé au lien",
  );

  // Story 8.33 : deux cartes sélectionnées glissées vers un objectif, puis refus d'une swimlane
  // qui n'accepte pas tout le lot.
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await navigateToHarness(sessionId, "http://127.0.0.1:5201/?scenario=board-drag-goal-priority");
  await waitFor(
    sessionId,
    "window.__goalPriority?.ready && document.querySelector('[data-issue-key=\"ABC-105\"]')",
    "Le scénario du lot n'est pas prêt",
  );
  const cardPoint = (key) =>
    evaluate(
      sessionId,
      `(() => {
        const card = document.querySelector('a.card[data-issue-key="${key}"]');
        card.scrollIntoView({ block: 'center' });
        const r = card.querySelector('.card-summary').getBoundingClientRect();
        return { x: r.left + 20, y: r.top + r.height / 2 };
      })()`,
    );
  const selectCards = async (keys) => {
    for (const key of keys) {
      const point = await cardPoint(key);
      await clickAt(point, 2);
    }
    await waitFor(
      sessionId,
      `[...document.querySelectorAll('a.card.card-selected')].map((card) => card.dataset.issueKey).sort().join() === ${JSON.stringify([...keys].sort().join())}`,
      `Sélection de ${keys.join(", ")} non faite`,
    );
  };
  // Glisser réel de la carte `key`, survol de la case visée ; rend la cible et les données du glisser.
  const dragTo = async (key, laneId) => {
    const start = await cardPoint(key);
    const since = events.length;
    await mouse("mouseMoved", start.x, start.y);
    await mouse("mousePressed", start.x, start.y, { button: "left", buttons: 1, clickCount: 1 });
    await mouse("mouseMoved", start.x + 20, start.y + 5, { button: "left", buttons: 1 });
    await sleep(300);
    const intercepted = events
      .slice(since)
      .find((event) => event.method === "Input.dragIntercepted");
    assert(intercepted, `${key} : le navigateur n'a pas démarré le glissement du lot`);
    const target = await evaluate(
      sessionId,
      `(() => {
        const lane = document.querySelector('[data-lane-id="${laneId}"]');
        const cell = lane.querySelector('.lane-cell:last-child');
        cell.scrollIntoView({ block: 'center' });
        const r = cell.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + 25;
        return { x, y, reachable: cell.contains(document.elementFromPoint(x, y)),
          zone: lane.classList.contains('lane-drop-zone'),
          unavailable: lane.classList.contains('lane-drop-unavailable'),
          cellZones: document.querySelectorAll('.lane-cell-droppable, .status-drop-zone').length,
          dragging: [...document.querySelectorAll('.card-dragging')].map((card) => card.dataset.issueKey).sort().join() };
      })()`,
    );
    assert(target.reachable, `Lot : swimlane ${laneId} inaccessible`);
    for (const type of ["dragEnter", "dragOver", "drop"]) {
      await send(
        "Input.dispatchDragEvent",
        { type, x: target.x, y: target.y, data: intercepted.params.data },
        sessionId,
      );
      await sleep(100);
    }
    await mouse("mouseReleased", target.x, target.y, { button: "left", buttons: 0, clickCount: 1 });
    return target;
  };
  await selectCards(["ABC-104", "ABC-105"]);
  const toGoal = await dragTo("ABC-105", "goal:g-stabilite");
  assert(
    toGoal.zone && toGoal.cellZones === 0 && toGoal.dragging === "ABC-104,ABC-105",
    `Lot : la swimlane de l'objectif n'est pas une zone entière, ou le lot ne part pas entier : ${JSON.stringify(toGoal)}`,
  );
  await waitFor(
    sessionId,
    `(() => {
      const links = window.__goalPriority.document().links;
      return links['ABC-104'] === 'g-stabilite' && links['ABC-105'] === 'g-stabilite' &&
        !document.querySelector('a.card.card-selected') && !document.querySelector('[aria-busy="true"]');
    })()`,
    "Lot : rattachement des deux tickets non confirmé",
  );
  const lotResult = await evaluate(
    sessionId,
    `({ writes: window.__goalPriority.writes(), otherWrites: window.__goalPriority.otherWrites(),
      column: document.querySelector('[data-issue-key="ABC-104"]').closest('.lane-cell').getAttribute('aria-label') })`,
  );
  assert(
    lotResult.writes === 1 &&
      lotResult.otherWrites === 0 &&
      lotResult.column.endsWith("— En cours"),
    `Lot : une seule écriture de la propriété, ni transition ni rang, colonne gardée : ${JSON.stringify(lotResult)}`,
  );
  // RUN-7 (RUN) et OPS-20 (OPS) : OPS refuse RUN-7, donc le lot ; rien n'est écrit.
  await selectCards(["RUN-7", "OPS-20"]);
  const refused = await dragTo("RUN-7", "swimlane:2");
  assert(
    refused.unavailable && !refused.zone,
    `Lot : OPS devrait refuser le lot : ${JSON.stringify(refused)}`,
  );
  await sleep(500);
  const afterRefusal = await evaluate(
    sessionId,
    "({ writes: window.__goalPriority.writes(), otherWrites: window.__goalPriority.otherWrites(), run: window.__goalPriority.document().links['RUN-7'] ?? null })",
  );
  assert(
    afterRefusal.writes === 1 && afterRefusal.otherWrites === 0 && afterRefusal.run === null,
    `Lot refusé : rien ne devait être écrit : ${JSON.stringify(afterRefusal)}`,
  );
  console.log(
    "✓ Lot du board (8.33) : deux cartes sélectionnées glissées vers un objectif (une écriture, ni transition ni rang, colonne gardée), sélection vidée ; OPS refuse un lot RUN + OPS sans écriture",
  );
} finally {
  await browser.close();
  await server.close();
}
