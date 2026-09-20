import { z } from "zod";
import type { Questions } from "../lab/contracts.js";
export type Point = { x: number; y: number };
const pointSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(11),
});
export const pathStateSchema = z
  .object({
    seed: z.number().int().nonnegative(),
    grid: z
      .array(z.array(z.number().int().min(0).max(1)).length(12))
      .length(12),
    start: pointSchema,
    goal: pointSchema,
    position: pointSchema,
    visited: z.array(pointSchema).min(1).max(501),
    maxSteps: z.number().int().min(1).max(500),
    version: z.number().int().nonnegative(),
  })
  .superRefine((s, ctx) => {
    for (const k of ["start", "goal", "position"] as const)
      if (s.grid[s[k].y][s[k].x])
        ctx.addIssue({ code: "custom", path: [k], message: "不能位于障碍中" });
  });
export type PathState = z.infer<typeof pathStateSchema>;
export type PathCandidate = Point & {
  id: string;
  label: string;
  distance: number;
  visits: number;
};
const directions = [
  { id: "up", label: "向上", x: 0, y: -1 },
  { id: "right", label: "向右", x: 1, y: 0 },
  { id: "down", label: "向下", x: 0, y: 1 },
  { id: "left", label: "向左", x: -1, y: 0 },
];
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export function shortestPath(
  grid: number[][],
  start: Point,
  goal: Point,
): Point[] {
  const key = (p: Point) => `${p.x},${p.y}`;
  const queue = [start],
    seen = new Set([key(start)]),
    parents = new Map<string, Point>();
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (samePoint(p, goal)) {
      const out = [p];
      let c = p;
      while (!samePoint(c, start)) {
        c = parents.get(key(c))!;
        out.push(c);
      }
      return out.reverse();
    }
    for (const d of directions) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (
        n.x < 0 ||
        n.x >= 12 ||
        n.y < 0 ||
        n.y >= 12 ||
        grid[n.y][n.x] ||
        seen.has(key(n))
      )
        continue;
      seen.add(key(n));
      parents.set(key(n), p);
      queue.push(n);
    }
  }
  return [];
}
export function createPath(seed = 42, maxSteps = 100): PathState {
  let rng = seed >>> 0;
  const rand = () =>
    (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296;
  const grid = Array.from({ length: 12 }, () =>
    Array.from({ length: 12 }, () => (rand() < 0.25 ? 1 : 0)),
  );
  // Carve one deterministic route; random obstacles elsewhere remain fully visible.
  let x = 0,
    y = 0;
  grid[0][0] = 0;
  while (x < 11 || y < 11) {
    if (x < 11 && (y === 11 || rand() < 0.5)) x++;
    else y++;
    grid[y][x] = 0;
  }
  return {
    seed: seed >>> 0,
    grid,
    start: { x: 0, y: 0 },
    goal: { x: 11, y: 11 },
    position: { x: 0, y: 0 },
    visited: [{ x: 0, y: 0 }],
    maxSteps,
    version: 0,
  };
}
export function pathCandidates(s: PathState): PathCandidate[] {
  return directions
    .flatMap((d) => {
      const p = { x: s.position.x + d.x, y: s.position.y + d.y };
      if (p.x < 0 || p.x >= 12 || p.y < 0 || p.y >= 12 || s.grid[p.y][p.x])
        return [];
      const route = shortestPath(s.grid, p, s.goal);
      return [
        {
          ...p,
          id: d.id,
          label: d.label,
          distance: route.length ? route.length - 1 : 999,
          visits: s.visited.filter((v) => samePoint(v, p)).length,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance || a.visits - b.visits);
}
export function pathQuestions(s: PathState): Questions {
  return {
    move: {
      type: "choice",
      instructions:
        "地图完全可见。只从相邻合法动作中选择一步，向终点前进，避免循环。distance 是程序提供的 BFS 基线距离，不要求必须遵循。",
      criteria: Object.fromEntries(
        pathCandidates(s).map((c) => [
          c.id,
          `${c.label} (${c.x},${c.y}); 距终点 ${c.distance} 步; 访问过 ${c.visits} 次`,
        ]),
      ),
    },
  };
}
export function applyPath(s: PathState, id: string): PathState {
  const c = pathCandidates(s).find((c) => c.id === id);
  if (!c) throw Error("非法路径动作");
  if (pathTerminal(s)) throw Error("运行已终止");
  const p = { x: c.x, y: c.y };
  return {
    ...s,
    position: p,
    visited: [...s.visited, p],
    version: s.version + 1,
  };
}
export function pathTerminal(s: PathState): "success" | "exhausted" | null {
  return samePoint(s.position, s.goal)
    ? "success"
    : s.visited.length - 1 >= s.maxSteps
      ? "exhausted"
      : null;
}
export function pathMetrics(s: PathState) {
  return {
    到达终点: samePoint(s.position, s.goal),
    实际步数: s.visited.length - 1,
    最短路径步数: Math.max(0, shortestPath(s.grid, s.start, s.goal).length - 1),
    重复访问次数:
      s.visited.length - new Set(s.visited.map((p) => `${p.x},${p.y}`)).size,
  };
}
export const pathDefinition = {
  id: "pathfinding",
  name: "路径规划实验",
  english: "Pathfinding Lab",
  version: "1.0.0",
  description:
    "在完全可见的地图上逐步抵达目标，观察模型如何坚持目标、避免循环。",
  ability: "多步规划 · 目标一致性 · 重复决策",
  modes: ["mock", "local", "real"] as const,
  kind: "turn" as const,
  baselineVersion: "bfs-v1",
  validateInput(state: unknown, _questions: unknown) {
    const parsed = pathStateSchema.parse(state);
    if (pathTerminal(parsed))
      throw new z.ZodError([
        { code: "custom", path: ["state"], message: "路径运行已经结束" },
      ]);
    return { state: parsed, questions: pathQuestions(parsed) };
  },
  create: createPath,
  candidates: pathCandidates,
  questions: pathQuestions,
  execute: applyPath,
  metrics: pathMetrics,
  terminal: pathTerminal,
};
