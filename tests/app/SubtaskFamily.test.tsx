// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { fakePlatform } from "../support/fakePlatform";
import { issueJson, statusJson } from "../support/jiraFixtures";

// Données FICTIVES. Survoler une story (ou une de ses sous-tâches) entoure de rouge et éclaire
// toute sa famille ; les sous-tâches gardent leur carte, dans la swimlane de leur story.

afterEach(() => {
  render(null, document.body);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const SUBTASK = { id: "10003", name: "Sous-tâche", subtask: true };

function subtask(key: string, parent: string) {
  return issueJson(key, {
    summary: `Morceau ${key}`,
    extraFields: {
      issuetype: SUBTASK,
      status: statusJson("3", "En cours", "indeterminate"),
      parent: { key: parent, fields: { summary: parent } },
    },
  });
}

async function boardWithFamily() {
  const sprintIssues = [
    ...SPRINT_ISSUES.map((issue) =>
      issue.key === "ABC-101"
        ? {
            ...issue,
            fields: {
              ...(issue.fields as object),
              subtasks: ["ABC-111", "ABC-112"].map((key) => ({
                key,
                fields: subtask(key, "ABC-101").fields,
              })),
            },
          }
        : issue,
    ),
    subtask("ABC-111", "ABC-101"),
    subtask("ABC-112", "ABC-101"),
  ];
  const model = new AppModel(fakePlatform(boardSiteJira({ sprintIssues })));
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("connexion attendue");
  await connection.board.detect(BOARD_URL);
  await tick();
  return connection.board;
}

const card = (key: string) => {
  const element = document.querySelector<HTMLElement>(`[data-issue-key="${key}"]`);
  if (!element) throw new Error(`carte ${key} absente`);
  return element;
};
const lit = () =>
  [...document.querySelectorAll<HTMLElement>(".card-family")]
    .map((element) => element.dataset.issueKey)
    .sort();
const hover = async (key: string) => {
  card(key).dispatchEvent(new MouseEvent("mouseenter"));
  await tick();
};
const leave = async (key: string) => {
  card(key).dispatchEvent(new MouseEvent("mouseleave"));
  await tick();
};

describe("famille d'une story au survol", () => {
  it("les sous-tâches gardent leur carte, dans la swimlane de leur story", async () => {
    const board = await boardWithFamily();
    const lane = (key: string) => card(key).closest("[data-lane-id]")?.getAttribute("data-lane-id");
    expect(lane("ABC-111")).toBe(lane("ABC-101"));
    expect(lane("ABC-112")).toBe(lane("ABC-101"));
    board.dispose();
  });

  it("survoler la story entoure et éclaire la story et toutes ses sous-tâches", async () => {
    const board = await boardWithFamily();
    await hover("ABC-101");
    expect(lit()).toEqual(["ABC-101", "ABC-111", "ABC-112"]);
    await leave("ABC-101");
    expect(lit()).toEqual([]);
    board.dispose();
  });

  it("survoler une sous-tâche éclaire aussi toute sa famille", async () => {
    const board = await boardWithFamily();
    await hover("ABC-112");
    expect(lit()).toEqual(["ABC-101", "ABC-111", "ABC-112"]);
    board.dispose();
  });

  it("une story sans sous-tâche ne s'éclaire pas : rien à relier", async () => {
    const board = await boardWithFamily();
    await hover("ABC-104");
    expect(lit()).toEqual([]);
    board.dispose();
  });
});
