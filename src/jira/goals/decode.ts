import { JiraError } from "../errors";
import { isRecord, type JsonValue } from "../json";
import type { AtlassianGoal } from "../models";

/** Résultat d'une mutation de rattachement : GraphQL répond 200 même quand il refuse. */
export interface LinkOutcome {
  readonly success: boolean;
  readonly messages: string[];
}

/** Sous-champs acceptables pour tirer un libellé d'un champ composite. */
export const LABEL_CANDIDATES = ["label", "name", "displayName", "value", "text"];

/** `data` d'une réponse GraphQL ; ses `errors` sont remontées : GraphQL répond 200 même en échec. */
export function graphqlData(body: JsonValue | null): Record<string, JsonValue> {
  if (!isRecord(body)) {
    throw new JiraError({ kind: "decoding", context: "réponse GraphQL", detail: "objet attendu" });
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new JiraError({ kind: "graphql", messages: errorMessages(body.errors) });
  }
  if (!isRecord(body.data)) {
    throw new JiraError({
      kind: "decoding",
      context: "réponse GraphQL",
      detail: "champ « data » absent",
    });
  }
  return body.data;
}

/**
 * Résultat d'une mutation de rattachement. Des erreurs GraphQL de premier niveau (validation) ou
 * `success: false` valent refus explicite : rien n'a été écrit.
 */
export function linkOutcome(body: JsonValue | null, field: string): LinkOutcome {
  if (isRecord(body) && Array.isArray(body.errors) && body.errors.length > 0) {
    return { success: false, messages: errorMessages(body.errors) };
  }
  const data = isRecord(body) ? body.data : null;
  const payload = isRecord(data) ? data[field] : null;
  if (!isRecord(payload)) {
    throw new JiraError({ kind: "decoding", context: field, detail: "résultat absent" });
  }
  const errors = payload.errors;
  const messages = Array.isArray(errors)
    ? errorMessages(errors)
    : isRecord(errors) && typeof errors.message === "string"
      ? [errors.message]
      : [];
  return { success: payload.success === true, messages };
}

function errorMessages(errors: readonly JsonValue[]): string[] {
  return errors.flatMap((error) =>
    isRecord(error) && typeof error.message === "string" ? [error.message] : [],
  );
}

/** Objectif tel que la sélection découverte l'a rendu. Seul `id` est garanti. */
export function parseGoal(node: unknown): AtlassianGoal | null {
  if (!isRecord(node) || typeof node.id !== "string") return null;
  const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
  const label = (value: unknown) => {
    if (!isRecord(value)) return null;
    for (const key of LABEL_CANDIDATES) {
      const found = text(value[key]);
      if (found) return found;
    }
    return null;
  };
  return {
    id: node.id,
    key: text(node.key),
    name: text(node.name) ?? text(node.title) ?? text(node.summary),
    statusLabel: label(node.status) ?? label(node.state),
    ownerName: label(node.owner),
    // `targetDate` est scalaire sur certaines instances, composite sur d'autres.
    targetDate:
      text(node.targetDate) ?? label(node.targetDate) ?? text(node.dueDate) ?? label(node.dueDate),
    url: text(node.url),
    isArchived: node.isArchived === true,
  };
}

export interface WorkItemsPage {
  readonly keys: string[];
  /** Nombre brut : une clé illisible ne doit pas masquer une page potentiellement tronquée. */
  readonly itemCount: number;
  readonly pageInfo: unknown;
  readonly issue: string | null;
}

/** Connexion de tickets : distingue une liste vide d'une réponse illisible, sans état partagé. */
export function parseWorkItems(container: unknown): WorkItemsPage | null {
  if (!isRecord(container)) return null;
  if (!Array.isArray(container.edges) && !Array.isArray(container.nodes)) return null;
  const items = Array.isArray(container.edges)
    ? container.edges.map((edge) => (isRecord(edge) ? edge.node : null))
    : Array.isArray(container.nodes)
      ? container.nodes
      : [];
  const keys = items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const key = item.key ?? item.issueKey ?? item.id;
    return typeof key === "string" && key !== "" ? [key] : [];
  });
  return {
    keys,
    itemCount: items.length,
    pageInfo: container.pageInfo,
    issue:
      keys.length === items.length
        ? null
        : "certains liens d'un objectif ne fournissent pas de clé de ticket lisible",
  };
}
