// Vérification Chrome isolée de la vue Jira directe, sans session ni données de l'utilisateur.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const chromePath =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dist = fileURLToPath(new URL("../dist-jira-direct-test", import.meta.url));
if (!existsSync(join(dist, "manifest.json"))) process.exit(2);

const profile = mkdtempSync(join(tmpdir(), "sprint-goals-direct-"));
const chromeProcess = spawn(
  chromePath,
  [
    "--headless=new",
    `--user-data-dir=${profile}`,
    "--remote-debugging-pipe",
    "--enable-unsafe-extension-debugging",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1600,900",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
);

const pending = new Map();
const events = [];
let nextId = 0;
let buffer = "";
chromeProcess.stdio[4].on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else events.push(message);
  }
});

function send(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`délai dépassé : ${method}`)), 15000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(`${method} : ${message.error.message}`));
      else resolve(message.result);
    });
    chromeProcess.stdio[3].write(
      `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
    );
  });
}
const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
async function evaluate(sessionId, expression) {
  const { result } = await send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  return result.value;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

try {
  const { id: extensionId } = await send("Extensions.loadUnpacked", { path: dist });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://*/*" }] }, sessionId);
  const fixture = `<!doctype html><html><body><main id="jira">Board Jira normal</main>
    <aside id="ticket" hidden style="position:fixed;right:0;top:0;width:600px;height:100vh;background:white">
      <button aria-label="Fermer" onclick="history.pushState(null,'',location.pathname);this.parentElement.hidden=true">Fermer</button>
      <a href="/browse/ABC-102">ABC-102</a><h1>Ticket Jira réel</h1>
    </aside>
    <script>if(new URL(location.href).searchParams.has('selectedIssue'))document.querySelector('#ticket').hidden=false;</script>
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
            responseHeaders: [{ name: "Content-Type", value: "text/html" }],
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
      readFileSync(new URL("../src/experiment/injectBoard.ts", import.meta.url), "utf8"),
    ).replace("export function", "function");
    await evaluate(
      sessionId,
      `${injectSource};injectBoard('chrome-extension://${extensionId}/board.html',${JSON.stringify(special)})`,
    );
    await sleep(900);
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
    await evaluate(
      child.sessionId,
      "window.parent.postMessage({type:'sprint-goals:open-issue',key:'ABC-102'},'https://acme.atlassian.net')",
    );
    await sleep(900);
    assert(
      await evaluate(
        sessionId,
        "(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;const r=d.getBoundingClientRect();const margin=Math.min(60,Math.max(16,innerHeight*.05));return Math.abs(r.width-1280)<2&&Math.abs(r.height-(innerHeight-margin*2))<2})()",
      ),
      "la popin ticket reprend 1 280 px et les marges Jira mesurées",
    );
    assert(
      await evaluate(
        sessionId,
        "document.querySelector('dialog iframe').style.visibility==='visible'",
      ),
      "le panneau natif du ticket est visible dans la popin",
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
  } finally {
    clearInterval(pump);
  }
} finally {
  await send("Browser.close").catch(() => {});
  await sleep(200);
  chromeProcess.kill();
  rmSync(profile, { recursive: true, force: true });
}
