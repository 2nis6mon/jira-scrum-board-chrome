// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModel } from "../../src/app/model/BoardModel";
import { BoardView, type ScreenControls } from "../../src/app/views/board/BoardView";
import { startDaily } from "../../src/core/daily";
import { setLanguage } from "../../src/i18n";
import { normalizeSiteUrl } from "../../src/jira/site";
import { BOARD_URL, boardSiteJira } from "../support/boardFixture";
import { isWriteRequest } from "../support/fakeJira";
import { fakePlatform } from "../support/fakePlatform";

// Données fictives : même vocabulaire que les messages de l'application pour détecter
// une traduction accidentelle des noms Jira ou des noms personnalisés.
const boards: BoardModel[] = [];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  render(null, document.body);
  for (const board of boards.splice(0)) board.dispose();
  setLanguage("fr");
});

function controls(overrides: Partial<ScreenControls> = {}): ScreenControls {
  return {
    sidebarCollapsed: false,
    onToggleSidebar: vi.fn(),
    healthOpen: false,
    onToggleHealth: vi.fn(),
    presenting: false,
    onEnterPresentation: vi.fn(),
    onExitPresentation: vi.fn(),
    daily: null,
    onStartDaily: vi.fn(),
    onUpdateDaily: vi.fn(),
    onStopDaily: vi.fn(),
    onShowPinning: vi.fn(),
    onShowSettings: null,
    ...overrides,
  };
}

async function loaded() {
  const jira = boardSiteJira({
    quickFilters: [
      { id: 1, name: "Bloqués", description: "Objectif", jql: 'labels = "équipe"', position: 0 },
    ],
  });
  const board = new BoardModel(normalizeSiteUrl("acme.atlassian.net"), fakePlatform(jira), {
    now: () => new Date("2026-09-18T10:00:00Z"),
  });
  boards.push(board);
  await board.load();
  await board.detect(BOARD_URL);
  const configuration = board.configuration.value;
  if (!configuration) throw new Error("board attendu");
  return { board, jira, configuration };
}

describe("board traduit", () => {
  it("bascule les commandes sans modifier le contenu Jira, les filtres ou les données", async () => {
    const { board, jira, configuration } = await loaded();
    const filters = { ...board.filters.value, searchText: "paiement" };
    board.setFilters(filters);
    const requests = jira.requests.length;
    setLanguage("en");
    render(
      <BoardView board={board} configuration={configuration} controls={controls()} />,
      document.body,
    );
    await tick();

    expect(document.querySelector('[aria-label="Search"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Start daily"]')).not.toBeNull();
    expect(document.querySelector(".chip-blocked")?.textContent).toBe("Blocked");
    const jiraFilter = document.querySelector(".chip-jira");
    expect(jiraFilter?.textContent).toBe("Bloqués");
    expect(jiraFilter?.getAttribute("title")).toBe(
      'Objectif\nJQL evaluated by Jira: labels = "équipe"',
    );
    expect(document.body.textContent).toContain("Finaliser le parcours de paiement");
    expect(document.body.textContent).toContain("Afficher le récapitulatif avant paiement");
    expect(document.body.textContent).toContain("À faire");

    setLanguage("fr");
    await tick();
    expect(document.querySelector('[aria-label="Rechercher"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Lancer la daily"]')).not.toBeNull();
    expect(board.filters.value.searchText).toBe("paiement");
    expect(jira.requests).toHaveLength(requests);
    expect(jira.requests.filter(isWriteRequest)).toEqual([]);
  });

  it("traduit la daily et ses aides accessibles en conservant le titre de l'objectif", async () => {
    const { board, configuration } = await loaded();
    const lane = board.layout.value?.lanes[0];
    if (!lane) throw new Error("swimlane attendue");
    const session = startDaily(15, lane.id, Date.now());
    const screen = controls({ daily: { ...session, pausedAt: session.startedAt } });
    setLanguage("en");
    render(
      <BoardView board={board} configuration={configuration} controls={screen} />,
      document.body,
    );
    await tick();

    expect(document.querySelector('[aria-label="Previous swimlane"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Next swimlane"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Resume timer"]')).not.toBeNull();
    expect(document.querySelector(".daily-paused-label")?.textContent).toBe("Paused");
    expect(document.querySelector(".daily-step-title")?.textContent).toBe(lane.title);
    expect(document.querySelector(".daily-stop")?.textContent).toBe("Finish");
  });
});
