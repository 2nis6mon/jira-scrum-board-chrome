/** Bloc du board visé par le dépôt d'une carte, du point de vue des objectifs. */
export type GoalDropTarget =
  /** La zone ne porte aucune notion d'objectif (bloc Kanban). */
  | { kind: "unchanged" }
  /** Bloc par défaut des tickets sans objectif (Build ou swimlane par type) : détache l'objectif. */
  | { kind: "build" }
  /** Bloc d'un objectif : le dépôt rattache le ticket à cet objectif. */
  | { kind: "goal"; goalId: string };

export type GoalChange =
  | { kind: "none" }
  /** `goalId` à `null` détache le ticket de son objectif. */
  | { kind: "assign"; goalId: string | null };

/** Ce qu'un dépôt doit réellement écrire dans Jira. Rien si rien ne change. */
export interface BoardDropPlan {
  readonly goalChange: GoalChange;
  readonly changesColumn: boolean;
}

export function isNoOpDrop(plan: BoardDropPlan): boolean {
  return plan.goalChange.kind === "none" && !plan.changesColumn;
}

/**
 * `currentGoalId` est l'objectif sous lequel le ticket est AFFICHÉ (voir `displayedGoalId`) :
 * le ticket d'un objectif masqué, affiché dans son bloc par défaut, n'est pas détaché sur place.
 */
export function resolveDrop(input: {
  currentGoalId: string | null;
  currentColumnId: string | null;
  targetColumnId: string;
  goalTarget: GoalDropTarget;
}): BoardDropPlan {
  const { currentGoalId, goalTarget } = input;
  let goalChange: GoalChange = { kind: "none" };
  if (goalTarget.kind === "build" && currentGoalId !== null) {
    goalChange = { kind: "assign", goalId: null };
  } else if (goalTarget.kind === "goal" && currentGoalId !== goalTarget.goalId) {
    goalChange = { kind: "assign", goalId: goalTarget.goalId };
  }
  return { goalChange, changesColumn: input.currentColumnId !== input.targetColumnId };
}

/** Déplacement demandé dans le classement du board. */
export type RankChange =
  | { kind: "none" }
  /** Placer le ticket juste avant celui-ci. */
  | { kind: "before"; issueKey: string }
  /** Placer le ticket juste après celui-ci (dépôt en fin de colonne). */
  | { kind: "after"; issueKey: string };

/**
 * Classement à écrire pour amener `movingKey` à la position visée.
 *
 * `orderedKeys` est la colonne d'arrivée telle qu'elle est affichée, dans l'ordre. `reference`
 * est le ticket devant lequel on dépose ; `null` signifie « à la fin ». Retourne `none` quand la
 * carte est déjà à cette place : aucune écriture inutile.
 */
export function planRank(
  movingKey: string,
  orderedKeys: readonly string[],
  reference: string | null,
): RankChange {
  // Déposer une carte sur elle-même ne la déplace pas.
  if (reference === movingKey) return { kind: "none" };

  const others = orderedKeys.filter((key) => key !== movingKey);
  const last = others.at(-1);
  if (last === undefined) return { kind: "none" };
  const currentIndex = orderedKeys.indexOf(movingKey);

  if (reference === null) {
    // Dépôt en fin de colonne.
    if (currentIndex === orderedKeys.length - 1) return { kind: "none" };
    return { kind: "after", issueKey: last };
  }
  if (!others.includes(reference)) return { kind: "none" };
  // Déjà juste avant la référence : rien à écrire.
  if (currentIndex >= 0 && orderedKeys.indexOf(reference) === currentIndex + 1) {
    return { kind: "none" };
  }
  return { kind: "before", issueKey: reference };
}
