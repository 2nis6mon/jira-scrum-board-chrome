import { describe, expect, it } from "vitest";
import { JiraError } from "../../src/jira/errors";
import { buildWriteRequest, type JiraWrite, SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";

// Un exemple de chaque écriture exprimable. Le type `Record<JiraWrite["kind"], …>` force
// cette liste à rester exhaustive : ajouter une écriture sans l'inscrire ici ne compile pas.
const EVERY_WRITE: Record<JiraWrite["kind"], JiraWrite> = {
  "sprintProperty.put": {
    kind: "sprintProperty.put",
    sprintId: 42,
    key: SPRINT_PROPERTY_KEYS.goals,
    value: { version: 1 },
  },
  "sprintProperty.delete": {
    kind: "sprintProperty.delete",
    sprintId: 42,
    key: SPRINT_PROPERTY_KEYS.diagnostic,
  },
  "issue.transition": { kind: "issue.transition", issueKey: "ABC-1", transitionId: "21" },
  "issue.rank": { kind: "issue.rank", issueKey: "ABC-1", before: "ABC-2" },
};

/** Chemins qu'une écriture a le droit de viser. Rien d'autre. */
const ALLOWED_PATHS = [
  /^\/rest\/agile\/1\.0\/sprint\/\d+\/properties\/com\.scrumboardmac\.[a-z0-9.]+$/,
  /^\/rest\/api\/3\/issue\/[A-Z][A-Z0-9_]*-\d+\/transitions$/,
  /^\/rest\/agile\/1\.0\/issue\/rank$/,
];

describe("inventaire des écritures", () => {
  it.each(Object.values(EVERY_WRITE))("$kind ne vise qu'un chemin autorisé", (write) => {
    const request = buildWriteRequest(write);
    expect(ALLOWED_PATHS.some((pattern) => pattern.test(request.path))).toBe(true);
  });

  it("aucune écriture ne peut cibler le sprint lui-même, donc son champ « Sprint Goal »", () => {
    for (const write of Object.values(EVERY_WRITE)) {
      const { path } = buildWriteRequest(write);
      expect(path).not.toMatch(/^\/rest\/agile\/1\.0\/sprint\/\d+\/?$/);
      expect(path).not.toMatch(/^\/rest\/agile\/1\.0\/sprint\/?$/);
    }
  });

  it("n'écrit que sous les clés de l'application", () => {
    expect(Object.values(SPRINT_PROPERTY_KEYS)).toEqual([
      "com.scrumboardmac.sprintgoals.v1",
      "com.scrumboardmac.diagnostic",
    ]);
  });

  it("refuse avant l'envoi une propriété de plus de 32 Ko", () => {
    const value = { blob: "x".repeat(33 * 1024) };
    expect(() =>
      buildWriteRequest({
        kind: "sprintProperty.put",
        sprintId: 42,
        key: SPRINT_PROPERTY_KEYS.goals,
        value,
      }),
    ).toThrowError(JiraError);
  });

  it.each([0, -1, 1.5, Number.NaN])("refuse l'identifiant de sprint %s", (sprintId) => {
    expect(() =>
      buildWriteRequest({
        kind: "sprintProperty.delete",
        sprintId,
        key: SPRINT_PROPERTY_KEYS.diagnostic,
      }),
    ).toThrowError(JiraError);
  });
});

describe("transition et rang", () => {
  it("transition : POST du seul identifiant de transition", () => {
    const request = buildWriteRequest({
      kind: "issue.transition",
      issueKey: "ABC-12",
      transitionId: "31",
    });
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/rest/api/3/issue/ABC-12/transitions");
    expect(JSON.parse(request.body ?? "")).toEqual({ transition: { id: "31" } });
  });

  it("rang : avant ou après un ticket, sans champ de rang imposé", () => {
    const before = buildWriteRequest({ kind: "issue.rank", issueKey: "ABC-1", before: "ABC-2" });
    expect(before.method).toBe("PUT");
    expect(JSON.parse(before.body ?? "")).toEqual({ issues: ["ABC-1"], rankBeforeIssue: "ABC-2" });
    const after = buildWriteRequest({ kind: "issue.rank", issueKey: "ABC-1", after: "ABC-9" });
    expect(JSON.parse(after.body ?? "")).toEqual({ issues: ["ABC-1"], rankAfterIssue: "ABC-9" });
  });

  it.each(["abc-1", "ABC-0", "ABC-1/../../sprint/42", "ABC-1?x=1", "", "../ABC-1"])(
    "refuse la clé « %s » avant tout envoi",
    (issueKey) => {
      expect(() =>
        buildWriteRequest({ kind: "issue.transition", issueKey, transitionId: "1" }),
      ).toThrowError(JiraError);
      expect(() =>
        buildWriteRequest({ kind: "issue.rank", issueKey, before: "ABC-2" }),
      ).toThrowError(JiraError);
      expect(() =>
        buildWriteRequest({ kind: "issue.rank", issueKey: "ABC-2", after: issueKey }),
      ).toThrowError(JiraError);
    },
  );

  it("refuse un identifiant de transition qui n'est pas un nombre, et un rang sur soi-même", () => {
    expect(() =>
      buildWriteRequest({ kind: "issue.transition", issueKey: "ABC-1", transitionId: "21/../x" }),
    ).toThrowError(JiraError);
    expect(() =>
      buildWriteRequest({ kind: "issue.rank", issueKey: "ABC-1", before: "ABC-1" }),
    ).toThrowError(JiraError);
  });
});
