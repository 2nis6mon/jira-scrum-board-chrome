import { parseBlockIdentifier } from "../../../core/boardBlocks";
import { isBlockCollapsed } from "../../../core/boardConfiguration";
import type { BoardModel } from "../../model/BoardModel";

/**
 * Type de donnée du glissé d'une swimlane, depuis le board ou la barre latérale. Propre à
 * l'extension : une case du board ne l'accepte jamais, ni une swimlane une carte.
 */
export const LANE_DRAG_TYPE = "application/x-scrum-board-lane";

/** Amène une swimlane à l'écran, dépliée si elle était repliée (réglage local). */
export async function revealLane(board: BoardModel, laneId: string): Promise<void> {
  const configuration = board.configuration.value;
  const block = parseBlockIdentifier(laneId);
  if (configuration && block && isBlockCollapsed(configuration, block)) {
    await board.toggleLaneCollapsed(block);
  }
  // Après le rendu : la swimlane vient peut-être d'être dépliée, ou le board d'être affiché.
  requestAnimationFrame(() => {
    const lane = [...document.querySelectorAll<HTMLElement>("[data-lane-id]")].find(
      (element) => element.dataset.laneId === laneId,
    );
    lane?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
