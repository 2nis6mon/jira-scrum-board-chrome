import { describe, expect, it } from "vitest";
import {
  applyBoardSection,
  boardSectionDraft,
  customFieldChoices,
  isBoardSectionChanged,
  parseLabels,
  sameCardFields,
  searchFields,
  shiftCardField,
  wipKey,
  withCardField,
  withDefaultBlockOrder,
} from "../../src/core/boardSettings";
import type { CardField } from "../../src/core/cardFields";
import type { JiraField } from "../../src/jira/client";
import { makeConfiguration } from "../support/jiraFixtures";

const config = makeConfiguration();
const [first] = config.scrumColumns;
if (!first) throw new Error("colonne attendue");

describe("section Board : brouillon", () => {
  it("un brouillon non modifié s'applique à l'identique", () => {
    const draft = boardSectionDraft(config);
    expect(isBoardSectionChanged(config, draft)).toBe(false);
    const result = applyBoardSection(config, draft);
    expect(result.ok && result.configuration).toEqual(config);
  });

  it("renomme, masque, limite le WIP, et garde le reste de la configuration", () => {
    const draft = boardSectionDraft({ ...config, goalColorIndex: { g1: 4 } });
    const edited = {
      ...draft,
      scrumColumns: draft.scrumColumns.map((column, index) =>
        index === 0 ? { ...column, name: "  À prendre  ", hidden: true } : column,
      ),
      wipLimits: { ...draft.wipLimits, [wipKey(first, "scrum")]: " 4 " },
    };
    expect(isBoardSectionChanged(config, edited)).toBe(true);
    const result = applyBoardSection({ ...config, goalColorIndex: { g1: 4 } }, edited);
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.configuration.scrumColumns[0]).toMatchObject({
      name: "À prendre",
      hidden: true,
      wipLimit: 4,
    });
    // La colonne RUN de même identifiant n'est pas touchée par la limite Scrum.
    expect(result.configuration.runColumns[0]?.wipLimit).toBe(config.runColumns[0]?.wipLimit);
    expect(result.configuration.goalColorIndex).toEqual({ g1: 4 });
  });

  it("une limite WIP vide retire la limite", () => {
    const withLimit = {
      ...config,
      scrumColumns: config.scrumColumns.map((column) => ({ ...column, wipLimit: 3 })),
    };
    const draft = boardSectionDraft(withLimit);
    const result = applyBoardSection(withLimit, {
      ...draft,
      wipLimits: { ...draft.wipLimits, [wipKey(first, "scrum")]: "" },
    });
    expect(result.ok && result.configuration.scrumColumns[0]?.wipLimit).toBeNull();
  });

  it("affichage : RUN, nom de Build, seuil, rafraîchissement, labels de blocage", () => {
    const result = applyBoardSection(config, {
      ...boardSectionDraft(config),
      showRunSection: false,
      buildSectionLabel: "   ",
      agingThresholdDays: "5",
      autoRefreshSeconds: 120,
      blockedLabels: "bloqué, Impediment, , impediment",
    });
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.configuration).toMatchObject({
      showRunSection: false,
      buildSectionLabel: "Build",
      agingThresholdDays: 5,
      autoRefreshSeconds: 120,
      blockedLabels: ["bloqué", "Impediment"],
    });
  });

  it("saisies invalides : rien n'est appliqué, chaque erreur est dite", () => {
    const draft = boardSectionDraft(config);
    const result = applyBoardSection(config, {
      ...draft,
      agingThresholdDays: "trois",
      scrumColumns: draft.scrumColumns.map((column, index) =>
        index === 0 ? { ...column, name: " " } : column,
      ),
      wipLimits: { ...draft.wipLimits, [wipKey(first, "scrum")]: "-2" },
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([
      "Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.",
      `La limite WIP de « ${first.name} » doit être un entier entre 1 et 999, ou vide.`,
      "Chaque colonne doit garder un nom.",
    ]);
  });

  it("structure relue dans Jira depuis l'ouverture du brouillon : il est refusé", () => {
    const draft = boardSectionDraft(config);
    const relue = { ...config, scrumColumns: config.scrumColumns.slice(1) };
    const result = applyBoardSection(relue, draft);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toContain("relus dans Jira");
  });

  it("labels : sans vide ni doublon, casse d'origine gardée", () => {
    expect(parseLabels(" A, b ,a,, B ")).toEqual(["A", "b"]);
    expect(parseLabels("")).toEqual([]);
  });

  it("réinitialiser l'ordre des swimlanes", () => {
    expect(withDefaultBlockOrder({ ...config, blockOrder: ["build"] }).blockOrder).toEqual([]);
  });
});

describe("champs des cartes", () => {
  const field = (id: string, name: string): JiraField => ({
    id,
    name,
    schemaType: null,
    schemaCustom: null,
  });

  it("seuls les champs personnalisés sont proposés, triés par nom", () => {
    expect(
      customFieldChoices([
        field("summary", "Résumé"),
        field("customfield_2", "Équipe"),
        field("customfield_1", "Client"),
      ]).map((f) => f.id),
    ).toEqual(["customfield_1", "customfield_2"]);
  });

  it("recherche par nom sans accents ni casse, ou par identifiant ; rien sans saisie", () => {
    const fields = [field("customfield_10100", "Équipe"), field("customfield_2", "Client")];
    expect(searchFields("equipe", fields).map((f) => f.id)).toEqual(["customfield_10100"]);
    expect(searchFields("10100", fields).map((f) => f.id)).toEqual(["customfield_10100"]);
    expect(searchFields("  ", fields)).toEqual([]);
  });

  it("trois champs au plus, sans doublon ; monter et descendre restent dans la liste", () => {
    const labels: CardField = { kind: "labels" };
    const versions: CardField = { kind: "fixVersions" };
    const team: CardField = {
      kind: "custom",
      customFieldId: "customfield_1",
      customFieldName: "X",
    };
    let fields = withCardField([], labels);
    fields = withCardField(fields, labels);
    fields = withCardField(fields, versions);
    fields = withCardField(fields, team);
    fields = withCardField(fields, { kind: "components" });
    expect(fields.map((f) => f.kind)).toEqual(["labels", "fixVersions", "custom"]);

    expect(shiftCardField(fields, 2, -1).map((f) => f.kind)).toEqual([
      "labels",
      "custom",
      "fixVersions",
    ]);
    expect(shiftCardField(fields, 0, -1)).toEqual(fields);
    expect(sameCardFields(fields, [...fields])).toBe(true);
    expect(sameCardFields(fields, shiftCardField(fields, 0, 1))).toBe(false);
  });
});
