import { describe, expect, it } from "vitest";
import {
  forgetDismissedNotices,
  loadDismissedNotices,
  saveDismissedNotice,
} from "../../src/app/model/noticeStore";
import type { LocalStore } from "../../src/app/platform/types";

// Données FICTIVES. Bandeaux d'information fermés pour de bon, par site et par board.

const SITE = "https://acme.atlassian.net";
const OTHER = "https://autre.atlassian.net";

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  const store: LocalStore = {
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
  return { store, data };
}

describe("bandeaux fermés", () => {
  it("se retiennent par board, sans déborder sur les autres boards ni les autres sites", async () => {
    const { store } = memoryStore();
    await saveDismissedNotice(store, SITE, 7, "no-goals");
    await saveDismissedNotice(store, SITE, 7, "unmapped-statuses");
    await saveDismissedNotice(store, SITE, 7, "no-goals");

    expect([...(await loadDismissedNotices(store, SITE, 7))].sort()).toEqual([
      "no-goals",
      "unmapped-statuses",
    ]);
    expect(await loadDismissedNotices(store, SITE, 12)).toEqual(new Set());
    expect(await loadDismissedNotices(store, OTHER, 7)).toEqual(new Set());
  });

  it("ignore un stockage abîmé ou un identifiant inconnu, sans jamais échouer", async () => {
    const { store } = memoryStore({
      "dismissedNotices.v1": {
        [SITE]: { "7": ["no-goals", "sync-error", 42, null], "8": "pas une liste" },
        [OTHER]: "pas un objet",
      },
    });
    expect(await loadDismissedNotices(store, SITE, 7)).toEqual(new Set(["no-goals"]));
    expect(await loadDismissedNotices(store, SITE, 8)).toEqual(new Set());
    expect(
      await loadDismissedNotices(memoryStore({ "dismissedNotices.v1": [] }).store, SITE, 7),
    ).toEqual(new Set());
  });

  it("s'oublient avec le board retiré, puis avec le site à la déconnexion", async () => {
    const { store, data } = memoryStore();
    await saveDismissedNotice(store, SITE, 7, "no-goals");
    await saveDismissedNotice(store, SITE, 12, "no-goals");
    await saveDismissedNotice(store, OTHER, 3, "no-goals");

    await forgetDismissedNotices(store, SITE, 7);
    expect(await loadDismissedNotices(store, SITE, 7)).toEqual(new Set());
    expect(await loadDismissedNotices(store, SITE, 12)).toEqual(new Set(["no-goals"]));

    await forgetDismissedNotices(store, SITE);
    expect(await loadDismissedNotices(store, SITE, 12)).toEqual(new Set());
    expect(await loadDismissedNotices(store, OTHER, 3)).toEqual(new Set(["no-goals"]));

    await forgetDismissedNotices(store, OTHER);
    // Plus rien à retenir : la clé disparaît du stockage.
    expect(data.has("dismissedNotices.v1")).toBe(false);
  });
});
