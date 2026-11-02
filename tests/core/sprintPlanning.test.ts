import { describe, expect, it } from "vitest";
import type { GoalsReader } from "../../src/core/atlassianGoals";
import { CoreError } from "../../src/core/reasons";
import { makeSprintGoal, type SprintGoal, stableGoalIds } from "../../src/core/sprintGoals";
import {
  carryOverGoals,
  goalTextKeepingLines,
  loadSprintPlanning,
  type PlanningGoalLinks,
  type PlanningReader,
  type PlanningSnapshot,
  pinPlanningGoals,
  placePlanningIssue,
  removePlanningIssue,
  savePlanningVelocity,
  writeTextGoals,
} from "../../src/core/sprintPlanning";
import type { IssueQuery } from "../../src/jira/client";
import { JiraError } from "../../src/jira/errors";
import type { LinkOutcome } from "../../src/jira/goals";
import type { JsonValue } from "../../src/jira/json";
import { decodeSprint, isDoneStatus, type JiraIssue, type JiraSprint } from "../../src/jira/models";
import type { JiraWrite } from "../../src/jira/writes";
import { makeConfiguration, makeIssue } from "../support/jiraFixtures";

// Jira FICTIF en mémoire : sprints, tickets, backlog et propriétés `sprintgoals.v1`. Les écritures
// y sont appliquées comme Jira le ferait, sauf panne ou refus simulés.

const BOARD = 7;
const CLOSED = 41;
const ACTIVE = 42;
const PREPARED = 43;
const OTHER = 44;
const NOW = new Date("2026-11-02T10:00:00Z");
const USER = "compte-1";
const query: IssueQuery = { estimationFieldId: "customfield_10016", includeChangelog: false };

const PAIEMENT = makeSprintGoal({
  id: "g-paiement",
  title: "Simplifier le paiement",
  color: "goal3",
  position: 0,
});
const PANIER = makeSprintGoal({
  id: "g-panier",
  title: "Accélérer le panier",
  color: "goal5",
  position: 1,
});

const todo = (key: string) =>
  makeIssue(key, { statusId: "1", statusName: "À faire", category: "new" });
const done = (key: string) =>
  makeIssue(key, { statusId: "9", statusName: "Terminé", category: "done" });
const subtask = (key: string) =>
  makeIssue(key, {
    statusId: "1",
    category: "new",
    extraFields: { issuetype: { id: "10003", name: "Sous-tâche", subtask: true } },
  });

function sprint(id: number, state: string, goal: string | null = null): JiraSprint {
  return decodeSprint({ id, name: `Sprint ${id}`, state, originBoardId: BOARD, goal });
}

interface FakeOptions {
  /** Erreur levée par l'écriture de ce type, sans l'appliquer (envoyée, résultat d'échec). */
  readonly fail?: Partial<Record<JiraWrite["kind"], unknown>>;
  /** Écritures acceptées par Jira mais jamais relues : la confirmation échoue. */
  readonly ignore?: readonly JiraWrite["kind"][];
  /** Changement simultané fait par un collègue juste après une écriture. */
  readonly afterWrite?: (write: JiraWrite, state: FakeState) => void;
}

interface FakeState {
  sprints: JiraSprint[];
  issues: Record<number, JiraIssue[]>;
  backlog: JiraIssue[];
  properties: Record<number, JsonValue | null>;
}

/** Board fictif : sprint actif 42, sprint préparé 43 et autre sprint futur 44. */
function fakeJira(options: FakeOptions = {}) {
  const state: FakeState = {
    sprints: [
      sprint(ACTIVE, "active", "Livrer la recherche"),
      sprint(PREPARED, "future", `${PAIEMENT.title}\n${PANIER.title}`),
      sprint(OTHER, "future"),
    ],
    issues: {
      [ACTIVE]: [todo("ABC-101"), done("ABC-102")],
      [PREPARED]: [todo("ABC-210"), todo("ABC-211")],
      [OTHER]: [todo("ABC-301")],
    },
    backlog: [todo("ABC-201"), todo("ABC-202"), subtask("ABC-203"), done("ABC-204")],
    properties: {
      [PREPARED]: {
        version: 1,
        goals: [
          { id: PAIEMENT.id, title: PAIEMENT.title, color: "goal3", position: 0, extra: 1 },
          { id: PANIER.id, title: PANIER.title, color: "goal5", position: 1 },
        ],
        links: { "ABC-210": PAIEMENT.id, "ABC-211": PANIER.id },
        atlassianGoalIds: ["ari-garde"],
        velocity: 30,
        foreign: { keep: true },
      },
    },
  };
  const writes: JiraWrite[] = [];
  const sprintCalls: (readonly string[])[] = [];
  const clone = <T>(value: T): T => structuredClone(value);

  const reader: PlanningReader = {
    sprint: async (id) => {
      const found = state.sprints.find((candidate) => candidate.id === id);
      if (!found) throw new JiraError({ kind: "notFound", resource: `le sprint ${id}` });
      return found;
    },
    sprints: async (_board, states) => {
      sprintCalls.push([...states]);
      return state.sprints.filter((candidate) => states.includes(candidate.state));
    },
    sprintIssues: async (_board, id) => [...(state.issues[id] ?? [])],
    backlogIssues: async () => [...state.backlog],
    sprintProperty: async (id) => clone(state.properties[id] ?? null),
  };

  const take = (key: string): JiraIssue | undefined => {
    const fromBacklog = state.backlog.find((issue) => issue.key === key);
    if (fromBacklog) {
      state.backlog = state.backlog.filter((issue) => issue.key !== key);
      return fromBacklog;
    }
    for (const [id, issues] of Object.entries(state.issues)) {
      const found = issues.find((issue) => issue.key === key);
      if (found) {
        state.issues[Number(id)] = issues.filter((issue) => issue.key !== key);
        return found;
      }
    }
    return undefined;
  };

  const apply = (write: JiraWrite) => {
    switch (write.kind) {
      case "sprint.goal":
        state.sprints = state.sprints.map((candidate) =>
          candidate.id === write.sprintId ? { ...candidate, goal: write.goal } : candidate,
        );
        return;
      case "sprint.issues.add":
        for (const key of write.issueKeys) {
          const issue = take(key);
          if (issue)
            state.issues[write.sprintId] = [...(state.issues[write.sprintId] ?? []), issue];
        }
        return;
      case "backlog.issues.move":
        for (const key of write.issueKeys) {
          const issue = take(key);
          if (issue) state.backlog = [...state.backlog, issue];
        }
        return;
      case "sprintProperty.put":
        state.properties[write.sprintId] = clone(write.value);
        return;
      default:
        throw new Error(`Écriture inattendue : ${write.kind}`);
    }
  };

  const writer = {
    write: async (write: JiraWrite) => {
      writes.push(write);
      const failure = options.fail?.[write.kind];
      if (failure !== undefined) throw failure;
      if (!options.ignore?.includes(write.kind)) apply(write);
      options.afterWrite?.(write, state);
      return { status: 204, body: null };
    },
  };

  const load = (sprintId = PREPARED) =>
    loadSprintPlanning(reader, { boardId: BOARD, sprintId, query });
  const issue = (key: string): JiraIssue => {
    const all = [...state.backlog, ...Object.values(state.issues).flat()];
    const found = all.find((candidate) => candidate.key === key);
    if (!found) throw new Error(`Ticket fictif inconnu : ${key}`);
    return found;
  };
  const keysOf = (id: number) => (state.issues[id] ?? []).map((candidate) => candidate.key);
  const property = (id = PREPARED) => state.properties[id] as Record<string, unknown> | null;
  const goalOf = (id: number) => state.sprints.find((candidate) => candidate.id === id)?.goal;
  return { state, reader, writer, writes, sprintCalls, load, issue, keysOf, property, goalOf };
}

/** Liens Goals fictifs : réponses données dans l'ordre, succès par défaut. */
function goalLinks(responses: (LinkOutcome | Error)[] = []) {
  const calls: [string, string, string][] = [];
  const links: PlanningGoalLinks = {
    setLink: async (kind, goalId, issueId) => {
      calls.push([kind, goalId, issueId]);
      const next = responses.shift() ?? { success: true, messages: [] };
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { calls, links };
}

const forbidden = () =>
  new JiraError({ kind: "forbidden", detail: null, bodyExcerpt: "", responseHints: "" });

const coreCode = (error: unknown) => (error instanceof CoreError ? error.reason : null);

const textGoalsInput = (snapshot: PlanningSnapshot, goals: readonly SprintGoal[]) => ({
  sprintId: snapshot.sprint.id,
  baseText: snapshot.nativeGoalText,
  baseProperty: snapshot.rawGoalProperty,
  goals,
  accountId: USER,
  now: NOW,
});

// ─── Lecture ─────────────────────────────────────────────────────────────────

describe("lecture du Sprint Planning", () => {
  it("réunit sprint préparé, objectifs, vélocité, backlog, autres sprints futurs et RAF actif, sans écrire", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    expect(snapshot.sprint.id).toBe(PREPARED);
    expect(snapshot.nativeGoalText).toBe(`${PAIEMENT.title}\n${PANIER.title}`);
    expect(snapshot.goals.map(({ id, title, color }) => ({ id, title, color }))).toEqual([
      { id: PAIEMENT.id, title: PAIEMENT.title, color: "goal3" },
      { id: PANIER.id, title: PANIER.title, color: "goal5" },
    ]);
    expect(snapshot.links).toEqual({ "ABC-210": PAIEMENT.id, "ABC-211": PANIER.id });
    expect(snapshot.storedGoalIds).toEqual([PAIEMENT.id, PANIER.id]);
    expect(snapshot.velocity).toBe(30);
    expect(snapshot.pinnedGoalIds).toEqual(["ari-garde"]);
    expect(snapshot.sprintIssues.map((issue) => issue.key)).toEqual(["ABC-210", "ABC-211"]);
    expect(snapshot.backlogIssues.map((issue) => issue.key)).toEqual([
      "ABC-201",
      "ABC-202",
      "ABC-203",
      "ABC-204",
    ]);
    expect(
      snapshot.futureSprints.map(({ sprint: other, issues }) => [
        other.id,
        issues.map((issue) => issue.key),
      ]),
    ).toEqual([[OTHER, ["ABC-301"]]]);
    // Reste à faire du sprint actif : les tickets terminés n'y figurent pas.
    expect(
      snapshot.activeSprints.map(({ sprint: active, issues }) => [
        active.id,
        issues.map((issue) => issue.key),
      ]),
    ).toEqual([[ACTIVE, ["ABC-101"]]]);
    expect(f.sprintCalls).toEqual([["active", "future"]]);
    expect(f.writes).toEqual([]);
  });

  it("objectifs saisis dans Jira sans propriété : identifiants stables d'une lecture à l'autre", async () => {
    const f = fakeJira();
    f.state.properties[PREPARED] = null;
    const first = await f.load();
    const second = await f.load();
    const ids = stableGoalIds(PREPARED);
    expect(first.goals.map((goal) => goal.id)).toEqual([ids(PAIEMENT.title), ids(PANIER.title)]);
    expect(second.goals.map((goal) => goal.id)).toEqual(first.goals.map((goal) => goal.id));
    expect(first.velocity).toBeNull();
    expect(first.pinnedGoalIds).toEqual([]);
    expect(first.storedGoalIds).toEqual([]);
    expect(first.rawGoalProperty).toBeNull();
  });

  it("propriété illisible : erreur typée, rien n'est écrit", async () => {
    const f = fakeJira();
    f.state.properties[PREPARED] = { version: 2, goals: [] };
    await expect(f.load()).rejects.toMatchObject({
      reason: { code: "planningUnreadableProperty" },
    });
    expect(f.writes).toEqual([]);
  });

  it("vélocité mal formée : la propriété est illisible plutôt qu'interprétée", async () => {
    const f = fakeJira();
    f.state.properties[PREPARED] = { version: 1, velocity: "vingt" };
    await expect(f.load()).rejects.toBeInstanceOf(CoreError);
  });
});

// ─── Objectifs du texte du sprint ────────────────────────────────────────────

describe("objectifs texte du sprint (writeTextGoals)", () => {
  it("garde puces et emoji des lignes inchangées quand un objectif est ajouté ou renommé", () => {
    const jira = "🎯 Livrer le paiement\n2) Stabiliser\n- Doublon\n- Doublon";
    expect(goalTextKeepingLines(jira, ["Livrer le paiement", "Stabiliser", "Nouveau"])).toBe(
      "🎯 Livrer le paiement\n2) Stabiliser\nNouveau",
    );
    expect(goalTextKeepingLines(jira, ["Stabiliser", "Renommé", "Doublon", "Doublon"])).toBe(
      "2) Stabiliser\nRenommé\n- Doublon\n- Doublon",
    );
  });

  const NOUVEAU = makeSprintGoal({ id: "g-nouveau", title: "Rassurer au paiement", position: 2 });

  it("ajout : E8 relu puis E5 relu, identifiants gardés, inconnus, épinglés et vélocité conservés", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toEqual({ kind: "done", confirmed: ["goalText", "goalProperty"] });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.goal", "sprintProperty.put"]);
    expect(f.goalOf(PREPARED)).toBe(`${PAIEMENT.title}\n${PANIER.title}\n${NOUVEAU.title}`);
    expect(f.property()).toMatchObject({
      goals: [
        { id: PAIEMENT.id, title: PAIEMENT.title, color: "goal3", position: 0, extra: 1 },
        { id: PANIER.id, title: PANIER.title, color: "goal5", position: 1 },
        { id: NOUVEAU.id, title: NOUVEAU.title, position: 2 },
      ],
      links: { "ABC-210": PAIEMENT.id, "ABC-211": PANIER.id },
      atlassianGoalIds: ["ari-garde"],
      velocity: 30,
      foreign: { keep: true },
      updatedBy: USER,
    });
    const reloaded = await f.load();
    expect(reloaded.goals.map((goal) => goal.id)).toEqual([PAIEMENT.id, PANIER.id, NOUVEAU.id]);
  });

  it("renommage : même identifiant, ses tickets restent rattachés", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const [first, second] = snapshot.goals;
    if (!first || !second) throw new Error("objectifs attendus");
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [{ ...first, title: "  Payer en un clic  " }, second]),
    );
    expect(outcome).toEqual({ kind: "done", confirmed: ["goalText", "goalProperty"] });
    expect(f.goalOf(PREPARED)).toBe(`Payer en un clic\n${PANIER.title}`);
    const reloaded = await f.load();
    expect(reloaded.goals[0]).toMatchObject({ id: PAIEMENT.id, title: "Payer en un clic" });
    expect(reloaded.links["ABC-210"]).toBe(PAIEMENT.id);
  });

  it("suppression : l'objectif et ses liens disparaissent, les autres liens restent", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(
        snapshot,
        snapshot.goals.filter((goal) => goal.id !== PAIEMENT.id),
      ),
    );
    expect(outcome.kind).toBe("done");
    expect(f.goalOf(PREPARED)).toBe(PANIER.title);
    expect(f.property()).toMatchObject({
      goals: [{ id: PANIER.id, position: 0 }],
      links: { "ABC-211": PANIER.id },
    });
  });

  it("dernier objectif supprimé : texte vide, propriété sans objectif", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await writeTextGoals(f.reader, f.writer, textGoalsInput(snapshot, []));
    expect(outcome.kind).toBe("done");
    expect(f.goalOf(PREPARED)).toBe("");
    expect(f.property()).toMatchObject({ goals: [], links: {} });
  });

  it("déplacement : ordre du texte et positions réécrits", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals].reverse()),
    );
    expect(outcome.kind).toBe("done");
    expect(f.goalOf(PREPARED)).toBe(`${PANIER.title}\n${PAIEMENT.title}`);
    expect(f.property()).toMatchObject({
      goals: [
        { id: PANIER.id, position: 0 },
        { id: PAIEMENT.id, position: 1 },
      ],
    });
  });

  it("texte changé ailleurs depuis l'affichage : rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, goal: "Écrit par un collègue" } : candidate,
    );
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "goalTextChanged" } });
    expect(f.writes).toEqual([]);
  });

  it("objectifs changés dans la propriété depuis l'affichage : refus avant E8", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    f.state.properties[PREPARED] = {
      ...(f.property() as Record<string, JsonValue>),
      goals: [{ id: "g-autre", title: PAIEMENT.title, position: 0 }],
    };
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "goalsChanged" } });
    expect(f.writes).toEqual([]);
  });

  it("sprint démarré entre-temps : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, state: "active" } : candidate,
    );
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "notFuture" } });
    expect(f.writes).toEqual([]);
  });

  it.each([
    ["vide", "   "],
    ["sur deux lignes", "Premier\nSecond"],
    ["avec une puce", "- Objectif à puce"],
    ["numéroté", "1. Objectif numéroté"],
    ["en double sans tenir compte de la casse", PANIER.title.toUpperCase()],
  ])("titre %s : refusé, rien n'est écrit", async (_label, title) => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, { ...NOUVEAU, title }]),
    );
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "invalidGoals" } });
    expect(f.writes).toEqual([]);
  });

  it("E8 confirmé puis E5 refusé par Jira : partiel, texte confirmé, aucun rejeu", async () => {
    const error = forbidden();
    const f = fakeJira({ fail: { "sprintProperty.put": error } });
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toEqual({ kind: "partial", confirmed: ["goalText"], error });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.goal", "sprintProperty.put"]);
  });

  it("propriété modifiée par un collègue juste après E8 : partiel, E5 jamais envoyé", async () => {
    const f = fakeJira({
      afterWrite: (write, state) => {
        if (write.kind !== "sprint.goal") return;
        state.properties[PREPARED] = { version: 1, goals: [{ id: "g-x", title: "X" }] };
      },
    });
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toMatchObject({ kind: "partial", confirmed: ["goalText"] });
    if (outcome.kind !== "partial") return;
    expect(coreCode(outcome.error)).toEqual({
      code: "planningRefused",
      refusal: { reason: "goalsChanged" },
    });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.goal"]);
  });

  it("texte écrit mais non relu tel quel : partiel sans étape confirmée", async () => {
    const f = fakeJira({ ignore: ["sprint.goal"] });
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toMatchObject({ kind: "partial", confirmed: [] });
    if (outcome.kind !== "partial") return;
    expect(coreCode(outcome.error)).toEqual({ code: "planningGoalTextUnconfirmed" });
    expect(f.writes).toHaveLength(1);
  });

  it("propriété écrite mais non relue telle quelle : partiel, texte confirmé", async () => {
    const f = fakeJira({ ignore: ["sprintProperty.put"] });
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toMatchObject({ kind: "partial", confirmed: ["goalText"] });
    if (outcome.kind !== "partial") return;
    expect(coreCode(outcome.error)).toEqual({ code: "planningPropertyUnconfirmed" });
  });

  it("première écriture en échec : partiel vide, que le modèle lit comme « rien envoyé »", async () => {
    const error = new Error("porte refusée");
    const f = fakeJira({ fail: { "sprint.goal": error } });
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toEqual({ kind: "partial", confirmed: [], error });
  });

  it("titres identiques au texte Jira : son texte (puces, espaces) est gardé, seul E5 part", async () => {
    const f = fakeJira();
    const native = `🎯 ${PAIEMENT.title}\n  - ${PANIER.title}`;
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, goal: native } : candidate,
    );
    f.state.properties[PREPARED] = null;
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, snapshot.goals),
    );
    expect(outcome).toEqual({ kind: "done", confirmed: ["goalProperty"] });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprintProperty.put"]);
    expect(f.goalOf(PREPARED)).toBe(native);
    expect((await f.load()).goals.map((goal) => goal.id)).toEqual(
      snapshot.goals.map((goal) => goal.id),
    );
  });

  it("rien à changer : aucune écriture", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, snapshot.goals),
    );
    expect(outcome).toEqual({ kind: "unchanged" });
    expect(f.writes).toEqual([]);
  });

  it("propriété devenue illisible : refus « échec », rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    f.state.properties[PREPARED] = { version: 9 };
    const outcome = await writeTextGoals(
      f.reader,
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toMatchObject({ kind: "refused", reason: { reason: "failed" } });
    expect(f.writes).toEqual([]);
  });

  it("relecture du sprint impossible : refus « échec », rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const error = new JiraError({ kind: "timeout" });
    const outcome = await writeTextGoals(
      { ...f.reader, sprint: () => Promise.reject(error) },
      f.writer,
      textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
    );
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "failed", error } });
    expect(f.writes).toEqual([]);
  });

  it("liens ajoutés : seulement vers un objectif écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await writeTextGoals(f.reader, f.writer, {
      ...textGoalsInput(snapshot, [...snapshot.goals, NOUVEAU]),
      links: { "ABC-201": NOUVEAU.id, "ABC-202": "g-disparu" },
    });
    expect(outcome.kind).toBe("done");
    expect(f.property()?.links).toEqual({
      "ABC-210": PAIEMENT.id,
      "ABC-211": PANIER.id,
      "ABC-201": NOUVEAU.id,
    });
  });
});

// ─── Tickets ─────────────────────────────────────────────────────────────────

const textTarget = (snapshot: PlanningSnapshot, issueKey: string, goalId: string | null) => ({
  kind: "text" as const,
  goalId,
  knownGoalId: snapshot.storedLinks[issueKey] ?? null,
  knownGoalIds: snapshot.storedGoalIds,
  goals: snapshot.goals,
});

describe("poser un ticket sur un objectif (placePlanningIssue)", () => {
  const place = (
    f: ReturnType<typeof fakeJira>,
    issueKey: string,
    target: Parameters<typeof placePlanningIssue>[3]["target"],
    links: PlanningGoalLinks = goalLinks().links,
  ) =>
    placePlanningIssue(f.reader, f.writer, links, {
      boardId: BOARD,
      sprintId: PREPARED,
      query,
      issue: f.issue(issueKey),
      target,
      accountId: USER,
      now: NOW,
    });

  it("ticket du backlog sur un objectif texte : E9 relu puis E5 relu", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-201", textTarget(snapshot, "ABC-201", PANIER.id));
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueAdded", "issueLinked"] });
    expect(f.writes[0]).toEqual({
      kind: "sprint.issues.add",
      sprintId: PREPARED,
      issueKeys: ["ABC-201"],
    });
    expect(f.writes.map((write) => write.kind)).toEqual([
      "sprint.issues.add",
      "sprintProperty.put",
    ]);
    expect(f.keysOf(PREPARED)).toContain("ABC-201");
    expect(f.property()).toMatchObject({
      links: { "ABC-201": PANIER.id, "ABC-210": PAIEMENT.id },
      velocity: 30,
      foreign: { keep: true },
    });
  });

  it("ticket d'un autre sprint futur : déplacé par E9 sans alerte, puis rattaché", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-301", textTarget(snapshot, "ABC-301", PAIEMENT.id));
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueAdded", "issueLinked"] });
    expect(f.keysOf(OTHER)).not.toContain("ABC-301");
    expect(f.keysOf(PREPARED)).toContain("ABC-301");
    expect(f.property()?.links).toMatchObject({ "ABC-301": PAIEMENT.id });
  });

  it("sans objectif visé : E9 seulement", async () => {
    const f = fakeJira();
    const outcome = await place(f, "ABC-202", null);
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueAdded"] });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.issues.add"]);
  });

  it("ticket du sprint actif : refusé, rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-101", textTarget(snapshot, "ABC-101", PANIER.id));
    expect(outcome).toEqual({
      kind: "refused",
      reason: { reason: "issueInActiveSprint", issueKey: "ABC-101" },
    });
    expect(f.writes).toEqual([]);
  });

  it.each([
    ["sous-tâche", "ABC-203"],
    ["terminé", "ABC-204"],
  ])("ticket %s : indisponible, rien n'est écrit", async (_label, issueKey) => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await place(f, issueKey, textTarget(snapshot, issueKey, PANIER.id));
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "issueUnavailable", issueKey } });
    expect(f.writes).toEqual([]);
  });

  it("sprint préparé démarré entre-temps : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, state: "active" } : candidate,
    );
    const outcome = await place(f, "ABC-201", textTarget(snapshot, "ABC-201", PANIER.id));
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "notFuture" } });
    expect(f.writes).toEqual([]);
  });

  it("E9 confirmé puis lien refusé par Jira : partiel, ticket dans le sprint sans objectif", async () => {
    const error = forbidden();
    const f = fakeJira({ fail: { "sprintProperty.put": error } });
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-201", textTarget(snapshot, "ABC-201", PANIER.id));
    expect(outcome).toEqual({ kind: "partial", confirmed: ["issueAdded"], error });
    expect(f.keysOf(PREPARED)).toContain("ABC-201");
    expect(f.writes).toHaveLength(2);
  });

  it("E9 confirmé puis lien changé par un collègue : partiel, lien jamais envoyé", async () => {
    const f = fakeJira({
      afterWrite: (write, state) => {
        if (write.kind !== "sprint.issues.add") return;
        const stored = state.properties[PREPARED] as Record<string, JsonValue>;
        state.properties[PREPARED] = {
          ...stored,
          links: { ...(stored.links as Record<string, JsonValue>), "ABC-201": PAIEMENT.id },
        };
      },
    });
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-201", textTarget(snapshot, "ABC-201", PANIER.id));
    expect(outcome).toMatchObject({ kind: "partial", confirmed: ["issueAdded"] });
    if (outcome.kind !== "partial") return;
    expect(coreCode(outcome.error)).toEqual({
      code: "planningRefused",
      refusal: { reason: "linkChanged", issueKey: "ABC-201" },
    });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.issues.add"]);
  });

  it("E9 envoyé mais ticket absent à la relecture : partiel sans étape confirmée", async () => {
    const f = fakeJira({ ignore: ["sprint.issues.add"] });
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-201", textTarget(snapshot, "ABC-201", PANIER.id));
    expect(outcome).toMatchObject({ kind: "partial", confirmed: [] });
    if (outcome.kind !== "partial") return;
    expect(coreCode(outcome.error)).toEqual({
      code: "planningIssueUnconfirmed",
      issueKey: "ABC-201",
    });
    expect(f.writes).toHaveLength(1);
  });

  it("ticket déjà dans le sprint : changement d'objectif par E5 seul", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-210", textTarget(snapshot, "ABC-210", PANIER.id));
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueLinked"] });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprintProperty.put"]);
    expect(f.property()?.links).toEqual({ "ABC-210": PANIER.id, "ABC-211": PANIER.id });
  });

  it("ticket déjà dans le sprint vers « Sans objectif » : lien retiré", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-210", textTarget(snapshot, "ABC-210", null));
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueLinked"] });
    expect(f.property()?.links).toEqual({ "ABC-211": PANIER.id });
  });

  it("ticket déjà sur cet objectif : rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const outcome = await place(f, "ABC-210", textTarget(snapshot, "ABC-210", PAIEMENT.id));
    expect(outcome).toEqual({ kind: "unchanged" });
    expect(f.writes).toEqual([]);
  });

  it("ticket déjà dans le sprint, lien changé ailleurs : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    const snapshot = await f.load();
    const stored = f.property() as Record<string, JsonValue>;
    f.state.properties[PREPARED] = { ...stored, links: { "ABC-210": PANIER.id } };
    const outcome = await place(f, "ABC-210", textTarget(snapshot, "ABC-210", null));
    expect(outcome).toEqual({
      kind: "refused",
      reason: { reason: "linkChanged", issueKey: "ABC-210" },
    });
    expect(f.writes).toEqual([]);
  });

  it("Goals Atlassian : E9 relu puis E3 (lien du Goal) avec l'identifiant du ticket", async () => {
    const f = fakeJira();
    const goals = goalLinks();
    const outcome = await place(
      f,
      "ABC-201",
      { kind: "atlassian", goalId: "ari-goal-a", previousGoalId: null },
      goals.links,
    );
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueAdded", "issueLinked"] });
    expect(goals.calls).toEqual([["goal.link", "ari-goal-a", f.issue("ABC-201").id]]);
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.issues.add"]);
  });

  it("Goals Atlassian, changement de Goal : E4 (détacher) puis E3 (rattacher)", async () => {
    const f = fakeJira();
    const goals = goalLinks();
    const id = f.issue("ABC-210").id;
    const outcome = await place(
      f,
      "ABC-210",
      { kind: "atlassian", goalId: "ari-goal-b", previousGoalId: "ari-goal-a" },
      goals.links,
    );
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueLinked"] });
    expect(goals.calls).toEqual([
      ["goal.unlink", "ari-goal-a", id],
      ["goal.link", "ari-goal-b", id],
    ]);
    expect(f.writes).toEqual([]);
  });

  it("Goals Atlassian vers « Sans objectif » : E4 seul", async () => {
    const f = fakeJira();
    const goals = goalLinks();
    const outcome = await place(
      f,
      "ABC-210",
      { kind: "atlassian", goalId: null, previousGoalId: "ari-goal-a" },
      goals.links,
    );
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueLinked"] });
    expect(goals.calls.map(([kind]) => kind)).toEqual(["goal.unlink"]);
  });

  it("Goals Atlassian, refus explicite sans écriture préalable : refus « échec »", async () => {
    const f = fakeJira();
    const goals = goalLinks([{ success: false, messages: ["Goal archivé"] }]);
    const outcome = await place(
      f,
      "ABC-210",
      { kind: "atlassian", goalId: "ari-goal-b", previousGoalId: null },
      goals.links,
    );
    expect(outcome).toMatchObject({ kind: "refused", reason: { reason: "failed" } });
    if (outcome.kind !== "refused" || outcome.reason.reason !== "failed") return;
    expect(coreCode(outcome.reason.error)).toEqual({
      code: "planningGoalLinkRefused",
      messages: ["Goal archivé"],
    });
  });

  it("Goals Atlassian, E9 confirmé puis lien refusé : partiel", async () => {
    const f = fakeJira();
    const goals = goalLinks([{ success: false, messages: ["Refusé"] }]);
    const outcome = await place(
      f,
      "ABC-201",
      { kind: "atlassian", goalId: "ari-goal-a", previousGoalId: null },
      goals.links,
    );
    expect(outcome).toMatchObject({ kind: "partial", confirmed: ["issueAdded"] });
    expect(f.keysOf(PREPARED)).toContain("ABC-201");
  });

  it("Goals Atlassian, E4 confirmé puis E3 refusé : partiel, détachement confirmé", async () => {
    const f = fakeJira();
    const goals = goalLinks([
      { success: true, messages: [] },
      { success: false, messages: ["Refusé"] },
    ]);
    const outcome = await place(
      f,
      "ABC-210",
      { kind: "atlassian", goalId: "ari-goal-b", previousGoalId: "ari-goal-a" },
      goals.links,
    );
    expect(outcome).toMatchObject({ kind: "partial", confirmed: ["goalUnlinked"] });
    if (outcome.kind !== "partial") return;
    expect(coreCode(outcome.error)).toEqual({
      code: "planningGoalLinkRefused",
      messages: ["Refusé"],
    });
    expect(goals.calls).toHaveLength(2);
  });

  it("Goals Atlassian, E4 confirmé puis E3 en panne : partiel, rien n'est rejoué", async () => {
    const f = fakeJira();
    const error = new JiraError({ kind: "timeout" });
    const goals = goalLinks([{ success: true, messages: [] }, error]);
    const outcome = await place(
      f,
      "ABC-210",
      { kind: "atlassian", goalId: "ari-goal-b", previousGoalId: "ari-goal-a" },
      goals.links,
    );
    expect(outcome).toEqual({ kind: "partial", confirmed: ["goalUnlinked"], error });
    expect(goals.calls).toHaveLength(2);
  });
});

describe("retirer un ticket du sprint en préparation (removePlanningIssue)", () => {
  const remove = (
    f: ReturnType<typeof fakeJira>,
    issueKey: string,
    destination: Parameters<typeof removePlanningIssue>[2]["destination"],
  ) =>
    removePlanningIssue(f.reader, f.writer, {
      boardId: BOARD,
      sprintId: PREPARED,
      query,
      issueKey,
      destination,
    });

  it("vers le backlog : E10 puis relecture", async () => {
    const f = fakeJira();
    const outcome = await remove(f, "ABC-210", { kind: "backlog" });
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueMoved"] });
    expect(f.writes).toEqual([{ kind: "backlog.issues.move", issueKeys: ["ABC-210"] }]);
    expect(f.keysOf(PREPARED)).not.toContain("ABC-210");
    expect(f.state.backlog.map((issue) => issue.key)).toContain("ABC-210");
    // Le lien reste dans la propriété : sans effet hors du sprint, retrouvé au retour du ticket.
    expect(f.property()?.links).toMatchObject({ "ABC-210": PAIEMENT.id });
  });

  it("vers un autre sprint futur du board : E9 vers ce sprint", async () => {
    const f = fakeJira();
    const outcome = await remove(f, "ABC-211", { kind: "sprint", sprintId: OTHER });
    expect(outcome).toEqual({ kind: "done", confirmed: ["issueMoved"] });
    expect(f.writes).toEqual([
      { kind: "sprint.issues.add", sprintId: OTHER, issueKeys: ["ABC-211"] },
    ]);
    expect(f.keysOf(OTHER)).toContain("ABC-211");
  });

  it("ticket absent du sprint en préparation : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    const outcome = await remove(f, "ABC-301", { kind: "backlog" });
    expect(outcome).toEqual({
      kind: "refused",
      reason: { reason: "issueNotInSprint", issueKey: "ABC-301" },
    });
    expect(f.writes).toEqual([]);
  });

  it("ticket entre-temps dans un sprint actif : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    f.state.issues[ACTIVE] = [...(f.state.issues[ACTIVE] ?? []), f.issue("ABC-210")];
    const outcome = await remove(f, "ABC-210", { kind: "backlog" });
    expect(outcome).toEqual({
      kind: "refused",
      reason: { reason: "issueInActiveSprint", issueKey: "ABC-210" },
    });
    expect(f.writes).toEqual([]);
  });

  it("sprint en préparation démarré : aucun retrait", async () => {
    const f = fakeJira();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, state: "active" } : candidate,
    );
    const outcome = await remove(f, "ABC-210", { kind: "backlog" });
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "notFuture" } });
    expect(f.writes).toEqual([]);
  });

  it.each([
    ["le sprint actif", ACTIVE],
    ["le sprint en préparation lui-même", PREPARED],
    ["un sprint hors du board", 99],
  ])("destination %s : refus, rien n'est écrit", async (_label, sprintId) => {
    const f = fakeJira();
    const outcome = await remove(f, "ABC-210", { kind: "sprint", sprintId });
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "notFuture" } });
    expect(f.writes).toEqual([]);
  });

  it("E10 envoyé mais ticket encore dans le sprint : partiel sans étape confirmée", async () => {
    const f = fakeJira({ ignore: ["backlog.issues.move"] });
    const outcome = await remove(f, "ABC-210", { kind: "backlog" });
    expect(outcome).toMatchObject({ kind: "partial", confirmed: [] });
    if (outcome.kind !== "partial") return;
    expect(coreCode(outcome.error)).toEqual({
      code: "planningIssueUnconfirmed",
      issueKey: "ABC-210",
    });
    expect(f.writes).toHaveLength(1);
  });

  it("E10 refusé par Jira : partiel, aucun rejeu", async () => {
    const error = forbidden();
    const f = fakeJira({ fail: { "backlog.issues.move": error } });
    const outcome = await remove(f, "ABC-210", { kind: "backlog" });
    expect(outcome).toEqual({ kind: "partial", confirmed: [], error });
    expect(f.writes).toHaveLength(1);
  });
});

// ─── Vélocité et Goals épinglés ──────────────────────────────────────────────

describe("vélocité de l'équipe (savePlanningVelocity)", () => {
  const save = (f: ReturnType<typeof fakeJira>, base: number | null, velocity: number | null) =>
    savePlanningVelocity(f.reader, f.writer, {
      sprintId: PREPARED,
      base,
      velocity,
      accountId: USER,
      now: NOW,
    });

  it("valeur validée : E5 relu, objectifs, liens et clés inconnues conservés", async () => {
    const f = fakeJira();
    const outcome = await save(f, 30, 24.5);
    expect(outcome).toEqual({ kind: "done", confirmed: ["velocity"] });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprintProperty.put"]);
    expect(f.property()).toMatchObject({
      velocity: 24.5,
      links: { "ABC-210": PAIEMENT.id, "ABC-211": PANIER.id },
      atlassianGoalIds: ["ari-garde"],
      foreign: { keep: true },
      goals: [{ id: PAIEMENT.id, extra: 1 }, { id: PANIER.id }],
    });
    expect((await f.load()).velocity).toBe(24.5);
  });

  it("première vélocité sur un sprint sans propriété", async () => {
    const f = fakeJira();
    f.state.properties[PREPARED] = null;
    const outcome = await save(f, null, 0);
    expect(outcome).toEqual({ kind: "done", confirmed: ["velocity"] });
    expect(f.property()).toMatchObject({ version: 1, velocity: 0 });
  });

  it("vélocité effacée : le champ disparaît de la propriété", async () => {
    const f = fakeJira();
    const outcome = await save(f, 30, null);
    expect(outcome).toEqual({ kind: "done", confirmed: ["velocity"] });
    expect(f.property()).not.toHaveProperty("velocity");
  });

  it("vélocité changée dans Jira depuis l'affichage : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    const outcome = await save(f, 20, 25);
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "velocityChanged" } });
    expect(f.writes).toEqual([]);
  });

  it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], [100_001]])(
    "valeur invalide (%s) : refus, rien n'est lu ni écrit",
    async (velocity) => {
      const f = fakeJira();
      const outcome = await save(f, 30, velocity);
      expect(outcome).toEqual({ kind: "refused", reason: { reason: "invalidVelocity" } });
      expect(f.writes).toEqual([]);
    },
  );

  it("même valeur que Jira : aucune écriture", async () => {
    const f = fakeJira();
    expect(await save(f, 30, 30)).toEqual({ kind: "unchanged" });
    expect(f.writes).toEqual([]);
  });

  it("sprint démarré : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, state: "active" } : candidate,
    );
    expect(await save(f, 30, 25)).toEqual({ kind: "refused", reason: { reason: "notFuture" } });
    expect(f.writes).toEqual([]);
  });

  it("E5 refusé par Jira : partiel, aucun rejeu", async () => {
    const error = forbidden();
    const f = fakeJira({ fail: { "sprintProperty.put": error } });
    expect(await save(f, 30, 25)).toEqual({ kind: "partial", confirmed: [], error });
    expect(f.writes).toHaveLength(1);
  });
});

describe("Goals Atlassian épinglés au sprint en préparation (pinPlanningGoals)", () => {
  const pin = (
    f: ReturnType<typeof fakeJira>,
    shownGoalIds: readonly string[],
    goalIds: readonly string[],
  ) =>
    pinPlanningGoals(f.reader, f.writer, {
      sprintId: PREPARED,
      shownGoalIds,
      goalIds,
      accountId: USER,
      now: NOW,
    });

  it("épingler un Goal existant : sélection affichée plus son identifiant, E5 relu", async () => {
    const f = fakeJira();
    const outcome = await pin(f, ["ari-garde"], ["ari-garde", "ari-nouveau"]);
    expect(outcome).toEqual({ kind: "done", confirmed: ["pinned"] });
    expect(f.property()).toMatchObject({
      atlassianGoalIds: ["ari-garde", "ari-nouveau"],
      velocity: 30,
      links: { "ABC-210": PAIEMENT.id },
    });
  });

  it("retirer l'épinglage : sélection sans ce Goal", async () => {
    const f = fakeJira();
    expect(await pin(f, ["ari-garde"], [])).toEqual({ kind: "done", confirmed: ["pinned"] });
    expect(f.property()?.atlassianGoalIds).toEqual([]);
  });

  it("sélection changée dans Jira : refus, rien n'est écrit", async () => {
    const f = fakeJira();
    const outcome = await pin(f, [], ["ari-nouveau"]);
    expect(outcome).toEqual({ kind: "refused", reason: { reason: "goalsChanged" } });
    expect(f.writes).toEqual([]);
  });
});

// ─── Report après clôture ────────────────────────────────────────────────────

describe("report des objectifs non atteints après la clôture native (carryOverGoals)", () => {
  const DOC = makeSprintGoal({
    id: "g-doc",
    title: "Documenter l'API",
    color: "goal7",
    position: 2,
  });
  const isDone = (issue: JiraIssue) => isDoneStatus(issue.fields.status);

  /**
   * Sprint 41 clos par la fenêtre native : « paiement » non atteint (ABC-110 reporté dans le 43,
   * ABC-113 renvoyé au backlog), « panier » atteint, « doc » sans ticket. Le 43 vise la recherche.
   */
  function closedFixture() {
    const f = fakeJira();
    f.state.sprints = [
      sprint(CLOSED, "closed", `${PAIEMENT.title}\n${PANIER.title}\n${DOC.title}`),
      sprint(PREPARED, "future", "Rechercher plus vite"),
      sprint(OTHER, "future"),
    ];
    f.state.issues[CLOSED] = [todo("ABC-110"), done("ABC-111"), done("ABC-112"), todo("ABC-113")];
    f.state.issues[PREPARED] = [todo("ABC-110"), todo("ABC-220")];
    f.state.backlog = [...f.state.backlog, todo("ABC-113")];
    delete f.state.issues[ACTIVE];
    f.state.properties[CLOSED] = {
      version: 1,
      goals: [
        { id: PAIEMENT.id, title: PAIEMENT.title, color: "goal3", position: 0 },
        { id: PANIER.id, title: PANIER.title, color: "goal5", position: 1 },
        { id: DOC.id, title: DOC.title, color: "goal7", position: 2 },
      ],
      links: {
        "ABC-110": PAIEMENT.id,
        "ABC-111": PAIEMENT.id,
        "ABC-113": PAIEMENT.id,
        "ABC-112": PANIER.id,
      },
      atlassianGoalIds: ["ari-a", "ari-b"],
    };
    f.state.properties[PREPARED] = {
      version: 1,
      goals: [{ id: "g-recherche", title: "Rechercher plus vite", color: "goal1", position: 0 }],
      links: { "ABC-220": "g-recherche" },
      atlassianGoalIds: ["ari-c"],
      velocity: 18,
    };
    return f;
  }

  const carry = (
    f: ReturnType<typeof fakeJira>,
    mode: Parameters<typeof carryOverGoals>[2]["mode"],
  ) =>
    carryOverGoals(f.reader, f.writer, {
      boardId: BOARD,
      closedSprintId: CLOSED,
      targetSprintId: PREPARED,
      query,
      isDone,
      mode,
      accountId: USER,
      now: NOW,
    });

  it("texte : objectif non atteint ajouté (même id, même couleur) avec les liens des tickets arrivés", async () => {
    const f = closedFixture();
    const outcome = await carry(f, { kind: "text" });
    expect(outcome).toEqual({ kind: "done", confirmed: ["goalText", "goalProperty"] });
    expect(f.goalOf(PREPARED)).toBe(`Rechercher plus vite\n${PAIEMENT.title}`);
    expect(f.property()).toMatchObject({
      goals: [
        { id: "g-recherche", position: 0 },
        { id: PAIEMENT.id, title: PAIEMENT.title, color: "goal3", position: 1 },
      ],
      // ABC-113, renvoyé au backlog par la fenêtre native, est respecté.
      links: { "ABC-220": "g-recherche", "ABC-110": PAIEMENT.id },
      atlassianGoalIds: ["ari-c"],
      velocity: 18,
    });
    expect(f.property()?.links).not.toHaveProperty("ABC-113");
  });

  it("texte : idempotent, un second report n'écrit rien", async () => {
    const f = closedFixture();
    await carry(f, { kind: "text" });
    const writes = f.writes.length;
    expect(await carry(f, { kind: "text" })).toEqual({ kind: "unchanged" });
    expect(f.writes).toHaveLength(writes);
  });

  it("texte : titre déjà présent dans la cible (casse différente), seuls les liens s'ajoutent", async () => {
    const f = closedFixture();
    const text = `Rechercher plus vite\n${PAIEMENT.title.toUpperCase()}`;
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, goal: text } : candidate,
    );
    const outcome = await carry(f, { kind: "text" });
    expect(outcome).toEqual({ kind: "done", confirmed: ["goalProperty"] });
    expect(f.goalOf(PREPARED)).toBe(text);
    const reloaded = await f.load();
    const existing = reloaded.goals[1];
    expect(existing?.title).toBe(PAIEMENT.title.toUpperCase());
    expect(reloaded.links["ABC-110"]).toBe(existing?.id);
  });

  it("texte : identifiant déjà pris dans la cible sous un autre titre, l'objectif reporté en prend un nouveau", async () => {
    const f = closedFixture();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED
        ? { ...candidate, goal: "Rechercher plus vite\nAutre titre" }
        : candidate,
    );
    const stored = f.property() as Record<string, JsonValue>;
    f.state.properties[PREPARED] = {
      ...stored,
      goals: [
        { id: "g-recherche", title: "Rechercher plus vite", color: "goal1", position: 0 },
        { id: PAIEMENT.id, title: "Autre titre", color: "goal2", position: 1 },
      ],
    };
    const outcome = await carry(f, { kind: "text" });
    expect(outcome).toEqual({ kind: "done", confirmed: ["goalText", "goalProperty"] });
    const carried = `${PAIEMENT.id}-${PREPARED}`;
    expect(f.property()).toMatchObject({
      goals: [
        { id: "g-recherche" },
        { id: PAIEMENT.id, title: "Autre titre" },
        { id: carried, title: PAIEMENT.title },
      ],
      links: { "ABC-220": "g-recherche", "ABC-110": carried },
    });
  });

  it("texte : ticket arrivé déjà rattaché dans la cible, son lien est respecté", async () => {
    const f = closedFixture();
    const stored = f.property() as Record<string, JsonValue>;
    f.state.properties[PREPARED] = {
      ...stored,
      links: { "ABC-220": "g-recherche", "ABC-110": "g-recherche" },
    };
    const outcome = await carry(f, { kind: "text" });
    expect(outcome.kind).toBe("done");
    expect(f.property()?.links).toMatchObject({ "ABC-110": "g-recherche" });
  });

  it("aucun objectif non atteint : rien n'est écrit", async () => {
    const f = closedFixture();
    f.state.issues[CLOSED] = [done("ABC-110"), done("ABC-111"), done("ABC-112")];
    expect(await carry(f, { kind: "text" })).toEqual({ kind: "unchanged" });
    expect(f.writes).toEqual([]);
  });

  it("sprint encore actif (fenêtre native annulée) : rien n'est reporté", async () => {
    const f = closedFixture();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === CLOSED ? { ...candidate, state: "active" } : candidate,
    );
    expect(await carry(f, { kind: "text" })).toEqual({
      kind: "refused",
      reason: { reason: "sprintNotClosed" },
    });
    expect(f.writes).toEqual([]);
  });

  it("cible démarrée entre-temps : refus, rien n'est écrit", async () => {
    const f = closedFixture();
    f.state.sprints = f.state.sprints.map((candidate) =>
      candidate.id === PREPARED ? { ...candidate, state: "active" } : candidate,
    );
    expect(await carry(f, { kind: "text" })).toEqual({
      kind: "refused",
      reason: { reason: "notFuture" },
    });
    expect(f.writes).toEqual([]);
  });

  it("propriété du sprint clos illisible : refus « échec », rien n'est écrit", async () => {
    const f = closedFixture();
    f.state.properties[CLOSED] = { version: 3 };
    const outcome = await carry(f, { kind: "text" });
    expect(outcome).toMatchObject({ kind: "refused", reason: { reason: "failed" } });
    expect(f.writes).toEqual([]);
  });

  const goalsReader = (workItems: Record<string, string[]>): GoalsReader =>
    ({
      lastWorkItemsIssue: null,
      cloudId: async () => "cloud-test",
      searchGoals: async () => [],
      workItemKeys: async (ids: readonly string[]) =>
        Object.fromEntries(Object.entries(workItems).filter(([id]) => ids.includes(id))),
      goalsByIds: async () => [],
    }) as unknown as GoalsReader;

  it("Goals Atlassian : Goal non atteint épinglé sur le sprint en préparation, une fois", async () => {
    const f = closedFixture();
    const mode = {
      kind: "atlassian" as const,
      goals: goalsReader({ "ari-a": ["ABC-110", "ABC-111"], "ari-b": ["ABC-112"] }),
      configuration: makeConfiguration({ boardId: BOARD }),
    };
    expect(await carry(f, mode)).toEqual({ kind: "done", confirmed: ["pinned"] });
    expect(f.writes.map((write) => write.kind)).toEqual(["sprintProperty.put"]);
    expect(f.property()).toMatchObject({
      atlassianGoalIds: ["ari-c", "ari-a"],
      links: { "ABC-220": "g-recherche" },
      velocity: 18,
    });
    expect(await carry(f, mode)).toEqual({ kind: "unchanged" });
    expect(f.writes).toHaveLength(1);
  });
});
