import type { BoardConfiguration } from "../../core/boardConfiguration";
import { withLocalPins } from "../../core/boardPreferences";
import { pinAtlassianGoals } from "../../core/boardWrites";
import { type PinnedGoalsStorage, saveBoardPinnedGoals } from "../../core/pinnedGoals";
import {
  encodeTeamSettings,
  readTeamSettings,
  sameTeamSettings,
  saveTeamSettings,
  type TeamDocument,
  type TeamReadOutcome,
  teamDifferences,
  withTeamSettings,
} from "../../core/teamSettings";
import type { JiraClient } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import type { JiraUser } from "../../jira/models";
import { type AppMessage, message } from "../model/appMessage";
import type { PinEditor, TeamNotice, TeamState } from "../model/BoardTypes";
import { errorMessage, TEAM_FAMILY_LABEL } from "../model/coreText";
import { toMessage } from "../model/messages";
import type {
  BoardScope,
  BoardWriteAccess,
  BoardWriteGateway,
  ConfigurationChange,
  ReadableValue,
  RecordWrite,
  StateValue,
} from "./ports";

export interface BoardSettingsState {
  configuration: ReadableValue<BoardConfiguration | null>;
  pinEditor: StateValue<PinEditor | null>;
  /** Stockage des Goals épinglés, choisi par `core/pinnedGoals.ts`. */
  pinStorage: ReadableValue<PinnedGoalsStorage>;
  team: StateValue<TeamState>;
  teamSaving: StateValue<number>;
  teamNotice: StateValue<TeamNotice | null>;
  canEditBoard: StateValue<boolean | null>;
  canEditSettings: ReadableValue<boolean>;
  canPinGoals: ReadableValue<boolean>;
}
export interface BoardSettingsEffects {
  scope: BoardScope;
  currentUser(): JiraUser | null;
  now(): Date;
  updatePreferences(change: ConfigurationChange): Promise<void>;
  record: RecordWrite;
  sync(): Promise<void>;
}
/**
 * Propriétaire des relectures, conflits et avis des réglages et épinglages. Chaque écriture passe
 * par la porte du board, qui les sérialise avec les autres gestes.
 */
export class BoardSettingsService {
  readonly #reader: Pick<JiraClient, "boardProperty" | "sprintProperty" | "boardCanEdit">;
  readonly #gate: BoardWriteGateway;
  readonly #state: BoardSettingsState;
  readonly #effects: BoardSettingsEffects;
  #teamWrites = 0;
  #canEditAsked = false;
  constructor(
    reader: Pick<JiraClient, "boardProperty" | "sprintProperty" | "boardCanEdit">,
    gate: BoardWriteGateway,
    state: BoardSettingsState,
    effects: BoardSettingsEffects,
  ) {
    this.#reader = reader;
    this.#gate = gate;
    this.#state = state;
    this.#effects = effects;
  }
  resetBoard(): void {
    this.#canEditAsked = false;
  }
  async savePinnedGoals(): Promise<void> {
    const editor = this.#state.pinEditor.value;
    if (!editor || editor.saving) return;
    if (editor.storage.kind === "board") {
      await this.#saveBoardPinnedGoals(editor, editor.storage);
      return;
    }
    const sprintId = editor.storage.sprintId;
    const saving: PinEditor = { ...editor, saving: true, notice: null };
    this.#state.pinEditor.value = saving;
    // La fenêtre a pu disparaître pendant l'écriture (changement de board) : on ne la rouvre pas.
    const settle = (next: PinEditor | null) => {
      if (this.#state.pinEditor.value === saving) this.#state.pinEditor.value = next;
    };
    const entry = {
      action: "épinglage",
      issueKey: null,
      from: null,
      to: null,
      toMessage: pinnedCount(editor.selection.length),
    } as const;
    try {
      const outcome = await this.#gate.run(({ writer }) =>
        pinAtlassianGoals(this.#reader, writer, {
          sprintId,
          shownGoalIds: editor.base,
          goalIds: editor.selection,
          accountId: this.#effects.currentUser()?.accountId ?? null,
          now: this.#effects.now(),
        }),
      );
      switch (outcome.kind) {
        case "pinned":
          settle(null);
          await this.#effects.record({
            ...entry,
            outcome: "réussi",
            detail: null,
            detailMessage: message("propriété du sprint"),
          });
          // Enregistré dans Jira : la copie locale de repli devient inutile.
          await this.forgetLocalPins(sprintId);
          break;
        case "unchanged":
          settle(null);
          await this.forgetLocalPins(sprintId);
          break;
        case "conflict":
          // Rien n'est écrasé : la fenêtre repart de ce que Jira porte maintenant.
          settle({
            ...editor,
            base: outcome.current,
            selection: outcome.current,
            canKeepLocally: false,
            notice: {
              tone: "warning",
              text: "Les Goals épinglés ont été modifiés dans Jira pendant votre sélection.",
              suggestion:
                "Rien n'a été écrit. La fenêtre montre maintenant la sélection enregistrée dans Jira : refaites vos changements, puis enregistrez.",
            },
          });
          await this.#effects.record({
            ...entry,
            outcome: "échec",
            detail: null,
            detailMessage: message("conflit : sélection modifiée dans Jira"),
          });
          break;
      }
    } catch (error) {
      const jiraError = error instanceof JiraError ? error : null;
      const uncertain = jiraError?.isOutcomeUnknown ?? false;
      const userMessage = toMessage(error);
      const forbidden = jiraError?.info.kind === "forbidden";
      settle({
        ...editor,
        canKeepLocally: forbidden,
        notice: uncertain
          ? {
              tone: "warning",
              text: `Jira n'a pas confirmé l'enregistrement (${userMessage.text.replace(/\.$/, "")}).`,
              suggestion:
                "Il a peut-être eu lieu : le board vient d'être relu. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.",
            }
          : {
              tone: "error",
              text: userMessage.text,
              suggestion: forbidden
                ? "Épingler un Goal au sprint exige en général la permission Jira de gérer les sprints. Vous pouvez garder cette sélection dans ce navigateur, sans la partager."
                : userMessage.suggestion,
            },
      });
      await this.#effects.record({
        ...entry,
        outcome: uncertain ? "incertain" : "échec",
        detail: null,
        detailMessage: errorMessage(error),
      });
    }
    await this.#effects.sync();
  }

  /** Épinglage Kanban partagé : même porte et même propriété que les réglages, sans optimisme. */
  async #saveBoardPinnedGoals(
    editor: PinEditor,
    storage: Extract<PinnedGoalsStorage, { kind: "board" }>,
  ): Promise<void> {
    const configuration = this.#state.configuration.value;
    if (!configuration || this.#state.pinStorage.value.kind !== "board") return;
    if (configuration.boardId !== storage.boardId || !this.#state.canPinGoals.value) return;
    const generation = this.#effects.scope.generation();
    const stale = () =>
      generation !== this.#effects.scope.generation() ||
      this.#state.configuration.value?.boardId !== storage.boardId;
    const saving: PinEditor = { ...editor, saving: true, notice: null };
    this.#state.pinEditor.value = saving;
    const settle = (next: PinEditor | null) => {
      if (!stale() && this.#state.pinEditor.value === saving) this.#state.pinEditor.value = next;
    };
    const entry = {
      action: "épinglage",
      issueKey: null,
      from: null,
      to: null,
      toMessage: pinnedCount(editor.selection.length),
    } as const;
    const conflict = async (current: TeamDocument | null) => {
      if (current) {
        this.#state.team.value = { kind: "published", document: current };
        await this.#applyTeamDocument(current);
      } else {
        this.#state.team.value = { kind: "none" };
        await this.#effects.updatePreferences((latest) => ({ ...latest, boardPinnedGoalIds: [] }));
      }
      const ids = current?.settings.boardPinnedGoalIds ?? [];
      settle({
        ...editor,
        base: ids,
        selection: ids,
        canKeepLocally: false,
        notice: {
          tone: "warning",
          text: "Les Goals épinglés ou les réglages du board ont changé dans Jira pendant votre sélection.",
          suggestion:
            "Rien n'a été écrit. La sélection de Jira est affichée : refaites vos changements, puis enregistrez.",
        },
      });
      await this.#effects.record({
        ...entry,
        outcome: "échec",
        detail: null,
        detailMessage: message("conflit : réglages du board modifiés"),
      });
    };
    this.#teamWrites += 1;
    this.#state.teamSaving.value += 1;
    const task = this.#gate.run(
      async ({ writer }) => {
        if (stale()) return;
        if (!this.#state.canEditSettings.value) {
          settle({
            ...editor,
            notice: {
              tone: "error",
              text: "Il faut pouvoir modifier le board pour y épingler des Goals.",
              suggestion: null,
            },
          });
          return;
        }
        try {
          const user = this.#effects.currentUser();
          const outcome = await saveBoardPinnedGoals(this.#reader, writer, {
            boardId: storage.boardId,
            base: editor.base,
            selection: editor.selection,
            configuration: () => this.#state.configuration.value ?? configuration,
            publishedBy: {
              accountId: user?.accountId ?? null,
              displayName: user?.displayName ?? null,
            },
            now: this.#effects.now(),
          });
          if (stale()) return;
          if (outcome.kind === "unreadable")
            throw new Error("Les réglages du board sont illisibles : rien n'a été écrit.");
          if (outcome.kind === "conflict") {
            await conflict(outcome.current);
            return;
          }
          if (outcome.kind === "unchanged") {
            settle(null);
            return;
          }
          this.#state.team.value = { kind: "published", document: outcome.document };
          await this.#applyTeamDocument(outcome.document);
          settle(null);
          await this.#effects.record({
            ...entry,
            outcome: "réussi",
            detail: null,
            detailMessage: message("propriété du board Kanban"),
          });
        } catch (error) {
          if (stale()) return;
          const jiraError = error instanceof JiraError ? error : null;
          const uncertain = jiraError?.isOutcomeUnknown ?? false;
          const forbidden = jiraError?.info.kind === "forbidden";
          const userMessage = toMessage(error);
          if (forbidden) this.#state.canEditBoard.value = false;
          settle({
            ...editor,
            canKeepLocally: false,
            notice: {
              tone: uncertain ? "warning" : "error",
              text: uncertain
                ? `Jira n'a pas confirmé l'enregistrement (${userMessage.text.replace(/\.$/, "")}).`
                : userMessage.text,
              suggestion: uncertain
                ? "Le board va être relu. Vérifiez sa sélection avant de recommencer ; l'extension ne rejoue jamais une écriture."
                : forbidden
                  ? "Il faut pouvoir modifier le board pour y épingler des Goals."
                  : userMessage.suggestion,
            },
          });
          await this.#effects.record({
            ...entry,
            outcome: uncertain ? "incertain" : "échec",
            detail: null,
            detailMessage: errorMessage(error),
          });
        }
      },
      { refusal: "Le board ou vos droits ont changé : rien n'a été écrit." },
    );
    try {
      await task;
    } finally {
      this.#state.teamSaving.value -= 1;
    }
    if (!stale()) await this.#effects.sync();
  }

  async forgetLocalPins(sprintId: number): Promise<void> {
    if (!this.#state.configuration.value?.localPinnedGoalIds[String(sprintId)]) return;
    await this.#effects.updatePreferences((current) => withLocalPins(current, sprintId, []));
  }

  async changeShared(
    change: (configuration: BoardConfiguration) => BoardConfiguration,
  ): Promise<void> {
    const before = this.#state.configuration.value;
    if (!before) return;
    const shared = !sameTeamSettings(before, change(before));
    if (shared && !this.#state.canEditSettings.value) return;
    await this.#effects.updatePreferences(change);
    if (!shared) return;
    this.#teamWrites += 1;
    this.#state.teamSaving.value += 1;
    const task = this.#gate.run((access) => this.#saveShared(access, change));
    try {
      await task;
    } finally {
      this.#state.teamSaving.value -= 1;
    }
  }

  /** Les brouillons JQL ne remplacent les réglages actifs qu'après confirmation de Jira. */
  async changeSharedConfirmed(
    change: (configuration: BoardConfiguration) => BoardConfiguration,
    sameFamily: (base: BoardConfiguration, latest: BoardConfiguration) => boolean,
    base?: BoardConfiguration,
  ): Promise<boolean> {
    const configuration = this.#state.configuration.value;
    if (!configuration || !this.#state.canEditSettings.value) return false;
    const generation = this.#effects.scope.generation();
    this.#teamWrites += 1;
    this.#state.teamSaving.value += 1;
    const task = this.#gate.run(async (access) => {
      if (
        generation !== this.#effects.scope.generation() ||
        this.#state.configuration.value?.boardId !== configuration.boardId
      )
        return false;
      return this.#saveShared(access, change, base ?? configuration, sameFamily);
    });
    try {
      return (await task) === true;
    } finally {
      this.#state.teamSaving.value -= 1;
    }
  }

  /** Écrit une modification des réglages partagés sur la version relue dans Jira. */
  async #saveShared(
    { writer }: BoardWriteAccess,
    change: (configuration: BoardConfiguration) => BoardConfiguration,
    confirmed?: BoardConfiguration,
    sameFamily?: (base: BoardConfiguration, latest: BoardConfiguration) => boolean,
  ): Promise<boolean> {
    const configuration = this.#state.configuration.value;
    if (!configuration) return false;
    const boardId = configuration.boardId;
    const generation = this.#effects.scope.generation();
    const stale = () =>
      this.#effects.scope.disposed() ||
      generation !== this.#effects.scope.generation() ||
      this.#state.configuration.value?.boardId !== boardId;
    const user = this.#effects.currentUser();
    const entry = {
      action: "réglages d'équipe",
      issueKey: null,
      from: null,
      to: null,
      toMessage: message("enregistrement"),
    } as const;
    this.#state.teamNotice.value = null;
    try {
      // La porte refuse l'écriture si le board ou ses droits ont changé. Relecture, détection des conflits et publication : `core/teamSettings.ts`.
      const outcome = await saveTeamSettings(this.#reader, writer, {
        boardId,
        configuration: () => configuration,
        change,
        ...(confirmed ? { confirmed } : {}),
        ...(sameFamily ? { sameFamily } : {}),
        publishedBy: {
          accountId: user?.accountId ?? null,
          displayName: user?.displayName ?? null,
        },
        now: this.#effects.now(),
      });
      if (stale()) return false;
      if (outcome.kind === "unreadable") {
        this.#state.teamNotice.value = {
          tone: "error",
          text: "Réglage non enregistré dans Jira : les réglages du board y sont dans un format inconnu.",
          suggestion:
            "Ils ne sont jamais écrasés. Une version plus récente de l'extension les a peut-être écrits.",
        };
        return false;
      }
      if (outcome.kind === "changedDuringEdit") {
        const current = outcome.current;
        if (current) {
          this.#state.team.value = { kind: "published", document: current };
          await this.#applyTeamDocument(current);
        }
        this.#state.teamNotice.value = {
          tone: "warning",
          text: "Ces règles ont changé dans Jira pendant votre saisie. Rien n'a été écrasé.",
          suggestion:
            "Votre brouillon est conservé. Copiez-le si nécessaire, puis rechargez les règles avant de les modifier.",
        };
        return false;
      }
      if (outcome.kind === "published") {
        this.#state.team.value = { kind: "published", document: outcome.document };
        await this.#applyTeamDocument(outcome.document);
        const changes = outcome.previous
          ? teamDifferences(outcome.next, outcome.previous.settings)
          : [];
        await this.#effects.record({
          ...entry,
          outcome: "réussi",
          detail: null,
          detailMessage:
            changes.length > 0
              ? {
                  list: changes.map((family) => message(TEAM_FAMILY_LABEL[family])),
                  separator: " ; ",
                }
              : message("réglages du board"),
        });
        return true;
      }
      if (outcome.kind === "conflict") {
        if (outcome.current) {
          this.#state.team.value = { kind: "published", document: outcome.current };
          await this.#applyTeamDocument(outcome.current);
        } else {
          await this.refresh({ force: true });
        }
        const who = outcome.current?.publishedBy.displayName ?? "Quelqu'un";
        this.#state.teamNotice.value = {
          tone: "warning",
          text: `Réglage non enregistré : ${who} a modifié les réglages du board au même moment.`,
          suggestion: "Ses réglages sont maintenant affichés ; refaites votre modification.",
        };
        await this.#effects.record({
          ...entry,
          outcome: "échec",
          detail: null,
          detailMessage: message("modifiés au même moment"),
        });
      }
    } catch (error) {
      if (stale()) return false;
      const jiraError = error instanceof JiraError ? error : null;
      const uncertain = jiraError?.isOutcomeUnknown ?? false;
      const forbidden = jiraError?.info.kind === "forbidden";
      const userMessage = toMessage(error);
      if (forbidden) this.#state.canEditBoard.value = false;
      this.#state.teamNotice.value = forbidden
        ? {
            tone: "error",
            text: "Jira a refusé d'enregistrer ce réglage : il faut pouvoir modifier le board.",
            suggestion:
              "Les réglages du board sont maintenant en lecture seule ici ; ceux de l'équipe vont être rechargés.",
          }
        : uncertain
          ? {
              tone: "warning",
              text: `Jira n'a pas confirmé l'enregistrement du réglage (${userMessage.text.replace(/\.$/, "")}).`,
              suggestion:
                "Les réglages du board vont être relus. L'extension ne rejoue jamais une écriture.",
            }
          : {
              tone: "error",
              text: `Réglage non enregistré dans Jira (${userMessage.text.replace(/\.$/, "")}).`,
              suggestion: "Il sera remplacé par les réglages du board au prochain chargement.",
            };
      await this.#effects.record({
        ...entry,
        outcome: uncertain ? "incertain" : "échec",
        detail: null,
        detailMessage: errorMessage(error),
      });
      if (forbidden || uncertain) await this.refresh({ force: true });
    }
    return false;
  }

  /**
   * Relit les réglages d'équipe du board et applique la version de Jira : elle fait foi à chaque
   * chargement. Une lecture commencée avant une écriture de réglage est écartée (elle la
   * défairait). Demande aussi, une fois par board, si le compte peut le modifier.
   */
  async refresh(options: { force?: boolean } = {}): Promise<void> {
    const configuration = this.#state.configuration.value;
    if (!configuration) return;
    void this.#askCanEdit(configuration);
    const generation = this.#effects.scope.generation();
    const writes = this.#teamWrites;
    const stale = () =>
      generation !== this.#effects.scope.generation() ||
      this.#state.configuration.value?.boardId !== configuration.boardId ||
      (!options.force && (writes !== this.#teamWrites || this.#state.teamSaving.value > 0));
    let read: TeamReadOutcome;
    try {
      read = await readTeamSettings(this.#reader, configuration.boardId);
    } catch (error) {
      if (!stale()) this.#state.team.value = { kind: "unreadable", message: toMessage(error).text };
      return;
    }
    if (stale()) return;
    if (read.kind === "none") {
      this.#state.team.value = { kind: "none" };
      if (
        this.#state.pinStorage.value.kind === "board" &&
        configuration.boardPinnedGoalIds.length > 0
      ) {
        await this.#effects.updatePreferences((current) => ({
          ...current,
          boardPinnedGoalIds: [],
        }));
      }
      return;
    }
    if (read.kind === "unreadable") {
      this.#state.team.value = {
        kind: "unreadable",
        message:
          "Les réglages du board enregistrés dans Jira sont dans un format inconnu (version plus récente de l'extension ?) : ils ne sont pas appliqués.",
      };
      return;
    }
    const document = read.document;
    this.#state.team.value = { kind: "published", document };
    const latest = this.#state.configuration.value;
    if (
      !latest ||
      (latest.teamBase?.publishedAt === document.publishedAt &&
        teamDifferences(latest, document.settings).length === 0)
    ) {
      return;
    }
    await this.#applyTeamDocument(document);
  }

  /** Droit d'édition du board, demandé une fois par board ; une erreur laisse « inconnu ». */
  async #askCanEdit(configuration: BoardConfiguration): Promise<void> {
    if (this.#canEditAsked) return;
    this.#canEditAsked = true;
    const generation = this.#effects.scope.generation();
    try {
      const canEdit = await this.#reader.boardCanEdit(
        configuration.boardId,
        configuration.boardName,
        configuration.projectKeys[0] ?? null,
      );
      if (generation === this.#effects.scope.generation() && canEdit !== null)
        this.#state.canEditBoard.value = canEdit;
    } catch {
      // Inconnu : les réglages restent modifiables, un refus de Jira tranchera.
    }
  }

  #applyTeamDocument(document: TeamDocument): Promise<void> {
    return this.#effects.updatePreferences((current) => ({
      ...withTeamSettings(current, document.settings),
      teamBase: {
        publishedAt: document.publishedAt,
        settings: encodeTeamSettings(document.settings),
      },
    }));
  }
}

/** Nombre de Goals épinglés, pour le journal. */
function pinnedCount(count: number): AppMessage {
  return message(count > 1 ? "{p0} Goals épinglés" : "{p0} Goal épinglé", { p0: count });
}
