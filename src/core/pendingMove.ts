import { type BoardBlock, blockIdentifier } from "./boardBlocks";
import type { BoardIssue } from "./boardIssue";
import type { BoardLayout } from "./boardLayout";

export interface PendingMove {
  readonly issue: BoardIssue;
  readonly block: BoardBlock;
  readonly columnId: string;
  readonly beforeKey: string | null;
}

/** Projection visuelle seulement : le snapshot et les compteurs restent ceux confirmés par Jira. */
export function withPendingMove(layout: BoardLayout, move: PendingMove | null): BoardLayout {
  if (!move) return layout;
  const destination = blockIdentifier(move.block);
  if (
    !layout.lanes.some(
      (lane) =>
        lane.id === destination && lane.cells.some((cell) => cell.column.id === move.columnId),
    )
  )
    return layout;
  const key = move.issue.issue.key;
  return {
    ...layout,
    lanes: layout.lanes.map((lane) => ({
      ...lane,
      cells: lane.cells.map((cell) => {
        const issues = cell.issues.filter((issue) => issue.issue.key !== key);
        if (lane.id === destination && cell.column.id === move.columnId) {
          const before = issues.findIndex((issue) => issue.issue.key === move.beforeKey);
          issues.splice(before < 0 ? issues.length : before, 0, move.issue);
        }
        return { ...cell, issues };
      }),
    })),
  };
}
