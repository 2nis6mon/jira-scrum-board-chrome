import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Icon } from "../Icon";

// Contrôles communs aux onglets des réglages : champ validé, compteur, interrupteur, choix exclusif,
// choix de couleur, poignée et glisser-déposer d'une liste ordonnée. Aucun n'écrit seul : ils
// rendent la main à l'onglet, qui enregistre (aussitôt ou sur « Appliquer », selon la section).

type InputEvent = { currentTarget: HTMLInputElement };

/**
 * État d'un champ enregistré à la validation (Entrée, ou sortie du champ), pas à chaque frappe.
 * Une saisie refusée reste affichée avec son erreur, sans rien changer ; Échap revient à la valeur
 * enregistrée.
 */
export function useCommitField(value: string, onCommit: (raw: string) => string | null) {
  // Pendant la saisie, et tant qu'elle est refusée, le champ montre le texte tapé ; sinon, la
  // valeur enregistrée (qui peut changer ailleurs : structure relue, autre onglet, collègue).
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setDraft(null);
    setError(null);
  };
  // La valeur est lue dans le champ lui-même : l'état de la frappe peut ne pas être encore rendu.
  const commit = (raw: string) => {
    if (raw === value) {
      reset();
      return;
    }
    const refused = onCommit(raw);
    setError(refused);
    setDraft(refused === null ? null : raw);
  };
  return {
    error,
    reset,
    input: {
      value: draft ?? value,
      "aria-invalid": error !== null ? true : undefined,
      onInput: (event: InputEvent) => setDraft(event.currentTarget.value),
      onChange: (event: InputEvent) => commit(event.currentTarget.value),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Escape") reset();
      },
    },
  };
}

/** Champ texte enregistré à la validation ; voir `useCommitField`. */
export function CommitInput(props: {
  id?: string;
  value: string;
  onCommit: (raw: string) => string | null;
  label?: string;
  placeholder?: string;
  numeric?: boolean;
  class?: string;
}) {
  const field = useCommitField(props.value, props.onCommit);
  return (
    <>
      <input
        type="text"
        id={props.id}
        inputMode={props.numeric ? "numeric" : undefined}
        class={
          [props.class ?? "", field.error ? "settings-invalid" : ""].filter(Boolean).join(" ") ||
          undefined
        }
        aria-label={props.label}
        placeholder={props.placeholder}
        {...field.input}
      />
      {field.error && (
        <span class="settings-error" role="alert">
          {field.error}
        </span>
      )}
    </>
  );
}

/**
 * Nombre entier réglé au clavier ou par − et + : chaque pas est enregistré comme une saisie
 * validée ; les boutons s'arrêtent aux bornes, la saisie hors bornes est refusée avec son message.
 */
export function Stepper(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  help: string;
  onCommit: (raw: string) => string | null;
}) {
  const field = useCommitField(String(props.value), props.onCommit);
  const step = (offset: number) => {
    field.reset();
    props.onCommit(String(props.value + offset));
  };
  return (
    <div class="settings-tile">
      <label class="settings-tile-label" for={props.id}>
        {props.label}
      </label>
      <span class="settings-stepper-row">
        <span class={`settings-stepper${field.error ? " settings-invalid" : ""}`}>
          <button
            type="button"
            class="settings-step"
            aria-label={`Diminuer : ${props.label}`}
            disabled={props.value <= props.min}
            onClick={() => step(-1)}
          >
            −
          </button>
          <input type="text" id={props.id} inputMode="numeric" {...field.input} />
          <button
            type="button"
            class="settings-step"
            aria-label={`Augmenter : ${props.label}`}
            disabled={props.value >= props.max}
            onClick={() => step(1)}
          >
            +
          </button>
        </span>
        <span class="settings-stepper-unit">{props.unit}</span>
      </span>
      {field.error ? (
        <span class="settings-error" role="alert">
          {field.error}
        </span>
      ) : (
        <span class="settings-help">{props.help}</span>
      )}
    </div>
  );
}

/** Interrupteur : une case à cocher native, dessinée en bascule. */
export function Switch(props: {
  checked: boolean;
  /** Nom accessible : ce que fait l'interrupteur. */
  label: string;
  /** Texte visible à côté de la bascule. */
  text?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="settings-switch" title={props.label}>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        aria-checked={props.checked}
        disabled={props.disabled}
        aria-label={props.label}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span class="settings-switch-track" aria-hidden="true" />
      {props.text && <span class="settings-switch-text">{props.text}</span>}
    </label>
  );
}

/** Choix exclusif entre quelques valeurs : des boutons radio natifs, dessinés accolés. */
export function Segmented<T extends string>(props: {
  label: string;
  name: string;
  value: T;
  choices: readonly { readonly id: T; readonly label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <fieldset class="settings-segmented">
      <legend class="visually-hidden">{props.label}</legend>
      {props.choices.map((choice) => (
        <label key={choice.id} class="settings-segment">
          <input
            type="radio"
            name={props.name}
            value={choice.id}
            checked={choice.id === props.value}
            onChange={() => props.onChange(choice.id)}
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export interface ColorChoice {
  readonly id: string;
  readonly name: string;
}

/**
 * Choix d'une couleur dans une palette nommée : un bouton montre la couleur et son nom, la palette
 * s'ouvre dessous ; un choix la referme. `swatch` dessine la pastille d'une couleur.
 */
export function ColorMenu(props: {
  /** Nom accessible du bouton, complété par la couleur choisie : « Couleur de « … » : Bleu ». */
  label: string;
  title: string;
  choices: readonly ColorChoice[];
  selected: string;
  swatch: (id: string) => ComponentChildren;
  onPick: (id: string) => void;
}) {
  const current = props.choices.find((choice) => choice.id === props.selected);
  return (
    <details class="menu settings-color-menu" name="settings-color">
      <summary aria-label={`${props.label} : ${current?.name ?? props.selected}`}>
        {props.swatch(props.selected)}
        <span class="settings-color-name">{current?.name ?? props.selected}</span>
        <Icon name="chevronDown" size={12} />
      </summary>
      <div class="menu-panel settings-color-panel">
        <p class="settings-color-title">{props.title}</p>
        <div class="settings-color-grid">
          {props.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              class="settings-color-choice"
              aria-pressed={choice.id === props.selected}
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                if (choice.id !== props.selected) props.onPick(choice.id);
              }}
            >
              {props.swatch(choice.id)}
              {choice.name}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

/**
 * Poignée d'une ligne déplaçable. Elle porte le glissé (la ligne entière sert d'image) et, au
 * clavier, les flèches haut et bas déplacent la ligne d'un cran.
 */
export function Grip(props: {
  label: string;
  onMove: (offset: -1 | 1) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      class="settings-grip"
      aria-label={props.label}
      title="Glisser pour déplacer, ou flèches haut et bas"
      draggable
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        props.onMove(event.key === "ArrowUp" ? -1 : 1);
      }}
    >
      <span class="settings-grip-dots" aria-hidden="true" />
    </button>
  );
}

/**
 * Glisser-déposer d'une liste ordonnée d'identifiants. `before` est la place visée : devant un
 * élément, `null` à la fin, `undefined` aucune (ou une place qui ne changerait rien). Le type de
 * donnée est propre à la liste : une autre liste, une carte ou une swimlane du board n'y entrent pas.
 *
 * Chaque ligne porte `data-reorder-row`, `onDragOver={over(id)}` et `onDrop={drop}` ; `marker(id)`
 * dit où dessiner le repère de dépôt (sur la ligne elle-même : rien ne bouge pendant le glissé).
 */
export function useReorder(
  type: string,
  order: readonly string[],
  onDrop: (id: string, before: string | null) => void,
) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [before, setBefore] = useState<string | null | undefined>(undefined);
  const unchanged = (id: string, target: string | null) => {
    const index = order.indexOf(id);
    return target === id || target === (order[index + 1] ?? null);
  };
  const end = () => {
    setDragged(null);
    setBefore(undefined);
  };
  const target = dragged === null ? undefined : before;
  return {
    dragged,
    before: target,
    end,
    start: (id: string) => (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(type, id);
      event.dataTransfer.effectAllowed = "move";
      const row = (event.currentTarget as HTMLElement | null)?.closest("[data-reorder-row]");
      if (row instanceof HTMLElement) event.dataTransfer.setDragImage?.(row, 16, 16);
      setDragged(id);
    },
    /** Survol d'une ligne : sa moitié haute vise sa place, sa moitié basse celle de la suivante. */
    over: (id: string) => (event: DragEvent) => {
      if (dragged === null || !event.dataTransfer?.types.includes(type)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      let next: string | null = id;
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      if (event.clientY >= box.top + box.height / 2) next = order[order.indexOf(id) + 1] ?? null;
      const shown = unchanged(dragged, next) ? undefined : next;
      if (shown !== before) setBefore(shown);
    },
    drop: (event: DragEvent) => {
      if (dragged === null || !event.dataTransfer?.types.includes(type)) return;
      event.preventDefault();
      const id = event.dataTransfer.getData(type);
      if (id === dragged && before !== undefined) onDrop(dragged, before);
      end();
    },
    /** Repère de la ligne : la ligne glissée irait juste avant elle, ou après la dernière. */
    marker: (id: string): "before" | "after" | undefined => {
      if (target === undefined) return undefined;
      if (target === id) return "before";
      return target === null && order.at(-1) === id ? "after" : undefined;
    },
  };
}

/**
 * Barre d'enregistrement des brouillons, collée en bas de l'écran pendant le défilement : ce qui
 * reste à enregistrer, Annuler et la confirmation (« Appliquer », « Enregistrer dans Jira »).
 */
export function SaveBar(props: {
  changed: boolean;
  message: string;
  busy?: boolean;
  cancelDisabled: boolean;
  onCancel: () => void;
  confirm: string;
  confirmDisabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <div class={`settings-savebar${props.changed ? " is-changed" : ""}`} aria-busy={props.busy}>
      <span class="settings-savebar-dot" aria-hidden="true" />
      <span class="settings-savebar-text" aria-live="polite">
        {props.message}
      </span>
      <button
        type="button"
        class="settings-savebar-button"
        disabled={props.cancelDisabled}
        onClick={props.onCancel}
      >
        Annuler
      </button>
      <button
        type="button"
        class="primary settings-savebar-button"
        disabled={props.confirmDisabled}
        onClick={props.onConfirm}
      >
        {props.confirm}
      </button>
    </div>
  );
}
