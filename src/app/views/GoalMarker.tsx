import { t } from "../i18n";
import { Icon } from "./Icon";

/** Même repère de réussite dans la swimlane et la barre latérale. */
export function GoalMarker({
  completed,
  sidebar = false,
}: {
  completed: boolean;
  sidebar?: boolean;
}) {
  return completed ? (
    <span
      class="goal-completed"
      role="img"
      aria-label={t("Objectif atteint")}
      title={t("Tous les tickets sont dans la dernière colonne")}
    >
      <Icon name="check" size={14} />
    </span>
  ) : (
    <span class={`goal-ring${sidebar ? " sidebar-ring" : ""}`} aria-hidden="true" />
  );
}
