import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { JqlService, JqlSuggestion, JqlValidation } from "../../services/JqlService";
import "../../styles/jql.css";

export interface JqlEditorProps {
  service: Pick<JqlService, "validate" | "suggest">;
  value: string;
  label: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  onInput(value: string): void;
  onValidation?(result: JqlValidation): void;
  onPreview?(): void | Promise<void>;
}

/** Éditeur commun : le texte validé est identifié, les réponses dépassées sont abandonnées. */
export function JqlEditor(props: JqlEditorProps) {
  const generated = useId();
  const id = props.id ?? `jql-${generated}`;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const current = useRef(props);
  current.current = props;
  const generation = useRef(0);
  const mounted = useRef(true);
  const [result, setResult] = useState<JqlValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(props.value.length);
  const [suggestions, setSuggestions] = useState<readonly JqlSuggestion[]>([]);
  const [selected, setSelected] = useState(0);
  const [suggestionError, setSuggestionError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const validResult = result?.text === props.value ? result : null;
  const open = focused && !dismissed && suggestions.length > 0 && !props.disabled;

  const verify = async (preview = false) => {
    const text = current.current.value;
    const request = ++generation.current;
    setChecking(true);
    const validation = await current.current.service.validate(text);
    if (!mounted.current || generation.current !== request || current.current.value !== text)
      return;
    setResult(validation);
    setChecking(false);
    current.current.onValidation?.(validation);
    if (preview && validation.status === "valid") await current.current.onPreview?.();
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);
  useEffect(() => {
    generation.current += 1;
    setChecking(false);
    const timer = setTimeout(() => {
      if (!props.disabled) void verify();
    }, 500);
    return () => clearTimeout(timer);
  }, [props.value, props.disabled, props.service]);

  useEffect(() => {
    let stale = false;
    setSuggestions([]);
    if (!focused || props.disabled || dismissed) return;
    const timer = setTimeout(async () => {
      try {
        const values = await props.service.suggest(props.value, caret);
        if (stale || current.current.value !== props.value) return;
        setSuggestions(values);
        setSelected(0);
        setSuggestionError(false);
      } catch {
        if (!stale) setSuggestionError(true);
      }
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [props.value, caret, focused, props.disabled, props.service, dismissed]);

  const insert = (suggestion: JqlSuggestion) => {
    const value =
      props.value.slice(0, suggestion.from) + suggestion.value + props.value.slice(suggestion.to);
    const position = suggestion.from + suggestion.value.length;
    props.onInput(value);
    setSuggestions([]);
    setCaret(position);
    setDismissed(true);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(position, position);
    });
  };

  return (
    <div class="jql-editor">
      <div class="jql-editor-input-wrap">
        <textarea
          ref={textarea}
          id={id}
          class="settings-rule-body color-rule-jql jql-editor-input"
          rows={2}
          value={props.value}
          aria-label={props.label}
          aria-describedby={`${id}-status`}
          aria-invalid={validResult?.status === "invalid"}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-suggestions` : undefined}
          aria-activedescendant={open ? `${id}-suggestion-${selected}` : undefined}
          spellcheck={false}
          autoComplete="off"
          placeholder={props.placeholder ?? 'JQL — ex. labels = "run"'}
          disabled={props.disabled}
          onFocus={(event) => {
            setFocused(true);
            setCaret(event.currentTarget.selectionStart);
          }}
          onBlur={() => setFocused(false)}
          onClick={(event) => {
            setCaret(event.currentTarget.selectionStart);
            setDismissed(false);
          }}
          onInput={(event) => {
            setCaret(event.currentTarget.selectionStart);
            setDismissed(false);
            props.onInput(event.currentTarget.value);
          }}
          onKeyUp={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              setCaret(event.currentTarget.selectionStart);
              setDismissed(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.code === "Space") {
              event.preventDefault();
              setDismissed(false);
              setCaret(event.currentTarget.selectionStart);
              return;
            }
            if (event.key === "Escape") {
              setDismissed(true);
              return;
            }
            if (!open) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setSelected(
                (index) =>
                  (index + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) %
                  suggestions.length,
              );
            } else if (event.key === "Enter" && !event.shiftKey) {
              const suggestion = suggestions[selected];
              if (suggestion) {
                event.preventDefault();
                insert(suggestion);
              }
            }
          }}
        />
        {open && (
          <div
            class="jql-suggestions"
            id={`${id}-suggestions`}
            role="listbox"
            aria-label="Suggestions JQL"
          >
            {suggestions.map((suggestion, index) => (
              <div key={`${suggestion.kind}:${suggestion.value}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${id}-suggestion-${index}`}
                  aria-selected={index === selected}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => insert(suggestion)}
                >
                  <span>{suggestion.label}</span>
                  <small>{kindLabel(suggestion.kind)}</small>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div class="jql-editor-footer">
        <div
          id={`${id}-status`}
          class={`jql-validation jql-validation-${validResult?.status ?? "pending"}`}
          role="status"
          aria-live="polite"
        >
          {checking
            ? "Vérification auprès de Jira…"
            : validResult?.status === "valid"
              ? "JQL valide"
              : validResult?.status === "invalid"
                ? validResult.errors.join(" ")
                : validResult?.status === "unavailable"
                  ? `Non vérifié : ${validResult.errors.join(" ")}`
                  : "À vérifier auprès de Jira."}
          {validResult?.warnings.map((warning) => (
            <p key={warning} class="jql-warning">
              {warning}
            </p>
          ))}
          {suggestionError && focused && (
            <p class="jql-warning">Suggestions indisponibles ; la validation reste accessible.</p>
          )}
        </div>
        <button
          type="button"
          class="settings-button jql-verify"
          disabled={props.disabled || checking}
          onClick={() => void verify(true)}
        >
          {props.onPreview ? "Vérifier et prévisualiser" : "Vérifier"}
        </button>
      </div>
    </div>
  );
}

function kindLabel(kind: JqlSuggestion["kind"]): string {
  return {
    field: "Champ",
    operator: "Opérateur",
    value: "Valeur",
    function: "Fonction",
    keyword: "Mot-clé",
  }[kind];
}
