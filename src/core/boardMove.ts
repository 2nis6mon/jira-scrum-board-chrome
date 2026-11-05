import type { JiraClient } from "../jira/client";
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
  withTextGoalLink,
} from "./boardWrites";
import type { RankChange } from "./dropPlan";
import { type ReadBackWait, readBack } from "./readBack";
import { makeSprintGoalDocument, updateSprintGoalProperty } from "./sprintGoals";

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

export type RankStepResult =
  | { kind: "ranked" }
  /**
   * E2 acceptée par Jira, mais nouvel ordre toujours absent de la route des tickets au terme des
   * relectures bornées (story 8.29) : le rang est écrit, l'affichage de Jira ne le montre pas encore.
   */
  | { kind: "unseen" }
  | { kind: "failed"; error: unknown };

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
  /**
   * Confirmation du rang (story 8.29) : routes des tickets lues par le board, et attente entre deux
   * relectures. Sans elle, le rang accepté par Jira est tenu pour confirmé.
   */
  order?: { readonly reader: OrderReader; readonly wait?: ReadBackWait };
}

/** Routes des tickets du board, dans l'ordre de Jira : sprint (Scrum) ou board (Kanban). */
export type OrderReader = Pick<JiraClient, "sprintIssues" | "boardIssues">;

/** Route où relire l'ordre : `boardId` et sous-filtre Kanban de la configuration du board. */
export interface OrderScope {
  readonly boardId: number;
  readonly kanbanSubQuery: string | null;
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
  /** Route où confirmer le rang ; absente : pas de confirmation. */
  orderScope?: OrderScope;
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
  try {
    await rankIssue(ports.writer, input.issue.issue.key, input.rank);
  } catch (error) {
    return result({ ...withGoal, rank: { kind: "failed", error } });
  }
  completed.push("rank");
  const rank: RankStepResult = (await rankSeen(ports, input, input.rank))
    ? { kind: "ranked" }
    : { kind: "unseen" };
  return result({ ...withGoal, rank });
}

/**
 * Confirmation d'une E2 acceptée (story 8.29) : la route des tickets du board montre l'écriture
 * avec un délai (constat 8.10) ; relue à intervalles bornés jusqu'à voir le ticket à sa place,
 * sans jamais rejouer l'écriture. Indécidable (ticket ou référence absents de la route) ou
 * lecture en échec : tenu pour vu, la relecture du board suit.
 */
async function rankSeen(
  ports: MovePorts,
  input: MoveInput,
  change: Exclude<RankChange, { kind: "none" }>,
): Promise<boolean> {
  const order = ports.order;
  const scope = input.orderScope;
  if (!order || !scope) return true;
  const issueKey = input.issue.issue.key;
  const sprintId = input.issue.sprintId;
  const query = { estimationFieldId: null, includeChangelog: false, onlyFields: ORDER_FIELDS };
  const read = async () =>
    (sprintId !== null
      ? await order.reader.sprintIssues(scope.boardId, sprintId, query)
      : await order.reader.boardIssues(scope.boardId, scope.kanbanSubQuery, query)
    ).map((issue) => issue.key);
  const placed = (keys: readonly string[]) => {
    const at = keys.indexOf(issueKey);
    const reference = keys.indexOf(change.issueKey);
    // Ordre indécidable sur cette route : rien à attendre.
    if (at < 0 || reference < 0) return true;
    return change.kind === "before" ? at < reference : at > reference;
  };
  try {
    return placed(await readBack(read, placed, order.wait));
  } catch {
    return true;
  }
}

/** Champs réduits à ceux qu'exige le décodage d'un ticket (type et statut). */
const ORDER_FIELDS = ["issuetype", "status"];

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
      // Objectifs lus au chargement : ceux que le board n'affiche plus sont retirés, pas les autres.
      ...(snapshot.storedTextGoalIds?.[sprintId]
        ? { knownGoalIds: snapshot.storedTextGoalIds[sprintId] }
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

// ─── Rattachement d'un lot de cartes du board (story 8.33) ──────────────────

/** Limite d'un lot de cartes, comme les lots du planning (E9 et E10) : 50 tickets par geste. */
export const BOARD_BATCH_LIMIT = 50;

export interface GoalBatchResult {
  /** Tickets dont le lien demandé est confirmé par Jira (ou déjà en place). */
  readonly confirmedKeys: readonly string[];
  /** Tickets non rattachés : rien n'est rejoué. */
  readonly remainingKeys: readonly string[];
  /** Première étape non aboutie, et son ticket ; absente si tout le lot est confirmé. */
  readonly failure?: { readonly issueKey: string; readonly step: GoalStepResult };
}

/**
 * Rattache un lot de tickets du board à un même objectif (`goalId` à `null` : le détache), sans
 * transition ni rang (story 8.33). En texte, UNE écriture E5 par sprint de la propriété, dans
 * l'ordre des sprints du lot, fusionnée sur Jira frais et refusée si le lien d'un ticket du lot y a
 * changé depuis le chargement. En Goals Atlassian, détacher (E4) puis lier (E3) ticket par ticket.
 * Arrêt au premier échec ; aucune écriture n'est rejouée.
 */
export async function assignGoalBatch(
  ports: Pick<MovePorts, "reader" | "writer" | "goals">,
  input: {
    snapshot: BoardSnapshot;
    issues: readonly BoardIssue[];
    goalId: string | null;
    now: Date;
  },
): Promise<GoalBatchResult> {
  const { snapshot, issues, goalId } = input;
  const keys = issues.map((issue) => issue.issue.key);
  const confirmed = new Set<string>();
  const result = (failure?: GoalBatchResult["failure"]): GoalBatchResult => ({
    confirmedKeys: keys.filter((key) => confirmed.has(key)),
    remainingKeys: keys.filter((key) => !confirmed.has(key)),
    ...(failure ? { failure } : {}),
  });

  if (snapshot.goalsOrigin === "atlassianGoals") {
    for (const issue of issues) {
      const step: GoalStepResult = {
        origin: "atlassianGoals",
        outcome: await changeAtlassianGoal(ports.goals, {
          issueId: issue.issue.id,
          previousGoalId: issue.goalId,
          goalId,
        }),
      };
      if (!goalDone(step)) return result({ issueKey: issue.issue.key, step });
      confirmed.add(issue.issue.key);
    }
    return result();
  }

  // Texte : un groupe par sprint où le lien est stocké, dans l'ordre du lot.
  const groups = new Map<number | null, BoardIssue[]>();
  for (const issue of issues) {
    const sprintId = textLinkSprintId(snapshot, issue);
    groups.set(sprintId, [...(groups.get(sprintId) ?? []), issue]);
  }
  for (const [sprintId, group] of groups) {
    const first = group[0]?.issue.key ?? "";
    if (sprintId === null)
      return result({ issueKey: first, step: { origin: "text", outcome: { kind: "noSprint" } } });
    const groupKeys = group.map((issue) => issue.issue.key);
    const known = snapshot.storedTextLinks?.[sprintId];
    const goals = goalsOfSprint(snapshot, sprintId);
    const linkableGoalIds = snapshot.goals
      .filter((goal) => !goals.some((own) => own.id === goal.id))
      .map((goal) => goal.id);
    const accountId = snapshot.currentUser?.accountId ?? null;
    try {
      const outcome = await updateSprintGoalProperty(ports.reader, ports.writer, {
        sprintId,
        // Sans propriété lue au chargement, la base est inconnue : fusion sans contrôle.
        unchangedSince: (fresh) =>
          known === undefined ||
          groupKeys.every((key) => (fresh?.links[key] ?? null) === (known[key] ?? null)),
        mutate: (fresh) => {
          let document = fresh;
          for (const key of groupKeys) {
            document = withTextGoalLink(document, {
              issueKey: key,
              goalId,
              goals,
              ...(snapshot.storedTextGoalIds?.[sprintId]
                ? { knownGoalIds: snapshot.storedTextGoalIds[sprintId] }
                : {}),
              linkableGoalIds,
              accountId,
              now: input.now,
            });
          }
          return document ?? makeSprintGoalDocument();
        },
        accountId,
        now: input.now,
      });
      if (outcome.kind === "conflict") {
        const changed =
          groupKeys.find((key) => (outcome.fresh?.links[key] ?? null) !== (known?.[key] ?? null)) ??
          first;
        return result({
          issueKey: changed,
          step: {
            origin: "text",
            outcome: { kind: "conflict", current: outcome.fresh?.links[changed] ?? null },
          },
        });
      }
      for (const key of groupKeys) confirmed.add(key);
    } catch (error) {
      return result({
        issueKey: first,
        step: { origin: "text", outcome: { kind: "failed", error } },
      });
    }
  }
  return result();
}
