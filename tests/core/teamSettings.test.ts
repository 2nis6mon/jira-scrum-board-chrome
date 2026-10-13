import { describe, expect, it } from "vitest";
import {
  withSwimlaneHidden,
  withSwimlaneName,
  withTypeDestination,
} from "../../src/core/boardSettings";
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
import { column, makeConfiguration, STORY_TYPE, SWIMLANE_TYPE } from "../support/jiraFixtures";

// Données FICTIVES. Réglages d'équipe : propriété du board, publiée sur un geste explicite.

const base = makeConfiguration();
/** Configuration réglée par une personne de l'équipe. */
const tuned = {
  ...base,
  issueTypes: base.issueTypes.map((type) =>
    type.id === "10001" ? { ...type, countsAsBug: true } : type,
  ),
  buildSectionLabel: "Sprint Backlog",
  agingThresholdDays: 5,
  goalColorIndex: { g1: 4 },
  blockOrder: ["build", "goal:g1"],
  hiddenGoalIds: ["g2"],
  // Réglages personnels : jamais partagés.
  collapsedBlockIds: ["swimlane:1"],
  autoRefreshSeconds: 120,
};

/** Types partagés dont les tickets peuvent être uniquement dans le backlog ou un autre sprint. */
const sharedTypesConfiguration = makeConfiguration({
  issueTypes: [
    STORY_TYPE,
    { ...SWIMLANE_TYPE, countsAsBug: true },
    { ...SWIMLANE_TYPE, id: "10006", name: "Demande de service", countsAsBug: false },
    { ...STORY_TYPE, id: "10007", name: "Sous-tâche", category: "IGNORED" },
  ],
  ticketSwimlanes: [{ id: "run", name: "RUN", typeIds: ["10004", "10006"], hidden: true }],
  blockOrder: ["swimlane:run", "build"],
});

describe("réglages d'équipe ↔ configuration", () => {
  it("un autre poste qui applique les réglages retrouve les mêmes, sans ses réglages personnels", () => {
    const settings = teamSettingsOf(tuned);
    const elsewhere = withTeamSettings(base, settings);
    expect(teamSettingsOf(elsewhere)).toEqual(settings);
    expect(elsewhere.collapsedBlockIds).toEqual(base.collapsedBlockIds);
    expect(elsewhere.autoRefreshSeconds).toBe(base.autoRefreshSeconds);
    expect(teamDifferences(elsewhere, settings)).toEqual([]);
  });

  it("les colonnes restent celles de Jira, même renommées ou masquées par une version précédente", () => {
    const local = {
      ...base,
      columns: [...base.columns, { ...column("col-9-Recette", "Recette", ["8"], 9), wipLimit: 2 }],
    };
    const published = {
      ...(encodeTeamDocument(DOCUMENT).settings as object),
      scrumColumns: [
        { id: "prog", name: "Développement", hidden: true, wipLimit: 3 },
        { id: "col-9-Recette", name: "QA", hidden: false, wipLimit: null },
      ],
      blockedLabels: ["bloqué"],
    };
    const settings = decodeTeamDocument({
      ...encodeTeamDocument(DOCUMENT),
      settings: published,
    })?.settings;
    if (!settings) throw new Error("réglages attendus");
    expect(settings).toEqual(DOCUMENT.settings);
    expect(withTeamSettings(local, settings).columns).toEqual(local.columns);
  });

  it("un premier chargement sans types locaux conserve tous les types et regroupements partagés", () => {
    const settings = teamSettingsOf(sharedTypesConfiguration);
    const applied = withTeamSettings(makeConfiguration({ issueTypes: [] }), settings);

    expect(applied.issueTypes).toEqual(sharedTypesConfiguration.issueTypes);
    expect(applied.ticketSwimlanes).toEqual([
      { id: "run", name: "RUN", typeIds: ["10004", "10006"], hidden: true },
    ]);
    expect(applied.blockOrder).toEqual(["swimlane:run", "build"]);
    expect(teamDifferences(applied, settings)).toEqual([]);
  });

  it("conserve les métadonnées Jira connues et le réglage local d'un type absent de l'équipe", () => {
    const known = {
      ...SWIMLANE_TYPE,
      name: "Incident de production",
      iconUrl: "https://acme.atlassian.net/issuetype/10004.png",
      category: "GOAL" as const,
      countsAsBug: false,
    };
    const newType = { ...STORY_TYPE, id: "10008", name: "Nouveau type" };
    const local = makeConfiguration({ issueTypes: [known, newType] });
    const applied = withTeamSettings(local, teamSettingsOf(sharedTypesConfiguration));

    expect(applied.issueTypes.find((type) => type.id === known.id)).toEqual({
      ...known,
      category: "SWIMLANE",
      countsAsBug: true,
    });
    expect(applied.issueTypes.find((type) => type.id === newType.id)).toEqual(newType);
    expect(applied.issueTypes.map((type) => type.id)).toEqual([
      "10004",
      "10008",
      "10001",
      "10006",
      "10007",
    ]);
    expect(applied.ticketSwimlanes).toEqual(sharedTypesConfiguration.ticketSwimlanes);
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
      "Nom de Build, seuil de vieillissement",
    ]);
    expect(
      teamDifferences(
        { ...changed, cardFields: [{ kind: "labels" }], hiddenGoalIds: [] },
        settings,
      ),
    ).toEqual(["Objectifs masqués", "Champs des cartes"]);
    expect(TEAM_FAMILIES).toHaveLength(10);
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

  it("une version inconnue, ou sans types, n'est pas interprétée", () => {
    const encoded = encodeTeamDocument(DOCUMENT);
    expect(decodeTeamDocument({ ...encoded, version: 2 })).toBeNull();
    expect(decodeTeamDocument({ ...encoded, settings: { scrumColumns: [] } })).toBeNull();
    // Les colonnes ne sont plus lues (0.31.0) : leur absence n'empêche rien.
    expect(
      decodeTeamDocument({ ...encoded, settings: { issueTypes: [] } })?.settings.issueTypes,
    ).toEqual([]);
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
    columns: base.columns,
    basePublishedAt,
    publishedBy: { accountId: "u2", displayName: "Alex Martin" },
    now: new Date("2026-09-19T09:30:12.345Z"),
  });

describe("publier les réglages d'équipe", () => {
  it("modifier un autre réglage republie aussi les types et swimlanes absents du sprint chargé", async () => {
    const settings = teamSettingsOf(sharedTypesConfiguration);
    const stored = { ...DOCUMENT, settings };
    const jira = fakeJira(encodeTeamDocument(stored));
    // Le snapshot courant ne fournit qu'une Story : les autres types restent ceux de l'équipe.
    const loaded = withTeamSettings(makeConfiguration({ issueTypes: [STORY_TYPE] }), settings);
    const outcome = await publishTeamSettings(jira.reader, jira.writer as never, {
      boardId: 7,
      settings: teamSettingsOf({ ...loaded, agingThresholdDays: 8 }),
      columns: loaded.columns,
      basePublishedAt: stored.publishedAt,
      publishedBy: { accountId: "u2", displayName: "Alex Martin" },
      now: new Date("2026-09-19T09:30:12.345Z"),
    });

    expect(outcome.kind).toBe("published");
    expect(jira.writes).toHaveLength(1);
    const write = jira.writes[0];
    const published = decodeTeamDocument(write?.kind === "boardProperty.put" ? write.value : null);
    expect(published?.settings).toEqual({ ...settings, agingThresholdDays: 8 });
  });

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
    // Les versions d'avant 0.31.0 exigent des colonnes : celles de Jira, telles quelles.
    const jiraColumns = base.columns.map(({ id, name, hidden, wipLimit }) => ({
      id,
      name,
      hidden,
      wipLimit,
    }));
    expect(written?.settings).toMatchObject({
      scrumColumns: jiraColumns,
      kanbanColumns: jiraColumns,
    });
  });

  it("colonnes et labels de blocage d'une version précédente sont réécrits sans changement", async () => {
    const columns = [{ id: "prog", name: "Développement", hidden: true, wipLimit: 3 }];
    const stored = {
      ...encodeTeamDocument(DOCUMENT),
      settings: {
        ...(encodeTeamDocument(DOCUMENT).settings as object),
        scrumColumns: columns,
        kanbanColumns: columns,
        blockedLabels: ["bloqué"],
      },
    };
    const jira = fakeJira(stored as JsonValue);
    expect((await publish(jira, DOCUMENT.publishedAt)).kind).toBe("published");
    const write = jira.writes[0];
    const settings = (write?.kind === "boardProperty.put" ? write.value.settings : {}) as Record<
      string,
      unknown
    >;
    expect(settings.scrumColumns).toEqual(columns);
    expect(settings.kanbanColumns).toEqual(columns);
    expect(settings.blockedLabels).toEqual(["bloqué"]);
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

  it("propriété supprimée depuis la relecture : conflit, pas de recréation silencieuse", async () => {
    const jira = fakeJira(null);
    expect(await publish(jira, DOCUMENT.publishedAt)).toEqual({ kind: "conflict", current: null });
    expect(jira.writes).toEqual([]);
  });

  it("deux publications au même instant gardent des versions distinctes", async () => {
    const publishedAt = "2026-09-19T09:30:12.345Z";
    const jira = fakeJira(encodeTeamDocument({ ...DOCUMENT, publishedAt }));
    const result = await publish(jira, publishedAt);
    expect(result.kind === "published" ? result.document.publishedAt : null).toBe(
      "2026-09-19T09:30:12.346Z",
    );
  });

  it("les Goals épinglés au board sont partagés et restent distincts des épinglages locaux", () => {
    const settings = teamSettingsOf({
      ...tuned,
      boardPinnedGoalIds: ["goal-1", "goal-2"],
      localPinnedGoalIds: { "42": ["local"] },
    });
    const applied = withTeamSettings(base, settings);
    expect(applied.boardPinnedGoalIds).toEqual(["goal-1", "goal-2"]);
    expect(applied.localPinnedGoalIds).toEqual({});
    expect(
      decodeTeamDocument(encodeTeamDocument({ ...DOCUMENT, settings }))?.settings
        .boardPinnedGoalIds,
    ).toEqual(["goal-1", "goal-2"]);
  });

  it("une valeur illisible n'est jamais écrasée", async () => {
    for (const stored of [["tableau"], "texte", { version: 2, settings: {} }] as JsonValue[]) {
      const jira = fakeJira(stored);
      await expect(publish(jira, null)).rejects.toBeInstanceOf(JiraError);
      expect(jira.writes).toEqual([]);
    }
  });
});

describe("réglages publiés avant 0.21.0 (RUN, puis Kanban)", () => {
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

  it("se relit : une swimlane par type « 1 », masquée, à sa place dans l'ordre", () => {
    const settings = decodeTeamDocument(legacy)?.settings;
    expect(settings?.issueTypes.map((type) => type.category)).toEqual(["KANBAN", "SCRUM"]);
    expect(settings?.ticketSwimlanes).toEqual([
      { id: "1", name: "", typeIds: ["10415"], hidden: true },
    ]);
    expect(settings?.blockOrder).toEqual(["swimlane:1", "goal:g1", "build"]);
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
    expect(settings.ticketSwimlanes).toEqual(teamSettingsOf(tuned).ticketSwimlanes);
    // Colonnes encore lues par les versions d'avant 0.31.0 : gardées.
    expect(settings.scrumColumns).toEqual(legacyColumns);
  });
});

describe("compatibilité avec la 0.22.7, sur le même board", () => {
  const recette = { ...SWIMLANE_TYPE, id: "10005", name: "Anomalie de Recette" };
  const service = { ...SWIMLANE_TYPE, id: "10006", name: "Demande de service" };
  const three = makeConfiguration({ issueTypes: [STORY_TYPE, SWIMLANE_TYPE, recette, service] });
  // RUN : Anomalie Prod et Anomalie de Recette ; OPS : Demande de service.
  const split = withSwimlaneName(
    withSwimlaneName(withTypeDestination(three, "10006", { kind: "newSwimlane" }), "1", "RUN"),
    "2",
    "OPS",
  );

  it("écrit, pour elle, les anciennes clés déduites : une seule swimlane Kanban", () => {
    const settings = teamSettingsOf({ ...split, dailyStockLimit: 5 });
    expect(settings.issueTypes.map((type) => type.category)).toEqual([
      "SCRUM",
      "KANBAN",
      "KANBAN",
      "KANBAN",
    ]);
    expect(settings.showKanbanSection).toBe(true);
    expect(settings.kanbanSectionLabel).toBe("RUN / OPS");
    expect(settings.dailyKanbanStockLimit).toBe(5);
    expect(
      teamSettingsOf(withSwimlaneHidden(withSwimlaneHidden(split, "1", true), "2", true))
        .showKanbanSection,
    ).toBe(false);
  });

  it("relit ce qu'elle a réécrit : types changés par elle, swimlanes gardées telles quelles", () => {
    const settings = teamSettingsOf(split);
    // La 0.22.7 a remis « Anomalie de Recette » par objectif et classé un nouveau type en Kanban ;
    // elle a gardé `ticketSwimlanes`, clé qu'elle ne connaît pas.
    const rewritten = {
      ...settings,
      issueTypes: [
        ...settings.issueTypes.map((type) =>
          type.id === "10005" ? { ...type, category: "SCRUM" as const } : type,
        ),
        { id: "10007", name: "Incident", category: "KANBAN" as const, countsAsBug: null },
      ],
    };
    const local = makeConfiguration({
      issueTypes: [
        STORY_TYPE,
        SWIMLANE_TYPE,
        recette,
        service,
        { ...service, id: "10007", name: "Incident" },
      ],
    });
    const applied = withTeamSettings(local, rewritten);
    expect(
      applied.ticketSwimlanes.map((swimlane) => [swimlane.id, swimlane.name, swimlane.typeIds]),
    ).toEqual([
      ["1", "RUN", ["10004", "10007"]],
      ["2", "OPS", ["10006"]],
    ]);
    expect(applied.issueTypes.find((type) => type.id === "10005")?.category).toBe("GOAL");
  });

  it("noms et masquage des swimlanes par type sont partagés avec l'équipe", () => {
    const applied = withTeamSettings(three, teamSettingsOf(withSwimlaneHidden(split, "2", true)));
    expect(applied.ticketSwimlanes.map(({ name, hidden }) => [name, hidden])).toEqual([
      ["RUN", false],
      ["OPS", true],
    ]);
  });
});
