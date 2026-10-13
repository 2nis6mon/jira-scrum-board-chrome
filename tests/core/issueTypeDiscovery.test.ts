import { describe, expect, it } from "vitest";
import { withObservedIssueTypes } from "../../src/core/issueTypeDiscovery";
import type { JiraIssueType } from "../../src/jira/models";
import { makeConfiguration, STORY_TYPE, SWIMLANE_TYPE } from "../support/jiraFixtures";

const observed = (id: string, name: string, parts: Partial<JiraIssueType> = {}): JiraIssueType => ({
  id,
  name,
  iconUrl: null,
  subtask: false,
  ...parts,
});

describe("types observés dans les tickets affichés", () => {
  it("garde la même référence quand les types connus n'ont pas changé", () => {
    const configuration = makeConfiguration();
    expect(withObservedIssueTypes(configuration, [])).toBe(configuration);
    expect(
      withObservedIssueTypes(configuration, [
        observed(STORY_TYPE.id, STORY_TYPE.name),
        observed("sub", "Incident enfant", { subtask: true }),
      ]),
    ).toBe(configuration);
  });

  it("actualise les métadonnées sans perdre les choix des types présents ou absents", () => {
    const configuration = makeConfiguration({
      issueTypes: [{ ...STORY_TYPE, category: "IGNORED" }, SWIMLANE_TYPE],
      ticketSwimlanes: [{ id: "9", name: "RUN", typeIds: [SWIMLANE_TYPE.id], hidden: true }],
    });
    const result = withObservedIssueTypes(configuration, [
      observed(STORY_TYPE.id, "Incident renommé", { iconUrl: "https://example.test/type.svg" }),
      observed("incident", "Incident"),
      observed("work", "Travail"),
    ]);

    expect(result.issueTypes.find((type) => type.id === STORY_TYPE.id)).toEqual({
      ...STORY_TYPE,
      name: "Incident renommé",
      iconUrl: "https://example.test/type.svg",
      category: "IGNORED",
    });
    expect(result.issueTypes.find((type) => type.id === SWIMLANE_TYPE.id)).toEqual(SWIMLANE_TYPE);
    expect(result.issueTypes.find((type) => type.id === "incident")?.category).toBe("SWIMLANE");
    expect(result.issueTypes.find((type) => type.id === "work")?.category).toBe("GOAL");
    expect(result.ticketSwimlanes).toEqual([
      { id: "9", name: "RUN", typeIds: [SWIMLANE_TYPE.id, "incident"], hidden: true },
    ]);
    expect(configuration.issueTypes[0]?.name).toBe(STORY_TYPE.name);
    expect(configuration.ticketSwimlanes[0]?.typeIds).toEqual([SWIMLANE_TYPE.id]);
  });

  it("crée la première swimlane depuis les types découverts, une seule fois par type", () => {
    const configuration = makeConfiguration({ issueTypes: [], ticketSwimlanes: [] });
    const incident = observed("incident", "Incident");
    const result = withObservedIssueTypes(configuration, [
      incident,
      incident,
      observed("sub", "Sous-tâche", { subtask: true }),
    ]);

    expect(result.issueTypes).toHaveLength(1);
    expect(result.ticketSwimlanes).toEqual([
      { id: "1", name: "", typeIds: ["incident"], hidden: false },
    ]);
    expect(withObservedIssueTypes(result, [incident])).toBe(result);
  });
});
