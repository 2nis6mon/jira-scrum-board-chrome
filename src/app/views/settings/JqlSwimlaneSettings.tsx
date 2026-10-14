import { useEffect, useRef, useState } from "preact/hooks";
import { moveBlock } from "../../../core/boardBlocks";
import {
  type BoardConfiguration,
  DEFAULT_BUILD_LABEL,
  swimlaneName,
  type TicketSwimlane,
} from "../../../core/boardConfiguration";
import { withBuildLabel, withTypeDestination } from "../../../core/boardSettings";
import { migrateToJqlSwimlanes, type SwimlanePreview } from "../../../core/jqlSwimlanes";
import { shiftTarget } from "../../../core/reorder";
import type { BoardModel } from "../../model/BoardModel";
import type { JqlValidation } from "../../services/JqlService";
import { plural } from "../format";
import { Icon } from "../Icon";
import { CommitInput, Grip, SaveBar, Switch, useReorder } from "./controls";
import { JqlEditor } from "./JqlEditor";

const LANE_DRAG = "application/x-sprint-goals-jql-swimlane";
const serialized = (lanes: readonly TicketSwimlane[]) => JSON.stringify(lanes);

/** Brouillon explicite : ni l'ouverture, ni la validation, ni l'aperçu ne publient dans Jira. */
export function JqlSwimlaneSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const stored = migrateToJqlSwimlanes(configuration).ticketSwimlanes;
  const storedText = serialized(stored);
  const [lanes, setLanes] = useState<readonly TicketSwimlane[]>(stored);
  const [baseline, setBaseline] = useState(storedText);
  const [sourceBoard, setSourceBoard] = useState(configuration.boardId);
  const [validations, setValidations] = useState<Readonly<Record<string, JqlValidation>>>({});
  const [preview, setPreview] = useState<{ text: string; result: SwimlanePreview } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Une réponse lancée avant une modification ou un changement de board est obsolète.
  const generation = useRef(0);
  const draftText = serialized(lanes);
  const dirty = draftText !== baseline;
  const conflict = dirty && baseline !== storedText;
  const migration = configuration.swimlaneMode !== "jql";
  const changed = dirty || migration;
  const canEdit = board.canEditSettings.value;
  const busy = previewing || applying;
  const valid = lanes.every(
    (lane) =>
      lane.enabled === false ||
      (validations[lane.id]?.text === (lane.jql ?? "") && validations[lane.id]?.status === "valid"),
  );
  const currentPreview = preview?.text === draftText ? preview.result : null;
  const previewValid = currentPreview?.lanes.every((lane) => !lane.error) ?? false;

  // Une relecture actualise un formulaire intact, mais conserve une saisie en cours.
  useEffect(() => {
    if (configuration.boardId === sourceBoard && (dirty || baseline === storedText)) return;
    generation.current += 1;
    setSourceBoard(configuration.boardId);
    setLanes(stored);
    setBaseline(storedText);
    setPreview(null);
    if (configuration.boardId !== sourceBoard) setValidations({});
    setError(null);
    setPreviewing(false);
    setApplying(false);
  }, [configuration.boardId, storedText]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const change = (update: (current: readonly TicketSwimlane[]) => readonly TicketSwimlane[]) => {
    if (!canEdit || applying) return;
    generation.current += 1;
    setLanes(update);
    setPreview(null);
    setPreviewing(false);
    setError(null);
  };
  const edit = (id: string, parts: Partial<TicketSwimlane>) =>
    change((current) => current.map((lane) => (lane.id === id ? { ...lane, ...parts } : lane)));
  const ids = lanes.map((lane) => lane.id);
  const move = (id: string, before: string | null) =>
    change((current) => {
      const byId = new Map(current.map((lane) => [lane.id, lane]));
      return moveBlock(
        id,
        before,
        current.map((lane) => lane.id),
      ).flatMap((key) => {
        const lane = byId.get(key);
        return lane ? [lane] : [];
      });
    });
  const reorder = useReorder(LANE_DRAG, ids, move);
  const shift = (id: string, offset: -1 | 1) => {
    const before = shiftTarget(ids, id, offset);
    if (before !== undefined) move(id, before);
  };
  const add = () => {
    change((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: "",
        typeIds: [],
        jql: "",
        enabled: true,
        hidden: false,
      },
    ]);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>(".jql-swimlane:last-child .jql-swimlane-name")
        ?.focus(),
    );
  };
  const reset = () => {
    generation.current += 1;
    setLanes(stored);
    setBaseline(storedText);
    setPreview(null);
    setError(null);
    setPreviewing(false);
  };
  const evaluate = async () => {
    if (!valid || previewing || applying) return;
    const request = ++generation.current;
    setPreviewing(true);
    setError(null);
    try {
      const result = await board.previewSwimlanes(lanes);
      if (generation.current === request) setPreview({ text: draftText, result });
    } catch {
      if (generation.current === request)
        setError(
          "L'aperçu n'a pas pu être vérifié dans Jira. Votre brouillon est conservé ; réessayez.",
        );
    } finally {
      if (generation.current === request) setPreviewing(false);
    }
  };
  const apply = async () => {
    if (!canEdit || busy || !changed || conflict || !valid || !previewValid) return;
    const request = ++generation.current;
    setApplying(true);
    setError(null);
    try {
      const saved = await board.applyJqlSwimlanes(lanes);
      if (generation.current !== request) return;
      if (saved) {
        const latest = board.configuration.value;
        if (latest?.boardId === sourceBoard) {
          const next = migrateToJqlSwimlanes(latest).ticketSwimlanes;
          setLanes(next);
          setBaseline(serialized(next));
          setPreview(null);
        }
      } else setError("Les règles n'ont pas été enregistrées. Votre brouillon est conservé.");
    } catch {
      if (generation.current === request)
        setError(
          "L'enregistrement n'a pas été confirmé. Votre brouillon est conservé ; relisez Jira avant de réessayer.",
        );
    } finally {
      if (generation.current === request) setApplying(false);
    }
  };
  const buildLabel = configuration.buildSectionLabel || DEFAULT_BUILD_LABEL;
  const ignored = configuration.issueTypes.filter((type) => type.category === "IGNORED");

  return (
    <section class="settings-card settings-lanes-card" aria-labelledby="settings-lanes">
      <header class="settings-card-header">
        <div class="settings-card-title">
          <h2 id="settings-lanes">Swimlanes</h2>
          <p class="settings-help">
            Les objectifs sont prioritaires, puis la première règle correspondante.
          </p>
        </div>
        <button
          type="button"
          class="icon-button settings-icon-button"
          aria-label="Relire colonnes et types depuis Jira"
          title="Relire colonnes et types depuis Jira"
          disabled={board.setupBusy.value || applying}
          onClick={() => void board.refreshStructure()}
        >
          <Icon name="refresh" size={16} />
        </button>
        <button
          type="button"
          class="settings-button primary"
          disabled={!canEdit || applying}
          onClick={add}
        >
          <Icon name="plus" size={14} /> Nouvelle swimlane
        </button>
      </header>
      {migration && (
        <p class="jql-migration-note" role="status">
          Vos groupes par type sont préparés en JQL. Vérifiez l'aperçu puis appliquez pour activer
          ces règles.
        </p>
      )}
      {conflict && (
        <p class="jql-migration-note" role="status">
          Les réglages ont changé depuis votre saisie. Enregistrement bloqué : copiez votre
          brouillon puis choisissez Annuler pour recharger les règles de Jira.
        </p>
      )}
      {!canEdit && (
        <p class="settings-help">Lecture seule : le droit de modifier ce board est nécessaire.</p>
      )}
      <fieldset class="jql-swimlane-fields" disabled={!canEdit || applying}>
        <legend class="visually-hidden">Règles de classement des swimlanes</legend>
        <ol class="settings-list settings-lanes jql-swimlanes">
          {lanes.map((lane, index) => {
            const name =
              lane.name.trim() || swimlaneName(configuration, lane) || `Swimlane ${index + 1}`;
            const result = currentPreview?.lanes.find((candidate) => candidate.id === lane.id);
            return (
              <li
                key={lane.id}
                class={`settings-rule jql-swimlane${lane.enabled === false ? " is-disabled" : ""}${reorder.dragged === lane.id ? " is-dragging" : ""}`}
                data-reorder-row
                data-drop={reorder.marker(lane.id)}
                onDragOver={reorder.over(lane.id)}
                onDrop={reorder.drop}
              >
                <div class="settings-rule-head">
                  <Grip
                    label={`Déplacer la swimlane ${name}`}
                    onMove={(offset) => shift(lane.id, offset)}
                    onDragStart={reorder.start(lane.id)}
                    onDragEnd={reorder.end}
                  />
                  <span class="settings-rank" title="Priorité de la règle">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    class="jql-swimlane-name"
                    aria-label={`Nom de la swimlane ${index + 1}`}
                    placeholder="Nom (ex. RUN)"
                    value={lane.name}
                    onInput={(event) => edit(lane.id, { name: event.currentTarget.value })}
                  />
                  <Switch
                    checked={lane.enabled !== false}
                    label={`Activer la swimlane ${name}`}
                    text="Active"
                    onChange={(enabled) => edit(lane.id, { enabled })}
                  />
                  <Switch
                    checked={lane.hidden}
                    label={`Masquer la swimlane ${name}`}
                    text="Masquée"
                    onChange={(hidden) => edit(lane.id, { hidden })}
                  />
                  <button
                    type="button"
                    class="icon-button settings-icon-button"
                    aria-label={`Supprimer la swimlane ${name}`}
                    title="Supprimer cette règle"
                    onClick={() =>
                      change((current) => current.filter((item) => item.id !== lane.id))
                    }
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                <JqlEditor
                  service={board.jql}
                  value={lane.jql ?? ""}
                  label={`JQL de la swimlane ${name}`}
                  disabled={!canEdit || applying}
                  onInput={(jql) => edit(lane.id, { jql })}
                  onValidation={(validation) =>
                    setValidations((current) => ({ ...current, [lane.id]: validation }))
                  }
                  placeholder='Ex. labels = "run"'
                />
                {lane.enabled === false && (
                  <p class="settings-help jql-swimlane-status">
                    Suspendue : les règles suivantes peuvent recevoir ses tickets.
                  </p>
                )}
                {lane.hidden && lane.enabled !== false && (
                  <p class="settings-help jql-swimlane-status">
                    Classée mais masquée ; ses tickets restent visibles dans leurs objectifs.
                  </p>
                )}
                {result && (
                  <div class="jql-swimlane-preview" role="status">
                    {result.error ? (
                      <p class="settings-error">{result.error}</p>
                    ) : (
                      <>
                        <p>
                          <strong>
                            {plural(
                              result.assigned,
                              "ticket dans cette swimlane",
                              "tickets dans cette swimlane",
                            )}
                          </strong>
                          {" · "}
                          {result.matched} correspondent{" · "}
                          {result.goals} dans un objectif{" · "}
                          {result.earlier} dans une règle précédente
                        </p>
                        {result.issueKeys.length > 0 && (
                          <p class="jql-preview-keys">{result.issueKeys.join(" · ")}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {lanes.length === 0 && (
          <p class="settings-empty">Aucune règle : les tickets sans objectif rejoignent Default.</p>
        )}
      </fieldset>
      <div class="jql-default-lane">
        <Icon name="build" size={17} />
        <div class="settings-lane-field">
          <label class="settings-caption" for="settings-build-label">
            Nom de la swimlane par défaut
          </label>
          <fieldset class="jql-swimlane-fields" disabled={!canEdit || applying}>
            <CommitInput
              id="settings-build-label"
              class="settings-lane-name"
              value={configuration.buildSectionLabel}
              placeholder={DEFAULT_BUILD_LABEL}
              onCommit={(value) => {
                if (canEdit)
                  void board.applySettings((current) => withBuildLabel(current, value), {
                    resync: false,
                  });
                return null;
              }}
            />
          </fieldset>
        </div>
        <span class="settings-badge settings-badge-default">Default</span>
        <p class="settings-help">
          Les tickets restants.
          {currentPreview && ` ${plural(currentPreview.defaultCount, "ticket")}.`}
        </p>
      </div>
      <div class="jql-preview-actions">
        <button
          type="button"
          class="settings-button"
          disabled={!valid || busy}
          onClick={() => void evaluate()}
        >
          <Icon name="search" size={14} />{" "}
          {previewing ? "Lecture de Jira…" : "Vérifier et prévisualiser"}
        </button>
        <span class="settings-help">
          {!valid
            ? "Validez les JQL actifs avant l'aperçu."
            : "Aperçu sur les tickets du board, sans modifier Jira."}
        </span>
      </div>
      {currentPreview?.subtaskChanges !== undefined && currentPreview.subtaskChanges > 0 && (
        <p class="jql-migration-note">
          {plural(
            currentPreview.subtaskChanges,
            "sous-tâche change de classement",
            "sous-tâches changent de classement",
          )}{" "}
          : chaque ticket suit maintenant son propre JQL, avec priorité à son objectif.
        </p>
      )}
      {error && (
        <p class="settings-error jql-swimlane-status" role="alert">
          {error}
        </p>
      )}
      <SaveBar
        changed={changed}
        message={
          conflict
            ? "Règles modifiées dans Jira · copiez le brouillon puis Annuler pour recharger."
            : changed
              ? previewValid
                ? "Aperçu prêt · Appliquer enregistre les règles pour l'équipe."
                : "Brouillon conservé · vérifiez l'aperçu avant d'appliquer."
              : "Règles enregistrées. Les swimlanes vides disparaissent du board."
        }
        busy={busy}
        cancelDisabled={!dirty || applying}
        onCancel={reset}
        confirm={applying ? "Enregistrement…" : "Appliquer"}
        confirmDisabled={!canEdit || !changed || conflict || busy || !valid || !previewValid}
        onConfirm={() => void apply()}
      />
      <details class="jql-ignored-types">
        <summary class="jql-ignored-title">
          Types ignorés <span class="settings-type-count">{ignored.length}</span>
        </summary>
        <p class="settings-help">
          Toujours exclus du board, même avec un objectif. Enregistré dès modification.
        </p>
        <fieldset class="jql-swimlane-fields" disabled={!canEdit || applying}>
          <ul class="settings-chips" aria-label="Types ignorés">
            {ignored.map((type) => (
              <li class="settings-chip" data-type-id={type.id} key={type.id}>
                <span>{type.name}</span>
                <button
                  type="button"
                  class="icon-button"
                  aria-label={`Réinclure ${type.name}`}
                  title="Réinclure ce type"
                  onClick={() =>
                    void board.applySettings(
                      (current) => withTypeDestination(current, type.id, { kind: "goal" }),
                      { resync: true },
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <select
            aria-label="Exclure un type du board"
            value=""
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (id)
                void board.applySettings(
                  (current) => withTypeDestination(current, id, { kind: "ignored" }),
                  { resync: true },
                );
            }}
          >
            <option value="">Exclure un type…</option>
            {configuration.issueTypes
              .filter((type) => type.category !== "IGNORED")
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
          </select>
        </fieldset>
      </details>
      <p class="visually-hidden">Default : {buildLabel}</p>
    </section>
  );
}
