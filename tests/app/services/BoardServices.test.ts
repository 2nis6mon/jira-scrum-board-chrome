import { describe, expect, it, vi } from "vitest";
import { BoardWriteGate } from "../../../src/app/model/BoardWriteGate";
import { LoadDiagnostics } from "../../../src/app/model/LoadDiagnostics";
import {
  BoardLoadingService,
  type BoardLoadingState,
} from "../../../src/app/services/BoardLoadingService";
import {
  BoardMovementService,
  type BoardMovementState,
  type MovementCommand,
} from "../../../src/app/services/BoardMovementService";
import {
  BoardSettingsService,
  type BoardSettingsState,
} from "../../../src/app/services/BoardSettingsService";
import type { StateValue } from "../../../src/app/services/ports";
import type { BoardConfiguration } from "../../../src/core/boardConfiguration";
import { assembleBoardIssues, type BoardSnapshot } from "../../../src/core/boardIssue";
import type { BoardReader } from "../../../src/core/boardSync";
import type { JiraWriter } from "../../../src/core/boardWrites";
import { pinnedGoalsStorage } from "../../../src/core/pinnedGoals";
import { makeSprintGoal } from "../../../src/core/sprintGoals";
import { decodeTeamDocument } from "../../../src/core/teamSettings";
import type { JiraClient } from "../../../src/jira/client";
import { JiraError } from "../../../src/jira/errors";
import type { JsonValue } from "../../../src/jira/json";
import { decodeTransition, type JiraIssue } from "../../../src/jira/models";
import { ACME, FakeJira } from "../../support/fakeJira";
import { fakePlatform } from "../../support/fakePlatform";
import { makeConfiguration, makeIssue, makeSprint, statusJson } from "../../support/jiraFixtures";

const NOW = new Date("2026-10-13T12:00:00Z");
const USER = { accountId: "u1", displayName: "Camille", avatarUrls: {} };

/** Les ports des services fonctionnent sans moteur de signaux ni modèle de vue. */
function cell<T>(value: T): StateValue<T> {
  return {
    value,
    peek() {
      return this.value;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function movement(hasScreen = false) {
  const configuration = makeConfiguration();
  const sprint = makeSprint(null);
  const raw = makeIssue("ABC-1");
  const issue = assembleBoardIssues({
    issues: [raw],
    configuration,
    columns: configuration.columns,
    links: { "ABC-1": "old" },
    sprint,
    now: NOW,
  })[0];
  if (!issue) throw new Error("Carte de test absente");
  const snapshot: BoardSnapshot = {
    sprint,
    activeSprints: [sprint],
    goals: [makeSprintGoal({ id: "new", title: "Nouveau", position: 0 })],
    goalsOrigin: "atlassianGoals",
    goalIssues: [issue],
    swimlaneIssues: [],
    syncedAt: NOW,
    currentUser: USER,
    goalsReadOnly: false,
    pinnedGoalIds: [],
    localPinnedGoalIds: null,
  };
  const transition = decodeTransition({
    id: "31",
    name: "Terminer",
    to: statusJson("6", "Terminé", "done"),
    hasScreen,
  });
  const reader = {
    issueStatus: vi.fn(async () => raw.fields.status),
    transitions: vi.fn(async () => [transition]),
    sprintProperty: vi.fn(async () => null),
  };
  const order: string[] = [];
  const writer: JiraWriter = {
    write: vi.fn(async (write) => {
      order.push(write.kind);
      return { status: 204, body: null };
    }),
  };
  const goals = {
    setLink: vi.fn(async (kind: string) => {
      order.push(kind);
      return { success: true, messages: [] as string[] };
    }),
  };
  const state: BoardMovementState = {
    writeNotice: cell(null),
    nativeTransitionPending: cell(false),
    transitionChoice: cell(null),
  };
  const record = vi.fn(async () => {});
  const openNative = vi.fn(() => true);
  const service = new BoardMovementService(reader, state, {
    now: () => NOW,
    record,
    openNative,
    sync: async () => {},
  });
  const command: MovementCommand = {
    issue,
    snapshot,
    column: { name: "Terminé", statusIds: ["6"] },
    drop: {
      issueKey: "ABC-1",
      block: { kind: "goal", goalId: "new" },
      columnId: "done",
      beforeKey: "ABC-2",
    },
    plan: { changesColumn: true, goalChange: { kind: "assign", goalId: "new" } },
    rank: { kind: "before", issueKey: "ABC-2" },
  };
  return { service, command, writer, goals, state, record, openNative, order };
}

describe("service de commandes de déplacement", () => {
  it("enchaîne transition, détachement, rattachement et rang dans cet ordre", async () => {
    const test = movement();
    expect(
      await test.service.execute(test.command, { writer: test.writer, goals: test.goals }),
    ).toBe(true);
    expect(test.order).toEqual(["issue.transition", "goal.unlink", "goal.link", "issue.rank"]);
    expect(test.state.writeNotice.value).toBeNull();
    expect(test.openNative).not.toHaveBeenCalled();
  });

  it("une transition native suspend le déplacement sans écrire Goal ou rang", async () => {
    const test = movement(true);
    expect(
      await test.service.execute(test.command, { writer: test.writer, goals: test.goals }),
    ).toBe(false);
    expect(test.state.nativeTransitionPending.value).toBe(true);
    expect(test.openNative).toHaveBeenCalledOnce();
    expect(test.writer.write).not.toHaveBeenCalled();
    expect(test.goals.setLink).not.toHaveBeenCalled();
  });

  it("un rattachement refusé après détachement signale le succès partiel sans rang ni compensation", async () => {
    const test = movement();
    test.goals.setLink.mockImplementation(async (kind) => {
      test.order.push(kind);
      return { success: kind === "goal.unlink", messages: kind === "goal.link" ? ["Refus"] : [] };
    });
    expect(
      await test.service.execute(test.command, { writer: test.writer, goals: test.goals }),
    ).toBe(false);
    expect(test.order).toEqual(["issue.transition", "goal.unlink", "goal.link"]);
    expect(test.state.writeNotice.value?.text).toContain("ancien Goal a déjà été retiré");
    expect(test.state.writeNotice.value?.text).toContain("Déjà effectué : statut modifié");
    expect(test.record).toHaveBeenCalledTimes(2);
  });
});

function settings() {
  const configuration = cell<BoardConfiguration | null>(makeConfiguration());
  let stored: JsonValue | null = null;
  const reader = {
    boardProperty: vi.fn(async () => stored),
    sprintProperty: vi.fn(async () => null),
    boardCanEdit: vi.fn(async () => true),
  };
  const writer: JiraWriter = {
    write: vi.fn(async (write) => {
      if (write.kind === "boardProperty.put") stored = write.value;
      return { status: 204, body: null };
    }),
  };
  const state: BoardSettingsState = {
    configuration,
    pinEditor: cell(null),
    pinStorage: {
      get value() {
        return pinnedGoalsStorage(configuration.value, null);
      },
    },
    team: cell({ kind: "unknown" }),
    teamSaving: cell(0),
    teamNotice: cell(null),
    canEditBoard: cell(true),
    canEditSettings: cell(true),
    canPinGoals: cell(true),
  };
  const gate = new BoardWriteGate({
    writer,
    goals: { setLink: async () => ({ success: true, messages: [] }) },
    scope: { generation: () => 1, disposed: () => false },
    canEditSettings: () => state.canEditSettings.value,
  });
  const service = new BoardSettingsService(reader, gate, state, {
    scope: { generation: () => 1, disposed: () => false },
    currentUser: () => USER,
    now: () => NOW,
    record: async () => {},
    sync: async () => {},
    updatePreferences: async (change) => {
      if (configuration.value) configuration.value = change(configuration.value);
    },
  });
  return {
    service,
    state,
    reader,
    writer,
    stored: () => stored,
    setStored: (value: JsonValue) => {
      stored = value;
    },
  };
}

describe("service de réglages partagés", () => {
  it("sérialise les publications et réapplique le second changement sur le premier confirmé", async () => {
    const test = settings();
    const firstWrite = deferred<void>();
    const write = vi.mocked(test.writer.write);
    write.mockImplementationOnce(async (command) => {
      await firstWrite.promise;
      if (command.kind === "boardProperty.put") test.setStored(command.value);
      return { status: 204, body: null };
    });
    const first = test.service.changeShared((current) => ({
      ...current,
      buildSectionLabel: "Construction",
    }));
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const second = test.service.changeShared((current) => ({ ...current, agingThresholdDays: 8 }));
    await vi.waitFor(() => expect(test.state.teamSaving.value).toBe(2));
    expect(write).toHaveBeenCalledTimes(1);
    firstWrite.resolve();
    await Promise.all([first, second]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(decodeTeamDocument(test.stored())?.settings).toMatchObject({
      buildSectionLabel: "Construction",
      agingThresholdDays: 8,
    });
    expect(test.state.teamSaving.value).toBe(0);
  });

  it("une écriture incertaine n'est jamais rejouée et déclenche une relecture", async () => {
    const test = settings();
    vi.mocked(test.writer.write).mockRejectedValueOnce(new JiraError({ kind: "timeout" }));
    await test.service.changeShared((current) => ({
      ...current,
      buildSectionLabel: "Construction",
    }));
    expect(test.writer.write).toHaveBeenCalledOnce();
    expect(test.reader.boardProperty).toHaveBeenCalledTimes(3);
    expect(test.state.teamNotice.value?.tone).toBe("warning");
    expect(test.state.team.value.kind).toBe("none");
    expect(test.state.teamSaving.value).toBe(0);
  });
});

function loading() {
  const state: BoardLoadingState = {
    configuration: cell(makeConfiguration()),
    snapshot: cell(null),
    setupBusy: cell(false),
    syncing: cell(false),
    syncProblem: cell(null),
    goalsNotice: cell(null),
    goalsWarnings: cell([]),
  };
  const reader: BoardReader & Pick<JiraClient, "myself"> = {
    site: ACME,
    boardStructure: async () => {
      throw new Error("Aucune détection de structure attendue");
    },
    statuses: async () => [],
    fields: async () => [],
    sprints: vi.fn(async () => [makeSprint(null)]),
    sprintIssues: vi.fn(async () => [makeIssue("ABC-1")]),
    boardIssues: async () => [],
    sprintProperty: async () => null,
    myself: vi.fn(async () => USER),
  };
  const scope = { generation: 1, disposed: false };
  const diagnostics = new LoadDiagnostics(fakePlatform(new FakeJira()));
  const refreshFilters = vi.fn(async () => {});
  const refreshColors = vi.fn(async () => {});
  const service = new BoardLoadingService(
    reader,
    { load: async () => ({ goals: [], links: {} }) },
    state,
    diagnostics,
    {
      scope: { generation: () => scope.generation, disposed: () => scope.disposed },
      now: () => NOW,
      refreshSettings: async () => {},
      prepareFilters: () => {},
      updatePreferences: async (change) => {
        if (state.configuration.value)
          state.configuration.value = change(state.configuration.value);
      },
      refreshFilters,
      refreshColors,
    },
  );
  return { service, reader, state, scope, diagnostics, refreshFilters, refreshColors };
}

describe("service de chargement", () => {
  it("regroupe les demandes pendant une lecture en une seule relecture séquentielle", async () => {
    const test = loading();
    const firstPage = deferred<JiraIssue[]>();
    vi.mocked(test.reader.sprintIssues).mockImplementationOnce(() => firstPage.promise);
    const initial = test.service.sync();
    await vi.waitFor(() => expect(test.reader.sprintIssues).toHaveBeenCalledOnce());
    const again = test.service.sync();
    const onceMore = test.service.sync();
    expect(test.reader.sprintIssues).toHaveBeenCalledOnce();
    firstPage.resolve([makeIssue("ABC-2")]);
    await Promise.all([initial, again, onceMore]);
    expect(test.reader.sprintIssues).toHaveBeenCalledTimes(2);
    expect(test.reader.myself).toHaveBeenCalledOnce();
    expect(test.state.snapshot.value?.goalIssues.map((issue) => issue.issue.key)).toEqual([
      "ABC-1",
    ]);
    expect(test.service.running).toBe(false);
    expect(test.state.syncing.value).toBe(false);
  });

  it("une fermeture pendant les tickets empêche publication, traitements complémentaires et resync", async () => {
    const test = loading();
    const firstPage = deferred<JiraIssue[]>();
    vi.mocked(test.reader.sprintIssues).mockImplementationOnce(() => firstPage.promise);
    const pending = test.service.sync();
    await vi.waitFor(() => expect(test.reader.sprintIssues).toHaveBeenCalledOnce());
    const queued = test.service.sync();
    test.scope.disposed = true;
    test.scope.generation += 1;
    test.service.cancel();
    firstPage.resolve([makeIssue("ABC-1")]);
    await Promise.all([pending, queued]);
    expect(test.reader.sprintIssues).toHaveBeenCalledOnce();
    expect(test.state.snapshot.value).toBeNull();
    expect(test.refreshFilters).not.toHaveBeenCalled();
    expect(test.refreshColors).not.toHaveBeenCalled();
    expect(test.diagnostics.current.value?.status).toBe("cancelled");
  });
});
