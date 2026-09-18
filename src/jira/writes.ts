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
 * Catégories validées : propriété de sprint, lien ticket↔Goal, transition, rang. Le lien
 * ticket↔Goal Atlassian passe par deux mutations GraphQL : elles forment l'inventaire
 * `GraphqlWrite` plus bas, seul endroit où un document `mutation` existe.
 */
export type JiraWrite =
  | { kind: "sprintProperty.put"; sprintId: number; key: SprintPropertyKey; value: JsonObject }
  | { kind: "sprintProperty.delete"; sprintId: number; key: SprintPropertyKey }
  /** Transition de workflow, choisie parmi celles que Jira propose. Jira répond 204. */
  | { kind: "issue.transition"; issueKey: string; transitionId: string }
  /** Rang du board (global) : juste avant, ou juste après, un autre ticket. 204 ou 207. */
  | { kind: "issue.rank"; issueKey: string; before: string }
  | { kind: "issue.rank"; issueKey: string; after: string };

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
  readonly method: "POST" | "PUT" | "DELETE";
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
    case "issue.transition":
      assertIssueKey(write.issueKey);
      if (!/^\d+$/.test(write.transitionId)) {
        throw new JiraError({
          kind: "decoding",
          context: "identifiant de transition",
          detail: write.transitionId,
        });
      }
      return {
        method: "POST",
        path: `/rest/api/3/issue/${write.issueKey}/transitions`,
        body: JSON.stringify({ transition: { id: write.transitionId } }),
        resource: `la transition de ${write.issueKey}`,
      };
    case "issue.rank": {
      assertIssueKey(write.issueKey);
      const reference = "before" in write ? write.before : write.after;
      assertIssueKey(reference);
      if (reference === write.issueKey) {
        throw new JiraError({
          kind: "decoding",
          context: "classement",
          detail: "ticket de référence identique",
        });
      }
      // `rankCustomFieldId` est omis : Jira utilise le champ de rang par défaut de l'instance.
      const body =
        "before" in write
          ? { issues: [write.issueKey], rankBeforeIssue: write.before }
          : { issues: [write.issueKey], rankAfterIssue: write.after };
      return {
        method: "PUT",
        path: "/rest/agile/1.0/issue/rank",
        body: JSON.stringify(body),
        resource: `le classement de ${write.issueKey}`,
      };
    }
  }
}

/** Clé Jira (`ABC-123`) : seule forme admise dans un chemin ou un corps d'écriture. */
export function isIssueKey(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*-[1-9]\d*$/.test(value);
}

export function assertIssueKey(value: string): void {
  if (!isIssueKey(value)) {
    throw new JiraError({ kind: "decoding", context: "clé de ticket", detail: value });
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

/**
 * INVENTAIRE EXHAUSTIF des écritures GraphQL : poser ou retirer le lien NATIF entre un ticket et
 * un Goal Atlassian (mutations `goals_linkWorkItem` / `goals_unlinkWorkItem`, signature relevée
 * du schéma par l'app Mac). Le lien reste visible dans Jira ; rien n'est stocké par l'extension.
 */
export type GraphqlWrite =
  | { kind: "goal.link"; goalId: string; workItemId: string }
  | { kind: "goal.unlink"; goalId: string; workItemId: string };

export interface GraphqlWriteRequest {
  readonly operation: string;
  readonly variables: JsonObject;
  /** Nom du champ de la réponse qui porte le résultat. */
  readonly field: "goals_linkWorkItem" | "goals_unlinkWorkItem";
  readonly resource: string;
}

export function buildGraphqlWrite(write: GraphqlWrite): GraphqlWriteRequest {
  for (const value of [write.goalId, write.workItemId]) {
    if (value.trim() === "" || value.length > 500) {
      throw new JiraError({
        kind: "decoding",
        context: "identifiant de Goal ou de ticket",
        detail: value,
      });
    }
  }
  const variables: JsonObject = { input: { goalId: write.goalId, workItemId: write.workItemId } };
  if (write.kind === "goal.link") {
    return {
      operation: `mutation linkWorkItem($input: TownsquareGoalsLinkWorkItemInput!) {
  goals_linkWorkItem(input: $input) { success errors { message } }
}`,
      variables,
      field: "goals_linkWorkItem",
      resource: "le rattachement du ticket au Goal",
    };
  }
  return {
    operation: `mutation unlinkWorkItem($input: TownsquareGoalsUnlinkWorkItemInput!) {
  goals_unlinkWorkItem(input: $input) { success errors { message } }
}`,
    variables,
    field: "goals_unlinkWorkItem",
    resource: "le détachement du ticket de son Goal",
  };
}
