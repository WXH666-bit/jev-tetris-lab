import { useEffect, useRef, useState } from "react";
import type {
  Action,
  Candidate,
  DecisionRecord,
  DecisionResult,
  Game,
  Identity,
  Provider,
  Settings,
} from "../../../shared/types";
import { newGame, step } from "../../../shared/game/engine";
import {
  candidates,
  filterCandidates,
  snapshot,
} from "../../../shared/game/candidates";
import { Epoch, questions, sameIdentity } from "../../../shared/decisions";
import { api } from "../lib/api";
import {
  sameRunIdentity,
  type RunIdentity,
  type LabResult,
} from "../../../shared/lab/contracts";
import {
  abortableWait as wait,
  budgetError,
} from "../../../shared/lab/runtime";
export type Mode = "mock" | "local" | "real" | "manual";
export const modeLabels: Record<Mode, string> = {
  mock: "模拟演示",
  local: "本地策略",
  real: "真实 AI",
  manual: "手动",
};
export function useDecisionLoop(
  provider: Provider | undefined,
  settings: Settings,
) {
  const [game, setGame] = useState(() => newGame(settings.seed));
  const gameRef = useRef(game);
  const [runInitial, setRunInitial] = useState(game);
  const [runStartedAt, setRunStartedAt] = useState(() =>
    new Date().toISOString(),
  );
  const [running, setRunning] = useState(false);
  const runRef = useRef(false);
  const [mode, setModeState] = useState<Mode>("mock");
  const modeRef = useRef(mode);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [stage, setStage] = useState("等待开始");
  const [error, setError] = useState("");
  const [all, setAll] = useState<Candidate[]>([]);
  const [target, setTarget] = useState<Candidate>();
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [current, setCurrent] = useState<DecisionRecord>();
  const [elapsed, setElapsed] = useState(0);
  const [actionLog, setActionLog] = useState<
    {
      time: string;
      action: Action;
      stateVersion: number;
      manual: boolean;
      state: Game;
    }[]
  >([]);
  const [stats, setStats] = useState({
    requests: 0,
    failures: 0,
    fallbacks: 0,
    totalMs: 0,
    completedRequests: 0,
  });
  const statRef = useRef(stats);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const epoch = useRef(new Epoch());
  const controller = useRef<AbortController | undefined>(undefined);
  const busy = useRef(false);
  const lastRequest = useRef(0);
  const failures = useRef(0);
  function update(g: Game) {
    gameRef.current = g;
    setGame(g);
  }
  function count(p: Partial<typeof stats>) {
    statRef.current = { ...statRef.current, ...p };
    setStats(statRef.current);
  }
  function pause() {
    runRef.current = false;
    setRunning(false);
    epoch.current.invalidate();
    controller.current?.abort();
    setStage("已暂停");
    setTarget(undefined);
  }
  function setMode(m: Mode) {
    pause();
    newSegment();
    modeRef.current = m;
    setModeState(m);
    setCurrent(undefined);
    setAll([]);
  }
  function restart() {
    pause();
    const next = newGame(settingsRef.current.seed);
    update(next);
    setRunInitial(next);
    setRunStartedAt(new Date().toISOString());
    setAll([]);
    setCurrent(undefined);
    setHistory([]);
    setActionLog([]);
    setElapsed(0);
    count({
      requests: 0,
      failures: 0,
      fallbacks: 0,
      totalMs: 0,
      completedRequests: 0,
    });
    failures.current = 0;
    lastRequest.current = 0;
    setError("");
    setStage("等待开始");
  }
  function manual(a: Action) {
    if (modeRef.current !== "manual" || !runRef.current) return;
    setActionLog((log) => [
      ...log,
      {
        time: new Date().toISOString(),
        action: a,
        stateVersion: gameRef.current.stateVersion,
        manual: true,
        state: gameRef.current,
      },
    ]);
    update(step(gameRef.current, a));
    if (gameRef.current.over) {
      runRef.current = false;
      setRunning(false);
      setStage("游戏结束");
    }
  }
  function newSegment() {
    const id = crypto.randomUUID();
    const next = {
      ...gameRef.current,
      sessionId: id,
      pieceId: `${id}:${gameRef.current.pieces}`,
      stateVersion: gameRef.current.stateVersion + 1,
    };
    update(next);
    setRunInitial(next);
    setRunStartedAt(new Date().toISOString());
    setHistory([]);
    setCurrent(undefined);
    setAll([]);
    setActionLog([]);
    setError("");
    count({
      requests: 0,
      failures: 0,
      fallbacks: 0,
      totalMs: 0,
      completedRequests: 0,
    });
    failures.current = 0;
    lastRequest.current = 0;
  }
  async function start(single = false) {
    if (busy.current || gameRef.current.over) return;
    if (modeRef.current === "manual") {
      runRef.current = true;
      setRunning(true);
      setStage("手动操作 · 正常重力");
      return;
    }
    busy.current = true;
    runRef.current = true;
    setRunning(true);
    setError("");
    const c = new AbortController();
    controller.current = c;
    const valid = epoch.current.capture();
    try {
      while (runRef.current && valid() && !gameRef.current.over) {
        const config = settingsRef.current,
          p = providerRef.current,
          g = gameRef.current;
        setStage("观察局面");
        await wait(60, c.signal);
        if (!valid()) break;
        setStage("生成候选");
        const list = candidates(g);
        setAll(list);
        if (!list.length) {
          update({ ...g, over: true });
          break;
        }
        const submitted = filterCandidates(list, config.candidateLimit),
          state = snapshot(g, submitted);
        let result: DecisionResult | undefined;
        let failure: string | undefined;
        let fallback = false;
        const record: DecisionRecord = {
          providerId: modeRef.current === "real" ? p?.id : undefined,
          configVersion: p?.version,
          id: crypto.randomUUID(),
          time: new Date().toISOString(),
          state,
          questions: questions(state),
          provider:
            modeRef.current === "real" ? (p?.name ?? "未选择") : "本地运行时",
          model:
            modeRef.current === "real"
              ? (p?.modelId ?? "未选择")
              : modeRef.current === "mock"
                ? "deterministic-mock"
                : "heuristic-v1",
          protocol:
            modeRef.current === "real"
              ? (p?.protocol ?? "未选择")
              : modeRef.current,
          total: list.length,
          fallback: false,
          elapsed: 0,
        };
        setCurrent(record);
        let startTime = performance.now();
        let requested = false;
        let errorResponse: unknown;
        try {
          if (modeRef.current === "real") {
            if (!p || !p.enabled) throw Error("请添加并启用一个供应商");
            const limit = budgetError(statRef.current.requests, failures.current, config);
            if (limit) {
              setError(`${limit}；重新开始可重置计数`);
              break;
            }
            setStage("请求模型");
            await wait(
              Math.max(
                0,
                config.minIntervalMs - (Date.now() - lastRequest.current),
              ),
              c.signal,
            );
            if (!valid()) break;
            lastRequest.current = Date.now();
            startTime = performance.now();
            requested = true;
            count({ requests: statRef.current.requests + 1 });
            const identity: Identity & RunIdentity = {
              experimentId: "tetris",
              runId: g.sessionId,
              stepId: g.pieceId,
              requestId: record.id,
              sessionId: g.sessionId,
              pieceId: g.pieceId,
              stateVersion: g.stateVersion,
              configVersion: p.version,
            };
            const reply = await api<{
              identity: Identity & RunIdentity;
              result: DecisionResult | LabResult;
            }>("/lab/decisions", {
              method: "POST",
              body: JSON.stringify({ providerId: p.id, state, identity }),
              signal: c.signal,
            });
            if (!valid()) break;
            if (
              !sameRunIdentity(identity, reply.identity) ||
              gameRef.current !== g
            )
              throw Error("响应已过期");
            if ("answers" in reply.result) {
              const answers = reply.result.answers,
                placement = answers.placement;
              if (placement?.type !== "choice")
                throw Error("placement 答案不匹配");
              result = {
                candidateId: placement.choice,
                probabilities: placement.probabilities,
                confidence: placement.confidence,
                boardRisk:
                  answers.board_risk?.type === "noul"
                    ? answers.board_risk.noul
                    : undefined,
                boardQuality:
                  answers.board_quality?.type === "score"
                    ? answers.board_quality.score
                    : undefined,
                raw: reply.result.raw,
                source:
                  reply.result.source === "Mock 模拟"
                    ? "Mock 模拟"
                    : "Jev / 真实模型",
                latencyMs: reply.result.latencyMs,
                status: reply.result.status,
                attempts: reply.result.attempts,
              };
            } else result = reply.result;
            failures.current = 0;
          } else {
            setStage(
              modeRef.current === "mock" ? "请求模型（Mock）" : "本地评分",
            );
            await wait(
              modeRef.current === "mock" ? config.mockDelayMs : 50,
              c.signal,
            );
            if (modeRef.current === "mock" && config.mockFault !== "none") {
              if (config.mockFault === "timeout") await wait(1200, c.signal);
              throw Error(
                config.mockFault === "timeout"
                  ? "Mock 模拟超时"
                  : "Mock 模拟错误",
              );
            }
            const best = submitted[0];
            let probabilities: Record<string, number> | undefined;
            if (modeRef.current === "mock") {
              const weights = submitted.map((v) =>
                  Math.exp(
                    Math.max(-50, (v.heuristicScore - best.heuristicScore) / 3),
                  ),
                ),
                sum = weights.reduce((a, v) => a + v, 0);
              probabilities = Object.fromEntries(
                submitted.map((v, i) => [v.id, weights[i] / sum]),
              );
            }
            result = {
              candidateId: best.id,
              source: modeRef.current === "mock" ? "Mock 模拟" : "本地启发式",
              probabilities,
              raw:
                modeRef.current === "mock"
                  ? { simulated: true, choice: best.id, probabilities }
                  : null,
              latencyMs: Math.round(performance.now() - startTime),
            };
            failures.current = 0;
          }
        } catch (e) {
          if (!valid() || c.signal.aborted) break;
          failure = e instanceof Error ? e.message : "决策失败";
          errorResponse = (e as { raw?: unknown })?.raw;
          setError(failure);
          failures.current++;
          count({ failures: statRef.current.failures + 1 });
          if (config.fallback) {
            fallback = true;
            count({ fallbacks: statRef.current.fallbacks + 1 });
            result = {
              candidateId: submitted[0].id,
              source: "本地启发式",
              raw: null,
              latencyMs: Math.round(performance.now() - startTime),
            };
          }
        }
        if (!valid()) break;
        setStage("校验结果");
        const chosen = submitted.find((v) => v.id === result?.candidateId);
        const completed = {
          ...record,
          result,
          error: failure,
          errorResponse,
          fallback,
          elapsed: Math.round(performance.now() - startTime),
        };
        setCurrent(completed);
        if (requested)
          count({
            totalMs: statRef.current.totalMs + completed.elapsed,
            completedRequests: statRef.current.completedRequests + 1,
          });
        if (!chosen || !result) {
          setHistory((h) => [completed, ...h].slice(0, 100));
          break;
        }
        setTarget(chosen);
        await wait(100, c.signal);
        if (!valid()) break;
        setStage("执行动作");
        let executed: Action[] = [];
        let currentGame = g;
        for (const action of chosen.actions) {
          await wait(
            (action === "drop" ? 180 : 75) / speedRef.current,
            c.signal,
          );
          if (!valid()) break;
          currentGame = step(currentGame, action);
          setActionLog((log) => [
            ...log,
            {
              time: new Date().toISOString(),
              action,
              stateVersion: currentGame.stateVersion,
              manual: false,
              state: currentGame,
            },
          ]);
          executed.push(action);
          update(currentGame);
        }
        if (!valid()) break;
        const final = {
          ...completed,
          executed: {
            candidateId: chosen.id,
            actions: executed,
            clearedLines: currentGame.clearedLines - g.clearedLines,
          },
        };
        setCurrent(final);
        setHistory((h) => [final, ...h].slice(0, 100));
        setTarget(undefined);
        setStage("完成落地");
        if (single || currentGame.over) break;
        await wait(220 / speedRef.current, c.signal);
      }
    } catch (e) {
      if (valid() && !c.signal.aborted)
        setError(e instanceof Error ? e.message : "执行失败");
    } finally {
      busy.current = false;
      if (valid()) {
        runRef.current = false;
        setRunning(false);
        setStage(gameRef.current.over ? "游戏结束" : "已暂停");
      }
    }
  }
  useEffect(() => {
    pause();
    failures.current = 0;
    newSegment();
  }, [provider?.id, provider?.version]);
  useEffect(() => {
    pause();
  }, [JSON.stringify(settings)]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (runRef.current) setElapsed((t) => t + 1);
    }, 1000);
    return () => {
      clearInterval(timer);
      epoch.current.invalidate();
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!running || mode !== "manual") return;
    const timer = setInterval(
      () => manual("down"),
      Math.max(100, 800 - Math.floor(gameRef.current.clearedLines / 10) * 60),
    );
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input,select,textarea,dialog")
      )
        return;
      const actions: Record<string, Action> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowDown: "down",
        ArrowUp: "cw",
        z: "ccw",
        Z: "ccw",
        " ": "drop",
      };
      if (actions[e.key]) {
        e.preventDefault();
        manual(actions[e.key]);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", key);
    };
  }, [running, mode, game.clearedLines]);
  return {
    game,
    runInitial,
    runStartedAt,
    running,
    mode,
    setMode,
    speed,
    setSpeed,
    stage,
    error,
    all,
    target,
    history,
    current,
    elapsed,
    stats,
    actionLog,
    start,
    pause,
    restart,
    manual,
  };
}
