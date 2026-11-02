import { describe, expect, it } from "vitest";
import { columnStates, tallyByState } from "../../src/core/columnState";
import { column } from "../support/jiraFixtures";

// Données FICTIVES. Seule règle d'état du board et du planning (story 8.20) : les colonnes.

const THREE = [
  column("todo", "À faire", ["1"], 0),
  column("review", "Recette", ["3", "4"], 1),
  column("qa", "Validation", ["5"], 2),
  column("done", "Terminé", ["6"], 3),
];

describe("état d'un ticket par les colonnes du board", () => {
  it("première colonne à faire, colonnes du milieu en cours, dernière terminé", () => {
    const states = columnStates(THREE);
    expect(["1", "3", "4", "5", "6"].map((id) => states.ofStatus(id))).toEqual([
      "todo",
      "inProgress",
      "inProgress",
      "inProgress",
      "done",
    ]);
    expect(["todo", "review", "qa", "done"].map((id) => states.ofColumn(id))).toEqual([
      "todo",
      "inProgress",
      "inProgress",
      "done",
    ]);
    expect(states.doneStatusIds).toEqual(["6"]);
  });

  it("un statut sans colonne visible, ou une colonne inconnue, n'a pas d'état", () => {
    const states = columnStates(THREE);
    expect(states.ofStatus("99")).toBeNull();
    expect(states.ofStatus(null)).toBeNull();
    expect(states.ofStatus(undefined)).toBeNull();
    expect(states.ofColumn("autre")).toBeNull();
    expect(states.ofColumn(null)).toBeNull();
  });

  it("une colonne sans statut est ignorée : la dernière colonne visible termine", () => {
    const states = columnStates([
      column("todo", "À faire", ["1"], 0),
      column("done", "Terminé", ["6"], 1),
      { ...column("empty", "Archivé", [], 2), hidden: true },
    ]);
    expect(states.ofStatus("6")).toBe("done");
    expect(states.ofColumn("empty")).toBeNull();
    expect(states.doneStatusIds).toEqual(["6"]);
  });

  it("l'ordre vient de la position, pas de la liste", () => {
    const states = columnStates([
      column("done", "Terminé", ["6"], 2),
      column("todo", "À faire", ["1"], 0),
      column("prog", "En cours", ["3"], 1),
    ]);
    expect(states.ofStatus("1")).toBe("todo");
    expect(states.ofStatus("6")).toBe("done");
  });

  it("deux colonnes : pas d'en cours ; une seule : tout est terminé ; aucune : rien", () => {
    const two = columnStates([column("a", "A", ["1"], 0), column("b", "B", ["6"], 1)]);
    expect([two.ofStatus("1"), two.ofStatus("6")]).toEqual(["todo", "done"]);
    const one = columnStates([column("a", "A", ["1", "6"], 0)]);
    expect([one.ofStatus("1"), one.ofStatus("6")]).toEqual(["done", "done"]);
    const none = columnStates([]);
    expect(none.ofStatus("1")).toBeNull();
    expect(none.doneStatusIds).toEqual([]);
  });
});

describe("répartition par état", () => {
  it("tickets et points par état ; un élément sans état n'est pas compté", () => {
    const states = columnStates(THREE);
    const items = [
      { status: "1", points: 2 },
      { status: "3", points: null },
      { status: "5", points: 3 },
      { status: "6", points: 5 },
      { status: "99", points: 8 },
    ];
    expect(
      tallyByState(
        items,
        (item) => states.ofStatus(item.status),
        (item) => item.points,
      ),
    ).toEqual({
      todo: { count: 1, points: 2 },
      inProgress: { count: 2, points: 3 },
      done: { count: 1, points: 5 },
    });
  });
});
