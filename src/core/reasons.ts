/**
 * Raisons typées des refus et échecs de `core`. `core` n'écrit aucune phrase destinée à
 * l'utilisateur : il nomme ce qui s'est passé, avec ses paramètres (clé de ticket, contenu Jira,
 * erreur d'origine), et `app/model/coreText.ts` en fait un message du catalogue.
 */

/** Lectures des Goals Atlassian dont l'échec est signalé. */
export type GoalsOperation = "boardSearch" | "siteSearch" | "workItems" | "labels";

/** Lecture partielle des Goals Atlassian : le board s'affiche, il manque quelque chose. */
export type GoalsWarning =
  | { readonly kind: "failed"; readonly operation: GoalsOperation; readonly error: unknown }
  /** Réserve de la lecture `workItems`, dite par le client Goals. */
  | { readonly kind: "workItemsIssue"; readonly issue: string };

/** Pourquoi le champ natif Goals ne permet pas de compléter les liens des tickets. */
export interface GoalsFieldGap {
  /** `null` : le champ n'a pas été identifié dans la structure du board. */
  readonly goalFieldId: string | null;
}

export type CoreReason =
  // ─── Écritures du board ───────────────────────────────────────────────────
  | { readonly code: "goalGone" }
  | { readonly code: "rankRefused"; readonly issueKey: string }
  | { readonly code: "sprintGoalsUnreadable"; readonly reason: "notObject" | "unknownFormat" }
  | { readonly code: "teamSettingsNotObject" }
  | { readonly code: "teamSettingsUnknownFormat" }
  // ─── Lecture des objectifs ────────────────────────────────────────────────
  | {
      readonly code: "goalsReadFailed";
      readonly warning: GoalsWarning;
      readonly gap: GoalsFieldGap | null;
    }
  | { readonly code: "kanbanGoalsUnavailable" }
  | { readonly code: "kanbanGoalsFailed"; readonly error: unknown }
  // ─── Sprint Planning ──────────────────────────────────────────────────────
  | { readonly code: "planningOtherSprint" }
  | { readonly code: "planningUnreadableProperty" }
  /** Le texte des objectifs écrit n'a pas été relu tel quel dans Jira. */
  | { readonly code: "planningGoalTextUnconfirmed" }
  /** La propriété du sprint écrite n'a pas été relue telle quelle dans Jira. */
  | { readonly code: "planningPropertyUnconfirmed" }
  /** Le ticket n'a pas été relu à sa nouvelle place après son ajout ou son retrait. */
  | { readonly code: "planningIssueUnconfirmed"; readonly issueKey: string }
  /** Atlassian a refusé le lien ticket ↔ Goal demandé par le planning. */
  | { readonly code: "planningGoalLinkRefused"; readonly messages: readonly string[] }
  /** Refus constaté par une relecture, après une première écriture confirmée. */
  | { readonly code: "planningRefused"; readonly refusal: PlanningRefusal };

/**
 * Pourquoi un geste du Sprint Planning n'écrit rien. `failed` : relecture impossible, propriété
 * illisible ou requête refusée avant l'envoi (taille, valeur).
 */
export type PlanningRefusal =
  | { readonly reason: "notFuture" }
  | { readonly reason: "goalTextChanged" }
  | { readonly reason: "goalsChanged" }
  | { readonly reason: "invalidGoals" }
  | { readonly reason: "issueUnavailable"; readonly issueKey: string }
  | { readonly reason: "issueInActiveSprint"; readonly issueKey: string }
  | { readonly reason: "issueNotInSprint"; readonly issueKey: string }
  | { readonly reason: "linkChanged"; readonly issueKey: string }
  | { readonly reason: "velocityChanged" }
  | { readonly reason: "invalidVelocity" }
  | { readonly reason: "sprintNotClosed" }
  /** Lot de plus de 50 tickets (limite de E9 et E10) : refusé avant toute écriture. */
  | { readonly reason: "batchTooLarge"; readonly count: number }
  | { readonly reason: "failed"; readonly error: unknown };

/** Erreur typée de `core` : son `message` est le code, jamais une phrase. */
export class CoreError extends Error {
  readonly reason: CoreReason;

  constructor(reason: CoreReason) {
    super(reason.code);
    this.name = "CoreError";
    this.reason = reason;
  }
}
