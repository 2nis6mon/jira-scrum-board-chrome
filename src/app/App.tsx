import { useEffect } from "preact/hooks";
import type { AppModel, Connection } from "./model/AppModel";
import { BoardSetupView } from "./views/BoardSetupView";
import { BoardView, type ScreenControls } from "./views/board/BoardView";
import { ConnectionView } from "./views/ConnectionView";
import { Sidebar } from "./views/Sidebar";
import { AdminView } from "./views/settings/AdminView";

/** Racine de l'interface. Sans site Jira connecté, elle n'affiche aucune donnée. */
export function App({ model }: { model: AppModel }) {
  const connection = model.connection.value;
  if (connection.state === "connected") {
    return <Workspace model={model} connection={connection} />;
  }
  return (
    <>
      <header class="app-header">
        <img src="/icons/icon-32.png" alt="" width="22" height="22" />
        <h1>Sprint Goals Board</h1>
        <span class="app-version">{model.extensionVersion}</span>
      </header>
      {connection.state === "loading" && <main class="centered" aria-busy="true" />}
      {connection.state === "disconnected" && (
        <ConnectionView model={model} lastInput={connection.lastInput} />
      )}
    </>
  );
}

/** Site connecté : barre latérale à gauche, vue courante à droite (board, Sprint Health, admin). */
function Workspace({
  model,
  connection,
}: {
  model: AppModel;
  connection: Extract<Connection, { state: "connected" }>;
}) {
  const { board } = connection;
  const view = model.view.value;
  const presentation = model.presentation.value;
  const sidebarCollapsed = model.sidebarCollapsed.value;

  // Un clic hors d'un menu ouvert le referme.
  useEffect(() => {
    const close = (event: PointerEvent) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>("details[open]")) {
        if (!menu.contains(event.target as Node)) menu.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  // Sortir du plein écran du navigateur (Échap) rend la barre latérale.
  useEffect(() => {
    const leave = () => {
      if (!document.fullscreenElement) model.setPresentation(false);
    };
    document.addEventListener("fullscreenchange", leave);
    return () => document.removeEventListener("fullscreenchange", leave);
  }, [model]);

  const controls: ScreenControls = {
    presentation,
    sidebarCollapsed,
    onToggleSidebar: () => model.toggleSidebar(),
    onTogglePresentation: () => togglePresentation(model),
  };

  return (
    <div class={`workspace${presentation ? " workspace-presentation" : ""}`}>
      {!presentation && !sidebarCollapsed && <Sidebar model={model} board={board} />}
      <div class="workspace-main">
        {view === "board" && <BoardScreen connection={connection} controls={controls} />}
        {view === "health" && <HealthPlaceholder />}
        {view === "admin" && <AdminView model={model} connection={connection} />}
      </div>
    </div>
  );
}

/**
 * Plein écran : la barre latérale disparaît et le navigateur passe en plein écran. S'il le refuse,
 * le board reste dans l'onglet, sans barre latérale ; le même bouton la rend.
 */
function togglePresentation(model: AppModel): void {
  const on = !model.presentation.value;
  model.setPresentation(on);
  if (on) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function BoardScreen({
  connection,
  controls,
}: {
  connection: Extract<Connection, { state: "connected" }>;
  controls: ScreenControls;
}) {
  const { board } = connection;
  if (!board.loaded.value) return <main class="centered" aria-busy="true" />;
  const configuration = board.configuration.value;
  if (!configuration || board.editingBoard.value) return <BoardSetupView board={board} />;
  return <BoardView board={board} configuration={configuration} controls={controls} />;
}

/** Emplacement de Sprint Health, vue qui n'est pas encore construite. */
function HealthPlaceholder() {
  return (
    <main class="centered">
      <div class="panel">
        <h2>Sprint Health</h2>
        <p class="hint">
          La santé du sprint, objectif par objectif, arrivera ici. Cette vue n'est pas encore
          disponible.
        </p>
      </div>
    </main>
  );
}
