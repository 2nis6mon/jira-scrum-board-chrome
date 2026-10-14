import { describe, expect, it } from "vitest";
import {
  type CardColorRule,
  moveColorRule,
  nextRuleColor,
  SCOPE_CHANGE_RULE,
} from "../../src/core/cardColors";

const rule = (id: string, jql: string, color = "red", enabled = true): CardColorRule => ({
  id,
  name: id,
  jql,
  color,
  enabled,
  kind: null,
});

describe("édition des règles", () => {
  it("glisser une règle change sa priorité ; la règle intégrée cachée en Kanban garde son rang", () => {
    const rules = [rule("a", "x"), SCOPE_CHANGE_RULE, rule("b", "y"), rule("c", "z")];
    const ids = (list: readonly CardColorRule[]) => list.map((item) => item.id);
    const builtin = SCOPE_CHANGE_RULE.id;
    expect(ids(moveColorRule(rules, "c", "a"))).toEqual(["c", "a", builtin, "b"]);
    expect(ids(moveColorRule(rules, "a", null))).toEqual([builtin, "b", "c", "a"]);
    // Kanban : la règle intégrée n'est pas montrée ; « en fin de liste » reste avant elle si elle
    // était dernière, et elle ne bouge pas quand on glisse les autres.
    const kanban = (item: CardColorRule) => item.kind === null;
    expect(ids(moveColorRule(rules, "b", "a", kanban))).toEqual(["b", "a", builtin, "c"]);
    const last = [rule("a", "x"), rule("b", "y"), SCOPE_CHANGE_RULE];
    expect(ids(moveColorRule(last, "a", null, kanban))).toEqual(["b", "a", builtin]);
    expect(moveColorRule(rules, "inconnue", "a")).toEqual(rules);
  });

  it("une nouvelle règle prend la première couleur libre", () => {
    expect(nextRuleColor([])).toBe("blue");
    expect(nextRuleColor([rule("a", "x", "blue"), rule("b", "y", "teal")])).toBe("green");
  });
});
