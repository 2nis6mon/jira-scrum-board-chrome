import { useEffect, useRef, useState } from "preact/hooks";
import { filterAtlassianGoals } from "../../../core/filters";
import { type AtlassianGoal, goalDisplayName } from "../../../jira/models";
import type { BoardModel } from "../../model/BoardModel";
import { goalStatusLabel, plural } from "../format";

/**
 * Choix des Goals Atlassian épinglés au sprint. La sélection se compose localement ; une seule
 * écriture part, sur « Enregistrer dans Jira ». Portage de la section « Objectifs du sprint » de
 * l'administration des Goals (Mac).
 */
export function PinGoalsDialog({ board }: { board: BoardModel }) {
  const editor = board.pinEditor.value;
  const open = editor !== null;
  const [search, setSearch] = useState("");
  const searchField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Chaque ouverture repart d'un filtre vide, le focus dans la fenêtre.
    setSearch("");
    searchField.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") board.closePinEditor();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [board, open]);

  if (!editor) return null;

  const siteGoals = board.siteGoals.value;
  const loading = board.siteGoalsLoading.value;
  const byId = new Map((siteGoals ?? []).map((goal) => [goal.id, goal]));
  const shown = new Map(board.snapshot.value?.goals.map((goal) => [goal.id, goal.title]) ?? []);
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
  const changed =
    editor.selection.length !== editor.base.length ||
    editor.selection.some((id, index) => id !== editor.base[index]);

  return (
    <div class="dialog-backdrop">
      <div
        class="dialog dialog-wide panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-goals-title"
        aria-busy={editor.saving}
      >
        <h2 id="pin-goals-title">Goals épinglés au sprint « {editor.sprintName} »</h2>
        <p class="hint">
          Les objectifs du board sont déduits des tickets du sprint : un Goal apparaît dès qu'un
          ticket lui est rattaché. Épinglez un Goal pour l'afficher aussi sans ticket.
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
            ref={searchField}
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

        <p class="hint">
          Pour ce sprint seulement, enregistré dans une propriété du sprint. Le champ « Objectif »
          du sprint n'est pas modifié, ni aucun ticket.
        </p>
        <div class="row">
          <button
            type="button"
            class="grow"
            disabled={editor.saving}
            onClick={() => board.closePinEditor()}
          >
            Annuler
          </button>
          <button
            type="button"
            class="grow primary"
            disabled={!changed || editor.saving}
            onClick={() => void board.savePinnedGoals()}
          >
            {editor.saving ? "Enregistrement…" : "Enregistrer dans Jira"}
          </button>
        </div>
      </div>
    </div>
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
