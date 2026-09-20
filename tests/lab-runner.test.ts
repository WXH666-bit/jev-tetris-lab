// @vitest-environment jsdom
import {
  act,
  renderHook,
  waitFor,
  render,
  fireEvent,
  screen,
  cleanup,
} from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { LabContext } from "../frontend/src/lab/context";
import {
  useLabRunner,
  type RunnerDefinition,
} from "../frontend/src/lab/useLabRunner";
import {
  createPath,
  pathCandidates,
  pathQuestions,
  applyPath,
  pathTerminal,
  pathMetrics,
  type PathState,
} from "../shared/experiments/pathfinding";
import { mockAnswers, type Questions } from "../shared/lab/contracts";
import { defaultSettings } from "../frontend/src/lab/SettingsPage";
import DecisionPlayground from "../frontend/src/experiments/DecisionPlayground";
const provider = {
  id: "test",
  name: "Fixture",
  protocol: "openrouter-decisions" as const,
  endpoint: "https://example.com/test",
  modelId: "test-model",
  timeoutMs: 1000,
  retries: 0,
  notes: "",
  enabled: true,
  version: 1,
  hasKey: true,
  keyMask: "•••",
  active: true,
  lastTest: null,
};
const settings = { ...defaultSettings, mockDelayMs: 0, minIntervalMs: 0 };
const definition: RunnerDefinition<PathState> = {
  id: "pathfinding",
  version: "1",
  baselineVersion: "bfs-v1",
  kind: "turn",
  questions: pathQuestions,
  candidates: (s) =>
    pathCandidates(s).map((c) => ({ id: c.id, label: c.label, details: "" })),
  execute: (s, a) => {
    if (a.move?.type !== "choice") throw Error("bad");
    return {
      state: applyPath(s, a.move.choice),
      action: a.move.choice,
      execution: { choice: a.move.choice },
    };
  },
  terminal: pathTerminal,
  metrics: pathMetrics,
  local: (s) => ({ move: { type: "choice", choice: pathCandidates(s)[0].id } }),
};
function environment() {
  const s = createPath(42);
  s.grid = s.grid.map((r) => r.map(() => 0));
  return s;
}
function wrapper(publish = vi.fn(), config = settings) {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      LabContext.Provider,
      { value: { provider, settings: config, publish } },
      children,
    );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("multi-experiment runtime", () => {
  it("executes the real returned legal action instead of the BFS baseline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const body = JSON.parse(options.body);
        const answers = mockAnswers(body.questions as Questions);
        answers.move = {
          type: "choice",
          choice: "down",
          probabilities: { right: 0.1, down: 0.9 },
        };
        return {
          ok: true,
          json: async () => ({
            identity: body.identity,
            result: {
              answers,
              raw: { answers },
              source: "Jev / 真实模型",
              latencyMs: 5,
            },
          }),
        };
      }),
    );
    const { result } = renderHook(
      () => useLabRunner(definition, environment(), 42),
      { wrapper: wrapper() },
    );
    act(() => result.current.setMode("real"));
    act(() => {
      void result.current.start(true);
    });
    await waitFor(() => expect(result.current.counts.steps).toBe(1));
    expect(result.current.state.position).toEqual({ x: 0, y: 1 });
    expect(result.current.steps[0].action).toBe("down");
    expect(result.current.steps[0].result?.source).toBe("Jev / 真实模型");
  });
  it("switching experiment/unmount invalidates a late response and preserves cancelled ownership", async () => {
    let release!: () => void;
    const publish = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const body = JSON.parse(options.body);
        await new Promise<void>((r) => (release = r));
        const answers = mockAnswers(body.questions);
        return {
          ok: true,
          json: async () => ({
            identity: body.identity,
            result: {
              answers,
              raw: { answers },
              source: "Jev / 真实模型",
              latencyMs: 5,
            },
          }),
        };
      }),
    );
    const { result, unmount } = renderHook(
      () => useLabRunner(definition, environment(), 42),
      { wrapper: wrapper(publish) },
    );
    act(() => result.current.setMode("real"));
    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(release).toBeTypeOf("function"));
    unmount();
    await act(async () => release());
    expect(publish.mock.calls.at(-1)?.[0]).toMatchObject({
      experimentId: "pathfinding",
      status: "cancelled",
      stepCount: 0,
    });
    expect(publish.mock.calls.every((c) => c[0].actions.length === 0)).toBe(
      true,
    );
  });
  it.each(["pause", "reset"] as const)(
    "%s during pending decision cannot execute stale actions",
    async (action) => {
      const { result } = renderHook(
        () => useLabRunner(definition, environment(), 42),
        { wrapper: wrapper(vi.fn(), { ...settings, mockDelayMs: 200 }) },
      );
      act(() => {
        void result.current.start();
      });
      await waitFor(() => expect(result.current.stage).toBe("Mock 模拟"));
      act(() =>
        action === "pause"
          ? result.current.pause()
          : result.current.reset(environment()),
      );
      await act(async () => new Promise((r) => setTimeout(r, 300)));
      expect(result.current.state.position).toEqual({ x: 0, y: 0 });
      expect(result.current.counts.steps).toBe(0);
    },
  );
  it("a single decision cannot loop automatically", async () => {
    const single = { ...definition, id: "playground", kind: "single" as const };
    const { result } = renderHook(() => useLabRunner(single, environment()), {
      wrapper: wrapper(),
    });
    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe("success"));
    await act(async () => new Promise((r) => setTimeout(r, 300)));
    expect(result.current.counts.steps).toBe(1);
    expect(result.current.record?.experimentId).toBe("playground");
  });
  it("stops at the call budget", async () => {
    const fetcher = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body),
        answers = mockAnswers(body.questions);
      return {
        ok: true,
        json: async () => ({
          identity: body.identity,
          result: {
            answers,
            raw: { answers },
            source: "Jev / 真实模型",
            latencyMs: 1,
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(
      () => useLabRunner(definition, environment()),
      { wrapper: wrapper(vi.fn(), { ...settings, callLimit: 1 }) },
    );
    act(() => result.current.setMode("real"));
    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.counts.steps).toBe(1);
    expect(result.current.error).toContain("上限");
  });
  it("labels fallback and stops consecutive failures", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: "限流" }),
    }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(
      () => useLabRunner(definition, environment()),
      { wrapper: wrapper(vi.fn(), { ...settings, failureLimit: 1 }) },
    );
    act(() => result.current.setMode("real"));
    act(() => {
      void result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.steps[0].result?.source).toBe("错误后兜底");
  });
  it("playground UI blocks invalid input and completes one real form-to-Mock run", async () => {
    const publish = vi.fn();
    render(createElement(DecisionPlayground), { wrapper: wrapper(publish) });
    fireEvent.change(screen.getByLabelText("state JSON"), {
      target: { value: "{broken" },
    });
    expect(screen.getByRole("alert").textContent).toContain("state");
    expect(
      (
        screen.getByRole("button", {
          name: "执行一次决策",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("state JSON"), {
      target: { value: '{"fictional":true}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "执行一次决策" }));
    await waitFor(() =>
      expect(publish.mock.calls.some((c) => c[0].status === "success")).toBe(
        true,
      ),
    );
    const last = publish.mock.calls.at(-1)![0];
    expect(last.stepCount).toBe(1);
    expect(last.steps[0].state).toEqual({ fictional: true });
    expect(last.steps[0].identity.runId).toBe(last.id);
  });
});
