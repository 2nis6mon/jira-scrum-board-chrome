import type { AdminSection, AppModel, Connection } from "../../model/AppModel";
import { PinGoalsDialog } from "../board/PinGoalsDialog";
import { DiagnosticView } from "../DiagnosticView";
import { BoardSettings } from "./BoardSettings";
import { CardColorSettings } from "./CardColorSettings";
import { CardFieldSettings } from "./CardFieldSettings";
import { GoalSettings } from "./GoalSettings";
import { TeamSettings } from "./TeamSettings";

type BoardSection = Exclude<AdminSection, "diagnostic">;

/** Sections des réglages du board, dépliées dans la barre latérale. */
export const BOARD_SECTIONS: readonly { id: BoardSection; label: string }[] = [
  { id: "team", label: "Réglages d'équipe" },
  { id: "board", label: "Board" },
  { id: "goals", label: "Objectifs" },
  { id: "cardFields", label: "Champs des cartes" },
  { id: "cardColors", label: "Couleurs des cartes" },
];

/**
 * Contenu de l'administration : réglages du board affiché (portés de l'administration du Mac, tous
 * gardés dans ce navigateur, jamais écrits dans Jira) ou diagnostic. Les sections, le site et la
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
  const section = model.adminSection.value;

  return (
    <main class="settings">
      <div class="settings-content">
        {section === "diagnostic" ? (
          <DiagnosticView diagnostic={diagnostic} />
        ) : !board.loaded.value ? (
          <div class="centered" aria-busy="true" />
        ) : configuration ? (
          // Un autre board : les brouillons repartent de sa configuration.
          <div key={configuration.boardId}>
            {section === "team" && <TeamSettings board={board} configuration={configuration} />}
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
      {configuration && <PinGoalsDialog board={board} />}
    </main>
  );
}
