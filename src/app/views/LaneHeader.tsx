import type { ComponentChildren } from "preact";
import type { ColumnState, StateTallies, StateTally } from "../../core/columnState";
import { t } from "../i18n";
import { formatPoints, plural } from "./format";

// En-tête d'objectif et barres d'avancement, communs au Sprint Board et au Sprint Planning
// (story 8.20). L'état d'un ticket vient toujours de sa colonne sur le board.

/** Segment d'une barre empilée : sa part, sa couleur, et son texte (survol, lecteurs d'écran). */
export interface BarSegment {
  readonly tone: ColumnState | "over";
  readonly value: number;
  readonly label: string;
}

/**
 * Barre empilée : chaque segment occupe sa part de `max` (par défaut, leur somme). Les valeurs
 * sont aussi données en texte : rien ne passe par la couleur seule.
 */
export function StackedBar({
  segments,
  max,
  label,
}: {
  segments: readonly BarSegment[];
  max?: number;
  label: string;
}) {
  const whole = max ?? segments.reduce((sum, segment) => sum + segment.value, 0);
  const parts = segments.filter((segment) => segment.value > 0);
  const description = [label, ...parts.map((segment) => segment.label)].join(" · ");
  return (
    <span class="state-bar" role="img" aria-label={description} title={description}>
      {whole > 0 &&
        parts.map((segment) => (
          <i
            key={segment.tone}
            data-state={segment.tone}
            style={{ width: `${(Math.min(segment.value, whole) / whole) * 100}%` }}
          />
        ))}
    </span>
  );
}

/** Ordre de la barre : elle se remplit de gauche à droite, du terminé vers l'à faire. */
const BAR_ORDER: readonly ColumnState[] = ["done", "inProgress", "todo"];
/** Ordre de la légende : celui des colonnes du board. */
const LEGEND_ORDER: readonly ColumnState[] = ["todo", "inProgress", "done"];

const STATE_LABEL = {
  todo: "À faire : {p0}",
  inProgress: "En cours : {p0}",
  done: "Terminé : {p0}",
} as const satisfies Record<ColumnState, string>;

/** « 3 tickets · 5 pts », ou le seul nombre de tickets sans points. */
export function tallyText(tally: StateTally, points: boolean): string {
  const tickets = plural(tally.count, "ticket");
  return points ? `${tickets} · ${formatPoints(tally.points)} pts` : tickets;
}

/** Part d'un état dans la barre : les points s'il y en a, sinon les tickets. */
function weight(tallies: StateTallies, points: boolean): (state: ColumnState) => number {
  const totalPoints = BAR_ORDER.reduce((sum, state) => sum + tallies[state].points, 0);
  return points && totalPoints > 0
    ? (state) => tallies[state].points
    : (state) => tallies[state].count;
}

/** Barre d'avancement par état (gris à faire, bleu en cours, vert terminé). */
export function StateBar({
  tallies,
  points,
  label,
}: {
  tallies: StateTallies;
  points: boolean;
  label: string;
}) {
  const share = weight(tallies, points);
  return (
    <StackedBar
      label={label}
      segments={BAR_ORDER.map((state) => ({
        tone: state,
        value: share(state),
        label: t(STATE_LABEL[state], { p0: tallyText(tallies[state], points) }),
      }))}
    />
  );
}

/**
 * Avancement d'un objectif, identique sur les deux écrans : « n/N terminés · x/y pts », la barre
 * par état, et sa légende (points, ou tickets, de chaque état). Sans ticket compté : « Aucun ticket
 * rattaché ».
 */
export function GoalProgressSummary({
  name,
  tallies,
  points,
}: {
  name: string;
  tallies: StateTallies;
  points: boolean;
}) {
  const total = LEGEND_ORDER.reduce((sum, state) => sum + tallies[state].count, 0);
  if (total === 0) return <span class="lane-progress">{t("Aucun ticket rattaché")}</span>;
  const totalPoints = LEGEND_ORDER.reduce((sum, state) => sum + tallies[state].points, 0);
  return (
    <span class="lane-progress">
      <span>
        {t("{done}/{total} terminés", { done: tallies.done.count, total })}
        {points && ` · ${formatPoints(tallies.done.points)}/${formatPoints(totalPoints)} pts`}
      </span>
      <StateBar tallies={tallies} points={points} label={t("Avancement de {name}", { name })} />
      <span class="state-legend">
        {LEGEND_ORDER.map((state) => {
          const label = t(STATE_LABEL[state], { p0: tallyText(tallies[state], points) });
          return (
            <span key={state} class="state-chip" data-state={state} title={label}>
              <span aria-hidden="true">
                {points ? formatPoints(tallies[state].points) : tallies[state].count}
              </span>
              <span class="visually-hidden">{label}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/**
 * En-tête de swimlane commun : éléments propres à l'écran en tête (repli, poignée), titre (avec le
 * marqueur de l'objectif), nombre de tickets, avancement d'un objectif, puis ce qui suit (actions,
 * déjà livré, menu). `completed` : objectif atteint, tous ses tickets dans la dernière colonne.
 */
export function LaneHeader({
  completed = false,
  leading,
  title,
  count,
  progress,
  children,
}: {
  completed?: boolean;
  leading?: ComponentChildren;
  title: ComponentChildren;
  count: ComponentChildren;
  progress?: { name: string; tallies: StateTallies; points: boolean } | null;
  children?: ComponentChildren;
}) {
  return (
    <header class={`lane-header${completed ? " lane-header-completed" : ""}`}>
      {leading}
      {title}
      <span class="lane-count">{count}</span>
      {progress && <GoalProgressSummary {...progress} />}
      {children}
    </header>
  );
}
