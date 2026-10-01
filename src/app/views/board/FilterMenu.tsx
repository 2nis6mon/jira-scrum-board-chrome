import type { FilterOption } from "../../../core/boardLayout";
import { Icon, type IconName } from "../Icon";

interface Extra {
  readonly label: string;
  readonly count: number;
  readonly checked: boolean;
  readonly onToggle: () => void;
}

/** Menu de filtre à choix multiples. Les valeurs proposées sont celles présentes dans le sprint. */
export function FilterMenu(props: {
  label: string;
  icon: IconName;
  options: readonly FilterOption[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
  extra?: Extra;
}) {
  const activeCount = props.selected.size + (props.extra?.checked ? 1 : 0);
  return (
    <details class="filter-menu" name="filter-menu">
      <summary class={activeCount > 0 ? "active" : undefined}>
        <Icon name={props.icon} />
        {props.label}
        {activeCount > 0 && <span class="filter-badge">{activeCount}</span>}
      </summary>
      <fieldset class="filter-menu-panel">
        <legend class="visually-hidden">{props.label}</legend>
        {props.extra && props.extra.count > 0 && (
          <label class="filter-option filter-option-extra">
            <input type="checkbox" checked={props.extra.checked} onChange={props.extra.onToggle} />
            <span class="filter-option-label">{props.extra.label}</span>
            <span class="filter-option-count">{props.extra.count}</span>
          </label>
        )}
        {props.options.map((option) => (
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
        {props.options.length === 0 && !(props.extra && props.extra.count > 0) && (
          <p class="filter-empty">Aucune valeur dans les tickets affichés.</p>
        )}
      </fieldset>
    </details>
  );
}
