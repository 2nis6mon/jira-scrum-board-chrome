import type { LocalStore } from "../platform/types";

/**
 * Bandeaux d'information fermés par l'utilisateur, par site et par board, dans
 * `chrome.storage.local` : `{ [origine du site]: { [boardId]: NoticeId[] } }`.
 * Une fois fermé, un bandeau ne revient plus sur ce board, même après rechargement. Préférence
 * personnelle : jamais dans les réglages d'équipe, jamais écrite dans Jira.
 */
const NOTICES_KEY = "dismissedNotices.v1";

/**
 * Seuls les bandeaux qui EXPLIQUENT un état stable se ferment pour de bon. Une erreur, un échec de
 * lecture ou une décision à prendre ne sont jamais ici : les masquer définitivement cacherait le
 * prochain incident.
 */
export const DISMISSABLE_NOTICES = ["no-goals", "unmapped-statuses", "goals-read-only"] as const;
export type NoticeId = (typeof DISMISSABLE_NOTICES)[number];

const isNoticeId = (value: unknown): value is NoticeId =>
  typeof value === "string" && (DISMISSABLE_NOTICES as readonly string[]).includes(value);

type Dismissed = Record<string, Record<string, NoticeId[]>>;

async function readAll(store: LocalStore): Promise<Dismissed> {
  const raw = await store.get(NOTICES_KEY);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Dismissed = {};
  for (const [origin, boards] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof boards !== "object" || boards === null || Array.isArray(boards)) continue;
    const kept: Record<string, NoticeId[]> = {};
    for (const [boardId, ids] of Object.entries(boards as Record<string, unknown>)) {
      // Identifiant inconnu (version future, valeur abîmée) : ignoré, jamais une erreur.
      if (Array.isArray(ids)) kept[boardId] = ids.filter(isNoticeId);
    }
    result[origin] = kept;
  }
  return result;
}

/** Bandeaux fermés pour ce board. Stockage illisible : aucun, tous restent affichés. */
export async function loadDismissedNotices(
  store: LocalStore,
  siteOrigin: string,
  boardId: number,
): Promise<ReadonlySet<NoticeId>> {
  const all = await readAll(store);
  return new Set(all[siteOrigin]?.[String(boardId)] ?? []);
}

/** Retient qu'un bandeau est fermé sur ce board. */
export async function saveDismissedNotice(
  store: LocalStore,
  siteOrigin: string,
  boardId: number,
  id: NoticeId,
): Promise<void> {
  const all = await readAll(store);
  const boards = all[siteOrigin] ?? {};
  all[siteOrigin] = boards;
  const ids = new Set(boards[String(boardId)] ?? []);
  ids.add(id);
  boards[String(boardId)] = [...ids];
  await store.set(NOTICES_KEY, all);
}

/** Oublie les bandeaux fermés d'un board retiré, ou de tout le site à la déconnexion. */
export async function forgetDismissedNotices(
  store: LocalStore,
  siteOrigin: string,
  boardId?: number,
): Promise<void> {
  const all = await readAll(store);
  if (!(siteOrigin in all)) return;
  if (boardId === undefined) delete all[siteOrigin];
  else delete all[siteOrigin]?.[String(boardId)];
  if (Object.keys(all).length === 0) await store.remove(NOTICES_KEY);
  else await store.set(NOTICES_KEY, all);
}
