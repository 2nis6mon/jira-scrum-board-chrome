import { describe, expect, it, vi } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { BoardModel } from "../../src/app/model/BoardModel";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { FakeJira } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// La santé du sprint est masquée à la compilation ; son code reste vérifié, interrupteur forcé.
vi.mock("../../src/app/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/app/featureFlags")>()),
  SPRINT_HEALTH_ENABLED: true,
}));

describe("AppModel — santé du sprint activée", () => {
  it("panneau replié par défaut ; déplié, il le reste à la réouverture, sans toucher la largeur", async () => {
    const platform = fakePlatform(new FakeJira());
    const model = new AppModel(platform);
    await model.start();
    expect(model.healthOpen.value).toBe(false);
    await model.resizeSidebar(300, 1600, true);

    await model.toggleHealth();
    expect(model.healthOpen.value).toBe(true);
    expect(platform.stored.get("interface.v1")).toEqual({ sidebarWidth: 300, healthOpen: true });

    const reopened = new AppModel(platform);
    await reopened.start();
    expect(reopened.healthOpen.value).toBe(true);
    expect(reopened.sidebarWidth.value).toBe(300);

    await reopened.toggleHealth();
    expect(reopened.healthOpen.value).toBe(false);
  });

  it("calcule la santé du sprint affiché", async () => {
    const board = new BoardModel(
      normalizeSiteUrl("acme.atlassian.net"),
      fakePlatform(boardSiteJira()),
    );
    await board.load();
    await board.detect(BOARD_URL);
    expect(board.snapshot.value?.sprint).toBeTruthy();
    expect(board.health.value).not.toBeNull();
    board.dispose();
  });
});
