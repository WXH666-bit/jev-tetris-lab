import { describe, it, expect } from "vitest";
import {
  cells,
  collides,
  emptyBoard,
  lock,
  move,
  newGame,
  spawn,
  step,
  TYPES,
} from "../shared/game/engine";
import { candidates, metrics } from "../shared/game/candidates";
describe("game rules", () => {
  it("7-bag and fixed seeds are deterministic", () => {
    let a = newGame(17),
      b = newGame(17);
    const pieces = [];
    for (let i = 0; i < 7; i++) {
      pieces.push(a.currentPiece.type);
      expect(a.currentPiece.type).toBe(b.currentPiece.type);
      a = step(a, "drop");
      b = step(b, "drop");
    }
    expect(new Set(pieces)).toEqual(new Set(TYPES));
  });
  it("collision, walls and horizontal rotation kicks", () => {
    const board = emptyBoard();
    expect(collides(board, { ...spawn("O"), x: -1 })).toBe(true);
    const p = { ...spawn("T"), x: 0, rotation: 1 };
    expect(collides(board, move(board, p, "ccw"))).toBe(false);
    let q = spawn("I");
    for (let i = 0; i < 4; i++) q = move(board, q, "cw");
    expect(cells(q)).toEqual(cells(spawn("I")));
    board[1][3] = 1;
    expect(collides(board, spawn("I"))).toBe(true);
  });
  it("clears lines simultaneously and shifts board", () => {
    const b = emptyBoard();
    b[18] = Array(10).fill(1);
    b[19] = Array(10).fill(1);
    b[18][4] = b[18][5] = b[19][4] = b[19][5] = 0;
    const r = lock(b, { ...spawn("O"), y: 18 });
    expect(r.clearedLines).toBe(2);
    expect(r.board).toEqual(emptyBoard());
    expect(b[19][4]).toBe(0);
  });
  it("measures holes and heights after landing", () => {
    const b = emptyBoard();
    b[17][0] = 1;
    b[19][0] = 1;
    expect(metrics(b)).toEqual({
      maxHeight: 3,
      aggregateHeight: 3,
      holes: 1,
      bumpiness: 3,
    });
  });
  it("hard drop locks, increments version and spawns next piece", () => {
    const g = newGame(42);
    const n = step(g, "drop");
    expect(n.pieces).toBe(1);
    expect(n.currentPiece.type).toBe(g.nextPiece);
    expect(n.stateVersion).toBeGreaterThan(g.stateVersion);
    expect(n.board.flat().filter(Boolean)).toHaveLength(4);
  });
  it("every BFS candidate has a legal executable path, including under overhangs", () => {
    for (const seed of [2, 17, 42]) {
      let g = newGame(seed);
      for (let round = 0; round < 12 && !g.over; round++) {
        const list = candidates(g);
        expect(list.length).toBeGreaterThan(0);
        for (const c of list) {
          let p = g.currentPiece;
          for (const a of c.actions) {
            const n = move(g.board, p, a);
            expect(collides(g.board, n)).toBe(false);
            if (a !== "drop") expect(n).not.toBe(p);
            p = n;
          }
          expect([p.x, p.y, p.rotation]).toEqual([c.x, c.y, c.rotation]);
          const after = lock(g.board, p);
          expect(metrics(after.board)).toEqual({
            maxHeight: c.after.maxHeight,
            aggregateHeight: c.after.aggregateHeight,
            holes: c.after.holes,
            bumpiness: c.after.bumpiness,
          });
          expect(after.clearedLines).toBe(c.after.clearedLines);
        }
        for (const a of list[0].actions) g = step(g, a);
      }
    }
  });
  it("local policy can actually clear lines over a reproducible run", () => {
    let g = newGame(42);
    for (let i = 0; i < 70 && !g.over; i++) {
      const c = candidates(g)[0];
      for (const a of c.actions) g = step(g, a);
    }
    expect(g.clearedLines).toBeGreaterThan(0);
    expect(g.score).toBeGreaterThan(0);
  });
});
