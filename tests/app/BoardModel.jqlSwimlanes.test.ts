import { describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { allIssues } from "../../src/core/boardIssue";
import { migrateToJqlSwimlanes } from "../../src/core/jqlSwimlanes";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira, SPRINT_ISSUES } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

const SITE = normalizeSiteUrl("acme.atlassian.net");
function required<T>(value: T | null): T {
  if (value === null) throw new Error("État du board attendu dans le scénario");
  return value;
}
const lane = (id: string, jql: string) => ({
  id,
  name: id,
  jql,
  enabled: true,
  hidden: false,
  typeIds: [],
});
const idsFor = (keys: readonly string[]) =>
  SPRINT_ISSUES.filter((issue) => keys.includes(String(issue.key))).map((issue) =>
    Number(issue.id),
  );

async function fixture() {
  const jira = boardSiteJira();
  const board = new BoardModel(SITE, fakePlatform(jira));
  await board.load();
  await board.detect(BOARD_URL);
  return { jira, board };
}

describe("BoardModel — swimlanes JQL", () => {
  it("prévisualise la migration sans écriture et conserve le classement initial avant appliquer", async () => {
    const { jira, board } = await fixture();
    const before = required(board.configuration.value);
    const migrated = migrateToJqlSwimlanes(before);
    const preview = await board.previewSwimlanes(migrated.ticketSwimlanes);
    expect(preview.lanes[0]?.matched).toBe(1);
    expect(board.configuration.value).toBe(before);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    expect(await board.applyJqlSwimlanes(migrated.ticketSwimlanes)).toBe(true);
    expect(board.configuration.value?.swimlaneMode).toBe("jql");
    expect(
      allIssues(required(board.snapshot.value)).find((issue) => issue.issue.key === "RUN-7")
        ?.swimlaneId,
    ).toBe(migrated.ticketSwimlanes[0]?.id);
  });

  it("objectifs prioritaires, première règle gagnante et Default ; pas de tickets extérieurs", async () => {
    const { jira, board } = await fixture();
    jira.on("POST", "/rest/api/3/jql/match", (request) => ({
      status: 200,
      json: {
        matches: (request.body as { jqls: string[] }).jqls.map(() => ({
          matchedIssues: [...idsFor(["ABC-101", "ABC-104"]), 99999999],
          errors: [],
        })),
      },
    }));
    const lanes = [lane("run", "labels = run"), lane("support", "labels = support")];
    const preview = await board.previewSwimlanes(lanes);
    expect(preview.lanes[0]).toMatchObject({ matched: 2, assigned: 1, goals: 1, earlier: 0 });
    expect(preview.lanes[1]).toMatchObject({ matched: 2, assigned: 0, goals: 1, earlier: 1 });
    expect(await board.applyJqlSwimlanes(lanes)).toBe(true);
    expect(
      board.layout.value?.lanes.find((item) => item.id === "goal:g-paiement")?.totalCount,
    ).toBe(2);
    expect(board.layout.value?.lanes.find((item) => item.id === "swimlane:run")?.totalCount).toBe(
      1,
    );
    expect(board.layout.value?.lanes.some((item) => item.id === "swimlane:support")).toBe(false);
    expect(allIssues(required(board.snapshot.value))).toHaveLength(6);
    board.dispose();
  });

  it("refuse une requête invalide avant publication et garde les règles actives", async () => {
    const { jira, board } = await fixture();
    const before = board.configuration.value;
    expect(await board.applyJqlSwimlanes([lane("run", "unknown ~~ x")])).toBe(false);
    expect(board.configuration.value).toBe(before);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
    board.dispose();
  });

  it("un refus d'enregistrement ne remplace pas les réglages actifs par le brouillon", async () => {
    const { jira, board } = await fixture();
    jira.on("PUT", "/rest/agile/1.0/board/7/properties/com.scrumboardmac.boardsettings.v1", {
      status: 403,
      json: { errorMessages: ["Refus"] },
    });
    expect(await board.applyJqlSwimlanes([lane("run", "labels = perf")])).toBe(false);
    expect(board.configuration.value?.swimlaneMode).not.toBe("jql");
    expect(board.teamNotice.value?.tone).toBe("error");
    board.dispose();
  });

  it("une règle illisible préserve la destination précédente et signale le classement incomplet", async () => {
    const { jira, board } = await fixture();
    const lanes = migrateToJqlSwimlanes(required(board.configuration.value)).ticketSwimlanes;
    expect(await board.applyJqlSwimlanes(lanes)).toBe(true);
    const before = allIssues(required(board.snapshot.value)).find(
      (issue) => issue.issue.key === "RUN-7",
    )?.swimlaneId;
    jira.on("POST", "/rest/api/3/jql/match", {
      status: 200,
      json: { matches: [{ matchedIssues: [], errors: ["Champ supprimé"] }] },
    });
    await board.sync();
    expect(board.syncProblem.value).toBeNull();
    expect(allIssues(required(board.snapshot.value))).toHaveLength(6);
    expect(
      allIssues(required(board.snapshot.value)).find((issue) => issue.issue.key === "RUN-7")
        ?.swimlaneId,
    ).toBe(before);
    expect(board.unresolvedSwimlaneKeys.value.size).toBe(6);
    expect(Object.values(board.swimlaneRuleIssues.value)).toContain("Champ supprimé");
    board.dispose();
  });

  it("mutualise la même requête de couleur et de swimlane pendant un chargement", async () => {
    const { jira, board } = await fixture();
    await board.applyColorRules([
      { id: "perf", name: "Perf", jql: "labels = perf", color: "red", enabled: true, kind: null },
    ]);
    await board.applyJqlSwimlanes([lane("perf", "labels = perf")]);
    const before = jira.sent("POST", "/rest/api/3/jql/match").length;
    await board.sync();
    const reads = jira.sent("POST", "/rest/api/3/jql/match").slice(before);
    expect(reads).toHaveLength(1);
    expect(reads[0]?.body).toMatchObject({ jqls: ["labels = perf"] });
    expect(board.cardColors.value["ABC-103"]).toBe("red");
    board.dispose();
  });

  it("une validation terminée après la fermeture du board ne publie rien", async () => {
    const { jira, board } = await fixture();
    let finish!: () => void;
    vi.spyOn(board.jql, "validate").mockImplementation(
      (text) =>
        new Promise((resolve) => {
          finish = () => resolve({ text, status: "valid", errors: [], warnings: [] });
        }),
    );
    const applying = board.applyColorRules([
      { id: "r", name: "R", jql: "labels = perf", color: "red", enabled: true, kind: null },
    ]);
    board.dispose();
    finish();
    expect(await applying).toBe(false);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("réordonner le board conserve les positions des règles masquées, suspendues et vides", async () => {
    const { jira, board } = await fixture();
    jira.on("POST", "/rest/api/3/jql/match", (request) => ({
      status: 200,
      json: {
        matches: (request.body as { jqls: string[] }).jqls.map((query) => ({
          matchedIssues: idsFor(
            query === "labels = a" ? ["RUN-7"] : query === "labels = b" ? ["ABC-105"] : [],
          ),
          errors: [],
        })),
      },
    }));
    const rules = [
      { ...lane("hidden", "labels = hidden"), hidden: true },
      lane("a", "labels = a"),
      { ...lane("off", "labels = off"), enabled: false },
      lane("b", "labels = b"),
      lane("empty", "labels = empty"),
    ];
    expect(await board.applyJqlSwimlanes(rules)).toBe(true);
    expect(board.laneOrder.value).toEqual([
      "goal:g-paiement",
      "goal:g-stabilite",
      "build",
      "swimlane:a",
      "swimlane:b",
    ]);
    await board.dropLane("build", null);
    expect(board.configuration.value?.ticketSwimlanes.map((rule) => rule.id)).toEqual([
      "hidden",
      "a",
      "off",
      "b",
      "empty",
    ]);
    await board.dropLane("swimlane:b", "swimlane:a");
    expect(board.configuration.value?.ticketSwimlanes.map((rule) => rule.id)).toEqual([
      "hidden",
      "b",
      "off",
      "a",
      "empty",
    ]);
    expect(board.laneOrder.value).toEqual([
      "goal:g-paiement",
      "goal:g-stabilite",
      "swimlane:b",
      "swimlane:a",
      "build",
    ]);
    board.dispose();
  });
});
