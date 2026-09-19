import { type BoardConfiguration, decodeStoredConfiguration } from "../../core/boardConfiguration";
import type { LocalStore } from "../platform/types";

/**
 * Configurations de board enregistrées dans `chrome.storage.local`, par site :
 * `{ [origine du site]: { activeBoardId, boards: { [boardId]: configuration } } }`.
 * Plusieurs boards par site ; le board actif est celui qu'on retrouve à l'ouverture.
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

/** Boards enregistrés du site, triés par nom. Une configuration illisible est ignorée. */
export async function listBoards(
  store: LocalStore,
  siteOrigin: string,
): Promise<BoardConfiguration[]> {
  const site = (await readAll(store))[siteOrigin];
  return site ? decodeBoards(site, siteOrigin) : [];
}

function decodeBoards(site: SiteBoards, siteOrigin: string): BoardConfiguration[] {
  return Object.values(site.boards)
    .map(decodeStoredConfiguration)
    .filter((configuration): configuration is BoardConfiguration => {
      return configuration !== null && configuration.siteOrigin === siteOrigin;
    })
    .sort(
      (a, b) =>
        a.boardName.localeCompare(b.boardName, "fr", { sensitivity: "base", numeric: true }) ||
        a.boardId - b.boardId,
    );
}

/**
 * Enregistre la configuration. `activate` en fait aussi le board actif du site : seuls l'ajout
 * d'un board et le changement de board le demandent, jamais un simple réglage (qui, arrivé après
 * un changement de board, ramènerait l'ancien).
 */
export async function saveBoard(
  store: LocalStore,
  configuration: BoardConfiguration,
  options: { activate: boolean } = { activate: true },
): Promise<void> {
  const all = await readAll(store);
  const site = all[configuration.siteOrigin] ?? { activeBoardId: null, boards: {} };
  site.boards[String(configuration.boardId)] = configuration;
  if (options.activate || site.activeBoardId === null) site.activeBoardId = configuration.boardId;
  all[configuration.siteOrigin] = site;
  await store.set(BOARDS_KEY, all);
}

/** Fait d'un board déjà enregistré le board actif du site. Faux s'il n'est pas enregistré. */
export async function activateBoard(
  store: LocalStore,
  siteOrigin: string,
  boardId: number,
): Promise<boolean> {
  const all = await readAll(store);
  const site = all[siteOrigin];
  if (!site || !(String(boardId) in site.boards)) return false;
  site.activeBoardId = boardId;
  await store.set(BOARDS_KEY, all);
  return true;
}

/**
 * Retire un board et ses réglages de ce navigateur (rien n'est supprimé dans Jira). S'il était
 * actif, le premier board restant par ordre de nom le devient ; rend le board actif désormais.
 */
export async function removeBoard(
  store: LocalStore,
  siteOrigin: string,
  boardId: number,
): Promise<number | null> {
  const all = await readAll(store);
  const site = all[siteOrigin];
  if (!site) return null;
  delete site.boards[String(boardId)];
  if (site.activeBoardId === boardId) {
    const [next] = decodeBoards(site, siteOrigin);
    site.activeBoardId = next?.boardId ?? null;
  }
  await store.set(BOARDS_KEY, all);
  return site.activeBoardId;
}

/** Oublie tous les boards d'un site (à la déconnexion). */
export async function forgetSite(store: LocalStore, siteOrigin: string): Promise<void> {
  const all = await readAll(store);
  if (!(siteOrigin in all)) return;
  delete all[siteOrigin];
  if (Object.keys(all).length === 0) await store.remove(BOARDS_KEY);
  else await store.set(BOARDS_KEY, all);
}
