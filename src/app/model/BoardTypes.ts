import type { BoardBlock } from "../../core/boardBlocks";
import type { TeamDocument } from "../../core/teamSettings";
import type { JiraTransition } from "../../jira/models";
import type { UserMessage } from "./messages";

export interface SyncProblem extends UserMessage {
  /** La session Jira du navigateur n'est plus reconnue : il faut se reconnecter à Jira. */
  readonly sessionLost: boolean;
}

/** Résultat d'une écriture qui mérite d'être dit : refus, conflit, issue incertaine. */
export type HostBoardAnswer = "leaving" | "current" | "unreachable";

export interface WriteNotice extends UserMessage {
  readonly tone: "error" | "warning";
  readonly sessionLost: boolean;
  /** Ticket concerné, pour proposer de l'ouvrir dans Jira. */
  readonly issueKey: string | null;
}

export interface IssueDrop {
  readonly issueKey: string;
  readonly block: BoardBlock;
  readonly columnId: string;
  readonly beforeKey: string | null;
  readonly targetStatusId?: string;
}

export interface TransitionSelection {
  id: string;
  knownStatusId: string;
}
export type DragTransitions =
  | { kind: "loading" }
  | { kind: "ready"; transitions: readonly JiraTransition[] }
  | { kind: "error"; message: string };

/** Choix en attente : aucune écriture du déplacement n'a encore eu lieu. */
export interface TransitionChoice {
  readonly drop: IssueDrop;
  readonly knownStatusId: string;
  readonly issueKey: string;
  readonly columnName: string;
  readonly available: readonly JiraTransition[];
}

/** Carte en cours de glisser-déposer. */
export interface DragState {
  readonly issueKey: string;
  /** Swimlane par type de la carte ; `null` pour une carte par objectif. */
  readonly lane: string | null;
}

/** Emplacement visé : une case (swimlane × colonne), devant un ticket ou à la fin. */
export interface DropTarget {
  readonly statusId?: string;
  readonly laneId: string;
  readonly columnId: string;
  readonly beforeKey: string | null;
}

/** Sélection des Goals épinglés au sprint, ou au board Kanban sans sprint. */
export interface PinEditor {
  readonly sprintId: number | null;
  readonly sprintName: string;
  /** Sélection lue dans Jira à l'ouverture : l'écriture est refusée si Jira ne la porte plus. */
  readonly base: readonly string[];
  /** Sélection en cours, dans l'ordre d'épinglage (celui des swimlanes). */
  readonly selection: readonly string[];
  readonly saving: boolean;
  readonly notice: (UserMessage & { readonly tone: "error" | "warning" }) | null;
  /** La sélection de départ est celle gardée dans ce navigateur, Jira n'en ayant aucune. */
  readonly fromLocal: boolean;
  /** Jira vient de refuser l'enregistrement faute de droits : on peut la garder localement. */
  readonly canKeepLocally: boolean;
}

/** Board enregistré du site, tel que le menu des boards le présente. */
export interface BoardSummary {
  readonly boardId: number;
  readonly boardName: string;
  readonly projectKeys: readonly string[];
}

/** Réglages d'équipe du board, tels que lus dans Jira (propriété du board). */
export type TeamState =
  /** Pas encore lus pour ce board. */
  | { readonly kind: "unknown" }
  /** Personne n'a encore publié de réglages d'équipe pour ce board. */
  | { readonly kind: "none" }
  /** Lecture impossible, ou format inconnu : rien n'est appliqué. */
  | { readonly kind: "unreadable"; readonly message: string }
  | { readonly kind: "published"; readonly document: TeamDocument };

export interface TeamNotice {
  readonly tone: "success" | "warning" | "error";
  readonly text: string;
  readonly suggestion: string | null;
}
