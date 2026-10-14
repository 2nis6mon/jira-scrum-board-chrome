import type { JiraClient } from "../../jira/client";
import { JiraError } from "../../jira/errors";
import type { JiraJqlField, JiraJqlReference } from "../../jira/jql";
import type { JiraIssue } from "../../jira/models";

export interface JqlValidation {
  readonly text: string;
  readonly status: "valid" | "invalid" | "unavailable";
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}
export interface JqlSuggestion {
  readonly label: string;
  readonly value: string;
  readonly from: number;
  readonly to: number;
  readonly kind: "field" | "operator" | "value" | "function" | "keyword";
}
export interface JqlMatch {
  readonly keys: ReadonlySet<string>;
  readonly errors: readonly string[];
}
type Reader = Pick<
  JiraClient,
  "validateJql" | "jqlAutocompleteData" | "jqlValueSuggestions" | "matchJql"
>;
const message = (error: unknown) =>
  error instanceof JiraError
    ? error.message
    : "La lecture JQL n'a pas pu être confirmée auprès de Jira.";

/** Aucune interprétation métier locale : Jira valide et décide des correspondances. */
export class JqlService {
  readonly #reader: Reader;
  #reference: Promise<JiraJqlReference> | null = null;
  constructor(reader: Reader) {
    this.#reader = reader;
  }

  async validate(text: string): Promise<JqlValidation> {
    if (!text.trim())
      return { text, status: "invalid", errors: ["Saisissez une requête JQL."], warnings: [] };
    try {
      const result = await this.#reader.validateJql(text);
      return { text, status: result.errors.length ? "invalid" : "valid", ...result };
    } catch (error) {
      // Une indisponibilité ou un refus d'accès n'est jamais présenté comme un JQL invalide.
      return { text, status: "unavailable", errors: [message(error)], warnings: [] };
    }
  }

  async suggest(text: string, caret: number): Promise<JqlSuggestion[]> {
    if (!this.#reference) {
      this.#reference = this.#reader.jqlAutocompleteData().catch((error: unknown) => {
        this.#reference = null;
        throw error;
      });
    }
    const reference = await this.#reference;
    const context = suggestionContext(text, caret, reference.fields);
    const options: { label: string; value: string; kind: JqlSuggestion["kind"] }[] = [];
    if (context.kind === "field") {
      options.push(
        ...reference.fields.map((field) => ({
          label: field.label,
          value: `${quoted(field.value)} `,
          kind: "field" as const,
        })),
      );
    } else if (context.kind === "operator") {
      options.push(
        ...context.field.operators.map((value) => ({
          label: value.toUpperCase(),
          value: `${value.toUpperCase()} `,
          kind: "operator" as const,
        })),
      );
    } else if (context.kind === "keyword") {
      options.push(
        ...["AND", "OR"].map((value) => ({
          label: value,
          value: `${value} `,
          kind: "keyword" as const,
        })),
      );
    } else {
      if (context.field.auto) {
        const values = await this.#reader.jqlValueSuggestions(
          context.field.value,
          unquoted(context.prefix),
        );
        options.push(
          ...values.map((item) => ({
            label: item.label,
            value: quoted(item.value),
            kind: "value" as const,
          })),
        );
      }
      options.push(
        ...reference.functions
          .filter((fn) => fn.types.some((type) => context.field.types.includes(type)))
          .map((fn) => ({ label: fn.label, value: fn.value, kind: "function" as const })),
      );
      options.push({ label: "EMPTY", value: "EMPTY", kind: "keyword" });
    }
    const prefix = unquoted(context.prefix).toLocaleLowerCase();
    const seen = new Set<string>();
    return options
      .filter((option) => {
        const key = `${option.kind}:${option.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return (
          !prefix ||
          option.label.toLocaleLowerCase().includes(prefix) ||
          unquoted(option.value.trim()).toLocaleLowerCase().startsWith(prefix)
        );
      })
      .sort(
        (left, right) =>
          Number(unquoted(right.value).toLocaleLowerCase().startsWith(prefix)) -
          Number(unquoted(left.value).toLocaleLowerCase().startsWith(prefix)),
      )
      .slice(0, 20)
      .map((option) => ({
        ...option,
        from: context.from,
        to:
          option.kind === "function" &&
          option.value.endsWith("()") &&
          text.slice(context.to).startsWith("()")
            ? context.to + 2
            : context.to,
      }));
  }

  /** Portée fermée aux tickets déjà lus ; déduplication et au plus trois lectures simultanées. */
  async match(
    issues: readonly Pick<JiraIssue, "id" | "key">[],
    queries: readonly string[],
  ): Promise<ReadonlyMap<string, JqlMatch>> {
    const aliases = new Map<string, string[]>();
    for (const text of queries) {
      const query = text.trim();
      const values = aliases.get(query) ?? [];
      values.push(text);
      aliases.set(query, values);
    }
    const aggregated = new Map(
      [...aliases.keys()].map((query) => [
        query,
        { keys: new Set<string>(), errors: new Set<string>() },
      ]),
    );
    const issuesById = new Map(issues.map((issue) => [issue.id, issue.key]));
    const ids = [...issuesById.keys()];
    const unique = [...aliases.keys()].filter((query) => {
      if (query) return true;
      aggregated.get(query)?.errors.add("Saisissez une requête JQL.");
      return false;
    });
    const jobs: { ids: string[]; queries: string[] }[] = [];
    for (let q = 0; q < unique.length; q += 10) {
      for (let i = 0; i < ids.length; i += 50)
        jobs.push({ ids: ids.slice(i, i + 50), queries: unique.slice(q, q + 10) });
    }
    let next = 0;
    const worker = async () => {
      for (;;) {
        const job = jobs[next++];
        if (!job) return;
        try {
          const matches = await this.#reader.matchJql(job.ids, job.queries);
          job.queries.forEach((query, index) => {
            const target = aggregated.get(query);
            const result = matches[index];
            if (!target || !result) throw new Error("Résultat de correspondance incomplet.");
            for (const error of result.errors) target.errors.add(error);
            for (const id of result.issueIds) {
              const key = issuesById.get(id);
              if (key && job.ids.includes(id)) target.keys.add(key);
            }
          });
        } catch (error) {
          for (const query of job.queries) aggregated.get(query)?.errors.add(message(error));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
    const result = new Map<string, JqlMatch>();
    for (const [query, values] of aliases) {
      const found = aggregated.get(query);
      if (!found) continue;
      // Une page refusée interdit de présenter un résultat partiel comme une classification sûre.
      const match = {
        keys: found.errors.size ? new Set<string>() : found.keys,
        errors: [...found.errors],
      };
      for (const text of values) result.set(text, match);
    }
    return result;
  }
}

function unquoted(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
function quoted(value: string): string {
  if (/^"(?:[^"\\]|\\.)*"$/.test(value) || /^cf\[\d+\]$/i.test(value)) return value;
  return /^[\w.-]+$/u.test(value) && !/^(empty|null|and|or|not|in|is)$/i.test(value)
    ? value
    : `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
type Context = { prefix: string; from: number; to: number } & (
  | { kind: "field" }
  | { kind: "keyword" }
  | { kind: "operator"; field: JiraJqlField }
  | { kind: "value"; field: JiraJqlField }
);

/** Analyse de contexte limitée à l'aide de saisie, jamais utilisée pour accepter un JQL. */
function suggestionContext(
  text: string,
  rawCaret: number,
  fields: readonly JiraJqlField[],
): Context {
  const caret = Math.max(0, Math.min(text.length, rawCaret));
  const before = text.slice(0, caret);
  const tokens = [
    ...before.matchAll(/"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|[\w.[\]-]+|!=|!~|>=|<=|[=~<>(),]/gu),
  ].map((match) => ({ text: match[0], from: match.index }));
  const last = tokens.at(-1);
  const active =
    last && last.from + last.text.length === caret && !/^[(),]$/.test(last.text)
      ? tokens.pop()
      : undefined;
  const base = { prefix: active?.text ?? "", from: active?.from ?? caret, to: caret };
  // Remplacer aussi la fin du mot lorsque le curseur est au milieu d'une saisie.
  const remainder = text.slice(caret).match(/^[\w.[\]-]+/u)?.[0] ?? "";
  base.to += remainder.length;
  if (
    active &&
    /^["']/.test(active.text) &&
    !/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(active.text)
  ) {
    const quote = active.text[0];
    for (let end = caret; end < text.length; end += 1) {
      if (text[end] === "\\") {
        end += 1;
        continue;
      }
      if (text[end] === quote) {
        base.to = end + 1;
        break;
      }
    }
  }
  let start = 0;
  tokens.forEach((token, index) => {
    if (/^(and|or)$/i.test(token.text)) start = index + 1;
  });
  const clause = tokens.slice(start);
  while (clause[0] && (/^[()]$/.test(clause[0].text) || /^not$/i.test(clause[0].text)))
    clause.shift();
  if (!clause.length) return { ...base, kind: "field" };
  const fieldName = unquoted(clause[0]?.text ?? "").toLocaleLowerCase();
  const field = fields.find(
    (candidate) =>
      candidate.value.toLocaleLowerCase() === fieldName ||
      unquoted(candidate.value).toLocaleLowerCase() === fieldName ||
      candidate.label.toLocaleLowerCase() === fieldName ||
      candidate.label.replace(/ - cf\[\d+\]$/i, "").toLocaleLowerCase() === fieldName,
  );
  if (!field) return { ...base, kind: "field" };
  if (clause.length === 1) return { ...base, kind: "operator", field };
  const rest = clause.slice(1).map((token) => token.text.toLowerCase());
  if (rest.length === 1 && (rest[0] === "not" || (rest[0] === "is" && /^n/i.test(base.prefix)))) {
    return {
      ...base,
      prefix: `${rest[0]} ${base.prefix}`,
      from: clause[1]?.from ?? base.from,
      kind: "operator",
      field,
    };
  }
  const operatorLength = ["not in", "is not", "was in", "was not"].includes(
    rest.slice(0, 2).join(" "),
  )
    ? 2
    : 1;
  const values = rest.slice(operatorLength);
  const listOpen =
    values.filter((token) => token === "(").length > values.filter((token) => token === ")").length;
  if (values.length && !listOpen && !base.prefix) return { ...base, kind: "keyword" };
  return { ...base, kind: "value", field };
}
