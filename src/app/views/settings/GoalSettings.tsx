import type { BoardConfiguration, GoalSource } from "../../../core/boardConfiguration";
import { localize, t } from "../../i18n";
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

/** Onglet Objectifs : leur source, puis les objectifs du sprint (couleur, masquage, épinglage). */
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
    <>
      <section class="settings-card" aria-labelledby="settings-source">
        <header class="settings-card-header">
          <div class="settings-card-title">
            <h2 id="settings-source">{t("Source des objectifs")}</h2>
            <p class="settings-help">
              {kanban
                ? t(
                    "Les Goals Atlassian liés aux tickets deviennent les objectifs du board. Épinglez un Goal pour garder sa ligne visible même sans ticket.",
                  )
                : t(
                    "Jira n'a aucune relation native entre un sprint et un Goal : les Goals sont au niveau de l'organisation.",
                  )}
            </p>
          </div>
        </header>
        <fieldset class="settings-choices">
          <legend class="visually-hidden">{t("Source des objectifs")}</legend>
          {SOURCES.filter((option) => !kanban || option.id === "atlassianGoals").map((option) => (
            <label
              key={option.id}
              class={`settings-choice${source === option.id ? " is-checked" : ""}`}
            >
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
              <span class="settings-choice-text">
                <strong>{localize(option.label)}</strong>
                <span class="settings-help">{localize(option.help)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {board.goalsNotice.value && (
          <p class="notice notice-info">{localize(board.goalsNotice.value)}</p>
        )}
      </section>

      <SprintGoalsPanel board={board} pinning={source === "atlassianGoals"} />
    </>
  );
}
