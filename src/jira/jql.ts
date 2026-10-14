import { JiraError } from "./errors";
import { isRecord } from "./json";

export interface JiraJqlValidation {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}
export interface JiraJqlField {
  readonly value: string;
  readonly label: string;
  readonly operators: readonly string[];
  readonly types: readonly string[];
  readonly auto: boolean;
}
export interface JiraJqlFunction {
  readonly value: string;
  readonly label: string;
  readonly types: readonly string[];
  readonly list: boolean;
}
export interface JiraJqlReference {
  readonly fields: readonly JiraJqlField[];
  readonly functions: readonly JiraJqlFunction[];
}
export interface JiraJqlValue {
  readonly value: string;
  readonly label: string;
}
export interface JiraJqlMatch {
  readonly issueIds: readonly string[];
  readonly errors: readonly string[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const fail = (detail: string): never => {
  throw new JiraError({ kind: "decoding", context: "JQL", detail });
};

/** Les libellés Jira peuvent contenir du balisage de surlignage : rendu texte uniquement. */
function label(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, "") : fallback;
}

export function decodeJqlValidation(body: unknown): JiraJqlValidation {
  if (!isRecord(body) || !Array.isArray(body.queries) || body.queries.length !== 1) {
    return fail("résultat de validation absent");
  }
  const query = body.queries[0];
  if (
    !isRecord(query) ||
    (!Array.isArray(query.errors) && !Array.isArray(query.warnings) && !isRecord(query.structure))
  ) {
    return fail("structure et erreurs absentes");
  }
  for (const kind of ["errors", "warnings"]) {
    if (
      query[kind] !== undefined &&
      (!Array.isArray(query[kind]) || query[kind].some((value) => typeof value !== "string"))
    )
      return fail("messages de validation illisibles");
  }
  const warnings = strings(query.warnings);
  if (isRecord(query.structure) && isRecord(query.structure.orderBy)) {
    warnings.push("Le tri ORDER BY ne change pas l'ordre des cartes du board.");
  }
  return { errors: strings(query.errors), warnings };
}

export function decodeJqlReference(body: unknown): JiraJqlReference {
  if (
    !isRecord(body) ||
    !Array.isArray(body.visibleFieldNames) ||
    !Array.isArray(body.visibleFunctionNames)
  ) {
    return fail("référentiel de saisie absent");
  }
  return {
    fields: body.visibleFieldNames.flatMap((field) => {
      if (!isRecord(field) || typeof field.value !== "string" || field.searchable === "false")
        return [];
      return [
        {
          value: typeof field.cfid === "string" ? field.cfid : field.value,
          label: label(field.displayName, field.value),
          operators: strings(field.operators),
          types: strings(field.types),
          auto: field.auto === "true" || field.auto === true,
        },
      ];
    }),
    functions: body.visibleFunctionNames.flatMap((fn) => {
      if (!isRecord(fn) || typeof fn.value !== "string") return [];
      return [
        {
          value: fn.value,
          label: label(fn.displayName, fn.value),
          types: strings(fn.types),
          list: fn.isList === "true" || fn.isList === true,
        },
      ];
    }),
  };
}

export function decodeJqlValues(body: unknown): JiraJqlValue[] {
  if (!isRecord(body) || !Array.isArray(body.results)) return fail("suggestions absentes");
  return body.results.flatMap((item) => {
    if (!isRecord(item) || typeof item.value !== "string") return [];
    return [{ value: item.value, label: label(item.displayName, item.value) }];
  });
}

export function decodeJqlMatches(body: unknown, count: number): JiraJqlMatch[] {
  if (!isRecord(body) || !Array.isArray(body.matches) || body.matches.length !== count) {
    return fail("résultats de correspondance incomplets");
  }
  return body.matches.map((match) => {
    if (!isRecord(match) || !Array.isArray(match.matchedIssues))
      return fail("tickets correspondants absents");
    if (
      match.errors !== undefined &&
      (!Array.isArray(match.errors) || match.errors.some((error) => typeof error !== "string"))
    )
      return fail("erreurs de correspondance illisibles");
    return {
      issueIds: match.matchedIssues.map((id) => {
        if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
          return fail("identifiant de ticket invalide");
        return String(id);
      }),
      errors: strings(match.errors),
    };
  });
}
