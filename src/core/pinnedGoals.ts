import type { BoardConfiguration } from "./boardConfiguration";
import type { BoardSnapshot } from "./boardIssue";
import type { JiraWriter } from "./boardWrites";
import {
  saveTeamSettings,
  type TeamDocument,
  type TeamPublisher,
  type TeamReader,
} from "./teamSettings";

/**
 * Où sont stockés les Goals épinglés (AD-4) : seul ce module le décide.
 *
 * - Scrum avec sprint de référence : propriété `sprintgoals.v1` de ce sprint (E5) ;
 * - Kanban : `boardPinnedGoalIds` des réglages d'équipe `boardsettings.v1` (E6) ;
 * - Scrum sans sprint actif : indisponible, comme dans Jira (aucune lecture ni écriture).
 */
export type PinnedGoalsStorage =
  | { readonly kind: "sprint"; readonly sprintId: number; readonly sprintName: string }
  | { readonly kind: "board"; readonly boardId: number; readonly boardName: string }
  | { readonly kind: "unavailable" };

/** Stockage où l'épinglage peut s'écrire. */
export type WritablePinnedGoalsStorage = Exclude<PinnedGoalsStorage, { kind: "unavailable" }>;

const UNAVAILABLE: PinnedGoalsStorage = { kind: "unavailable" };

/** Résolveur unique : choisit le stockage d'après le type du board et le sprint de référence. */
export function pinnedGoalsStorage(
  configuration: BoardConfiguration | null,
  snapshot: Pick<BoardSnapshot, "sprint"> | null,
): PinnedGoalsStorage {
  if (!configuration) return UNAVAILABLE;
  if (configuration.boardType === "kanban") {
    return {
      kind: "board",
      boardId: configuration.boardId,
      boardName: configuration.boardName,
    };
  }
  const sprint = snapshot?.sprint ?? null;
  if (!sprint) return UNAVAILABLE;
  return { kind: "sprint", sprintId: sprint.id, sprintName: sprint.name };
}

/** Sélection affichée pour ce stockage ; `null` si elle n'est pas connue (propriété illisible). */
export function pinnedGoalIdsIn(
  storage: PinnedGoalsStorage,
  configuration: Pick<BoardConfiguration, "boardPinnedGoalIds"> | null,
  snapshot: Pick<BoardSnapshot, "pinnedGoalIds"> | null,
): readonly string[] | null {
  switch (storage.kind) {
    case "sprint":
      return snapshot?.pinnedGoalIds ?? null;
    case "board":
      return configuration?.boardPinnedGoalIds ?? null;
    case "unavailable":
      return null;
  }
}

export type BoardPinOutcome =
  /** Jira a confirmé l'enregistrement : `document` est la version publiée. */
  | { kind: "pinned"; document: TeamDocument }
  /** Jira porte déjà la sélection demandée : rien n'a été écrit. */
  | { kind: "unchanged" }
  /** La sélection ou les réglages ont changé dans Jira depuis `base` : rien n'a été écrit. */
  | { kind: "conflict"; current: TeamDocument | null }
  /** Les réglages du board sont dans un format inconnu : jamais écrasés. */
  | { kind: "unreadable" };

/**
 * Épinglage Kanban : relit `boardsettings.v1`, refuse si la sélection n'est plus celle affichée
 * (`base`), n'écrit rien si elle porte déjà `selection`, sinon publie les réglages relus avec la
 * seule sélection remplacée, par `saveTeamSettings`. Une seule écriture, jamais rejouée.
 */
export async function saveBoardPinnedGoals(
  reader: TeamReader,
  writer: JiraWriter,
  input: {
    boardId: number;
    /** Sélection lue dans Jira quand l'utilisateur a commencé à la modifier. */
    base: readonly string[];
    selection: readonly string[];
    /** Configuration du board au moment d'écrire, sur laquelle les réglages relus s'appliquent. */
    configuration: () => BoardConfiguration;
    publishedBy: TeamPublisher;
    now: Date;
  },
): Promise<BoardPinOutcome> {
  const withSelection = (configuration: BoardConfiguration): BoardConfiguration => ({
    ...configuration,
    boardPinnedGoalIds: [...input.selection],
  });
  const outcome = await saveTeamSettings(reader, writer, {
    boardId: input.boardId,
    // La configuration publiée porte déjà la sélection, même sans réglages publiés.
    configuration: () => withSelection(input.configuration()),
    change: withSelection,
    expect: (current) => {
      const currentIds = current?.settings.boardPinnedGoalIds ?? [];
      if (!sameOrder(currentIds, input.base)) return "conflict";
      return sameOrder(currentIds, input.selection) ? "unchanged" : "write";
    },
    publishedBy: input.publishedBy,
    now: input.now,
  });
  switch (outcome.kind) {
    case "published":
      return { kind: "pinned", document: outcome.document };
    case "changedDuringEdit":
      // Sans brouillon confirmé, ce cas n'arrive pas ; traité comme un conflit par prudence.
      return { kind: "conflict", current: outcome.current };
    default:
      return outcome;
  }
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
