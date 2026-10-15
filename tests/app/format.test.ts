import { afterEach, describe, expect, it } from "vitest";
import {
  formatDay,
  formatPoints,
  formatTime,
  goalStatusLabel,
  initials,
  plural,
  toggled,
} from "../../src/app/views/format";
import { setLanguage } from "../../src/i18n";

afterEach(() => setLanguage("fr"));

describe("affichage", () => {
  it("statut d'un Goal : libellé connu traduit, code inconnu montré tel quel", () => {
    expect(goalStatusLabel("on_track")).toBe("En bonne voie");
    expect(goalStatusLabel("AT_RISK")).toBe("À risque");
    expect(goalStatusLabel("off track")).toBe("En retard");
    expect(goalStatusLabel("statut_maison")).toBe("statut_maison");
  });

  it("pluriel, initiales, bascule d'un ensemble", () => {
    expect(plural(0, "ticket")).toBe("0 ticket");
    expect(plural(1, "ticket")).toBe("1 ticket");
    expect(plural(3, "ticket")).toBe("3 tickets");
    expect(initials("  camille   durand petit ")).toBe("CD");
    expect([...toggled(new Set(["a"]), "a")]).toEqual([]);
    expect([...toggled(new Set(["a"]), "b")]).toEqual(["a", "b"]);
  });

  it("anglais : zéro au pluriel, formats locaux et statuts connus, codes inconnus préservés", () => {
    setLanguage("en");
    expect(plural(0, "ticket")).toBe("0 issues");
    expect(plural(1, "ticket")).toBe("1 issue");
    expect(plural(2, "ticket")).toBe("2 issues");
    expect(plural(2, "sous-tâche encore ouverte", "sous-tâches encore ouvertes")).toBe(
      "2 subtasks still open",
    );
    expect(goalStatusLabel("on_track")).toBe("On track");
    expect(goalStatusLabel("En bonne voie")).toBe("En bonne voie");
    expect(formatPoints(1.5)).toBe("1.5");
    const date = new Date(2026, 9, 15, 9, 16);
    expect(formatDay(date)).toBe(
      new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date),
    );
    expect(formatTime(date)).toBe("09:16");
    setLanguage("fr");
    expect(formatPoints(1.5)).toBe("1,5");
    expect(goalStatusLabel("on_track")).toBe("En bonne voie");
  });
});
