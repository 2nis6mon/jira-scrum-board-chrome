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
};

/** Chemins qu'une écriture a le droit de viser. Rien d'autre. */
const ALLOWED_PATHS = [
  /^\/rest\/agile\/1\.0\/sprint\/\d+\/properties\/com\.scrumboardmac\.[a-z0-9.]+$/,
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
