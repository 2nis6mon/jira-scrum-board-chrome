import { computed, signal } from "@preact/signals";
import type { BoardConfiguration } from "../../core/boardConfiguration";
import type { BoardSnapshot } from "../../core/boardIssue";
import { buildBoardLayout, filterOptions } from "../../core/boardLayout";
import { detectBoard, loadSnapshot, refreshBoardStructure } from "../../core/boardSync";
import { type BoardFilters, focusGoal, NO_FILTERS, type QuickFilter } from "../../core/filters";
import { JiraClient } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import type { JiraUser } from "../../jira/models";
import { type JiraSite, parseBoardUrl } from "../../jira/site";
import { JiraTransport } from "../../jira/transport";
import type { Platform } from "../platform/types";
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

  readonly #platform: Platform;
  readonly #client: JiraClient;
  readonly #now: () => Date;
  #currentUser: JiraUser | null = null;
  #generation = 0;
  #resyncRequested = false;

  constructor(site: JiraSite, platform: Platform, now: () => Date = () => new Date()) {
    this.site = site;
    this.#platform = platform;
    this.#now = now;
    const transport = new JiraTransport({ site, fetch: platform.fetch });
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
