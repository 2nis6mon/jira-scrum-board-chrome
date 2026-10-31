import { describe, expect, it } from "vitest";
import {
  boardLocalPinnedGoalIds,
  localPinnedGoalIdsIn,
  pinnableSprints,
  pinnedGoalIdsIn,
  pinnedGoalsStorage,
  saveBoardPinnedGoals,
} from "../../src/core/pinnedGoals";
import {
  decodeTeamDocument,
  encodeTeamDocument,
  type TeamDocument,
  teamSettingsOf,
} from "../../src/core/teamSettings";
import type { JsonValue } from "../../src/jira/json";
import { BOARD_PROPERTY_KEYS, type JiraWrite } from "../../src/jira/writes";
import { makeConfiguration, makeSprint } from "../support/jiraFixtures";

// Données FICTIVES. Un seul résolveur choisit où sont stockés les Goals épinglés (AD-4).

const scrum = makeConfiguration({ boardId: 7, boardName: "Board Scrum" });
const kanban = makeConfiguration({
  boardId: 9,
  boardName: "Board Kanban",
  boardType: "kanban",
  goalSource: "atlassianGoals",
  boardPinnedGoalIds: ["g-board"],
});
const sprint = makeSprint("2026-09-12T09:00:00.000+0200");

describe("stockage des Goals épinglés", () => {
  it("Scrum avec sprint actif : propriété du sprint de référence, sélection lue dans le snapshot", () => {
    const snapshot = { sprint, pinnedGoalIds: ["g-sprint"] };
    const storage = pinnedGoalsStorage(scrum, snapshot);
    expect(storage).toEqual({ kind: "sprint", sprintId: 42, sprintName: "Sprint 42" });
    expect(pinnedGoalIdsIn(storage, scrum, snapshot)).toEqual(["g-sprint"]);
    // Propriété du sprint illisible : sélection inconnue.
    expect(pinnedGoalIdsIn(storage, scrum, { pinnedGoalIds: null })).toBeNull();
  });

  it("Kanban : réglages du board, sélection lue dans la configuration, même sans snapshot", () => {
    const storage = pinnedGoalsStorage(kanban, null);
    expect(storage).toEqual({ kind: "board", boardId: 9, boardName: "Board Kanban" });
    expect(pinnedGoalIdsIn(storage, kanban, { pinnedGoalIds: ["autre"] })).toEqual(["g-board"]);
    expect(pinnedGoalsStorage(kanban, { sprint })).toEqual(storage);
  });

  it("Scrum sans sprint actif : indisponible, comme dans Jira", () => {
    const storage = pinnedGoalsStorage(scrum, { sprint: null });
    expect(storage).toEqual({ kind: "unavailable" });
    expect(pinnedGoalIdsIn(storage, scrum, { pinnedGoalIds: ["g"] })).toBeNull();
    expect(pinnedGoalsStorage(scrum, null)).toEqual({ kind: "unavailable" });
    expect(pinnedGoalsStorage(null, { sprint })).toEqual({ kind: "unavailable" });
  });
});

describe("sprint de l'épinglage, avec plusieurs sprints actifs", () => {
  const second = { ...sprint, id: 43, name: "Sprint 43" };
  const foreign = { ...sprint, id: 77, name: "Sprint d'une autre équipe", originBoardId: 99 };
  // Sprints du board 42 et 43, plus un sprint étranger 77 remonté par un ticket partagé.
  const snapshot = {
    sprint,
    activeSprints: [sprint, second, foreign],
    goalSprintIds: [42, 43],
    pinnedGoalIds: ["g-42"],
    sprintPinnedGoalIds: { 42: ["g-42"], 43: ["g-43"] },
    localPinnedGoalIds: null,
    sprintLocalPinnedGoalIds: { 43: ["g-local"] },
  };

  it("propose les sprints du board dans l'ordre d'affichage, jamais l'étranger", () => {
    expect(pinnableSprints(scrum, snapshot)).toEqual([
      { id: 42, name: "Sprint 42" },
      { id: 43, name: "Sprint 43" },
    ]);
  });

  it("aucun choix avec un seul sprint du board, en Kanban ou sans sprint actif", () => {
    expect(pinnableSprints(scrum, { ...snapshot, goalSprintIds: [42] })).toEqual([]);
    expect(pinnableSprints(scrum, { sprint, activeSprints: [sprint, foreign] })).toEqual([]);
    expect(pinnableSprints(kanban, snapshot)).toEqual([]);
    expect(pinnableSprints(scrum, { ...snapshot, sprint: null })).toEqual([]);
    expect(pinnableSprints(null, snapshot)).toEqual([]);
  });

  it("le sprint choisi porte l'épinglage ; sans choix, le sprint principal", () => {
    const chosen = pinnedGoalsStorage(scrum, snapshot, 43);
    expect(chosen).toEqual({ kind: "sprint", sprintId: 43, sprintName: "Sprint 43" });
    expect(pinnedGoalIdsIn(chosen, scrum, snapshot)).toEqual(["g-43"]);
    expect(localPinnedGoalIdsIn(chosen, snapshot)).toEqual(["g-local"]);
    const main = pinnedGoalsStorage(scrum, snapshot);
    expect(main).toEqual({ kind: "sprint", sprintId: 42, sprintName: "Sprint 42" });
    expect(pinnedGoalsStorage(scrum, snapshot, null)).toEqual(main);
    expect(pinnedGoalIdsIn(main, scrum, snapshot)).toEqual(["g-42"]);
    expect(localPinnedGoalIdsIn(main, snapshot)).toBeNull();
  });

  it("un sprint étranger ou disparu ramène au sprint principal ; Kanban ignore le choix", () => {
    expect(pinnedGoalsStorage(scrum, snapshot, 77)).toMatchObject({ sprintId: 42 });
    expect(pinnedGoalsStorage(scrum, { ...snapshot, goalSprintIds: [42] }, 43)).toMatchObject({
      sprintId: 42,
    });
    expect(pinnedGoalsStorage(kanban, snapshot, 43)).toMatchObject({ kind: "board" });
  });

  it("propriété du sprint choisi illisible : sélection inconnue", () => {
    const chosen = pinnedGoalsStorage(scrum, snapshot, 43);
    expect(
      pinnedGoalIdsIn(chosen, scrum, { ...snapshot, sprintPinnedGoalIds: { 42: [] } }),
    ).toBeNull();
  });

  it("la bannière du repli local cumule les sprints du board", () => {
    expect(
      boardLocalPinnedGoalIds({
        localPinnedGoalIds: ["a"],
        sprintLocalPinnedGoalIds: { 42: ["a", "b"], 43: ["b", "c"] },
      }),
    ).toEqual(["a", "b", "c"]);
    expect(boardLocalPinnedGoalIds({ localPinnedGoalIds: ["a"] })).toEqual(["a"]);
    expect(
      boardLocalPinnedGoalIds({ localPinnedGoalIds: null, sprintLocalPinnedGoalIds: {} }),
    ).toBeNull();
  });
});

const DOCUMENT: TeamDocument = {
  version: 1,
  publishedAt: "2026-09-18T08:00:00.000Z",
  publishedBy: { accountId: "u1", displayName: "Camille Durand" },
  settings: teamSettingsOf({ ...kanban, boardPinnedGoalIds: ["g1"] }),
};

/** Faux Jira : la propriété du board, et les écritures demandées. */
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

const save = (jira: ReturnType<typeof fakeJira>, base: string[], selection: string[]) =>
  saveBoardPinnedGoals(jira.reader, jira.writer as never, {
    boardId: 9,
    base,
    selection,
    configuration: () => kanban,
    publishedBy: { accountId: "u2", displayName: "Alex Martin" },
    now: new Date("2026-09-19T09:30:12.345Z"),
  });

describe("épingler des Goals au board Kanban", () => {
  it("relit les réglages et n'y remplace que la sélection : une seule écriture", async () => {
    const jira = fakeJira(encodeTeamDocument(DOCUMENT));
    const outcome = await save(jira, ["g1"], ["g1", "g2"]);
    expect(outcome.kind).toBe("pinned");
    expect(jira.writes).toHaveLength(1);
    const [write] = jira.writes;
    expect(write).toMatchObject({
      kind: "boardProperty.put",
      boardId: 9,
      key: BOARD_PROPERTY_KEYS.teamSettings,
    });
    const published = decodeTeamDocument(write?.kind === "boardProperty.put" ? write.value : null);
    expect(published?.settings).toEqual({ ...DOCUMENT.settings, boardPinnedGoalIds: ["g1", "g2"] });
    if (outcome.kind === "pinned") expect(outcome.document.settings).toEqual(published?.settings);
  });

  it("conflit : la sélection de Jira n'est plus celle affichée, rien n'est écrit", async () => {
    const jira = fakeJira(encodeTeamDocument(DOCUMENT));
    const outcome = await save(jira, [], ["g2"]);
    expect(outcome).toEqual({ kind: "conflict", current: DOCUMENT });
    expect(jira.writes).toEqual([]);
  });

  it("conflit à la publication : réglages republiés entre la relecture et l'écriture", async () => {
    const republished: TeamDocument = { ...DOCUMENT, publishedAt: "2026-09-19T09:00:00.000Z" };
    const jira = fakeJira(encodeTeamDocument(DOCUMENT));
    let reads = 0;
    // Première lecture : celle de l'épinglage ; la suivante, celle de la publication.
    jira.reader.boardProperty = async () =>
      encodeTeamDocument(reads++ === 0 ? DOCUMENT : republished);
    const outcome = await save(jira, ["g1"], ["g1", "g2"]);
    expect(outcome).toEqual({ kind: "conflict", current: republished });
    expect(jira.writes).toEqual([]);
  });

  it("conflit sans réglages publiés : la sélection affichée n'existe plus dans Jira", async () => {
    const jira = fakeJira(null);
    const outcome = await save(jira, ["g1"], []);
    expect(outcome).toEqual({ kind: "conflict", current: null });
    expect(jira.writes).toEqual([]);
  });

  it("rien à changer : Jira porte déjà la sélection, aucune écriture", async () => {
    const jira = fakeJira(encodeTeamDocument({ ...DOCUMENT, settings: { ...DOCUMENT.settings } }));
    const outcome = await save(jira, ["g1"], ["g1"]);
    expect(outcome).toEqual({ kind: "unchanged" });
    expect(jira.writes).toEqual([]);
  });

  it("réglages dans un format inconnu : jamais écrasés", async () => {
    const jira = fakeJira({ version: 99, settings: {} });
    const outcome = await save(jira, [], ["g1"]);
    expect(outcome).toEqual({ kind: "unreadable" });
    expect(jira.writes).toEqual([]);
  });
});
