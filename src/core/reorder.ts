import { moveBlock } from "./boardBlocks";

// Réordonnancement d'une liste d'identifiants dont seule une partie est montrée : swimlanes des
// réglages (sans les objectifs), règles de couleur en Kanban (sans la règle « ajouté en cours de
// sprint »). Les éléments non montrés gardent leur rang relatif.

/**
 * Ordre obtenu en plaçant `id` juste avant `before`, un élément montré (`null` : juste après le
 * dernier élément montré). Une place qui ne change rien rend une copie identique.
 */
export function moveAmongShown(
  order: readonly string[],
  id: string,
  before: string | null,
  shown: (id: string) => boolean,
): string[] {
  if (!order.includes(id) || id === before) return [...order];
  let target = before;
  if (target === null) {
    const rest = order.filter((item) => item !== id);
    target = rest[rest.findLastIndex(shown) + 1] ?? null;
  }
  return moveBlock(id, target, order);
}

/**
 * Place visée pour monter (`-1`) ou descendre (`+1`) `id` d'un cran parmi les éléments montrés,
 * au format de `moveAmongShown`. `undefined` : déjà en tête ou en fin, rien à faire.
 */
export function shiftTarget(
  shownOrder: readonly string[],
  id: string,
  offset: -1 | 1,
): string | null | undefined {
  const index = shownOrder.indexOf(id);
  if (index < 0) return undefined;
  if (offset === -1) return index === 0 ? undefined : shownOrder[index - 1];
  return index === shownOrder.length - 1 ? undefined : (shownOrder[index + 2] ?? null);
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
