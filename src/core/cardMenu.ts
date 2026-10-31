import { type BoardBlock, BUILD_BLOCK, resolveBlocks, swimlaneBlock } from "./boardBlocks";
import {
  type BoardConfiguration,
  displayedGoalId,
  isGoalHidden,
  shownSwimlaneIds,
} from "./boardConfiguration";
import type { BoardIssue, BoardSnapshot } from "./boardIssue";
import { sprintNameOf } from "./boardLayout";

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
