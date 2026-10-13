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
} finally {
  await browser.close();
  await server.close();
}
