import type { BoardIssue, BoardSnapshot } from "../../core/boardIssue";
import {
  type AtlassianGoalOutcome,
  executeMove,
  type GoalStepResult,
  type MoveStep,
  type RankStepResult,
  type TransitionStepResult,
} from "../../core/boardMove";
import type { WriteReader } from "../../core/boardWrites";
import type { BoardDropPlan, RankChange } from "../../core/dropPlan";
import { JiraError } from "../../jira/errors";
import type { JiraTransition } from "../../jira/models";
import type { AuditEntry } from "../model/auditLog";
import type {
  IssueDrop,
  TransitionChoice,
  TransitionSelection,
  WriteNotice,
} from "../model/BoardTypes";
import { toMessage } from "../model/messages";
import type { BoardWriteAccess, RecordWrite, StateValue } from "./ports";

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
/** Étapes rappelées dans « Déjà effectué » ; le rang, dernière étape, n'y figure jamais. */
const DONE_LABELS: Record<MoveStep, string | null> = {
  transition: "statut modifié",
  goal: "objectif modifié",
  rank: null,
};
export interface MovementCommand {
  issue: BoardIssue;
  snapshot: BoardSnapshot;
  column: { name: string; statusIds: readonly string[] };
  drop: IssueDrop;
  selection?: TransitionSelection;
  plan: BoardDropPlan;
  rank: RankChange;
}
/**
 * Déclenche le déplacement (`core/boardMove.ts` porte l'ordre transition → Goal → rang) et
 * traduit son résultat en avis et en entrées de journal. Les écritures passent par l'accès remis
 * par la porte du board, pour la seule durée du geste.
 */
export class BoardMovementService {
  readonly #reader: WriteReader;
  readonly #state: BoardMovementState;
  readonly #effects: BoardMovementEffects;
  constructor(reader: WriteReader, state: BoardMovementState, effects: BoardMovementEffects) {
    this.#reader = reader;
    this.#state = state;
    this.#effects = effects;
  }
  async execute(command: MovementCommand, access: BoardWriteAccess): Promise<boolean> {
    const { issue, snapshot, column, drop, selection, plan, rank } = command;
    if (
      plan.changesColumn &&
      drop.targetStatusId &&
      !column.statusIds.includes(drop.targetStatusId)
    )
      return false;
    // La séquence et l'arrêt au premier échec sont portés par `core` ; ici, avis et journal.
    const result = await executeMove(
      { reader: this.#reader, writer: access.writer, goals: access.goals },
      {
        issue,
        snapshot,
        transition: plan.changesColumn
          ? {
              knownStatusId: selection?.knownStatusId ?? issue.issue.fields.status.id,
              targetStatusIds: drop.targetStatusId ? [drop.targetStatusId] : column.statusIds,
              ...(selection ? { transitionId: selection.id } : {}),
            }
          : null,
        ...(plan.goalChange.kind === "assign" ? { goal: { goalId: plan.goalChange.goalId } } : {}),
        rank,
        now: this.#effects.now(),
      },
    );
    try {
      if (result.transition)
        await this.#reportTransition(issue, column, drop, selection, result.transition);
      if (result.goal && plan.goalChange.kind === "assign")
        await this.#reportGoal(issue, snapshot, plan.goalChange.goalId, result.goal);
      if (result.rank) await this.#reportRank(issue, rank, result.rank);
      // Une étape demandée mais non aboutie a arrêté la séquence dans `core`.
      const stopped =
        (result.transition !== undefined && !result.completed.includes("transition")) ||
        (result.goal !== undefined && !result.completed.includes("goal"));
      return !stopped && this.#state.writeNotice.peek() === null;
    } finally {
      const notice = this.#state.writeNotice.peek();
      const completed = result.completed.flatMap((step) => DONE_LABELS[step] ?? []);
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

  /** Avis et journal de l'étape Goal. */
  async #reportGoal(
    issue: BoardIssue,
    snapshot: BoardSnapshot,
    goalId: string | null,
    step: GoalStepResult,
  ): Promise<void> {
    const issueKey = issue.issue.key;
    const title =
      goalId === null
        ? "aucun objectif"
        : (snapshot.goals.find((goal) => goal.id === goalId)?.title ?? goalId);
    if (step.origin === "atlassianGoals") {
      await this.#reportAtlassianGoal(issue, title, step.outcome);
      return;
    }
    const outcome = step.outcome;
    switch (outcome.kind) {
      case "noSprint":
        return;
      case "failed":
        await this.#fail(
          "rattachement",
          issueKey,
          title,
          outcome.error,
          "Rattacher un ticket à un objectif du sprint exige en général la permission Jira de gérer les sprints.",
        );
        return;
      case "conflict":
        // Rien n'est écrit ni rejoué : le board est relu après le geste.
        this.#state.writeNotice.value = {
          tone: "warning",
          text: "Ce ticket a été modifié par quelqu'un d'autre depuis le chargement.",
          suggestion: "Le board a été rechargé ; recommence si besoin.",
          sessionLost: false,
          issueKey,
        };
        await this.#effects.record({
          action: "rattachement",
          issueKey,
          from: null,
          to: title,
          outcome: "échec",
          detail: "conflit : lien modifié dans Jira",
        });
        return;
      case "linked":
      case "unchanged":
        await this.#effects.record({
          action: "rattachement",
          issueKey,
          from: null,
          to: title,
          outcome: "réussi",
          detail: "propriété du sprint",
        });
        return;
    }
  }

  /** Lien NATIF ticket↔Goal Atlassian, écrit par `changeAtlassianGoal` (détacher → lier). */
  async #reportAtlassianGoal(
    issue: BoardIssue,
    title: string,
    outcome: AtlassianGoalOutcome,
  ): Promise<void> {
    const issueKey = issue.issue.key;
    const refused = async (text: string, messages: readonly string[], detached: boolean) => {
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
      return;
    };
    switch (outcome.kind) {
      case "unchanged":
        return;
      case "unlinked":
      case "linked":
        await this.#effects.record({
          action: "rattachement",
          issueKey,
          from: null,
          to: title,
          outcome: "réussi",
          detail: outcome.kind === "unlinked" ? "lien Goal retiré" : "lien Goal Atlassian natif",
        });
        return;
      case "unlinkRefused":
        await refused(
          "Atlassian a refusé de détacher le ticket de son Goal actuel.",
          outcome.messages,
          false,
        );
        return;
      case "linkRefused":
        await refused(
          "Atlassian a refusé de rattacher le ticket au Goal.",
          outcome.messages,
          outcome.detached,
        );
        return;
      case "failed": {
        await this.#fail("rattachement", issueKey, title, outcome.error);
        const notice = this.#state.writeNotice.peek();
        if (outcome.detached && notice) {
          this.#state.writeNotice.value = {
            ...notice,
            text: `${notice.text} Le lien avec l’ancien Goal a déjà été retiré.`,
          };
        }
        return;
      }
    }
  }

  /** Avis et journal de l'étape transition. */
  async #reportTransition(
    issue: BoardIssue,
    column: { name: string; statusIds: readonly string[] },
    drop: IssueDrop,
    selection: TransitionSelection | undefined,
    outcome: TransitionStepResult,
  ): Promise<void> {
    const issueKey = issue.issue.key;
    const from = issue.issue.fields.status.name;
    switch (outcome.kind) {
      case "failed":
        await this.#fail("transition", issueKey, column.name, outcome.error);
        return;
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
        return;
      case "alreadyThere":
        return;
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
        return;
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
          return;
        }
        this.#state.writeNotice.value = {
          tone: "error",
          text: `Impossible d'ouvrir le formulaire Jira pour ${issueKey}.`,
          suggestion:
            "Rechargez la page Jira puis recommencez le déplacement. Rien n'a été modifié.",
          sessionLost: false,
          issueKey,
        };
        return;
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
        return;
      case "choose":
        // Une action par statut : seul le choix de la destination reste manuel.
        this.#state.transitionChoice.value = {
          drop,
          knownStatusId: selection?.knownStatusId ?? issue.issue.fields.status.id,
          issueKey,
          columnName: column.name,
          available: outcome.available,
        };
        return;
    }
  }

  /** Journal (ou avis d'échec) de l'étape rang. */
  async #reportRank(issue: BoardIssue, change: RankChange, step: RankStepResult): Promise<void> {
    const issueKey = issue.issue.key;
    const to =
      change.kind === "before"
        ? `avant ${change.issueKey}`
        : change.kind === "after"
          ? `après ${change.issueKey}`
          : null;
    if (step.kind === "ranked") {
      await this.#effects.record({
        action: "classement",
        issueKey,
        from: null,
        to,
        outcome: "réussi",
        detail: "rang du board Jira",
      });
      return;
    }
    await this.#fail(
      "classement",
      issueKey,
      to,
      step.error,
      "Réordonner un ticket exige la permission Jira « Planifier les tickets ».",
    );
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
