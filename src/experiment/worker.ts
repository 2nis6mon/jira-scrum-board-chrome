import { sprintGoalsBoardRoute } from "./boardRoute";
import { injectBoard } from "./injectBoard";
import { configuredBoardAddress } from "./launchAddress";

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
function registerSites(): void {
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
}

chrome.permissions.onAdded.addListener(registerSites);
chrome.permissions.onRemoved.addListener(registerSites);
chrome.runtime.onInstalled.addListener(registerSites);
chrome.runtime.onStartup.addListener(registerSites);
registerSites();

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    const stored = await chrome.storage.local.get(["connection.v1", "boards.v1"]);
    const address = configuredBoardAddress(stored["connection.v1"], stored["boards.v1"]);
    if (!address) {
      await chrome.tabs.create({ url: chrome.runtime.getURL("board.html") });
      return;
    }
    const target = new URL(address);
    const current = tab.url ? new URL(tab.url) : null;
    if (tab.id !== undefined && current?.origin === target.origin) {
      await chrome.tabs.update(tab.id, { url: address, active: true });
      return;
    }
    await chrome.tabs.create({ url: address });
  })().catch(() => {
    if (tab.id !== undefined) void chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
  });
});
