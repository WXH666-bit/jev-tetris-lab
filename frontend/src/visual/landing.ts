import type { Board, Piece } from "../../../shared/types";
import { cells, collides } from "../../../shared/game/engine";
/** Row locations before compaction, derived from an actual locking piece. Pure presentation data. */
export function clearedRowPositions(board: Board, piece: Piece): number[] {
  if (collides(board, piece)) return [];
  const filled = board.map((r) => [...r]);
  for (const [x, y] of cells(piece)) filled[y][x] = 1;
  return filled.flatMap((row, y) => (row.every(Boolean) ? [y] : []));
}
