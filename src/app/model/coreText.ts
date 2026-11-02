import type { SettingError } from "../../core/boardSettings";
import { BoardSetupError, type GoalsIssue } from "../../core/boardSync";
import type { CardField } from "../../core/cardFields";
import type { QuickFilter } from "../../core/filters";
import {
  CoreError,
  type CoreReason,
  type GoalsWarning,
  type PlanningRefusal,
} from "../../core/reasons";
import type { PlanningOutcome, PlanningStep } from "../../core/sprintPlanning";
import type { TeamFamily } from "../../core/teamSettings";
import type { MessageKey } from "../../i18n";
import { JiraError } from "../../jira/errors";
import { BoardWriteRefused } from "../services/ports";
import { type AppMessage, message } from "./appMessage";

// Textes des résultats et erreurs typés de `core` : `core` nomme ce qui s'est passé, ce module en
// fait des messages du catalogue. Chaque phrase source est une clé de `src/i18n/`.

/** Message d'une erreur quelconque : raison typée de `core`, ou texte de la couche Jira. */
export function errorMessage(error: unknown): AppMessage {
  if (error instanceof CoreError) return reasonMessage(error.reason);
  if (error instanceof BoardSetupError) return boardSetupMessage(error);
  if (error instanceof BoardWriteRefused) return refusalMessage(error);
  return { text: error instanceof Error ? error.message : String(error) };
}

/** Suggestion d'une erreur de `core` ; `null` si `core` n'en prévoit pas. */
export function errorSuggestion(error: CoreError | BoardSetupError): AppMessage | null {
  if (error instanceof BoardSetupError)
    return error.problem.kind === "unrecognizedUrl"
      ? message(
          "Collez l'adresse complète de votre board, par exemple https://societe.atlassian.net/jira/software/c/projects/ABC/boards/123",
        )
      : message("L'extension n'a accès qu'au site auquel vous êtes connecté.");
  switch (error.reason.code) {
    case "rankRefused":
      // Même suggestion qu'un refus de Jira (requête invalide).
      return message("Corrigez la demande dans Jira, puis actualisez.");
    case "sprintGoalsUnreadable":
    case "teamSettingsNotObject":
    case "teamSettingsUnknownFormat":
      // Même suggestion qu'une réponse Jira illisible.
      return message(
        "Signalez cette anomalie : la réponse de votre instance Jira ne correspond pas au format attendu.",
      );
    default:
      return null;
  }
}

/** Refus de la porte du board : rien n'est parti vers Jira, et l'entrée de journal le dit. */
function refusalMessage(error: BoardWriteRefused): AppMessage {
  return error.reason === "cannotEdit"
    ? message("Rien n'a été envoyé à Jira : il faut pouvoir modifier le board.")
    : message("Rien n'a été envoyé à Jira : le board a changé avant l'envoi.");
}

function boardSetupMessage(error: BoardSetupError): AppMessage {
  const problem = error.problem;
  return problem.kind === "unrecognizedUrl"
    ? message("Cette adresse ne désigne pas un board Jira.")
    : message("Ce board appartient à {p0}, pas à {p1}.", {
        p0: problem.found,
        p1: problem.expected,
      });
}

/** Raisons sans paramètre : un message fixe chacune. */
type PlainReason = Extract<
  CoreReason,
  {
    code:
      | "goalGone"
      | "kanbanGoalsUnavailable"
      | "planningOtherSprint"
      | "planningUnreadableProperty"
      | "planningGoalTextUnconfirmed"
      | "planningPropertyUnconfirmed";
  }
>;

const PLAIN_REASONS: Record<PlainReason["code"], MessageKey> = {
  goalGone: "Cet objectif n'existe plus dans le sprint. Actualisez le board.",
  kanbanGoalsUnavailable:
    "Lecture des Goals Atlassian indisponible : le board Kanban ne peut pas déterminer ses objectifs.",
  planningOtherSprint: "Jira a renvoyé un autre sprint.",
  planningUnreadableProperty:
    "La propriété des objectifs du sprint est illisible ou utilise une version inconnue. Elle ne sera pas écrasée.",
  planningGoalTextUnconfirmed: "Le texte des objectifs n’a pas été confirmé par Jira.",
  planningPropertyUnconfirmed:
    "Jira n'a pas relu la propriété des objectifs du sprint telle qu'elle a été écrite.",
};

function isPlainReason(reason: CoreReason): reason is PlainReason {
  return Object.hasOwn(PLAIN_REASONS, reason.code);
}

/** Correspondance exhaustive : une nouvelle raison sans message ne compile pas. */
export function reasonMessage(reason: CoreReason): AppMessage {
  if (isPlainReason(reason)) return message(PLAIN_REASONS[reason.code]);
  switch (reason.code) {
    case "rankRefused":
      return message("Jira a refusé de classer {p0}.", { p0: reason.issueKey });
    case "sprintGoalsUnreadable":
      return message("Réponse Jira inattendue ({p0}).", {
        p0: message(
          reason.reason === "notObject"
            ? "propriété des objectifs du sprint : objet JSON attendu, rien n'a été écrit"
            : "propriété des objectifs du sprint : version inconnue ou illisible, rien n'a été écrit",
        ),
      });
    case "teamSettingsNotObject":
      return message("Réponse Jira inattendue ({p0}).", {
        p0: message("réglages d'équipe du board : objet JSON attendu, rien n'a été écrit"),
      });
    case "teamSettingsUnknownFormat":
      return message("Réponse Jira inattendue ({p0}).", {
        p0: message("réglages d'équipe du board dans un format inconnu (version plus récente ?)"),
      });
    case "goalsReadFailed":
      if (reason.gap === null) return goalsWarningMessage(reason.warning);
      return message("Tickets rattachés aux objectifs : {p0}. {p1}", {
        p0:
          reason.warning.kind === "workItemsIssue"
            ? { text: reason.warning.issue }
            : errorMessage(reason.warning.error),
        p1:
          reason.gap.goalFieldId === null
            ? message("Le champ Goals Jira n'a pas été identifié ; relisez la structure du board.")
            : message("Le champ Goals Jira est absent de certains tickets du board ({p0}).", {
                p0: reason.gap.goalFieldId,
              }),
      });
    case "kanbanGoalsFailed":
      return message("Objectifs du board Kanban indisponibles : {p0}", {
        p0: goalsFailureMessage(reason.error),
      });
    case "planningIssueUnconfirmed":
      return message("Jira n'a pas relu {p0} à sa nouvelle place.", { p0: reason.issueKey });
    case "planningGoalLinkRefused":
      return reason.messages.length > 0
        ? message("Atlassian a refusé le rattachement au Goal : {p0}", {
            p0: reason.messages.join(" ; "),
          })
        : message("Atlassian a refusé le rattachement au Goal.");
    case "planningRefused":
      return planningRefusalCause(reason.refusal);
    default:
      return unhandled(reason);
  }
}

function unhandled(reason: never): never {
  throw new Error(`Raison sans message : ${JSON.stringify(reason)}`);
}

const GOALS_OPERATIONS = {
  boardSearch: "Recherche des objectifs du board : {p0}",
  siteSearch: "Recherche des objectifs du site : {p0}",
  workItems: "Tickets rattachés aux objectifs : {p0}",
  labels: "Libellés des objectifs : {p0}",
} as const satisfies Record<string, MessageKey>;

/** Lecture partielle des Goals Atlassian. */
export function goalsWarningMessage(warning: GoalsWarning): AppMessage {
  return warning.kind === "workItemsIssue"
    ? message("Tickets rattachés aux objectifs : {p0}", { p0: { text: warning.issue } })
    : message(GOALS_OPERATIONS[warning.operation], { p0: errorMessage(warning.error) });
}

/** Cause d'un échec de lecture des Goals, dite dans les termes de ce qui s'est passé. */
export function goalsFailureMessage(error: unknown): AppMessage {
  if (
    error instanceof JiraError &&
    error.info.kind === "forbidden" &&
    /cors/i.test(error.info.bodyExcerpt)
  ) {
    return message(
      "la passerelle GraphQL d'Atlassian refuse l'origine des requêtes de l'extension (« Invalid CORS request »). Site Jira → Diagnostic, en bas de la barre latérale, essaie les variantes de l'en-tête Origin et retient celle qui passe.",
    );
  }
  return errorMessage(error);
}

/** Pourquoi le board s'est rabattu sur le texte du sprint. */
export function goalsIssueMessage(issue: GoalsIssue): AppMessage {
  return issue.kind === "unavailable"
    ? message("Lecture des Goals Atlassian indisponible.")
    : goalsFailureMessage(issue.error);
}

// ─── Sprint Planning ────────────────────────────────────────────────────────

const PLANNING_STEPS = {
  goalText: "texte des objectifs",
  goalProperty: "propriété des objectifs du sprint",
  issueAdded: "ticket ajouté au sprint",
  issueLinked: "ticket rattaché à son objectif",
  goalUnlinked: "ancien Goal retiré du ticket",
  issueMoved: "ticket retiré du sprint",
  pinned: "Goals épinglés au sprint",
  velocity: "vélocité de l'équipe",
} as const satisfies Record<PlanningStep, MessageKey>;

/** Refus suivis d'une relecture : la page est à jour, l'utilisateur refait son geste. */
const PLANNING_CONFLICTS: ReadonlySet<PlanningRefusal["reason"]> = new Set([
  "goalTextChanged",
  "goalsChanged",
  "linkChanged",
  "velocityChanged",
]);

/** Ce qu'une relecture a constaté, sans dire ce qui a été écrit. */
export function planningRefusalCause(refusal: PlanningRefusal): AppMessage {
  switch (refusal.reason) {
    case "notFuture":
      return message("Ce sprint n'est plus un sprint futur.");
    case "goalTextChanged":
      return message("Le texte des objectifs a changé dans Jira depuis son affichage.");
    case "goalsChanged":
      return message("Les objectifs du sprint ont changé dans Jira depuis leur affichage.");
    case "invalidGoals":
      return message(
        "Chaque objectif doit avoir un titre non vide sur une ligne, sans préfixe de liste.",
      );
    case "issueUnavailable":
      return message(
        "{p0} ne peut pas rejoindre le sprint : c'est une sous-tâche ou il est terminé.",
        { p0: refusal.issueKey },
      );
    case "issueInActiveSprint":
      return message("{p0} est dans le sprint actif : il y reste en consultation.", {
        p0: refusal.issueKey,
      });
    case "issueNotInSprint":
      return message("{p0} n'est plus dans le sprint en préparation.", { p0: refusal.issueKey });
    case "linkChanged":
      return message("Le rattachement de {p0} a changé dans Jira depuis son affichage.", {
        p0: refusal.issueKey,
      });
    case "velocityChanged":
      return message("La vélocité a changé dans Jira depuis son affichage.");
    case "invalidVelocity":
      return message("La vélocité doit être un nombre positif ou nul.");
    case "sprintNotClosed":
      return message("Le sprint n'est pas clos dans Jira.");
    case "failed":
      return planningCause(refusal.error);
  }
}

function planningCause(error: unknown): AppMessage {
  return error instanceof Error ? errorMessage(error) : message("La vérification Jira a échoué.");
}

/** Refus d'un geste du planning : rien n'a été écrit. */
export function planningRefusalMessage(refusal: PlanningRefusal): AppMessage {
  // Refus de la porte du board : son message dit déjà que rien n'est parti.
  if (refusal.reason === "failed" && refusal.error instanceof BoardWriteRefused)
    return refusalMessage(refusal.error);
  return message(
    PLANNING_CONFLICTS.has(refusal.reason)
      ? "{p0} Rien n’a été écrit : la page a été relue, refaites votre modification."
      : "{p0} Rien n’a été écrit.",
    { p0: planningRefusalCause(refusal) },
  );
}

/** Résultat d'un geste du Sprint Planning, pour l'avis et le journal. */
export function planningOutcomeMessage(outcome: PlanningOutcome): AppMessage {
  switch (outcome.kind) {
    case "done":
      return message("Enregistré et vérifié dans Jira.");
    case "unchanged":
      return message("Jira porte déjà cette modification : rien n'a été écrit.");
    case "refused":
      return planningRefusalMessage(outcome.reason);
    case "partial": {
      // La porte a refusé la première écriture avant son envoi : rien n'est parti.
      if (outcome.confirmed.length === 0 && outcome.error instanceof BoardWriteRefused)
        return refusalMessage(outcome.error);
      const rest = message(
        "{p0} Aucune écriture n’a été rejouée ; la page a été relue dans Jira.",
        { p0: planningCause(outcome.error) },
      );
      return outcome.confirmed.length > 0
        ? message("Étapes confirmées : {p0}. {p1}", {
            p0: {
              list: outcome.confirmed.map((step) => message(PLANNING_STEPS[step])),
              separator: ", ",
            },
            p1: rest,
          })
        : message("Écriture non confirmée. {p0}", { p0: rest });
    }
  }
}

/** Report des objectifs non atteints après la clôture native, vers le sprint `target`. */
export function planningCarryOverMessage(outcome: PlanningOutcome, target: string): AppMessage {
  switch (outcome.kind) {
    case "done":
      return message("Objectifs non atteints reportés dans {p0}.", { p0: target });
    case "unchanged":
      return message("Sprint clos : aucun objectif non atteint à reporter.");
    case "refused":
    case "partial":
      return message("Report des objectifs non atteints : {p0}", {
        p0: planningOutcomeMessage(outcome),
      });
  }
}

// ─── Réglages et libellés ───────────────────────────────────────────────────

/** Saisie refusée d'un réglage du board. */
export function settingErrorMessage(error: SettingError): AppMessage {
  switch (error.field) {
    case "agingThreshold":
      return message(
        "Le seuil « vieillissant » doit être un nombre entier de jours, entre 1 et 365.",
      );
    case "dailyMinutes":
      return message(
        "La durée de la daily doit être un nombre entier de minutes, entre 1 et {p0}.",
        { p0: error.max },
      );
    case "dailyStock":
      return message(
        "Le nombre de cartes du stock en daily doit être un entier, entre 1 et {p0}.",
        { p0: error.max },
      );
  }
}

/** Familles de réglages d'équipe, dans les avis et le journal. */
export const TEAM_FAMILY_LABEL: Record<TeamFamily, MessageKey> = {
  issueTypes: "Types de tickets et swimlanes par type",
  buildAndAging: "Nom de Build, seuil de vieillissement",
  daily: "Daily : durée et stock",
  goalSource: "Source des objectifs",
  boardPinnedGoals: "Goals épinglés au board",
  goalColors: "Couleurs des objectifs",
  blockOrder: "Ordre des swimlanes",
  hiddenGoals: "Objectifs masqués",
  cardFields: "Champs des cartes",
  cardColorRules: "Règles de couleur des cartes",
};

/** Noms des couleurs d'objectif, dans l'ordre de la palette (`GOAL_COLOR_COUNT`). */
export const GOAL_COLOR_NAMES = [
  "Bleu",
  "Bleu ardoise",
  "Violet",
  "Orange",
  "Rose",
  "Indigo",
  "Framboise",
  "Ocre",
  "Ambre",
] as const satisfies readonly MessageKey[];

/** Noms affichés des couleurs de carte (`CARD_COLOR_PALETTE`). */
export const CARD_COLOR_LABEL: Record<string, MessageKey> = {
  blue: "Bleu",
  teal: "Turquoise",
  green: "Vert",
  yellow: "Jaune",
  orange: "Orange",
  red: "Rouge",
  pink: "Rose",
  purple: "Violet",
  gray: "Gris",
};

export const QUICK_FILTER_LABEL: Record<QuickFilter, MessageKey> = {
  blocked: "Bloqués",
  addedAfterStart: "Ajoutés",
  carriedOver: "Reportés",
};

/** Libellé complet, pour l'infobulle. */
export const QUICK_FILTER_HELP: Record<QuickFilter, MessageKey> = {
  blocked: "Tickets bloqués par un lien Jira « est bloqué par »",
  addedAfterStart: "Tickets ajoutés au sprint après son démarrage",
  carriedOver: "Tickets reportés du sprint précédent du board",
};

const CARD_FIELD_LABEL = {
  fixVersions: "Fix version",
  affectsVersions: "Affects version",
  labels: "Labels",
  components: "Composants",
} as const satisfies Record<Exclude<CardField["kind"], "custom">, MessageKey>;

/** Libellé d'un champ de carte : texte source, ou nom Jira d'un champ personnalisé. */
export function cardFieldLabel(field: CardField): string {
  return field.kind === "custom"
    ? (field.customFieldName ?? field.customFieldId)
    : CARD_FIELD_LABEL[field.kind];
}
