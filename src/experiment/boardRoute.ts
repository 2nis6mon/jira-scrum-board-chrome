import { parseBoardUrl } from "../jira/site";

/** URL Jira d'un board activé explicitement par le marqueur de la vue Sprint Goals. */
export function sprintGoalsBoardRoute(address: string) {
  try {
    const url = new URL(address);
    if (
      url.username ||
      url.password ||
      url.searchParams.get("sprintGoals") !== "1" ||
      !/^\/jira\/.*\/boards\/\d+(?:\/|$)/.test(url.pathname)
    )
      return null;
    const board = parseBoardUrl(address);
    return board ? { ...board, address: url.href } : null;
  } catch {
    return null;
  }
}
