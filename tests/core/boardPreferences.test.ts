import { describe, expect, it } from "vitest";
import { BUILD_BLOCK, goalBlock } from "../../src/core/boardBlocks";
import { assembleBoardIssues, type BoardSnapshot } from "../../src/core/boardIssue";
import { buildBoardLayout } from "../../src/core/boardLayout";
import {
  GOAL_COLOR_NAMES,
  laneOrder,
  withAllBlocksCollapsed,
  withBlockCollapsed,
  withBlockOrder,
  withGoalColor,
  withGoalHidden,
} from "../../src/core/boardPreferences";
import { NO_FILTERS } from "../../src/core/filters";
import { GOAL_COLOR_COUNT, makeSprintGoal } from "../../src/core/sprintGoals";
import type { JiraIssue } from "../../src/jira/models";
import { makeConfiguration, makeIssue } from "../support/jiraFixtures";

const config = makeConfiguration({ runColumns: makeConfiguration().scrumColumns });
const GOALS = [
  makeSprintGoal({ id: "g1", title: "Paiement", position: 0 }),
  makeSprintGoal({ id: "g2", title: "Stabilité", position: 1 }),
  makeSprintGoal({ id: "g3", title: "Sécurité", position: 2 }),
];

function snapshot(run: JiraIssue[] = []): BoardSnapshot {
  const assemble = (issues: JiraIssue[]) =>
    assembleBoardIssues({ issues, configuration: config, columns: config.scrumColumns, links: {} });
  return {
    sprint: null,
    activeSprints: [],
    goals: GOALS,
    goalsOrigin: "sprintText",
    scrumIssues: assemble([makeIssue("ABC-1")]),
    runIssues: assemble(run),
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
    pinnedGoalIds: [],
  };
}

const withRun = snapshot([makeIssue("RUN-1", { typeId: "10004" })]);

describe("ordre des swimlanes", () => {
  it("objectifs visibles, Build, puis RUN s'il y a des tickets RUN", () => {
    expect(laneOrder(withRun, config)).toEqual(["goal:g1", "goal:g2", "goal:g3", "build", "run"]);
    expect(laneOrder(snapshot(), config)).toEqual(["goal:g1", "goal:g2", "goal:g3", "build"]);
  });

  it("un objectif masqué ne compte pas dans l'ordre affiché", () => {
    expect(laneOrder(withRun, withGoalHidden(config, "g2", true))).toEqual([
      "goal:g1",
      "goal:g3",
      "build",
      "run",
    ]);
  });

  it("RUN désactivé n'en fait pas partie", () => {
    expect(laneOrder(withRun, { ...config, showRunSection: false })).not.toContain("run");
  });

  it("l'ordre choisi est appliqué au board", () => {
    const moved = withBlockOrder(config, ["build", "goal:g3", "goal:g1", "goal:g2", "run"]);
    expect(laneOrder(withRun, moved)).toEqual(["build", "goal:g3", "goal:g1", "goal:g2", "run"]);
    expect(buildBoardLayout(withRun, moved, NO_FILTERS).lanes.map((lane) => lane.id)).toEqual([
      "build",
      "goal:g3",
      "goal:g1",
      "goal:g2",
      "run",
    ]);
  });

  it("un objectif masqué garde sa place pour son retour (le Mac le renvoyait en fin de liste)", () => {
    const hidden = withGoalHidden(
      { ...config, blockOrder: ["goal:g2", "goal:g1", "goal:g3"] },
      "g2",
      true,
    );
    // On échange g1 et g3 pendant que g2 est masqué.
    const moved = withBlockOrder(hidden, ["goal:g3", "goal:g1", "build"]);
    expect(moved.blockOrder).toEqual(["goal:g2", "goal:g3", "goal:g1", "build"]);
    expect(laneOrder(snapshot(), withGoalHidden(moved, "g2", false))).toEqual([
      "goal:g2",
      "goal:g3",
      "goal:g1",
      "build",
    ]);
  });

  it("un bloc absent reste juste après celui qui le précédait", () => {
    const moved = withBlockOrder(
      { ...config, blockOrder: ["goal:g1", "goal:g2", "goal:cache", "goal:g3", "build"] },
      ["goal:g3", "goal:g2", "goal:g1", "build"],
    );
    expect(moved.blockOrder).toEqual(["goal:g3", "goal:g2", "goal:cache", "goal:g1", "build"]);
  });

  it("un objectif masqué jamais rangé va en fin de liste", () => {
    const moved = withBlockOrder(withGoalHidden(config, "g2", true), ["goal:g3", "goal:g1"]);
    expect(moved.blockOrder).toEqual(["goal:g3", "goal:g1", "goal:g2"]);
  });

  it("un objectif absent de ce sprint garde sa place dans l'ordre enregistré", () => {
    const moved = withBlockOrder({ ...config, blockOrder: ["goal:ancien", "goal:g1"] }, [
      "goal:g1",
      "build",
    ]);
    expect(moved.blockOrder).toEqual(["goal:ancien", "goal:g1", "build"]);
  });
});

describe("repli des swimlanes", () => {
  it("replier puis déplier une swimlane", () => {
    const collapsed = withBlockCollapsed(config, goalBlock("g2"), true);
    expect(collapsed.collapsedBlockIds).toEqual(["goal:g2"]);
    const lanes = buildBoardLayout(withRun, collapsed, NO_FILTERS).lanes;
    expect(lanes.filter((lane) => lane.collapsed).map((lane) => lane.id)).toEqual(["goal:g2"]);
    expect(withBlockCollapsed(collapsed, goalBlock("g2"), false).collapsedBlockIds).toEqual([]);
  });

  it("replier deux fois ne duplique rien", () => {
    const twice = withBlockCollapsed(
      withBlockCollapsed(config, BUILD_BLOCK, true),
      BUILD_BLOCK,
      true,
    );
    expect(twice.collapsedBlockIds).toEqual(["build"]);
  });

  it("tout replier concerne les swimlanes affichées ; tout déplier les libère toutes", () => {
    const all = withAllBlocksCollapsed(config, laneOrder(withRun, config), true);
    expect(all.collapsedBlockIds).toEqual(["build", "goal:g1", "goal:g2", "goal:g3", "run"]);
    expect(withAllBlocksCollapsed(all, [], false).collapsedBlockIds).toEqual([]);
  });
});

describe("masquage et couleur des objectifs", () => {
  it("masquer puis réafficher un objectif", () => {
    const hidden = withGoalHidden(withGoalHidden(config, "g2", true), "g1", true);
    expect(hidden.hiddenGoalIds).toEqual(["g1", "g2"]);
    expect(withGoalHidden(hidden, "g2", false).hiddenGoalIds).toEqual(["g1"]);
  });

  it("la couleur choisie est mémorisée, dans les bornes de la palette", () => {
    expect(withGoalColor(config, "g1", 3).goalColorIndex).toMatchObject({ g1: 3 });
    expect(withGoalColor(config, "g1", GOAL_COLOR_COUNT + 1).goalColorIndex.g1).toBe(1);
    expect(withGoalColor(config, "g1", -1).goalColorIndex.g1).toBe(GOAL_COLOR_COUNT - 1);
  });

  it("changer une couleur ne touche pas celles des autres objectifs", () => {
    const colored = withGoalColor({ ...config, goalColorIndex: { g1: 0, g2: 1 } }, "g2", 5);
    expect(colored.goalColorIndex).toEqual({ g1: 0, g2: 5 });
  });

  it("chaque couleur de la palette a un nom", () => {
    expect(GOAL_COLOR_NAMES).toHaveLength(GOAL_COLOR_COUNT);
  });
});
