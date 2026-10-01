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
import { allIssues, type BoardIssue, type BoardSnapshot, findIssue } from "../../core/boardIssue";
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
import { detectBoard, loadSnapshot, refreshBoardStructure } from "../../core/boardSync";
import {
  linkToTextGoal,
  type MoveOutcome,
  moveToColumn,
  pinAtlassianGoals,
  rankIssue,
} from "../../core/boardWrites";
import {
  type CardColorRule,
  evaluateColorRules,
  resolveCardColors,
  SCOPE_CHANGE_RULE_ID,
} from "../../core/cardColors";
import { isNoOpDrop, planRank, type RankChange, resolveDrop } from "../../core/dropPlan";
import { type BoardFilters, focusGoal, NO_FILTERS, type QuickFilter } from "../../core/filters";
import { quickFilterKeys } from "../../core/jiraQuickFilters";
import { parentColors } from "../../core/parentColors";
import { type PendingMove, withPendingMove } from "../../core/pendingMove";
import { goalColorName, type SprintGoal } from "../../core/sprintGoals";
import { sprintHealth } from "../../core/sprintHealth";
import {
  decodeTeamDocument,
  encodeTeamSettings,
  publishTeamSettings,
  sameTeamSettings,
  type TeamDocument,
  teamDifferences,
  teamSettingsOf,
  withTeamSettings,
} from "../../core/teamSettings";
import { JiraClient, type JiraField, type JiraQuickFilter } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import { GoalsClient } from "../../jira/goals";
import type { JsonObject } from "../../jira/json";
import {
  type AtlassianGoal,
  blockingRequiredFields,
  type JiraTransition,
  type JiraUser,
} from "../../jira/models";
import { type JiraSite, parseBoardUrl } from "../../jira/site";
import { type TransitionDraft, TransitionInputError } from "../../jira/transitionFields";
import { JiraTransport } from "../../jira/transport";
import { BOARD_PROPERTY_KEYS } from "../../jira/writes";
import type { Platform } from "../platform/types";
import { type AuditEntry, AuditLog } from "./auditLog";
import {
  activateBoard,
  listBoards,
  loadActiveBoard,
  loadBoard,
  removeBoard,
  saveBoard,
} from "./boardStore";
import { ImageCache } from "./ImageCache";
import { toMessage, type UserMessage } from "./messages";
import {
  forgetDismissedNotices,
  loadDismissedNotices,
  type NoticeId,
  saveDismissedNotice,
} from "./noticeStore";

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

export interface IssueDrop {
  readonly issueKey: string;
  readonly block: BoardBlock;
  readonly columnId: string;
  readonly beforeKey: string | null;
  readonly targetStatusId?: string;
}

interface TransitionSelection {
  id: string;
  knownStatusId: string;
  draft?: TransitionDraft;
}
export interface TransitionForm {
  readonly drop: IssueDrop;
  readonly transition: JiraTransition;
  readonly knownStatusId: string;
  readonly current: JsonObject;
  readonly draft: TransitionDraft;
  readonly saving: boolean;
  readonly error: UserMessage | null;
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly blocked: boolean;
}

export type DragTransitions =
  | { kind: "loading" }
  | { kind: "ready"; transitions: readonly JiraTransition[] }
  | { kind: "error"; message: string };

/** Choix en attente : aucune écriture du déplacement n'a encore eu lieu. */
export interface TransitionChoice {
  readonly drop: IssueDrop;
  readonly knownStatusId: string;
  readonly issueKey: string;
  readonly columnName: string;
  readonly available: readonly JiraTransition[];
}

/** Carte en cours de glisser-déposer. */
export interface DragState {
  readonly issueKey: string;
  /** Swimlane par type de la carte ; `null` pour une carte par objectif. */
  readonly lane: string | null;
}

/** Emplacement visé : une case (swimlane × colonne), devant un ticket ou à la fin. */
export interface DropTarget {
  readonly statusId?: string;
  readonly laneId: string;
  readonly columnId: string;
  readonly beforeKey: string | null;
}

/** Sélection des Goals épinglés au sprint, ou au board Kanban sans sprint. */
export interface PinEditor {
  readonly sprintId: number | null;
  readonly sprintName: string;
  /** Sélection lue dans Jira à l'ouverture : l'écriture est refusée si Jira ne la porte plus. */
  readonly base: readonly string[];
  /** Sélection en cours, dans l'ordre d'épinglage (celui des swimlanes). */
  readonly selection: readonly string[];
  readonly saving: boolean;
  readonly notice: (UserMessage & { readonly tone: "error" | "warning" }) | null;
  /** La sélection de départ est celle gardée dans ce navigateur, Jira n'en ayant aucune. */
  readonly fromLocal: boolean;
  /** Jira vient de refuser l'enregistrement faute de droits : on peut la garder localement. */
  readonly canKeepLocally: boolean;
}

/** Board enregistré du site, tel que le menu des boards le présente. */
export interface BoardSummary {
  readonly boardId: number;
  readonly boardName: string;
  readonly projectKeys: readonly string[];
}

/** Réglages d'équipe du board, tels que lus dans Jira (propriété du board). */
export type TeamState =
  /** Pas encore lus pour ce board. */
  | { readonly kind: "unknown" }
  /** Personne n'a encore publié de réglages d'équipe pour ce board. */
  | { readonly kind: "none" }
  /** Lecture impossible, ou format inconnu : rien n'est appliqué. */
  | { readonly kind: "unreadable"; readonly message: string }
  | { readonly kind: "published"; readonly document: TeamDocument };

export interface TeamNotice {
  readonly tone: "success" | "warning" | "error";
  readonly text: string;
  readonly suggestion: string | null;
}

export interface BoardModelOptions {
  readonly now?: () => Date;
  readonly audit?: AuditLog;
}

/** Board du site connecté : configuration locale, photographie Jira, filtres. Lecture seule. */
export class BoardModel {
  /** Adaptateur facultatif de la vue hébergée dans Jira ; absent dans l'application autonome. */
  nativeTransitionHandler: ((key: string, transition: JiraTransition) => boolean) | null = null;
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
  #syncTask: Promise<void> | null = null;
  readonly pendingKeys = signal<ReadonlySet<string>>(new Set());
  readonly writeNotice = signal<WriteNotice | null>(null);
  readonly transitionForm = signal<TransitionForm | null>(null);
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
  /** Derniers tickets retenus par règle, pour colorer sans attendre la réévaluation. */
  #colorMatches: Record<string, ReadonlySet<string>> = {};
  #colorRun = 0;
  /** Le prochain relevé des réglages d'équipe les applique sans demander (board tout juste ajouté). */
  /** Droit d'édition du board déjà demandé à Jira pour le board affiché. */
  #canEditAsked = false;
  /** Écritures des réglages partagés, enchaînées ; compteur pour écarter une relecture dépassée. */
  #teamQueue: Promise<void> = Promise.resolve();
  #teamWrites = 0;

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
  async load(boardAddress?: string): Promise<void> {
    if (boardAddress) {
      this.loaded.value = false;
      try {
        await this.detect(boardAddress);
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
    if (configuration) await this.sync();
  }

  /**
   * Un changement de board attend la fin des gestes en cours : une écriture dans Jira, un
   * enregistrement d'épinglage ou une lecture de structure appartiennent au board affiché.
   */
  readonly canSwitchBoard = computed(
    () =>
      this.transitionChoice.value === null &&
      this.transitionForm.value === null &&
      this.dragging.value === null &&
      !this.setupBusy.value &&
      this.pendingKeys.value.size === 0 &&
      this.pinEditor.value?.saving !== true &&
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
    this.#enterBoard(configuration);
    await this.sync();
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
    await this.#refreshBoards();
    if (!shown) return;
    const configuration =
      next === null ? null : await loadBoard(this.#platform.store, this.site.origin, next);
    if (configuration) {
      this.#enterBoard(configuration);
      await this.sync();
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
  async detect(urlText: string): Promise<void> {
    if (this.setupBusy.value) return;
    this.setupBusy.value = true;
    this.setupError.value = null;
    try {
      const existing = await this.#existingFor(urlText);
      const configuration = await detectBoard(this.#client, urlText, existing);
      await this.#persist(configuration, { activate: true });
      this.#enterBoard(configuration);
      await this.#refreshBoards();
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
      await this.#refreshBoards(); // le nom du board a pu changer dans Jira
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
    if (this.#syncTask) {
      this.#resyncRequested = true;
      await this.#syncTask;
      return;
    }
    this.syncing.value = true;
    this.#syncTask = (async () => {
      do {
        this.#resyncRequested = false;
        await this.#syncOnce();
      } while (this.#resyncRequested);
    })();
    try {
      await this.#syncTask;
    } finally {
      this.#syncTask = null;
      this.syncing.value = false;
    }
  }

  async #syncOnce(): Promise<void> {
    // Réglages d'équipe d'abord : une version appliquée sert déjà à cette lecture du board.
    await this.#refreshTeamSettings();
    const configuration = this.configuration.value;
    if (!configuration) return;
    if (
      configuration.boardType === "kanban" &&
      this.filters.value.quickFilters.has("addedAfterStart")
    ) {
      this.setFilters(this.filters.value);
    }
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
      const previous = this.snapshot.value;
      const knownGoalIds = new Set([
        ...Object.keys(latest.goalColorIndex),
        ...(previous?.goals.map((goal) => goal.id) ?? []),
      ]);
      const linkedGoalIds = new Set(
        result.snapshot.goalIssues.flatMap((issue) => (issue.goalId ? [issue.goalId] : [])),
      );
      // À la toute première lecture, les Goals constituent le board initial et restent visibles.
      // Ensuite, un Goal inconnu introduit par un ticket arrive masqué : le ticket reste dans
      // Build jusqu'à ce que l'utilisateur le réaffiche depuis « Goals masqués ».
      const newLinkedGoalIds =
        knownGoalIds.size === 0
          ? []
          : result.snapshot.goals
              .filter((goal) => linkedGoalIds.has(goal.id) && !knownGoalIds.has(goal.id))
              .map((goal) => goal.id);
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

      if (!sameIndex(latest.goalColorIndex, colors) || newLinkedGoalIds.length > 0) {
        await this.#updatePreferences((current) => ({
          ...current,
          goalColorIndex: { ...colors, ...current.goalColorIndex },
          hiddenGoalIds: [...new Set([...current.hiddenGoalIds, ...newLinkedGoalIds])].sort(),
        }));
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
    if (isStale()) return;
    await this.#refreshCardColors();
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
    return this.#changeShared((current) => withBlockOrder(current, order));
  }

  setGoalHidden(goalId: string, hidden: boolean): Promise<void> {
    return this.#changeShared((current) => withGoalHidden(current, goalId, hidden));
  }

  setGoalColor(goalId: string, index: number): Promise<void> {
    if (!this.canEditSettings.value) return Promise.resolve();
    const update = this.#changeShared((current) => withGoalColor(current, goalId, index));
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
    if (this.pendingKeys.value.size > 0 || this.transitionChoice.value || this.transitionForm.value)
      return;
    const snapshot = this.snapshot.value;
    if (!snapshot || !findIssue(snapshot, issueKey)) return;
    const drag = { issueKey, lane };
    this.dragging.value = drag;
    this.dragTransitions.value = { kind: "loading" };
    void this.#client.transitions(issueKey).then(
      (transitions) => {
        if (this.dragging.value === drag) {
          this.dragTransitions.value = { kind: "ready", transitions };
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
    if (!issue) return { ...empty, kind: "idle" };
    if (issue.columnId === column.id) return { ...empty, kind: "same" };
    const state = this.dragTransitions.value;
    if (state.kind === "loading")
      return { ...empty, kind: "loading", message: "Lecture des transitions…" };
    if (state.kind === "error") return { ...empty, kind: "error", message: state.message };
    const transitions = state.transitions.filter(
      (t) => t.isAvailable !== false && column.statusIds.includes(t.to.id),
    );
    const statuses = column.statusIds.flatMap((id) => {
      const candidates = transitions.filter((t) => t.to.id === id);
      const first = candidates[0];
      return first
        ? [
            {
              id,
              name: first.to.name,
              inJira: candidates.every((t) => t.hasScreen || blockingRequiredFields(t).length > 0),
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
    });
  }

  /**
   * Une carte peut-elle être déposée dans ce bloc ? Par objectif : dans un objectif ou Build. D'une
   * swimlane par type : dans la sienne seulement, c'est son type qui la range.
   */
  accepts(block: BoardBlock, lane: string | null): boolean {
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
      (this.transitionForm.value !== null && selection?.draft === undefined)
    )
      return;
    const issue = findIssue(snapshot, input.issueKey);
    if (!issue) return;
    if (selection && issue.issue.fields.status.id !== selection.knownStatusId) {
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
          : input.block.kind === "build"
            ? { kind: "build" }
            : { kind: "unchanged" },
    });
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
    const completed: string[] = [];
    try {
      if (plan.changesColumn) {
        if (input.targetStatusId && !column.statusIds.includes(input.targetStatusId)) return;
        const moved = await this.#moveIssue(issue, column, input, selection);
        if (!moved) return;
        completed.push("statut modifié");
      }
      if (plan.goalChange.kind === "assign") {
        const linked = await this.#assignGoal(issue, snapshot, plan.goalChange.goalId);
        if (!linked) return;
        completed.push("objectif modifié");
      }
      if (rank.kind !== "none") await this.#rank(issue, rank);
      finished = this.writeNotice.peek() === null;
    } finally {
      const notice = this.writeNotice.peek();
      if (notice && completed.length > 0) {
        this.writeNotice.value = {
          ...notice,
          text: `${notice.text} Déjà effectué : ${completed.join(", ")}.`,
          suggestion:
            "Le board est relu pour montrer l'état de Jira. Aucun retour arrière automatique n'est effectué.",
        };
      }
      let refreshed = false;
      try {
        if (!this.transitionChoice.value && !this.transitionForm.value) {
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
            !this.transitionForm.value &&
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
    if (!choice?.available.some((candidate) => candidate.id === transition.id)) return;
    this.transitionChoice.value = null;
    await this.dropIssue(
      { ...choice.drop, targetStatusId: transition.to.id },
      {
        id: transition.id,
        knownStatusId: choice.knownStatusId,
      },
    );
  }

  changeTransitionField(id: string, value: string | string[]): void {
    const form = this.transitionForm.value;
    if (!form || form.saving || form.blocked || !Object.hasOwn(form.transition.fields, id)) return;
    this.transitionForm.value = {
      ...form,
      draft: { ...form.draft, [id]: value },
      fieldErrors: { ...form.fieldErrors, [id]: "" },
    };
  }

  async submitTransitionForm(): Promise<void> {
    const form = this.transitionForm.value;
    if (!form || form.saving || form.blocked || this.pendingKeys.value.size) return;
    this.transitionForm.value = { ...form, saving: true, error: null, fieldErrors: {} };
    try {
      await this.dropIssue(form.drop, {
        id: form.transition.id,
        knownStatusId: form.knownStatusId,
        draft: form.draft,
      });
    } finally {
      const remaining = this.transitionForm.value;
      if (remaining)
        this.transitionForm.value = {
          ...remaining,
          saving: false,
          ...(remaining.error
            ? {}
            : this.writeNotice.value
              ? { error: this.writeNotice.value, blocked: true }
              : {}),
        };
    }
  }

  cancelTransitionForm(): void {
    if (this.transitionForm.value?.saving) return;
    this.transitionForm.value = null;
    this.writeNotice.value = null;
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
    await this.#forgetLocalPins(sprint.id);
    await this.sync();
  }

  async #forgetLocalPins(sprintId: number): Promise<void> {
    if (!this.configuration.value?.localPinnedGoalIds[String(sprintId)]) return;
    await this.#updatePreferences((current) => withLocalPins(current, sprintId, []));
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
    if (editor.sprintId === null) {
      await this.#saveBoardPinnedGoals(editor);
      return;
    }
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
          // Enregistré dans Jira : la copie locale de repli devient inutile.
          await this.#forgetLocalPins(editor.sprintId);
          break;
        case "unchanged":
          settle(null);
          await this.#forgetLocalPins(editor.sprintId);
          break;
        case "conflict":
          // Rien n'est écrasé : la fenêtre repart de ce que Jira porte maintenant.
          settle({
            ...editor,
            base: outcome.current,
            selection: outcome.current,
            canKeepLocally: false,
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
      const forbidden = jiraError?.info.kind === "forbidden";
      settle({
        ...editor,
        canKeepLocally: forbidden,
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
              suggestion: forbidden
                ? "Épingler un Goal au sprint exige en général la permission Jira de gérer les sprints. Vous pouvez garder cette sélection dans ce navigateur, sans la partager."
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

  /** Épinglage Kanban partagé : même file et même propriété que les réglages, sans optimisme. */
  async #saveBoardPinnedGoals(editor: PinEditor): Promise<void> {
    const configuration = this.configuration.value;
    if (configuration?.boardType !== "kanban" || !this.canPinGoals.value) return;
    const generation = this.#generation;
    const stale = () =>
      generation !== this.#generation ||
      this.configuration.value?.boardId !== configuration.boardId;
    const saving: PinEditor = { ...editor, saving: true, notice: null };
    this.pinEditor.value = saving;
    const settle = (next: PinEditor | null) => {
      if (!stale() && this.pinEditor.value === saving) this.pinEditor.value = next;
    };
    const entry = {
      action: "épinglage",
      issueKey: null,
      from: null,
      to: `${editor.selection.length} Goal${editor.selection.length > 1 ? "s" : ""} épinglé${editor.selection.length > 1 ? "s" : ""}`,
    } as const;
    const conflict = async (current: TeamDocument | null) => {
      if (current) {
        this.team.value = { kind: "published", document: current };
        await this.#applyTeamDocument(current);
      } else {
        this.team.value = { kind: "none" };
        await this.#updatePreferences((latest) => ({ ...latest, boardPinnedGoalIds: [] }));
      }
      const ids = current?.settings.boardPinnedGoalIds ?? [];
      settle({
        ...editor,
        base: ids,
        selection: ids,
        canKeepLocally: false,
        notice: {
          tone: "warning",
          text: "Les Goals épinglés ou les réglages du board ont changé dans Jira pendant votre sélection.",
          suggestion:
            "Rien n'a été écrit. La sélection de Jira est affichée : refaites vos changements, puis enregistrez.",
        },
      });
      await this.#record({
        ...entry,
        outcome: "échec",
        detail: "conflit : réglages du board modifiés",
      });
    };
    this.#teamWrites += 1;
    this.teamSaving.value += 1;
    const task = this.#teamQueue.then(async () => {
      if (stale()) return;
      if (!this.canEditSettings.value) {
        settle({
          ...editor,
          notice: {
            tone: "error",
            text: "Il faut pouvoir modifier le board pour y épingler des Goals.",
            suggestion: null,
          },
        });
        return;
      }
      try {
        const raw = await this.#client.boardProperty(
          configuration.boardId,
          BOARD_PROPERTY_KEYS.teamSettings,
        );
        if (stale()) return;
        const current = raw === null ? null : decodeTeamDocument(raw);
        if (raw !== null && !current)
          throw new Error("Les réglages du board sont illisibles : rien n'a été écrit.");
        const currentIds = current?.settings.boardPinnedGoalIds ?? [];
        if (!sameOrder(currentIds, editor.base)) {
          await conflict(current);
          return;
        }
        if (sameOrder(currentIds, editor.selection)) {
          settle(null);
          return;
        }
        const latest = this.configuration.value ?? configuration;
        const base = current ? withTeamSettings(latest, current.settings) : latest;
        const user = this.snapshot.value?.currentUser ?? this.#currentUser;
        const outcome = await publishTeamSettings(
          this.#client,
          {
            write: async (write) => {
              if (stale() || !this.canEditSettings.value)
                throw new Error("Le board ou vos droits ont changé : rien n'a été écrit.");
              return this.#transport.write(write);
            },
          },
          {
            boardId: configuration.boardId,
            settings: teamSettingsOf({ ...base, boardPinnedGoalIds: [...editor.selection] }),
            basePublishedAt: current?.publishedAt ?? null,
            publishedBy: {
              accountId: user?.accountId ?? null,
              displayName: user?.displayName ?? null,
            },
            now: this.#now(),
          },
        );
        if (stale()) return;
        if (outcome.kind === "conflict") {
          await conflict(outcome.current);
          return;
        }
        this.team.value = { kind: "published", document: outcome.document };
        await this.#applyTeamDocument(outcome.document);
        settle(null);
        await this.#record({ ...entry, outcome: "réussi", detail: "propriété du board Kanban" });
      } catch (error) {
        if (stale()) return;
        const jiraError = error instanceof JiraError ? error : null;
        const uncertain = jiraError?.isOutcomeUnknown ?? false;
        const forbidden = jiraError?.info.kind === "forbidden";
        const message = toMessage(error);
        if (forbidden) this.canEditBoard.value = false;
        settle({
          ...editor,
          canKeepLocally: false,
          notice: {
            tone: uncertain ? "warning" : "error",
            text: uncertain
              ? `Jira n'a pas confirmé l'enregistrement (${message.text.replace(/\.$/, "")}).`
              : message.text,
            suggestion: uncertain
              ? "Le board va être relu. Vérifiez sa sélection avant de recommencer ; l'extension ne rejoue jamais une écriture."
              : forbidden
                ? "Il faut pouvoir modifier le board pour y épingler des Goals."
                : message.suggestion,
          },
        });
        await this.#record({
          ...entry,
          outcome: uncertain ? "incertain" : "échec",
          detail: message.text,
        });
      }
    });
    this.#teamQueue = task.catch(() => {});
    try {
      await task;
    } finally {
      this.teamSaving.value -= 1;
    }
    if (!stale()) await this.sync();
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
    let detached = false;
    const refused = async (text: string, messages: readonly string[]) => {
      const detail = messages.join(" ") || "aucun détail fourni par Atlassian";
      this.writeNotice.value = {
        tone: "error",
        text: detached ? `${text} Le lien avec l’ancien Goal a déjà été retiré.` : text,
        suggestion: `${detail}. Vérifiez le board après sa relecture.`,
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
        detached = true;
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
      const notice = this.writeNotice.peek();
      if (detached && notice) {
        this.writeNotice.value = {
          ...notice,
          text: `${notice.text} Le lien avec l’ancien Goal a déjà été retiré.`,
        };
      }
      return false;
    }
  }

  async #moveIssue(
    issue: BoardIssue,
    column: { name: string; statusIds: readonly string[] },
    drop: IssueDrop,
    selection?: TransitionSelection,
  ): Promise<boolean> {
    const generation = this.#generation;
    const issueKey = issue.issue.key;
    const from = issue.issue.fields.status.name;
    let outcome: MoveOutcome;
    try {
      outcome = await moveToColumn(this.#client, this.#transport, {
        issueKey,
        knownStatusId: selection?.knownStatusId ?? issue.issue.fields.status.id,
        targetStatusIds: drop.targetStatusId ? [drop.targetStatusId] : column.statusIds,
        ...(selection
          ? { transitionId: selection.id, ...(selection.draft ? { draft: selection.draft } : {}) }
          : {}),
      });
    } catch (error) {
      const form = this.transitionForm.peek();
      if (form) {
        const fieldErrors =
          error instanceof TransitionInputError
            ? error.fields
            : error instanceof JiraError && error.info.kind === "badRequest"
              ? error.info.fieldErrors
              : {};
        const blocked = !(
          error instanceof TransitionInputError ||
          (error instanceof JiraError && error.info.kind === "badRequest")
        );
        this.transitionForm.value = { ...form, error: toMessage(error), fieldErrors, blocked };
        if (blocked) await this.sync();
      }
      await this.#fail("transition", issueKey, column.name, error);
      return false;
    }

    switch (outcome.kind) {
      case "moved":
        this.transitionForm.value = null;
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
        if (this.transitionForm.value) await this.sync();
        return false;
      case "requiresFields": {
        if (this.nativeTransitionHandler?.(issueKey, outcome.transition)) {
          this.nativeTransitionPending.value = true;
          this.writeNotice.value = {
            tone: "warning",
            text: `Complétez « ${outcome.transition.name} » dans Jira pour ${issueKey}.`,
            suggestion: "Le board sera actualisé à la fermeture du ticket.",
            sessionLost: false,
            issueKey,
          };
          return false;
        }
        let current: JsonObject = {};
        let error: UserMessage | null = null;
        try {
          current = await this.#client.issueFields(
            issueKey,
            Object.keys(outcome.transition.fields),
          );
        } catch (reason) {
          error = toMessage(reason);
        }
        if (generation !== this.#generation) return false;
        this.transitionForm.value = {
          drop,
          transition: outcome.transition,
          knownStatusId: issue.issue.fields.status.id,
          current,
          draft: {},
          saving: false,
          error,
          fieldErrors: {},
          blocked: error !== null,
        };
        return false;
      }
      case "noTransition":
        this.writeNotice.value = {
          tone: "error",
          text: `Aucune transition disponible vers « ${column.name} » pour ${issueKey} depuis « ${outcome.currentStatus.name} ».`,
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
        // Le choix porte uniquement sur les transitions vers la destination demandée.
        this.transitionChoice.value = {
          drop,
          knownStatusId: selection?.knownStatusId ?? issue.issue.fields.status.id,
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
  async #changeShared(
    change: (configuration: BoardConfiguration) => BoardConfiguration,
  ): Promise<void> {
    const before = this.configuration.value;
    if (!before) return;
    const shared = !sameTeamSettings(before, change(before));
    if (shared && !this.canEditSettings.value) return;
    await this.#updatePreferences(change);
    if (!shared) return;
    this.#teamWrites += 1;
    this.teamSaving.value += 1;
    const task = this.#teamQueue.then(() => this.#saveShared(change));
    this.#teamQueue = task.catch(() => {});
    try {
      await task;
    } finally {
      this.teamSaving.value -= 1;
    }
  }

  /** Écrit une modification des réglages partagés sur la version relue dans Jira. */
  async #saveShared(change: (configuration: BoardConfiguration) => BoardConfiguration) {
    const configuration = this.configuration.value;
    if (!configuration) return;
    const boardId = configuration.boardId;
    const stale = () => this.configuration.value?.boardId !== boardId;
    const user = this.snapshot.value?.currentUser ?? this.#currentUser;
    const entry = {
      action: "réglages d'équipe",
      issueKey: null,
      from: null,
      to: "enregistrement",
    } as const;
    this.teamNotice.value = null;
    try {
      const raw = await this.#client.boardProperty(boardId, BOARD_PROPERTY_KEYS.teamSettings);
      if (stale()) return;
      const current = raw === null ? null : decodeTeamDocument(raw);
      if (raw !== null && !current) {
        this.teamNotice.value = {
          tone: "error",
          text: "Réglage non enregistré dans Jira : les réglages du board y sont dans un format inconnu.",
          suggestion:
            "Ils ne sont jamais écrasés. Une version plus récente de l'extension les a peut-être écrits.",
        };
        return;
      }
      // La modification est rejouée sur la version la plus récente : celles des autres sont gardées.
      const next = current
        ? change(withTeamSettings(configuration, current.settings))
        : configuration;
      const outcome = await publishTeamSettings(this.#client, this.#transport, {
        boardId,
        settings: teamSettingsOf(next),
        basePublishedAt: current?.publishedAt ?? null,
        publishedBy: {
          accountId: user?.accountId ?? null,
          displayName: user?.displayName ?? null,
        },
        now: this.#now(),
      });
      if (stale()) return;
      if (outcome.kind === "published") {
        this.team.value = { kind: "published", document: outcome.document };
        await this.#applyTeamDocument(outcome.document);
        const changes = current ? teamDifferences(next, current.settings) : [];
        await this.#record({
          ...entry,
          outcome: "réussi",
          detail: changes.length > 0 ? changes.join(" ; ") : "réglages du board",
        });
      } else {
        if (outcome.current) {
          this.team.value = { kind: "published", document: outcome.current };
          await this.#applyTeamDocument(outcome.current);
        } else {
          await this.#refreshTeamSettings({ force: true });
        }
        const who = outcome.current?.publishedBy.displayName ?? "Quelqu'un";
        this.teamNotice.value = {
          tone: "warning",
          text: `Réglage non enregistré : ${who} a modifié les réglages du board au même moment.`,
          suggestion: "Ses réglages sont maintenant affichés ; refaites votre modification.",
        };
        await this.#record({ ...entry, outcome: "échec", detail: "modifiés au même moment" });
      }
    } catch (error) {
      if (stale()) return;
      const jiraError = error instanceof JiraError ? error : null;
      const uncertain = jiraError?.isOutcomeUnknown ?? false;
      const forbidden = jiraError?.info.kind === "forbidden";
      const message = toMessage(error);
      if (forbidden) this.canEditBoard.value = false;
      this.teamNotice.value = forbidden
        ? {
            tone: "error",
            text: "Jira a refusé d'enregistrer ce réglage : il faut pouvoir modifier le board.",
            suggestion:
              "Les réglages du board sont maintenant en lecture seule ici ; ceux de l'équipe vont être rechargés.",
          }
        : uncertain
          ? {
              tone: "warning",
              text: `Jira n'a pas confirmé l'enregistrement du réglage (${message.text.replace(/\.$/, "")}).`,
              suggestion:
                "Les réglages du board vont être relus. L'extension ne rejoue jamais une écriture.",
            }
          : {
              tone: "error",
              text: `Réglage non enregistré dans Jira (${message.text.replace(/\.$/, "")}).`,
              suggestion: "Il sera remplacé par les réglages du board au prochain chargement.",
            };
      await this.#record({
        ...entry,
        outcome: uncertain ? "incertain" : "échec",
        detail: message.text,
      });
      if (forbidden || uncertain) await this.#refreshTeamSettings({ force: true });
    }
  }

  /**
   * Relit les réglages d'équipe du board et applique la version de Jira : elle fait foi à chaque
   * chargement. Une lecture commencée avant une écriture de réglage est écartée (elle la
   * défairait). Demande aussi, une fois par board, si le compte peut le modifier.
   */
  async #refreshTeamSettings(options: { force?: boolean } = {}): Promise<void> {
    const configuration = this.configuration.value;
    if (!configuration) return;
    void this.#askCanEdit(configuration);
    const generation = this.#generation;
    const writes = this.#teamWrites;
    const stale = () =>
      generation !== this.#generation ||
      this.configuration.value?.boardId !== configuration.boardId ||
      (!options.force && (writes !== this.#teamWrites || this.teamSaving.value > 0));
    let raw: unknown;
    try {
      raw = await this.#client.boardProperty(
        configuration.boardId,
        BOARD_PROPERTY_KEYS.teamSettings,
      );
    } catch (error) {
      if (!stale()) this.team.value = { kind: "unreadable", message: toMessage(error).text };
      return;
    }
    if (stale()) return;
    if (raw === null) {
      this.team.value = { kind: "none" };
      if (configuration.boardType === "kanban" && configuration.boardPinnedGoalIds.length > 0) {
        await this.#updatePreferences((current) => ({ ...current, boardPinnedGoalIds: [] }));
      }
      return;
    }
    const document = decodeTeamDocument(raw);
    if (!document) {
      this.team.value = {
        kind: "unreadable",
        message:
          "Les réglages du board enregistrés dans Jira sont dans un format inconnu (version plus récente de l'extension ?) : ils ne sont pas appliqués.",
      };
      return;
    }
    this.team.value = { kind: "published", document };
    const latest = this.configuration.value;
    if (
      !latest ||
      (latest.teamBase?.publishedAt === document.publishedAt &&
        teamDifferences(latest, document.settings).length === 0)
    ) {
      return;
    }
    await this.#applyTeamDocument(document);
  }

  /** Droit d'édition du board, demandé une fois par board ; une erreur laisse « inconnu ». */
  async #askCanEdit(configuration: BoardConfiguration): Promise<void> {
    if (this.#canEditAsked) return;
    this.#canEditAsked = true;
    const generation = this.#generation;
    try {
      const canEdit = await this.#client.boardCanEdit(
        configuration.boardId,
        configuration.boardName,
        configuration.projectKeys[0] ?? null,
      );
      if (generation === this.#generation && canEdit !== null) this.canEditBoard.value = canEdit;
    } catch {
      // Inconnu : les réglages restent modifiables, un refus de Jira tranchera.
    }
  }

  dismissTeamNotice(): void {
    this.teamNotice.value = null;
  }

  #applyTeamDocument(document: TeamDocument): Promise<void> {
    return this.#updatePreferences((current) => ({
      ...withTeamSettings(current, document.settings),
      teamBase: {
        publishedAt: document.publishedAt,
        settings: encodeTeamSettings(document.settings),
      },
    }));
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
    this.#clearMoveFeedback();
    this.pendingMove.value = null;
    this.transitionForm.value = null;
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
    await this.#changeShared(change);
    this.#restartAutoRefresh();
    if (options.resync) await this.sync();
  }

  /** Enregistre les règles de couleur des cartes, puis les fait évaluer par Jira. */
  async applyColorRules(rules: readonly CardColorRule[]): Promise<void> {
    await this.applySettings((current) => ({ ...current, cardColorRules: [...rules] }), {
      resync: false,
    });
    await this.#refreshCardColors();
  }

  /**
   * Couleurs des cartes. La règle intégrée « ajouté en cours de sprint » s'applique tout de
   * suite ; les règles JQL gardent leur dernier résultat le temps que Jira les réévalue.
   */
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
    const issues = allIssues(snapshot);
    const added = new Set(
      issues.filter((issue) => issue.addedAfterSprintStart === true).map((i) => i.issue.key),
    );
    this.cardColors.value = resolveCardColors(rules, this.#colorMatches, added);

    const evaluation = await evaluateColorRules(this.#client, {
      boardId: configuration.boardId,
      boardType: configuration.boardType,
      kanbanSubQuery: configuration.kanbanSubQuery,
      rules,
      sprintIds: snapshot.activeSprints.map((sprint) => sprint.id),
      displayedKeys: new Set(issues.map((issue) => issue.issue.key)),
    });
    if (run !== this.#colorRun || this.configuration.value?.boardId !== configuration.boardId) {
      return;
    }
    this.#colorMatches = evaluation.matches;
    this.cardColors.value = resolveCardColors(rules, evaluation.matches, added);
    this.colorRuleIssues.value = evaluation.issues;
    const counts: Record<string, number> = { [SCOPE_CHANGE_RULE_ID]: added.size };
    for (const [id, keys] of Object.entries(evaluation.matches)) counts[id] = keys.size;
    this.colorRuleCounts.value = counts;
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
        this.transitionChoice.value !== null ||
        this.transitionForm.value !== null ||
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
    this.#clearMoveFeedback();
    this.pendingMove.value = null;
    this.transitionForm.value = null;
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
      this.transitionForm.value = null;
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
    this.#canEditAsked = false;
    this.#colorMatches = {};
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

function sameIndex(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
