import type { ComponentChildren } from "preact";
import {
  type BoardConfiguration,
  findSwimlane,
  swimlaneName,
} from "../../../core/boardConfiguration";
import type { BoardIssue } from "../../../core/boardIssue";
import { browseUrl } from "../../../core/boardIssue";
import { percent, type SprintHealth, type WatchedIssue } from "../../../core/sprintHealth";
import { t } from "../../i18n";
import type { BoardModel } from "../../model/BoardModel";
import { formatDay, formatPoints, plural } from "../format";
import { Icon, type IconName } from "../Icon";

/** Tickets listés au plus dans « Changement de périmètre » et « Tickets à surveiller ». */
const SCOPE_LIMIT = 6;
const WATCH_LIMIT = 12;

/**
 * Santé du sprint : des comptages directs sur les tickets lus
 * dans Jira, filtres de la barre appliqués. Aucun score, aucune projection. Lecture seule.
 * Panneau repliable de la vue du sprint, au-dessus des swimlanes ; le bouton icône de l'en-tête
 * l'ouvre et le referme.
 */
export function HealthPanel(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  health: SprintHealth;
  onClose: () => void;
}) {
  return (
    <section class="health-panel" aria-labelledby="health-title">
      <header class="health-panel-head">
        <h2 id="health-title">
          <Icon name="health" size={16} />
          {t("Santé du sprint")}
        </h2>
        <button
          type="button"
          class="icon-button"
          aria-label={t("Masquer la santé du sprint")}
          title={t("Masquer la santé du sprint")}
          onClick={props.onClose}
        >
          <Icon name="chevronUp" size={16} />
        </button>
      </header>
      <HealthBody board={props.board} configuration={props.configuration} health={props.health} />
    </section>
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
  const swimlaneLabel = (id: string) => {
    const swimlane = findSwimlane(configuration, id);
    return swimlane ? swimlaneName(configuration, swimlane) : "Swimlane";
  };

  return (
    <div class="health">
      <section class="health-kpis" aria-label={t("Indicateurs clés")}>
        {kpis.totalPoints !== null && (
          <Kpi
            title={t("Story points livrés")}
            icon="points"
            tone="done"
            value={formatPoints(kpis.donePoints)}
            of={formatPoints(kpis.totalPoints)}
            detail={t("{percent} % du sprint", {
              percent: percent(kpis.donePoints, kpis.totalPoints),
            })}
          />
        )}
        <Kpi
          title={t("Tickets terminés")}
          icon="done"
          tone="done"
          value={String(kpis.done)}
          of={String(kpis.scrumCount)}
          detail={t("{inProgress} en cours · {toDo} à faire", {
            inProgress: kpis.inProgress,
            toDo: kpis.toDo,
          })}
        />
        <Kpi
          title={t("Bloqués")}
          icon="blocked"
          tone="blocked"
          value={String(kpis.blocked)}
          of={String(kpis.allCount)}
          detail={t("lien Jira « est bloqué par »")}
        />
        {kpis.added !== null && (
          <Kpi
            title={t("Périmètre ajouté")}
            icon="added"
            tone="added"
            value={String(kpis.added)}
            of={String(kpis.allCount)}
            detail={t("entrés après le démarrage")}
          />
        )}
      </section>

      <div class="health-grid">
        <Card title={t("Avancement par objectif")}>
          {health.goals.length === 0 ? (
            <p class="health-empty">{t("Aucun objectif affiché sur ce sprint.")}</p>
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
                      {t("{done}/{total} terminés", { done: progress.done, total: progress.total })}
                      {progress.totalPoints !== null &&
                        ` · ${formatPoints(progress.donePoints ?? 0)}/${formatPoints(progress.totalPoints)} pts`}
                    </span>
                  </div>
                  <div class="health-bar-row">
                    <progress
                      max={1}
                      value={progress.completionRatio}
                      aria-label={t("Avancement de {name}", { name: progress.goal.title })}
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
          title={t("Changement de périmètre")}
          subtitle={t("Tickets entrés après le démarrage, d'après l'historique Jira")}
        >
          {!health.scope.known ? (
            <p class="health-empty">
              {t(
                "Jira n'a pas fourni l'historique du sprint : on ne sait pas quels tickets y sont entrés après son démarrage.",
              )}
            </p>
          ) : (
            <>
              <p class="health-scope">
                <strong>+{health.scope.added.length}</strong> {t("tickets")} · {health.scope.before}{" "}
                → {health.scope.after}
                {health.scope.before > 0 &&
                  ` (+${percent(health.scope.added.length, health.scope.before)} %)`}
              </p>
              {health.scope.added.length === 0 ? (
                <p class="health-empty">{t("Aucun ticket entré après le démarrage.")}</p>
              ) : (
                <ul class="health-issues">
                  {health.scope.added.slice(0, SCOPE_LIMIT).map((issue) => (
                    <IssueLine
                      key={issue.issue.key}
                      issue={issue}
                      origin={origin}
                      trailing={
                        issue.addedToSprintAt
                          ? t("le {date}", { date: formatDay(issue.addedToSprintAt) })
                          : null
                      }
                    />
                  ))}
                  {health.scope.added.length > SCOPE_LIMIT && (
                    <li class="health-muted">
                      {t("+ {count} autres", { count: health.scope.added.length - SCOPE_LIMIT })}
                    </li>
                  )}
                </ul>
              )}
              <p class="health-note">
                {t(
                  "Les tickets retirés du sprint n'apparaissent pas : Jira ne renvoie que ceux qui y sont encore.",
                )}
              </p>
            </>
          )}
        </Card>

        <Card
          title={t("Charge par colonne")}
          subtitle={t("Charge réelle, filtres ignorés, et limites WIP du board")}
        >
          <ColumnLoad health={health} />
        </Card>

        <Card
          title={t("Composition du sprint")}
          subtitle={plural(health.composition.total, t("ticket"))}
        >
          <ul class="health-composition">
            <CompositionRow
              label={t("Rattachés à un objectif")}
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
            {health.composition.swimlanes !== null && (
              <CompositionRow
                label={t("Swimlanes par type")}
                icon="kanban"
                tone="kanban"
                count={health.composition.swimlanes}
                total={health.composition.total}
              />
            )}
            {health.composition.added !== null && (
              <CompositionRow
                label={t("Entrés après le démarrage")}
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
        title={t("Tickets à surveiller")}
        subtitle={t("Bloqués, ou sans changement de statut depuis {duration} ou plus", {
          duration: plural(health.agingThresholdDays, "jour"),
        })}
      >
        <WatchTable
          watched={health.watched}
          origin={origin}
          buildLabel={buildLabel}
          swimlaneLabel={swimlaneLabel}
        />
      </Card>

      <p class="health-note">
        {t(
          "Comptages directs sur les tickets lus dans Jira, filtres de la barre appliqués. Aucun score n'est calculé ; l'ancienneté et l'entrée en cours de sprint ne s'affichent que si Jira a fourni l'historique correspondant. Lecture seule : rien n'est écrit dans Jira.",
        )}
      </p>
    </div>
  );
}

type Tone = "done" | "blocked" | "added" | "progress" | "muted" | "kanban";

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
            aria-label={t("Charge de {name}", { name: column.name })}
          />
          <strong class="health-count">{count}</strong>
          <span
            class="health-wip"
            title={
              column.wipLimit === null
                ? undefined
                : over
                  ? t("Limite WIP dépassée")
                  : t("Limite WIP")
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
  swimlaneLabel: (id: string) => string;
}) {
  if (props.watched.length === 0) return <p class="health-empty">{t("Rien à signaler.")}</p>;
  return (
    <>
      <table class="health-watch">
        <thead>
          <tr>
            <th>{t("Clé")}</th>
            <th>{t("Résumé")}</th>
            <th>{t("Motif")}</th>
            <th>{t("Depuis")}</th>
            <th>{t("Objectif")}</th>
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
                  {reason === "blocked" ? t("Bloqué") : t("Sans changement")}
                </span>
              </td>
              <td class="health-muted">
                {issue.daysInColumn === null ? "—" : t("{count} j", { count: issue.daysInColumn })}
              </td>
              <td data-goal-color={goal?.color}>
                {goal ? (
                  <span class="health-kpi-title">
                    <span class="goal-ring" aria-hidden="true" />
                    {goal.title}
                  </span>
                ) : (
                  <span class="health-muted">
                    {issue.swimlaneId !== null
                      ? props.swimlaneLabel(issue.swimlaneId)
                      : props.buildLabel}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.watched.length > WATCH_LIMIT && (
        <p class="health-muted">
          {t("+ {count} autres", { count: props.watched.length - WATCH_LIMIT })}
        </p>
      )}
    </>
  );
}
