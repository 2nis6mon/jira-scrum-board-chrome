import { describe, expect, it } from "vitest";
import {
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
