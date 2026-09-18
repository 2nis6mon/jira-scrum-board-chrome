import { useEffect, useState } from "preact/hooks";
import { type BoardConfiguration, displayedCardFields } from "../../../core/boardConfiguration";
import {
  sameCardFields,
  searchFields,
  shiftCardField,
  withCardField,
} from "../../../core/boardSettings";
import {
  type CardField,
  cardFieldId,
  cardFieldLabel,
  MAX_CARD_FIELDS,
} from "../../../core/cardFields";
import type { BoardModel } from "../../model/BoardModel";

const STANDARD_FIELDS: readonly CardField[] = [
  { kind: "fixVersions" },
  { kind: "affectsVersions" },
  { kind: "labels" },
  { kind: "components" },
];
const MAX_RESULTS = 12;

/** Champs affichés sous le titre des cartes : jusqu'à `MAX_CARD_FIELDS`, dans l'ordre choisi. */
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
  const chosen = new Set(fields.map(cardFieldId));
  const matches = searchFields(search, board.customFields.value ?? []);

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

  return (
    <div class="settings-section">
      <section class="panel" aria-labelledby="settings-card-fields">
        <h2 id="settings-card-fields">
          Champs affichés sur les cartes{" "}
          <span class="settings-count">
            {fields.length}/{MAX_CARD_FIELDS}
          </span>
        </h2>
        <p class="hint">
          Jusqu'à {MAX_CARD_FIELDS} champs Jira sous le titre des cartes, dans l'ordre de la liste.
          Un champ vide n'affiche rien. Le parent (epic ou ticket parent) est toujours affiché et
          n'occupe pas de place ici.
        </p>
        {fields.length === 0 ? (
          <p class="hint">Aucun champ : les cartes restent telles quelles.</p>
        ) : (
          <ol class="settings-card-fields">
            {fields.map((field, index) => (
              <li key={cardFieldId(field)} class="settings-row">
                <span class="settings-goal-title">
                  {cardFieldLabel(field)}
                  {field.kind === "custom" && <span class="pin-meta"> {field.customFieldId}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Monter ${cardFieldLabel(field)}`}
                  disabled={index === 0}
                  onClick={() => setFields(shiftCardField(fields, index, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Descendre ${cardFieldLabel(field)}`}
                  disabled={index === fields.length - 1}
                  onClick={() => setFields(shiftCardField(fields, index, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Retirer ${cardFieldLabel(field)}`}
                  onClick={() => setFields(fields.filter((_, at) => at !== index))}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section class="panel" aria-labelledby="settings-card-choices">
        <h2 id="settings-card-choices">Champs disponibles</h2>
        {full && <p class="hint">Maximum atteint : retirez un champ pour en ajouter un autre.</p>}
        <div class="row settings-wrap">
          {STANDARD_FIELDS.map((field) => (
            <button
              key={cardFieldId(field)}
              type="button"
              disabled={full || chosen.has(cardFieldId(field))}
              onClick={() => setFields(withCardField(fields, field))}
            >
              {cardFieldLabel(field)}
            </button>
          ))}
        </div>
        <label class="settings-field">
          <span>Champ personnalisé</span>
          <input
            type="search"
            value={search}
            placeholder="Rechercher un champ par son nom ou son identifiant"
            onInput={(event) => setSearch(event.currentTarget.value)}
          />
          <span class="hint">
            Texte, nombre, liste de choix, date ou utilisateur. Un champ plus complexe (texte riche,
            objet) n'affiche rien.
          </span>
        </label>
        {board.customFieldsLoading.value && <p class="hint">Lecture des champs de Jira…</p>}
        {board.customFieldsError.value && (
          <p class="notice notice-error" role="alert">
            Champs de Jira illisibles : {board.customFieldsError.value.text}
          </p>
        )}
        {search.trim() !== "" && board.customFields.value !== null && (
          <>
            {matches.length === 0 ? (
              <p class="hint">Aucun champ personnalisé ne correspond.</p>
            ) : (
              <ul class="settings-field-results">
                {matches.slice(0, MAX_RESULTS).map((choice) => {
                  const field: CardField = {
                    kind: "custom",
                    customFieldId: choice.id,
                    customFieldName: choice.name,
                  };
                  return (
                    <li key={choice.id} class="settings-row">
                      <span class="settings-goal-title">
                        {choice.name} <span class="pin-meta">{choice.id}</span>
                      </span>
                      <button
                        type="button"
                        disabled={full || chosen.has(cardFieldId(field))}
                        onClick={() => {
                          setFields(withCardField(fields, field));
                          setSearch("");
                        }}
                      >
                        Ajouter
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {matches.length > MAX_RESULTS && (
              <p class="hint">
                {matches.length - MAX_RESULTS} autres résultats : précisez la recherche.
              </p>
            )}
          </>
        )}
      </section>

      <div class="settings-actions">
        <span class="hint">
          {changed ? "Modifications non appliquées." : "Aucune modification en cours."}
        </span>
        <button type="button" disabled={!changed || applying} onClick={() => setFields(stored)}>
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
