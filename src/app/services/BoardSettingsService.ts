import type { BoardConfiguration } from "../../core/boardConfiguration";
import { withLocalPins } from "../../core/boardPreferences";
import { type JiraWriter, pinAtlassianGoals } from "../../core/boardWrites";
import {
  decodeTeamDocument,
  encodeTeamSettings,
  publishTeamSettings,
  sameTeamSettings,
  type TeamDocument,
  teamDifferences,
  teamSettingsOf,
  withTeamSettings,
} from "../../core/teamSettings";
import type { JiraClient } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import type { JiraUser } from "../../jira/models";
import { BOARD_PROPERTY_KEYS } from "../../jira/writes";
import type { PinEditor, TeamNotice, TeamState } from "../model/BoardTypes";
import { toMessage } from "../model/messages";
import type {
  BoardScope,
  ConfigurationChange,
  ReadableValue,
  RecordWrite,
  StateValue,
} from "./ports";

export interface BoardSettingsState {
  configuration: ReadableValue<BoardConfiguration | null>;
  pinEditor: StateValue<PinEditor | null>;
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
/** Propriétaire des relectures, conflits et écritures sérialisées des réglages et épinglages. */
export class BoardSettingsService {
  readonly #reader: Pick<JiraClient, "boardProperty" | "sprintProperty" | "boardCanEdit">;
  readonly #writer: JiraWriter;
  readonly #state: BoardSettingsState;
  readonly #effects: BoardSettingsEffects;
  #teamQueue: Promise<void> = Promise.resolve();
  #teamWrites = 0;
  #canEditAsked = false;
  constructor(
    reader: Pick<JiraClient, "boardProperty" | "sprintProperty" | "boardCanEdit">,
    writer: JiraWriter,
    state: BoardSettingsState,
    effects: BoardSettingsEffects,
  ) {
    this.#reader = reader;
    this.#writer = writer;
    this.#state = state;
    this.#effects = effects;
  }
  resetBoard(): void {
    this.#canEditAsked = false;
  }
  async savePinnedGoals(): Promise<void> {
    const editor = this.#state.pinEditor.value;
    if (!editor || editor.saving) return;
    if (editor.sprintId === null) {
      await this.#saveBoardPinnedGoals(editor);
      return;
    }
    const saving: PinEditor = { ...editor, saving: true, notice: null };
    this.#state.pinEditor.value = saving;
    // La fenêtre a pu disparaître pendant l'écriture (changement de board) : on ne la rouvre pas.
    const settle = (next: PinEditor | null) => {
      if (this.#state.pinEditor.value === saving) this.#state.pinEditor.value = next;
    };
    const count = editor.selection.length;
    const to = `${count} Goal${count > 1 ? "s" : ""} épinglé${count > 1 ? "s" : ""}`;
    const entry = { action: "épinglage", issueKey: null, from: null, to } as const;
    try {
      const outcome = await pinAtlassianGoals(this.#reader, this.#writer, {
        sprintId: editor.sprintId,
        shownGoalIds: editor.base,
        goalIds: editor.selection,
        accountId: this.#effects.currentUser()?.accountId ?? null,
        now: this.#effects.now(),
      });
      switch (outcome.kind) {
        case "pinned":
          settle(null);
          await this.#effects.record({
            ...entry,
            outcome: "réussi",
            detail: "propriété du sprint",
          });
          // Enregistré dans Jira : la copie locale de repli devient inutile.
          await this.forgetLocalPins(editor.sprintId);
          break;
        case "unchanged":
          settle(null);
          await this.forgetLocalPins(editor.sprintId);
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
            detail: "conflit : sélection modifiée dans Jira",
          });
          break;
      }
    } catch (error) {
      const jiraError = error instanceof JiraError ? error : null;
      const uncertain = jiraError?.isOutcomeUnknown ?? false;
      const message = toMessage(error);
      const forbidden = jiraError?.info.kind === "forbidden";
      settle({
        ...editor,
        canKeepLocally: forbidden,
        notice: uncertain
          ? {
              tone: "warning",
              text: `Jira n'a pas confirmé l'enregistrement (${message.text.replace(/\.$/, "")}).`,
              suggestion:
                "Il a peut-être eu lieu : le board vient d'être relu. Vérifiez-le avant de recommencer ; l'extension ne rejoue jamais une écriture.",
            }
          : {
              tone: "error",
              text: message.text,
              suggestion: forbidden
                ? "Épingler un Goal au sprint exige en général la permission Jira de gérer les sprints. Vous pouvez garder cette sélection dans ce navigateur, sans la partager."
                : message.suggestion,
            },
      });
      await this.#effects.record({
        ...entry,
        outcome: uncertain ? "incertain" : "échec",
        detail: message.text,
      });
    }
    await this.#effects.sync();
  }

  /** Épinglage Kanban partagé : même file et même propriété que les réglages, sans optimisme. */
  async #saveBoardPinnedGoals(editor: PinEditor): Promise<void> {
    const configuration = this.#state.configuration.value;
    if (configuration?.boardType !== "kanban" || !this.#state.canPinGoals.value) return;
    const generation = this.#effects.scope.generation();
    const stale = () =>
      generation !== this.#effects.scope.generation() ||
      this.#state.configuration.value?.boardId !== configuration.boardId;
    const saving: PinEditor = { ...editor, saving: true, notice: null };
    this.#state.pinEditor.value = saving;
    const settle = (next: PinEditor | null) => {
      if (!stale() && this.#state.pinEditor.value === saving) this.#state.pinEditor.value = next;
    };
    const entry = {
      action: "épinglage",
      issueKey: null,
      from: null,
      to: `${editor.selection.length} Goal${editor.selection.length > 1 ? "s" : ""} épinglé${editor.selection.length > 1 ? "s" : ""}`,
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
        detail: "conflit : réglages du board modifiés",
      });
    };
    this.#teamWrites += 1;
    this.#state.teamSaving.value += 1;
    const task = this.#teamQueue.then(async () => {
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
        const raw = await this.#reader.boardProperty(
          configuration.boardId,
          BOARD_PROPERTY_KEYS.teamSettings,
        );
        if (stale()) return;
        const current = raw === null ? null : decodeTeamDocument(raw);
        if (raw !== null && !current)
          throw new Error("Les réglages du board sont illisibles : rien n'a été écrit.");
        const currentIds = current?.settings.boardPinnedGoalIds ?? [];
        if (!sameOrder(currentIds, editor.base)) {
          await conflict(current);
          return;
        }
        if (sameOrder(currentIds, editor.selection)) {
          settle(null);
          return;
        }
        const latest = this.#state.configuration.value ?? configuration;
        const base = current ? withTeamSettings(latest, current.settings) : latest;
        const user = this.#effects.currentUser();
        const outcome = await publishTeamSettings(
          this.#reader,
          {
            write: async (write) => {
              if (stale() || !this.#state.canEditSettings.value)
                throw new Error("Le board ou vos droits ont changé : rien n'a été écrit.");
              return this.#writer.write(write);
            },
          },
          {
            boardId: configuration.boardId,
            settings: teamSettingsOf({ ...base, boardPinnedGoalIds: [...editor.selection] }),
            columns: base.columns,
            basePublishedAt: current?.publishedAt ?? null,
            publishedBy: {
              accountId: user?.accountId ?? null,
              displayName: user?.displayName ?? null,
            },
            now: this.#effects.now(),
          },
        );
        if (stale()) return;
        if (outcome.kind === "conflict") {
          await conflict(outcome.current);
          return;
        }
        this.#state.team.value = { kind: "published", document: outcome.document };
        await this.#applyTeamDocument(outcome.document);
        settle(null);
        await this.#effects.record({
          ...entry,
          outcome: "réussi",
          detail: "propriété du board Kanban",
        });
      } catch (error) {
        if (stale()) return;
        const jiraError = error instanceof JiraError ? error : null;
        const uncertain = jiraError?.isOutcomeUnknown ?? false;
        const forbidden = jiraError?.info.kind === "forbidden";
        const message = toMessage(error);
        if (forbidden) this.#state.canEditBoard.value = false;
        settle({
          ...editor,
          canKeepLocally: false,
          notice: {
            tone: uncertain ? "warning" : "error",
            text: uncertain
              ? `Jira n'a pas confirmé l'enregistrement (${message.text.replace(/\.$/, "")}).`
              : message.text,
            suggestion: uncertain
              ? "Le board va être relu. Vérifiez sa sélection avant de recommencer ; l'extension ne rejoue jamais une écriture."
              : forbidden
                ? "Il faut pouvoir modifier le board pour y épingler des Goals."
                : message.suggestion,
          },
        });
        await this.#effects.record({
          ...entry,
          outcome: uncertain ? "incertain" : "échec",
          detail: message.text,
        });
      }
    });
    this.#teamQueue = task.then(
      () => {},
      () => {},
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
    const task = this.#teamQueue.then(() => this.#saveShared(change));
    this.#teamQueue = task.then(
      () => {},
      () => {},
    );
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
    const task = this.#teamQueue.then(async () => {
      if (
        generation !== this.#effects.scope.generation() ||
        this.#state.configuration.value?.boardId !== configuration.boardId
      )
        return false;
      return this.#saveShared(change, base ?? configuration, sameFamily);
    });
    this.#teamQueue = task.then(
      () => {},
      () => {},
    );
    try {
      return (await task) === true;
    } finally {
      this.#state.teamSaving.value -= 1;
    }
  }

  /** Écrit une modification des réglages partagés sur la version relue dans Jira. */
  async #saveShared(
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
      to: "enregistrement",
    } as const;
    this.#state.teamNotice.value = null;
    try {
      const raw = await this.#reader.boardProperty(boardId, BOARD_PROPERTY_KEYS.teamSettings);
      if (stale()) return false;
      const current = raw === null ? null : decodeTeamDocument(raw);
      if (raw !== null && !current) {
        this.#state.teamNotice.value = {
          tone: "error",
          text: "Réglage non enregistré dans Jira : les réglages du board y sont dans un format inconnu.",
          suggestion:
            "Ils ne sont jamais écrasés. Une version plus récente de l'extension les a peut-être écrits.",
        };
        return false;
      }
      const latest = current ? withTeamSettings(configuration, current.settings) : configuration;
      if (
        confirmed &&
        ((current === null && confirmed.teamBase !== null) ||
          (sameFamily && !sameFamily(confirmed, latest)))
      ) {
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
      // Les autres familles de réglages sont reprises de la version la plus récente.
      const next = current
        ? change(withTeamSettings(configuration, current.settings))
        : confirmed
          ? change(configuration)
          : configuration;
      const writer: JiraWriter = {
        write: async (operation) => {
          if (stale() || !this.#state.canEditSettings.value)
            throw new Error("Le board ou ses droits ont changé avant l'enregistrement.");
          return this.#writer.write(operation);
        },
      };
      const outcome = await publishTeamSettings(this.#reader, writer, {
        boardId,
        settings: teamSettingsOf(next),
        columns: next.columns,
        basePublishedAt: current?.publishedAt ?? null,
        publishedBy: {
          accountId: user?.accountId ?? null,
          displayName: user?.displayName ?? null,
        },
        now: this.#effects.now(),
      });
      if (stale()) return false;
      if (outcome.kind === "published") {
        this.#state.team.value = { kind: "published", document: outcome.document };
        await this.#applyTeamDocument(outcome.document);
        const changes = current ? teamDifferences(next, current.settings) : [];
        await this.#effects.record({
          ...entry,
          outcome: "réussi",
          detail: changes.length > 0 ? changes.join(" ; ") : "réglages du board",
        });
        return true;
      } else {
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
          detail: "modifiés au même moment",
        });
      }
    } catch (error) {
      if (stale()) return false;
      const jiraError = error instanceof JiraError ? error : null;
      const uncertain = jiraError?.isOutcomeUnknown ?? false;
      const forbidden = jiraError?.info.kind === "forbidden";
      const message = toMessage(error);
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
              text: `Jira n'a pas confirmé l'enregistrement du réglage (${message.text.replace(/\.$/, "")}).`,
              suggestion:
                "Les réglages du board vont être relus. L'extension ne rejoue jamais une écriture.",
            }
          : {
              tone: "error",
              text: `Réglage non enregistré dans Jira (${message.text.replace(/\.$/, "")}).`,
              suggestion: "Il sera remplacé par les réglages du board au prochain chargement.",
            };
      await this.#effects.record({
        ...entry,
        outcome: uncertain ? "incertain" : "échec",
        detail: message.text,
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
    let raw: unknown;
    try {
      raw = await this.#reader.boardProperty(
        configuration.boardId,
        BOARD_PROPERTY_KEYS.teamSettings,
      );
    } catch (error) {
      if (!stale()) this.#state.team.value = { kind: "unreadable", message: toMessage(error).text };
      return;
    }
    if (stale()) return;
    if (raw === null) {
      this.#state.team.value = { kind: "none" };
      if (configuration.boardType === "kanban" && configuration.boardPinnedGoalIds.length > 0) {
        await this.#effects.updatePreferences((current) => ({
          ...current,
          boardPinnedGoalIds: [],
        }));
      }
      return;
    }
    const document = decodeTeamDocument(raw);
    if (!document) {
      this.#state.team.value = {
        kind: "unreadable",
        message:
          "Les réglages du board enregistrés dans Jira sont dans un format inconnu (version plus récente de l'extension ?) : ils ne sont pas appliqués.",
      };
      return;
    }
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
function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
