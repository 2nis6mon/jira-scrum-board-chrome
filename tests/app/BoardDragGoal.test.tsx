// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, GOALS_DOCUMENT } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { statusJson } from "../support/jiraFixtures";

// Story 8.32 : hors de sa swimlane de départ, une carte glissée ne change que d'objectif. Toute la
// swimlane visée est une seule zone de dépôt ; données FICTIVES du board de test.

// Happy DOM ne déclare pas les événements de glissé natifs ; Preact choisit leur casse via le DOM.
for (const name of ["ondragstart", "ondragend", "ondragover", "ondragleave", "ondrop"])
  Object.defineProperty(HTMLElement.prototype, name, { value: null, configurable: true });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
const models: AppModel[] = [];

afterEach(() => {
  render(null, document.body);
  for (const model of models) {
    const connection = model.connection.value;
    if (connection.state === "connected") connection.board.dispose();
  }
  models.length = 0;
});

function dragEvent(type: string, data: Map<string, string>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      effectAllowed: "none",
      dropEffect: "none",
      setData: (kind: string, value: string) => data.set(kind, value),
      getData: (kind: string) => data.get(kind) ?? "",
    },
  });
  return event;
}

const lane = (id: string) => {
  const found = document.querySelector<HTMLElement>(`section.lane[data-lane-id="${id}"]`);
  if (!found) throw new Error(`swimlane ${id} absente`);
  return found;
};
const cell = (label: string) => {
  const found = document.querySelector<HTMLElement>(`ul[aria-label="${label}"]`);
  if (!found) throw new Error(`case « ${label} » absente`);
  return found;
};
const cellOf = (key: string) =>
  document.querySelector(`[data-issue-key="${key}"]`)?.closest("ul")?.getAttribute("aria-label");

async function connectedBoard() {
  let stored: typeof GOALS_DOCUMENT = { ...GOALS_DOCUMENT, links: { ...GOALS_DOCUMENT.links } };
  const jira = boardSiteJira()
    .on("GET", PROPERTY, () => ({ status: 200, json: { value: stored } }))
    .on("PUT", PROPERTY, (request) => {
      stored = request.body as typeof stored;
      return { status: 200 };
    })
    .on("GET", "/rest/api/3/issue/ABC-105/transitions", {
      status: 200,
      json: {
        transitions: [
          { id: "21", name: "Démarrer", to: statusJson("3", "En cours"), isAvailable: true },
        ],
      },
    })
    .on("GET", "/rest/api/3/issue/RUN-7/transitions", { status: 200, json: { transitions: [] } });
  const model = new AppModel(fakePlatform(jira));
  models.push(model);
  render(<App model={model} />, document.body);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state !== "connected") throw new Error("Connexion attendue");
  await connection.board.detect(BOARD_URL);
  await tick();
  const before = jira.requests.length;
  return {
    board: connection.board,
    links: () => stored.links as Record<string, string>,
    writes: () => jira.requests.slice(before).filter(isWriteRequest),
  };
}

function startDrag(key: string): Map<string, string> {
  const data = new Map<string, string>();
  const card = document.querySelector(`[data-issue-key="${key}"]`);
  if (!card) throw new Error(`carte ${key} absente`);
  card.dispatchEvent(dragEvent("dragstart", data));
  return data;
}

it("autre objectif : une seule zone, lâchée dans une autre colonne, objectif seul (ni état ni rang)", async () => {
  const { board, links, writes } = await connectedBoard();
  expect(cellOf("ABC-105")).toBe("Build — À faire");
  const data = startDrag("ABC-105");
  await tick();

  // Swimlane de départ : colonnes et statuts comme avant, pas de zone unique.
  expect(lane("build").classList.contains("lane-drop-zone")).toBe(false);
  expect(cell("Build — À faire").classList.contains("lane-cell-droppable")).toBe(true);
  expect(cell("Build — En cours").classList.contains("lane-cell-statuses")).toBe(true);
  // Autre objectif : toute la swimlane, sans zone par colonne ni zone de statut.
  const target = lane("goal:g-stabilite");
  expect(target.classList.contains("lane-drop-zone")).toBe(true);
  expect(target.querySelector(".lane-cell-droppable, .lane-cell-statuses")).toBeNull();
  expect(target.querySelector(".status-drop-zone")).toBeNull();

  // Survol de la case « Terminé », puis dépôt : la swimlane entière reçoit le geste.
  const done = cell("Améliorer la stabilité — Terminé");
  done.dispatchEvent(dragEvent("dragover", data));
  await tick();
  expect(target.classList.contains("lane-drop-target")).toBe(true);
  expect(target.querySelector(".lane-drop-message")?.textContent).toBe("Rattacher à cet objectif");
  done.dispatchEvent(dragEvent("drop", data));
  await expect.poll(() => board.pendingKeys.value.size).toBe(0);
  await tick();

  expect(writes().map((request) => `${request.method} ${request.path}`)).toEqual([
    `PUT ${PROPERTY}`,
  ]);
  expect(links()["ABC-105"]).toBe("g-stabilite");
  expect(cellOf("ABC-105")).toBe("Améliorer la stabilité — À faire");
});

it("en-tête d'une swimlane repliée : le dépôt rattache aussi à l'objectif", async () => {
  const { board, links, writes } = await connectedBoard();
  await board.toggleLaneCollapsed({ kind: "goal", goalId: "g-stabilite" });
  await tick();
  const target = lane("goal:g-stabilite");
  expect(target.querySelector(".lane-cell")).toBeNull();
  const data = startDrag("ABC-105");
  await tick();
  const header = target.querySelector(".lane-header");
  if (!header) throw new Error("en-tête attendu");
  header.dispatchEvent(dragEvent("dragover", data));
  header.dispatchEvent(dragEvent("drop", data));
  await expect.poll(() => board.pendingKeys.value.size).toBe(0);
  expect(writes().map((request) => request.path)).toEqual([PROPERTY]);
  expect(links()["ABC-105"]).toBe("g-stabilite");
});

it("swimlane refusée pour le type : indisponible avec son message, rien n'est écrit", async () => {
  const { board, writes } = await connectedBoard();
  expect(
    document.querySelector('[data-issue-key="RUN-7"]')?.closest("section")?.dataset.laneId,
  ).toBe("swimlane:1");
  const data = startDrag("RUN-7");
  await tick();
  const build = lane("build");
  expect(build.classList.contains("lane-drop-unavailable")).toBe(true);
  expect(build.getAttribute("aria-disabled")).toBe("true");
  // Son message ne s'affiche qu'au survol (story 8.32), et le dépôt n'y est pas permis.
  expect(build.querySelector(".lane-drop-message")).toBeNull();
  const over = dragEvent("dragover", data);
  cell("Build — À faire").dispatchEvent(over);
  expect(over.defaultPrevented).toBe(false);
  await tick();
  expect(build.querySelector(".lane-drop-message")?.textContent).toBe(
    "Utilisez un objectif ou la swimlane par défaut de ce type",
  );
  expect(build.classList.contains("lane-drop-target")).toBe(false);
  cell("Build — À faire").dispatchEvent(dragEvent("drop", data));
  await tick();
  expect(board.dragging.value).toBeNull();
  expect(writes()).toEqual([]);
});
