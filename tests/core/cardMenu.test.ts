import { describe, expect, it } from "vitest";
import { BUILD_BLOCK, swimlaneBlock } from "../../src/core/boardBlocks";
import { assembleBoardIssues, type BoardSnapshot, findIssue } from "../../src/core/boardIssue";
import { withSwimlaneHidden } from "../../src/core/boardSettings";
import { defaultBlock, goalTargets } from "../../src/core/cardMenu";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import type { JiraIssue } from "../../src/jira/models";
import { makeConfiguration, makeIssue, makeSprint } from "../support/jiraFixtures";

// Cibles du menu d'une carte, sans DOM ni Jira. Données FICTIVES.

const config = makeConfiguration();
const GOALS = [
  makeSprintGoal({ id: "g1", title: "Paiement", position: 0 }),
  makeSprintGoal({ id: "g2", title: "Stabilité", position: 1 }),
  makeSprintGoal({ id: "g3", title: "Recherche", position: 2 }),
];

function snapshot(
  scrum: JiraIssue[],
  run: JiraIssue[] = [],
  links: Record<string, string> = {},
  goals = GOALS,
  runLinks: Record<string, string> = {},
): BoardSnapshot {
  const assemble = (issues: JiraIssue[], l: Record<string, string>) =>
    assembleBoardIssues({ issues, configuration: config, columns: config.columns, links: l });
  return {
    sprint: null,
    activeSprints: [],
    goals,
    goalsOrigin: "sprintText",
    goalIssues: assemble(scrum, links),
    swimlaneIssues: assemble(run, runLinks),
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
    pinnedGoalIds: [],
    localPinnedGoalIds: null,
  };
}

const board = snapshot(
  [makeIssue("ABC-1", { statusId: "3" }), makeIssue("ABC-2", { statusId: "3" })],
  [makeIssue("RUN-1", { statusId: "3", typeId: "10004" })],
  { "ABC-1": "g1" },
);
const issue = (key: string, from = board) => {
  const found = findIssue(from, key);
  if (!found) throw new Error(`${key} introuvable`);
  return found;
};
const ids = (targets: ReturnType<typeof goalTargets>) => targets.goals.map((goal) => goal.id);

describe("goalTargets", () => {
  it("ticket sous un objectif : les autres objectifs, puis « Retirer du goal »", () => {
    const targets = goalTargets(board, config, issue("ABC-1"));
    expect(ids(targets)).toEqual(["g2", "g3"]);
    expect(targets.canDetach).toBe(true);
  });

  it("ticket sans objectif : tous les objectifs, sans retrait", () => {
    const targets = goalTargets(board, config, issue("ABC-2"));
    expect(ids(targets)).toEqual(["g1", "g2", "g3"]);
    expect(targets.canDetach).toBe(false);
  });

  it("dans l'ordre des swimlanes enregistré, pas dans celui de Jira", () => {
    const ordered = { ...config, blockOrder: ["goal:g3", "build", "goal:g1", "goal:g2"] };
    expect(ids(goalTargets(board, ordered, issue("ABC-2")))).toEqual(["g3", "g1", "g2"]);
  });

  it("objectif masqué : jamais proposé ; le ticket qui y est rattaché n'a pas de retrait", () => {
    const hidden = { ...config, hiddenGoalIds: ["g1", "g3"] };
    const targets = goalTargets(board, hidden, issue("ABC-1"));
    expect(ids(targets)).toEqual(["g2"]);
    expect(targets.canDetach).toBe(false);
  });

  it("swimlane du type masquée : pas de retrait vers une destination cachée", () => {
    const linked = snapshot(
      [],
      [makeIssue("RUN-1", { statusId: "3", typeId: "10004" })],
      {},
      GOALS,
      { "RUN-1": "g1" },
    );
    const run = issue("RUN-1", linked);
    expect(run.swimlaneId).toBe("1");
    expect(goalTargets(linked, config, run).canDetach).toBe(true);
    const hidden = withSwimlaneHidden(config, "1", true);
    const targets = goalTargets(linked, hidden, run);
    expect(targets.canDetach).toBe(false);
    expect(ids(targets)).toEqual(["g2", "g3"]);
  });

  it("board sans objectif, ticket sans objectif : rien à proposer", () => {
    const empty = snapshot([makeIssue("ABC-2", { statusId: "3" })], [], {}, []);
    expect(goalTargets(empty, config, issue("ABC-2", empty))).toEqual({
      goals: [],
      canDetach: false,
    });
  });

  it("plusieurs sprints réunis : chaque objectif préfixé de son sprint, comme sa swimlane", () => {
    const S42 = { ...makeSprint(null), id: 42, name: "Sprint 42", originBoardId: 1 };
    const S43 = { ...makeSprint(null), id: 43, name: "Sprint 43", originBoardId: 1 };
    const multi: BoardSnapshot = {
      ...board,
      activeSprints: [S42, S43],
      goalSprintIds: [42, 43],
      goalSprintOf: { g1: 42, g2: 43, g3: 43 },
    };
    expect(goalTargets(multi, config, issue("ABC-1", multi)).goals).toEqual([
      { id: "g2", title: "Stabilité", sprintName: "Sprint 43" },
      { id: "g3", title: "Recherche", sprintName: "Sprint 43" },
    ]);
    expect(goalTargets(board, config, issue("ABC-1")).goals[0]?.sprintName).toBeNull();
  });
});

describe("defaultBlock", () => {
  it("Build pour un ticket par objectif, la swimlane de son type sinon", () => {
    expect(defaultBlock(issue("ABC-2"))).toEqual(BUILD_BLOCK);
    expect(defaultBlock(issue("RUN-1"))).toEqual(swimlaneBlock("1"));
  });
});
