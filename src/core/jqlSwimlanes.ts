import {
  type BoardConfiguration,
  categoryForIssueType,
  displayedGoalId,
  normalizeJqlSwimlanes,
  swimlaneName,
  type TicketSwimlane,
} from "./boardConfiguration";
import { allIssues, type BoardIssue, type BoardSnapshot } from "./boardIssue";

/** Une clé absente signifie « résultat inconnu », un ensemble vide « aucun ticket ». */
export type JqlSwimlaneMatches = ReadonlyMap<string, ReadonlySet<string>>;

export interface SwimlanePreview {
  readonly lanes: readonly {
    readonly id: string;
    readonly matched: number;
    readonly assigned: number;
    readonly goals: number;
    readonly earlier: number;
    readonly issueKeys: readonly string[];
    readonly error?: string;
  }[];
  readonly defaultCount: number;
  readonly subtaskChanges?: number;
}

/** Prépare une conversion locale : l'appelant valide les JQL avant toute publication explicite. */
export function migrateToJqlSwimlanes(configuration: BoardConfiguration): BoardConfiguration {
  if (configuration.swimlaneMode === "jql") return configuration;
  const rank = new Map(configuration.blockOrder.map((id, index) => [id, index]));
  const ticketSwimlanes = [...configuration.ticketSwimlanes]
    .sort(
      (a, b) =>
        (rank.get(`swimlane:${a.id}`) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(`swimlane:${b.id}`) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((lane) => ({
      ...lane,
      // Fige le libellé calculé avant que les types cessent de définir les groupes.
      name: swimlaneName(configuration, lane),
      jql: lane.typeIds.length > 0 ? `issuetype in (${lane.typeIds.map(quoteJql).join(", ")})` : "",
      enabled: lane.typeIds.length > 0,
    }));
  return {
    ...configuration,
    swimlaneMode: "jql",
    ticketSwimlanes,
    issueTypes: configuration.issueTypes.map((type) =>
      type.category === "IGNORED" ? type : { ...type, category: "GOAL" as const },
    ),
  };
}

function quoteJql(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Applique une liste déjà validée et aligne sa priorité avec l'ordre visuel des swimlanes. */
export function withJqlSwimlanes(
  configuration: BoardConfiguration,
  lanes: readonly TicketSwimlane[],
): BoardConfiguration {
  const migrated = migrateToJqlSwimlanes(configuration);
  const ticketSwimlanes = normalizeJqlSwimlanes(lanes);
  const ids = ticketSwimlanes.map((lane) => `swimlane:${lane.id}`);
  let index = 0;
  const blockOrder = migrated.blockOrder.flatMap((id) => {
    if (!id.startsWith("swimlane:")) return [id];
    const replacement = ids[index++];
    return replacement ? [replacement] : [];
  });
  const remaining = ids.slice(index);
  // Un ordre encore implicite conserve l'ordre natif : objectifs, Default, règles.
  if (migrated.blockOrder.length > 0) blockOrder.push(...remaining);
  const kept = new Set(ids);
  return {
    ...migrated,
    ticketSwimlanes,
    blockOrder,
    collapsedBlockIds: migrated.collapsedBlockIds.filter(
      (id) => !id.startsWith("swimlane:") || kept.has(id),
    ),
  };
}

function destination(
  configuration: BoardConfiguration,
  matches: JqlSwimlaneMatches,
  key: string,
): { readonly id: string | null; readonly known: boolean } {
  for (const lane of configuration.ticketSwimlanes) {
    if (lane.enabled === false) continue;
    const keys = matches.get(lane.id);
    // Une règle précédente illisible peut être prioritaire : ne pas annoncer un autre résultat.
    if (!keys) return { id: null, known: false };
    if (keys.has(key)) return { id: lane.id, known: true };
  }
  return { id: null, known: true };
}

/**
 * Classe chaque ticket, sous-tâche comprise, sans interpréter le JQL côté navigateur.
 * Le lien d'objectif et son héritage sont conservés ; le layout garde leur priorité.
 */
export function classifyJqlSwimlanes(
  configuration: BoardConfiguration,
  snapshot: BoardSnapshot,
  matches: JqlSwimlaneMatches,
  previousSnapshot?: BoardSnapshot,
): { readonly snapshot: BoardSnapshot; readonly unresolvedIssueKeys: ReadonlySet<string> } {
  if (configuration.swimlaneMode !== "jql") return { snapshot, unresolvedIssueKeys: new Set() };
  const previous = new Map(
    allIssues(previousSnapshot ?? snapshot).map((issue) => [issue.issue.key, issue]),
  );
  const unresolvedIssueKeys = new Set<string>();
  const issues: BoardIssue[] = [];
  for (const issue of allIssues(snapshot)) {
    if (
      issue.category === "IGNORED" ||
      categoryForIssueType(configuration, issue.issue.fields.issuetype.id) === "IGNORED"
    )
      continue;
    const result = destination(configuration, matches, issue.issue.key);
    let swimlaneId = result.id;
    if (!result.known) {
      unresolvedIssueKeys.add(issue.issue.key);
      const oldLane = previous.get(issue.issue.key)?.swimlaneId;
      // Un classement incertain ne doit pas faire disparaître le ticket dans une règle masquée.
      swimlaneId =
        configuration.ticketSwimlanes.find(
          (lane) => lane.id === oldLane && lane.enabled !== false && !lane.hidden,
        )?.id ?? null;
    }
    issues.push({ ...issue, swimlaneId, category: swimlaneId === null ? "GOAL" : "SWIMLANE" });
  }
  return {
    snapshot: {
      ...snapshot,
      goalIssues: issues.filter((issue) => issue.swimlaneId === null || issue.goalId !== null),
      swimlaneIssues: issues.filter((issue) => issue.swimlaneId !== null && issue.goalId === null),
      issueOrder: issues.map((issue) => issue.issue.key),
    },
    unresolvedIssueKeys,
  };
}

/** Aperçu limité aux tickets du board ; un ticket dans un objectif n'est pas compté deux fois. */
export function previewJqlSwimlanes(
  configuration: BoardConfiguration,
  snapshot: BoardSnapshot,
  matches: JqlSwimlaneMatches,
): SwimlanePreview {
  const issues = allIssues(snapshot).filter(
    (issue) =>
      issue.category !== "IGNORED" &&
      categoryForIssueType(configuration, issue.issue.fields.issuetype.id) !== "IGNORED",
  );
  const destinations = new Map(
    issues.map((issue) => [issue.issue.key, destination(configuration, matches, issue.issue.key)]),
  );
  const hasGoal = (issue: BoardIssue) => displayedGoalId(configuration, issue.goalId) !== null;
  return {
    lanes: configuration.ticketSwimlanes.map((lane) => {
      const keys = matches.get(lane.id);
      const matching =
        lane.enabled === false ? [] : issues.filter((issue) => keys?.has(issue.issue.key));
      const available = matching.filter((issue) => !hasGoal(issue));
      const assigned = available.filter(
        (issue) => destinations.get(issue.issue.key)?.id === lane.id,
      ).length;
      const earlier = available.filter((issue) => {
        const result = destinations.get(issue.issue.key);
        return result?.known && result.id !== lane.id;
      }).length;
      return {
        id: lane.id,
        matched: matching.length,
        assigned,
        goals: matching.length - available.length,
        earlier,
        issueKeys: matching.slice(0, 5).map((issue) => issue.issue.key),
        ...(!keys && lane.enabled !== false ? { error: "Résultat Jira indisponible." } : {}),
      };
    }),
    defaultCount: issues.filter((issue) => {
      const result = destinations.get(issue.issue.key);
      return !hasGoal(issue) && result?.known && result.id === null;
    }).length,
    subtaskChanges: issues.filter((issue) => {
      const result = destinations.get(issue.issue.key);
      return (
        issue.issue.fields.issuetype.subtask === true &&
        !hasGoal(issue) &&
        result?.known &&
        result.id !== issue.swimlaneId
      );
    }).length,
  };
}
