import type { LauncherPlatform } from "../../integration/LauncherModel";

/** Le lanceur ouvert en pleine page par le service worker, à l'installation. */
export function isWelcomeTab(search: string): boolean {
  return new URLSearchParams(search).get("bienvenue") === "1";
}

/**
 * Accès Chrome du lanceur. `activeTab` donne l'adresse de l'onglet courant au clic sur l'icône,
 * pour ce seul onglet et sans permission « tabs » : le board affiché est reconnu sans saisie.
 */
export function chromeLauncherPlatform(): LauncherPlatform {
  // Onglet de bienvenue ouvert à l'installation : la page n'est pas une bulle au-dessus d'un
  // onglet Jira, elle est l'onglet. Elle n'a pas d'onglet courant à lire et se remplace par Jira.
  const welcome = isWelcomeTab(location.search);
  return {
    store: {
      get: async (key) => (await chrome.storage.local.get(key))[key],
      set: (key, value) => chrome.storage.local.set({ [key]: value }),
      remove: (key) => chrome.storage.local.remove(key),
    },
    hasPermission: (pattern) => chrome.permissions.contains({ origins: [pattern] }),
    requestPermission: (pattern) => chrome.permissions.request({ origins: [pattern] }),
    currentTab: async () =>
      welcome
        ? null
        : ((await chrome.tabs.query({ active: true, currentWindow: true }))[0] ?? null),
    prepareLaunch: async () => {
      const response: unknown = await chrome.runtime.sendMessage({
        type: "sprint-goals:prepare-launch",
      });
      if (!response || typeof response !== "object" || !("ok" in response) || response.ok !== true)
        throw new Error("L'intégration Jira n'est pas prête.");
    },
    navigate: async (address, tab) => {
      if (welcome) {
        location.assign(address);
        return;
      }
      const sameSite = tab?.url && new URL(tab.url).origin === new URL(address).origin;
      if (tab?.id !== undefined && sameSite) {
        await chrome.tabs.update(tab.id, { url: address, active: true });
      } else {
        await chrome.tabs.create({ url: address });
      }
    },
    close: () => (welcome ? undefined : window.close()),
  };
}
