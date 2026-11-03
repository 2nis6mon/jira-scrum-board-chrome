// Relecture bornée après une écriture (stories 8.26 et 8.29) : sur un vrai Jira, les routes des
// tickets du board montrent une E9, une E2 ou une E10 avec ~1 s de retard, variable d'un ticket à
// l'autre (constat 8.10). Seules des lectures sont répétées ; une écriture n'est jamais rejouée.

/** Attente entre deux relectures, injectée : `core` n'a pas de minuterie. */
export type ReadBackWait = (ms: number) => Promise<void>;

/** Délais entre les relectures : cinq lectures au plus, ~5,5 s d'attente en tout. */
export const READ_BACK_DELAYS_MS: readonly number[] = [500, 1000, 1500, 2500];

/** Sans attente injectée, les relectures s'enchaînent sans délai. */
const NO_WAIT: ReadBackWait = () => Promise.resolve();

/**
 * Relit Jira jusqu'à voir le changement (`seen`), au plus une fois après chaque délai de
 * `READ_BACK_DELAYS_MS` ; rend la dernière lecture, vue ou non. Une lecture en échec arrête tout.
 */
export async function readBack<T>(
  read: () => Promise<T>,
  seen: (value: T) => boolean,
  wait: ReadBackWait = NO_WAIT,
): Promise<T> {
  let value = await read();
  for (const delay of READ_BACK_DELAYS_MS) {
    if (seen(value)) return value;
    await wait(delay);
    value = await read();
  }
  return value;
}
