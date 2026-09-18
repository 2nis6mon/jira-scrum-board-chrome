import type { SprintGoal } from "./sprintGoals";

/**
 * Bloc affichable du board : la swimlane d'un objectif, Build (tickets du sprint sans objectif)
 * ou RUN. L'ordre des blocs est une préférence LOCALE : rien n'est écrit dans Jira.
 */
export type BoardBlock =
  | { readonly kind: "goal"; readonly goalId: string }
  | { readonly kind: "build" }
  | { readonly kind: "run" };

export const BUILD_BLOCK: BoardBlock = { kind: "build" };
export const RUN_BLOCK: BoardBlock = { kind: "run" };

export function goalBlock(goalId: string): BoardBlock {
  return { kind: "goal", goalId };
}

/** Forme enregistrée d'un bloc : `goal:<id>`, `build` ou `run`. */
export function blockIdentifier(block: BoardBlock): string {
  return block.kind === "goal" ? `goal:${block.goalId}` : block.kind;
}

export function parseBlockIdentifier(identifier: string): BoardBlock | null {
  if (identifier === "build") return BUILD_BLOCK;
  if (identifier === "run") return RUN_BLOCK;
  if (!identifier.startsWith("goal:")) return null;
  return goalBlock(identifier.slice("goal:".length));
}

/** Ordre obtenu en plaçant `id` juste avant `target` (`null` = en dernier). */
export function moveBlock(id: string, target: string | null, order: readonly string[]): string[] {
  if (!order.includes(id) || target === id) return [...order];
  const result = order.filter((item) => item !== id);
  const index = target === null ? -1 : result.indexOf(target);
  if (index >= 0) result.splice(index, 0, id);
  else result.push(id);
  return result;
}

/** Ordre obtenu en décalant `id` de `offset` rangs, sans sortir de la liste. */
export function shiftBlock(id: string, offset: number, order: readonly string[]): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const to = Math.min(Math.max(0, from + offset), order.length - 1);
  if (to === from) return [...order];
  const result = [...order];
  result.splice(from, 1);
  result.splice(to, 0, id);
  return result;
}

/**
 * Blocs réellement affichés selon l'état des filtres.
 *
 * - Filtre actif : un bloc sans aucun ticket retenu disparaît, pour ne montrer que ce qui
 *   répond au filtre.
 * - Aucun filtre : toutes les swimlanes restent visibles, même vides — un objectif sans ticket
 *   doit se voir, et Build sert de cible de dépôt.
 *
 * Le bloc RUN fait exception dans le second cas : il n'apparaît que si le sprint contient des
 * tickets RUN.
 */
export function displayedBlocks(input: {
  blocks: readonly BoardBlock[];
  filtersActive: boolean;
  filteredCount: (block: BoardBlock) => number;
  sprintHasRunIssues: boolean;
}): BoardBlock[] {
  return input.blocks.filter((block) => {
    if (block.kind === "run" && !input.sprintHasRunIssues) return false;
    return input.filtersActive ? input.filteredCount(block) > 0 : true;
  });
}

/**
 * Construit la liste ordonnée des blocs à afficher.
 *
 * L'ordre est entièrement manuel : objectifs, Build et RUN se placent où l'utilisateur les a
 * mis. Un objectif apparu depuis rejoint les autres objectifs, juste après le dernier. Build et
 * RUN absents de l'ordre enregistré vont en bas, dans cet ordre.
 *
 * (L'app Mac garde en plus un mode de compatibilité pour les ordres enregistrés avant sa 2.2,
 * où Build et RUN ne se déplaçaient pas. L'extension n'a pas cet historique.)
 */
export function resolveBlocks(input: {
  goals: readonly SprintGoal[];
  storedOrder: readonly string[];
  includeBuild: boolean;
  includeRun: boolean;
}): BoardBlock[] {
  const known = new Set(input.goals.map((goal) => goal.id));
  const placed = new Set<string>();
  const blocks: BoardBlock[] = [];

  for (const identifier of input.storedOrder) {
    const block = parseBlockIdentifier(identifier);
    if (!block || placed.has(identifier)) continue;
    const kept =
      (block.kind === "goal" && known.has(block.goalId)) ||
      (block.kind === "build" && input.includeBuild) ||
      (block.kind === "run" && input.includeRun);
    if (!kept) continue;
    blocks.push(block);
    placed.add(identifier);
  }

  const newGoals = [...input.goals]
    .sort((a, b) => a.position - b.position)
    .map((goal) => goalBlock(goal.id))
    .filter((block) => !placed.has(blockIdentifier(block)));
  const lastGoalIndex = blocks.findLastIndex((block) => block.kind === "goal");
  blocks.splice(lastGoalIndex + 1, 0, ...newGoals);

  if (input.includeBuild && !placed.has("build")) blocks.push(BUILD_BLOCK);
  if (input.includeRun && !placed.has("run")) blocks.push(RUN_BLOCK);
  return blocks;
}
