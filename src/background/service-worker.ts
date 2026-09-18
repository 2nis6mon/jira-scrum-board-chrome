// Service worker minimal : il ouvre la page du board, ou y revient si elle est déjà
// ouverte. Il ne fait aucune requête réseau et ne conserve aucun état.

const BOARD_PAGE = "board.html";

chrome.action.onClicked.addListener(() => {
  void openBoard();
});

async function openBoard(): Promise<void> {
  // getContexts ne voit que les pages de cette extension : pas besoin de la permission « tabs ».
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.TAB],
    documentUrls: [chrome.runtime.getURL(BOARD_PAGE)],
  });
  const existing = contexts.find((context) => context.tabId >= 0);

  if (existing) {
    await chrome.tabs.update(existing.tabId, { active: true });
    if (existing.windowId >= 0) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: chrome.runtime.getURL(BOARD_PAGE) });
}
