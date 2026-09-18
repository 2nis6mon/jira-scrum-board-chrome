// Banc d'essai visuel : l'interface réelle, branchée sur le faux Jira des tests. Données
// FICTIVES. Sert à contrôler le rendu sans jamais toucher à une instance Jira. N'est référencé
// ni par board.html ni par vite.config.ts : il n'entre jamais dans dist/.
//
//   npm run harness   puis   http://localhost:5199/?scenario=board|board-filtre|board-session|
//                            board-vide|board-dnd|board-choix|board-erreur|ok|xsrf|refuse|session|deconnecte
import { render } from "preact";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import "../../src/app/styles/app.css";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { FakeJira, type Reply, XSRF_REFUSAL } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { issueJson, statusJson } from "../support/jiraFixtures";

const PROPERTY = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.diagnostic}`;
const OK: Reply = { status: 200, json: {} };
const CLOUD: Reply = {
  status: 200,
  json: { data: { tenantContexts: [{ cloudId: "cloud-test" }] } },
};
const STORED: Reply = { status: 200, json: { value: { probe: true } } };
const CORS: Reply = {
  status: 403,
  json: { code: 403, message: "Invalid CORS request" },
  headers: { "Content-Type": "application/json", "X-Failure-Category": "FAILURE_CLIENT_CORS" },
};

const scenario = new URLSearchParams(location.search).get("scenario") ?? "board";
const container = document.getElementById("app");

/**
 * Glisser-déposer simulé sur les vraies vues : les événements DOM sont ceux qu'un vrai glissé
 * produit (dragstart, dragover, drop, dragend), avec un DataTransfer réel.
 */
async function simulateDrop(
  issueKey: string,
  laneLabel: string,
  columnName: string,
  beforeKey: string | null,
) {
  const card = document.querySelector<HTMLElement>(`[data-issue-key="${issueKey}"]`);
  const cell = document.querySelector<HTMLElement>(`ul[aria-label="${laneLabel} — ${columnName}"]`);
  if (!card || !cell)
    throw new Error(`glissé impossible : ${issueKey} → ${laneLabel} / ${columnName}`);
  const data = new DataTransfer();
  const at = (element: HTMLElement, where: "top" | "bottom") => {
    const box = element.getBoundingClientRect();
    return { clientX: box.left + 10, clientY: where === "top" ? box.top + 2 : box.bottom - 2 };
  };
  const reference = beforeKey
    ? document.querySelector<HTMLElement>(`[data-issue-key="${beforeKey}"]`)
    : null;
  const point = reference ? at(reference, "top") : at(cell, "bottom");
  card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: data }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  cell.dispatchEvent(
    new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data, ...point }),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  cell.dispatchEvent(
    new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data, ...point }),
  );
  card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));
}

if (scenario.startsWith("board")) {
  const jira = boardSiteJira();
  // Faux Jira qui évolue : après la transition, ABC-102 est « En cours ».
  let moved = false;
  const issues = () =>
    SPRINT_ISSUES.map((issue) =>
      moved && issue.key === "ABC-102"
        ? issueJson("ABC-102", {
            summary: "Brancher le prestataire de paiement",
            statusId: "3",
            statusName: "En cours",
            points: 8,
            extraFields: { issuelinks: (issue.fields as { issuelinks: unknown }).issuelinks },
          })
        : issue,
    );
  jira.on("GET", "/rest/agile/1.0/sprint/42/issue", () => ({
    status: 200,
    json: { issues: issues(), total: issues().length },
  }));
  jira.on("GET", "/rest/api/3/issue/ABC-102", () => ({
    status: 200,
    json: {
      fields: { status: moved ? statusJson("3", "En cours") : statusJson("1", "À faire", "new") },
    },
  }));
  const target = scenario === "board-choix" ? ["41", "9", "Abandonné"] : ["21", "3", "En cours"];
  jira.on("GET", "/rest/api/3/issue/ABC-102/transitions", {
    status: 200,
    json: {
      transitions: [
        {
          id: target[0],
          name: `Vers ${target[2]}`,
          to: statusJson(target[1] ?? "", target[2] ?? ""),
          isAvailable: true,
        },
      ],
    },
  });
  jira.on("POST", "/rest/api/3/issue/ABC-102/transitions", () => {
    if (scenario === "board-erreur") {
      return {
        status: 400,
        json: { errorMessages: ["Le validateur du workflow a refusé la transition."] },
      };
    }
    moved = true;
    return { status: 204 };
  });
  if (scenario === "board-vide") {
    jira.on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [], isLast: true },
    });
  }
  const model = new AppModel(fakePlatform(jira));
  if (container) render(<App model={model} />, container);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state === "connected") {
    await connection.board.detect(BOARD_URL);
    if (scenario === "board-filtre") connection.board.toggleQuickFilter("blocked");
    if (["board-dnd", "board-choix", "board-erreur"].includes(scenario)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await simulateDrop("ABC-102", "Finaliser le parcours de paiement", "En cours", null);
    }
    if (scenario === "board-session") {
      jira.on("GET", "/rest/agile/1.0/board/7/sprint", { status: 401 });
      await connection.board.sync();
    }
  }
} else {
  const jira = new FakeJira()
    .on("GET", "/rest/api/3/myself", { status: 200, json: { displayName: "Personne Test" } })
    .on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [{ id: 42, name: "Sprint de test 12" }] },
    })
    .on("DELETE", PROPERTY, { status: 204 });
  switch (scenario) {
    case "xsrf":
      jira
        .on("POST", "/rest/api/3/jql/parse", XSRF_REFUSAL, OK)
        .on("POST", "/gateway/api/graphql", CORS)
        .on("GET", PROPERTY, { status: 404 }, STORED)
        .on("PUT", PROPERTY, XSRF_REFUSAL, { status: 201 });
      break;
    case "refuse":
      jira
        .on("POST", "/rest/api/3/jql/parse", XSRF_REFUSAL)
        .on("POST", "/gateway/api/graphql", XSRF_REFUSAL)
        .on("GET", PROPERTY, { status: 404 })
        .on("PUT", PROPERTY, XSRF_REFUSAL);
      break;
    case "session":
      jira.on("GET", "/rest/api/3/myself", { status: 401 });
      break;
    default:
      jira
        .on("POST", "/rest/api/3/jql/parse", OK)
        .on("POST", "/gateway/api/graphql", CLOUD)
        .on("GET", PROPERTY, { status: 404 }, STORED)
        .on("PUT", PROPERTY, { status: 201 });
  }

  const model = new AppModel(fakePlatform(jira));
  if (container) render(<App model={model} />, container);
  if (scenario === "deconnecte") {
    await model.start();
    await model.connect("jira.acme.example");
  } else {
    await model.connect("acme.atlassian.net");
    model.showDiagnostic();
    const connection = model.connection.value;
    if (connection.state === "connected" && scenario !== "session") {
      await connection.diagnostic.findSprint(BOARD_URL);
      await connection.diagnostic.runWriteTest();
    }
  }
}
