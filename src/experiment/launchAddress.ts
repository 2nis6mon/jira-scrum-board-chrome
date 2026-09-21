import { isRecord } from "../jira/json";

/** Retrouve l'URL Jira du board actif sans recopier de donnée hors du stockage local Chrome. */
export function configuredBoardAddress(rawConnection: unknown, rawBoards: unknown): string | null {
  if (!isRecord(rawConnection) || typeof rawConnection.origin !== "string") return null;
  if (!isRecord(rawBoards)) return null;
  const site = rawBoards[rawConnection.origin];
  if (!isRecord(site) || typeof site.activeBoardId !== "number" || !isRecord(site.boards))
    return null;
  const board = site.boards[String(site.activeBoardId)];
  if (!isRecord(board) || !Array.isArray(board.projectKeys)) return null;
  const projectKey = board.projectKeys.find(
    (value): value is string => typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value),
  );
  if (!projectKey) return null;
  const url = new URL(
    `/jira/software/c/projects/${encodeURIComponent(projectKey)}/boards/${site.activeBoardId}`,
    rawConnection.origin,
  );
  url.searchParams.set("sprintGoals", "1");
  return url.href;
}
