import type { ReadonlySignal } from "@preact/signals";
import type { SprintGoal } from "../../core/sprintGoals";
import type { PlanningDestination, PlanningSnapshot } from "../../core/sprintPlanning";
import type { AtlassianGoal, JiraIssue, JiraSprint } from "../../jira/models";
import type { AppMessage } from "./appMessage";
import type { UserMessage } from "./messages";

export type { PlanningDestination } from "../../core/sprintPlanning";

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
  /** Tickets de l'objectif retenus par la recherche. */
  readonly issues: readonly PlanningIssue[];
  /** Nombre de tickets de l'objectif, recherche ignorée. */
  readonly issueCount: number;
  /** Somme des estimations connues, recherche ignorée. */
  readonly points: number;
  readonly unestimated: number;
}

/** Section de la colonne « Où sont les tickets » (recherche appliquée). */
export type PlanningSection =
  | {
      readonly kind: "sprint";
      readonly sprint: JiraSprint;
      readonly issues: readonly PlanningIssue[];
    }
  | { readonly kind: "backlog"; readonly issues: readonly PlanningIssue[] }
  /** Reste à faire d'un sprint actif : consultation, jamais déplaçable. */
  | {
      readonly kind: "active";
      readonly sprint: JiraSprint;
      readonly issues: readonly PlanningIssue[];
    };

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
  readonly targetSprintId: number;
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
  /** Source des objectifs du board : texte du sprint ou Goals Atlassian épinglés. */
  readonly goalMode: ReadonlySignal<"text" | "atlassian">;
  readonly lanes: ReadonlySignal<readonly PlanningLane[]>;
  /** Tickets du sprint en préparation sans objectif (recherche appliquée). */
  readonly unassigned: ReadonlySignal<readonly PlanningIssue[]>;
  readonly sections: ReadonlySignal<readonly PlanningSection[]>;
  readonly sprintLoad: ReadonlySignal<PlanningLoad | null>;
  /** Premier sprint actif du board (« Clôturer le Sprint N »), ou `null`. */
  readonly activeSprint: ReadonlySignal<JiraSprint | null>;
  /** Raison pour laquelle « Démarrer » est désactivé, ou `null`. */
  readonly startDisabledReason: ReadonlySignal<AppMessage | null>;
  readonly pendingClosure: ReadonlySignal<PendingClosure | null>;
  readonly goalSearch: ReadonlySignal<PlanningGoalSearch | null>;
  /** Gestes impossibles maintenant (chargement, geste en cours, autre écriture du board). */
  readonly gesturesDisabled: ReadonlySignal<boolean>;
  selectSprint(id: number): Promise<void>;
  refresh(): Promise<void>;
  setSearch(text: string): void;
  addGoal(title: string): Promise<void>;
  renameGoal(id: string, title: string): Promise<void>;
  /** Texte : supprime l'objectif ; Goals Atlassian : retire l'épinglage. */
  removeGoal(id: string): Promise<void>;
  moveGoal(id: string, delta: -1 | 1): Promise<void>;
  /** Pose un ticket sur un objectif (`null` : « Sans objectif »), en l'ajoutant au sprint. */
  placeIssue(key: string, goalId: string | null): Promise<void>;
  removeIssue(key: string, destination: PlanningDestination): Promise<void>;
  saveVelocity(velocity: number | null): Promise<void>;
  searchGoals(query: string): Promise<void>;
  pinGoal(goalId: string): Promise<void>;
  unpinGoal(goalId: string): Promise<void>;
  closeActiveSprint(): void;
  startSprint(): void;
  openIssue(key: string): void;
}
