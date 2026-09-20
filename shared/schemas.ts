import { z } from "zod";
const n = z.number().finite();
const int = n.int();
export const providerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  protocol: z.enum(["openrouter-decisions", "typesafe-systemone", "mock"]),
  endpoint: z.string().max(2048),
  modelId: z.string().trim().min(1).max(200),
  timeoutMs: int.min(1000).max(120000),
  retries: int.min(0).max(3),
  notes: z.string().max(1000).default(""),
  enabled: z.boolean(),
  apiKey: z.string().max(4096).optional(),
  clearKey: z.boolean().optional(),
});
const metrics = z.object({
  maxHeight: int.min(0).max(20),
  aggregateHeight: int.min(0).max(200),
  holes: int.min(0).max(200),
  bumpiness: int.min(0).max(180),
});
export const stateSchema = z.object({
  sessionId: z.string().min(1).max(100),
  stateVersion: int.min(0),
  pieceId: z.string().max(120),
  board: z.array(z.array(int.min(0).max(7)).length(10)).length(20),
  currentPiece: z.object({
    type: z.enum(["I", "O", "T", "S", "Z", "J", "L"]),
    rotation: int.min(0).max(3),
    x: int.min(-4).max(10),
    y: int.min(0).max(19),
  }),
  nextPiece: z.enum(["I", "O", "T", "S", "Z", "J", "L"]),
  metrics: metrics.extend({ score: int.min(0), clearedLines: int.min(0) }),
  candidates: z
    .array(
      z.object({
        id: z.string().regex(/^c\d+$/),
        x: int.min(-4).max(10),
        y: int.min(0).max(19),
        rotation: int.min(0).max(3),
        actions: z
          .array(z.enum(["left", "right", "cw", "ccw", "down", "drop"]))
          .min(1)
          .max(200),
        after: metrics.extend({
          clearedLines: int.min(0).max(4),
          topOut: z.boolean(),
        }),
        heuristicScore: n,
      }),
    )
    .min(1)
    .max(255),
});
export const identitySchema = z.object({
  requestId: z.string().uuid(),
  sessionId: z.string(),
  pieceId: z.string(),
  stateVersion: int.min(0),
  configVersion: int.min(1),
});
