import { useEffect, useRef, useState } from "preact/hooks";
import { filterAtlassianGoals } from "../../../core/filters";
import { type AtlassianGoal, goalDisplayName } from "../../../jira/models";
import type { BoardModel, PinEditor } from "../../model/BoardModel";
import { goalStatusLabel, plural } from "../format";

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const isChanged = (editor: PinEditor) => !sameIds(editor.selection, editor.base);

/**
 * Goals épinglés au sprint, directement dans l'administration (plus de fenêtre depuis 0.22.4). La
 * sélection se compose sur la page ; une seule écriture part, sur « Enregistrer dans Jira ». Le
 * brouillon suit ce que Jira porte tant qu'il n'est pas modifié : après un enregistrement ou une
 * relecture, il repart de la sélection relue.
 */
export function PinGoalsPanel({ board }: { board: BoardModel }) {
  const snapshot = board.snapshot.value;
  const editor = board.pinEditor.value;
  const canPin = board.canPinGoals.value;
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const wasSaving = useRef(false);

  const sprintId = snapshot?.sprint?.id ?? null;
  const pinned = snapshot?.pinnedGoalIds ?? null;
  const pinnedKey = JSON.stringify([pinned, snapshot?.localPinnedGoalIds ?? null]);

  // Brouillon ouvert d'office, et recalé sur Jira tant qu'il n'a pas été touché.
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
  }, [board, canPin, sprintId, pinnedKey, editor === null]);

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

  if (!canPin) {
    return (
      <section class="panel" aria-labelledby="settings-pin">
        <h2 id="settings-pin">Goals épinglés au sprint</h2>
        <p class="hint">
          {snapshot?.sprint
            ? "La propriété du sprint n'a pas pu être lue : actualisez le board pour épingler des Goals."
            : "Aucun sprint actif : l'épinglage porte sur le sprint affiché."}
        </p>
      </section>
    );
  }
  if (!editor) return null;

  const siteGoals = board.siteGoals.value;
  const loading = board.siteGoalsLoading.value;
  const byId = new Map((siteGoals ?? []).map((goal) => [goal.id, goal]));
  const shown = new Map(snapshot?.goals.map((goal) => [goal.id, goal.title]) ?? []);
  const nameOf = (id: string) => {
    const goal = byId.get(id);
    return goal ? goalDisplayName(goal) : (shown.get(id) ?? id);
  };
  // Les Goals archivés restent hors de la liste, sauf s'ils sont épinglés : on doit pouvoir les
  // désépingler.
  const listed = (siteGoals ?? []).filter(
    (goal) => !goal.isArchived || editor.selection.includes(goal.id),
  );
  const filtered = filterAtlassianGoals(search, listed);
  const changed = isChanged(editor);

  return (
    <section class="panel" aria-labelledby="settings-pin" aria-busy={editor.saving}>
      <h2 id="settings-pin">Goals épinglés au sprint « {editor.sprintName} »</h2>
      <p class="hint">
        Pour CE sprint seulement : un Goal épinglé a sa swimlane même sans aucun ticket (utile en
        début de sprint). Les autres objectifs sont déduits des tickets. Le sprint suivant repart
        sans épinglage. Enregistré dans Jira, dans une propriété du sprint, sur votre geste
        seulement ; ni le champ « Objectif » du sprint ni aucun ticket ne sont modifiés.
      </p>
      {editor.fromLocal && (
        <p class="notice notice-info">
          Cette sélection est gardée dans ce navigateur seulement : Jira avait refusé de
          l'enregistrer. « Enregistrer dans Jira » la partagera avec l'équipe si vos droits le
          permettent désormais.
        </p>
      )}

      <section class="pin-section" aria-labelledby="pin-selected-title">
        <h3 id="pin-selected-title">Épinglés ({editor.selection.length})</h3>
        {editor.selection.length > 1 && (
          <p class="hint">Les swimlanes suivent cet ordre, celui de l'épinglage.</p>
        )}
        {editor.selection.length === 0 ? (
          <p class="hint">Aucun Goal épinglé.</p>
        ) : (
          <ol class="pin-selected">
            {editor.selection.map((id, index) => (
              <li key={id}>
                <span class="pin-rank" aria-hidden="true">
                  {index + 1}.
                </span>
                <span class="pin-name">{nameOf(id)}</span>
                <button
                  type="button"
                  class="pin-remove"
                  aria-label={`Désépingler ${nameOf(id)}`}
                  title="Désépingler"
                  disabled={editor.saving}
                  onClick={() => board.togglePinned(id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section class="pin-section" aria-labelledby="pin-site-title">
        <header class="pin-section-header">
          <h3 id="pin-site-title">Goals du site</h3>
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
              {board.siteGoalsError.value.suggestion && ` ${board.siteGoalsError.value.suggestion}`}
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
          {saved && !changed ? "Enregistré dans Jira." : ""}
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
