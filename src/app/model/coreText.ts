import type { SettingError } from "../../core/boardSettings";
import { BoardSetupError, type GoalsIssue } from "../../core/boardSync";
import type { CardField } from "../../core/cardFields";
import type { QuickFilter } from "../../core/filters";
import { CoreError, type CoreReason, type GoalsWarning } from "../../core/reasons";
import type { PlanningReason, PlanningStep } from "../../core/sprintPlanning";
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
      | "planningDuplicateSelection"
      | "planningExistingIssuesKept"
      | "planningGoalTextUnconfirmed"
      | "planningIssueLeftBacklog"
      | "planningAdditionsUnconfirmed"
      | "planningLinksChanged"
      | "planningLinksUnconfirmed"
      | "planningFinalCheckChanged"
      | "planningSprintChanged"
      | "planningInvalidGoals"
      | "planningLinkMismatch";
  }
>;

const PLAIN_REASONS: Record<PlainReason["code"], MessageKey> = {
  goalGone: "Cet objectif n'existe plus dans le sprint. Actualisez le board.",
  kanbanGoalsUnavailable:
    "Lecture des Goals Atlassian indisponible : le board Kanban ne peut pas déterminer ses objectifs.",
  planningOtherSprint: "Jira a renvoyé un autre sprint.",
  planningUnreadableProperty:
    "La propriété des objectifs du sprint est illisible ou utilise une version inconnue. Elle ne sera pas écrasée.",
  planningDuplicateSelection: "La sélection contient des doublons.",
  planningExistingIssuesKept: "Les tickets déjà présents dans le sprint doivent être conservés.",
  planningGoalTextUnconfirmed: "Le texte des objectifs n’a pas été confirmé par Jira.",
  planningIssueLeftBacklog: "Un ticket retenu a quitté le backlog pendant la publication.",
  planningAdditionsUnconfirmed: "Jira n’a pas confirmé tous les ajouts au sprint.",
  planningLinksChanged:
    "Les rattachements ont été modifiés par un collègue pendant la publication.",
  planningLinksUnconfirmed: "Les rattachements n’ont pas été confirmés par Jira.",
  planningFinalCheckChanged: "Le sprint a changé pendant la vérification finale.",
  planningSprintChanged: "Le sprint ou ses objectifs ont changé pendant la publication.",
  planningInvalidGoals:
    "Chaque objectif doit avoir un titre non vide sur une ligne, sans préfixe de liste.",
  planningLinkMismatch: "Un rattachement ne correspond plus à la sélection ou aux objectifs.",
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
    case "planningIssueUnavailable":
      return message(
        "{p0} n’est plus un ticket du backlog disponible. Les tickets actifs et sous-tâches ne sont pas déplacés.",
        { p0: reason.issueKey },
      );
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

function planningStepMessage(step: PlanningStep): AppMessage {
  switch (step.kind) {
    case "goalText":
      return message("texte des objectifs");
    case "issuesAdded":
      return message("{p0} ticket(s) ajouté(s)", { p0: step.count });
    case "links":
      return message("rattachements aux objectifs");
  }
}

function planningCause(error: unknown): AppMessage {
  return error instanceof Error ? errorMessage(error) : message("La vérification Jira a échoué.");
}

/** Résultat d'une publication du Sprint Planning. */
export function planningMessage(reason: PlanningReason): AppMessage {
  switch (reason.code) {
    case "published":
      return message("Planning publié et vérifié dans Jira. Le sprint reste à démarrer dans Jira.");
    case "suspended":
      return message("Publication suspendue : {p0}", { p0: planningCause(reason.error) });
    case "notFuture":
      return message("Ce sprint n’est plus futur. Rien n’a été écrit.");
    case "sprintChanged":
      return message(
        "Le sprint a changé dans Jira. Rechargez ses données avant de publier ; votre brouillon est conservé.",
      );
    case "refused":
      return message("{p0} Rien n’a été écrit.", { p0: planningCause(reason.error) });
    case "unconfirmed": {
      const rest = message(
        "{p0} Aucune écriture n’a été rejouée. Vérifiez Jira avant de reprendre ; votre brouillon est conservé.",
        { p0: planningCause(reason.error) },
      );
      return reason.confirmed.length > 0
        ? message("Étapes confirmées : {p0}. {p1}", {
            p0: { list: reason.confirmed.map(planningStepMessage), separator: ", " },
            p1: rest,
          })
        : message("Publication non confirmée. {p0}", { p0: rest });
    }
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
