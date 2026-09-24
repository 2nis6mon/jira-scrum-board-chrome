import { describe, expect, it } from "vitest";
import {
  type BoardBlock,
  BUILD_BLOCK,
  blockIdentifier,
  displayedBlocks,
  goalBlock,
  KANBAN_BLOCK,
  moveBlock,
  parseBlockIdentifier,
  resolveBlocks,
  shiftBlock,
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
  includeKanban = true,
) {
  return ids(resolveBlocks({ goals: goals(goalIds), storedOrder, includeBuild, includeKanban }));
}

// BoardBlockLayoutTests
describe("resolveBlocks", () => {
  it("l'identifiant d'un bloc fait l'aller-retour", () => {
    for (const block of [goalBlock("g-1"), BUILD_BLOCK, KANBAN_BLOCK]) {
      expect(parseBlockIdentifier(blockIdentifier(block))).toEqual(block);
    }
    expect(parseBlockIdentifier("inconnu")).toBeNull();
    expect(parseBlockIdentifier("goal:a:b")).toEqual(goalBlock("a:b"));
  });

  it("ordre par défaut : objectifs, puis Build, puis Kanban", () => {
    expect(resolve(["a", "b"], [])).toEqual(["goal:a", "goal:b", "build", "kanban"]);
  });

  it("respecte l'ordre enregistré des objectifs", () => {
    expect(resolve(["a", "b"], ["goal:b", "goal:a"])).toEqual([
      "goal:b",
      "goal:a",
      "build",
      "kanban",
    ]);
  });

  it("Build et Kanban se placent où on les a mis", () => {
    expect(resolve(["a", "b"], ["kanban", "goal:b", "build", "goal:a"])).toEqual([
      "kanban",
      "goal:b",
      "build",
      "goal:a",
    ]);
  });

  it("un nouvel objectif rejoint le dernier objectif, même si Build est premier", () => {
    expect(resolve(["a", "b", "c"], ["build", "goal:a", "kanban", "goal:b"])).toEqual([
      "build",
      "goal:a",
      "kanban",
      "goal:b",
      "goal:c",
    ]);
  });

  it("un nouvel objectif va en premier quand aucun objectif n'est placé", () => {
    expect(resolve(["a"], ["kanban", "build"])).toEqual(["goal:a", "kanban", "build"]);
  });

  it("Build et Kanban absents de l'ordre vont en bas", () => {
    expect(resolve(["a", "b"], ["goal:b", "goal:a"])).toEqual([
      "goal:b",
      "goal:a",
      "build",
      "kanban",
    ]);
  });

  it("Kanban désactivé est écarté même s'il est placé", () => {
    expect(resolve(["a"], ["kanban", "build", "goal:a"], true, false)).toEqual(["build", "goal:a"]);
  });

  it("un nouvel objectif rejoint les autres objectifs, pas la fin", () => {
    expect(resolve(["a", "b", "c"], ["goal:a", "goal:b", "build", "kanban"])).toEqual([
      "goal:a",
      "goal:b",
      "goal:c",
      "build",
      "kanban",
    ]);
  });

  it("un objectif supprimé disparaît de l'ordre", () => {
    expect(resolve(["a"], ["goal:a", "goal:supprimé", "build"], true, false)).toEqual([
      "goal:a",
      "build",
    ]);
  });

  it("les doublons de l'ordre enregistré sont réduits", () => {
    expect(resolve(["a"], ["goal:a", "goal:a", "build", "build"], true, false)).toEqual([
      "goal:a",
      "build",
    ]);
  });

  it("ni Build ni Kanban quand ils sont exclus", () => {
    expect(resolve(["a"], ["kanban", "goal:a"], false, false)).toEqual(["goal:a"]);
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
          includeKanban: false,
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
  const blocks = [goalBlock("g1"), goalBlock("g2"), BUILD_BLOCK, KANBAN_BLOCK];
  const displayed = (
    filtersActive: boolean,
    counts: Record<string, number>,
    sprintHasKanban = true,
  ) =>
    ids(
      displayedBlocks({
        blocks,
        filtersActive,
        filteredCount: (block) => counts[blockIdentifier(block)] ?? 0,
        sprintHasKanbanIssues: sprintHasKanban,
      }),
    );

  it("sans filtre, les swimlanes vides restent visibles", () => {
    expect(displayed(false, { "goal:g1": 3 })).toEqual(ids(blocks));
  });

  it("un filtre actif masque les swimlanes vides", () => {
    expect(displayed(true, { "goal:g2": 1, kanban: 2 })).toEqual(["goal:g2", "kanban"]);
  });

  it("un filtre qui ne retient rien masque tout", () => {
    expect(displayed(true, {})).toEqual([]);
  });

  it("le bloc Kanban exige des tickets Kanban dans le sprint, même sans filtre", () => {
    expect(displayed(false, {}, false)).toEqual(["goal:g1", "goal:g2", "build"]);
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
    const config = makeConfiguration({ collapsedBlockIds: ["goal:g1", "kanban"] });
    expect(isBlockCollapsed(config, goalBlock("g1"))).toBe(true);
    expect(isBlockCollapsed(config, KANBAN_BLOCK)).toBe(true);
    expect(isBlockCollapsed(config, goalBlock("g2"))).toBe(false);
  });
});
