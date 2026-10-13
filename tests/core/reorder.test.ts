import { describe, expect, it } from "vitest";
import { moveAmongShown, sameOrder, shiftTarget } from "../../src/core/reorder";

// Réordonnancement des listes des réglages : une partie seulement des éléments est montrée.

const ORDER = ["goal:a", "build", "goal:b", "swimlane:1", "goal:c", "swimlane:2"];
const shown = (id: string) => !id.startsWith("goal:");

describe("déplacer parmi les éléments montrés", () => {
  it("place l'élément juste avant la cible, sans changer le rang relatif des autres", () => {
    expect(moveAmongShown(ORDER, "swimlane:2", "build", shown)).toEqual([
      "goal:a",
      "swimlane:2",
      "build",
      "goal:b",
      "swimlane:1",
      "goal:c",
    ]);
  });

  it("en fin de liste : juste après le dernier élément montré, avant ce qui le suit", () => {
    const order = ["build", "swimlane:1", "goal:a", "swimlane:2", "goal:b"];
    expect(moveAmongShown(order, "build", null, shown)).toEqual([
      "swimlane:1",
      "goal:a",
      "swimlane:2",
      "build",
      "goal:b",
    ]);
    expect(moveAmongShown(["build", "swimlane:1"], "build", null, shown)).toEqual([
      "swimlane:1",
      "build",
    ]);
  });

  it("déposé sur lui-même, ou élément inconnu : même ordre", () => {
    expect(moveAmongShown(ORDER, "build", "build", shown)).toEqual(ORDER);
    expect(moveAmongShown(ORDER, "inconnu", "build", shown)).toEqual(ORDER);
    expect(sameOrder(moveAmongShown(ORDER, "build", "goal:b", shown), ORDER)).toBe(true);
  });
});

describe("monter ou descendre d'un cran au clavier", () => {
  const list = ["build", "swimlane:1", "swimlane:2"];

  it("monter : avant le précédent ; descendre : avant celui d'après le suivant", () => {
    expect(shiftTarget(list, "swimlane:2", -1)).toBe("swimlane:1");
    expect(shiftTarget(list, "build", 1)).toBe("swimlane:2");
    expect(shiftTarget(list, "swimlane:1", 1)).toBeNull();
  });

  it("déjà en tête ou en fin, ou inconnu : rien à faire", () => {
    expect(shiftTarget(list, "build", -1)).toBeUndefined();
    expect(shiftTarget(list, "swimlane:2", 1)).toBeUndefined();
    expect(shiftTarget(list, "inconnu", 1)).toBeUndefined();
  });

  it("compare deux ordres", () => {
    expect(sameOrder(list, [...list])).toBe(true);
    expect(sameOrder(list, ["swimlane:1", "build", "swimlane:2"])).toBe(false);
    expect(sameOrder(list, list.slice(1))).toBe(false);
  });
});
