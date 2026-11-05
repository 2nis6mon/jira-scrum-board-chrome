import { useEffect, useRef } from "preact/hooks";
import { t } from "../i18n";
import { Icon } from "./Icon";

/**
 * Échap vide la sélection, sauf dans un champ, un menu ou une fenêtre ouverts (ils s'en servent).
 * Commun au board et au planning (stories 8.15, 8.30).
 */
export function useEscapeClearsSelection(hasSelection: () => boolean, clear: () => void): void {
  // Un seul écouteur pour la vie de l'écran, avec les fonctions du dernier rendu.
  const latest = useRef({ hasSelection, clear });
  latest.current = { hasSelection, clear };
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!latest.current.hasSelection() || isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"], dialog[open], details[open]')) return;
      latest.current.clear();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);
}

export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Nombre de cartes sélectionnées, commun au board et au planning (stories 8.15, 8.30) ; Échap ou le
 * bouton vident la sélection. `hint` dit ce que l'écran permet d'en faire.
 */
export function SelectionChip({
  count,
  hint,
  className,
  onClear,
}: {
  count: number;
  hint: string;
  /** Classe propre à l'écran, en plus de `selection-chip`. */
  className: string;
  onClear(): void;
}) {
  if (count === 0) return null;
  return (
    <span class={`selection-chip ${className}`} role="status" title={hint}>
      {count === 1 ? t("1 ticket sélectionné") : t("{count} tickets sélectionnés", { count })}
      <button
        type="button"
        class="icon-button"
        aria-label={t("Vider la sélection")}
        title={t("Vider la sélection")}
        onClick={onClear}
      >
        <Icon name="close" />
      </button>
    </span>
  );
}
