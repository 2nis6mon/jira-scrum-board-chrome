import { describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import type { CardColorRule } from "../../src/core/cardColors";
import { encodeTeamDocument, teamSettingsOf } from "../../src/core/teamSettings";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const property = "/rest/agile/1.0/board/7/properties/com.scrumboardmac.boardsettings.v1";
const rule = (id: string): CardColorRule => ({
  id,
  name: id,
  jql: "labels = perf",
  color: "red",
  enabled: true,
  kind: null,
});
async function fixture() {
  const jira = boardSiteJira();
  const board = new BoardModel(normalizeSiteUrl("acme.atlassian.net"), fakePlatform(jira));
  await board.load(BOARD_URL);
  return { board, jira };
}

describe("publication des brouillons JQL", () => {
  it("refuse d'écraser les règles d'un collègue apparues depuis l'ouverture", async () => {
    const { board, jira } = await fixture();
    const remote = encodeTeamDocument({
      version: 1,
      publishedAt: "2026-10-14T11:00:00Z",
      publishedBy: { accountId: "other", displayName: "Collègue" },
      settings: teamSettingsOf({
        ...required(board.configuration.value),
        cardColorRules: [rule("collègue")],
      }),
    });
    jira.on("GET", property, { status: 200, json: { value: remote } });
    expect(await board.applyColorRules([rule("moi")])).toBe(false);
    expect(board.configuration.value?.cardColorRules[0]?.id).toBe("collègue");
    expect(board.teamNotice.value?.text).toContain("changé");
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    board.dispose();
  });

  it("garde la base d'avant validation même si une synchronisation modifie les règles entretemps", async () => {
    const { board, jira } = await fixture();
    let finish!: () => void;
    vi.spyOn(board.jql, "validate").mockImplementation(
      (text) =>
        new Promise((resolve) => {
          finish = () => resolve({ text, status: "valid", errors: [], warnings: [] });
        }),
    );
    const applying = board.applyColorRules([rule("moi")]);
    board.configuration.value = {
      ...required(board.configuration.value),
      cardColorRules: [rule("collègue")],
    };
    finish();
    expect(await applying).toBe(false);
    expect(board.configuration.value?.cardColorRules[0]?.id).toBe("collègue");
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    board.dispose();
  });

  it("la fermeture pendant la dernière relecture interdit l'écriture", async () => {
    const { board, jira } = await fixture();
    let reads = 0;
    jira.on("GET", property, () => {
      reads += 1;
      if (reads === 2) board.dispose();
      return { status: 404 };
    });
    expect(await board.applyColorRules([rule("moi")])).toBe(false);
    expect(reads).toBe(2);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });
});

function required<T>(value: T | null): T {
  if (value === null) throw new Error("Configuration attendue");
  return value;
}
