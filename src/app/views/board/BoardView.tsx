import { type ComponentChildren, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { BoardConfiguration } from "../../../core/boardConfiguration";
import {
  displayedCardFields,
  displayedGoalId,
  isGoalHidden,
  visibleColumns,
} from "../../../core/boardConfiguration";
import {
  allIssues,
  type BoardSnapshot,
  browseUrl,
  familyKey,
  goalProgress,
  isIssueDone,
  type SprintMetrics,
  sprintMetrics,
} from "../../../core/boardIssue";
import { type BoardLayout, columnLoad, daysRemaining, type Lane } from "../../../core/boardLayout";
import { GOAL_COLOR_NAMES } from "../../../core/boardPreferences";
import {
  cappedStock,
  currentStepIndex,
  type DailySession,
  dailyPhase,
  dailyRemaining,
  dailySteps,
  formatDailyClock,
  formatDailyElapsed,
  moveDailyStep,
  stepElapsed,
  toggleDailyPause,
  toggleStockExpanded,
} from "../../../core/daily";
import {
  activeFilterCount,
  isGoalFocused,
  QUICK_FILTER_HELP,
  QUICK_FILTER_LABEL,
  QUICK_FILTERS,
} from "../../../core/filters";
import { goalColorName } from "../../../core/sprintGoals";
import { blockingRequiredFields } from "../../../jira/models";
import type { SettingsSection } from "../../model/AppModel";
import type { BoardModel } from "../../model/BoardModel";
import type { NoticeId } from "../../model/noticeStore";
import { formatDay, formatPoints, formatTime, plural, toggled } from "../format";
import { FullscreenButton, requestFullscreen, useFullscreen } from "../fullscreen";
import { GoalMarker } from "../GoalMarker";
import { HealthPanel } from "../health/HealthPanel";
import { Icon } from "../Icon";
import { FilterMenu } from "./FilterMenu";
import { placeFloatingMenu } from "./floatingMenu";
import { IssueCard } from "./IssueCard";
import { LANE_DRAG_TYPE } from "./lanes";

/**
 * Santé du sprint : bouton de l'en-tête et panneau. Masquée à la demande de Denis (24/09/2026,
 * « pour l'instant ») ; le code reste, il suffit de repasser à `true` pour la réafficher.
 */
export const SPRINT_HEALTH_ENABLED = false;

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
  const kanban = configuration.boardType === "kanban";
  const daily = controls.daily;
  const presenting = controls.presenting;
  // La daily reprend la mise en page de la présentation : ni en-tête ni santé, board agrandi.
  const compact = presenting || daily !== null;
  const health =
    SPRINT_HEALTH_ENABLED && controls.healthOpen && !compact && snapshot?.sprint
      ? board.health.value
      : null;
  // En daily, une seule swimlane à la fois, toujours dépliée (son repli enregistré n'est pas touché).
  const steps = daily && layout ? dailySteps(layout.lanes) : [];
  const stepIndex = daily ? currentStepIndex(steps, daily) : -1;
  const dailyLane = steps[stepIndex];
  const shownLayout =
    daily && layout
      ? { ...layout, lanes: dailyLane ? [{ ...dailyLane, collapsed: false }] : [] }
      : layout;
  // En présentation, le bouton de sortie reste toujours affiché : au bout de la barre de filtres,
  // ou seul dans une barre si les filtres ne sont pas là (plus de sprint actif, par exemple).
  const exit = presenting ? <PresentationExit onExit={controls.onExitPresentation} /> : null;
  const showFilters =
    snapshot !== null && (kanban || snapshot.sprint !== null) && board.options.value !== null;

  return (
    <main
      class={`board-screen${compact ? " board-screen-presenting" : ""}${daily ? " board-screen-daily" : ""}`}
    >
      {!compact && (
        <SprintHeader
          board={board}
          configuration={configuration}
          snapshot={snapshot}
          controls={controls}
        />
      )}
      {daily && <DailyBar session={daily} steps={steps} index={stepIndex} controls={controls} />}
      {showFilters ? (
        <FilterBar board={board} trailing={exit} />
      ) : (
        exit && <div class="filter-bar">{exit}</div>
      )}
      <Notices board={board} snapshot={snapshot} onShowPinning={controls.onShowPinning} />
      <FloatingNotices
        board={board}
        snapshot={snapshot}
        layout={layout}
        onShowPinning={controls.onShowPinning}
      />
      {health && (
        <HealthPanel
          board={board}
          configuration={configuration}
          health={health}
          onClose={controls.onToggleHealth}
        />
      )}
      <TransitionChoiceDialog board={board} />
      {snapshot === null ? (
        !board.syncProblem.value && <p class="board-empty">Lecture du board dans Jira…</p>
      ) : snapshot.sprint === null && !kanban ? (
        <p class="board-empty">
          Aucun sprint actif sur ce board. Le board affiche les tickets des sprints actifs.
        </p>
      ) : (
        shownLayout &&
        (daily && steps.length === 0 && !shownLayout.filtersActive ? (
          <p class="board-empty">
            Aucune swimlane à présenter : le {kanban ? "board" : "sprint"} n'a aucun ticket affiché.
          </p>
        ) : (
          <BoardGrid
            board={board}
            configuration={configuration}
            layout={shownLayout}
            onShowSettings={controls.onShowSettings}
            daily={daily !== null}
            dailyStock={
              daily
                ? {
                    limit: configuration.dailyStockLimit,
                    expandedIds: daily.expandedStockIds,
                    onToggle: (laneId: string) =>
                      controls.onUpdateDaily((current) => toggleStockExpanded(current, laneId)),
                  }
                : null
            }
          />
        ))
      )}
    </main>
  );
}

// ─── Choix d'une transition ──────────────────────────────────────────────────

/** Plusieurs actions vers la destination : choisir avant toute écriture. */
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
        <h2 id="transition-choice-title">
          Choisir la transition vers « {choice.available[0]?.to.name ?? choice.columnName} »
        </h2>
        <p class="hint">
          Plusieurs actions sont possibles pour {choice.issueKey}. Aucun changement de statut,
          d’objectif ou de rang ne sera effectué avant votre choix.
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
                {(transition.hasScreen || blockingRequiredFields(transition).length > 0) && (
                  <span class="hint"> · Formulaire à compléter</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div class="row">
          <button type="button" class="grow" onClick={() => board.cancelTransitionChoice()}>
            Annuler le déplacement
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── En-tête ─────────────────────────────────────────────────────────────────

/** Commandes de l'écran portées par l'en-tête : barre latérale, santé du sprint, présentation. */
export interface ScreenControls {
  readonly sidebarCollapsed: boolean;
  readonly onToggleSidebar: () => void;
  /** Panneau « Santé du sprint » déplié au-dessus des swimlanes. */
  readonly healthOpen: boolean;
  readonly onToggleHealth: () => void;
  /** Mode présentation : barre latérale, en-tête et santé masqués ; filtres et board restent. */
  readonly presenting: boolean;
  readonly onEnterPresentation: () => void;
  readonly onExitPresentation: () => void;
  /** Daily en cours : board présenté swimlane par swimlane, minuteur ; `null` sinon. */
  readonly daily: DailySession | null;
  readonly onStartDaily: (minutes: number, firstStepId: string | null) => void;
  readonly onUpdateDaily: (change: (session: DailySession) => DailySession) => void;
  readonly onStopDaily: () => void;
  /** Ouvre les réglages du board sur les objectifs, où se fait l'épinglage au sprint. */
  readonly onShowPinning: () => void;
  /**
   * Ouvre les réglages du board affiché, sur un onglet (par défaut le dernier ouvert). `null` :
   * réglages inaccessibles, faute de droit de modifier le board dans Jira.
   */
  readonly onShowSettings: ((section?: SettingsSection) => void) | null;
}

function SprintHeader(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  snapshot: BoardSnapshot | null;
  controls: ScreenControls;
}) {
  const { board, configuration, snapshot, controls } = props;
  const kanban = configuration.boardType === "kanban";
  const sprint = snapshot?.sprint ?? null;
  const hasScope = snapshot !== null && (kanban || sprint !== null);
  const metrics = snapshot ? sprintMetrics(snapshot, configuration.agingThresholdDays) : null;
  const kanbanIssues = kanban && snapshot ? allIssues(snapshot) : [];
  const kanbanDone = kanbanIssues.filter(isIssueDone).length;
  const remaining = daysRemaining(sprint?.endDate ?? null, new Date());
  const goals = snapshot?.goals.filter((goal) => !isGoalHidden(configuration, goal.id)) ?? [];
  const lastColumnId = visibleColumns(configuration.columns).at(-1)?.id ?? null;
  const completedGoals = snapshot
    ? goals.filter(
        (goal) =>
          goalProgress(
            goal,
            snapshot.goalIssues.filter((issue) => issue.goalId === goal.id),
            lastColumnId,
          ).state === "completed",
      ).length
    : 0;

  return (
    <header class="sprint-header">
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
      <div class="sprint-title">
        <div class="sprint-name">
          <h2>
            {kanban
              ? configuration.boardName
              : snapshot
                ? snapshot.activeSprints.map((s) => s.name).join(" + ") || "Aucun sprint actif"
                : "…"}
          </h2>
          {kanban && <span class="sprint-active">Kanban</span>}
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

      {metrics && hasScope && (
        <div class="sprint-metrics">
          {kanban ? (
            <span class="counter" title="Tickets dans le périmètre actuel du board">
              <strong>{kanbanIssues.length}</strong>{" "}
              {kanbanIssues.length > 1 ? "tickets" : "ticket"}
              {" · "}
              {kanbanDone} {kanbanDone > 1 ? "terminés" : "terminé"}
            </span>
          ) : (
            <SprintProgress metrics={metrics} />
          )}
          {goals.length > 0 && (
            <div class="sprint-counters">
              <span
                class="counter counter-goals"
                title="Goals dont tous les tickets sont dans la dernière colonne"
              >
                <Icon name="check" />
                <strong>
                  {completedGoals}/{goals.length}
                </strong>
                Goals atteints
              </span>
            </div>
          )}
        </div>
      )}

      <div class="sprint-actions">
        {hasScope && (
          <button
            type="button"
            class="primary daily-start"
            aria-label="Lancer la daily"
            title={`Daily : plein écran, une swimlane à la fois, minuteur de ${configuration.dailyMinutes} min`}
            onClick={() => {
              // Le plein écran exige le geste de l'utilisateur : demandé avant tout le reste. Refusé
              // (cadre sans droit, navigateur), la daily se déroule simplement dans la fenêtre.
              requestFullscreen();
              const layout = board.layout.value;
              const first = layout ? (dailySteps(layout.lanes)[0]?.id ?? null) : null;
              controls.onStartDaily(configuration.dailyMinutes, first);
            }}
          >
            <Icon name="play" size={15} />
            Daily
          </button>
        )}
        <span class="sync-status" aria-live="polite">
          {board.syncing.value
            ? "Actualisation…"
            : snapshot
              ? `Jira · ${formatTime(snapshot.syncedAt)}`
              : ""}
        </span>
        {SPRINT_HEALTH_ENABLED && sprint && (
          <button
            type="button"
            class="icon-button health-toggle"
            aria-label="Santé du sprint"
            aria-pressed={controls.healthOpen}
            title={
              controls.healthOpen ? "Masquer la santé du sprint" : "Afficher la santé du sprint"
            }
            onClick={controls.onToggleHealth}
          >
            <Icon name="health" size={17} />
          </button>
        )}
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
          aria-label="Mode présentation"
          title="Mode présentation : plein écran, sans barre latérale ni en-tête (Échap pour revenir)"
          onClick={() => {
            // Le plein écran exige le geste de l'utilisateur : demandé avant tout le reste.
            requestFullscreen();
            controls.onEnterPresentation();
          }}
        >
          <Icon name="present" size={17} />
        </button>
        {controls.onShowSettings && (
          <button
            type="button"
            class="settings-open"
            title="Réglages de ce board : swimlanes, objectifs, champs et couleurs des cartes, partagés avec l'équipe"
            onClick={() => controls.onShowSettings?.()}
          >
            <Icon name="sliders" size={16} />
            Réglages
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * Sortie du mode présentation, toujours visible pendant la présentation. Échap y ramène aussi, en
 * plein écran comme dans la fenêtre.
 */
function PresentationExit({ onExit }: { onExit: () => void }) {
  return (
    <span class="presentation-exit">
      <button
        type="button"
        class="presentation-exit-button"
        aria-label="Quitter le mode présentation"
        title="Quitter le mode présentation (Échap)"
        onClick={onExit}
      >
        <Icon name="exitPresent" />
        Quitter
      </button>
    </span>
  );
}

// ─── Daily ───────────────────────────────────────────────────────────────────

/**
 * Barre de la daily, dans l'ordre voulu par Denis : minuteur, Précédent, Suivant, puis la swimlane
 * présentée (objectif, Build ou Kanban, avec le temps passé dessus) ; à droite pause, plein écran,
 * fin. Clavier : ← et →, Espace, Échap. Le board reste manipulable :
 * déplacer une carte y est la même transition ou le même rang qu'ailleurs.
 */
function DailyBar(props: {
  session: DailySession;
  steps: readonly Lane[];
  index: number;
  controls: ScreenControls;
}) {
  const { session, steps, index, controls } = props;
  const [now, setNow] = useState(() => Date.now());
  const fullscreen = useFullscreen();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const move = (direction: 1 | -1) =>
    controls.onUpdateDaily((current) => moveDailyStep(steps, current, direction, Date.now()));
  const togglePause = () =>
    controls.onUpdateDaily((current) => toggleDailyPause(current, Date.now()));

  // Écouteur posé une fois ; il lit l'étape et la séance du moment par cette référence.
  const keys = useRef({ move, togglePause, stop: controls.onStopDaily });
  keys.current = { move, togglePause, stop: controls.onStopDaily };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { move, togglePause, stop } = keys.current;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      // Une fenêtre ouverte (transition, épinglage…) garde le clavier.
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (typing) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      } else if (event.key === " " && !(target instanceof HTMLButtonElement)) {
        event.preventDefault();
        togglePause();
      } else if (event.key === "Escape") {
        // En plein écran, Échap appartient au navigateur : il en sort, la daily continue.
        if (document.fullscreenElement) return;
        const menu = document.querySelector<HTMLDetailsElement>("details[open]");
        if (menu) {
          menu.open = false;
          return;
        }
        stop();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const remaining = dailyRemaining(session, now);
  const phase = dailyPhase(remaining);
  const paused = session.pausedAt !== null;
  const step = steps[index];
  const clock = formatDailyClock(remaining);

  return (
    <div
      class={`daily-bar daily-${phase}${paused ? " daily-paused" : ""}`}
      role="toolbar"
      aria-label="Daily"
    >
      <span
        class="daily-clock"
        role="timer"
        title={phase === "overtime" ? "Durée de la daily dépassée" : "Temps restant"}
      >
        {clock}
      </span>
      <button
        type="button"
        class="daily-nav"
        aria-label="Swimlane précédente"
        title="Swimlane précédente (←)"
        disabled={index <= 0}
        onClick={() => move(-1)}
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <button
        type="button"
        class="daily-nav"
        aria-label="Swimlane suivante"
        title="Swimlane suivante (→)"
        disabled={index < 0 || index >= steps.length - 1}
        onClick={() => move(1)}
      >
        <Icon name="chevronRight" size={18} />
      </button>
      <span class="daily-step" data-goal-color={step?.goal?.color}>
        {step ? (
          <>
            <span class="daily-step-count">
              {index + 1}/{steps.length}
            </span>
            <strong class="daily-step-title">{step.title}</strong>
            <span class="daily-step-time" title="Temps passé sur cette swimlane">
              {formatDailyElapsed(stepElapsed(session, now))}
            </span>
          </>
        ) : (
          <span class="daily-step-title">Aucune swimlane</span>
        )}
      </span>
      {paused && <span class="daily-paused-label">En pause</span>}
      <span class="daily-actions">
        <button
          type="button"
          class="icon-button"
          aria-label={paused ? "Reprendre le minuteur" : "Mettre le minuteur en pause"}
          aria-pressed={paused}
          title={paused ? "Reprendre (Espace)" : "Pause (Espace)"}
          onClick={togglePause}
        >
          <Icon name={paused ? "play" : "pause"} size={17} />
        </button>
        <FullscreenButton fullscreen={fullscreen} />
        <button
          type="button"
          class="daily-stop"
          title={fullscreen ? "Terminer la daily" : "Terminer la daily (Échap)"}
          onClick={controls.onStopDaily}
        >
          <Icon name="stop" />
          Terminer
        </button>
      </span>
    </div>
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

function FilterBar({ board, trailing }: { board: BoardModel; trailing?: ComponentChildren }) {
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
      {QUICK_FILTERS.filter(
        (quick) => board.configuration.value?.boardType !== "kanban" || quick !== "addedAfterStart",
      ).map((quick) => (
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
      {trailing}
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

/**
 * Bandeaux qui restent dans le flux, au-dessus du board : erreurs, résultats d'écriture, décisions à
 * prendre, lectures en échec. Ils signalent un incident ou attendent un choix : les masquer pour de
 * bon cacherait le prochain. Les simples explications flottent à part (`FloatingNotices`).
 */
function Notices(props: {
  board: BoardModel;
  snapshot: BoardSnapshot | null;
  onShowPinning: () => void;
}) {
  const { board, snapshot } = props;
  const problem = board.syncProblem.value;
  const writeNotice = board.writeNotice.value;
  const teamNotice = board.teamNotice.value;
  return (
    <>
      {teamNotice && (
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
            {board.canPinGoals.value && board.canEditSettings.value && (
              <button type="button" onClick={props.onShowPinning}>
                Réessayer dans Jira…
              </button>
            )}
            <button type="button" onClick={() => void board.forgetLocalPins()}>
              Oublier cette sélection
            </button>
          </div>
        </div>
      )}
      {snapshot?.sprint && snapshot.pinnedGoalIds === null && !snapshot.goalsReadOnly && (
        <p class="notice notice-info">
          La propriété du sprint qui porte les objectifs épinglés et les rattachements n'a pas pu
          être lue : le board s'affiche sans elle. Actualisez pour la relire.
        </p>
      )}
    </>
  );
}

/**
 * Explications d'un état stable du board. Elles flottent en bas à droite, au-dessus du board, sans
 * décaler les swimlanes ; leur croix les ferme pour de bon sur ce board, rechargement compris.
 */
function FloatingNotices(props: {
  board: BoardModel;
  snapshot: BoardSnapshot | null;
  layout: BoardLayout | null;
  onShowPinning: () => void;
}) {
  const { board, snapshot, layout } = props;
  const scope = board.configuration.value?.boardType === "kanban" ? "board" : "sprint";
  const dismissed = board.dismissedNotices.value;
  // Fermetures pas encore relues : rien n'est montré, plutôt qu'un bandeau qui clignote.
  if (dismissed === null) return null;
  const open = (id: NoticeId) => !dismissed.has(id);

  const notices: ComponentChildren[] = [];
  if (open("goals-partial") && board.goalsWarnings.value.length > 0) {
    notices.push(
      <FloatingNotice key="goals-partial" board={board} id="goals-partial">
        <p>
          <strong>Lecture partielle des Goals Atlassian.</strong> Le board s'affiche, mais :
        </p>
        <ul>
          {board.goalsWarnings.value.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </FloatingNotice>,
    );
  }
  if (
    open("no-goals") &&
    snapshot?.goalsOrigin === "atlassianGoals" &&
    snapshot.goals.length === 0 &&
    !board.goalsNotice.value &&
    board.goalsWarnings.value.length === 0
  ) {
    notices.push(
      <FloatingNotice key="no-goals" board={board} id="no-goals">
        <p>
          Aucun Goal Atlassian n'est rattaché aux tickets de ce {scope}. Rattachez un ticket à un
          Goal dans Jira, ou épinglez un Goal au {scope} : l'objectif apparaîtra ici avec sa
          swimlane.
        </p>
        {board.canPinGoals.value && board.canEditSettings.value && (
          <div class="row">
            <button type="button" onClick={props.onShowPinning}>
              Épingler des Goals…
            </button>
          </div>
        )}
      </FloatingNotice>,
    );
  }
  if (open("goals-read-only") && snapshot?.goalsReadOnly) {
    notices.push(
      <FloatingNotice key="goals-read-only" board={board} id="goals-read-only">
        <p>
          Votre compte ne peut pas lire la propriété du sprint qui porte les objectifs épinglés et
          les rattachements : les objectifs sont affichés sans eux.
        </p>
      </FloatingNotice>,
    );
  }
  if (open("unmapped-statuses") && layout && layout.unmappedCount > 0) {
    notices.push(
      <FloatingNotice key="unmapped-statuses" board={board} id="unmapped-statuses">
        <p>
          {plural(layout.unmappedCount, "ticket")} du {scope}{" "}
          {layout.unmappedCount > 1 ? "ont" : "a"} un statut qui n'appartient à aucune colonne
          visible du board : non affichés, comme dans Jira.
        </p>
      </FloatingNotice>,
    );
  }
  if (notices.length === 0) return null;
  return (
    <aside class="floating-notices" aria-label="Informations sur le board">
      {notices}
    </aside>
  );
}

function FloatingNotice(props: { board: BoardModel; id: NoticeId; children: ComponentChildren }) {
  return (
    <div class="notice notice-info floating-notice" role="status">
      <div class="floating-notice-body">{props.children}</div>
      <button
        type="button"
        class="floating-notice-close"
        aria-label="Fermer ce message, il ne reviendra plus"
        title="Fermer — ce message ne reviendra plus sur ce board"
        onClick={() => void props.board.dismissNotice(props.id)}
      >
        ×
      </button>
    </div>
  );
}

// ─── Board ───────────────────────────────────────────────────────────────────

/** Daily : stock de la première colonne de chaque swimlane plafonné, dépliable par un bouton. */
interface DailyStock {
  readonly limit: number;
  /** Swimlanes dont le stock est déplié. */
  readonly expandedIds: readonly string[];
  readonly onToggle: (laneId: string) => void;
}

function BoardGrid(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  layout: BoardLayout;
  /** Réglages du board, ouverts depuis le menu d'une swimlane ; `null` sans droit de modifier. */
  onShowSettings: ((section?: SettingsSection) => void) | null;
  /** Daily : une seule swimlane, sans poignée, repli ni menu (l'étape se choisit dans sa barre). */
  daily?: boolean;
  dailyStock?: DailyStock | null;
}) {
  const { board, configuration, layout, daily = false, dailyStock = null } = props;
  // Famille survolée (une story et ses sous-tâches) : ses cartes s'entourent de rouge et s'éclairent.
  const [hoveredFamily, setHoveredFamily] = useState<string | null>(null);
  if (layout.lanes.length === 0) {
    return (
      <div class="board-empty">
        <p>
          {layout.filtersActive
            ? "Aucun ticket ne correspond aux filtres."
            : "Aucun ticket à afficher dans le périmètre de ce board."}
        </p>
        {layout.filtersActive && (
          <button type="button" onClick={() => board.resetFilters()}>
            Réinitialiser les filtres
          </button>
        )}
      </div>
    );
  }

  const snapshot = board.snapshot.value;
  const load = snapshot ? columnLoad(snapshot) : new Map<string, number>();
  // Seules les familles d'au moins deux cartes affichées s'éclairent : une story seule ne dit rien.
  const familySizes = new Map<string, number>();
  for (const lane of layout.lanes) {
    for (const cell of lane.cells) {
      for (const issue of cell.issues) {
        const family = familyKey(issue);
        familySizes.set(family, (familySizes.get(family) ?? 0) + 1);
      }
    }
  }
  // Ligne d'insertion de la swimlane glissée, à la couleur de son objectif.
  const draggedLane = layout.lanes.find((lane) => lane.id === board.draggingLane.value);
  const laneTarget = board.draggingLane.value === null ? undefined : board.laneDropTarget.value;
  const laneDropLine = (
    <div class="lane-drop-line" data-goal-color={draggedLane?.goal?.color} aria-hidden="true" />
  );
  return (
    <div class="board" style={{ "--column-count": String(layout.columns.length) }}>
      {layout.totalCount === 0 && !layout.filtersActive && configuration.boardType === "kanban" && (
        <p class="board-empty">Aucun ticket à afficher dans le périmètre de ce board.</p>
      )}
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
            onShowSettings={props.onShowSettings}
            daily={daily}
            dailyStock={dailyStock}
            hoveredFamily={hoveredFamily}
            onHoverFamily={(family) =>
              setHoveredFamily(
                family !== null && (familySizes.get(family) ?? 0) > 1 ? family : null,
              )
            }
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
  onShowSettings: ((section?: SettingsSection) => void) | null;
  daily: boolean;
  dailyStock: DailyStock | null;
  /** Famille survolée (une story et ses sous-tâches), à mettre en évidence ; `null` sinon. */
  hoveredFamily: string | null;
  /** Une carte est survolée (sa famille) ou quittée (`null`). */
  onHoverFamily: (family: string | null) => void;
}) {
  const {
    board,
    configuration,
    layout,
    lane,
    nextLaneId,
    daily,
    dailyStock,
    hoveredFamily,
    onHoverFamily,
  } = props;
  const goal = lane.goal;
  const progress = lane.progress;
  const focused = goal !== null && isGoalFocused(board.filters.value, goal.id);
  const goalsById = new Map(board.snapshot.value?.goals.map((g) => [g.id, g]) ?? []);
  const cardFields = displayedCardFields(configuration);
  const parentColors = board.parentColors.value;
  const stockExpanded = dailyStock?.expandedIds.includes(lane.id) ?? false;

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
      <header
        class={`lane-header${progress?.state === "completed" ? " lane-header-completed" : ""}`}
      >
        {!daily && (
          <>
            {board.canEditSettings.value && (
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
                  if (header instanceof HTMLElement)
                    event.dataTransfer.setDragImage?.(header, 12, 12);
                  board.startLaneDrag(lane.id);
                }}
                onDragEnd={() => board.endLaneDrag()}
              />
            )}
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
          </>
        )}
        {goal && !daily ? (
          <button
            type="button"
            class="lane-title"
            aria-pressed={focused}
            title={focused ? "Afficher tous les objectifs" : "N'afficher que cet objectif"}
            onClick={() => board.focusGoal(goal.id)}
          >
            <GoalMarker completed={progress?.state === "completed"} />
            {lane.title}
          </button>
        ) : (
          <span class="lane-title">
            {goal && <GoalMarker completed={progress?.state === "completed"} />}
            {lane.title}
          </span>
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
        {!daily && <LaneMenu board={board} lane={lane} onShowSettings={props.onShowSettings} />}
      </header>
      {!lane.collapsed && (
        <div class="board-row lane-cells">
          {lane.cells.map((cell, cellIndex) => {
            const drag = board.dragging.value;
            // Daily : stock de la première colonne plafonné, dans l'ordre de Jira.
            const stock =
              dailyStock && cellIndex === 0
                ? cappedStock(cell.issues, dailyStock.limit, stockExpanded)
                : null;
            const shownIssues = stock?.shown ?? cell.issues;
            // Un dépôt après la dernière carte affichée se place avant les cartes cachées.
            const firstHidden = stock?.hidden[0]?.issue.key ?? null;
            const compatible = drag !== null && board.accepts(lane.block, drag.lane);
            const destination = board.columnDrop(cell.column);
            const droppable = compatible && destination.kind === "same";
            const statusZones = compatible && destination.kind === "statuses";
            const unavailable =
              drag !== null &&
              (!compatible || ["blocked", "loading", "error"].includes(destination.kind));
            const target = board.dropTarget.value;
            const targeted =
              (droppable || statusZones) &&
              target?.laneId === lane.id &&
              target.columnId === cell.column.id;
            const dropLine = <li class="drop-line" aria-hidden="true" />;
            return (
              <ul
                key={cell.column.id}
                aria-label={`${lane.title} — ${cell.column.name}`}
                class={`lane-cell${droppable || statusZones ? " lane-cell-droppable" : ""}${targeted ? " lane-cell-target" : ""}${unavailable ? " lane-cell-unavailable" : ""}${statusZones ? " lane-cell-statuses" : ""}`}
                aria-disabled={unavailable || undefined}
                onDragOver={(event) => {
                  const current = board.dragging.value;
                  if (!current || !droppable) {
                    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
                    board.setDropTarget(null);
                    return;
                  }
                  event.preventDefault();
                  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                  board.setDropTarget({
                    laneId: lane.id,
                    columnId: cell.column.id,
                    beforeKey:
                      insertionPoint(event.currentTarget, event.clientY, current.issueKey) ??
                      firstHidden,
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
                  if (!current || key !== current.issueKey || !droppable) return;
                  void board.dropIssue({
                    issueKey: key,
                    block: lane.block,
                    columnId: cell.column.id,
                    beforeKey,
                  });
                }}
              >
                {unavailable && (
                  <li class="drop-unavailable-message">
                    {!compatible ? "Autre catégorie de ticket" : destination.message}
                  </li>
                )}
                {statusZones && (
                  <li class="status-drop-zones">
                    {destination.statuses.map((status) => (
                      // biome-ignore lint/a11y/noStaticElementInteractions: zone de dépôt uniquement, le déplacement au clavier est hors périmètre.
                      <div
                        key={status.id}
                        class={`status-drop-zone${targeted && target?.statusId === status.id ? " status-drop-zone-active" : ""}`}
                        data-status-id={status.id}
                        onDragOver={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                          const cellElement = event.currentTarget.closest(".lane-cell");
                          board.setDropTarget({
                            laneId: lane.id,
                            columnId: cell.column.id,
                            statusId: status.id,
                            beforeKey:
                              cellElement instanceof HTMLElement && drag
                                ? preciseInsertionPoint(cellElement, event.clientY, drag.issueKey)
                                : null,
                          });
                        }}
                        onDrop={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          const current = board.dragging.value;
                          const key = event.dataTransfer?.getData(DRAG_TYPE);
                          const beforeKey = board.dropTarget.value?.beforeKey ?? null;
                          board.endDrag();
                          if (!current || key !== current.issueKey) return;
                          void board.dropIssue({
                            issueKey: key,
                            block: lane.block,
                            columnId: cell.column.id,
                            beforeKey,
                            targetStatusId: status.id,
                          });
                        }}
                      >
                        <strong>{status.name}</strong>
                        <span>
                          {status.inJira
                            ? "Formulaire à compléter"
                            : "Déposer pour choisir ce statut"}
                        </span>
                      </div>
                    ))}
                  </li>
                )}
                {shownIssues.map((issue) => {
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
                          lastColumnId={lane.cells.at(-1)?.column.id ?? null}
                          highlighted={drag === null && hoveredFamily === familyKey(issue)}
                          onHoverChange={(hovering) =>
                            onHoverFamily(hovering ? familyKey(issue) : null)
                          }
                          pending={board.pendingKeys.value.has(key)}
                          feedback={
                            board.moveFeedback.value?.issueKey === key
                              ? board.moveFeedback.value.kind
                              : undefined
                          }
                          tint={board.cardColors.value[key] ?? null}
                          dragging={drag?.issueKey === key}
                          onDragStart={(event) => {
                            if (!event.dataTransfer) return;
                            event.dataTransfer.setData(DRAG_TYPE, key);
                            event.dataTransfer.effectAllowed = "move";
                            board.startDrag(key, issue.swimlaneId);
                          }}
                          onDragEnd={() => board.endDrag()}
                        />
                      </li>
                    </Fragment>
                  );
                })}
                {targeted && firstHidden !== null && target?.beforeKey === firstHidden && dropLine}
                {stock &&
                  dailyStock &&
                  (stock.hidden.length > 0 || stockExpanded) &&
                  cell.issues.length > dailyStock.limit && (
                    <li class="stock-toggle">
                      <button
                        type="button"
                        class="stock-toggle-button"
                        aria-expanded={stockExpanded}
                        title={
                          stockExpanded
                            ? `N'afficher que les ${dailyStock.limit} premiers dans l'ordre de Jira`
                            : "Afficher tout le stock de cette colonne"
                        }
                        onClick={() => dailyStock.onToggle(lane.id)}
                      >
                        {stockExpanded
                          ? "Afficher moins"
                          : `+ ${stock.hidden.length} autre${stock.hidden.length > 1 ? "s" : ""}`}
                      </button>
                    </li>
                  )}
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
 * Réglages d'affichage d'une swimlane : ordre, couleur et masquage (partagés, écrits dans la
 * propriété du board), repli (personnel) ; puis les réglages du board, qui vont plus loin.
 */
function LaneMenu({
  board,
  lane,
  onShowSettings,
}: {
  board: BoardModel;
  lane: Lane;
  onShowSettings: ((section?: SettingsSection) => void) | null;
}) {
  const order = board.laneOrder.value;
  const position = order.indexOf(lane.id);
  const goal = lane.goal;
  // Ordre, couleur et masquage sont partagés : réservés à qui peut modifier le board dans Jira.
  const editable = board.canEditSettings.value;
  // Un choix fait, le menu se referme.
  const act = (event: Event, action: () => Promise<void>) => {
    (event.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
    void action();
  };
  return (
    <details
      class="menu lane-menu"
      name="lane-menu"
      onToggle={(event) => placeFloatingMenu(event.currentTarget)}
    >
      <summary aria-label={`Affichage de la swimlane ${lane.title}`} title="Affichage">
        ⋯
      </summary>
      <div class="menu-panel">
        {editable && (
          <>
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
          </>
        )}
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
        {goal && editable && (
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
        {onShowSettings && (
          <>
            <hr class="menu-separator" />
            {goal ? (
              <button
                type="button"
                class="menu-settings"
                onClick={(event) => act(event, async () => onShowSettings("goals"))}
              >
                <Icon name="goal" size={14} />
                Gérer les objectifs…
              </button>
            ) : (
              <button
                type="button"
                class="menu-settings"
                onClick={(event) => act(event, async () => onShowSettings("board"))}
              >
                <Icon name="sliders" size={14} />
                Configurer les swimlanes…
              </button>
            )}
          </>
        )}
        <p class="menu-note">
          {editable
            ? "Ordre, couleur et masquage sont partagés avec l'équipe (enregistrés dans Jira) ; le repli reste à vous."
            : "Seul le repli se change ici : le reste est réservé à qui peut modifier le board dans Jira."}
        </p>
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

/** Le rang ne change que près du bord supérieur d'une carte, position explicitement visée. */
function preciseInsertionPoint(cell: HTMLElement, y: number, movingKey: string): string | null {
  for (const card of cell.querySelectorAll<HTMLElement>(".card[data-issue-key]")) {
    const key = card.dataset.issueKey;
    if (key && key !== movingKey && Math.abs(card.getBoundingClientRect().top - y) <= 10)
      return key;
  }
  return null;
}
