import { useEffect, useRef } from "preact/hooks";
import { choices, fieldKind, hasFieldValue, initialValue } from "../../../jira/transitionFields";
import type { BoardModel } from "../../model/BoardModel";
import { ErrorMessage } from "../Message";

export function TransitionFormDialog({ board }: { board: BoardModel }) {
  const form = board.transitionForm.value;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!form) return;
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [Boolean(form)]);
  if (!form) return null;
  const locked = form.saving || form.blocked;
  const unsupported = Object.entries(form.transition.fields).filter(
    ([id, field]) => fieldKind(id, field) === "unsupported",
  );
  const blocks = unsupported.some(
    ([id, field]) => field.required && !field.hasDefaultValue && !hasFieldValue(form.current[id]),
  );
  return (
    <dialog
      ref={ref}
      class="dialog panel transition-form"
      aria-labelledby="transition-form-title"
      onCancel={(event) => {
        event.preventDefault();
        board.cancelTransitionForm();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void board.submitTransitionForm();
        }}
      >
        <h2 id="transition-form-title">
          {form.transition.name} — {form.drop.issueKey}
        </h2>
        <p class="hint">
          Complétez les champs demandés par Jira. Les champs non modifiés conservent leur valeur
          actuelle ou leur valeur par défaut. Aucun changement ne sera envoyé avant validation.
        </p>
        {Object.entries(form.transition.fields).map(([id, field]) => {
          const kind = fieldKind(id, field);
          const value = form.draft[id] ?? initialValue(id, field, form.current);
          const inputId = `transition-field-${id}`;
          const change = (value: string | string[]) => board.changeTransitionField(id, value);
          const errors = form.fieldErrors[id];
          return (
            <div key={id} class="transition-field">
              <label for={kind === "unsupported" ? undefined : inputId}>
                {kind === "duration" ? "Temps passé à ajouter" : (field.name ?? id)}
                {field.required ? " *" : ""}
              </label>
              {kind === "unsupported" ? (
                <p class="hint">
                  Ce type de champ se renseigne dans Jira.
                  {hasFieldValue(form.current[id]) ? " La valeur actuelle sera conservée." : ""}
                </p>
              ) : kind === "select" || kind === "multiple" ? (
                <select
                  id={inputId}
                  multiple={kind === "multiple"}
                  disabled={locked}
                  value={kind === "select" && typeof value === "string" ? value : undefined}
                  aria-required={field.required}
                  aria-invalid={Boolean(errors)}
                  aria-describedby={errors ? `${inputId}-error` : undefined}
                  onChange={(event) =>
                    change(
                      kind === "multiple"
                        ? [...event.currentTarget.selectedOptions].map((option) => option.value)
                        : event.currentTarget.value,
                    )
                  }
                >
                  {kind === "select" && <option value="">Choisir…</option>}
                  {choices(field).map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      selected={
                        kind === "multiple" && Array.isArray(value)
                          ? value.includes(option.value)
                          : undefined
                      }
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : kind === "textarea" ? (
                <textarea
                  id={inputId}
                  rows={4}
                  disabled={locked}
                  value={typeof value === "string" ? value : ""}
                  aria-required={field.required}
                  aria-invalid={Boolean(errors)}
                  aria-describedby={errors ? `${inputId}-error` : undefined}
                  placeholder={
                    form.current[id] && !value
                      ? "Contenu existant conservé ; saisir ici pour le remplacer."
                      : field.schema?.type === "array"
                        ? "Une valeur par ligne"
                        : ""
                  }
                  onInput={(event) => change(event.currentTarget.value)}
                />
              ) : (
                <input
                  id={inputId}
                  type={kind === "duration" || kind === "number" ? "text" : kind}
                  inputMode={kind === "number" ? "decimal" : undefined}
                  placeholder={kind === "duration" ? "Ex. : 1h 30m" : undefined}
                  disabled={locked}
                  value={typeof value === "string" ? value : ""}
                  aria-required={field.required}
                  aria-invalid={Boolean(errors)}
                  aria-describedby={errors ? `${inputId}-error` : undefined}
                  onInput={(event) => change(event.currentTarget.value)}
                />
              )}
              {kind === "duration" && (
                <p class="hint">
                  Ajoute du temps au journal de travail, daté du moment de la validation. Unités : w
                  (semaine), d (jour), h (heure), m (minute). Les jours et semaines suivent les
                  réglages Jira ; le reste à faire suit son comportement habituel.
                </p>
              )}
              {errors && (
                <p id={`${inputId}-error`} class="transition-field-error" role="alert">
                  {errors}
                </p>
              )}
            </div>
          );
        })}
        {Object.keys(form.transition.fields).length === 0 && (
          <p class="hint">
            Jira n’expose aucun champ pour cet écran. Vous pouvez confirmer la transition ou
            l’ouvrir dans Jira.
          </p>
        )}
        {blocks && (
          <p role="alert">
            Un champ obligatoire nécessite de compléter cette transition dans Jira.
          </p>
        )}
        <ErrorMessage message={form.error} />
        <div class="row">
          <button type="submit" class="primary" disabled={locked || blocks}>
            {form.saving ? "Envoi à Jira…" : "Valider la transition"}
          </button>
          <button type="button" disabled={form.saving} onClick={() => board.cancelTransitionForm()}>
            Annuler
          </button>
          {!form.saving && (
            <a
              href={`${board.site.origin}/browse/${encodeURIComponent(form.drop.issueKey)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir dans Jira
            </a>
          )}
        </div>
      </form>
    </dialog>
  );
}
