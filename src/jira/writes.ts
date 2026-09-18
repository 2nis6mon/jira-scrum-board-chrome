import { ENTITY_PROPERTY_LIMIT_BYTES, JiraError } from "./errors";
import type { JsonObject } from "./json";

/**
 * INVENTAIRE EXHAUSTIF des écritures REST de l'extension dans Jira.
 *
 * Le transport n'accepte d'écrire que ce que ce type sait exprimer : une écriture absente
 * d'ici est impossible à émettre. En particulier, RIEN ici ne permet de cibler
 * `POST|PUT /rest/agile/1.0/sprint/{id}` : le champ « Sprint Goal » du sprint appartient à
 * l'équipe et n'est jamais réécrit.
 *
 * Catégories validées : propriété de sprint, lien ticket↔Goal, transition, rang.
 * Étape 1 : seule la propriété de sprint existe (diagnostic). Transition, rang et lien
 * ticket↔Goal s'ajouteront ici à l'étape 4, et nulle part ailleurs.
 */
export type JiraWrite =
  | { kind: "sprintProperty.put"; sprintId: number; key: SprintPropertyKey; value: JsonObject }
  | { kind: "sprintProperty.delete"; sprintId: number; key: SprintPropertyKey };

/**
 * Clés de propriété de sprint, identiques à celles de l'app Mac pour que les deux
 * applications partagent l'épinglage des objectifs.
 */
export const SPRINT_PROPERTY_KEYS = {
  /** Sélection d'objectifs épinglés au sprint. */
  goals: "com.scrumboardmac.sprintgoals.v1",
  /** Propriété technique du test d'écriture : écrite puis supprimée aussitôt. */
  diagnostic: "com.scrumboardmac.diagnostic",
} as const;

export type SprintPropertyKey = (typeof SPRINT_PROPERTY_KEYS)[keyof typeof SPRINT_PROPERTY_KEYS];

export interface WriteRequest {
  readonly method: "PUT" | "DELETE";
  readonly path: string;
  readonly body: string | null;
  /** Désignation lisible de la ressource, pour les messages d'erreur. */
  readonly resource: string;
}

export function sprintPropertyPath(sprintId: number, key: SprintPropertyKey): string {
  assertEntityId(sprintId, "sprint");
  return `/rest/agile/1.0/sprint/${sprintId}/properties/${key}`;
}

/** Seul endroit où une écriture REST prend la forme d'une requête HTTP. */
export function buildWriteRequest(write: JiraWrite): WriteRequest {
  switch (write.kind) {
    case "sprintProperty.put": {
      const body = JSON.stringify(write.value);
      const bytes = new TextEncoder().encode(body).length;
      if (bytes > ENTITY_PROPERTY_LIMIT_BYTES) {
        throw new JiraError({
          kind: "propertyTooLarge",
          bytes,
          limit: ENTITY_PROPERTY_LIMIT_BYTES,
        });
      }
      return {
        method: "PUT",
        path: sprintPropertyPath(write.sprintId, write.key),
        body,
        resource: `la propriété « ${write.key} » du sprint ${write.sprintId}`,
      };
    }
    case "sprintProperty.delete":
      return {
        method: "DELETE",
        path: sprintPropertyPath(write.sprintId, write.key),
        body: null,
        resource: `la propriété « ${write.key} » du sprint ${write.sprintId}`,
      };
  }
}

export function assertEntityId(id: number, what: string): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new JiraError({
      kind: "decoding",
      context: `identifiant de ${what}`,
      detail: String(id),
    });
  }
}
