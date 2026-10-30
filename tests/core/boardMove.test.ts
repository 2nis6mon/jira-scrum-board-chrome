import { describe, expect, it } from "vitest";
import type { BoardIssue, BoardSnapshot } from "../../src/core/boardIssue";
import { changeAtlassianGoal, executeMove, type MovePorts } from "../../src/core/boardMove";
import type { RankChange } from "../../src/core/dropPlan";
import {
  encodeSprintGoalDocument,
  makeSprintGoal,
  makeSprintGoalDocument,
} from "../../src/core/sprintGoals";
import { JiraError } from "../../src/jira/errors";
import type { JiraStatus, JiraTransition } from "../../src/jira/models";
import type { JiraWrite } from "../../src/jira/writes";

// Données FICTIVES. Une seule fonction de `core` par intention d'écriture (AD-2).

const NOW = new Date("2026-10-30T10:00:00.000Z");
const status = (id: string): JiraStatus => ({ id, name: `Statut ${id}`, statusCategory: null });
const transition = (
  id: string,
  to: string,
  fields: JiraTransition["fields"] = {},
): JiraTransition => ({ id, name: `Vers ${to}`, to: status(to), isAvailable: true, fields });

const issue = (goalId: string | null = null): BoardIssue =>
  ({
    issue: { id: "10001", key: "ABC-1", fields: { status: status("3") } },
    goalId,
    sprintId: 42,
  }) as unknown as BoardIssue;

const snapshot = (goalsOrigin: "atlassianGoals" | "sprintGoal"): BoardSnapshot =>
  ({
    sprint: { id: 42 },
    goals: [makeSprintGoal({ id: "t1", title: "Payer", position: 0, color: "blue" })],
    goalsOrigin,
    currentUser: null,
  }) as unknown as BoardSnapshot;

/** Faux ports : chaque appel est noté, dans l'ordre. */
function ports(options: {
  currentStatus?: string;
  transitions?: readonly JiraTransition[];
  transitionFails?: boolean;
  sprintProperty?: () => Promise<unknown>;
  goalWrite?: (kind: string) => { success: boolean; messages: string[] } | Error;
  rankFails?: boolean;
}) {
  const calls: string[] = [];
  const writes: JiraWrite[] = [];
  const value: MovePorts = {
    reader: {
      issueStatus: async () => {
        calls.push("lire statut");
        return status(options.currentStatus ?? "3");
      },
      transitions: async () => {
        calls.push("lire transitions");
        return [...(options.transitions ?? [transition("21", "5")])];
      },
      sprintProperty: async () => {
        calls.push("lire sprint");
        return ((await options.sprintProperty?.()) ?? null) as never;
      },
    },
    writer: {
      write: async (write) => {
        calls.push(write.kind);
        writes.push(write);
        if (write.kind === "issue.transition" && options.transitionFails)
          throw new JiraError({ kind: "forbidden", messages: [] } as never);
        if (write.kind === "issue.rank" && options.rankFails)
          throw new JiraError({ kind: "forbidden", messages: [] } as never);
        return { status: 204, body: null };
      },
    },
    goals: {
      setLink: async (kind, goalId) => {
        calls.push(`${kind} ${goalId}`);
        const reply = options.goalWrite?.(kind) ?? { success: true, messages: [] };
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  };
  return { ports: value, calls, writes };
}

const move = (
  setup: ReturnType<typeof ports>,
  input: {
    origin?: "atlassianGoals" | "sprintGoal";
    previousGoal?: string | null;
    goalId?: string | null;
    rank?: RankChange;
    transition?: boolean;
  },
) =>
  executeMove(setup.ports, {
    issue: issue(input.previousGoal ?? null),
    snapshot: snapshot(input.origin ?? "atlassianGoals"),
    transition: input.transition === false ? null : { knownStatusId: "3", targetStatusIds: ["5"] },
    ...(input.goalId !== undefined ? { goal: { goalId: input.goalId } } : {}),
    rank: input.rank ?? { kind: "before", issueKey: "ABC-2" },
    now: NOW,
  });

describe("executeMove", () => {
  it("déplacement complet : transition, Goal puis rang, trois étapes abouties dans l'ordre", async () => {
    const setup = ports({});
    const result = await move(setup, { previousGoal: "g1", goalId: "g2" });
    expect(result.completed).toEqual(["transition", "goal", "rank"]);
    expect(setup.calls).toEqual([
      "lire statut",
      "lire transitions",
      "issue.transition",
      "goal.unlink g1",
      "goal.link g2",
      "issue.rank",
    ]);
    expect(result.transition).toMatchObject({ kind: "moved", transition: { id: "21" } });
    expect(result.goal).toEqual({ origin: "atlassianGoals", outcome: { kind: "linked" } });
    expect(result.rank).toEqual({ kind: "ranked" });
  });

  it.each([
    ["conflict", { currentStatus: "4" }],
    ["noTransition", { transitions: [] }],
    ["choose", { transitions: [transition("21", "5"), transition("22", "5b")] }],
    [
      "requiresFields",
      {
        transitions: [
          transition("21", "5", {
            resolution: { required: true, name: "Résolution", hasDefaultValue: false },
          }),
        ],
      },
    ],
  ] as const)("transition %s : arrêt, Goal et rang non écrits", async (kind, options) => {
    const setup = ports(options);
    const targets = kind === "choose" ? ["5", "5b"] : ["5"];
    const result = await executeMove(setup.ports, {
      issue: issue("g1"),
      snapshot: snapshot("atlassianGoals"),
      transition: { knownStatusId: "3", targetStatusIds: targets },
      goal: { goalId: "g2" },
      rank: { kind: "before", issueKey: "ABC-2" },
      now: NOW,
    });
    expect(result.transition?.kind).toBe(kind);
    expect(result.completed).toEqual([]);
    expect(result.goal).toBeUndefined();
    expect(result.rank).toBeUndefined();
    expect(setup.writes).toEqual([]);
    expect(setup.calls.some((call) => call.startsWith("goal."))).toBe(false);
  });

  it("transition en échec : l'erreur est rendue, rien d'autre n'est écrit", async () => {
    const setup = ports({ transitionFails: true });
    const result = await move(setup, { previousGoal: "g1", goalId: "g2" });
    expect(result.transition?.kind).toBe("failed");
    expect(result.completed).toEqual([]);
    expect(setup.writes.map((write) => write.kind)).toEqual(["issue.transition"]);
  });

  it("Goal en échec après la transition : arrêt, rang non écrit, transition aboutie", async () => {
    const error = new Error("refus");
    const setup = ports({ goalWrite: () => error });
    const result = await move(setup, { previousGoal: null, goalId: "g2" });
    expect(result.completed).toEqual(["transition"]);
    expect(result.goal).toEqual({
      origin: "atlassianGoals",
      outcome: { kind: "failed", error, detached: false },
    });
    expect(result.rank).toBeUndefined();
    expect(setup.writes.map((write) => write.kind)).toEqual(["issue.transition"]);
  });

  it("rattachement texte en échec après la transition : arrêt, rang non écrit", async () => {
    const error = new Error("lecture impossible");
    const setup = ports({
      sprintProperty: async () => {
        throw error;
      },
    });
    const result = await move(setup, { origin: "sprintGoal", goalId: "t1" });
    expect(result.completed).toEqual(["transition"]);
    expect(result.goal).toEqual({ origin: "text", outcome: { kind: "failed", error } });
    expect(result.rank).toBeUndefined();
  });

  it("rattachement texte : le lien est écrit dans la propriété du sprint, puis le rang", async () => {
    const setup = ports({});
    const result = await move(setup, { origin: "sprintGoal", goalId: "t1" });
    expect(result.completed).toEqual(["transition", "goal", "rank"]);
    expect(setup.writes.map((write) => write.kind)).toEqual([
      "issue.transition",
      "sprintProperty.put",
      "issue.rank",
    ]);
  });

  it("rang en échec : les deux premières étapes restent abouties", async () => {
    const setup = ports({ rankFails: true });
    const result = await move(setup, { previousGoal: "g1", goalId: null });
    expect(result.completed).toEqual(["transition", "goal"]);
    expect(result.goal).toEqual({ origin: "atlassianGoals", outcome: { kind: "unlinked" } });
    expect(result.rank?.kind).toBe("failed");
  });

  it("sans changement de colonne ni de Goal : seul le rang est écrit", async () => {
    const setup = ports({});
    const result = await move(setup, { transition: false });
    expect(result.completed).toEqual(["rank"]);
    expect(result.transition).toBeUndefined();
    expect(setup.calls).toEqual(["issue.rank"]);
  });
});

describe("executeMove : arrêts et poursuites", () => {
  it("ticket déjà dans la colonne : la transition compte comme aboutie, Goal et rang suivent", async () => {
    const setup = ports({});
    const result = await executeMove(setup.ports, {
      issue: issue("g1"),
      snapshot: snapshot("atlassianGoals"),
      transition: { knownStatusId: "3", targetStatusIds: ["3"] },
      goal: { goalId: "g2" },
      rank: { kind: "after", issueKey: "ABC-2" },
      now: NOW,
    });
    expect(result.transition).toEqual({ kind: "alreadyThere" });
    expect(result.completed).toEqual(["transition", "goal", "rank"]);
    expect(setup.calls).toEqual([
      "lire statut",
      "lire transitions",
      "goal.unlink g1",
      "goal.link g2",
      "issue.rank",
    ]);
  });

  it("lien texte modifié dans Jira : conflit, rang non écrit", async () => {
    const setup = ports({
      sprintProperty: async () =>
        encodeSprintGoalDocument(makeSprintGoalDocument({ links: { "ABC-1": "t1" } })),
    });
    const result = await executeMove(setup.ports, {
      issue: issue(),
      snapshot: { ...snapshot("sprintGoal"), storedTextLinks: { 42: {} } },
      transition: { knownStatusId: "3", targetStatusIds: ["5"] },
      goal: { goalId: null },
      rank: { kind: "before", issueKey: "ABC-2" },
      now: NOW,
    });
    expect(result.goal).toEqual({
      origin: "text",
      outcome: { kind: "conflict", current: "t1" },
    });
    expect(result.completed).toEqual(["transition"]);
    expect(result.rank).toBeUndefined();
    expect(setup.writes.map((write) => write.kind)).toEqual(["issue.transition"]);
  });

  it.each([
    ["unlinkRefused", "goal.unlink", ["goal.unlink g1"]],
    ["linkRefused", "goal.link", ["goal.unlink g1", "goal.link g2"]],
  ] as const)("%s : arrêt, rang non écrit", async (kind, refusedWrite, goalCalls) => {
    const setup = ports({
      goalWrite: (write) => ({ success: write !== refusedWrite, messages: ["non"] }),
    });
    const result = await move(setup, { previousGoal: "g1", goalId: "g2" });
    expect(result.goal?.outcome.kind).toBe(kind);
    expect(result.completed).toEqual(["transition"]);
    expect(result.rank).toBeUndefined();
    expect(setup.calls.filter((call) => call.startsWith("goal."))).toEqual(goalCalls);
    expect(setup.writes.map((write) => write.kind)).toEqual(["issue.transition"]);
  });
});

describe("changeAtlassianGoal", () => {
  const change = (
    setup: ReturnType<typeof ports>,
    previousGoalId: string | null,
    goalId: string | null,
  ) => changeAtlassianGoal(setup.ports.goals, { issueId: "10001", previousGoalId, goalId });

  it("détache l'ancien Goal puis lie le nouveau", async () => {
    const setup = ports({});
    expect(await change(setup, "g1", "g2")).toEqual({ kind: "linked" });
    expect(setup.calls).toEqual(["goal.unlink g1", "goal.link g2"]);
  });

  it("détachement refusé : arrêt sans lier", async () => {
    const setup = ports({
      goalWrite: (kind) => ({ success: kind !== "goal.unlink", messages: ["non"] }),
    });
    expect(await change(setup, "g1", "g2")).toEqual({ kind: "unlinkRefused", messages: ["non"] });
    expect(setup.calls).toEqual(["goal.unlink g1"]);
  });

  it("lien refusé après détachement : succès partiel signalé", async () => {
    const setup = ports({
      goalWrite: (kind) => ({ success: kind !== "goal.link", messages: ["non"] }),
    });
    expect(await change(setup, "g1", "g2")).toEqual({
      kind: "linkRefused",
      messages: ["non"],
      detached: true,
    });
  });

  it("lien en erreur après détachement : l'erreur dit que l'ancien lien est retiré", async () => {
    const error = new Error("réseau");
    const setup = ports({
      goalWrite: (kind) => (kind === "goal.link" ? error : { success: true, messages: [] }),
    });
    expect(await change(setup, "g1", "g2")).toEqual({ kind: "failed", error, detached: true });
  });

  it("sans ancien Goal : lie seulement ; même Goal : n'écrit rien", async () => {
    const linked = ports({});
    expect(await change(linked, null, "g2")).toEqual({ kind: "linked" });
    expect(linked.calls).toEqual(["goal.link g2"]);
    const same = ports({});
    expect(await change(same, "g1", "g1")).toEqual({ kind: "unchanged" });
    expect(same.calls).toEqual([]);
  });
});
