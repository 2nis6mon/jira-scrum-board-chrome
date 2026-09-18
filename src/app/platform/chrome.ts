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
    extensionVersion: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    copyText: (text) => navigator.clipboard.writeText(text),
  };
}
