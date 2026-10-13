import type { JiraIssueType } from "../jira/models";
import {
  type BoardConfiguration,
  defaultCategory,
  type IssueTypeConfiguration,
  normalizeSwimlanes,
} from "./boardConfiguration";

/**
 * Complète les types connus depuis les tickets déjà lus, sans recenser tout le backlog.
 * Un type absent de la photographie garde ses réglages ; les noms et icônes observés suivent
 * Jira, les catégories et groupes choisis restent ceux du board.
 */
export function withObservedIssueTypes(
  configuration: BoardConfiguration,
  observed: readonly JiraIssueType[],
): BoardConfiguration {
  const types = new Map(configuration.issueTypes.map((type) => [type.id, type]));
  let changed = false;
  for (const type of observed) {
    if (type.subtask === true) continue;
    const previous = types.get(type.id);
    if (previous?.name === type.name && previous.iconUrl === type.iconUrl) continue;
    const next: IssueTypeConfiguration = previous
      ? { ...previous, name: type.name, iconUrl: type.iconUrl }
      : {
          id: type.id,
          name: type.name,
          iconUrl: type.iconUrl,
          category: defaultCategory(type.name),
          countsAsBug: null,
        };
    types.set(type.id, next);
    changed = true;
  }
  if (!changed) return configuration;
  const issueTypes = [...types.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" }),
  );
  return {
    ...configuration,
    issueTypes,
    ticketSwimlanes: normalizeSwimlanes(issueTypes, configuration.ticketSwimlanes),
  };
}
