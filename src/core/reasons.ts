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
  | { readonly code: "planningDuplicateSelection" }
  | { readonly code: "planningExistingIssuesKept" }
  | { readonly code: "planningIssueUnavailable"; readonly issueKey: string }
  | { readonly code: "planningGoalTextUnconfirmed" }
  | { readonly code: "planningIssueLeftBacklog" }
  | { readonly code: "planningAdditionsUnconfirmed" }
  | { readonly code: "planningLinksChanged" }
  | { readonly code: "planningLinksUnconfirmed" }
  | { readonly code: "planningFinalCheckChanged" }
  | { readonly code: "planningSprintChanged" }
  | { readonly code: "planningInvalidGoals" }
  | { readonly code: "planningLinkMismatch" };

/** Erreur typée de `core` : son `message` est le code, jamais une phrase. */
export class CoreError extends Error {
  readonly reason: CoreReason;

  constructor(reason: CoreReason) {
    super(reason.code);
    this.name = "CoreError";
    this.reason = reason;
  }
}
