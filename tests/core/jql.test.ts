import { describe, expect, it } from "vitest";
import { inActiveSprints, withoutOrderBy } from "../../src/core/jql";

describe("JQL combiné", () => {
  it("retire la clause ORDER BY, quelle que soit sa casse ou sa ligne", () => {
    expect(withoutOrderBy("assignee = currentUser() ORDER BY rank")).toBe(
      "assignee = currentUser()",
    );
    expect(withoutOrderBy("a = 1\norder   by created DESC")).toBe("a = 1");
    expect(withoutOrderBy("  labels = urgent  ")).toBe("labels = urgent");
  });

  it("un JQL réduit à un tri devient vide", () => {
    expect(withoutOrderBy("ORDER BY rank")).toBe("");
  });

  it("restreint aux sprints actifs, entre parenthèses", () => {
    expect(inActiveSprints("a = 1 OR b = 2", [42, 43])).toBe(
      "(a = 1 OR b = 2) AND sprint in (42,43)",
    );
  });

  it("rien à restreindre : pas de requête", () => {
    expect(inActiveSprints("   ", [42])).toBeNull();
    expect(inActiveSprints("ORDER BY rank", [42])).toBeNull();
    expect(inActiveSprints("a = 1", [])).toBeNull();
  });
});
