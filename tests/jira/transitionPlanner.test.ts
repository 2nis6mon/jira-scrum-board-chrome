import { describe, expect, it } from "vitest";
import { decodeTransition, type JiraTransition } from "../../src/jira/models";
import { defaultTransitions, resolveTransition } from "../../src/jira/transitionPlanner";
import { statusJson } from "../support/jiraFixtures";

// TransitionPlannerTests.swift

function transition(
  id: string,
  name: string,
  to: { id: string; name: string },
  options: { requiredField?: string; available?: boolean; hasScreen?: boolean } = {},
): JiraTransition {
  return decodeTransition({
    id,
    name,
    isAvailable: options.available ?? true,
    hasScreen: options.hasScreen ?? false,
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

describe("defaultTransitions", () => {
  it("garde la première action par statut dans l'ordre Jira, sans tri par identifiant ou nom", () => {
    const first = transition("91", "Z terminer", DONE);
    const second = transition("71", "Z tester", TEST);
    const transitions = [
      first,
      second,
      transition("11", "A terminer", DONE),
      transition("21", "A tester", TEST),
    ];
    expect(defaultTransitions(transitions)).toEqual([first, second]);
    expect(transitions.map((item) => item.id)).toEqual(["91", "71", "11", "21"]);
  });

  it("écarte une action indisponible avant de retenir la première disponible du statut", () => {
    const available = transition("32", "Terminer", DONE);
    expect(
      defaultTransitions([
        transition("31", "Terminer bloqué", DONE, { available: false }),
        available,
        transition("33", "Autre terminaison", DONE),
        transition("21", "Tester bloqué", TEST, { available: false }),
      ]),
    ).toEqual([available]);
  });
});

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
      [
        transition("91", "Review", REVIEW),
        transition("71", "Test", TEST),
        transition("11", "Autre revue", REVIEW),
        transition("21", "Autre test", TEST),
      ],
    );
    expect(result.kind === "choose" && result.available.map((t) => [t.id, t.to.id])).toEqual([
      ["91", "4"],
      ["71", "5"],
    ]);
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

  it("plusieurs actions vers un seul statut atteignable : retient la première sans demander", () => {
    const result = resolveTransition(
      "3",
      ["5", "6"],
      [transition("91", "Z terminer", DONE), transition("11", "A terminer", DONE)],
    );
    expect(result).toMatchObject({ kind: "ready", transition: { id: "91" } });
  });

  it.each([{ hasScreen: true }, { requiredField: "resolution" }])(
    "la première action exige Jira (%j) : ne privilégie pas la suivante sans formulaire",
    (options) => {
      const result = resolveTransition(
        "3",
        ["6"],
        [transition("31", "Terminer (écran)", DONE, options), transition("32", "Terminer", DONE)],
      );
      expect(result).toMatchObject({ kind: "requiresFields", transition: { id: "31" } });
    },
  );

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
