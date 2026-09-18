import { useEffect, useState } from "preact/hooks";
import type { BoardConfiguration, GoalSource } from "../../../core/boardConfiguration";
import { GOAL_COLOR_NAMES } from "../../../core/boardPreferences";
import { filterAtlassianGoals } from "../../../core/filters";
import { goalColorName, type SprintGoal } from "../../../core/sprintGoals";
import { goalDisplayName } from "../../../jira/models";
import type { BoardModel } from "../../model/BoardModel";
import { goalStatusLabel } from "../format";

const SOURCES: readonly { id: GoalSource; label: string; help: string }[] = [
  {
    id: "atlassianGoals",
    label: "Goals Atlassian",
    help: "Les objectifs sont de vrais Goals Atlassian. Rattacher un ticket crée le lien Jira natif, visible dans Jira.",
  },
  {
    id: "sprintText",
    label: "Texte du sprint",
    help: "Les objectifs sont les lignes du champ « Objectif » du sprint, lu sans jamais être modifié. Le rattachement est enregistré dans la propriété du sprint, partagée avec l'app Mac.",
  },
];

/** Source des objectifs, Goals associés au board, épinglage, couleurs et visibilité. */
export function GoalSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const source = configuration.goalSource;

  useEffect(() => {
    if (source === "atlassianGoals" && board.siteGoals.value === null) void board.loadSiteGoals();
  }, [board, source]);

  return (
    <div class="settings-section">
      <section class="panel" aria-labelledby="settings-source">
        <h2 id="settings-source">Source des objectifs</h2>
        <fieldset class="settings-choices">
          <legend class="hint">
            Jira n'a aucune relation native entre un sprint et un Goal : les Goals sont au niveau de
            l'organisation.
          </legend>
          {SOURCES.map((option) => (
            <label key={option.id} class="settings-choice">
              <input
                type="radio"
                name="goal-source"
                checked={source === option.id}
                onChange={() =>
                  void board.applySettings((current) => ({ ...current, goalSource: option.id }), {
                    resync: true,
                  })
                }
              />
              <span>
                <strong>{option.label}</strong>
                <span class="hint">{option.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {board.goalsNotice.value && <p class="notice notice-info">{board.goalsNotice.value}</p>}
      </section>

      {source === "atlassianGoals" && <BoardGoals board={board} configuration={configuration} />}

      {source === "atlassianGoals" && (
        <section class="panel" aria-labelledby="settings-pin">
          <h2 id="settings-pin">Goals épinglés au sprint</h2>
          <p class="hint">
            Les objectifs du sprint sont déduits de ses tickets. Un Goal épinglé s'affiche aussi
            sans ticket. L'épinglage est enregistré dans Jira, dans la propriété du sprint partagée
            avec l'app Mac : c'est une écriture, faite sur votre geste seulement.
          </p>
          <div class="row">
            <button
              type="button"
              disabled={!board.canPinGoals.value}
              onClick={() => board.openPinEditor()}
            >
              Épingler des Goals au sprint…
            </button>
          </div>
        </section>
      )}

      <GoalAppearance board={board} />
    </div>
  );
}

/**
 * Goals associés au board : les seuls interrogés, avec les épinglés et ceux que déclarent les
 * tickets, pour trouver les objectifs du sprint. Sans association, l'extension interroge tous les
 * Goals du site quand les tickets n'en déclarent aucun. Réglage local.
 */
function BoardGoals({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const [selection, setSelection] = useState<readonly string[]>(configuration.boardGoalIds);
  const [search, setSearch] = useState("");

  const siteGoals = board.siteGoals.value;
  const listed = (siteGoals ?? []).filter(
    (goal) => !goal.isArchived || selection.includes(goal.id),
  );
  const filtered = filterAtlassianGoals(search, listed);
  const stored = configuration.boardGoalIds;
  const changed =
    selection.length !== stored.length || selection.some((id) => !stored.includes(id));

  return (
    <section class="panel" aria-labelledby="settings-board-goals">
      <header class="panel-header">
        <h2 id="settings-board-goals">Goals associés au board</h2>
        <button
          type="button"
          onClick={() => void board.loadSiteGoals()}
          disabled={board.siteGoalsLoading.value}
        >
          {board.siteGoalsLoading.value ? "Lecture…" : "Recharger"}
        </button>
      </header>
      <p class="hint">
        Facultatif. Associer des Goals au board limite à ceux-ci la recherche des objectifs du
        sprint (en plus des épinglés et de ceux que déclarent les tickets). Sans association,
        l'extension interroge tous les Goals du site quand les tickets n'en déclarent aucun.
      </p>
      {board.siteGoalsError.value && (
        <p class="notice notice-error" role="alert">
          Goals du site illisibles : {board.siteGoalsError.value.text}
        </p>
      )}
      <input
        type="search"
        class="pin-search"
        aria-label="Filtrer les Goals du site"
        placeholder="Filtrer par nom, clé ou responsable"
        value={search}
        onInput={(event) => setSearch(event.currentTarget.value)}
      />
      {siteGoals === null ? (
        board.siteGoalsLoading.value && <p class="hint">Lecture des Goals du site…</p>
      ) : (
        <ul class="pin-list">
          {filtered.map((goal) => (
            <li key={goal.id}>
              <label class="pin-option">
                <input
                  type="checkbox"
                  aria-label={goalDisplayName(goal)}
                  checked={selection.includes(goal.id)}
                  onChange={() =>
                    setSelection(
                      selection.includes(goal.id)
                        ? selection.filter((id) => id !== goal.id)
                        : [...selection, goal.id],
                    )
                  }
                />
                <span class="pin-option-text">
                  <span class="pin-name">{goalDisplayName(goal)}</span>
                  {goal.key && <span class="pin-meta">{goal.key}</span>}
                </span>
                {goal.statusLabel && (
                  <span class="goal-status">{goalStatusLabel(goal.statusLabel)}</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div class="settings-actions">
        <span class="hint">
          {selection.length === 0 ? "Aucun Goal associé." : `${selection.length} associé(s).`}
        </span>
        <button
          type="button"
          disabled={!changed}
          onClick={() => setSelection(configuration.boardGoalIds)}
        >
          Annuler
        </button>
        <button
          type="button"
          class="primary"
          disabled={!changed}
          onClick={() =>
            void board.applySettings((current) => ({ ...current, boardGoalIds: [...selection] }), {
              resync: true,
            })
          }
        >
          Enregistrer l'association
        </button>
      </div>
    </section>
  );
}

/** Couleur de chaque objectif du sprint, et objectifs masqués du board. */
function GoalAppearance({ board }: { board: BoardModel }) {
  const goals = board.snapshot.value?.goals ?? [];
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  const shown = board.laneOrder.value
    .filter((id) => id.startsWith("goal:"))
    .map((id) => byId.get(id.slice("goal:".length)))
    .filter((goal): goal is SprintGoal => goal !== undefined);
  const hidden = board.hiddenGoals.value;

  return (
    <section class="panel" aria-labelledby="settings-goal-colors">
      <h2 id="settings-goal-colors">Couleur et visibilité des objectifs</h2>
      <p class="hint">
        Un objectif garde sa couleur d'un sprint à l'autre. Masquer un objectif fait passer ses
        tickets dans Build, sans toucher à leur rattachement dans Jira.
      </p>
      {shown.length + hidden.length === 0 ? (
        <p class="hint">Aucun objectif sur ce sprint.</p>
      ) : (
        <ul class="settings-goals">
          {[...shown, ...hidden].map((goal) => {
            const isHidden = hidden.includes(goal);
            return (
              <li key={goal.id} class="settings-row" data-goal-color={goal.color}>
                <span class="goal-ring" aria-hidden="true" />
                <span class="settings-goal-title">{goal.title}</span>
                {isHidden && <span class="settings-tag">masqué</span>}
                <fieldset class="settings-swatches">
                  <legend class="visually-hidden">Couleur de « {goal.title} »</legend>
                  {GOAL_COLOR_NAMES.map((name, index) => (
                    <button
                      key={name}
                      type="button"
                      class="swatch"
                      data-goal-color={goalColorName(index)}
                      aria-label={name}
                      title={name}
                      aria-pressed={goal.color === goalColorName(index)}
                      onClick={() => void board.setGoalColor(goal.id, index)}
                    />
                  ))}
                </fieldset>
                <button type="button" onClick={() => void board.setGoalHidden(goal.id, !isHidden)}>
                  {isHidden ? "Réafficher" : "Masquer"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
