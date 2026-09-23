import { isRecord } from "../jira/json";

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
  const projectKey = board.projectKeys.find((value) => PROJECT_KEY.test(value));
  if (!projectKey) return null;
  const url = new URL(
    `/jira/software/c/projects/${encodeURIComponent(projectKey)}/boards/${board.boardId}`,
    board.siteOrigin,
  );
  url.searchParams.set("sprintGoals", "1");
  return url.href;
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
