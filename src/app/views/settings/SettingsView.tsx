import type { BoardConfiguration } from "../../../core/boardConfiguration";
import { localize, t } from "../../i18n";
import type { AppModel, SettingsSection } from "../../model/AppModel";
import type { BoardModel } from "../../model/BoardModel";
import "../../styles/settings.css";
import { formatDay, formatTime } from "../format";
import { Icon } from "../Icon";
import { BoardSettings } from "./BoardSettings";
import { CardColorSettings } from "./CardColorSettings";
import { CardFieldSettings } from "./CardFieldSettings";
import { GoalSettings } from "./GoalSettings";

/** Onglets des réglages du board, dans l'ordre de la barre d'onglets. */
export const SETTINGS_SECTIONS: readonly { id: SettingsSection; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "goals", label: "Objectifs" },
  { id: "cardFields", label: "Champs des cartes" },
  { id: "cardColors", label: "Couleurs des cartes" },
];

/**
 * Réglages du board : ils s'ouvrent depuis son en-tête ou ses menus et remplacent le board
 * dans la page, la barre latérale restant. Partagés avec l'équipe :
 * chaque modification est enregistrée dans la propriété du board, sauf celles qui attendent
 * « Appliquer » ou « Enregistrer dans Jira » (champs, couleurs, épinglage).
 */
export function SettingsView({
  model,
  board,
  configuration,
}: {
  model: AppModel;
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const section = model.settingsSection.value;
  const teamNotice = board.teamNotice.value;
  const team = board.team.value;
  const kanban = configuration.boardType === "kanban";

  // Onglets au clavier : flèches gauche et droite, Début et Fin ; l'onglet atteint s'ouvre.
  const onTabKey = (event: KeyboardEvent) => {
    const index = SETTINGS_SECTIONS.findIndex((item) => item.id === section);
    const last = SETTINGS_SECTIONS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % SETTINGS_SECTIONS.length
        : event.key === "ArrowLeft"
          ? (index + last) % SETTINGS_SECTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    const target = next === null ? undefined : SETTINGS_SECTIONS[next];
    if (!target) return;
    event.preventDefault();
    model.showSettings(target.id);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${target.id}`)?.focus());
  };

  return (
    <main class="settings-screen" aria-labelledby="settings-title">
      <header class="settings-header">
        <div class="settings-header-bar">
          <button type="button" class="settings-back" onClick={() => model.showBoard()}>
            <Icon name="arrowLeft" size={15} />
            {t("Retour au board")}
          </button>
          <TeamStatus board={board} />
        </div>
        <div class="settings-heading">
          <h1 id="settings-title">{t("Réglages du board")}</h1>
          <span class="settings-board">
            {configuration.boardName} · {kanban ? "Kanban" : "Scrum"} ·{" "}
            <span class="settings-board-id">#{configuration.boardId}</span>
          </span>
        </div>
        <p class="settings-intro">
          {t("Partagés avec toute l'équipe et enregistrés dans Jira, avec le board.")}
        </p>
        <div class="settings-tabs" role="tablist" aria-label={t("Réglages du board")}>
          {SETTINGS_SECTIONS.map((item) => {
            const selected = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`settings-tab-${item.id}`}
                aria-selected={selected}
                aria-controls="settings-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => model.showSettings(item.id)}
                onKeyDown={onTabKey}
              >
                {localize(item.label)}
              </button>
            );
          })}
        </div>
      </header>
      <div
        class="settings-body"
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${section}`}
      >
        {teamNotice && (
          <div class={`notice notice-${teamNotice.tone} notice-inline`} role="alert">
            <p>
              <strong>{localize(teamNotice.text)}</strong>
              {teamNotice.suggestion && ` ${localize(teamNotice.suggestion)}`}
            </p>
            <button
              type="button"
              aria-label={t("Fermer")}
              onClick={() => board.dismissTeamNotice()}
            >
              ×
            </button>
          </div>
        )}
        {team.kind === "unreadable" && (
          <div class="notice notice-warning" role="status">
            <p>
              {t("Réglages du board non relus dans Jira :")} {localize(team.message)}
            </p>
          </div>
        )}
        {/* Un autre board : les brouillons repartent de sa configuration. */}
        <div key={`${configuration.boardId}:${section}`} class="settings-section">
          {section === "board" && <BoardSettings board={board} configuration={configuration} />}
          {section === "goals" && <GoalSettings board={board} configuration={configuration} />}
          {section === "cardFields" && (
            <CardFieldSettings board={board} configuration={configuration} />
          )}
          {section === "cardColors" && (
            <CardColorSettings board={board} configuration={configuration} />
          )}
        </div>
      </div>
    </main>
  );
}

/** État des réglages partagés dans Jira : écriture en cours, dernier enregistrement ou aucun. */
function TeamStatus({ board }: { board: BoardModel }) {
  const team = board.team.value;
  if (board.teamSaving.value > 0) {
    return (
      <span class="settings-status settings-status-busy" role="status">
        <span class="settings-status-dot" aria-hidden="true" />
        {t("Enregistrement dans Jira…")}
      </span>
    );
  }
  if (team.kind === "published") {
    const { publishedAt, publishedBy } = team.document;
    const at = new Date(publishedAt);
    const when = Number.isNaN(at.getTime())
      ? ""
      : t(", {v0} à {v1}", { v0: formatDay(at), v1: formatTime(at) });
    return (
      <span class="settings-status settings-status-saved" role="status">
        <Icon name="check" size={13} />
        {t("Enregistrés dans Jira")}
        {publishedBy.displayName ? t(" par {v0}", { v0: publishedBy.displayName }) : ""}
        {when}
      </span>
    );
  }
  if (team.kind === "none") {
    return (
      <span class="settings-status" role="status">
        {t("Aucun réglage enregistré dans Jira pour l'instant")}
      </span>
    );
  }
  return null;
}
