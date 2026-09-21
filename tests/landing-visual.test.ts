import { describe, it, expect } from "vitest";
import { emptyBoard, lock } from "../shared/game/engine";
import { clearedRowPositions } from "../frontend/src/visual/landing";

describe("lock presentation derives rows before compaction", () => {
  it("lights only the two rows actually completed by the locking square", () => {
    const board = emptyBoard();
    board[18] = Array(10).fill(1);
    board[19] = Array(10).fill(2);
    for (const y of [18, 19]) {
      board[y][4] = 0;
      board[y][5] = 0;
    }
    const before = structuredClone(board),
      piece = { type: "O" as const, x: 4, y: 18, rotation: 0 };
    expect(clearedRowPositions(board, piece)).toEqual([18, 19]);
    expect(lock(board, piece).clearedLines).toBe(2);
    expect(board).toEqual(before);
  });
  it("does not flash incomplete rows or invalid poses", () => {
    const board = emptyBoard();
    expect(
      clearedRowPositions(board, { type: "T", x: 3, y: 18, rotation: 0 }),
    ).toEqual([]);
    expect(
      clearedRowPositions(board, { type: "O", x: 9, y: 18, rotation: 0 }),
    ).toEqual([]);
  });
  it("keeps nonadjacent completed rows at their original visual coordinates", () => {
    const board = emptyBoard();
    for (const y of [16, 18]) {
      board[y] = Array(10).fill(1);
      board[y][4] = 0;
    }
    const piece = { type: "I" as const, x: 2, y: 16, rotation: 1 };
    expect(clearedRowPositions(board, piece)).toEqual([16, 18]);
    expect(lock(board, piece).clearedLines).toBe(2);
  });
});
