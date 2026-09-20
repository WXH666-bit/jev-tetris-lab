// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, createElement } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useDecisionLoop } from "../frontend/src/hooks/useDecisionLoop";
import type { Settings } from "../shared/types";
const settings: Settings = {
  seed: 42,
  minIntervalMs: 1000,
  callLimit: 10,
  candidateLimit: 12,
  fallback: true,
  failureLimit: 3,
  mockDelayMs: 250,
  mockFault: "none",
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("async control loop", () => {
  const realProvider = {
    id: "remote",
    version: 1,
    name: "Fixture provider",
    protocol: "openrouter-decisions" as const,
    endpoint: "https://example.com/decision",
    modelId: "fixture-model",
    timeoutMs: 1000,
    retries: 0,
    notes: "",
    enabled: true,
    hasKey: true,
    keyMask: "••••••••",
    active: true,
    lastTest: null,
  };
  it("StrictMode sends once and executes the server-selected non-best candidate", async () => {
    let chosen = "";
    const fetcher = vi.fn(async (_path, options) => {
      const body = JSON.parse(options.body);
      chosen = body.state.candidates[1].id;
      return {
        ok: true,
        json: async () => ({
          identity: body.identity,
          result: {
            candidateId: chosen,
            source: "Jev / 真实模型",
            raw: { fixture: true },
            latencyMs: 4,
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetcher);
    const { result, unmount } = renderHook(
      () => useDecisionLoop(realProvider, settings),
      { wrapper: ({ children }) => createElement(StrictMode, null, children) },
    );
    act(() => result.current.setMode("real"));
    act(() => {
      void result.current.start(true);
    });
    await waitFor(() => expect(result.current.history).toHaveLength(1), {
      timeout: 5000,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.history[0].executed?.candidateId).toBe(chosen);
    expect(result.current.history[0].executed?.candidateId).not.toBe(
      result.current.history[0].state.candidates[0].id,
    );
    unmount();
  });
  it("a server response arriving after restart cannot mutate the new session", async () => {
    let release!: () => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path, options) => {
        const body = JSON.parse(options.body);
        await new Promise<void>((r) => (release = r));
        return {
          ok: true,
          json: async () => ({
            identity: body.identity,
            result: {
              candidateId: body.state.candidates[0].id,
              source: "Jev / 真实模型",
              raw: null,
              latencyMs: 10,
            },
          }),
        };
      }),
    );
    const { result, unmount } = renderHook(() =>
      useDecisionLoop(realProvider, settings),
    );
    act(() => result.current.setMode("real"));
    act(() => {
      void result.current.start(true);
    });
    await waitFor(() => expect(release).toBeTypeOf("function"));
    act(() => result.current.restart());
    const session = result.current.game.sessionId;
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(result.current.game.sessionId).toBe(session);
    expect(result.current.game.pieces).toBe(0);
    expect(result.current.history).toHaveLength(0);
    unmount();
  });
  it("API failure executes an explicitly labeled local fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: "限流" }),
      })),
    );
    const { result, unmount } = renderHook(() =>
      useDecisionLoop(realProvider, settings),
    );
    act(() => result.current.setMode("real"));
    act(() => {
      void result.current.start(true);
    });
    await waitFor(() => expect(result.current.history).toHaveLength(1), {
      timeout: 5000,
    });
    expect(result.current.history[0].fallback).toBe(true);
    expect(result.current.history[0].result?.source).toBe("本地启发式");
    expect(result.current.history[0].error).toBe("限流");
    unmount();
  });
  it.each(["pause", "restart"] as const)(
    "%s during pending decision cannot land an old piece",
    async (action) => {
      const { result, unmount } = renderHook(() =>
        useDecisionLoop(undefined, settings),
      );
      act(() => {
        void result.current.start();
      });
      await waitFor(() =>
        expect(result.current.stage).toBe("请求模型（Mock）"),
      );
      const session = result.current.game.sessionId;
      act(() => result.current[action]());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600));
      });
      expect(result.current.game.pieces).toBe(0);
      expect(result.current.running).toBe(false);
      if (action === "restart")
        expect(result.current.game.sessionId).not.toBe(session);
      expect(result.current.history).toHaveLength(0);
      unmount();
    },
  );
  it("single step locks exactly one piece and pauses", async () => {
    const { result, unmount } = renderHook(() =>
      useDecisionLoop(undefined, { ...settings, mockDelayMs: 0 }),
    );
    act(() => {
      void result.current.start(true);
    });
    await waitFor(() => expect(result.current.history).toHaveLength(1), {
      timeout: 5000,
    });
    expect(result.current.game.pieces).toBe(1);
    expect(result.current.running).toBe(false);
    expect(result.current.history[0].result?.source).toBe("Mock 模拟");
    unmount();
  });
  it("model/config change invalidates an in-flight request", async () => {
    const p = {
      id: "p",
      version: 1,
      name: "mock provider",
      protocol: "mock" as const,
      endpoint: "",
      modelId: "mock",
      timeoutMs: 1000,
      retries: 0,
      notes: "",
      enabled: true,
      hasKey: false,
      keyMask: "",
      active: true,
      lastTest: null,
    };
    const { result, rerender, unmount } = renderHook(
      ({ provider }) => useDecisionLoop(provider, settings),
      { initialProps: { provider: p } },
    );
    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(result.current.stage).toBe("请求模型（Mock）"));
    rerender({ provider: { ...p, version: 2 } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(result.current.game.pieces).toBe(0);
    expect(result.current.running).toBe(false);
    unmount();
  });
});
