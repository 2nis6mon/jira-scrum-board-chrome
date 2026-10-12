import { normalizeSiteUrl } from "../jira/site";
import { sprintGoalsBoardRoute } from "./boardRoute";

/** Paramètres d'hébergement lus par la page du board quand elle est affichée dans un cadre. */
export interface EmbeddingRequest {
  /** Origine annoncée par la page Jira hôte (`jiraHost`). */
  readonly jiraHost: string | null;
  /** Adresse du board Jira hôte (`jiraBoard`), marquée `sprintGoals=1`. */
  readonly jiraBoard: string | null;
  /** Origines des cadres parents, du plus proche au plus lointain (`location.ancestorOrigins`). */
  readonly ancestors: readonly string[];
}

export interface EmbeddingTarget {
  readonly origin: string;
  readonly permissionPattern: string;
  /** Adresse du board à ouvrir, celle de la page hôte. */
  readonly address: string;
}

/**
 * Décide si la page du board peut s'afficher dans le cadre où elle se trouve. L'extension
 * rend la page accessible à tout `*.atlassian.net` (`web_accessible_resources`,
 * `frame-ancestors`) : n'importe quel site Atlassian pourrait donc l'encadrer et faire glisser des
 * cartes à l'insu de l'utilisateur. Seul cas admis : un cadre posé directement dans la page Jira
 * de premier niveau d'un site, qui annonce ce même site, pour un board de ce même site. Le site
 * doit en plus être autorisé dans Chrome (vérifié par l'appelant).
 */
export function embeddingTarget(request: EmbeddingRequest): EmbeddingTarget | null {
  const { jiraHost, jiraBoard, ancestors } = request;
  if (!jiraHost || !jiraBoard) return null;
  let origin: string;
  let permissionPattern: string;
  try {
    const site = normalizeSiteUrl(jiraHost);
    origin = site.origin;
    permissionPattern = site.permissionPattern;
  } catch {
    return null;
  }
  // L'origine annoncée doit être exactement celle du site, et le seul parent.
  if (jiraHost !== origin || ancestors.length !== 1 || ancestors[0] !== origin) return null;
  const route = sprintGoalsBoardRoute(jiraBoard);
  if (!route || route.site.origin !== origin) return null;
  return { origin, permissionPattern, address: route.address };
}
