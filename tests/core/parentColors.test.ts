import { describe, expect, it } from "vitest";
import type { BoardIssue } from "../../src/core/boardIssue";
import {
  compareIssueKeys,
  PARENT_HUES,
  parentColor,
  parentColors,
} from "../../src/core/parentColors";
import { makeIssue } from "../support/jiraFixtures";

// Seul le parent du ticket compte : le reste d'un BoardIssue n'est pas lu.
const withParent = (key: string, parent?: string) =>
  ({ issue: makeIssue(key, parent === undefined ? {} : { parent }) }) as BoardIssue;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

describe("couleur des parents", () => {
  it("les tickets d'un même parent partagent sa couleur, deux parents n'ont pas la même", () => {
    const colors = parentColors([
      withParent("ABC-1", "ABC-90"),
      withParent("ABC-2", "ABC-12"),
      withParent("ABC-3", "ABC-90"),
      withParent("ABC-4"),
    ]);

    expect([...colors.keys()]).toEqual(["ABC-12", "ABC-90"]);
    expect(colors.get("ABC-12")).toEqual({ hue: PARENT_HUES[0], tone: "light" });
    expect(colors.get("ABC-90")).toEqual({ hue: PARENT_HUES[1], tone: "light" });
  });

  it("aucune couleur en double, même au-delà de la première série", () => {
    const issues = Array.from({ length: 150 }, (_, index) =>
      withParent(`T-${index}`, `EPIC-${index + 1}`),
    );
    const colors = [...parentColors(issues).values()];

    expect(colors).toHaveLength(150);
    const distinct = new Set(colors.map((color) => `${color.hue}/${color.tone}`));
    expect(distinct.size).toBe(150);
    expect(colors.slice(0, PARENT_HUES.length).every((color) => color.tone === "light")).toBe(true);
    expect(colors.slice(PARENT_HUES.length).every((color) => color.tone === "deep")).toBe(true);
    for (const color of colors) {
      expect(Number.isInteger(color.hue)).toBe(true);
      expect(color.hue).toBeGreaterThanOrEqual(0);
      expect(color.hue).toBeLessThan(360);
    }
  });

  it("la première série n'a que des teintes distinctes, loin du rouge de « Bloqué »", () => {
    expect(new Set(PARENT_HUES).size).toBe(PARENT_HUES.length);
    for (const hue of PARENT_HUES) expect(hue > 15 && hue < 345).toBe(true);
  });

  it("un nouveau parent, de numéro plus grand, ne change pas la couleur des autres", () => {
    const before = parentColors([withParent("ABC-1", "ABC-9"), withParent("ABC-2", "ABC-40")]);
    const after = parentColors([
      withParent("ABC-1", "ABC-9"),
      withParent("ABC-2", "ABC-40"),
      withParent("ABC-3", "ABC-100"),
    ]);

    expect(same(after.get("ABC-9"), before.get("ABC-9"))).toBe(true);
    expect(same(after.get("ABC-40"), before.get("ABC-40"))).toBe(true);
    expect(same(after.get("ABC-100"), parentColor(2))).toBe(true);
  });

  it("l'ordre des tickets ne change rien", () => {
    const issues = [withParent("A-1", "P-3"), withParent("A-2", "P-1"), withParent("A-3", "Q-2")];
    const reversed = [...issues].reverse();

    expect([...parentColors(reversed)]).toEqual([...parentColors(issues)]);
  });

  it("les clés se classent par projet puis par numéro", () => {
    const keys = ["ABC-10", "ABC-9", "AB-100", "ZED-1", "ABC-9", "sans-numero"];

    expect([...keys].sort(compareIssueKeys)).toEqual([
      "AB-100",
      "ABC-9",
      "ABC-9",
      "ABC-10",
      "ZED-1",
      "sans-numero",
    ]);
  });
});
