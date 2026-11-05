import type { ReadonlySignal } from "@preact/signals";
import type { IssueFilterOptions } from "../../core/boardLayout";
import type { PlanningFilters } from "../../core/filters";
import type { SprintGoal } from "../../core/sprintGoals";
import type {
  CarryOverGoalReport,
  PlanningDestination,
  PlanningSnapshot,
} from "../../core/sprintPlanning";
import type { JiraQuickFilter } from "../../jira/client";
import type { AtlassianGoal, JiraIssue, JiraSprint } from "../../jira/models";
import type { AppMessage } from "./appMessage";
import type { UserMessage } from "./messages";

export type {
  CarryOverGoalReport,
  CarryOverGoalStatus,
  PlanningDestination,
} from "../../core/sprintPlanning";

/** Fenêtres natives de Jira ouvertes par la page hôte : l'utilisateur seul les remplit. */
export type SprintDialogAction = "complete" | "start";

/** Provenance d'un ticket arrivé dans le sprint en préparation pendant la séance. */
export type PlanningOrigin =
  | { readonly kind: "backlog" }
  | { readonly kind: "sprint"; readonly sprintId: number; readonly sprintName: string };

export interface PlanningIssue {
  readonly issue: JiraIssue;
  /** Estimation du board ; 1 par ticket sans champ d'estimation ; `null` : non estimé. */
  readonly estimate: number | null;
  /** « Vient du backlog / du Sprint X » ; `null` hors des arrivées de la séance. */
  readonly origin: PlanningOrigin | null;
}

/** Swimlane d'un objectif du sprint en préparation. */
export interface PlanningLane {
  readonly goal: SprintGoal;
  /** Tickets de l'objectif retenus par la recherche et les filtres. */
  readonly issues: readonly PlanningIssue[];
  /** Nombre de tickets de l'objectif, recherche et filtres ignorés. */
  readonly issueCount: number;
  /** Somme des estimations connues, recherche et filtres ignorés. */
  readonly points: number;
  readonly unestimated: number;
  /**
   * Répartition de ses tickets dans le sprint en préparation selon leur colonne sur le board
   * (première : à faire, milieu : en cours, dernière : terminé), filtres ignorés.
   */
  readonly progress: Readonly<Record<"todo" | "inProgress" | "done", PlanningTally>>;
  /** Tickets déjà terminés avant ce sprint (sprints clos ou Goal), hors charge ; `null` : aucun. */
  readonly delivered: PlanningTally | null;
  /** Lecture du déjà livré incomplète : il peut en manquer. */
  readonly deliveredIncomplete: boolean;
}

/**
 * Top et basse priorité d'une carte du sprint en préparation : raison de l'action désactivée
 * (écriture en cours, déjà en tête, déjà en fin de sa swimlane), `null` si elle est permise.
 */
export interface PlanningRankOptions {
  readonly top: "writing" | "first" | "last" | null;
  readonly bottom: "writing" | "first" | "last" | null;
}

/** Tickets et somme de leurs estimations connues. */
export interface PlanningTally {
  readonly count: number;
  readonly points: number;
}

/** Section de la colonne « Où sont les tickets » (recherche et filtres appliqués). */
export type PlanningSection =
  | {
      readonly kind: "sprint";
      readonly sprint: JiraSprint;
      readonly issues: readonly PlanningIssue[];
    }
  | { readonly kind: "backlog"; readonly issues: readonly PlanningIssue[] };

/** Charge du sprint en préparation comparée à la vélocité partagée. */
export interface PlanningLoad {
  readonly total: number;
  readonly unestimated: number;
  readonly velocity: number | null;
  /** « pts » avec un champ d'estimation, sinon « tickets ». */
  readonly unit: "pts" | "tickets";
}

/** Recherche de Goals Atlassian existants par nom, pour les épingler. */
export interface PlanningGoalSearch {
  readonly query: string;
  readonly loading: boolean;
  readonly results: readonly AtlassianGoal[];
  readonly error: UserMessage | null;
}

/** Clôture native demandée : le report n'a lieu que si le sprint relu est clos. */
export interface PendingClosure {
  readonly closedSprintId: number;
  readonly closedSprintName: string;
  readonly targetSprintId: number;
  readonly targetSprintName: string;
}

/**
 * Compte rendu d'une clôture demandée par le planning : affiché jusqu'à sa fermeture, remplacé
 * par la clôture suivante, oublié au changement de board.
 */
export interface PlanningCarryOverReport {
  readonly closedSprintName: string;
  readonly targetSprintName: string;
  /** Reporté, rien à reporter, sprint toujours actif, refus ou échec, en clé du catalogue. */
  readonly summary: AppMessage;
  /** Jira a confirmé le report : les objectifs « carried » sont dans la cible. */
  readonly written: boolean;
  /** Objectifs du sprint clos et leur sort ; vide si le report n'a pas lu le sprint clos. */
  readonly goals: readonly CarryOverGoalReport[];
  /** Goals Atlassian lus en partie : un objectif non atteint peut manquer. */
  readonly incomplete: boolean;
}

/**
 * Contrat de présentation : aucune lecture ni écriture Jira dans la vue, aucun signal affecté par
 * elle. Chaque geste écrit aussitôt dans Jira puis relit le sprint ; tous sont ignorés pendant
 * `busy` ou `loading`.
 */
export interface PlanningViewModel {
  /** Sprints futurs du board, dans l'ordre de Jira. */
  readonly sprints: ReadonlySignal<readonly JiraSprint[]>;
  readonly selectedSprintId: ReadonlySignal<number | null>;
  readonly snapshot: ReadonlySignal<PlanningSnapshot | null>;
  readonly loading: ReadonlySignal<boolean>;
  /** Un geste écrit dans Jira ou relit après une fenêtre native. */
  readonly busy: ReadonlySignal<boolean>;
  /** Avis du dernier geste, en clé du catalogue. */
  readonly notice: ReadonlySignal<AppMessage | null>;
  readonly error: ReadonlySignal<UserMessage | null>;
  /** Lecture partielle ou impossible des Goals Atlassian du sprint. */
  readonly goalsWarning: ReadonlySignal<AppMessage | null>;
  readonly search: ReadonlySignal<string>;
  /**
   * Filtres de la barre (Personne, Type, Parent, Statut, Label, « Bloqués », filtres rapides du
   * board Jira), appliqués comme la recherche ; totaux et charge restent calculés sans eux.
   */
  readonly filters: ReadonlySignal<PlanningFilters>;
  /** Valeurs présentes dans le sprint en préparation et ses sources ; `null` sans sprint lu. */
  readonly filterOptions: ReadonlySignal<IssueFilterOptions | null>;
  /** Filtres rapides du board Jira proposés. */
  readonly jiraQuickFilters: ReadonlySignal<readonly JiraQuickFilter[]>;
  /** Jira évalue les filtres rapides actifs. */
  readonly applyingQuickFilters: ReadonlySignal<boolean>;
  /** Critères actifs, recherche comprise. */
  readonly activeFilterCount: ReadonlySignal<number>;
  /** Source des objectifs du board : texte du sprint ou Goals Atlassian épinglés. */
  readonly goalMode: ReadonlySignal<"text" | "atlassian">;
  readonly lanes: ReadonlySignal<readonly PlanningLane[]>;
  /** Tickets du sprint en préparation sans objectif (recherche et filtres appliqués). */
  readonly unassigned: ReadonlySignal<readonly PlanningIssue[]>;
  readonly sections: ReadonlySignal<readonly PlanningSection[]>;
  readonly sprintLoad: ReadonlySignal<PlanningLoad | null>;
  /**
   * Tickets affichés du sprint en préparation (ni dernière colonne ni statut sans colonne, 8.23),
   * avant recherche et filtres : total du compteur « n / N tickets ».
   */
  readonly sprintIssueCount: ReadonlySignal<number>;
  /** Tickets du sprint en préparation dont le statut n'est dans aucune colonne visible : ignorés. */
  readonly unmappedCount: ReadonlySignal<number>;
  /** Sprints actifs du board : un seul, « Clôturer le Sprint N » ; plusieurs, un menu. */
  readonly activeSprints: ReadonlySignal<readonly JiraSprint[]>;
  /** Sprints actifs proposés à la clôture : ceux que l'utilisateur peut modifier dans Jira. */
  readonly closableSprints: ReadonlySignal<readonly JiraSprint[]>;
  /** Des sprints futurs existent, mais l'utilisateur ne peut en modifier aucun. */
  readonly noEditableSprint: ReadonlySignal<boolean>;
  /** Raison pour laquelle « Démarrer » est désactivé, ou `null`. */
  readonly startDisabledReason: ReadonlySignal<AppMessage | null>;
  /** Clôture demandée, jusqu'à la fin de sa vérification (« Clôture en cours dans Jira… »). */
  readonly pendingClosure: ReadonlySignal<PendingClosure | null>;
  /** Compte rendu de la dernière clôture, jusqu'à sa fermeture. */
  readonly carryOverReport: ReadonlySignal<PlanningCarryOverReport | null>;
  readonly goalSearch: ReadonlySignal<PlanningGoalSearch | null>;
  /** Estimation modifiable sur les cartes (champ d'estimation personnalisé du board). */
  readonly canEstimate: ReadonlySignal<boolean>;
  /** Tickets sélectionnés, déplacés ensemble par glisser-déposer ou par le menu d'une de leurs cartes. */
  readonly selection: ReadonlySignal<ReadonlySet<string>>;
  /** Gestes impossibles maintenant (chargement, geste en cours, autre écriture du board). */
  readonly gesturesDisabled: ReadonlySignal<boolean>;
  selectSprint(id: number): Promise<void>;
  refresh(): Promise<void>;
  setSearch(text: string): void;
  setFilters(filters: PlanningFilters): void;
  toggleBlocked(): void;
  toggleJiraQuickFilter(id: number): Promise<void>;
  /** Vide la recherche et tous les filtres. */
  resetFilters(): void;
  addGoal(title: string): Promise<void>;
  renameGoal(id: string, title: string): Promise<void>;
  /** Texte : supprime l'objectif ; Goals Atlassian : retire l'épinglage. */
  removeGoal(id: string): Promise<void>;
  moveGoal(id: string, delta: -1 | 1): Promise<void>;
  /** Pose un ticket sur un objectif (`null` : « Sans objectif »), en l'ajoutant au sprint. */
  placeIssue(key: string, goalId: string | null): Promise<void>;
  removeIssue(key: string, destination: PlanningDestination): Promise<void>;
  /** Ctrl/Cmd+clic : ajoute ou retire un ticket de la sélection. */
  toggleSelection(key: string): void;
  /** Maj+clic : sélectionne la plage depuis le dernier ticket choisi, dans la même section. */
  extendSelection(key: string, sectionKeys: readonly string[]): void;
  clearSelection(): void;
  /** Pose un lot de tickets sur un objectif en un geste (au plus 50). */
  placeIssues(keys: readonly string[], goalId: string | null): Promise<void>;
  /** Retire un lot de tickets du sprint en préparation en un geste (au plus 50). */
  removeIssues(keys: readonly string[], destination: PlanningDestination): Promise<void>;
  saveVelocity(velocity: number | null): Promise<void>;
  /** Estime un ticket (E11), validé par le champ de sa carte. */
  estimateIssue(key: string, value: number): Promise<void>;
  /** Top et basse priorité d'un ticket du sprint en préparation ; `null` ailleurs (8.19). */
  rankOptions(key: string): PlanningRankOptions | null;
  /** Tête ou fin de la swimlane de son objectif dans le sprint en préparation (E2). */
  rankIssue(key: string, edge: "top" | "bottom"): Promise<void>;
  searchGoals(query: string): Promise<void>;
  pinGoal(goalId: string): Promise<void>;
  unpinGoal(goalId: string): Promise<void>;
  /** Ouvre la fenêtre native de clôture du sprint actif `sprintId`. */
  closeActiveSprint(sprintId: number): void;
  /** Ferme le compte rendu de la dernière clôture. */
  dismissCarryOverReport(): void;
  startSprint(): void;
  openIssue(key: string): void;
  /** Adresse Jira d'un ticket du planning, pour un nouvel onglet (clic du milieu) ; sinon `null`. */
  issueUrl(key: string): string | null;
}
