import { Fragment } from "preact";
import { useEffect } from "preact/hooks";
import type { BoardConfiguration } from "../../../core/boardConfiguration";
import { displayedCardFields, displayedGoalId } from "../../../core/boardConfiguration";
import {
  type BoardSnapshot,
  browseUrl,
  type SprintMetrics,
  sprintMetrics,
} from "../../../core/boardIssue";
import { type BoardLayout, columnLoad, daysRemaining, type Lane } from "../../../core/boardLayout";
import { GOAL_COLOR_NAMES } from "../../../core/boardPreferences";
import {
  activeFilterCount,
  isGoalFocused,
  QUICK_FILTER_HELP,
  QUICK_FILTER_LABEL,
  QUICK_FILTERS,
} from "../../../core/filters";
import { goalColorName } from "../../../core/sprintGoals";
import type { BoardModel } from "../../model/BoardModel";
import { formatDay, formatPoints, formatTime, goalStatusLabel, plural, toggled } from "../format";
import { Icon } from "../Icon";
import { FilterMenu } from "./FilterMenu";
import { IssueCard } from "./IssueCard";
import { LANE_DRAG_TYPE, revealLane } from "./lanes";
import { PinGoalsDialog } from "./PinGoalsDialog";

export function BoardView({
  board,
  configuration,
  controls,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
  controls: ScreenControls;
}) {
  const snapshot = board.snapshot.value;
  const layout = board.layout.value;

  return (
    <main class="board-screen">
      <SprintHeader
        board={board}
        configuration={configuration}
        snapshot={snapshot}
        controls={controls}
      />
      {snapshot?.sprint && <FilterBar board={board} />}
      <Notices board={board} snapshot={snapshot} layout={layout} />
      <TransitionChoiceDialog board={board} />
      <PinGoalsDialog board={board} />
      {snapshot === null ? (
        !board.syncProblem.value && <p class="board-empty">Lecture du board dans Jira…</p>
      ) : snapshot.sprint === null ? (
        <p class="board-empty">
          Aucun sprint actif sur ce board. Le board affiche les tickets des sprints actifs.
        </p>
      ) : (
        layout && <BoardGrid board={board} configuration={configuration} layout={layout} />
      )}
    </main>
  );
}

// ─── Choix d'une transition ──────────────────────────────────────────────────

/** Aucune transition directe vers la colonne : on montre ce que Jira autorise réellement. */
function TransitionChoiceDialog({ board }: { board: BoardModel }) {
  const choice = board.transitionChoice.value;
  useEffect(() => {
    if (!choice) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") board.cancelTransitionChoice();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [board, choice]);
  if (!choice) return null;

  return (
    <div class="dialog-backdrop">
      <div
        class="dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transition-choice-title"
      >
        <h2 id="transition-choice-title">Aucune transition directe vers « {choice.columnName} »</h2>
        <p class="hint">
          Depuis son statut actuel, Jira propose pour {choice.issueKey} les transitions suivantes.
          L'extension n'en enchaîne jamais plusieurs à votre place.
        </p>
        <ul class="transition-list">
          {choice.available.map((transition) => (
            <li key={transition.id}>
              <button
                type="button"
                class="transition-option"
                onClick={() => void board.chooseTransition(transition)}
              >
                <strong>{transition.name}</strong> → {transition.to.name}
              </button>
            </li>
          ))}
        </ul>
        <div class="row">
          <button type="button" class="grow" onClick={() => board.cancelTransitionChoice()}>
            Ne rien changer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

/** Commandes de l'écran portées par l'en-tête : barre latérale et plein écran. */
export interface ScreenControls {
  readonly presentation: boolean;
  readonly sidebarCollapsed: boolean;
  readonly onToggleSidebar: () => void;
  readonly onTogglePresentation: () => void;
}

function SprintHeader(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  snapshot: BoardSnapshot | null;
  controls: ScreenControls;
}) {
  const { board, configuration, snapshot, controls } = props;
  const sprint = snapshot?.sprint ?? null;
  const metrics = snapshot ? sprintMetrics(snapshot, configuration.agingThresholdDays) : null;
  const filters = board.filters.value;
  const remaining = daysRemaining(sprint?.endDate ?? null, new Date());
  const buildLabel = configuration.buildSectionLabel || "Build";
  const buildCount = snapshot
    ? snapshot.scrumIssues.filter((issue) => displayedGoalId(configuration, issue.goalId) === null)
        .length
    : 0;
  // Sans historique Jira, on ne sait pas quels tickets ont été ajoutés : on n'affiche pas « 0 ».
  const addedKnown =
    snapshot !== null &&
    [...snapshot.scrumIssues, ...snapshot.runIssues].some(
      (issue) => issue.addedAfterSprintStart !== null,
    );

  return (
    <header class="sprint-header">
      {!controls.presentation && (
        <button
          type="button"
          class="icon-button sidebar-toggle"
          aria-label={
            controls.sidebarCollapsed ? "Afficher la barre latérale" : "Masquer la barre latérale"
          }
          title={
            controls.sidebarCollapsed ? "Afficher la barre latérale" : "Masquer la barre latérale"
          }
          onClick={controls.onToggleSidebar}
        >
          <Icon name="sidebar" size={17} />
        </button>
      )}
      <div class="sprint-title">
        <div class="sprint-name">
          <h2>
            {snapshot
              ? snapshot.activeSprints.map((s) => s.name).join(" + ") || "Aucun sprint actif"
              : "…"}
          </h2>
          {sprint?.state === "active" && <span class="sprint-active">actif</span>}
        </div>
        {sprint && (
          <span class="sprint-dates">
            {sprint.startDate && formatDay(sprint.startDate)}
            {sprint.endDate && ` → ${formatDay(sprint.endDate)}`}
            {remaining !== null && (
              <span class={remaining <= 2 ? "sprint-remaining-tight" : undefined}>
                {` · ${remainingLabel(remaining)}`}
              </span>
            )}
          </span>
        )}
      </div>

      {metrics && sprint && (
        <div class="sprint-metrics">
          <SprintProgress metrics={metrics} />
          <div class="sprint-counters">
            <button
              type="button"
              class={`counter counter-blocked${metrics.blockedCount > 0 ? " counter-alert" : ""}`}
              aria-pressed={filters.quickFilters.has("blocked")}
              onClick={() => board.toggleQuickFilter("blocked")}
              title={`Filtrer : ${QUICK_FILTER_HELP.blocked.toLowerCase()}`}
            >
              <Icon name="blocked" />
              <strong>{metrics.blockedCount}</strong>
              {metrics.blockedCount > 1 ? "bloqués" : "bloqué"}
            </button>
            {addedKnown && (
              <button
                type="button"
                class={`counter counter-added${metrics.addedAfterStartCount > 0 ? " counter-alert" : ""}`}
                aria-pressed={filters.quickFilters.has("addedAfterStart")}
                onClick={() => board.toggleQuickFilter("addedAfterStart")}
                title={`Filtrer : ${QUICK_FILTER_HELP.addedAfterStart.toLowerCase()}`}
              >
                <Icon name="added" />
                <strong>{metrics.addedAfterStartCount}</strong>
                {metrics.addedAfterStartCount > 1 ? "ajoutés" : "ajouté"}
              </button>
            )}
            <button
              type="button"
              class="counter counter-build"
              onClick={() => void revealLane(board, "build")}
              title={`Aller à ${buildLabel} : tickets du sprint sans objectif affiché`}
            >
              <Icon name="build" />
              <strong>{buildCount}</strong>
              dans {buildLabel}
            </button>
          </div>
        </div>
      )}

      <div class="sprint-actions">
        <span class="sync-status" aria-live="polite">
          {board.syncing.value
            ? "Actualisation…"
            : snapshot
              ? `Jira · ${formatTime(snapshot.syncedAt)}`
              : ""}
        </span>
        <button
          type="button"
          class={`icon-button${board.syncing.value ? " icon-button-busy" : ""}`}
          aria-label="Actualiser"
          title="Actualiser depuis Jira"
          onClick={() => void board.sync()}
          disabled={board.syncing.value}
        >
          <Icon name="refresh" size={17} />
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label={controls.presentation ? "Quitter le plein écran" : "Plein écran"}
          aria-pressed={controls.presentation}
          title={
            controls.presentation
              ? "Quitter le plein écran (Échap)"
              : "Plein écran : le board seul, sans barre latérale"
          }
          onClick={controls.onTogglePresentation}
        >
          <Icon name={controls.presentation ? "exitFullscreen" : "enterFullscreen"} size={17} />
        </button>
      </div>
    </header>
  );
}

/** Avancement du sprint : en story points si le board en a, sinon en tickets. */
function SprintProgress({ metrics }: { metrics: SprintMetrics }) {
  const tickets = `${metrics.done} / ${plural(metrics.totalIssues, "ticket")} terminés`;
  const points = metrics.totalPoints;
  const ratio =
    points === null
      ? metrics.completionRatio
      : points === 0
        ? 0
        : (metrics.donePoints ?? 0) / points;
  return (
    <div
      class="sprint-progress"
      title={
        points === null ? tickets : `Story points terminés sur le total du sprint · ${tickets}`
      }
    >
      <strong>
        {points === null
          ? `${metrics.done}/${plural(metrics.totalIssues, "ticket")}`
          : `${formatPoints(metrics.donePoints ?? 0)}/${formatPoints(points)} pts`}
      </strong>
      <progress max={1} value={ratio} aria-label="Avancement du sprint" />
      <span class="sprint-percent">{Math.round(ratio * 100)} %</span>
    </div>
  );
}

function remainingLabel(days: number): string {
  if (days >= 1) return `${days} j restant${days > 1 ? "s" : ""}`;
  if (days === 0) return "se termine aujourd'hui";
  // Le sprint est encore actif dans Jira : seule sa date de fin prévue est dépassée.
  return `fin prévue dépassée de ${plural(-days, "jour")}`;
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

function FilterBar({ board }: { board: BoardModel }) {
  const filters = board.filters.value;
  const options = board.options.value;
  const layout = board.layout.value;
  if (!options) return null;
  const set = board.setFilters.bind(board);
  const count = activeFilterCount(filters);

  return (
    <div class="filter-bar">
      <label class="filter-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Rechercher"
          placeholder="Clé, résumé, personne, type, label…"
          value={filters.searchText}
          onInput={(event) => board.setSearch(event.currentTarget.value)}
        />
      </label>
      <span class="filter-separator" aria-hidden="true" />
      {QUICK_FILTERS.map((quick) => (
        <button
          key={quick}
          type="button"
          class={`chip chip-${quick}`}
          aria-pressed={filters.quickFilters.has(quick)}
          title={QUICK_FILTER_HELP[quick]}
          onClick={() => board.toggleQuickFilter(quick)}
        >
          <Icon name={quick === "blocked" ? "blocked" : "added"} />
          {QUICK_FILTER_LABEL[quick]}
        </button>
      ))}
      <JiraQuickFilters board={board} />
      <span class="filter-separator" aria-hidden="true" />
      <FilterMenu
        label="Personne"
        icon="person"
        options={options.assignees}
        selected={filters.assigneeIds}
        onToggle={(value) => set({ ...filters, assigneeIds: toggled(filters.assigneeIds, value) })}
        extra={{
          label: "Non assigné",
          count: options.unassignedCount,
          checked: filters.includeUnassigned,
          onToggle: () => set({ ...filters, includeUnassigned: !filters.includeUnassigned }),
        }}
      />
      <FilterMenu
        label="Type"
        icon="type"
        options={options.issueTypes}
        selected={filters.issueTypeIds}
        onToggle={(value) =>
          set({ ...filters, issueTypeIds: toggled(filters.issueTypeIds, value) })
        }
      />
      <FilterMenu
        label="Parent"
        icon="parent"
        options={options.parents}
        selected={filters.parentKeys}
        onToggle={(value) => set({ ...filters, parentKeys: toggled(filters.parentKeys, value) })}
        extra={{
          label: "Sans parent",
          count: options.withoutParentCount,
          checked: filters.includeWithoutParent,
          onToggle: () => set({ ...filters, includeWithoutParent: !filters.includeWithoutParent }),
        }}
      />
      <FilterMenu
        label="Priorité"
        icon="priority"
        options={options.priorities}
        selected={filters.priorityNames}
        onToggle={(value) =>
          set({ ...filters, priorityNames: toggled(filters.priorityNames, value) })
        }
      />
      <FilterMenu
        label="Objectif"
        icon="goal"
        options={options.goals}
        selected={filters.goalIds}
        onToggle={(value) => set({ ...filters, goalIds: toggled(filters.goalIds, value) })}
        extra={{
          label: "Sans objectif",
          count: options.withoutGoalCount,
          checked: filters.includeWithoutGoal,
          onToggle: () => set({ ...filters, includeWithoutGoal: !filters.includeWithoutGoal }),
        }}
      />
      <FilterMenu
        label="Statut"
        icon="status"
        options={options.statuses}
        selected={filters.statusIds}
        onToggle={(value) => set({ ...filters, statusIds: toggled(filters.statusIds, value) })}
      />
      <FilterMenu
        label="Label"
        icon="label"
        options={options.labels}
        selected={filters.labels}
        onToggle={(value) => set({ ...filters, labels: toggled(filters.labels, value) })}
      />
      {options.components.length > 0 && (
        <FilterMenu
          label="Composant"
          icon="component"
          options={options.components}
          selected={filters.componentNames}
          onToggle={(value) =>
            set({ ...filters, componentNames: toggled(filters.componentNames, value) })
          }
        />
      )}
      {count > 0 && (
        <>
          <span class="filter-result">
            {layout && `${layout.visibleCount} / ${plural(layout.totalCount, "ticket")}`}
          </span>
          <button type="button" class="filter-reset" onClick={() => board.resetFilters()}>
            <Icon name="reset" />
            Réinitialiser ({count})
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Filtres rapides définis sur le board Jira, comme au-dessus du board dans Jira. Leur JQL est
 * évalué par Jira ; plusieurs filtres actifs se combinent, comme dans Jira.
 */
function JiraQuickFilters({ board }: { board: BoardModel }) {
  const quickFilters = board.jiraQuickFilters.value;
  if (quickFilters.length === 0) return null;
  const active = board.filters.value.jiraQuickFilterIds;
  const applying = board.applyingQuickFilters.value;
  return (
    <>
      <span class="filter-separator" aria-hidden="true" />
      <fieldset class="jira-quick-filters" aria-busy={applying}>
        <legend class="visually-hidden">Filtres rapides Jira</legend>
        <span class="jira-quick-filters-icon" title="Filtres rapides du board Jira">
          <Icon name="jiraFilters" />
        </span>
        {quickFilters.map((quick) => (
          <button
            key={quick.id}
            type="button"
            class="chip chip-jira"
            aria-pressed={active.has(quick.id)}
            title={[quick.description, `JQL évalué par Jira : ${quick.jql}`]
              .filter((line) => line !== null && line !== "")
              .join("\n")}
            disabled={applying}
            onClick={() => void board.toggleJiraQuickFilter(quick.id)}
          >
            {quick.name}
          </button>
        ))}
        {applying && (
          <span class="jira-quick-filters-busy" aria-live="polite">
            Jira filtre…
          </span>
        )}
      </fieldset>
    </>
  );
}

// ─── Bandeaux ────────────────────────────────────────────────────────────────

function Notices(props: {
  board: BoardModel;
  snapshot: BoardSnapshot | null;
  layout: BoardLayout | null;
}) {
  const { board, snapshot, layout } = props;
  const problem = board.syncProblem.value;
  const writeNotice = board.writeNotice.value;
  return (
    <>
      {writeNotice && (
        <div class={`notice notice-${writeNotice.tone}`} role="alert">
          <p>
            <strong>{writeNotice.text}</strong>
            {writeNotice.suggestion && ` ${writeNotice.suggestion}`}
          </p>
          <div class="row">
            {writeNotice.sessionLost && (
              <a href={board.site.origin} target="_blank" rel="noopener noreferrer">
                Ouvrir {board.site.host}
              </a>
            )}
            {writeNotice.issueKey && !writeNotice.sessionLost && (
              <a
                href={browseUrl(board.site.origin, writeNotice.issueKey)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir {writeNotice.issueKey}
              </a>
            )}
            <button type="button" aria-label="Fermer" onClick={() => board.dismissWriteNotice()}>
              ×
            </button>
          </div>
        </div>
      )}
      {problem && (
        <div class="notice notice-error" role="alert">
          <p>
            <strong>{problem.text}</strong>
            {problem.suggestion && ` ${problem.suggestion}`}
            {snapshot && ` Dernière synchronisation réussie : ${formatTime(snapshot.syncedAt)}.`}
          </p>
          <div class="row">
            {problem.sessionLost && (
              <a href={board.site.origin} target="_blank" rel="noopener noreferrer">
                Ouvrir {board.site.host}
              </a>
            )}
            <button type="button" onClick={() => void board.sync()} disabled={board.syncing.value}>
              Réessayer
            </button>
          </div>
        </div>
      )}
      {board.goalsNotice.value && <p class="notice notice-info">{board.goalsNotice.value}</p>}
      {board.goalsWarnings.value.length > 0 && (
        <div class="notice notice-info">
          <p>
            <strong>Lecture partielle des Goals Atlassian.</strong> Le board s'affiche, mais :
          </p>
          <ul>
            {board.goalsWarnings.value.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {snapshot?.goalsOrigin === "atlassianGoals" && snapshot.goals.length === 0 && (
        <div class="notice notice-info">
          <p>
            Aucun Goal Atlassian n'est rattaché aux tickets de ce sprint. Rattachez un ticket à un
            Goal dans Jira, ou épinglez un Goal au sprint : l'objectif apparaîtra ici avec sa
            swimlane.
          </p>
          {board.canPinGoals.value && (
            <div class="row">
              <button type="button" onClick={() => board.openPinEditor()}>
                Épingler des Goals…
              </button>
            </div>
          )}
        </div>
      )}
      {snapshot?.localPinnedGoalIds && (
        <div class="notice notice-info">
          <p>
            {snapshot.localPinnedGoalIds.length > 1 ? (
              <>
                <strong>
                  {snapshot.localPinnedGoalIds.length} Goals épinglés dans ce navigateur seulement.
                </strong>{" "}
                Jira a refusé de les enregistrer sur le sprint : ils ne sont pas partagés avec votre
                équipe.
              </>
            ) : (
              <>
                <strong>1 Goal épinglé dans ce navigateur seulement.</strong> Jira a refusé de
                l'enregistrer sur le sprint : il n'est pas partagé avec votre équipe.
              </>
            )}
          </p>
          <div class="row">
            {board.canPinGoals.value && (
              <button type="button" onClick={() => board.openPinEditor()}>
                Réessayer dans Jira…
              </button>
            )}
            <button type="button" onClick={() => void board.forgetLocalPins()}>
              Oublier cette sélection
            </button>
          </div>
        </div>
      )}
      {snapshot?.goalsReadOnly && (
        <p class="notice notice-info">
          Votre compte ne peut pas lire la propriété du sprint qui porte les objectifs épinglés et
          les rattachements : les objectifs sont affichés sans eux.
        </p>
      )}
      {snapshot?.sprint && snapshot.pinnedGoalIds === null && !snapshot.goalsReadOnly && (
        <p class="notice notice-info">
          La propriété du sprint qui porte les objectifs épinglés et les rattachements n'a pas pu
          être lue : le board s'affiche sans elle. Actualisez pour la relire.
        </p>
      )}
      {layout && layout.unmappedCount > 0 && (
        <p class="notice notice-info">
          {plural(layout.unmappedCount, "ticket")} du sprint{" "}
          {layout.unmappedCount > 1 ? "ont" : "a"} un statut qui n'appartient à aucune colonne
          visible du board : non affichés, comme dans Jira.
        </p>
      )}
    </>
  );
}

// ─── Board ───────────────────────────────────────────────────────────────────

function BoardGrid(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  layout: BoardLayout;
}) {
  const { board, configuration, layout } = props;
  if (layout.lanes.length === 0) {
    return (
      <div class="board-empty">
        <p>Aucun ticket ne correspond aux filtres.</p>
        <button type="button" onClick={() => board.resetFilters()}>
          Réinitialiser les filtres
        </button>
      </div>
    );
  }

  const snapshot = board.snapshot.value;
  const load = snapshot ? columnLoad(snapshot) : new Map<string, number>();
  // Ligne d'insertion de la swimlane glissée, à la couleur de son objectif.
  const draggedLane = layout.lanes.find((lane) => lane.id === board.draggingLane.value);
  const laneTarget = board.draggingLane.value === null ? undefined : board.laneDropTarget.value;
  const laneDropLine = (
    <div class="lane-drop-line" data-goal-color={draggedLane?.goal?.color} aria-hidden="true" />
  );
  return (
    <div class="board" style={{ "--column-count": String(layout.columns.length) }}>
      <div class="board-row column-band">
        {layout.columns.map((column) => {
          const count = load.get(column.id) ?? 0;
          const over = column.wipLimit !== null && count > column.wipLimit;
          return (
            <div key={column.id} class={`column-head${over ? " column-over" : ""}`}>
              <span class="column-name">{column.name}</span>
              <span
                class="column-count"
                title={column.wipLimit === null ? undefined : "Limite WIP du board Jira"}
              >
                {count}
                {column.wipLimit !== null && ` / ${column.wipLimit}`}
              </span>
            </div>
          );
        })}
      </div>
      {layout.lanes.map((lane, index) => (
        <Fragment key={lane.id}>
          {laneTarget === lane.id && laneDropLine}
          <LaneView
            board={board}
            configuration={configuration}
            layout={layout}
            lane={lane}
            nextLaneId={layout.lanes[index + 1]?.id ?? null}
          />
        </Fragment>
      ))}
      {laneTarget === null && laneDropLine}
    </div>
  );
}

function LaneView(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  layout: BoardLayout;
  lane: Lane;
  /** Swimlane affichée juste en dessous : un dépôt sur la moitié basse se place avant elle. */
  nextLaneId: string | null;
}) {
  const { board, configuration, layout, lane, nextLaneId } = props;
  const goal = lane.goal;
  const progress = lane.progress;
  const focused = goal !== null && isGoalFocused(board.filters.value, goal.id);
  const goalsById = new Map(board.snapshot.value?.goals.map((g) => [g.id, g]) ?? []);
  const localPins = board.snapshot.value?.localPinnedGoalIds ?? null;
  const pinned = new Set(localPins ?? board.snapshot.value?.pinnedGoalIds ?? []);
  const cardFields = displayedCardFields(configuration);
  const parentColors = board.parentColors.value;
  const ownColumns = lane.block.kind === "run" && !sameColumns(layout.runColumns, layout.columns);

  return (
    <section
      class={`lane lane-${lane.block.kind}${board.draggingLane.value === lane.id ? " lane-dragging" : ""}`}
      data-goal-color={goal?.color}
      data-lane-id={lane.id}
      aria-label={lane.title}
      onDragOver={(event) => {
        // Seul le glissé d'une swimlane est traité ici ; celui des cartes l'est par les cases.
        if (board.draggingLane.value === null) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const box = event.currentTarget.getBoundingClientRect();
        board.setLaneDropTarget(event.clientY < box.top + box.height / 2 ? lane.id : nextLaneId);
      }}
      onDrop={(event) => {
        const dragged = board.draggingLane.value;
        if (dragged === null) return;
        event.preventDefault();
        const target = board.laneDropTarget.value;
        // Seule la swimlane dont le glissé a commencé sur ce board est acceptée.
        if (event.dataTransfer?.getData(LANE_DRAG_TYPE) !== dragged || target === undefined) {
          board.endLaneDrag();
          return;
        }
        void board.dropLane(dragged, target);
      }}
    >
      <header class="lane-header">
        <span
          class="lane-grip"
          draggable
          aria-hidden="true"
          title="Glisser pour déplacer la swimlane (ou menu ⋯ : Monter, Descendre)"
          onDragStart={(event) => {
            if (!event.dataTransfer) return;
            event.dataTransfer.setData(LANE_DRAG_TYPE, lane.id);
            event.dataTransfer.effectAllowed = "move";
            const header = event.currentTarget.closest(".lane-header");
            if (header instanceof HTMLElement) event.dataTransfer.setDragImage?.(header, 12, 12);
            board.startLaneDrag(lane.id);
          }}
          onDragEnd={() => board.endLaneDrag()}
        />
        <button
          type="button"
          class="lane-toggle"
          aria-expanded={!lane.collapsed}
          aria-label={`${lane.collapsed ? "Déplier" : "Replier"} ${lane.title}`}
          title={lane.collapsed ? "Déplier" : "Replier"}
          onClick={() => void board.toggleLaneCollapsed(lane.block)}
        >
          <span class="chevron" aria-hidden="true" />
        </button>
        {goal ? (
          <button
            type="button"
            class="lane-title"
            aria-pressed={focused}
            title={focused ? "Afficher tous les objectifs" : "N'afficher que cet objectif"}
            onClick={() => board.focusGoal(goal.id)}
          >
            <span class="goal-ring" aria-hidden="true" />
            {lane.title}
          </button>
        ) : (
          <span class="lane-title">{lane.title}</span>
        )}
        {goal?.atlassianGoalId && pinned.has(goal.atlassianGoalId) && (
          <span
            class="goal-pinned"
            title={
              localPins
                ? "Épinglé dans ce navigateur seulement : non partagé avec l'équipe"
                : "Épinglé au sprint : affiché même sans ticket rattaché"
            }
          >
            épinglé
          </span>
        )}
        {goal?.atlassianStatus && (
          <span
            class="goal-status"
            title={`Statut déclaré dans Atlassian : ${goal.atlassianStatus}`}
          >
            {goalStatusLabel(goal.atlassianStatus)}
          </span>
        )}
        {goal?.atlassianUrl?.startsWith("https://") && (
          <a class="goal-link" href={goal.atlassianUrl} target="_blank" rel="noopener noreferrer">
            Ouvrir le Goal
          </a>
        )}
        <span class="lane-count">
          {layout.filtersActive
            ? `${lane.visibleCount} / ${lane.totalCount}`
            : plural(lane.totalCount, "ticket")}
        </span>
        {progress && progress.total > 0 && (
          <span class="lane-progress">
            <span>
              {progress.done}/{progress.total} terminés
              {progress.totalPoints !== null &&
                ` · ${formatPoints(progress.donePoints ?? 0)}/${formatPoints(progress.totalPoints)} pts`}
            </span>
            <progress
              max={1}
              value={progress.completionRatio}
              aria-label={`Avancement de ${lane.title}`}
            />
          </span>
        )}
        {progress?.state === "empty" && <span class="lane-progress">Aucun ticket rattaché</span>}
        <LaneMenu board={board} lane={lane} />
      </header>
      {!lane.collapsed && ownColumns && (
        <div class="board-row column-band column-band-run">
          {layout.runColumns.map((column) => (
            <div key={column.id} class="column-head">
              <span class="column-name">{column.name}</span>
            </div>
          ))}
        </div>
      )}
      {!lane.collapsed && (
        <div class="board-row lane-cells">
          {lane.cells.map((cell) => {
            const drag = board.dragging.value;
            const droppable = drag !== null && board.accepts(lane.block, drag.lane);
            const target = board.dropTarget.value;
            const targeted =
              droppable && target?.laneId === lane.id && target.columnId === cell.column.id;
            const dropLine = <li class="drop-line" aria-hidden="true" />;
            return (
              <ul
                key={cell.column.id}
                aria-label={`${lane.title} — ${cell.column.name}`}
                class={`lane-cell${droppable ? " lane-cell-droppable" : ""}${targeted ? " lane-cell-target" : ""}`}
                onDragOver={(event) => {
                  const current = board.dragging.value;
                  if (!current || !board.accepts(lane.block, current.lane)) return;
                  event.preventDefault();
                  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                  board.setDropTarget({
                    laneId: lane.id,
                    columnId: cell.column.id,
                    beforeKey: insertionPoint(event.currentTarget, event.clientY, current.issueKey),
                  });
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    board.setDropTarget(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const current = board.dragging.value;
                  const key = event.dataTransfer?.getData(DRAG_TYPE) ?? "";
                  const beforeKey = board.dropTarget.value?.beforeKey ?? null;
                  board.endDrag();
                  // Seule la carte dont le glissement a commencé sur ce board est acceptée.
                  if (!current || key !== current.issueKey) return;
                  void board.dropIssue({
                    issueKey: key,
                    block: lane.block,
                    columnId: cell.column.id,
                    beforeKey,
                  });
                }}
              >
                {cell.issues.map((issue) => {
                  const shownUnder = lane.block.kind === "goal" ? lane.block.goalId : null;
                  const hiddenGoal =
                    issue.goalId !== null &&
                    displayedGoalId(configuration, issue.goalId) !== shownUnder
                      ? (goalsById.get(issue.goalId)?.title ?? null)
                      : null;
                  const key = issue.issue.key;
                  const parentKey = issue.issue.fields.parent?.key;
                  return (
                    <Fragment key={issue.issue.id}>
                      {targeted && target?.beforeKey === key && dropLine}
                      <li class="lane-item">
                        <IssueCard
                          issue={issue}
                          siteOrigin={board.site.origin}
                          images={board.images}
                          cardFields={cardFields}
                          parentColor={parentKey ? (parentColors.get(parentKey) ?? null) : null}
                          agingThresholdDays={configuration.agingThresholdDays}
                          goalTitle={hiddenGoal}
                          pending={board.pendingKeys.value.has(key)}
                          tint={board.cardColors.value[key] ?? null}
                          dragging={drag?.issueKey === key}
                          onDragStart={(event) => {
                            if (!event.dataTransfer) return;
                            event.dataTransfer.setData(DRAG_TYPE, key);
                            event.dataTransfer.effectAllowed = "move";
                            board.startDrag(key, issue.category === "RUN" ? "run" : "scrum");
                          }}
                          onDragEnd={() => board.endDrag()}
                        />
                      </li>
                    </Fragment>
                  );
                })}
                {targeted && target?.beforeKey === null && dropLine}
              </ul>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Réglages d'affichage d'une swimlane : ordre, repli, couleur, masquage. Tous restent dans ce
 * navigateur ; aucun n'écrit dans Jira.
 */
function LaneMenu({ board, lane }: { board: BoardModel; lane: Lane }) {
  const order = board.laneOrder.value;
  const position = order.indexOf(lane.id);
  const goal = lane.goal;
  // Un choix fait, le menu se referme.
  const act = (event: Event, action: () => Promise<void>) => {
    (event.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
    void action();
  };
  return (
    <details class="menu lane-menu" name="lane-menu">
      <summary aria-label={`Affichage de la swimlane ${lane.title}`} title="Affichage">
        ⋯
      </summary>
      <div class="menu-panel">
        <button
          type="button"
          disabled={position <= 0}
          onClick={(event) => act(event, () => board.moveLane(lane.id, -1))}
        >
          Monter
        </button>
        <button
          type="button"
          disabled={position < 0 || position >= order.length - 1}
          onClick={(event) => act(event, () => board.moveLane(lane.id, 1))}
        >
          Descendre
        </button>
        <button
          type="button"
          onClick={(event) => act(event, () => board.toggleLaneCollapsed(lane.block))}
        >
          {lane.collapsed ? "Déplier" : "Replier"}
        </button>
        <button
          type="button"
          onClick={(event) => act(event, () => board.setAllLanesCollapsed(true))}
        >
          Tout replier
        </button>
        <button
          type="button"
          onClick={(event) => act(event, () => board.setAllLanesCollapsed(false))}
        >
          Tout déplier
        </button>
        {goal && (
          <>
            <fieldset class="menu-colors">
              <legend>Couleur de l'objectif</legend>
              {GOAL_COLOR_NAMES.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  class="swatch"
                  data-goal-color={goalColorName(index)}
                  aria-label={name}
                  title={name}
                  aria-pressed={goal.color === goalColorName(index)}
                  onClick={(event) => act(event, () => board.setGoalColor(goal.id, index))}
                />
              ))}
            </fieldset>
            <button
              type="button"
              onClick={(event) => act(event, () => board.setGoalHidden(goal.id, true))}
            >
              Masquer cet objectif du board
            </button>
          </>
        )}
        <p class="menu-note">Réglages de ce navigateur. Rien n'est écrit dans Jira.</p>
      </div>
    </details>
  );
}

/** Type de donnée du glisser-déposer : propre à l'extension, il ne porte qu'une clé de ticket. */
const DRAG_TYPE = "application/x-scrum-board-issue";

/** Carte devant laquelle déposer, d'après la position du pointeur ; `null` = à la fin. */
function insertionPoint(cell: HTMLElement, clientY: number, draggedKey: string): string | null {
  for (const card of cell.querySelectorAll<HTMLElement>("[data-issue-key]")) {
    const key = card.dataset.issueKey;
    if (!key || key === draggedKey) continue;
    const box = card.getBoundingClientRect();
    if (clientY < box.top + box.height / 2) return key;
  }
  return null;
}

function sameColumns(a: BoardLayout["columns"], b: BoardLayout["columns"]): boolean {
  return a.length === b.length && a.every((column, index) => column.id === b[index]?.id);
}
