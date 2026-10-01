import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { loadActiveBoard } from "../../src/app/model/boardStore";
import { goalBlock } from "../../src/core/boardBlocks";
import { focusGoal, NO_FILTERS } from "../../src/core/filters";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const SITE = normalizeSiteUrl("acme.atlassian.net");
const PAIEMENT = "g-paiement";
const STABILITE = "g-stabilite";

// Board de la fixture en mode « texte du sprint » (la passerelle GraphQL y refuse) : deux
// objectifs, Build et Kanban.
async function preferencesBoard() {
  const jira = boardSiteJira();
  const platform = fakePlatform(jira);
  const board = new BoardModel(SITE, platform);
  await board.load();
  await board.detect(BOARD_URL);
  const writesBefore = jira.requests.filter(isWriteRequest).length;
  const teamProperty = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;
  const isTeamWrite = (r: { method: string; path: string }) =>
    r.method === "PUT" && r.path === teamProperty;
  return {
    board,
    platform,
    /** Écritures Jira autres que les réglages partagés du board. */
    jiraWrites: () =>
      jira.requests.filter((r) => isWriteRequest(r) && !isTeamWrite(r)).length - writesBefore,
    /** Écritures des réglages partagés (propriété du board), une par geste. */
    teamWrites: () => jira.requests.filter(isTeamWrite).length,
    stored: () => loadActiveBoard(platform.store, SITE.origin),
  };
}

const laneIds = (board: BoardModel) => board.layout.value?.lanes.map((lane) => lane.id);

describe("BoardModel — réglages d'affichage (partagés sauf le repli)", () => {
  it("monter et descendre une swimlane : immédiat, enregistré, une écriture partagée par geste", async () => {
    const { board, jiraWrites, teamWrites, stored } = await preferencesBoard();
    expect(laneIds(board)).toEqual([
      `goal:${PAIEMENT}`,
      `goal:${STABILITE}`,
      "build",
      "swimlane:1",
    ]);

    await board.moveLane("build", -1);
    expect(laneIds(board)).toEqual([
      `goal:${PAIEMENT}`,
      "build",
      `goal:${STABILITE}`,
      "swimlane:1",
    ]);

    await board.moveLane(`goal:${PAIEMENT}`, 1);
    expect(laneIds(board)).toEqual([
      "build",
      `goal:${PAIEMENT}`,
      `goal:${STABILITE}`,
      "swimlane:1",
    ]);
    expect((await stored())?.blockOrder).toEqual([
      "build",
      `goal:${PAIEMENT}`,
      `goal:${STABILITE}`,
      "swimlane:1",
    ]);
    expect(jiraWrites()).toBe(0);
    expect(teamWrites()).toBe(2);
  });

  it("glisser-déposer une swimlane : elle prend la place visée, une écriture partagée", async () => {
    const { board, stored, jiraWrites, teamWrites } = await preferencesBoard();
    board.startLaneDrag("swimlane:1");
    board.setLaneDropTarget(`goal:${PAIEMENT}`);
    expect(board.laneDropTarget.value).toBe(`goal:${PAIEMENT}`);

    await board.dropLane("swimlane:1", `goal:${PAIEMENT}`);
    expect(laneIds(board)).toEqual([
      "swimlane:1",
      `goal:${PAIEMENT}`,
      `goal:${STABILITE}`,
      "build",
    ]);
    expect((await stored())?.blockOrder).toEqual([
      "swimlane:1",
      `goal:${PAIEMENT}`,
      `goal:${STABILITE}`,
      "build",
    ]);
    expect(board.draggingLane.value).toBeNull();
    expect(jiraWrites()).toBe(0);
    expect(teamWrites()).toBe(1);
  });

  it("glisser une swimlane en dernier, puis à sa propre place : seule la première compte", async () => {
    const { board } = await preferencesBoard();
    board.startLaneDrag(`goal:${PAIEMENT}`);
    board.setLaneDropTarget(null);
    expect(board.laneDropTarget.value).toBeNull();
    await board.dropLane(`goal:${PAIEMENT}`, null);
    expect(laneIds(board)).toEqual([
      `goal:${STABILITE}`,
      "build",
      "swimlane:1",
      `goal:${PAIEMENT}`,
    ]);

    // Juste avant la suivante, ou sur elle-même : l'ordre ne changerait pas, aucune ligne.
    board.startLaneDrag("build");
    board.setLaneDropTarget("build");
    expect(board.laneDropTarget.value).toBeUndefined();
    board.setLaneDropTarget("swimlane:1");
    expect(board.laneDropTarget.value).toBeUndefined();
    board.endLaneDrag();
    expect(board.draggingLane.value).toBeNull();
  });

  it("monter la première swimlane ne change rien", async () => {
    const { board, stored } = await preferencesBoard();
    await board.moveLane(`goal:${PAIEMENT}`, -1);
    expect((await stored())?.blockOrder).toEqual([]);
  });

  it("un filtre ne change pas le sens de « monter »", async () => {
    const { board } = await preferencesBoard();
    board.setFilters(focusGoal(NO_FILTERS, STABILITE));
    expect(laneIds(board)).toEqual([`goal:${STABILITE}`]);

    await board.moveLane(`goal:${STABILITE}`, -1);
    board.resetFilters();
    expect(laneIds(board)).toEqual([
      `goal:${STABILITE}`,
      `goal:${PAIEMENT}`,
      "build",
      "swimlane:1",
    ]);
  });

  it("replier une swimlane, puis toutes, puis tout déplier", async () => {
    const { board, stored, jiraWrites, teamWrites } = await preferencesBoard();
    await board.toggleLaneCollapsed(goalBlock(STABILITE));
    const collapsed = () =>
      board.layout.value?.lanes.filter((lane) => lane.collapsed).map((lane) => lane.id);
    expect(collapsed()).toEqual([`goal:${STABILITE}`]);
    expect((await stored())?.collapsedBlockIds).toEqual([`goal:${STABILITE}`]);

    await board.setAllLanesCollapsed(true);
    expect(collapsed()).toEqual([`goal:${PAIEMENT}`, `goal:${STABILITE}`, "build", "swimlane:1"]);

    await board.setAllLanesCollapsed(false);
    expect(collapsed()).toEqual([]);
    expect(jiraWrites()).toBe(0);
    // Le repli est personnel : jamais écrit dans Jira.
    expect(teamWrites()).toBe(0);
  });

  it("masquer un objectif : ses tickets rejoignent Build ; le réafficher les ramène", async () => {
    const { board, stored, jiraWrites, teamWrites } = await preferencesBoard();
    const keysIn = (laneId: string) =>
      board.layout.value?.lanes
        .find((lane) => lane.id === laneId)
        ?.cells.flatMap((cell) => cell.issues.map((issue) => issue.issue.key));

    await board.setGoalHidden(PAIEMENT, true);
    expect(laneIds(board)).toEqual([`goal:${STABILITE}`, "build", "swimlane:1"]);
    expect(keysIn("build")).toEqual(expect.arrayContaining(["ABC-101", "ABC-102"]));
    expect(board.hiddenGoals.value.map((goal) => goal.id)).toEqual([PAIEMENT]);
    expect((await stored())?.hiddenGoalIds).toEqual([PAIEMENT]);

    await board.setGoalHidden(PAIEMENT, false);
    expect(keysIn(`goal:${PAIEMENT}`)).toEqual(expect.arrayContaining(["ABC-101", "ABC-102"]));
    expect(board.hiddenGoals.value).toEqual([]);
    // Le rattachement dans Jira n'a jamais été touché.
    expect(jiraWrites()).toBe(0);
    expect(teamWrites()).toBe(2);
  });

  it("couleur d'un objectif : immédiate, enregistrée, conservée par la relecture de Jira", async () => {
    const { board, stored, jiraWrites, teamWrites } = await preferencesBoard();
    const colorOf = (goalId: string) =>
      board.snapshot.value?.goals.find((goal) => goal.id === goalId)?.color;
    expect(colorOf(PAIEMENT)).toBe("goal1");

    await board.setGoalColor(PAIEMENT, 5);
    expect(colorOf(PAIEMENT)).toBe("goal6");
    expect((await stored())?.goalColorIndex[PAIEMENT]).toBe(5);

    await board.sync();
    expect(colorOf(PAIEMENT)).toBe("goal6");
    expect(colorOf(STABILITE)).toBe("goal2");
    expect(jiraWrites()).toBe(0);
    expect(teamWrites()).toBe(1);
  });

  it("une couleur choisie pendant une relecture n'est pas écrasée par elle", async () => {
    const { board, stored } = await preferencesBoard();
    const pending = board.sync();
    await board.setGoalColor(STABILITE, 7);
    await pending;
    expect(board.snapshot.value?.goals.find((goal) => goal.id === STABILITE)?.color).toBe("goal8");
    expect((await stored())?.goalColorIndex[STABILITE]).toBe(7);
  });

  it("enregistrement local impossible : le réglage s'applique et on le dit", async () => {
    const { board, platform } = await preferencesBoard();
    Object.assign(platform.store, {
      set: async () => {
        throw new Error("Quota dépassé");
      },
    });
    await board.toggleLaneCollapsed(goalBlock(PAIEMENT));
    expect(board.layout.value?.lanes[0]?.collapsed).toBe(true);
    expect(board.writeNotice.value).toMatchObject({ tone: "warning" });
    expect(board.writeNotice.value?.text).toContain("pas enregistré dans ce navigateur");
  });
});
