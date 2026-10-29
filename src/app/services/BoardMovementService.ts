import {
  type BoardIssue,
  type BoardSnapshot,
  goalsOfSprint,
  textLinkSprintId,
} from "../../core/boardIssue";
import {
  type JiraWriter,
  linkToTextGoal,
  type MoveOutcome,
  moveToColumn,
  rankIssue,
  type WriteReader,
} from "../../core/boardWrites";
import type { BoardDropPlan, RankChange } from "../../core/dropPlan";
import { JiraError } from "../../jira/errors";
import type { GoalsClient } from "../../jira/goals";
import type { JiraTransition } from "../../jira/models";
import type { AuditEntry } from "../model/auditLog";
import type {
  IssueDrop,
  TransitionChoice,
  TransitionSelection,
  WriteNotice,
} from "../model/BoardTypes";
import { toMessage } from "../model/messages";
import type { RecordWrite, StateValue } from "./ports";

export interface BoardMovementState {
  writeNotice: StateValue<WriteNotice | null>;
  nativeTransitionPending: StateValue<boolean>;
  transitionChoice: StateValue<TransitionChoice | null>;
}
export interface BoardMovementEffects {
  now(): Date;
  record: RecordWrite;
  openNative(key: string, transition: JiraTransition): boolean;
  sync(): Promise<void>;
}
export interface MovementCommand {
  issue: BoardIssue;
  snapshot: BoardSnapshot;
  column: { name: string; statusIds: readonly string[] };
  drop: IssueDrop;
  selection?: TransitionSelection;
  plan: BoardDropPlan;
  rank: RankChange;
}
/** Exécute l'intention dans l'ordre transition → Goal → rang, sans rejouer une écriture. */
export class BoardMovementService {
  readonly #reader: WriteReader;
  readonly #writer: JiraWriter;
  readonly #goals: Pick<GoalsClient, "setLink">;
  readonly #state: BoardMovementState;
  readonly #effects: BoardMovementEffects;
  constructor(
    reader: WriteReader,
    writer: JiraWriter,
    goals: Pick<GoalsClient, "setLink">,
    state: BoardMovementState,
    effects: BoardMovementEffects,
  ) {
    this.#reader = reader;
    this.#writer = writer;
    this.#goals = goals;
    this.#state = state;
    this.#effects = effects;
  }
  async execute(command: MovementCommand): Promise<boolean> {
    const { issue, snapshot, column, drop, selection, plan, rank } = command;
    const completed: string[] = [];
    try {
      if (plan.changesColumn) {
        if (drop.targetStatusId && !column.statusIds.includes(drop.targetStatusId)) return false;
        if (!(await this.#moveIssue(issue, column, drop, selection))) return false;
        completed.push("statut modifié");
      }
      if (plan.goalChange.kind === "assign") {
        if (!(await this.#assignGoal(issue, snapshot, plan.goalChange.goalId))) return false;
        completed.push("objectif modifié");
      }
      if (rank.kind !== "none") await this.#rank(issue, rank);
      return this.#state.writeNotice.peek() === null;
    } finally {
      const notice = this.#state.writeNotice.peek();
      if (notice && completed.length > 0) {
        this.#state.writeNotice.value = {
          ...notice,
          text: `${notice.text} Déjà effectué : ${completed.join(", ")}.`,
          suggestion:
            "Le board est relu pour montrer l'état de Jira. Aucun retour arrière automatique n'est effectué.",
        };
      }
    }
  }
  async #assignGoal(
    issue: BoardIssue,
    snapshot: BoardSnapshot,
    goalId: string | null,
  ): Promise<boolean> {
    const issueKey = issue.issue.key;
    const title =
      goalId === null
        ? "aucun objectif"
        : (snapshot.goals.find((goal) => goal.id === goalId)?.title ?? goalId);
    if (snapshot.goalsOrigin === "atlassianGoals") {
      return this.#assignAtlassianGoal(issue, goalId, title);
    }
    const sprintId = textLinkSprintId(snapshot, issue);
    if (sprintId === null) return false;
    const goals = goalsOfSprint(snapshot, sprintId);
    try {
      await linkToTextGoal(this.#reader, this.#writer, {
        sprintId,
        issueKey,
        goalId,
        goals,
        linkableGoalIds: snapshot.goals
          .filter((goal) => !goals.some((own) => own.id === goal.id))
          .map((goal) => goal.id),
        accountId: snapshot.currentUser?.accountId ?? null,
        now: this.#effects.now(),
      });
      await this.#effects.record({
        action: "rattachement",
        issueKey,
        from: null,
        to: title,
        outcome: "réussi",
        detail: "propriété du sprint",
      });
      return true;
    } catch (error) {
      await this.#fail(
        "rattachement",
        issueKey,
        title,
        error,
        "Rattacher un ticket à un objectif du sprint exige en général la permission Jira de gérer les sprints.",
      );
      return false;
    }
  }

  /**
   * Lien NATIF ticket↔Goal Atlassian. L'ancien Goal est détaché d'abord ; si Atlassian refuse ce
   * détachement, on s'arrête là : poursuivre laisserait le ticket rattaché à deux Goals.
   */
  async #assignAtlassianGoal(
    issue: BoardIssue,
    goalId: string | null,
    title: string,
  ): Promise<boolean> {
    const issueKey = issue.issue.key;
    const previous = issue.goalId;
    if (previous === goalId) return true;
    let detached = false;
    const refused = async (text: string, messages: readonly string[]) => {
      const detail = messages.join(" ") || "aucun détail fourni par Atlassian";
      this.#state.writeNotice.value = {
        tone: "error",
        text: detached ? `${text} Le lien avec l’ancien Goal a déjà été retiré.` : text,
        suggestion: `${detail}. Vérifiez le board après sa relecture.`,
        sessionLost: false,
        issueKey,
      };
      await this.#effects.record({
        action: "rattachement",
        issueKey,
        from: null,
        to: title,
        outcome: "échec",
        detail,
      });
      return false;
    };
    try {
      if (previous !== null) {
        const removal = await this.#goals.setLink("goal.unlink", previous, issue.issue.id);
        if (!removal.success) {
          return refused(
            "Atlassian a refusé de détacher le ticket de son Goal actuel.",
            removal.messages,
          );
        }
        detached = true;
        if (goalId === null) {
          await this.#effects.record({
            action: "rattachement",
            issueKey,
            from: null,
            to: title,
            outcome: "réussi",
            detail: "lien Goal retiré",
          });
          return true;
        }
      }
      if (goalId === null) return true;
      const link = await this.#goals.setLink("goal.link", goalId, issue.issue.id);
      if (!link.success)
        return refused("Atlassian a refusé de rattacher le ticket au Goal.", link.messages);
      await this.#effects.record({
        action: "rattachement",
        issueKey,
        from: null,
        to: title,
        outcome: "réussi",
        detail: "lien Goal Atlassian natif",
      });
      return true;
    } catch (error) {
      await this.#fail("rattachement", issueKey, title, error);
      const notice = this.#state.writeNotice.peek();
      if (detached && notice) {
        this.#state.writeNotice.value = {
          ...notice,
          text: `${notice.text} Le lien avec l’ancien Goal a déjà été retiré.`,
        };
      }
      return false;
    }
  }

  async #moveIssue(
    issue: BoardIssue,
    column: { name: string; statusIds: readonly string[] },
    drop: IssueDrop,
    selection?: TransitionSelection,
  ): Promise<boolean> {
    const issueKey = issue.issue.key;
    const from = issue.issue.fields.status.name;
    let outcome: MoveOutcome;
    try {
      outcome = await moveToColumn(this.#reader, this.#writer, {
        issueKey,
        knownStatusId: selection?.knownStatusId ?? issue.issue.fields.status.id,
        targetStatusIds: drop.targetStatusId ? [drop.targetStatusId] : column.statusIds,
        ...(selection ? { transitionId: selection.id } : {}),
      });
    } catch (error) {
      await this.#fail("transition", issueKey, column.name, error);
      return false;
    }

    switch (outcome.kind) {
      case "moved":
        this.#state.nativeTransitionPending.value = false;
        await this.#effects.record({
          action: "transition",
          issueKey,
          from,
          to: outcome.transition.to.name,
          outcome: "réussi",
          detail: `Transition « ${outcome.transition.name} »`,
        });
        return true;
      case "alreadyThere":
        return true;
      case "conflict":
        this.#state.writeNotice.value = {
          tone: "warning",
          text: `${issueKey} a changé dans Jira : il est maintenant « ${outcome.currentStatus.name} ».`,
          suggestion: "L'affichage a été relu dans Jira. Relancez le déplacement si besoin.",
          sessionLost: false,
          issueKey,
        };
        await this.#effects.record({
          action: "transition",
          issueKey,
          from,
          to: column.name,
          outcome: "échec",
          detail: "conflit : statut modifié dans Jira",
        });
        if (this.#state.nativeTransitionPending.value) await this.#effects.sync();
        return false;
      case "requiresFields": {
        if (this.#effects.openNative(issueKey, outcome.transition)) {
          this.#state.nativeTransitionPending.value = true;
          this.#state.writeNotice.value = {
            tone: "warning",
            text: `Complétez « ${outcome.transition.name} » dans Jira pour ${issueKey}.`,
            suggestion: "Le board sera actualisé à la fermeture du ticket.",
            sessionLost: false,
            issueKey,
          };
          return false;
        }
        this.#state.writeNotice.value = {
          tone: "error",
          text: `Impossible d'ouvrir le formulaire Jira pour ${issueKey}.`,
          suggestion:
            "Rechargez la page Jira puis recommencez le déplacement. Rien n'a été modifié.",
          sessionLost: false,
          issueKey,
        };
        return false;
      }
      case "noTransition":
        this.#state.writeNotice.value = {
          tone: "error",
          text: selection
            ? `La transition prévue vers « ${column.name} » n'est plus disponible pour ${issueKey}.`
            : `Aucune transition disponible vers « ${column.name} » pour ${issueKey} depuis « ${outcome.currentStatus.name} ».`,
          suggestion: selection
            ? "Rien n'a été modifié. Le board est actualisé ; recommencez le déplacement si besoin."
            : "Rien n'a été modifié.",
          sessionLost: false,
          issueKey,
        };
        await this.#effects.record({
          action: "transition",
          issueKey,
          from,
          to: column.name,
          outcome: "échec",
          detail: "aucune transition proposée",
        });
        return false;
      case "choose":
        // Une action par statut : seul le choix de la destination reste manuel.
        this.#state.transitionChoice.value = {
          drop,
          knownStatusId: selection?.knownStatusId ?? issue.issue.fields.status.id,
          issueKey,
          columnName: column.name,
          available: outcome.available,
        };
        return false;
    }
  }

  async #rank(issue: BoardIssue, change: RankChange): Promise<void> {
    const issueKey = issue.issue.key;
    const to =
      change.kind === "before"
        ? `avant ${change.issueKey}`
        : change.kind === "after"
          ? `après ${change.issueKey}`
          : null;
    try {
      await rankIssue(this.#writer, issueKey, change);
      await this.#effects.record({
        action: "classement",
        issueKey,
        from: null,
        to,
        outcome: "réussi",
        detail: "rang du board Jira",
      });
    } catch (error) {
      await this.#fail(
        "classement",
        issueKey,
        to,
        error,
        "Réordonner un ticket exige la permission Jira « Planifier les tickets ».",
      );
    }
  }

  /** Échec d'une écriture : message, et entrée au journal. Jamais de nouvelle tentative. */
  async #fail(
    action: AuditEntry["action"],
    issueKey: string,
    to: string | null,
    error: unknown,
    forbiddenHint?: string,
  ): Promise<void> {
    const jiraError = error instanceof JiraError ? error : null;
    const uncertain = jiraError?.isOutcomeUnknown ?? false;
    const message = toMessage(error);
    this.#state.writeNotice.value = uncertain
      ? {
          tone: "warning",
          text: `Jira n'a pas confirmé l'écriture sur ${issueKey} (${message.text.replace(/\.$/, "")}).`,
          suggestion:
            "Elle a peut-être eu lieu : l'affichage a été relu dans Jira. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.",
          sessionLost: false,
          issueKey,
        }
      : {
          tone: "error",
          text: message.text,
          suggestion:
            jiraError?.info.kind === "forbidden" && forbiddenHint
              ? forbiddenHint
              : message.suggestion,
          sessionLost: isSessionLost(error),
          issueKey,
        };
    await this.#effects.record({
      action,
      issueKey,
      from: null,
      to,
      outcome: uncertain ? "incertain" : "échec",
      detail: message.text,
    });
  }
}
function isSessionLost(error: unknown): boolean {
  return error instanceof JiraError && error.isAuthenticationFailure;
}
