import { describe, expect, it } from "vitest";
import * as sprintGoals from "../../src/core/sprintGoals";
import {
  assignGoalColors,
  decodeSprintGoalDocument,
  encodeSprintGoalDocument,
  goalColorName,
  jqlReference,
  makeSprintGoal,
  makeSprintGoalDocument,
  parseSprintGoalText,
  reconcileSprintGoals,
} from "../../src/core/sprintGoals";

const goal = (id: string, title: string, position: number) =>
  makeSprintGoal({ id, title, position });

let counter = 0;
const newId = () => `nouveau-${++counter}`;

// SprintGoalTextTests
describe("parseSprintGoalText", () => {
  it("une ligne par objectif", () => {
    expect(parseSprintGoalText("Finaliser le paiement\nAméliorer la stabilité")).toEqual([
      "Finaliser le paiement",
      "Améliorer la stabilité",
    ]);
  });

  it("retire les préfixes décoratifs que les équipes utilisent vraiment", () => {
    expect(parseSprintGoalText("🎯 Finaliser le paiement\n- Stabilité\n2) Release")).toEqual([
      "Finaliser le paiement",
      "Stabilité",
      "Release",
    ]);
    expect(parseSprintGoalText("• - 1. Cumulés\r\n— Tiret long")).toEqual([
      "Cumulés",
      "Tiret long",
    ]);
  });

  it("ignore les lignes vides", () => {
    expect(parseSprintGoalText(null)).toEqual([]);
    expect(parseSprintGoalText(undefined)).toEqual([]);
    expect(parseSprintGoalText("   \n\n  ")).toEqual([]);
    expect(parseSprintGoalText("A\n\n\nB")).toEqual(["A", "B"]);
  });

  it("reconnaît aussi les séparateurs de ligne Unicode", () => {
    const lineSeparator = String.fromCharCode(0x2028);
    const paragraphSeparator = String.fromCharCode(0x2029);
    const text = ["A", "B", `C${paragraphSeparator}D`].join(lineSeparator);
    expect(parseSprintGoalText(text)).toEqual(["A", "B", "C", "D"]);
  });

  it("un paragraphe unique est un seul objectif", () => {
    expect(parseSprintGoalText("Livrer la refonte du tunnel")).toEqual([
      "Livrer la refonte du tunnel",
    ]);
  });

  it("n'offre aucune fonction qui recomposerait le champ du sprint", () => {
    // Le champ « Sprint Goal » appartient à Jira ; aucun encodeur ne le recompose.
    expect(Object.keys(sprintGoals).filter((name) => /render|compose|format/i.test(name))).toEqual(
      [],
    );
  });
});

// SprintGoalReconcilerTests
describe("reconcileSprintGoals", () => {
  it("identités et liens conservés quand rien n'a changé", () => {
    const document = makeSprintGoalDocument({
      goals: [goal("g1", "Paiement", 0)],
      links: { "ABC-1": "g1" },
    });
    const result = reconcileSprintGoals("Paiement", document, newId);

    expect(result.goals.map((g) => g.id)).toEqual(["g1"]);
    expect(result.links).toEqual({ "ABC-1": "g1" });
    expect(result.propertyNeedsUpdate).toBe(false);
  });

  it("adopte un objectif ajouté directement dans Jira", () => {
    const document = makeSprintGoalDocument({ goals: [goal("g1", "Paiement", 0)] });
    const result = reconcileSprintGoals("Paiement\nStabilité", document, newId);

    expect(result.goals.map((g) => g.title)).toEqual(["Paiement", "Stabilité"]);
    expect(result.goals[0]?.id).toBe("g1");
    expect(result.goals[1]?.id).toMatch(/^nouveau-/);
    expect(result.propertyNeedsUpdate).toBe(true);
  });

  it("abandonne un objectif retiré dans Jira, avec ses liens", () => {
    const document = makeSprintGoalDocument({
      goals: [goal("g1", "Paiement", 0), goal("g2", "Stabilité", 1)],
      links: { "ABC-1": "g1", "ABC-2": "g2" },
    });
    const result = reconcileSprintGoals("Paiement", document, newId);

    expect(result.goals.map((g) => g.id)).toEqual(["g1"]);
    expect(result.links).toEqual({ "ABC-1": "g1" });
    expect(result.propertyNeedsUpdate).toBe(true);
  });

  it("Jira l'emporte quand le texte du sprint est vidé", () => {
    const document = makeSprintGoalDocument({
      goals: [goal("g1", "Paiement", 0)],
      links: { "ABC-1": "g1" },
    });
    const result = reconcileSprintGoals("", document, newId);

    expect(result.goals).toEqual([]);
    expect(result.links).toEqual({});
    expect(result.propertyNeedsUpdate).toBe(true);
  });

  it("reflète un réordonnancement fait dans Jira", () => {
    const document = makeSprintGoalDocument({ goals: [goal("g1", "A", 0), goal("g2", "B", 1)] });
    const result = reconcileSprintGoals("B\nA", document, newId);

    expect(result.goals.map((g) => g.id)).toEqual(["g2", "g1"]);
    expect(result.goals.map((g) => g.position)).toEqual([0, 1]);
    expect(result.propertyNeedsUpdate).toBe(true);
  });

  it("fonctionne sans aucun document enregistré", () => {
    const result = reconcileSprintGoals("Paiement\nStabilité", null, newId);
    expect(result.goals.map((g) => g.title)).toEqual(["Paiement", "Stabilité"]);
    expect(new Set(result.goals.map((g) => g.color)).size).toBe(2);
    expect(new Set(result.goals.map((g) => g.id)).size).toBe(2);
    expect(result.propertyNeedsUpdate).toBe(true);
  });

  it("sans texte ni document : rien à mettre à jour", () => {
    expect(reconcileSprintGoals(null, null, newId)).toEqual({
      goals: [],
      links: {},
      propertyNeedsUpdate: false,
    });
  });

  it("deux lignes identiques gardent deux identités distinctes", () => {
    const document = makeSprintGoalDocument({ goals: [goal("g1", "Doublon", 0)] });
    const result = reconcileSprintGoals("Doublon\nDoublon", document, newId);
    expect(result.goals[0]?.id).toBe("g1");
    expect(result.goals[1]?.id).not.toBe("g1");
  });
});

// Format Jira persisté
describe("SprintGoalDocument", () => {
  it("survit à un aller-retour encodage / décodage", () => {
    const document = makeSprintGoalDocument({
      goals: [goal("g1", "Paiement", 0)],
      links: { "ABC-1": "g1" },
      updatedAt: "2026-09-17T09:42:00Z",
      updatedBy: "acct-1",
    });
    expect(decodeSprintGoalDocument(encodeSprintGoalDocument(document))).toEqual(document);
  });

  it("lit un document écrit avant la prise en charge des Goals", () => {
    const document = decodeSprintGoalDocument({
      version: 1,
      goals: [{ id: "g1", title: "Paiement", color: "indigo", position: 0 }],
      links: { "ABC-1": "g1" },
      updatedAt: "2026-09-17T09:00:00Z",
    });
    expect(document.goals).toHaveLength(1);
    expect(document.goals[0]?.color).toBe("indigo");
    expect(document.links).toEqual({ "ABC-1": "g1" });
    expect(document.atlassianGoalIds).toEqual([]);
  });

  it("conserve la sélection de Goals Atlassian", () => {
    const document = makeSprintGoalDocument({ atlassianGoalIds: ["ari-1", "ari-2"] });
    const decoded = decodeSprintGoalDocument(encodeSprintGoalDocument(document));
    expect(decoded.atlassianGoalIds).toEqual(["ari-1", "ari-2"]);
  });

  it("conserve les clés JSON persistées et omet les champs vides", () => {
    const encoded = encodeSprintGoalDocument(
      makeSprintGoalDocument({
        goals: [
          makeSprintGoal({
            id: "g1",
            title: "P",
            position: 0,
            atlassianGoalId: "ari:cloud:goal::goal/1",
            atlassianUrl: "https://home.atlassian.com/goal/1",
          }),
        ],
      }),
    );
    expect(Object.keys(encoded)).toEqual(["version", "goals", "links", "atlassianGoalIds"]);
    expect((encoded.goals as Record<string, unknown>[])[0]).toEqual({
      id: "g1",
      title: "P",
      color: "goal1",
      position: 0,
      atlassianGoalId: "ari:cloud:goal::goal/1",
      atlassianURL: "https://home.atlassian.com/goal/1",
    });
  });

  it("tolère une valeur illisible", () => {
    expect(decodeSprintGoalDocument("n'importe quoi")).toEqual(makeSprintGoalDocument());
    expect(decodeSprintGoalDocument({ goals: [{ id: 3 }, null], links: { "ABC-1": 9 } })).toEqual(
      makeSprintGoalDocument(),
    );
  });

  it("jqlReference préfère la clé à l'identifiant", () => {
    const base = { id: "x", title: "P", position: 0, atlassianGoalId: "ari:cloud:goal::goal/1" };
    expect(jqlReference(makeSprintGoal({ ...base, atlassianKey: "ACME-1" }))).toBe("ACME-1");
    expect(jqlReference(makeSprintGoal(base))).toBe("ari:cloud:goal::goal/1");
    expect(jqlReference(goal("g", "Texte", 0))).toBeNull();
  });
});

// GoalColorAssignmentTests
describe("assignGoalColors", () => {
  it("les nouveaux objectifs prennent les couleurs dans l'ordre d'apparition", () => {
    expect(assignGoalColors(["a", "b", "c"], {})).toEqual({ a: 0, b: 1, c: 2 });
  });

  it("un objectif connu garde sa couleur d'un sprint à l'autre", () => {
    const sprint1 = assignGoalColors(["a", "b"], {});
    const sprint2 = assignGoalColors(["b", "c"], sprint1);
    expect(sprint2.b).toBe(1);
    expect(sprint2.c).toBe(0);
    expect(sprint2.a).toBe(0);
  });

  it("une couleur choisie n'est jamais écrasée", () => {
    expect(assignGoalColors(["a"], { a: 5 }).a).toBe(5);
  });

  it("les couleurs recommencent quand les neuf sont prises", () => {
    const ids = Array.from({ length: 11 }, (_, i) => `g${i + 1}`);
    const colors = assignGoalColors(ids, {});
    expect(new Set(ids.slice(0, 9).map((id) => colors[id]))).toEqual(
      new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]),
    );
    expect(colors.g10).toBe(0);
    expect(colors.g11).toBe(1);
  });

  it("les noms de couleur sont stables", () => {
    expect(goalColorName(0)).toBe("goal1");
    expect(goalColorName(7)).toBe("goal8");
    expect(goalColorName(8)).toBe("goal9");
    expect(goalColorName(9)).toBe("goal1");
    expect(goalColorName(-3)).toBe("goal1");
  });
});
