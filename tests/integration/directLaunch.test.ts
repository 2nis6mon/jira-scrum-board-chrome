import { describe, expect, it } from "vitest";
import { sprintGoalsBoardRoute } from "../../src/integration/boardRoute";
import { configuredBoardAddress } from "../../src/integration/launchAddress";

describe("ouverture directe depuis Jira", () => {
  it("construit l'URL spéciale du board actif", () => {
    expect(
      configuredBoardAddress(
        { origin: "https://acme.atlassian.net" },
        {
          "https://acme.atlassian.net": {
            activeBoardId: 3013,
            boards: { "3013": { projectKeys: ["CLIENT"] } },
          },
        },
      ),
    ).toBe("https://acme.atlassian.net/jira/software/c/projects/CLIENT/boards/3013?sprintGoals=1");
  });

  it("ne reconnaît que l'URL explicitement activée", () => {
    expect(
      sprintGoalsBoardRoute(
        "https://acme.atlassian.net/jira/software/c/projects/CLIENT/boards/3013?sprintGoals=1",
      )?.boardId,
    ).toBe(3013);
    expect(
      sprintGoalsBoardRoute(
        "https://acme.atlassian.net/jira/software/c/projects/CLIENT/boards/3013",
      ),
    ).toBeNull();
  });

  it("refuse une configuration incomplète", () => {
    expect(configuredBoardAddress({}, {})).toBeNull();
    expect(
      configuredBoardAddress(
        { origin: "https://acme.atlassian.net" },
        {
          "https://acme.atlassian.net": {
            activeBoardId: 7,
            boards: { "7": { projectKeys: [] } },
          },
        },
      ),
    ).toBeNull();
  });
});
