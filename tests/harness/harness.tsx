// Banc d'essai visuel : l'interface réelle, branchée sur le faux Jira des tests. Données
// FICTIVES. Sert à contrôler le rendu sans jamais toucher à une instance Jira. N'est référencé
// ni par board.html ni par vite.config.ts : il n'entre jamais dans dist/.
//
//   npm run harness   puis   http://localhost:5199/?scenario=board|board-filtre|board-session|
//                            board-vide|ok|xsrf|refuse|session|deconnecte
import { render } from "preact";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import "../../src/app/styles/app.css";
import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { FakeJira, type Reply, XSRF_REFUSAL } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

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

if (scenario.startsWith("board")) {
  const jira = boardSiteJira();
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
