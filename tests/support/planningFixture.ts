import { SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { boardSiteJira, SPRINT_GOAL_TEXT } from "./boardFixture";
import { type FakeJira, isWriteRequest } from "./fakeJira";
import { issueJson } from "./jiraFixtures";

// Sprint Planning FICTIF et évolutif. Les écritures du navigateur restent dans cette mémoire.
export const PLANNING_GOAL_TEXT = "🎯 Simplifier le paiement\n🎯 Rendre le panier plus rapide";

export const PLANNING_BACKLOG = [
  issueJson("ABC-201", {
    summary: "Mémoriser le moyen de paiement préféré",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 5,
    parent: "ABC-90",
  }),
  issueJson("ABC-202", {
    summary: "Charger le panier sans attendre les recommandations",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 3,
    parent: "ABC-91",
  }),
  issueJson("ABC-203", {
    summary: "Rendre les erreurs de paiement compréhensibles",
    statusId: "1",
    statusName: "À faire",
    category: "new",
  }),
  issueJson("ABC-204", {
    summary: "Conserver le panier entre deux visites",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 8,
  }),
];

const ALREADY_PLANNED = issueJson("ABC-210", {
  summary: "Ajouter un récapitulatif du panier accessible",
  statusId: "1",
  statusName: "À faire",
  category: "new",
  points: 2,
});

/** Installe les routes après celles du board, pour préserver les lectures du sprint actif 42. */
export function planningFixture(jira: FakeJira = boardSiteJira()) {
  const sprint = {
    id: 43,
    name: "Sprint 43 — Paiement sans friction",
    state: "future",
    originBoardId: 7,
    goal: PLANNING_GOAL_TEXT,
  };
  const activeSprint = {
    id: 42,
    name: "Sprint 42",
    state: "active",
    originBoardId: 7,
    startDate: "2026-09-14T08:00:00.000+0200",
    endDate: "2026-09-25T18:00:00.000+0200",
    goal: SPRINT_GOAL_TEXT,
  };
  const selected = new Set(["ABC-210"]);
  const catalog = [ALREADY_PLANNED, ...PLANNING_BACKLOG];
  let document: unknown = null;
  const property = `/rest/agile/1.0/sprint/43/properties/${SPRINT_PROPERTY_KEYS.goals}`;

  jira
    .on("GET", "/rest/agile/1.0/board/7/sprint", (request) => {
      const states = request.url.searchParams.get("state")?.split(",") ?? [];
      return {
        status: 200,
        json: {
          isLast: true,
          values: [activeSprint, sprint].filter(
            (item) => states.length === 0 || states.includes(item.state),
          ),
        },
      };
    })
    .on("GET", "/rest/agile/1.0/sprint/43", () => ({ status: 200, json: sprint }))
    .on("GET", "/rest/agile/1.0/sprint/42", { status: 200, json: activeSprint })
    .on("GET", "/rest/software/1.0/board/7/backlog", (request) => {
      const available = PLANNING_BACKLOG.filter((issue) => !selected.has(String(issue.key)));
      const secondPage = request.url.searchParams.get("nextPageToken") === "planning-page-2";
      const issues = secondPage ? available.slice(2) : available.slice(0, 2);
      const isLast = secondPage || available.length <= 2;
      return {
        status: 200,
        json: { issues, isLast, ...(!isLast && { nextPageToken: "planning-page-2" }) },
      };
    })
    .on("GET", "/rest/agile/1.0/board/7/sprint/43/issue", () => {
      const issues = catalog.filter((issue) => selected.has(String(issue.key)));
      return { status: 200, json: { issues, total: issues.length } };
    })
    .on("POST", "/rest/agile/1.0/sprint/43", (request) => {
      const body = request.body as { goal?: unknown } | null;
      if (!body || typeof body.goal !== "string" || Object.keys(body).length !== 1) {
        return { status: 400, json: { errorMessages: ["Seul le texte de l'objectif est permis"] } };
      }
      sprint.goal = body.goal;
      return { status: 200, json: sprint };
    })
    .on("POST", "/rest/agile/1.0/sprint/43/issue", (request) => {
      const body = request.body as { issues?: unknown } | null;
      if (
        !body ||
        !Array.isArray(body.issues) ||
        body.issues.length === 0 ||
        body.issues.length > 50 ||
        Object.keys(body).length !== 1 ||
        body.issues.some((key) => !PLANNING_BACKLOG.some((issue) => issue.key === key))
      ) {
        return { status: 400, json: { errorMessages: ["Tickets hors du backlog de test"] } };
      }
      for (const key of body.issues) selected.add(String(key));
      return { status: 204 };
    })
    .on("GET", property, () =>
      document === null ? { status: 404 } : { status: 200, json: { value: document } },
    )
    .on("PUT", property, (request) => {
      document = request.body;
      return { status: 201 };
    });

  return {
    jira,
    inspect: () => ({
      sprint,
      issueKeys: [...selected],
      document,
      writes: jira.requests.filter(isWriteRequest).map(({ method, path, body }) => ({
        method,
        path,
        body,
      })),
    }),
  };
}
