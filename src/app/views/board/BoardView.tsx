import { useEffect } from "preact/hooks";
import type { BoardConfiguration } from "../../../core/boardConfiguration";
import { displayedCardFields, displayedGoalId } from "../../../core/boardConfiguration";
import { type BoardSnapshot, sprintMetrics } from "../../../core/boardIssue";
import { type BoardLayout, columnLoad, daysRemaining, type Lane } from "../../../core/boardLayout";
import {
  activeFilterCount,
  isGoalFocused,
  QUICK_FILTER_HELP,
  QUICK_FILTER_LABEL,
  QUICK_FILTERS,
} from "../../../core/filters";
import type { BoardModel } from "../../model/BoardModel";
import { formatDay, formatPoints, formatTime, plural, toggled } from "../format";
import { FilterMenu } from "./FilterMenu";
import { IssueCard } from "./IssueCard";

export function BoardView({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const snapshot = board.snapshot.value;
  const layout = board.layout.value;

  return (
    <main class="board-screen">
      <SprintHeader board={board} configuration={configuration} snapshot={snapshot} />
      {snapshot?.sprint && <FilterBar board={board} />}
      <Notices board={board} snapshot={snapshot} layout={layout} />
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

// ─── En-tête ─────────────────────────────────────────────────────────────────

function SprintHeader(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  snapshot: BoardSnapshot | null;
}) {
  const { board, configuration, snapshot } = props;
  const sprint = snapshot?.sprint ?? null;
  const metrics = snapshot ? sprintMetrics(snapshot, configuration.agingThresholdDays) : null;
  const filters = board.filters.value;
  const remaining = daysRemaining(sprint?.endDate ?? null, new Date());
  // Sans historique Jira, on ne sait pas quels tickets ont été ajoutés : on n'affiche pas « 0 ».
  const addedKnown =
    snapshot !== null &&
    [...snapshot.scrumIssues, ...snapshot.runIssues].some(
      (issue) => issue.addedAfterSprintStart !== null,
    );

  return (
    <header class="sprint-header">
      <div class="sprint-title">
        <span class="sprint-board">{configuration.boardName}</span>
        <h2>
          {snapshot
            ? snapshot.activeSprints.map((s) => s.name).join(" + ") || "Aucun sprint actif"
            : "…"}
        </h2>
        {sprint && (
          <span class="sprint-dates">
            {sprint.startDate && formatDay(sprint.startDate)}
            {sprint.endDate && ` → ${formatDay(sprint.endDate)}`}
            {remaining !== null && ` · ${remainingLabel(remaining)}`}
          </span>
        )}
      </div>

      {metrics && sprint && (
        <div class="sprint-metrics">
          <div class="sprint-progress">
            <span>
              {metrics.done} / {plural(metrics.totalIssues, "ticket")} terminés
              {metrics.totalPoints !== null &&
                ` · ${formatPoints(metrics.donePoints ?? 0)} / ${formatPoints(metrics.totalPoints)} pts`}
            </span>
            <progress max={1} value={metrics.completionRatio} aria-label="Avancement du sprint" />
          </div>
          <div class="sprint-counters">
            <button
              type="button"
              class="counter counter-blocked"
              aria-pressed={filters.quickFilters.has("blocked")}
              onClick={() => board.toggleQuickFilter("blocked")}
              title={QUICK_FILTER_HELP.blocked}
            >
              {plural(metrics.blockedCount, "bloqué")}
            </button>
            {addedKnown && (
              <button
                type="button"
                class="counter counter-added"
                aria-pressed={filters.quickFilters.has("addedAfterStart")}
                onClick={() => board.toggleQuickFilter("addedAfterStart")}
                title={QUICK_FILTER_HELP.addedAfterStart}
              >
                {plural(metrics.addedAfterStartCount, "ajouté")}
              </button>
            )}
            <button
              type="button"
              class="counter"
              aria-pressed={filters.includeWithoutGoal && filters.goalIds.size === 0}
              onClick={() =>
                board.setFilters({
                  ...filters,
                  goalIds: new Set(),
                  includeWithoutGoal: !(filters.includeWithoutGoal && filters.goalIds.size === 0),
                })
              }
              title="Tickets Scrum rattachés à aucun objectif"
            >
              {metrics.withoutGoalCount} sans objectif
            </button>
            {metrics.runCount > 0 && (
              <span class="counter counter-run">RUN {metrics.runCount}</span>
            )}
          </div>
        </div>
      )}

      <div class="sprint-actions">
        <span class="sync-status" aria-live="polite">
          {board.syncing.value
            ? "Actualisation…"
            : snapshot
              ? `Actualisé à ${formatTime(snapshot.syncedAt)}`
              : ""}
        </span>
        <button type="button" onClick={() => void board.sync()} disabled={board.syncing.value}>
          Actualiser
        </button>
        <details class="menu" name="filter-menu">
          <summary aria-label="Autres actions">⋯</summary>
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
              onClick={() => void board.refreshStructure()}
              disabled={board.setupBusy.value}
            >
              Relire colonnes et types depuis Jira
            </button>
            <button type="button" onClick={() => board.editBoard()}>
              Changer de board
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}

function remainingLabel(days: number): string {
  if (days >= 1) return plural(days, "jour restant", "jours restants");
  if (days === 0) return "se termine aujourd'hui";
  // Le sprint est encore actif dans Jira : seule sa date de fin prévue est dépassée.
  return `fin prévue dépassée de ${plural(-days, "jour")}`;
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

function FilterBar({ board }: { board: BoardModel }) {
  const filters = board.filters.value;
  const options = board.options.value;
  const layout = board.layout.value;

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

  if (!options) return null;
  const set = board.setFilters.bind(board);
  const count = activeFilterCount(filters);

  return (
    <div class="filter-bar">
      <input
        type="search"
        class="filter-search"
        aria-label="Rechercher"
        placeholder="Rechercher : clé, résumé, personne, type, label"
        value={filters.searchText}
        onInput={(event) => board.setSearch(event.currentTarget.value)}
      />
      {QUICK_FILTERS.map((quick) => (
        <button
          key={quick}
          type="button"
          class="chip"
          aria-pressed={filters.quickFilters.has(quick)}
          title={QUICK_FILTER_HELP[quick]}
          onClick={() => board.toggleQuickFilter(quick)}
        >
          {QUICK_FILTER_LABEL[quick]}
        </button>
      ))}
      <FilterMenu
        label="Personne"
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
        label="Objectif"
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
        label="Type"
        options={options.issueTypes}
        selected={filters.issueTypeIds}
        onToggle={(value) =>
          set({ ...filters, issueTypeIds: toggled(filters.issueTypeIds, value) })
        }
      />
      <FilterMenu
        label="Priorité"
        options={options.priorities}
        selected={filters.priorityNames}
        onToggle={(value) =>
          set({ ...filters, priorityNames: toggled(filters.priorityNames, value) })
        }
      />
      <FilterMenu
        label="Statut"
        options={options.statuses}
        selected={filters.statusIds}
        onToggle={(value) => set({ ...filters, statusIds: toggled(filters.statusIds, value) })}
      />
      <FilterMenu
        label="Label"
        options={options.labels}
        selected={filters.labels}
        onToggle={(value) => set({ ...filters, labels: toggled(filters.labels, value) })}
      />
      {options.components.length > 0 && (
        <FilterMenu
          label="Composant"
          options={options.components}
          selected={filters.componentNames}
          onToggle={(value) =>
            set({ ...filters, componentNames: toggled(filters.componentNames, value) })
          }
        />
      )}
      <FilterMenu
        label="Parent"
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
      {count > 0 && (
        <>
          <span class="filter-result">
            {layout && `${layout.visibleCount} / ${plural(layout.totalCount, "ticket")}`}
          </span>
          <button type="button" class="filter-reset" onClick={() => board.resetFilters()}>
            Réinitialiser ({count})
          </button>
        </>
      )}
    </div>
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
  return (
    <>
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
      {snapshot?.goalsReadOnly && (
        <p class="notice notice-info">
          Votre compte ne peut pas lire la propriété du sprint qui porte les objectifs épinglés et
          les rattachements : les objectifs sont affichés sans eux.
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
      {layout.lanes.map((lane) => (
        <LaneView
          key={lane.id}
          board={board}
          configuration={configuration}
          layout={layout}
          lane={lane}
        />
      ))}
    </div>
  );
}

function LaneView(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  layout: BoardLayout;
  lane: Lane;
}) {
  const { board, configuration, layout, lane } = props;
  const goal = lane.goal;
  const progress = lane.progress;
  const focused = goal !== null && isGoalFocused(board.filters.value, goal.id);
  const goalsById = new Map(board.snapshot.value?.goals.map((g) => [g.id, g]) ?? []);
  const cardFields = displayedCardFields(configuration);
  const ownColumns = lane.block.kind === "run" && !sameColumns(layout.runColumns, layout.columns);

  return (
    <section
      class={`lane lane-${lane.block.kind}`}
      data-goal-color={goal?.color}
      aria-label={lane.title}
    >
      <header class="lane-header">
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
      </header>
      {ownColumns && (
        <div class="board-row column-band column-band-run">
          {layout.runColumns.map((column) => (
            <div key={column.id} class="column-head">
              <span class="column-name">{column.name}</span>
            </div>
          ))}
        </div>
      )}
      <div class="board-row lane-cells">
        {lane.cells.map((cell) => (
          <div key={cell.column.id} class="lane-cell">
            {cell.issues.map((issue) => {
              const shownUnder = lane.block.kind === "goal" ? lane.block.goalId : null;
              const hiddenGoal =
                issue.goalId !== null && displayedGoalId(configuration, issue.goalId) !== shownUnder
                  ? (goalsById.get(issue.goalId)?.title ?? null)
                  : null;
              return (
                <IssueCard
                  key={issue.issue.id}
                  issue={issue}
                  siteOrigin={board.site.origin}
                  images={board.images}
                  cardFields={cardFields}
                  showStatus={cell.column.statusIds.length > 1}
                  agingThresholdDays={configuration.agingThresholdDays}
                  goalTitle={hiddenGoal}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function sameColumns(a: BoardLayout["columns"], b: BoardLayout["columns"]): boolean {
  return a.length === b.length && a.every((column, index) => column.id === b[index]?.id);
}
