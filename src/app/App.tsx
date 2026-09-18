import type { AppModel } from "./model/AppModel";
import type { BoardModel } from "./model/BoardModel";
import { BoardSetupView } from "./views/BoardSetupView";
import { BoardView } from "./views/board/BoardView";
import { ConnectionView } from "./views/ConnectionView";
import { DiagnosticView } from "./views/DiagnosticView";

/** Racine de l'interface. Sans site Jira connecté, elle n'affiche aucune donnée. */
export function App({ model }: { model: AppModel }) {
  const connection = model.connection.value;
  const view = model.view.value;

  return (
    <>
      <header class="app-header">
        <h1>Scrum Board</h1>
        <span class="app-version">{model.extensionVersion}</span>
        {connection.state === "connected" && (
          <>
            <nav class="app-nav" aria-label="Vues">
              <button
                type="button"
                aria-pressed={view === "board"}
                onClick={() => model.showBoard()}
              >
                Board
              </button>
              <button
                type="button"
                aria-pressed={view === "diagnostic"}
                onClick={() => model.showDiagnostic()}
              >
                Diagnostic
              </button>
            </nav>
            <div class="app-site">
              <span>{connection.site.host}</span>
              <button type="button" onClick={() => void model.disconnect()}>
                Se déconnecter
              </button>
            </div>
          </>
        )}
      </header>
      {connection.state === "loading" && <main class="centered" aria-busy="true" />}
      {connection.state === "disconnected" && (
        <ConnectionView model={model} lastInput={connection.lastInput} />
      )}
      {connection.state === "connected" && view === "board" && (
        <BoardScreen board={connection.board} />
      )}
      {connection.state === "connected" && view === "diagnostic" && (
        <DiagnosticView diagnostic={connection.diagnostic} />
      )}
    </>
  );
}

function BoardScreen({ board }: { board: BoardModel }) {
  if (!board.loaded.value) return <main class="centered" aria-busy="true" />;
  const configuration = board.configuration.value;
  if (!configuration || board.editingBoard.value) return <BoardSetupView board={board} />;
  return <BoardView board={board} configuration={configuration} />;
}
