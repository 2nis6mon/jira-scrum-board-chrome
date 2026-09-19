import { describe, expect, it } from "vitest";
import { decodeTransition, type JiraTransition } from "../../src/jira/models";
import { resolveTransition } from "../../src/jira/transitionPlanner";
import { statusJson } from "../support/jiraFixtures";

// TransitionPlannerTests.swift

function transition(
  id: string,
  name: string,
  to: { id: string; name: string },
  options: { requiredField?: string; available?: boolean } = {},
): JiraTransition {
  return decodeTransition({
    id,
    name,
    isAvailable: options.available ?? true,
    hasScreen: false,
    to: statusJson(to.id, to.name),
    fields: options.requiredField
      ? {
          [options.requiredField]: {
            required: true,
            name: options.requiredField,
            hasDefaultValue: false,
          },
        }
      : null,
  });
}

const REVIEW = { id: "4", name: "Review" };
const TEST = { id: "5", name: "Test" };
const DONE = { id: "6", name: "Done" };

describe("resolveTransition", () => {
  it("retient la transition directe", () => {
    const result = resolveTransition("3", ["5"], [transition("21", "Passer en test", TEST)]);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.transition.id).toBe("21");
    expect(result.targetStatus.id).toBe("5");
  });

  it("n'écrit rien si le ticket est déjà dans la colonne cible", () => {
    expect(resolveTransition("5", ["5", "6"], []).kind).toBe("alreadyInTargetColumn");
  });

  it("plusieurs destinations : aucun choix arbitraire", () => {
    const result = resolveTransition(
      "3",
      ["5", "4"],
      [transition("11", "Review", REVIEW), transition("21", "Test", TEST)],
    );
    expect(result.kind === "choose" && result.available.map((t) => t.to.id)).toEqual(["4", "5"]);
  });

  it("signale les champs obligatoires au lieu de les inventer", () => {
    const result = resolveTransition(
      "3",
      ["6"],
      [transition("31", "Terminer", DONE, { requiredField: "resolution" })],
    );
    expect(result.kind).toBe("requiresFields");
    expect(result.kind === "requiresFields" && result.fields).toEqual(["resolution"]);
  });

  it("plusieurs transitions vers le même statut : demander même si une seule est sans formulaire", () => {
    const result = resolveTransition(
      "3",
      ["6"],
      [
        transition("31", "Terminer (écran)", DONE, { requiredField: "resolution" }),
        transition("32", "Terminer", DONE),
      ],
    );
    expect(result.kind === "choose" && result.available.map((t) => t.id)).toEqual(["31", "32"]);
  });

  it("déplacement impossible : ne propose pas une autre destination", () => {
    const result = resolveTransition("3", ["9"], [transition("11", "Review", REVIEW)]);
    expect(result.kind).toBe("unreachable");
    expect(result.kind === "unreachable" && result.available).toEqual([]);
  });

  it("ignore une transition marquée indisponible", () => {
    const result = resolveTransition(
      "3",
      ["5"],
      [transition("21", "Test", TEST, { available: false })],
    );
    expect(result.kind).toBe("unreachable");
    expect(result.kind === "unreachable" && result.available).toEqual([]);
  });

  it("un champ obligatoire avec valeur par défaut ne bloque pas", () => {
    const withDefault = decodeTransition({
      id: "33",
      name: "Terminer",
      to: statusJson("6", "Done", "done"),
      fields: { resolution: { required: true, name: "Résolution", hasDefaultValue: true } },
    });
    expect(resolveTransition("3", ["6"], [withDefault]).kind).toBe("ready");
  });
});
