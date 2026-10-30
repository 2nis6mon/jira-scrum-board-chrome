import type { GoalsClient } from "../jira/goals";
import { type BoardIssue, type BoardSnapshot, goalsOfSprint, textLinkSprintId } from "./boardIssue";
import {
  type JiraWriter,
  type LinkOutcome,
  linkToTextGoal,
  type MoveOutcome,
  moveToColumn,
  rankIssue,
  type WriteReader,
} from "./boardWrites";
import type { RankChange } from "./dropPlan";

// Intentions d'écriture du board (AD-2) : chaque séquence est portée ici, une seule fois. Les
// services déclenchent sur geste, journalisent et traduisent le résultat typé en avis.

// ─── Changement de Goal Atlassian ────────────────────────────────────────────

export type AtlassianGoalOutcome =
  /** Le ticket porte déjà ce Goal : rien n'a été écrit. */
  | { kind: "unchanged" }
  /** L'ancien Goal a été détaché ; aucun nouveau Goal demandé. */
  | { kind: "unlinked" }
  /** Le ticket est rattaché au nouveau Goal (après détachement de l'ancien s'il y en avait un). */
  | { kind: "linked" }
  /** Atlassian a refusé le détachement : rien d'autre n'a été écrit. */
  | { kind: "unlinkRefused"; messages: readonly string[] }
  /** Atlassian a refusé le lien ; `detached` : l'ancien Goal a déjà été retiré. */
  | { kind: "linkRefused"; messages: readonly string[]; detached: boolean }
  /** Une écriture a échoué (ou son issue est incertaine) ; aucune n'est rejouée. */
  | { kind: "failed"; error: unknown; detached: boolean };

/**
 * Lien NATIF ticket ↔ Goal Atlassian. L'ancien Goal est détaché d'abord ; si Atlassian refuse ce
 * détachement, on s'arrête là : poursuivre laisserait le ticket rattaché à deux Goals.
 */
export async function changeAtlassianGoal(
  goals: Pick<GoalsClient, "setLink">,
  input: { issueId: string; previousGoalId: string | null; goalId: string | null },
): Promise<AtlassianGoalOutcome> {
  const { issueId, previousGoalId, goalId } = input;
  if (previousGoalId === goalId) return { kind: "unchanged" };
  let detached = false;
  try {
    if (previousGoalId !== null) {
      const removal = await goals.setLink("goal.unlink", previousGoalId, issueId);
      if (!removal.success) return { kind: "unlinkRefused", messages: removal.messages };
      detached = true;
      if (goalId === null) return { kind: "unlinked" };
    }
    if (goalId === null) return { kind: "unchanged" };
    const link = await goals.setLink("goal.link", goalId, issueId);
    if (!link.success) return { kind: "linkRefused", messages: link.messages, detached };
    return { kind: "linked" };
  } catch (error) {
    return { kind: "failed", error, detached };
  }
}

// ─── Déplacement : transition → Goal → rang ──────────────────────────────────

export type MoveStep = "transition" | "goal" | "rank";

export type TransitionStepResult = MoveOutcome | { kind: "failed"; error: unknown };

export type TextGoalOutcome =
  | LinkOutcome
  /** Aucun sprint où écrire le lien : rien n'a été écrit. */
  | { kind: "noSprint" }
  | { kind: "failed"; error: unknown };

export type GoalStepResult =
  | { origin: "atlassianGoals"; outcome: AtlassianGoalOutcome }
  | { origin: "text"; outcome: TextGoalOutcome };

export type RankStepResult = { kind: "ranked" } | { kind: "failed"; error: unknown };

export interface MoveResult {
  /** Étapes abouties, dans l'ordre d'exécution. La première non aboutie arrête la séquence. */
  readonly completed: readonly MoveStep[];
  readonly transition?: TransitionStepResult;
  readonly goal?: GoalStepResult;
  readonly rank?: RankStepResult;
}

export interface MovePorts {
  reader: WriteReader;
  writer: JiraWriter;
  goals: Pick<GoalsClient, "setLink">;
}

export interface MoveInput {
  issue: BoardIssue;
  snapshot: BoardSnapshot;
  /** Transition demandée, `null` si la colonne ne change pas. */
  transition: {
    knownStatusId: string;
    targetStatusIds: readonly string[];
    transitionId?: string;
  } | null;
  /** Goal demandé (`null` : aucun), absent si le Goal ne change pas. */
  goal?: { goalId: string | null };
  rank: RankChange;
  now: Date;
}

/**
 * Déplace un ticket dans l'ordre transition → Goal → rang. Chaque écriture part une fois ;
 * la première étape non aboutie arrête la séquence : les suivantes ne sont pas écrites.
 */
export async function executeMove(ports: MovePorts, input: MoveInput): Promise<MoveResult> {
  const completed: MoveStep[] = [];
  let transition: TransitionStepResult | undefined;
  if (input.transition) {
    try {
      transition = await moveToColumn(ports.reader, ports.writer, {
        issueKey: input.issue.issue.key,
        ...input.transition,
      });
    } catch (error) {
      transition = { kind: "failed", error };
    }
    if (!transitionDone(transition)) {
      return { completed, transition };
    }
    completed.push("transition");
  }
  const result = (extra: Partial<MoveResult>): MoveResult => ({
    completed,
    ...(transition ? { transition } : {}),
    ...extra,
  });
  let goal: GoalStepResult | undefined;
  if (input.goal) {
    goal = await assignGoal(ports, input, input.goal.goalId);
    if (!goalDone(goal)) return result({ goal });
    completed.push("goal");
  }
  const withGoal = goal ? { goal } : {};
  if (input.rank.kind === "none") return result(withGoal);
  let rank: RankStepResult;
  try {
    await rankIssue(ports.writer, input.issue.issue.key, input.rank);
    rank = { kind: "ranked" };
    completed.push("rank");
  } catch (error) {
    rank = { kind: "failed", error };
  }
  return result({ ...withGoal, rank });
}

/** Étape transition aboutie : le ticket est (déjà) dans la colonne visée. */
function transitionDone(step: TransitionStepResult): boolean {
  switch (step.kind) {
    case "moved":
    case "alreadyThere":
      return true;
    case "conflict":
    case "requiresFields":
    case "choose":
    case "noTransition":
    case "failed":
      return false;
  }
}

/** Étape Goal aboutie : le ticket porte le Goal demandé. */
function goalDone(step: GoalStepResult): boolean {
  if (step.origin === "atlassianGoals") {
    switch (step.outcome.kind) {
      case "unchanged":
      case "unlinked":
      case "linked":
        return true;
      case "unlinkRefused":
      case "linkRefused":
      case "failed":
        return false;
    }
  }
  switch (step.outcome.kind) {
    case "linked":
    case "unchanged":
      return true;
    case "conflict":
    case "noSprint":
    case "failed":
      return false;
  }
}

async function assignGoal(
  ports: MovePorts,
  input: MoveInput,
  goalId: string | null,
): Promise<GoalStepResult> {
  const { issue, snapshot } = input;
  if (snapshot.goalsOrigin === "atlassianGoals") {
    return {
      origin: "atlassianGoals",
      outcome: await changeAtlassianGoal(ports.goals, {
        issueId: issue.issue.id,
        previousGoalId: issue.goalId,
        goalId,
      }),
    };
  }
  const sprintId = textLinkSprintId(snapshot, issue);
  if (sprintId === null) return { origin: "text", outcome: { kind: "noSprint" } };
  const issueKey = issue.issue.key;
  const goals = goalsOfSprint(snapshot, sprintId);
  try {
    const outcome = await linkToTextGoal(ports.reader, ports.writer, {
      sprintId,
      issueKey,
      goalId,
      // Sans propriété lue au chargement, la base est inconnue : fusion sans contrôle.
      ...(snapshot.storedTextLinks?.[sprintId]
        ? { knownGoalId: snapshot.storedTextLinks[sprintId][issueKey] ?? null }
        : {}),
      goals,
      linkableGoalIds: snapshot.goals
        .filter((goal) => !goals.some((own) => own.id === goal.id))
        .map((goal) => goal.id),
      accountId: snapshot.currentUser?.accountId ?? null,
      now: input.now,
    });
    return { origin: "text", outcome };
  } catch (error) {
    return { origin: "text", outcome: { kind: "failed", error } };
  }
}
