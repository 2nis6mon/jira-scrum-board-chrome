import { describe, expect, it } from "vitest";
import {
  customFieldChoices,
  parseLabels,
  type SettingResult,
  sameCardFields,
  searchFields,
  shiftCardField,
  withAgingThreshold,
  withBlockedLabels,
  withBugType,
  withBuildLabel,
  withCardField,
  withColumnHidden,
  withColumnName,
  withDefaultBlockOrder,
  withIssueTypeCategory,
  withWipLimit,
} from "../../src/core/boardSettings";
import type { CardField } from "../../src/core/cardFields";
import type { JiraField } from "../../src/jira/client";
import { makeConfiguration } from "../support/jiraFixtures";

const config = makeConfiguration();
const [first] = config.scrumColumns;
if (!first) throw new Error("colonne attendue");

describe("section Board : chaque réglage s'applique seul", () => {
  const ok = (result: SettingResult) => {
    if (!result.ok) throw new Error(result.error);
    return result.configuration;
  };

  it("renomme une colonne (espaces retirés) sans toucher au reste de la configuration", () => {
    const current = { ...config, goalColorIndex: { g1: 4 } };
    const renamed = ok(withColumnName(current, "scrum", first.id, "  À prendre  "));
    expect(renamed.scrumColumns[0]?.name).toBe("À prendre");
    expect(renamed.scrumColumns.slice(1)).toEqual(config.scrumColumns.slice(1));
    // La colonne RUN de même identifiant n'est pas touchée.
    expect(renamed.runColumns).toEqual(config.runColumns);
    expect(renamed.goalColorIndex).toEqual({ g1: 4 });
  });

  it("un nom vide est refusé", () => {
    expect(withColumnName(config, "scrum", first.id, "  ")).toEqual({
      ok: false,
      error: "Chaque colonne doit garder un nom.",
    });
  });

  it("masquer une colonne", () => {
    const hidden = withColumnHidden(config, "scrum", first.id, true);
    expect(hidden.scrumColumns[0]?.hidden).toBe(true);
    expect(hidden.runColumns).toEqual(config.runColumns);
  });

  it("limite WIP : entier de 1 à 999 ; vide la retire ; le reste est refusé", () => {
    expect(ok(withWipLimit(config, "scrum", first.id, " 4 ")).scrumColumns[0]?.wipLimit).toBe(4);
    const limited = ok(withWipLimit(config, "scrum", first.id, "4"));
    expect(ok(withWipLimit(limited, "scrum", first.id, "")).scrumColumns[0]?.wipLimit).toBeNull();
    for (const raw of ["-2", "0", "1000", "2.5", "abc"]) {
      expect(withWipLimit(config, "scrum", first.id, raw)).toEqual({
        ok: false,
        error: `La limite WIP de « ${first.name} » doit être un entier entre 1 et 999, ou vide.`,
      });
    }
  });

  it("une colonne disparue entre-temps (structure relue) laisse la configuration intacte", () => {
    expect(ok(withColumnName(config, "scrum", "disparue", "X"))).toEqual(config);
    expect(ok(withWipLimit(config, "scrum", "disparue", "3"))).toEqual(config);
  });

  it("types : classement et bug", () => {
    const [type] = config.issueTypes;
    if (!type) throw new Error("type attendu");
    expect(withIssueTypeCategory(config, type.id, "IGNORED").issueTypes[0]?.category).toBe(
      "IGNORED",
    );
    expect(withBugType(config, type.id, true).issueTypes[0]?.countsAsBug).toBe(true);
  });

  it("nom de Build (vide : le nom par défaut), seuil vieillissant, labels de blocage", () => {
    expect(withBuildLabel(config, "  Sprint Backlog ").buildSectionLabel).toBe("Sprint Backlog");
    expect(withBuildLabel(config, "   ").buildSectionLabel).toBe("Build");
    expect(ok(withAgingThreshold(config, " 5 ")).agingThresholdDays).toBe(5);
    for (const raw of ["", "0", "366", "trois", "2.5"]) {
      expect(withAgingThreshold(config, raw)).toEqual({
        ok: false,
        error: "Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.",
      });
    }
    expect(withBlockedLabels(config, "bloqué, Impediment, , impediment").blockedLabels).toEqual([
      "bloqué",
      "Impediment",
    ]);
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
