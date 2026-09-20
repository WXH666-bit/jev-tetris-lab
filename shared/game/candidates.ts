import { cells, collides, lock, move, spawn } from "./engine.js";
import type {
  Action,
  Board,
  Candidate,
  Game,
  GameDecisionState,
  Metrics,
  Piece,
} from "../types.js";
export const WEIGHTS = {
  lines: 10,
  holes: -7,
  aggregateHeight: -0.5,
  bumpiness: -0.35,
  maxHeight: -0.8,
  topOut: -10000,
};
export function metrics(b: Board): Metrics {
  const heights = Array.from({ length: 10 }, (_, x) => {
    const y = b.findIndex((r) => r[x] !== 0);
    return y < 0 ? 0 : 20 - y;
  });
  let holes = 0;
  for (let x = 0; x < 10; x++)
    for (let y = 20 - heights[x]; y < 20; y++) if (!b[y][x]) holes++;
  return {
    maxHeight: Math.max(...heights),
    aggregateHeight: heights.reduce((a, v) => a + v, 0),
    holes,
    bumpiness: heights
      .slice(1)
      .reduce((a, v, i) => a + Math.abs(v - heights[i]), 0),
  };
}
export function heuristic(a: Candidate["after"]) {
  return (
    a.clearedLines * WEIGHTS.lines +
    a.holes * WEIGHTS.holes +
    a.aggregateHeight * WEIGHTS.aggregateHeight +
    a.bumpiness * WEIGHTS.bumpiness +
    a.maxHeight * WEIGHTS.maxHeight +
    Number(a.topOut) * WEIGHTS.topOut
  );
}
export function candidates(g: Game): Candidate[] {
  if (g.over || collides(g.board, g.currentPiece)) return [];
  const key = (p: Piece) => `${p.x},${p.y},${p.rotation}`;
  const queue: { p: Piece; path: Action[] }[] = [
      { p: g.currentPiece, path: [] },
    ],
    seen = new Set([key(g.currentPiece)]),
    landings = new Map<string, Candidate>();
  for (let i = 0; i < queue.length; i++) {
    const { p, path } = queue[i];
    const target = move(g.board, p, "drop");
    const k = cells(target)
      .map((c) => c.join(","))
      .sort()
      .join("|");
    if (!landings.has(k)) {
      const sim = lock(g.board, target),
        after = {
          ...metrics(sim.board),
          clearedLines: sim.clearedLines,
          topOut: sim.topOut || collides(sim.board, spawn(g.nextPiece)),
        };
      landings.set(k, {
        id: `c${landings.size.toString().padStart(3, "0")}`,
        x: target.x,
        y: target.y,
        rotation: target.rotation,
        actions: [...path, "drop"],
        after,
        heuristicScore: heuristic(after),
      });
    }
    for (const a of ["left", "right", "cw", "ccw", "down"] as Action[]) {
      const n = move(g.board, p, a);
      if (n === p) continue;
      const nk = key(n);
      if (!seen.has(nk)) {
        seen.add(nk);
        queue.push({ p: n, path: [...path, a] });
      }
    }
  }
  return [...landings.values()].sort(
    (a, b) => b.heuristicScore - a.heuristicScore,
  );
}
export function filterCandidates(all: Candidate[], limit: number) {
  if (all.length <= limit) return all;
  const selected = all.slice(0, Math.max(1, Math.floor(limit / 2)));
  for (const c of all) {
    if (selected.length >= limit) break;
    if (!selected.some((s) => s.x === c.x && s.rotation === c.rotation))
      selected.push(c);
  }
  for (const c of all) {
    if (selected.length >= limit) break;
    if (!selected.includes(c)) selected.push(c);
  }
  return selected;
}
export function snapshot(g: Game, list: Candidate[]): GameDecisionState {
  return {
    sessionId: g.sessionId,
    stateVersion: g.stateVersion,
    pieceId: g.pieceId,
    board: g.board.map((r) => [...r]),
    currentPiece: { ...g.currentPiece },
    nextPiece: g.nextPiece,
    metrics: {
      ...metrics(g.board),
      score: g.score,
      clearedLines: g.clearedLines,
    },
    candidates: list,
  };
}
