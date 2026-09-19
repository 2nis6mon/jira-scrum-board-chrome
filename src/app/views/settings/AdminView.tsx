import type { AdminSection, AppModel, Connection } from "../../model/AppModel";
import { PinGoalsDialog } from "../board/PinGoalsDialog";
import { DiagnosticView } from "../DiagnosticView";
import { Icon } from "../Icon";
import { BoardSettings } from "./BoardSettings";
import { CardColorSettings } from "./CardColorSettings";
import { CardFieldSettings } from "./CardFieldSettings";
import { GoalSettings } from "./GoalSettings";

type BoardSection = Exclude<AdminSection, "diagnostic">;

const BOARD_SECTIONS: readonly { id: BoardSection; label: string }[] = [
  { id: "board", label: "Board" },
  { id: "goals", label: "Objectifs" },
  { id: "cardFields", label: "Champs des cartes" },
  { id: "cardColors", label: "Couleurs des cartes" },
];

/**
 * Administration, ouverte depuis le pied de la barre latérale : réglages du board affiché (portés
 * de l'administration du Mac, tous gardés dans ce navigateur, jamais écrits dans Jira), puis le
 * diagnostic et la déconnexion du site.
 */
export function AdminView({
  model,
  connection,
}: {
  model: AppModel;
  connection: Extract<Connection, { state: "connected" }>;
}) {
  const { board, diagnostic, site } = connection;
  const configuration = board.configuration.value;
  const section = model.adminSection.value;

  return (
    <main class="settings">
      <nav class="settings-nav" aria-label="Sections de l'administration">
        <h2 class="settings-title">Administration</h2>
        <p class="settings-group">{configuration?.boardName ?? "Board"}</p>
        {BOARD_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            class="settings-tab"
            aria-pressed={section === item.id}
            disabled={!configuration}
            onClick={() => model.showAdmin(item.id)}
          >
            {item.label}
          </button>
        ))}
        <p class="hint settings-local">
          {configuration
            ? "Réglages de ce navigateur, pour ce board. Rien n'est écrit dans Jira."
            : "Choisissez d'abord un board : ces réglages portent sur lui."}
        </p>
        <p class="settings-group">Site Jira</p>
        <button
          type="button"
          class="settings-tab"
          aria-pressed={section === "diagnostic"}
          onClick={() => model.showDiagnostic()}
        >
          Diagnostic
        </button>
        <div class="settings-account">
          <span class="settings-site">{site.host}</span>
          <button type="button" class="settings-signout" onClick={() => void model.disconnect()}>
            <Icon name="signOut" />
            Se déconnecter
          </button>
          <p class="hint">
            Rend l'accès au site à Chrome et oublie, dans ce navigateur, ses boards et leurs
            réglages. Rien n'est modifié dans Jira.
          </p>
        </div>
      </nav>
      <div class="settings-content">
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
      {configuration && <PinGoalsDialog board={board} />}
    </main>
  );
}
