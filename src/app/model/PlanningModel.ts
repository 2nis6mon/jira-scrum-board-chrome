import { batch, computed, signal } from "@preact/signals";
import {
  type AtlassianSprintGoals,
  type GoalsReader,
  loadAtlassianSprintGoals,
} from "../../core/atlassianGoals";
import type { BoardConfiguration } from "../../core/boardConfiguration";
import { browseUrl } from "../../core/boardIssue";
import { type IssueFilterOptions, issueFilterOptions } from "../../core/boardLayout";
import { type ColumnStates, columnStates, tallyByState } from "../../core/columnState";
import {
  matchesIssue,
  matchesIssueSearch,
  NO_PLANNING_FILTERS,
  type PlanningFilters,
  planningFilterCount,
  searchNeedle,
} from "../../core/filters";
import { quickFilterKeys } from "../../core/jiraQuickFilters";
import {
  atlassianGoalHistory,
  type ClosedSprintCache,
  closedSprintCache,
  type GoalHistory,
  textGoalHistory,
} from "../../core/planningProgress";
import {
  GOAL_COLOR_COUNT,
  goalColorName,
  makeSprintGoal,
  type SprintGoal,
} from "../../core/sprintGoals";
import {
  proposableSprintIds,
  type SprintPermissionCache,
  sprintPermissionCache,
} from "../../core/sprintPermissions";
import {
  type CarryOverMode,
  type CarryOverResult,
  canEstimateWith,
  carryOverGoals,
  estimatePlanningIssue,
  loadSprintPlanning,
  PLANNING_BATCH_LIMIT,
  type PlanningBatchOutcome,
  type PlanningBatchTarget,
  type PlanningDestination,
  type PlanningOutcome,
  type PlanningSnapshot,
  type PlanningTarget,
  pinPlanningGoals,
  placePlanningIssue,
  placePlanningIssues,
  rankPlanningIssue,
  removePlanningIssue,
  removePlanningIssues,
  savePlanningVelocity,
  withoutEmptyForeignSprints,
  writeTextGoals,
} from "../../core/sprintPlanning";
import type { IssueQuery, JiraClient, JiraQuickFilter } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import {
  type AtlassianGoal,
  estimate,
  goalDisplayName,
  isDoneStatus,
  type JiraIssue,
  type JiraSprint,
  linkedGoalIds,
} from "../../jira/models";
import { isIssueKey } from "../../jira/writes";
import { SPRINT_PLANNING_ENABLED } from "../featureFlags";
import type { LocalStore, Platform } from "../platform/types";
import type { BoardWriteAccess, BoardWriteGateway, RecordWrite } from "../services/ports";
import { type AppMessage, message } from "./appMessage";
import {
  errorMessage,
  goalsFailureMessage,
  goalsWarningMessage,
  planningBatchJournalMessage,
  planningBatchMessage,
  planningCarryOverMessage,
  planningOutcomeMessage,
} from "./coreText";
import { toMessage, type UserMessage } from "./messages";
import type {
  PendingClosure,
  PlanningCarryOverReport,
  PlanningGoalSearch,
  PlanningIssue,
  PlanningLane,
  PlanningLoad,
  PlanningOrigin,
  PlanningRankOptions,
  PlanningSection,
  PlanningTally,
  PlanningViewModel,
  SprintDialogAction,
} from "./PlanningTypes";

export interface PlanningContext {
  configuration(): BoardConfiguration | null;
  /** Aucune autre écriture du board en cours ni en préparation. */
  canWrite(): boolean;
  accountId(): string | null;
  openIssue(key: string): void;
  /** Demande à la page hôte la fenêtre native ; `false` : aucune page hôte pour l'ouvrir. */
  openSprintDialog(action: SprintDialogAction, sprint: JiraSprint): boolean;
  /** Lectures des Goals Atlassian du board (mode « Goals Atlassian »). */
  readonly goals: GoalsReader;
  /** Porte d'écriture du board : chaque geste attend les autres gestes qui écrivent. */
  readonly write: BoardWriteGateway["run"];
  /** Journal du board. */
  readonly record: RecordWrite;
  /**
   * Attente entre deux relectures : état d'un sprint après une fenêtre native, et tickets après un
   * ajout, un retrait ou un rang (story 8.26).
   */
  wait(ms: number): Promise<void>;
  /** Filtres rapides du board Jira, lus par le board ; leur JQL est évalué par Jira. */
  jiraQuickFilters(): readonly JiraQuickFilter[];
}

/** Anciens brouillons du Sprint Planning d'un site (décision du 14/10) : une clé par site. */
const PLANNING_DRAFT_PREFIX = "sprint-planning.v1:";
export const PLANNING_DRAFT_KEYS = [`${PLANNING_DRAFT_PREFIX}<origine Jira>`] as const;

export function planningDraftKey(origin: string): string {
  return `${PLANNING_DRAFT_PREFIX}${origin}`;
}

/**
 * Oublie les anciens brouillons d'un site (liste de la déconnexion). Indépendant de
 * l'interrupteur du planning : un brouillon d'un build local reste effacé par le paquet.
 */
export function forgetPlanningDrafts(store: LocalStore, origin: string): Promise<void> {
  return store.remove(planningDraftKey(origin));
}

/** Goals proposés à l'épinglage pour une recherche. */
const GOAL_SEARCH_LIMIT = 20;

/**
 * Relectures de l'état du sprint après la fenêtre native de clôture, en millisecondes depuis sa
 * fermeture : Jira peut clore le sprint quelques secondes après. Toujours actif à la dernière,
 * la fenêtre est tenue pour annulée.
 */
export const CLOSURE_CHECKS_MS = [0, 1000, 3000, 6000, 10000] as const;

/**
 * Sprint Planning en direct (décision du 01/11/2026) : aucun brouillon, Jira est la seule source.
 * Chaque geste passe par la porte du board, une intention de `core`, le journal, puis une relecture
 * du sprint en préparation.
 */
export class PlanningModel implements PlanningViewModel {
  readonly sprints = signal<readonly JiraSprint[]>([]);
  readonly selectedSprintId = signal<number | null>(null);
  readonly snapshot = signal<PlanningSnapshot | null>(null);
  readonly loading = signal(false);
  readonly #busyCount = signal(0);
  readonly busy = computed(() => this.#busyCount.value > 0);
  readonly notice = signal<AppMessage | null>(null);
  readonly error = signal<UserMessage | null>(null);
  readonly goalsWarning = signal<AppMessage | null>(null);
  readonly search = signal("");
  /** Filtres du planning, distincts de ceux du board ; vidés au changement de board. */
  readonly filters = signal<PlanningFilters>(NO_PLANNING_FILTERS);
  /** Jira évalue les filtres rapides actifs. */
  readonly applyingQuickFilters = signal(false);
  readonly pendingClosure = signal<PendingClosure | null>(null);
  readonly carryOverReport = signal<PlanningCarryOverReport | null>(null);
  readonly goalSearch = signal<PlanningGoalSearch | null>(null);
  /** Goals Atlassian du sprint en préparation (épinglés et rattachés à ses tickets). */
  readonly atlassianGoals = signal<AtlassianSprintGoals | null>(null);
  /** Provenance des tickets arrivés pendant la séance, pour le sprint affiché. */
  readonly #origins = signal<Readonly<Record<string, PlanningOrigin>>>({});
  /** Sprints futurs lus, mais aucun que l'utilisateur puisse modifier. */
  readonly noEditableSprint = signal(false);
  /** Droits lus pendant ce chargement ; vidés à l'actualisation et au changement de board. */
  #permissions: SprintPermissionCache = sprintPermissionCache();
  /** Tickets sélectionnés (Ctrl/Cmd+clic, Maj+clic), à déplacer ensemble. */
  readonly selection = signal<ReadonlySet<string>>(new Set());
  /** Dernier ticket ajouté ou retiré de la sélection : départ d'une plage Maj+clic. */
  #anchor: string | null = null;
  /** Déjà livré avant le sprint en préparation, par objectif (lectures seules, hors charge). */
  readonly goalHistory = signal<GoalHistory | null>(null);
  /** Sprints clos relus pour l'historique ; vidés à l'actualisation et au changement de board. */
  #closedSprints: ClosedSprintCache = closedSprintCache();
  /** Objectifs et liens pour lesquels l'historique a été lu ou est en cours de lecture. */
  #historyKey: string | null = null;
  #historyRun = 0;
  #boardId: number | null = null;
  #generation = 0;
  #disposed = false;
  #draftsErased = false;
  #siteGoals: Promise<AtlassianGoal[]> | null = null;
  #goalSearchRun = 0;
  #quickFilterRun = 0;
  /** Clôture en cours de vérification : un second `refresh` de l'hôte est ignoré. */
  #closureCheck: PendingClosure | null = null;

  constructor(
    readonly client: JiraClient,
    readonly platform: Platform,
    readonly context: PlanningContext,
  ) {}

  readonly goalMode = computed((): "text" | "atlassian" =>
    this.context.configuration()?.goalSource === "atlassianGoals" ? "atlassian" : "text",
  );

  /** Sprints actifs du board : clôture et démarrage seulement, jamais affichés comme source. */
  readonly activeSprints = computed((): readonly JiraSprint[] =>
    SPRINT_PLANNING_ENABLED ? (this.snapshot.value?.activeSprints ?? []) : [],
  );

  /**
   * Estimation modifiable sur les cartes : le board a un champ d'estimation personnalisé (story
   * points). Sans champ, ou avec le temps estimé, la fiche native reste le recours.
   */
  readonly canEstimate = computed(
    () =>
      SPRINT_PLANNING_ENABLED &&
      canEstimateWith(this.context.configuration()?.estimationFieldId ?? null),
  );

  /** Sprints actifs proposés à la clôture : ceux que l'utilisateur peut modifier. */
  readonly closableSprints = computed((): readonly JiraSprint[] => {
    const ids = this.snapshot.value?.closableSprintIds ?? [];
    return this.activeSprints.value.filter((sprint) => ids.includes(sprint.id));
  });

  readonly gesturesDisabled = computed(() => {
    if (!SPRINT_PLANNING_ENABLED) return true;
    const snapshot = this.snapshot.value;
    return (
      this.loading.value ||
      this.busy.value ||
      snapshot === null ||
      snapshot.sprint.state !== "future" ||
      !this.context.canWrite()
    );
  });

  readonly startDisabledReason = computed((): AppMessage | null => {
    if (!SPRINT_PLANNING_ENABLED)
      return message("Sprint Planning est désactivé dans cette version.");
    const snapshot = this.snapshot.value;
    if (!snapshot) return message("Choisissez un sprint futur à préparer.");
    if (snapshot.sprint.state !== "future") return message("Ce sprint n'est plus un sprint futur.");
    if (this.activeSprints.value.length > 0)
      return message("Un sprint est actif : clôturez-le avant de démarrer celui-ci.");
    return null;
  });

  /** Objectifs et liens affichés, selon la source des objectifs du board. */
  readonly #goalView = computed(() => {
    const snapshot = this.snapshot.value;
    if (!SPRINT_PLANNING_ENABLED || !snapshot) return { goals: [], links: {} };
    if (this.goalMode.value === "text") return { goals: snapshot.goals, links: snapshot.links };
    const loaded = this.atlassianGoals.value;
    return { goals: loaded?.goals ?? [], links: loaded?.links ?? {} };
  });

  /** Recherche et filtres de la barre, avec les règles du board, en intersection. */
  readonly #matches = computed(() => {
    const needle = searchNeedle(this.search.value);
    const filters = this.filters.value;
    return (issue: JiraIssue) => matchesIssueSearch(issue, needle) && matchesIssue(filters, issue);
  });

  /** Filtres rapides du board Jira proposés dans le planning. */
  readonly jiraQuickFilters = computed((): readonly JiraQuickFilter[] =>
    SPRINT_PLANNING_ENABLED ? this.context.jiraQuickFilters() : [],
  );

  /** Valeurs présentes dans le sprint en préparation et ses sources, avec leur nombre. */
  readonly filterOptions = computed((): IssueFilterOptions | null => {
    const snapshot = this.snapshot.value;
    if (!SPRINT_PLANNING_ENABLED || !snapshot) return null;
    return issueFilterOptions(planningIssues(snapshot, this.#states.value));
  });

  /** Critères actifs, recherche comprise : « Réinitialiser (n) ». */
  readonly activeFilterCount = computed(() =>
    SPRINT_PLANNING_ENABLED ? planningFilterCount(this.filters.value, this.search.value) : 0,
  );

  #item(issue: JiraIssue): PlanningIssue {
    const fieldId = this.context.configuration()?.estimationFieldId ?? null;
    return {
      issue,
      estimate: fieldId ? estimate(issue.fields, fieldId) : 1,
      origin: this.#origins.value[issue.key] ?? null,
    };
  }

  /** Seule règle d'état d'un ticket : les colonnes visibles du board (story 8.20). */
  readonly #states = computed(() => columnStates(this.context.configuration()?.columns ?? []));

  /**
   * Sprint en préparation, sans les tickets dont le statut n'est dans aucune colonne visible (comme
   * sur le board, `unmappedCount` le dit) ni dans la dernière (story 8.23, comme « Où sont les
   * tickets » en 8.22) : ils ne sont ni affichés ni comptés.
   */
  readonly #sprintItems = computed((): readonly PlanningIssue[] => {
    if (!SPRINT_PLANNING_ENABLED) return [];
    const states = this.#states.value;
    return (this.snapshot.value?.sprintIssues ?? [])
      .filter((issue) => shownInSprint(states, issue))
      .map((issue) => this.#item(issue));
  });

  /** Tickets affichés du sprint en préparation, avant recherche et filtres. */
  readonly sprintIssueCount = computed(() => this.#sprintItems.value.length);

  /** Tickets du sprint en préparation ignorés faute de colonne visible pour leur statut. */
  readonly unmappedCount = computed(() => {
    const states = this.#states.value;
    return SPRINT_PLANNING_ENABLED
      ? (this.snapshot.value?.sprintIssues ?? []).filter(
          (issue) => states.ofStatus(issue.fields.status?.id) === null,
        ).length
      : 0;
  });

  readonly lanes = computed((): readonly PlanningLane[] => {
    const { goals, links } = this.#goalView.value;
    const matches = this.#matches.value;
    const history = this.goalHistory.value;
    const states = this.#states.value;
    return goals.map((goal) => {
      const all = this.#sprintItems.value.filter((item) => links[item.issue.key] === goal.id);
      const delivered = history?.delivered[goal.id] ?? [];
      return {
        goal,
        issues: all.filter((item) => matches(item.issue)),
        issueCount: all.length,
        points: all.reduce((sum, item) => sum + (item.estimate ?? 0), 0),
        unestimated: all.filter((item) => item.estimate === null).length,
        progress: tallyByState(
          all,
          (item) => states.ofStatus(item.issue.fields.status?.id),
          (item) => item.estimate,
        ),
        delivered: delivered.length > 0 ? tally(delivered.map((issue) => this.#item(issue))) : null,
        deliveredIncomplete: history?.incomplete ?? false,
      };
    });
  });

  readonly unassigned = computed((): readonly PlanningIssue[] => {
    const { goals, links } = this.#goalView.value;
    const ids = new Set(goals.map((goal) => goal.id));
    const matches = this.#matches.value;
    return this.#sprintItems.value.filter((item) => {
      const goalId = links[item.issue.key];
      return (goalId === undefined || !ids.has(goalId)) && matches(item.issue);
    });
  });

  readonly sections = computed((): readonly PlanningSection[] => {
    const snapshot = this.snapshot.value;
    if (!SPRINT_PLANNING_ENABLED || !snapshot) return [];
    const matches = this.#matches.value;
    const items = (issues: readonly JiraIssue[]) =>
      issues.filter(matches).map((issue) => this.#item(issue));
    return [
      ...snapshot.futureSprints.map(({ sprint, issues }) => ({
        kind: "sprint" as const,
        sprint,
        issues: items(issues),
      })),
      { kind: "backlog" as const, issues: items(snapshot.backlogIssues) },
    ];
  });

  readonly sprintLoad = computed((): PlanningLoad | null => {
    const snapshot = this.snapshot.value;
    if (!SPRINT_PLANNING_ENABLED || !snapshot) return null;
    const items = this.#sprintItems.value;
    return {
      total: items.reduce((sum, item) => sum + (item.estimate ?? 0), 0),
      unestimated: items.filter((item) => item.estimate === null).length,
      velocity: snapshot.velocity,
      unit: this.context.configuration()?.estimationFieldId ? "pts" : "tickets",
    };
  });

  // ─── Lecture ─────────────────────────────────────────────────────────────────

  /** Aucune lecture du backlog à l'ouverture ordinaire du board : seulement à la demande. */
  async load(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    const configuration = this.context.configuration();
    if (configuration?.boardType !== "scrum" || this.#disposed) return;
    if (this.#boardId === configuration.boardId && (this.loading.value || this.snapshot.value))
      return;
    if (this.#boardId !== configuration.boardId) this.reset();
    this.#boardId = configuration.boardId;
    this.#eraseDrafts();
    await this.#loadSprintsAndSelection();
  }

  /** Les brouillons de la décision du 14/10 ne sont plus appliqués : effacés une fois. */
  #eraseDrafts(): void {
    if (this.#draftsErased) return;
    this.#draftsErased = true;
    void forgetPlanningDrafts(this.platform.store, this.client.site.origin).catch(() => {});
  }

  async #loadSprintsAndSelection(): Promise<void> {
    const configuration = this.context.configuration();
    if (configuration?.boardType !== "scrum") return;
    const generation = ++this.#generation;
    batch(() => {
      this.loading.value = true;
      this.error.value = null;
      this.noEditableSprint.value = false;
    });
    try {
      const sprints = await this.client.sprints(configuration.boardId, ["future"]);
      if (this.#stale(generation)) return;
      const read = sprints.filter((sprint) => sprint.state === "future");
      // Seuls les sprints que l'utilisateur peut modifier sont proposés (Jira refuserait le geste).
      const proposable = await proposableSprintIds(this.client, read, this.#permissions);
      if (this.#stale(generation)) return;
      // Ni sprint non modifiable, ni sprint d'un autre board sans ticket restant du board.
      const futures = await withoutEmptyForeignSprints(
        this.client,
        configuration.boardId,
        configuration.columns,
        read.filter((sprint) => proposable.has(sprint.id)),
      );
      if (this.#stale(generation)) return;
      batch(() => {
        this.sprints.value = futures;
        this.noEditableSprint.value = read.length > 0 && futures.length === 0;
      });
      const selected =
        futures.find((sprint) => sprint.id === this.selectedSprintId.value) ?? futures[0];
      if (!selected) {
        batch(() => {
          this.selectedSprintId.value = null;
          this.snapshot.value = null;
          this.atlassianGoals.value = null;
        });
        return;
      }
      if (selected.id !== this.selectedSprintId.value) this.#select(selected.id);
      await this.#read(generation);
      if (!this.#stale(generation)) this.#reapplyJiraQuickFilters();
    } catch (error) {
      if (!this.#stale(generation)) this.error.value = toMessage(error);
    } finally {
      if (!this.#stale(generation)) this.loading.value = false;
    }
  }

  #select(id: number): void {
    batch(() => {
      this.selectedSprintId.value = id;
      this.snapshot.value = null;
      this.atlassianGoals.value = null;
      this.goalsWarning.value = null;
      this.#origins.value = {};
      this.notice.value = null;
      this.goalHistory.value = null;
      this.selection.value = new Set();
    });
    this.#historyKey = null;
    this.#anchor = null;
  }

  async selectSprint(id: number): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    const configuration = this.context.configuration();
    if (
      !configuration ||
      this.busy.value ||
      this.#disposed ||
      !this.sprints.value.some((sprint) => sprint.id === id)
    )
      return;
    const generation = ++this.#generation;
    this.#boardId = configuration.boardId;
    if (id !== this.selectedSprintId.value) this.#select(id);
    batch(() => {
      this.loading.value = true;
      this.error.value = null;
    });
    try {
      await this.#read(generation);
      if (!this.#stale(generation)) this.#reapplyJiraQuickFilters();
    } catch (error) {
      if (!this.#stale(generation)) this.error.value = toMessage(error);
    } finally {
      if (!this.#stale(generation)) this.loading.value = false;
    }
  }

  /** Relit les sprints futurs et le sprint en préparation. */
  async refresh(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    if (this.busy.value || this.loading.value || this.#disposed) return;
    this.#permissions = sprintPermissionCache();
    this.#closedSprints = closedSprintCache();
    this.#historyKey = null;
    await this.#loadSprintsAndSelection();
  }

  /** Lit le sprint sélectionné et, en Goals Atlassian, ses Goals. Lève une erreur de lecture. */
  async #read(generation: number): Promise<void> {
    const configuration = this.context.configuration();
    const sprintId = this.selectedSprintId.value;
    if (!configuration || sprintId === null) return;
    const snapshot = await loadSprintPlanning(this.client, {
      boardId: configuration.boardId,
      sprintId,
      query: planningQuery(configuration),
      columns: configuration.columns,
      // Autres sprints futurs et sprints à clôturer : seulement ceux que l'utilisateur peut modifier.
      proposable: (sprints) => proposableSprintIds(this.client, sprints, this.#permissions),
    });
    if (this.#stale(generation)) return;
    let goals: AtlassianSprintGoals | null = null;
    let warning: AppMessage | null = null;
    if (configuration.goalSource === "atlassianGoals") {
      try {
        goals = await loadAtlassianSprintGoals({
          reader: this.context.goals,
          pinnedGoalIds: snapshot.pinnedGoalIds,
          issues: snapshot.sprintIssues,
          configuration,
        });
        const first = goals.warnings[0];
        if (first) warning = goalsWarningMessage(first);
      } catch (error) {
        warning = goalsFailureMessage(error);
      }
      if (this.#stale(generation)) return;
    }
    batch(() => {
      this.snapshot.value = snapshot;
      this.atlassianGoals.value = goals;
      this.goalsWarning.value = warning;
      const states = columnStates(configuration.columns);
      const kept = [...this.selection.value].filter((key) => selectable(snapshot, key, states));
      if (kept.length !== this.selection.value.size) this.selection.value = new Set(kept);
    });
    void this.#readHistory(generation, configuration, snapshot, goals);
  }

  /**
   * Déjà livré avant ce sprint, objectif par objectif : lu seulement quand les objectifs (et, en
   * Goals Atlassian, leurs `workItems`) ont changé depuis la dernière lecture. Une lecture qui
   * échoue rend l'historique incomplet, jamais une erreur du planning.
   */
  async #readHistory(
    generation: number,
    configuration: BoardConfiguration,
    snapshot: PlanningSnapshot,
    atlassian: AtlassianSprintGoals | null,
  ): Promise<void> {
    const text = configuration.goalSource !== "atlassianGoals";
    const goalIds = (text ? snapshot.goals : (atlassian?.goals ?? [])).map((goal) => goal.id);
    const workItems = atlassian?.workItems ?? {};
    // « Terminé » = dernière colonne visible du board (stories 8.20, 8.21).
    const doneStatusIds = columnStates(configuration.columns).doneStatusIds;
    const key = JSON.stringify([
      snapshot.sprint.id,
      text,
      goalIds,
      doneStatusIds,
      text ? null : goalIds.map((id) => workItems[id] ?? []),
    ]);
    if (key === this.#historyKey) return;
    this.#historyKey = key;
    const run = ++this.#historyRun;
    const sprintKeys = new Set(snapshot.sprintIssues.map((issue) => issue.key));
    let history: GoalHistory;
    try {
      history = text
        ? await textGoalHistory(
            this.client,
            {
              boardId: snapshot.boardId,
              sprintId: snapshot.sprint.id,
              goalIds,
              sprintKeys,
              query: snapshot.query,
              doneStatusIds,
            },
            this.#closedSprints,
          )
        : await atlassianGoalHistory(this.client, {
            boardId: snapshot.boardId,
            goalIds,
            workItems,
            workItemsComplete:
              atlassian !== null &&
              !atlassian.warnings.some(
                (warning) =>
                  warning.kind === "workItemsIssue" ||
                  (warning.kind === "failed" && warning.operation === "workItems"),
              ),
            sprintKeys,
            query: snapshot.query,
            doneStatusIds,
          });
    } catch {
      history = { delivered: {}, incomplete: true };
    }
    if (run !== this.#historyRun || this.#stale(generation)) return;
    this.goalHistory.value = history;
  }

  setSearch(text: string): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    this.search.value = text;
  }

  // ─── Filtres (lecture seule) ─────────────────────────────────────────────────

  /**
   * Menus de la barre. Les filtres rapides du board Jira ne changent que par
   * `toggleJiraQuickFilter`, et des pastilles seule « Bloqués » est retenue.
   */
  setFilters(next: PlanningFilters): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    const current = this.filters.value;
    this.filters.value = {
      ...next,
      quickFilters: new Set([...next.quickFilters].filter((quick) => quick === "blocked")),
      jiraQuickFilterIds: current.jiraQuickFilterIds,
      jiraQuickFilterKeys: current.jiraQuickFilterKeys,
    };
  }

  /** Pastille « Bloqués » : lien Jira « est bloqué par », règle du board. */
  toggleBlocked(): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    const current = this.filters.value;
    this.filters.value = {
      ...current,
      quickFilters: current.quickFilters.has("blocked") ? new Set() : new Set(["blocked"]),
    };
  }

  /** Vide la recherche et tous les filtres, filtres rapides Jira compris. */
  resetFilters(): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    this.#quickFilterRun += 1;
    batch(() => {
      this.search.value = "";
      this.filters.value = NO_PLANNING_FILTERS;
      this.applyingQuickFilters.value = false;
    });
  }

  /** Active ou désactive un filtre rapide du board Jira. Son JQL est évalué par Jira. */
  async toggleJiraQuickFilter(id: number): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED || this.#disposed) return;
    if (!this.jiraQuickFilters.value.some((filter) => filter.id === id)) return;
    const ids = new Set(this.filters.value.jiraQuickFilterIds);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.filters.value = { ...this.filters.value, jiraQuickFilterIds: ids };
    await this.#applyJiraQuickFilters();
  }

  /**
   * Demande à Jira les tickets du planning retenus par les filtres rapides actifs : une lecture
   * par filtre, jamais rejouée par le modèle. Un filtre que Jira refuse désactive les filtres
   * rapides plutôt que de les appliquer à moitié, et on le dit ; les autres filtres restent.
   */
  async #applyJiraQuickFilters(): Promise<void> {
    const configuration = this.context.configuration();
    const snapshot = this.snapshot.value;
    const ids = this.filters.value.jiraQuickFilterIds;
    const active = this.jiraQuickFilters.value.filter((filter) => ids.has(filter.id));
    const run = ++this.#quickFilterRun;
    // Seul le dernier calcul compte, et seulement si les filtres actifs n'ont pas changé depuis.
    const current = () =>
      run === this.#quickFilterRun &&
      !this.#disposed &&
      sameIds(this.filters.value.jiraQuickFilterIds, ids);

    if (!configuration || active.length === 0) {
      batch(() => {
        this.filters.value = { ...this.filters.value, jiraQuickFilterKeys: null };
        this.applyingQuickFilters.value = false;
      });
      return;
    }
    this.applyingQuickFilters.value = true;
    try {
      const sprintIds = snapshot
        ? [snapshot.sprint.id, ...snapshot.futureSprints.map(({ sprint }) => sprint.id)]
        : this.sprints.value.map((sprint) => sprint.id);
      const keys = await quickFilterKeys(this.client, {
        boardId: configuration.boardId,
        scope: "planning",
        filters: active,
        sprintIds: [...new Set(sprintIds)],
        doneStatusIds: columnStates(configuration.columns).doneStatusIds,
      });
      if (current()) this.filters.value = { ...this.filters.value, jiraQuickFilterKeys: keys };
    } catch (error) {
      if (!current()) return;
      batch(() => {
        this.filters.value = {
          ...this.filters.value,
          jiraQuickFilterIds: new Set(),
          jiraQuickFilterKeys: null,
        };
        this.notice.value = message("{p0} Les filtres rapides Jira ont été désactivés.", {
          p0: message("Filtre rapide Jira inapplicable : {p0}", { p0: errorMessage(error) }),
        });
      });
    } finally {
      if (run === this.#quickFilterRun) this.applyingQuickFilters.value = false;
    }
  }

  /** Après une lecture demandée (sprint choisi, actualisation) : Jira réévalue les filtres. */
  #reapplyJiraQuickFilters(): void {
    if (this.filters.value.jiraQuickFilterIds.size > 0) void this.#applyJiraQuickFilters();
  }

  // ─── Gestes ──────────────────────────────────────────────────────────────────

  /**
   * Déroule un geste : porte du board, intention de `core`, journal, avis, puis relecture du
   * sprint. Un refus de la porte avant l'appel n'a rien envoyé.
   */
  async #gesture(
    entry: { issueKey: string | null },
    intention: (access: BoardWriteAccess, snapshot: PlanningSnapshot) => Promise<PlanningOutcome>,
    after?: (outcome: PlanningOutcome) => void,
  ): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED || this.gesturesDisabled.value) return;
    const snapshot = this.snapshot.value;
    if (!snapshot) return;
    await this.#busyWhile(async (generation) => {
      let outcome: PlanningOutcome;
      try {
        outcome = await this.context.write((access) => intention(access, snapshot));
      } catch (error) {
        outcome = { kind: "refused", reason: { reason: "failed", error } };
      }
      await this.#journal(entry.issueKey, snapshot.sprint.name, outcome);
      if (this.#stale(generation)) return;
      after?.(outcome);
      this.notice.value = outcome.kind === "done" ? null : planningOutcomeMessage(outcome);
      await this.#reread(generation);
    });
  }

  async #busyWhile(task: (generation: number) => Promise<void>): Promise<void> {
    const generation = this.#generation;
    batch(() => {
      this.#busyCount.value += 1;
      this.notice.value = null;
      this.error.value = null;
    });
    try {
      await task(generation);
    } finally {
      this.#busyCount.value -= 1;
    }
  }

  async #reread(generation: number): Promise<void> {
    try {
      await this.#read(generation);
      // Un ticket déplacé peut ne plus répondre à un filtre rapide qui dépend du sprint.
      if (!this.#stale(generation)) this.#reapplyJiraQuickFilters();
    } catch (error) {
      if (!this.#stale(generation)) this.error.value = toMessage(error);
    }
  }

  async #journal(issueKey: string | null, to: string, outcome: PlanningOutcome): Promise<void> {
    if (outcome.kind === "unchanged") return;
    await this.#record(
      { issueKey, from: null, to, detailMessage: planningOutcomeMessage(outcome) },
      outcome,
    );
  }

  /**
   * Entrée « sprint planning » du journal : écrit ou rien à écrire, « réussi » ; résultat inconnu
   * après un envoi, « incertain » ; refus ou échec, « échec ».
   */
  async #record(
    entry: { issueKey: string | null; from: string | null; to: string; detailMessage: AppMessage },
    outcome: PlanningOutcome,
  ): Promise<void> {
    await this.context
      .record({
        action: "sprint planning",
        ...entry,
        outcome:
          outcome.kind === "done" || outcome.kind === "unchanged"
            ? "réussi"
            : outcome.kind === "partial" &&
                outcome.error instanceof JiraError &&
                outcome.error.isOutcomeUnknown
              ? "incertain"
              : "échec",
        detail: null,
      })
      .catch(() => {});
  }

  #textGoals(
    goals: (current: readonly SprintGoal[]) => readonly SprintGoal[] | null,
  ): Promise<void> {
    const snapshot = this.snapshot.value;
    if (!snapshot || this.goalMode.value !== "text") return Promise.resolve();
    const next = goals(snapshot.goals);
    if (next === null) return Promise.resolve();
    return this.#gesture({ issueKey: null }, ({ writer }, base) =>
      writeTextGoals(this.client, writer, {
        sprintId: base.sprint.id,
        baseText: base.nativeGoalText,
        baseProperty: base.rawGoalProperty,
        goals: next.map((goal, position) => ({ ...goal, position })),
        accountId: this.context.accountId(),
        now: new Date(),
      }),
    );
  }

  addGoal(title: string): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    return this.#textGoals((goals) => [
      ...goals,
      makeSprintGoal({
        id: crypto.randomUUID(),
        title: title.trim(),
        color: freeColor(goals),
        position: goals.length,
      }),
    ]);
  }

  /** Renommage validé (Entrée ou sortie du champ) : même identifiant, ses tickets le suivent. */
  renameGoal(id: string, title: string): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    return this.#textGoals((goals) => {
      const goal = goals.find((candidate) => candidate.id === id);
      if (!goal || goal.title === title.trim()) return null;
      return goals.map((candidate) =>
        candidate.id === id ? { ...candidate, title: title.trim() } : candidate,
      );
    });
  }

  removeGoal(id: string): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    if (this.goalMode.value === "atlassian") return this.unpinGoal(id);
    return this.#textGoals((goals) =>
      goals.some((goal) => goal.id === id) ? goals.filter((goal) => goal.id !== id) : null,
    );
  }

  moveGoal(id: string, delta: -1 | 1): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    return this.#textGoals((goals) => {
      const index = goals.findIndex((goal) => goal.id === id);
      const current = goals[index];
      const neighbor = goals[index + delta];
      if (index < 0 || !current || !neighbor) return null;
      const next = [...goals];
      next[index] = neighbor;
      next[index + delta] = current;
      return next;
    });
  }

  /**
   * Pose un ticket sur un objectif du sprint en préparation (`null` : « Sans objectif »). Venu du
   * backlog ou d'un autre sprint futur, il y est d'abord ajouté.
   */
  placeIssue(key: string, goalId: string | null): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    const snapshot = this.snapshot.value;
    if (!snapshot) return Promise.resolve();
    const { goals, links } = this.#goalView.value;
    if (goalId !== null && !goals.some((goal) => goal.id === goalId)) return Promise.resolve();
    const located = locate(snapshot, key);
    if (!located) return Promise.resolve();
    const { issue, origin } = located;
    const current = links[key] ?? null;
    if (origin === null && current === goalId) return Promise.resolve();
    let target: PlanningTarget = null;
    // En Goals Atlassian, un ticket qui arrive sur « Sans objectif » quitte aussi le Goal de son
    // champ natif : sinon il resterait affiché sous ce Goal.
    if (origin === null || goalId !== null || this.goalMode.value === "atlassian") {
      target =
        this.goalMode.value === "text"
          ? {
              kind: "text",
              goalId,
              knownGoalId: snapshot.storedLinks[key] ?? null,
              knownGoalIds: snapshot.storedGoalIds,
              goals: snapshot.goals,
            }
          : {
              kind: "atlassian",
              goalId,
              // Un ticket qui arrive quitte d'abord le Goal de son champ natif (E4 puis E3).
              previousGoalId:
                origin === null
                  ? current
                  : (linkedGoalIds(
                      issue.fields,
                      this.context.configuration()?.goalsFieldId ?? null,
                    )[0] ?? null),
            };
    }
    return this.#gesture(
      { issueKey: key },
      ({ writer, goals: links }, base) =>
        placePlanningIssue(this.client, writer, links, {
          boardId: base.boardId,
          sprintId: base.sprint.id,
          query: base.query,
          issue,
          target,
          accountId: this.context.accountId(),
          now: new Date(),
          wait: (ms) => this.context.wait(ms),
        }),
      (outcome) => {
        if (origin === null || outcome.kind === "refused" || outcome.kind === "unchanged") return;
        if (!outcome.confirmed.includes("issueAdded")) return;
        this.#origins.value = { ...this.#origins.value, [key]: origin };
      },
    );
  }

  /** Retire un ticket du sprint en préparation, vers le backlog ou un autre sprint futur. */
  removeIssue(key: string, destination: PlanningDestination): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    const snapshot = this.snapshot.value;
    if (!snapshot?.sprintIssues.some((issue) => issue.key === key)) return Promise.resolve();
    if (
      destination.kind === "sprint" &&
      !snapshot.futureSprints.some(({ sprint }) => sprint.id === destination.sprintId)
    )
      return Promise.resolve();
    return this.#gesture(
      { issueKey: key },
      ({ writer }, base) =>
        removePlanningIssue(this.client, writer, {
          boardId: base.boardId,
          sprintId: base.sprint.id,
          query: base.query,
          issueKey: key,
          destination,
          wait: (ms) => this.context.wait(ms),
        }),
      (outcome) => {
        if (outcome.kind !== "done") return;
        const { [key]: _left, ...rest } = this.#origins.value;
        this.#origins.value = rest;
      },
    );
  }

  // ─── Sélection et lots (story 8.15) ──────────────────────────────────────────

  /**
   * Ctrl/Cmd+clic : ajoute le ticket à la sélection, ou l'en retire. Une carte en consultation
   * (sous-tâche, ticket terminé hors du sprint) n'est pas sélectionnable.
   */
  toggleSelection(key: string): void {
    const snapshot = this.snapshot.value;
    if (!SPRINT_PLANNING_ENABLED || !snapshot || !selectable(snapshot, key, this.#states.value))
      return;
    const next = new Set(this.selection.value);
    if (!next.delete(key)) next.add(key);
    this.selection.value = next;
    this.#anchor = key;
  }

  /**
   * Maj+clic : sélectionne la plage entre le dernier ticket choisi et celui-ci, dans la même section
   * (`sectionKeys`, dans l'ordre affiché) ; sans départ dans cette section, agit comme Ctrl+clic.
   */
  extendSelection(key: string, sectionKeys: readonly string[]): void {
    const snapshot = this.snapshot.value;
    if (!SPRINT_PLANNING_ENABLED || !snapshot) return;
    const from = this.#anchor === null ? -1 : sectionKeys.indexOf(this.#anchor);
    const to = sectionKeys.indexOf(key);
    if (from < 0 || to < 0) {
      this.toggleSelection(key);
      return;
    }
    const [start, end] = from <= to ? [from, to] : [to, from];
    const next = new Set(this.selection.value);
    for (const candidate of sectionKeys.slice(start, end + 1))
      if (selectable(snapshot, candidate, this.#states.value)) next.add(candidate);
    this.selection.value = next;
  }

  /** Échap ou « Vider la sélection ». */
  clearSelection(): void {
    if (!SPRINT_PLANNING_ENABLED || this.selection.value.size === 0) return;
    this.selection.value = new Set();
    this.#anchor = null;
  }

  /**
   * Pose plusieurs tickets sur un objectif (`null` : « Sans objectif ») en un geste : une seule
   * E9 pour ceux qui rejoignent le sprint, puis une seule E5 en texte, ou un lien par ticket en
   * Goals Atlassian. Un seul ticket : `placeIssue`.
   */
  placeIssues(keys: readonly string[], goalId: string | null): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    const unique = [...new Set(keys)];
    const [single] = unique;
    if (unique.length === 1 && single !== undefined) return this.placeIssue(single, goalId);
    const snapshot = this.snapshot.value;
    if (!snapshot || unique.length === 0) return Promise.resolve();
    const { goals, links } = this.#goalView.value;
    if (goalId !== null && !goals.some((goal) => goal.id === goalId)) return Promise.resolve();
    if (this.#refuseLargeBatch(unique.length)) return Promise.resolve();
    const located = unique
      .map((key) => locate(snapshot, key))
      .filter((entry) => entry !== null)
      .filter(({ issue, origin }) => origin === null || canJoinSprint(issue));
    if (located.length === 0) return Promise.resolve();
    const issues = located.map(({ issue }) => issue);
    const goalsField = this.context.configuration()?.goalsFieldId ?? null;
    const target: PlanningBatchTarget =
      this.goalMode.value === "text"
        ? {
            kind: "text",
            goalId,
            knownGoalIds: Object.fromEntries(
              issues.map((issue) => [issue.key, snapshot.storedLinks[issue.key] ?? null]),
            ),
            storedGoalIds: snapshot.storedGoalIds,
            goals: snapshot.goals,
          }
        : {
            kind: "atlassian",
            goalId,
            // Un ticket qui arrive quitte d'abord le Goal de son champ natif (E4 puis E3).
            previousGoalIds: Object.fromEntries(
              located.map(({ issue, origin }) => [
                issue.key,
                origin === null
                  ? (links[issue.key] ?? null)
                  : (linkedGoalIds(issue.fields, goalsField)[0] ?? null),
              ]),
            ),
          };
    return this.#batchGesture(
      issues.map((issue) => issue.key),
      ({ writer, goals: goalLinks }, base) =>
        placePlanningIssues(this.client, writer, goalLinks, {
          boardId: base.boardId,
          sprintId: base.sprint.id,
          query: base.query,
          issues,
          target,
          accountId: this.context.accountId(),
          now: new Date(),
          wait: (ms) => this.context.wait(ms),
        }),
      (result) => {
        if (result.outcome.kind === "refused" || result.outcome.kind === "unchanged") return;
        if (!result.outcome.confirmed.includes("issueAdded")) return;
        const origins = { ...this.#origins.value };
        for (const { issue, origin } of located) if (origin) origins[issue.key] = origin;
        this.#origins.value = origins;
      },
    );
  }

  /**
   * Retire plusieurs tickets du sprint en préparation en un geste (une seule E10, ou une seule E9
   * vers un autre sprint futur). Tous doivent être dans le sprint en préparation. Un seul ticket :
   * `removeIssue`.
   */
  removeIssues(keys: readonly string[], destination: PlanningDestination): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    const unique = [...new Set(keys)];
    const [single] = unique;
    if (unique.length === 1 && single !== undefined) return this.removeIssue(single, destination);
    const snapshot = this.snapshot.value;
    if (!snapshot || unique.length === 0) return Promise.resolve();
    if (!unique.every((key) => snapshot.sprintIssues.some((issue) => issue.key === key)))
      return Promise.resolve();
    if (
      destination.kind === "sprint" &&
      !snapshot.futureSprints.some(({ sprint }) => sprint.id === destination.sprintId)
    )
      return Promise.resolve();
    if (this.#refuseLargeBatch(unique.length)) return Promise.resolve();
    return this.#batchGesture(
      unique,
      ({ writer }, base) =>
        removePlanningIssues(this.client, writer, {
          boardId: base.boardId,
          sprintId: base.sprint.id,
          query: base.query,
          issueKeys: unique,
          destination,
          wait: (ms) => this.context.wait(ms),
        }),
      (result) => {
        const origins = { ...this.#origins.value };
        for (const key of result.confirmedKeys) delete origins[key];
        this.#origins.value = origins;
      },
    );
  }

  /** Plus de 50 tickets : refus avant toute écriture, avec un avis. */
  #refuseLargeBatch(count: number): boolean {
    if (count <= PLANNING_BATCH_LIMIT) return false;
    this.notice.value = planningOutcomeMessage({
      kind: "refused",
      reason: { reason: "batchTooLarge", count },
    });
    return true;
  }

  /**
   * Geste sur un lot : porte du board, intention de `core`, une entrée de journal, avis des
   * tickets confirmés et de ceux à refaire, puis relecture. La sélection garde les tickets à refaire.
   */
  async #batchGesture(
    keys: readonly string[],
    intention: (
      access: BoardWriteAccess,
      snapshot: PlanningSnapshot,
    ) => Promise<PlanningBatchOutcome>,
    after?: (result: PlanningBatchOutcome) => void,
  ): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED || this.gesturesDisabled.value) return;
    const snapshot = this.snapshot.value;
    if (!snapshot) return;
    await this.#busyWhile(async (generation) => {
      let result: PlanningBatchOutcome;
      try {
        result = await this.context.write((access) => intention(access, snapshot));
      } catch (error) {
        result = {
          outcome: { kind: "refused", reason: { reason: "failed", error } },
          confirmedKeys: [],
          remainingKeys: keys,
          unseenKeys: [],
        };
      }
      if (result.outcome.kind !== "unchanged")
        await this.#record(
          {
            issueKey: null,
            from: null,
            to: snapshot.sprint.name,
            detailMessage: planningBatchJournalMessage(result),
          },
          result.outcome,
        );
      if (this.#stale(generation)) return;
      after?.(result);
      batch(() => {
        this.notice.value = planningBatchMessage(result);
        // Lot confirmé : la sélection est vidée ; sinon elle garde les tickets à refaire, sans
        // ceux dont Jira a reçu l'écriture sans les montrer encore (story 8.26).
        const unseen = new Set(result.unseenKeys);
        this.selection.value = new Set(
          result.outcome.kind === "refused"
            ? keys
            : result.remainingKeys.filter((key) => !unseen.has(key)),
        );
      });
      await this.#reread(generation);
    });
  }

  /**
   * Top et basse priorité d'un ticket du sprint en préparation (story 8.19) : tête ou fin de la
   * swimlane de son objectif (« Sans objectif » compris), dans l'ordre de Jira, filtres ignorés.
   * `null` pour une carte qui n'est pas dans le sprint en préparation. Aucune écriture.
   */
  rankOptions(key: string): PlanningRankOptions | null {
    const lane = this.#rankLane(key);
    if (!lane) return null;
    const writing = this.gesturesDisabled.value;
    return {
      top: writing ? "writing" : lane[0] === key ? "first" : null,
      bottom: writing ? "writing" : lane.at(-1) === key ? "last" : null,
    };
  }

  /**
   * Met le ticket en tête ou en fin de la swimlane de son objectif dans le sprint en préparation :
   * une seule écriture de rang (E2), avant le premier ou après le dernier autre ticket de la
   * swimlane, relue. Rien si l'action est désactivée.
   */
  rankIssue(key: string, edge: "top" | "bottom"): Promise<void> {
    const options = this.rankOptions(key);
    const lane = this.#rankLane(key);
    if (!SPRINT_PLANNING_ENABLED || !options || !lane || options[edge] !== null)
      return Promise.resolve();
    const others = lane.filter((other) => other !== key);
    const reference = edge === "top" ? others[0] : others.at(-1);
    if (reference === undefined) return Promise.resolve();
    return this.#gesture({ issueKey: key }, ({ writer }, current) =>
      rankPlanningIssue(this.client, writer, {
        boardId: current.boardId,
        sprintId: current.sprint.id,
        query: current.query,
        issueKey: key,
        edge,
        reference,
        wait: (ms) => this.context.wait(ms),
      }),
    );
  }

  /** Clés de la swimlane du ticket dans le sprint en préparation, dans l'ordre de Jira. */
  #rankLane(key: string): readonly string[] | null {
    if (!SPRINT_PLANNING_ENABLED) return null;
    const { goals, links } = this.#goalView.value;
    const shown = new Set(goals.map((goal) => goal.id));
    const laneOf = (issueKey: string) => {
      const goalId = links[issueKey];
      return goalId !== undefined && shown.has(goalId) ? goalId : null;
    };
    const items = this.#sprintItems.value;
    if (!items.some((item) => item.issue.key === key)) return null;
    const lane = laneOf(key);
    return items.map((item) => item.issue.key).filter((other) => laneOf(other) === lane);
  }

  /**
   * Estime un ticket du sprint en préparation ou d'une source (E11), validé par le champ de la
   * carte. Une valeur égale à celle affichée n'écrit rien ; une sous-tâche ou un ticket terminé
   * hors du sprint restent en consultation.
   */
  estimateIssue(key: string, value: number): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED || !this.canEstimate.value) return Promise.resolve();
    const snapshot = this.snapshot.value;
    if (!snapshot || !selectable(snapshot, key, this.#states.value)) return Promise.resolve();
    const located = locate(snapshot, key);
    if (!located) return Promise.resolve();
    const fieldId = this.context.configuration()?.estimationFieldId ?? null;
    const base = estimate(located.issue.fields, fieldId);
    if (base === value) return Promise.resolve();
    return this.#gesture({ issueKey: key }, ({ writer }, current) =>
      estimatePlanningIssue(this.client, writer, {
        boardId: current.boardId,
        issueKey: key,
        fieldId,
        base,
        value,
      }),
    );
  }

  /** Vélocité partagée de l'équipe, validée par le champ (Entrée ou sortie). */
  saveVelocity(velocity: number | null): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    const snapshot = this.snapshot.value;
    if (!snapshot || snapshot.velocity === velocity) return Promise.resolve();
    return this.#gesture({ issueKey: null }, ({ writer }, base) =>
      savePlanningVelocity(this.client, writer, {
        sprintId: base.sprint.id,
        base: base.velocity,
        velocity,
        accountId: this.context.accountId(),
        now: new Date(),
      }),
    );
  }

  // ─── Goals Atlassian ─────────────────────────────────────────────────────────

  /** Cherche par nom des Goals existants à épingler. Aucun Goal n'est jamais créé. */
  async searchGoals(query: string): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED || this.goalMode.value !== "atlassian" || this.#disposed) return;
    const run = ++this.#goalSearchRun;
    const generation = this.#generation;
    // Planning relu pendant la recherche : la réponse est ignorée, mais cette recherche, si elle
    // est toujours la dernière, ne reste pas « en cours » indéfiniment.
    const abandoned = () => {
      if (run !== this.#goalSearchRun) return true;
      if (!this.#stale(generation)) return false;
      const pending = this.goalSearch.value;
      if (pending?.loading) this.goalSearch.value = { ...pending, loading: false };
      return true;
    };
    this.goalSearch.value = {
      query,
      loading: true,
      results: this.goalSearch.value?.results ?? [],
      error: null,
    };
    try {
      this.#siteGoals ??= this.context.goals.searchGoals({ limit: 100, loadAll: true });
      const site = await this.#siteGoals;
      if (abandoned()) return;
      const shown = new Set(this.#goalView.value.goals.map((goal) => goal.id));
      const folded = query.trim().toLocaleLowerCase();
      this.goalSearch.value = {
        query,
        loading: false,
        results: site
          .filter(
            (goal) =>
              !goal.isArchived &&
              !shown.has(goal.id) &&
              goalDisplayName(goal).toLocaleLowerCase().includes(folded),
          )
          .slice(0, GOAL_SEARCH_LIMIT),
        error: null,
      };
    } catch (error) {
      this.#siteGoals = null;
      if (abandoned()) return;
      this.goalSearch.value = { query, loading: false, results: [], error: toMessage(error) };
    }
  }

  pinGoal(goalId: string): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    const snapshot = this.snapshot.value;
    if (!snapshot || this.goalMode.value !== "atlassian") return Promise.resolve();
    if (snapshot.pinnedGoalIds.includes(goalId)) return Promise.resolve();
    return this.#pin([...snapshot.pinnedGoalIds, goalId]).then(() => {
      this.goalSearch.value = null;
    });
  }

  unpinGoal(goalId: string): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return Promise.resolve();
    const snapshot = this.snapshot.value;
    if (!snapshot || this.goalMode.value !== "atlassian") return Promise.resolve();
    if (!snapshot.pinnedGoalIds.includes(goalId)) return Promise.resolve();
    return this.#pin(snapshot.pinnedGoalIds.filter((id) => id !== goalId));
  }

  #pin(goalIds: readonly string[]): Promise<void> {
    return this.#gesture({ issueKey: null }, ({ writer }, base) =>
      pinPlanningGoals(this.client, writer, {
        sprintId: base.sprint.id,
        shownGoalIds: base.pinnedGoalIds,
        goalIds,
        accountId: this.context.accountId(),
        now: new Date(),
      }),
    );
  }

  // ─── Fenêtres natives : clôture et démarrage ─────────────────────────────────

  /**
   * Ouvre la fenêtre native « Terminer le sprint » du sprint actif choisi ; le report attend sa
   * fermeture.
   */
  closeActiveSprint(sprintId: number): void {
    if (!SPRINT_PLANNING_ENABLED || this.gesturesDisabled.value || this.#closureCheck) return;
    const snapshot = this.snapshot.value;
    const active = this.closableSprints.value.find((sprint) => sprint.id === sprintId);
    if (!snapshot || !active) return;
    this.notice.value = null;
    this.pendingClosure.value = {
      closedSprintId: active.id,
      closedSprintName: active.name,
      targetSprintId: snapshot.sprint.id,
      targetSprintName: snapshot.sprint.name,
    };
    if (!this.context.openSprintDialog("complete", active)) {
      batch(() => {
        this.pendingClosure.value = null;
        this.notice.value = message(
          "La fenêtre de Jira ne s'ouvre que depuis le board Jira qui héberge Sprint Goals Board.",
        );
      });
      return;
    }
    // Nouvelle clôture demandée : le compte rendu de la précédente ne la décrit pas.
    this.carryOverReport.value = null;
  }

  /** Ouvre la fenêtre native « Démarrer le sprint », que l'utilisateur seul remplit. */
  startSprint(): void {
    if (!SPRINT_PLANNING_ENABLED || this.gesturesDisabled.value) return;
    const snapshot = this.snapshot.value;
    if (!snapshot || this.startDisabledReason.value !== null) return;
    this.notice.value = null;
    if (!this.context.openSprintDialog("start", snapshot.sprint))
      this.notice.value = message(
        "La fenêtre de Jira ne s'ouvre que depuis le board Jira qui héberge Sprint Goals Board.",
      );
  }

  /**
   * Après la fermeture d'une fenêtre native (message `refresh` de la page hôte) : une clôture
   * demandée relit l'état du sprint à 0, 1, 3, 6 et 10 s, puis reporte les objectifs non atteints
   * s'il est clos ; encore actif, la fenêtre a été annulée et rien n'est écrit. Le compte rendu
   * reste affiché jusqu'à sa fermeture et le journal garde une entrée. Puis tout est relu.
   */
  async afterNativeDialog(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED || this.#disposed) return;
    // Vérification déjà en cours : un second `refresh` ne lance pas un second report.
    if (this.#closureCheck) return;
    const pending = this.pendingClosure.value;
    const configuration = this.context.configuration();
    if (pending && configuration?.boardId === this.#boardId && configuration) {
      this.#closureCheck = pending;
      try {
        await this.#busyWhile((generation) =>
          this.#verifyClosure(pending, configuration, generation),
        );
      } finally {
        if (this.#closureCheck === pending) {
          this.#closureCheck = null;
          if (this.pendingClosure.value === pending) this.pendingClosure.value = null;
        }
      }
    } else if (pending) {
      this.pendingClosure.value = null;
    }
    if (this.#disposed) return;
    if (this.snapshot.value || this.selectedSprintId.value !== null) await this.refresh();
  }

  /** Relectures bornées de l'état du sprint, puis report ou constat « toujours actif ». */
  async #verifyClosure(
    pending: PendingClosure,
    configuration: BoardConfiguration,
    generation: number,
  ): Promise<void> {
    let elapsed = 0;
    let closed = false;
    let failure: unknown = null;
    for (const at of CLOSURE_CHECKS_MS) {
      if (at > elapsed) {
        await this.context.wait(at - elapsed);
        elapsed = at;
      }
      if (this.#stale(generation)) return;
      try {
        const sprint = await this.client.sprint(pending.closedSprintId);
        failure = null;
        if (sprint.state === "closed") {
          closed = true;
          break;
        }
      } catch (error) {
        // Lecture seule : la suivante peut répondre ; seule la dernière erreur est rendue.
        failure = error;
      }
    }
    if (this.#stale(generation)) return;
    if (closed) {
      await this.#carryOver(pending, configuration, generation);
      return;
    }
    const outcome: PlanningOutcome = {
      kind: "refused",
      reason:
        failure === null ? { reason: "sprintNotClosed" } : { reason: "failed", error: failure },
    };
    const summary = planningCarryOverMessage(
      failure === null ? { kind: "stillActive" } : outcome,
      pending.targetSprintName,
    );
    await this.#journalCarryOver(pending, outcome, summary);
    if (this.#stale(generation)) return;
    this.carryOverReport.value = {
      closedSprintName: pending.closedSprintName,
      targetSprintName: pending.targetSprintName,
      summary,
      written: false,
      goals: [],
      incomplete: false,
    };
  }

  async #carryOver(
    pending: PendingClosure,
    configuration: BoardConfiguration,
    generation: number,
  ): Promise<void> {
    const states = columnStates(configuration.columns);
    const isDone = (issue: JiraIssue) => states.ofStatus(issue.fields.status?.id) === "done";
    const mode: CarryOverMode =
      configuration.goalSource === "atlassianGoals"
        ? { kind: "atlassian", goals: this.context.goals, configuration }
        : { kind: "text" };
    let result: CarryOverResult;
    try {
      result = await this.context.write(({ writer }) =>
        carryOverGoals(this.client, writer, {
          boardId: configuration.boardId,
          closedSprintId: pending.closedSprintId,
          targetSprintId: pending.targetSprintId,
          query: planningQuery(configuration),
          isDone,
          mode,
          accountId: this.context.accountId(),
          now: new Date(),
        }),
      );
    } catch (error) {
      result = { outcome: { kind: "refused", reason: { reason: "failed", error } }, report: null };
    }
    const { outcome, report } = result;
    const summary = planningCarryOverMessage(outcome, pending.targetSprintName);
    await this.#journalCarryOver(pending, outcome, summary);
    if (this.#stale(generation)) return;
    this.carryOverReport.value = {
      closedSprintName: pending.closedSprintName,
      targetSprintName: pending.targetSprintName,
      summary,
      written: outcome.kind === "done",
      goals: report?.goals ?? [],
      incomplete: report?.incomplete ?? false,
    };
  }

  /**
   * Une entrée par report, du sprint clos vers le sprint préparé : écrit ou rien à reporter,
   * « réussi » ; sprint encore actif ou refus, « échec » ; résultat inconnu, « incertain ».
   */
  async #journalCarryOver(
    pending: PendingClosure,
    outcome: PlanningOutcome,
    summary: AppMessage,
  ): Promise<void> {
    await this.#record(
      {
        issueKey: null,
        from: pending.closedSprintName,
        to: pending.targetSprintName,
        detailMessage: summary,
      },
      outcome,
    );
  }

  /** Ferme le compte rendu de la dernière clôture. */
  dismissCarryOverReport(): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    this.carryOverReport.value = null;
  }

  openIssue(key: string): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    const snapshot = this.snapshot.value;
    if (!snapshot || this.busy.value || !isIssueKey(key) || !locate(snapshot, key)) return;
    this.context.openIssue(key);
  }

  issueUrl(key: string): string | null {
    const snapshot = this.snapshot.value;
    if (!SPRINT_PLANNING_ENABLED || !snapshot || !isIssueKey(key) || !locate(snapshot, key))
      return null;
    return browseUrl(this.client.site.origin, key);
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────────

  reset(): void {
    this.#generation += 1;
    this.#boardId = null;
    this.#siteGoals = null;
    this.#closureCheck = null;
    this.#quickFilterRun += 1;
    this.#permissions = sprintPermissionCache();
    this.#closedSprints = closedSprintCache();
    this.#historyKey = null;
    this.#historyRun += 1;
    this.#anchor = null;
    batch(() => {
      this.selection.value = new Set();
      this.goalHistory.value = null;
      this.noEditableSprint.value = false;
      this.snapshot.value = null;
      this.atlassianGoals.value = null;
      this.selectedSprintId.value = null;
      this.sprints.value = [];
      this.loading.value = false;
      this.error.value = null;
      this.notice.value = null;
      this.goalsWarning.value = null;
      this.pendingClosure.value = null;
      this.carryOverReport.value = null;
      this.goalSearch.value = null;
      this.search.value = "";
      this.filters.value = NO_PLANNING_FILTERS;
      this.applyingQuickFilters.value = false;
      this.#origins.value = {};
    });
  }

  dispose(): void {
    this.reset();
    this.#disposed = true;
  }

  #stale(generation: number): boolean {
    return this.#disposed || generation !== this.#generation;
  }
}

/** Lecture des tickets du planning : estimation et, en Goals Atlassian, le champ natif Goals. */
function planningQuery(configuration: BoardConfiguration): IssueQuery {
  return {
    estimationFieldId: configuration.estimationFieldId ?? null,
    includeChangelog: false,
    ...(configuration.goalsFieldId ? { extraFieldIds: [configuration.goalsFieldId] } : {}),
  };
}

/** Tickets affichés du sprint en préparation et de toutes les sources de la colonne de gauche. */
function planningIssues(snapshot: PlanningSnapshot, states: ColumnStates): JiraIssue[] {
  return [
    ...snapshot.sprintIssues.filter((issue) => shownInSprint(states, issue)),
    ...snapshot.futureSprints.flatMap(({ issues }) => issues),
    ...snapshot.backlogIssues,
  ];
}

function sameIds(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** Nombre de tickets et somme des estimations connues. */
function tally(items: readonly PlanningIssue[]): PlanningTally {
  return {
    count: items.length,
    points: items.reduce((sum, item) => sum + (item.estimate ?? 0), 0),
  };
}

/** Jira refuse d'ajouter au sprint une sous-tâche ou un ticket terminé. */
function canJoinSprint(issue: JiraIssue): boolean {
  return issue.fields.issuetype.subtask !== true && !isDoneStatus(issue.fields.status);
}

/**
 * Ticket affiché dans le sprint en préparation : statut dans une colonne visible du board autre
 * que la dernière (stories 8.20, 8.22, 8.23).
 */
function shownInSprint(states: ColumnStates, issue: JiraIssue): boolean {
  const state = states.ofStatus(issue.fields.status?.id);
  return state !== null && state !== "done";
}

/**
 * Ticket qu'un geste peut déplacer : affiché dans le sprint en préparation, ou dans une source
 * d'où il peut le rejoindre.
 */
function selectable(snapshot: PlanningSnapshot, key: string, states: ColumnStates): boolean {
  const located = locate(snapshot, key);
  if (located === null) return false;
  return located.origin === null
    ? shownInSprint(states, located.issue)
    : canJoinSprint(located.issue);
}

/** Première couleur de la palette qu'aucun objectif n'utilise encore. */
function freeColor(goals: readonly SprintGoal[]): string {
  const used = new Set(goals.map((goal) => goal.color));
  for (let index = 0; index < GOAL_COLOR_COUNT; index++) {
    const color = goalColorName(index);
    if (!used.has(color)) return color;
  }
  return goalColorName(goals.length);
}

/**
 * Ticket du board visible dans le planning et sa provenance : `origin` à `null` s'il est déjà
 * dans le sprint en préparation.
 */
function locate(
  snapshot: PlanningSnapshot,
  key: string,
): { issue: JiraIssue; origin: PlanningOrigin | null } | null {
  const inSprint = snapshot.sprintIssues.find((issue) => issue.key === key);
  if (inSprint) return { issue: inSprint, origin: null };
  const inBacklog = snapshot.backlogIssues.find((issue) => issue.key === key);
  if (inBacklog) return { issue: inBacklog, origin: { kind: "backlog" } };
  for (const { sprint, issues } of snapshot.futureSprints) {
    const found = issues.find((issue) => issue.key === key);
    if (found)
      return {
        issue: found,
        origin: { kind: "sprint", sprintId: sprint.id, sprintName: sprint.name },
      };
  }
  return null;
}
