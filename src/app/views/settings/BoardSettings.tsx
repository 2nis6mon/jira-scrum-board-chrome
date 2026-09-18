import { useEffect, useRef, useState } from "preact/hooks";
import {
  type BoardConfiguration,
  type ColumnConfiguration,
  type IssueCategory,
  isBugTypeConfiguration,
} from "../../../core/boardConfiguration";
import {
  AUTO_REFRESH_CHOICES,
  applyBoardSection,
  type BoardSectionDraft,
  boardSectionDraft,
  ISSUE_CATEGORY_LABEL,
  isBoardSectionChanged,
  wipKey,
  withDefaultBlockOrder,
} from "../../../core/boardSettings";
import type { BoardModel } from "../../model/BoardModel";
import { plural } from "../format";

const CATEGORIES: readonly IssueCategory[] = ["SCRUM", "RUN", "IGNORED"];

/**
 * Colonnes, types de tickets, affichage. Modifiés en brouillon, appliqués ensemble : un réglage
 * à moitié saisi ne change pas le board.
 */
export function BoardSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const [draft, setDraft] = useState(() => boardSectionDraft(configuration));
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [applying, setApplying] = useState(false);

  // Un brouillon que l'utilisateur n'a pas touché suit la configuration (relecture de la structure
  // dans Jira, par exemple) ; un brouillon modifié est gardé tel quel.
  const base = useRef(configuration);
  useEffect(() => {
    if (base.current === configuration) return;
    if (!isBoardSectionChanged(base.current, draft)) setDraft(boardSectionDraft(configuration));
    base.current = configuration;
  }, [configuration, draft]);

  const changed = isBoardSectionChanged(configuration, draft);
  // Chaque modification repart du brouillon COURANT : deux saisies rapprochées s'additionnent.
  const update: DraftUpdate = (change) => {
    setDraft((current) => ({ ...current, ...change(current) }));
    setErrors([]);
  };

  const apply = async () => {
    const result = applyBoardSection(configuration, draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setApplying(true);
    try {
      await board.applySettings(
        (current) => {
          const latest = applyBoardSection(current, draft);
          return latest.ok ? latest.configuration : current;
        },
        { resync: true },
      );
      const saved = board.configuration.value;
      if (saved) {
        base.current = saved;
        setDraft(boardSectionDraft(saved));
      }
    } finally {
      setApplying(false);
    }
  };

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
          en masquer une et ajuster sa limite WIP.
        </p>
        <ColumnEditor title="Scrum" kind="scrum" draft={draft} update={update} />
        <ColumnEditor title="RUN" kind="run" draft={draft} update={update} />
      </section>

      <section class="panel" aria-labelledby="settings-types">
        <h2 id="settings-types">Types de tickets</h2>
        <p class="hint">
          Ce qui alimente le board Scrum et ce qui part dans la zone RUN. Un type « ignoré »
          n'apparaît nulle part. « Bug » : un ticket lié de ce type est signalé comme bug sur la
          carte du ticket porteur.
        </p>
        {draft.issueTypes.length === 0 ? (
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
              {draft.issueTypes.map((type) => (
                <tr key={type.id}>
                  <td>{type.name}</td>
                  <td>
                    <select
                      aria-label={`Classement du type ${type.name}`}
                      value={type.category}
                      onChange={(event) => {
                        const category = event.currentTarget.value as IssueCategory;
                        update((current) => ({
                          issueTypes: current.issueTypes.map((item) =>
                            item.id === type.id ? { ...item, category } : item,
                          ),
                        }));
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
                        update((current) => ({
                          issueTypes: current.issueTypes.map((item) =>
                            item.id === type.id ? { ...item, countsAsBug } : item,
                          ),
                        }));
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
            checked={draft.showRunSection}
            onChange={(event) => {
              const showRunSection = event.currentTarget.checked;
              update(() => ({ showRunSection }));
            }}
          />
          Afficher la section RUN
        </label>
        <label class="settings-field">
          <span>Nom du bloc des tickets rattachés à aucun objectif</span>
          <input
            type="text"
            value={draft.buildSectionLabel}
            placeholder="Build"
            onInput={(event) => {
              const buildSectionLabel = event.currentTarget.value;
              update(() => ({ buildSectionLabel }));
            }}
          />
        </label>
        <label class="settings-field settings-inline">
          <span>Seuil « vieillissant »</span>
          <input
            type="text"
            inputMode="numeric"
            class="settings-number"
            value={draft.agingThresholdDays}
            onInput={(event) => {
              const agingThresholdDays = event.currentTarget.value;
              update(() => ({ agingThresholdDays }));
            }}
          />
          <span class="hint">jour(s) sans changement de statut</span>
        </label>
        <label class="settings-field settings-inline">
          <span>Rafraîchissement automatique</span>
          <select
            value={draft.autoRefreshSeconds === null ? "" : String(draft.autoRefreshSeconds)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              update(() => ({ autoRefreshSeconds: value === "" ? null : Number(value) }));
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
        <label class="settings-field">
          <span>Labels marquant un ticket bloqué</span>
          <input
            type="text"
            value={draft.blockedLabels}
            placeholder="séparés par des virgules — vide : seuls les liens Jira comptent"
            onInput={(event) => {
              const blockedLabels = event.currentTarget.value;
              update(() => ({ blockedLabels }));
            }}
          />
          <span class="hint">Le lien Jira « est bloqué par » est toujours pris en compte.</span>
        </label>
        <div class="row">
          <button
            type="button"
            disabled={configuration.blockOrder.length === 0}
            onClick={() =>
              void board.applySettings(withDefaultBlockOrder, {
                resync: false,
              })
            }
          >
            Réinitialiser l'ordre des swimlanes
          </button>
          <span class="hint">
            Objectifs dans leur ordre d'arrivée, puis Build et RUN. Immédiat, sans « Appliquer ».
          </span>
        </div>
      </section>

      {errors.length > 0 && (
        <div class="notice notice-error" role="alert">
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div class="settings-actions">
        <span class="hint">
          {changed ? "Modifications non appliquées." : "Aucune modification en cours."}
        </span>
        <button
          type="button"
          disabled={!changed || applying}
          onClick={() => {
            setDraft(boardSectionDraft(configuration));
            setErrors([]);
          }}
        >
          Annuler
        </button>
        <button
          type="button"
          class="primary"
          disabled={!changed || applying}
          onClick={() => void apply()}
        >
          {applying ? "Application…" : "Appliquer"}
        </button>
      </div>
    </div>
  );
}

type DraftUpdate = (change: (current: BoardSectionDraft) => Partial<BoardSectionDraft>) => void;

function ColumnEditor(props: {
  title: string;
  kind: "scrum" | "run";
  draft: BoardSectionDraft;
  update: DraftUpdate;
}) {
  const { draft, kind, update } = props;
  const columns = kind === "scrum" ? draft.scrumColumns : draft.runColumns;
  const change = (columnId: string, parts: Partial<ColumnConfiguration>) =>
    update((current) => {
      const edit = (list: readonly ColumnConfiguration[]) =>
        list.map((column) => (column.id === columnId ? { ...column, ...parts } : column));
      return kind === "scrum"
        ? { scrumColumns: edit(current.scrumColumns) }
        : { runColumns: edit(current.runColumns) };
    });
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
        {columns.map((column) => {
          const key = wipKey(column, kind);
          return (
            <tr key={column.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Afficher la colonne ${column.name} (${props.title})`}
                  checked={!column.hidden}
                  disabled={column.statusIds.length === 0}
                  onChange={(event) => change(column.id, { hidden: !event.currentTarget.checked })}
                />
              </td>
              <td>
                <input
                  type="text"
                  aria-label={`Nom de la colonne ${column.name} (${props.title})`}
                  value={column.name}
                  onInput={(event) => change(column.id, { name: event.currentTarget.value })}
                />
              </td>
              <td class={column.statusIds.length === 0 ? "settings-warning" : "hint"}>
                {column.statusIds.length === 0
                  ? "aucun statut Jira"
                  : plural(column.statusIds.length, "statut")}
                {column.isDone && <span class="settings-done">terminé</span>}
              </td>
              <td>
                <input
                  type="text"
                  inputMode="numeric"
                  class="settings-number"
                  aria-label={`Limite WIP de ${column.name} (${props.title})`}
                  placeholder="—"
                  value={draft.wipLimits[key] ?? ""}
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    update((current) => ({ wipLimits: { ...current.wipLimits, [key]: value } }));
                  }}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
