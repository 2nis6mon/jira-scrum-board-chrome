import { JiraError } from "./errors";
import { isRecord } from "./json";
import type { AtlassianTokenHeader, JiraResponse, JiraTransport } from "./transport";
import { assertEntityId, SPRINT_PROPERTY_KEYS, sprintPropertyPath } from "./writes";

/**
 * Diagnostic de connexion.
 *
 * Il répond à la question que seul un essai sur une instance réelle peut trancher : Jira
 * accepte-t-il, depuis une page d'extension, la session du navigateur en lecture, en POST,
 * et en écriture ? Chaque sonde rapporte ce que Jira a réellement répondu, code HTTP compris.
 */
export type ProbeStatus = "ok" | "failed" | "skipped";

export interface ProbeResult {
  readonly id: string;
  readonly label: string;
  readonly status: ProbeStatus;
  readonly httpStatus: number | null;
  readonly detail: string;
}

export interface ReadDiagnostics {
  readonly probes: ProbeResult[];
  /** Nom affiché du compte reconnu. Jamais recopié dans le rapport. */
  readonly displayName: string | null;
  /** La session du navigateur est-elle reconnue par Jira ? */
  readonly sessionRecognized: boolean;
  /**
   * Variante de l'en-tête `Origin` acceptée par la passerelle GraphQL, quand elle a été testée :
   * `null` si aucune ne passe ou si le test n'a pas eu lieu.
   */
  readonly graphqlOrigin: "remove" | "site" | null;
}

/**
 * Pilotage de la règle `Origin` pendant le diagnostic : `keep` (aucune règle), `remove`, `site`.
 * Fourni par l'interface ; le module Jira ne connaît pas Chrome.
 */
export interface OriginControl {
  use(mode: "keep" | "remove" | "site"): Promise<void>;
}

const ORIGIN_LABEL = {
  keep: "en-tête Origin de l'extension conservé",
  remove: "en-tête Origin retiré",
  site: "en-tête Origin remplacé par l'adresse du site",
} as const;

export interface ActiveSprint {
  readonly id: number;
  readonly name: string;
}

export interface WriteDiagnostics {
  readonly probes: ProbeResult[];
  /** Réglage de l'en-tête avec lequel Jira a accepté l'écriture ; `null` si aucun. */
  readonly acceptedWith: AtlassianTokenHeader | null;
}

const TOKEN_LABEL: Record<AtlassianTokenHeader, string> = {
  absent: "sans en-tête particulier",
  "no-check": "avec l'en-tête X-Atlassian-Token: no-check",
};

// ─── Lectures ────────────────────────────────────────────────────────────────

export async function runReadProbes(
  transport: JiraTransport,
  origin: OriginControl | null = null,
): Promise<ReadDiagnostics> {
  const probes: ProbeResult[] = [];
  let displayName: string | null = null;

  // 1. La session du navigateur accompagne-t-elle une requête émise par l'extension ?
  try {
    const response = await transport.get("/rest/api/3/myself", { resource: "votre compte Jira" });
    if (isRecord(response.body) && typeof response.body.displayName === "string") {
      displayName = response.body.displayName;
    }
    probes.push(ok("session", "Session Jira du navigateur (GET)", response, "compte reconnu"));
  } catch (error) {
    probes.push(failed("session", "Session Jira du navigateur (GET)", error));
    probes.push(skipped("post-rest", "Lecture REST par POST", "session non reconnue"));
    probes.push(skipped("post-graphql", "Lecture GraphQL par POST", "session non reconnue"));
    return { probes, displayName, sessionRecognized: false, graphqlOrigin: null };
  }

  // 2. Un POST REST passe-t-il le contrôle XSRF ? Analyse d'un JQL : aucune donnée lue ni écrite.
  probes.push(
    await probeWithFallback("post-rest", "Lecture REST par POST", (atlassianToken) =>
      transport.readByPost(
        "/rest/api/3/jql/parse",
        { queries: ["created >= -1d"] },
        { query: { validation: "none" }, resource: "l'analyse JQL", atlassianToken },
      ),
    ),
  );

  // 3. La passerelle GraphQL (API Goals) accepte-t-elle la session ? Requête documentée
  //    `tenantContexts`, la même que l'app Mac. Lecture seule.
  const cloudIdQuery = (atlassianToken: AtlassianTokenHeader) =>
    transport.graphqlQuery(
      "query siteCloudId($hosts: [String!]!) { tenantContexts(hostNames: $hosts) { cloudId } }",
      { hosts: [transport.site.host] },
      { resource: "l'identifiant du site", atlassianToken },
    );
  const validCloudId = (response: JiraResponse) =>
    readCloudId(response) ? "identifiant du site lu" : null;

  if (origin === null) {
    probes.push(
      await probeWithFallback(
        "post-graphql",
        "Lecture GraphQL par POST",
        cloudIdQuery,
        validCloudId,
      ),
    );
    return { probes, displayName, sessionRecognized: true, graphqlOrigin: null };
  }

  // La passerelle rejette l'Origin `chrome-extension://…` : chaque variante de la règle est
  // essayée, dans cet ordre, et rapportée telle que la passerelle l'a reçue.
  const accepted = new Set<"keep" | "remove" | "site">();
  for (const mode of ["keep", "remove", "site"] as const) {
    const label = `Lecture GraphQL par POST, ${ORIGIN_LABEL[mode]}`;
    try {
      await origin.use(mode);
    } catch (error) {
      probes.push(failed(`post-graphql-${mode}`, label, error));
      continue;
    }
    try {
      const response = await cloudIdQuery("absent");
      const summary = validCloudId(response);
      if (summary === null) {
        probes.push({
          id: `post-graphql-${mode}`,
          label,
          status: "failed",
          httpStatus: response.status,
          detail: `réponse ${response.status} au contenu inattendu`,
        });
      } else {
        accepted.add(mode);
        probes.push(ok(`post-graphql-${mode}`, label, response, summary));
      }
    } catch (error) {
      probes.push(failed(`post-graphql-${mode}`, label, error));
    }
  }
  // « site » d'abord : c'est la variante constatée sur instance réelle.
  const graphqlOrigin = accepted.has("site") ? "site" : accepted.has("remove") ? "remove" : null;
  return { probes, displayName, sessionRecognized: true, graphqlOrigin };
}

function readCloudId(response: JiraResponse): boolean {
  const data = isRecord(response.body) ? response.body.data : null;
  const contexts = isRecord(data) ? data.tenantContexts : null;
  const first: unknown = Array.isArray(contexts) ? contexts[0] : null;
  return isRecord(first) && typeof first.cloudId === "string" && first.cloudId !== "";
}

/**
 * Essaie une LECTURE sans en-tête, puis avec « no-check » après n'importe quel 403 : la passerelle
 * GraphQL ne formule pas son refus comme Jira (« XSRF check failed »), et retenter une lecture
 * est sans risque. Les ÉCRITURES, elles, ne sont retentées qu'après un refus XSRF explicite.
 */
async function probeWithFallback(
  id: string,
  label: string,
  run: (atlassianToken: AtlassianTokenHeader) => Promise<JiraResponse>,
  validate: (response: JiraResponse) => string | null = () => "réponse reçue",
): Promise<ProbeResult> {
  let firstRefusal: string | null = null;
  for (const variant of ["absent", "no-check"] as const) {
    try {
      const response = await run(variant);
      const summary = validate(response);
      if (summary === null) {
        return {
          id,
          label,
          status: "failed",
          httpStatus: response.status,
          detail: `réponse ${response.status} au contenu inattendu, ${TOKEN_LABEL[variant]}`,
        };
      }
      const prefix = firstRefusal === null ? "" : `${firstRefusal} sans en-tête, puis `;
      return ok(id, label, response, `${prefix}${summary} ${TOKEN_LABEL[variant]}`);
    } catch (error) {
      if (variant === "absent" && isForbidden(error)) {
        firstRefusal = isXsrf(error) ? "refus XSRF" : "refus 403";
        continue;
      }
      const result = failed(id, label, error);
      const context = firstRefusal === null ? "" : "même refus sans en-tête ; ";
      return { ...result, detail: `${context}${TOKEN_LABEL[variant]} : ${result.detail}` };
    }
  }
  throw new Error("inatteignable");
}

// ─── Sprint actif ────────────────────────────────────────────────────────────

/** Premier sprint actif du board, ou `null` s'il n'y en a pas. */
export async function findActiveSprint(
  transport: JiraTransport,
  boardId: number,
): Promise<ActiveSprint | null> {
  assertEntityId(boardId, "board");
  const response = await transport.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
    query: { state: "active" },
    resource: `les sprints du board ${boardId}`,
  });
  const values = isRecord(response.body) ? response.body.values : null;
  if (!Array.isArray(values)) {
    throw new JiraError({ kind: "decoding", context: "sprints du board", detail: "values absent" });
  }
  for (const value of values) {
    if (isRecord(value) && typeof value.id === "number" && typeof value.name === "string") {
      return { id: value.id, name: value.name };
    }
  }
  return null;
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/**
 * Vérifie que Jira accepte une ÉCRITURE émise par l'extension.
 *
 * Écrit la propriété technique `com.scrumboardmac.diagnostic` sur le sprint, la relit, puis
 * la supprime. Ne touche à aucune donnée métier : ni le champ objectif du sprint, ni les
 * tickets, ni la propriété des objectifs épinglés.
 *
 * Règle « une seule tentative par écriture » : le second PUT, avec l'en-tête, n'est émis
 * qu'après un REFUS XSRF explicite du premier — donc quand on sait que rien n'a été écrit.
 * Si l'issue d'une écriture est inconnue (réseau, délai), on s'arrête et on relit.
 */
export async function probeSprintPropertyWrite(
  transport: JiraTransport,
  sprintId: number,
): Promise<WriteDiagnostics> {
  const key = SPRINT_PROPERTY_KEYS.diagnostic;
  const path = sprintPropertyPath(sprintId, key);
  const resource = "la propriété de diagnostic";
  const probes: ProbeResult[] = [];

  // 1. Lecture — permission de consultation du sprint. 404 = propriété absente : normal.
  try {
    const response = await transport.get(path, { resource });
    probes.push(ok("prop-read", "Lecture d'une propriété du sprint", response, "autorisée"));
  } catch (error) {
    if (!isNotFound(error)) {
      probes.push(failed("prop-read", "Lecture d'une propriété du sprint", error));
      return { probes, acceptedWith: null };
    }
    probes.push({
      id: "prop-read",
      label: "Lecture d'une propriété du sprint",
      status: "ok",
      httpStatus: 404,
      detail: "autorisée (propriété de diagnostic absente, comme attendu)",
    });
  }

  // 2. Écriture — sans en-tête, puis avec, uniquement après un refus XSRF.
  let acceptedWith: AtlassianTokenHeader | null = null;
  for (const variant of ["absent", "no-check"] as const) {
    const label = `Écriture (PUT) ${TOKEN_LABEL[variant]}`;
    try {
      const response = await transport.write(
        { kind: "sprintProperty.put", sprintId, key, value: { probe: true } },
        { atlassianToken: variant },
      );
      probes.push(ok(`put-${variant}`, label, response, "acceptée par Jira"));
      acceptedWith = variant;
      break;
    } catch (error) {
      probes.push(failed(`put-${variant}`, label, error));
      if (isXsrf(error)) continue;
      if (error instanceof JiraError && error.isOutcomeUnknown) {
        probes.push(await reportLeftover(transport, path, resource));
      }
      return { probes, acceptedWith: null };
    }
  }
  if (acceptedWith === null) return { probes, acceptedWith };

  // 3. Relecture — l'écriture a-t-elle réellement eu lieu ?
  try {
    const response = await transport.get(path, { resource });
    const value = isRecord(response.body) ? response.body.value : null;
    const found = isRecord(value) && value.probe === true;
    probes.push(
      found
        ? ok("prop-verify", "Relecture de la valeur écrite", response, "valeur retrouvée dans Jira")
        : {
            id: "prop-verify",
            label: "Relecture de la valeur écrite",
            status: "failed",
            httpStatus: response.status,
            detail: "Jira a répondu, mais la valeur écrite n'y est pas",
          },
    );
  } catch (error) {
    probes.push(failed("prop-verify", "Relecture de la valeur écrite", error));
  }

  // 4. Nettoyage — on ne laisse rien derrière.
  const deleteLabel = `Suppression (DELETE) ${TOKEN_LABEL[acceptedWith]}`;
  try {
    const response = await transport.write(
      { kind: "sprintProperty.delete", sprintId, key },
      { atlassianToken: acceptedWith },
    );
    probes.push(ok("delete", deleteLabel, response, "propriété de test supprimée"));
  } catch (error) {
    const result = failed("delete", deleteLabel, error);
    probes.push({
      ...result,
      detail: `${result.detail} La propriété « ${key} » est peut-être restée sur le sprint ${sprintId} : elle est invisible dans Jira et sans effet.`,
    });
  }

  return { probes, acceptedWith };
}

/** Après une écriture à l'issue inconnue : dit, par une lecture, si quelque chose est resté. */
async function reportLeftover(
  transport: JiraTransport,
  path: string,
  resource: string,
): Promise<ProbeResult> {
  const label = "Relecture après une écriture à l'issue inconnue";
  try {
    const response = await transport.get(path, { resource });
    return ok(
      "leftover",
      label,
      response,
      "la propriété de test EXISTE dans Jira : l'écriture avait abouti. Elle est invisible et sans effet ; relancez le test pour la supprimer",
    );
  } catch (error) {
    if (isNotFound(error)) {
      return {
        id: "leftover",
        label,
        status: "ok",
        httpStatus: 404,
        detail: "rien n'a été écrit",
      };
    }
    return failed("leftover", label, error);
  }
}

// ─── Rapport ─────────────────────────────────────────────────────────────────

export interface ReportInput {
  readonly extensionVersion: string;
  readonly userAgent: string;
  readonly read: ReadDiagnostics | null;
  readonly write: WriteDiagnostics | null;
}

/** Conclusion en une phrase sur les écritures, d'après ce que Jira a réellement répondu. */
export function writeConclusion(write: WriteDiagnostics): string {
  if (write.acceptedWith === "absent") {
    return "Jira accepte les écritures de l'extension sans en-tête particulier.";
  }
  if (write.acceptedWith === "no-check") {
    return "Jira refuse les écritures sans en-tête (XSRF) et les accepte avec X-Atlassian-Token: no-check.";
  }
  const refusedTwice = write.probes.filter(
    (p) => p.id.startsWith("put-") && isXsrfDetail(p),
  ).length;
  if (refusedTwice === 2) {
    return "Jira refuse les écritures de l'extension (XSRF), avec ou sans en-tête : une autre voie est nécessaire.";
  }
  return "L'écriture n'a pas abouti, pour une raison autre que le contrôle XSRF (voir le détail).";
}

function isXsrfDetail(probe: ProbeResult): boolean {
  return probe.status === "failed" && probe.detail.includes("XSRF");
}

/**
 * Rapport à transmettre. Il ne contient ni l'adresse du site, ni nom de compte, ni nom de
 * sprint, ni identifiant : uniquement des sondes, des codes HTTP et les messages de Jira.
 */
export function formatReport(input: ReportInput): string {
  const lines = [
    `Scrum Board (extension Chrome) ${input.extensionVersion} — diagnostic de connexion`,
    input.userAgent,
    "",
  ];
  const mark: Record<ProbeStatus, string> = { ok: "✓", failed: "✗", skipped: "–" };
  const section = (title: string, probes: readonly ProbeResult[]) => {
    lines.push(title);
    for (const probe of probes) {
      const code = probe.httpStatus === null ? "" : ` [${probe.httpStatus}]`;
      lines.push(`${mark[probe.status]} ${probe.label}${code} : ${probe.detail}`);
    }
    lines.push("");
  };

  if (input.read) {
    section("Lectures", input.read.probes);
    if (input.read.probes.some((probe) => probe.id === "post-graphql-remove")) {
      lines.push(
        `GraphQL : ${
          input.read.graphqlOrigin === null
            ? "refusé dans toutes les variantes de l'en-tête Origin."
            : `accepté, ${ORIGIN_LABEL[input.read.graphqlOrigin]} (variante retenue).`
        }`,
        "",
      );
    }
  } else {
    lines.push("Lectures : non lancées", "");
  }
  if (input.write) {
    section("Écriture (propriété de diagnostic du sprint)", input.write.probes);
    lines.push(`Conclusion : ${writeConclusion(input.write)}`);
  } else {
    lines.push("Écriture : test non lancé");
  }
  return lines.join("\n");
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function ok(id: string, label: string, response: JiraResponse, detail: string): ProbeResult {
  return { id, label, status: "ok", httpStatus: response.status, detail };
}

function skipped(id: string, label: string, detail: string): ProbeResult {
  return { id, label, status: "skipped", httpStatus: null, detail };
}

function failed(id: string, label: string, error: unknown): ProbeResult {
  if (!(error instanceof JiraError)) {
    const detail = error instanceof Error ? error.message : String(error);
    return { id, label, status: "failed", httpStatus: null, detail };
  }
  return {
    id,
    label,
    status: "failed",
    httpStatus: error.httpStatus,
    detail: describeForReport(error),
  };
}

function describeForReport(error: JiraError): string {
  const info = error.info;
  switch (info.kind) {
    case "xsrf":
      return `refus XSRF — ${oneLine(info.bodyExcerpt)}`;
    case "forbidden": {
      if (info.detail !== null) return `refusé — ${info.detail}`;
      const body = oneLine(info.bodyExcerpt);
      const parts = [
        body === "" ? "corps de réponse vide" : `réponse : ${body}`,
        ...(info.responseHints === "" ? [] : [info.responseHints]),
      ];
      return `refusé sans message Jira — ${parts.join(" — ")}`;
    }
    case "unexpected":
      return `${error.message} ${oneLine(info.bodyExcerpt)}`;
    case "offline":
      return `${error.message} (${info.underlying})`;
    default:
      return error.message;
  }
}

function oneLine(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function isForbidden(error: unknown): boolean {
  return error instanceof JiraError && error.httpStatus === 403;
}

function isXsrf(error: unknown): boolean {
  return error instanceof JiraError && error.info.kind === "xsrf";
}

function isNotFound(error: unknown): boolean {
  return error instanceof JiraError && error.info.kind === "notFound";
}
