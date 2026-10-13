import type { ReadonlySignal } from "@preact/signals";
import type { SprintGoal } from "../../core/sprintGoals";
import type { JiraIssue, JiraSprint } from "../../jira/models";
import type { UserMessage } from "./messages";

/** Une proposition reste dans ce navigateur jusqu'à sa publication explicite. */
export interface PlanningDraft {
  readonly sprintId: number;
  readonly goals: readonly SprintGoal[];
  readonly links: Readonly<Record<string, string>>;
  readonly selectedIssueKeys: readonly string[];
  readonly capacity: number | null;
}

export interface PlanningIssue {
  readonly issue: JiraIssue;
  readonly estimate: number | null;
  /** Le reste à faire est consultatif : aucun déplacement hors du sprint actif. */
  readonly source: "backlog" | "sprint" | "remaining";
  readonly sprintName?: string;
}

/** Contrat de présentation : aucune lecture ou écriture Jira dans la vue. */
export interface PlanningViewModel {
  readonly sprints: ReadonlySignal<readonly JiraSprint[]>;
  readonly selectedSprintId: ReadonlySignal<number | null>;
  readonly loading: ReadonlySignal<boolean>;
  readonly publishing: ReadonlySignal<boolean>;
  readonly dirty: ReadonlySignal<boolean>;
  readonly error: ReadonlySignal<UserMessage | null>;
  readonly notice: ReadonlySignal<string | null>;
  readonly validation: ReadonlySignal<string | null>;
  readonly draft: ReadonlySignal<PlanningDraft | null>;
  readonly issues: ReadonlySignal<readonly PlanningIssue[]>;
  readonly estimationLabel: string;
  readonly canPublish: ReadonlySignal<boolean>;
  selectSprint(id: number): Promise<void>;
  refresh(): Promise<void>;
  addGoal(title: string): void;
  renameGoal(id: string, title: string): void;
  removeGoal(id: string): void;
  moveGoal(id: string, delta: -1 | 1): void;
  assignIssue(key: string, goalId: string | null): void;
  removeIssue(key: string): void;
  setCapacity(capacity: number | null): void;
  publish(): Promise<void>;
  discardDraft(): Promise<void>;
  openIssue(key: string): void;
  copySummary(): Promise<void>;
}
