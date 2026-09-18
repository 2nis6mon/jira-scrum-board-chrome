import { describe, expect, it } from "vitest";
import { forgetSite, loadActiveBoard, loadBoard, saveBoard } from "../../src/app/model/boardStore";
import { decodeStoredConfiguration } from "../../src/core/boardConfiguration";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { makeConfiguration } from "../support/jiraFixtures";

const ACME = "https://acme.atlassian.net";
const OTHER = "https://autre.atlassian.net";

describe("stockage local des boards", () => {
  it("enregistre, relit, et fait du dernier enregistré le board actif", async () => {
    const { store } = fakePlatform(new FakeJira());
    await saveBoard(store, makeConfiguration({ boardId: 7 }));
    await saveBoard(store, makeConfiguration({ boardId: 9, boardName: "Autre board" }));

    expect((await loadActiveBoard(store, ACME))?.boardId).toBe(9);
    expect((await loadBoard(store, ACME, 7))?.boardId).toBe(7);
    expect(await loadBoard(store, ACME, 99)).toBeNull();
  });

  it("sépare les sites ; oublier un site ne touche pas les autres", async () => {
    const platform = fakePlatform(new FakeJira());
    await saveBoard(platform.store, makeConfiguration({ boardId: 7 }));
    await saveBoard(platform.store, makeConfiguration({ boardId: 3, siteOrigin: OTHER }));

    await forgetSite(platform.store, ACME);
    expect(await loadActiveBoard(platform.store, ACME)).toBeNull();
    expect((await loadActiveBoard(platform.store, OTHER))?.boardId).toBe(3);

    await forgetSite(platform.store, OTHER);
    expect(platform.stored.has("boards.v1")).toBe(false);
  });

  it("aller-retour complet d'une configuration", async () => {
    const configuration = makeConfiguration({
      boardId: 7,
      hiddenGoalIds: ["g1"],
      blockOrder: ["build", "goal:g2"],
      collapsedBlockIds: ["run"],
      goalColorIndex: { g1: 4 },
      cardFields: [
        { kind: "labels" },
        { kind: "custom", customFieldId: "customfield_1", customFieldName: "Env" },
      ],
      cardColorRules: [
        { id: "r1", name: "P2", jql: "priority = High", color: "red", enabled: false, kind: null },
      ],
      goalSource: "sprintText",
      autoRefreshSeconds: 120,
      localPinnedGoalIds: { "42": ["ari:goal/1", "ari:goal/2"] },
    });
    // Passage par JSON, comme chrome.storage.local.
    const roundTrip = decodeStoredConfiguration(JSON.parse(JSON.stringify(configuration)));
    expect(roundTrip).toEqual(configuration);
  });

  it("sélection d'épinglage locale : entrées illisibles écartées", () => {
    const stored = JSON.parse(JSON.stringify(makeConfiguration()));
    stored.localPinnedGoalIds = { "42": ["ari:goal/1", 3], abc: ["x"], "43": [], "44": "texte" };
    expect(decodeStoredConfiguration(stored)?.localPinnedGoalIds).toEqual({ "42": ["ari:goal/1"] });
    delete stored.localPinnedGoalIds;
    expect(decodeStoredConfiguration(stored)?.localPinnedGoalIds).toEqual({});
  });

  it("une configuration incomplète est ignorée ; une préférence illisible reprend son défaut", () => {
    expect(decodeStoredConfiguration(null)).toBeNull();
    expect(decodeStoredConfiguration({ boardId: 7 })).toBeNull();
    const base = JSON.parse(JSON.stringify(makeConfiguration()));
    expect(decodeStoredConfiguration({ ...base, scrumColumns: "illisible" })).toBeNull();

    const tolerant = decodeStoredConfiguration({
      ...base,
      agingThresholdDays: -2,
      goalSource: "inconnu",
      hiddenGoalIds: ["g1", 3],
      cardFields: [{ kind: "inconnu" }, { kind: "labels" }],
      goalColorIndex: { g1: 2, g2: "rouge" },
    });
    expect(tolerant?.agingThresholdDays).toBe(3);
    expect(tolerant?.goalSource).toBe("atlassianGoals");
    expect(tolerant?.hiddenGoalIds).toEqual(["g1"]);
    expect(tolerant?.cardFields).toEqual([{ kind: "labels" }]);
    expect(tolerant?.goalColorIndex).toEqual({ g1: 2 });
  });
});
