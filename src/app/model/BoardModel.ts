import { batch, computed, signal } from "@preact/signals";
import { type BoardBlock, blockIdentifier } from "../../core/boardBlocks";
import { type BoardConfiguration, displayedGoalId } from "../../core/boardConfiguration";
import { type BoardIssue, type BoardSnapshot, findIssue } from "../../core/boardIssue";
import { buildBoardLayout, filterOptions } from "../../core/boardLayout";
import { detectBoard, loadSnapshot, refreshBoardStructure } from "../../core/boardSync";
import {
  linkToTextGoal,
  type MoveOutcome,
  moveToColumn,
  performTransition,
  rankIssue,
} from "../../core/boardWrites";
import { isNoOpDrop, planRank, type RankChange, resolveDrop } from "../../core/dropPlan";
import { type BoardFilters, focusGoal, NO_FILTERS, type QuickFilter } from "../../core/filters";
import { JiraClient } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import type { JiraTransition, JiraUser } from "../../jira/models";
import { type JiraSite, parseBoardUrl } from "../../jira/site";
import { JiraTransport } from "../../jira/transport";
import type { Platform } from "../platform/types";
import { type AuditEntry, AuditLog } from "./auditLog";
import { loadActiveBoard, loadBoard, saveBoard } from "./boardStore";
import { ImageCache } from "./ImageCache";
import { toMessage, type UserMessage } from "./messages";

/**
 * Limitation connue, affichée tant que l'extension ne lit pas les Goals Atlassian : leur API
 * passe par la passerelle GraphQL, qui a refusé l'origine de l'extension lors de l'essai sur une
 * instance réelle (« Invalid CORS request »).
 */
export const GOALS_UNAVAILABLE_NOTICE =
  "Les Goals Atlassian ne sont pas encore lus par l'extension : leur API (passerelle GraphQL d'Atlassian) refuse pour l'instant ses requêtes. Les objectifs affichés sont les lignes du champ « Objectif » du sprint, en lecture seule.";

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
  readonly goalsNotice = signal<string | null>(null);

  readonly filters = signal<BoardFilters>(NO_FILTERS);

  /** Tickets dont une écriture est en cours : ils ne bougent pas avant la réponse de Jira. */
  readonly pendingKeys = signal<ReadonlySet<string>>(new Set());
  readonly writeNotice = signal<WriteNotice | null>(null);
  readonly transitionChoice = signal<TransitionChoice | null>(null);
  readonly dragging = signal<DragState | null>(null);
  readonly dropTarget = signal<DropTarget | null>(null);

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

  readonly images: ImageCache;
  readonly audit: AuditLog;

  readonly #platform: Platform;
  readonly #client: JiraClient;
  readonly #transport: JiraTransport;
  readonly #now: () => Date;
  #currentUser: JiraUser | null = null;
  #generation = 0;
  #resyncRequested = false;

  constructor(site: JiraSite, platform: Platform, options: BoardModelOptions = {}) {
    this.site = site;
    this.#platform = platform;
    this.#now = options.now ?? (() => new Date());
    this.audit = options.audit ?? new AuditLog(platform.store);
    const transport = new JiraTransport({ site, fetch: platform.fetch });
    this.#transport = transport;
    this.#client = new JiraClient(transport);
    this.images = new ImageCache((url) => transport.fetchImage(url));
  }

  /** Relit le board enregistré pour ce site et, s'il y en a un, le synchronise. */
  async load(): Promise<void> {
    const configuration = await loadActiveBoard(this.#platform.store, this.site.origin);
    this.configuration.value = configuration;
    this.loaded.value = true;
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
      await saveBoard(this.#platform.store, configuration);
      this.#generation += 1; // une synchronisation en cours appartient à l'ancien board
      this.configuration.value = configuration;
      this.snapshot.value = null;
      this.filters.value = NO_FILTERS;
      this.syncProblem.value = null;
      this.editingBoard.value = false;
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
      await saveBoard(this.#platform.store, configuration);
      this.configuration.value = configuration;
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
        goalsLoader: null,
        now: this.#now(),
      });
      if (isStale()) return;

      this.snapshot.value = result.snapshot;
      this.goalsNotice.value = result.goalsIssue === null ? null : GOALS_UNAVAILABLE_NOTICE;
      this.syncProblem.value = null;

      // Couleurs des objectifs : mémorisées localement pour rester stables d'un sprint à l'autre.
      const latest = this.configuration.value ?? configuration;
      if (!sameIndex(latest.goalColorIndex, result.goalColorIndex)) {
        const updated = { ...latest, goalColorIndex: result.goalColorIndex };
        this.configuration.value = updated;
        await saveBoard(this.#platform.store, updated);
      }
    } catch (error) {
      if (isStale()) return;
      const sessionLost = isSessionLost(error);
      if (sessionLost) this.#currentUser = null;
      this.syncProblem.value = { ...toMessage(error), sessionLost };
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

  focusGoal(goalId: string): void {
    this.filters.value = focusGoal(this.filters.value, goalId);
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
    if (snapshot.goalsOrigin !== "sprintText" || !snapshot.sprint) {
      this.writeNotice.value = {
        tone: "error",
        text: "Le rattachement à un Goal Atlassian n'est pas encore disponible dans l'extension.",
        suggestion: "Faites ce rattachement dans Jira. Rien n'a été modifié.",
        sessionLost: false,
        issueKey,
      };
      return false;
    }
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
    this.images.dispose();
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

function sameIndex(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
