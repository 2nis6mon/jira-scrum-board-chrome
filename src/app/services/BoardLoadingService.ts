import type { BoardConfiguration } from "../../core/boardConfiguration";
import { allIssues, type BoardSnapshot } from "../../core/boardIssue";
import { type AtlassianGoalsLoader, type BoardReader, loadSnapshot } from "../../core/boardSync";
import { withObservedIssueTypes } from "../../core/issueTypeDiscovery";
import type { LoadTrace } from "../../core/loadTrace";
import { goalColorName } from "../../core/sprintGoals";
import type { JiraClient } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import type { JiraUser } from "../../jira/models";
import type { SyncProblem } from "../model/BoardTypes";
import type { LoadDiagnostics } from "../model/LoadDiagnostics";
import { toMessage } from "../model/messages";
import type { BoardScope, ConfigurationChange, ReadableValue, StateValue } from "./ports";

export interface BoardLoadingState {
  configuration: StateValue<BoardConfiguration | null>;
  snapshot: StateValue<BoardSnapshot | null>;
  setupBusy: ReadableValue<boolean>;
  syncing: StateValue<boolean>;
  syncProblem: StateValue<SyncProblem | null>;
  goalsNotice: StateValue<string | null>;
  goalsWarnings: StateValue<readonly string[]>;
}
export interface BoardLoadingEffects {
  scope: BoardScope;
  now(): Date;
  refreshSettings(): Promise<void>;
  prepareFilters(configuration: BoardConfiguration): void;
  updatePreferences(change: ConfigurationChange): Promise<void>;
  refreshFilters(boardId: number, isStale: () => boolean): Promise<void>;
  refreshColors(): Promise<void>;
}
export type BoardLoadingDiagnostics = Pick<
  LoadDiagnostics,
  "current" | "begin" | "finish" | "setContext" | "markDataReady" | "measure" | "measureSync"
>;
/** Coordonne les lectures d'un board et écarte les résultats d'une génération abandonnée. */
export class BoardLoadingService {
  readonly #reader: BoardReader & Pick<JiraClient, "myself">;
  readonly #goalsLoader: AtlassianGoalsLoader;
  readonly #state: BoardLoadingState;
  readonly #diagnostics: BoardLoadingDiagnostics;
  readonly #effects: BoardLoadingEffects;
  #currentUser: JiraUser | null = null;
  #syncTask: Promise<void> | null = null;
  #resyncRequested = false;
  #preparedResyncId: string | undefined;
  constructor(
    reader: BoardReader & Pick<JiraClient, "myself">,
    goalsLoader: AtlassianGoalsLoader,
    state: BoardLoadingState,
    diagnostics: BoardLoadingDiagnostics,
    effects: BoardLoadingEffects,
  ) {
    this.#reader = reader;
    this.#goalsLoader = goalsLoader;
    this.#state = state;
    this.#diagnostics = diagnostics;
    this.#effects = effects;
  }
  get currentUser(): JiraUser | null {
    return this.#currentUser;
  }
  get running(): boolean {
    return this.#syncTask !== null;
  }
  cancel(): void {
    this.#resyncRequested = false;
    this.#preparedResyncId = undefined;
    this.#diagnostics.finish("cancelled");
  }
  async sync(preparedRunId?: string): Promise<void> {
    if (this.#effects.scope.disposed() || !this.#state.configuration.value) return;
    if (this.#syncTask) {
      if (preparedRunId) this.#preparedResyncId = preparedRunId;
      this.#resyncRequested = true;
      await this.#syncTask;
      return;
    }
    this.#state.syncing.value = true;
    this.#syncTask = (async () => {
      do {
        this.#resyncRequested = false;
        const active = this.#diagnostics.current.peek();
        preparedRunId ??= this.#preparedResyncId;
        if (!preparedRunId && this.#state.setupBusy.value && active?.status === "loading")
          preparedRunId = active.id;
        this.#preparedResyncId = undefined;
        const runId =
          preparedRunId && active?.id === preparedRunId && active.status === "loading"
            ? preparedRunId
            : this.#diagnostics.begin("refresh");
        preparedRunId = undefined;
        const generation = this.#effects.scope.generation();
        this.#diagnostics.setContext({
          boardType: this.#state.configuration.value?.boardType === "kanban" ? "kanban" : "scrum",
        });
        try {
          await this.#syncOnce(this.traceFor(runId));
          // Une relecture de structure en parallèle appartient au même chargement ; elle
          // déclenche sa propre synchronisation ensuite, sans perdre sa durée d'attente.
          if (!this.#state.setupBusy.value && this.#preparedResyncId !== runId)
            this.finish(
              runId,
              generation !== this.#effects.scope.generation()
                ? "cancelled"
                : this.#state.syncProblem.value
                  ? "error"
                  : "ok",
            );
        } catch (error) {
          this.finish(runId, "error");
          throw error;
        }
      } while (this.#resyncRequested && !this.#effects.scope.disposed());
    })();
    try {
      await this.#syncTask;
    } finally {
      this.#syncTask = null;
      this.#state.syncing.value = false;
    }
  }

  async #syncOnce(trace: LoadTrace): Promise<void> {
    const generation = this.#effects.scope.generation();
    // Réglages d'équipe d'abord : une version appliquée sert déjà à cette lecture du board.
    await trace.measure("settings", () => this.#effects.refreshSettings());
    if (this.#effects.scope.disposed() || generation !== this.#effects.scope.generation()) return;
    const configuration = this.#state.configuration.value;
    if (!configuration) return;
    this.#effects.prepareFilters(configuration);
    const isStale = () =>
      this.#effects.scope.disposed() ||
      generation !== this.#effects.scope.generation() ||
      this.#state.configuration.value?.boardId !== configuration.boardId;

    try {
      this.#currentUser ??= await trace.measure("user", () => this.#reader.myself());
      const result = await loadSnapshot({
        reader: this.#reader,
        configuration,
        currentUser: this.#currentUser,
        goalsLoader: this.#goalsLoader,
        now: this.#effects.now(),
        trace,
        onIssueTypesDiscovered: async (types) => {
          if (isStale()) return;
          const current = this.#state.configuration.value;
          if (!current || withObservedIssueTypes(current, types) === current) return;
          // L'administration garde les types lus même si les Goals échouent ensuite.
          // Le cache reste local et conserve les réglages modifiés pendant la lecture.
          await this.#effects.updatePreferences((latest) => withObservedIssueTypes(latest, types));
        },
      });
      if (isStale()) return;

      // Couleurs des objectifs : mémorisées localement pour rester stables d'un sprint à l'autre.
      // Une couleur choisie PENDANT la lecture l'emporte sur celle connue à son début.
      const current = this.#state.configuration.value ?? configuration;
      const latest = withObservedIssueTypes(current, result.discoveredIssueTypes);
      const typesChanged = latest !== current;
      if (typesChanged) this.#state.configuration.value = latest;
      const previous = this.#state.snapshot.value;
      const knownGoalIds = new Set([
        ...Object.keys(latest.goalColorIndex),
        ...(previous?.goals.map((goal) => goal.id) ?? []),
      ]);
      const linkedGoalIds = new Set(
        result.snapshot.goalIssues.flatMap((issue) => (issue.goalId ? [issue.goalId] : [])),
      );
      // À la toute première lecture, les Goals constituent le board initial et restent visibles.
      // Ensuite, un Goal inconnu introduit par un ticket arrive masqué : le ticket reste dans
      // son bloc par défaut jusqu'à ce que l'utilisateur le réaffiche depuis « Goals masqués ».
      const newLinkedGoalIds =
        knownGoalIds.size === 0
          ? []
          : result.snapshot.goals
              .filter((goal) => linkedGoalIds.has(goal.id) && !knownGoalIds.has(goal.id))
              .map((goal) => goal.id);
      const colors = { ...result.goalColorIndex, ...latest.goalColorIndex };
      this.#state.snapshot.value = {
        ...result.snapshot,
        goals: result.snapshot.goals.map((goal) => ({
          ...goal,
          color: goalColorName(colors[goal.id] ?? 0),
        })),
      };
      this.#state.goalsNotice.value =
        result.goalsIssue === null
          ? null
          : `Goals Atlassian illisibles : ${result.goalsIssue} Les objectifs affichés sont les lignes du champ « Objectif » du sprint.`;
      this.#state.goalsWarnings.value = result.goalsWarnings;
      this.#state.syncProblem.value = null;
      this.#diagnostics.setContext({
        boardType: configuration.boardType === "kanban" ? "kanban" : "scrum",
        issues: allIssues(result.snapshot).length,
        goals: result.snapshot.goals.length,
      });
      this.#diagnostics.markDataReady();

      if (
        typesChanged ||
        !sameIndex(latest.goalColorIndex, colors) ||
        newLinkedGoalIds.length > 0
      ) {
        await this.#effects.updatePreferences((current) => ({
          ...withObservedIssueTypes(current, result.discoveredIssueTypes),
          goalColorIndex: { ...colors, ...current.goalColorIndex },
          hiddenGoalIds: [...new Set([...current.hiddenGoalIds, ...newLinkedGoalIds])].sort(),
        }));
      }
    } catch (error) {
      if (isStale()) return;
      const sessionLost = isSessionLost(error);
      if (sessionLost) this.#currentUser = null;
      this.#state.syncProblem.value = { ...toMessage(error), sessionLost };
      return;
    }

    await trace.measure("filters", () =>
      this.#effects.refreshFilters(configuration.boardId, isStale),
    );
    if (isStale()) return;
    await trace.measure("colors", () => this.#effects.refreshColors());
  }

  /** Une lecture ancienne ne doit pas ajouter ses phases à celle d'un nouveau board. */
  traceFor(id: string | undefined): LoadTrace {
    const active = () => {
      const run = this.#diagnostics.current.peek();
      return run?.id === id && run?.status === "loading";
    };
    return {
      measure: (phase, work) => (active() ? this.#diagnostics.measure(phase, work) : work()),
      measureSync: (phase, work) =>
        active() ? this.#diagnostics.measureSync(phase, work) : work(),
    };
  }

  finish(id: string | undefined, status: "ok" | "error" | "cancelled"): void {
    if (this.#diagnostics.current.peek()?.id === id) this.#diagnostics.finish(status);
  }
}
function isSessionLost(error: unknown): boolean {
  return error instanceof JiraError && error.isAuthenticationFailure;
}
function sameIndex(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
