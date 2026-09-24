import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { goalBlock } from "../../src/core/boardBlocks";
import { encodeTeamDocument, type TeamDocument, teamSettingsOf } from "../../src/core/teamSettings";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { type FakeJira, isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Données FICTIVES. Réglages du board partagés par la propriété du board (0.22.0) : la version de
// Jira est appliquée à chaque lecture ; chaque modification faite par l'utilisateur est écrite
// aussitôt, UNE fois, sur la version relue juste avant. Rien d'automatique n'est écrit.

const SITE = normalizeSiteUrl("acme.atlassian.net");
const PROPERTY = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;

/** Faux Jira dont la propriété du board garde ce qu'on y écrit, comme Jira. */
function withTeamProperty(jira: FakeJira, initial: unknown = null) {
  const property = {
    stored: initial,
    refuse: false,
    unreachable: false,
    /** Appelé à chaque lecture, avant de répondre (un collègue qui écrit entre deux lectures). */
    onRead: null as null | (() => void),
  };
  jira
    .on("GET", PROPERTY, () => {
      property.onRead?.();
      return property.stored === null
        ? { status: 404 }
        : { status: 200, json: { key: BOARD_PROPERTY_KEYS.teamSettings, value: property.stored } };
    })
    .on("PUT", PROPERTY, (request) => {
      if (property.unreachable) return { networkError: "Failed to fetch" };
      if (property.refuse) return { status: 403, json: { errorMessages: ["Refusé"] } };
      property.stored = request.body;
      return { status: 200 };
    });
  return property;
}

async function boardWith(initial: unknown = null, options: { canEdit?: boolean | null } = {}) {
  const jira = boardSiteJira(options);
  const property = withTeamProperty(jira, initial);
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform);
  await board.load();
  await board.detect(BOARD_URL);
  return {
    jira,
    board,
    property,
    puts: () => jira.sent("PUT", PROPERTY),
    writes: () => jira.requests.filter(isWriteRequest),
  };
}

/** Document publié « par un collègue », à partir des réglages actuels du board. */
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
    publishedBy: { accountId: "u9", displayName: "Alex Martin" },
    settings: change(teamSettingsOf(configuration)),
  });
}

const storedSettings = (property: { stored: unknown }) =>
  (property.stored as { settings: TeamDocument["settings"] }).settings;

describe("BoardModel — réglages du board partagés", () => {
  it("rien d'enregistré : l'état le dit, et lire n'écrit rien", async () => {
    const { board, writes } = await boardWith();
    expect(board.team.value).toEqual({ kind: "none" });
    await board.sync();
    expect(writes()).toEqual([]);
  });

  it("une modification : appliquée tout de suite, écrite une fois, et le journal le garde", async () => {
    const { board, property, puts } = await boardWith();
    await board.moveLane("build", -1);
    expect(board.laneOrder.value.indexOf("build")).toBe(1);
    expect(puts()).toHaveLength(1);
    expect(storedSettings(property).blockOrder.indexOf("build")).toBe(1);
    expect(board.team.value.kind).toBe("published");
    expect(board.configuration.value?.teamBase?.publishedAt).toBe(
      (property.stored as { publishedAt: string }).publishedAt,
    );
    const [entry] = await board.audit.list(SITE.origin);
    expect(entry).toMatchObject({ action: "réglages d'équipe", outcome: "réussi" });
  });

  it("la version de Jira est appliquée à chaque lecture, même si ce navigateur avait autre chose", async () => {
    const { board, property, puts } = await boardWith();
    await board.moveLane("build", -1);
    // Un collègue change le seuil de vieillissement et remet l'ordre par défaut.
    property.stored = published(
      board,
      (settings) => ({ ...settings, agingThresholdDays: 12, blockOrder: [] }),
      "2030-01-01T08:00:00Z",
    );
    await board.sync();
    expect(board.configuration.value?.agingThresholdDays).toBe(12);
    expect(board.laneOrder.value.at(-2)).toBe("build");
    // Appliquer n'écrit rien.
    expect(puts()).toHaveLength(1);
  });

  it("un board ajouté ici prend d'emblée les réglages enregistrés", async () => {
    const jira = boardSiteJira();
    const probe = new BoardModel(SITE, fakePlatform(jira));
    await probe.load();
    await probe.detect(BOARD_URL);
    const document = published(
      probe,
      (settings) => ({ ...settings, buildSectionLabel: "Fil de l'eau" }),
      "2030-01-01T08:00:00Z",
    );
    const { board, writes } = await boardWith(document);
    expect(board.configuration.value?.buildSectionLabel).toBe("Fil de l'eau");
    expect(writes()).toEqual([]);
  });

  it("une modification se fait sur la version la plus récente : celle d'un collègue est gardée", async () => {
    const { board, property } = await boardWith();
    await board.moveLane("build", -1);
    // Écrit par un collègue depuis la dernière lecture de ce navigateur.
    property.stored = published(
      board,
      (settings) => ({ ...settings, agingThresholdDays: 9 }),
      "2030-01-01T08:00:00Z",
    );
    await board.setGoalHidden("g-stabilite", true);
    const settings = storedSettings(property);
    expect(settings.agingThresholdDays).toBe(9);
    expect(settings.hiddenGoalIds).toContain("g-stabilite");
    expect(settings.blockOrder.indexOf("build")).toBe(1);
    expect(board.configuration.value?.agingThresholdDays).toBe(9);
  });

  it("modifié par quelqu'un au même moment : rien n'est écrit, sa version s'affiche, on le dit", async () => {
    const { board, property, puts } = await boardWith();
    await board.moveLane("build", -1);
    // Entre la relecture de ce navigateur et celle qui précède l'écriture, un collègue écrit.
    const colleague = published(
      board,
      (settings) => ({ ...settings, agingThresholdDays: 21 }),
      "2030-02-02T08:00:00Z",
    );
    let reads = 0;
    property.onRead = () => {
      reads += 1;
      if (reads === 2) property.stored = colleague;
    };
    await board.setGoalHidden("g-stabilite", true);
    expect(puts()).toHaveLength(1);
    expect(board.configuration.value?.agingThresholdDays).toBe(21);
    expect(board.configuration.value?.hiddenGoalIds).not.toContain("g-stabilite");
    expect(board.teamNotice.value?.text).toContain("Alex Martin a modifié les réglages du board");
  });

  it("préférences personnelles et changements automatiques : jamais écrits", async () => {
    const { board, writes } = await boardWith();
    await board.toggleLaneCollapsed(goalBlock("g-paiement"));
    await board.applySettings((current) => ({ ...current, autoRefreshSeconds: 60 }), {
      resync: false,
    });
    board.toggleQuickFilter("blocked");
    await board.sync();
    expect(writes()).toEqual([]);
  });

  it("refus de Jira : une seule tentative, lecture seule ensuite, la version de Jira revient", async () => {
    const { board, property, puts } = await boardWith(null, { canEdit: null });
    expect(board.canEditSettings.value).toBe(true);
    property.refuse = true;
    await board.moveLane("build", -1);
    expect(puts()).toHaveLength(1);
    expect(board.canEditBoard.value).toBe(false);
    expect(board.teamNotice.value?.text).toContain("il faut pouvoir modifier le board");
    // Plus rien ne se modifie ni ne s'écrit.
    await board.setGoalHidden("g-stabilite", true);
    expect(board.configuration.value?.hiddenGoalIds).not.toContain("g-stabilite");
    expect(puts()).toHaveLength(1);
  });

  it("issue incertaine (réseau) : jamais rejouée, on le dit et on relit", async () => {
    const { board, property, puts } = await boardWith();
    property.unreachable = true;
    await board.moveLane("build", -1);
    expect(puts()).toHaveLength(1);
    expect(board.teamNotice.value?.text).toContain("Jira n'a pas confirmé");
  });

  it("Jira dit que le compte ne peut pas modifier le board : réglages partagés figés d'emblée", async () => {
    const { board, writes } = await boardWith(null, { canEdit: false });
    await board.sync();
    expect(board.canEditBoard.value).toBe(false);
    await board.moveLane("build", -1);
    await board.setGoalColor("g-paiement", 3);
    expect(board.laneOrder.value.at(-2)).toBe("build");
    expect(writes()).toEqual([]);
  });

  it("un document dans un format inconnu n'est ni appliqué ni écrasé", async () => {
    const unknown = { version: 2, settings: { futur: true } };
    const { board, property, puts } = await boardWith(unknown);
    expect(board.team.value.kind).toBe("unreadable");
    await board.moveLane("build", -1);
    expect(puts()).toEqual([]);
    expect(property.stored).toEqual(unknown);
    expect(board.teamNotice.value?.text).toContain("format inconnu");
  });
});
