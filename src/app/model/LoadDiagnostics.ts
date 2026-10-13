import { signal } from "@preact/signals";
import {
  LOAD_ERRORS,
  LOAD_PHASE_LABELS,
  LOAD_SPAN_LABELS,
  type LoadError,
  type LoadPhase,
  type LoadRun,
  type LoadSpan,
  type LoadTrace,
  loadError,
  type ObserveRead,
} from "../../core/loadTrace";
import type { Platform } from "../platform/types";

export type { LoadError, LoadPhase, LoadRun, LoadSpan } from "../../core/loadTrace";

export const LOAD_HISTORY_KEY = "loadDiagnostics.v1";
export const MAX_LOAD_SPANS = 500;
const MAX_HISTORY = 5;

/** Collecte locale bornée. Les erreurs de mesure ou de stockage ne bloquent jamais Jira. */
export class LoadDiagnostics implements LoadTrace {
  readonly current = signal<LoadRun | null>(null);
  readonly history = signal<readonly LoadRun[]>([]);
  readonly #platform: Platform;
  readonly #clock: () => number;
  #start = 0;
  #sequence = 0;
  #spanSequence = 0;
  #requestSequence = 0;
  #epoch = 0;
  #queue: Promise<void> = Promise.resolve();
  #loaded: Promise<void> | null = null;

  constructor(platform: Platform, clock: () => number = () => performance.now()) {
    this.#platform = platform;
    this.#clock = clock;
  }

  begin(kind: "opening" | "refresh", initialMs = 0): string {
    if (this.current.peek()?.status === "loading") this.finish("cancelled");
    this.#start = this.#clock();
    const startedAt = Date.now();
    const id = `${startedAt}-${++this.#sequence}`;
    this.#spanSequence = 0;
    this.#requestSequence = 0;
    this.current.value = {
      id,
      version: safeVersion(this.#platform.extensionVersion),
      kind,
      startedAt,
      initialMs: milliseconds(initialMs),
      status: "loading",
      durationMs: null,
      dataReadyMs: null,
      visibleMs: null,
      boardType: null,
      issues: null,
      goals: null,
      spans: [],
      truncated: 0,
    };
    const run = this.current.peek();
    if (run && initialMs > 0) {
      this.current.value = {
        ...run,
        spans: [
          {
            ...emptySpan(++this.#spanSequence, "phase", "startup", 0),
            durationMs: milliseconds(initialMs),
            status: "ok",
          },
        ],
      };
    }
    return id;
  }

  finish(status: "ok" | "error" | "cancelled" = "ok"): void {
    const run = this.current.peek();
    if (run?.status !== "loading") return;
    const durationMs = this.#elapsed(run);
    const finished: LoadRun = {
      ...run,
      status,
      durationMs,
      spans: run.spans.map((span) =>
        span.status === "running"
          ? { ...span, status: "cancelled", durationMs: milliseconds(durationMs - span.startMs) }
          : span,
      ),
    };
    this.current.value = finished;
    this.#remember(finished);
  }

  setContext(context: { boardType?: "scrum" | "kanban"; issues?: number; goals?: number }): void {
    const run = this.current.peek();
    if (run?.status !== "loading") return;
    this.current.value = {
      ...run,
      boardType: context.boardType ?? run.boardType,
      issues: context.issues === undefined ? run.issues : count(context.issues),
      goals: context.goals === undefined ? run.goals : count(context.goals),
    };
  }

  markDataReady(): void {
    const run = this.current.peek();
    if (run?.status !== "loading" || run.dataReadyMs !== null) return;
    this.current.value = { ...run, dataReadyMs: this.#elapsed(run) };
  }

  markVisible(id: string): void {
    const run = this.current.peek();
    if (!run || run.id !== id || run.visibleMs !== null || run.status === "cancelled") return;
    const visible = { ...run, visibleMs: this.#elapsed(run) };
    this.current.value = visible;
    if (run.status !== "loading") this.#remember(visible);
  }

  async measure<T>(phase: LoadPhase, work: () => Promise<T>): Promise<T> {
    const span = this.#span("phase", phase);
    try {
      const result = await work();
      span?.finish(null, null);
      return result;
    } catch (error) {
      span?.finish(loadError(error), null);
      throw error;
    }
  }

  measureSync<T>(phase: LoadPhase, work: () => T): T {
    const span = this.#span("phase", phase);
    try {
      const result = work();
      span?.finish(null, null);
      return result;
    } catch (error) {
      span?.finish(loadError(error), null);
      throw error;
    }
  }

  /** La fermeture appartient au chargement au moment du départ, même après une annulation. */
  readonly observeTransport: ObserveRead = (kind) => {
    const run = this.current.peek();
    if (run?.status !== "loading") return undefined;
    const request = ++this.#requestSequence;
    return {
      attempt: (attempt) => {
        const span = this.#span("request", kind, run.id, { attempt, request });
        return span && { finish: (result) => span.finish(result.error, result.status) };
      },
      wait: (delayMs) => {
        const span = this.#span("wait", "retry", run.id, { delayMs, request });
        return span && { finish: () => span.finish(null, null) };
      },
    };
  };

  loadHistory(): Promise<void> {
    if (this.#loaded) return this.#loaded;
    const epoch = this.#epoch;
    this.#loaded = this.#enqueue(async () => {
      const raw = await this.#platform.store.get(LOAD_HISTORY_KEY);
      if (epoch !== this.#epoch || !Array.isArray(raw)) return;
      const decoded = raw
        .slice(0, MAX_HISTORY)
        .map(decodeRun)
        .filter((run) => run !== null);
      const ids = new Set(this.history.peek().map((run) => run.id));
      this.history.value = [...this.history.peek(), ...decoded.filter((run) => !ids.has(run.id))]
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, MAX_HISTORY);
    });
    return this.#loaded;
  }

  clearHistory(): Promise<void> {
    ++this.#epoch;
    return this.#enqueue(async () => {
      await this.#platform.store.remove(LOAD_HISTORY_KEY);
      this.history.value = [];
    }, true);
  }

  clear(): Promise<void> {
    this.current.value = null;
    this.history.value = [];
    // La déconnexion ne dépend pas du diagnostic ; l'effacement explicite reste, lui, confirmé.
    return this.clearHistory().catch(() => {});
  }

  /** Même horloge monotone pour l'indicateur, la chronologie et le rapport. */
  elapsedMs(run: LoadRun | undefined = this.current.peek() ?? undefined): number {
    if (!run) return 0;
    if (run.durationMs !== null) return run.durationMs;
    const current = this.current.peek();
    if (current?.id === run.id) return current.durationMs ?? this.#elapsed(current);
    return this.history.peek().find((entry) => entry.id === run.id)?.durationMs ?? run.initialMs;
  }

  report(run: LoadRun | undefined = this.current.peek() ?? undefined): string {
    if (!run) return "Diagnostic de chargement : aucune mesure disponible.";
    const elapsed = this.elapsedMs(run);
    const requests = run.spans.filter((span) => span.kind === "request");
    const lines = [
      "Sprint Goals Board — diagnostic de chargement v1",
      `Version : ${run.version}`,
      `Date : ${new Date(run.startedAt).toISOString()}`,
      "Périmètre : depuis le démarrage du document de l'extension ; la navigation Jira précédente est hors mesure.",
      `Action : ${run.kind === "opening" ? "ouverture" : "actualisation"}`,
      `État : ${run.status}`,
      `Board : ${run.boardType ?? "non déterminé"} ; tickets : ${run.issues ?? "?"} ; objectifs : ${run.goals ?? "?"}`,
      `Temps écoulé : ${Math.round(elapsed)} ms`,
      `Données prêtes : ${timing(run.dataReadyMs)} ; board affiché : ${timing(run.visibleMs)}`,
      "Board affiché : mesure après deux frames, estimation du rendu navigateur.",
      `Requêtes : ${requests.length} tentatives ; nouvelles tentatives : ${requests.filter((span) => (span.attempt ?? 1) > 1).length} ; attentes : ${run.spans.filter((span) => span.kind === "wait").length}`,
      `Erreurs de requête : ${requests.filter((span) => span.error !== null).length} ; phases en erreur : ${run.spans.filter((span) => span.kind === "phase" && span.error !== null).length}`,
      `Mesures non détaillées (limite ${MAX_LOAD_SPANS}) : ${run.truncated}`,
      ...(run.truncated > 0
        ? [
            "Les compteurs de requêtes, reprises, attentes et erreurs portent uniquement sur les mesures détaillées ; ils sont partiels.",
          ]
        : []),
      "Chronologie : départ relatif et durée, en ms. Les appels parallèles ne s'additionnent pas au temps total.",
      "Les durées des requêtes incluent le réseau, la lecture de la réponse et son décodage.",
      "Un chargement terminé peut inclure des erreurs récupérées ou des phases complémentaires en échec ; voir leur détail ci-dessous.",
      ...run.spans.map((span) => {
        const details = [
          `+${Math.round(span.startMs)} ms`,
          LOAD_SPAN_LABELS[span.label],
          span.durationMs === null ? "en cours" : `${Math.round(span.durationMs)} ms`,
          span.status,
          ...(span.request === null ? [] : [`appel ${span.request}`]),
          ...(span.attempt === null ? [] : [`tentative ${span.attempt}`]),
          ...(span.delayMs === null ? [] : [`attente prévue ${Math.round(span.delayMs)} ms`]),
          ...(span.httpStatus === null ? [] : [`HTTP ${span.httpStatus}`]),
          ...(span.error === null ? [] : [`erreur ${span.error}`]),
        ];
        return details.join(" | ");
      }),
      "Rapport local : aucun nom, URL, JQL, contenu de ticket, identifiant Jira ou message d'erreur brut.",
    ];
    return lines.join("\n");
  }

  copyReport(run?: LoadRun): Promise<void> {
    return this.#platform.copyText(this.report(run));
  }

  #elapsed(run: LoadRun): number {
    return milliseconds(this.#clock() - this.#start + run.initialMs);
  }

  #span(
    kind: LoadSpan["kind"],
    label: LoadSpan["label"],
    runId?: string,
    extra: Partial<Pick<LoadSpan, "attempt" | "request" | "delayMs">> = {},
  ) {
    const run = this.current.peek();
    if (run?.status !== "loading" || (runId !== undefined && run.id !== runId)) return undefined;
    if (run.spans.length >= MAX_LOAD_SPANS) {
      this.current.value = { ...run, truncated: run.truncated + 1 };
      return undefined;
    }
    const span = { ...emptySpan(++this.#spanSequence, kind, label, this.#elapsed(run)), ...extra };
    this.current.value = { ...run, spans: [...run.spans, span] };
    return {
      finish: (error: LoadError | null, httpStatus: number | null) => {
        const current = this.current.peek();
        if (!current || current.id !== run.id || current.status !== "loading") return;
        this.current.value = {
          ...current,
          spans: current.spans.map(
            (entry): LoadSpan =>
              entry.id === span.id && entry.status === "running"
                ? {
                    ...entry,
                    durationMs: milliseconds(this.#elapsed(current) - entry.startMs),
                    status: error === null ? "ok" : "error",
                    error,
                    httpStatus,
                  }
                : entry,
          ),
        };
      },
    };
  }

  #remember(run: LoadRun): void {
    this.history.value = [run, ...this.history.peek().filter((item) => item.id !== run.id)].slice(
      0,
      MAX_HISTORY,
    );
    void this.#enqueue(() => this.#platform.store.set(LOAD_HISTORY_KEY, this.history.peek()));
  }

  #enqueue(work: () => Promise<void>, propagate = false): Promise<void> {
    const next = this.#queue.then(work);
    this.#queue = next.catch(() => {});
    return propagate ? next : this.#queue;
  }
}

function emptySpan(
  id: number,
  kind: LoadSpan["kind"],
  label: LoadSpan["label"],
  startMs: number,
): LoadSpan {
  return {
    id,
    kind,
    label,
    startMs,
    durationMs: null,
    status: "running",
    attempt: null,
    httpStatus: null,
    error: null,
    delayMs: null,
    request: null,
  };
}

function safeVersion(value: string): string {
  return /^\d{1,5}(?:\.\d{1,5}){1,3}$/.test(value) ? value : "0.0.0";
}
function milliseconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(86_400_000, value)) : 0;
}
function count(value: number): number {
  return Math.round(Math.max(0, Math.min(1_000_000_000, Number.isFinite(value) ? value : 0)));
}
function timing(value: number | null): string {
  return value === null ? "non mesuré" : `${Math.round(value)} ms`;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function number(value: unknown, max = 86_400_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}
function nullableNumber(value: unknown, max?: number): value is number | null {
  return value === null || number(value, max);
}
function member<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/** Reconstruction explicite : même des clés supplémentaires injectées en stockage ne sortent pas. */
function decodeRun(value: unknown): LoadRun | null {
  if (
    !record(value) ||
    typeof value.id !== "string" ||
    !/^\d{1,16}-\d{1,8}$/.test(value.id) ||
    typeof value.version !== "string" ||
    safeVersion(value.version) !== value.version ||
    !member(value.kind, ["opening", "refresh"]) ||
    !member(value.status, ["ok", "error", "cancelled"]) ||
    !number(value.startedAt, 8_640_000_000_000_000) ||
    !number(value.initialMs) ||
    !number(value.durationMs) ||
    !nullableNumber(value.dataReadyMs) ||
    !nullableNumber(value.visibleMs) ||
    (value.boardType !== null && !member(value.boardType, ["scrum", "kanban"])) ||
    !nullableNumber(value.issues, 1_000_000_000) ||
    !nullableNumber(value.goals, 1_000_000_000) ||
    !number(value.truncated, 1_000_000_000) ||
    !Array.isArray(value.spans) ||
    value.spans.length > MAX_LOAD_SPANS
  )
    return null;
  const spans = value.spans.map(decodeSpan);
  if (spans.some((span) => span === null)) return null;
  return {
    id: value.id,
    version: value.version,
    kind: value.kind,
    status: value.status,
    startedAt: value.startedAt,
    initialMs: value.initialMs,
    durationMs: value.durationMs,
    dataReadyMs: value.dataReadyMs,
    visibleMs: value.visibleMs,
    boardType: value.boardType,
    issues: value.issues,
    goals: value.goals,
    truncated: value.truncated,
    spans: spans as LoadSpan[],
  };
}

function decodeSpan(value: unknown): LoadSpan | null {
  if (
    !record(value) ||
    !number(value.id, MAX_LOAD_SPANS) ||
    !member(value.kind, ["phase", "request", "wait"]) ||
    !member(value.label, Object.keys(LOAD_SPAN_LABELS) as LoadSpan["label"][]) ||
    !number(value.startMs) ||
    !number(value.durationMs) ||
    !member(value.status, ["ok", "error", "cancelled"]) ||
    !nullableNumber(value.attempt, 1000) ||
    !nullableNumber(value.request, 1_000_000_000) ||
    !nullableNumber(value.httpStatus, 599) ||
    !nullableNumber(value.delayMs) ||
    (value.error !== null && !member(value.error, LOAD_ERRORS))
  )
    return null;
  if (
    (value.kind === "phase" && !Object.hasOwn(LOAD_PHASE_LABELS, value.label)) ||
    (value.kind === "request" && !member(value.label, ["get", "readPost", "graphql"])) ||
    (value.kind === "wait" && value.label !== "retry")
  )
    return null;
  return {
    id: value.id,
    kind: value.kind,
    label: value.label,
    startMs: value.startMs,
    durationMs: value.durationMs,
    status: value.status,
    attempt: value.attempt,
    request: value.request,
    httpStatus: value.httpStatus,
    error: value.error,
    delayMs: value.delayMs,
  };
}
