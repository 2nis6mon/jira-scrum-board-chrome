import { describe, expect, it } from "vitest";
import { AppModel } from "../../src/app/model/AppModel";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";

const SITE = "https://acme.atlassian.net";
const OTHER = "https://autre.atlassian.net/jira/software/c/projects/XYZ/boards/8";

describe("connexion attachée à la page Jira hôte", () => {
  it("garde le site et le board de l'hôte, même si un autre démarrage est demandé", async () => {
    const platform = fakePlatform(boardSiteJira());
    platform.granted.add(`${SITE}/*`);
    const model = new AppModel(platform, BOARD_URL);
    await model.start(OTHER);
    const connection = model.connection.value;
    expect(connection.state).toBe("connected");
    if (connection.state !== "connected") throw new Error("connexion attendue");
    expect(connection.site.origin).toBe(SITE);
    expect(connection.board.configuration.value?.boardId).toBe(7);
    connection.board.dispose();
  });

  it("refuse un autre site avant permission ou lecture, y compris après déconnexion", async () => {
    const jira = boardSiteJira();
    const platform = fakePlatform(jira);
    const model = new AppModel(platform, BOARD_URL);
    await model.connect(SITE);
    await model.disconnect();
    const before = jira.requests.length;
    const requested = platform.requested.length;
    await model.connect(OTHER);
    expect(model.connection.value.state).toBe("disconnected");
    expect(model.connectionError.value?.text).toContain("site Jira qui héberge");
    expect(jira.requests).toHaveLength(before);
    expect(platform.requested).toHaveLength(requested);
    await model.connect(SITE);
    const connection = model.connection.value;
    if (connection.state !== "connected") throw new Error("reconnexion attendue");
    expect(connection.board.configuration.value?.boardId).toBe(7);
    connection.board.dispose();
  });

  it.each([BOARD_URL, OTHER])(
    "oublie l'adresse du lanceur seulement pour le site déconnecté : %s",
    async (address) => {
      const platform = fakePlatform(boardSiteJira());
      const model = new AppModel(platform, BOARD_URL);
      await model.connect(SITE);
      platform.stored.set("launcher.v1", address);
      await model.disconnect();
      expect(platform.stored.get("launcher.v1")).toBe(address === BOARD_URL ? undefined : OTHER);
    },
  );
});
