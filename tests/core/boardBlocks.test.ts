import { describe, expect, it } from "vitest";
import {
  type BoardBlock,
  BUILD_BLOCK,
  blockIdentifier,
  displayedBlocks,
  goalBlock,
  moveBlock,
  parseBlockIdentifier,
  resolveBlocks,
  shiftBlock,
  swimlaneBlock,
} from "../../src/core/boardBlocks";
import { displayedGoalId, isBlockCollapsed, isGoalHidden } from "../../src/core/boardConfiguration";
import { resolveDrop } from "../../src/core/dropPlan";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { makeConfiguration } from "../support/jiraFixtures";

const goals = (ids: string[]) =>
  ids.map((id, position) => makeSprintGoal({ id, title: id, position }));
const ids = (blocks: BoardBlock[]) => blocks.map(blockIdentifier);

function resolve(
  goalIds: string[],
  storedOrder: string[],
  includeBuild = true,
  swimlaneIds: string[] = ["1"],
) {
  return ids(resolveBlocks({ goals: goals(goalIds), storedOrder, includeBuild, swimlaneIds }));
}

const RUN_BLOCK = swimlaneBlock("1");

// BoardBlockLayoutTests
describe("resolveBlocks", () => {
  it("l'identifiant d'un bloc fait l'aller-retour", () => {
    for (const block of [goalBlock("g-1"), BUILD_BLOCK, RUN_BLOCK]) {
      expect(parseBlockIdentifier(blockIdentifier(block))).toEqual(block);
    }
    expect(parseBlockIdentifier("inconnu")).toBeNull();
    expect(parseBlockIdentifier("goal:a:b")).toEqual(goalBlock("a:b"));
  });

  it("plusieurs swimlanes par type : en bas, dans leur ordre de création, ou là où on les a mises", () => {
    expect(resolve(["a"], [], true, ["1", "2"])).toEqual([
      "goal:a",
      "build",
      "swimlane:1",
      "swimlane:2",
    ]);
    expect(resolve(["a"], ["swimlane:2", "goal:a"], true, ["1", "2"])).toEqual([
      "swimlane:2",
      "goal:a",
      "build",
      "swimlane:1",
    ]);
    expect(resolve(["a"], ["swimlane:9", "goal:a"], true, ["1"])).toEqual([
      "goal:a",
      "build",
      "swimlane:1",
    ]);
  });

  it("ordre par défaut : objectifs, puis Build, puis les swimlanes par type", () => {
    expect(resolve(["a", "b"], [])).toEqual(["goal:a", "goal:b", "build", "swimlane:1"]);
  });

  it("respecte l'ordre enregistré des objectifs", () => {
    expect(resolve(["a", "b"], ["goal:b", "goal:a"])).toEqual([
      "goal:b",
      "goal:a",
      "build",
      "swimlane:1",
    ]);
  });

  it("Build et les swimlanes par type se placent où on les a mis", () => {
    expect(resolve(["a", "b"], ["swimlane:1", "goal:b", "build", "goal:a"])).toEqual([
      "swimlane:1",
      "goal:b",
      "build",
      "goal:a",
    ]);
  });

  it("un nouvel objectif rejoint le dernier objectif, même si Build est premier", () => {
    expect(resolve(["a", "b", "c"], ["build", "goal:a", "swimlane:1", "goal:b"])).toEqual([
      "build",
      "goal:a",
      "swimlane:1",
      "goal:b",
      "goal:c",
    ]);
  });

  it("un nouvel objectif va en premier quand aucun objectif n'est placé", () => {
    expect(resolve(["a"], ["swimlane:1", "build"])).toEqual(["goal:a", "swimlane:1", "build"]);
  });

  it("Build et les swimlanes par type absents de l'ordre vont en bas", () => {
    expect(resolve(["a", "b"], ["goal:b", "goal:a"])).toEqual([
      "goal:b",
      "goal:a",
      "build",
      "swimlane:1",
    ]);
  });

  it("Une swimlane par type masquée est écartée même s'il est placé", () => {
    expect(resolve(["a"], ["swimlane:1", "build", "goal:a"], true, [])).toEqual([
      "build",
      "goal:a",
    ]);
  });

  it("un nouvel objectif rejoint les autres objectifs, pas la fin", () => {
    expect(resolve(["a", "b", "c"], ["goal:a", "goal:b", "build", "swimlane:1"])).toEqual([
      "goal:a",
      "goal:b",
      "goal:c",
      "build",
      "swimlane:1",
    ]);
  });

  it("un objectif supprimé disparaît de l'ordre", () => {
    expect(resolve(["a"], ["goal:a", "goal:supprimé", "build"], true, [])).toEqual([
      "goal:a",
      "build",
    ]);
  });

  it("les doublons de l'ordre enregistré sont réduits", () => {
    expect(resolve(["a"], ["goal:a", "goal:a", "build", "build"], true, [])).toEqual([
      "goal:a",
      "build",
    ]);
  });

  it("ni Build ni swimlane par type quand ils sont exclus", () => {
    expect(resolve(["a"], ["swimlane:1", "goal:a"], false, [])).toEqual(["goal:a"]);
  });

  it("les nouveaux objectifs suivent leur position", () => {
    const unordered = [
      makeSprintGoal({ id: "b", title: "b", position: 1 }),
      makeSprintGoal({ id: "a", title: "a", position: 0 }),
    ];
    expect(
      ids(
        resolveBlocks({
          goals: unordered,
          storedOrder: [],
          includeBuild: false,
          swimlaneIds: [],
        }),
      ),
    ).toEqual(["goal:a", "goal:b"]);
  });
});

describe("déplacement d'un bloc", () => {
  it("moveBlock place un bloc avant un autre, ou en dernier", () => {
    expect(moveBlock("c", "a", ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(moveBlock("a", null, ["a", "b", "c"])).toEqual(["b", "c", "a"]);
    expect(moveBlock("a", "a", ["a", "b"])).toEqual(["a", "b"]);
    expect(moveBlock("z", "a", ["a", "b"])).toEqual(["a", "b"]);
  });

  it("shiftBlock reste dans la liste", () => {
    expect(shiftBlock("b", -1, ["a", "b", "c"])).toEqual(["b", "a", "c"]);
    expect(shiftBlock("b", 1, ["a", "b", "c"])).toEqual(["a", "c", "b"]);
    expect(shiftBlock("a", -1, ["a", "b"])).toEqual(["a", "b"]);
    expect(shiftBlock("b", 1, ["a", "b"])).toEqual(["a", "b"]);
    expect(shiftBlock("z", 1, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("ne modifie jamais la liste reçue", () => {
    const order = Object.freeze(["a", "b", "c"]);
    expect(() => moveBlock("c", "a", order)).not.toThrow();
    expect(() => shiftBlock("a", 1, order)).not.toThrow();
  });
});

// DisplayedBlocksTests
describe("displayedBlocks", () => {
  const blocks = [goalBlock("g1"), goalBlock("g2"), BUILD_BLOCK, RUN_BLOCK];
  const displayed = (
    filtersActive: boolean,
    total: Record<string, number>,
    filtered: Record<string, number> = total,
    showEmptyBuild = false,
  ) =>
    ids(
      displayedBlocks({
        blocks,
        filtersActive,
        filteredCount: (block) => filtered[blockIdentifier(block)] ?? 0,
        totalCount: (block) => total[blockIdentifier(block)] ?? 0,
        showEmptyBuild,
      }),
    );

  it("sans filtre, seuls les objectifs vides restent visibles", () => {
    expect(displayed(false, { "goal:g1": 3 })).toEqual(["goal:g1", "goal:g2"]);
  });

  it("un filtre actif garde les objectifs réellement vides, mais masque les blocs non retenus", () => {
    expect(
      displayed(
        true,
        { "goal:g1": 3, "goal:g2": 1, build: 1, "swimlane:1": 2 },
        { "goal:g2": 1, "swimlane:1": 2 },
      ),
    ).toEqual(["goal:g2", "swimlane:1"]);
  });

  it("un filtre qui ne retient rien garde les objectifs réellement vides", () => {
    expect(displayed(true, {})).toEqual(["goal:g1", "goal:g2"]);
  });

  it("Build n'apparaît vide que provisoirement pendant un glisser-déposer", () => {
    expect(displayed(false, {}, {}, true)).toEqual(["goal:g1", "goal:g2", "build"]);
  });

  it("les swimlanes avec tickets restent visibles sans filtre", () => {
    expect(displayed(false, { build: 1, "swimlane:1": 2 })).toEqual(ids(blocks));
  });
});

// HiddenGoalIssuesTests + CollapsedBlocksTests
describe("objectif masqué, bloc replié", () => {
  it("les tickets d'un objectif masqué retombent dans Build", () => {
    const config = makeConfiguration({ hiddenGoalIds: ["g1"] });
    expect(isGoalHidden(config, "g1")).toBe(true);
    expect(isGoalHidden(config, "g2")).toBe(false);
    expect(displayedGoalId(config, "g1")).toBeNull();
    expect(displayedGoalId(config, "g2")).toBe("g2");
    expect(displayedGoalId(config, null)).toBeNull();
  });

  it("rien de masqué : chaque objectif reste à sa place", () => {
    expect(displayedGoalId(makeConfiguration(), "g1")).toBe("g1");
  });

  it("redéposer dans Build le ticket d'un objectif masqué ne le détache pas dans Jira", () => {
    const config = makeConfiguration({ hiddenGoalIds: ["g1"] });
    const plan = resolveDrop({
      currentGoalId: displayedGoalId(config, "g1"),
      currentColumnId: "c1",
      targetColumnId: "c2",
      goalTarget: { kind: "build" },
    });
    expect(plan.goalChange).toEqual({ kind: "none" });
    expect(plan.changesColumn).toBe(true);
  });

  it("le déposer dans un objectif visible le rattache bien", () => {
    const config = makeConfiguration({ hiddenGoalIds: ["g1"] });
    const plan = resolveDrop({
      currentGoalId: displayedGoalId(config, "g1"),
      currentColumnId: "c1",
      targetColumnId: "c1",
      goalTarget: { kind: "goal", goalId: "g2" },
    });
    expect(plan.goalChange).toEqual({ kind: "assign", goalId: "g2" });
  });

  it("l'état replié est propre à chaque bloc", () => {
    expect(isBlockCollapsed(makeConfiguration(), BUILD_BLOCK)).toBe(false);
    const config = makeConfiguration({ collapsedBlockIds: ["goal:g1", "swimlane:1"] });
    expect(isBlockCollapsed(config, goalBlock("g1"))).toBe(true);
    expect(isBlockCollapsed(config, RUN_BLOCK)).toBe(true);
    expect(isBlockCollapsed(config, goalBlock("g2"))).toBe(false);
  });
});
