import { describe, expect, it } from "vitest";
import { sprintGoalsBoardRoute } from "../../src/integration/boardRoute";
import { configuredBoardAddress } from "../../src/integration/launchAddress";

// Stockage local fictif : seules les clés de connexion et de boards sont lues.
function stored(connection: unknown, boards: unknown) {
  const values = new Map<string, unknown>([
    ["connection.v1", connection],
    ["boards.v1", boards],
  ]);
  return {
    get: async (key: string) => values.get(key),
    set: async () => {},
    remove: async () => {},
  };
}

describe("ouverture directe depuis Jira", () => {
  it("construit l'URL spéciale du board actif", async () => {
    expect(
      await configuredBoardAddress(
        stored(
          { origin: "https://acme.atlassian.net" },
          {
            "https://acme.atlassian.net": {
              activeBoardId: 3013,
              boards: { "3013": { projectKeys: ["CLIENT"] } },
            },
          },
        ),
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

  it("refuse une configuration incomplète", async () => {
    expect(await configuredBoardAddress(stored({}, {}))).toBeNull();
    expect(
      await configuredBoardAddress(
        stored(
          { origin: "https://acme.atlassian.net" },
          {
            "https://acme.atlassian.net": {
              activeBoardId: 7,
              boards: { "7": { projectKeys: [] } },
            },
          },
        ),
      ),
    ).toBeNull();
  });
});
