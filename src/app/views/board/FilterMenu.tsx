import { useId, useRef, useState } from "preact/hooks";
import type { FilterOption } from "../../../core/boardLayout";
import { searchNeedle } from "../../../core/filters";
import { foldText } from "../../../core/text";
import { t } from "../../i18n";
import { plural } from "../format";
import { Icon, type IconName } from "../Icon";

interface Extra {
  readonly label: string;
  readonly count: number;
  readonly checked: boolean;
  readonly onToggle: () => void;
}

/**
 * Menu de filtre à choix multiples. Les valeurs proposées sont celles présentes dans le sprint.
 * `searchable` ajoute en tête un champ qui réduit la liste affichée (règle de la recherche du board) ;
 * la sélection n'en dépend pas : une valeur cochée que le texte ne trouve pas reste cochée.
 */
export function FilterMenu(props: {
  label: string;
  icon: IconName;
  options: readonly FilterOption[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
  extra?: Extra;
  searchable?: boolean;
}) {
  // Texte tapé : état local du menu ouvert, vidé à chaque fermeture.
  const [query, setQuery] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const activeCount = props.selected.size + (props.extra?.checked ? 1 : 0);
  const needle = props.searchable ? searchNeedle(query) : "";
  const shown =
    needle === ""
      ? props.options
      : props.options.filter((option) => foldText(option.label).includes(needle));
  const hasExtra = props.extra !== undefined && props.extra.count > 0;
  return (
    <details
      ref={details}
      class="filter-menu"
      name="filter-menu"
      onToggle={(event) => {
        if (!props.searchable) return;
        // Le `<details>` reste monté une fois fermé : le texte est vidé ici, la sélection reste.
        if (event.currentTarget.open) search.current?.focus();
        else setQuery("");
      }}
    >
      <summary class={activeCount > 0 ? "active" : undefined}>
        <Icon name={props.icon} />
        {props.label}
        {activeCount > 0 && <span class="filter-badge">{activeCount}</span>}
      </summary>
      <fieldset class="filter-menu-panel">
        <legend class="visually-hidden">{props.label}</legend>
        {props.searchable && (
          <>
            <input
              ref={search}
              type="search"
              class="filter-menu-search"
              aria-label={t("Rechercher dans le menu {name}", { name: props.label })}
              aria-describedby={statusId}
              placeholder={t("Clé ou résumé…")}
              autocomplete="off"
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                // Échap efface d'abord le texte, puis ferme le menu ; les écoutes globales l'ignorent.
                event.preventDefault();
                event.stopPropagation();
                if (event.currentTarget.value !== "") {
                  setQuery("");
                  return;
                }
                const menu = details.current;
                if (!menu) return;
                menu.open = false;
                menu.querySelector("summary")?.focus();
              }}
            />
            <p id={statusId} class="visually-hidden" role="status">
              {plural(shown.length, "résultat")}
            </p>
          </>
        )}
        {props.extra && hasExtra && (
          <label class="filter-option filter-option-extra">
            <input type="checkbox" checked={props.extra.checked} onChange={props.extra.onToggle} />
            <span class="filter-option-label">{props.extra.label}</span>
            <span class="filter-option-count">{props.extra.count}</span>
          </label>
        )}
        {shown.map((option) => (
          <label key={option.value} class="filter-option">
            <input
              type="checkbox"
              checked={props.selected.has(option.value)}
              onChange={() => props.onToggle(option.value)}
            />
            <span class="filter-option-label">{option.label}</span>
            <span class="filter-option-count">{option.count}</span>
          </label>
        ))}
        {props.options.length === 0 && !hasExtra && (
          <p class="filter-empty">{t("Aucune valeur dans les tickets affichés.")}</p>
        )}
        {props.options.length > 0 && shown.length === 0 && (
          <p class="filter-empty">{t("Aucun résultat")}</p>
        )}
      </fieldset>
    </details>
  );
}
