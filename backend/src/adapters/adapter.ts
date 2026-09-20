import { decideStructured } from "./structured.js";
import type {
  DecisionResult,
  GameDecisionState,
  ProviderInput,
} from "../../../shared/types.js";
import { parseDecision, questions } from "../../../shared/decisions.js";
import {
  ApiError,
  sleep,
  transport,
  type Transport,
} from "../services/transport.js";
import { redact } from "../services/secretStore.js";
export interface Adapter {
  payload(provider: ProviderInput, state: GameDecisionState): unknown;
}
export const openrouterDecisions: Adapter = {
  payload: (p, state) => ({
    model: p.modelId,
    state,
    questions: questions(state),
  }),
};
export const typesafeSystemOne: Adapter = {
  payload: (p, state) => ({
    model: p.modelId,
    state,
    questions: questions(state),
  }),
};
export const adapters = {
  "openrouter-decisions": openrouterDecisions,
  "typesafe-systemone": typesafeSystemOne,
};
// Explicitly reserved; these protocols are rejected by providerSchema until implemented.
export const unsupportedAdapters = ["openai-chat", "anthropic-messages"];
export function mockDecision(state: GameDecisionState): DecisionResult {
  const list = state.candidates;
  const best = [...list].sort((a, b) => b.heuristicScore - a.heuristicScore)[0];
  const weights = list.map((c) =>
    Math.exp(Math.max(-50, (c.heuristicScore - best.heuristicScore) / 3)),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = {
    answers: {
      placement: {
        type: "choice",
        choice: best.id,
        probabilities: Object.fromEntries(
          list.map((c, i) => [c.id, weights[i] / sum]),
        ),
      },
      board_risk: {
        type: "noul",
        noul: Math.min(1, (state.metrics.maxHeight + state.metrics.holes) / 25),
      },
      board_quality: {
        type: "score",
        score: Math.max(
          0,
          4 - (state.metrics.maxHeight + state.metrics.holes) / 6,
        ),
      },
    },
  };
  return { ...parseDecision(raw, state), source: "Mock 模拟", latencyMs: 0 };
}
export async function decide(
  p: ProviderInput,
  state: GameDecisionState,
  signal: AbortSignal,
  send: Transport = transport,
): Promise<DecisionResult> {
  if (p.protocol === "mock") {
    if (!p.enabled) throw new ApiError("供应商已禁用");
    return mockDecision(state);
  }
  const result = await decideStructured(
    p,
    state,
    questions(state),
    signal,
    send,
  );
  return {
    ...parseDecision(result.raw, state),
    source: "Jev / 真实模型",
    latencyMs: result.latencyMs,
    status: result.status,
    attempts: result.attempts,
  };
}
