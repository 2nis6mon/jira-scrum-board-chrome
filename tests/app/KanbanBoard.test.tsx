// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { withSwimlaneName, withTypeDestination } from "../../src/core/boardSettings";
import { SCOPE_CHANGE_RULE } from "../../src/core/cardColors";
import { BOARD_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, CORS_REFUSAL, SPRINT_ISSUES } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway, REAL_GOAL_FIELDS } from "../support/goalsGateway";
import { issueJson } from "../support/jiraFixtures";
import { KANBAN_GOALS, KANBAN_NAME, kanbanSiteJira } from "../support/kanbanFixture";

// Vrai parcours App + BoardModel, faux Jira uniquement : aucun sprint sur un board Kanban.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const body = () => document.body.textContent ?? "";
const lanes = () =>
  [...document.querySelectorAll("section.lane")].map((lane) => lane.getAttribute("aria-label"));
const labelled = (name: string) => {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!button) throw new Error(`Bouton ${name} absent`);
  return button;
};
const models: AppModel[] = [];
afterEach(() => {
  render(null, document.body);
  for (const model of models) {
    const connection = model.connection.value;
    if (connection.state === "connected") connection.board.dispose();
  }
  models.length = 0;
  vi.restoreAllMocks();
});

async function connectedBoard(jira = kanbanSiteJira()) {
  const platform = fakePlatform(jira);
  const model = new AppModel(platform);
  models.push(model);
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("Connexion attendue");
  await connection.board.detect(BOARD_URL);
  await tick();
  return { model, board: connection.board, jira, platform };
}

it("affiche objectifs, Build, RUN et OPS sans sprint et garde Daily et présentation", async () => {
  const jira = kanbanSiteJira({
    issues: [
      ...SPRINT_ISSUES.map((issue) =>
        issue.key === "RUN-7"
          ? issueJson("RUN-7", {
              statusId: "6",
              category: "done",
              typeId: "10004",
              typeName: "Anomalie Prod",
            })
          : issue,
      ),
      issueJson("OPS-20", {
        summary: "Ouvrir le compte de test",
        typeId: "10006",
        typeName: "Demande de service",
        statusId: "1",
        category: "new",
      }),
    ],
  });
  const { board, model } = await connectedBoard(jira);
  await board.applySettings(
    (current) => {
      const ops = withTypeDestination(current, "10006", { kind: "newSwimlane" });
      return withSwimlaneName(withSwimlaneName(ops, "1", "RUN"), "2", "OPS");
    },
    { resync: true },
  );
  await tick();
  expect(board.snapshot.value?.sprint).toBeNull();
  expect(document.querySelector(".sprint-title h2")?.textContent).toBe(KANBAN_NAME);
  expect(lanes()).toEqual(["Paiement en une étape", "Build", "RUN", "OPS"]);
  expect(document.querySelector(".sidebar-section-title")?.textContent).toContain(
    "Objectifs du board",
  );
  expect(document.querySelector(".sprint-dates")).toBeNull();
  expect(document.querySelector(".counter-added")).toBeNull();
  expect(document.querySelector(".chip-addedAfterStart")).toBeNull();
  expect(document.querySelector(".sprint-metrics")?.textContent).toContain("7 tickets");
  expect(document.querySelector(".sprint-metrics")?.textContent).toContain("2 terminés");
  expect(body()).not.toContain("Aucun sprint actif");
  expect(jira.requests.filter((request) => request.url.pathname.includes("/sprint"))).toEqual([]);

  const writesBefore = jira.requests.filter(isWriteRequest).length;
  const fullscreen = vi.fn(() => Promise.resolve());
  document.documentElement.requestFullscreen = fullscreen;
  labelled("Lancer la daily").click();
  await tick();
  expect(model.daily.value).not.toBeNull();
  expect(lanes()).toEqual(["Paiement en une étape"]);
  labelled("Swimlane suivante").click();
  await tick();
  expect(lanes()).toEqual(["Build"]);
  labelled("Swimlane suivante").click();
  await tick();
  expect(lanes()).toEqual(["RUN"]);
  model.stopDaily();
  await tick();
  labelled("Mode présentation").click();
  await tick();
  expect(document.querySelector(".sidebar")).toBeNull();
  expect(lanes()).toHaveLength(4);
  expect(document.querySelector('input[aria-label="Rechercher"]')).not.toBeNull();
  labelled("Quitter le mode présentation").click();
  await tick();
  expect(document.querySelector(".sidebar")).not.toBeNull();
  expect(fullscreen).toHaveBeenCalledTimes(2);
  expect(jira.requests.filter(isWriteRequest)).toHaveLength(writesBefore);
});

it("épingle un Goal sans ticket au board dans les réglages partagés", async () => {
  const { model, board, jira } = await connectedBoard();
  model.showSettings("goals");
  await expect.poll(() => document.querySelector(".pin-list")).not.toBeNull();
  expect(body()).toContain(`Objectifs du board « ${KANBAN_NAME} »`);
  expect(body()).not.toContain("Texte du sprint");
  expect(body()).not.toContain("propriété du sprint");
  const checkbox = document.querySelector<HTMLInputElement>(
    'input[aria-label="Sécurité des comptes"]',
  );
  if (!checkbox) throw new Error("Goal attendu");
  checkbox.click();
  await tick();
  const save = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Enregistrer dans Jira",
  );
  if (!save) throw new Error("Enregistrement attendu");
  save.click();
  await expect.poll(body).toContain("Épinglage enregistré dans Jira.");
  expect(board.configuration.value?.boardPinnedGoalIds).toEqual([KANBAN_GOALS[1]?.id]);
  expect(jira.requests.filter(isWriteRequest).map((request) => request.url.pathname)).toEqual([
    `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`,
  ]);
  model.showBoard();
  await tick();
  expect(lanes()).toContain("Sécurité des comptes");
});

it("distingue un board vide d'un sprint absent", async () => {
  await connectedBoard(kanbanSiteJira({ issues: [], goals: [] }));
  expect(body()).toContain("Aucun ticket à afficher dans le périmètre de ce board.");
  expect(body()).not.toContain("Aucun sprint actif");
  expect(lanes()).toEqual([]);
  expect(document.querySelector(".counter-build")).toBeNull();
  expect(document.querySelector(".sprint-title h2")?.textContent).toBe(KANBAN_NAME);
  expect(document.querySelector(".notice-error")).toBeNull();
});

it("masque Build vide et la réaffiche provisoirement pour détacher un ticket", async () => {
  const goal = KANBAN_GOALS[0];
  if (!goal) throw new Error("Objectif fictif attendu");
  const { board } = await connectedBoard(
    kanbanSiteJira({
      issues: [issueJson("ABC-101")],
      goals: [{ ...goal, workItems: ["ABC-101"] }],
    }),
  );
  expect(lanes()).toEqual([goal.name]);
  expect(document.querySelector(".counter-build")).toBeNull();
  board.startDrag("ABC-101", null);
  await tick();
  expect(lanes()).toEqual([goal.name, "Build"]);
  board.endDrag();
  await tick();
  expect(lanes()).toEqual([goal.name]);
});

it("affiche RUN dans son Goal et propose le retour dans sa swimlane vide pendant le glissé", async () => {
  const goal = KANBAN_GOALS[0];
  if (!goal) throw new Error("Objectif fictif attendu");
  const jira = kanbanSiteJira({
    issues: [
      issueJson("RUN-7", {
        typeId: "10004",
        typeName: "Anomalie Prod",
        statusId: "1",
        category: "new",
      }),
    ],
    goals: [{ ...goal, workItems: ["RUN-7"] }],
  }).on("GET", "/rest/api/3/issue/RUN-7/transitions", { status: 200, json: { transitions: [] } });
  const { board } = await connectedBoard(jira);
  const cardLane = () =>
    document
      .querySelector('[data-issue-key="RUN-7"]')
      ?.closest(".lane")
      ?.getAttribute("data-lane-id");
  expect(cardLane()).toBe(`goal:${goal.id}`);
  expect(lanes()).toEqual([goal.name]);
  expect(document.querySelector(".lane-progress")?.textContent).toContain("0/1 terminés");
  board.startDrag("RUN-7", "1");
  await tick();
  expect(lanes()).toEqual([goal.name, "Anomalie Prod"]);
  expect(document.querySelector('[data-lane-id="build"]')).toBeNull();
  expect(
    document.querySelector('[data-lane-id="swimlane:1"] .lane-default-label')?.textContent,
  ).toBe("Par défaut");
  const destination = document.querySelector('[data-lane-id="swimlane:1"] .lane-cell');
  expect(destination?.classList.contains("lane-cell-droppable")).toBe(true);
  board.setDropTarget({ laneId: "swimlane:1", columnId: "col-0-À faire", beforeKey: null });
  await tick();
  expect(destination?.textContent).toContain("Retour dans la swimlane par défaut");
  board.endDrag();
  await tick();
  expect(lanes()).toEqual([goal.name]);
  expect(cardLane()).toBe(`goal:${goal.id}`);
  expect(jira.requests.filter(isWriteRequest)).toEqual([]);
});

it("affiche les Goals du champ Jira quand GraphQL ne fournit pas workItems", async () => {
  const goalId = KANBAN_GOALS[0]?.id;
  if (!goalId) throw new Error("Objectif fictif attendu");
  const goalField = "customfield_10100";
  const jira = kanbanSiteJira({
    issues: [
      issueJson("ABC-101", { extraFields: { [goalField]: [{ id: goalId }] } }),
      issueJson("ABC-102", { extraFields: { [goalField]: null } }),
    ],
  })
    .on("GET", "/rest/api/3/field", {
      status: 200,
      json: [{ id: goalField, name: "Goals", schema: { custom: "x:goals" } }],
    })
    .on(
      "POST",
      "/gateway/api/graphql",
      goalsGateway({
        goals: KANBAN_GOALS,
        goalFields: REAL_GOAL_FIELDS.filter((field) => field.name !== "workItems"),
      }),
    );
  const { board } = await connectedBoard(jira);
  expect(board.snapshot.value?.goalIssues.map((issue) => [issue.issue.key, issue.goalId])).toEqual([
    ["ABC-101", goalId],
    ["ABC-102", null],
  ]);
  expect(lanes()).toContain("Paiement en une étape");
  expect(lanes()).toContain("Build");
  expect(board.syncProblem.value).toBeNull();
  const partial = [...document.querySelectorAll(".floating-notice")].find((notice) =>
    notice.textContent?.includes("le schéma Atlassian n'expose pas de lien Goal → tickets"),
  );
  expect(partial).toBeDefined();
  partial?.querySelector<HTMLButtonElement>(".floating-notice-close")?.click();
  await tick();
  expect(body()).not.toContain("Lecture partielle des Goals Atlassian");
  expect(
    jira
      .sent("GET", "/rest/agile/1.0/board/7/issue")
      .some((request) => request.url.searchParams.get("fields")?.includes(goalField)),
  ).toBe(true);
});

it("permet de désépingler un Goal supprimé quand le board n'a aucun snapshot", async () => {
  const { board, platform } = await connectedBoard();
  const missing = "ari:cloud:townsquare:c:goal/supprime";
  await board.applySettings(
    (configuration) => ({
      ...configuration,
      boardPinnedGoalIds: [missing],
    }),
    { resync: false },
  );
  board.dispose();
  render(null, document.body);

  // Recharge la même propriété Jira et le stockage local, avec l'objectif désormais absent.
  const reloaded = new AppModel(platform);
  models.push(reloaded);
  render(<App model={reloaded} />, document.body);
  await reloaded.connect("acme.atlassian.net");
  const connection = reloaded.connection.value;
  if (connection.state !== "connected") throw new Error("Connexion attendue");
  const current = connection.board;
  expect(current.snapshot.value).toBeNull();
  expect(current.syncProblem.value).not.toBeNull();
  reloaded.showSettings("goals");
  await expect.poll(() => current.pinEditor.value?.selection).toEqual([missing]);
  labelled(`Désépingler ${missing}`).click();
  await tick();
  const save = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Enregistrer dans Jira",
  );
  if (!save) throw new Error("Enregistrement attendu");
  save.click();
  await expect.poll(() => current.snapshot.value).not.toBeNull();
  expect(current.configuration.value?.boardPinnedGoalIds).toEqual([]);
  expect(current.syncProblem.value).toBeNull();
});

it("masque la règle sprint et réordonne les règles Kanban visibles sans la perdre", async () => {
  const { model, board } = await connectedBoard();
  await board.applySettings(
    (configuration) => ({
      ...configuration,
      cardColorRules: [
        {
          id: "first",
          name: "Urgent",
          jql: "priority = Highest",
          color: "red",
          enabled: true,
          kind: null,
        },
        SCOPE_CHANGE_RULE,
        {
          id: "second",
          name: "Support",
          jql: "labels = support",
          color: "blue",
          enabled: true,
          kind: null,
        },
      ],
    }),
    { resync: false },
  );
  model.showSettings("cardColors");
  await tick();
  expect(body()).toContain("dans le périmètre du board Kanban");
  expect(body()).not.toContain("Ajouté en cours de sprint");
  // Sans souris : la poignée monte la règle d'un cran, au-dessus d'« Urgent ».
  labelled("Déplacer la règle Support").dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
  );
  await tick();
  expect(
    [...document.querySelectorAll(".color-rule-name")].map(
      (input) => (input as HTMLInputElement).value,
    ),
  ).toEqual(["Support", "Urgent"]);
  const apply = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Appliquer",
  );
  if (!apply) throw new Error("Application attendue");
  apply.click();
  await expect
    .poll(() => board.configuration.value?.cardColorRules.map((rule) => rule.id))
    .toEqual(["second", "first", SCOPE_CHANGE_RULE.id]);
});

it("signale une lecture des Goals refusée sans inventer un board sans objectifs", async () => {
  await connectedBoard(kanbanSiteJira().on("POST", "/gateway/api/graphql", CORS_REFUSAL));
  expect(document.querySelector(".notice-error")).not.toBeNull();
  expect(body()).not.toContain("Aucun Goal Atlassian n'est rattaché");
  expect(body()).not.toContain("Aucun objectif sur ce board");
  expect(lanes()).toEqual([]);
});
