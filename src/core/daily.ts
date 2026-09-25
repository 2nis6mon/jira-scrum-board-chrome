import type { Lane } from "./boardLayout";

// Mode Daily (demande de Denis du 24/09/2026) : le board présenté swimlane par swimlane, avec un
// minuteur global. Logique pure : aucune lecture ni écriture Jira, aucun accès au DOM. Le temps est
// toujours recalculé depuis l'heure de départ : Chrome ralentit les minuteries d'un onglet caché,
// compter les secondes une à une ferait dériver le minuteur.

/** Avant la fin, le minuteur passe en alerte : deux minutes. */
export const DAILY_ENDING_MS = 2 * 60_000;

/** Une daily en cours. Jamais enregistrée : recharger la page l'arrête. */
export interface DailySession {
  readonly durationMs: number;
  /** Départ, en millisecondes depuis l'époque. */
  readonly startedAt: number;
  /** Début de la pause en cours ; `null` si le minuteur tourne. */
  readonly pausedAt: number | null;
  /** Durée cumulée des pauses terminées. */
  readonly pausedMs: number;
  /** Swimlane présentée (identifiant de bloc) ; `null` si le board n'en avait aucune au départ. */
  readonly stepId: string | null;
  /** Sa position, pour retomber au même endroit si elle disparaît (dernier ticket déplacé). */
  readonly stepIndex: number;
  /** Temps de daily écoulé à l'arrivée sur l'étape, pauses exclues. */
  readonly stepEnteredAt: number;
  /**
   * Swimlanes (identifiants de bloc) dont le stock a été déplié par « + N autres » ; elles le
   * restent jusqu'à la fin de la daily.
   */
  readonly expandedStockIds: readonly string[];
}

export type DailyPhase = "running" | "ending" | "overtime";

/**
 * Étapes de la daily : les swimlanes affichées, dans l'ordre du board (Build et swimlanes par type compris, à leur
 * place). Les objectifs masqués n'y sont déjà plus ; les swimlanes sans ticket affiché sont sautées.
 */
export function dailySteps(lanes: readonly Lane[]): readonly Lane[] {
  return lanes.filter((lane) => lane.visibleCount > 0);
}

/** Démarre la daily sur la première étape (`null` si le board n'a encore aucune swimlane). */
export function startDaily(
  durationMinutes: number,
  firstStepId: string | null,
  now: number,
): DailySession {
  return {
    durationMs: durationMinutes * 60_000,
    startedAt: now,
    pausedAt: null,
    pausedMs: 0,
    stepId: firstStepId,
    stepIndex: 0,
    stepEnteredAt: 0,
    expandedStockIds: [],
  };
}

/** Temps de daily écoulé, pauses exclues. */
export function dailyElapsed(session: DailySession, now: number): number {
  return Math.max(0, (session.pausedAt ?? now) - session.startedAt - session.pausedMs);
}

/** Temps restant ; négatif une fois la durée dépassée (le minuteur ne s'arrête pas). */
export function dailyRemaining(session: DailySession, now: number): number {
  return session.durationMs - dailyElapsed(session, now);
}

/** Temps passé sur l'étape présentée, pauses exclues. */
export function stepElapsed(session: DailySession, now: number): number {
  return Math.max(0, dailyElapsed(session, now) - session.stepEnteredAt);
}

export function dailyPhase(remainingMs: number): DailyPhase {
  if (remainingMs < 0) return "overtime";
  return remainingMs <= DAILY_ENDING_MS ? "ending" : "running";
}

export function toggleDailyPause(session: DailySession, now: number): DailySession {
  if (session.pausedAt === null) return { ...session, pausedAt: now };
  return {
    ...session,
    pausedAt: null,
    pausedMs: session.pausedMs + Math.max(0, now - session.pausedAt),
  };
}

/**
 * Indice de l'étape présentée parmi les étapes du moment ; -1 s'il n'y en a aucune. Une swimlane
 * disparue (son dernier ticket a changé d'objectif) laisse la place à celle qui a pris son rang.
 */
export function currentStepIndex(steps: readonly Lane[], session: DailySession): number {
  if (steps.length === 0) return -1;
  const index = session.stepId === null ? -1 : steps.findIndex((s) => s.id === session.stepId);
  return index >= 0 ? index : Math.min(session.stepIndex, steps.length - 1);
}

/** Passe à l'étape voisine (`+1` suivante, `-1` précédente), sans sortir de la liste. */
export function moveDailyStep(
  steps: readonly Lane[],
  session: DailySession,
  direction: 1 | -1,
  now: number,
): DailySession {
  const current = currentStepIndex(steps, session);
  if (current < 0) return session;
  const index = Math.min(steps.length - 1, Math.max(0, current + direction));
  if (index === current) return session;
  return goToDailyStep(session, steps[index]?.id ?? null, index, now);
}

export function goToDailyStep(
  session: DailySession,
  stepId: string | null,
  index: number,
  now: number,
): DailySession {
  return { ...session, stepId, stepIndex: index, stepEnteredAt: dailyElapsed(session, now) };
}

/** « 14:05 », ou « +01:23 » une fois la durée dépassée. Arrondi à la seconde supérieure. */
export function formatDailyClock(remainingMs: number): string {
  const over = remainingMs < 0;
  const seconds = over ? Math.floor(-remainingMs / 1000) : Math.ceil(remainingMs / 1000);
  const text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return over ? `+${text}` : text;
}

/** Temps écoulé, « 03:07 », arrondi à la seconde inférieure. */
export function formatDailyElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Déplie le stock d'une swimlane, ou le replie. */
export function toggleStockExpanded(session: DailySession, laneId: string): DailySession {
  const ids = session.expandedStockIds;
  return {
    ...session,
    expandedStockIds: ids.includes(laneId) ? ids.filter((id) => id !== laneId) : [...ids, laneId],
  };
}

/**
 * Cartes d'une case à afficher en daily : dans la première colonne de chaque swimlane (objectifs,
 * Build et swimlanes par type — demande de Denis du 25/09/2026), les `limit` premières dans l'ordre
 * de Jira (le rang), tant que le stock n'est pas déplié. `hidden` : les autres.
 */
export function cappedStock<T>(
  issues: readonly T[],
  limit: number,
  expanded: boolean,
): { readonly shown: readonly T[]; readonly hidden: readonly T[] } {
  if (expanded || issues.length <= limit) return { shown: issues, hidden: [] };
  return { shown: issues.slice(0, limit), hidden: issues.slice(limit) };
}
