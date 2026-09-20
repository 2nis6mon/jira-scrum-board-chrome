import { describe, expect, it } from "vitest";
import { decodeTransition } from "../../src/jira/models";
import {
  choices,
  fieldKind,
  initialValue,
  plainDocument,
  TransitionInputError,
  transitionInput,
} from "../../src/jira/transitionFields";
import { statusJson } from "../support/jiraFixtures";

const transition = (fields: unknown) =>
  decodeTransition({
    id: "21",
    name: "Terminer",
    hasScreen: true,
    to: statusJson("6", "Terminé"),
    fields,
  });
const text = { name: "Texte", required: false, operations: ["set"], schema: { type: "string" } };
const resolution = {
  name: "Résolution",
  required: true,
  operations: ["set"],
  schema: { type: "resolution" },
  allowedValues: [
    { id: "1", name: "Résolu" },
    { id: "2", name: "Annulé" },
  ],
};

describe("formulaires de transition", () => {
  it("décode et propose les valeurs autorisées sans inventer de champ", () => {
    const t = transition({ resolution });
    const field = t.fields.resolution;
    if (!field) throw new Error("champ absent");
    expect(fieldKind("resolution", field)).toBe("select");
    expect(choices(field)).toEqual([
      { label: "Résolu", value: '{"id":"1"}' },
      { label: "Annulé", value: '{"id":"2"}' },
    ]);
    expect(initialValue("resolution", field, { resolution: { id: "2", name: "Annulé" } })).toBe(
      '{"id":"2"}',
    );
    expect(transitionInput(t, { resolution: '{"id":"1"}' }, {})).toEqual({
      fields: { resolution: { id: "1" } },
    });
  });
  it("préserve les champs non modifiés et accepte une valeur existante ou par défaut", () => {
    const t = transition({ summary: { ...text, required: true }, resolution });
    expect(transitionInput(t, {}, { summary: "Résumé existant", resolution: { id: "1" } })).toEqual(
      { fields: {} },
    );
    expect(
      transitionInput(transition({ resolution: { ...resolution, hasDefaultValue: true } }), {}, {}),
    ).toEqual({ fields: {} });
    expect(() => transitionInput(t, {}, {})).toThrow(TransitionInputError);
  });
  it("refuse les champs absents et les choix retirés de la transition", () => {
    expect(() =>
      transitionInput(transition({ resolution }), { resolution: '{"id":"99"}' }, {}),
    ).toThrow(TransitionInputError);
    expect(() => transitionInput(transition({}), { summary: "Texte" }, {})).toThrow(
      TransitionInputError,
    );
  });
  it("encode le texte multiligne en ADF et ajoute le commentaire séparément", () => {
    const t = transition({
      description: text,
      comment: { operations: ["add"], schema: { type: "array" } },
    });
    expect(
      transitionInput(t, { description: "Ligne 1\nLigne 2", comment: "Commentaire" }, {}),
    ).toEqual({
      fields: { description: plainDocument("Ligne 1\nLigne 2") },
      comment: "Commentaire",
    });
  });
  it("valide nombres et dates sans envoyer de valeurs non finies", () => {
    const t = transition({
      n: { ...text, schema: { type: "number" } },
      date: { ...text, schema: { type: "date" } },
    });
    expect(transitionInput(t, { n: "0", date: "2026-09-20" }, {})).toEqual({
      fields: { n: 0, date: "2026-09-20" },
    });
    expect(() => transitionInput(t, { n: "Infinity", date: "2026-02-31" }, {})).toThrow(
      TransitionInputError,
    );
  });
  it("gère les sélections multiples et les labels", () => {
    const t = transition({
      components: { ...resolution, required: false, schema: { type: "array", items: "component" } },
      labels: { ...text, schema: { type: "array", items: "string" } },
    });
    expect(
      transitionInput(t, { components: ['{"id":"1"}', '{"id":"2"}'], labels: "mobile\nweb" }, {}),
    ).toEqual({ fields: { components: [{ id: "1" }, { id: "2" }], labels: ["mobile", "web"] } });
  });
  it("refuse les widgets inconnus et les champs hors périmètre même s’ils sont exposés", () => {
    const t = transition({
      customfield_1: {
        ...text,
        required: true,
        schema: { type: "string", custom: "plugin:widget" },
      },
      sprint: text,
    });
    const field = t.fields.customfield_1;
    if (!field) throw new Error("champ absent");
    expect(fieldKind("customfield_1", field)).toBe("unsupported");
    expect(() => transitionInput(t, {}, {})).toThrow(TransitionInputError);
    expect(() => transitionInput(t, { sprint: "42" }, { customfield_1: "déjà saisi" })).toThrow(
      TransitionInputError,
    );
    expect(transitionInput(t, {}, { customfield_1: "déjà saisi" })).toEqual({ fields: {} });
  });
  it("effacer explicitement un champ facultatif diffère de le laisser inchangé", () => {
    const t = transition({ summary: text });
    expect(transitionInput(t, {}, { summary: "Résumé" })).toEqual({ fields: {} });
    expect(transitionInput(t, { summary: "" }, { summary: "Résumé" })).toEqual({
      fields: { summary: null },
    });
  });
});

it("préremplit le texte simple ADF sans aplatir un document riche", () => {
  const field = transition({ description: text }).fields.description;
  if (!field) throw new Error("champ absent");
  expect(
    initialValue("description", field, {
      description: plainDocument("Première ligne\nDeuxième ligne"),
    }),
  ).toBe("Première ligne\nDeuxième ligne");
  expect(
    initialValue("description", field, {
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Gras", marks: [{ type: "strong" }] }],
          },
        ],
      },
    }),
  ).toBe("");
});
