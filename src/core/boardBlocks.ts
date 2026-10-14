import type { SprintGoal } from "./sprintGoals";

/**
 * Bloc affichable du board : la swimlane d'un objectif, Build (tickets par objectif sans objectif)
 * ou une swimlane par type (`TicketSwimlane`).
 */
export type BoardBlock =
  | { readonly kind: "goal"; readonly goalId: string }
  | { readonly kind: "build" }
  | { readonly kind: "swimlane"; readonly swimlaneId: string };

export const BUILD_BLOCK: BoardBlock = { kind: "build" };

export function goalBlock(goalId: string): BoardBlock {
  return { kind: "goal", goalId };
}

export function swimlaneBlock(swimlaneId: string): BoardBlock {
  return { kind: "swimlane", swimlaneId };
}

/** Forme enregistrée d'un bloc : `goal:<id>`, `build` ou `swimlane:<id>`. */
export function blockIdentifier(block: BoardBlock): string {
  if (block.kind === "goal") return `goal:${block.goalId}`;
  return block.kind === "swimlane" ? `swimlane:${block.swimlaneId}` : "build";
}

export function parseBlockIdentifier(identifier: string): BoardBlock | null {
  if (identifier === "build") return BUILD_BLOCK;
  if (identifier.startsWith("swimlane:"))
    return swimlaneBlock(identifier.slice("swimlane:".length));
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
 * Seuls les objectifs réellement vides restent visibles. Build et les swimlanes par type
 * disparaissent sans tickets ; la destination par défaut peut réapparaître pendant un déplacement
 * pour permettre de détacher un ticket de son objectif.
 * Un filtre actif masque aussi les blocs non vides dont aucun ticket n'est retenu, sauf la
 * destination du déplacement : ses cases restent vides, les filtres continuent de s'appliquer.
 */
export function displayedBlocks(input: {
  blocks: readonly BoardBlock[];
  filtersActive: boolean;
  filteredCount: (block: BoardBlock) => number;
  totalCount: (block: BoardBlock) => number;
  showEmptyBuild?: boolean;
  showEmptySwimlaneId?: string;
}): BoardBlock[] {
  const shown: BoardBlock[] = [];
  const revealed: BoardBlock[] = [];
  for (const block of input.blocks) {
    const normallyShown =
      input.totalCount(block) === 0
        ? block.kind === "goal"
        : !input.filtersActive || input.filteredCount(block) > 0;
    if (normallyShown) shown.push(block);
    else if (
      (block.kind === "build" && input.showEmptyBuild === true) ||
      (block.kind === "swimlane" && block.swimlaneId === input.showEmptySwimlaneId)
    ) {
      revealed.push(block);
    }
  }
  // Une destination révélée pendant le drag arrive en bas : l'insérer avant la carte
  // source déplacerait celle-ci sous le pointeur et peut interrompre le drag natif du navigateur.
  return [...shown, ...revealed];
}

/**
 * Construit la liste ordonnée des blocs à afficher.
 *
 * L'ordre est entièrement manuel : objectifs, Build et swimlanes par type se placent où
 * l'utilisateur les a mis. Un objectif apparu depuis rejoint les autres objectifs, juste après le
 * dernier. Build puis les swimlanes par type absents de l'ordre enregistré vont en bas, dans l'ordre
 * de `swimlaneIds`.
 */
export function resolveBlocks(input: {
  goals: readonly SprintGoal[];
  storedOrder: readonly string[];
  includeBuild: boolean;
  /** Swimlanes par type affichées (non masquées), dans leur ordre de création. */
  swimlaneIds: readonly string[];
}): BoardBlock[] {
  const known = new Set(input.goals.map((goal) => goal.id));
  const swimlanes = new Set(input.swimlaneIds);
  const placed = new Set<string>();
  const blocks: BoardBlock[] = [];

  for (const identifier of input.storedOrder) {
    const block = parseBlockIdentifier(identifier);
    if (!block || placed.has(identifier)) continue;
    const kept =
      (block.kind === "goal" && known.has(block.goalId)) ||
      (block.kind === "build" && input.includeBuild) ||
      (block.kind === "swimlane" && swimlanes.has(block.swimlaneId));
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
  for (const id of input.swimlaneIds) {
    const block = swimlaneBlock(id);
    if (!placed.has(blockIdentifier(block))) blocks.push(block);
  }
  return blocks;
}
