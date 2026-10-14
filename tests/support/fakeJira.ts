import type { JiraSite } from "../../src/jira/site";
import type { FetchLike } from "../../src/jira/transport";

// Faux Jira pour les tests : rejoue des réponses et enregistre ce que l'extension a émis.
// Transport Jira fictif. N'est jamais importé par src/.

export const ACME: JiraSite = {
  origin: "https://acme.atlassian.net",
  host: "acme.atlassian.net",
  permissionPattern: "https://acme.atlassian.net/*",
};

export interface RecordedRequest {
  readonly method: string;
  readonly url: URL;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly init: RequestInit;
}

export type Reply =
  | { status: number; json?: unknown; text?: string; headers?: Record<string, string> }
  | { redirect: true }
  | { networkError: string }
  | { hang: true };

type Responder = Reply | ((request: RecordedRequest) => Reply);

export const XSRF_REFUSAL: Reply = { status: 403, text: "XSRF check failed" };

export class FakeJira {
  readonly requests: RecordedRequest[] = [];
  readonly #routes = new Map<string, Responder[]>();

  /** Réponses successives pour une route ; la dernière se répète. */
  on(method: string, path: string, ...replies: Responder[]): this {
    this.#routes.set(`${method} ${path}`, replies);
    return this;
  }

  sent(method: string, path?: string): RecordedRequest[] {
    return this.requests.filter(
      (r) => r.method === method && (path === undefined || r.path === path),
    );
  }

  readonly fetch: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    const request: RecordedRequest = {
      method: init.method ?? "GET",
      url: parsed,
      path: parsed.pathname,
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      init,
    };
    this.requests.push(request);

    const queue = this.#routes.get(`${request.method} ${request.path}`);
    if (!queue || queue.length === 0) {
      throw new Error(`FakeJira : route non prévue ${request.method} ${request.path}`);
    }
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const reply = typeof next === "function" ? next(request) : (next as Reply);

    if ("networkError" in reply) throw new TypeError(reply.networkError);
    if ("hang" in reply) {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    }
    if ("redirect" in reply) {
      return {
        type: "opaqueredirect",
        status: 0,
        headers: new Headers(),
        text: async () => "",
      } as Response;
    }
    const text = reply.text ?? (reply.json === undefined ? "" : JSON.stringify(reply.json));
    const hasBody = reply.status !== 204 && reply.status !== 304;
    return new Response(hasBody ? text : null, {
      status: reply.status,
      headers: reply.headers ?? {},
    });
  };
}

/** Écriture émise : tout sauf GET et sauf les lectures GraphQL (POST d'un document « query »). */
export function isWriteRequest(request: RecordedRequest): boolean {
  if (request.method === "GET") return false;
  if (
    request.method === "POST" &&
    ["/rest/api/3/jql/parse", "/rest/api/3/jql/match"].includes(request.path)
  )
    return false;
  const query = (request.body as { query?: unknown } | null)?.query;
  return !(
    request.path === "/gateway/api/graphql" &&
    typeof query === "string" &&
    query.trimStart().startsWith("query")
  );
}
