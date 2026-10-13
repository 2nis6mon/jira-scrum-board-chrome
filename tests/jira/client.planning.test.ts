import { describe, expect, it } from "vitest";
import { JiraClient } from "../../src/jira/client";
import { JiraTransport } from "../../src/jira/transport";
import { ACME, FakeJira } from "../support/fakeJira";
import { issueJson } from "../support/jiraFixtures";

const path = "/rest/software/1.0/board/7/backlog";
const query = { estimationFieldId: "customfield_10016", includeChangelog: false };
const client = (jira: FakeJira) =>
  new JiraClient(new JiraTransport({ site: ACME, fetch: jira.fetch, maxGetAttempts: 1 }));

describe("lectures du planning Jira", () => {
  it("relit le sprint natif par identifiant", async () => {
    const jira = new FakeJira().on("GET", "/rest/agile/1.0/sprint/43", {
      status: 200,
      json: { id: 43, name: "Prochain sprint", state: "future", goal: "Objectif" },
    });
    expect(await client(jira).sprint(43)).toMatchObject({
      id: 43,
      state: "future",
      goal: "Objectif",
    });
  });

  it("charge toutes les pages enhanced avec leurs jetons et garde le filtre du board", async () => {
    const jira = new FakeJira().on(
      "GET",
      path,
      {
        status: 200,
        json: { issues: [issueJson("ABC-1")], isLast: false, nextPageToken: "suite" },
      },
      { status: 200, json: { issues: [issueJson("ABC-2")], isLast: true } },
    );
    expect((await client(jira).backlogIssues(7, query)).map((issue) => issue.key)).toEqual([
      "ABC-1",
      "ABC-2",
    ]);
    expect(jira.requests[0]?.url.searchParams.get("nextPageToken")).toBeNull();
    expect(jira.requests[1]?.url.searchParams.get("nextPageToken")).toBe("suite");
    expect(jira.requests[0]?.url.searchParams.get("fields")).toContain("customfield_10016");
    expect(jira.requests.every((request) => request.method === "GET")).toBe(true);
  });

  it.each([
    { issues: [issueJson("ABC-1")], isLast: false },
    { issues: [], isLast: false, nextPageToken: "suite" },
    { issues: [issueJson("ABC-1")] },
  ])("refuse une pagination incomplète : %j", async (body) => {
    const jira = new FakeJira().on("GET", path, { status: 200, json: body });
    await expect(client(jira).backlogIssues(7, query)).rejects.toThrow("pagination");
  });

  it("refuse les jetons répétés et tickets répétés", async () => {
    const duplicateToken = new FakeJira().on(
      "GET",
      path,
      {
        status: 200,
        json: { issues: [issueJson("ABC-1")], nextPageToken: "suite", isLast: false },
      },
      {
        status: 200,
        json: { issues: [issueJson("ABC-2")], nextPageToken: "suite", isLast: false },
      },
    );
    await expect(client(duplicateToken).backlogIssues(7, query)).rejects.toThrow("pagination");
    const duplicateIssue = new FakeJira().on(
      "GET",
      path,
      {
        status: 200,
        json: { issues: [issueJson("ABC-1")], nextPageToken: "suite", isLast: false },
      },
      { status: 200, json: { issues: [issueJson("ABC-1")], isLast: true } },
    );
    await expect(client(duplicateIssue).backlogIssues(7, query)).rejects.toThrow("répété");
  });

  it("accepte un backlog vide terminal", async () => {
    const jira = new FakeJira().on("GET", path, {
      status: 200,
      json: { issues: [], isLast: true },
    });
    expect(await client(jira).backlogIssues(7, query)).toEqual([]);
  });
});
