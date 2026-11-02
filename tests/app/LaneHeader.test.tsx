// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { GoalProgressSummary } from "../../src/app/views/LaneHeader";
import type { StateTallies } from "../../src/core/columnState";

// Données FICTIVES. Avancement d'un objectif, commun au board et au planning (story 8.20).

afterEach(() => {
  render(null, document.body);
});

const tallies = (todo: [number, number], doing: [number, number], done: [number, number]) =>
  ({
    todo: { count: todo[0], points: todo[1] },
    inProgress: { count: doing[0], points: doing[1] },
    done: { count: done[0], points: done[1] },
  }) satisfies StateTallies;

const widths = () =>
  [...document.querySelectorAll<HTMLElement>(".state-bar i")].map((segment) => [
    segment.dataset.state,
    segment.style.width,
  ]);

describe("avancement d'un objectif", () => {
  it("sans points : barre et texte en tickets", () => {
    render(
      <GoalProgressSummary
        name="Paiement"
        tallies={tallies([2, 0], [1, 0], [1, 0])}
        points={false}
      />,
      document.body,
    );
    expect(document.body.textContent).toContain("1/4 terminés");
    expect(document.body.textContent).not.toContain("pts");
    expect(widths()).toEqual([
      ["done", "25%"],
      ["inProgress", "25%"],
      ["todo", "50%"],
    ]);
  });

  it("points demandés mais aucun ticket estimé : la barre se partage en tickets", () => {
    render(
      <GoalProgressSummary name="Paiement" tallies={tallies([1, 0], [0, 0], [1, 0])} points />,
      document.body,
    );
    expect(document.body.textContent).toContain("1/2 terminés · 0/0 pts");
    expect(widths()).toEqual([
      ["done", "50%"],
      ["todo", "50%"],
    ]);
  });

  it("aucun ticket compté : « Aucun ticket rattaché », sans barre", () => {
    render(
      <GoalProgressSummary name="Paiement" tallies={tallies([0, 0], [0, 0], [0, 0])} points />,
      document.body,
    );
    expect(document.body.textContent).toBe("Aucun ticket rattaché");
    expect(document.querySelector(".state-bar")).toBeNull();
  });
});
