import { describe, expect, it } from "vitest";
import { decodeStoredConfiguration, mergeConfiguration } from "../../src/core/boardConfiguration";
import type { Lane } from "../../src/core/boardLayout";
import {
  withDailyKanbanStockLimit,
  withDailyMinutes,
  withKanbanLabel,
} from "../../src/core/boardSettings";
import {
  cappedKanbanStock,
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

describe("stock du Kanban en daily", () => {
  it("les premières cartes dans l'ordre reçu (le rang de Jira), le reste caché jusqu'au dépliage", () => {
    expect(cappedKanbanStock([1, 2, 3, 4, 5], 3, false)).toEqual({
      shown: [1, 2, 3],
      hidden: [4, 5],
    });
    expect(cappedKanbanStock([1, 2, 3, 4, 5], 3, true)).toEqual({
      shown: [1, 2, 3, 4, 5],
      hidden: [],
    });
    expect(cappedKanbanStock([1, 2], 3, false)).toEqual({ shown: [1, 2], hidden: [] });
  });

  it("3 cartes par défaut, réglable de 1 à 50, gardé à la relecture de Jira", () => {
    const config = makeConfiguration();
    const set = withDailyKanbanStockLimit(config, "5");
    expect(set.ok && set.configuration.dailyKanbanStockLimit).toBe(5);
    for (const raw of ["", "0", "51", "trois", "2.5"]) {
      expect(withDailyKanbanStockLimit(config, raw).ok).toBe(false);
    }
    expect(
      mergeConfiguration(config, { ...config, dailyKanbanStockLimit: 5 }).dailyKanbanStockLimit,
    ).toBe(5);
    const stored = JSON.parse(JSON.stringify(makeConfiguration()));
    delete stored.dailyKanbanStockLimit;
    expect(decodeStoredConfiguration(stored)?.dailyKanbanStockLimit).toBe(3);
  });
});

describe("configuration enregistrée avant 0.21.0 (RUN devenu Kanban)", () => {
  it("anciennes clés relues ; nom Kanban par défaut, réglable", () => {
    const stored = JSON.parse(JSON.stringify(makeConfiguration()));
    stored.runColumns = stored.kanbanColumns;
    delete stored.kanbanColumns;
    stored.showRunSection = false;
    delete stored.showKanbanSection;
    stored.dailyRunStockLimit = 7;
    delete stored.dailyKanbanStockLimit;
    delete stored.kanbanSectionLabel;
    stored.blockOrder = ["goal:g1", "run", "build"];
    stored.collapsedBlockIds = ["run"];
    stored.issueTypes = [
      { id: "10004", name: "Anomalie Prod", category: "RUN", countsAsBug: null },
    ];
    const decoded = decodeStoredConfiguration(stored);
    expect(decoded?.kanbanColumns).toEqual(makeConfiguration().kanbanColumns);
    expect(decoded?.showKanbanSection).toBe(false);
    expect(decoded?.dailyKanbanStockLimit).toBe(7);
    expect(decoded?.blockOrder).toEqual(["goal:g1", "kanban", "build"]);
    expect(decoded?.collapsedBlockIds).toEqual(["kanban"]);
    expect(decoded?.issueTypes[0]?.category).toBe("KANBAN");
    expect(decoded?.kanbanSectionLabel).toBe("Kanban");
    const config = makeConfiguration();
    expect(withKanbanLabel(config, " Run ").kanbanSectionLabel).toBe("Run");
    expect(withKanbanLabel(config, "  ").kanbanSectionLabel).toBe("Kanban");
  });
});
