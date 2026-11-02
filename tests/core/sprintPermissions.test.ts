import { describe, expect, it, vi } from "vitest";
import {
  proposableSprintIds,
  type SprintPermissionReader,
  sprintPermissionCache,
} from "../../src/core/sprintPermissions";
import { decodeSprint } from "../../src/jira/models";

const sprint = (id: number, originBoardId?: number) =>
  decodeSprint({ id, name: `Sprint ${id}`, state: "future", originBoardId });

/** Lecteur fictif : projets par board, droit « Gérer les sprints » par projet. */
function reader(options: {
  administrator?: boolean | "error";
  boards?: Record<number, string[] | "error">;
  manage?: Record<string, boolean | "error">;
}) {
  const boardProjectKeys = vi.fn(async (boardId: number) => {
    const projects = options.boards?.[boardId] ?? [];
    if (projects === "error") throw new Error("403");
    return projects;
  });
  const myPermissions = vi.fn(async (keys: readonly string[], projectKey?: string) => {
    if (projectKey === undefined) {
      if (options.administrator === "error") throw new Error("403");
      return Object.fromEntries(keys.map((key) => [key, options.administrator === true]));
    }
    const right = options.manage?.[projectKey] ?? false;
    if (right === "error") throw new Error("403");
    return Object.fromEntries(keys.map((key) => [key, right]));
  });
  return { boardProjectKeys, myPermissions } satisfies SprintPermissionReader;
}

describe("sprints proposables selon les droits de l'utilisateur", () => {
  it("retire un sprint d'un autre board sans « Gérer les sprints »", async () => {
    const read = reader({ boards: { 7: ["ABC"], 9: ["XYZ"] }, manage: { ABC: true } });
    const ids = await proposableSprintIds(read, [sprint(43, 7), sprint(46, 9)]);
    expect([...ids]).toEqual([43]);
  });

  it("exige le droit sur tous les projets du board d'origine", async () => {
    const read = reader({ boards: { 9: ["ABC", "XYZ"] }, manage: { ABC: true, XYZ: false } });
    expect([...(await proposableSprintIds(read, [sprint(46, 9)]))]).toEqual([]);
  });

  it("propose tout à un administrateur de Jira, sans lecture par projet", async () => {
    const read = reader({ administrator: true, boards: { 9: ["XYZ"] } });
    expect([...(await proposableSprintIds(read, [sprint(46, 9)]))]).toEqual([46]);
    expect(read.boardProjectKeys).not.toHaveBeenCalled();
  });

  it.each([
    ["sans board d'origine", sprint(46), {}],
    ["board sans projet référencé", sprint(46, 9), { boards: { 9: [] } }],
    ["projets illisibles", sprint(46, 9), { boards: { 9: "error" as const } }],
    [
      "droit illisible",
      sprint(46, 9),
      { boards: { 9: ["XYZ"] }, manage: { XYZ: "error" as const } },
    ],
    [
      "droit global illisible",
      sprint(46, 9),
      { administrator: "error" as const, boards: { 9: ["XYZ"] }, manage: { XYZ: true } },
    ],
  ])("garde un sprint indécidable : %s", async (_case, candidate, options) => {
    expect([...(await proposableSprintIds(reader(options), [candidate]))]).toEqual([46]);
  });

  it("ne lit rien pour des sprints sans board d'origine", async () => {
    const read = reader({});
    await proposableSprintIds(read, [sprint(46)]);
    expect(read.myPermissions).not.toHaveBeenCalled();
  });

  it("partage ses lectures par board et par projet grâce au cache", async () => {
    const read = reader({ boards: { 7: ["ABC"] }, manage: { ABC: true } });
    const cache = sprintPermissionCache();
    await proposableSprintIds(read, [sprint(43, 7), sprint(44, 7)], cache);
    await proposableSprintIds(read, [sprint(45, 7)], cache);
    expect(read.boardProjectKeys).toHaveBeenCalledTimes(1);
    // Un droit global, puis un droit par projet.
    expect(read.myPermissions).toHaveBeenCalledTimes(2);
  });
});
