import type { BoardConfiguration, GoalSource } from "../../../core/boardConfiguration";
import type { BoardModel } from "../../model/BoardModel";
import { SprintGoalsPanel } from "./SprintGoalsPanel";

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

/** Source des objectifs, puis les objectifs du sprint : couleur, masquage, épinglage. */
export function GoalSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const kanban = configuration.boardType === "kanban";
  const source = kanban ? "atlassianGoals" : configuration.goalSource;

  return (
    <div class="settings-section">
      <section class="panel" aria-labelledby="settings-source">
        <h2 id="settings-source">Source des objectifs</h2>
        <fieldset class="settings-choices">
          <legend class="hint">
            {kanban
              ? "Les Goals Atlassian liés aux tickets deviennent les objectifs du board. Épinglez un Goal pour garder sa ligne visible même sans ticket."
              : "Jira n'a aucune relation native entre un sprint et un Goal : les Goals sont au niveau de l'organisation."}
          </legend>
          {SOURCES.filter((option) => !kanban || option.id === "atlassianGoals").map((option) => (
            <label key={option.id} class="settings-choice">
              <input
                type="radio"
                name="goal-source"
                checked={source === option.id}
                disabled={kanban}
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

      <SprintGoalsPanel board={board} pinning={source === "atlassianGoals"} />
    </div>
  );
}
