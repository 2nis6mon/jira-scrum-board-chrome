import type { BoardIssue } from "./boardIssue";

/**
 * Couleur du badge « parent » des cartes (demande de Denis, sans équivalent sur le Mac, qui
 * affiche le parent en texte). Tous les tickets d'un même parent partagent sa couleur ; deux
 * parents du board n'ont jamais la même. Non configurable pour l'instant.
 *
 * Une couleur est une teinte (0–360) et une intensité. Les douze premières teintes sont choisies
 * à l'œil, loin du rouge de « Bloqué », de l'orange de l'ancienneté et du violet de « Ajouté » ;
 * au-delà, les teintes suivent l'angle d'or, en intensité « soutenue » pour ne jamais retomber
 * sur une couleur de la première série.
 */
export interface ParentColor {
  readonly hue: number;
  readonly tone: "light" | "deep";
}

export const PARENT_HUES: readonly number[] = [
  212, 145, 318, 55, 186, 236, 95, 290, 120, 336, 165, 75,
];

const GOLDEN_ANGLE = 137.508;

export function parentColor(slot: number): ParentColor {
  const hue = PARENT_HUES[slot];
  if (hue !== undefined) return { hue, tone: "light" };
  const rank = slot - PARENT_HUES.length;
  return { hue: Math.round((20 + rank * GOLDEN_ANGLE) % 360), tone: "deep" };
}

/**
 * Couleur de chaque parent des tickets du board (clé du parent → couleur). À calculer sur TOUS
 * les tickets du sprint, pas sur ceux que les filtres laissent voir : un parent garde sa couleur
 * quand on filtre. Les parents sont classés par clé (projet, puis numéro) : un parent créé après
 * les autres, donc de numéro plus grand, prend la couleur suivante sans décaler les autres.
 */
export function parentColors(issues: readonly BoardIssue[]): ReadonlyMap<string, ParentColor> {
  const keys = new Set<string>();
  for (const { issue } of issues) {
    const parent = issue.fields.parent;
    if (parent) keys.add(parent.key);
  }
  return new Map([...keys].sort(compareIssueKeys).map((key, slot) => [key, parentColor(slot)]));
}

/** Ordre des clés Jira : projet, puis numéro (ABC-9 avant ABC-10). */
export function compareIssueKeys(a: string, b: string): number {
  const [projectA, numberA] = splitKey(a);
  const [projectB, numberB] = splitKey(b);
  if (projectA !== projectB) return projectA < projectB ? -1 : 1;
  if (numberA !== numberB) return numberA - numberB;
  return a < b ? -1 : a > b ? 1 : 0;
}

function splitKey(key: string): [string, number] {
  const dash = key.lastIndexOf("-");
  const number = dash < 0 ? Number.NaN : Number(key.slice(dash + 1));
  return Number.isInteger(number) ? [key.slice(0, dash), number] : [key, 0];
}
