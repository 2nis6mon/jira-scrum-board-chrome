import { describe, expect, it } from "vitest";
import { GOAL_COLOR_NAMES } from "../../src/app/model/coreText";
import { BUILD_BLOCK, goalBlock } from "../../src/core/boardBlocks";
import { assembleBoardIssues, type BoardSnapshot } from "../../src/core/boardIssue";
import { buildBoardLayout } from "../../src/core/boardLayout";
import {
  laneOrder,
  laneSummaries,
  settingsLaneOrder,
  withAllBlocksCollapsed,
  withBlockCollapsed,
  withBlockOrder,
  withGoalColor,
  withGoalHidden,
  withSettingsLaneMoved,
  withSettingsLaneShifted,
} from "../../src/core/boardPreferences";
import { withSwimlaneHidden, withTypeDestination } from "../../src/core/boardSettings";
import { NO_FILTERS } from "../../src/core/filters";
import { GOAL_COLOR_COUNT, makeSprintGoal } from "../../src/core/sprintGoals";
import type { JiraIssue } from "../../src/jira/models";
import { makeConfiguration, makeIssue, STORY_TYPE, SWIMLANE_TYPE } from "../support/jiraFixtures";

const config = makeConfiguration();
const GOALS = [
  makeSprintGoal({ id: "g1", title: "Paiement", position: 0 }),
  makeSprintGoal({ id: "g2", title: "Stabilité", position: 1 }),
  makeSprintGoal({ id: "g3", title: "Sécurité", position: 2 }),
];

function snapshot(run: JiraIssue[] = []): BoardSnapshot {
  const assemble = (issues: JiraIssue[]) =>
    assembleBoardIssues({ issues, configuration: config, columns: config.columns, links: {} });
  return {
    sprint: null,
    activeSprints: [],
    goals: GOALS,
    goalsOrigin: "sprintText",
    goalIssues: assemble([makeIssue("ABC-1")]),
    swimlaneIssues: assemble(run),
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
    pinnedGoalIds: [],
    localPinnedGoalIds: null,
  };
}

const withRun = snapshot([makeIssue("RUN-1", { typeId: "10004" })]);

describe("swimlanes de la barre latérale", () => {
  const assembled = (issues: JiraIssue[], links: Record<string, string> = {}) =>
    assembleBoardIssues({ issues, configuration: config, columns: config.columns, links });
  const sprint: BoardSnapshot = {
    ...snapshot(),
    goalIssues: assembled(
      [
        makeIssue("ABC-1", { category: "done", statusId: "6" }),
        makeIssue("ABC-2"),
        makeIssue("ABC-3", { category: "done", statusId: "6" }),
        makeIssue("ABC-4"),
      ],
      { "ABC-1": "g1", "ABC-2": "g1", "ABC-3": "g2" },
    ),
    swimlaneIssues: assembled([makeIssue("RUN-1", { typeId: "10004" })]),
  };
  const rows = (configuration = config) =>
    laneSummaries(sprint, configuration).map((lane) => [
      lane.id,
      lane.title,
      lane.done,
      lane.count,
    ]);

  it("dans l'ordre du board, avec tickets terminés et total de chaque swimlane", () => {
    expect(rows()).toEqual([
      ["goal:g1", "Paiement", 1, 2],
      ["goal:g2", "Stabilité", 1, 1],
      ["goal:g3", "Sécurité", 0, 0],
      ["build", "Build", 0, 1],
      ["swimlane:1", "Anomalie Prod", 0, 1],
    ]);
  });

  it("suit l'ordre choisi, et Build compte les tickets d'un objectif masqué", () => {
    const moved = withBlockOrder(config, ["swimlane:1", "goal:g3", "build", "goal:g1", "goal:g2"]);
    expect(rows(withGoalHidden(moved, "g2", true))).toEqual([
      ["swimlane:1", "Anomalie Prod", 0, 1],
      ["goal:g3", "Sécurité", 0, 0],
      ["build", "Build", 1, 2],
      ["goal:g1", "Paiement", 1, 2],
    ]);
  });

  it("Build prend le nom choisi dans les réglages", () => {
    expect(rows({ ...config, buildSectionLabel: "Sprint Backlog" })[3]).toEqual([
      "build",
      "Sprint Backlog",
      0,
      1,
    ]);
  });

  it("masque Build vide dans la barre latérale, même avec des tickets dans les objectifs", () => {
    const goalsOnly = { ...sprint, goalIssues: assembled([makeIssue("ABC-1")], { "ABC-1": "g1" }) };
    expect(laneSummaries(goalsOnly, config).map((lane) => lane.id)).toEqual([
      "goal:g1",
      "goal:g2",
      "goal:g3",
      "swimlane:1",
    ]);
  });
});

describe("ordre des swimlanes", () => {
  it("objectifs visibles, Build, puis les swimlanes par type qui ont des tickets", () => {
    expect(laneOrder(withRun, config)).toEqual([
      "goal:g1",
      "goal:g2",
      "goal:g3",
      "build",
      "swimlane:1",
    ]);
    expect(laneOrder(snapshot(), config)).toEqual(["goal:g1", "goal:g2", "goal:g3", "build"]);
  });

  it("un objectif masqué ne compte pas dans l'ordre affiché", () => {
    expect(laneOrder(withRun, withGoalHidden(config, "g2", true))).toEqual([
      "goal:g1",
      "goal:g3",
      "build",
      "swimlane:1",
    ]);
  });

  it("une swimlane par type masquée n'en fait pas partie", () => {
    expect(laneOrder(withRun, withSwimlaneHidden(config, "1", true))).not.toContain("swimlane:1");
  });

  it("l'ordre choisi est appliqué au board", () => {
    const moved = withBlockOrder(config, ["build", "goal:g3", "goal:g1", "goal:g2", "swimlane:1"]);
    expect(laneOrder(withRun, moved)).toEqual([
      "build",
      "goal:g3",
      "goal:g1",
      "goal:g2",
      "swimlane:1",
    ]);
    expect(buildBoardLayout(withRun, moved, NO_FILTERS).lanes.map((lane) => lane.id)).toEqual([
      "build",
      "goal:g3",
      "goal:g1",
      "goal:g2",
      "swimlane:1",
    ]);
  });

  it("un objectif masqué garde sa place pour son retour", () => {
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

describe("liste des swimlanes de l'onglet Board des réglages", () => {
  const service = { ...SWIMLANE_TYPE, id: "10006", name: "Demande de service" };
  // Swimlane 1 : Anomalie Prod ; swimlane 2 : Demande de service, masquée et sans ticket.
  const two = withSwimlaneHidden(
    withTypeDestination(
      makeConfiguration({ issueTypes: [STORY_TYPE, SWIMLANE_TYPE, service] }),
      "10006",
      {
        kind: "newSwimlane",
      },
    ),
    "2",
    true,
  );
  const ordered = {
    ...two,
    blockOrder: ["goal:g1", "build", "goal:g2", "swimlane:1", "goal:g3", "swimlane:2"],
  };

  it("Build et toutes les swimlanes par type, masquées comprises, sans les objectifs", () => {
    expect(settingsLaneOrder(two)).toEqual(["build", "swimlane:1", "swimlane:2"]);
    expect(settingsLaneOrder({ ...two, blockOrder: ["swimlane:2", "goal:g1", "build"] })).toEqual([
      "swimlane:2",
      "build",
      "swimlane:1",
    ]);
  });

  it("déplacer Build ou une swimlane laisse les objectifs à leur place", () => {
    expect(withSettingsLaneMoved(ordered, GOALS, "swimlane:2", "build").blockOrder).toEqual([
      "goal:g1",
      "swimlane:2",
      "build",
      "goal:g2",
      "swimlane:1",
      "goal:g3",
    ]);
    expect(withSettingsLaneMoved(ordered, GOALS, "build", null).blockOrder).toEqual([
      "goal:g1",
      "goal:g2",
      "swimlane:1",
      "goal:g3",
      "swimlane:2",
      "build",
    ]);
  });

  it("une place inchangée rend la configuration telle quelle : rien à enregistrer", () => {
    expect(withSettingsLaneMoved(ordered, GOALS, "build", "goal:g2")).toBe(ordered);
    expect(withSettingsLaneMoved(ordered, GOALS, "build", "build")).toBe(ordered);
    expect(withSettingsLaneShifted(ordered, GOALS, "build", -1)).toBe(ordered);
    expect(withSettingsLaneShifted(ordered, GOALS, "swimlane:2", 1)).toBe(ordered);
  });

  it("au clavier : un cran dans la liste des réglages", () => {
    const up = withSettingsLaneShifted(ordered, GOALS, "swimlane:1", -1);
    expect(settingsLaneOrder(up)).toEqual(["swimlane:1", "build", "swimlane:2"]);
    expect(up.blockOrder.filter((id) => id.startsWith("goal:"))).toEqual([
      "goal:g1",
      "goal:g2",
      "goal:g3",
    ]);
    const down = withSettingsLaneShifted(ordered, GOALS, "build", 1);
    expect(settingsLaneOrder(down)).toEqual(["swimlane:1", "build", "swimlane:2"]);
  });

  it("un objectif masqué garde sa place dans l'ordre enregistré", () => {
    const hidden = withGoalHidden(ordered, "g2", true);
    const moved = withSettingsLaneMoved(hidden, GOALS, "swimlane:2", "build");
    expect(moved.blockOrder).toEqual([
      "goal:g1",
      "swimlane:2",
      "build",
      "goal:g2",
      "swimlane:1",
      "goal:g3",
    ]);
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
    expect(all.collapsedBlockIds).toEqual(["build", "goal:g1", "goal:g2", "goal:g3", "swimlane:1"]);
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
    expect(GOAL_COLOR_NAMES).not.toContain("Vert");
    expect(GOAL_COLOR_NAMES).not.toContain("Sarcelle");
    expect(GOAL_COLOR_NAMES).toEqual(expect.arrayContaining(["Bleu ardoise", "Rose", "Ambre"]));
  });
});
