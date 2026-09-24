import { BOARD_PROPERTY_KEYS, SPRINT_PROPERTY_KEYS } from "../../src/jira/writes";
import { FakeJira, type RecordedRequest, type Reply } from "./fakeJira";
import { issueJson, statusJson } from "./jiraFixtures";

// Faux Jira d'un board complet (board 7, sprint actif 42), pour les tests de l'interface et le
// banc d'essai visuel. Données FICTIVES : jamais importé par src/.

export const BOARD_URL = "https://acme.atlassian.net/jira/software/c/projects/ABC/boards/7";

const blocked = (key: string) => ({
  issuelinks: [
    {
      type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
      inwardIssue: {
        key,
        fields: { summary: "Mise à jour du certificat", status: statusJson("3", "En cours") },
      },
    },
  ],
});

export const SPRINT_ISSUES = [
  issueJson("ABC-101", {
    summary: "Afficher le récapitulatif avant paiement",
    statusId: "3",
    statusName: "En cours",
    assigneeId: "u1",
    assigneeName: "Camille Durand",
    priority: "High",
    points: 5,
    parent: "ABC-90",
  }),
  issueJson("ABC-102", {
    summary: "Brancher le prestataire de paiement",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 8,
    extraFields: blocked("OPS-412"),
  }),
  issueJson("ABC-103", {
    summary: "Réduire le temps de chargement du panier",
    statusId: "6",
    statusName: "Terminé",
    category: "done",
    assigneeId: "u2",
    assigneeName: "Alex Martin",
    points: 3,
    labels: ["perf"],
  }),
  issueJson("ABC-104", {
    summary: "Nettoyer les journaux applicatifs",
    statusId: "4",
    statusName: "Revue",
    assigneeId: "u2",
    assigneeName: "Alex Martin",
    extraFields: { customfield_10021: [{ value: "Impediment" }] },
  }),
  issueJson("ABC-105", {
    summary: "Rédiger la note de version",
    statusId: "1",
    statusName: "À faire",
    category: "new",
    points: 1,
  }),
  issueJson("RUN-7", {
    summary: "Erreur 500 à la validation du panier",
    statusId: "3",
    statusName: "En cours",
    typeId: "10004",
    typeName: "Anomalie Prod",
    assigneeId: "u1",
    assigneeName: "Camille Durand",
    priority: "Highest",
  }),
];

export const SPRINT_GOAL_TEXT = "🎯 Finaliser le parcours de paiement\n🎯 Améliorer la stabilité";

export const GOALS_DOCUMENT = {
  version: 1,
  goals: [
    { id: "g-paiement", title: "Finaliser le parcours de paiement", color: "goal1", position: 0 },
    { id: "g-stabilite", title: "Améliorer la stabilité", color: "goal2", position: 1 },
  ],
  links: { "ABC-101": "g-paiement", "ABC-102": "g-paiement", "ABC-103": "g-stabilite" },
  atlassianGoalIds: [],
};

/** Refus de la passerelle GraphQL tel que constaté sur instance réelle sans la règle Origin. */
export const CORS_REFUSAL: Reply = {
  status: 403,
  json: { code: 403, message: "Invalid CORS request" },
  headers: { "Content-Type": "application/json", "X-Failure-Category": "FAILURE_CLIENT_CORS" },
};

export function boardSiteJira(
  options: {
    sprintIssues?: unknown[];
    myself?: Reply;
    graphql?: Reply | ((request: RecordedRequest) => Reply);
    /** Filtres rapides du board Jira ; aucun par défaut. */
    quickFilters?: unknown[];
  } = {},
) {
  const issues = options.sprintIssues ?? SPRINT_ISSUES;
  return (
    new FakeJira()
      .on("POST", "/gateway/api/graphql", options.graphql ?? CORS_REFUSAL)
      .on(
        "GET",
        "/rest/api/3/myself",
        options.myself ?? {
          status: 200,
          json: { accountId: "u1", displayName: "Camille Durand" },
        },
      )
      .on("GET", "/rest/agile/1.0/board/7", {
        status: 200,
        json: { id: 7, name: "Équipe Paiement", type: "scrum", location: { projectKey: "ABC" } },
      })
      // Réglages d'équipe : rien de publié par défaut (Jira répond 404 à une propriété absente).
      .on("GET", `/rest/agile/1.0/board/7/properties/${BOARD_PROPERTY_KEYS.teamSettings}`, {
        status: 404,
      })
      .on("GET", "/rest/agile/1.0/board/7/quickfilter", {
        status: 200,
        json: { isLast: true, values: options.quickFilters ?? [] },
      })
      .on("GET", "/rest/agile/1.0/board/7/configuration", {
        status: 200,
        json: {
          columnConfig: {
            columns: [
              { name: "À faire", statuses: [{ id: "1" }] },
              { name: "En cours", statuses: [{ id: "3" }, { id: "4" }], max: 2 },
              { name: "Terminé", statuses: [{ id: "6" }] },
            ],
          },
          estimation: { field: { fieldId: "customfield_10016" } },
        },
      })
      .on("GET", "/rest/api/3/status", {
        status: 200,
        json: [
          statusJson("1", "À faire", "new"),
          statusJson("3", "En cours"),
          statusJson("4", "Revue"),
          statusJson("6", "Terminé", "done"),
        ],
      })
      .on("GET", "/rest/api/3/field", {
        status: 200,
        json: [
          { id: "customfield_10016", name: "Story Points" },
          { id: "customfield_10021", name: "Flagged", schema: { custom: "x:multicheckboxes" } },
        ],
      })
      .on("GET", "/rest/agile/1.0/board/7/issue", {
        status: 200,
        json: { issues, total: issues.length },
      })
      .on("GET", "/rest/agile/1.0/board/7/sprint", {
        status: 200,
        json: {
          isLast: true,
          values: [
            {
              id: 42,
              name: "Sprint 42",
              state: "active",
              startDate: "2026-09-14T08:00:00.000+0200",
              endDate: "2026-09-25T18:00:00.000+0200",
              goal: SPRINT_GOAL_TEXT,
            },
          ],
        },
      })
      .on("GET", "/rest/agile/1.0/board/7/sprint/42/issue", {
        status: 200,
        json: { issues, total: issues.length },
      })
      .on("GET", `/rest/agile/1.0/sprint/42/properties/${SPRINT_PROPERTY_KEYS.goals}`, {
        status: 200,
        json: { key: SPRINT_PROPERTY_KEYS.goals, value: GOALS_DOCUMENT },
      })
  );
}

/** Second board FICTIF du même site (12, projet XYZ), pour les tests à plusieurs boards. */
export const SECOND_BOARD_URL = "https://acme.atlassian.net/jira/software/c/projects/XYZ/boards/12";

export function withSecondBoard(jira: FakeJira): FakeJira {
  const issues = [issueJson("XYZ-1", { summary: "Refondre le compte", statusId: "1" })];
  return jira
    .on("GET", "/rest/agile/1.0/board/12", {
      status: 200,
      json: { id: 12, name: "Équipe Compte", type: "scrum", location: { projectKey: "XYZ" } },
    })
    .on("GET", "/rest/agile/1.0/board/12/configuration", {
      status: 200,
      json: {
        columnConfig: {
          columns: [
            { name: "À faire", statuses: [{ id: "1" }] },
            { name: "Terminé", statuses: [{ id: "6" }] },
          ],
        },
      },
    })
    .on("GET", `/rest/agile/1.0/board/12/properties/${BOARD_PROPERTY_KEYS.teamSettings}`, {
      status: 404,
    })
    .on("GET", "/rest/agile/1.0/board/12/quickfilter", {
      status: 200,
      json: { isLast: true, values: [] },
    })
    .on("GET", "/rest/agile/1.0/board/12/issue", {
      status: 200,
      json: { issues, total: issues.length },
    })
    .on("GET", "/rest/agile/1.0/board/12/sprint", {
      status: 200,
      json: {
        isLast: true,
        values: [{ id: 77, name: "Compte 3", state: "active", goal: "🎯 Refonte du compte" }],
      },
    })
    .on("GET", "/rest/agile/1.0/board/12/sprint/77/issue", {
      status: 200,
      json: { issues, total: issues.length },
    });
}
