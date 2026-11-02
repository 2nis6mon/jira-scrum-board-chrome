import { batch, computed, signal } from "@preact/signals";
import {
  type AtlassianSprintGoals,
  type GoalsReader,
  loadAtlassianSprintGoals,
} from "../../core/atlassianGoals";
import { type BoardConfiguration, visibleColumns } from "../../core/boardConfiguration";
import {
  GOAL_COLOR_COUNT,
  goalColorName,
  makeSprintGoal,
  type SprintGoal,
} from "../../core/sprintGoals";
import {
  type CarryOverMode,
  type CarryOverResult,
  carryOverGoals,
  loadSprintPlanning,
  type PlanningDestination,
  type PlanningOutcome,
  type PlanningSnapshot,
  type PlanningTarget,
  pinPlanningGoals,
  placePlanningIssue,
  removePlanningIssue,
  savePlanningVelocity,
  writeTextGoals,
} from "../../core/sprintPlanning";
import type { IssueQuery, JiraClient } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import {
  type AtlassianGoal,
  estimate,
  goalDisplayName,
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
  goalsFailureMessage,
  goalsWarningMessage,
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
  PlanningSection,
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
  /** Attente entre deux relectures de l'état d'un sprint après une fenêtre native. */
  wait(ms: number): Promise<void>;
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
  readonly pendingClosure = signal<PendingClosure | null>(null);
  readonly carryOverReport = signal<PlanningCarryOverReport | null>(null);
  readonly goalSearch = signal<PlanningGoalSearch | null>(null);
  /** Goals Atlassian du sprint en préparation (épinglés et rattachés à ses tickets). */
  readonly atlassianGoals = signal<AtlassianSprintGoals | null>(null);
  /** Provenance des tickets arrivés pendant la séance, pour le sprint affiché. */
  readonly #origins = signal<Readonly<Record<string, PlanningOrigin>>>({});
  #boardId: number | null = null;
  #generation = 0;
  #disposed = false;
  #draftsErased = false;
  #siteGoals: Promise<AtlassianGoal[]> | null = null;
  #goalSearchRun = 0;
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

  readonly activeSprints = computed((): readonly JiraSprint[] =>
    SPRINT_PLANNING_ENABLED
      ? (this.snapshot.value?.activeSprints ?? []).map(({ sprint }) => sprint)
      : [],
  );

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

  readonly #matches = computed(() => {
    const query = this.search.value.trim().toLocaleLowerCase();
    return (issue: JiraIssue) =>
      !query ||
      issue.key.toLocaleLowerCase().includes(query) ||
      issue.fields.summary.toLocaleLowerCase().includes(query);
  });

  #item(issue: JiraIssue): PlanningIssue {
    const fieldId = this.context.configuration()?.estimationFieldId ?? null;
    return {
      issue,
      estimate: fieldId ? estimate(issue.fields, fieldId) : 1,
      origin: this.#origins.value[issue.key] ?? null,
    };
  }

  readonly #sprintItems = computed((): readonly PlanningIssue[] =>
    SPRINT_PLANNING_ENABLED
      ? (this.snapshot.value?.sprintIssues ?? []).map((issue) => this.#item(issue))
      : [],
  );

  readonly lanes = computed((): readonly PlanningLane[] => {
    const { goals, links } = this.#goalView.value;
    const matches = this.#matches.value;
    return goals.map((goal) => {
      const all = this.#sprintItems.value.filter((item) => links[item.issue.key] === goal.id);
      return {
        goal,
        issues: all.filter((item) => matches(item.issue)),
        issueCount: all.length,
        points: all.reduce((sum, item) => sum + (item.estimate ?? 0), 0),
        unestimated: all.filter((item) => item.estimate === null).length,
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
      ...snapshot.activeSprints.map(({ sprint, issues }) => ({
        kind: "active" as const,
        sprint,
        issues: items(issues),
      })),
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
    });
    try {
      const sprints = await this.client.sprints(configuration.boardId, ["future"]);
      if (this.#stale(generation)) return;
      const futures = sprints.filter((sprint) => sprint.state === "future");
      this.sprints.value = futures;
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
    });
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
    });
  }

  setSearch(text: string): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    this.search.value = text;
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
   * backlog ou d'un autre sprint futur, il y est d'abord ajouté ; le reste à faire d'un sprint
   * actif reste en consultation.
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
        }),
      (outcome) => {
        if (outcome.kind !== "done") return;
        const { [key]: _left, ...rest } = this.#origins.value;
        this.#origins.value = rest;
      },
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
    const active = this.activeSprints.value.find((sprint) => sprint.id === sprintId);
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
    const last = visibleColumns(configuration.columns).at(-1) ?? null;
    const isDone = (issue: JiraIssue) =>
      last?.statusIds.includes(issue.fields.status?.id ?? "") === true;
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
    if (!snapshot || this.busy.value || !isIssueKey(key) || !locate(snapshot, key, true)) return;
    this.context.openIssue(key);
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────────

  reset(): void {
    this.#generation += 1;
    this.#boardId = null;
    this.#siteGoals = null;
    this.#closureCheck = null;
    batch(() => {
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
 * dans le sprint en préparation. Le reste à faire d'un sprint actif n'est trouvé qu'en
 * consultation (`readOnly`).
 */
function locate(
  snapshot: PlanningSnapshot,
  key: string,
  readOnly = false,
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
  if (!readOnly) return null;
  for (const { issues } of snapshot.activeSprints) {
    const found = issues.find((issue) => issue.key === key);
    if (found) return { issue: found, origin: null };
  }
  return null;
}
