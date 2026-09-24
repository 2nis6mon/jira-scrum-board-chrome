import { useState } from "preact/hooks";
import {
  type BoardConfiguration,
  type ColumnConfiguration,
  type IssueCategory,
  isBugTypeConfiguration,
} from "../../../core/boardConfiguration";
import {
  AUTO_REFRESH_CHOICES,
  type ColumnKind,
  ISSUE_CATEGORY_LABEL,
  type SettingResult,
  withAgingThreshold,
  withBlockedLabels,
  withBugType,
  withBuildLabel,
  withColumnHidden,
  withColumnName,
  withDailyMinutes,
  withDefaultBlockOrder,
  withIssueTypeCategory,
  withWipLimit,
} from "../../../core/boardSettings";
import type { BoardModel } from "../../model/BoardModel";
import { plural } from "../format";

const CATEGORIES: readonly IssueCategory[] = ["SCRUM", "RUN", "IGNORED"];

/** Enregistre un réglage validé ; rend le message d'erreur s'il est refusé. */
type Commit = (
  change: (current: BoardConfiguration) => SettingResult,
  options?: { resync?: boolean },
) => string | null;

/**
 * Colonnes, types de tickets, affichage. Chaque modification est enregistrée aussitôt : une case ou
 * une liste dès qu'on la change, un champ texte quand on le valide (Entrée, ou sortie du champ).
 * Classement des types, bugs et labels de blocage changent la lecture des tickets : le board est
 * alors relu dans Jira (lecture seule). Le reste ne change que l'affichage.
 */
export function BoardSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const commit: Commit = (change, options = {}) => {
    const preview = change(configuration);
    if (!preview.ok) return preview.error;
    // Appliqué à la configuration la plus récente : deux saisies rapprochées s'additionnent.
    void board.applySettings(
      (current) => {
        const latest = change(current);
        return latest.ok ? latest.configuration : current;
      },
      { resync: options.resync ?? false },
    );
    return null;
  };
  const set = (change: (current: BoardConfiguration) => BoardConfiguration, resync = false) =>
    commit((current) => ({ ok: true, configuration: change(current) }), { resync });

  return (
    <div class="settings-section">
      <section class="panel" aria-labelledby="settings-columns">
        <header class="panel-header">
          <h2 id="settings-columns">Colonnes</h2>
          <button
            type="button"
            onClick={() => void board.refreshStructure()}
            disabled={board.setupBusy.value}
          >
            Relire colonnes et types depuis Jira
          </button>
        </header>
        <p class="hint">
          Les colonnes et leurs statuts viennent du board Jira. Vous pouvez en renommer l'affichage,
          en masquer une et ajuster sa limite WIP. Chaque modification est enregistrée dès que le
          champ est validé.
        </p>
        <ColumnEditor
          title="Scrum"
          kind="scrum"
          columns={configuration.scrumColumns}
          commit={commit}
        />
        <ColumnEditor title="RUN" kind="run" columns={configuration.runColumns} commit={commit} />
      </section>

      <section class="panel" aria-labelledby="settings-types">
        <h2 id="settings-types">Types de tickets</h2>
        <p class="hint">
          Ce qui alimente le board Scrum et ce qui part dans la zone RUN. Un type « ignoré »
          n'apparaît nulle part. « Bug » : un ticket lié de ce type est signalé comme bug sur la
          carte du ticket porteur. Le board est relu dans Jira après chaque changement.
        </p>
        {configuration.issueTypes.length === 0 ? (
          <p class="hint">Aucun type de ticket trouvé sur ce board.</p>
        ) : (
          <table class="settings-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Classement</th>
                <th>Bug</th>
              </tr>
            </thead>
            <tbody>
              {configuration.issueTypes.map((type) => (
                <tr key={type.id}>
                  <td>{type.name}</td>
                  <td>
                    <select
                      aria-label={`Classement du type ${type.name}`}
                      value={type.category}
                      onChange={(event) => {
                        const category = event.currentTarget.value as IssueCategory;
                        set((current) => withIssueTypeCategory(current, type.id, category), true);
                      }}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {ISSUE_CATEGORY_LABEL[category]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${type.name} compte comme bug`}
                      checked={isBugTypeConfiguration(type)}
                      onChange={(event) => {
                        const countsAsBug = event.currentTarget.checked;
                        set((current) => withBugType(current, type.id, countsAsBug), true);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section class="panel" aria-labelledby="settings-display">
        <h2 id="settings-display">Affichage et synchronisation</h2>
        <label class="settings-check">
          <input
            type="checkbox"
            checked={configuration.showRunSection}
            onChange={(event) => {
              const showRunSection = event.currentTarget.checked;
              set((current) => ({ ...current, showRunSection }));
            }}
          />
          Afficher la section RUN
        </label>
        <div class="settings-field">
          <label for="settings-build-label">
            Nom du bloc des tickets rattachés à aucun objectif
          </label>
          <CommitInput
            id="settings-build-label"
            value={configuration.buildSectionLabel}
            placeholder="Build"
            onCommit={(raw) => set((current) => withBuildLabel(current, raw))}
          />
        </div>
        <div class="settings-field settings-inline">
          <label for="settings-aging">Seuil « vieillissant »</label>
          <CommitInput
            id="settings-aging"
            value={String(configuration.agingThresholdDays)}
            numeric
            onCommit={(raw) => commit((current) => withAgingThreshold(current, raw))}
          />
          <span class="hint">jour(s) sans changement de statut</span>
        </div>
        <div class="settings-field settings-inline">
          <label for="settings-daily">Durée de la daily</label>
          <CommitInput
            id="settings-daily"
            value={String(configuration.dailyMinutes)}
            numeric
            onCommit={(raw) => commit((current) => withDailyMinutes(current, raw))}
          />
          <span class="hint">minute(s), pour le minuteur du mode Daily</span>
        </div>
        <label class="settings-field settings-inline">
          <span>Rafraîchissement automatique</span>
          <select
            value={
              configuration.autoRefreshSeconds === null
                ? ""
                : String(configuration.autoRefreshSeconds)
            }
            onChange={(event) => {
              const value = event.currentTarget.value;
              const autoRefreshSeconds = value === "" ? null : Number(value);
              set((current) => ({ ...current, autoRefreshSeconds }));
            }}
          >
            {AUTO_REFRESH_CHOICES.map((seconds) => (
              <option key={String(seconds)} value={seconds === null ? "" : String(seconds)}>
                {seconds === null ? "Désactivé" : `Toutes les ${seconds / 60} min`}
              </option>
            ))}
          </select>
          <span class="hint">lecture seule : il relit Jira, n'écrit rien</span>
        </label>
        <div class="settings-field">
          <label for="settings-blocked-labels">Labels marquant un ticket bloqué</label>
          <CommitInput
            id="settings-blocked-labels"
            value={configuration.blockedLabels.join(", ")}
            placeholder="séparés par des virgules — vide : seuls les liens Jira comptent"
            onCommit={(raw) => set((current) => withBlockedLabels(current, raw), true)}
          />
          <span class="hint">Le lien Jira « est bloqué par » est toujours pris en compte.</span>
        </div>
        <div class="row">
          <button
            type="button"
            disabled={configuration.blockOrder.length === 0}
            onClick={() => set(withDefaultBlockOrder)}
          >
            Réinitialiser l'ordre des swimlanes
          </button>
          <span class="hint">Objectifs dans leur ordre d'arrivée, puis Build et RUN.</span>
        </div>
      </section>
    </div>
  );
}

function ColumnEditor(props: {
  title: string;
  kind: ColumnKind;
  columns: readonly ColumnConfiguration[];
  commit: Commit;
}) {
  const { kind, commit } = props;
  return (
    <table class="settings-table">
      <caption>{props.title}</caption>
      <thead>
        <tr>
          <th>Affichée</th>
          <th>Nom</th>
          <th>Statuts Jira</th>
          <th>WIP</th>
        </tr>
      </thead>
      <tbody>
        {props.columns.map((column) => (
          <tr key={column.id}>
            <td>
              <input
                type="checkbox"
                aria-label={`Afficher la colonne ${column.name} (${props.title})`}
                checked={!column.hidden}
                disabled={column.statusIds.length === 0}
                onChange={(event) => {
                  const hidden = !event.currentTarget.checked;
                  commit((current) => ({
                    ok: true,
                    configuration: withColumnHidden(current, kind, column.id, hidden),
                  }));
                }}
              />
            </td>
            <td>
              <CommitInput
                label={`Nom de la colonne ${column.name} (${props.title})`}
                value={column.name}
                onCommit={(raw) =>
                  commit((current) => withColumnName(current, kind, column.id, raw))
                }
              />
            </td>
            <td class={column.statusIds.length === 0 ? "settings-warning" : "hint"}>
              {column.statusIds.length === 0
                ? "aucun statut Jira"
                : plural(column.statusIds.length, "statut")}
              {column.isDone && <span class="settings-done">terminé</span>}
            </td>
            <td>
              <CommitInput
                label={`Limite WIP de ${column.name} (${props.title})`}
                value={column.wipLimit === null ? "" : String(column.wipLimit)}
                placeholder="—"
                numeric
                onCommit={(raw) => commit((current) => withWipLimit(current, kind, column.id, raw))}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Champ texte enregistré à la validation (Entrée, ou sortie du champ), pas à chaque frappe. Une
 * saisie refusée reste affichée avec son erreur, sans rien changer ; Échap revient à la valeur
 * enregistrée.
 */
function CommitInput(props: {
  id?: string;
  value: string;
  onCommit: (raw: string) => string | null;
  label?: string;
  placeholder?: string;
  numeric?: boolean;
}) {
  // Pendant la saisie, et tant qu'elle est refusée, le champ montre le texte tapé ; sinon, la
  // valeur enregistrée (qui peut changer ailleurs : structure relue, autre onglet).
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? props.value;
  // La valeur est lue dans le champ lui-même : l'état de la frappe peut ne pas être encore rendu.
  const commit = (raw: string) => {
    if (raw === props.value) {
      setDraft(null);
      setError(null);
      return;
    }
    const refused = props.onCommit(raw);
    setError(refused);
    setDraft(refused === null ? null : raw);
  };
  return (
    <>
      <input
        type="text"
        id={props.id}
        inputMode={props.numeric ? "numeric" : undefined}
        class={
          [props.numeric ? "settings-number" : "", error ? "settings-invalid" : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-label={props.label}
        aria-invalid={error !== null ? true : undefined}
        placeholder={props.placeholder}
        value={shown}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onChange={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          setDraft(null);
          setError(null);
        }}
      />
      {error && (
        <span class="settings-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
