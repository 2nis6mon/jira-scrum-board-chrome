import { describe, expect, it } from "vitest";
import { embeddedBoardTarget } from "../../src/integration/embedded";
import { embeddingTarget } from "../../src/integration/embeddingGuard";

// Données FICTIVES. Paquet d'essai : la page du board encadrée dans une page Jira.

const SITE = "https://acme.atlassian.net";
const BOARD = `${SITE}/jira/software/c/projects/ABC/boards/7?sprintGoals=1`;

const request = (overrides: Partial<Parameters<typeof embeddingTarget>[0]> = {}) => ({
  jiraHost: SITE,
  jiraBoard: BOARD,
  ancestors: [SITE],
  ...overrides,
});

describe("hébergement de la page du board dans une page Jira", () => {
  it("admis dans la page Jira de premier niveau du même site, pour un board de ce site", () => {
    expect(embeddingTarget(request())).toEqual({
      origin: SITE,
      permissionPattern: `${SITE}/*`,
      address: BOARD,
    });
  });

  it("refusé dans la page d'un autre site Atlassian, même s'il annonce le vôtre", () => {
    expect(embeddingTarget(request({ ancestors: ["https://evil.atlassian.net"] }))).toBeNull();
    expect(
      embeddingTarget(
        request({
          jiraHost: "https://evil.atlassian.net",
          ancestors: ["https://evil.atlassian.net"],
        }),
      ),
    ).toBeNull();
  });

  it("refusé dans un cadre imbriqué, sans parent connu, ou hors d'Atlassian", () => {
    expect(embeddingTarget(request({ ancestors: [SITE, SITE] }))).toBeNull();
    expect(embeddingTarget(request({ ancestors: [] }))).toBeNull();
    expect(
      embeddingTarget(
        request({
          jiraHost: "https://jira.evil.example",
          ancestors: ["https://jira.evil.example"],
        }),
      ),
    ).toBeNull();
    // Origine annoncée sous une autre forme que celle du site : refusée, pas corrigée.
    expect(embeddingTarget(request({ jiraHost: `${SITE}/` }))).toBeNull();
    expect(embeddingTarget(request({ jiraHost: null }))).toBeNull();
  });

  it("refusé pour un board d'un autre site ou sans le marqueur sprintGoals=1", () => {
    expect(
      embeddingTarget(
        request({
          jiraBoard:
            "https://autre.atlassian.net/jira/software/c/projects/ABC/boards/7?sprintGoals=1",
        }),
      ),
    ).toBeNull();
    expect(
      embeddingTarget(request({ jiraBoard: `${SITE}/jira/software/c/projects/ABC/boards/7` })),
    ).toBeNull();
    expect(embeddingTarget(request({ jiraBoard: null }))).toBeNull();
  });

  it("le site doit en plus être autorisé dans Chrome", async () => {
    const granted = new Set<string>();
    const platform = {
      permissions: {
        contains: async (pattern: string) => granted.has(pattern),
        request: async () => false,
        remove: async () => true,
      },
    };
    const place = {
      search: `?jiraHost=${encodeURIComponent(SITE)}&jiraBoard=${encodeURIComponent(BOARD)}`,
      ancestorOrigins: [SITE],
    };
    expect(await embeddedBoardTarget(platform, place)).toBeNull();
    granted.add(`${SITE}/*`);
    expect((await embeddedBoardTarget(platform, place))?.address).toBe(BOARD);
    // Sans `ancestorOrigins` (navigateur qui ne le fournit pas) : refusé.
    expect(await embeddedBoardTarget(platform, { search: place.search })).toBeNull();
  });
});
