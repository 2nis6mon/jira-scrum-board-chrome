import { describe, expect, it } from "vitest";
import { type BoardConfiguration, swimlaneName } from "../../src/core/boardConfiguration";
import {
  customFieldChoices,
  isTypeIn,
  moveCardField,
  type SettingResult,
  sameCardFields,
  searchFields,
  withAgingThreshold,
  withBuildLabel,
  withCardField,
  withDefaultBlockOrder,
  withSwimlaneHidden,
  withSwimlaneName,
  withTypeDestination,
} from "../../src/core/boardSettings";
import { type CardField, cardFieldId } from "../../src/core/cardFields";
import type { JiraField } from "../../src/jira/client";
import { makeConfiguration, STORY_TYPE, SWIMLANE_TYPE } from "../support/jiraFixtures";

const config = makeConfiguration();

describe("onglet Board : chaque réglage s'applique seul", () => {
  const ok = (result: SettingResult) => {
    if (!result.ok) throw new Error(result.error);
    return result.configuration;
  };

  it("classement des types", () => {
    const [type] = config.issueTypes;
    if (!type) throw new Error("type attendu");
    expect(withTypeDestination(config, type.id, { kind: "ignored" }).issueTypes[0]?.category).toBe(
      "IGNORED",
    );
  });

  it("nom de Build (vide : le nom par défaut), seuil vieillissant", () => {
    expect(withBuildLabel(config, "  Sprint Backlog ").buildSectionLabel).toBe("Sprint Backlog");
    expect(withBuildLabel(config, "   ").buildSectionLabel).toBe("Build");
    expect(ok(withAgingThreshold(config, " 5 ")).agingThresholdDays).toBe(5);
    for (const raw of ["", "0", "366", "trois", "2.5"]) {
      expect(withAgingThreshold(config, raw)).toEqual({
        ok: false,
        error: "Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.",
      });
    }
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

  it("une nouvelle swimlane peut recevoir son nom dès sa création", () => {
    const named = withTypeDestination(base, "10006", { kind: "newSwimlane", name: "  OPS " });
    expect(names(named)[1]).toEqual(["2", "OPS", ["10006"]]);
    expect(named.ticketSwimlanes[1]?.name).toBe("OPS");
    // Nom identique au nom calculé, ou vide : le nom suit ses types.
    for (const name of ["Demande de service", "  "]) {
      const same = withTypeDestination(base, "10006", { kind: "newSwimlane", name });
      expect(same.ticketSwimlanes[1]?.name).toBe("");
    }
  });

  it("déposer un type là où il est déjà ne change rien (et n'écrit donc rien)", () => {
    expect(isTypeIn(base, "10004", { kind: "swimlane", swimlaneId: "1" })).toBe(true);
    expect(isTypeIn(base, "10006", { kind: "goal" })).toBe(true);
    expect(isTypeIn(base, "10006", { kind: "newSwimlane" })).toBe(false);
    expect(isTypeIn(base, "inconnu", { kind: "goal" })).toBe(false);
    expect(withTypeDestination(base, "10004", { kind: "swimlane", swimlaneId: "1" })).toBe(base);
    expect(withTypeDestination(base, "10006", { kind: "goal" })).toBe(base);
    const ignored = withTypeDestination(base, "10005", { kind: "ignored" });
    expect(withTypeDestination(ignored, "10005", { kind: "ignored" })).toBe(ignored);
  });

  it("le dernier type d'une swimlane envoyé dans une nouvelle : une swimlane remplace l'autre", () => {
    const alone = withTypeDestination(base, "10005", { kind: "goal" });
    const moved = withTypeDestination(alone, "10004", { kind: "newSwimlane", name: "RUN" });
    expect(names(moved)).toEqual([["2", "RUN", ["10004"]]]);
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

  it("trois champs au plus, sans doublon", () => {
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
    expect(sameCardFields(fields, [...fields])).toBe(true);
  });

  it("glisser un champ avant un autre, ou en fin de liste", () => {
    const fields: CardField[] = [
      { kind: "labels" },
      { kind: "fixVersions" },
      { kind: "custom", customFieldId: "customfield_1", customFieldName: "Équipe" },
    ];
    const ids = (list: readonly CardField[]) => list.map(cardFieldId);
    expect(ids(moveCardField(fields, "custom:customfield_1", "labels"))).toEqual([
      "custom:customfield_1",
      "labels",
      "fixVersions",
    ]);
    expect(ids(moveCardField(fields, "labels", null))).toEqual([
      "fixVersions",
      "custom:customfield_1",
      "labels",
    ]);
    // Déposé à sa propre place, ou champ inconnu : même ordre.
    expect(
      sameCardFields(moveCardField(fields, "fixVersions", "custom:customfield_1"), fields),
    ).toBe(true);
    expect(sameCardFields(moveCardField(fields, "inconnu", "labels"), fields)).toBe(true);
    expect(sameCardFields(moveCardField(fields, "labels", "fixVersions"), fields)).toBe(true);
  });
});
