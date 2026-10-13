import { ENTITY_PROPERTY_LIMIT_BYTES, JiraError } from "./errors";
import type { JsonObject } from "./json";

/**
 * INVENTAIRE EXHAUSTIF des écritures REST de l'extension dans Jira.
 *
 * Le transport n'accepte d'écrire que ce que ce type sait exprimer : une écriture absente
 * d'ici est impossible à émettre. Le Sprint Planning autorise uniquement le texte `goal`
 * et l'ajout de tickets : ni création, démarrage, clôture, dates ou nom de sprint.
 *
 * Catégories validées : propriété de sprint, lien ticket↔Goal, transition, rang, et (validée par
 * Denis le 19/09/2026) propriété du board pour les réglages d'équipe, publiés sur un geste
 * explicite. Le lien
 * ticket↔Goal Atlassian passe par deux mutations GraphQL : elles forment l'inventaire
 * `GraphqlWrite` plus bas, seul endroit où un document `mutation` existe.
 */
export type JiraWrite =
  | { kind: "sprint.goal"; sprintId: number; goal: string }
  | { kind: "sprint.issues.add"; sprintId: number; issueKeys: readonly string[] }
  | { kind: "sprintProperty.put"; sprintId: number; key: SprintPropertyKey; value: JsonObject }
  | { kind: "sprintProperty.delete"; sprintId: number; key: SprintPropertyKey }
  /** Réglages d'équipe du board, enregistrés sur chaque modification explicite. Jira répond 200 ou 201. */
  | { kind: "boardProperty.put"; boardId: number; key: BoardPropertyKey; value: JsonObject }
  /** Transition sans formulaire. Les champs requis sont saisis et envoyés par Jira lui-même. */
  | {
      kind: "issue.transition";
      issueKey: string;
      transitionId: string;
    }
  /** Rang du board (global) : juste avant, ou juste après, un autre ticket. 204 ou 207. */
  | { kind: "issue.rank"; issueKey: string; before: string }
  | { kind: "issue.rank"; issueKey: string; after: string };

/**
 * Clés persistées dans Jira : conserver ces noms pour relire les sprints existants.
 */
export const SPRINT_PROPERTY_KEYS = {
  /** Sélection d'objectifs épinglés au sprint. */
  goals: "com.scrumboardmac.sprintgoals.v1",
  /** Propriété technique du test d'écriture : écrite puis supprimée aussitôt. */
  diagnostic: "com.scrumboardmac.diagnostic",
} as const;

export type SprintPropertyKey = (typeof SPRINT_PROPERTY_KEYS)[keyof typeof SPRINT_PROPERTY_KEYS];

/**
 * Clés persistées du board : conserver les noms et le format des réglages existants.
 */
export const BOARD_PROPERTY_KEYS = {
  /** Réglages d'équipe du board (colonnes, types, couleurs, règles…). */
  teamSettings: "com.scrumboardmac.boardsettings.v1",
} as const;

export type BoardPropertyKey = (typeof BOARD_PROPERTY_KEYS)[keyof typeof BOARD_PROPERTY_KEYS];

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

export function boardPropertyPath(boardId: number, key: BoardPropertyKey): string {
  assertEntityId(boardId, "board");
  return `/rest/agile/1.0/board/${boardId}/properties/${key}`;
}

/** Corps JSON d'une propriété d'entité, dans la limite documentée par Atlassian. */
function propertyBody(value: JsonObject): string {
  const body = JSON.stringify(value);
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > ENTITY_PROPERTY_LIMIT_BYTES) {
    throw new JiraError({ kind: "propertyTooLarge", bytes, limit: ENTITY_PROPERTY_LIMIT_BYTES });
  }
  return body;
}

/** Seul endroit où une écriture REST prend la forme d'une requête HTTP. */
export function buildWriteRequest(write: JiraWrite): WriteRequest {
  switch (write.kind) {
    case "sprint.goal":
      assertEntityId(write.sprintId, "sprint");
      return {
        method: "POST",
        path: `/rest/agile/1.0/sprint/${write.sprintId}`,
        body: JSON.stringify({ goal: write.goal }),
        resource: `les objectifs du sprint ${write.sprintId}`,
      };
    case "sprint.issues.add":
      assertEntityId(write.sprintId, "sprint");
      if (
        write.issueKeys.length < 1 ||
        write.issueKeys.length > 50 ||
        new Set(write.issueKeys).size !== write.issueKeys.length
      ) {
        throw new JiraError({
          kind: "decoding",
          context: "ajout au sprint",
          detail: "1 à 50 tickets distincts attendus",
        });
      }
      for (const key of write.issueKeys) assertIssueKey(key);
      return {
        method: "POST",
        path: `/rest/agile/1.0/sprint/${write.sprintId}/issue`,
        body: JSON.stringify({ issues: [...write.issueKeys] }),
        resource: `les tickets du sprint ${write.sprintId}`,
      };
    case "sprintProperty.put":
      return {
        method: "PUT",
        path: sprintPropertyPath(write.sprintId, write.key),
        body: propertyBody(write.value),
        resource: `la propriété « ${write.key} » du sprint ${write.sprintId}`,
      };
    case "boardProperty.put":
      return {
        method: "PUT",
        path: boardPropertyPath(write.boardId, write.key),
        body: propertyBody(write.value),
        resource: `les réglages d'équipe du board ${write.boardId}`,
      };
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
        body: JSON.stringify({
          transition: { id: write.transitionId },
        }),
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
 * du schéma Atlassian). Le lien reste visible dans Jira ; rien n'est stocké par l'extension.
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
