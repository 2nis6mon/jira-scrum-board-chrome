import { describe, expect, it } from "vitest";
import { normalizeSwimlanes } from "../../src/core/boardConfiguration";
import { splitByTypeLane } from "../../src/core/planningLanes";
import { makeConfiguration } from "../support/jiraFixtures";

const TYPES = [
  { id: "1", name: "Story", iconUrl: null, category: "GOAL" as const },
  { id: "2", name: "Run", iconUrl: null, category: "SWIMLANE" as const },
  { id: "3", name: "Ops", iconUrl: null, category: "SWIMLANE" as const },
  { id: "4", name: "Epic", iconUrl: null, category: "IGNORED" as const },
];

const item = (key: string, type: string) => ({ key, type });
const type = (entry: { type: string }) => entry.type;

function configuration(parts: Parameters<typeof makeConfiguration>[0] = {}) {
  const swimlanes = normalizeSwimlanes(TYPES, [
    { id: "1", name: "RUN", typeIds: ["2"], hidden: false },
    { id: "2", name: "", typeIds: ["3"], hidden: false },
  ]);
  return makeConfiguration({ issueTypes: TYPES, ticketSwimlanes: swimlanes, ...parts });
}

describe("splitByTypeLane (story 8.40)", () => {
  it("range les tickets dans la swimlane de leur type, Build d'abord", () => {
    const groups = splitByTypeLane(
      configuration(),
      [item("A-1", "2"), item("A-2", "1"), item("A-3", "3"), item("A-4", "2")],
      type,
    );
    expect(groups.map((group) => [group.swimlaneId, group.name])).toEqual([
      [null, "Build"],
      ["1", "RUN"],
      ["2", "Ops"],
    ]);
    expect(groups.map((group) => group.items.map((entry) => entry.key))).toEqual([
      ["A-2"],
      ["A-1", "A-4"],
      ["A-3"],
    ]);
  });

  it("suit l'ordre des blocs du board et le nom de Build choisi", () => {
    const groups = splitByTypeLane(
      configuration({
        blockOrder: ["swimlane:2", "build", "swimlane:1"],
        buildSectionLabel: "Delivery",
      }),
      [item("A-1", "2"), item("A-2", "1"), item("A-3", "3")],
      type,
    );
    expect(groups.map((group) => group.name)).toEqual(["Ops", "Delivery", "RUN"]);
  });

  it("omet les sous-sections sans ticket", () => {
    const groups = splitByTypeLane(configuration(), [item("A-1", "3")], type);
    expect(groups.map((group) => group.name)).toEqual(["Ops"]);
    expect(splitByTypeLane(configuration(), [], type)).toEqual([]);
  });

  it("garde dans Build un type ignoré ou inconnu, et dans sa swimlane une swimlane masquée", () => {
    const hidden = configuration({
      ticketSwimlanes: normalizeSwimlanes(TYPES, [
        { id: "1", name: "RUN", typeIds: ["2"], hidden: true },
      ]),
    });
    const groups = splitByTypeLane(
      hidden,
      [item("A-1", "4"), item("A-2", "99"), item("A-3", "2")],
      type,
    );
    expect(groups.map((group) => [group.name, group.items.map((entry) => entry.key)])).toEqual([
      ["Build", ["A-1", "A-2"]],
      ["RUN", ["A-3"]],
    ]);
  });
});
