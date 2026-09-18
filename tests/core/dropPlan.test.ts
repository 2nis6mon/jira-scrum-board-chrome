import { describe, expect, it } from "vitest";
import { isNoOpDrop, planRank, resolveDrop } from "../../src/core/dropPlan";

// BoardDropPlanTests
describe("resolveDrop", () => {
  it("autre objectif, même colonne : seul le rattachement change", () => {
    const plan = resolveDrop({
      currentGoalId: null,
      currentColumnId: "c1",
      targetColumnId: "c1",
      goalTarget: { kind: "goal", goalId: "g1" },
    });
    expect(plan.goalChange).toEqual({ kind: "assign", goalId: "g1" });
    expect(plan.changesColumn).toBe(false);
  });

  it("autre objectif, autre colonne : les deux", () => {
    const plan = resolveDrop({
      currentGoalId: "g1",
      currentColumnId: "c1",
      targetColumnId: "c2",
      goalTarget: { kind: "goal", goalId: "g2" },
    });
    expect(plan.goalChange).toEqual({ kind: "assign", goalId: "g2" });
    expect(plan.changesColumn).toBe(true);
  });

  it("déposer dans Build détache l'objectif", () => {
    const plan = resolveDrop({
      currentGoalId: "g1",
      currentColumnId: "c1",
      targetColumnId: "c1",
      goalTarget: { kind: "build" },
    });
    expect(plan.goalChange).toEqual({ kind: "assign", goalId: null });
  });

  it("déposer dans Build un ticket sans objectif n'écrit rien", () => {
    const plan = resolveDrop({
      currentGoalId: null,
      currentColumnId: "c1",
      targetColumnId: "c1",
      goalTarget: { kind: "build" },
    });
    expect(isNoOpDrop(plan)).toBe(true);
  });

  it("même objectif : seule la colonne change", () => {
    const plan = resolveDrop({
      currentGoalId: "g1",
      currentColumnId: "c1",
      targetColumnId: "c2",
      goalTarget: { kind: "goal", goalId: "g1" },
    });
    expect(plan.goalChange).toEqual({ kind: "none" });
    expect(plan.changesColumn).toBe(true);
  });

  it("une zone sans notion d'objectif ne touche jamais au rattachement", () => {
    const plan = resolveDrop({
      currentGoalId: "g1",
      currentColumnId: "c1",
      targetColumnId: "c2",
      goalTarget: { kind: "unchanged" },
    });
    expect(plan.goalChange).toEqual({ kind: "none" });
    expect(plan.changesColumn).toBe(true);
  });
});

// RankPlanTests
describe("planRank", () => {
  const column = ["A", "B", "C", "D"];
  const NONE = { kind: "none" };

  it("monter une carte en tête la classe avant la première", () => {
    expect(planRank("C", column, "A")).toEqual({ kind: "before", issueKey: "A" });
  });

  it("envoyer une carte à la fin la classe après la dernière", () => {
    expect(planRank("A", column, null)).toEqual({ kind: "after", issueKey: "D" });
  });

  it("carte déjà dernière : rien à écrire", () => {
    expect(planRank("D", column, null)).toEqual(NONE);
  });

  it("carte déjà juste avant la référence : rien à écrire", () => {
    expect(planRank("B", column, "C")).toEqual(NONE);
  });

  it("déposer une carte sur elle-même : rien à écrire", () => {
    expect(planRank("B", column, "B")).toEqual(NONE);
  });

  it("monter d'un rang est une écriture", () => {
    expect(planRank("C", column, "B")).toEqual({ kind: "before", issueKey: "B" });
  });

  it("une carte venue d'une autre colonne prend la position demandée", () => {
    expect(planRank("X", ["A", "B", "X"], "B")).toEqual({ kind: "before", issueKey: "B" });
    expect(planRank("X", ["A", "B", "X"], null)).toEqual(NONE);
    // Absente de la liste : elle se classe quand même par rapport aux cartes en place.
    expect(planRank("X", ["A", "B"], null)).toEqual({ kind: "after", issueKey: "B" });
  });

  it("colonne vide : rien à écrire", () => {
    expect(planRank("A", ["A"], null)).toEqual(NONE);
    expect(planRank("A", [], null)).toEqual(NONE);
  });

  it("référence inconnue : rien à écrire", () => {
    expect(planRank("A", column, "Z")).toEqual(NONE);
  });
});
