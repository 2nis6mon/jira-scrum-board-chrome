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
  isGoalHidden,
  shownSwimlaneIds,
  visibleColumns,
} from "./boardConfiguration";
import { type BoardSnapshot, goalProgress, isIssueDone } from "./boardIssue";
import { blockTitle, laneKey } from "./boardLayout";
import { moveAmongShown, sameOrder, shiftTarget } from "./reorder";
import { GOAL_COLOR_COUNT, type SprintGoal } from "./sprintGoals";

// Réglages d'affichage modifiés depuis le board : ordre, repli, masquage, couleur des objectifs.
// Fonctions pures : elles rendent une configuration. Le modèle publie les réglages partagés.

/** Noms des couleurs d'objectif, dans l'ordre de la palette. */
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
 * Swimlanes affichées de haut en bas, filtres ignorés : objectifs non masqués, Build et les
 * swimlanes par type non masquées seulement si elles ont des tickets. C'est dans cet ordre qu'on
 * monte ou descend une swimlane ; un filtre ne doit pas changer ce que « monter » veut dire.
 */
export function laneOrder(snapshot: BoardSnapshot, configuration: BoardConfiguration): string[] {
  const blocks = resolveBlocks({
    goals: snapshot.goals.filter((goal) => !isGoalHidden(configuration, goal.id)),
    storedOrder: configuration.blockOrder,
    includeBuild: true,
    swimlaneIds: shownSwimlaneIds(configuration),
  });
  const counts = new Map<string, number>();
  for (const issue of [...snapshot.goalIssues, ...snapshot.swimlaneIssues]) {
    const key = laneKey(configuration, issue);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return displayedBlocks({
    blocks,
    filtersActive: false,
    filteredCount: () => 0,
    totalCount: (block) => counts.get(blockIdentifier(block)) ?? 0,
  }).map(blockIdentifier);
}

/** Une swimlane résumée, pour la barre latérale : filtres ignorés, comme `laneOrder`. */
export interface LaneSummary {
  readonly id: string;
  readonly block: BoardBlock;
  readonly title: string;
  readonly goal: SprintGoal | null;
  /** Tickets du bloc : ceux de l'objectif, de Build (aucun objectif affiché) ou de la swimlane. */
  readonly count: number;
  /** Tickets terminés du bloc. */
  readonly done: number;
}

/**
 * Swimlanes de la barre latérale, dans l'ordre du board (`laneOrder`). Un objectif masqué rend
 * ses tickets à leur destination par défaut, comme sur le board.
 */
export function laneSummaries(
  snapshot: BoardSnapshot,
  configuration: BoardConfiguration,
): LaneSummary[] {
  const goals = new Map(snapshot.goals.map((goal) => [goal.id, goal]));
  return laneOrder(snapshot, configuration).flatMap((id): LaneSummary[] => {
    const block = parseBlockIdentifier(id);
    if (!block) return [];
    const issues = [...snapshot.goalIssues, ...snapshot.swimlaneIssues].filter(
      (issue) => laneKey(configuration, issue) === id,
    );
    const goal = block.kind === "goal" ? (goals.get(block.goalId) ?? null) : null;
    if (block.kind === "goal" && !goal) return [];
    const title = blockTitle(configuration, block, goal);
    return [
      {
        id,
        block,
        title,
        goal,
        count: issues.length,
        done: goal
          ? goalProgress(goal, issues, visibleColumns(configuration.columns).at(-1)?.id ?? null)
              .done
          : issues.filter(isIssueDone).length,
      },
    ];
  });
}

/**
 * Range les swimlanes dans l'ordre donné. Un bloc absent de l'affichage (objectif masqué, objectif
 * d'un autre sprint, swimlane par type sans ticket) reste juste après le bloc qui le précédait, pour retrouver
 * sa place s'il revient : un objectif
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
  // Un objectif masqué jamais rangé prend place en fin de liste.
  for (const goalId of configuration.hiddenGoalIds) {
    const id = blockIdentifier(goalBlock(goalId));
    if (!result.includes(id)) result.push(id);
  }
  return { ...configuration, blockOrder: result };
}

/**
 * Build et toutes les swimlanes par type, masquées et sans ticket comprises, dans leur ordre sur le
 * board : la liste de l'onglet Board des réglages. Les objectifs n'y figurent pas : leur ordre se
 * règle sur le board (demande de Denis du 13/10/2026).
 */
export function settingsLaneOrder(configuration: BoardConfiguration): string[] {
  return resolveBlocks({
    goals: [],
    storedOrder: configuration.blockOrder,
    includeBuild: true,
    swimlaneIds: configuration.ticketSwimlanes.map((swimlane) => swimlane.id),
  }).map(blockIdentifier);
}

/**
 * Place Build ou une swimlane par type juste avant `before`, Build ou une autre swimlane par type
 * (`null` : après la dernière d'entre elles). Les objectifs gardent leur place sur le board ; une
 * place inchangée rend la configuration telle quelle, pour ne rien écrire.
 *
 * `goals` : objectifs du sprint ou du board affiché, pour ranger l'ordre complet du board.
 */
export function withSettingsLaneMoved(
  configuration: BoardConfiguration,
  goals: readonly SprintGoal[],
  identifier: string,
  before: string | null,
): BoardConfiguration {
  const full = resolveBlocks({
    goals: goals.filter((goal) => !isGoalHidden(configuration, goal.id)),
    storedOrder: configuration.blockOrder,
    includeBuild: true,
    swimlaneIds: configuration.ticketSwimlanes.map((swimlane) => swimlane.id),
  }).map(blockIdentifier);
  const moved = moveAmongShown(
    full,
    identifier,
    before,
    (id) => parseBlockIdentifier(id)?.kind !== "goal",
  );
  return sameOrder(moved, full) ? configuration : withBlockOrder(configuration, moved);
}

/** Monte (`-1`) ou descend (`+1`) Build ou une swimlane par type d'un cran dans la liste des réglages. */
export function withSettingsLaneShifted(
  configuration: BoardConfiguration,
  goals: readonly SprintGoal[],
  identifier: string,
  offset: -1 | 1,
): BoardConfiguration {
  const before = shiftTarget(settingsLaneOrder(configuration), identifier, offset);
  return before === undefined
    ? configuration
    : withSettingsLaneMoved(configuration, goals, identifier, before);
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
 * l'enregistrer. Une liste vide l'oublie.
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
