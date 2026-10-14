import { isRecord } from "../../src/jira/json";
import type { FakeJira } from "./fakeJira";

/** Réponses JQL FICTIVES pour le board de démonstration ; aucune dépendance de production. */
export function withJqlFixture(jira: FakeJira, rawIssues: readonly unknown[]): FakeJira {
  const issues = rawIssues.filter(isRecord);
  return jira
    .on("POST", "/rest/api/3/jql/parse", (request) => {
      const body = request.body as { queries: string[] };
      return {
        status: 200,
        json: {
          queries: body.queries.map((query) => ({
            query,
            ...(query.includes("~~") || /unknown|invalid/i.test(query)
              ? { errors: ["Champ ou opérateur inconnu dans cette requête."] }
              : { structure: {} }),
          })),
        },
      };
    })
    .on("GET", "/rest/api/3/jql/autocompletedata", {
      status: 200,
      json: {
        jqlReservedWords: ["and", "or", "in", "empty"],
        visibleFieldNames: ["issuetype", "priority", "labels", "status"].map((name) => ({
          value: name,
          displayName: name,
          auto: "true",
          operators: ["=", "!=", "in", "not in", "is", "is not"],
          types: ["java.lang.String"],
        })),
        visibleFunctionNames: [
          {
            value: "currentUser()",
            displayName: "currentUser()",
            types: ["com.atlassian.crowd.embedded.api.User"],
          },
        ],
      },
    })
    .on("GET", "/rest/api/3/jql/autocompletedata/suggestions", (request) => {
      const values =
        request.url.searchParams.get("fieldName") === "priority"
          ? ["High", "Highest", "Medium"]
          : ["run", "perf"];
      const prefix = (request.url.searchParams.get("fieldValue") ?? "").toLowerCase();
      return {
        status: 200,
        json: {
          results: values
            .filter((v) => v.toLowerCase().includes(prefix))
            .map((value) => ({ value, displayName: value })),
        },
      };
    })
    .on("POST", "/rest/api/3/jql/match", (request) => {
      const body = request.body as { issueIds: number[]; jqls: string[] };
      return {
        status: 200,
        json: {
          matches: body.jqls.map((query) => {
            const keys = issues.filter((issue) => {
              if (!body.issueIds.includes(Number(issue.id)) || !isRecord(issue.fields))
                return false;
              const fields = issue.fields;
              if (/issuetype\s+in/i.test(query) && isRecord(fields.issuetype))
                return query.includes(String(fields.issuetype.id));
              if (/priority\s*=\s*["']?High["']?$/i.test(query))
                return isRecord(fields.priority) && fields.priority.name === "High";
              if (/labels\s*=\s*["']?perf["']?$/i.test(query))
                return Array.isArray(fields.labels) && fields.labels.includes("perf");
              return false;
            });
            return {
              matchedIssues: keys.map((issue) => Number(issue.id)),
              errors: query.includes("~~") ? ["JQL refusé."] : [],
            };
          }),
        },
      };
    });
}
