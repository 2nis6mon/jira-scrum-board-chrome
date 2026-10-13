import { describe, expect, it } from "vitest";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import {
  loadSprintPlanning,
  type PlanningPublication,
  type PlanningReader,
  planningRevision,
  publishSprintPlanning,
} from "../../src/core/sprintPlanning";
import { JiraError } from "../../src/jira/errors";
import type { JsonValue } from "../../src/jira/json";
import { decodeSprint } from "../../src/jira/models";
import type { JiraWrite } from "../../src/jira/writes";
import { makeIssue } from "../support/jiraFixtures";

const query = { estimationFieldId: "customfield_10016", includeChangelog: false };
const goal = makeSprintGoal({ id: "goal-a", title: "Premier résultat", position: 0 });
const newGoal = makeSprintGoal({ id: "goal-b", title: "Deuxième résultat", position: 1 });

function fixture() {
  const state = {
    sprint: decodeSprint({ id: 43, name: "Sprint futur", state: "future", goal: goal.title }),
    property: {
      version: 1,
      goals: [{ ...goal }],
      links: { "ABC-210": goal.id },
      atlassianGoalIds: ["preserve"],
      foreign: { keep: true },
    } as JsonValue,
    target: [makeIssue("ABC-210")],
    backlog: [makeIssue("ABC-201"), makeIssue("ABC-202")],
    active: [makeIssue("ABC-101"), makeIssue("ABC-102", { category: "done" })],
  };
  const writes: JiraWrite[] = [];
  const reader: PlanningReader = {
    sprint: async () => state.sprint,
    sprints: async () => [decodeSprint({ id: 42, name: "Actif", state: "active" })],
    sprintProperty: async () => state.property,
    sprintIssues: async (_board, id) => (id === 43 ? [...state.target] : [...state.active]),
    backlogIssues: async () => [...state.backlog],
  };
  const apply = (write: JiraWrite) => {
    if (write.kind === "sprint.goal") state.sprint = { ...state.sprint, goal: write.goal };
    if (write.kind === "sprint.issues.add") {
      state.target = [
        ...state.target,
        ...state.backlog.filter((issue) => write.issueKeys.includes(issue.key)),
      ];
      state.backlog = state.backlog.filter((issue) => !write.issueKeys.includes(issue.key));
    }
    if (write.kind === "sprintProperty.put") state.property = write.value;
  };
  const writer = {
    write: async (write: JiraWrite) => {
      writes.push(write);
      apply(write);
      return { status: 204, body: null };
    },
  };
  const load = () => loadSprintPlanning(reader, { boardId: 7, sprintId: 43, query });
  const publication = async (): Promise<PlanningPublication> => ({
    snapshot: await load(),
    goals: [goal, newGoal],
    links: { "ABC-210": goal.id, "ABC-201": newGoal.id },
    selectedIssueKeys: ["ABC-210", "ABC-201"],
    accountId: "user",
    now: new Date("2026-10-14T10:00:00Z"),
  });
  return { state, reader, writer, apply, writes, load, publication };
}

describe("chargement Sprint Planning", () => {
  it("réunit backlog, sprint futur et RAF sans terminé ni écriture", async () => {
    const f = fixture();
    const snapshot = await f.load();
    expect(snapshot.goals).toEqual([goal]);
    expect(snapshot.sprintIssues.map((issue) => issue.key)).toEqual(["ABC-210"]);
    expect(snapshot.remainingIssues.map((issue) => issue.key)).toEqual(["ABC-101"]);
    expect(f.writes).toEqual([]);
  });

  it("garde une révision stable malgré l'ordre JSON ou les IDs locaux d'objectifs", async () => {
    const f = fixture();
    const first = await f.load();
    const second = {
      ...first,
      goals: [{ ...goal, id: "generated-elsewhere" }],
      rawGoalProperty: JSON.parse(JSON.stringify(first.rawGoalProperty)),
    };
    expect(planningRevision(first)).toBe(planningRevision(second));
    expect(
      planningRevision({ ...second, sprintIssues: [...second.sprintIssues, makeIssue("ABC-999")] }),
    ).not.toBe(planningRevision(first));
  });

  it("prépare toujours du texte, conserve les extensions et les épinglages existants", async () => {
    const f = fixture();
    f.state.property = {
      version: 1,
      goals: [
        {
          ...goal,
          atlassianGoalId: "ari:goal",
          atlassianURL: "https://home.atlassian.com/goal/1",
          extension: { keep: true },
        },
      ],
      links: {},
      atlassianGoalIds: ["ari:goal"],
    };
    const snapshot = await f.load();
    expect(snapshot.goals[0]?.atlassianGoalId).toBeNull();
    const result = await publishSprintPlanning(f.reader, f.writer, {
      ...(await f.publication()),
      snapshot,
      goals: snapshot.goals,
      links: {},
    });
    expect(result.kind).toBe("confirmed");
    expect(f.state.property).toMatchObject({
      goals: [{ extension: { keep: true } }],
      atlassianGoalIds: ["ari:goal"],
    });
    expect(JSON.stringify(f.state.property)).not.toContain('atlassianGoalId"');
  });

  it.each([
    "texte étranger",
    { version: 9 },
    { links: ["invalid"] },
    { goals: [{ id: "a" }] },
    { atlassianGoalIds: [123] },
  ])("refuse une propriété illisible sans écrasement : %j", async (raw) => {
    const f = fixture();
    f.state.property = raw;
    await expect(f.load()).rejects.toThrow("illisible");
    expect(f.writes).toEqual([]);
  });
});

describe("publication Sprint Planning", () => {
  it("publie texte, tickets puis liens et relit chaque résultat sans changer les autres champs", async () => {
    const f = fixture();
    const result = await publishSprintPlanning(f.reader, f.writer, await f.publication());
    expect(result.kind).toBe("confirmed");
    expect(f.writes.map((write) => write.kind)).toEqual([
      "sprint.goal",
      "sprint.issues.add",
      "sprintProperty.put",
    ]);
    expect(f.state.sprint.state).toBe("future");
    expect(f.state.property).toMatchObject({
      foreign: { keep: true },
      atlassianGoalIds: ["preserve"],
      links: { "ABC-210": "goal-a", "ABC-201": "goal-b" },
    });
    expect(result.snapshot?.goals.map((item) => item.id)).toEqual(["goal-a", "goal-b"]);
  });

  it.each(["native", "property", "membership", "active", "backlog"])(
    "refuse un conflit %s avant toute écriture",
    async (change) => {
      const f = fixture();
      const input = await f.publication();
      if (change === "native") f.state.sprint = { ...f.state.sprint, goal: "Un collègue modifie" };
      if (change === "property") f.state.property = { version: 1, goals: [{ ...goal }], links: {} };
      if (change === "membership") f.state.target = [...f.state.target, makeIssue("ABC-999")];
      if (change === "active") f.state.sprint = { ...f.state.sprint, state: "active" };
      if (change === "backlog") f.state.backlog = [];
      const result = await publishSprintPlanning(f.reader, f.writer, input);
      expect(result.kind).toBe("conflict");
      expect(f.writes).toEqual([]);
    },
  );

  it("ignore les variations des tickets non sélectionnés dans le backlog", async () => {
    const f = fixture();
    const input = await f.publication();
    f.state.backlog = [makeIssue("ABC-201"), makeIssue("ABC-999")];
    expect((await publishSprintPlanning(f.reader, f.writer, input)).kind).toBe("confirmed");
  });

  it("refuse un ticket simultanément renvoyé par le backlog et le sprint actif", async () => {
    const f = fixture();
    f.state.active = [makeIssue("ABC-201")];
    expect((await publishSprintPlanning(f.reader, f.writer, await f.publication())).kind).toBe(
      "conflict",
    );
    expect(f.writes).toEqual([]);
  });

  it("revérifie le sprint actif après le texte, même si le backlog reste périmé", async () => {
    const f = fixture();
    const writer = {
      write: async (write: JiraWrite) => {
        const response = await f.writer.write(write);
        f.state.active = [makeIssue("ABC-201")];
        return response;
      },
    };
    expect((await publishSprintPlanning(f.reader, writer, await f.publication())).kind).toBe(
      "partial",
    );
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.goal"]);
  });

  it("interdit retrait existant, RAF actif et sous-tâche indépendante", async () => {
    for (const kind of ["remove", "active", "subtask"]) {
      const f = fixture();
      const input = await f.publication();
      const selectedIssueKeys =
        kind === "remove" ? ["ABC-201"] : ["ABC-210", kind === "active" ? "ABC-101" : "ABC-201"];
      if (kind === "subtask")
        f.state.backlog = [
          makeIssue("ABC-201", {
            extraFields: { issuetype: { id: "5", name: "Sous-tâche", subtask: true } },
          }),
        ];
      expect(
        (
          await publishSprintPlanning(f.reader, f.writer, {
            ...input,
            selectedIssueKeys,
            links: {},
          })
        ).kind,
      ).toBe("conflict");
      expect(f.writes).toEqual([]);
    }
  });

  it("préserve le texte natif décoré quand seuls les tickets changent", async () => {
    const f = fixture();
    f.state.sprint = { ...f.state.sprint, goal: `• ${goal.title}` };
    const input = await f.publication();
    expect(
      (
        await publishSprintPlanning(f.reader, f.writer, {
          ...input,
          goals: [{ ...goal }],
          links: { "ABC-210": goal.id, "ABC-201": goal.id },
        })
      ).kind,
    ).toBe("confirmed");
    expect(f.writes.some((write) => write.kind === "sprint.goal")).toBe(false);
    expect(f.state.sprint.goal).toBe(`• ${goal.title}`);
  });

  it("confirme aussi un texte vidé lorsque Jira normalise sa valeur en null", async () => {
    const f = fixture();
    const writer = {
      write: async (write: JiraWrite) => {
        const response = await f.writer.write(write);
        if (write.kind === "sprint.goal" && write.goal === "")
          f.state.sprint = { ...f.state.sprint, goal: null };
        return response;
      },
    };
    const input = await f.publication();
    expect(
      (await publishSprintPlanning(f.reader, writer, { ...input, goals: [], links: {} })).kind,
    ).toBe("confirmed");
  });

  it("préserve les liens des tickets d'autres boards partageant ce sprint", async () => {
    const f = fixture();
    f.state.property = {
      version: 1,
      goals: [{ ...goal }],
      links: { "OTHER-1": goal.id, "ABC-210": goal.id },
      atlassianGoalIds: [],
    };
    expect((await publishSprintPlanning(f.reader, f.writer, await f.publication())).kind).toBe(
      "confirmed",
    );
    expect(f.state.property).toMatchObject({ links: { "OTHER-1": goal.id } });
  });

  it("borne les ajouts par lots de 50 et vérifie chaque lot", async () => {
    const f = fixture();
    f.state.backlog = Array.from({ length: 51 }, (_, i) => makeIssue(`ABC-${i + 300}`));
    const input = await f.publication();
    const result = await publishSprintPlanning(f.reader, f.writer, {
      ...input,
      selectedIssueKeys: ["ABC-210", ...f.state.backlog.map((issue) => issue.key)],
      links: {},
    });
    expect(result.kind).toBe("confirmed");
    expect(
      f.writes
        .filter((write) => write.kind === "sprint.issues.add")
        .map((write) => write.issueKeys.length),
    ).toEqual([50, 1]);
  });

  it("arrête après résultat incertain même si Jira a appliqué l'ajout, sans rejouer", async () => {
    const f = fixture();
    const writer = {
      write: async (write: JiraWrite) => {
        f.writes.push(write);
        f.apply(write);
        if (write.kind === "sprint.issues.add") throw new JiraError({ kind: "timeout" });
        return { status: 204, body: null };
      },
    };
    const result = await publishSprintPlanning(f.reader, writer, await f.publication());
    expect(result.kind).toBe("partial");
    expect(result.snapshot?.sprintIssues.some((issue) => issue.key === "ABC-201")).toBe(true);
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.goal", "sprint.issues.add"]);
    expect(result.message).toContain("Aucune écriture n’a été rejouée");
  });

  it("ne présente pas un HTTP réussi non confirmé comme une réussite", async () => {
    const f = fixture();
    const writer = {
      write: async (write: JiraWrite) => {
        f.writes.push(write);
        return { status: 200, body: null };
      },
    };
    expect((await publishSprintPlanning(f.reader, writer, await f.publication())).kind).toBe(
      "partial",
    );
    expect(f.writes).toHaveLength(1);
  });

  it("s'arrête si le sprint démarre entre le texte et les ajouts", async () => {
    const f = fixture();
    const writer = {
      write: async (write: JiraWrite) => {
        const response = await f.writer.write(write);
        f.state.sprint = { ...f.state.sprint, state: "active" };
        return response;
      },
    };
    expect((await publishSprintPlanning(f.reader, writer, await f.publication())).kind).toBe(
      "partial",
    );
    expect(f.writes.map((write) => write.kind)).toEqual(["sprint.goal"]);
  });

  it("détecte un collègue qui change la propriété pendant l'ajout, sans l'écraser", async () => {
    const f = fixture();
    const writer = {
      write: async (write: JiraWrite) => {
        const response = await f.writer.write(write);
        if (write.kind === "sprint.issues.add")
          f.state.property = { version: 1, foreign: "nouveau" };
        return response;
      },
    };
    expect((await publishSprintPlanning(f.reader, writer, await f.publication())).kind).toBe(
      "partial",
    );
    expect(f.writes.some((write) => write.kind === "sprintProperty.put")).toBe(false);
    expect(f.state.property).toEqual({ version: 1, foreign: "nouveau" });
  });

  it("ne confirme pas un sprint démarré juste après la dernière écriture", async () => {
    const f = fixture();
    const writer = {
      write: async (write: JiraWrite) => {
        const response = await f.writer.write(write);
        if (write.kind === "sprintProperty.put")
          f.state.sprint = { ...f.state.sprint, state: "active" };
        return response;
      },
    };
    const result = await publishSprintPlanning(f.reader, writer, await f.publication());
    expect(result.kind).toBe("partial");
    expect(result.message).not.toContain("reste à démarrer");
  });

  it("valide la limite 32 Ko avant toute modification du texte ou des tickets", async () => {
    const f = fixture();
    const input = await f.publication();
    expect(
      (
        await publishSprintPlanning(f.reader, f.writer, {
          ...input,
          goals: [{ ...goal, title: "x".repeat(33000) }],
          links: {},
        })
      ).kind,
    ).toBe("conflict");
    expect(f.writes).toEqual([]);
  });
});
