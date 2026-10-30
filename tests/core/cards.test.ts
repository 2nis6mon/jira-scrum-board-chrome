import { describe, expect, it } from "vitest";
import { cardFieldLabel } from "../../src/app/model/coreText";
import { displayedCardFields } from "../../src/core/boardConfiguration";
import {
  type CardColorRule,
  resolveCardColors,
  SCOPE_CHANGE_RULE,
  SCOPE_CHANGE_RULE_ID,
  withBuiltInRules,
} from "../../src/core/cardColors";
import {
  type CardField,
  cardFieldId,
  cardFieldJiraId,
  cardFieldValues,
} from "../../src/core/cardFields";
import {
  COLUMN_CHROME,
  COLUMN_SPACING,
  columnWidth,
  MINIMUM_COLUMN_WIDTH,
} from "../../src/core/layoutMetrics";
import { makeConfiguration, makeIssue } from "../support/jiraFixtures";

let ruleCounter = 0;
const rule = (name: string, jql: string, color: string, enabled = true): CardColorRule => ({
  id: `regle-${++ruleCounter}`,
  name,
  jql,
  color,
  enabled,
  kind: null,
});

// CardFieldAndParentTests (champs)
describe("champs des cartes", () => {
  const ENV: CardField = {
    kind: "custom",
    customFieldId: "customfield_20",
    customFieldName: "Env",
  };
  const fields = makeIssue("ABC-1", {
    labels: ["front"],
    extraFields: {
      components: [{ id: "1", name: "Paiement" }],
      fixVersions: [{ name: "2.4.0" }],
      customfield_20: { value: "Prod" },
    },
  }).fields;

  it("valeurs affichées", () => {
    expect(cardFieldValues({ kind: "fixVersions" }, fields)).toEqual(["2.4.0"]);
    expect(cardFieldValues({ kind: "affectsVersions" }, fields)).toEqual([]);
    expect(cardFieldValues({ kind: "labels" }, fields)).toEqual(["front"]);
    expect(cardFieldValues({ kind: "components" }, fields)).toEqual(["Paiement"]);
    expect(cardFieldValues(ENV, fields)).toEqual(["Prod"]);
  });

  it("seuls les champs nécessaires sont demandés à Jira", () => {
    expect(cardFieldJiraId({ kind: "fixVersions" })).toBe("fixVersions");
    expect(cardFieldJiraId({ kind: "affectsVersions" })).toBe("versions");
    expect(cardFieldJiraId({ kind: "labels" })).toBeNull();
    expect(cardFieldJiraId({ kind: "components" })).toBeNull();
    expect(cardFieldJiraId(ENV)).toBe("customfield_20");
  });

  it("identifiant et libellé", () => {
    expect(cardFieldId({ kind: "labels" })).toBe("labels");
    expect(cardFieldId(ENV)).toBe("custom:customfield_20");
    expect(cardFieldLabel(ENV)).toBe("Env");
    expect(cardFieldLabel({ ...ENV, customFieldName: null })).toBe("customfield_20");
  });

  it("trois champs affichés au plus", () => {
    expect(displayedCardFields(makeConfiguration())).toEqual([]);
    const config = makeConfiguration({
      cardFields: [
        { kind: "labels" },
        { kind: "components" },
        { kind: "fixVersions" },
        { kind: "affectsVersions" },
      ],
    });
    expect(displayedCardFields(config).map((field) => field.kind)).toEqual([
      "labels",
      "components",
      "fixVersions",
    ]);
  });
});

// Priorités des couleurs et règle intégrée, indépendantes des lectures Jira.
describe("règles de couleur des cartes", () => {
  it("la règle intégrée est dernière par défaut : les règles JQL l'emportent", () => {
    const p2 = rule("P2", "x", "red");
    const rules = withBuiltInRules([p2]);
    expect(rules.map((r) => r.id)).toEqual([p2.id, SCOPE_CHANGE_RULE_ID]);
    const colors = resolveCardColors(rules, { [p2.id]: new Set(["X-1"]) }, new Set(["X-1", "X-2"]));
    expect(colors).toEqual({ "X-1": "red", "X-2": "blue" });
  });

  it("placée en premier, la règle intégrée prend la priorité", () => {
    const p2 = rule("P2", "x", "red");
    const rules = [SCOPE_CHANGE_RULE, p2];
    expect(withBuiltInRules(rules)).toEqual(rules);
    const colors = resolveCardColors(rules, { [p2.id]: new Set(["X-1", "X-3"]) }, new Set(["X-1"]));
    expect(colors).toEqual({ "X-1": "blue", "X-3": "red" });
  });

  it("la règle intégrée suspendue ne colore rien", () => {
    const suspended = { ...SCOPE_CHANGE_RULE, enabled: false };
    expect(resolveCardColors([suspended], {}, new Set(["X-1"]))).toEqual({});
  });

  it("la première règle active l'emporte", () => {
    const first = rule("A", "a", "red");
    const second = rule("B", "b", "green");
    const disabled = rule("C", "c", "pink", false);
    const colors = resolveCardColors([disabled, first, second], {
      [first.id]: new Set(["X-1"]),
      [second.id]: new Set(["X-1", "X-2"]),
      [disabled.id]: new Set(["X-1", "X-3"]),
    });
    expect(colors).toEqual({ "X-1": "red", "X-2": "green" });
  });

  it("une règle que Jira a refusée (aucun résultat connu) ne colore rien", () => {
    expect(resolveCardColors([rule("A", "a", "red")], {})).toEqual({});
  });
});

// BoardLayoutMetricsTests
describe("largeur des colonnes", () => {
  it("les colonnes se partagent la largeur disponible", () => {
    // 5 colonnes dans 1400 px : 4 espaces de 10, 12 d'habillage par colonne.
    const width = columnWidth(1400, 5, 150);
    expect(width).toBe(260);
    expect(5 * (width + COLUMN_CHROME) + 4 * COLUMN_SPACING).toBeLessThanOrEqual(1400);
  });

  it("peu de colonnes : elles s'élargissent", () => {
    expect(columnWidth(1400, 3, 150)).toBeGreaterThan(268);
  });

  it("la largeur minimale arrête le rétrécissement", () => {
    expect(columnWidth(900, 8, 150)).toBe(150);
    expect(MINIMUM_COLUMN_WIDTH).toBeLessThan(268);
  });

  it("entrées dégénérées : largeur minimale", () => {
    expect(columnWidth(0, 5, 150)).toBe(150);
    expect(columnWidth(1000, 0, 150)).toBe(150);
  });
});
