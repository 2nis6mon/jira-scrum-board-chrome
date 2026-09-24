import {
  type BoardBlock,
  blockIdentifier,
  displayedBlocks,
  goalBlock,
  parseBlockIdentifier,
  resolveBlocks,
} from "./boardBlocks";
import {
  type BoardConfiguration,
  displayedGoalId,
  isGoalHidden,
  visibleColumns,
} from "./boardConfiguration";
import { type BoardSnapshot, goalProgress, isIssueDone } from "./boardIssue";
import { GOAL_COLOR_COUNT, type SprintGoal } from "./sprintGoals";

// Réglages d'affichage modifiés depuis le board : ordre, repli, masquage, couleur des objectifs.
// Portage des méthodes correspondantes de `BoardController` (Mac). Tous sont LOCAUX : chaque
// fonction rend une nouvelle configuration, rien n'est écrit dans Jira.

/** Noms des couleurs d'objectif, dans l'ordre de la palette (repris du Mac). */
export const GOAL_COLOR_NAMES = [
  "Bleu",
  "Bleu ardoise",
  "Violet",
  "Orange",
  "Rose",
  "Indigo",
  "Framboise",
  "Ocre",
  "Ambre",
] as const;

/**
 * Swimlanes affichées de haut en bas, filtres ignorés : objectifs non masqués, Build, et Kanban
 * s'il est activé et que le sprint a des tickets Kanban. C'est dans cet ordre qu'on monte ou
 * descend une swimlane ; un filtre ne doit pas changer ce que « monter » veut dire.
 */
export function laneOrder(snapshot: BoardSnapshot, configuration: BoardConfiguration): string[] {
  const blocks = resolveBlocks({
    goals: snapshot.goals.filter((goal) => !isGoalHidden(configuration, goal.id)),
    storedOrder: configuration.blockOrder,
    includeBuild: true,
    includeKanban: configuration.showKanbanSection,
  });
  return displayedBlocks({
    blocks,
    filtersActive: false,
    filteredCount: () => 0,
    sprintHasKanbanIssues: snapshot.kanbanIssues.length > 0,
  }).map(blockIdentifier);
}

/** Une swimlane résumée, pour la barre latérale : filtres ignorés, comme `laneOrder`. */
export interface LaneSummary {
  readonly id: string;
  readonly block: BoardBlock;
  readonly title: string;
  readonly goal: SprintGoal | null;
  /** Tickets du bloc : ceux de l'objectif, ceux de Build (aucun objectif affiché), ou Kanban. */
  readonly count: number;
  /** Tickets terminés du bloc. */
  readonly done: number;
}

/**
 * Swimlanes de la barre latérale, dans l'ordre du board (`laneOrder`). Build compte aussi les
 * tickets d'un objectif masqué : c'est là que le board les affiche.
 */
export function laneSummaries(
  snapshot: BoardSnapshot,
  configuration: BoardConfiguration,
): LaneSummary[] {
  const goals = new Map(snapshot.goals.map((goal) => [goal.id, goal]));
  return laneOrder(snapshot, configuration).flatMap((id): LaneSummary[] => {
    const block = parseBlockIdentifier(id);
    if (!block) return [];
    const issues =
      block.kind === "kanban"
        ? snapshot.kanbanIssues
        : snapshot.scrumIssues.filter(
            (issue) =>
              displayedGoalId(configuration, issue.goalId) ===
              (block.kind === "goal" ? block.goalId : null),
          );
    const goal = block.kind === "goal" ? (goals.get(block.goalId) ?? null) : null;
    if (block.kind === "goal" && !goal) return [];
    const title =
      goal?.title ??
      (block.kind === "kanban"
        ? configuration.kanbanSectionLabel || "Kanban"
        : configuration.buildSectionLabel || "Build");
    return [
      {
        id,
        block,
        title,
        goal,
        count: issues.length,
        done: goal
          ? goalProgress(
              goal,
              issues,
              visibleColumns(configuration.scrumColumns).at(-1)?.id ?? null,
            ).done
          : issues.filter(isIssueDone).length,
      },
    ];
  });
}

/**
 * Range les swimlanes dans l'ordre donné. Un bloc absent de l'affichage (objectif masqué, objectif
 * d'un autre sprint, Kanban sans ticket) reste juste après le bloc qui le précédait, pour retrouver
 * sa place s'il revient. Écart voulu avec le Mac, qui le renvoyait en fin de liste : un objectif
 * masqué puis réaffiché réapparaissait alors sous Build.
 */
export function withBlockOrder(
  configuration: BoardConfiguration,
  identifiers: readonly string[],
): BoardConfiguration {
  const result = [...new Set(identifiers)];
  const previous = configuration.blockOrder;
  previous.forEach((id, index) => {
    if (result.includes(id)) return;
    let at = 0;
    for (let before = index - 1; before >= 0; before--) {
      const anchor = result.indexOf(previous[before] ?? "");
      if (anchor >= 0) {
        at = anchor + 1;
        break;
      }
    }
    result.splice(at, 0, id);
  });
  // Un objectif masqué jamais rangé prend place en fin de liste, comme sur le Mac.
  for (const goalId of configuration.hiddenGoalIds) {
    const id = blockIdentifier(goalBlock(goalId));
    if (!result.includes(id)) result.push(id);
  }
  return { ...configuration, blockOrder: result };
}

export function withBlockCollapsed(
  configuration: BoardConfiguration,
  block: BoardBlock,
  collapsed: boolean,
): BoardConfiguration {
  const ids = new Set(configuration.collapsedBlockIds);
  if (collapsed) ids.add(blockIdentifier(block));
  else ids.delete(blockIdentifier(block));
  return { ...configuration, collapsedBlockIds: [...ids].sort() };
}

/** Tout replier (les swimlanes affichées) ou tout déplier. */
export function withAllBlocksCollapsed(
  configuration: BoardConfiguration,
  shownIdentifiers: readonly string[],
  collapsed: boolean,
): BoardConfiguration {
  return {
    ...configuration,
    collapsedBlockIds: collapsed ? [...new Set(shownIdentifiers)].sort() : [],
  };
}

/**
 * Masque un objectif du board, ou le réaffiche. Ses tickets rejoignent Build pendant qu'il est
 * masqué ; son rattachement dans Jira n'est pas touché.
 */
export function withGoalHidden(
  configuration: BoardConfiguration,
  goalId: string,
  hidden: boolean,
): BoardConfiguration {
  const ids = new Set(configuration.hiddenGoalIds);
  if (hidden) ids.add(goalId);
  else ids.delete(goalId);
  return { ...configuration, hiddenGoalIds: [...ids].sort() };
}

export function withGoalColor(
  configuration: BoardConfiguration,
  goalId: string,
  index: number,
): BoardConfiguration {
  const normalized = ((Math.trunc(index) % GOAL_COLOR_COUNT) + GOAL_COLOR_COUNT) % GOAL_COLOR_COUNT;
  return {
    ...configuration,
    goalColorIndex: { ...configuration.goalColorIndex, [goalId]: normalized },
  };
}

/**
 * Sélection d'épinglage gardée dans ce navigateur pour un sprint, quand Jira a refusé de
 * l'enregistrer. Une liste vide l'oublie. Portage de `setLocalGoalSelection` (Mac).
 */
export function withLocalPins(
  configuration: BoardConfiguration,
  sprintId: number,
  goalIds: readonly string[],
): BoardConfiguration {
  const localPinnedGoalIds = { ...configuration.localPinnedGoalIds };
  const ids = [...new Set(goalIds)];
  if (ids.length === 0) delete localPinnedGoalIds[String(sprintId)];
  else localPinnedGoalIds[String(sprintId)] = ids;
  return { ...configuration, localPinnedGoalIds };
}
