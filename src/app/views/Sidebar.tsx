import { useEffect, useState } from "preact/hooks";
import type { BoardConfiguration } from "../../core/boardConfiguration";
import { type LaneSummary, laneSummaries } from "../../core/boardPreferences";
import { type AppModel, clampSidebarWidth, SIDEBAR_WIDTH } from "../model/AppModel";
import type { BoardModel, BoardSummary } from "../model/BoardModel";
import { LANE_DRAG_TYPE, revealLane } from "./board/lanes";
import { DIAGNOSTIC_ENABLED } from "./DiagnosticView";
import { GoalMarker } from "./GoalMarker";
import { Icon, type IconName } from "./Icon";

/**
 * Barre latérale. De haut en bas : board affiché (et son menu), vue du sprint (la santé du sprint y
 * est un panneau) et réglages du board, swimlanes dans l'ordre du board (un clic y mène, un glissé
 * les réordonne), objectifs masqués, et « Site Jira » en pied de barre : son bouton déplie le
 * diagnostic, le site et la déconnexion, communs à tous les boards.
 */
export function Sidebar({ model, board }: { model: AppModel; board: BoardModel }) {
  const view = model.view.value;
  const configuration = board.configuration.value;
  const snapshot = board.snapshot.value;
  const kanban = configuration?.boardType === "kanban";
  const lanes =
    snapshot && configuration && (snapshot.sprint || kanban)
      ? laneSummaries(snapshot, configuration)
      : null;
  // Réglages du board : partagés, donc réservés à qui peut modifier le board dans Jira.
  const settingsAvailable = configuration !== null && board.canEditSettings.value;

  return (
    <aside
      class="sidebar"
      aria-label="Barre latérale"
      style={{ "--sidebar-width": `${model.sidebarWidth.value}px` }}
    >
      <SidebarResizer model={model} />
      <div class="sidebar-brand">
        <img src="/icons/icon-32.png" alt="" width="20" height="20" />
        <span class="sidebar-brand-name">Sprint Goals Board</span>
        <span class="app-version">{model.extensionVersion}</span>
      </div>
      <BoardSwitcher model={model} board={board} configuration={configuration} />
      <nav class="sidebar-nav" aria-label="Vues">
        <NavButton
          icon="board"
          label={kanban ? "Kanban" : "Sprint"}
          current={view === "board"}
          onClick={() => model.showBoard()}
        />
        {settingsAvailable && (
          <NavButton
            icon="sliders"
            label="Réglages"
            current={view === "settings"}
            onClick={() => model.showSettings()}
          />
        )}
      </nav>
      <div class="sidebar-divider" />
      <div class="sidebar-scroll">
        {lanes && <LaneList model={model} board={board} lanes={lanes} />}
      </div>
      <HiddenGoals board={board} />
      <div class="sidebar-divider" />
      <SiteMenu model={model} host={board.site.host} />
    </aside>
  );
}

/**
 * Bordure droite de la barre latérale : on la tire pour élargir ou rétrécir la barre (de 200 px à
 * la moitié de la fenêtre), on la règle aux flèches du clavier, un double-clic rend la largeur par
 * défaut. La largeur retenue est gardée dans ce navigateur.
 */
function SidebarResizer({ model }: { model: AppModel }) {
  // Le maximum suit la fenêtre : la barre affichée (CSS) et ses bornes restent d'accord.
  const [viewport, setViewport] = useState(window.innerWidth);
  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const max = clampSidebarWidth(Number.POSITIVE_INFINITY, viewport);
  const shown = Math.min(model.sidebarWidth.value, max);
  const resize = (width: number, save: boolean) =>
    void model.resizeSidebar(width, window.innerWidth, save);
  return (
    <hr
      class="sidebar-resizer"
      aria-orientation="vertical"
      aria-label="Largeur de la barre latérale"
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={max}
      aria-valuenow={shown}
      tabIndex={0}
      title="Tirer pour élargir ou rétrécir la barre latérale ; double-clic : largeur par défaut"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        const origin = event.clientX;
        // Part de la largeur AFFICHÉE : la fenêtre a pu rétrécir depuis l'enregistrement.
        const start = handle.parentElement?.getBoundingClientRect().width ?? shown;
        handle.setPointerCapture?.(event.pointerId);
        document.documentElement.classList.add("sidebar-resizing");
        const move = (moved: PointerEvent) => resize(start + moved.clientX - origin, false);
        const finish = (ended: PointerEvent) => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", finish);
          handle.removeEventListener("pointercancel", finish);
          document.documentElement.classList.remove("sidebar-resizing");
          // Geste interrompu : la largeur atteinte est gardée telle quelle.
          const width =
            ended.type === "pointerup" ? start + ended.clientX - origin : model.sidebarWidth.value;
          resize(width, true);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
      }}
      onDblClick={() => void model.resetSidebarWidth()}
      onKeyDown={(event) => {
        // Largeur réellement affichée et maximum de l'instant : la fenêtre a pu changer.
        const liveMax = clampSidebarWidth(Number.POSITIVE_INFINITY, window.innerWidth);
        const measured = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
        const current = Math.min(measured > 0 ? measured : model.sidebarWidth.value, liveMax);
        const step = event.shiftKey ? 64 : 16;
        const next =
          event.key === "ArrowLeft"
            ? current - step
            : event.key === "ArrowRight"
              ? current + step
              : event.key === "Home"
                ? SIDEBAR_WIDTH.min
                : event.key === "End"
                  ? liveMax
                  : null;
        if (next === null) return;
        event.preventDefault();
        resize(next, true);
      }}
    />
  );
}

/**
 * « Site Jira », en pied de barre latérale : ce qui vaut pour tous les boards du site. Son bouton
 * déplie le diagnostic, le site connecté et la déconnexion ; les réglages de chaque board
 * s'ouvrent, eux, depuis le board (0.31.0).
 */
function SiteMenu({ model, host }: { model: AppModel; host: string }) {
  const open = model.siteMenuOpen.value;
  const view = model.view.value;
  return (
    <div class={`sidebar-site${open ? " is-open" : ""}`}>
      <button
        type="button"
        class="sidebar-nav-item sidebar-site-toggle"
        aria-expanded={open}
        aria-controls="sidebar-site-menu"
        onClick={() => model.toggleSiteMenu()}
      >
        <Icon name="globe" size={16} />
        <span class="sidebar-site-text">
          <span class="sidebar-site-name">Site Jira</span>
          <span class="sidebar-site-host">{host}</span>
        </span>
        <Icon name={open ? "chevronDown" : "chevronUp"} size={12} />
      </button>
      {open && (
        <nav id="sidebar-site-menu" class="sidebar-site-menu" aria-label="Site Jira">
          {DIAGNOSTIC_ENABLED && (
            <button
              type="button"
              class="sidebar-nav-item sidebar-site-entry"
              aria-current={view === "diagnostic" ? "page" : undefined}
              onClick={() => model.showDiagnostic()}
            >
              Diagnostic
            </button>
          )}
          <SiteAccount model={model} host={host} />
        </nav>
      )}
    </div>
  );
}

/** Site connecté et sa déconnexion, au bas du menu « Site Jira ». */
function SiteAccount({ model, host }: { model: AppModel; host: string }) {
  return (
    <div class="settings-account">
      <span class="settings-site">{host}</span>
      <button
        type="button"
        class="settings-signout"
        onClick={() => {
          if (
            window.confirm(
              `Se déconnecter de ${host} ?\n\nLes boards et leurs réglages enregistrés dans ce navigateur seront effacés et l’autorisation d’accès au site sera retirée. Rien ne sera modifié dans Jira.`,
            )
          )
            void model.disconnect();
        }}
      >
        <Icon name="signOut" />
        Se déconnecter
      </button>
    </div>
  );
}

function NavButton(props: {
  icon: IconName;
  label: string;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="sidebar-nav-item"
      aria-current={props.current ? "page" : undefined}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size={16} />
      {props.label}
    </button>
  );
}

/**
 * Board affiché et son menu : les boards enregistrés pour ce
 * site (un clic bascule), l'ajout d'un board par son nom, les actions du board affiché, et son
 * retrait de l'extension. Chaque board garde ses propres réglages dans ce navigateur.
 */
function BoardSwitcher(props: {
  model: AppModel;
  board: BoardModel;
  configuration: BoardConfiguration | null;
}) {
  const { model, board, configuration } = props;
  const [removal, setRemoval] = useState<BoardSummary | null>(null);
  if (!configuration) {
    return (
      <button
        type="button"
        class="board-switcher-button"
        onClick={() => {
          model.showBoard();
          board.editBoard();
        }}
      >
        <Icon name="boards" size={16} />
        <span class="board-switcher-name">Choisir un board</span>
      </button>
    );
  }
  const boards = board.boards.value;
  const canSwitch = board.canSwitchBoard.value;
  const current: BoardSummary = boards.find((item) => item.boardId === configuration.boardId) ?? {
    boardId: configuration.boardId,
    boardName: configuration.boardName,
    projectKeys: configuration.projectKeys,
  };
  // Un choix fait, le menu se referme.
  const act = (event: Event, action: () => void) => {
    (event.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
    action();
  };
  return (
    <>
      <details class="board-switcher" name="filter-menu">
        <summary
          class="board-switcher-summary"
          title="Changer de board, en ajouter ou en retirer un"
        >
          <Icon name="boards" size={16} />
          <span class="board-switcher-name">{configuration.boardName}</span>
          {boards.length > 1 && <span class="board-switcher-count">{boards.length}</span>}
          <Icon name="chevrons" size={12} />
        </summary>
        <div class="menu-panel board-switcher-panel">
          <p class="menu-section">Boards enregistrés</p>
          {boards.map((item) => {
            const shown = item.boardId === configuration.boardId;
            return (
              <button
                key={item.boardId}
                type="button"
                class="board-choice"
                aria-current={shown ? "true" : undefined}
                disabled={!shown && !canSwitch}
                title={
                  !shown && !canSwitch
                    ? "Possible dès que l'écriture en cours dans Jira est terminée"
                    : undefined
                }
                onClick={(event) =>
                  act(event, () => {
                    model.showBoard();
                    void board.switchBoard(item.boardId);
                  })
                }
              >
                <span class="board-choice-check">{shown && <Icon name="check" size={13} />}</span>
                <span class="board-choice-name">{boardTitle(item)}</span>
                <span class="board-choice-id">#{item.boardId}</span>
              </button>
            );
          })}
          <hr class="menu-separator" />
          <button
            type="button"
            disabled={!canSwitch}
            onClick={(event) =>
              act(event, () => {
                model.showBoard();
                board.editBoard();
              })
            }
          >
            Ajouter un board…
          </button>
          <hr class="menu-separator" />
          {board.canEditSettings.value && (
            <button
              type="button"
              class="menu-settings"
              onClick={(event) => act(event, () => model.showSettings())}
            >
              <Icon name="sliders" size={14} />
              Réglages de ce board
            </button>
          )}
          <a
            href={`${board.site.origin}/secure/RapidBoard.jspa?rapidView=${configuration.boardId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ouvrir ce board dans Jira
          </a>
          <button
            type="button"
            disabled={board.setupBusy.value}
            onClick={(event) => act(event, () => void board.refreshStructure())}
          >
            Relire colonnes et types depuis Jira
          </button>
          {board.canPinGoals.value && board.canEditSettings.value && (
            <button
              type="button"
              onClick={(event) => act(event, () => model.showSettings("goals"))}
            >
              Épingler des Goals au {configuration.boardType === "kanban" ? "board" : "sprint"}…
            </button>
          )}
          <hr class="menu-separator" />
          <button
            type="button"
            class="menu-danger"
            disabled={!canSwitch}
            onClick={(event) => act(event, () => setRemoval(current))}
          >
            Retirer « {configuration.boardName} » de l'extension…
          </button>
        </div>
      </details>
      {removal && (
        <RemoveBoardDialog
          target={removal}
          onConfirm={() => {
            setRemoval(null);
            void board.removeBoard(removal.boardId);
          }}
          onCancel={() => setRemoval(null)}
        />
      )}
    </>
  );
}

/** « Équipe Paiement · ABC ». */
function boardTitle(board: BoardSummary): string {
  const [project] = board.projectKeys;
  return project ? `${board.boardName} · ${project}` : board.boardName;
}

/** Confirmation du retrait d'un board : ses réglages locaux sont effacés, rien dans Jira. */
function RemoveBoardDialog(props: {
  target: BoardSummary;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { onCancel } = props;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div class="dialog-backdrop">
      <div
        class="dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-board-title"
      >
        <h2 id="remove-board-title">Retirer « {props.target.boardName} » de l'extension ?</h2>
        <p class="hint">
          Les réglages de ce board dans ce navigateur seront effacés : types et swimlanes, objectifs
          du board, couleurs, ordre et repli des swimlanes, champs et règles de couleur des cartes.
          Rien n'est supprimé dans Jira ; vous pourrez l'ajouter de nouveau par son nom.
        </p>
        <div class="row">
          <button type="button" class="danger grow" onClick={props.onConfirm}>
            Retirer de l'extension
          </button>
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Swimlanes dans l'ordre du board, filtres ignorés. Le glissé partage l'état de celui du board :
 * la ligne d'insertion apparaît dans les deux, et on peut lâcher dans l'un ou l'autre.
 */
function LaneList(props: { model: AppModel; board: BoardModel; lanes: readonly LaneSummary[] }) {
  const { model, board, lanes } = props;
  const dragged = board.draggingLane.value;
  const target = dragged === null ? undefined : board.laneDropTarget.value;
  const goalCount = lanes.filter((lane) => lane.goal !== null).length;
  const draggedLane = lanes.find((lane) => lane.id === dragged);
  const dropLine = (
    <div class="sidebar-drop-line" data-goal-color={draggedLane?.goal?.color} aria-hidden="true" />
  );
  const drop = (event: DragEvent) => {
    const current = board.draggingLane.value;
    if (current === null) return;
    event.preventDefault();
    const before = board.laneDropTarget.value;
    // Seule la swimlane dont le glissé a commencé sur cette page est acceptée.
    if (event.dataTransfer?.getData(LANE_DRAG_TYPE) !== current || before === undefined) {
      board.endLaneDrag();
      return;
    }
    void board.dropLane(current, before);
  };
  const over = (event: DragEvent, before: string | null) => {
    if (board.draggingLane.value === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    board.setLaneDropTarget(before);
  };

  return (
    <section class="sidebar-lanes" aria-labelledby="sidebar-lanes-title">
      <h2 class="sidebar-section-title" id="sidebar-lanes-title">
        <span>
          Objectifs du {board.configuration.value?.boardType === "kanban" ? "board" : "sprint"}
        </span>
        <span>{goalCount}</span>
      </h2>
      {goalCount === 0 && (
        <p class="sidebar-empty">
          Aucun objectif sur ce{" "}
          {board.configuration.value?.boardType === "kanban" ? "board" : "sprint"}.
        </p>
      )}
      <ul class="sidebar-lane-list">
        {lanes.map((lane, index) => (
          <li
            key={lane.id}
            onDragOver={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const upper = event.clientY < box.top + box.height / 2;
              over(event, upper ? lane.id : (lanes[index + 1]?.id ?? null));
            }}
            onDrop={drop}
          >
            {target === lane.id && dropLine}
            <LaneRow model={model} board={board} lane={lane} dragging={dragged === lane.id} />
          </li>
        ))}
        {/* Zone de dépôt en fin de liste : la swimlane passe en dernier. */}
        <li class="sidebar-drop-end" onDragOver={(event) => over(event, null)} onDrop={drop}>
          {target === null && dropLine}
        </li>
      </ul>
    </section>
  );
}

function LaneRow(props: {
  model: AppModel;
  board: BoardModel;
  lane: LaneSummary;
  dragging: boolean;
}) {
  const { model, board, lane } = props;
  const goal = lane.goal;
  const completed = goal !== null && lane.count > 0 && lane.done === lane.count;
  // Ordre et objectifs masqués sont des réglages partagés : sans droit sur le board, ni glissé ni œil.
  const editable = board.canEditSettings.value;
  const icon: IconName | null = lane.block.kind === "swimlane" ? "kanban" : goal ? null : "build";
  return (
    <div
      class={`sidebar-lane sidebar-lane-${lane.block.kind}${completed ? " sidebar-lane-completed" : ""}${props.dragging ? " lane-dragging" : ""}`}
      data-goal-color={goal?.color}
    >
      {/* Le bouton porte le glissé : poignée, icône et titre se saisissent ensemble. */}
      <button
        type="button"
        class="sidebar-lane-main"
        draggable={editable}
        title={goal ? lane.title : `Aller à ${lane.title}`}
        onClick={() => {
          model.showBoard();
          void revealLane(board, lane.id);
        }}
        onDragStart={(event) => {
          if (!event.dataTransfer) return;
          event.dataTransfer.setData(LANE_DRAG_TYPE, lane.id);
          event.dataTransfer.effectAllowed = "move";
          const row = event.currentTarget.closest(".sidebar-lane");
          if (row instanceof HTMLElement) event.dataTransfer.setDragImage?.(row, 12, 12);
          board.startLaneDrag(lane.id);
        }}
        onDragEnd={() => board.endLaneDrag()}
      >
        {editable && <span class="sidebar-grip" aria-hidden="true" />}
        {icon ? (
          <Icon name={icon} size={14} />
        ) : (
          !completed && <GoalMarker completed={false} sidebar />
        )}
        {goal ? (
          <span class="sidebar-lane-text">
            <span class="sidebar-lane-title">{lane.title}</span>
            <span class="sidebar-lane-meta">
              {goal.atlassianKey && <span class="sidebar-lane-key">{goal.atlassianKey}</span>}
              <span>
                {lane.done}/{lane.count}
              </span>
            </span>
          </span>
        ) : (
          <>
            <span class="sidebar-lane-title">{lane.title}</span>
            <span class="sidebar-lane-count">{lane.count}</span>
          </>
        )}
      </button>
      {goal && editable && (
        <EyeToggle
          hidden={false}
          label={`Masquer « ${lane.title} » du board`}
          onClick={() => void board.setGoalHidden(goal.id, true)}
        />
      )}
    </div>
  );
}

/**
 * Œil d'un objectif. Visible : ouvert, et il se ferme au survol (un clic masquera l'objectif).
 * Masqué : fermé, et il s'ouvre au survol (un clic le réaffichera). L'animation est en CSS.
 */
function EyeToggle(props: { hidden: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class={`eye-toggle${props.hidden ? " eye-toggle-hidden" : ""}`}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      <svg
        class="icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <g class="eye-open">
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
        </g>
        <g class="eye-shut">
          <path d="M3 10.5c2.4 3.6 5.6 5.5 9 5.5s6.6-1.9 9-5.5" />
          <path d="M6.3 14.3 4.8 16.5M12 16v2.6M17.7 14.3l1.5 2.2" />
        </g>
      </svg>
    </button>
  );
}

/** Objectifs masqués du board, dépliés par défaut ; un clic sur l'œil en réaffiche un. */
function HiddenGoals({ board }: { board: BoardModel }) {
  const [open, setOpen] = useState(true);
  const hidden = board.hiddenGoals.value;
  if (hidden.length === 0) return null;
  const build = board.configuration.value?.buildSectionLabel || "Build";
  return (
    <section class="sidebar-hidden">
      <div class="sidebar-divider" />
      <button
        type="button"
        class="sidebar-section-title sidebar-section-toggle"
        aria-expanded={open}
        title={`Leurs tickets sont affichés dans ${build}. Réglage du board, partagé avec l'équipe.`}
        onClick={() => setOpen(!open)}
      >
        <span class="chevron" aria-hidden="true" />
        <span>Masqués du board</span>
        <span>{hidden.length}</span>
      </button>
      {open && (
        <ul class="sidebar-hidden-list">
          {hidden.map((goal) => (
            <li key={goal.id} class="sidebar-hidden-item" data-goal-color={goal.color}>
              <span class="goal-ring" aria-hidden="true" />
              <span class="sidebar-hidden-title">{goal.title}</span>
              {board.canEditSettings.value && (
                <EyeToggle
                  hidden
                  label={`Réafficher « ${goal.title} » sur le board`}
                  onClick={() => void board.setGoalHidden(goal.id, false)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
