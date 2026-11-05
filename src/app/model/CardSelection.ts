import { type ReadonlySignal, signal } from "@preact/signals";

/**
 * Cartes sélectionnées au Ctrl/Cmd+clic et au Maj+clic sur le Sprint Board (story 8.30), avec les
 * mêmes gestes que le Sprint Planning (story 8.15). Aucune action groupée sur le board pour l'instant :
 * la sélection se voit, se compte et se vide.
 */
export class CardSelection {
  readonly #keys = signal<ReadonlySet<string>>(new Set());
  /** Dernière carte choisie au Ctrl/Cmd+clic : départ de la plage du Maj+clic. */
  #anchor: string | null = null;

  get keys(): ReadonlySignal<ReadonlySet<string>> {
    return this.#keys;
  }

  /** Ctrl/Cmd+clic : ajoute la carte à la sélection, ou l'en retire. */
  toggle(key: string): void {
    const next = new Set(this.#keys.value);
    if (!next.delete(key)) next.add(key);
    this.#keys.value = next;
    this.#anchor = key;
  }

  /**
   * Maj+clic : ajoute la plage entre la dernière carte choisie et celle-ci, dans la même liste
   * (`rangeKeys`, dans l'ordre affiché : une colonne d'une swimlane) ; sans départ dans cette liste,
   * agit comme Ctrl/Cmd+clic.
   */
  extend(key: string, rangeKeys: readonly string[]): void {
    const from = this.#anchor === null ? -1 : rangeKeys.indexOf(this.#anchor);
    const to = rangeKeys.indexOf(key);
    if (from < 0 || to < 0) {
      this.toggle(key);
      return;
    }
    const [start, end] = from <= to ? [from, to] : [to, from];
    const next = new Set(this.#keys.value);
    for (const candidate of rangeKeys.slice(start, end + 1)) next.add(candidate);
    this.#keys.value = next;
  }

  /** Échap, « Vider la sélection » ou changement de board. */
  clear(): void {
    this.#anchor = null;
    if (this.#keys.value.size > 0) this.#keys.value = new Set();
  }
}
