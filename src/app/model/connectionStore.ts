import { isRecord } from "../../jira/json";
import { parseBoardUrl } from "../../jira/site";
import type { LocalStore } from "../platform/types";

/**
 * Propriétaire (AD-4) des deux clés de connexion de `chrome.storage.local` :
 * - `connection.v1` : `{ origin }`, le site Jira connecté ;
 * - `launcher.v1` : la dernière adresse de board ouverte depuis le lanceur, en texte.
 * Formats repris tels quels des versions précédentes.
 */
const CONNECTION_KEY = "connection.v1";
const LAUNCHER_KEY = "launcher.v1";

export const CONNECTION_STORE_KEYS = [CONNECTION_KEY, LAUNCHER_KEY] as const;

/** Origine du site enregistré, ou `null` si aucune n'est lisible. */
export async function loadConnectedOrigin(store: LocalStore): Promise<string | null> {
  const saved = await store.get(CONNECTION_KEY);
  return isRecord(saved) && typeof saved.origin === "string" ? saved.origin : null;
}

export function saveConnection(store: LocalStore, origin: string): Promise<void> {
  return store.set(CONNECTION_KEY, { origin });
}

/** Dernière adresse de board du lanceur, telle qu'enregistrée, ou `null`. */
export async function loadLastLaunchAddress(store: LocalStore): Promise<string | null> {
  const saved = await store.get(LAUNCHER_KEY);
  return typeof saved === "string" ? saved : null;
}

export function saveLastLaunchAddress(store: LocalStore, address: string): Promise<void> {
  return store.set(LAUNCHER_KEY, address);
}

/** Origine d'une adresse enregistrée, ou `null` si elle n'en a pas de lisible. */
function addressOrigin(address: string): string | null {
  const board = parseBoardUrl(address);
  if (board) return board.site.origin;
  try {
    return new URL(address).origin;
  } catch {
    return null;
  }
}

/**
 * Déconnexion : oublie le site connecté s'il désigne ce site ou s'il est illisible, et la dernière
 * adresse du lanceur si elle désigne ce site. Ceux d'un autre site (enregistrés depuis un autre
 * onglet) restent.
 */
export async function forgetConnection(store: LocalStore, origin: string): Promise<void> {
  const errors: unknown[] = [];
  try {
    const connected = await loadConnectedOrigin(store);
    if (connected === null || connected === origin) await store.remove(CONNECTION_KEY);
  } catch (error) {
    errors.push(error);
  }
  try {
    const address = await loadLastLaunchAddress(store);
    if (address !== null && addressOrigin(address) === origin) await store.remove(LAUNCHER_KEY);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) throw errors[0];
}
