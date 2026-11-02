// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { AuditLog } from "../../src/app/model/auditLog";
import { BoardWriteGate } from "../../src/app/model/BoardWriteGate";
import { forgetPlanningDrafts, PlanningModel } from "../../src/app/model/PlanningModel";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
import { GoalsClient } from "../../src/jira/goals";
import { decodeSprint } from "../../src/jira/models";
import { normalizeSiteUrl } from "../../src/jira/site";
import { JiraTransport } from "../../src/jira/transport";
import { BOARD_URL } from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";
import { makeConfiguration, makeIssue } from "../support/jiraFixtures";
import { planningFixture } from "../support/planningFixture";

vi.mock("../../src/app/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/app/featureFlags")>()),
  SPRINT_PLANNING_ENABLED: false,
}));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const STORAGE_KEY = "sprint-planning.v1:https://acme.atlassian.net";

function setup() {
  const { jira } = planningFixture();
  const platform = fakePlatform(jira);
  const transport = new JiraTransport({
    site: normalizeSiteUrl("acme.atlassian.net"),
    fetch: platform.fetch,
  });
  const client = new JiraClient(transport);
  const audit = new AuditLog(platform.store);
  const gate = new BoardWriteGate({
    writer: transport,
    goals: new GoalsClient(transport),
    scope: { generation: () => 0, disposed: () => false },
    canEditSettings: () => true,
  });
  const openIssue = vi.fn();
  const openSprintDialog = vi.fn(() => true);
  const create = () =>
    new PlanningModel(client, platform, {
      configuration: () => makeConfiguration({ boardId: 7 }),
      canWrite: () => true,
      accountId: () => "u1",
      openIssue,
      openSprintDialog,
      goals: new GoalsClient(transport),
      write: (task) => gate.run(task),
      record: (entry) =>
        audit.append({ ...entry, at: new Date().toISOString(), site: client.site.origin }),
    });
  return { jira, platform, openIssue, openSprintDialog, create, planning: create() };
}

afterEach(() => render(null, document.body));

describe("Sprint Planning désactivé à la compilation", () => {
  it("retire l’entrée de navigation et refuse même un accès programmatique à la vue", async () => {
    const { jira } = planningFixture();
    const model = new AppModel(fakePlatform(jira));
    await model.connect("acme.atlassian.net");
    const connection = model.connection.value;
    if (connection.state !== "connected") throw new Error("connexion attendue");
    await connection.board.detect(BOARD_URL);
    const load = vi.spyOn(connection.board.planning, "load");
    const requestsBefore = jira.requests.length;
    render(<App model={model} />, document.body);
    await tick();
    expect(document.querySelector(".sidebar-nav")?.textContent).not.toContain("Sprint Planning");
    model.showPlanning();
    expect(model.view.value).toBe("board");
    expect(load).not.toHaveBeenCalled();
    model.view.value = "planning";
    await tick();
    expect(document.querySelector(".planning-screen")).toBeNull();
    expect(document.querySelector(".board-screen")).not.toBeNull();
    await vi.waitFor(() => expect(model.view.value).toBe("board"));
    expect(load).not.toHaveBeenCalled();
    expect(jira.requests).toHaveLength(requestsBefore);
    connection.board.dispose();
  });

  it("ne lit ni Jira ni les brouillons lors des appels publics de chargement", async () => {
    const { planning, platform, jira } = setup();
    const stored = { "7:43": { version: 1, draft: { sprintId: 43, goals: [] } } };
    platform.stored.set(STORAGE_KEY, stored);
    const get = vi.spyOn(platform.store, "get");
    const set = vi.spyOn(platform.store, "set");
    const remove = vi.spyOn(platform.store, "remove");
    await planning.load();
    await planning.refresh();
    planning.sprints.value = [decodeSprint({ id: 43, state: "future", name: "Sprint futur" })];
    await planning.selectSprint(43);
    await planning.afterNativeDialog();
    await planning.searchGoals("Paiement");
    expect(jira.requests).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(planning.snapshot.value).toBeNull();
    expect(platform.stored.get(STORAGE_KEY)).toBe(stored);
  });

  it("bloque chaque geste, fenêtre native et dérivé même avec un état de planning déjà présent", async () => {
    const { planning, jira, platform, openIssue, openSprintDialog } = setup();
    const goal = makeSprintGoal({ id: "g1", title: "Objectif préparé", position: 0 });
    const sprint = decodeSprint({ id: 43, state: "future", name: "Sprint futur" });
    const active = decodeSprint({ id: 42, state: "active", name: "Sprint actif" });
    planning.snapshot.value = {
      boardId: 7,
      query: { estimationFieldId: "customfield_10016", includeChangelog: false },
      sprint,
      nativeGoalText: "Objectif préparé",
      rawGoalProperty: null,
      goals: [goal],
      links: { "ABC-210": "g1" },
      storedLinks: {},
      storedGoalIds: [],
      velocity: null,
      pinnedGoalIds: [],
      sprintIssues: [makeIssue("ABC-210")],
      backlogIssues: [makeIssue("ABC-201")],
      futureSprints: [],
      activeSprints: [{ sprint: active, issues: [] }],
    };
    planning.selectedSprintId.value = 43;
    planning.pendingClosure.value = { closedSprintId: 42, targetSprintId: 43 };
    const set = vi.spyOn(platform.store, "set");
    await planning.addGoal("Un autre objectif");
    await planning.renameGoal("g1", "Titre modifié");
    await planning.removeGoal("g1");
    await planning.moveGoal("g1", 1);
    await planning.placeIssue("ABC-201", "g1");
    await planning.removeIssue("ABC-210", { kind: "backlog" });
    await planning.saveVelocity(21);
    await planning.pinGoal("ari-1");
    await planning.unpinGoal("ari-1");
    planning.closeActiveSprint();
    planning.startSprint();
    await planning.afterNativeDialog();
    planning.openIssue("ABC-201");
    expect(planning.lanes.value).toEqual([]);
    expect(planning.unassigned.value).toEqual([]);
    expect(planning.sections.value).toEqual([]);
    expect(planning.sprintLoad.value).toBeNull();
    expect(planning.activeSprint.value).toBeNull();
    expect(planning.gesturesDisabled.value).toBe(true);
    expect(planning.busy.value).toBe(false);
    expect(jira.requests).toEqual([]);
    expect(set).not.toHaveBeenCalled();
    expect(openIssue).not.toHaveBeenCalled();
    expect(openSprintDialog).not.toHaveBeenCalled();
  });

  it("garde les anciens brouillons en réinitialisant la vue, mais la déconnexion les efface", async () => {
    const { planning, platform, create } = setup();
    const saved = { "7:43": { version: 1, draft: { sprintId: 43 } } };
    platform.stored.set(STORAGE_KEY, saved);
    planning.reset();
    planning.dispose();
    const reopened = create();
    await reopened.load();
    expect(platform.stored.get(STORAGE_KEY)).toBe(saved);
    await forgetPlanningDrafts(platform.store, "https://acme.atlassian.net");
    expect(platform.stored.has(STORAGE_KEY)).toBe(false);
  });
});
