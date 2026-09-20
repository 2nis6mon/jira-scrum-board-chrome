// Banc d'essai visuel : l'interface réelle, branchée sur le faux Jira des tests. Données
// FICTIVES. Sert à contrôler le rendu sans jamais toucher à une instance Jira. N'est référencé
// ni par board.html ni par vite.config.ts : il n'entre jamais dans dist/.
//
//   npm run harness   puis   http://localhost:5199/?scenario=board|board-filtre|board-session|
//                            board-vide|board-dnd|board-choix|board-statuts|board-erreur|board-goals|
//                            board-epingle|board-epingle-refus|board-multi|ok|xsrf|refuse|session|
//                            deconnecte
import { render } from "preact";
import { App } from "../../src/app/App";
import { AppModel } from "../../src/app/model/AppModel";
import "../../src/app/styles/app.css";
import { BOARD_PROPERTY_KEYS, SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import {
  BOARD_URL,
  boardSiteJira,
  SECOND_BOARD_URL,
  SPRINT_ISSUES,
  withSecondBoard,
} from "../support/boardFixture";
import { FakeJira, type Reply, XSRF_REFUSAL } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { goalsGateway } from "../support/goalsGateway";
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
  const destination = cell.querySelector<HTMLElement>(".status-drop-zone") ?? cell;
  destination.dispatchEvent(
    new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data, ...point }),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  destination.dispatchEvent(
    new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data, ...point }),
  );
  card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));
}

if (scenario.startsWith("board")) {
  const pinning = scenario === "board-epingle" || scenario === "board-epingle-refus";
  const withGoals = scenario === "board-goals" || pinning;
  // Filtres rapides FICTIFS du board ; le faux Jira « évalue » leur JQL par table.
  const quickFilters = [
    { id: 1, name: "Mes tickets", jql: "assignee = currentUser()", position: 0 },
    {
      id: 2,
      name: "Priorité haute",
      jql: "priority in (High, Highest)",
      description: "Priorités hautes et critiques",
      position: 1,
    },
    { id: 3, name: "Sans estimation", jql: '"Story Points" is EMPTY', position: 2 },
  ];
  const quickFilterAnswers: Record<string, string[]> = {
    "(assignee = currentUser()) AND sprint in (42)": ["ABC-101", "RUN-7"],
    "(priority in (High, Highest)) AND sprint in (42)": ["ABC-101", "RUN-7"],
    '("Story Points" is EMPTY) AND sprint in (42)': ["ABC-104", "RUN-7"],
  };
  const jira = boardSiteJira(
    withGoals
      ? {
          quickFilters,
          graphql: goalsGateway({
            goals: [
              {
                id: "ari:cloud:townsquare:c:goal/paiement",
                key: "GOAL-1",
                name: "Paiement en une étape",
                status: "on_track",
                owner: "Camille Durand",
                url: "https://home.atlassian.com/goal/1",
                workItems: ["ABC-101", "ABC-102"],
              },
              {
                id: "ari:cloud:townsquare:c:goal/stabilite",
                key: "GOAL-2",
                name: "Zéro incident",
                status: "at_risk",
                workItems: ["ABC-103"],
              },
              {
                id: "ari:cloud:townsquare:c:goal/securite",
                key: "GOAL-3",
                name: "Sécurité des comptes clients",
                status: "pending",
                owner: "Alex Martin",
              },
              {
                id: "ari:cloud:townsquare:c:goal/ancien",
                key: "GOAL-4",
                name: "Objectif archivé",
                isArchived: true,
              },
            ],
          }),
        }
      : { quickFilters },
  );
  jira.on("GET", "/rest/agile/1.0/board/7/issue", (request) => {
    const jql = request.url.searchParams.get("jql");
    const keys = jql === null ? null : quickFilterAnswers[jql];
    const issues =
      keys === undefined
        ? []
        : SPRINT_ISSUES.filter((issue) => keys === null || keys.includes(issue.key as string));
    return { status: 200, json: { issues, total: issues.length } };
  });
  if (pinning) {
    // Propriété du sprint qui garde ce qu'on y écrit, comme Jira.
    const goalsProperty = `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`;
    let stored: unknown = { atlassianGoalIds: [] };
    jira
      .on("GET", goalsProperty, () => ({ status: 200, json: { value: stored } }))
      .on("PUT", goalsProperty, (request) => {
        // Refus de droits (permission « Gérer les sprints » absente) : repli local proposé.
        if (scenario === "board-epingle-refus") {
          return { status: 403, json: { errorMessages: ["Manage Sprints requis"] } };
        }
        stored = request.body;
        return { status: 200 };
      });
  }
  // Réglages d'équipe : propriété du board qui garde ce qu'on y publie, comme Jira. Pour simuler la
  // publication d'un collègue depuis la console : `__equipe.publier({ agingThresholdDays: 9 })`.
  const teamProperty = `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`;
  let teamStored: Record<string, unknown> | null = null;
  jira
    .on("GET", teamProperty, () =>
      teamStored === null ? { status: 404 } : { status: 200, json: { value: teamStored } },
    )
    .on("PUT", teamProperty, (request) => {
      teamStored = request.body as Record<string, unknown>;
      return { status: 201 };
    });
  Object.assign(window, {
    __equipe: {
      publier(settings: Record<string, unknown>) {
        const current = (teamStored?.settings ?? {}) as Record<string, unknown>;
        teamStored = {
          ...(teamStored ?? { version: 1 }),
          publishedAt: new Date().toISOString(),
          publishedBy: { accountId: "collegue", displayName: "Alex Martin" },
          settings: { ...current, ...settings },
        };
      },
    },
  });
  // Parents, drapeau, versions et titres longs FICTIFS, pour juger la carte.
  const cardExtras: Record<string, Record<string, unknown>> = {
    "ABC-101": {
      parent: {
        key: "ABC-90",
        fields: { summary: "3 - [Paiement] Parcours en une étape pour tous" },
      },
      fixVersions: [{ id: "1", name: "AppWeb 99.0.0" }],
      components: [{ id: "1", name: "Web" }],
    },
    "ABC-102": {
      parent: {
        key: "ABC-90",
        fields: { summary: "3 - [Paiement] Parcours en une étape pour tous" },
      },
      customfield_10021: [{ value: "Impediment" }],
      priority: { id: "2", name: "High" },
      created: "2026-04-20T09:00:00.000+0000",
    },
    "ABC-103": { parent: { key: "ABC-91", fields: { summary: "Performance du panier" } } },
    "ABC-105": {
      summary:
        "Rédiger la note de version détaillée pour le support, le service client et les partenaires",
      parent: { key: "ABC-12", fields: { summary: "Communication des versions" } },
    },
    "RUN-7": { parent: { key: "RUN-1", fields: { summary: "Stabilité de la production" } } },
  };
  // Historique FICTIF du sprint : ABC-105 y est entré après le démarrage, les autres y étaient.
  const changelog = (key: string) => ({
    histories:
      key === "ABC-105"
        ? [
            {
              created: "2026-09-17T10:00:00.000+0200",
              items: [{ field: "Sprint", fromString: null, toString: "Sprint 42" }],
            },
          ]
        : [],
  });
  const decorated = (issue: Record<string, unknown>): Record<string, unknown> => {
    const extras = cardExtras[issue.key as string];
    const withHistory = { ...issue, changelog: changelog(issue.key as string) };
    return extras
      ? { ...withHistory, fields: { ...(issue.fields as Record<string, unknown>), ...extras } }
      : withHistory;
  };
  // Faux Jira qui évolue : après la transition, ABC-102 est « En cours ».
  let moved: { id: string; name: string } | null = null;
  const issues = () =>
    SPRINT_ISSUES.map((issue) =>
      moved && issue.key === "ABC-102"
        ? issueJson("ABC-102", {
            summary: "Brancher le prestataire de paiement",
            statusId: moved.id,
            statusName: moved.name,
            points: 8,
            extraFields: { issuelinks: (issue.fields as { issuelinks: unknown }).issuelinks },
          })
        : issue,
    ).map(decorated);
  jira.on("GET", "/rest/agile/1.0/sprint/42/issue", () => ({
    status: 200,
    json: { issues: issues(), total: issues().length },
  }));
  jira.on("GET", "/rest/api/3/issue/ABC-102", () => ({
    status: 200,
    json: {
      fields: {
        status: moved ? statusJson(moved.id, moved.name) : statusJson("1", "À faire", "new"),
      },
    },
  }));
  const target = ["21", "3", "En cours"];
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
        ...(scenario === "board-choix"
          ? [
              {
                id: "22",
                name: "Démarrer avec validation",
                to: statusJson("3", "En cours"),
                isAvailable: true,
              },
            ]
          : []),
        { id: "23", name: "Envoyer en revue", to: statusJson("4", "Revue"), isAvailable: true },
      ],
    },
  });
  jira.on("POST", "/rest/api/3/issue/ABC-102/transitions", (request) => {
    if (scenario === "board-erreur") {
      return {
        status: 400,
        json: { errorMessages: ["Le validateur du workflow a refusé la transition."] },
      };
    }
    const id = (request.body as { transition: { id: string } }).transition.id;
    moved = id === "23" ? { id: "4", name: "Revue" } : { id: "3", name: "En cours" };
    return { status: 204 };
  });
  if (scenario === "board-vide") {
    jira.on("GET", "/rest/agile/1.0/board/7/sprint", {
      status: 200,
      json: { values: [], isLast: true },
    });
  }
  // Régression navigateur : des transitions réelles du point de vue de l’interface,
  // sur plusieurs swimlanes. Les écritures ne touchent que cette mémoire de test.
  if (scenario === "board-drag-regression") {
    const changed = new Set<string>();
    jira.on("GET", "/rest/agile/1.0/sprint/42/issue", () => ({
      status: 200,
      json: {
        issues: issues().map((item) =>
          changed.has(String(item.key))
            ? {
                ...item,
                fields: {
                  ...(item.fields as Record<string, unknown>),
                  status: statusJson("3", "En cours"),
                },
              }
            : item,
        ),
        total: issues().length,
      },
    }));
    for (const key of ["ABC-102", "ABC-103", "ABC-105"]) {
      jira.on("GET", `/rest/api/3/issue/${key}`, () => ({
        status: 200,
        json: {
          fields: {
            status: statusJson(changed.has(key) ? "3" : key === "ABC-103" ? "6" : "1", "Statut"),
          },
        },
      }));
      jira.on("GET", `/rest/api/3/issue/${key}/transitions`, {
        status: 200,
        json: {
          transitions: [
            { id: "21", name: "Démarrer", to: statusJson("3", "En cours"), isAvailable: true },
            { id: "23", name: "Relire", to: statusJson("4", "Revue"), isAvailable: true },
          ],
        },
      });
      jira.on("POST", `/rest/api/3/issue/${key}/transitions`, () => {
        changed.add(key);
        return { status: 204 };
      });
    }
  }
  const model = new AppModel(fakePlatform(jira));
  if (container) render(<App model={model} />, container);
  await model.connect("acme.atlassian.net");
  const connection = model.connection.value;
  if (connection.state === "connected") {
    if (scenario === "board-multi") {
      // Deux boards enregistrés (le second, fictif, sur le projet XYZ) ; le board 7 est affiché.
      withSecondBoard(jira);
      await connection.board.detect(SECOND_BOARD_URL);
    }
    await connection.board.detect(BOARD_URL);
    await connection.board.applySettings(
      (current) => ({
        ...current,
        cardFields: [{ kind: "fixVersions" }, { kind: "components" }, { kind: "labels" }],
      }),
      { resync: true },
    );
    if (scenario === "board-statuts") {
      connection.board.startDrag("ABC-102", "scrum");
    }
    if (scenario === "board-filtre") connection.board.toggleQuickFilter("blocked");
    if (pinning) connection.board.openPinEditor();
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
