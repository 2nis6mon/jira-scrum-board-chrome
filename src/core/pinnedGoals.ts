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

type PinSnapshot = Pick<BoardSnapshot, "sprint"> &
  Partial<Pick<BoardSnapshot, "activeSprints" | "goalSprintIds">>;

/**
 * Résolveur unique : choisit le stockage d'après le type du board et le sprint de l'épinglage.
 * `sprintId` (choix de l'utilisateur) n'est retenu que s'il est un sprint réuni du board
 * (`goalSprintIds`) ; sinon, ou sans choix, le sprint de référence porte l'épinglage.
 */
export function pinnedGoalsStorage(
  configuration: BoardConfiguration | null,
  snapshot: PinSnapshot | null,
  sprintId?: number | null,
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
  const chosen =
    sprintId != null && sprintId !== sprint.id
      ? pinnableSprints(configuration, snapshot).find((candidate) => candidate.id === sprintId)
      : undefined;
  const target = chosen ?? sprint;
  return { kind: "sprint", sprintId: target.id, sprintName: target.name };
}

/** Sprint proposé pour l'épinglage. */
export interface PinnableSprint {
  readonly id: number;
  readonly name: string;
}

/**
 * Sprints entre lesquels choisir l'épinglage : ceux du board (`goalSprintIds`), dans l'ordre
 * d'affichage, en Scrum avec au moins deux sprints du board. Sinon aucun choix (liste vide).
 * Jamais de sprint d'un autre board : `goalSprintIds` n'en contient pas dès qu'il y en a deux.
 */
export function pinnableSprints(
  configuration: Pick<BoardConfiguration, "boardType"> | null,
  snapshot: PinSnapshot | null,
): readonly PinnableSprint[] {
  if (configuration?.boardType !== "scrum" || !snapshot?.sprint) return [];
  const ids = snapshot.goalSprintIds ?? [];
  if (ids.length < 2) return [];
  const byId = new Map((snapshot.activeSprints ?? []).map((sprint) => [sprint.id, sprint]));
  const sprints = ids.flatMap((id) => {
    const sprint = byId.get(id);
    return sprint ? [{ id: sprint.id, name: sprint.name }] : [];
  });
  return sprints.length >= 2 ? sprints : [];
}

type PinIdsSnapshot = Pick<BoardSnapshot, "pinnedGoalIds"> &
  Partial<Pick<BoardSnapshot, "sprint" | "sprintPinnedGoalIds">>;

/** Sélection affichée pour ce stockage ; `null` si elle n'est pas connue (propriété illisible). */
export function pinnedGoalIdsIn(
  storage: PinnedGoalsStorage,
  configuration: Pick<BoardConfiguration, "boardPinnedGoalIds"> | null,
  snapshot: PinIdsSnapshot | null,
): readonly string[] | null {
  switch (storage.kind) {
    case "sprint":
      if (!snapshot) return null;
      if (snapshot.sprintPinnedGoalIds)
        return snapshot.sprintPinnedGoalIds[storage.sprintId] ?? null;
      // Sans épinglage par sprint, seul le sprint de référence est connu.
      return snapshot.sprint == null || snapshot.sprint.id === storage.sprintId
        ? snapshot.pinnedGoalIds
        : null;
    case "board":
      return configuration?.boardPinnedGoalIds ?? null;
    case "unavailable":
      return null;
  }
}

/** Sélection gardée dans ce navigateur pour le sprint du stockage ; `null` sans repli local. */
export function localPinnedGoalIdsIn(
  storage: PinnedGoalsStorage,
  snapshot: Pick<
    BoardSnapshot,
    "sprint" | "localPinnedGoalIds" | "sprintLocalPinnedGoalIds"
  > | null,
): readonly string[] | null {
  if (storage.kind !== "sprint" || !snapshot) return null;
  if (snapshot.sprintLocalPinnedGoalIds)
    return snapshot.sprintLocalPinnedGoalIds[storage.sprintId] ?? null;
  return snapshot.sprint?.id === storage.sprintId ? snapshot.localPinnedGoalIds : null;
}

/** Goals gardés dans ce navigateur, tous sprints du board réunis ; `null` s'il n'y en a aucun. */
export function boardLocalPinnedGoalIds(
  snapshot: Pick<BoardSnapshot, "localPinnedGoalIds" | "sprintLocalPinnedGoalIds"> | null,
): readonly string[] | null {
  if (!snapshot) return null;
  if (!snapshot.sprintLocalPinnedGoalIds) return snapshot.localPinnedGoalIds;
  const ids = [...new Set(Object.values(snapshot.sprintLocalPinnedGoalIds).flat())];
  return ids.length > 0 ? ids : null;
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
