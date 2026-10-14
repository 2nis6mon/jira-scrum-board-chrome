// Régression du glisser-déposer sur les vues réelles, avec Jira fictif et profil Chrome vierge.
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchIsolatedBrowser, sleep } from "./browser-check.mjs";

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
      const target = await evaluate(
        sessionId,
        `(() => {
          const cell = document.querySelector('[data-lane-id="${laneId}"] .lane-cell:nth-child(2)');
          if (!cell) return null;
          cell.scrollIntoView({block: 'nearest'});
          const rect = cell.getBoundingClientRect();
          const x = rect.left + rect.width / 2, y = rect.top + 25;
          return {x, y, reachable: cell.contains(document.elementFromPoint(x, y)),
            allowed: cell.classList.contains('lane-cell-droppable'),
            disabled: cell.getAttribute('aria-disabled') === 'true'};
        })()`,
      );
      assert(target?.reachable, `RUN-7 : destination ${laneId} absente ou inaccessible`);
      assert(
        target.allowed === allowed && target.disabled === !allowed,
        `RUN-7 : la destination ${laneId} n'affiche pas la bonne permission`,
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
            !document.querySelector('.lane-cell-droppable');
        })()`,
        `RUN-7 : déplacement vers ${laneId} non confirmé`,
      );
      const result = await evaluate(
        sessionId,
        `({writes: window.__goalPriority.writes(), otherWrites: window.__goalPriority.otherWrites(),
          goal: window.__goalPriority.document().links['RUN-7'] ?? null,
          count: document.querySelectorAll('[data-issue-key="RUN-7"]').length,
          defaultVisible: Boolean(document.querySelector('[data-lane-id="swimlane:1"]')),
          firstLane: document.querySelector('[data-lane-id]')?.dataset.laneId})`,
      );
      assert(
        result.writes === expectedWrites &&
          result.otherWrites === 0 &&
          result.goal === expectedGoal &&
          result.count === 1,
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
      `✓ RUN ↔ objectif (hauteur ${height}px) : source stable, retour dans RUN vide, refus de Build et OPS sans écriture`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
