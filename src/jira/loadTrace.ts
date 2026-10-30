import { JiraError } from "./errors";

// Libellés affichés : côté app (`app/model/LoadDiagnostics.ts`), jamais dans la couche Jira.
export type LoadPhase =
  | "startup"
  | "structure"
  | "statuses"
  | "fields"
  | "types"
  | "settings"
  | "user"
  | "sprints"
  | "issues"
  | "goalSettings"
  | "goals"
  | "assemble"
  | "filters"
  | "colors";

/** Mesures facultatives : aucune donnée Jira ni message d'erreur brut. */
export interface LoadTrace {
  measure<T>(phase: LoadPhase, work: () => Promise<T>): Promise<T>;
  measureSync<T>(phase: LoadPhase, work: () => T): T;
}

export const LOAD_ERRORS = [
  "offline",
  "timeout",
  "invalidSiteUrl",
  "untrustedSiteHost",
  "unauthorized",
  "xsrf",
  "forbidden",
  "notFound",
  "rateLimited",
  "serviceUnavailable",
  "badRequest",
  "redirected",
  "graphql",
  "decoding",
  "propertyTooLarge",
  "unexpected",
  "other",
] as const;
export type LoadError = (typeof LOAD_ERRORS)[number];

export function loadError(error: unknown): LoadError {
  return error instanceof JiraError ? error.info.kind : "other";
}

export type ReadKind = "get" | "readPost" | "graphql";
export interface ReadResult {
  readonly status: number | null;
  readonly error: LoadError | null;
}
export interface ReadObserver {
  attempt(attempt: number): { finish(result: ReadResult): void } | undefined;
  wait(delayMs: number): { finish(): void } | undefined;
}
/** Appelé une fois par lecture logique ; son résultat suit toutes les tentatives de celle-ci. */
export type ObserveRead = (kind: ReadKind) => ReadObserver | undefined;

export type LoadSpanLabel = LoadPhase | "get" | "readPost" | "graphql" | "retry";

export interface LoadSpan {
  readonly id: number;
  readonly kind: "phase" | "request" | "wait";
  readonly label: LoadSpanLabel;
  readonly startMs: number;
  readonly durationMs: number | null;
  readonly status: "running" | "ok" | "error" | "cancelled";
  readonly attempt: number | null;
  readonly httpStatus: number | null;
  readonly error: LoadError | null;
  readonly delayMs: number | null;
  readonly request: number | null;
}

export interface LoadRun {
  readonly id: string;
  readonly version: string;
  readonly kind: "opening" | "refresh";
  readonly startedAt: number;
  readonly initialMs: number;
  readonly status: "loading" | "ok" | "error" | "cancelled";
  readonly durationMs: number | null;
  readonly dataReadyMs: number | null;
  readonly visibleMs: number | null;
  readonly boardType: "scrum" | "kanban" | null;
  readonly issues: number | null;
  readonly goals: number | null;
  readonly spans: readonly LoadSpan[];
  readonly truncated: number;
}
