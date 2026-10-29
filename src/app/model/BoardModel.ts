import { batch, computed, signal } from "@preact/signals";
import { loadAtlassianSprintGoals } from "../../core/atlassianGoals";
import { type BoardBlock, blockIdentifier, moveBlock, shiftBlock } from "../../core/boardBlocks";
import {
  type BoardConfiguration,
  colorRules,
  displayedGoalId,
  isBlockCollapsed,
  isGoalHidden,
} from "../../core/boardConfiguration";
import { allIssues, type BoardSnapshot, findIssue } from "../../core/boardIssue";
import { buildBoardLayout, filterOptions } from "../../core/boardLayout";
import {
  laneOrder,
  withAllBlocksCollapsed,
  withBlockCollapsed,
  withBlockOrder,
  withGoalColor,
  withGoalHidden,
  withLocalPins,
} from "../../core/boardPreferences";
import { customFieldChoices } from "../../core/boardSettings";
import { detectBoard, refreshBoardStructure } from "../../core/boardSync";
import { type CardColorRule, resolveCardColors } from "../../core/cardColors";
import { isNoOpDrop, planRank, type RankChange, resolveDrop } from "../../core/dropPlan";
import { type BoardFilters, focusGoal, NO_FILTERS, type QuickFilter } from "../../core/filters";
import { quickFilterKeys } from "../../core/jiraQuickFilters";
import { parentColors } from "../../core/parentColors";
import { type PendingMove, withPendingMove } from "../../core/pendingMove";
import { goalColorName, type SprintGoal } from "../../core/sprintGoals";
import { sprintHealth } from "../../core/sprintHealth";
import { JiraClient, type JiraField, type JiraQuickFilter } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import { GoalsClient } from "../../jira/goals";
import { type AtlassianGoal, blockingRequiredFields, type JiraTransition } from "../../jira/models";
import { type JiraSite, parseBoardUrl } from "../../jira/site";
import { defaultTransitions } from "../../jira/transitionPlanner";
import { JiraTransport } from "../../jira/transport";
import type { Platform } from "../platform/types";
import { evaluateBoardCardColors } from "../services/BoardCardColorService";
import { BoardLoadingService } from "../services/BoardLoadingService";
import { BoardMovementService } from "../services/BoardMovementService";
import { BoardSettingsService } from "../services/BoardSettingsService";
import { JqlService } from "../services/JqlService";
import { type AuditEntry, AuditLog } from "./auditLog";
import type {
  BoardSummary,
  DragState,
  DragTransitions,
  DropTarget,
  HostBoardAnswer,
  IssueDrop,
  PinEditor,
  SyncProblem,
  TeamNotice,
  TeamState,
  TransitionChoice,
  TransitionSelection,
  WriteNotice,
} from "./BoardTypes";
import {
  activateBoard,
  listBoards,
  loadActiveBoard,
  loadBoard,
  removeBoard,
  saveBoard,
} from "./boardStore";
import { ImageCache } from "./ImageCache";
import { LoadDiagnostics } from "./LoadDiagnostics";
import { toMessage, type UserMessage } from "./messages";
import {
  forgetDismissedNotices,
  loadDismissedNotices,
  type NoticeId,
  saveDismissedNotice,
} from "./noticeStore";
import { PlanningModel } from "./PlanningModel";

export type {
  BoardSummary,
  DragState,
  DragTransitions,
  DropTarget,
  HostBoardAnswer,
  IssueDrop,
  PinEditor,
  SyncProblem,
  TeamNotice,
  TeamState,
  TransitionChoice,
  TransitionSelection,
  WriteNotice,
} from "./BoardTypes";

export interface BoardModelOptions {
  readonly loadDiagnostics?: LoadDiagnostics;
  readonly now?: () => Date;
  readonly audit?: AuditLog;
}

/** Board du site connecté : configuration, synchronisation et gestes de l’utilisateur. */
export class BoardModel {
  /** Ouvre le formulaire natif via la page Jira hôte ; sans adaptateur, le déplacement est refusé. */
  nativeTransitionHandler: ((key: string, transition: JiraTransition) => boolean) | null = null;
  /** Fiche Jira native ouverte depuis le vivier du planning. */
  nativeIssueHandler: ((key: string) => void) | null = null;
  /**
   * Page Jira hôte : un autre board s'ouvre en changeant de page (`leaving`), pour que l'adresse
   * et le board Jira derrière la vue suivent. `current` : c'est déjà le board de la page.
   * `unreachable` : aucune adresse constructible, le board s'affiche sur place.
   */
  hostBoardNavigator:
    | ((board: Pick<BoardConfiguration, "boardId" | "projectKeys">) => HostBoardAnswer)
    | null = null;
  readonly nativeTransitionPending = signal(false);
  readonly site: JiraSite;

  /** Faux tant que la configuration enregistrée n'a pas été relue. */
  readonly loaded = signal(false);
  readonly configuration = signal<BoardConfiguration | null>(null);
  /** Saisie d'une adresse de board, affichée aussi quand un board est déjà configuré. */
  readonly editingBoard = signal(false);
  readonly setupBusy = signal(false);
  readonly setupError = signal<UserMessage | null>(null);
  /** Réglages d'équipe publiés dans Jira pour le board affiché. */
  readonly team = signal<TeamState>({ kind: "unknown" });
  /** Écritures des réglages partagés en cours (elles passent l'une après l'autre). */
  readonly teamSaving = signal(0);
  readonly teamNotice = signal<TeamNotice | null>(null);
  /**
   * Le compte peut-il modifier le board dans Jira (champ `canEdit`) ? `null` : pas encore su, ou
   * Jira ne le dit pas ; les réglages restent alors modifiables et un refus de Jira tranchera.
   */
  readonly canEditBoard = signal<boolean | null>(null);
  /** Réglages partagés du board modifiables ici : faux seulement si Jira a dit non. */
  readonly canEditSettings = computed(() => this.canEditBoard.value !== false);

  /** Boards enregistrés pour ce site, par ordre de nom (menu des boards). */
  readonly boards = signal<readonly BoardSummary[]>([]);

  readonly snapshot = signal<BoardSnapshot | null>(null);
  readonly syncing = signal(false);
  readonly syncProblem = signal<SyncProblem | null>(null);
  /** Les Goals Atlassian n'ont pas pu être lus : le board s'est rabattu sur le texte du sprint. */
  readonly goalsNotice = signal<string | null>(null);
  /** Lectures partielles des Goals Atlassian. */
  readonly goalsWarnings = signal<readonly string[]>([]);
  /**
   * Bandeaux d'information fermés pour de bon sur ce board. `null` tant qu'ils n'ont pas été relus :
   * les bandeaux fermables restent alors cachés, pour ne pas apparaître une fraction de seconde.
   */
  readonly dismissedNotices = signal<ReadonlySet<NoticeId> | null>(null);

  readonly filters = signal<BoardFilters>(NO_FILTERS);

  /** Position provisoire pendant le déplacement ; aucune mutation du snapshot confirmé. */
  readonly pendingMove = signal<PendingMove | null>(null);
  readonly moveFeedback = signal<{ issueKey: string; kind: "warning" } | null>(null);
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  readonly pendingKeys = signal<ReadonlySet<string>>(new Set());
  readonly writeNotice = signal<WriteNotice | null>(null);
  readonly transitionChoice = signal<TransitionChoice | null>(null);
  readonly dragging = signal<DragState | null>(null);
  readonly dragTransitions = signal<DragTransitions>({ kind: "loading" });
  readonly dropTarget = signal<DropTarget | null>(null);
  /** Swimlane en cours de glisser-déposer (identifiant de bloc). */
  readonly draggingLane = signal<string | null>(null);
  /**
   * Place visée par la swimlane glissée : avant cette swimlane, `null` = en dernier. Absente
   * (`undefined`) quand le dépôt ne changerait rien.
   */
  readonly laneDropTarget = signal<string | null | undefined>(undefined);

  readonly pinEditor = signal<PinEditor | null>(null);
  /** Goals du site, chargés à la première ouverture de la fenêtre d'épinglage. */
  readonly siteGoals = signal<readonly AtlassianGoal[] | null>(null);
  readonly siteGoalsLoading = signal(false);
  readonly siteGoalsError = signal<UserMessage | null>(null);

  /** Filtres rapides définis sur le board Jira, dans l'ordre de Jira. */
  readonly jiraQuickFilters = signal<readonly JiraQuickFilter[]>([]);
  /** Jira évalue le JQL des filtres rapides actifs. */
  readonly applyingQuickFilters = signal(false);

  /** Champs personnalisés de l'instance, proposés comme champs de carte (page Réglages). */
  readonly customFields = signal<readonly JiraField[] | null>(null);
  readonly customFieldsLoading = signal(false);
  readonly customFieldsError = signal<UserMessage | null>(null);

  /** Couleur de fond de chaque carte (clé du ticket → nom de couleur), d'après les règles. */
  readonly cardColors = signal<Readonly<Record<string, string>>>({});
  /** Refus de Jira par règle de couleur (identifiant de règle → message). */
  readonly colorRuleIssues = signal<Readonly<Record<string, string>>>({});
  /** Tickets affichés retenus par chaque règle, à la dernière évaluation. */
  readonly colorRuleCounts = signal<Readonly<Record<string, number>>>({});

  /** L'épinglage exige des Goals Atlassian et une propriété Jira relue. */
  readonly canPinGoals = computed(() => {
    const snapshot = this.snapshot.value;
    const kanban = this.configuration.value?.boardType === "kanban";
    const teamKnown = this.team.value.kind === "none" || this.team.value.kind === "published";
    // Un Goal épinglé supprimé peut empêcher la lecture du board : ses réglages restent éditables
    // pour retirer cet identifiant et rétablir la synchronisation, sans dépendre des tickets.
    if (kanban) return teamKnown && this.canEditSettings.value;
    return (
      snapshot !== null &&
      snapshot.sprint !== null &&
      snapshot.goalsOrigin === "atlassianGoals" &&
      snapshot.pinnedGoalIds !== null
    );
  });

  readonly layout = computed(() => {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    return snapshot && configuration
      ? withPendingMove(
          buildBoardLayout(snapshot, configuration, this.filters.value, {
            showEmptyBuild: this.dragging.value?.lane === null,
            ...(this.dragging.value?.lane ? { showEmptySwimlaneId: this.dragging.value.lane } : {}),
          }),
          this.pendingMove.value,
        )
      : null;
  });

  /** Couleur du badge de chaque parent, sur tous les tickets du sprint (filtres ignorés). */
  readonly parentColors = computed(() => {
    const snapshot = this.snapshot.value;
    return parentColors(snapshot ? allIssues(snapshot) : []);
  });

  /** Sprint Health : comptages sur les tickets du sprint, filtres de la barre appliqués. */
  readonly health = computed(() => {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    return snapshot?.sprint && configuration
      ? sprintHealth(snapshot, configuration, this.filters.value)
      : null;
  });

  readonly options = computed(() => {
    const snapshot = this.snapshot.value;
    return snapshot ? filterOptions(snapshot, this.configuration.value?.boardId) : null;
  });

  /** Swimlanes de haut en bas, filtres ignorés : l'ordre dans lequel on les monte et descend. */
  readonly laneOrder = computed(() => {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    return snapshot && configuration ? laneOrder(snapshot, configuration) : [];
  });

  /** Objectifs du sprint masqués du board, pour pouvoir les réafficher. */
  readonly hiddenGoals = computed((): readonly SprintGoal[] => {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    if (!snapshot || !configuration) return [];
    return snapshot.goals.filter((goal) => isGoalHidden(configuration, goal.id));
  });

  readonly images: ImageCache;
  readonly audit: AuditLog;
  readonly loadDiagnostics: LoadDiagnostics;
  readonly planning: PlanningModel;
  readonly jql: JqlService;

  readonly #platform: Platform;
  readonly #client: JiraClient;
  readonly #goals: GoalsClient;
  readonly #now: () => Date;
  readonly #settings: BoardSettingsService;
  readonly #loading: BoardLoadingService;
  readonly #movements: BoardMovementService;
  #generation = 0;
  #disposed = false;
  /** Enregistrements locaux enchaînés : le dernier demandé est le dernier écrit. */
  #saveQueue: Promise<unknown> = Promise.resolve();
  /** Board dont les filtres rapides ont été lus. */
  #quickFiltersBoardId: number | null = null;
  #quickFilterRun = 0;
  #autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
  /** Derniers tickets retenus par règle, pour colorer sans attendre la réévaluation. */
  #colorMatches: Record<string, ReadonlySet<string>> = {};
  #colorRun = 0;
  constructor(site: JiraSite, platform: Platform, options: BoardModelOptions = {}) {
    this.site = site;
    this.#platform = platform;
    this.#now = options.now ?? (() => new Date());
    this.audit = options.audit ?? new AuditLog(platform.store);
    this.loadDiagnostics = options.loadDiagnostics ?? new LoadDiagnostics(platform);
    const transport = new JiraTransport({
      site,
      fetch: platform.fetch,
      observeRead: (kind) =>
        this.#disposed ? undefined : this.loadDiagnostics.observeTransport(kind),
    });
    this.#client = new JiraClient(transport);
    this.jql = new JqlService(this.#client);
    this.planning = new PlanningModel(this.#client, transport, platform, {
      configuration: () => this.configuration.value,
      canWrite: () =>
        this.pendingKeys.value.size === 0 &&
        this.teamSaving.value === 0 &&
        !this.setupBusy.value &&
        !this.nativeTransitionPending.value &&
        this.transitionChoice.value === null,
      accountId: () => this.snapshot.value?.currentUser?.accountId ?? null,
      openIssue: (key) => this.nativeIssueHandler?.(key),
      audit: this.audit,
    });
    this.#goals = new GoalsClient(transport);
    this.images = new ImageCache((url) => transport.fetchImage(url));
    const scope = { generation: () => this.#generation, disposed: () => this.#disposed };
    this.#settings = new BoardSettingsService(
      this.#client,
      transport,
      {
        configuration: this.configuration,
        pinEditor: this.pinEditor,
        team: this.team,
        teamSaving: this.teamSaving,
        teamNotice: this.teamNotice,
        canEditBoard: this.canEditBoard,
        canEditSettings: this.canEditSettings,
        canPinGoals: this.canPinGoals,
      },
      {
        scope,
        currentUser: () => this.snapshot.value?.currentUser ?? this.#loading.currentUser,
        now: this.#now,
        updatePreferences: (change) => this.#updatePreferences(change),
        record: (entry) => this.#record(entry),
        sync: () => this.sync(),
      },
    );
    this.#loading = new BoardLoadingService(
      this.#client,
      {
        load: (input) => loadAtlassianSprintGoals({ reader: this.#goals, ...input }),
      },
      {
        configuration: this.configuration,
        snapshot: this.snapshot,
        setupBusy: this.setupBusy,
        syncing: this.syncing,
        syncProblem: this.syncProblem,
        goalsNotice: this.goalsNotice,
        goalsWarnings: this.goalsWarnings,
      },
      this.loadDiagnostics,
      {
        scope,
        now: this.#now,
        refreshSettings: () => this.#settings.refresh(),
        prepareFilters: (configuration) => {
          if (
            configuration.boardType === "kanban" &&
            this.filters.value.quickFilters.has("addedAfterStart")
          )
            this.setFilters(this.filters.value);
        },
        updatePreferences: (change) => this.#updatePreferences(change),
        refreshFilters: async (boardId, isStale) => {
          await this.#loadJiraQuickFilters(boardId);
          if (isStale()) return;
          if (this.filters.value.jiraQuickFilterIds.size > 0) await this.#applyJiraQuickFilters();
        },
        refreshColors: () => this.#refreshCardColors(),
      },
    );
    this.#movements = new BoardMovementService(
      this.#client,
      transport,
      this.#goals,
      {
        writeNotice: this.writeNotice,
        nativeTransitionPending: this.nativeTransitionPending,
        transitionChoice: this.transitionChoice,
      },
      {
        now: this.#now,
        record: (entry) => this.#record(entry),
        openNative: (key, transition) => this.nativeTransitionHandler?.(key, transition) ?? false,
        sync: () => this.sync(),
      },
    );
  }

  /** Relit le board enregistré pour ce site et, s'il y en a un, le synchronise. */
  async load(boardAddress?: string): Promise<void> {
    if (boardAddress) {
      this.loaded.value = false;
      try {
        const active = this.loadDiagnostics.current.peek();
        const runId =
          active?.status === "loading" ? active.id : this.loadDiagnostics.begin("opening");
        await this.detect(boardAddress, runId);
      } finally {
        this.loaded.value = true;
      }
      return;
    }
    const configuration = await loadActiveBoard(this.#platform.store, this.site.origin);
    this.configuration.value = configuration;
    void this.#loadDismissedNotices(configuration);
    await this.#refreshBoards();
    this.loaded.value = true;
    this.#restartAutoRefresh();
    if (configuration) await this.sync(this.loadDiagnostics.begin("opening"));
  }

  /**
   * Un changement de board attend la fin des gestes en cours : une écriture dans Jira, un
   * enregistrement d'épinglage ou une lecture de structure appartiennent au board affiché.
   */
  readonly canSwitchBoard = computed(
    () =>
      this.transitionChoice.value === null &&
      !this.nativeTransitionPending.value &&
      this.dragging.value === null &&
      !this.setupBusy.value &&
      this.pendingKeys.value.size === 0 &&
      this.pinEditor.value?.saving !== true &&
      !this.planning.publishing.value &&
      this.planning.saving.value === 0 &&
      this.teamSaving.value === 0,
  );

  /** Affiche un autre board déjà enregistré, avec ses réglages, puis le relit dans Jira. */
  async switchBoard(boardId: number): Promise<void> {
    if (boardId === this.configuration.value?.boardId || !this.canSwitchBoard.value) return;
    const configuration = await loadBoard(this.#platform.store, this.site.origin, boardId);
    if (!configuration) {
      this.writeNotice.value = {
        tone: "error",
        text: "Ce board n'est plus enregistré dans ce navigateur.",
        suggestion: "Ajoutez-le de nouveau par son adresse.",
        issueKey: null,
        sessionLost: false,
      };
      await this.#refreshBoards();
      return;
    }
    await this.#queued(() => activateBoard(this.#platform.store, this.site.origin, boardId));
    if (this.#showBoard(configuration)) await this.sync();
  }

  /**
   * Affiche un board enregistré. Dans une page Jira, c'est elle qui change de board : `false`
   * signifie que la page part, rien n'est à relire ici.
   */
  #showBoard(configuration: BoardConfiguration): boolean {
    const answer = this.hostBoardNavigator?.(configuration);
    if (answer === "leaving") return false;
    this.#enterBoard(configuration);
    if (answer === "unreachable")
      this.writeNotice.value = {
        tone: "warning",
        text: "Ce board s'affiche ici, mais la page Jira derrière reste celle du board précédent.",
        suggestion: "Son adresse Jira n'a pas pu être formée : il n'a pas de clé de projet.",
        issueKey: null,
        sessionLost: false,
      };
    return true;
  }

  /**
   * Retire un board de ce navigateur, avec ses réglages. Rien n'est supprimé dans Jira. Si c'était
   * le board affiché, le premier restant (par ordre de nom) le remplace ; sans board restant,
   * l'adresse d'un board est demandée.
   */
  async removeBoard(boardId: number): Promise<void> {
    if (!this.canSwitchBoard.value) return;
    const shown = this.configuration.value?.boardId === boardId;
    const next = await this.#queued(() =>
      removeBoard(this.#platform.store, this.site.origin, boardId),
    );
    await forgetDismissedNotices(this.#platform.store, this.site.origin, boardId).catch(() => {});
    await this.planning.forgetBoard(boardId).catch(() => {});
    await this.#refreshBoards();
    if (!shown) return;
    const configuration =
      next === null ? null : await loadBoard(this.#platform.store, this.site.origin, next);
    if (configuration) {
      if (this.#showBoard(configuration)) await this.sync();
      return;
    }
    this.#enterBoard(null);
    this.editingBoard.value = true;
  }

  editBoard(): void {
    this.setupError.value = null;
    this.editingBoard.value = true;
  }

  cancelEdit(): void {
    this.setupError.value = null;
    this.editingBoard.value = false;
  }

  /** Recherche les boards Scrum et Kanban accessibles sur le site connecté. */
  searchBoards(name: string) {
    return this.#client.searchBoards(name);
  }

  /** Lit dans Jira la structure du board désigné par son adresse, l'enregistre, le synchronise. */
  async detect(urlText: string, preparedRunId?: string): Promise<void> {
    if (this.#disposed || this.setupBusy.value) return;
    const target = parseBoardUrl(urlText);
    const runId =
      preparedRunId ??
      (this.#loading.running ? this.loadDiagnostics.current.peek()?.id : undefined) ??
      (target?.site.origin === this.site.origin
        ? this.loadDiagnostics.begin("opening")
        : undefined);
    const trace = this.#loading.traceFor(runId);
    this.setupBusy.value = true;
    this.setupError.value = null;
    try {
      const existing = await this.#existingFor(urlText);
      const configuration = await detectBoard(this.#client, urlText, existing, trace);
      this.loadDiagnostics.setContext({
        boardType: configuration.boardType === "kanban" ? "kanban" : "scrum",
      });
      await this.#persist(configuration, { activate: true });
      if (!this.#showBoard(configuration)) {
        this.#loading.finish(runId, "cancelled");
        return;
      }
      await this.#refreshBoards();
    } catch (error) {
      this.setupError.value = toMessage(error);
      this.#loading.finish(runId, "error");
      return;
    } finally {
      this.setupBusy.value = false;
    }
    await this.sync(runId);
  }

  /** Relit colonnes, statuts, types et champs dans Jira, en gardant les réglages locaux. */
  async refreshStructure(): Promise<void> {
    const current = this.configuration.value;
    if (this.#disposed || !current || this.setupBusy.value) return;
    const runId = this.#loading.running
      ? this.loadDiagnostics.current.peek()?.id
      : this.loadDiagnostics.begin("refresh");
    const trace = this.#loading.traceFor(runId);
    this.setupBusy.value = true;
    try {
      const configuration = await refreshBoardStructure(
        this.#client,
        current.boardId,
        current,
        trace,
      );
      await this.#persist(configuration);
      this.configuration.value = configuration;
      await this.#refreshBoards(); // le nom du board a pu changer dans Jira
      this.#quickFiltersBoardId = null; // relus avec la structure
    } catch (error) {
      this.syncProblem.value = { ...toMessage(error), sessionLost: isSessionLost(error) };
      this.#loading.finish(runId, "error");
      return;
    } finally {
      this.setupBusy.value = false;
    }
    await this.sync(runId);
  }

  /**
   * Relit le board dans Jira. Une demande faite pendant une synchronisation en relance une après
   * elle, plutôt que d'en lancer deux en parallèle. Aucune écriture.
   */
  sync(preparedRunId?: string): Promise<void> {
    return this.#loading.sync(preparedRunId);
  }

  /**
   * Filtres rapides du board Jira, lus une fois par board (et à « Relire colonnes et types »).
   * Un board peut n'en avoir aucun, ou l'instance ne pas les exposer : ce n'est pas une erreur,
   * les boutons n'apparaissent simplement pas.
   */
  async #loadJiraQuickFilters(boardId: number): Promise<void> {
    if (this.#quickFiltersBoardId === boardId) return;
    this.#quickFiltersBoardId = boardId;
    try {
      const filters = await this.#client.quickFilters(boardId);
      if (this.configuration.value?.boardId === boardId) this.jiraQuickFilters.value = filters;
    } catch {
      if (this.configuration.value?.boardId === boardId) this.jiraQuickFilters.value = [];
    }
  }

  setFilters(filters: BoardFilters): void {
    this.filters.value =
      this.configuration.value?.boardType === "kanban"
        ? {
            ...filters,
            quickFilters: new Set(
              [...filters.quickFilters].filter((filter) => filter !== "addedAfterStart"),
            ),
          }
        : filters;
  }

  resetFilters(): void {
    this.filters.value = NO_FILTERS;
  }

  setSearch(text: string): void {
    this.filters.value = { ...this.filters.value, searchText: text };
  }

  toggleQuickFilter(quick: QuickFilter): void {
    const next = new Set(this.filters.value.quickFilters);
    if (next.has(quick)) next.delete(quick);
    else next.add(quick);
    this.setFilters({ ...this.filters.value, quickFilters: next });
  }

  /** Active ou désactive un filtre rapide du board Jira. Son JQL est évalué par Jira. */
  async toggleJiraQuickFilter(id: number): Promise<void> {
    const ids = new Set(this.filters.value.jiraQuickFilterIds);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    this.filters.value = { ...this.filters.value, jiraQuickFilterIds: ids };
    await this.#applyJiraQuickFilters();
  }

  /**
   * Demande à Jira les tickets retenus par les filtres rapides actifs. Lecture seule. Un filtre
   * que Jira refuse n'est pas appliqué plutôt que de l'être à moitié, et on le dit.
   */
  async #applyJiraQuickFilters(): Promise<void> {
    const configuration = this.configuration.value;
    const ids = this.filters.value.jiraQuickFilterIds;
    const active = this.jiraQuickFilters.value.filter((filter) => ids.has(filter.id));
    const run = ++this.#quickFilterRun;
    // Seul le dernier calcul compte, et seulement si les filtres actifs n'ont pas changé depuis.
    const current = () =>
      run === this.#quickFilterRun && sameIds(this.filters.value.jiraQuickFilterIds, ids);

    if (!configuration || active.length === 0) {
      this.filters.value = { ...this.filters.value, jiraQuickFilterKeys: null };
      this.applyingQuickFilters.value = false;
      return;
    }
    this.applyingQuickFilters.value = true;
    try {
      const keys = await quickFilterKeys(this.#client, {
        boardId: configuration.boardId,
        boardType: configuration.boardType,
        kanbanSubQuery: configuration.kanbanSubQuery,
        filters: active,
        sprintIds: this.snapshot.value?.activeSprints.map((sprint) => sprint.id) ?? [],
      });
      if (current()) this.filters.value = { ...this.filters.value, jiraQuickFilterKeys: keys };
    } catch (error) {
      if (!current()) return;
      this.filters.value = {
        ...this.filters.value,
        jiraQuickFilterIds: new Set(),
        jiraQuickFilterKeys: null,
      };
      const message = toMessage(error);
      this.writeNotice.value = {
        tone: "error",
        text: `Filtre rapide Jira inapplicable : ${message.text}`,
        suggestion:
          `${message.suggestion ?? ""} Les filtres rapides Jira ont été désactivés.`.trim(),
        sessionLost: isSessionLost(error),
        issueKey: null,
      };
    } finally {
      if (run === this.#quickFilterRun) this.applyingQuickFilters.value = false;
    }
  }

  focusGoal(goalId: string): void {
    this.filters.value = focusGoal(this.filters.value, goalId);
  }

  // ─── Réglages d'affichage (locaux, jamais écrits dans Jira) ───────────────

  toggleLaneCollapsed(block: BoardBlock): Promise<void> {
    return this.#updatePreferences((current) =>
      withBlockCollapsed(current, block, !isBlockCollapsed(current, block)),
    );
  }

  setAllLanesCollapsed(collapsed: boolean): Promise<void> {
    const lanes = this.laneOrder.value;
    return this.#updatePreferences((current) => withAllBlocksCollapsed(current, lanes, collapsed));
  }

  /** Monte (`-1`) ou descend (`+1`) une swimlane d'un cran. */
  moveLane(identifier: string, offset: number): Promise<void> {
    return this.#reorderLanes(shiftBlock(identifier, offset, this.laneOrder.value));
  }

  startLaneDrag(identifier: string): void {
    if (!this.canEditSettings.value || !this.laneOrder.value.includes(identifier)) return;
    batch(() => {
      this.draggingLane.value = identifier;
      this.laneDropTarget.value = undefined;
    });
  }

  /** Place visée pendant le glissé ; ignorée si le dépôt laisserait l'ordre inchangé. */
  setLaneDropTarget(before: string | null): void {
    const dragged = this.draggingLane.value;
    if (dragged === null) return;
    const order = this.laneOrder.value;
    const unchanged = sameOrder(moveBlock(dragged, before, order), order);
    const target = unchanged ? undefined : before;
    if (this.laneDropTarget.value !== target) this.laneDropTarget.value = target;
  }

  endLaneDrag(): void {
    batch(() => {
      this.draggingLane.value = null;
      this.laneDropTarget.value = undefined;
    });
  }

  /** Dépôt d'une swimlane : elle se place juste avant `before` (`null` = en dernier). */
  dropLane(identifier: string, before: string | null): Promise<void> {
    this.endLaneDrag();
    return this.#reorderLanes(moveBlock(identifier, before, this.laneOrder.value));
  }

  #reorderLanes(order: readonly string[]): Promise<void> {
    if (sameOrder(order, this.laneOrder.value)) return Promise.resolve();
    return this.#settings.changeShared((current) => withBlockOrder(current, order));
  }

  setGoalHidden(goalId: string, hidden: boolean): Promise<void> {
    return this.#settings.changeShared((current) => withGoalHidden(current, goalId, hidden));
  }

  setGoalColor(goalId: string, index: number): Promise<void> {
    if (!this.canEditSettings.value) return Promise.resolve();
    const update = this.#settings.changeShared((current) => withGoalColor(current, goalId, index));
    // La couleur change tout de suite à l'écran, sans attendre de relire Jira.
    const snapshot = this.snapshot.value;
    const chosen = this.configuration.value?.goalColorIndex[goalId];
    if (snapshot && chosen !== undefined) {
      this.snapshot.value = {
        ...snapshot,
        goals: snapshot.goals.map((goal) =>
          goal.id === goalId ? { ...goal, color: goalColorName(chosen) } : goal,
        ),
      };
    }
    return update;
  }

  // ─── Glisser-déposer et écritures ─────────────────────────────────────────

  startDrag(issueKey: string, lane: string | null): void {
    if (
      this.pendingKeys.value.size > 0 ||
      this.transitionChoice.value ||
      this.nativeTransitionPending.value
    )
      return;
    const snapshot = this.snapshot.value;
    const issue = snapshot ? findIssue(snapshot, issueKey) : null;
    if (!issue) return;
    const knownStatusId = issue.issue.fields.status.id;
    const drag = { issueKey, lane, knownStatusId };
    this.dragging.value = drag;
    this.dragTransitions.value = { kind: "loading" };
    void this.#client.transitions(issueKey).then(
      (transitions) => {
        if (this.dragging.value === drag) {
          this.dragTransitions.value = { kind: "ready", issueKey, knownStatusId, transitions };
        }
      },
      (error: unknown) => {
        if (this.dragging.value === drag) {
          this.dragTransitions.value = { kind: "error", message: toMessage(error).text };
        }
      },
    );
  }

  /** Possibilités du ticket glissé, propres à chaque colonne et sans écriture. */
  columnDrop(column: { id: string; statusIds: readonly string[] }): {
    kind: "idle" | "same" | "loading" | "error" | "blocked" | "statuses";
    message: string;
    statuses: { id: string; name: string; inJira: boolean }[];
  } {
    const drag = this.dragging.value;
    const snapshot = this.snapshot.value;
    const issue = drag && snapshot ? findIssue(snapshot, drag.issueKey) : null;
    const empty = { message: "", statuses: [] };
    if (!issue || !drag) return { ...empty, kind: "idle" };
    if (drag.knownStatusId !== issue.issue.fields.status.id)
      return {
        ...empty,
        kind: "error",
        message: "Le statut a changé. Recommencez le déplacement.",
      };
    if (issue.columnId === column.id) return { ...empty, kind: "same" };
    const state = this.dragTransitions.value;
    if (state.kind === "loading")
      return { ...empty, kind: "loading", message: "Lecture des transitions…" };
    if (state.kind === "error") return { ...empty, kind: "error", message: state.message };
    if (state.issueKey !== issue.issue.key || state.knownStatusId !== issue.issue.fields.status.id)
      return {
        ...empty,
        kind: "error",
        message: "Le statut a changé. Recommencez le déplacement.",
      };
    const transitions = defaultTransitions(state.transitions);
    const statuses = column.statusIds.flatMap((id) => {
      const first = transitions.find((transition) => transition.to.id === id);
      return first
        ? [
            {
              id,
              name: first.to.name,
              inJira: first.hasScreen === true || blockingRequiredFields(first).length > 0,
            },
          ]
        : [];
    });
    return {
      kind: statuses.length ? "statuses" : "blocked",
      message: "Aucune transition disponible",
      statuses,
    };
  }

  setDropTarget(target: DropTarget | null): void {
    const current = this.dropTarget.value;
    if (
      current?.laneId === target?.laneId &&
      current?.columnId === target?.columnId &&
      current?.beforeKey === target?.beforeKey &&
      current?.statusId === target?.statusId
    ) {
      return;
    }
    this.dropTarget.value = target;
  }

  endDrag(): void {
    batch(() => {
      this.dragging.value = null;
      this.dropTarget.value = null;
      this.dragTransitions.value = { kind: "loading" };
    });
  }

  /**
   * Tout ticket peut rejoindre un objectif. Sans objectif, seul son bloc par défaut est admis :
   * Build ou la swimlane de son type. Un déplacement ne change jamais le type Jira.
   */
  accepts(block: BoardBlock, lane: string | null): boolean {
    if (block.kind === "goal") return true;
    return block.kind === "swimlane" ? block.swimlaneId === lane : lane === null;
  }

  dismissWriteNotice(): void {
    this.writeNotice.value = null;
  }

  /** Résout toute l'intention avant d'écrire : transition, objectif, puis rang. */
  async dropIssue(input: IssueDrop, selection?: TransitionSelection): Promise<void> {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    if (
      !snapshot ||
      !configuration ||
      this.pendingKeys.value.size > 0 ||
      this.transitionChoice.value ||
      this.nativeTransitionPending.value
    )
      return;
    const issue = findIssue(snapshot, input.issueKey);
    if (!issue) return;
    const drag = this.dragging.value;
    const knownStatusId =
      selection?.knownStatusId ??
      (drag?.issueKey === input.issueKey ? drag.knownStatusId : undefined);
    // Une lecture déjà en vol peut modifier le snapshot pendant le geste, même vers la colonne
    // visée : ne pas transformer ce déplacement en simple changement d'objectif ou de rang.
    if (knownStatusId !== undefined && issue.issue.fields.status.id !== knownStatusId) {
      this.writeNotice.value = {
        tone: "warning",
        text: "Le statut du ticket a changé. Recommencez le déplacement.",
        suggestion: "Rien n'a été modifié.",
        sessionLost: false,
        issueKey: input.issueKey,
      };
      return;
    }
    if (!this.accepts(input.block, issue.swimlaneId)) return;
    const column = configuration.columns.find((candidate) => candidate.id === input.columnId);
    if (!column || column.statusIds.length === 0) return;
    const goalTargetId = input.block.kind === "goal" ? input.block.goalId : null;
    if (goalTargetId && !snapshot.goals.some((goal) => goal.id === goalTargetId)) return;
    const plan = resolveDrop({
      currentGoalId: displayedGoalId(configuration, issue.goalId),
      currentColumnId: issue.columnId,
      targetColumnId: column.id,
      goalTarget:
        input.block.kind === "goal"
          ? { kind: "goal", goalId: input.block.goalId }
          : { kind: "build" },
    });
    if (plan.changesColumn && !selection && this.dragging.value?.issueKey === input.issueKey) {
      const state = this.dragTransitions.value;
      if (state.kind !== "ready" || state.issueKey !== input.issueKey) return;
      const targets = input.targetStatusId ? [input.targetStatusId] : column.statusIds;
      const candidates = defaultTransitions(state.transitions).filter((transition) =>
        targets.includes(transition.to.id),
      );
      if (candidates.length === 0) return;
      const chosen = candidates.length === 1 ? candidates[0] : undefined;
      if (chosen) {
        // Garder l'action annoncée au survol, même si Jira réordonne la liste avant le dépôt.
        // La relecture d'écriture vérifiera cet ID et ce statut, sans essayer une autre action.
        selection = { id: chosen.id, knownStatusId: state.knownStatusId };
        input = { ...input, targetStatusId: chosen.to.id };
      }
    }
    // Une zone de statut sans position précise conserve le rang global.
    const rank =
      plan.changesColumn && input.beforeKey === null
        ? { kind: "none" as const }
        : this.#rankFor(input, column.id);
    if (isNoOpDrop(plan) && rank.kind === "none") return;
    const generation = this.#generation;
    this.#clearMoveFeedback();
    this.pendingMove.value = {
      issue,
      block: input.block,
      columnId: input.columnId,
      beforeKey: input.beforeKey,
    };
    this.#setPending(input.issueKey, true);
    this.writeNotice.value = null;
    let finished = false;
    try {
      finished = await this.#movements.execute({
        issue,
        snapshot,
        column,
        drop: input,
        ...(selection ? { selection } : {}),
        plan,
        rank,
      });
    } finally {
      let refreshed = false;
      try {
        if (!this.transitionChoice.value && !this.nativeTransitionPending.value) {
          await this.sync();
          refreshed = true;
        }
      } finally {
        batch(() => {
          this.pendingMove.value = null;
          this.#setPending(input.issueKey, false);
          if (
            generation === this.#generation &&
            !this.transitionChoice.value &&
            !this.nativeTransitionPending.value &&
            !(finished && refreshed && !this.syncProblem.value)
          ) {
            this.moveFeedback.value = {
              issueKey: input.issueKey,
              kind: "warning",
            };
            this.#feedbackTimer = setTimeout(() => this.#clearMoveFeedback(), 4000);
          }
        });
      }
    }
  }

  /** Revalide le choix dans Jira avant de reprendre le déplacement entier. */
  async chooseTransition(transition: JiraTransition): Promise<void> {
    const choice = this.transitionChoice.value;
    const chosen = choice?.available.find((candidate) => candidate.id === transition.id);
    if (!choice || !chosen) return;
    this.transitionChoice.value = null;
    await this.dropIssue(
      { ...choice.drop, targetStatusId: chosen.to.id },
      {
        id: chosen.id,
        knownStatusId: choice.knownStatusId,
      },
    );
  }

  cancelTransitionChoice(): void {
    this.transitionChoice.value = null;
  }

  // ─── Épinglage de Goals au sprint ─────────────────────────────────────────

  openPinEditor(): void {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    const kanban = configuration?.boardType === "kanban";
    const pinned = kanban ? configuration.boardPinnedGoalIds : snapshot?.pinnedGoalIds;
    if (!this.canPinGoals.value || !configuration || pinned == null) return;
    const local = kanban ? null : (snapshot?.localPinnedGoalIds ?? null);
    this.pinEditor.value = {
      sprintId: kanban ? null : (snapshot?.sprint?.id ?? null),
      sprintName: kanban
        ? configuration.boardName
        : (snapshot?.sprint?.name ?? configuration.boardName),
      base: [...pinned],
      // Une sélection gardée localement repart d'ici : l'enregistrer la partage enfin dans Jira.
      selection: [...(local ?? pinned)],
      saving: false,
      notice: null,
      fromLocal: local !== null,
      canKeepLocally: false,
    };
    if (this.siteGoals.value === null) void this.loadSiteGoals();
  }

  /**
   * Garde la sélection refusée par Jira dans ce navigateur seulement. Choix explicite, après un
   * refus de droits : elle n'est partagée avec personne et ne sert que tant que Jira n'a aucune
   * sélection pour ce sprint. Rien n'est écrit dans Jira.
   */
  async keepPinnedLocally(): Promise<void> {
    const editor = this.pinEditor.value;
    if (!editor || editor.saving || !editor.canKeepLocally || editor.sprintId === null) return;
    const sprintId = editor.sprintId;
    this.pinEditor.value = null;
    await this.applySettings((current) => withLocalPins(current, sprintId, editor.selection), {
      resync: true,
    });
  }

  /** Oublie la sélection gardée dans ce navigateur pour le sprint affiché. */
  async forgetLocalPins(): Promise<void> {
    const sprint = this.snapshot.value?.sprint;
    if (!sprint) return;
    await this.#settings.forgetLocalPins(sprint.id);
    await this.sync();
  }

  /** Épingle ou désépingle un Goal dans la fenêtre. Rien n'est écrit avant « Enregistrer ». */
  togglePinned(goalId: string): void {
    const editor = this.pinEditor.value;
    if (!editor || editor.saving) return;
    const selection = editor.selection.includes(goalId)
      ? editor.selection.filter((id) => id !== goalId)
      : [...editor.selection, goalId];
    this.pinEditor.value = { ...editor, selection };
  }

  closePinEditor(): void {
    if (this.pinEditor.value?.saving) return;
    this.pinEditor.value = null;
  }

  /** Lit les Goals du site. Le filtrage se fait ensuite localement, sans requête par frappe. */
  async loadSiteGoals(): Promise<void> {
    if (this.siteGoalsLoading.value) return;
    this.siteGoalsLoading.value = true;
    this.siteGoalsError.value = null;
    try {
      this.siteGoals.value = await this.#goals.searchGoals({ limit: 100, loadAll: true });
    } catch (error) {
      this.siteGoalsError.value = toMessage(error);
    } finally {
      this.siteGoalsLoading.value = false;
    }
  }

  /**
   * Enregistre la sélection dans la propriété du sprint : UNE écriture, sur geste explicite. La
   * fenêtre ne se ferme qu'une fois Jira d'accord ; le board est relu dans tous les cas.
   */
  savePinnedGoals(): Promise<void> {
    return this.#settings.savePinnedGoals();
  }

  /** Rang à écrire : devant la carte visée, ou à la fin de la case. Rien si la place ne change pas. */
  #rankFor(
    input: { issueKey: string; block: BoardBlock; beforeKey: string | null },
    columnId: string,
  ): RankChange {
    const lane = this.layout.value?.lanes.find(
      (candidate) => candidate.id === blockIdentifier(input.block),
    );
    const cell = lane?.cells.find((candidate) => candidate.column.id === columnId);
    const keys = (cell?.issues ?? []).map((issue) => issue.issue.key);
    // Une carte venue d'ailleurs est comptée à la fin : la déposer en bas n'écrit rien.
    const ordered = keys.includes(input.issueKey) ? keys : [...keys, input.issueKey];
    return planRank(input.issueKey, ordered, input.beforeKey);
  }

  // ─── Réglages d'équipe (propriété du board) ───────────────────────────────
  //
  // Depuis 0.22.0 (demande de Denis du 24/09/2026), plus de publication manuelle : la version de
  // Jira est appliquée à chaque lecture du board, et chaque modification d'un réglage partagé par
  // l'utilisateur est écrite aussitôt (UNE écriture, sur la version la plus récente relue juste
  // avant). Ce que l'extension change seule (couleur d'un nouvel objectif…) n'est jamais écrit :
  // cela part avec la prochaine modification faite par quelqu'un.

  /**
   * Modification faite par l'utilisateur : appliquée à l'écran et dans ce navigateur, puis, si elle
   * touche un réglage partagé, écrite dans la propriété du board. Refusée d'emblée si Jira a dit
   * que le compte ne peut pas modifier le board.
   */
  dismissTeamNotice(): void {
    this.teamNotice.value = null;
  }

  async #record(entry: Omit<AuditEntry, "at" | "site">): Promise<void> {
    try {
      await this.audit.append({ ...entry, at: this.#now().toISOString(), site: this.site.origin });
    } catch {
      // Le journal est une aide au diagnostic : son échec n'arrête pas le board.
    }
  }

  #setPending(issueKey: string, pending: boolean): void {
    const next = new Set(this.pendingKeys.value);
    if (pending) next.add(issueKey);
    else next.delete(issueKey);
    this.pendingKeys.value = next;
  }

  #clearMoveFeedback(): void {
    if (this.#feedbackTimer !== null) clearTimeout(this.#feedbackTimer);
    this.#feedbackTimer = null;
    this.moveFeedback.value = null;
  }

  dispose(): void {
    this.#disposed = true;
    this.planning.dispose();
    this.#loading.cancel();
    this.#clearMoveFeedback();
    this.pendingMove.value = null;
    this.nativeTransitionPending.value = false;
    this.#generation += 1;
    this.#stopAutoRefresh();
    this.images.dispose();
  }

  // ─── Page Réglages (réglages locaux) ──────────────────────────────────────

  /**
   * Applique un réglage de la page Réglages. `resync` : le board est relu dans Jira, quand le
   * réglage change ce qu'il faut lire ou comment le répartir (types, source, champs des cartes).
   */
  async applySettings(
    change: (configuration: BoardConfiguration) => BoardConfiguration,
    options: { resync: boolean },
  ): Promise<void> {
    await this.#settings.changeShared(change);
    this.#restartAutoRefresh();
    if (options.resync) await this.sync();
  }

  /** Valide le texte courant avant toute publication ; un refus conserve les règles actives. */
  async applyColorRules(rules: readonly CardColorRule[]): Promise<boolean> {
    const configuration = this.configuration.value;
    const generation = this.#generation;
    if (!configuration || !this.canEditSettings.value) return false;
    const errors = await this.#validateJqlRules(rules.filter((rule) => rule.kind === null));
    if (this.#disposed || generation !== this.#generation) return false;
    if (Object.keys(errors).length > 0) {
      this.colorRuleIssues.value = errors;
      return false;
    }
    const confirmed = await this.#settings.changeSharedConfirmed(
      (current) => ({
        ...current,
        cardColorRules: rules.map((rule) => ({
          ...rule,
          name: rule.name.trim(),
          jql: rule.jql.trim(),
        })),
      }),
      (base, latest) =>
        JSON.stringify(base.cardColorRules) === JSON.stringify(latest.cardColorRules),
      configuration,
    );
    if (confirmed && generation === this.#generation) await this.sync();
    return confirmed;
  }

  async #validateJqlRules(
    rules: readonly { id: string; jql?: string; enabled?: boolean }[],
  ): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};
    const validated = new Map<string, Awaited<ReturnType<JqlService["validate"]>>>();
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      const text = rule.jql ?? "";
      const result = validated.get(text) ?? (await this.jql.validate(text));
      validated.set(text, result);
      if (result.status !== "valid")
        errors[rule.id] = result.errors.join(" ") || "JQL non vérifié par Jira.";
    }
    return errors;
  }

  /** Couleurs évaluées par Jira, sans effet sur le classement des cartes. */
  async #refreshCardColors(): Promise<void> {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    const run = ++this.#colorRun;
    if (
      !snapshot ||
      !configuration ||
      (configuration.boardType !== "kanban" && snapshot.activeSprints.length === 0)
    ) {
      this.cardColors.value = {};
      return;
    }
    const rules = colorRules(configuration);
    const added = new Set(
      allIssues(snapshot)
        .filter((issue) => issue.addedAfterSprintStart === true)
        .map((issue) => issue.issue.key),
    );
    this.cardColors.value = resolveCardColors(rules, this.#colorMatches, added);
    const evaluation = await evaluateBoardCardColors(this.jql, configuration, snapshot);
    if (
      this.#disposed ||
      run !== this.#colorRun ||
      this.snapshot.value !== snapshot ||
      this.configuration.value?.boardId !== configuration.boardId ||
      JSON.stringify(colorRules(this.configuration.value)) !== JSON.stringify(rules)
    )
      return;
    this.#colorMatches = evaluation.matches;
    batch(() => {
      this.cardColors.value = evaluation.colors;
      this.colorRuleCounts.value = evaluation.counts;
      this.colorRuleIssues.value = evaluation.errors;
    });
  }

  /** Lit la liste des champs de l'instance, pour choisir un champ personnalisé de carte. */
  async loadCustomFields(): Promise<void> {
    if (this.customFieldsLoading.value) return;
    this.customFieldsLoading.value = true;
    this.customFieldsError.value = null;
    try {
      this.customFields.value = customFieldChoices(await this.#client.fields());
    } catch (error) {
      this.customFieldsError.value = toMessage(error);
    } finally {
      this.customFieldsLoading.value = false;
    }
  }

  /**
   * Rafraîchissement automatique (lecture seule), réglé par board. Il saute son tour pendant un
   * geste en cours — glisser-déposer, écriture, épinglage — pour ne rien bouger sous le curseur.
   */
  #restartAutoRefresh(): void {
    this.#stopAutoRefresh();
    const seconds = this.configuration.value?.autoRefreshSeconds ?? null;
    if (seconds === null) return;
    this.#autoRefreshTimer = setInterval(() => {
      const busy =
        this.planning.publishing.value ||
        this.transitionChoice.value !== null ||
        this.nativeTransitionPending.value ||
        this.dragging.value !== null ||
        this.draggingLane.value !== null ||
        this.pendingKeys.value.size > 0 ||
        this.pinEditor.value?.saving === true;
      if (!busy) void this.sync();
    }, seconds * 1000);
  }

  #stopAutoRefresh(): void {
    if (this.#autoRefreshTimer !== null) clearInterval(this.#autoRefreshTimer);
    this.#autoRefreshTimer = null;
  }

  /**
   * Enregistre une configuration. Seuls l'ajout et le changement de board en font le board actif :
   * un réglage enregistré après un changement de board ne ramène pas l'ancien.
   */
  #persist(
    configuration: BoardConfiguration,
    options: { activate: boolean } = { activate: false },
  ): Promise<void> {
    return this.#queued(() => saveBoard(this.#platform.store, configuration, options));
  }

  /** Écritures locales enchaînées : la dernière demandée est la dernière faite. */
  #queued<T>(write: () => Promise<T>): Promise<T> {
    const next = this.#saveQueue.then(write);
    this.#saveQueue = next.catch(() => {});
    return next;
  }

  async #refreshBoards(): Promise<void> {
    const boards = await listBoards(this.#platform.store, this.site.origin);
    this.boards.value = boards.map((board) => ({
      boardId: board.boardId,
      boardName: board.boardName,
      projectKeys: board.projectKeys,
    }));
  }

  /**
   * Ferme un bandeau d'information pour de bon sur ce board. Il disparaît tout de suite ; si le
   * navigateur refuse de l'enregistrer, il reste fermé jusqu'au prochain rechargement.
   */
  async dismissNotice(id: NoticeId): Promise<void> {
    const configuration = this.configuration.value;
    if (!configuration) return;
    this.dismissedNotices.value = new Set([...(this.dismissedNotices.value ?? []), id]);
    await saveDismissedNotice(
      this.#platform.store,
      this.site.origin,
      configuration.boardId,
      id,
    ).catch(() => {});
  }

  /** Relit les bandeaux fermés du board affiché ; un résultat arrivé après un changement est jeté. */
  async #loadDismissedNotices(configuration: BoardConfiguration | null): Promise<void> {
    if (!configuration) return;
    const generation = this.#generation;
    const dismissed = await loadDismissedNotices(
      this.#platform.store,
      this.site.origin,
      configuration.boardId,
    ).catch(() => new Set<NoticeId>());
    if (generation !== this.#generation) return;
    this.dismissedNotices.value = dismissed;
  }

  /**
   * Affiche un board (ou aucun) : tout ce qui appartenait au board précédent est oublié. Une
   * synchronisation encore en cours appartient à l'ancien board : son résultat sera ignoré.
   */
  #enterBoard(configuration: BoardConfiguration | null): void {
    this.planning.reset();
    this.#clearMoveFeedback();
    this.pendingMove.value = null;
    this.nativeTransitionPending.value = false;
    this.#generation += 1;
    batch(() => {
      this.configuration.value = configuration;
      this.snapshot.value = null;
      this.filters.value = NO_FILTERS;
      this.jiraQuickFilters.value = [];
      this.cardColors.value = {};
      this.colorRuleIssues.value = {};
      this.colorRuleCounts.value = {};
      this.syncProblem.value = null;
      this.goalsNotice.value = null;
      this.goalsWarnings.value = [];
      this.writeNotice.value = null;
      this.transitionChoice.value = null;
      this.nativeTransitionPending.value = false;
      this.dragging.value = null;
      this.dropTarget.value = null;
      this.draggingLane.value = null;
      this.laneDropTarget.value = undefined;
      this.pinEditor.value = null;
      this.editingBoard.value = false;
      this.team.value = { kind: "unknown" };
      this.teamNotice.value = null;
      this.canEditBoard.value = null;
      this.dismissedNotices.value = null;
    });
    void this.#loadDismissedNotices(configuration);
    this.#settings.resetBoard();
    this.#colorMatches = {};
    this.#colorRun += 1;
    this.#quickFiltersBoardId = null;
    this.#restartAutoRefresh();
  }

  /**
   * Applique un réglage local : à l'écran tout de suite, puis enregistré dans ce navigateur. Un
   * échec d'enregistrement est dit, sans défaire ce qui est affiché.
   */
  async #updatePreferences(
    change: (configuration: BoardConfiguration) => BoardConfiguration,
  ): Promise<void> {
    const current = this.configuration.value;
    if (!current) return;
    const next = change(current);
    this.configuration.value = next;
    try {
      await this.#persist(next);
    } catch (error) {
      this.writeNotice.value = {
        tone: "warning",
        text: `Réglage appliqué, mais pas enregistré dans ce navigateur (${toMessage(error).text.replace(/\.$/, "")}).`,
        suggestion: "Il sera perdu à la fermeture de l'onglet. Rien n'a été écrit dans Jira.",
        sessionLost: false,
        issueKey: null,
      };
    }
  }

  /** Réglages locaux déjà enregistrés pour ce board, s'il l'a déjà été. */
  async #existingFor(urlText: string): Promise<BoardConfiguration | null> {
    const parsed = parseBoardUrl(urlText);
    return parsed && parsed.site.origin === this.site.origin
      ? loadBoard(this.#platform.store, this.site.origin, parsed.boardId)
      : null;
  }
}

function isSessionLost(error: unknown): boolean {
  return error instanceof JiraError && error.isAuthenticationFailure;
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameIds(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}
