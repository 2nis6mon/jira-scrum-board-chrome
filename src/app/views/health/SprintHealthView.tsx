import type { ComponentChildren } from "preact";
import type { BoardConfiguration } from "../../../core/boardConfiguration";
import type { BoardIssue } from "../../../core/boardIssue";
import { browseUrl } from "../../../core/boardIssue";
import { percent, type SprintHealth, type WatchedIssue } from "../../../core/sprintHealth";
import type { BoardModel } from "../../model/BoardModel";
import { FilterBar, Notices, type ScreenControls, SprintHeader } from "../board/BoardView";
import { formatDay, formatPoints, plural } from "../format";
import { Icon, type IconName } from "../Icon";

/** Tickets listés au plus dans « Changement de périmètre » et « Tickets à surveiller ». */
const SCOPE_LIMIT = 6;
const WATCH_LIMIT = 12;

/**
 * Sprint Health, porté de l'app Mac : des comptages directs sur les tickets lus dans Jira,
 * filtres de la barre appliqués. Aucun score, aucune projection. Lecture seule.
 */
export function SprintHealthView(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  controls: ScreenControls;
}) {
  const { board, configuration, controls } = props;
  const snapshot = board.snapshot.value;
  const health = board.health.value;

  return (
    <main class="board-screen">
      <SprintHeader
        board={board}
        configuration={configuration}
        snapshot={snapshot}
        controls={controls}
      />
      {snapshot?.sprint && <FilterBar board={board} />}
      <Notices board={board} snapshot={snapshot} layout={board.layout.value} />
      {snapshot === null ? (
        !board.syncProblem.value && <p class="board-empty">Lecture du board dans Jira…</p>
      ) : health === null ? (
        <p class="board-empty">Aucun sprint actif sur ce board.</p>
      ) : (
        <HealthBody board={board} configuration={configuration} health={health} />
      )}
    </main>
  );
}

function HealthBody(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  health: SprintHealth;
}) {
  const { board, configuration, health } = props;
  const { kpis } = health;
  const origin = board.site.origin;
  const buildLabel = configuration.buildSectionLabel || "Build";

  return (
    <div class="health">
      <section class="health-kpis" aria-label="Indicateurs clés">
        {kpis.totalPoints !== null && (
          <Kpi
            title="Story points livrés"
            icon="points"
            tone="done"
            value={formatPoints(kpis.donePoints)}
            of={formatPoints(kpis.totalPoints)}
            detail={`${percent(kpis.donePoints, kpis.totalPoints)} % du sprint`}
          />
        )}
        <Kpi
          title="Tickets terminés"
          icon="done"
          tone="done"
          value={String(kpis.done)}
          of={String(kpis.scrumCount)}
          detail={`${kpis.inProgress} en cours · ${kpis.toDo} à faire`}
        />
        <Kpi
          title="Bloqués"
          icon="blocked"
          tone="blocked"
          value={String(kpis.blocked)}
          of={String(kpis.allCount)}
          detail="lien Jira « est bloqué par » ou label"
        />
        {kpis.added !== null && (
          <Kpi
            title="Périmètre ajouté"
            icon="added"
            tone="added"
            value={String(kpis.added)}
            of={String(kpis.allCount)}
            detail="entrés après le démarrage"
          />
        )}
      </section>

      <div class="health-grid">
        <Card title="Avancement par objectif">
          {health.goals.length === 0 ? (
            <p class="health-empty">Aucun objectif affiché sur ce sprint.</p>
          ) : (
            <ul class="health-goals">
              {health.goals.map((progress) => (
                <li key={progress.goal.id} data-goal-color={progress.goal.color}>
                  <div class="health-goal-head">
                    <span class="goal-ring" aria-hidden="true" />
                    {progress.goal.atlassianKey && (
                      <span class="health-key">{progress.goal.atlassianKey}</span>
                    )}
                    <span class="health-goal-title" title={progress.goal.title}>
                      {progress.goal.title}
                    </span>
                    <span class="health-muted">
                      {progress.done}/{progress.total} terminés
                      {progress.totalPoints !== null &&
                        ` · ${formatPoints(progress.donePoints ?? 0)}/${formatPoints(progress.totalPoints)} pts`}
                    </span>
                  </div>
                  <div class="health-bar-row">
                    <progress
                      max={1}
                      value={progress.completionRatio}
                      aria-label={`Avancement de ${progress.goal.title}`}
                    />
                    <span class="health-percent">
                      {Math.round(progress.completionRatio * 100)} %
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Changement de périmètre"
          subtitle="Tickets entrés après le démarrage, d'après l'historique Jira"
        >
          {!health.scope.known ? (
            <p class="health-empty">
              Jira n'a pas fourni l'historique du sprint : on ne sait pas quels tickets y sont
              entrés après son démarrage.
            </p>
          ) : (
            <>
              <p class="health-scope">
                <strong>+{health.scope.added.length}</strong> tickets · {health.scope.before} →{" "}
                {health.scope.after}
                {health.scope.before > 0 &&
                  ` (+${percent(health.scope.added.length, health.scope.before)} %)`}
              </p>
              {health.scope.added.length === 0 ? (
                <p class="health-empty">Aucun ticket entré après le démarrage.</p>
              ) : (
                <ul class="health-issues">
                  {health.scope.added.slice(0, SCOPE_LIMIT).map((issue) => (
                    <IssueLine
                      key={issue.issue.key}
                      issue={issue}
                      origin={origin}
                      trailing={
                        issue.addedToSprintAt ? `le ${formatDay(issue.addedToSprintAt)}` : null
                      }
                    />
                  ))}
                  {health.scope.added.length > SCOPE_LIMIT && (
                    <li class="health-muted">+ {health.scope.added.length - SCOPE_LIMIT} autres</li>
                  )}
                </ul>
              )}
              <p class="health-note">
                Les tickets retirés du sprint n'apparaissent pas : Jira ne renvoie que ceux qui y
                sont encore.
              </p>
            </>
          )}
        </Card>

        <Card
          title="Charge par colonne"
          subtitle="Charge réelle, filtres ignorés, et limites WIP du board"
        >
          <ColumnLoad health={health} />
        </Card>

        <Card title="Composition du sprint" subtitle={plural(health.composition.total, "ticket")}>
          <ul class="health-composition">
            <CompositionRow
              label="Rattachés à un objectif"
              icon="goal"
              tone="progress"
              count={health.composition.linked}
              total={health.composition.total}
            />
            <CompositionRow
              label={buildLabel}
              icon="build"
              tone="muted"
              count={health.composition.build}
              total={health.composition.total}
            />
            {health.composition.run !== null && (
              <CompositionRow
                label="RUN"
                icon="run"
                tone="run"
                count={health.composition.run}
                total={health.composition.total}
              />
            )}
            {health.composition.added !== null && (
              <CompositionRow
                label="Entrés après le démarrage"
                icon="added"
                tone="added"
                count={health.composition.added}
                total={health.composition.total}
              />
            )}
          </ul>
        </Card>
      </div>

      <Card
        title="Tickets à surveiller"
        subtitle={`Bloqués, ou sans changement de statut depuis ${plural(health.agingThresholdDays, "jour")} ou plus`}
      >
        <WatchTable watched={health.watched} origin={origin} buildLabel={buildLabel} />
      </Card>

      <p class="health-note">
        Comptages directs sur les tickets lus dans Jira, filtres de la barre appliqués. Aucun score
        n'est calculé ; l'ancienneté et l'entrée en cours de sprint ne s'affichent que si Jira a
        fourni l'historique correspondant. Lecture seule : rien n'est écrit dans Jira.
      </p>
    </div>
  );
}

type Tone = "done" | "blocked" | "added" | "progress" | "muted" | "run";

function Kpi(props: {
  title: string;
  icon: IconName;
  tone: Tone;
  value: string;
  of: string;
  detail: string;
}) {
  return (
    <div class={`health-kpi health-tone-${props.tone}`}>
      <span class="health-kpi-title">
        <Icon name={props.icon} size={13} />
        {props.title}
      </span>
      <span class="health-kpi-value">
        <strong>{props.value}</strong> / {props.of}
      </span>
      <span class="health-muted">{props.detail}</span>
    </div>
  );
}

function Card(props: { title: string; subtitle?: string; children: ComponentChildren }) {
  return (
    <section class="panel health-card">
      <header class="health-card-head">
        <h2>{props.title}</h2>
        {props.subtitle && <span class="health-muted">{props.subtitle}</span>}
      </header>
      {props.children}
    </section>
  );
}

function IssueLine(props: { issue: BoardIssue; origin: string; trailing: string | null }) {
  const { issue } = props;
  return (
    <li class="health-issue">
      <a
        class="health-key"
        href={browseUrl(props.origin, issue.issue.key)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {issue.issue.key}
      </a>
      <span class="health-summary" title={issue.issue.fields.summary}>
        {issue.issue.fields.summary}
      </span>
      {props.trailing && <span class="health-muted">{props.trailing}</span>}
    </li>
  );
}

function ColumnLoad({ health }: { health: SprintHealth }) {
  const max = Math.max(1, ...health.columns.map((entry) => entry.count));
  return (
    <ul class="health-columns">
      {health.columns.map(({ column, count, over }) => (
        <li key={column.id} class={`health-column${over ? " health-column-over" : ""}`}>
          <span class="health-column-name" title={column.name}>
            {column.name}
          </span>
          <progress
            class={over ? "health-tone-blocked" : "health-tone-progress"}
            max={1}
            value={count / max}
            aria-label={`Charge de ${column.name}`}
          />
          <strong class="health-count">{count}</strong>
          <span
            class="health-wip"
            title={
              column.wipLimit === null ? undefined : over ? "Limite WIP dépassée" : "Limite WIP"
            }
          >
            {column.wipLimit !== null && (
              <>
                {over && <Icon name="priority" size={11} />}
                WIP {column.wipLimit}
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CompositionRow(props: {
  label: string;
  icon: IconName;
  tone: Tone;
  count: number;
  total: number;
}) {
  return (
    <li class={`health-tone-${props.tone}`}>
      <div class="health-composition-head">
        <span class="health-kpi-title">
          <Icon name={props.icon} size={13} />
          {props.label}
        </span>
        <span>
          <strong class="health-count">{props.count}</strong>
          <span class="health-muted"> / {props.total}</span>
        </span>
      </div>
      <progress
        max={1}
        value={props.total === 0 ? 0 : props.count / props.total}
        aria-label={props.label}
      />
    </li>
  );
}

function WatchTable(props: {
  watched: readonly WatchedIssue[];
  origin: string;
  buildLabel: string;
}) {
  if (props.watched.length === 0) return <p class="health-empty">Rien à signaler.</p>;
  return (
    <>
      <table class="health-watch">
        <thead>
          <tr>
            <th>Clé</th>
            <th>Résumé</th>
            <th>Motif</th>
            <th>Depuis</th>
            <th>Objectif</th>
          </tr>
        </thead>
        <tbody>
          {props.watched.slice(0, WATCH_LIMIT).map(({ issue, reason, goal }) => (
            <tr key={issue.issue.key}>
              <td>
                <a
                  class="health-key"
                  href={browseUrl(props.origin, issue.issue.key)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {issue.issue.key}
                </a>
              </td>
              <td class="health-summary" title={issue.issue.fields.summary}>
                {issue.issue.fields.summary}
              </td>
              <td class={reason === "blocked" ? "health-tone-blocked" : "health-tone-muted"}>
                <span class="health-kpi-title">
                  <Icon name={reason === "blocked" ? "blocked" : "clock"} size={13} />
                  {reason === "blocked" ? "Bloqué" : "Sans changement"}
                </span>
              </td>
              <td class="health-muted">
                {issue.daysInColumn === null ? "—" : `${issue.daysInColumn} j`}
              </td>
              <td data-goal-color={goal?.color}>
                {goal ? (
                  <span class="health-kpi-title">
                    <span class="goal-ring" aria-hidden="true" />
                    {goal.title}
                  </span>
                ) : (
                  <span class="health-muted">
                    {issue.category === "RUN" ? "RUN" : props.buildLabel}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.watched.length > WATCH_LIMIT && (
        <p class="health-muted">+ {props.watched.length - WATCH_LIMIT} autres</p>
      )}
    </>
  );
}
