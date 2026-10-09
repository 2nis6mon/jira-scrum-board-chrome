// Navigateur de vérification : profil temporaire vierge, jamais celui de l'utilisateur.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

function browserPath() {
  const candidates = process.env.CHROME_PATH
    ? [process.env.CHROME_PATH]
    : process.platform === "win32"
      ? [
          join(
            process.env.PROGRAMFILES ?? "C:\\Program Files",
            "Google/Chrome/Application/chrome.exe",
          ),
          join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
          join(
            process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
            "Microsoft/Edge/Application/msedge.exe",
          ),
        ]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path)
    throw new Error(
      "Navigateur introuvable. Définir CHROME_PATH vers l'exécutable Chrome à utiliser pour le contrôle isolé.",
    );
  return path;
}

export function launchIsolatedBrowser(size = "1280,800") {
  const executable = browserPath();
  const profile = mkdtempSync(join(tmpdir(), "sprint-goals-verif-"));
  const browser = spawn(
    executable,
    [
      "--headless=new",
      `--user-data-dir=${profile}`,
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      `--window-size=${size}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"], windowsHide: true },
  );
  const pending = new Map();
  const events = [];
  let nextId = 0;
  let buffer = "";
  let stopped = false;
  let startupError;
  const rejectPending = (error) => {
    for (const callback of pending.values()) callback({ error: { message: error.message } });
    pending.clear();
  };
  browser.on("error", (error) => {
    startupError = error;
    stopped = true;
    rejectPending(error);
  });
  browser.stdio[3].on("error", rejectPending);
  browser.stdio[4].on("error", rejectPending);
  browser.on("exit", () => {
    stopped = true;
    rejectPending(new Error("Le navigateur de vérification s'est arrêté."));
  });
  browser.stdio[4].on("data", (chunk) => {
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
  function send(method, params = {}, sessionId, timeout = 15000) {
    if (stopped) return Promise.reject(startupError ?? new Error("Le navigateur est arrêté."));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`délai dépassé : ${method}`));
      }, timeout);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(`${method} : ${message.error.message}`));
        else resolve(message.result);
      });
      browser.stdio[3].write(
        `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
        (error) => {
          if (error) rejectPending(error);
        },
      );
    });
  }
  // À l'installation, l'extension ouvre un onglet de bienvenue qui passe au premier plan : laissé
  // ouvert, il met l'onglet du contrôle en arrière-plan et Chrome y ralentit les minuteurs.
  async function closeWelcomeTab() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const { targetInfos } = await send("Target.getTargets");
      const tab = targetInfos.find((t) => t.type === "page" && t.url.includes("bienvenue=1"));
      if (tab) {
        await send("Target.closeTarget", { targetId: tab.targetId });
        return;
      }
      await sleep(100);
    }
  }
  async function loadExtension(path, { keepWelcomeTab = false } = {}) {
    try {
      const loaded = await send("Extensions.loadUnpacked", { path });
      if (!keepWelcomeTab) await closeWelcomeTab();
      return loaded;
    } catch (error) {
      throw new Error(
        `${error.message}\nLe navigateur n'a pas confirmé le chargement automatisé de l'extension. CHROME_PATH permet de choisir un Chrome compatible avec Extensions.loadUnpacked. Aucun profil utilisateur n'a été utilisé.`,
        { cause: error },
      );
    }
  }
  async function evaluate(sessionId, expression) {
    const { result, exceptionDetails } = await send(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId,
    );
    if (exceptionDetails)
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }
  // Attend qu'une expression devienne vraie dans la page ; une page en cours de chargement
  // (expression en erreur) compte comme « pas encore ».
  async function waitFor(sessionId, expression, message, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(sessionId, expression).catch(() => false)) return;
      await sleep(100);
    }
    throw new Error(message);
  }
  async function close() {
    await send("Browser.close", {}, undefined, 2000).catch(() => {});
    if (!stopped) browser.kill();
    await sleep(500);
    const resolvedProfile = resolve(profile);
    if (
      dirname(resolvedProfile) !== resolve(tmpdir()) ||
      !resolvedProfile.startsWith(join(resolve(tmpdir()), "sprint-goals-verif-"))
    ) {
      throw new Error("Nettoyage refusé : profil temporaire hors du dossier attendu.");
    }
    try {
      rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    } catch {
      console.warn(
        `Le navigateur a conservé un verrou sur son profil de test temporaire : ${profile}`,
      );
    }
  }
  return { send, evaluate, waitFor, events, loadExtension, close };
}
