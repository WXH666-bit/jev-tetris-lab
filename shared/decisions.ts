import { z } from "zod";
import type { GameDecisionState, Identity, DecisionResult } from "./types.js";
export function questions(state: GameDecisionState) {
  return {
    placement: {
      type: "choice" as const,
      instructions:
        "从合法候选选择一个完整落点。优先避免顶部溢出和洞，兼顾消行、降低高度和表面平整。只依据已知信息，不假设未知方块。",
      criteria: Object.fromEntries(
        state.candidates.map((c) => [
          c.id,
          `x=${c.x}; y=${c.y}; 旋转=${c.rotation}; 消行=${c.after.clearedLines}; 最大高度=${c.after.maxHeight}; 总高度=${c.after.aggregateHeight}; 洞=${c.after.holes}; 凹凸=${c.after.bumpiness}; 顶部溢出=${c.after.topOut}`,
        ]),
      ),
    },
    board_risk: {
      type: "noul" as const,
      instructions: "当前棋盘是否需要优先保守处理？",
      criteria: {
        true: "堆叠高、洞多或落点受限",
        false: "空间充足且安全落点较多",
      },
    },
    board_quality: {
      type: "score" as const,
      instructions:
        "评价当前棋盘的可操作性与整洁程度，不评价其他问题尚未返回的答案。",
      criteria: [
        "空间严重受限",
        "局面较差",
        "局面一般",
        "局面较好",
        "空间充足且表面平整",
      ],
    },
  };
}
const prob = z.number().finite().min(0).max(1);
const distribution = z
  .record(prob)
  .refine(
    (p) =>
      Object.keys(p).length > 0 &&
      Math.abs(Object.values(p).reduce((a, v) => a + v, 0) - 1) <= 0.001,
    "概率分布之和必须约等于 1",
  );
const schema = z.object({
  answers: z.object({
    placement: z.object({
      type: z.literal("choice"),
      choice: z.string(),
      probabilities: distribution,
      confidence: prob.optional(),
    }),
    board_risk: z.object({ type: z.literal("noul"), noul: prob }),
    board_quality: z.object({
      type: z.literal("score"),
      score: z.number().finite().min(0).max(4),
      probabilities: distribution.optional(),
      confidence: prob.optional(),
    }),
  }),
});
export function parseDecision(
  raw: unknown,
  state: GameDecisionState,
): Omit<DecisionResult, "latencyMs" | "source"> {
  const r = schema.parse(raw),
    p = r.answers.placement,
    ids = state.candidates.map((c) => c.id);
  if (!ids.includes(p.choice)) throw Error("返回了未提交的候选 ID");
  if (
    Object.keys(p.probabilities).length !== ids.length ||
    ids.some((id) => !(id in p.probabilities))
  )
    throw Error("概率分布候选集合不匹配");
  const quality = r.answers.board_quality;
  if (
    quality.probabilities &&
    (Object.keys(quality.probabilities).length !== 5 ||
      Object.keys(quality.probabilities).some(
        (k) => !["0", "1", "2", "3", "4"].includes(k),
      ))
  )
    throw Error("score 概率级别无效");
  return {
    candidateId: p.choice,
    probabilities: p.probabilities,
    confidence: p.confidence,
    boardRisk: r.answers.board_risk.noul,
    boardQuality: quality.score,
    raw,
  };
}
export function sameIdentity(a: Identity, b: Identity) {
  return (
    a.requestId === b.requestId &&
    a.sessionId === b.sessionId &&
    a.pieceId === b.pieceId &&
    a.stateVersion === b.stateVersion &&
    a.configVersion === b.configVersion
  );
}
export { Epoch } from "./lab/runtime.js";