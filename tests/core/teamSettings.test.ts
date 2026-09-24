import { describe, expect, it } from "vitest";
import {
  decodeTeamDocument,
  encodeTeamDocument,
  publishTeamSettings,
  TEAM_FAMILIES,
  type TeamDocument,
  teamDifferences,
  teamSettingsOf,
  withTeamSettings,
} from "../../src/core/teamSettings";
import { JiraError } from "../../src/jira/errors";
import type { JsonValue } from "../../src/jira/json";
import type { JiraWrite } from "../../src/jira/writes";
import { column, makeConfiguration } from "../support/jiraFixtures";

// Données FICTIVES. Réglages d'équipe : propriété du board, publiée sur un geste explicite.

const base = makeConfiguration();
/** Configuration réglée par une personne de l'équipe. */
const tuned = {
  ...base,
  scrumColumns: base.scrumColumns.map((col, index) =>
    index === 1 ? { ...col, name: "Développement", wipLimit: 3 } : col,
  ),
  issueTypes: base.issueTypes.map((type) =>
    type.id === "10001" ? { ...type, countsAsBug: true } : type,
  ),
  blockedLabels: ["bloqué"],
  buildSectionLabel: "Sprint Backlog",
  agingThresholdDays: 5,
  goalColorIndex: { g1: 4 },
  blockOrder: ["build", "goal:g1"],
  hiddenGoalIds: ["g2"],
  // Réglages personnels : jamais partagés.
  collapsedBlockIds: ["kanban"],
  autoRefreshSeconds: 120,
};

describe("réglages d'équipe ↔ configuration", () => {
  it("un autre poste qui applique les réglages retrouve les mêmes, sans ses réglages personnels", () => {
    const settings = teamSettingsOf(tuned);
    const elsewhere = withTeamSettings(base, settings);
    expect(teamSettingsOf(elsewhere)).toEqual(settings);
    expect(elsewhere.collapsedBlockIds).toEqual(base.collapsedBlockIds);
    expect(elsewhere.autoRefreshSeconds).toBe(base.autoRefreshSeconds);
    expect(teamDifferences(elsewhere, settings)).toEqual([]);
  });

  it("la structure reste celle de Jira : colonne inconnue ignorée, colonne locale gardée, sans statut masquée", () => {
    const local = {
      ...base,
      scrumColumns: [
        ...base.scrumColumns,
        { ...column("col-9-Recette", "Recette", ["8"], 9), wipLimit: 2 },
        column("col-10-Vide", "Vide", [], 10),
      ],
    };
    const settings = {
      ...teamSettingsOf(tuned),
      scrumColumns: [
        ...teamSettingsOf(tuned).scrumColumns,
        { id: "col-99-Disparue", name: "Disparue", hidden: false, wipLimit: 1 },
        { id: "col-10-Vide", name: "Vide", hidden: false, wipLimit: null },
      ],
    };
    const applied = withTeamSettings(local, settings);
    expect(applied.scrumColumns.map((col) => col.id)).toEqual(local.scrumColumns.map((c) => c.id));
    expect(applied.scrumColumns[1]).toMatchObject({ name: "Développement", wipLimit: 3 });
    expect(applied.scrumColumns[3]).toMatchObject({ name: "Recette", wipLimit: 2 });
    expect(applied.scrumColumns[4]?.hidden).toBe(true);
  });

  it("couleurs : celle de l'équipe l'emporte, un objectif qu'elle ne connaît pas garde la sienne", () => {
    const local = { ...base, goalColorIndex: { g1: 0, g3: 6 } };
    const applied = withTeamSettings(local, teamSettingsOf(tuned));
    expect(applied.goalColorIndex).toEqual({ g1: 4, g3: 6 });
    // La couleur attribuée ici à un nouvel objectif n'est pas une modification à publier.
    expect(teamDifferences(applied, teamSettingsOf(tuned))).toEqual([]);
  });

  it("ce qui diffère de l'équipe, par famille de réglages", () => {
    const settings = teamSettingsOf(tuned);
    const changed = withTeamSettings(base, settings);
    expect(teamDifferences({ ...changed, agingThresholdDays: 8 }, settings)).toEqual([
      "Swimlane Kanban, noms de Build et de Kanban, seuil de vieillissement",
    ]);
    expect(
      teamDifferences(
        { ...changed, cardFields: [{ kind: "labels" }], hiddenGoalIds: [] },
        settings,
      ),
    ).toEqual(["Objectifs masqués", "Champs des cartes"]);
    expect(TEAM_FAMILIES).toHaveLength(11);
    // Un réglage personnel changé n'est pas une différence.
    expect(teamDifferences({ ...changed, collapsedBlockIds: ["build"] }, settings)).toEqual([]);
  });
});

const DOCUMENT: TeamDocument = {
  version: 1,
  publishedAt: "2026-09-19T08:00:00Z",
  publishedBy: { accountId: "u1", displayName: "Camille Durand" },
  settings: teamSettingsOf(tuned),
};

describe("document JSON de la propriété du board", () => {
  it("aller-retour complet", () => {
    expect(decodeTeamDocument(encodeTeamDocument(DOCUMENT))).toEqual(DOCUMENT);
  });

  it("une version inconnue, ou sans colonnes, n'est pas interprétée", () => {
    const encoded = encodeTeamDocument(DOCUMENT);
    expect(decodeTeamDocument({ ...encoded, version: 2 })).toBeNull();
    expect(decodeTeamDocument({ ...encoded, settings: { issueTypes: [] } })).toBeNull();
    expect(decodeTeamDocument({ ...encoded, publishedAt: "" })).toBeNull();
    expect(decodeTeamDocument("texte")).toBeNull();
  });
});

/** Faux Jira : une propriété du board, et les écritures demandées. */
function fakeJira(stored: JsonValue | null) {
  const writes: JiraWrite[] = [];
  return {
    writes,
    reader: { boardProperty: async () => stored },
    writer: {
      write: async (write: JiraWrite) => {
        writes.push(write);
        return { status: 200, body: null };
      },
    },
  };
}

const publish = (jira: ReturnType<typeof fakeJira>, basePublishedAt: string | null) =>
  publishTeamSettings(jira.reader, jira.writer as never, {
    boardId: 7,
    settings: teamSettingsOf(tuned),
    basePublishedAt,
    publishedBy: { accountId: "u2", displayName: "Alex Martin" },
    now: new Date("2026-09-19T09:30:12.345Z"),
  });

describe("publier les réglages d'équipe", () => {
  it("première publication : une seule écriture, sur la propriété du board", async () => {
    const jira = fakeJira(null);
    const outcome = await publish(jira, null);
    expect(outcome.kind).toBe("published");
    expect(jira.writes).toHaveLength(1);
    const [write] = jira.writes;
    expect(write).toMatchObject({
      kind: "boardProperty.put",
      boardId: 7,
      key: "com.scrumboardmac.boardsettings.v1",
    });
    const written = write?.kind === "boardProperty.put" ? write.value : null;
    expect(decodeTeamDocument(written)).toEqual({
      version: 1,
      publishedAt: "2026-09-19T09:30:12.345Z",
      publishedBy: { accountId: "u2", displayName: "Alex Martin" },
      settings: teamSettingsOf(tuned),
    });
  });

  it("publié par quelqu'un depuis la version connue ici : conflit, rien n'est écrit", async () => {
    const jira = fakeJira(encodeTeamDocument(DOCUMENT));
    expect(await publish(jira, "2026-09-18T17:00:00Z")).toEqual({
      kind: "conflict",
      current: DOCUMENT,
    });
    // Jamais vu ici non plus : on regarde d'abord ce que l'équipe a publié.
    expect((await publish(jira, null)).kind).toBe("conflict");
    expect(jira.writes).toEqual([]);
  });

  it("version connue : remplace le document en gardant les clés inconnues", async () => {
    const stored = {
      ...encodeTeamDocument(DOCUMENT),
      futur: { a: 1 },
      settings: { ...(encodeTeamDocument(DOCUMENT).settings as object), nouveauReglage: true },
    };
    const jira = fakeJira(stored as JsonValue);
    expect((await publish(jira, DOCUMENT.publishedAt)).kind).toBe("published");
    const write = jira.writes[0];
    const value = write?.kind === "boardProperty.put" ? write.value : {};
    expect(value.futur).toEqual({ a: 1 });
    expect((value.settings as Record<string, unknown>).nouveauReglage).toBe(true);
    expect(value.publishedBy).toEqual({ accountId: "u2", displayName: "Alex Martin" });
  });

  it("une valeur illisible n'est jamais écrasée", async () => {
    for (const stored of [["tableau"], "texte", { version: 2, settings: {} }] as JsonValue[]) {
      const jira = fakeJira(stored);
      await expect(publish(jira, null)).rejects.toBeInstanceOf(JiraError);
      expect(jira.writes).toEqual([]);
    }
  });
});

describe("réglages publiés avant 0.21.0 (RUN devenu Kanban)", () => {
  // Forme exacte du document publié sur le board de Denis le 24/09/2026 (valeurs réduites).
  const legacyColumns = [{ id: "col-0-A faire", name: "A faire", hidden: false, wipLimit: null }];
  const legacy = {
    version: 1,
    publishedAt: "2026-09-24T08:33:04.800Z",
    publishedBy: { accountId: "u1", displayName: "Camille Durand" },
    settings: {
      scrumColumns: legacyColumns,
      runColumns: legacyColumns,
      issueTypes: [
        { id: "10415", name: "Anomalie Prod", category: "RUN", countsAsBug: null },
        { id: "10001", name: "Story", category: "SCRUM", countsAsBug: null },
      ],
      showRunSection: false,
      buildSectionLabel: "Build",
      agingThresholdDays: 3,
      blockedLabels: [],
      goalSource: "atlassianGoals",
      boardGoalIds: [],
      goalColorIndex: {},
      blockOrder: ["run", "goal:g1", "build"],
      hiddenGoalIds: [],
      cardFields: [],
      cardColorRules: [],
    },
  };

  it("se relit : catégorie, colonnes, affichage et ordre passent au Kanban", () => {
    const settings = decodeTeamDocument(legacy)?.settings;
    expect(settings?.issueTypes.map((type) => type.category)).toEqual(["KANBAN", "SCRUM"]);
    expect(settings?.kanbanColumns.map((c) => c.name)).toEqual(["A faire"]);
    expect(settings?.showKanbanSection).toBe(false);
    expect(settings?.blockOrder).toEqual(["kanban", "goal:g1", "build"]);
    // Jamais publié : le nom par défaut.
    expect(settings?.kanbanSectionLabel).toBe("Kanban");
  });

  it("republier écrit le nouveau format, sans garder les anciennes clés", async () => {
    const jira = fakeJira(legacy as JsonValue);
    expect((await publish(jira, legacy.publishedAt)).kind).toBe("published");
    const write = jira.writes[0];
    const settings = (write?.kind === "boardProperty.put" ? write.value.settings : {}) as Record<
      string,
      unknown
    >;
    expect(settings.runColumns).toBeUndefined();
    expect(settings.showRunSection).toBeUndefined();
    // Goals associés au board, retirés en 0.22.4.
    expect(settings.boardGoalIds).toBeUndefined();
    expect(settings.kanbanColumns).toBeDefined();
    expect(settings.kanbanSectionLabel).toBe(tuned.kanbanSectionLabel);
  });

  it("le nom de la swimlane Kanban est partagé avec l'équipe", () => {
    const named = { ...tuned, kanbanSectionLabel: "Run" };
    expect(teamSettingsOf(named).kanbanSectionLabel).toBe("Run");
    expect(withTeamSettings(base, teamSettingsOf(named)).kanbanSectionLabel).toBe("Run");
  });
});
