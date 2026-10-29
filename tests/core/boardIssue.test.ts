import { describe, expect, it } from "vitest";
import type { BoardConfiguration } from "../../src/core/boardConfiguration";
import {
  assembleBoardIssues,
  type BoardIssue,
  type BoardSnapshot,
  blockerProjectKey,
  blockingKeys,
  browseUrl,
  goalProgress,
  goalsOfSprint,
  isForeignSprint,
  locateBlocker,
  snapshotGoalProgress,
  sprintMetrics,
  textLinkSprintId,
} from "../../src/core/boardIssue";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import type { JiraIssue, JiraSprint } from "../../src/jira/models";
import {
  type IssueOptions,
  makeConfiguration,
  makeIssue,
  makeSprint,
  statusJson,
} from "../support/jiraFixtures";

function assemble(
  issues: JiraIssue[],
  options: {
    config?: BoardConfiguration;
    links?: Record<string, string>;
    sprint?: JiraSprint | null;
    now?: Date;
  } = {},
): BoardIssue[] {
  const configuration = options.config ?? makeConfiguration();
  return assembleBoardIssues({
    issues,
    configuration,
    columns: configuration.columns,
    links: options.links ?? {},
    sprint: options.sprint ?? null,
    ...(options.now ? { now: options.now } : {}),
  });
}

const one = (key: string, options: IssueOptions = {}, config?: BoardConfiguration) =>
  assemble([makeIssue(key, options)], config ? { config } : {})[0] as BoardIssue;

function snapshot(goalIssues: BoardIssue[], swimlaneIssues: BoardIssue[] = []): BoardSnapshot {
  return {
    sprint: null,
    activeSprints: [],
    goals: [],
    goalsOrigin: "sprintText",
    goalIssues,
    swimlaneIssues,
    syncedAt: new Date(0),
    currentUser: null,
    goalsReadOnly: false,
    pinnedGoalIds: [],
    localPinnedGoalIds: null,
  };
}

// BoardAssemblerTests
describe("assembleBoardIssues", () => {
  it("lit l'estimation dans le champ déclaré par le board", () => {
    expect(one("ABC-1", { points: 5 }).estimate).toBe(5);
  });

  it("sans estimation : null, jamais 0", () => {
    expect(one("ABC-1").estimate).toBeNull();
    expect(one("ABC-1", { points: 0 }).estimate).toBe(0);
  });

  it("range le ticket dans la colonne de son statut", () => {
    expect(one("ABC-1", { statusId: "3" }).columnId).toBe("prog");
    expect(one("ABC-1", { statusId: "99" }).columnId).toBeNull();
  });

  it("détecte le blocage par le lien Jira natif", () => {
    const issue = one("ABC-1", { blockedBy: "ABC-9" });
    expect(issue.isBlocked).toBe(true);
    expect(blockingKeys(issue)).toEqual(["ABC-9"]);
  });

  it("un bloqueur terminé ne bloque plus", () => {
    const issue = one("ABC-1", {
      extraFields: {
        issuelinks: [
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            inwardIssue: { key: "ABC-9", fields: { status: statusJson("6", "Done", "done") } },
          },
        ],
      },
    });
    expect(issue.isBlocked).toBe(false);
    expect(issue.blockers).toEqual([]);
  });

  it("bloquer quelqu'un d'autre n'est pas être bloqué", () => {
    const issue = one("ABC-1", {
      extraFields: {
        issuelinks: [
          {
            type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
            outwardIssue: { key: "ABC-9", fields: { status: statusJson("3", "Open") } },
          },
        ],
      },
    });
    expect(issue.isBlocked).toBe(false);
  });

  it("reconnaît la formulation française du lien", () => {
    const issue = one("ABC-1", {
      extraFields: {
        issuelinks: [
          {
            type: { name: "Bloque", inward: "est bloqué par", outward: "bloque" },
            inwardIssue: { key: "ABC-9" },
          },
        ],
      },
    });
    expect(issue.isBlocked).toBe(true);
  });

  it("un label ne compte jamais comme blocage, même configuré avant 0.31.0", () => {
    expect(one("ABC-1", { labels: ["bloque"] }).isBlocked).toBe(false);
    const old = { ...makeConfiguration(), blockedLabels: ["bloque"] };
    expect(one("ABC-1", { labels: ["bloque"] }, old).isBlocked).toBe(false);
  });

  it("classe les types Kanban", () => {
    expect(one("BUG-1", { typeId: "10004", typeName: "Anomalie Prod" }).category).toBe("SWIMLANE");
    expect(one("ABC-1", { typeId: "inconnu" }).category).toBe("GOAL");
  });

  it("lit le drapeau Jira dans le champ repéré", () => {
    const flagged = { extraFields: { customfield_10021: [{ value: "Impediment" }] } };
    expect(one("ABC-1", flagged).isFlagged).toBe(false);
    const config = makeConfiguration({ flaggedFieldId: "customfield_10021" });
    expect(one("ABC-1", flagged, config).isFlagged).toBe(true);
    expect(one("ABC-1", flagged, config).isBlocked).toBe(false);
  });

  it("compte les jours dans la colonne depuis le dernier changement de statut", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const issue = makeIssue("ABC-1", {
      extraFields: { created: "2026-09-01T10:00:00.000+0000" },
      changelog: {
        histories: [{ created: "2026-09-15T10:00:00.000+0000", items: [{ field: "status" }] }],
      },
    });
    expect(assemble([issue], { now })[0]?.daysInColumn).toBe(3);
  });

  it("à défaut d'historique, depuis la création ; sans rien, null", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const created = makeIssue("ABC-1", {
      extraFields: { created: "2026-09-08T12:00:00.000+0000" },
    });
    expect(assemble([created], { now })[0]?.daysInColumn).toBe(10);
    expect(assemble([makeIssue("ABC-2")], { now })[0]?.daysInColumn).toBeNull();
  });
});

// GoalProgressTests
describe("goalProgress", () => {
  it("atteint seulement si tous les tickets sont dans la dernière colonne, puis revient en cours", () => {
    const goal = makeSprintGoal({ id: "g1", title: "Objectif", position: 0 });
    const issues = assemble([makeIssue("ABC-1"), makeIssue("ABC-2")]).map((issue) => ({
      ...issue,
      columnId: "last",
    }));
    expect(goalProgress(goal, issues, "last").state).toBe("completed");
    expect(goalProgress(goal, issues, "last").done).toBe(2);
    expect(
      goalProgress(
        goal,
        issues.map((issue, index) => (index === 0 ? { ...issue, columnId: "previous" } : issue)),
        "last",
      ).state,
    ).toBe("inProgress");
    expect(goalProgress(goal, [], "last").state).toBe("empty");
    expect(goalProgress(goal, issues, null).state).toBe("inProgress");
    const categoryDone = assemble([makeIssue("ABC-3", { category: "done" })]).map((issue) => ({
      ...issue,
      columnId: "previous",
    }));
    expect(goalProgress(goal, categoryDone, "last").state).toBe("inProgress");
  });

  function progress(done: number, total: number, points: (number | undefined)[] = []) {
    const raw = Array.from({ length: total }, (_, i) => {
      const isDone = i < done;
      const value = points[i];
      return makeIssue(`ABC-${i}`, {
        statusId: isDone ? "6" : "3",
        statusName: isDone ? "Done" : "In Progress",
        category: isDone ? "done" : "indeterminate",
        ...(value === undefined ? {} : { points: value }),
      });
    });
    return goalProgress(
      makeSprintGoal({ id: "g1", title: "Objectif", position: 0 }),
      assemble(raw),
    );
  }

  it("comptages et ratio", () => {
    const p = progress(8, 12);
    expect(p.done).toBe(8);
    expect(p.remaining).toBe(4);
    expect(p.completionRatio).toBeCloseTo(8 / 12, 4);
    expect(p.state).toBe("inProgress");
  });

  it("sans estimation, pas de points", () => {
    const p = progress(1, 2);
    expect(p.totalPoints).toBeNull();
    expect(p.donePoints).toBeNull();
  });

  it("points additionnés quand ils existent", () => {
    const p = progress(1, 2, [3, 5]);
    expect(p.totalPoints).toBe(8);
    expect(p.donePoints).toBe(3);
  });

  it("points estimés mais rien de terminé : 0 point fait, pas null", () => {
    expect(progress(0, 2, [3, 5]).donePoints).toBe(0);
  });

  it("un objectif vide n'est pas un objectif terminé", () => {
    expect(progress(0, 0).state).toBe("empty");
    expect(progress(3, 3).state).toBe("completed");
  });
});

// ScopeChangeAssemblyTests
describe("ajouté en cours de sprint", () => {
  const ACTIVATED = "2026-09-12T09:00:00.000+0200";
  const withSprintHistory = (created: string | null) =>
    makeIssue(
      "ABC-1",
      created === null
        ? {}
        : {
            changelog: {
              histories: [
                { created, items: [{ field: "Sprint", fromString: null, toString: "Sprint 42" }] },
              ],
            },
          },
    );
  const result = (issue: JiraIssue, sprint: JiraSprint | null) =>
    assemble([issue], { sprint })[0] as BoardIssue;

  it("ticket entré après l'activation : signalé", () => {
    const issue = result(withSprintHistory("2026-09-18T10:00:00.000+0200"), makeSprint(ACTIVATED));
    expect(issue.addedAfterSprintStart).toBe(true);
    expect(issue.addedToSprintAt).not.toBeNull();
  });

  it("ticket présent avant l'activation : non signalé", () => {
    const issue = result(withSprintHistory("2026-09-10T10:00:00.000+0200"), makeSprint(ACTIVATED));
    expect(issue.addedAfterSprintStart).toBe(false);
  });

  it("historique sans entrée de sprint : la date de création décide, sinon inconnu", () => {
    const created = (date: string | null) =>
      makeIssue("ABC-1", { changelog: { histories: [] }, extraFields: { created: date } });
    const sprint = makeSprint(ACTIVATED);
    expect(result(created("2026-09-01T10:00:00.000+0200"), sprint).addedAfterSprintStart).toBe(
      false,
    );
    const late = result(created("2026-09-15T10:00:00.000+0200"), sprint);
    expect(late.addedAfterSprintStart).toBe(true);
    expect(late.addedToSprintAt).not.toBeNull();
    expect(result(created(null), sprint).addedAfterSprintStart).toBeNull();
  });

  it("mis puis retiré pendant le planning, remis après l'activation : signalé", () => {
    const entry = (created: string, from: string | null, to: string | null) => ({
      created,
      items: [{ field: "Sprint", fromString: from, toString: to }],
    });
    const issue = makeIssue("ABC-1", {
      changelog: {
        histories: [
          entry("2026-09-08T10:00:00.000+0200", null, "Sprint 42"),
          entry("2026-09-10T10:00:00.000+0200", "Sprint 42", null),
          entry("2026-09-15T10:00:00.000+0200", null, "Sprint 42"),
        ],
      },
    });
    expect(result(issue, makeSprint(ACTIVATED)).addedAfterSprintStart).toBe(true);
  });

  it("sans historique, la réponse reste inconnue", () => {
    expect(result(withSprintHistory(null), makeSprint(ACTIVATED)).addedAfterSprintStart).toBeNull();
  });

  it("sans sprint, la réponse reste inconnue", () => {
    const issue = withSprintHistory("2026-09-18T10:00:00.000+0200");
    expect(result(issue, null).addedAfterSprintStart).toBeNull();
  });

  it("se rabat sur startDate quand activatedDate manque", () => {
    const issue = result(withSprintHistory("2026-09-18T10:00:00.000+0200"), makeSprint(null));
    expect(issue.addedAfterSprintStart).toBe(true);
  });
});

// BlockerDetailsTests
describe("bloquants", () => {
  it("le bloquant porte ce que Jira envoie dans le lien", () => {
    const blocker = one("ABC-1", { blockedBy: "OPS-412" }).blockers[0];
    expect(blocker).toMatchObject({
      key: "OPS-412",
      statusName: "Open",
      statusCategoryKey: "indeterminate",
    });
    expect(blocker && blockerProjectKey(blocker)).toBe("OPS");
    expect(
      blockerProjectKey({ ...(blocker as NonNullable<typeof blocker>), key: "MON-PROJET-7" }),
    ).toBe("MON-PROJET");
  });

  it("bloquant sur le board : colonne et assigné", () => {
    const config = makeConfiguration();
    const issues = assemble([
      makeIssue("ABC-1", { blockedBy: "ABC-9" }),
      makeIssue("ABC-9", { statusId: "3", assigneeId: "u1", assigneeName: "Camille Durand" }),
    ]);
    const blocker = issues[0]?.blockers[0];
    expect(blocker && locateBlocker(snapshot(issues), blocker, config.columns)).toEqual({
      kind: "onBoard",
      columnName: "In Progress",
      assigneeName: "Camille Durand",
    });
  });

  it("bloquant ailleurs : projet seulement", () => {
    const issues = assemble([makeIssue("ABC-1", { blockedBy: "OPS-412" })]);
    const blocker = issues[0]?.blockers[0];
    expect(
      blocker && locateBlocker(snapshot(issues), blocker, makeConfiguration().columns),
    ).toEqual({ kind: "elsewhere", projectKey: "OPS", typeName: null });
  });
});

describe("photographie du board", () => {
  it("indicateurs : uniquement des comptages", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const old = { extraFields: { created: "2026-09-01T12:00:00.000+0000" } };
    const scrum = assemble(
      [
        makeIssue("ABC-1", {
          statusId: "6",
          statusName: "Done",
          category: "done",
          points: 3,
          ...old,
        }),
        makeIssue("ABC-2", { points: 5, blockedBy: "X-1", ...old }),
        makeIssue("ABC-3", { statusId: "1", statusName: "To Do", category: "new" }),
      ],
      { links: { "ABC-1": "g1" }, now },
    );
    const run = assemble([makeIssue("RUN-1", { typeId: "10004", blockedBy: "X-2" })], { now });
    const metrics = sprintMetrics(snapshot(scrum, run), 3);

    expect(metrics).toMatchObject({
      totalIssues: 3,
      done: 1,
      inProgress: 1,
      toDo: 1,
      swimlaneCount: 1,
      blockedCount: 2,
      agingCount: 1, // ABC-2 ; ABC-1 est terminé, donc jamais « vieillissant »
      withoutGoalCount: 2,
      totalPoints: 8,
      donePoints: 3,
    });
    expect(metrics.completionRatio).toBeCloseTo(1 / 3, 4);
  });

  it("avancement par objectif, dans l'ordre des positions", () => {
    const issues = assemble([makeIssue("ABC-1"), makeIssue("ABC-2")], {
      links: { "ABC-1": "g2", "ABC-2": "g2" },
    });
    const goals = [
      makeSprintGoal({ id: "g2", title: "Deux", position: 1 }),
      makeSprintGoal({ id: "g1", title: "Un", position: 0 }),
    ];
    const progress = snapshotGoalProgress({ ...snapshot(issues), goals });
    expect(progress.map((p) => [p.goal.id, p.total])).toEqual([
      ["g1", 0],
      ["g2", 2],
    ]);
  });

  it("adresse Jira d'un ticket", () => {
    expect(browseUrl("https://acme.atlassian.net", "ABC-1")).toBe(
      "https://acme.atlassian.net/browse/ABC-1",
    );
  });
});

describe("plusieurs sprints actifs", () => {
  const sprint = (id: number, originBoardId: number | null) =>
    ({ id, name: `Sprint ${id}`, originBoardId }) as JiraSprint;

  it("sprint d'un autre board : seulement si Jira le prouve par originBoardId", () => {
    expect(isForeignSprint(sprint(40, 99), 1)).toBe(true);
    expect(isForeignSprint(sprint(42, 1), 1)).toBe(false);
    expect(isForeignSprint(sprint(43, null), 1)).toBe(false);
  });

  it("le lien s'écrit dans le sprint du ticket, sinon dans le sprint de référence", () => {
    const board = {
      sprint: sprint(42, 1),
      goals: [
        makeSprintGoal({ id: "g1", title: "A", position: 0 }),
        makeSprintGoal({ id: "g2", title: "B", position: 1 }),
        makeSprintGoal({ id: "g3", title: "C", position: 2 }),
      ],
      goalSprintIds: [42, 43],
      goalSprintOf: { g1: 42, g2: 43, g3: 43 },
    } as unknown as BoardSnapshot;
    const issue = (sprintId: number | null) => ({ sprintId }) as BoardIssue;
    expect(textLinkSprintId(board, issue(43))).toBe(43);
    // Ticket d'un sprint d'un autre board : la propriété du sprint de référence.
    expect(textLinkSprintId(board, issue(50))).toBe(42);
    // Positions propres au sprint, pour sa propriété.
    expect(goalsOfSprint(board, 43).map((goal) => [goal.id, goal.position])).toEqual([
      ["g2", 0],
      ["g3", 1],
    ]);
  });
});
