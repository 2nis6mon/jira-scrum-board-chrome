import { type BoardBlock, BUILD_BLOCK, resolveBlocks, swimlaneBlock } from "./boardBlocks";
import {
  type BoardConfiguration,
  displayedGoalId,
  isGoalHidden,
  shownSwimlaneIds,
} from "./boardConfiguration";
import { allIssues, type BoardIssue, type BoardSnapshot } from "./boardIssue";
import { laneKey, sprintNameOf } from "./boardLayout";
import type { RankChange } from "./dropPlan";

/** Objectif proposé par « Envoyer vers un goal », préfixé de son sprint comme sa swimlane. */
export interface GoalTarget {
  readonly id: string;
  readonly title: string;
  readonly sprintName: string | null;
}

export interface GoalTargets {
  /** Objectifs non masqués du board, dans l'ordre des swimlanes, sans celui du ticket. */
  readonly goals: readonly GoalTarget[];
  /**
   * « Retirer du goal » est proposé : le ticket est affiché sous un objectif et sa destination par
   * défaut est affichée. Rattaché à un objectif masqué, ou dont la swimlane de son type est
   * masquée, il ne l'est pas, comme le glissé, qui n'a alors aucune destination où le détacher.
   */
  readonly canDetach: boolean;
}

/**
 * Cibles du menu d'une carte. Rattachement libre à l'objectif de n'importe quel sprint du board,
 * comme le glissé. Ne lit ni n'écrit rien dans Jira.
 */
export function goalTargets(
  snapshot: BoardSnapshot,
  configuration: BoardConfiguration,
  issue: BoardIssue,
): GoalTargets {
  const current = displayedGoalId(configuration, issue.goalId);
  const visible = snapshot.goals.filter((goal) => !isGoalHidden(configuration, goal.id));
  const byId = new Map(visible.map((goal) => [goal.id, goal]));
  const swimlaneIds = shownSwimlaneIds(configuration);
  const ordered = resolveBlocks({
    goals: visible,
    storedOrder: configuration.blockOrder,
    includeBuild: false,
    swimlaneIds,
  }).flatMap((block) => {
    const goal = block.kind === "goal" ? byId.get(block.goalId) : undefined;
    return goal && goal.id !== current
      ? [{ id: goal.id, title: goal.title, sprintName: sprintNameOf(snapshot, goal) }]
      : [];
  });
  const destinationShown = issue.swimlaneId === null || swimlaneIds.includes(issue.swimlaneId);
  return { goals: ordered, canDetach: current !== null && destinationShown };
}

/** Destination d'un ticket sans objectif : la swimlane de son type, sinon Build. */
export function defaultBlock(issue: BoardIssue): BoardBlock {
  return issue.swimlaneId === null ? BUILD_BLOCK : swimlaneBlock(issue.swimlaneId);
}

/** Extrémité de sa swimlane où le menu classe un ticket. */
export type RankEdge = "top" | "bottom";

/**
 * Classement d'un ticket en tête ou en fin de sa swimlane, ou raison de l'action désactivée :
 * déjà premier (`first`), déjà dernier (`last`), ordre de rang Jira inconnu (`unknownRank`), ou
 * sous-tâche sans autre sous-tâche de son parent dans la swimlane (`subtaskAlone`).
 */
export type EdgeRank =
  | { readonly kind: "rank"; readonly change: RankChange }
  | {
      readonly kind: "blocked";
      readonly reason: "first" | "last" | "unknownRank" | "subtaskAlone";
    };

/**
 * Rang à écrire pour placer le ticket avant le premier, ou après le dernier, ticket de sa swimlane
 * (bloc où il est affiché), toutes colonnes et tous sprints actifs confondus, filtres ignorés.
 *
 * Jira ne classe une sous-tâche que parmi celles de son parent : une sous-tâche se compare aux
 * sous-tâches du même parent, un autre ticket aux tickets qui ne sont pas des sous-tâches. L'ordre
 * est celui du champ de rang du board (LexoRank, comparé comme chaîne). Un rang manquant laisse
 * l'ordre de lecture faire foi si tous ces tickets sont d'un même sprint (ou en Kanban) ; sinon
 * l'ordre entre sprints est inconnu. Ne lit ni n'écrit rien dans Jira.
 */
export function edgeRank(
  snapshot: BoardSnapshot,
  configuration: BoardConfiguration,
  issue: BoardIssue,
  edge: RankEdge,
): EdgeRank {
  const lane = laneKey(configuration, issue);
  const group = rankGroup(issue);
  // `allIssues` suit l'ordre de lecture (`issueOrder`) : il sert de repli et départage les égalités.
  const peers = allIssues(snapshot).filter(
    (candidate) => laneKey(configuration, candidate) === lane && rankGroup(candidate) === group,
  );
  // Une sous-tâche sans sœur du même parent dans la swimlane n'a rien à quoi se comparer.
  if (group !== "" && peers.length <= 1) return { kind: "blocked", reason: "subtaskAlone" };
  // Rangs comparables seulement dans un même compartiment LexoRank (`0|…`, `1|…`) : pendant un
  // rééquilibrage de Jira, des compartiments mêlés valent un rang manquant.
  const buckets = new Set(peers.map((peer) => peer.rank?.split("|")[0]));
  let ordered: readonly BoardIssue[];
  if (peers.every((peer) => peer.rank !== null) && buckets.size === 1) {
    ordered = [...peers].sort((a, b) => compareRank(a.rank as string, b.rank as string));
  } else if (new Set(peers.map((peer) => peer.sprintId)).size <= 1) {
    ordered = peers;
  } else {
    return { kind: "blocked", reason: "unknownRank" };
  }
  const key = issue.issue.key;
  if (edge === "top") {
    const first = ordered[0];
    return !first || first.issue.key === key
      ? { kind: "blocked", reason: "first" }
      : { kind: "rank", change: { kind: "before", issueKey: first.issue.key } };
  }
  const last = ordered.at(-1);
  return !last || last.issue.key === key
    ? { kind: "blocked", reason: "last" }
    : { kind: "rank", change: { kind: "after", issueKey: last.issue.key } };
}

/** Groupe où Jira classe un ticket : les sous-tâches d'un même parent, ou les autres tickets. */
function rankGroup(issue: BoardIssue): string {
  const fields = issue.issue.fields;
  if (fields.issuetype.subtask !== true) return "";
  // Sans parent connu, la sous-tâche n'a personne à qui se comparer.
  return `subtask:${fields.parent?.key ?? issue.issue.key}`;
}

/** Ordre de rang LexoRank : comparaison de chaînes, unité par unité, sans règle de langue. */
function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
