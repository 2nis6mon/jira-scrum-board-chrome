import { ORIGIN_RULE_ID } from "./originRule";
import type { Platform } from "./types";

export function chromePlatform(): Platform {
  return {
    permissions: {
      contains: (pattern) => chrome.permissions.contains({ origins: [pattern] }),
      request: (pattern) => chrome.permissions.request({ origins: [pattern] }),
      remove: (pattern) => chrome.permissions.remove({ origins: [pattern] }),
    },
    store: {
      get: async (key) => (await chrome.storage.local.get(key))[key],
      set: (key, value) => chrome.storage.local.set({ [key]: value }),
      remove: (key) => chrome.storage.local.remove(key),
    },
    fetch: (url, init) => fetch(url, init),
    originRules: {
      apply: (rule) =>
        chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [ORIGIN_RULE_ID],
          // La forme est celle qu'attend Chrome ; seuls les types TypeScript (énumérations) diffèrent.
          addRules: rule ? [rule as unknown as chrome.declarativeNetRequest.Rule] : [],
        }),
    },
    extensionId: chrome.runtime.id,
    extensionVersion: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    copyText: (text) => navigator.clipboard.writeText(text),
  };
}
