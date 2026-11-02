// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageCache } from "../../src/app/model/ImageCache";
import { PlanningModel } from "../../src/app/model/PlanningModel";
import { PlanningView } from "../../src/app/views/planning/PlanningView";
import { JiraClient } from "../../src/jira/client";
import { GoalsClient } from "../../src/jira/goals";
import { normalizeSiteUrl } from "../../src/jira/site";
import { JiraTransport } from "../../src/jira/transport";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";
import { column, makeConfiguration } from "../support/jiraFixtures";
import { planningFixture } from "../support/planningFixture";

// Jira FICTIF : vraie vue et vrai modèle du planning, pour voir le menu « Sprint à préparer » tel
// qu'il s'affiche (0.48.1, 0.48.2).

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function shownSprints(foreignFutureSprint: boolean | "empty" | "done") {
  const { jira } = planningFixture(undefined, {
    otherFutureSprint: true,
    foreignFutureSprint,
    permissions: { manageSprints: { ABC: true, XYZ: true } },
  });
  const platform = fakePlatform(jira);
  const transport = new JiraTransport({
    site: normalizeSiteUrl("acme.atlassian.net"),
    fetch: platform.fetch,
  });
  const client = new JiraClient(transport);
  const configuration = makeConfiguration({
    boardId: 7,
    estimationFieldId: "customfield_10016",
    columns: [
      column("todo", "À faire", ["1"], 0),
      column("prog", "En cours", ["3", "4"], 1),
      column("done", "Terminé", ["6"], 2),
    ],
  });
  const planning = new PlanningModel(client, platform, {
    configuration: () => configuration,
    canWrite: () => true,
    accountId: () => "u1",
    openIssue: vi.fn(),
    openSprintDialog: vi.fn(() => true),
    goals: new GoalsClient(transport),
    write: async () => {
      throw new Error("aucune écriture attendue");
    },
    record: async () => {},
    wait: async () => {},
    jiraQuickFilters: () => [],
  });
  await planning.load();
  render(
    <PlanningView
      planning={planning}
      images={new ImageCache(() => Promise.reject(new Error("aucun téléchargement")))}
      sidebarCollapsed={false}
      onToggleSidebar={() => {}}
      onBack={() => {}}
    />,
    document.body,
  );
  await tick();
  const select = document.querySelector<HTMLSelectElement>(
    'select[aria-label="Sprint à préparer"]',
  );
  expect(jira.requests.filter(isWriteRequest)).toHaveLength(0);
  return [...(select?.options ?? [])].map((option) => option.value);
}

afterEach(() => render(null, document.body));

describe("Sprint Planning : menu « Sprint à préparer »", () => {
  it("sprint d'un autre board avec un ticket du board à faire : proposé", async () => {
    expect(await shownSprints(true)).toEqual(["43", "44", "46"]);
  });

  it("sprint d'un autre board sans ticket du board : absent du menu", async () => {
    expect(await shownSprints("empty")).toEqual(["43", "44"]);
  });

  it("sprint d'un autre board aux tickets du board tous terminés : absent du menu (0.48.2)", async () => {
    expect(await shownSprints("done")).toEqual(["43", "44"]);
  });
});
