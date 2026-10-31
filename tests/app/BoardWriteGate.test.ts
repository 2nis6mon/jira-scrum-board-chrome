import { describe, expect, it, vi } from "vitest";
import { BOARD_CHANGED_REFUSAL, BoardWriteGate } from "../../src/app/model/BoardWriteGate";
import type { JiraWrite } from "../../src/jira/writes";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function gate(options: { canEdit?: boolean } = {}) {
  const scope = { generation: 1, disposed: false };
  let canEdit = options.canEdit ?? true;
  const writer = { write: vi.fn(async (_write: JiraWrite) => ({ status: 204, body: null })) };
  const goals = { setLink: vi.fn(async () => ({ success: true, messages: [] as string[] })) };
  const subject = new BoardWriteGate({
    writer,
    goals,
    scope: { generation: () => scope.generation, disposed: () => scope.disposed },
    canEditSettings: () => canEdit,
  });
  return {
    subject,
    scope,
    writer,
    goals,
    setCanEdit(value: boolean) {
      canEdit = value;
    },
  };
}

const PUT: JiraWrite = {
  kind: "boardProperty.put",
  boardId: 7,
  key: "com.scrumboardmac.boardsettings.v1",
  value: {},
};
// Un exemple de chaque écriture de l'inventaire : un nouveau kind oblige à compléter ce test.
const EVERY_WRITE: Record<JiraWrite["kind"], JiraWrite> = {
  "sprint.goal": { kind: "sprint.goal", sprintId: 43, goal: "Objectif" },
  "sprint.issues.add": { kind: "sprint.issues.add", sprintId: 43, issueKeys: ["ABC-1"] },
  "sprintProperty.put": {
    kind: "sprintProperty.put",
    sprintId: 42,
    key: "com.scrumboardmac.sprintgoals.v1",
    value: {},
  },
  "sprintProperty.delete": {
    kind: "sprintProperty.delete",
    sprintId: 42,
    key: "com.scrumboardmac.sprintgoals.v1",
  },
  "boardProperty.put": PUT,
  "issue.transition": { kind: "issue.transition", issueKey: "ABC-1", transitionId: "21" },
  "issue.rank": { kind: "issue.rank", issueKey: "ABC-1", before: "ABC-2" },
};
const TRANSITION: JiraWrite = { kind: "issue.transition", issueKey: "ABC-1", transitionId: "21" };

describe("porte d'écriture du board", () => {
  it("sérialise les gestes : le second attend la fin du premier, puis part", async () => {
    const test = gate();
    const order: string[] = [];
    const held = deferred();
    const first = test.subject.run(async ({ writer }) => {
      order.push("premier : début");
      await held.promise;
      await writer.write(TRANSITION);
      order.push("premier : fin");
    });
    const second = test.subject.run(async ({ writer }) => {
      order.push("second");
      await writer.write(PUT);
    });
    await vi.waitFor(() => expect(order).toEqual(["premier : début"]));
    expect(test.subject.busy.value).toBe(2);
    held.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["premier : début", "premier : fin", "second"]);
    expect(test.writer.write.mock.calls.map(([write]) => write.kind)).toEqual([
      "issue.transition",
      "boardProperty.put",
    ]);
    expect(test.subject.busy.value).toBe(0);
  });

  it("une tâche rejetée ne bloque pas la suivante", async () => {
    const test = gate();
    const failed = test.subject.run(async () => {
      throw new Error("échec");
    });
    await expect(failed).rejects.toThrow("échec");
    await expect(test.subject.run(async () => "suivante")).resolves.toBe("suivante");
    expect(test.subject.busy.value).toBe(0);
  });

  it("un geste en attente pendant un changement de board n'écrit rien", async () => {
    const test = gate();
    const held = deferred();
    const first = test.subject.run(() => held.promise);
    const waiting = test.subject.run(async ({ writer, goals }) => {
      await expect(writer.write(TRANSITION)).rejects.toThrow(BOARD_CHANGED_REFUSAL);
      await expect(goals.setLink("goal.link", "g", "1")).rejects.toThrow(BOARD_CHANGED_REFUSAL);
    });
    test.scope.generation += 1;
    held.resolve();
    await Promise.all([first, waiting]);
    expect(test.writer.write).not.toHaveBeenCalled();
    expect(test.goals.setLink).not.toHaveBeenCalled();
  });

  it("refuse toute écriture après la fermeture du board, avec le message demandé", async () => {
    const test = gate();
    test.scope.disposed = true;
    await test.subject.run(
      async ({ writer }) => {
        await expect(writer.write(TRANSITION)).rejects.toThrow("refus propre au geste");
      },
      { refusal: "refus propre au geste" },
    );
    expect(test.writer.write).not.toHaveBeenCalled();
  });

  it.each(Object.values(EVERY_WRITE))(
    "sans canEdit, $kind n'est refusé que s'il s'agit de la propriété du board (E6)",
    async (write) => {
      const test = gate({ canEdit: false });
      await test.subject.run(async ({ writer, goals }) => {
        if (write.kind === "boardProperty.put")
          await expect(writer.write(write)).rejects.toThrow(BOARD_CHANGED_REFUSAL);
        else await writer.write(write);
        await goals.setLink("goal.link", "g", "1");
      });
      expect(test.writer.write).toHaveBeenCalledTimes(write.kind === "boardProperty.put" ? 0 : 1);
      expect(test.goals.setLink).toHaveBeenCalledOnce();
      test.setCanEdit(true);
      await test.subject.run(({ writer }) => writer.write(write));
      expect(test.writer.write).toHaveBeenLastCalledWith(write, undefined);
    },
  );

  it("une écriture n'est jamais rejouée, même après un échec", async () => {
    const test = gate();
    test.writer.write.mockRejectedValueOnce(new Error("délai dépassé"));
    await expect(test.subject.run(({ writer }) => writer.write(TRANSITION))).rejects.toThrow(
      "délai dépassé",
    );
    expect(test.writer.write).toHaveBeenCalledOnce();
  });
});

describe("BoardWriteGate — attente de la file (déconnexion)", () => {
  it("se résout aussitôt quand rien n'est en cours", async () => {
    const test = gate();
    await test.subject.idle();
    expect(test.subject.busy.value).toBe(0);
  });

  it("se résout après une tâche rejetée, sans être rejetée", async () => {
    const test = gate();
    const held = deferred();
    const failing = test.subject.run(async () => {
      await held.promise;
      throw new Error("refus");
    });
    let idle = false;
    const waiting = test.subject.idle().then(() => {
      idle = true;
    });
    await Promise.resolve();
    expect(idle).toBe(false);
    held.resolve();
    await expect(failing).rejects.toThrow("refus");
    await waiting;
    expect(idle).toBe(true);
    expect(test.subject.busy.value).toBe(0);
  });

  it("attend aussi une tâche arrivée pendant l'attente", async () => {
    const test = gate();
    const first = deferred();
    const second = deferred();
    const order: string[] = [];
    const running = test.subject.run(async () => {
      await first.promise;
      order.push("premier");
    });
    const waiting = test.subject.idle().then(() => {
      order.push("vide");
    });
    const late = test.subject.run(async () => {
      await second.promise;
      order.push("second");
    });
    first.resolve();
    await running;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["premier"]);
    second.resolve();
    await Promise.all([late, waiting]);
    expect(order).toEqual(["premier", "second", "vide"]);
  });
});
