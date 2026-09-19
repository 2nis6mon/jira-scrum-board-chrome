import { useState } from "preact/hooks";
import type { BoardConfiguration } from "../../core/boardConfiguration";
import { type LaneSummary, laneSummaries } from "../../core/boardPreferences";
import type { AppModel } from "../model/AppModel";
import type { BoardModel } from "../model/BoardModel";
import { LANE_DRAG_TYPE, revealLane } from "./board/lanes";
import { Icon, type IconName } from "./Icon";

/**
 * Barre latérale, reprise de l'app Mac. De haut en bas : board affiché (et son menu), vues Board et
 * Sprint Health, swimlanes dans l'ordre du board (un clic y mène, un glissé les réordonne),
 * objectifs masqués, et Administration en pied de barre.
 */
export function Sidebar({ model, board }: { model: AppModel; board: BoardModel }) {
  const view = model.view.value;
  const configuration = board.configuration.value;
  const snapshot = board.snapshot.value;
  const lanes = snapshot?.sprint && configuration ? laneSummaries(snapshot, configuration) : null;

  return (
    <aside class="sidebar" aria-label="Barre latérale">
      <div class="sidebar-brand">
        <img src="/icons/icon-32.png" alt="" width="20" height="20" />
        <span class="sidebar-brand-name">Sprint Goals Board</span>
        <span class="app-version">{model.extensionVersion}</span>
      </div>
      <BoardSwitcher model={model} board={board} configuration={configuration} />
      <nav class="sidebar-nav" aria-label="Vues">
        <NavButton
          icon="board"
          label="Board"
          current={view === "board"}
          onClick={() => model.showBoard()}
        />
        <NavButton
          icon="health"
          label="Sprint Health"
          current={view === "health"}
          onClick={() => model.showHealth()}
        />
      </nav>
      <div class="sidebar-divider" />
      <div class="sidebar-scroll">
        {lanes && <LaneList model={model} board={board} lanes={lanes} />}
      </div>
      <HiddenGoals board={board} />
      <div class="sidebar-divider" />
      <NavButton
        icon="settings"
        label="Administration"
        current={view === "admin"}
        onClick={() => model.showAdmin()}
      />
    </aside>
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

/** Board affiché. Son menu accueillera la liste des boards ; il porte déjà les actions du board. */
function BoardSwitcher(props: {
  model: AppModel;
  board: BoardModel;
  configuration: BoardConfiguration | null;
}) {
  const { model, board, configuration } = props;
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
  // Un choix fait, le menu se referme.
  const act = (event: Event, action: () => void) => {
    (event.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
    action();
  };
  return (
    <details class="board-switcher" name="filter-menu">
      <summary class="board-switcher-summary" title="Actions du board">
        <Icon name="boards" size={16} />
        <span class="board-switcher-name">{configuration.boardName}</span>
        <Icon name="chevrons" size={12} />
      </summary>
      <div class="menu-panel">
        <a
          href={`${board.site.origin}/secure/RapidBoard.jspa?rapidView=${configuration.boardId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir le board dans Jira
        </a>
        <button
          type="button"
          disabled={board.setupBusy.value}
          onClick={(event) => act(event, () => void board.refreshStructure())}
        >
          Relire colonnes et types depuis Jira
        </button>
        {board.canPinGoals.value && (
          <button type="button" onClick={(event) => act(event, () => board.openPinEditor())}>
            Épingler des Goals au sprint…
          </button>
        )}
        <button
          type="button"
          onClick={(event) =>
            act(event, () => {
              model.showBoard();
              board.editBoard();
            })
          }
        >
          Changer de board…
        </button>
      </div>
    </details>
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
        <span>Objectifs du sprint</span>
        <span>{goalCount}</span>
      </h2>
      {goalCount === 0 && <p class="sidebar-empty">Aucun objectif sur ce sprint.</p>}
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
  const icon: IconName | null = lane.block.kind === "run" ? "run" : goal ? null : "build";
  return (
    <button
      type="button"
      class={`sidebar-lane sidebar-lane-${lane.block.kind}${props.dragging ? " lane-dragging" : ""}`}
      data-goal-color={goal?.color}
      draggable
      title={goal ? lane.title : `Aller à ${lane.title}`}
      onClick={() => {
        model.showBoard();
        void revealLane(board, lane.id);
      }}
      onDragStart={(event) => {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData(LANE_DRAG_TYPE, lane.id);
        event.dataTransfer.effectAllowed = "move";
        board.startLaneDrag(lane.id);
      }}
      onDragEnd={() => board.endLaneDrag()}
    >
      <span class="sidebar-grip" aria-hidden="true" />
      {icon ? (
        <Icon name={icon} size={14} />
      ) : (
        <span class="goal-ring sidebar-ring" aria-hidden="true" />
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
  );
}

/** Objectifs masqués du board, repliés par défaut ; un clic sur l'œil en réaffiche un. */
function HiddenGoals({ board }: { board: BoardModel }) {
  const [open, setOpen] = useState(false);
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
        title={`Leurs tickets sont affichés dans ${build}. Réglage de ce navigateur.`}
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
              <button
                type="button"
                class="icon-button"
                aria-label={`Réafficher « ${goal.title} » sur le board`}
                title={`Réafficher « ${goal.title} » sur le board`}
                onClick={() => void board.setGoalHidden(goal.id, false)}
              >
                <Icon name="show" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
