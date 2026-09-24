import type { AdminSection, AppModel, Connection } from "../../model/AppModel";
import { DiagnosticView } from "../DiagnosticView";
import { BoardSettings } from "./BoardSettings";
import { CardColorSettings } from "./CardColorSettings";
import { CardFieldSettings } from "./CardFieldSettings";
import { GoalSettings } from "./GoalSettings";

type BoardSection = Exclude<AdminSection, "diagnostic">;

/**
 * Diagnostic affiché : Denis l'a masqué puis rétabli le 24/09/2026, le bandeau « Invalid CORS
 * request » y renvoyant — c'est le seul écran qui essaie les variantes de l'en-tête Origin et
 * retient celle que la passerelle des Goals accepte. Le masquer coupe cette issue de secours.
 */
export const DIAGNOSTIC_ENABLED = true;

/** Sections des réglages du board, dépliées dans la barre latérale. */
export const BOARD_SECTIONS: readonly { id: BoardSection; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "goals", label: "Objectifs" },
  { id: "cardFields", label: "Champs des cartes" },
  { id: "cardColors", label: "Couleurs des cartes" },
];

/**
 * Contenu de l'administration : réglages du board affiché — partagés avec l'équipe, chaque
 * modification est enregistrée dans la propriété du board (0.22.0) — ou diagnostic. Les sections, le site et la
 * déconnexion se choisissent dans la barre latérale, sous le bouton Administration.
 */
export function AdminView({
  model,
  connection,
}: {
  model: AppModel;
  connection: Extract<Connection, { state: "connected" }>;
}) {
  const { board, diagnostic } = connection;
  const configuration = board.configuration.value;
  // Sans droit de modifier le board, seul le diagnostic reste : les réglages sont partagés.
  const section = board.canEditSettings.value ? model.adminSection.value : "diagnostic";
  const teamNotice = board.teamNotice.value;
  const team = board.team.value;

  return (
    <main class="settings">
      <div class="settings-content">
        {section !== "diagnostic" && teamNotice && (
          <div class={`notice notice-${teamNotice.tone} notice-inline`} role="alert">
            <p>
              <strong>{teamNotice.text}</strong>
              {teamNotice.suggestion && ` ${teamNotice.suggestion}`}
            </p>
            <button type="button" aria-label="Fermer" onClick={() => board.dismissTeamNotice()}>
              ×
            </button>
          </div>
        )}
        {section !== "diagnostic" && team.kind === "unreadable" && (
          <div class="notice notice-warning" role="status">
            <p>Réglages du board non relus dans Jira : {team.message}</p>
          </div>
        )}
        {section === "diagnostic" ? (
          <DiagnosticView diagnostic={diagnostic} />
        ) : !board.loaded.value ? (
          <div class="centered" aria-busy="true" />
        ) : configuration ? (
          // Un autre board : les brouillons repartent de sa configuration.
          <div key={configuration.boardId}>
            {section === "board" && <BoardSettings board={board} configuration={configuration} />}
            {section === "goals" && <GoalSettings board={board} configuration={configuration} />}
            {section === "cardFields" && (
              <CardFieldSettings board={board} configuration={configuration} />
            )}
            {section === "cardColors" && (
              <CardColorSettings board={board} configuration={configuration} />
            )}
          </div>
        ) : (
          <div class="panel settings-no-board">
            <p>Aucun board n'est encore choisi : ces réglages portent sur un board.</p>
            <div class="row">
              <button
                type="button"
                class="primary"
                onClick={() => {
                  model.showBoard();
                  board.editBoard();
                }}
              >
                Choisir un board
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
