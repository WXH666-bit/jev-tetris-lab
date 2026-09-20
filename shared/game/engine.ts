import type { Action, Board, Game, Piece, PieceType } from "../types.js";
export const TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];
const BASE: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};
export function cells(p: Piece): [number, number][] {
  let m = BASE[p.type];
  for (let r = 0; r < p.rotation; r++)
    m = m[0].map((_, x) => m.map((row) => row[x]).reverse());
  return m.flatMap((row, y) =>
    row.flatMap((v, x) => (v ? [[x + p.x, y + p.y] as [number, number]] : [])),
  );
}
export const emptyBoard = (): Board =>
  Array.from({ length: 20 }, () => Array(10).fill(0));
export function collides(b: Board, p: Piece) {
  return cells(p).some(
    ([x, y]) => x < 0 || x >= 10 || y < 0 || y >= 20 || b[y][x] !== 0,
  );
}
// Simplified rotation: center of NxN matrix, horizontal kicks 0,-1,+1,-2,+2. No vertical kicks.
export function move(b: Board, p: Piece, a: Action): Piece {
  if (a === "drop") {
    let n = p;
    while (!collides(b, { ...n, y: n.y + 1 })) n = { ...n, y: n.y + 1 };
    return n;
  }
  if (a === "cw" || a === "ccw") {
    const r = (p.rotation + (a === "cw" ? 1 : 3)) % 4;
    for (const dx of [0, -1, 1, -2, 2]) {
      const n = { ...p, rotation: r, x: p.x + dx };
      if (!collides(b, n)) return n;
    }
    return p;
  }
  const n = {
    ...p,
    x: p.x + (a === "left" ? -1 : a === "right" ? 1 : 0),
    y: p.y + (a === "down" ? 1 : 0),
  };
  return collides(b, n) ? p : n;
}
export function lock(b: Board, p: Piece) {
  const board = b.map((r) => [...r]);
  if (collides(b, p)) return { board, clearedLines: 0, topOut: true };
  for (const [x, y] of cells(p)) board[y][x] = TYPES.indexOf(p.type) + 1;
  const remaining = board.filter((r) => r.some((v) => v === 0));
  const clearedLines = 20 - remaining.length;
  return {
    board: [
      ...Array.from({ length: clearedLines }, () => Array(10).fill(0)),
      ...remaining,
    ],
    clearedLines,
    topOut: false,
  };
}
export function spawn(type: PieceType): Piece {
  return { type, rotation: 0, x: type === "O" ? 4 : 3, y: 0 };
}
function draw(
  bag: PieceType[],
  seed: number,
): { piece: PieceType; bag: PieceType[]; rng: number } {
  let pool = [...bag],
    rng = seed >>> 0;
  if (!pool.length) {
    pool = [...TYPES];
    for (let i = 6; i > 0; i--) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const j = Math.floor((rng / 4294967296) * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  return { piece: pool.shift()!, bag: pool, rng };
}
export function newGame(seed = 42, sessionId = crypto.randomUUID()): Game {
  const a = draw([], seed),
    b = draw(a.bag, a.rng);
  return {
    sessionId,
    stateVersion: 0,
    pieceId: `${sessionId}:0`,
    board: emptyBoard(),
    currentPiece: spawn(a.piece),
    nextPiece: b.piece,
    bag: b.bag,
    rng: b.rng,
    score: 0,
    clearedLines: 0,
    pieces: 0,
    over: false,
  };
}
export function step(g: Game, a: Action): Game {
  if (g.over) return g;
  const p = move(g.board, g.currentPiece, a);
  const landed = a === "drop" || (a === "down" && p === g.currentPiece);
  if (!landed)
    return p === g.currentPiece
      ? g
      : { ...g, currentPiece: p, stateVersion: g.stateVersion + 1 };
  const result = lock(g.board, p),
    d = draw(g.bag, g.rng),
    next = spawn(g.nextPiece),
    pieces = g.pieces + 1;
  return {
    ...g,
    board: result.board,
    currentPiece: next,
    nextPiece: d.piece,
    bag: d.bag,
    rng: d.rng,
    pieces,
    pieceId: `${g.sessionId}:${pieces}`,
    stateVersion: g.stateVersion + 1,
    score:
      g.score +
      ([0, 100, 300, 500, 800][result.clearedLines] ?? 0) *
        (1 + Math.floor(g.clearedLines / 10)),
    clearedLines: g.clearedLines + result.clearedLines,
    over: result.topOut || collides(result.board, next),
  };
}
