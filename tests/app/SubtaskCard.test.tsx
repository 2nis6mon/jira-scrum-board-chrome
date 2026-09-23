// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { ImageCache } from "../../src/app/model/ImageCache";
import { IssueCard } from "../../src/app/views/board/IssueCard";
import { assembleBoardIssues } from "../../src/core/boardIssue";
import { decodeIssue } from "../../src/jira/models";
import { issueJson, makeConfiguration, statusJson } from "../support/jiraFixtures";

// Données FICTIVES. La carte d'une story montre l'avancement de ses sous-tâches repliées, et
// signale les incohérences entre elles et la place de la story.

afterEach(() => {
  render(null, document.body);
});

const SUBTASK_TYPE = { id: "10003", name: "Sous-tâche", subtask: true };
const ref = (key: string, category: string) => ({
  key,
  fields: {
    summary: `Morceau ${key}`,
    status: statusJson(
      { new: "1", indeterminate: "3", done: "6" }[category] ?? "1",
      category,
      category,
    ),
    issuetype: SUBTASK_TYPE,
  },
});

function showCard(subtasks: unknown[], lastColumnId: (columnId: string | null) => string | null) {
  const configuration = makeConfiguration();
  const [card] = assembleBoardIssues({
    issues: [decodeIssue(issueJson("ABC-1", { summary: "Story", extraFields: { subtasks } }))],
    configuration,
    columns: configuration.scrumColumns,
    links: {},
    now: new Date("2026-09-18T12:00:00Z"),
  });
  if (!card) throw new Error("carte attendue");
  render(
    <IssueCard
      issue={card}
      siteOrigin="https://acme.atlassian.net"
      images={new ImageCache(async () => new Blob())}
      cardFields={[]}
      parentColor={null}
      agingThresholdDays={99}
      goalTitle={null}
      lastColumnId={lastColumnId(card.columnId)}
    />,
    document.body,
  );
}

const bar = () => document.querySelector(".card-subtasks");
const openAlert = () => document.querySelector(".badge-subtasks-open");

describe("sous-tâches sur la carte", () => {
  it("une barre, un segment par sous-tâche, terminées d'abord, et « terminées / total »", () => {
    showCard(
      [ref("ABC-2", "new"), ref("ABC-3", "done"), ref("ABC-4", "indeterminate")],
      () => "autre",
    );
    const segments = [...document.querySelectorAll(".subtask-bar i")].map((segment) =>
      segment.getAttribute("data-status"),
    );
    expect(segments).toEqual(["done", "indeterminate", "new"]);
    expect(bar()?.querySelector(".subtask-count")?.textContent).toBe("1/3");
    expect(bar()?.getAttribute("aria-label")).toBe("Sous-tâches : 1 sur 3 terminées.");
    // Le détail de chaque sous-tâche est dans l'info-bulle.
    expect(bar()?.getAttribute("title")).toContain("ABC-4 — Morceau ABC-4 (indeterminate)");
  });

  it("toutes terminées avant la dernière colonne : la carte dit que la story peut avancer", () => {
    showCard([ref("ABC-2", "done"), ref("ABC-3", "done")], () => "autre");
    expect(bar()?.classList.contains("card-subtasks-ready")).toBe(true);
    expect(bar()?.getAttribute("aria-label")).toContain("le ticket peut avancer");
    expect(openAlert()).toBeNull();
  });

  it("story dans la dernière colonne avec des sous-tâches ouvertes : une alerte", () => {
    showCard([ref("ABC-2", "done"), ref("ABC-3", "indeterminate")], (columnId) => columnId);
    expect(openAlert()?.textContent).toBe("1");
    expect(openAlert()?.getAttribute("title")).toContain("ABC-3");
    expect(bar()?.classList.contains("card-subtasks-ready")).toBe(false);
  });

  it("story sans sous-tâche : ni barre ni alerte", () => {
    showCard([], (columnId) => columnId);
    expect(bar()).toBeNull();
    expect(openAlert()).toBeNull();
  });
});
