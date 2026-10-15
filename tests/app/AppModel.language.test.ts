import { describe, expect, it, vi } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { getLanguage } from "../../src/i18n/language";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const LOCALE = "/rest/api/3/mypreferences/locale";

describe("préférence personnelle de langue", () => {
  it("un autre board qui redimensionne sa barre ne remplace pas la langue enregistrée", async () => {
    const platform = fakePlatform(new FakeJira());
    const first = new AppModel(platform, undefined, "fr");
    const second = new AppModel(platform, undefined, "fr");
    await Promise.all([first.prepareLanguage(), second.prepareLanguage()]);
    await first.setLanguagePreference("en");
    await second.resizeSidebar(300, 1600, true);
    await second.toggleHealth();
    expect(platform.stored.get("language.v1")).toBe("en");
    const reopened = new AppModel(platform, undefined, "fr");
    await reopened.prepareLanguage();
    expect(getLanguage()).toBe("en");
  });

  it("une sauvegarde ancienne en échec n'affiche pas d'erreur après le dernier choix réussi", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform, undefined, "fr");
    await model.prepareLanguage();
    vi.spyOn(platform.store, "set").mockRejectedValueOnce(new Error("Échec ancien"));
    await Promise.all([model.setLanguagePreference("en"), model.setLanguagePreference("fr")]);
    expect(model.languagePreferenceError.value).toBeNull();
    expect(platform.stored.get("language.v1")).toBe("fr");
  });

  it.each([
    ["auto", "fr_FR", "fr"],
    ["auto", "fr-CA", "fr"],
    ["auto", "de", "en"],
    ["auto", null, "en"],
    ["en", "fr", "en"],
    ["fr", "en", "fr"],
  ])("restaure %s avec Jira %s avant tout accès au board", async (preference, locale, expected) => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    platform.stored.set("interface.v1", { sidebarWidth: 320, healthOpen: true });
    platform.stored.set("language.v1", preference);
    const model = new AppModel(platform, BOARD_URL, locale);
    await model.prepareLanguage();
    expect(getLanguage()).toBe(expected);
    expect(model.sidebarWidth.value).toBe(320);
    expect(model.healthOpen.value).toBe(true);
    expect(jira.requests).toEqual([]);
  });

  it("sauve un choix pour tous les boards sans toucher aux réglages Jira ni perdre la Daily", async () => {
    const jira = new FakeJira();
    const platform = fakePlatform(jira);
    platform.stored.set("interface.v1", {
      sidebarWidth: 310,
      healthOpen: true,
      futurePreference: 5,
    });
    const model = new AppModel(platform, BOARD_URL, "fr");
    await model.prepareLanguage();
    model.startDaily(15, null);
    const daily = model.daily.value;
    await model.setLanguagePreference("en");
    expect(getLanguage()).toBe("en");
    expect(model.daily.value).toBe(daily);
    expect(platform.stored.get("interface.v1")).toEqual({
      sidebarWidth: 310,
      healthOpen: true,
      futurePreference: 5,
    });
    expect(platform.stored.get("language.v1")).toBe("en");
    const reopened = new AppModel(platform, undefined, "fr-CA");
    await reopened.prepareLanguage();
    expect(getLanguage()).toBe("en");
    await reopened.setLanguagePreference("auto");
    expect(getLanguage()).toBe("fr");
    expect(jira.requests).toEqual([]);
  });

  it("ordonne les sauvegardes rapides et garde le dernier choix", async () => {
    const platform = fakePlatform(new FakeJira());
    const writes: unknown[] = [];
    const save = platform.store.set;
    const model = new AppModel(
      {
        ...platform,
        store: {
          ...platform.store,
          set: async (key, value) => {
            await Promise.resolve();
            writes.push(value);
            await save(key, value);
          },
        },
      },
      undefined,
      "fr",
    );
    await model.prepareLanguage();
    await Promise.all([
      model.setLanguagePreference("en"),
      model.setLanguagePreference("fr"),
      model.setLanguagePreference("auto"),
    ]);
    expect(writes).toHaveLength(3);
    expect(platform.stored.get("language.v1")).toBe("auto");
    expect(getLanguage()).toBe("fr");
  });

  it("reste utilisable si le stockage local est indisponible", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(
      {
        ...platform,
        store: {
          ...platform.store,
          get: async () => {
            throw new Error("Stockage indisponible");
          },
          set: async () => {
            throw new Error("Stockage indisponible");
          },
        },
      },
      undefined,
      "fr",
    );
    await model.prepareLanguage();
    await model.setLanguagePreference("en");
    expect(getLanguage()).toBe("en");
    expect(model.languagePreferenceError.value).not.toBeNull();
  });
});

describe("repli sur la langue Atlassian", () => {
  it("utilise le DOM Jira sans ajouter de requête de langue", async () => {
    const jira = boardSiteJira();
    const platform = fakePlatform(jira);
    platform.granted.add("https://acme.atlassian.net/*");
    const model = new AppModel(platform, BOARD_URL, "fr-CA");
    await model.start();
    expect(getLanguage()).toBe("fr");
    expect(jira.sent("GET", LOCALE)).toEqual([]);
  });

  it("n'écrase pas le choix manuel quand la réponse de langue arrive plus tard", async () => {
    const jira = boardSiteJira();
    const platform = fakePlatform(jira);
    platform.granted.add("https://acme.atlassian.net/*");
    let reply: ((response: Response) => void) | undefined;
    const response = new Promise<Response>((resolve) => {
      reply = resolve;
    });
    const fetch = vi.fn((url: string, init: RequestInit) =>
      new URL(url).pathname === LOCALE ? response : platform.fetch(url, init),
    );
    const model = new AppModel({ ...platform, fetch }, BOARD_URL);
    await model.start();
    expect(model.connection.value.state).toBe("connected");
    expect(getLanguage()).toBe("en");
    await model.setLanguagePreference("en");
    reply?.(new Response(JSON.stringify({ locale: "fr_FR" }), { status: 200 }));
    await vi.waitFor(() =>
      expect(fetch.mock.calls.filter(([url]) => new URL(url).pathname === LOCALE)).toHaveLength(1),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getLanguage()).toBe("en");
    await model.setLanguagePreference("auto");
    expect(getLanguage()).toBe("fr");
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("continue en anglais après un refus API sans le rejouer ni bloquer le board", async () => {
    const jira = boardSiteJira().on("GET", LOCALE, { status: 403 });
    const platform = fakePlatform(jira);
    platform.granted.add("https://acme.atlassian.net/*");
    const model = new AppModel(platform, BOARD_URL);
    await model.start();
    expect(model.connection.value.state).toBe("connected");
    expect(getLanguage()).toBe("en");
    expect(jira.sent("GET", LOCALE)).toHaveLength(1);
  });
});
