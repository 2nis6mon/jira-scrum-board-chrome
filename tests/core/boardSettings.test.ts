import { describe, expect, it } from "vitest";
import { type BoardConfiguration, swimlaneName } from "../../src/core/boardConfiguration";
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
  withSwimlaneHidden,
  withSwimlaneName,
  withTypeDestination,
  withWipLimit,
} from "../../src/core/boardSettings";
import type { CardField } from "../../src/core/cardFields";
import type { JiraField } from "../../src/jira/client";
import { makeConfiguration, STORY_TYPE, SWIMLANE_TYPE } from "../support/jiraFixtures";

const config = makeConfiguration();
const [first] = config.columns;
if (!first) throw new Error("colonne attendue");

describe("section Board : chaque réglage s'applique seul", () => {
  const ok = (result: SettingResult) => {
    if (!result.ok) throw new Error(result.error);
    return result.configuration;
  };

  it("renomme une colonne (espaces retirés) sans toucher au reste de la configuration", () => {
    const current = { ...config, goalColorIndex: { g1: 4 } };
    const renamed = ok(withColumnName(current, first.id, "  À prendre  "));
    expect(renamed.columns[0]?.name).toBe("À prendre");
    expect(renamed.columns.slice(1)).toEqual(config.columns.slice(1));
    expect(renamed.goalColorIndex).toEqual({ g1: 4 });
  });

  it("un nom vide est refusé", () => {
    expect(withColumnName(config, first.id, "  ")).toEqual({
      ok: false,
      error: "Chaque colonne doit garder un nom.",
    });
  });

  it("masquer une colonne", () => {
    const hidden = withColumnHidden(config, first.id, true);
    expect(hidden.columns[0]?.hidden).toBe(true);
  });

  it("limite WIP : entier de 1 à 999 ; vide la retire ; le reste est refusé", () => {
    expect(ok(withWipLimit(config, first.id, " 4 ")).columns[0]?.wipLimit).toBe(4);
    const limited = ok(withWipLimit(config, first.id, "4"));
    expect(ok(withWipLimit(limited, first.id, "")).columns[0]?.wipLimit).toBeNull();
    for (const raw of ["-2", "0", "1000", "2.5", "abc"]) {
      expect(withWipLimit(config, first.id, raw)).toEqual({
        ok: false,
        error: `La limite WIP de « ${first.name} » doit être un entier entre 1 et 999, ou vide.`,
      });
    }
  });

  it("une colonne disparue entre-temps (structure relue) laisse la configuration intacte", () => {
    expect(ok(withColumnName(config, "disparue", "X"))).toEqual(config);
    expect(ok(withWipLimit(config, "disparue", "3"))).toEqual(config);
  });

  it("types : classement et bug", () => {
    const [type] = config.issueTypes;
    if (!type) throw new Error("type attendu");
    expect(withTypeDestination(config, type.id, { kind: "ignored" }).issueTypes[0]?.category).toBe(
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

describe("types de tickets et swimlanes par type", () => {
  const recette = { ...SWIMLANE_TYPE, id: "10005", name: "Anomalie de Recette" };
  const service = {
    ...SWIMLANE_TYPE,
    id: "10006",
    name: "Demande de service",
    category: "GOAL" as const,
  };
  const base = makeConfiguration({ issueTypes: [STORY_TYPE, SWIMLANE_TYPE, recette, service] });
  const names = (configuration: BoardConfiguration) =>
    configuration.ticketSwimlanes.map((swimlane) => [
      swimlane.id,
      swimlaneName(configuration, swimlane),
      swimlane.typeIds,
    ]);

  it("par défaut, les types hors objectifs forment une swimlane nommée d'après eux", () => {
    expect(names(base)).toEqual([["1", "Anomalie Prod / Anomalie de Recette", ["10004", "10005"]]]);
  });

  it("déplacer un type dans une swimlane, ou dans une nouvelle", () => {
    const joined = withTypeDestination(base, "10006", { kind: "swimlane", swimlaneId: "1" });
    expect(names(joined)[0]?.[1]).toBe("Anomalie Prod / Anomalie de Recette / Demande de service");
    expect(joined.issueTypes.find((type) => type.id === "10006")?.category).toBe("SWIMLANE");

    const ops = withTypeDestination(base, "10006", { kind: "newSwimlane" });
    expect(names(ops)).toEqual([
      ["1", "Anomalie Prod / Anomalie de Recette", ["10004", "10005"]],
      ["2", "Demande de service", ["10006"]],
    ]);
  });

  it("une swimlane disparaît avec son dernier type, et sa place dans l'ordre avec elle", () => {
    const ops = {
      ...withTypeDestination(base, "10006", { kind: "newSwimlane" }),
      blockOrder: ["swimlane:2", "build", "swimlane:1"],
      collapsedBlockIds: ["swimlane:2"],
    };
    const back = withTypeDestination(ops, "10006", { kind: "goal" });
    expect(names(back).map(([id]) => id)).toEqual(["1"]);
    expect(back.issueTypes.find((type) => type.id === "10006")?.category).toBe("GOAL");
    expect(back.blockOrder).toEqual(["build", "swimlane:1"]);
    expect(back.collapsedBlockIds).toEqual([]);
  });

  it("ignorer un type le retire de sa swimlane", () => {
    const ignored = withTypeDestination(base, "10005", { kind: "ignored" });
    expect(names(ignored)).toEqual([["1", "Anomalie Prod", ["10004"]]]);
    expect(ignored.issueTypes.find((type) => type.id === "10005")?.category).toBe("IGNORED");
  });

  it("type ou swimlane inconnus : rien ne change", () => {
    expect(withTypeDestination(base, "inconnu", { kind: "newSwimlane" })).toBe(base);
    expect(withTypeDestination(base, "10006", { kind: "swimlane", swimlaneId: "9" })).toBe(base);
  });

  it("nom choisi ; vide ou égal au nom calculé, le nom suit ses types", () => {
    const run = withSwimlaneName(base, "1", "  RUN ");
    expect(names(run)[0]?.[1]).toBe("RUN");
    expect(
      names(withTypeDestination(run, "10006", { kind: "swimlane", swimlaneId: "1" }))[0]?.[1],
    ).toBe("RUN");
    expect(withSwimlaneName(run, "1", "").ticketSwimlanes[0]?.name).toBe("");
    expect(
      withSwimlaneName(base, "1", "Anomalie Prod / Anomalie de Recette").ticketSwimlanes[0]?.name,
    ).toBe("");
  });

  it("masquer une swimlane par type", () => {
    expect(withSwimlaneHidden(base, "1", true).ticketSwimlanes[0]?.hidden).toBe(true);
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
