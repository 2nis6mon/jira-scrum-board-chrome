import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { encodeTeamDocument, type TeamDocument, teamSettingsOf } from "../../src/core/teamSettings";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { type FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Données FICTIVES. Réglages d'équipe : propriété du board, lue à chaque actualisation, écrite
// seulement par « Publier pour l'équipe ».

const SITE = normalizeSiteUrl("acme.atlassian.net");
const PROPERTY = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;

/** Faux Jira dont la propriété du board garde ce qu'on y écrit, comme Jira. */
function withTeamProperty(jira: FakeJira, initial: unknown = null) {
  const property = { stored: initial, refuse: false };
  jira
    .on("GET", PROPERTY, () =>
      property.stored === null
        ? { status: 404 }
        : { status: 200, json: { key: BOARD_PROPERTY_KEYS.teamSettings, value: property.stored } },
    )
    .on("PUT", PROPERTY, (request) => {
      if (property.refuse) return { status: 403, json: { errorMessages: ["Refusé"] } };
      property.stored = request.body;
      return { status: 201 };
    });
  return property;
}

async function boardWith(initial: unknown = null) {
  const jira = boardSiteJira();
  const property = withTeamProperty(jira, initial);
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform);
  await board.load();
  await board.detect(BOARD_URL);
  return { jira, platform, board, property, writes: () => jira.requests.filter(isWriteRequest) };
}

/** Document publié « par un collègue », à partir de réglages donnés. */
function published(
  board: BoardModel,
  change: (settings: TeamDocument["settings"]) => TeamDocument["settings"],
  publishedAt: string,
): unknown {
  const configuration = board.configuration.value;
  if (!configuration) throw new Error("configuration attendue");
  return encodeTeamDocument({
    version: 1,
    publishedAt,
    publishedBy: { accountId: "u9", displayName: "Camille Durand" },
    settings: change(teamSettingsOf(configuration)),
  });
}

describe("BoardModel — réglages d'équipe", () => {
  it("rien de publié : l'état le dit, et la lecture n'écrit rien", async () => {
    const { board, writes } = await boardWith();
    expect(board.team.value).toEqual({ kind: "none" });
    expect(board.teamStatus.value?.update).toBeNull();
    await board.sync();
    expect(writes()).toEqual([]);
  });

  it("publier : une seule écriture, sur la propriété du board ; la version devient la référence", async () => {
    const { board, property, writes, platform } = await boardWith();
    await board.setAllLanesCollapsed(true); // réglage personnel : pas publié
    await board.moveLane("build", -1); // réglage d'équipe
    await board.publishTeamSettings();

    expect(writes().map((request) => [request.method, request.path])).toEqual([["PUT", PROPERTY]]);
    const stored = property.stored as { settings: { blockOrder: string[] }; publishedBy: unknown };
    expect(stored.settings.blockOrder).toEqual(board.configuration.value?.blockOrder);
    expect(stored.settings).not.toHaveProperty("collapsedBlockIds");
    expect(stored.publishedBy).toEqual({ accountId: "u1", displayName: "Camille Durand" });
    expect(board.teamNotice.value?.tone).toBe("success");
    expect(board.teamStatus.value?.localChanges).toEqual([]);
    expect(board.team.value.kind).toBe("published");

    const journal = await board.audit.list(SITE.origin);
    expect(journal[0]).toMatchObject({ action: "réglages d'équipe", outcome: "réussi" });
    // Rien ne change dans le stockage de la bascule de board.
    expect(platform.stored.has("boards.v1")).toBe(true);
  });

  it("un board ajouté dans ce navigateur prend d'emblée les réglages de l'équipe", async () => {
    // Un collègue a publié ; on ajoute le board ici pour la première fois.
    const first = await boardWith();
    const document = published(
      first.board,
      (settings) => ({ ...settings, buildSectionLabel: "Sprint Backlog", agingThresholdDays: 9 }),
      "2026-09-19T08:00:00Z",
    );
    const { board, writes } = await boardWith(document);
    expect(board.configuration.value?.buildSectionLabel).toBe("Sprint Backlog");
    expect(board.configuration.value?.agingThresholdDays).toBe(9);
    expect(board.teamApplied.value?.publishedBy.displayName).toBe("Camille Durand");
    expect(board.teamStatus.value?.localChanges).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("nouvelle version de l'équipe, rien de modifié ici : appliquée à l'actualisation", async () => {
    const { board, property } = await boardWith();
    await board.publishTeamSettings();
    board.teamNotice.value = null;
    property.stored = published(
      board,
      (settings) => ({ ...settings, blockedLabels: ["bloqué"] }),
      "2026-09-20T08:00:00Z",
    );
    await board.sync();
    expect(board.configuration.value?.blockedLabels).toEqual(["bloqué"]);
    expect(board.teamApplied.value?.publishedAt).toBe("2026-09-20T08:00:00Z");
    expect(board.teamStatus.value?.update).toBeNull();
  });

  it("nouvelle version, mais modifications locales : rien n'est écrasé, le choix est laissé", async () => {
    const { board, property, writes } = await boardWith();
    await board.publishTeamSettings();
    const writesAfterPublish = writes().length;
    await board.moveLane("build", -1); // modification locale, non publiée
    expect(board.teamStatus.value?.localChanges).toEqual(["Ordre des swimlanes"]);

    property.stored = published(
      board,
      (settings) => ({ ...settings, blockOrder: [], agingThresholdDays: 12 }),
      "2026-09-20T08:00:00Z",
    );
    await board.sync();
    expect(board.configuration.value?.agingThresholdDays).not.toBe(12);
    expect(board.teamStatus.value?.update?.publishedAt).toBe("2026-09-20T08:00:00Z");
    expect(board.teamStatus.value?.updateChanges).toEqual([
      "Swimlane Kanban, noms de Build et de Kanban, seuil de vieillissement",
      "Ordre des swimlanes",
    ]);

    // « Garder les miens » : la version de l'équipe devient la référence, rien n'est écrit.
    await board.keepLocalSettings();
    expect(board.teamStatus.value?.update).toBeNull();
    expect(board.teamStatus.value?.localChanges.length).toBeGreaterThan(0);
    // « Appliquer » : on reprend exactement les réglages de l'équipe.
    await board.applyTeamSettings();
    expect(board.configuration.value?.agingThresholdDays).toBe(12);
    expect(board.teamStatus.value?.localChanges).toEqual([]);
    expect(writes()).toHaveLength(writesAfterPublish);
  });

  it("une version appliquée puis une autre en attente : l'annonce périmée disparaît", async () => {
    const { board, property } = await boardWith();
    await board.publishTeamSettings();
    property.stored = published(
      board,
      (settings) => ({ ...settings, buildSectionLabel: "Sprint Backlog" }),
      "2026-09-20T08:00:00.000Z",
    );
    await board.sync();
    expect(board.teamApplied.value?.publishedAt).toBe("2026-09-20T08:00:00.000Z");

    await board.moveLane("build", -1);
    property.stored = published(
      board,
      (settings) => ({ ...settings, agingThresholdDays: 4, blockOrder: [] }),
      "2026-09-20T08:00:00.500Z",
    );
    await board.sync();
    expect(board.teamApplied.value).toBeNull();
    expect(board.teamStatus.value?.update?.publishedAt).toBe("2026-09-20T08:00:00.500Z");
  });

  it("publié entre-temps par quelqu'un d'autre : conflit, rien n'est écrit", async () => {
    const { board, property, writes } = await boardWith();
    await board.publishTeamSettings();
    const writesAfterPublish = writes().length;
    property.stored = published(board, (settings) => settings, "2026-09-21T08:00:00Z");
    await board.moveLane("build", -1);
    await board.publishTeamSettings();
    expect(writes()).toHaveLength(writesAfterPublish);
    expect(board.teamNotice.value).toMatchObject({ tone: "warning" });
    expect(board.teamNotice.value?.text).toContain("Camille Durand");
    expect(board.teamStatus.value?.update?.publishedAt).toBe("2026-09-21T08:00:00Z");
  });

  it("refus de droits : dit qu'il faut pouvoir modifier le board, une seule tentative", async () => {
    const { board, property, jira } = await boardWith();
    property.refuse = true;
    await board.publishTeamSettings();
    expect(jira.sent("PUT", PROPERTY)).toHaveLength(1);
    expect(board.teamNotice.value).toMatchObject({ tone: "error" });
    expect(board.teamNotice.value?.text).toContain("modifier le board");
    expect(board.team.value).toEqual({ kind: "none" });
    const journal = await board.audit.list(SITE.origin);
    expect(journal[0]).toMatchObject({ action: "réglages d'équipe", outcome: "échec" });
  });

  it("un document dans un format inconnu n'est ni appliqué ni écrasé", async () => {
    const { board, writes } = await boardWith({ version: 2, settings: {} });
    expect(board.team.value.kind).toBe("unreadable");
    await board.publishTeamSettings();
    expect(writes()).toEqual([]);
    expect(board.teamNotice.value?.tone).toBe("error");
  });
});
