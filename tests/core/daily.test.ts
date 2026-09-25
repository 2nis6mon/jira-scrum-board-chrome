import { describe, expect, it } from "vitest";
import { decodeStoredConfiguration, mergeConfiguration } from "../../src/core/boardConfiguration";
import type { Lane } from "../../src/core/boardLayout";
import { withDailyMinutes, withDailyStockLimit } from "../../src/core/boardSettings";
import {
  cappedStock,
  currentStepIndex,
  dailyElapsed,
  dailyPhase,
  dailyRemaining,
  dailySteps,
  formatDailyClock,
  formatDailyElapsed,
  moveDailyStep,
  startDaily,
  stepElapsed,
  toggleDailyPause,
  toggleStockExpanded,
} from "../../src/core/daily";
import { makeConfiguration } from "../support/jiraFixtures";

// Mode Daily : étapes, minuteur, pauses. Données FICTIVES.

const lane = (id: string, visibleCount = 1): Lane =>
  ({ id, title: id, visibleCount, totalCount: visibleCount }) as unknown as Lane;
const T0 = 1_000_000;
const MIN = 60_000;

describe("étapes de la daily", () => {
  it("suivent l'ordre du board et sautent les swimlanes sans ticket affiché", () => {
    const steps = dailySteps([lane("goal:a"), lane("goal:vide", 0), lane("build"), lane("kanban")]);
    expect(steps.map((step) => step.id)).toEqual(["goal:a", "build", "kanban"]);
  });

  it("Suivant et Précédent restent dans la liste", () => {
    const steps = dailySteps([lane("a"), lane("b"), lane("c")]);
    let session = startDaily(15, "a", T0);
    session = moveDailyStep(steps, session, -1, T0);
    expect(session.stepId).toBe("a");
    session = moveDailyStep(steps, session, 1, T0);
    session = moveDailyStep(steps, session, 1, T0);
    session = moveDailyStep(steps, session, 1, T0);
    expect([session.stepId, currentStepIndex(steps, session)]).toEqual(["c", 2]);
  });

  it("une swimlane disparue laisse la place à celle qui a pris son rang", () => {
    const session = moveDailyStep(
      dailySteps([lane("a"), lane("b"), lane("c")]),
      startDaily(15, "a", T0),
      1,
      T0,
    );
    const after = dailySteps([lane("a"), lane("c")]);
    expect(after[currentStepIndex(after, session)]?.id).toBe("c");
    expect(currentStepIndex([], session)).toBe(-1);
  });

  it("board vide au départ : la première swimlane apparue est présentée", () => {
    const session = startDaily(15, null, T0);
    expect(currentStepIndex(dailySteps([lane("a"), lane("b")]), session)).toBe(0);
  });
});

describe("minuteur de la daily", () => {
  it("décompte depuis l'heure de départ, puis affiche le dépassement", () => {
    const session = startDaily(15, "a", T0);
    expect(formatDailyClock(dailyRemaining(session, T0))).toBe("15:00");
    expect(formatDailyClock(dailyRemaining(session, T0 + 55_500))).toBe("14:05");
    expect(dailyPhase(dailyRemaining(session, T0 + 12 * MIN))).toBe("running");
    expect(dailyPhase(dailyRemaining(session, T0 + 13 * MIN))).toBe("ending");
    const over = dailyRemaining(session, T0 + 16 * MIN + 23_000);
    expect(dailyPhase(over)).toBe("overtime");
    expect(formatDailyClock(over)).toBe("+01:23");
  });

  it("la pause fige le minuteur et n'est pas décomptée", () => {
    let session = startDaily(15, "a", T0);
    session = toggleDailyPause(session, T0 + MIN);
    expect(dailyElapsed(session, T0 + 10 * MIN)).toBe(MIN);
    session = toggleDailyPause(session, T0 + 10 * MIN);
    expect(dailyElapsed(session, T0 + 11 * MIN)).toBe(2 * MIN);
  });

  it("chaque étape a son propre temps, pauses exclues", () => {
    const steps = dailySteps([lane("a"), lane("b")]);
    let session = startDaily(15, "a", T0);
    session = moveDailyStep(steps, session, 1, T0 + 3 * MIN);
    expect(formatDailyElapsed(stepElapsed(session, T0 + 4 * MIN + 7_900))).toBe("01:07");
    session = toggleDailyPause(session, T0 + 5 * MIN);
    expect(stepElapsed(session, T0 + 9 * MIN)).toBe(2 * MIN);
  });
});

describe("durée de la daily", () => {
  it("15 minutes par défaut, gardée à la relecture de Jira, validée à la saisie", () => {
    const config = makeConfiguration();
    const set = withDailyMinutes(config, " 20 ");
    expect(set.ok && set.configuration.dailyMinutes).toBe(20);
    for (const raw of ["", "0", "121", "dix", "7.5"]) {
      expect(withDailyMinutes(config, raw).ok).toBe(false);
    }
    const mine = { ...config, dailyMinutes: 20 };
    expect(mergeConfiguration(config, mine).dailyMinutes).toBe(20);
  });

  it("une valeur enregistrée invalide ou absente revient à 15", () => {
    const stored = JSON.parse(JSON.stringify(makeConfiguration()));
    expect(decodeStoredConfiguration({ ...stored, dailyMinutes: 30 })?.dailyMinutes).toBe(30);
    expect(decodeStoredConfiguration({ ...stored, dailyMinutes: 500 })?.dailyMinutes).toBe(15);
    delete stored.dailyMinutes;
    expect(decodeStoredConfiguration(stored)?.dailyMinutes).toBe(15);
  });
});

describe("stock en daily, dans chaque swimlane", () => {
  it("les premières cartes dans l'ordre reçu (le rang de Jira), le reste caché jusqu'au dépliage", () => {
    expect(cappedStock([1, 2, 3, 4, 5], 3, false)).toEqual({
      shown: [1, 2, 3],
      hidden: [4, 5],
    });
    expect(cappedStock([1, 2, 3, 4, 5], 3, true)).toEqual({
      shown: [1, 2, 3, 4, 5],
      hidden: [],
    });
    expect(cappedStock([1, 2], 3, false)).toEqual({ shown: [1, 2], hidden: [] });
  });

  it("chaque swimlane se déplie et se replie seule, jusqu'à la fin de la daily", () => {
    const session = startDaily(15, "goal:g1", T0);
    expect(session.expandedStockIds).toEqual([]);
    const opened = toggleStockExpanded(toggleStockExpanded(session, "goal:g1"), "swimlane:1");
    expect(opened.expandedStockIds).toEqual(["goal:g1", "swimlane:1"]);
    expect(toggleStockExpanded(opened, "goal:g1").expandedStockIds).toEqual(["swimlane:1"]);
  });

  it("3 cartes par défaut, réglable de 1 à 50, gardé à la relecture de Jira", () => {
    const config = makeConfiguration();
    const set = withDailyStockLimit(config, "5");
    expect(set.ok && set.configuration.dailyStockLimit).toBe(5);
    for (const raw of ["", "0", "51", "trois", "2.5"]) {
      expect(withDailyStockLimit(config, raw).ok).toBe(false);
    }
    expect(mergeConfiguration(config, { ...config, dailyStockLimit: 5 }).dailyStockLimit).toBe(5);
    const stored = JSON.parse(JSON.stringify(makeConfiguration()));
    delete stored.dailyStockLimit;
    expect(decodeStoredConfiguration(stored)?.dailyStockLimit).toBe(3);
  });
});

describe("configurations enregistrées avant les swimlanes par type (0.23.0)", () => {
  const legacy = () => {
    const stored = JSON.parse(JSON.stringify(makeConfiguration()));
    stored.scrumColumns = stored.columns;
    delete stored.columns;
    delete stored.ticketSwimlanes;
    delete stored.dailyStockLimit;
    return stored;
  };

  it("avant 0.21.0 (RUN) : une swimlane par type « 1 », masquage et place dans l'ordre gardés", () => {
    const stored = legacy();
    stored.runColumns = stored.scrumColumns;
    stored.showRunSection = false;
    stored.dailyRunStockLimit = 7;
    stored.blockOrder = ["goal:g1", "run", "build"];
    stored.collapsedBlockIds = ["run"];
    stored.issueTypes = [
      { id: "10004", name: "Anomalie Prod", category: "RUN", countsAsBug: null },
    ];
    const decoded = decodeStoredConfiguration(stored);
    expect(decoded?.columns).toEqual(makeConfiguration().columns);
    expect(decoded?.ticketSwimlanes).toEqual([
      { id: "1", name: "", typeIds: ["10004"], hidden: true },
    ]);
    expect(decoded?.dailyStockLimit).toBe(7);
    expect(decoded?.blockOrder).toEqual(["goal:g1", "swimlane:1", "build"]);
    expect(decoded?.collapsedBlockIds).toEqual(["swimlane:1"]);
    expect(decoded?.issueTypes[0]?.category).toBe("SWIMLANE");
  });

  it("0.21–0.22 (Kanban) : un nom changé est gardé, « Kanban » laisse place au nom calculé", () => {
    const stored = legacy();
    stored.kanbanColumns = stored.scrumColumns;
    stored.showKanbanSection = true;
    stored.kanbanSectionLabel = "Run";
    stored.dailyKanbanStockLimit = 4;
    stored.blockOrder = ["kanban", "build"];
    stored.issueTypes = [
      { id: "10001", name: "Story", category: "SCRUM", countsAsBug: null },
      { id: "10004", name: "Anomalie Prod", category: "KANBAN", countsAsBug: null },
      { id: "10005", name: "Anomalie de Recette", category: "KANBAN", countsAsBug: null },
    ];
    const decoded = decodeStoredConfiguration(stored);
    expect(decoded?.ticketSwimlanes).toEqual([
      { id: "1", name: "Run", typeIds: ["10004", "10005"], hidden: false },
    ]);
    expect(decoded?.issueTypes.map((type) => type.category)).toEqual([
      "GOAL",
      "SWIMLANE",
      "SWIMLANE",
    ]);
    expect(decoded?.dailyStockLimit).toBe(4);
    expect(decoded?.blockOrder).toEqual(["swimlane:1", "build"]);

    stored.kanbanSectionLabel = "Kanban";
    expect(decodeStoredConfiguration(stored)?.ticketSwimlanes[0]?.name).toBe("");
  });

  it("aucun type hors objectifs : aucune swimlane par type", () => {
    const stored = legacy();
    stored.issueTypes = [{ id: "10001", name: "Story", category: "SCRUM", countsAsBug: null }];
    expect(decodeStoredConfiguration(stored)?.ticketSwimlanes).toEqual([]);
  });
});
