import { parseBlockIdentifier } from "./boardBlocks";
import {
  type BoardConfiguration,
  findSwimlane,
  swimlaneName,
  swimlaneOfType,
} from "./boardConfiguration";
import { settingsLaneOrder } from "./boardPreferences";

/**
 * Sous-section de « Sans objectif » dans le planning : la swimlane par type des réglages du board
 * (`swimlaneId`), ou Build (`null`) pour un type sans swimlane ou ignoré.
 */
export interface TypeLaneGroup<T> {
  readonly swimlaneId: string | null;
  readonly name: string;
  readonly items: readonly T[];
}

/**
 * Range des tickets sans objectif dans les swimlanes par type des réglages du board, dans l'ordre
 * du board. Une swimlane masquée sur le board reste affichée : le planning montre tout le sprint, et
 * un type ignoré ou sans swimlane rejoint Build, pour qu'aucun ticket ne disparaisse. Les
 * sous-sections sans ticket sont omises. Ne lit ni n'écrit rien dans Jira.
 */
export function splitByTypeLane<T>(
  configuration: BoardConfiguration,
  items: readonly T[],
  typeId: (item: T) => string,
): TypeLaneGroup<T>[] {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const id = swimlaneOfType(configuration, typeId(item))?.id ?? null;
    const group = groups.get(id);
    if (group) group.push(item);
    else groups.set(id, [item]);
  }
  const result: TypeLaneGroup<T>[] = [];
  for (const identifier of settingsLaneOrder(configuration)) {
    const block = parseBlockIdentifier(identifier);
    if (!block || block.kind === "goal") continue;
    const id = block.kind === "swimlane" ? block.swimlaneId : null;
    const list = groups.get(id);
    if (!list) continue;
    const swimlane = id === null ? null : findSwimlane(configuration, id);
    result.push({
      swimlaneId: id,
      name: swimlane
        ? swimlaneName(configuration, swimlane)
        : configuration.buildSectionLabel || "Build",
      items: list,
    });
  }
  return result;
}
