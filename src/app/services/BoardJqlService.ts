import { type BoardConfiguration, colorRules } from "../../core/boardConfiguration";
import { allIssues, type BoardSnapshot } from "../../core/boardIssue";
import { resolveCardColors, SCOPE_CHANGE_RULE_ID } from "../../core/cardColors";
import { classifyJqlSwimlanes } from "../../core/jqlSwimlanes";
import type { JqlService } from "./JqlService";

/** Une seule évaluation Jira par texte, partagée entre couleurs et classement du board. */
export async function evaluateBoardJql(
  service: JqlService,
  configuration: BoardConfiguration,
  snapshot: BoardSnapshot,
  previousSnapshot?: BoardSnapshot,
) {
  const rules = colorRules(configuration);
  const lanes =
    configuration.swimlaneMode === "jql"
      ? configuration.ticketSwimlanes.filter((lane) => lane.enabled !== false)
      : [];
  const issues = allIssues(snapshot);
  const queries = [
    ...rules.filter((rule) => rule.enabled && rule.kind === null).map((rule) => rule.jql),
    ...lanes.map((lane) => lane.jql ?? ""),
  ];
  // Les identifiants viennent uniquement du snapshot du board : aucun ticket extérieur n'entre.
  const matches = await service.match(
    issues.map((issue) => issue.issue),
    queries,
  );
  const colorMatches: Record<string, ReadonlySet<string>> = {};
  const colorErrors: Record<string, string> = {};
  const colorCounts: Record<string, number> = {};
  for (const rule of rules) {
    if (!rule.enabled || rule.kind !== null) continue;
    const result = matches.get(rule.jql);
    if (!result || result.errors.length > 0) {
      colorErrors[rule.id] = result?.errors.join(" ") || "Évaluation Jira indisponible.";
    } else {
      colorMatches[rule.id] = result.keys;
      colorCounts[rule.id] = result.keys.size;
    }
  }
  const laneMatches = new Map<string, ReadonlySet<string>>();
  const laneErrors: Record<string, string> = {};
  for (const lane of lanes) {
    const result = matches.get(lane.jql ?? "");
    if (!result || result.errors.length > 0) {
      laneErrors[lane.id] = result?.errors.join(" ") || "Évaluation Jira indisponible.";
    } else laneMatches.set(lane.id, result.keys);
  }
  const classified =
    configuration.swimlaneMode === "jql"
      ? classifyJqlSwimlanes(configuration, snapshot, laneMatches, previousSnapshot)
      : { snapshot, unresolvedIssueKeys: new Set<string>() };
  const added = new Set(
    issues.filter((issue) => issue.addedAfterSprintStart === true).map((issue) => issue.issue.key),
  );
  colorCounts[SCOPE_CHANGE_RULE_ID] = added.size;
  return {
    ...classified,
    laneMatches,
    laneErrors,
    colorMatches,
    colorErrors,
    colorCounts,
    colors: resolveCardColors(rules, colorMatches, added),
  };
}
