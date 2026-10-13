import type { JiraClient } from "../jira/client";
import { type BoardJqlScope, inBoardScope, withoutOrderBy } from "./jql";
import { moveAmongShown } from "./reorder";

/**
 * Couleur de fond appliquée aux cartes qui satisfont une requête JQL.
 *
 * Le JQL est évalué PAR JIRA à chaque synchronisation : l'application ne l'interprète pas. La
 * première règle active satisfaite, dans l'ordre de la liste, l'emporte. Réglage local.
 */
export interface CardColorRule {
  readonly id: string;
  readonly name: string;
  readonly jql: string;
  /** Nom d'une couleur de `CARD_COLOR_PALETTE`. */
  readonly color: string;
  readonly enabled: boolean;
  /**
   * `addedAfterSprintStart` : règle intégrée, sans JQL — l'information vient du changelog Jira
   * déjà lu par l'application. `null` : règle JQL.
   */
  readonly kind: "addedAfterSprintStart" | null;
}

export const CARD_COLOR_PALETTE = [
  "blue",
  "teal",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "gray",
] as const;

/** Noms affichés des couleurs. */
export const CARD_COLOR_LABEL: Record<string, string> = {
  blue: "Bleu",
  teal: "Turquoise",
  green: "Vert",
  yellow: "Jaune",
  orange: "Orange",
  red: "Rouge",
  pink: "Rose",
  purple: "Violet",
  gray: "Gris",
};

/** Identifiant persisté de la règle intégrée, conservé entre versions. */
export const SCOPE_CHANGE_RULE_ID = "5C0DE000-0000-4000-8000-000000000001";

/** Règle intégrée « ajouté en cours de sprint », bleue par défaut. */
export const SCOPE_CHANGE_RULE: CardColorRule = {
  id: SCOPE_CHANGE_RULE_ID,
  name: "Ajouté en cours de sprint",
  jql: "",
  color: "blue",
  enabled: true,
  kind: "addedAfterSprintStart",
};

/**
 * Liste complète et ordonnée : la règle intégrée est ajoutée en dernier (priorité la plus basse)
 * tant que l'utilisateur ne l'a pas placée lui-même.
 */
export function withBuiltInRules(rules: readonly CardColorRule[]): CardColorRule[] {
  return rules.some((rule) => rule.kind === "addedAfterSprintStart")
    ? [...rules]
    : [...rules, SCOPE_CHANGE_RULE];
}

/** JQL prêt à être combiné : sans clause `ORDER BY`, que Jira refuserait entre parenthèses. */
export function scopedJql(rule: CardColorRule): string {
  return withoutOrderBy(rule.jql);
}

/** Requête à soumettre à Jira pour une règle, restreinte au périmètre Scrum ou Kanban. */
export function colorRuleQueries(
  rule: CardColorRule,
  sprintIds: readonly number[],
  scope: Omit<BoardJqlScope, "sprintIds"> = {},
): string[] {
  const query = rule.kind === null ? inBoardScope(rule.jql, { ...scope, sprintIds }) : null;
  return query === null ? [] : [query];
}

/**
 * Couleur retenue par ticket : la première règle active satisfaite, DANS L'ORDRE DE LA LISTE,
 * l'emporte. La règle intégrée y participe au même titre que les règles JQL, à sa position.
 *
 * `matches` : clés des tickets que Jira a retournés pour chaque règle (par identifiant de règle).
 */
export function resolveCardColors(
  rules: readonly CardColorRule[],
  matches: Readonly<Record<string, ReadonlySet<string>>>,
  addedAfterSprintStart: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const keys = rule.kind === "addedAfterSprintStart" ? addedAfterSprintStart : matches[rule.id];
    for (const key of keys ?? []) colors[key] ??= rule.color;
  }
  return colors;
}

// ─── Évaluation par Jira ─────────────────────────────────────────────────────

/** Lecture dont les règles ont besoin. `JiraClient` la fournit. */
export type ColorRuleReader = Pick<JiraClient, "boardIssues">;

export interface ColorRuleEvaluation {
  /** Tickets AFFICHÉS retenus par Jira pour chaque règle JQL active, par identifiant de règle. */
  readonly matches: Record<string, Set<string>>;
  /** Refus de Jira, par règle : cette règle est ignorée, les autres restent appliquées. */
  readonly issues: Record<string, string>;
}

/**
 * Demande à Jira quels tickets affichés satisfont chaque règle active. Lecture seule : chaque
 * JQL, restreint aux sprints actifs ou au sous-filtre Kanban, est évalué par Jira ; un JQL refusé
 * est signalé sous sa règle sans empêcher les autres.
 */
export async function evaluateColorRules(
  reader: ColorRuleReader,
  input: BoardJqlScope & {
    boardId: number;
    rules: readonly CardColorRule[];
    displayedKeys: ReadonlySet<string>;
  },
): Promise<ColorRuleEvaluation> {
  const matches: Record<string, Set<string>> = {};
  const issues: Record<string, string> = {};
  for (const rule of input.rules) {
    if (!rule.enabled || rule.kind !== null) continue;
    try {
      const keys = new Set<string>();
      for (const jql of colorRuleQueries(rule, input.sprintIds, input)) {
        const found = await reader.boardIssues(input.boardId, jql, {
          estimationFieldId: null,
          includeChangelog: false,
          onlyFields: ["issuetype", "status"],
        });
        for (const issue of found) if (input.displayedKeys.has(issue.key)) keys.add(issue.key);
      }
      matches[rule.id] = keys;
    } catch (error) {
      issues[rule.id] = error instanceof Error ? error.message : String(error);
    }
  }
  return { matches, issues };
}

/** Règles à enregistrer : noms et JQL nettoyés ; une règle JQL sans requête n'a pas de sens. */
export function cleanedColorRules(rules: readonly CardColorRule[]): CardColorRule[] {
  return rules
    .map((rule) => ({ ...rule, name: rule.name.trim(), jql: rule.jql.trim() }))
    .filter((rule) => rule.kind !== null || rule.jql !== "");
}

/**
 * Place la règle `id` juste avant la règle `before` parmi les règles montrées (`null` : après la
 * dernière montrée). Une règle non montrée (la règle intégrée en Kanban) garde son rang relatif.
 */
export function moveColorRule(
  rules: readonly CardColorRule[],
  id: string,
  before: string | null,
  shown: (rule: CardColorRule) => boolean = () => true,
): CardColorRule[] {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const visible = (ruleId: string) => {
    const rule = byId.get(ruleId);
    return rule !== undefined && shown(rule);
  };
  return moveAmongShown([...byId.keys()], id, before, visible).flatMap((ruleId) => {
    const rule = byId.get(ruleId);
    return rule ? [rule] : [];
  });
}

/** Couleur proposée pour une nouvelle règle : la première que n'utilise aucune autre. */
export function nextRuleColor(rules: readonly CardColorRule[]): string {
  const used = new Set(rules.map((rule) => rule.color));
  return CARD_COLOR_PALETTE.find((color) => !used.has(color)) ?? "orange";
}
