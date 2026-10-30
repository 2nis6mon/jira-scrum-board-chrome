import { batch, computed, signal } from "@preact/signals";
import type { BoardConfiguration } from "../../core/boardConfiguration";
import {
  goalColorName,
  makeSprintGoal,
  parseSprintGoalText,
  type SprintGoal,
} from "../../core/sprintGoals";
import {
  loadSprintPlanning,
  type PlanningSnapshot,
  planningRevision,
  publishSprintPlanning,
} from "../../core/sprintPlanning";
import { languageLocale, localize, t } from "../../i18n";
import type { JiraClient } from "../../jira/client";
import { isRecord } from "../../jira/json";
import { estimate, isDoneStatus, type JiraSprint } from "../../jira/models";
import { isIssueKey } from "../../jira/writes";
import { SPRINT_PLANNING_ENABLED } from "../featureFlags";
import type { Platform } from "../platform/types";
import type { BoardWriteGateway, RecordWrite } from "../services/ports";
import { toMessage, type UserMessage } from "./messages";
import type { PlanningDraft, PlanningIssue, PlanningViewModel } from "./PlanningTypes";

interface StoredDraft {
  readonly version: 1;
  readonly revision: string;
  readonly draft: PlanningDraft;
  readonly originalContent: string;
}

interface PlanningContext {
  configuration(): BoardConfiguration | null;
  canWrite(): boolean;
  accountId(): string | null;
  openIssue(key: string): void;
  /** Porte d'écriture du board : la publication attend les autres gestes qui écrivent. */
  readonly write: BoardWriteGateway["run"];
  /** Journal du board. */
  readonly record: RecordWrite;
}

/** Atelier à la demande : toutes les modifications restent locales jusqu'à Publier. */
export class PlanningModel implements PlanningViewModel {
  readonly sprints = signal<readonly JiraSprint[]>([]);
  readonly selectedSprintId = signal<number | null>(null);
  readonly loading = signal(false);
  readonly publishing = signal(false);
  /** Empêche une navigation hôte de détruire l'iframe avant la dernière sauvegarde locale. */
  readonly saving = signal(0);
  readonly error = signal<UserMessage | null>(null);
  readonly notice = signal<string | null>(null);
  readonly draft = signal<PlanningDraft | null>(null);
  readonly snapshot = signal<PlanningSnapshot | null>(null);
  readonly #reviewRequired = signal<string | null>(null);
  readonly #originalContent = signal("");
  #revision = "";
  #boardId: number | null = null;
  #generation = 0;
  #disposed = false;
  #saveQueue: Promise<unknown> = Promise.resolve();
  #storageFailed = false;
  readonly #memoryDrafts = new Map<string, StoredDraft>();

  constructor(
    readonly client: JiraClient,
    readonly platform: Platform,
    readonly context: PlanningContext,
  ) {}

  get estimationLabel(): string {
    return this.context.configuration()?.estimationFieldId ? "pts" : "tickets";
  }

  readonly issues = computed((): readonly PlanningIssue[] => {
    if (!SPRINT_PLANNING_ENABLED) return [];
    const snapshot = this.snapshot.value;
    if (!snapshot) return [];
    const fieldId = this.context.configuration()?.estimationFieldId ?? null;
    const seen = new Set<string>();
    const issues: PlanningIssue[] = [];
    for (const [source, sourceIssues] of [
      ["sprint", snapshot.sprintIssues],
      ["remaining", snapshot.remainingIssues],
      ["backlog", snapshot.backlogIssues],
    ] as const) {
      for (const issue of sourceIssues) {
        if (seen.has(issue.key)) continue;
        seen.add(issue.key);
        issues.push({ issue, source, estimate: fieldId ? estimate(issue.fields, fieldId) : 1 });
      }
    }
    return issues;
  });

  readonly dirty = computed(() => {
    if (!SPRINT_PLANNING_ENABLED) return false;
    const current = this.draft.value;
    return current !== null && draftContent(current) !== this.#originalContent.value;
  });

  readonly validation = computed((): string | null => {
    if (!SPRINT_PLANNING_ENABLED) return "Sprint Planning est désactivé dans cette version.";
    if (this.#reviewRequired.value) return this.#reviewRequired.value;
    const draft = this.draft.value;
    if (!draft) return "Choisissez un sprint futur à préparer.";
    if (this.snapshot.value?.sprint.state !== "future")
      return "Ce sprint n'est plus un sprint futur.";
    const titles = draft.goals.map((goal) => goal.title.trim());
    if (titles.some((title) => !title || /[\r\n\u2028\u2029]/u.test(title)))
      return "Chaque objectif doit avoir un titre sur une seule ligne.";
    if (titles.some((title) => parseSprintGoalText(title)[0] !== title))
      return "Saisissez les titres sans puce ni numéro au début : la mise en forme est automatique.";
    if (new Set(titles.map((title) => title.toLocaleLowerCase("fr"))).size !== titles.length)
      return "Donnez un titre différent à chaque objectif.";
    const selectable = new Set(
      this.issues.value.filter((item) => item.source !== "remaining").map((item) => item.issue.key),
    );
    if (draft.selectedIssueKeys.some((key) => !selectable.has(key)))
      return "Certains tickets du brouillon ne sont plus disponibles. Retirez-les du plan avant de publier.";
    if (!this.context.canWrite()) return "Attendez la fin de l'opération en cours sur le board.";
    return null;
  });

  readonly canPublish = computed(
    () =>
      SPRINT_PLANNING_ENABLED &&
      this.dirty.value &&
      this.error.value === null &&
      !this.loading.value &&
      !this.publishing.value &&
      this.validation.value === null,
  );

  /** Aucune lecture du backlog à l'ouverture ordinaire du board. */
  async load(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    const configuration = this.context.configuration();
    if (configuration?.boardType !== "scrum" || this.publishing.value || this.#disposed) return;
    if (this.#boardId === configuration.boardId && (this.loading.value || this.snapshot.value))
      return;
    if (this.#boardId !== configuration.boardId) this.reset();
    this.#boardId = configuration.boardId;
    await this.#loadSprintsAndSelection();
  }

  async #loadSprintsAndSelection(): Promise<void> {
    const configuration = this.context.configuration();
    if (configuration?.boardType !== "scrum") return;
    const generation = ++this.#generation;
    this.loading.value = true;
    this.error.value = null;
    try {
      const sprints = await this.client.sprints(configuration.boardId, ["future"]);
      if (this.#stale(generation)) return;
      const futures = sprints.filter((sprint) => sprint.state === "future");
      const savedIds = await this.#draftSprintIds(configuration.boardId);
      const current = this.selectedSprintId.value;
      if (current !== null && this.draft.value) savedIds.add(current);
      const futureIds = new Set(futures.map((sprint) => sprint.id));
      const retained = await Promise.all(
        [...savedIds]
          .filter((id) => !futureIds.has(id))
          .map(async (id) => {
            try {
              return await this.client.sprint(id);
            } catch {
              return this.snapshot.value?.sprint.id === id ? this.snapshot.value.sprint : null;
            }
          }),
      );
      if (this.#stale(generation)) return;
      this.sprints.value = [
        ...futures,
        ...retained.filter((sprint): sprint is JiraSprint => sprint !== null),
      ];
      const selected =
        this.sprints.value.find((sprint) => sprint.id === this.selectedSprintId.value) ??
        this.sprints.value[0];
      if (selected) {
        this.loading.value = false;
        await this.selectSprint(selected.id);
      } else {
        this.selectedSprintId.value = null;
        this.snapshot.value = null;
        this.draft.value = null;
      }
    } catch (error) {
      if (!this.#stale(generation)) this.error.value = toMessage(error);
    } finally {
      if (!this.#stale(generation)) this.loading.value = false;
    }
  }

  async selectSprint(id: number): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    const configuration = this.context.configuration();
    if (
      !configuration ||
      this.publishing.value ||
      this.#disposed ||
      !this.sprints.value.some((sprint) => sprint.id === id)
    )
      return;
    const generation = ++this.#generation;
    await this.#saveQueue;
    if (this.#stale(generation) || this.context.configuration()?.boardId !== configuration.boardId)
      return;
    this.#boardId = configuration.boardId;
    const sameSprint = this.selectedSprintId.value === id;
    batch(() => {
      this.selectedSprintId.value = id;
      this.loading.value = true;
      this.error.value = null;
      this.notice.value = null;
      if (!sameSprint) {
        this.snapshot.value = null;
        this.draft.value = null;
        this.#reviewRequired.value = null;
      }
    });
    try {
      const [snapshot, saved] = await Promise.all([
        loadSprintPlanning(this.client, {
          boardId: configuration.boardId,
          sprintId: id,
          query: this.#query(),
        }),
        this.#readStored(configuration.boardId, id).catch(() => {
          if (!this.#stale(generation))
            this.notice.value =
              "Le brouillon local n'a pas pu être relu. Les données Jira restent disponibles.";
          return null;
        }),
      ]);
      if (this.#stale(generation)) return;
      this.#acceptSnapshot(snapshot);
      if (saved) {
        this.draft.value = saved.draft;
        this.#originalContent.value = saved.originalContent;
        this.#revision = saved.revision;
        if (saved.revision !== planningRevision(snapshot)) {
          this.#reviewRequired.value =
            "Jira a changé depuis ce brouillon. Copiez la synthèse pour le conserver, puis repartez de Jira avant de publier.";
        }
        this.notice.value = this.#storageFailed
          ? "Brouillon conservé en mémoire, mais sa sauvegarde locale a échoué. Copiez la synthèse avant de fermer."
          : "Votre brouillon a été retrouvé dans ce navigateur.";
      }
    } catch (error) {
      if (!this.#stale(generation)) this.error.value = toMessage(error);
    } finally {
      if (!this.#stale(generation)) this.loading.value = false;
    }
  }

  /** Relire conserve le brouillon ; un changement concurrent exige une décision explicite. */
  async refresh(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    if (this.publishing.value || this.loading.value || this.#disposed) return;
    await this.#saveQueue;
    await this.#loadSprintsAndSelection();
  }

  addGoal(title: string): void {
    const draft = this.draft.value;
    if (!draft) return;
    this.#change({
      ...draft,
      goals: [
        ...draft.goals,
        makeSprintGoal({
          id: crypto.randomUUID(),
          title: title.trim(),
          color: goalColorName(draft.goals.length),
          position: draft.goals.length,
        }),
      ],
    });
  }

  renameGoal(id: string, title: string): void {
    const draft = this.draft.value;
    if (draft)
      this.#change({
        ...draft,
        goals: draft.goals.map((goal) => (goal.id === id ? { ...goal, title } : goal)),
      });
  }

  removeGoal(id: string): void {
    const draft = this.draft.value;
    if (!draft) return;
    this.#change({
      ...draft,
      goals: draft.goals
        .filter((goal) => goal.id !== id)
        .map((goal, position) => ({ ...goal, position })),
      links: Object.fromEntries(Object.entries(draft.links).filter(([, value]) => value !== id)),
    });
  }

  moveGoal(id: string, delta: -1 | 1): void {
    const draft = this.draft.value;
    if (!draft) return;
    const index = draft.goals.findIndex((goal) => goal.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= draft.goals.length) return;
    const goals = [...draft.goals];
    const current = goals[index];
    const neighbor = goals[target];
    if (!current || !neighbor) return;
    [goals[index], goals[target]] = [neighbor, current];
    this.#change({ ...draft, goals: goals.map((goal, position) => ({ ...goal, position })) });
  }

  assignIssue(key: string, goalId: string | null): void {
    const draft = this.draft.value;
    const item = this.issues.value.find((candidate) => candidate.issue.key === key);
    if (
      !draft ||
      !item ||
      item.source === "remaining" ||
      (item.source === "backlog" &&
        (item.issue.fields.issuetype.subtask || isDoneStatus(item.issue.fields.status))) ||
      (goalId !== null && !draft.goals.some((goal) => goal.id === goalId))
    )
      return;
    const links = { ...draft.links };
    if (goalId === null) delete links[key];
    else links[key] = goalId;
    this.#change({
      ...draft,
      links,
      selectedIssueKeys: [...new Set([...draft.selectedIssueKeys, key])],
    });
  }

  removeIssue(key: string): void {
    const draft = this.draft.value;
    if (!draft || this.snapshot.value?.sprintIssues.some((issue) => issue.key === key)) return;
    const links = { ...draft.links };
    delete links[key];
    this.#change({
      ...draft,
      links,
      selectedIssueKeys: draft.selectedIssueKeys.filter((selected) => selected !== key),
    });
  }

  setCapacity(capacity: number | null): void {
    const draft = this.draft.value;
    if (!draft || (capacity !== null && (!Number.isFinite(capacity) || capacity < 0))) return;
    this.#change({ ...draft, capacity });
  }

  async publish(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    const snapshot = this.snapshot.value;
    const draft = this.draft.value;
    const configuration = this.context.configuration();
    if (!snapshot || !draft || !configuration || !this.canPublish.value) return;
    this.publishing.value = true;
    this.error.value = null;
    this.notice.value = null;
    const generation = this.#generation;
    try {
      // La porte est demandée avant d'attendre les brouillons : un changement de board pendant
      // cette attente rend la publication périmée.
      const result = await this.context.write(async ({ writer }) => {
        await this.#saveQueue;
        return publishSprintPlanning(this.client, writer, {
          snapshot,
          goals: draft.goals.map((goal) => ({ ...goal, title: goal.title.trim() })),
          links: draft.links,
          selectedIssueKeys: draft.selectedIssueKeys,
          accountId: this.context.accountId(),
          now: new Date(),
        });
      });
      await this.context.record({
        action: "sprint planning",
        issueKey: null,
        from: null,
        to: String(draft.sprintId),
        outcome:
          result.kind === "confirmed"
            ? "réussi"
            : result.kind === "partial"
              ? "incertain"
              : "échec",
        detail: result.message,
      });
      if (this.#stale(generation)) return;
      this.notice.value = result.message;
      if (result.kind === "confirmed" && result.snapshot) {
        this.#acceptSnapshot(result.snapshot, draft.capacity);
        await this.#removeStored(configuration.boardId, draft.sprintId).catch(() => {
          this.notice.value = `${result.message} L'ancien brouillon local n'a pas pu être effacé.`;
        });
      } else {
        this.#reviewRequired.value =
          "La publication doit être réexaminée. Votre brouillon reste disponible : copiez sa synthèse, puis repartez de Jira pour voir le résultat confirmé.";
      }
    } catch (error) {
      if (!this.#stale(generation)) {
        this.error.value = toMessage(error);
        this.#reviewRequired.value =
          "Publication non confirmée. Copiez votre brouillon puis repartez de Jira avant toute nouvelle publication.";
      }
    } finally {
      if (!this.#stale(generation)) this.publishing.value = false;
    }
  }

  async discardDraft(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    const id = this.selectedSprintId.value;
    if (id === null || this.#boardId === null || this.publishing.value || this.loading.value)
      return;
    try {
      await this.#removeStored(this.#boardId, id);
      await this.selectSprint(id);
    } catch (error) {
      this.error.value = toMessage(error);
    }
  }

  openIssue(key: string): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    if (
      !this.publishing.value &&
      isIssueKey(key) &&
      (this.issues.value.some((item) => item.issue.key === key) ||
        this.draft.value?.selectedIssueKeys.includes(key))
    )
      this.context.openIssue(key);
  }

  async copySummary(): Promise<void> {
    if (!SPRINT_PLANNING_ENABLED) return;
    const draft = this.draft.value;
    if (!draft) return;
    this.notice.value = null;
    const selected = new Set(draft.selectedIssueKeys);
    const issues = this.issues.value.filter((item) => selected.has(item.issue.key));
    const numbers = new Intl.NumberFormat(languageLocale());
    const units = localize(this.estimationLabel);
    const blocks = [
      ...draft.goals.map((goal) => ({ id: goal.id, title: goal.title })),
      { id: null, title: t("À organiser") },
    ];
    const lines = [
      `Sprint Planning — ${this.snapshot.value?.sprint.name ?? draft.sprintId}`,
      t("Proposition de préparation"),
      "",
    ];
    for (const block of blocks) {
      const matching = issues.filter((item) => (draft.links[item.issue.key] ?? null) === block.id);
      if (block.id === null && !matching.length) continue;
      lines.push(
        block.title,
        ...matching.map(
          (item) =>
            `- ${item.issue.key} — ${item.issue.fields.summary} (${item.estimate === null ? "?" : numbers.format(item.estimate)} ${units})`,
        ),
        "",
      );
    }
    if (draft.capacity !== null)
      lines.push(
        t("Capacité envisagée : {p0} {p1}", { p0: numbers.format(draft.capacity), p1: units }),
      );
    const known = new Set(issues.map((item) => item.issue.key));
    const unavailable = draft.selectedIssueKeys.filter((key) => !known.has(key));
    if (unavailable.length)
      lines.push(
        t("Tickets à réexaminer :"),
        ...unavailable.map(
          (key) =>
            `- ${key} — ${draft.goals.find((goal) => goal.id === draft.links[key])?.title ?? t("À organiser")}`,
        ),
      );
    try {
      await this.platform.copyText(lines.join("\n"));
      this.notice.value = "Synthèse copiée.";
    } catch (error) {
      this.error.value = toMessage(error);
    }
  }

  reset(): void {
    this.#generation += 1;
    this.#boardId = null;
    batch(() => {
      this.snapshot.value = null;
      this.draft.value = null;
      this.#originalContent.value = "";
      this.selectedSprintId.value = null;
      this.sprints.value = [];
      this.loading.value = false;
      this.error.value = null;
      this.notice.value = null;
      this.#reviewRequired.value = null;
    });
  }

  dispose(): void {
    this.reset();
    this.#disposed = true;
  }

  async forgetSite(): Promise<void> {
    await this.#saveQueue;
    await this.platform.store.remove(this.#storageKey());
    this.#memoryDrafts.clear();
  }

  async flushDraft(): Promise<void> {
    await this.#saveQueue;
  }

  async #draftSprintIds(boardId: number): Promise<Set<number>> {
    const all = await this.platform.store.get(this.#storageKey()).catch(() => null);
    const ids = new Set<number>();
    const entries = [
      ...(isRecord(all) ? Object.entries(all) : []),
      ...this.#memoryDrafts.entries(),
    ];
    for (const [key, value] of entries) {
      if (
        !key.startsWith(`${boardId}:`) ||
        !isRecord(value) ||
        value.version !== 1 ||
        !isRecord(value.draft)
      )
        continue;
      const id = value.draft.sprintId;
      if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ids.add(id);
    }
    return ids;
  }

  async forgetBoard(boardId: number): Promise<void> {
    await this.#saveQueue;
    for (const key of this.#memoryDrafts.keys())
      if (key.startsWith(`${boardId}:`)) this.#memoryDrafts.delete(key);
    const all = await this.platform.store.get(this.#storageKey());
    if (!isRecord(all)) return;
    const kept = Object.fromEntries(
      Object.entries(all).filter(([key]) => !key.startsWith(`${boardId}:`)),
    );
    await this.platform.store.set(this.#storageKey(), kept);
  }

  #query() {
    return {
      estimationFieldId: this.context.configuration()?.estimationFieldId ?? null,
      includeChangelog: false,
    };
  }
  #stale(generation: number): boolean {
    return this.#disposed || generation !== this.#generation;
  }
  #storageKey(): string {
    return `sprint-planning.v1:${this.client.site.origin}`;
  }

  #acceptSnapshot(snapshot: PlanningSnapshot, capacity: number | null = null): void {
    const selectedIssueKeys = snapshot.sprintIssues.map((issue) => issue.key);
    const selected = new Set(selectedIssueKeys);
    const draft: PlanningDraft = {
      sprintId: snapshot.sprint.id,
      goals: snapshot.goals,
      links: Object.fromEntries(
        Object.entries(snapshot.links).filter(([key]) => selected.has(key)),
      ),
      selectedIssueKeys,
      capacity,
    };
    batch(() => {
      this.snapshot.value = snapshot;
      this.draft.value = draft;
      this.#originalContent.value = draftContent(draft);
      this.#reviewRequired.value = null;
    });
    this.#revision = planningRevision(snapshot);
  }

  #change(draft: PlanningDraft): void {
    if (!SPRINT_PLANNING_ENABLED) return;
    if (this.loading.value || this.publishing.value || this.#disposed || this.#boardId === null)
      return;
    this.draft.value = draft;
    this.notice.value = null;
    const boardId = this.#boardId;
    const saved: StoredDraft = {
      version: 1,
      revision: this.#revision,
      originalContent: this.#originalContent.value,
      draft,
    };
    this.#memoryDrafts.set(`${boardId}:${draft.sprintId}`, saved);
    this.saving.value += 1;
    this.#saveQueue = this.#saveQueue
      .then(async () => {
        const all = await this.platform.store.get(this.#storageKey());
        await this.platform.store.set(this.#storageKey(), {
          ...(isRecord(all) ? all : {}),
          [`${boardId}:${draft.sprintId}`]: saved,
        });
        this.#storageFailed = false;
      })
      .catch(() => {
        this.#storageFailed = true;
        this.notice.value =
          "Le brouillon reste affiché mais sa sauvegarde locale a échoué. Copiez la synthèse avant de fermer.";
      })
      .finally(() => {
        this.saving.value -= 1;
      });
  }

  async #readStored(boardId: number, sprintId: number): Promise<StoredDraft | null> {
    const memory = this.#memoryDrafts.get(`${boardId}:${sprintId}`);
    if (memory) return memory;
    const all = await this.platform.store.get(this.#storageKey());
    const saved = isRecord(all) ? all[`${boardId}:${sprintId}`] : null;
    if (
      !isRecord(saved) ||
      saved.version !== 1 ||
      typeof saved.revision !== "string" ||
      typeof saved.originalContent !== "string" ||
      !isRecord(saved.draft)
    )
      return null;
    const value = saved.draft;
    if (
      value.sprintId !== sprintId ||
      !Array.isArray(value.goals) ||
      !isRecord(value.links) ||
      !Array.isArray(value.selectedIssueKeys)
    )
      return null;
    const goals: SprintGoal[] = [];
    for (const goal of value.goals) {
      if (!isRecord(goal) || typeof goal.id !== "string" || typeof goal.title !== "string")
        return null;
      goals.push(
        makeSprintGoal({
          id: goal.id,
          title: goal.title,
          color: typeof goal.color === "string" ? goal.color : goalColorName(goals.length),
          position: goals.length,
        }),
      );
    }
    const selectedIssueKeys = value.selectedIssueKeys.filter(
      (key): key is string => typeof key === "string" && isIssueKey(key),
    );
    const ids = new Set(goals.map((goal) => goal.id));
    const links = Object.fromEntries(
      Object.entries(value.links).filter(
        (entry): entry is [string, string] =>
          isIssueKey(entry[0]) && typeof entry[1] === "string" && ids.has(entry[1]),
      ),
    );
    return {
      version: 1,
      revision: saved.revision,
      originalContent: saved.originalContent,
      draft: {
        sprintId,
        goals,
        links,
        selectedIssueKeys: [...new Set(selectedIssueKeys)],
        capacity:
          typeof value.capacity === "number" &&
          Number.isFinite(value.capacity) &&
          value.capacity >= 0
            ? value.capacity
            : null,
      },
    };
  }

  async #removeStored(boardId: number, sprintId: number): Promise<void> {
    await this.#saveQueue;
    const all = await this.platform.store.get(this.#storageKey());
    if (!isRecord(all)) {
      this.#memoryDrafts.delete(`${boardId}:${sprintId}`);
      return;
    }
    const kept = { ...all };
    delete kept[`${boardId}:${sprintId}`];
    await this.platform.store.set(this.#storageKey(), kept);
    this.#memoryDrafts.delete(`${boardId}:${sprintId}`);
  }
}

function draftContent(draft: PlanningDraft): string {
  return JSON.stringify({
    goals: draft.goals.map((goal) => [goal.id, goal.title.trim()]),
    selected: [...draft.selectedIssueKeys].sort(),
    links: Object.entries(draft.links).sort(([a], [b]) => a.localeCompare(b)),
  });
}
