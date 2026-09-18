import type { OriginSessionRule } from "../../src/app/platform/originRule";
import type { Platform } from "../../src/app/platform/types";
import type { FakeJira } from "./fakeJira";

export interface FakePlatform extends Platform {
  readonly granted: Set<string>;
  readonly requested: string[];
  readonly stored: Map<string, unknown>;
  readonly copied: string[];
  /** Règles `Origin` posées successivement ; la dernière est la règle active. */
  readonly appliedRules: (OriginSessionRule | null)[];
  /** Réponse que « l'utilisateur » fera à la prochaine demande d'accès de Chrome. */
  userAccepts: boolean;
}

/** Règle `Origin` active sur une fausse plateforme, pour simuler la passerelle GraphQL. */
export function activeOriginOperation(platform: FakePlatform): "keep" | "remove" | "set" {
  const rule = platform.appliedRules.at(-1) ?? null;
  return rule === null ? "keep" : rule.action.requestHeaders[0].operation;
}

export const TEST_EXTENSION_ID = "efhpkdoiimdggndnfcgdoaniobdcmokb";

export function fakePlatform(jira: FakeJira): FakePlatform {
  const granted = new Set<string>();
  const requested: string[] = [];
  const stored = new Map<string, unknown>();
  const copied: string[] = [];
  const appliedRules: (OriginSessionRule | null)[] = [];

  const platform: FakePlatform = {
    granted,
    requested,
    stored,
    copied,
    appliedRules,
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
    originRules: { apply: async (rule) => void appliedRules.push(rule) },
    extensionId: TEST_EXTENSION_ID,
    extensionVersion: "9.9.9",
    userAgent: "UA de test",
    copyText: async (text) => void copied.push(text),
  };
  return platform;
}
