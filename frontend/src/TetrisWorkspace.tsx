import { useEffect, useMemo, useState } from "react";
import {
  Play,
  Pause,
  StepForward,
  RotateCcw,
  Keyboard,
  FlaskConical,
} from "lucide-react";
import type { Candidate, DecisionRecord } from "../../shared/types";
import type { StepRecord, RunRecord } from "../../shared/lab/records";
import { questions } from "../../shared/decisions";
import { snapshot, metrics } from "../../shared/game/candidates";
import { step } from "../../shared/game/engine";
import {
  useDecisionLoop,
  modeLabels,
  type Mode,
} from "./hooks/useDecisionLoop";
import { TetrisBoard, MiniPiece } from "./components/TetrisBoard";
import { useLab, usePublishRun, Workspace } from "./lab/context";
import { Observer } from "./lab/Observer";
function adapt(r: DecisionRecord): StepRecord {
  const p = r.result;
  return {
    id: r.id,
    time: r.time,
    identity: {
      experimentId: "tetris",
      runId: r.state.sessionId,
      stepId: r.state.pieceId,
      stateVersion: r.state.stateVersion,
      configVersion: r.configVersion ?? 0,
      requestId: r.id,
    },
    state: r.state,
    questions: questions(r.state),
    candidates: r.state.candidates.map((c, i) => ({
      questionId: "placement",
      id: c.id,
      label: `${c.id} · x=${c.x} · ${c.rotation * 90}°`,
      details: `消行 ${c.after.clearedLines} / 洞 ${c.after.holes} / 高度 ${c.after.maxHeight} / 评分 ${c.heuristicScore.toFixed(1)}`,
      baseline: i === 0,
      probability: p?.probabilities?.[c.id],
    })),
    result: p
      ? {
          answers: {
            placement: {
              type: "choice",
              choice: p.candidateId,
              probabilities: p.probabilities,
              confidence: p.confidence,
            },
            ...(p.boardRisk !== undefined
              ? { board_risk: { type: "noul" as const, noul: p.boardRisk } }
              : {}),
            ...(p.boardQuality !== undefined
              ? {
                  board_quality: {
                    type: "score" as const,
                    score: p.boardQuality,
                  },
                }
              : {}),
          },
          raw: p.raw,
          source: r.fallback
            ? "错误后兜底"
            : p.source === "本地启发式"
              ? "本地策略"
              : p.source,
          latencyMs: p.latencyMs,
          status: p.status,
          attempts: p.attempts,
        }
      : undefined,
    error: r.error,
    errorResponse: r.errorResponse,
    action: r.executed?.candidateId,
    execution: r.executed,
    elapsed: r.elapsed,
    provider: r.provider,
    model: r.model,
    protocol: r.protocol,
    fallback: r.fallback,
  };
}
export default function TetrisWorkspace() {
  const { provider, settings, suspendToken } = useLab();
  const loop = useDecisionLoop(provider, settings);
  const [hover, setHover] = useState<Candidate>();
  useEffect(() => setHover(undefined), [loop.game.pieceId, loop.mode]);
  const steps = useMemo(
    () =>
      [
        ...loop.history.slice().reverse().map(adapt),
        ...loop.actionLog
          .filter((a) => a.manual)
          .map((a, i): StepRecord => ({
            id: `manual-${a.state.sessionId}-${i}`,
            time: a.time,
            identity: {
              experimentId: "tetris",
              runId: a.state.sessionId,
              stepId: a.state.pieceId,
              stateVersion: a.stateVersion,
              configVersion: 0,
              requestId: `manual-${i}`,
            },
            state: snapshot(a.state, []),
            questions: {},
            candidates: [],
            result: {
              answers: {},
              raw: null,
              source: "手动操作",
              latencyMs: 0,
            },
            action: a.action,
            execution: step(a.state, a.action),
            elapsed: 0,
            provider: "手动操作",
            model: "不适用",
            protocol: "manual",
            fallback: false,
          })),
      ].sort((a, b) => a.time.localeCompare(b.time)),
    [loop.history, loop.actionLog],
  );
  const current = useMemo(
    () => (loop.current ? adapt(loop.current) : steps.at(-1)),
    [loop.current, steps],
  );
  const record = useMemo<RunRecord | null>(
    () =>
      !loop.running && !loop.history.length && !loop.actionLog.length
        ? null
        : {
            id: loop.game.sessionId,
            experimentId: "tetris",
            experimentVersion: "1.0.0",
            seed: settings.seed,
            parameters: settings,
            baselineVersion: "heuristic-v1",
            mode: loop.mode,
            provider: {
              id: loop.mode === "real" ? provider?.id : undefined,
              name:
                loop.mode === "real"
                  ? (provider?.name ?? "未选择")
                  : "本地运行时",
              modelId:
                loop.mode === "real"
                  ? (provider?.modelId ?? "未选择")
                  : loop.mode,
              protocol:
                loop.mode === "real"
                  ? (provider?.protocol ?? "未选择")
                  : loop.mode,
              version: provider?.version,
            },
            startedAt: loop.runStartedAt,
            status: loop.game.over
              ? "completed"
              : loop.running
                ? "running"
                : loop.error && !settings.fallback
                  ? "failed"
                  : "paused",
            stepCount: loop.game.pieces - loop.runInitial.pieces,
            requests: loop.stats.requests,
            failures: loop.stats.failures,
            latencyMs: loop.stats.totalMs,
            metrics: {
              分数: loop.game.score,
              消行: loop.game.clearedLines,
              已落地: loop.game.pieces,
              游戏结束: loop.game.over,
            },
            steps,
            actions: loop.actionLog.map((a) => ({
              time: a.time,
              action: a.action,
              stateVersion: a.stateVersion,
              source: a.manual ? "手动操作" : "决策路径",
            })),
            initialState: loop.runInitial,
          },
    [
      loop.game,
      loop.running,
      loop.history,
      loop.actionLog,
      loop.mode,
      loop.error,
      loop.stats,
      steps,
      provider,
      settings,
      loop.runInitial,
      loop.runStartedAt,
    ],
  );
  usePublishRun(record);
  useEffect(() => {
    loop.pause();
    setHover(undefined);
  }, [suspendToken]);
  const boardMetrics = metrics(loop.game.board);
  const observer = (
    <Observer
      key={loop.game.sessionId}
      stage={loop.stage}
      current={current}
      steps={steps}
      metrics={{
        当前方块: loop.game.currentPiece.type,
        下一块: loop.game.nextPiece,
        最大高度: boardMetrics.maxHeight,
        洞数: boardMetrics.holes,
        凹凸度: boardMetrics.bumpiness,
        请求次数: loop.stats.requests,
        平均请求耗时: loop.stats.completedRequests
          ? `${Math.round(loop.stats.totalMs / loop.stats.completedRequests)} ms`
          : "未提供",
        失败次数: loop.stats.failures,
        兜底次数: loop.stats.fallbacks,
        候选总数: loop.all.length,
        提交数量: loop.current?.state.candidates.length ?? 0,
        本地筛选: loop.current
          ? loop.current.total > loop.current.state.candidates.length
          : false,
        控制来源: modeLabels[loop.mode],
      }}
      onHover={(id) =>
        setHover(loop.current?.state.candidates.find((c) => c.id === id))
      }
      snapshot={(r) => {
        const s = r.state as ReturnType<typeof snapshot>;
        return (
          <div className="snapshot-board">
            <TetrisBoard
              board={s.board}
              piece={s.currentPiece}
              target={s.candidates.find((c) => c.id === r.action)}
            />
          </div>
        );
      }}
    />
  );
  return (
    <Workspace observer={observer}>
      {" "}
      <section className="game-panel panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <span className="live-indicator" />
            <h2>游戏实验区</h2>
          </div>
          <div className="flex gap-2 items-center">
            <span className="muted mono">SEED {settings.seed}</span>
            <span className="badge">
              {loop.game.over ? "已结束" : loop.running ? "运行中" : "已暂停"}
            </span>
          </div>
        </div>
        <div className="game-stage">
          <div className="board-column">
            <div className="board-ruler">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i}>{i}</span>
              ))}
            </div>
            <TetrisBoard
              landingKey={loop.game.pieces}
              clearedLines={loop.game.clearedLines}
              board={
                hover && loop.current
                  ? loop.current.state.board
                  : loop.game.board
              }
              piece={
                hover && loop.current
                  ? loop.current.state.currentPiece
                  : loop.game.currentPiece
              }
              target={hover ?? loop.target}
              over={loop.game.over}
            />
            {hover && (
              <p className="cyan text-xs mt-2">
                候选预览 · 决策快照 {hover.id}
              </p>
            )}
            <div className="board-caption">
              <span>
                <i className="legend ghost-block" />
                硬降预览
              </span>
              <span>
                <i className="legend target-block" />
                AI 目标落点
              </span>
              <span className="mono">10 × 20</span>
            </div>
          </div>
          <aside className="game-sidebar">
            <div className="next-card">
              <span className="eyebrow">UP NEXT</span>
              <MiniPiece type={loop.game.nextPiece} />
              <span className="muted mono">7-BAG RANDOMIZER</span>
            </div>
            <div className="score-card">
              <span className="eyebrow">SCORE</span>
              <strong data-testid="score" className="mono">
                {loop.game.score.toString().padStart(5, "0")}
              </strong>
              <span className="muted">消行奖励 × 等级</span>
            </div>
            <div className="game-stat">
              <span>消除行数</span>
              <b data-testid="lines">{loop.game.clearedLines}</b>
            </div>
            <div className="game-stat">
              <span>当前等级</span>
              <b>{Math.floor(loop.game.clearedLines / 10) + 1}</b>
            </div>
            <div className="game-stat">
              <span>已落地方块</span>
              <b data-testid="pieces">{loop.game.pieces}</b>
            </div>
            <div className="game-stat">
              <span>存活时间</span>
              <b>
                {Math.floor(loop.elapsed / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(loop.elapsed % 60).toString().padStart(2, "0")}
              </b>
            </div>
            <div className="experiment-note">
              <FlaskConical size={19} />
              <strong>决策回合制</strong>
              <p>等待模型时暂停重力；收到结果后，逐步执行合法动作。</p>
              <small>播放速度仅影响动作展示。</small>
            </div>
          </aside>
        </div>
        <div className="controls">
          <div className="control-row">
            <button
              className="primary grow"
              onClick={() => (loop.running ? loop.pause() : void loop.start())}
              disabled={loop.game.over}
            >
              {loop.running ? <Pause size={16} /> : <Play size={16} />}{" "}
              {loop.running
                ? "暂停"
                : loop.game.pieces
                  ? "继续实验"
                  : "开始实验"}
            </button>
            <button
              disabled={
                loop.running || loop.game.over || loop.mode === "manual"
              }
              onClick={() => void loop.start(true)}
            >
              <StepForward size={16} />
              单步执行
            </button>
            <button
              aria-label="重新开始"
              title="使用当前种子重新开始"
              onClick={loop.restart}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="control-row justify-between">
            <div className="speed-buttons">
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => loop.setSpeed(s)}
                  className={loop.speed === s ? "active" : ""}
                >
                  {s}x
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="muted">控制模式</span>
              <select
                aria-label="控制模式"
                value={loop.mode}
                onChange={(e) => loop.setMode(e.target.value as Mode)}
              >
                {Object.entries(modeLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {loop.error && (
            <div role="alert" className="error">
              {loop.error}
            </div>
          )}
          {loop.mode === "manual" && (
            <div className="manual-buttons">
              {(["left", "right", "ccw", "cw", "down", "drop"] as const).map(
                (a, i) => (
                  <button key={a} onClick={() => loop.manual(a)}>
                    {["←", "→", "逆旋", "顺旋", "↓", "硬降"][i]}
                  </button>
                ),
              )}
            </div>
          )}
          <div className="keyboard-note">
            <Keyboard size={14} />
            手动模式：← → 移动 · ↑ 顺旋 · Z 逆旋 · ↓ 软降 · 空格硬降
          </div>
        </div>
      </section>
    </Workspace>
  );
}
