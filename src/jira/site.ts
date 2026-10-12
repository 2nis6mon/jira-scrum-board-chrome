import { JiraError } from "./errors";

/** Site Jira Cloud auquel l'extension est autorisée à parler. */
export interface JiraSite {
  /** `https://societe.atlassian.net`, sans chemin ni barre finale. */
  readonly origin: string;
  readonly host: string;
  /** Motif de permission d'hôte à demander à Chrome : ce site, et lui seul. */
  readonly permissionPattern: string;
}

/**
 * Seul domaine admis. Il doit rester aligné sur `optional_host_permissions` du manifest :
 * Chrome refuserait de toute façon la permission pour un autre hôte.
 * Les domaines personnalisés et `*.jira.com` ne sont pas pris en charge.
 */
const TRUSTED_SUFFIX = ".atlassian.net";

export function isTrustedHost(host: string): boolean {
  const lowered = host.toLowerCase();
  // Comparaison sur frontière de libellé DNS : « evilatlassian.net » et « atlassian.net » sont refusés.
  return lowered.endsWith(TRUSTED_SUFFIX) && lowered.length > TRUSTED_SUFFIX.length;
}

/**
 * Normalise une saisie en site Jira. Accepte « societe.atlassian.net » comme
 * « https://societe.atlassian.net/jira/… ». Refuse, AVANT toute requête et toute demande de
 * permission, ce qui n'est pas du HTTPS vers `*.atlassian.net`.
 */
export function normalizeSiteUrl(raw: string): JiraSite {
  let text = raw.trim();
  if (text === "") throw new JiraError({ kind: "invalidSiteUrl", input: raw });

  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new JiraError({ kind: "invalidSiteUrl", input: raw });
  }
  if (!url.hostname.includes(".")) throw new JiraError({ kind: "invalidSiteUrl", input: raw });
  // Jira Cloud impose HTTPS ; on refuse le clair plutôt que de le corriger en silence.
  if (url.protocol !== "https:") throw new JiraError({ kind: "invalidSiteUrl", input: raw });
  if (!isTrustedHost(url.hostname)) {
    throw new JiraError({ kind: "untrustedSiteHost", host: url.hostname });
  }
  // Pas de port exotique : le motif de permission ne le couvrirait pas.
  if (url.port !== "") throw new JiraError({ kind: "invalidSiteUrl", input: raw });

  // Identifiants embarqués, chemin, requête et fragment sont abandonnés.
  const host = url.hostname.toLowerCase();
  return siteFromHost(host);
}

/** Domaines d'Atlassian vers lesquels un lien venu de Jira peut être proposé. */
const ATLASSIAN_LINK_DOMAINS = ["atlassian.com", "atlassian.net"] as const;

/**
 * Lien vers une page d'Atlassian reçu de Jira (page d'un Goal, par exemple) : rendu seulement
 * s'il est en HTTPS, sans identifiants ni port, sur `atlassian.com` ou un sous-domaine
 * d'`atlassian.com` ou d'`atlassian.net` (frontière de libellé DNS). Sinon `null` : l'adresse
 * peut venir de la propriété du sprint, que d'autres outils écrivent, et le board ne doit pas
 * mener vers un autre site.
 */
export function atlassianLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const trusted = ATLASSIAN_LINK_DOMAINS.some(
    (domain) => host.endsWith(`.${domain}`) || (domain === "atlassian.com" && host === domain),
  );
  return trusted ? url.toString() : null;
}

function siteFromHost(host: string): JiraSite {
  return { origin: `https://${host}`, host, permissionPattern: `https://${host}/*` };
}

/** Résultat de l'analyse d'une URL de board Jira collée par l'utilisateur. */
export interface ParsedBoardUrl {
  readonly site: JiraSite;
  readonly boardId: number;
  readonly projectKey: string | null;
}

/**
 * Extrait le site et l'identifiant du board depuis une URL Jira.
 *
 * Formats de board reconnus :
 * - `https://site.atlassian.net/jira/software/c/projects/ABC/boards/123`
 * - `https://site.atlassian.net/jira/software/projects/ABC/boards/123/backlog`
 * - `https://site.atlassian.net/secure/RapidBoard.jspa?rapidView=123&projectKey=ABC`
 *
 * Retourne `null` si aucun identifiant de board n'est présent : on ne devine pas.
 */
export function parseBoardUrl(raw: string): ParsedBoardUrl | null {
  const text = raw.trim();
  if (text === "") return null;

  let url: URL;
  let site: JiraSite;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    site = normalizeSiteUrl(url.origin);
  } catch {
    return null;
  }

  const param = (name: string): string | null => {
    for (const [key, value] of url.searchParams) {
      if (key.toLowerCase() === name) return value;
    }
    return null;
  };
  const projectFromQuery = param("projectkey");

  // Format moderne : …/boards/{id}
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const lowered = segments.map((segment) => segment.toLowerCase());
  const boardsIndex = Math.max(lowered.lastIndexOf("boards"), lowered.lastIndexOf("board"));
  const boardId = boardsIndex >= 0 ? toBoardId(segments[boardsIndex + 1]) : null;
  if (boardId !== null) {
    const projectsIndex = lowered.indexOf("projects");
    const projectFromPath = projectsIndex >= 0 ? segments[projectsIndex + 1] : undefined;
    return { site, boardId, projectKey: projectFromPath ?? projectFromQuery };
  }

  // Format classique : ?rapidView={id}
  const rapidView = toBoardId(param("rapidview") ?? undefined);
  if (rapidView !== null) return { site, boardId: rapidView, projectKey: projectFromQuery };

  return null;
}

function toBoardId(text: string | undefined): number | null {
  if (text === undefined || !/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
