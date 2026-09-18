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

/** Même identifiant que l'app Mac, pour que la règle intégrée se reconnaisse d'une app à l'autre. */
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
  return rule.jql.trim().replace(/\s+order\s+by\s+.*$/is, "");
}

/** Requête à soumettre à Jira pour une règle, restreinte aux sprints actifs. */
export function colorRuleQueries(rule: CardColorRule, sprintIds: readonly number[]): string[] {
  const base = scopedJql(rule);
  if (rule.kind !== null || base === "" || sprintIds.length === 0) return [];
  return [`(${base}) AND sprint in (${sprintIds.join(",")})`];
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
