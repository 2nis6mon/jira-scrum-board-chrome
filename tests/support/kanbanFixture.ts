import { boardSiteJira, SPRINT_ISSUES } from "./boardFixture";
import { type FakeGoal, goalsGateway } from "./goalsGateway";

// Board Kanban FICTIF : les routes de sprint du faux Scrum ne doivent jamais être appelées.
export const KANBAN_NAME = "Flux Paiement";
export const KANBAN_SUBQUERY = "fixVersion in unreleasedVersions() OR fixVersion is EMPTY";
export const KANBAN_GOALS: FakeGoal[] = [
  {
    id: "ari:cloud:townsquare:c:goal/paiement",
    name: "Paiement en une étape",
    workItems: ["ABC-101", "ABC-102"],
  },
  { id: "ari:cloud:townsquare:c:goal/securite", name: "Sécurité des comptes", workItems: [] },
];

export function kanbanSiteJira(options: { issues?: unknown[]; goals?: FakeGoal[] } = {}) {
  const issues = options.issues ?? SPRINT_ISSUES;
  return boardSiteJira({
    sprintIssues: issues,
    graphql: goalsGateway({ goals: options.goals ?? KANBAN_GOALS }),
  })
    .on("GET", "/rest/agile/1.0/board/7", {
      status: 200,
      json: { id: 7, name: KANBAN_NAME, type: "kanban", location: { projectKey: "ABC" } },
    })
    .on("GET", "/rest/agile/1.0/board/7/configuration", {
      status: 200,
      json: {
        subQuery: { query: KANBAN_SUBQUERY },
        columnConfig: {
          columns: [
            { name: "À faire", statuses: [{ id: "1" }] },
            { name: "En cours", statuses: [{ id: "3" }, { id: "4" }], max: 2 },
            { name: "Terminé", statuses: [{ id: "6" }] },
          ],
        },
        estimation: { field: { fieldId: "customfield_10016" } },
      },
    });
}
