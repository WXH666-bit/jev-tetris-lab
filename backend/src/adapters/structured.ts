import type { ProviderInput } from "../../../shared/types.js";
import {
  parseAnswers,
  mockAnswers,
  type LabResult,
  type Questions,
  inputErrors,
} from "../../../shared/lab/contracts.js";
import {
  transport,
  ApiError,
  sleep,
  type Transport,
} from "../services/transport.js";
import { redact } from "../../../shared/lab/redact.js";
export const structuredAdapters = {
  "openrouter-decisions": (
    model: string,
    state: unknown,
    questions: Questions,
  ) => ({ model, state, questions }),
  "typesafe-systemone": (
    model: string,
    state: unknown,
    questions: Questions,
  ) => ({ model, state, questions }),
};
export async function decideStructured(
  p: ProviderInput,
  state: unknown,
  questions: Questions,
  signal: AbortSignal,
  send: Transport = transport,
): Promise<LabResult> {
  signal.throwIfAborted();
  if (!p.enabled) throw new ApiError("供应商已禁用");
  if (p.protocol === "mock") {
    const raw = { simulated: true, answers: mockAnswers(questions) };
    return {
      answers: parseAnswers(raw, questions),
      raw,
      source: "Mock 模拟",
      latencyMs: 0,
    };
  }
  if (!p.apiKey) throw new ApiError("未配置 API Key");
  const adapter = structuredAdapters[p.protocol];
  if (!adapter) throw new ApiError("协议尚未实现");
  const start = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await send(
        p.endpoint,
        p.apiKey,
        adapter(p.modelId, state, questions),
        p.timeoutMs,
        signal,
      );
      signal.throwIfAborted();
      const raw = redact(response.body, [p.apiKey]);
      let answers;
      try {
        answers = parseAnswers(raw, questions);
      } catch (e) {
        throw new ApiError(
          `响应格式不正确：${inputErrors(e)}`,
          response.status,
          0,
          raw,
        );
      }
      return {
        answers,
        raw,
        source: "Jev / 真实模型",
        latencyMs: Math.round(performance.now() - start),
        status: response.status,
        attempts: attempt + 1,
      };
    } catch (e) {
      if (signal.aborted) throw new ApiError("请求已取消");
      if (
        !(e instanceof ApiError) ||
        attempt >= p.retries ||
        !(e.status === 408 || e.status === 429 || (e.status ?? 0) >= 500)
      )
        throw e;
      await sleep(Math.max(e.retryMs, 500 * 2 ** attempt), signal);
    }
  }
}
