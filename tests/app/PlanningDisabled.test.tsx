// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { AuditLog } from "../../src/app/model/auditLog";
import { PlanningModel } from "../../src/app/model/PlanningModel";
import { makeSprintGoal } from "../../src/core/sprintGoals";
import { JiraClient } from "../../src/jira/client";
import { decodeSprint } from "../../src/jira/models";
import { normalizeSiteUrl } from "../../src/jira/site";
import { JiraTransport } from "../../src/jira/transport";
import { BOARD_URL } from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";
import { makeConfiguration, makeIssue } from "../support/jiraFixtures";
import { planningFixture } from "../support/planningFixture";

vi.mock("../../src/app/featureFlags", () => ({ SPRINT_PLANNING_ENABLED: false }));

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
  const openIssue = vi.fn();
  const create = () =>
    new PlanningModel(client, transport, platform, {
      configuration: () => makeConfiguration({ boardId: 7 }),
      canWrite: () => true,
      accountId: () => "u1",
      openIssue,
      audit: new AuditLog(platform.store),
    });
  return { jira, platform, openIssue, create, planning: create() };
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
    await planning.discardDraft();
    await planning.flushDraft();
    expect(jira.requests).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(planning.snapshot.value).toBeNull();
    expect(planning.draft.value).toBeNull();
    expect(platform.stored.get(STORAGE_KEY)).toBe(stored);
  });

  it("bloque la publication et les effets locaux même avec un état de planning déjà présent", async () => {
    const { planning, jira, platform, openIssue } = setup();
    const goal = makeSprintGoal({ id: "g1", title: "Objectif préparé", position: 0 });
    const sprint = decodeSprint({ id: 43, state: "future", name: "Sprint futur" });
    planning.snapshot.value = {
      boardId: 7,
      query: { estimationFieldId: "customfield_10016", includeChangelog: false },
      sprint,
      nativeGoalText: "",
      rawGoalProperty: null,
      goals: [],
      links: {},
      sprintIssues: [],
      backlogIssues: [makeIssue("ABC-201")],
      remainingIssues: [],
    };
    planning.draft.value = {
      sprintId: 43,
      goals: [goal],
      links: { "ABC-201": "g1" },
      selectedIssueKeys: ["ABC-201"],
      capacity: 8,
    };
    planning.selectedSprintId.value = 43;
    const draft = planning.draft.value;
    const set = vi.spyOn(platform.store, "set");
    planning.addGoal("Un autre objectif");
    planning.renameGoal("g1", "Titre modifié");
    planning.removeGoal("g1");
    planning.moveGoal("g1", 1);
    planning.assignIssue("ABC-201", null);
    planning.removeIssue("ABC-201");
    planning.setCapacity(21);
    planning.openIssue("ABC-201");
    await planning.copySummary();
    await planning.publish();
    await planning.flushDraft();
    expect(planning.draft.value).toBe(draft);
    expect(planning.issues.value).toEqual([]);
    expect(planning.canPublish.value).toBe(false);
    expect(planning.dirty.value).toBe(false);
    expect(planning.publishing.value).toBe(false);
    expect(jira.requests).toEqual([]);
    expect(platform.copied).toEqual([]);
    expect(set).not.toHaveBeenCalled();
    expect(openIssue).not.toHaveBeenCalled();
  });

  it("préserve les brouillons en réinitialisant la vue mais respecte les oublis explicitement demandés", async () => {
    const { planning, platform, create } = setup();
    const saved = {
      "7:43": { version: 1, draft: { sprintId: 43 } },
      "8:44": { version: 1, draft: { sprintId: 44 } },
    };
    platform.stored.set(STORAGE_KEY, saved);
    planning.reset();
    planning.dispose();
    const reopened = create();
    await reopened.load();
    expect(platform.stored.get(STORAGE_KEY)).toBe(saved);
    await reopened.forgetBoard(7);
    expect(platform.stored.get(STORAGE_KEY)).toEqual({ "8:44": saved["8:44"] });
    await reopened.forgetSite();
    expect(platform.stored.has(STORAGE_KEY)).toBe(false);
  });
});
