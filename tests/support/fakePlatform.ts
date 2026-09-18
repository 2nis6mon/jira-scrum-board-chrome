import type { Platform } from "../../src/app/platform/types";
import type { FakeJira } from "./fakeJira";

export interface FakePlatform extends Platform {
  readonly granted: Set<string>;
  readonly requested: string[];
  readonly stored: Map<string, unknown>;
  readonly copied: string[];
  /** Réponse que « l'utilisateur » fera à la prochaine demande d'accès de Chrome. */
  userAccepts: boolean;
}

export function fakePlatform(jira: FakeJira): FakePlatform {
  const granted = new Set<string>();
  const requested: string[] = [];
  const stored = new Map<string, unknown>();
  const copied: string[] = [];

  const platform: FakePlatform = {
    granted,
    requested,
    stored,
    copied,
    userAccepts: true,
    permissions: {
      contains: async (pattern) => granted.has(pattern),
      request: async (pattern) => {
        requested.push(pattern);
        if (platform.userAccepts) granted.add(pattern);
        return platform.userAccepts;
      },
      remove: async (pattern) => granted.delete(pattern),
    },
    store: {
      get: async (key) => stored.get(key),
      set: async (key, value) => void stored.set(key, value),
      remove: async (key) => void stored.delete(key),
    },
    fetch: jira.fetch,
    extensionVersion: "9.9.9",
    userAgent: "UA de test",
    copyText: async (text) => void copied.push(text),
  };
  return platform;
}
