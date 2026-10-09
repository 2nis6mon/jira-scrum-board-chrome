import { isRecord } from "../jira/json";
import { normalizeSiteUrl, parseBoardUrl } from "../jira/site";
import { sprintGoalsBoardRoute } from "./boardRoute";

/** Clé de projet utilisable dans une adresse de board Jira. */
const PROJECT_KEY = /^[A-Z][A-Z0-9_]*$/;

/**
 * Adresse Jira d'un board, suivie du marqueur de la vue Sprint Goals. `null` si le board n'a
 * aucune clé de projet utilisable : l'adresse n'est alors pas constructible.
 */
export function boardPageAddress(board: {
  readonly siteOrigin: string;
  readonly boardId: number;
  readonly projectKeys: readonly string[];
}): string | null {
  if (!Number.isSafeInteger(board.boardId) || board.boardId <= 0) return null;
  let origin: string;
  try {
    origin = normalizeSiteUrl(board.siteOrigin).origin;
  } catch {
    return null;
  }
  if (origin !== board.siteOrigin) return null;
  const projectKey = board.projectKeys.find((value) => PROJECT_KEY.test(value));
  if (!projectKey) return null;
  const url = new URL(
    `/jira/software/c/projects/${encodeURIComponent(projectKey)}/boards/${board.boardId}`,
    origin,
  );
  url.searchParams.set("sprintGoals", "1");
  return url.href;
}

/** Adresse saisie dans le lanceur : aucun accès n'est demandé avant cette validation. */
export function launchBoardAddress(raw: string): string | null {
  try {
    const text = raw.trim();
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.username || url.password) return null;
    url.searchParams.set("sprintGoals", "1");
    // Une fiche ticket ouverte sur le board ne doit pas remplacer le board au lancement.
    url.searchParams.delete("selectedIssue");
    const route = sprintGoalsBoardRoute(url.href);
    if (route) return route.address;
    // Les anciennes adresses de boards munies d'une clé de projet restent utilisables.
    if (url.pathname !== "/secure/RapidBoard.jspa") return null;
    const board = parseBoardUrl(url.href);
    return board?.projectKey
      ? boardPageAddress({
          siteOrigin: board.site.origin,
          boardId: board.boardId,
          projectKeys: [board.projectKey],
        })
      : null;
  } catch {
    return null;
  }
}

/** Retrouve l'URL Jira du board actif sans recopier de donnée hors du stockage local Chrome. */
export function configuredBoardAddress(rawConnection: unknown, rawBoards: unknown): string | null {
  if (!isRecord(rawConnection) || typeof rawConnection.origin !== "string") return null;
  if (!isRecord(rawBoards)) return null;
  const site = rawBoards[rawConnection.origin];
  if (!isRecord(site) || typeof site.activeBoardId !== "number" || !isRecord(site.boards))
    return null;
  const board = site.boards[String(site.activeBoardId)];
  if (!isRecord(board) || !Array.isArray(board.projectKeys)) return null;
  return boardPageAddress({
    siteOrigin: rawConnection.origin,
    boardId: site.activeBoardId,
    projectKeys: board.projectKeys.filter((value): value is string => typeof value === "string"),
  });
}
