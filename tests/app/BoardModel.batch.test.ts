import { describe, expect, it } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { BUILD_BLOCK, goalBlock } from "../../src/core/boardBlocks";
import { normalizeSiteUrl } from "../../src/jira/site";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { atlassianGoalsPlatform } from "../support/atlassianGoalsBoard";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT, SPRINT_ISSUES } from "../support/boardFixture";
import { type FakeJira, isWriteRequest, type Reply } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { type FakeGoal, goalsGateway } from "../support/goalsGateway";
import { issueJson } from "../support/jiraFixtures";

// Story 8.33 : une sélection de plusieurs cartes du board ne change que d'objectif, en une
// écriture par sprint en texte, ou un lien par ticket en Goals Atlassian. Données FICTIVES.

const SITE = normalizeSiteUrl("acme.atlassian.net");
const NOW = new Date("2026-09-18T10:00:00Z");
const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;

function textJira(issues: unknown[] = SPRINT_ISSUES) {
  let stored = {
    ...GOALS_DOCUMENT,
    links: { ...GOALS_DOCUMENT.links } as Record<string, string>,
  };
  const jira = boardSiteJira({ sprintIssues: issues })
    .on("GET", PROPERTY, () => ({ status: 200, json: { value: stored } }))
    .on("PUT", PROPERTY, (request) => {
      stored = request.body as typeof stored;
      return { status: 200 };
    });
  return { jira, links: () => stored.links };
}

async function boardWith(jira: FakeJira) {
  const board = new BoardModel(SITE, fakePlatform(jira), { now: () => NOW });
  await board.load();
  await board.detect(BOARD_URL);
  const before = jira.requests.length;
  const writes = () => jira.requests.slice(before).filter(isWriteRequest);
  return { board, writes };
}

function select(board: BoardModel, ...keys: string[]) {
  for (const key of keys) board.cardSelection.toggle(key);
}

describe("lot de cartes du board — objectifs du texte du sprint", () => {
  it("glisser deux cartes sélectionnées vers un objectif : une seule E5, ni transition ni rang", async () => {
    const { jira, links } = textJira();
    const { board, writes } = await boardWith(jira);
    select(board, "ABC-104", "ABC-105");
    board.startDrag("ABC-105", null);
    expect(board.dragging.value?.keys).toEqual(["ABC-104", "ABC-105"]);
    // Un lot ne change jamais de colonne : aucune transition lue.
    expect(jira.sent("GET", "/rest/api/3/issue/ABC-105/transitions")).toEqual([]);
    expect(board.acceptsDrag(goalBlock("g-stabilite"))).toBe(true);

    await board.dropOnLane("ABC-105", goalBlock("g-stabilite"));
    board.endDrag();

    expect(writes().map((request) => `${request.method} ${request.path}`)).toEqual([
      `PUT ${PROPERTY}`,
    ]);
    expect(links()).toMatchObject({ "ABC-104": "g-stabilite", "ABC-105": "g-stabilite" });
    expect(board.selectedKeys.value.size).toBe(0);
    expect(board.writeNotice.value).toBeNull();
    const entries = await board.audit.list(SITE.origin);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "rattachement",
      issueKey: null,
      to: "Améliorer la stabilité",
      outcome: "réussi",
      detailMessage: {
        key: "Tickets {p0} : {p1}",
        params: { p0: "ABC-104, ABC-105", p1: { key: "propriété du sprint" } },
      },
    });
  });

  it("la swimlane de départ est aussi une zone entière ; un ticket déjà rattaché n'est pas réécrit", async () => {
    const { jira, links } = textJira();
    const { board, writes } = await boardWith(jira);
    select(board, "ABC-101", "ABC-105");
    board.startDrag("ABC-101", null);
    // ABC-101 est déjà sous « Finaliser le parcours de paiement » : seul ABC-105 change.
    await board.dropOnLane("ABC-101", goalBlock("g-paiement"));
    board.endDrag();
    expect(writes().map((request) => request.path)).toEqual([PROPERTY]);
    expect(links()).toMatchObject({ "ABC-101": "g-paiement", "ABC-105": "g-paiement" });
  });

  it("swimlane qui refuse un ticket du lot : indisponible, rien n'est écrit", async () => {
    const { jira } = textJira();
    const { board, writes } = await boardWith(jira);
    // RUN-7 (swimlane RUN) et ABC-105 (Build) : seuls les objectifs les acceptent tous deux.
    select(board, "RUN-7", "ABC-105");
    board.startDrag("ABC-105", null);
    expect(board.acceptsDrag(BUILD_BLOCK)).toBe(false);
    expect(board.acceptsDrag(goalBlock("g-paiement"))).toBe(true);
    await board.dropOnLane("ABC-105", BUILD_BLOCK);
    board.endDrag();
    expect(writes()).toEqual([]);
    expect(board.selectedKeys.value.size).toBe(2);
  });

  it("lien modifié dans Jira depuis le chargement : rien n'est écrit, à refaire, sélection gardée", async () => {
    const { jira } = textJira();
    const { board, writes } = await boardWith(jira);
    jira.on("GET", PROPERTY, {
      status: 200,
      json: {
        value: { ...GOALS_DOCUMENT, links: { ...GOALS_DOCUMENT.links, "ABC-105": "g-paiement" } },
      },
    });
    select(board, "ABC-104", "ABC-105");
    board.startDrag("ABC-104", null);
    await board.dropOnLane("ABC-104", goalBlock("g-stabilite"));
    board.endDrag();
    expect(writes()).toEqual([]);
    expect(board.writeNotice.value).toMatchObject({
      tone: "warning",
      text: "Ce ticket a été modifié par quelqu'un d'autre depuis le chargement. À refaire : ABC-104, ABC-105.",
      issueKey: "ABC-105",
    });
    expect([...board.selectedKeys.value].sort()).toEqual(["ABC-104", "ABC-105"]);
    const entries = await board.audit.list(SITE.origin);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ issueKey: null, outcome: "échec" });
  });

  it("plus de 50 tickets : refus avant toute écriture", async () => {
    const many = Array.from({ length: 51 }, (_, index) =>
      issueJson(`ABC-${200 + index}`, { statusId: "1", statusName: "À faire" }),
    );
    const { jira } = textJira([...SPRINT_ISSUES, ...many]);
    const { board, writes } = await boardWith(jira);
    select(board, ...many.map((issue) => (issue as { key: string }).key));
    board.startDrag("ABC-200", null);
    await board.dropOnLane("ABC-200", goalBlock("g-stabilite"));
    board.endDrag();
    expect(writes()).toEqual([]);
    expect(board.writeNotice.value?.text).toBe("Lot de 51 tickets : au plus 50 par geste.");
  });

  it("menu d'une carte de la sélection : objectifs pour tout le lot, rang désactivé", async () => {
    const { jira, links } = textJira();
    const { board, writes } = await boardWith(jira);
    select(board, "ABC-102", "ABC-105");
    const options = board.cardMenuOptions("ABC-105");
    expect(options?.keys).toEqual(["ABC-102", "ABC-105"]);
    expect(options?.sendToGoal.goals.map((goal) => goal.id)).toEqual(["g-paiement", "g-stabilite"]);
    expect(options?.sendToGoal.canDetach).toBe(true);
    expect(options?.top.blocked).toBe("selection");
    expect(options?.bottom.blocked).toBe("selection");
    await board.rankToEdge("ABC-105", "top");
    expect(writes()).toEqual([]);

    await board.sendToGoal("ABC-105", "g-stabilite");
    expect(writes().map((request) => request.path)).toEqual([PROPERTY]);
    expect(links()).toMatchObject({ "ABC-102": "g-stabilite", "ABC-105": "g-stabilite" });
    expect(board.selectedKeys.value.size).toBe(0);
  });

  it("une carte hors de la sélection se glisse seule", async () => {
    const { jira } = textJira();
    const { board } = await boardWith(jira);
    select(board, "ABC-102", "ABC-104");
    board.startDrag("ABC-105", null);
    expect(board.dragging.value?.keys).toEqual(["ABC-105"]);
    board.endDrag();
  });
});

describe("lot de cartes du board — Goals Atlassian", () => {
  const PAIEMENT = "ari:cloud:townsquare:c:goal/paiement";
  const STABILITE = "ari:cloud:townsquare:c:goal/stabilite";
  const GOALS: FakeGoal[] = [
    {
      id: PAIEMENT,
      key: "GOAL-1",
      name: "Paiement en une étape",
      status: "on_track",
      workItems: ["ABC-101", "ABC-102"],
    },
    {
      id: STABILITE,
      key: "GOAL-2",
      name: "Zéro incident",
      status: "at_risk",
      workItems: ["ABC-103"],
    },
  ];

  async function goalsBoard(
    refuse?: (input: { workItemId: string }, field: string) => Reply | null,
  ) {
    const mutations: { field: string; goalId: string; workItemId: string }[] = [];
    const jira = boardSiteJira({
      graphql: goalsGateway({
        goals: GOALS,
        mutation: (input, field) => {
          mutations.push({ field, ...input });
          return (
            refuse?.(input, field) ?? {
              status: 200,
              json: { data: { [field]: { success: true } } },
            }
          );
        },
      }),
    });
    const board = new BoardModel(SITE, await atlassianGoalsPlatform(jira), { now: () => NOW });
    await board.load();
    await board.detect(BOARD_URL);
    return { board, mutations };
  }

  it("détacher puis lier ticket par ticket ; arrêt au premier refus, tickets confirmés et à refaire", async () => {
    const issueId = (key: string) =>
      (SPRINT_ISSUES.find((issue) => (issue as { key: string }).key === key) as { id: string }).id;
    const { board, mutations } = await goalsBoard((input, field) =>
      field.includes("link") &&
      !field.includes("unlink") &&
      input.workItemId.endsWith(`/${issueId("ABC-104")}`)
        ? {
            status: 200,
            json: { data: { [field]: { success: false, errors: [{ message: "Refusé" }] } } },
          }
        : null,
    );
    select(board, "ABC-102", "ABC-104", "ABC-105");
    board.startDrag("ABC-102", null);
    await board.dropOnLane("ABC-102", goalBlock(STABILITE));
    board.endDrag();
    // ABC-102 : détaché de Paiement (E4) puis lié (E3) ; ABC-104 : lien refusé ; ABC-105 non tenté.
    expect(
      mutations.map((m) => [
        m.field.includes("unlink") ? "E4" : "E3",
        m.workItemId.split("/").pop(),
      ]),
    ).toEqual([
      ["E4", issueId("ABC-102")],
      ["E3", issueId("ABC-102")],
      ["E3", issueId("ABC-104")],
    ]);
    expect(board.writeNotice.value?.text).toBe(
      "Atlassian a refusé de rattacher le ticket au Goal. Tickets confirmés : ABC-102. À refaire : ABC-104, ABC-105.",
    );
    expect([...board.selectedKeys.value].sort()).toEqual(["ABC-104", "ABC-105"]);
    const entries = await board.audit.list(SITE.origin);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "rattachement", issueKey: null, outcome: "échec" });
  });
});
