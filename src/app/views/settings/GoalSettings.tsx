import type { BoardConfiguration, GoalSource } from "../../../core/boardConfiguration";
import { GOAL_COLOR_NAMES } from "../../../core/boardPreferences";
import { goalColorName, type SprintGoal } from "../../../core/sprintGoals";
import type { BoardModel } from "../../model/BoardModel";
import { PinGoalsPanel } from "./PinGoalsPanel";

const SOURCES: readonly { id: GoalSource; label: string; help: string }[] = [
  {
    id: "atlassianGoals",
    label: "Goals Atlassian",
    help: "Les objectifs sont de vrais Goals Atlassian. Rattacher un ticket crée le lien Jira natif, visible dans Jira.",
  },
  {
    id: "sprintText",
    label: "Texte du sprint",
    help: "Les objectifs sont les lignes du champ « Objectif » du sprint, lu sans jamais être modifié. Le rattachement est enregistré dans Jira, dans une propriété du sprint.",
  },
];

/** Source des objectifs, épinglage, couleurs et visibilité. */
export function GoalSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const source = configuration.goalSource;

  return (
    <div class="settings-section">
      <section class="panel" aria-labelledby="settings-source">
        <h2 id="settings-source">Source des objectifs</h2>
        <fieldset class="settings-choices">
          <legend class="hint">
            Jira n'a aucune relation native entre un sprint et un Goal : les Goals sont au niveau de
            l'organisation.
          </legend>
          {SOURCES.map((option) => (
            <label key={option.id} class="settings-choice">
              <input
                type="radio"
                name="goal-source"
                checked={source === option.id}
                onChange={() =>
                  void board.applySettings((current) => ({ ...current, goalSource: option.id }), {
                    resync: true,
                  })
                }
              />
              <span>
                <strong>{option.label}</strong>
                <span class="hint">{option.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {board.goalsNotice.value && <p class="notice notice-info">{board.goalsNotice.value}</p>}
      </section>

      {source === "atlassianGoals" && <PinGoalsPanel board={board} />}

      <GoalAppearance board={board} />
    </div>
  );
}

/** Couleur de chaque objectif du sprint, et objectifs masqués du board. */
function GoalAppearance({ board }: { board: BoardModel }) {
  const goals = board.snapshot.value?.goals ?? [];
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  const shown = board.laneOrder.value
    .filter((id) => id.startsWith("goal:"))
    .map((id) => byId.get(id.slice("goal:".length)))
    .filter((goal): goal is SprintGoal => goal !== undefined);
  const hidden = board.hiddenGoals.value;

  return (
    <section class="panel" aria-labelledby="settings-goal-colors">
      <h2 id="settings-goal-colors">Couleur et visibilité des objectifs</h2>
      <p class="hint">
        Un objectif garde sa couleur d'un sprint à l'autre. Masquer un objectif fait passer ses
        tickets dans Build, sans toucher à leur rattachement dans Jira.
      </p>
      {shown.length + hidden.length === 0 ? (
        <p class="hint">Aucun objectif sur ce sprint.</p>
      ) : (
        <ul class="settings-goals">
          {[...shown, ...hidden].map((goal) => {
            const isHidden = hidden.includes(goal);
            return (
              <li key={goal.id} class="settings-row" data-goal-color={goal.color}>
                <span class="goal-ring" aria-hidden="true" />
                <span class="settings-goal-title">{goal.title}</span>
                {isHidden && <span class="settings-tag">masqué</span>}
                <fieldset class="settings-swatches">
                  <legend class="visually-hidden">Couleur de « {goal.title} »</legend>
                  {GOAL_COLOR_NAMES.map((name, index) => (
                    <button
                      key={name}
                      type="button"
                      class="swatch"
                      data-goal-color={goalColorName(index)}
                      aria-label={name}
                      title={name}
                      aria-pressed={goal.color === goalColorName(index)}
                      onClick={() => void board.setGoalColor(goal.id, index)}
                    />
                  ))}
                </fieldset>
                <button type="button" onClick={() => void board.setGoalHidden(goal.id, !isHidden)}>
                  {isHidden ? "Réafficher" : "Masquer"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
