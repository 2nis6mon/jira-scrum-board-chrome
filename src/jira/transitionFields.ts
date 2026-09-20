import { isRecord, type JsonObject, type JsonValue } from "./json";
import type { JiraTransition, JiraTransitionField } from "./models";

export type TransitionDraft = Readonly<Record<string, string | string[]>>;
export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime-local"
  | "select"
  | "multiple"
  | "unsupported";
export interface FieldChoice {
  label: string;
  value: string;
}

/** Types standards seulement ; les widgets d’applications tierces restent dans Jira. */
export function fieldKind(id: string, field: JiraTransitionField): FieldKind {
  if (id === "comment") return field.operations?.includes("add") ? "textarea" : "unsupported";
  if (!field.operations?.includes("set") || !field.schema) return "unsupported";
  if (
    [
      "status",
      "project",
      "issuetype",
      "parent",
      "sprint",
      "security",
      "worklog",
      "timetracking",
    ].includes(id)
  )
    return "unsupported";
  const { type, items, custom } = field.schema;
  if (
    custom &&
    !/^com\.atlassian\.jira\.plugin\.system\.customfieldtypes:(textfield|textarea|url|float|datepicker|datetime|select|multiselect|radiobuttons|multicheckboxes|labels|userpicker|multiuserpicker)$/.test(
      custom,
    )
  )
    return "unsupported";
  if (
    field.allowedValues?.length &&
    choices(field).length ===
      field.allowedValues.filter((item) => !isRecord(item) || item.disabled !== true).length
  )
    return type === "array" ? "multiple" : "select";
  if (id === "description" || id === "environment" || custom?.endsWith(":textarea"))
    return "textarea";
  if (custom?.endsWith(":datepicker")) return "date";
  if (custom?.endsWith(":datetime")) return "datetime-local";
  if (type === "string") return "text";
  if (type === "number") return "number";
  if (type === "date") return "date";
  if (type === "datetime") return "datetime-local";
  if (type === "array" && items === "string") return "textarea";
  return "unsupported";
}

export function choices(field: JiraTransitionField): FieldChoice[] {
  return (field.allowedValues ?? []).flatMap((item) => {
    if (typeof item === "string" || typeof item === "number")
      return [{ label: String(item), value: JSON.stringify(item) }];
    if (!isRecord(item) || item.disabled === true || item.children) return [];
    const label = item.displayName ?? item.value ?? item.name;
    const value =
      typeof item.accountId === "string"
        ? { accountId: item.accountId }
        : typeof item.id === "string" || typeof item.id === "number"
          ? { id: String(item.id) }
          : null;
    return typeof label === "string" && value ? [{ label, value: JSON.stringify(value) }] : [];
  });
}

export function plainDocument(text: string): JsonObject {
  return {
    type: "doc",
    version: 1,
    content: text
      .split(/\r?\n/)
      .map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })),
  };
}

export class TransitionInputError extends Error {
  constructor(readonly fields: Record<string, string>) {
    super("Vérifiez les champs du formulaire.");
  }
}

export function hasFieldValue(value: JsonValue | undefined): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== "" &&
    (!Array.isArray(value) || value.length > 0)
  );
}

/** Seules les valeurs explicitement modifiées sont envoyées. Le reste est conservé par Jira. */
export function transitionInput(
  transition: JiraTransition,
  draft: TransitionDraft,
  current: JsonObject,
): { fields: JsonObject; comment?: string } {
  const fields: JsonObject = {};
  const errors: Record<string, string> = {};
  let comment: string | undefined;
  for (const id of Object.keys(draft))
    if (!Object.hasOwn(transition.fields, id))
      errors[id] =
        "Ce champ ne figure plus dans la transition. Fermez puis recommencez le déplacement.";
  for (const [id, field] of Object.entries(transition.fields)) {
    const kind = fieldKind(id, field);
    const value = draft[id];
    const present = value !== undefined;
    const empty = Array.isArray(value) ? value.length === 0 : !value?.trim();
    const existing = id === "comment" ? undefined : current[id];
    const hasExisting = hasFieldValue(existing);
    if (kind === "unsupported") {
      if (present || (field.required && !hasExisting && !field.hasDefaultValue))
        errors[id] = "Ce champ doit être renseigné dans Jira.";
      continue;
    }
    if (!present) {
      if (field.required && !hasExisting && !field.hasDefaultValue)
        errors[id] = "Champ obligatoire.";
      continue;
    }
    if (empty) {
      if (field.required) errors[id] = "Champ obligatoire.";
      else if (id !== "comment") fields[id] = field.schema?.type === "array" ? [] : null;
      continue;
    }
    if (kind === "multiple" || kind === "select") {
      const selected = Array.isArray(value) ? value : [value];
      const allowed = new Set(choices(field).map((item) => item.value));
      if (
        selected.some((item) => !allowed.has(item)) ||
        (kind === "select" && selected.length !== 1)
      )
        errors[id] = "Choix devenu indisponible dans Jira.";
      else
        fields[id] =
          kind === "multiple"
            ? selected.map((item) => JSON.parse(item) as JsonValue)
            : (JSON.parse(selected[0] ?? "null") as JsonValue);
    } else if (typeof value !== "string") errors[id] = "Valeur invalide.";
    else if (id === "comment") comment = value;
    else if (kind === "number") {
      if (!Number.isFinite(Number(value))) errors[id] = "Nombre invalide.";
      else fields[id] = Number(value);
    } else if (kind === "date") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        errors[id] = "Date invalide.";
      else fields[id] = value;
    } else if (kind === "datetime-local") {
      if (!Number.isFinite(Date.parse(value))) errors[id] = "Date invalide.";
      else fields[id] = new Date(value).toISOString().replace("Z", "+0000");
    } else if (field.schema?.type === "array")
      fields[id] = value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    else fields[id] = kind === "textarea" ? plainDocument(value) : value;
  }
  if (Object.keys(errors).length) throw new TransitionInputError(errors);
  return { fields, ...(comment !== undefined ? { comment } : {}) };
}

/** Préremplissage lisible ; les documents riches non triviaux ne sont pas aplatis silencieusement. */
export function initialValue(
  id: string,
  field: JiraTransitionField,
  current: JsonObject,
): string | string[] {
  if (id === "comment") return "";
  const value = current[id] ?? field.defaultValue;
  const kind = fieldKind(id, field);
  const allowed = choices(field);
  const token = (item: JsonValue | undefined) => {
    if (isRecord(item)) {
      const candidate =
        typeof item.accountId === "string"
          ? { accountId: item.accountId }
          : item.id !== undefined
            ? { id: String(item.id) }
            : null;
      return allowed.find((choice) => choice.value === JSON.stringify(candidate))?.value ?? "";
    }
    return allowed.find((choice) => choice.value === JSON.stringify(item))?.value ?? "";
  };
  if (kind === "multiple") return Array.isArray(value) ? value.map(token).filter(Boolean) : [];
  if (kind === "select") return token(value);
  if (
    kind === "textarea" &&
    isRecord(value) &&
    value.type === "doc" &&
    Array.isArray(value.content)
  ) {
    const paragraphs = value.content;
    if (
      paragraphs.every(
        (node) =>
          isRecord(node) &&
          node.type === "paragraph" &&
          !node.attrs &&
          (node.content === undefined ||
            (Array.isArray(node.content) &&
              node.content.every(
                (child) =>
                  isRecord(child) &&
                  child.type === "text" &&
                  typeof child.text === "string" &&
                  !child.marks,
              ))),
      )
    ) {
      return paragraphs
        .map((node) =>
          isRecord(node) && Array.isArray(node.content)
            ? node.content.map((child) => (isRecord(child) ? child.text : "")).join("")
            : "",
        )
        .join("\n");
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    if (kind === "datetime-local") {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "";
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    return String(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string"))
    return value.join("\n");
  return "";
}
