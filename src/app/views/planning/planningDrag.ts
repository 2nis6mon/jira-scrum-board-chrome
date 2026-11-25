import { useState } from "preact/hooks";
import type {
  PlanningDestination,
  PlanningSection,
  PlanningViewModel,
} from "../../model/PlanningTypes";

/** Ticket glissé dans le planning : sa clé. */
export const PLANNING_DRAG_TYPE = "application/x-sprint-goals-planning-issue";

/** Ticket glissé depuis le sprint en préparation : seul lui peut en être retiré. */
export const PLANNING_SPRINT_DRAG_TYPE = "application/x-sprint-goals-planning-sprint-issue";

/**
 * Zone de dépôt d'un ou plusieurs tickets glissés portant `type` (leurs clés, séparées par des
 * espaces) ; `over` pendant le survol.
 */
export function useDrop(options: {
  type: string;
  disabled: boolean;
  onDrop(keys: string[]): void;
}) {
  const [over, setOver] = useState(false);
  const accepts = (transfer: DataTransfer | null) =>
    !options.disabled && Boolean(transfer?.types.includes(options.type));
  return {
    over: over && !options.disabled,
    handlers: {
      onDragOver: (event: DragEvent) => {
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        const current = event.currentTarget;
        if (
          !(event.relatedTarget instanceof Node) ||
          !(current instanceof Node) ||
          !current.contains(event.relatedTarget)
        )
          setOver(false);
      },
      onDrop: (event: DragEvent) => {
        setOver(false);
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const keys = (event.dataTransfer?.getData(options.type) ?? "")
          .split(" ")
          .filter((key) => key !== "");
        if (keys.length > 0) options.onDrop(keys);
      },
    },
  };
}

/** Un ticket : le geste d'une carte ; plusieurs : le geste du lot. */
export function placeKeys(
  planning: PlanningViewModel,
  keys: readonly string[],
  goalId: string | null,
) {
  const [key] = keys;
  if (keys.length === 1 && key !== undefined) return planning.placeIssue(key, goalId);
  return planning.placeIssues(keys, goalId);
}

export function removeKeys(
  planning: PlanningViewModel,
  keys: readonly string[],
  destination: PlanningDestination,
) {
  const [key] = keys;
  if (keys.length === 1 && key !== undefined) return planning.removeIssue(key, destination);
  return planning.removeIssues(keys, destination);
}

// ─── Colonne « Où sont les tickets » ─────────────────────────────────────────

export function sectionId(section: PlanningSection): string {
  return section.kind === "backlog" ? "backlog" : `${section.kind}-${section.sprint.id}`;
}
