import { useEffect, useRef, useState } from "preact/hooks";
import { GOAL_COLOR_NAMES } from "../../../core/boardPreferences";
import { filterAtlassianGoals } from "../../../core/filters";
import { goalColorName, type SprintGoal } from "../../../core/sprintGoals";
import { type AtlassianGoal, goalDisplayName } from "../../../jira/models";
import type { BoardModel, PinEditor } from "../../model/BoardModel";
import { goalStatusLabel, plural } from "../format";

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const isChanged = (editor: PinEditor) => !sameIds(editor.selection, editor.base);

/**
 * Objectifs du sprint, en une seule liste (0.22.5) : couleur, masquage et épinglage de chaque
 * objectif, puis les Goals du site pour en épingler d'autres.
 *
 * Deux rythmes d'enregistrement, dits à l'écran : couleur et masquage sont des réglages du board
 * partagés, écrits à chaque geste ; l'épinglage (Goals Atlassian seulement) se compose sur la page
 * et part en UNE écriture sur « Enregistrer dans Jira ». Le brouillon d'épinglage suit ce que Jira
 * porte tant qu'il n'est pas modifié.
 */
export function SprintGoalsPanel({ board, pinning }: { board: BoardModel; pinning: boolean }) {
  const snapshot = board.snapshot.value;
  const configuration = board.configuration.value;
  const kanban = configuration?.boardType === "kanban";
  const canPin = pinning && board.canPinGoals.value;
  const editor = canPin ? board.pinEditor.value : null;
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const wasSaving = useRef(false);

  const sprintId = snapshot?.sprint?.id ?? null;
  const pinned = kanban
    ? (configuration?.boardPinnedGoalIds ?? null)
    : (snapshot?.pinnedGoalIds ?? null);
  const pinnedKey = JSON.stringify([pinned, snapshot?.localPinnedGoalIds ?? null]);

  // Brouillon d'épinglage ouvert d'office, et recalé sur Jira tant qu'il n'a pas été touché.
  useEffect(() => {
    if (!canPin || pinned === null) return;
    const current = board.pinEditor.value;
    const stale =
      current !== null &&
      !current.saving &&
      current.notice === null &&
      !isChanged(current) &&
      (current.sprintId !== sprintId ||
        !sameIds(current.base, pinned) ||
        current.fromLocal !== (snapshot?.localPinnedGoalIds != null));
    if (current === null || stale) board.openPinEditor();
  }, [board, canPin, sprintId, pinnedKey, board.pinEditor.value === null]);

  // Quitter la section abandonne le brouillon (jamais pendant une écriture).
  useEffect(() => () => board.closePinEditor(), [board]);

  // « Enregistré » après une écriture confirmée, effacé dès la modification suivante.
  useEffect(() => {
    if (wasSaving.current && !editor?.saving && (editor === null || editor.notice === null)) {
      setSaved(true);
    }
    if (editor && isChanged(editor)) setSaved(false);
    wasSaving.current = editor?.saving ?? false;
  }, [editor]);

  // Objectifs du sprint : affichés dans l'ordre des swimlanes, puis les masqués.
  const goals = snapshot?.goals ?? [];
  const byGoalId = new Map(goals.map((goal) => [goal.id, goal]));
  const shown = board.laneOrder.value
    .filter((id) => id.startsWith("goal:"))
    .map((id) => byGoalId.get(id.slice("goal:".length)))
    .filter((goal): goal is SprintGoal => goal !== undefined);
  const hidden = board.hiddenGoals.value.filter((goal) => !shown.includes(goal));
  const sprintGoals = [...shown, ...hidden];

  const siteGoals = board.siteGoals.value;
  const loading = board.siteGoalsLoading.value;
  const bySiteId = new Map((siteGoals ?? []).map((goal) => [goal.id, goal]));
  const nameOf = (id: string) => {
    const goal = bySiteId.get(id);
    return goal ? goalDisplayName(goal) : (byGoalId.get(id)?.title ?? id);
  };
  // Épinglés dans le brouillon mais sans swimlane encore : ils l'auront après l'enregistrement.
  const pendingPins = (editor?.selection ?? []).filter((id) => !byGoalId.has(id));
  // Les Goals archivés restent hors de la liste, sauf s'ils sont épinglés : on doit pouvoir les
  // désépingler.
  const listed = (siteGoals ?? []).filter(
    (goal) => !goal.isArchived || (editor?.selection.includes(goal.id) ?? false),
  );
  const filtered = filterAtlassianGoals(search, listed);
  const changed = editor !== null && isChanged(editor);

  const pinTag = (id: string) => {
    if (!editor) return null;
    const before = editor.base.includes(id);
    const after = editor.selection.includes(id);
    if (before && after) return "épinglé";
    if (after) return "épinglé · à enregistrer";
    if (before) return "désépinglé · à enregistrer";
    return null;
  };
  const pinButton = (id: string, title: string) =>
    editor && (
      <button
        type="button"
        class="settings-pin-toggle"
        aria-label={`${editor.selection.includes(id) ? "Désépingler" : "Épingler"} ${title}`}
        disabled={editor.saving}
        onClick={() => board.togglePinned(id)}
      >
        {editor.selection.includes(id) ? "Désépingler" : "Épingler"}
      </button>
    );

  return (
    <section class="panel" aria-labelledby="settings-sprint-goals" aria-busy={editor?.saving}>
      <h2 id="settings-sprint-goals">
        {kanban
          ? `Objectifs du board « ${configuration.boardName} »`
          : snapshot?.sprint
            ? `Objectifs du sprint « ${snapshot.sprint.name} »`
            : "Objectifs du sprint"}
      </h2>
      <p class="hint">
        Couleur et masquage s'enregistrent aussitôt pour toute l'équipe ; un objectif garde sa
        couleur {kanban ? "au fil du temps" : "d'un sprint à l'autre"}, et masqué, ses tickets
        passent dans {configuration?.buildSectionLabel || "Build"} sans toucher à leur rattachement
        dans Jira.
        {pinning &&
          (kanban
            ? " Épingler un Goal lui donne sa swimlane même sans ticket. L'épinglage est partagé pour ce board sur « Enregistrer dans Jira »."
            : " Épingler un Goal lui donne sa swimlane même sans ticket, pour CE sprint seulement : l'épinglage part dans Jira (propriété du sprint) sur « Enregistrer dans Jira ».")}
      </p>
      {pinning && !canPin && (
        <p class="hint">
          {kanban
            ? "Les objectifs ne sont pas encore disponibles : actualisez le board pour épingler des Goals."
            : snapshot?.sprint
              ? "La propriété du sprint n'a pas pu être lue : actualisez le board pour épingler des Goals."
              : "Aucun sprint actif : l'épinglage porte sur le sprint affiché."}
        </p>
      )}
      {editor?.fromLocal && (
        <p class="notice notice-info">
          Cette sélection est gardée dans ce navigateur seulement : Jira avait refusé de
          l'enregistrer. « Enregistrer dans Jira » la partagera avec l'équipe si vos droits le
          permettent désormais.
        </p>
      )}

      {sprintGoals.length + pendingPins.length === 0 ? (
        <p class="hint">
          {board.goalsNotice.value ||
          board.goalsWarnings.value.length > 0 ||
          board.syncProblem.value
            ? "La lecture des objectifs n'est pas complète. Actualisez le board pour les retrouver."
            : `Aucun objectif sur ce ${kanban ? "board" : "sprint"}.`}
        </p>
      ) : (
        <ul class="settings-goals">
          {sprintGoals.map((goal) => {
            const isHidden = hidden.includes(goal);
            const tag = pinTag(goal.id);
            return (
              <li key={goal.id} class="settings-row" data-goal-color={goal.color}>
                <span class="goal-ring" aria-hidden="true" />
                <span class="settings-goal-title">{goal.title}</span>
                {tag && <span class="settings-tag">{tag}</span>}
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
                {pinButton(goal.id, goal.title)}
              </li>
            );
          })}
          {pendingPins.map((id) => (
            <li key={id} class="settings-row settings-row-pending">
              <span class="goal-ring" aria-hidden="true" />
              <span class="settings-goal-title">{nameOf(id)}</span>
              <span class="settings-tag">{pinTag(id)}</span>
              {pinButton(id, nameOf(id))}
            </li>
          ))}
        </ul>
      )}

      {editor && (
        <>
          <section class="pin-section" aria-labelledby="pin-site-title">
            <header class="pin-section-header">
              <h3 id="pin-site-title">Épingler un Goal du site</h3>
              <button
                type="button"
                onClick={() => void board.loadSiteGoals()}
                disabled={loading || editor.saving}
              >
                {loading ? "Lecture…" : "Recharger"}
              </button>
            </header>
            <input
              type="search"
              class="pin-search"
              aria-label="Filtrer les Goals"
              placeholder="Filtrer par nom, clé ou responsable"
              value={search}
              onInput={(event) => setSearch(event.currentTarget.value)}
            />
            {board.siteGoalsError.value && (
              <div class="notice notice-error" role="alert">
                <p>
                  <strong>Goals du site illisibles : {board.siteGoalsError.value.text}</strong>
                  {board.siteGoalsError.value.suggestion &&
                    ` ${board.siteGoalsError.value.suggestion}`}
                </p>
              </div>
            )}
            {siteGoals === null ? (
              loading && <p class="hint">Lecture des Goals du site…</p>
            ) : listed.length === 0 ? (
              <p class="hint">Atlassian ne renvoie aucun Goal pour ce site.</p>
            ) : (
              <>
                {filtered.length === 0 ? (
                  <p class="hint">Aucun Goal ne correspond à « {search.trim()} ».</p>
                ) : (
                  <ul class="pin-list">
                    {filtered.map((goal) => (
                      <GoalOption
                        key={goal.id}
                        goal={goal}
                        checked={editor.selection.includes(goal.id)}
                        disabled={editor.saving}
                        onToggle={() => board.togglePinned(goal.id)}
                      />
                    ))}
                  </ul>
                )}
                <p class="hint">
                  Affichés : {filtered.length} sur {plural(listed.length, "Goal")}. Filtrage local :
                  aucune requête n'est envoyée pendant la frappe.
                </p>
              </>
            )}
          </section>

          {editor.notice && (
            <div class={`notice notice-${editor.notice.tone}`} role="alert">
              <p>
                <strong>{editor.notice.text}</strong>
                {editor.notice.suggestion && ` ${editor.notice.suggestion}`}
              </p>
              {editor.canKeepLocally && (
                <div class="row">
                  <button type="button" onClick={() => void board.keepPinnedLocally()}>
                    Garder cette sélection dans ce navigateur
                  </button>
                </div>
              )}
            </div>
          )}

          <div class="settings-actions">
            <span class="hint" aria-live="polite">
              {saved && !changed
                ? "Épinglage enregistré dans Jira."
                : changed
                  ? "Épinglage modifié : à enregistrer."
                  : ""}
            </span>
            <button
              type="button"
              disabled={editor.saving || (!changed && editor.notice === null)}
              onClick={() => board.openPinEditor()}
            >
              Annuler
            </button>
            <button
              type="button"
              class="primary"
              disabled={!changed || editor.saving}
              onClick={() => void board.savePinnedGoals()}
            >
              {editor.saving ? "Enregistrement…" : "Enregistrer dans Jira"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function GoalOption(props: {
  goal: AtlassianGoal;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { goal } = props;
  const details = [goal.key, goal.ownerName, goal.isArchived ? "archivé" : null].filter(
    (part): part is string => part !== null,
  );
  const status = goal.statusLabel ? goalStatusLabel(goal.statusLabel) : null;
  return (
    <li>
      <label class="pin-option">
        <input
          type="checkbox"
          aria-label={[goalDisplayName(goal), ...details, ...(status ? [status] : [])].join(", ")}
          checked={props.checked}
          disabled={props.disabled}
          onChange={props.onToggle}
        />
        <span class="pin-option-text">
          <span class="pin-name">{goalDisplayName(goal)}</span>
          {details.length > 0 && <span class="pin-meta">{details.join(" · ")}</span>}
        </span>
        {status && <span class="goal-status">{status}</span>}
      </label>
    </li>
  );
}
