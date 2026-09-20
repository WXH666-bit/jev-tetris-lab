import { describe, it, expect, vi } from "vitest";
import { newGame } from "../shared/game/engine";
import { candidates, snapshot } from "../shared/game/candidates";
import { parseDecision, sameIdentity } from "../shared/decisions";
import {
  decide,
  mockDecision,
  adapters,
} from "../backend/src/adapters/adapter";
import {
  ApiError,
  isPublic,
  endpointURL,
} from "../backend/src/services/transport";
import { providerSchema } from "../shared/schemas";
const g = newGame(42),
  state = snapshot(g, candidates(g).slice(0, 3));
describe("decision contracts", () => {
  it("parses typed choice/noul/score", () => {
    expect(parseDecision(mockDecision(state).raw, state).candidateId).toBe(
      state.candidates[0].id,
    );
  });
  it.each([
    "missing",
    "type",
    "candidate",
    "sum",
    "range",
    "infinite",
    "score",
  ])("rejects invalid response: %s", (kind) => {
    const raw = structuredClone(mockDecision(state).raw) as any;
    if (kind === "missing") delete raw.answers.placement;
    if (kind === "type") raw.answers.board_risk.type = "choice";
    if (kind === "candidate") raw.answers.placement.choice = "unknown";
    if (kind === "sum") raw.answers.placement.probabilities = { c000: 0.1 };
    if (kind === "range") raw.answers.board_risk.noul = 1.1;
    if (kind === "infinite") raw.answers.board_quality.score = Infinity;
    if (kind === "score") raw.answers.board_quality.score = 80;
    expect(() => parseDecision(raw, state)).toThrow();
  });
  it("rejects stale identity across every identity dimension", () => {
    const a = {
      requestId: "a",
      sessionId: "s",
      pieceId: "p",
      stateVersion: 1,
      configVersion: 2,
    };
    for (const k of Object.keys(a))
      expect(
        sameIdentity(a, {
          ...a,
          [k]: typeof a[k as keyof typeof a] === "number" ? 9 : "old",
        }),
      ).toBe(false);
    expect(sameIdentity(a, { ...a })).toBe(true);
  });
  it.each(["openrouter-decisions", "typesafe-systemone"] as const)(
    "routes %s to its adapter and exact endpoint",
    async (protocol) => {
      const p = {
        name: "arbitrary label",
        protocol,
        endpoint: "https://example.com/custom/endpoint",
        modelId: "custom-model",
        timeoutMs: 1000,
        retries: 0,
        notes: "",
        enabled: true,
        apiKey: "test-fixture-only",
      };
      const send = vi
        .fn()
        .mockResolvedValue({ status: 200, body: mockDecision(state).raw });
      const result = await decide(p, state, new AbortController().signal, send);
      expect(send.mock.calls[0].slice(0, 3)).toEqual([
        p.endpoint,
        p.apiKey,
        adapters[protocol].payload(p, state),
      ]);
      expect(result.source).toBe("Jev / 真实模型");
    },
  );
  it("does not retry authentication failure; retries temporary failure within budget", async () => {
    const p = {
      name: "x",
      protocol: "openrouter-decisions" as const,
      endpoint: "https://example.com/e",
      modelId: "m",
      timeoutMs: 1000,
      retries: 1,
      notes: "",
      enabled: true,
      apiKey: "fixture",
    };
    const fail = vi.fn().mockRejectedValue(new ApiError("认证失败", 401));
    await expect(
      decide(p, state, new AbortController().signal, fail),
    ).rejects.toThrow();
    expect(fail).toHaveBeenCalledTimes(1);
    const transient = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("服务错误", 503))
      .mockResolvedValue({ status: 200, body: mockDecision(state).raw });
    await decide(p, state, new AbortController().signal, transient);
    expect(transient).toHaveBeenCalledTimes(2);
  });
  it("unsupported chat protocols cannot be saved as working adapters", () => {
    expect(
      providerSchema.safeParse({ name: "x", protocol: "openai-chat" }).success,
    ).toBe(false);
  });
  it("preserves a sanitized invalid raw response for diagnosis", async () => {
    const p = {
      name: "x",
      protocol: "openrouter-decisions" as const,
      endpoint: "https://example.com/e",
      modelId: "m",
      timeoutMs: 1000,
      retries: 0,
      notes: "",
      enabled: true,
      apiKey: "private-fixture",
    };
    try {
      await decide(p, state, new AbortController().signal, async () => ({
        status: 200,
        body: { echo: "private-fixture", answers: {} },
      }));
      throw Error("expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).raw).toEqual({ echo: "[REDACTED]", answers: {} });
    }
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "192.168.1.1",
    "fc00::1",
    "0.0.0.0",
  ])("blocks SSRF address %s", (ip) => expect(isPublic(ip)).toBe(false));
  it("requires clean HTTPS endpoints", () => {
    expect(isPublic("8.8.8.8")).toBe(true);
    for (const url of [
      "http://example.com",
      "https://u:p@example.com",
      "https://example.com?key=x",
      "https://example.com:444",
    ])
      expect(() => endpointURL(url)).toThrow();
  });
});
