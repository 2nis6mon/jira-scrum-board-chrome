/**
 * Erreurs Jira typées.
 *
 * Règle du produit : l'utilisateur ne doit jamais voir une erreur technique brute, et
 * l'extension ne doit jamais laisser croire qu'une écriture a réussi. Chaque cas porte donc
 * un message lisible et, quand c'est possible, une action.
 */
export type JiraErrorInfo =
  /** Pas de réseau, DNS injoignable, requête bloquée par le navigateur. */
  | { kind: "offline"; underlying: string }
  /** La requête a dépassé le délai imparti. Pour une écriture, son issue est INCONNUE. */
  | { kind: "timeout" }
  | { kind: "invalidSiteUrl"; input: string }
  /** Hôte hors `*.atlassian.net` : refusé avant toute requête. */
  | { kind: "untrustedSiteHost"; host: string }
  /** 401 — Jira ne reconnaît pas la session du navigateur. */
  | { kind: "unauthorized" }
  /** 403 « XSRF check failed » — Jira refuse l'origine de la requête, pas le compte. */
  | { kind: "xsrf"; bodyExcerpt: string }
  /** 403 — le compte est reconnu mais n'a pas le droit. */
  | { kind: "forbidden"; detail: string | null }
  | { kind: "notFound"; resource: string }
  | { kind: "rateLimited"; retryAfterSeconds: number | null }
  | { kind: "serviceUnavailable"; status: number }
  | { kind: "badRequest"; messages: string[]; fieldErrors: Record<string, string> }
  /** Jira a répondu par une redirection, que l'extension ne suit jamais. */
  | { kind: "redirected" }
  /** Réponse illisible : le contrat d'API ne correspond pas à ce qui est attendu. */
  | { kind: "decoding"; context: string; detail: string }
  /** La propriété d'entité dépasse la limite Atlassian de 32 Ko. */
  | { kind: "propertyTooLarge"; bytes: number; limit: number }
  /** Cas non couvert : on remonte le statut et un extrait du corps, sans l'inventer. */
  | { kind: "unexpected"; status: number; bodyExcerpt: string };

/** Limite documentée par Atlassian pour une propriété d'entité. */
export const ENTITY_PROPERTY_LIMIT_BYTES = 32 * 1024;

export class JiraError extends Error {
  readonly info: JiraErrorInfo;

  constructor(info: JiraErrorInfo) {
    super(describe(info));
    this.name = "JiraError";
    this.info = info;
  }

  get suggestion(): string {
    return suggest(this.info);
  }

  /** Statut HTTP à l'origine de l'erreur, quand il y en a un. */
  get httpStatus(): number | null {
    switch (this.info.kind) {
      case "unauthorized":
        return 401;
      case "xsrf":
      case "forbidden":
        return 403;
      case "notFound":
        return 404;
      case "rateLimited":
        return 429;
      case "badRequest":
        return 400;
      case "serviceUnavailable":
      case "unexpected":
        return this.info.status;
      default:
        return null;
    }
  }

  /** Une nouvelle tentative a-t-elle une chance d'aboutir sans action de l'utilisateur ? */
  get isRetryable(): boolean {
    return ["offline", "timeout", "rateLimited", "serviceUnavailable"].includes(this.info.kind);
  }

  /**
   * L'issue de la requête est-elle inconnue ? Après une écriture, c'est le cas où il ne faut
   * surtout pas rejouer : on relit Jira.
   */
  get isOutcomeUnknown(): boolean {
    return (
      this.info.kind === "offline" ||
      this.info.kind === "timeout" ||
      this.info.kind === "serviceUnavailable"
    );
  }

  /** La session du navigateur est-elle en cause ? */
  get isAuthenticationFailure(): boolean {
    return this.info.kind === "unauthorized" || this.info.kind === "redirected";
  }
}

function describe(info: JiraErrorInfo): string {
  switch (info.kind) {
    case "offline":
      return "Connexion à Jira impossible.";
    case "timeout":
      return "Jira n'a pas répondu dans le délai imparti.";
    case "invalidSiteUrl":
      return `L'adresse Jira « ${info.input.trim()} » n'est pas valide.`;
    case "untrustedSiteHost":
      return `« ${info.host} » n'est pas un site Jira Cloud (*.atlassian.net).`;
    case "unauthorized":
      return "Jira ne reconnaît pas votre session dans ce navigateur.";
    case "xsrf":
      return "Jira a refusé la requête à cause de son origine (contrôle XSRF).";
    case "forbidden":
      return info.detail
        ? `Action refusée par Jira : ${info.detail}`
        : "Action refusée par Jira : votre compte n'a pas les droits nécessaires.";
    case "notFound":
      return `Introuvable dans Jira : ${info.resource}.`;
    case "rateLimited":
      return "Jira a temporairement limité le nombre de requêtes.";
    case "serviceUnavailable":
      return `Jira est momentanément indisponible (erreur ${info.status}).`;
    case "badRequest": {
      const all = [
        ...info.messages,
        ...Object.entries(info.fieldErrors).map(([field, message]) => `${field} : ${message}`),
      ];
      return all.length === 0 ? "Jira a refusé la requête." : all.join("\n");
    }
    case "redirected":
      return "Jira a répondu par une redirection au lieu de données.";
    case "decoding":
      return `Réponse Jira inattendue (${info.context}).`;
    case "propertyTooLarge":
      return `Données trop volumineuses pour Jira : ${info.bytes} octets pour une limite de ${info.limit}.`;
    case "unexpected":
      return `Erreur Jira inattendue (code ${info.status}).`;
  }
}

function suggest(info: JiraErrorInfo): string {
  switch (info.kind) {
    case "offline":
      return "Vérifiez votre connexion réseau et que l'accès au site est toujours accordé à l'extension, puis réessayez.";
    case "timeout":
      return "Réessayez. Si le problème persiste, votre instance Jira est peut-être surchargée.";
    case "invalidSiteUrl":
      return "Attendu : une adresse HTTPS, par exemple https://votre-societe.atlassian.net";
    case "untrustedSiteHost":
      return "Vérifiez l'orthographe. L'extension ne peut accéder qu'à un site *.atlassian.net.";
    case "unauthorized":
    case "redirected":
      return "Connectez-vous à Jira dans un onglet de ce navigateur, puis réessayez.";
    case "xsrf":
      return "Ce refus ne vient pas de vos droits. Lancez le diagnostic et transmettez son rapport.";
    case "forbidden":
      return "Demandez le droit correspondant à votre administrateur Jira. L'extension n'effectue aucune modification sans l'accord de Jira.";
    case "notFound":
      return `Vérifiez que « ${info.resource} » existe toujours et que votre compte Jira peut le consulter.`;
    case "rateLimited":
      return info.retryAfterSeconds === null
        ? "Patientez quelques instants avant de réessayer."
        : `Réessayez dans ${Math.round(info.retryAfterSeconds)} seconde(s).`;
    case "serviceUnavailable":
      return "Réessayez dans quelques minutes.";
    case "badRequest":
      return "Corrigez la demande dans Jira, puis actualisez.";
    case "decoding":
      return "Signalez cette anomalie : la réponse de votre instance Jira ne correspond pas au format attendu.";
    case "propertyTooLarge":
      return "Réduisez le nombre d'objectifs ou de rattachements sur ce sprint.";
    case "unexpected":
      return "Réessayez. Si l'erreur persiste, lancez le diagnostic.";
  }
}
