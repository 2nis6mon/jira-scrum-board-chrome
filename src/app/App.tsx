import { useEffect, useState } from "preact/hooks";
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

/** Site connecté : barre latérale à gauche, vue courante à droite (sprint ou administration). */
function Workspace({
  model,
  connection,
}: {
  model: AppModel;
  connection: Extract<Connection, { state: "connected" }>;
}) {
  const { board } = connection;
  const view = model.view.value;
  const sidebarCollapsed = model.sidebarCollapsed.value;
  const presenting = model.presenting.value && view === "board";

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

  // Échap quitte le mode présentation, sauf si elle sert d'abord à autre chose.
  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Une fenêtre ouverte (choix de transition, épinglage…) se referme d'abord : elle écoute Échap.
      if (document.querySelector('[role="dialog"]')) return;
      // Un menu ouvert se referme d'abord.
      const menu = document.querySelector<HTMLDetailsElement>("details[open]");
      if (menu) {
        menu.open = false;
        return;
      }
      // Dans un champ rempli (recherche), Échap efface d'abord le texte.
      const target = event.target;
      if (
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        target.value !== ""
      ) {
        return;
      }
      model.exitPresentation();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [model, presenting]);

  const controls: ScreenControls = {
    sidebarCollapsed,
    onToggleSidebar: () => model.toggleSidebar(),
    healthOpen: model.healthOpen.value,
    onToggleHealth: () => void model.toggleHealth(),
    presenting,
    onEnterPresentation: () => model.enterPresentation(),
    onExitPresentation: () => model.exitPresentation(),
  };

  return (
    <div class="workspace">
      {!sidebarCollapsed && !presenting && <Sidebar model={model} board={board} />}
      {presenting && <PresentationHint />}
      <div class="workspace-main">
        {view === "board" && <BoardScreen connection={connection} controls={controls} />}
        {view === "admin" && <AdminView model={model} connection={connection} />}
      </div>
    </div>
  );
}

/** Durée d'affichage de la bulle d'aide du mode présentation. */
export const PRESENTATION_HINT_MS = 5000;

/**
 * Bulle flottante montrée quelques secondes à l'entrée en présentation : comment en sortir. Elle ne
 * capte pas la souris ; le bouton « Quitter » de la barre de filtres reste, lui, toujours affiché.
 */
function PresentationHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), PRESENTATION_HINT_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div class="presentation-hint" role="status">
      Mode présentation · <kbd>Échap</kbd> pour revenir
    </div>
  );
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
