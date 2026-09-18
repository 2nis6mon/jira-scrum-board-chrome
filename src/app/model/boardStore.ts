import { type BoardConfiguration, decodeStoredConfiguration } from "../../core/boardConfiguration";
import type { LocalStore } from "../platform/types";

/**
 * Configurations de board enregistrées dans `chrome.storage.local`, par site :
 * `{ [origine du site]: { activeBoardId, boards: { [boardId]: configuration } } }`.
 * Structure prévue pour plusieurs boards ; un seul est utilisé pour l'instant.
 */
const BOARDS_KEY = "boards.v1";

interface SiteBoards {
  activeBoardId: number | null;
  boards: Record<string, unknown>;
}

async function readAll(store: LocalStore): Promise<Record<string, SiteBoards>> {
  const raw = await store.get(BOARDS_KEY);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, SiteBoards> = {};
  for (const [origin, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value as Record<string, unknown>;
    result[origin] = {
      activeBoardId: typeof entry.activeBoardId === "number" ? entry.activeBoardId : null,
      boards:
        typeof entry.boards === "object" && entry.boards !== null
          ? (entry.boards as Record<string, unknown>)
          : {},
    };
  }
  return result;
}

/** Board actif du site, ou `null`. Une configuration illisible ou d'un autre site est ignorée. */
export async function loadActiveBoard(
  store: LocalStore,
  siteOrigin: string,
): Promise<BoardConfiguration | null> {
  const site = (await readAll(store))[siteOrigin];
  if (!site || site.activeBoardId === null) return null;
  const configuration = decodeStoredConfiguration(site.boards[String(site.activeBoardId)]);
  return configuration?.siteOrigin === siteOrigin ? configuration : null;
}

/** Configuration déjà enregistrée pour ce board, pour en garder les réglages locaux. */
export async function loadBoard(
  store: LocalStore,
  siteOrigin: string,
  boardId: number,
): Promise<BoardConfiguration | null> {
  const site = (await readAll(store))[siteOrigin];
  const configuration = decodeStoredConfiguration(site?.boards[String(boardId)]);
  return configuration?.siteOrigin === siteOrigin ? configuration : null;
}

/** Enregistre la configuration et en fait le board actif de son site. */
export async function saveBoard(
  store: LocalStore,
  configuration: BoardConfiguration,
): Promise<void> {
  const all = await readAll(store);
  const site = all[configuration.siteOrigin] ?? { activeBoardId: null, boards: {} };
  site.boards[String(configuration.boardId)] = configuration;
  site.activeBoardId = configuration.boardId;
  all[configuration.siteOrigin] = site;
  await store.set(BOARDS_KEY, all);
}

/** Oublie tous les boards d'un site (à la déconnexion). */
export async function forgetSite(store: LocalStore, siteOrigin: string): Promise<void> {
  const all = await readAll(store);
  if (!(siteOrigin in all)) return;
  delete all[siteOrigin];
  if (Object.keys(all).length === 0) await store.remove(BOARDS_KEY);
  else await store.set(BOARDS_KEY, all);
}
