import type { LocalStore } from "../platform/types";

/**
 * Position personnelle du bouton « Sprint Goals » sur les boards d'un site. Lue et écrite par
 * `integration/bootstrap.ts`, script de contenu sans import : doublon nommé de ce préfixe (AD-4),
 * comparé par tests/app/siteData.test.ts. Ce module en porte l'effacement.
 */
const BUTTON_POSITION_PREFIX = "jira-button-position.v1:";
export const BUTTON_POSITION_KEYS = [`${BUTTON_POSITION_PREFIX}<origine Jira>`] as const;

export function buttonPositionKey(origin: string): string {
  return `${BUTTON_POSITION_PREFIX}${origin}`;
}

export function forgetButtonPosition(store: LocalStore, origin: string): Promise<void> {
  return store.remove(buttonPositionKey(origin));
}
