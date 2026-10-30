import { displayValues, type JiraIssueFields } from "../jira/models";

/**
 * Champ supplémentaire affiché sur les cartes, comme la disposition des cartes de Jira. Au plus
 * `MAX_CARD_FIELDS` par board ; le parent, lui, est toujours affiché. Réglage local, lecture seule.
 */
export type CardField =
  | { readonly kind: "fixVersions" | "affectsVersions" | "labels" | "components" }
  | {
      readonly kind: "custom";
      readonly customFieldId: string;
      readonly customFieldName: string | null;
    };

export const MAX_CARD_FIELDS = 3;

export function cardFieldId(field: CardField): string {
  return field.kind === "custom" ? `custom:${field.customFieldId}` : field.kind;
}

/** Champ à demander à Jira en plus de la liste de base. Labels et composants y sont déjà. */
export function cardFieldJiraId(field: CardField): string | null {
  switch (field.kind) {
    case "fixVersions":
      return "fixVersions";
    case "affectsVersions":
      return "versions";
    case "labels":
    case "components":
      return null;
    case "custom":
      return field.customFieldId;
  }
}

/** Valeurs à afficher pour ce ticket. Vide : rien n'est affiché. */
export function cardFieldValues(field: CardField, fields: JiraIssueFields): string[] {
  switch (field.kind) {
    case "fixVersions":
      return fields.fixVersions.map((version) => version.name);
    case "affectsVersions":
      return fields.affectsVersions.map((version) => version.name);
    case "labels":
      return [...fields.labels];
    case "components":
      return fields.components.map((component) => component.name);
    case "custom":
      return displayValues(fields, field.customFieldId);
  }
}
