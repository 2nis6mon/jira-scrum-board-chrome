import { sprintGoalsBoardRoute } from "./boardRoute";
import { injectBoard } from "./injectBoard";

const CONTENT_SCRIPT_ID = "sprint-goals-direct-sites";

async function launch(tabId: number, address: string): Promise<void> {
  const route = sprintGoalsBoardRoute(address);
  if (!route || !(await chrome.permissions.contains({ origins: [route.site.permissionPattern] })))
    return;
  await chrome.scripting.executeScript({
    target: { tabId },
    func: injectBoard,
    args: [chrome.runtime.getURL("board.html"), route.address],
  });
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Le lanceur attend l'enregistrement avant d'ouvrir Jira : le premier chargement doit déjà
  // recevoir le script de contenu, y compris juste après l'autorisation du nouveau site.
  if (
    message?.type === "sprint-goals:prepare-launch" &&
    sender.id === chrome.runtime.id &&
    // Le lanceur s'ouvre aussi en onglet de bienvenue, avec un paramètre d'affichage.
    sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL("launcher.html")
  ) {
    void registerSites()
      .then(() => respond({ ok: true }))
      .catch(() => respond({ error: true }));
    return true;
  }
  if (message?.type !== "sprint-goals:launch") return false;
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    sender.tab?.id === undefined ||
    !sender.url
  )
    return false;
  void launch(sender.tab.id, sender.url)
    .then(() => respond({ ok: true }))
    .catch(() => respond({ error: true }));
  return true;
});

let registration = Promise.resolve();
function registerSites(): Promise<void> {
  registration = registration
    .catch(() => {})
    .then(async () => {
      const permissions = await chrome.permissions.getAll();
      const matches = (permissions.origins ?? []).filter((pattern) =>
        /^https:\/\/[a-z0-9-]+\.atlassian\.net\/\*$/.test(pattern),
      );
      const existing = await chrome.scripting.getRegisteredContentScripts({
        ids: [CONTENT_SCRIPT_ID],
      });
      if (!matches.length) {
        if (existing.length)
          await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
        return;
      }
      const script = {
        id: CONTENT_SCRIPT_ID,
        matches,
        js: ["jira-direct-bootstrap.js"],
        runAt: "document_idle" as const,
        allFrames: false,
        persistAcrossSessions: true,
      };
      if (existing.length) await chrome.scripting.updateContentScripts([script]);
      else await chrome.scripting.registerContentScripts([script]);
    });
  void registration.catch(() => {});
  return registration;
}

chrome.permissions.onAdded.addListener(registerSites);
chrome.permissions.onRemoved.addListener(registerSites);
chrome.runtime.onInstalled.addListener(registerSites);
// Première installation seulement (pas les mises à jour) : le lanceur s'ouvre en pleine page pour
// demander l'adresse du Jira. L'accès au site reste demandé sur un clic, dans cette page.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  void chrome.tabs.create({ url: chrome.runtime.getURL("launcher.html?bienvenue=1") });
});
chrome.runtime.onStartup.addListener(registerSites);
void registerSites();
