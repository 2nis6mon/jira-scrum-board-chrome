import { batch, computed, signal } from "@preact/signals";
import { loadAtlassianSprintGoals } from "../../core/atlassianGoals";
import { type BoardBlock, blockIdentifier, moveBlock, shiftBlock } from "../../core/boardBlocks";
import {
  type BoardConfiguration,
  displayedGoalId,
  isBlockCollapsed,
  isGoalHidden,
} from "../../core/boardConfiguration";
import { type BoardIssue, type BoardSnapshot, findIssue } from "../../core/boardIssue";
import { buildBoardLayout, filterOptions } from "../../core/boardLayout";
import {
  laneOrder,
  withAllBlocksCollapsed,
  withBlockCollapsed,
  withBlockOrder,
  withGoalColor,
  withGoalHidden,
} from "../../core/boardPreferences";
import { customFieldChoices } from "../../core/boardSettings";
import { detectBoard, loadSnapshot, refreshBoardStructure } from "../../core/boardSync";
import {
  linkToTextGoal,
  type MoveOutcome,
  moveToColumn,
  performTransition,
  pinAtlassianGoals,
  rankIssue,
} from "../../core/boardWrites";
import { isNoOpDrop, planRank, type RankChange, resolveDrop } from "../../core/dropPlan";
import { type BoardFilters, focusGoal, NO_FILTERS, type QuickFilter } from "../../core/filters";
import { quickFilterKeys } from "../../core/jiraQuickFilters";
import { goalColorName, type SprintGoal } from "../../core/sprintGoals";
import { JiraClient, type JiraField, type JiraQuickFilter } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import { GoalsClient } from "../../jira/goals";
import type { AtlassianGoal, JiraTransition, JiraUser } from "../../jira/models";
import { type JiraSite, parseBoardUrl } from "../../jira/site";
import { JiraTransport } from "../../jira/transport";
import type { Platform } from "../platform/types";
import { type AuditEntry, AuditLog } from "./auditLog";
import { loadActiveBoard, loadBoard, saveBoard } from "./boardStore";
import { ImageCache } from "./ImageCache";
import { toMessage, type UserMessage } from "./messages";

export interface SyncProblem extends UserMessage {
  /** La session Jira du navigateur n'est plus reconnue : il faut se reconnecter à Jira. */
  readonly sessionLost: boolean;
}

/** Résultat d'une écriture qui mérite d'être dit : refus, conflit, issue incertaine. */
export interface WriteNotice extends UserMessage {
  readonly tone: "error" | "warning";
  readonly sessionLost: boolean;
  /** Ticket concerné, pour proposer de l'ouvrir dans Jira. */
  readonly issueKey: string | null;
}

/** Aucune transition directe : l'utilisateur choisit parmi ce que Jira autorise. */
export interface TransitionChoice {
  readonly issueKey: string;
  readonly columnName: string;
  readonly available: readonly JiraTransition[];
}

/** Carte en cours de glisser-déposer. */
export interface DragState {
  readonly issueKey: string;
  readonly lane: "scrum" | "run";
}

/** Emplacement visé : une case (swimlane × colonne), devant un ticket ou à la fin. */
export interface DropTarget {
  readonly laneId: string;
  readonly columnId: string;
  readonly beforeKey: string | null;
}

/** Fenêtre de choix des Goals Atlassian épinglés au sprint. */
export interface PinEditor {
  readonly sprintId: number;
  readonly sprintName: string;
  /** Sélection lue dans Jira à l'ouverture : l'écriture est refusée si Jira ne la porte plus. */
  readonly base: readonly string[];
  /** Sélection en cours, dans l'ordre d'épinglage (celui des swimlanes). */
  readonly selection: readonly string[];
  readonly saving: boolean;
  readonly notice: (UserMessage & { readonly tone: "error" | "warning" }) | null;
}

export interface BoardModelOptions {
  readonly now?: () => Date;
  readonly audit?: AuditLog;
}

/** Board du site connecté : configuration locale, photographie Jira, filtres. Lecture seule. */
export class BoardModel {
  readonly site: JiraSite;

  /** Faux tant que la configuration enregistrée n'a pas été relue. */
  readonly loaded = signal(false);
  readonly configuration = signal<BoardConfiguration | null>(null);
  /** Saisie d'une adresse de board, affichée aussi quand un board est déjà configuré. */
  readonly editingBoard = signal(false);
  readonly setupBusy = signal(false);
  readonly setupError = signal<UserMessage | null>(null);

  readonly snapshot = signal<BoardSnapshot | null>(null);
  readonly syncing = signal(false);
  readonly syncProblem = signal<SyncProblem | null>(null);
  /** Les Goals Atlassian n'ont pas pu être lus : le board s'est rabattu sur le texte du sprint. */
  readonly goalsNotice = signal<string | null>(null);
  /** Lectures partielles des Goals Atlassian. */
  readonly goalsWarnings = signal<readonly string[]>([]);

  readonly filters = signal<BoardFilters>(NO_FILTERS);

  /** Tickets dont une écriture est en cours : ils ne bougent pas avant la réponse de Jira. */
  readonly pendingKeys = signal<ReadonlySet<string>>(new Set());
  readonly writeNotice = signal<WriteNotice | null>(null);
  readonly transitionChoice = signal<TransitionChoice | null>(null);
  readonly dragging = signal<DragState | null>(null);
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

  /** L'épinglage n'a de sens qu'en mode Goals Atlassian, sur un sprint dont la propriété est lue. */
  readonly canPinGoals = computed(() => {
    const snapshot = this.snapshot.value;
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
      ? buildBoardLayout(snapshot, configuration, this.filters.value)
      : null;
  });

  readonly options = computed(() => {
    const snapshot = this.snapshot.value;
    return snapshot ? filterOptions(snapshot) : null;
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

  readonly #platform: Platform;
  readonly #client: JiraClient;
  readonly #goals: GoalsClient;
  readonly #transport: JiraTransport;
  readonly #now: () => Date;
  #currentUser: JiraUser | null = null;
  #generation = 0;
  #resyncRequested = false;
  /** Enregistrements locaux enchaînés : le dernier demandé est le dernier écrit. */
  #saveQueue: Promise<unknown> = Promise.resolve();
  /** Board dont les filtres rapides ont été lus. */
  #quickFiltersBoardId: number | null = null;
  #quickFilterRun = 0;
  #autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(site: JiraSite, platform: Platform, options: BoardModelOptions = {}) {
    this.site = site;
    this.#platform = platform;
    this.#now = options.now ?? (() => new Date());
    this.audit = options.audit ?? new AuditLog(platform.store);
    const transport = new JiraTransport({ site, fetch: platform.fetch });
    this.#transport = transport;
    this.#client = new JiraClient(transport);
    this.#goals = new GoalsClient(transport);
    this.images = new ImageCache((url) => transport.fetchImage(url));
  }

  /** Relit le board enregistré pour ce site et, s'il y en a un, le synchronise. */
  async load(): Promise<void> {
    const configuration = await loadActiveBoard(this.#platform.store, this.site.origin);
    this.configuration.value = configuration;
    this.loaded.value = true;
    this.#restartAutoRefresh();
    if (configuration) await this.sync();
  }

  editBoard(): void {
    this.setupError.value = null;
    this.editingBoard.value = true;
  }

  cancelEdit(): void {
    this.setupError.value = null;
    this.editingBoard.value = false;
  }

  /** Lit dans Jira la structure du board désigné par son adresse, l'enregistre, le synchronise. */
  async detect(urlText: string): Promise<void> {
    if (this.setupBusy.value) return;
    this.setupBusy.value = true;
    this.setupError.value = null;
    try {
      const existing = await this.#existingFor(urlText);
      const configuration = await detectBoard(this.#client, urlText, existing);
      await this.#persist(configuration);
      this.#generation += 1; // une synchronisation en cours appartient à l'ancien board
      this.configuration.value = configuration;
      this.snapshot.value = null;
      this.filters.value = NO_FILTERS;
      this.jiraQuickFilters.value = [];
      this.#quickFiltersBoardId = null;
      this.syncProblem.value = null;
      this.pinEditor.value = null;
      this.editingBoard.value = false;
      this.#restartAutoRefresh();
    } catch (error) {
      this.setupError.value = toMessage(error);
      return;
    } finally {
      this.setupBusy.value = false;
    }
    await this.sync();
  }

  /** Relit colonnes, statuts, types et champs dans Jira, en gardant les réglages locaux. */
  async refreshStructure(): Promise<void> {
    const current = this.configuration.value;
    if (!current || this.setupBusy.value) return;
    this.setupBusy.value = true;
    try {
      const configuration = await refreshBoardStructure(this.#client, current.boardId, current);
      await this.#persist(configuration);
      this.configuration.value = configuration;
      this.#quickFiltersBoardId = null; // relus avec la structure
    } catch (error) {
      this.syncProblem.value = { ...toMessage(error), sessionLost: isSessionLost(error) };
      return;
    } finally {
      this.setupBusy.value = false;
    }
    await this.sync();
  }

  /**
   * Relit le board dans Jira. Une demande faite pendant une synchronisation en relance une après
   * elle, plutôt que d'en lancer deux en parallèle. Aucune écriture.
   */
  async sync(): Promise<void> {
    if (!this.configuration.value) return;
    if (this.syncing.value) {
      this.#resyncRequested = true;
      return;
    }
    this.syncing.value = true;
    try {
      do {
        this.#resyncRequested = false;
        await this.#syncOnce();
      } while (this.#resyncRequested);
    } finally {
      this.syncing.value = false;
    }
  }

  async #syncOnce(): Promise<void> {
    const configuration = this.configuration.value;
    if (!configuration) return;
    const generation = this.#generation;
    const isStale = () =>
      generation !== this.#generation ||
      this.configuration.value?.boardId !== configuration.boardId;

    try {
      this.#currentUser ??= await this.#client.myself();
      const result = await loadSnapshot({
        reader: this.#client,
        configuration,
        currentUser: this.#currentUser,
        goalsLoader: {
          load: (input) => loadAtlassianSprintGoals({ reader: this.#goals, ...input }),
        },
        now: this.#now(),
      });
      if (isStale()) return;

      // Couleurs des objectifs : mémorisées localement pour rester stables d'un sprint à l'autre.
      // Une couleur choisie PENDANT la lecture l'emporte sur celle connue à son début.
      const latest = this.configuration.value ?? configuration;
      const colors = { ...result.goalColorIndex, ...latest.goalColorIndex };
      this.snapshot.value = {
        ...result.snapshot,
        goals: result.snapshot.goals.map((goal) => ({
          ...goal,
          color: goalColorName(colors[goal.id] ?? 0),
        })),
      };
      this.goalsNotice.value =
        result.goalsIssue === null
          ? null
          : `Goals Atlassian illisibles : ${result.goalsIssue} Les objectifs affichés sont les lignes du champ « Objectif » du sprint.`;
      this.goalsWarnings.value = result.goalsWarnings;
      this.syncProblem.value = null;

      if (!sameIndex(latest.goalColorIndex, colors)) {
        await this.#updatePreferences((current) => ({ ...current, goalColorIndex: colors }));
      }
    } catch (error) {
      if (isStale()) return;
      const sessionLost = isSessionLost(error);
      if (sessionLost) this.#currentUser = null;
      this.syncProblem.value = { ...toMessage(error), sessionLost };
      return;
    }

    await this.#loadJiraQuickFilters(configuration.boardId);
    if (isStale()) return;
    // Le contenu des sprints a pu changer : les filtres rapides actifs sont réévalués par Jira.
    if (this.filters.value.jiraQuickFilterIds.size > 0) await this.#applyJiraQuickFilters();
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
    this.filters.value = filters;
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
    this.filters.value = { ...this.filters.value, quickFilters: next };
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
    if (!this.laneOrder.value.includes(identifier)) return;
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
    return this.#updatePreferences((current) => withBlockOrder(current, order));
  }

  setGoalHidden(goalId: string, hidden: boolean): Promise<void> {
    return this.#updatePreferences((current) => withGoalHidden(current, goalId, hidden));
  }

  setGoalColor(goalId: string, index: number): Promise<void> {
    const update = this.#updatePreferences((current) => withGoalColor(current, goalId, index));
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

  startDrag(issueKey: string, lane: "scrum" | "run"): void {
    if (this.pendingKeys.value.has(issueKey)) return;
    this.dragging.value = { issueKey, lane };
  }

  setDropTarget(target: DropTarget | null): void {
    const current = this.dropTarget.value;
    if (
      current?.laneId === target?.laneId &&
      current?.columnId === target?.columnId &&
      current?.beforeKey === target?.beforeKey
    ) {
      return;
    }
    this.dropTarget.value = target;
  }

  endDrag(): void {
    batch(() => {
      this.dragging.value = null;
      this.dropTarget.value = null;
    });
  }

  /** Une carte de cette swimlane (Scrum ou RUN) peut-elle être déposée dans ce bloc ? */
  accepts(block: BoardBlock, lane: "scrum" | "run"): boolean {
    return (block.kind === "run") === (lane === "run");
  }

  dismissWriteNotice(): void {
    this.writeNotice.value = null;
  }

  /**
   * Dépôt d'une carte dans une case du board. Jusqu'à trois écritures, dans cet ordre, chacune
   * confirmée par Jira avant la suivante : rattachement à l'objectif du bloc, transition vers la
   * colonne, puis rang. La première qui n'aboutit pas arrête les suivantes. La carte ne bouge
   * qu'à la relecture de Jira qui suit.
   */
  async dropIssue(input: {
    issueKey: string;
    block: BoardBlock;
    columnId: string;
    beforeKey: string | null;
  }): Promise<void> {
    const snapshot = this.snapshot.value;
    const configuration = this.configuration.value;
    if (!snapshot || !configuration || this.pendingKeys.value.has(input.issueKey)) return;

    // Seule une carte du board chargé est acceptée : un texte glissé depuis ailleurs ne peut
    // pas viser un ticket arbitraire.
    const issue = findIssue(snapshot, input.issueKey);
    if (!issue) return;
    const lane = issue.category === "RUN" ? "run" : "scrum";
    if (!this.accepts(input.block, lane)) return;

    const columns = lane === "run" ? configuration.runColumns : configuration.scrumColumns;
    const column = columns.find((candidate) => candidate.id === input.columnId);
    if (!column) return;

    const plan = resolveDrop({
      currentGoalId: displayedGoalId(configuration, issue.goalId),
      currentColumnId: issue.columnId,
      targetColumnId: column.id,
      goalTarget:
        input.block.kind === "goal"
          ? { kind: "goal", goalId: input.block.goalId }
          : input.block.kind === "build"
            ? { kind: "build" }
            : { kind: "unchanged" },
    });
    const rank = this.#rankFor(input, column.id);
    if (isNoOpDrop(plan) && rank.kind === "none") return;

    this.#setPending(input.issueKey, true);
    this.writeNotice.value = null;
    try {
      if (plan.goalChange.kind === "assign") {
        const linked = await this.#assignGoal(issue, snapshot, plan.goalChange.goalId);
        if (!linked) return;
      }
      if (plan.changesColumn) {
        const moved = await this.#moveIssue(issue, column);
        if (!moved) return;
      }
      if (rank.kind !== "none") await this.#rank(issue, rank);
    } finally {
      this.#setPending(input.issueKey, false);
      await this.sync();
    }
  }

  /** Exécute la transition choisie dans la fenêtre de choix. */
  async chooseTransition(transition: JiraTransition): Promise<void> {
    const choice = this.transitionChoice.value;
    if (!choice) return;
    this.transitionChoice.value = null;
    this.#setPending(choice.issueKey, true);
    try {
      await performTransition(this.#transport, choice.issueKey, transition);
      await this.#record({
        action: "transition choisie",
        issueKey: choice.issueKey,
        from: null,
        to: transition.to.name,
        outcome: "réussi",
        detail: `Transition « ${transition.name} »`,
      });
    } catch (error) {
      await this.#fail("transition choisie", choice.issueKey, transition.to.name, error);
    } finally {
      this.#setPending(choice.issueKey, false);
      await this.sync();
    }
  }

  cancelTransitionChoice(): void {
    this.transitionChoice.value = null;
  }

  // ─── Épinglage de Goals au sprint ─────────────────────────────────────────

  openPinEditor(): void {
    const snapshot = this.snapshot.value;
    if (!this.canPinGoals.value || !snapshot?.sprint || snapshot.pinnedGoalIds === null) return;
    this.pinEditor.value = {
      sprintId: snapshot.sprint.id,
      sprintName: snapshot.sprint.name,
      base: [...snapshot.pinnedGoalIds],
      selection: [...snapshot.pinnedGoalIds],
      saving: false,
      notice: null,
    };
    if (this.siteGoals.value === null) void this.loadSiteGoals();
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
  async savePinnedGoals(): Promise<void> {
    const editor = this.pinEditor.value;
    if (!editor || editor.saving) return;
    const saving: PinEditor = { ...editor, saving: true, notice: null };
    this.pinEditor.value = saving;
    // La fenêtre a pu disparaître pendant l'écriture (changement de board) : on ne la rouvre pas.
    const settle = (next: PinEditor | null) => {
      if (this.pinEditor.value === saving) this.pinEditor.value = next;
    };
    const count = editor.selection.length;
    const to = `${count} Goal${count > 1 ? "s" : ""} épinglé${count > 1 ? "s" : ""}`;
    const entry = { action: "épinglage", issueKey: null, from: null, to } as const;
    try {
      const outcome = await pinAtlassianGoals(this.#client, this.#transport, {
        sprintId: editor.sprintId,
        shownGoalIds: editor.base,
        goalIds: editor.selection,
        accountId: this.snapshot.value?.currentUser?.accountId ?? null,
        now: this.#now(),
      });
      switch (outcome.kind) {
        case "pinned":
          settle(null);
          await this.#record({ ...entry, outcome: "réussi", detail: "propriété du sprint" });
          break;
        case "unchanged":
          settle(null);
          break;
        case "conflict":
          // Rien n'est écrasé : la fenêtre repart de ce que Jira porte maintenant.
          settle({
            ...editor,
            base: outcome.current,
            selection: outcome.current,
            notice: {
              tone: "warning",
              text: "Les Goals épinglés ont été modifiés dans Jira pendant votre sélection.",
              suggestion:
                "Rien n'a été écrit. La fenêtre montre maintenant la sélection enregistrée dans Jira : refaites vos changements, puis enregistrez.",
            },
          });
          await this.#record({
            ...entry,
            outcome: "échec",
            detail: "conflit : sélection modifiée dans Jira",
          });
          break;
      }
    } catch (error) {
      const jiraError = error instanceof JiraError ? error : null;
      const uncertain = jiraError?.isOutcomeUnknown ?? false;
      const message = toMessage(error);
      settle({
        ...editor,
        notice: uncertain
          ? {
              tone: "warning",
              text: `Jira n'a pas confirmé l'enregistrement (${message.text.replace(/\.$/, "")}).`,
              suggestion:
                "Il a peut-être eu lieu : le board vient d'être relu. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.",
            }
          : {
              tone: "error",
              text: message.text,
              suggestion:
                jiraError?.info.kind === "forbidden"
                  ? "Épingler un Goal au sprint exige en général la permission Jira de gérer les sprints."
                  : message.suggestion,
            },
      });
      await this.#record({
        ...entry,
        outcome: uncertain ? "incertain" : "échec",
        detail: message.text,
      });
    }
    await this.sync();
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

  async #assignGoal(
    issue: BoardIssue,
    snapshot: BoardSnapshot,
    goalId: string | null,
  ): Promise<boolean> {
    const issueKey = issue.issue.key;
    const title =
      goalId === null
        ? "aucun objectif"
        : (snapshot.goals.find((goal) => goal.id === goalId)?.title ?? goalId);
    if (snapshot.goalsOrigin === "atlassianGoals") {
      return this.#assignAtlassianGoal(issue, goalId, title);
    }
    if (!snapshot.sprint) return false;
    try {
      await linkToTextGoal(this.#client, this.#transport, {
        sprintId: snapshot.sprint.id,
        issueKey,
        goalId,
        goals: snapshot.goals,
        accountId: snapshot.currentUser?.accountId ?? null,
        now: this.#now(),
      });
      await this.#record({
        action: "rattachement",
        issueKey,
        from: null,
        to: title,
        outcome: "réussi",
        detail: "propriété du sprint",
      });
      return true;
    } catch (error) {
      await this.#fail(
        "rattachement",
        issueKey,
        title,
        error,
        "Rattacher un ticket à un objectif du sprint exige en général la permission Jira de gérer les sprints.",
      );
      return false;
    }
  }

  /**
   * Lien NATIF ticket↔Goal Atlassian. L'ancien Goal est détaché d'abord ; si Atlassian refuse ce
   * détachement, on s'arrête là : poursuivre laisserait le ticket rattaché à deux Goals.
   */
  async #assignAtlassianGoal(
    issue: BoardIssue,
    goalId: string | null,
    title: string,
  ): Promise<boolean> {
    const issueKey = issue.issue.key;
    const previous = issue.goalId;
    if (previous === goalId) return true;
    const refused = async (text: string, messages: readonly string[]) => {
      const detail = messages.join(" ") || "aucun détail fourni par Atlassian";
      this.writeNotice.value = {
        tone: "error",
        text,
        suggestion: `${detail}. Rien d'autre n'a été modifié.`,
        sessionLost: false,
        issueKey,
      };
      await this.#record({
        action: "rattachement",
        issueKey,
        from: null,
        to: title,
        outcome: "échec",
        detail,
      });
      return false;
    };
    try {
      if (previous !== null) {
        const removal = await this.#goals.setLink("goal.unlink", previous, issue.issue.id);
        if (!removal.success) {
          return refused(
            "Atlassian a refusé de détacher le ticket de son Goal actuel.",
            removal.messages,
          );
        }
        if (goalId === null) {
          await this.#record({
            action: "rattachement",
            issueKey,
            from: null,
            to: title,
            outcome: "réussi",
            detail: "lien Goal retiré",
          });
          return true;
        }
      }
      if (goalId === null) return true;
      const link = await this.#goals.setLink("goal.link", goalId, issue.issue.id);
      if (!link.success)
        return refused("Atlassian a refusé de rattacher le ticket au Goal.", link.messages);
      await this.#record({
        action: "rattachement",
        issueKey,
        from: null,
        to: title,
        outcome: "réussi",
        detail: "lien Goal Atlassian natif",
      });
      return true;
    } catch (error) {
      await this.#fail("rattachement", issueKey, title, error);
      return false;
    }
  }

  async #moveIssue(
    issue: BoardIssue,
    column: { name: string; statusIds: readonly string[] },
  ): Promise<boolean> {
    const issueKey = issue.issue.key;
    const from = issue.issue.fields.status.name;
    let outcome: MoveOutcome;
    try {
      outcome = await moveToColumn(this.#client, this.#transport, {
        issueKey,
        knownStatusId: issue.issue.fields.status.id,
        targetStatusIds: column.statusIds,
      });
    } catch (error) {
      await this.#fail("transition", issueKey, column.name, error);
      return false;
    }

    switch (outcome.kind) {
      case "moved":
        await this.#record({
          action: "transition",
          issueKey,
          from,
          to: outcome.transition.to.name,
          outcome: "réussi",
          detail: `Transition « ${outcome.transition.name} »`,
        });
        return true;
      case "alreadyThere":
        return true;
      case "conflict":
        this.writeNotice.value = {
          tone: "warning",
          text: `${issueKey} a changé dans Jira : il est maintenant « ${outcome.currentStatus.name} ».`,
          suggestion: "L'affichage a été relu dans Jira. Relancez le déplacement si besoin.",
          sessionLost: false,
          issueKey,
        };
        await this.#record({
          action: "transition",
          issueKey,
          from,
          to: column.name,
          outcome: "échec",
          detail: "conflit : statut modifié dans Jira",
        });
        return false;
      case "requiresFields":
        this.writeNotice.value = {
          tone: "error",
          text: `La transition « ${outcome.transition.name} » de ${issueKey} exige des champs dans Jira : ${outcome.fields.join(", ")}.`,
          suggestion:
            "Faites ce changement dans Jira : l'extension ne remplit volontairement aucun champ de ticket.",
          sessionLost: false,
          issueKey,
        };
        await this.#record({
          action: "transition",
          issueKey,
          from,
          to: column.name,
          outcome: "échec",
          detail: `champs exigés : ${outcome.fields.join(", ")}`,
        });
        return false;
      case "noTransition":
        this.writeNotice.value = {
          tone: "error",
          text: `Jira ne propose aucune transition pour ${issueKey} depuis « ${outcome.currentStatus.name} ».`,
          suggestion: "Rien n'a été modifié.",
          sessionLost: false,
          issueKey,
        };
        await this.#record({
          action: "transition",
          issueKey,
          from,
          to: column.name,
          outcome: "échec",
          detail: "aucune transition proposée",
        });
        return false;
      case "choose":
        // On montre ce que Jira autorise réellement plutôt que de deviner un chemin.
        this.transitionChoice.value = {
          issueKey,
          columnName: column.name,
          available: outcome.available,
        };
        return false;
    }
  }

  async #rank(issue: BoardIssue, change: RankChange): Promise<void> {
    const issueKey = issue.issue.key;
    const to =
      change.kind === "before"
        ? `avant ${change.issueKey}`
        : change.kind === "after"
          ? `après ${change.issueKey}`
          : null;
    try {
      await rankIssue(this.#transport, issueKey, change);
      await this.#record({
        action: "classement",
        issueKey,
        from: null,
        to,
        outcome: "réussi",
        detail: "rang du board Jira",
      });
    } catch (error) {
      await this.#fail(
        "classement",
        issueKey,
        to,
        error,
        "Réordonner un ticket exige la permission Jira « Planifier les tickets ».",
      );
    }
  }

  /** Échec d'une écriture : message, et entrée au journal. Jamais de nouvelle tentative. */
  async #fail(
    action: AuditEntry["action"],
    issueKey: string,
    to: string | null,
    error: unknown,
    forbiddenHint?: string,
  ): Promise<void> {
    const jiraError = error instanceof JiraError ? error : null;
    const uncertain = jiraError?.isOutcomeUnknown ?? false;
    const message = toMessage(error);
    this.writeNotice.value = uncertain
      ? {
          tone: "warning",
          text: `Jira n'a pas confirmé l'écriture sur ${issueKey} (${message.text.replace(/\.$/, "")}).`,
          suggestion:
            "Elle a peut-être eu lieu : l'affichage a été relu dans Jira. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.",
          sessionLost: false,
          issueKey,
        }
      : {
          tone: "error",
          text: message.text,
          suggestion:
            jiraError?.info.kind === "forbidden" && forbiddenHint
              ? forbiddenHint
              : message.suggestion,
          sessionLost: isSessionLost(error),
          issueKey,
        };
    await this.#record({
      action,
      issueKey,
      from: null,
      to,
      outcome: uncertain ? "incertain" : "échec",
      detail: message.text,
    });
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

  dispose(): void {
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
    await this.#updatePreferences(change);
    this.#restartAutoRefresh();
    if (options.resync) await this.sync();
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

  #persist(configuration: BoardConfiguration): Promise<void> {
    const next = this.#saveQueue.then(() => saveBoard(this.#platform.store, configuration));
    this.#saveQueue = next.catch(() => {});
    return next;
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

function sameIndex(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
