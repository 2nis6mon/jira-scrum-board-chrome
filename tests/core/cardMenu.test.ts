import { describe, expect, it } from "vitest";
import { BUILD_BLOCK, swimlaneBlock } from "../../src/core/boardBlocks";
import { assembleBoardIssues, type BoardSnapshot, findIssue } from "../../src/core/boardIssue";
import { withSwimlaneHidden } from "../../src/core/boardSettings";
import { defaultBlock, edgeRank, goalTargets } from "../../src/core/cardMenu";
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

describe("edgeRank", () => {
  // Champ de rang déclaré par le board ; les rangs sont FICTIFS, comparés comme chaînes (LexoRank).
  const RANK_FIELD = "customfield_10019";
  const ranked = makeConfiguration({ rankFieldId: RANK_FIELD });
  const S42 = { ...makeSprint(null), id: 42, name: "Sprint 42", originBoardId: 1 };
  const S43 = { ...makeSprint(null), id: 43, name: "Sprint 43", originBoardId: 1 };

  /** Ticket fictif : clé, rang (`null` : champ non rendu), colonne, options en plus. */
  type Spec = {
    key: string;
    rank: string | null;
    statusId?: string;
    sprint?: typeof S42;
    subtaskOf?: string;
  };
  function rankedBoard(specs: Spec[], links: Record<string, string> = {}, cfg = ranked) {
    const issues = specs.flatMap((spec) => {
      const extraFields: Record<string, unknown> = {};
      if (spec.rank !== null) extraFields[RANK_FIELD] = spec.rank;
      if (spec.subtaskOf) {
        extraFields.issuetype = { id: "10003", name: "Sub-task", subtask: true };
        extraFields.parent = { key: spec.subtaskOf, fields: { summary: "Parent" } };
      }
      return assembleBoardIssues({
        issues: [makeIssue(spec.key, { statusId: spec.statusId ?? "1", extraFields })],
        configuration: cfg,
        columns: cfg.columns,
        links,
        sprint: spec.sprint ?? S42,
      });
    });
    const result: BoardSnapshot = {
      sprint: S42,
      activeSprints: [S42, S43],
      goals: GOALS,
      goalsOrigin: "sprintText",
      goalIssues: issues,
      swimlaneIssues: [],
      // Ordre de lecture : les sprints l'un après l'autre, comme la synchronisation.
      issueOrder: specs.map((spec) => spec.key),
      syncedAt: new Date(0),
      currentUser: null,
      goalsReadOnly: false,
      pinnedGoalIds: [],
      localPinnedGoalIds: null,
    };
    return result;
  }
  const inG1 = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, "g1"]));
  const abc = rankedBoard(
    [
      { key: "C", rank: "0|c" },
      { key: "A", rank: "0|a" },
      { key: "B", rank: "0|b" },
    ],
    inG1(["A", "B", "C"]),
  );

  it("top : avant le premier ticket de la swimlane, dans l'ordre de rang Jira", () => {
    expect(edgeRank(abc, ranked, issue("C", abc), "top")).toEqual({
      kind: "rank",
      change: { kind: "before", issueKey: "A" },
    });
  });

  it("basse : après le dernier", () => {
    expect(edgeRank(abc, ranked, issue("A", abc), "bottom")).toEqual({
      kind: "rank",
      change: { kind: "after", issueKey: "C" },
    });
  });

  it("déjà premier : top désactivé, basse active ; déjà dernier : l'inverse", () => {
    expect(edgeRank(abc, ranked, issue("A", abc), "top")).toEqual({
      kind: "blocked",
      reason: "first",
    });
    expect(edgeRank(abc, ranked, issue("A", abc), "bottom").kind).toBe("rank");
    expect(edgeRank(abc, ranked, issue("C", abc), "bottom")).toEqual({
      kind: "blocked",
      reason: "last",
    });
  });

  it("seul ticket de sa swimlane : les deux actions désactivées", () => {
    const alone = rankedBoard(
      [
        { key: "A", rank: "0|a" },
        { key: "Z", rank: "0|0" },
      ],
      inG1(["A"]),
    );
    expect(edgeRank(alone, ranked, issue("A", alone), "top")).toEqual({
      kind: "blocked",
      reason: "first",
    });
    expect(edgeRank(alone, ranked, issue("A", alone), "bottom")).toEqual({
      kind: "blocked",
      reason: "last",
    });
  });

  it("compartiments LexoRank mêlés (rééquilibrage) : traités comme un rang manquant", () => {
    // Un seul sprint : l'ordre de lecture fait foi, pas la comparaison de chaînes.
    const one = rankedBoard(
      [
        { key: "B", rank: "1|b" },
        { key: "A", rank: "0|a" },
      ],
      inG1(["A", "B"]),
    );
    expect(edgeRank(one, ranked, issue("A", one), "top")).toEqual({
      kind: "rank",
      change: { kind: "before", issueKey: "B" },
    });
    // Deux sprints : ordre inconnu.
    const two = rankedBoard(
      [
        { key: "B", rank: "1|b", sprint: S42 },
        { key: "A", rank: "0|a", sprint: S43 },
      ],
      inG1(["A", "B"]),
    );
    expect(edgeRank(two, ranked, issue("A", two), "top")).toEqual({
      kind: "blocked",
      reason: "unknownRank",
    });
  });

  it("sous-tâche seule de son parent dans la swimlane : « subtaskAlone »", () => {
    const lone = rankedBoard(
      [
        { key: "P", rank: "0|0" },
        { key: "Q", rank: "0|1" },
        { key: "S1", rank: "0|5", subtaskOf: "P" },
        { key: "T1", rank: "0|6", subtaskOf: "Q" },
      ],
      inG1(["P", "Q", "S1", "T1"]),
    );
    for (const edge of ["top", "bottom"] as const) {
      expect(edgeRank(lone, ranked, issue("S1", lone), edge)).toEqual({
        kind: "blocked",
        reason: "subtaskAlone",
      });
    }
  });

  it("deux sprints : rang global, pas l'ordre des sprints à la suite", () => {
    const two = rankedBoard(
      [
        { key: "A", rank: "0|m", sprint: S42 },
        { key: "D", rank: "0|b", sprint: S43 },
      ],
      inG1(["A", "D"]),
    );
    expect(edgeRank(two, ranked, issue("A", two), "top")).toEqual({
      kind: "rank",
      change: { kind: "before", issueKey: "D" },
    });
  });

  it("toutes colonnes : la référence peut être dans une autre colonne", () => {
    const columns = rankedBoard(
      [
        { key: "A", rank: "0|a", statusId: "6" },
        { key: "C", rank: "0|c", statusId: "1" },
      ],
      inG1(["A", "C"]),
    );
    expect(edgeRank(columns, ranked, issue("C", columns), "top")).toEqual({
      kind: "rank",
      change: { kind: "before", issueKey: "A" },
    });
  });

  it("autres swimlanes ignorées : un ticket de Build ne sert pas de référence", () => {
    const lanes = rankedBoard(
      [
        { key: "X", rank: "0|0" },
        { key: "A", rank: "0|a" },
        { key: "C", rank: "0|c" },
      ],
      inG1(["A", "C"]),
    );
    expect(edgeRank(lanes, ranked, issue("C", lanes), "top")).toEqual({
      kind: "rank",
      change: { kind: "before", issueKey: "A" },
    });
  });

  it("rang inconnu sur deux sprints : « Ordre de rang Jira indisponible »", () => {
    const unknown = makeConfiguration({ rankFieldId: null });
    const two = rankedBoard(
      [
        { key: "A", rank: "0|a", sprint: S42 },
        { key: "D", rank: "0|b", sprint: S43 },
      ],
      inG1(["A", "D"]),
      unknown,
    );
    for (const edge of ["top", "bottom"] as const) {
      expect(edgeRank(two, unknown, issue("A", two), edge)).toEqual({
        kind: "blocked",
        reason: "unknownRank",
      });
    }
  });

  it("rang inconnu dans un seul sprint : l'ordre de lecture fait foi", () => {
    const one = rankedBoard(
      [
        { key: "B", rank: null },
        { key: "A", rank: "0|a" },
      ],
      inG1(["A", "B"]),
    );
    expect(edgeRank(one, ranked, issue("A", one), "top")).toEqual({
      kind: "rank",
      change: { kind: "before", issueKey: "B" },
    });
  });

  it("sous-tâche : classée parmi les sous-tâches du même parent seulement", () => {
    const subtasks = rankedBoard(
      [
        { key: "P", rank: "0|0" },
        { key: "Q", rank: "0|1" },
        { key: "S1", rank: "0|5", subtaskOf: "P" },
        { key: "T1", rank: "0|2", subtaskOf: "Q" },
        { key: "S2", rank: "0|7", subtaskOf: "P" },
      ],
      inG1(["P", "Q", "S1", "T1", "S2"]),
    );
    expect(edgeRank(subtasks, ranked, issue("S2", subtasks), "top")).toEqual({
      kind: "rank",
      change: { kind: "before", issueKey: "S1" },
    });
    // Un autre ticket ne se compare pas aux sous-tâches.
    expect(edgeRank(subtasks, ranked, issue("P", subtasks), "bottom")).toEqual({
      kind: "rank",
      change: { kind: "after", issueKey: "Q" },
    });
  });
});
