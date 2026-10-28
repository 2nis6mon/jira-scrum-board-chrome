import { describe, expect, it } from "vitest";
import { JiraError } from "../../src/jira/errors";
import {
  decodeChangelog,
  decodeIssue,
  decodeIssueFields,
  decodeSprint,
  displayValues,
  isFlagged,
  type JiraChangelog,
  lastStatusChange,
  linkedGoalIds,
  parseJiraDate,
  sprintActivated,
  sprintScope,
  userInitials,
} from "../../src/jira/models";
import { issueJson, statusJson } from "../support/jiraFixtures";

function fieldsWith(extra: Record<string, unknown>) {
  return decodeIssueFields({
    summary: "S",
    status: statusJson("3", "X"),
    issuetype: { id: "1", name: "Story", subtask: false },
    labels: [],
    ...extra,
  });
}

describe("parseJiraDate", () => {
  it("lit les formats que Jira renvoie réellement", () => {
    const expected = Date.UTC(2015, 3, 11, 5, 22, 0);
    expect(parseJiraDate("2015-04-11T15:22:00.000+1000")?.getTime()).toBe(expected);
    expect(parseJiraDate("2015-04-11T15:22:00+1000")?.getTime()).toBe(expected);
    expect(parseJiraDate("2015-04-11T15:22:00.000+10:00")?.getTime()).toBe(expected);
    expect(parseJiraDate("2015-04-11T05:22:00Z")?.getTime()).toBe(expected);
    expect(parseJiraDate("2015-04-11T03:22:00.000-0200")?.getTime()).toBe(expected);
  });

  it("lit une date seule en UTC", () => {
    expect(parseJiraDate("2015-04-11")?.getTime()).toBe(Date.UTC(2015, 3, 11));
  });

  it("rend null plutôt que d'inventer", () => {
    for (const value of [null, undefined, "", "demain", "2015-04-11T15:22:00", 42]) {
      expect(parseJiraDate(value)).toBeNull();
    }
  });
});

describe("décodage d'un ticket", () => {
  it("échoue sans statut ni type, tolère le reste", () => {
    expect(() => decodeIssue({ id: "1", key: "ABC-1", fields: { summary: "S" } })).toThrowError(
      JiraError,
    );
    const issue = decodeIssue(issueJson("ABC-1", { extraFields: { assignee: "illisible" } }));
    expect(issue.fields.assignee).toBeNull();
    expect(issue.fields.components).toEqual([]);
    expect(issue.changelog).toBeNull();
  });

  it("distingue un champ personnalisé vide d'un champ absent de la réponse", () => {
    const fields = fieldsWith({ customfield_1: null, customfield_2: 0, autre: "x" });
    expect(fields.customFields).toEqual({ customfield_1: null, customfield_2: 0 });
  });

  it("calcule des initiales", () => {
    expect(
      userInitials({ accountId: null, displayName: "camille  durand petit", avatarUrls: {} }),
    ).toBe("CD");
  });
});

// LinkedGoalIdsTests (GoalFieldTests.swift)
describe("linkedGoalIds — lien natif ticket↔Goal", () => {
  const ids = (value: unknown, fieldId: string | null = "customfield_10100") =>
    linkedGoalIds(fieldsWith({ customfield_10100: value }), fieldId);

  it("tableau d'ARI", () => {
    expect(ids(["ari:cloud:townsquare:c:goal/u1", "ari:cloud:townsquare:c:goal/u2"])).toEqual([
      "ari:cloud:townsquare:c:goal/u1",
      "ari:cloud:townsquare:c:goal/u2",
    ]);
  });

  it("tableau d'objets portant un identifiant", () => {
    expect(ids([{ id: "ari:cloud:townsquare:c:goal/u1", name: "Paiement" }])).toEqual([
      "ari:cloud:townsquare:c:goal/u1",
    ]);
  });

  it("valeur unique", () => {
    expect(ids("ari:cloud:townsquare:c:goal/u9")).toEqual(["ari:cloud:townsquare:c:goal/u9"]);
  });

  it("clé de Goal", () => {
    expect(ids([{ key: "GOAL-42" }])).toEqual(["GOAL-42"]);
  });

  it("doublons réduits, ordre conservé", () => {
    expect(ids(["ari:cloud:x:goal/a", "ari:cloud:x:goal/b", "ari:cloud:x:goal/a"])).toEqual([
      "ari:cloud:x:goal/a",
      "ari:cloud:x:goal/b",
    ]);
  });

  it("ignore tout ce qui n'est ni un ARI de Goal ni une clé", () => {
    expect(ids(["une note libre", 42, null])).toEqual([]);
  });

  it("champ absent ou non repéré : rien", () => {
    expect(ids(null)).toEqual([]);
    expect(ids([], null)).toEqual([]);
    expect(ids([], "customfield_absent")).toEqual([]);
  });
});

// FlaggedFieldTests (valeur du champ ; la découverte du champ viendra avec le client Jira)
describe("isFlagged — drapeau Jira", () => {
  it("drapeau posé quand « Impediment » est présent", () => {
    const fields = fieldsWith({ customfield_10021: [{ id: "10019", value: "Impediment" }] });
    expect(isFlagged(fields, "customfield_10021")).toBe(true);
  });

  it("pas de drapeau si vide, absent, ou champ non repéré", () => {
    expect(isFlagged(fieldsWith({ customfield_10021: [] }), "customfield_10021")).toBe(false);
    expect(isFlagged(fieldsWith({ customfield_10021: null }), "customfield_10021")).toBe(false);
    expect(isFlagged(fieldsWith({ customfield_10021: [{ value: "Impediment" }] }), null)).toBe(
      false,
    );
  });
});

// CardFieldDecodingTests
describe("champs des cartes — décodage", () => {
  it("parent", () => {
    const fields = fieldsWith({
      parent: {
        id: "9",
        key: "ABC-9",
        fields: { summary: "Refonte du tunnel", status: { id: "1", name: "Open" } },
      },
    });
    expect(fields.parent?.key).toBe("ABC-9");
    expect(fields.parent?.summary).toBe("Refonte du tunnel");
    expect(fieldsWith({}).parent).toBeNull();
  });

  it("versions", () => {
    const fields = fieldsWith({
      fixVersions: [
        { id: "1", name: "2.4.0" },
        { id: "2", name: "2.5.0" },
      ],
      versions: [{ name: "2.3.1" }],
    });
    expect(fields.fixVersions.map((v) => v.name)).toEqual(["2.4.0", "2.5.0"]);
    expect(fields.affectsVersions.map((v) => v.name)).toEqual(["2.3.1"]);
    expect(fieldsWith({}).fixVersions).toEqual([]);
  });

  it("formes simples d'un champ personnalisé", () => {
    const values = (value: unknown) =>
      displayValues(fieldsWith({ customfield_1: value }), "customfield_1");
    expect(values("Prod")).toEqual(["Prod"]);
    expect(values(3.0)).toEqual(["3"]);
    expect(values(2.5)).toEqual(["2.5"]);
    expect(values(true)).toEqual(["Oui"]);
    expect(values({ value: "P2", id: "7" })).toEqual(["P2"]);
    expect(values([{ value: "iOS" }, { value: "Android" }])).toEqual(["iOS", "Android"]);
    expect(values({ accountId: "a", displayName: "Camille" })).toEqual(["Camille"]);
    expect(values({ value: "Europe", child: { value: "France" } })).toEqual(["Europe › France"]);
  });

  it("forme complexe ou vide : rien", () => {
    const values = (value: unknown, id: string | null = "customfield_1") =>
      displayValues(fieldsWith({ customfield_1: value }), id);
    expect(values({ type: "doc", content: [] })).toEqual([]);
    expect(values("  ")).toEqual([]);
    expect(displayValues(fieldsWith({}), "customfield_1")).toEqual([]);
    expect(values("x", null)).toEqual([]);
  });
});

describe("sprintScope — le ticket était-il dans le sprint à son démarrage ?", () => {
  const STARTED = parseJiraDate("2026-09-14T09:00:00.000+0200") as Date;
  const BEFORE = parseJiraDate("2026-09-01T10:00:00.000+0200") as Date;
  function changelog(entries: [created: string, from: string | null, to: string | null][]) {
    return decodeChangelog({
      histories: entries.map(([created, from, to]) => ({
        created,
        items: [{ field: "Sprint", fromString: from, toString: to }],
      })),
    }) as JiraChangelog;
  }
  const scope = (
    entries: [string, string | null, string | null][],
    created: Date | null = BEFORE,
    sprintName = "Sprint 42",
  ) => sprintScope({ changelog: changelog(entries), sprintName, startedAt: STARTED, created });

  it("mis dans le sprint pendant le planning : présent au démarrage", () => {
    expect(scope([["2026-09-10T10:00:00.000+0200", null, "Sprint 42"]])).toEqual({
      inSprintAtStart: true,
      enteredAt: parseJiraDate("2026-09-10T10:00:00.000+0200"),
    });
  });

  it("entré après le démarrage : ajouté, à cette date", () => {
    expect(scope([["2026-09-18T10:00:00.000+0200", "Sprint 41", "Sprint 41, Sprint 42"]])).toEqual({
      inSprintAtStart: false,
      enteredAt: parseJiraDate("2026-09-18T10:00:00.000+0200"),
    });
  });

  it("mis puis retiré pendant le planning, remis après le démarrage : ajouté", () => {
    const result = scope([
      ["2026-09-10T10:00:00.000+0200", null, "Sprint 42"],
      ["2026-09-12T10:00:00.000+0200", "Sprint 42", null],
      ["2026-09-16T10:00:00.000+0200", null, "Sprint 42"],
    ]);
    expect(result.inSprintAtStart).toBe(false);
    expect(result.enteredAt).toEqual(parseJiraDate("2026-09-16T10:00:00.000+0200"));
  });

  it("présent au démarrage, sorti puis revenu : pas ajouté", () => {
    const result = scope([
      ["2026-09-10T10:00:00.000+0200", null, "Sprint 42"],
      ["2026-09-16T10:00:00.000+0200", "Sprint 42", null],
      ["2026-09-17T10:00:00.000+0200", null, "Sprint 42"],
    ]);
    expect(result.inSprintAtStart).toBe(true);
    expect(result.enteredAt).toEqual(parseJiraDate("2026-09-17T10:00:00.000+0200"));
  });

  it("aucun changement avant le démarrage : l'ancienne valeur du premier changement d'après", () => {
    expect(
      scope([["2026-09-20T10:00:00.000+0200", "Sprint 42", "Sprint 42, Sprint 43"]])
        .inSprintAtStart,
    ).toBe(true);
    expect(
      scope([["2026-09-20T10:00:00.000+0200", "Sprint 41", "Sprint 42"]]).inSprintAtStart,
    ).toBe(false);
  });

  it("aucun changement du champ Sprint : la date de création décide", () => {
    expect(scope([], BEFORE)).toEqual({ inSprintAtStart: true, enteredAt: BEFORE });
    const later = parseJiraDate("2026-09-15T10:00:00.000+0200") as Date;
    expect(scope([], later)).toEqual({ inSprintAtStart: false, enteredAt: later });
    expect(scope([], null)).toEqual({ inSprintAtStart: null, enteredAt: null });
  });

  it("l'ordre de l'historique reçu n'y change rien", () => {
    const result = scope([
      ["2026-09-16T10:00:00.000+0200", null, "Sprint 42"],
      ["2026-09-12T10:00:00.000+0200", "Sprint 42", null],
      ["2026-09-10T10:00:00.000+0200", null, "Sprint 42"],
    ]);
    expect(result.inSprintAtStart).toBe(false);
  });

  it("nom de sprint vide : aucune information plutôt qu'une supposition", () => {
    expect(scope([["2026-09-10T10:00:00.000+0200", null, "Sprint 42"]], BEFORE, "")).toEqual({
      inSprintAtStart: null,
      enteredAt: null,
    });
  });

  describe("report du sprint précédent, lu par identifiant", () => {
    // Démarrage daté 5 s AVANT la clôture du précédent, puis rafale de report (cas mesuré).
    const STARTED_BEFORE_CLOSE = parseJiraDate("2026-10-27T09:45:01.000Z") as Date;
    const PLANNED = parseJiraDate("2026-10-20T10:00:00.000Z") as Date;
    function idChangelog(
      entries: [created: string, from: string | null, to: string | null, names: string | null][],
    ) {
      return decodeChangelog({
        histories: entries.map(([created, from, to, names]) => ({
          created,
          items: [{ field: "Sprint", from, to, fromString: null, toString: names }],
        })),
      }) as JiraChangelog;
    }
    const idScope = (
      entries: [string, string | null, string | null, string | null][],
      sprintName = "Équipe S2",
    ) =>
      sprintScope({
        changelog: idChangelog(entries),
        sprintId: 102,
        sprintName,
        startedAt: STARTED_BEFORE_CLOSE,
        created: PLANNED,
      });

    it("reporté dans la rafale qui suit un démarrage antidaté : présent au démarrage", () => {
      for (const at of ["2026-10-27T09:45:06.853Z", "2026-10-27T09:45:09.164Z"]) {
        const result = idScope([
          ["2026-10-21T16:02:13.000Z", "", "101", "Équipe S1"],
          [at, "101", "101, 102", "Équipe S1, Équipe S2"],
        ]);
        expect(result.inSprintAtStart).toBe(true);
        expect(result.enteredAt).toEqual(parseJiraDate(at));
      }
    });

    it("entré au-delà de la tolérance de démarrage : ajouté", () => {
      expect(
        idScope([["2026-10-27T09:47:02.000Z", "101", "101, 102", "Équipe S1, Équipe S2"]])
          .inSprintAtStart,
      ).toBe(false);
    });

    it("sprint renommé ou nom avec virgule : l'identifiant fait foi", () => {
      const entries: [string, string | null, string | null, string | null][] = [
        ["2026-10-22T10:00:00.000Z", null, "102", "Ancien nom"],
      ];
      expect(idScope(entries, "Nouveau nom").inSprintAtStart).toBe(true);
      expect(idScope(entries, "MFA, Pixel").inSprintAtStart).toBe(true);
    });
  });

  it("lastStatusChange ne regarde que les changements de statut", () => {
    const log = decodeChangelog({
      histories: [
        { created: "2026-09-10T10:00:00.000+0200", items: [{ field: "status" }] },
        { created: "2026-09-15T10:00:00.000+0200", items: [{ field: "Status" }] },
        { created: "2026-09-17T10:00:00.000+0200", items: [{ field: "assignee" }] },
      ],
    }) as JiraChangelog;
    expect(lastStatusChange(log)).toEqual(parseJiraDate("2026-09-15T10:00:00.000+0200"));
  });
});

describe("sprint", () => {
  it("démarrage réel : activatedDate, sinon startDate", () => {
    const base = {
      id: 42,
      name: "Sprint 42",
      state: "active",
      startDate: "2026-09-12T09:00:00.000+0200",
    };
    expect(sprintActivated(decodeSprint(base))).toEqual(parseJiraDate(base.startDate));
    const activated = decodeSprint({ ...base, activatedDate: "2026-09-13T09:00:00.000+0200" });
    expect(sprintActivated(activated)).toEqual(parseJiraDate("2026-09-13T09:00:00.000+0200"));
  });

  it("lit le champ goal sans jamais le transformer", () => {
    const sprint = decodeSprint({ id: 1, name: "S", state: "active", goal: "  🎯 A\nB " });
    expect(sprint.goal).toBe("  🎯 A\nB ");
  });
});
