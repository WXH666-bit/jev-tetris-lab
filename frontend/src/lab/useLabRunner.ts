import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Questions,
  LabResult,
  Answer,
  RunIdentity,
} from "../../../shared/lab/contracts";
import {
  mockAnswers,
  parseAnswers,
  sameRunIdentity,
} from "../../../shared/lab/contracts";
import type {
  RunMode,
  RunRecord,
  RunStatus,
  StepRecord,
  VisibleCandidate,
} from "../../../shared/lab/records";
import { Epoch, abortableWait, budgetError } from "../../../shared/lab/runtime";
import { api } from "../lib/api";
import { useLab, usePublishRun } from "./context";
export interface RunnerDefinition<S> {
  id: string;
  version: string;
  baselineVersion: string;
  kind: "turn" | "single";
  seed?: (state: S) => number;
  requestState?: (state: S) => unknown;
  questions: (state: S) => Questions;
  candidates: (state: S) => VisibleCandidate[];
  execute: (
    state: S,
    answers: Record<string, Answer>,
  ) => { state: S; action: string; execution: unknown };
  terminal: (state: S) => "success" | "exhausted" | null;
  metrics: (state: S) => Record<string, string | number | boolean>;
  local: (state: S) => Record<string, Answer>;
}
export function useLabRunner<S>(
  definition: RunnerDefinition<S>,
  initial: S,
  seed?: number,
) {
  const { provider, settings, suspendToken } = useLab();
  const [state, setState] = useState(initial);
  const env = useRef(state);
  const [mode, setModeState] = useState<RunMode>("mock");
  const modeRef = useRef(mode);
  const [status, setStatus] = useState<RunStatus>("paused");
  const [stage, setStage] = useState("等待执行");
  const [steps, setSteps] = useState<StepRecord[]>([]);
  const [current, setCurrent] = useState<StepRecord>();
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [identity, setIdentity] = useState(() => ({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
  }));
  const identityRef = useRef(identity);
  const [counts, setCounts] = useState({
    requests: 0,
    failures: 0,
    latency: 0,
    steps: 0,
  });
  const counter = useRef(counts);
  const failures = useRef(0),
    lastRequest = useRef(0),
    epoch = useRef(new Epoch()),
    controller = useRef<AbortController | null>(null),
    busy = useRef(false),
    running = useRef(false);
  const stateVersion = useRef(0);
  const props = useRef({ provider, settings, definition });
  props.current = { provider, settings, definition };
  const initialRef = useRef(initial);
  const settingsRef = useRef(settings);
  const meta = useRef<RunRecord["provider"] | null>(null);
  const [actions, setActions] = useState<unknown[]>([]);
  function count(update: Partial<typeof counts>) {
    counter.current = { ...counter.current, ...update };
    setCounts(counter.current);
  }
  function pause() {
    running.current = false;
    epoch.current.invalidate();
    controller.current?.abort();
    setStatus((s) =>
      ["success", "failed", "exhausted", "completed"].includes(s)
        ? s
        : "paused",
    );
    setStage("已暂停 · 旧请求已失效");
  }
  function reset(next: S) {
    pause();
    env.current = next;
    initialRef.current = next;
    settingsRef.current = props.current.settings;
    setState(next);
    setSteps([]);
    setCurrent(undefined);
    setActions([]);
    setError("");
    setStarted(false);
    setStatus("paused");
    meta.current = null;
    stateVersion.current = 0;
    count({ requests: 0, failures: 0, latency: 0, steps: 0 });
    failures.current = 0;
    lastRequest.current = 0;
    identityRef.current = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
    };
    setIdentity(identityRef.current);
    setStage("等待执行");
  }
  function setMode(next: RunMode) {
    reset(env.current);
    modeRef.current = next;
    setModeState(next);
  }
  async function start(single = false) {
    if (busy.current || props.current.definition.terminal(env.current)) return;
    busy.current = true;
    running.current = true;
    setStarted(true);
    setStatus("running");
    setError("");
    const control = new AbortController();
    controller.current = control;
    const valid = epoch.current.capture();
    const config = props.current;
    meta.current ??= {
      id: modeRef.current === "real" ? config.provider?.id : undefined,
      name:
        modeRef.current === "real"
          ? (config.provider?.name ?? "未选择")
          : "本地运行时",
      modelId:
        modeRef.current === "real"
          ? (config.provider?.modelId ?? "未选择")
          : modeRef.current === "local"
            ? definition.baselineVersion
            : "mock-v1",
      protocol:
        modeRef.current === "real"
          ? (config.provider?.protocol ?? "未选择")
          : modeRef.current,
      version: config.provider?.version,
    };
    try {
      while (running.current && valid()) {
        const { settings: cfg, provider: p, definition: def } = props.current;
        const previous = env.current;
        const questions = def.questions(previous);
        const candidates = def.candidates(previous);
        const key: RunIdentity = {
          experimentId: def.id,
          runId: identityRef.current.id,
          stepId: `${identityRef.current.id}:${stateVersion.current}`,
          stateVersion: stateVersion.current,
          requestId: crypto.randomUUID(),
          configVersion: p?.version ?? 0,
        };
        let draft: StepRecord = {
          id: key.requestId,
          identity: key,
          time: new Date().toISOString(),
          state: structuredClone(
            def.requestState ? def.requestState(previous) : previous,
          ),
          questions,
          candidates,
          elapsed: 0,
          provider: meta.current.name,
          model: meta.current.modelId,
          protocol: meta.current.protocol,
          fallback: false,
        };
        setStage("观察状态 → 生成候选");
        setCurrent(draft);
        await abortableWait(30, control.signal);
        let result: LabResult;
        let requestStarted = 0;
        try {
          if (modeRef.current === "real") {
            const limit = budgetError(
              counter.current.requests,
              failures.current,
              cfg,
            );
            if (limit) {
              setError(limit);
              setStatus("failed");
              break;
            }
            if (!p || !p.enabled) throw Error("请选择启用的模型供应商");
            setStage("等待调用间隔");
            await abortableWait(
              Math.max(
                0,
                cfg.minIntervalMs - (Date.now() - lastRequest.current),
              ),
              control.signal,
            );
            if (!valid()) break;
            lastRequest.current = Date.now();
            requestStarted = performance.now();
            count({ requests: counter.current.requests + 1 });
            setStage("请求决策");
            const reply = await api<{
              identity: RunIdentity;
              result: LabResult;
            }>("/lab/decisions", {
              method: "POST",
              body: JSON.stringify({
                providerId: p.id,
                identity: key,
                state: def.requestState ? def.requestState(previous) : previous,
                questions,
              }),
              signal: control.signal,
            });
            if (!valid()) break;
            if (!sameRunIdentity(key, reply.identity))
              throw Error("响应身份不匹配，已拒绝");
            parseAnswers(reply.result.raw, questions);
            result = reply.result;
            failures.current = 0;
          } else {
            setStage(modeRef.current === "local" ? "本地基线" : "Mock 模拟");
            requestStarted = performance.now();
            await abortableWait(
              modeRef.current === "mock" ? cfg.mockDelayMs : 30,
              control.signal,
            );
            if (modeRef.current === "mock" && cfg.mockFault !== "none") {
              if (cfg.mockFault === "timeout")
                await abortableWait(1200, control.signal);
              throw Error(
                cfg.mockFault === "timeout" ? "Mock 模拟超时" : "Mock 模拟错误",
              );
            }
            const answers =
              modeRef.current === "local"
                ? def.local(previous)
                : mockAnswers(questions);
            result = {
              answers,
              raw:
                modeRef.current === "local"
                  ? null
                  : { simulated: true, answers },
              source: modeRef.current === "local" ? "本地策略" : "Mock 模拟",
              latencyMs: Math.round(performance.now() - requestStarted),
            };
            failures.current = 0;
          }
        } catch (e) {
          if (!valid() || control.signal.aborted) break;
          const message = e instanceof Error ? e.message : "请求失败";
          setError(message);
          failures.current++;
          count({ failures: counter.current.failures + 1 });
          draft = {
            ...draft,
            error: message,
            errorResponse: (e as { raw?: unknown }).raw,
          };
          if (!cfg.fallback || def.kind === "single") {
            draft.elapsed = requestStarted
              ? Math.round(performance.now() - requestStarted)
              : 0;
            count({ latency: counter.current.latency + draft.elapsed });
            setCurrent(draft);
            setSteps((h) => [...h, draft]);
            setStatus("failed");
            break;
          }
          result = {
            answers: def.local(previous),
            raw: null,
            source: "错误后兜底",
            latencyMs: requestStarted
              ? Math.round(performance.now() - requestStarted)
              : 0,
          };
          draft.fallback = true;
        }
        if (!valid()) break;
        setStage("校验结果");
        draft = {
          ...draft,
          result,
          elapsed: requestStarted
            ? Math.round(performance.now() - requestStarted)
            : 0,
        };
        setCurrent(draft);
        await abortableWait(80, control.signal);
        if (!valid()) break;
        setStage("执行动作");
        const execution = def.execute(previous, result.answers);
        if (!valid()) break;
        env.current = execution.state;
        stateVersion.current++;
        setState(execution.state);
        draft = {
          ...draft,
          action: execution.action,
          execution: execution.execution,
        };
        setCurrent(draft);
        setSteps((h) => [...h, draft]);
        setActions((a) => [
          ...a,
          {
            step: key.stepId,
            action: execution.action,
            execution: execution.execution,
          },
        ]);
        count({
          steps: counter.current.steps + 1,
          latency: counter.current.latency + draft.elapsed,
        });
        const terminal = def.terminal(execution.state);
        if (terminal) {
          setStatus(terminal);
          setStage(
            terminal === "success" ? "完成 · 已到达目标" : "停止 · 步数耗尽",
          );
          break;
        }
        if (single || def.kind === "single") {
          setStatus(def.kind === "single" ? "success" : "paused");
          setStage("本次决策完成");
          break;
        }
        await abortableWait(180, control.signal);
      }
    } catch (e) {
      if (valid() && !control.signal.aborted) {
        setError((e as Error).message);
        setStatus("failed");
      }
    } finally {
      busy.current = false;
      running.current = false;
    }
  }
  useEffect(() => {
    reset(env.current);
  }, [provider?.id, provider?.version]);
  useEffect(() => {
    pause();
  }, [JSON.stringify(settings), suspendToken]);
  useEffect(
    () => () => {
      epoch.current.invalidate();
      controller.current?.abort();
      running.current = false;
    },
    [],
  );
  const record = useMemo<RunRecord | null>(
    () =>
      !started
        ? null
        : {
            id: identity.id,
            experimentId: definition.id,
            experimentVersion: definition.version,
            seed: definition.seed?.(initialRef.current) ?? seed,
            parameters: { ...settingsRef.current, initial: initialRef.current },
            baselineVersion: definition.baselineVersion,
            mode,
            provider: meta.current!,
            startedAt: identity.time,
            status,
            stepCount: counts.steps,
            requests: counts.requests,
            failures: counts.failures,
            latencyMs: counts.latency,
            metrics: definition.metrics(state),
            steps,
            actions,
            initialState: initialRef.current,
          },
    [
      started,
      identity,
      status,
      counts,
      state,
      steps,
      actions,
      mode,
      settings,
      seed,
      definition,
    ],
  );
  usePublishRun(record);
  return {
    runId: identity.id,
    state,
    mode,
    setMode,
    status,
    stage,
    steps,
    current,
    error,
    counts,
    record,
    start,
    pause,
    reset,
    running: status === "running",
  };
}
