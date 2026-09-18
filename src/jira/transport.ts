import { JiraError } from "./errors";
import { isRecord, type JsonObject, type JsonValue } from "./json";
import type { JiraSite } from "./site";
import { buildGraphqlWrite, buildWriteRequest, type GraphqlWrite, type JiraWrite } from "./writes";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * En-tête `X-Atlassian-Token`. Jira peut refuser (403 « XSRF check failed ») une requête
 * venant d'une origine `chrome-extension://`. « no-check » est la parade documentée par
 * Atlassian ; son effet sur Jira Cloud depuis une extension reste à constater sur une
 * instance réelle, d'où ce réglage.
 */
export type AtlassianTokenHeader = "absent" | "no-check";

export interface JiraResponse {
  readonly status: number;
  /** Corps JSON décodé, `null` si la réponse n'en a pas (204). */
  readonly body: JsonValue | null;
}

export interface RequestOptions {
  readonly query?: Readonly<Record<string, string>>;
  /** Désignation lisible de la ressource, pour les messages d'erreur. */
  readonly resource: string;
  readonly atlassianToken?: AtlassianTokenHeader;
}

export interface TransportOptions {
  readonly site: JiraSite;
  readonly fetch: FetchLike;
  readonly timeoutMs?: number;
  /** Tentatives pour une LECTURE par GET. Les écritures n'en ont jamais qu'une. */
  readonly maxGetAttempts?: number;
  readonly atlassianToken?: AtlassianTokenHeader;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** POST qui ne sont que des lectures. Tout autre POST passe par `JiraWrite`. */
const READ_POST_PATHS = ["/rest/api/3/jql/parse"] as const;
export type ReadPostPath = (typeof READ_POST_PATHS)[number];

export const GRAPHQL_PATH = "/gateway/api/graphql";

/** Au-delà, une « icône » n'en est pas une : elle n'est pas chargée. */
export const MAX_IMAGE_BYTES = 256 * 1024;

/**
 * Couche HTTP unique de l'extension : le seul endroit qui appelle `fetch`.
 *
 * - Authentification par la session Jira du navigateur (`credentials: "include"`) :
 *   l'extension ne voit ni mot de passe ni jeton.
 * - Un seul hôte : toute URL qui sortirait du site est refusée avant l'envoi.
 * - Les redirections ne sont jamais suivies.
 * - Une écriture n'est JAMAIS rejouée. Seul un GET peut l'être, sur erreur transitoire.
 */
export class JiraTransport {
  readonly site: JiraSite;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #maxGetAttempts: number;
  readonly #atlassianToken: AtlassianTokenHeader;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(options: TransportOptions) {
    this.site = options.site;
    this.#fetch = options.fetch;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#maxGetAttempts = Math.max(1, options.maxGetAttempts ?? 3);
    this.#atlassianToken = options.atlassianToken ?? "absent";
    this.#sleep =
      options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  async get(path: string, options: RequestOptions): Promise<JiraResponse> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.#send("GET", path, null, options);
      } catch (error) {
        if (!(error instanceof JiraError) || !error.isRetryable) throw error;
        if (attempt >= this.#maxGetAttempts) throw error;
        await this.#sleep(backoffMs(attempt, error));
      }
    }
  }

  /** POST en lecture seule, limité à une liste fermée de chemins. Une seule tentative. */
  async readByPost(
    path: ReadPostPath,
    body: JsonObject,
    options: RequestOptions,
  ): Promise<JiraResponse> {
    if (!READ_POST_PATHS.includes(path)) {
      throw new Error(`POST de lecture non répertorié : ${path}`);
    }
    return this.#send("POST", path, JSON.stringify(body), options);
  }

  /**
   * Requête GraphQL de LECTURE. Un document qui n'est pas une `query` est refusé : les deux
   * mutations autorisées (lien ticket↔Goal) auront leur propre entrée à l'étape 4.
   */
  async graphqlQuery(
    operation: string,
    variables: JsonObject,
    options: RequestOptions,
  ): Promise<JiraResponse> {
    if (!isReadOnlyGraphql(operation)) {
      throw new Error("Seules les requêtes GraphQL de lecture (query) passent par graphqlQuery.");
    }
    const body = JSON.stringify({ query: operation, variables });
    return this.#send("POST", GRAPHQL_PATH, body, options);
  }

  /**
   * Écriture GraphQL de l'inventaire fermé `GraphqlWrite` (lien ticket↔Goal). Une seule tentative.
   * La réponse est rendue telle quelle : GraphQL répond 200 même quand il refuse, le corps fait foi.
   */
  async graphqlWrite(write: GraphqlWrite): Promise<JiraResponse> {
    const request = buildGraphqlWrite(write);
    const body = JSON.stringify({ query: request.operation, variables: request.variables });
    return this.#send("POST", GRAPHQL_PATH, body, { resource: request.resource });
  }

  /** Écriture REST. Une seule tentative, quelle que soit l'erreur. */
  async write(
    write: JiraWrite,
    options?: Pick<RequestOptions, "atlassianToken">,
  ): Promise<JiraResponse> {
    const request = buildWriteRequest(write);
    return this.#send(request.method, request.path, request.body, {
      resource: request.resource,
      ...(options?.atlassianToken ? { atlassianToken: options.atlassianToken } : {}),
    });
  }

  /**
   * Télécharge une image du site Jira (icône de type, de priorité). Ces adresses exigent la
   * session : chargées sans elle, l'icône n'apparaît jamais. Seules les URL du site lui-même sont
   * acceptées ; une image d'un autre hôte (avatar externe, par exemple) n'est jamais demandée.
   */
  async fetchImage(url: string): Promise<Blob> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new Error(`Adresse d'image invalide : ${url}`);
    }
    if (target.origin !== this.site.origin) {
      throw new Error(`Image hors du site Jira refusée : ${target.origin}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    let blob: Blob;
    try {
      response = await this.#fetch(target.toString(), {
        method: "GET",
        headers: { Accept: "image/*" },
        credentials: "include",
        redirect: "manual",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (response.type === "opaqueredirect" || response.status < 200 || response.status >= 300) {
        throw new JiraError({ kind: "unexpected", status: response.status, bodyExcerpt: "" });
      }
      blob = await response.blob();
    } catch (error) {
      if (error instanceof JiraError) throw error;
      if (controller.signal.aborted) throw new JiraError({ kind: "timeout" });
      throw new JiraError({
        kind: "offline",
        underlying: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }

    const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
    if (!type.startsWith("image/")) {
      throw new JiraError({ kind: "decoding", context: "image", detail: type || "type absent" });
    }
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new JiraError({ kind: "decoding", context: "image", detail: `${blob.size} octets` });
    }
    return blob;
  }

  async #send(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body: string | null,
    options: RequestOptions,
  ): Promise<JiraResponse> {
    const url = this.#url(path, options.query);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== null) headers["Content-Type"] = "application/json";
    if ((options.atlassianToken ?? this.#atlassianToken) === "no-check") {
      headers["X-Atlassian-Token"] = "no-check";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body,
        credentials: "include",
        redirect: "manual",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      text = response.type === "opaqueredirect" ? "" : await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw new JiraError({ kind: "timeout" });
      const underlying = error instanceof Error ? error.message : String(error);
      throw new JiraError({ kind: "offline", underlying });
    } finally {
      clearTimeout(timer);
    }

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      throw new JiraError({ kind: "redirected" });
    }
    if (response.status >= 200 && response.status < 300) {
      return { status: response.status, body: parseBody(text, options.resource) };
    }
    throw mapHttpError(response.status, text, response.headers, options.resource);
  }

  #url(path: string, query: Readonly<Record<string, string>> | undefined): string {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error(`Chemin Jira invalide : ${path}`);
    }
    const url = new URL(path, this.site.origin);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    // Défense en profondeur : rien ne part vers un autre hôte que le site autorisé.
    if (url.origin !== this.site.origin) {
      throw new Error(`Requête hors du site Jira refusée : ${url.origin}`);
    }
    return url.toString();
  }
}

/** Vrai si le document ne contient que des opérations `query`. */
export function isReadOnlyGraphql(operation: string): boolean {
  const withoutComments = operation.replace(/#[^\n]*/g, " ");
  if (/\b(mutation|subscription)\b/.test(withoutComments)) return false;
  return /^\s*query\b/.test(withoutComments);
}

function parseBody(text: string, resource: string): JsonValue | null {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as JsonValue;
  } catch (error) {
    throw new JiraError({
      kind: "decoding",
      context: resource,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function excerpt(text: string): string {
  return text.slice(0, 400);
}

function mapHttpError(status: number, text: string, headers: Headers, resource: string): JiraError {
  let messages: string[] = [];
  let fieldErrors: Record<string, string> = {};
  try {
    const payload: unknown = JSON.parse(text);
    if (isRecord(payload)) {
      if (Array.isArray(payload.errorMessages)) {
        messages = payload.errorMessages.filter((m): m is string => typeof m === "string");
      }
      if (isRecord(payload.errors)) {
        fieldErrors = Object.fromEntries(
          Object.entries(payload.errors).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
      }
    }
  } catch {
    // Corps non JSON : seul l'extrait brut sera remonté.
  }

  switch (status) {
    case 400:
      return new JiraError({ kind: "badRequest", messages, fieldErrors });
    case 401:
      return new JiraError({ kind: "unauthorized" });
    case 403:
      // Le refus XSRF vise l'origine de la requête, pas les droits du compte : on le distingue.
      if (/xsrf/i.test(text)) return new JiraError({ kind: "xsrf", bodyExcerpt: excerpt(text) });
      return new JiraError({
        kind: "forbidden",
        detail: messages[0] ?? Object.values(fieldErrors)[0] ?? null,
        bodyExcerpt: excerpt(text),
        responseHints: responseHints(headers),
      });
    case 404:
      return new JiraError({ kind: "notFound", resource });
    case 429: {
      const retryAfter = Number(headers.get("Retry-After"));
      return new JiraError({
        kind: "rateLimited",
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      });
    }
    default:
      if (status >= 500 && status <= 599) {
        return new JiraError({ kind: "serviceUnavailable", status });
      }
      if (messages.length > 0 || Object.keys(fieldErrors).length > 0) {
        return new JiraError({ kind: "badRequest", messages, fieldErrors });
      }
      return new JiraError({ kind: "unexpected", status, bodyExcerpt: excerpt(text) });
  }
}

/**
 * En-têtes de réponse qui aident à comprendre un refus, s'ils sont présents. Aucun n'identifie
 * l'utilisateur ni le site.
 */
function responseHints(headers: Headers): string {
  const hints: string[] = [];
  headers.forEach((value, name) => {
    if (name === "content-type" || name === "www-authenticate" || name.startsWith("x-failure")) {
      hints.push(`${name}: ${value}`);
    }
  });
  return hints.sort().join(" ; ");
}

function backoffMs(attempt: number, error: JiraError): number {
  let seconds = 2 ** (attempt - 1) * 0.6;
  if (error.info.kind === "rateLimited" && error.info.retryAfterSeconds !== null) {
    seconds = Math.max(seconds, error.info.retryAfterSeconds);
  }
  return Math.min(seconds, 15) * 1000;
}
