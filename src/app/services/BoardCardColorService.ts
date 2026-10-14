import { type BoardConfiguration, colorRules } from "../../core/boardConfiguration";
import { allIssues, type BoardSnapshot } from "../../core/boardIssue";
import { resolveCardColors, SCOPE_CHANGE_RULE_ID } from "../../core/cardColors";
import type { JqlService } from "./JqlService";

/** Évalue uniquement les couleurs sur les tickets du board, sans modifier leurs swimlanes. */
export async function evaluateBoardCardColors(
  service: JqlService,
  configuration: BoardConfiguration,
  snapshot: BoardSnapshot,
) {
  const rules = colorRules(configuration);
  const issues = allIssues(snapshot);
  const queries = rules
    .filter((rule) => rule.enabled && rule.kind === null)
    .map((rule) => rule.jql);
  // Les identifiants viennent du snapshot : aucun ticket extérieur n'entre dans le résultat.
  const results = await service.match(
    issues.map((issue) => issue.issue),
    queries,
  );
  const matches: Record<string, ReadonlySet<string>> = {};
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const rule of rules) {
    if (!rule.enabled || rule.kind !== null) continue;
    const result = results.get(rule.jql);
    if (!result || result.errors.length > 0) {
      errors[rule.id] = result?.errors.join(" ") || "Évaluation Jira indisponible.";
    } else {
      matches[rule.id] = result.keys;
      counts[rule.id] = result.keys.size;
    }
  }
  const added = new Set(
    issues.filter((issue) => issue.addedAfterSprintStart === true).map((issue) => issue.issue.key),
  );
  counts[SCOPE_CHANGE_RULE_ID] = added.size;
  return { matches, errors, counts, colors: resolveCardColors(rules, matches, added) };
}
