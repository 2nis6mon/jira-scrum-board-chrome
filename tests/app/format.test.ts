import { describe, expect, it } from "vitest";
import { goalStatusLabel, initials, plural, toggled } from "../../src/app/views/format";

describe("affichage", () => {
  it("statut d'un Goal : libellé connu traduit, code inconnu montré tel quel", () => {
    expect(goalStatusLabel("on_track")).toBe("En bonne voie");
    expect(goalStatusLabel("AT_RISK")).toBe("À risque");
    expect(goalStatusLabel("off track")).toBe("En retard");
    expect(goalStatusLabel("statut_maison")).toBe("statut_maison");
  });

  it("pluriel, initiales, bascule d'un ensemble", () => {
    expect(plural(1, "ticket")).toBe("1 ticket");
    expect(plural(3, "ticket")).toBe("3 tickets");
    expect(initials("  camille   durand petit ")).toBe("CD");
    expect([...toggled(new Set(["a"]), "a")]).toEqual([]);
    expect([...toggled(new Set(["a"]), "b")]).toEqual(["a", "b"]);
  });
});
