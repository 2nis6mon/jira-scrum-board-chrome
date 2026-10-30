import { useEffect, useState } from "preact/hooks";
import { type BoardConfiguration, displayedCardFields } from "../../../core/boardConfiguration";
import { allIssues } from "../../../core/boardIssue";
import {
  moveCardField,
  sameCardFields,
  searchFields,
  withCardField,
} from "../../../core/boardSettings";
import {
  type CardField,
  cardFieldId,
  cardFieldValues,
  MAX_CARD_FIELDS,
} from "../../../core/cardFields";
import { shiftTarget } from "../../../core/reorder";
import { localize, t } from "../../i18n";
import type { BoardModel } from "../../model/BoardModel";
import { cardFieldLabel } from "../../model/coreText";
import { Icon } from "../Icon";
import { CardPreview } from "./CardPreview";
import { Grip, SaveBar, useReorder } from "./controls";

const STANDARD_FIELDS: readonly CardField[] = [
  { kind: "fixVersions" },
  { kind: "affectsVersions" },
  { kind: "labels" },
  { kind: "components" },
];
const MAX_RESULTS = 12;
const FIELD_DRAG = "application/x-sprint-goals-settings-field";

/**
 * Onglet Champs des cartes : jusqu'à `MAX_CARD_FIELDS` champs sous le titre des cartes, dans l'ordre
 * choisi (glissé, ou poignée aux flèches). Un brouillon, enregistré sur « Appliquer » : le board est
 * alors relu dans Jira avec ces champs.
 */
export function CardFieldSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const stored = displayedCardFields(configuration);
  const [fields, setFields] = useState<readonly CardField[]>(stored);
  const [search, setSearch] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (board.customFields.value === null) void board.loadCustomFields();
  }, [board]);

  const full = fields.length >= MAX_CARD_FIELDS;
  const changed = !sameCardFields(fields, stored);
  const ids = fields.map(cardFieldId);
  const chosen = new Set(ids);
  const matches = searchFields(search, board.customFields.value ?? []);
  const reorder = useReorder(FIELD_DRAG, ids, (id, before) =>
    setFields((current) => moveCardField(current, id, before)),
  );
  const shift = (id: string, offset: -1 | 1) => {
    const before = shiftTarget(ids, id, offset);
    if (before !== undefined) setFields((current) => moveCardField(current, id, before));
  };

  const apply = async () => {
    setApplying(true);
    try {
      await board.applySettings((current) => ({ ...current, cardFields: [...fields] }), {
        resync: true,
      });
      const saved = board.configuration.value;
      if (saved) setFields(displayedCardFields(saved));
    } finally {
      setApplying(false);
    }
  };

  // Aperçu : les tickets qui ont le plus de valeurs à montrer, parmi celles déjà lues dans Jira.
  const read = new Set(stored.map(cardFieldId));
  const notRead = fields.filter((field) => !read.has(cardFieldId(field)));
  const snapshot = board.snapshot.value;
  const sample = snapshot
    ? allIssues(snapshot)
        .map((issue) => ({
          issue,
          score:
            fields.filter((field) => cardFieldValues(field, issue.issue.fields).length > 0).length *
              2 +
            (issue.issue.fields.parent ? 1 : 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(({ issue }) => issue)
    : [];

  return (
    <>
      <div class="settings-columns">
        <section class="settings-card" aria-labelledby="settings-card-fields">
          <header class="settings-card-header">
            <div class="settings-card-title">
              <h2 id="settings-card-fields">
                {t("Champs sous le titre des cartes")}
                <span class="settings-count">
                  {fields.length} / {MAX_CARD_FIELDS}
                </span>
              </h2>
              <p class="settings-help">
                {t(
                  "Dans l'ordre de la liste : glissez pour réordonner. Un champ vide n'affiche rien. Le parent (epic ou ticket parent) est toujours affiché et n'occupe pas de place ici.",
                )}
              </p>
            </div>
          </header>

          <ol class="settings-list">
            {fields.map((field, index) => {
              const id = cardFieldId(field);
              const label =
                field.kind === "custom" ? cardFieldLabel(field) : localize(cardFieldLabel(field));
              return (
                <li
                  key={id}
                  class={`settings-item${reorder.dragged === id ? " is-dragging" : ""}`}
                  data-reorder-row
                  data-drop={reorder.marker(id)}
                  onDragOver={reorder.over(id)}
                  onDrop={reorder.drop}
                >
                  <Grip
                    label={t("Déplacer {v0}", { v0: label })}
                    onMove={(offset) => shift(id, offset)}
                    onDragStart={reorder.start(id)}
                    onDragEnd={reorder.end}
                  />
                  <span class="settings-rank">{index + 1}</span>
                  <span class="settings-item-text">
                    <strong>{label}</strong>
                    {field.kind === "custom" && (
                      <span class="settings-item-meta">{field.customFieldId}</span>
                    )}
                  </span>
                  <span
                    class={`settings-badge${field.kind === "custom" ? " settings-badge-custom" : ""}`}
                  >
                    {field.kind === "custom" ? t("Personnalisé") : t("Standard")}
                  </span>
                  <button
                    type="button"
                    class="icon-button settings-icon-button"
                    aria-label={t("Retirer {v0}", { v0: label })}
                    title={t("Retirer ce champ des cartes")}
                    onClick={() => setFields(fields.filter((_, at) => at !== index))}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </li>
              );
            })}
            {/* Emplacements libres jusqu'au maximum : sans identité, repérés par leur rang. */}
            {Array.from({ length: MAX_CARD_FIELDS - fields.length }, (_, slot) => (
              <li key={`slot-${slot}`} class="settings-slot">
                {fields.length === 0 && slot === 0
                  ? t("Aucun champ : les cartes restent telles quelles. Ajoutez-en ci-dessous.")
                  : t("Emplacement libre")}
              </li>
            ))}
          </ol>

          <div class="settings-subsection">
            <h3>{t("Ajouter un champ")}</h3>
            {full && (
              <p class="settings-help">
                {t("Maximum atteint : retirez un champ pour en ajouter un autre.")}
              </p>
            )}
            <span class="settings-caption">{t("Champs standard")}</span>
            <div class="settings-chips">
              {STANDARD_FIELDS.map((field) => {
                const added = chosen.has(cardFieldId(field));
                return (
                  <button
                    key={cardFieldId(field)}
                    type="button"
                    class={`settings-choice-chip${added ? " is-added" : ""}`}
                    disabled={full || added}
                    onClick={() => setFields(withCardField(fields, field))}
                  >
                    <Icon name={added ? "check" : "plus"} size={13} />
                    {localize(cardFieldLabel(field))}
                  </button>
                );
              })}
            </div>
            <label class="settings-caption" for="settings-field-search">
              {t("Champ personnalisé")}
            </label>
            <span class="settings-search">
              <Icon name="search" size={15} />
              <input
                id="settings-field-search"
                type="search"
                value={search}
                placeholder={t("Rechercher un champ par son nom ou son identifiant")}
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
            </span>
            <p class="settings-help">
              {t(
                "Texte, nombre, liste de choix, date ou utilisateur. Un champ plus complexe (texte riche, objet) n'affiche rien.",
              )}
            </p>
            {board.customFieldsLoading.value && (
              <p class="settings-help">{t("Lecture des champs de Jira…")}</p>
            )}
            {board.customFieldsError.value && (
              <p class="notice notice-error" role="alert">
                {t("Champs de Jira illisibles :")} {localize(board.customFieldsError.value.text)}
              </p>
            )}
            {search.trim() !== "" && board.customFields.value !== null && (
              <>
                {matches.length === 0 ? (
                  <p class="settings-help">{t("Aucun champ personnalisé ne correspond.")}</p>
                ) : (
                  <ul class="settings-results">
                    {matches.slice(0, MAX_RESULTS).map((choice) => {
                      const field: CardField = {
                        kind: "custom",
                        customFieldId: choice.id,
                        customFieldName: choice.name,
                      };
                      const added = chosen.has(cardFieldId(field));
                      return (
                        <li key={choice.id} class="settings-result">
                          <span class="settings-item-text">
                            <strong>{choice.name}</strong>
                            <span class="settings-item-meta">{choice.id}</span>
                          </span>
                          <button
                            type="button"
                            class={`settings-button${added ? " is-added" : ""}`}
                            disabled={full || added}
                            onClick={() => {
                              setFields(withCardField(fields, field));
                              setSearch("");
                            }}
                          >
                            {added ? t("Ajouté") : t("Ajouter")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {matches.length > MAX_RESULTS && (
                  <p class="settings-help">
                    {matches.length - MAX_RESULTS} {t("autres résultats : précisez la recherche.")}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <aside
          class="settings-card settings-preview-card"
          aria-labelledby="settings-fields-preview"
        >
          <header class="settings-card-header">
            <div class="settings-card-title">
              <h2 id="settings-fields-preview">{t("Aperçu")}</h2>
              <p class="settings-help">{t("Des tickets du board, avec les champs de la liste.")}</p>
            </div>
          </header>
          {sample.length > 0 ? (
            <CardPreview
              board={board}
              configuration={configuration}
              issues={sample}
              cardFields={fields}
            />
          ) : (
            <p class="settings-empty">
              {t("L'aperçu apparaît quand le board a été lu dans Jira.")}
            </p>
          )}
          {notRead.length > 0 && (
            <p class="settings-help">
              {t("Valeurs lues dans Jira après « Appliquer » :")}{" "}
              {notRead
                .map((field) =>
                  field.kind === "custom" ? cardFieldLabel(field) : localize(cardFieldLabel(field)),
                )
                .join(", ")}
              .
            </p>
          )}
        </aside>
      </div>

      <SaveBar
        changed={changed}
        message={
          changed
            ? t("Modifications non appliquées · le board sera relu dans Jira")
            : t("Aucune modification en cours.")
        }
        busy={applying}
        cancelDisabled={!changed || applying}
        onCancel={() => setFields(stored)}
        confirm={applying ? t("Application…") : t("Appliquer")}
        confirmDisabled={!changed || applying}
        onConfirm={() => void apply()}
      />
    </>
  );
}
