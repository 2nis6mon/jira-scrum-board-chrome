import { describe, expect, it, vi } from "vitest";
import { JqlService } from "../../../src/app/services/JqlService";
import { JiraError } from "../../../src/jira/errors";
import type { JiraJqlReference } from "../../../src/jira/jql";

const reference: JiraJqlReference = {
  fields: [
    {
      value: "labels",
      label: "Labels",
      operators: ["=", "in", "not in"],
      types: ["string"],
      auto: true,
    },
    {
      value: "assignee",
      label: "Responsable",
      operators: ["=", "is", "is not"],
      types: ["user"],
      auto: true,
    },
    {
      value: "cf[123]",
      label: "Priorité incident - cf[123]",
      operators: ["="],
      types: ["string"],
      auto: true,
    },
  ],
  functions: [{ value: "currentUser()", label: "currentUser()", types: ["user"], list: false }],
};
function setup() {
  const reader = {
    validateJql: vi.fn(async (_text: string) => ({
      errors: [] as string[],
      warnings: [] as string[],
    })),
    jqlAutocompleteData: vi.fn(async () => reference),
    jqlValueSuggestions: vi.fn(async (_field: string, _value: string) => [
      { label: "Équipe RUN", value: "Équipe RUN" },
      { label: "run", value: "run" },
    ]),
    matchJql: vi.fn(async (ids: readonly string[], queries: readonly string[]) =>
      queries.map(() => ({ issueIds: [...ids], errors: [] as string[] })),
    ),
  };
  return { reader, service: new JqlService(reader) };
}

describe("JqlService", () => {
  it("distingue vide, invalide et indisponible sans assimiler une panne à un mauvais JQL", async () => {
    const { reader, service } = setup();
    expect((await service.validate(" ")).status).toBe("invalid");
    expect(reader.validateJql).not.toHaveBeenCalled();
    reader.validateJql.mockResolvedValueOnce({ errors: ["Champ inconnu"], warnings: [] });
    expect(await service.validate("x = y")).toMatchObject({
      text: "x = y",
      status: "invalid",
      errors: ["Champ inconnu"],
    });
    reader.validateJql.mockRejectedValueOnce(
      new JiraError({ kind: "offline", underlying: "réseau" }),
    );
    expect((await service.validate("labels = run")).status).toBe("unavailable");
  });
  it("suggère les champs, opérateurs, valeurs et fonctions selon le curseur", async () => {
    const { reader, service } = setup();
    expect(await service.suggest("lab", 3)).toEqual([
      { label: "Labels", value: "labels ", kind: "field", from: 0, to: 3 },
    ]);
    expect((await service.suggest("labels ", 7)).map((item) => item.value)).toContain("NOT IN ");
    expect((await service.suggest("labels NOT i", 12))[0]?.value).toBe("NOT IN ");
    expect((await service.suggest("labels = ru", 11))[0]).toMatchObject({
      value: "run",
      from: 9,
      to: 11,
    });
    expect(reader.jqlValueSuggestions).toHaveBeenLastCalledWith("labels", "ru");
    expect((await service.suggest("assignee = curr", 15))[0]?.value).toBe("currentUser()");
    expect((await service.suggest("labels = run AND ass", 19))[0]?.value).toBe("assignee ");
    expect(reader.jqlAutocompleteData).toHaveBeenCalledTimes(1);
  });
  it("gère champs cités, listes et remplacement au milieu d'un mot sans transformer le reste", async () => {
    const { reader, service } = setup();
    expect(
      (await service.suggest('"Priorité incident" = ru', '"Priorité incident" = ru'.length))[0]
        ?.value,
    ).toBe("run");
    expect(reader.jqlValueSuggestions).toHaveBeenLastCalledWith("cf[123]", "ru");
    expect((await service.suggest("labels in (a, ru", 16))[0]?.value).toBe("run");
    expect((await service.suggest("labels = run", 11))[0]).toMatchObject({ from: 9, to: 12 });
    expect((await service.suggest('labels = "run"', 12))[0]).toMatchObject({ from: 9, to: 14 });
    expect((await service.suggest('labels = "run"', 10))[0]).toMatchObject({ from: 9, to: 14 });
    expect((await service.suggest('"Priorité incident" = run', 8))[0]).toMatchObject({
      value: "cf[123] ",
      from: 0,
      to: 19,
    });
    const query = "assignee = currentUser()";
    const completion = (await service.suggest(query, 15))[0];
    expect(completion).toMatchObject({ value: "currentUser()", from: 11, to: query.length });
    expect((await service.suggest("labels = run ", 13)).map((item) => item.value)).toEqual([
      "AND ",
      "OR ",
    ]);
  });
  it("découpe, déduplique, limite le parallélisme et ignore les identifiants hors portée", async () => {
    const { reader, service } = setup();
    let active = 0;
    let peak = 0;
    reader.matchJql.mockImplementation(async (ids, queries) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      expect(ids.length).toBeLessThanOrEqual(50);
      expect(queries.length).toBeLessThanOrEqual(10);
      return queries.map(() => ({ issueIds: [...ids, "9999"], errors: [] }));
    });
    const issues = Array.from({ length: 121 }, (_, i) => ({
      id: String(i + 1),
      key: `ABC-${i + 1}`,
    }));
    const queries = Array.from({ length: 11 }, (_, i) => `labels = label${i}`);
    const matches = await service.match(issues, [...queries, " labels = label0 "]);
    expect(reader.matchJql).toHaveBeenCalledTimes(6);
    expect(peak).toBeLessThanOrEqual(3);
    expect(matches.get(queries[0] ?? "")?.keys.size).toBe(121);
    expect(matches.get(" labels = label0 ")).toBe(matches.get("labels = label0"));
    await service.match(issues.slice(0, 1), ["labels = label0"]);
    expect(reader.matchJql).toHaveBeenCalledTimes(7);
  });
  it("ne livre jamais les correspondances partielles d'une règle en échec", async () => {
    const { reader, service } = setup();
    reader.matchJql.mockResolvedValueOnce([{ issueIds: ["1"], errors: ["Refus Jira"] }]);
    const result = await service.match([{ id: "1", key: "ABC-1" }], ["labels = run"]);
    expect(result.get("labels = run")).toEqual({ keys: new Set(), errors: ["Refus Jira"] });
  });
});
