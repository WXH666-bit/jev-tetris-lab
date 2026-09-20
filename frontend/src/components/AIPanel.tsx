import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  Copy,
  History,
  Terminal,
  Layers,
} from "lucide-react";
import type { Candidate, DecisionRecord } from "../../../shared/types";
import { TetrisBoard } from "./TetrisBoard";
import { JsonViewer } from "./JsonViewer";
export { JsonViewer } from "./JsonViewer";
export function AIPanel({
  stage,
  current,
  history,
  all,
  onTarget,
  stats,
  mode,
}: {
  stage: string;
  current?: DecisionRecord;
  history: DecisionRecord[];
  all: Candidate[];
  onTarget: (c?: Candidate) => void;
  stats: {
    requests: number;
    failures: number;
    fallbacks: number;
    totalMs: number;
    completedRequests: number;
  };
  mode: string;
}) {
  const [tab, setTab] = useState("概览");
  const [selected, setSelected] = useState<DecisionRecord>();
  const record = selected ?? current;
  const chosen = record?.state.candidates.find(
    (c) => c.id === record.result?.candidateId,
  );
  const result = record?.result;
  const stages = [
    "观察局面",
    "生成候选",
    "请求模型",
    "校验结果",
    "执行动作",
    "完成落地",
  ];
  const stageIndex = stages.indexOf(stage.replace("（Mock）", ""));
  const list = selected ? selected.state.candidates : all;
  const raw = result?.raw as Record<string, unknown> | undefined;
  return (
    <section className="console panel">
      <div className="panel-header">
        <div className="flex gap-2 items-center">
          <Activity size={17} className="cyan" />
          <h2>AI 决策控制台</h2>
        </div>
        <span className="eyebrow">DECISION INSPECTOR</span>
      </div>
      <div className="phase">
        <div className="flex justify-between items-center">
          <span className="badge cyan">{stage}</span>
          <span className="muted mono">
            {current
              ? `v${current.state.stateVersion.toString().padStart(4, "0")}`
              : "v0000"}
          </span>
        </div>
        <div className="phase-track">
          {stages.map((s, i) => (
            <div
              key={s}
              className={
                i === stageIndex ? "active" : i < stageIndex ? "done" : ""
              }
            >
              <span>
                {i < stageIndex ? (
                  <Check size={11} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <small>{s}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="tabs" role="tablist">
        {["概览", "候选方案", "请求与响应", "决策历史"].map((t, i) => (
          <button
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {
              [
                <Activity size={14} />,
                <Layers size={14} />,
                <Terminal size={14} />,
                <History size={14} />,
              ][i]
            }
            {t}
            {t === "决策历史" && (
              <span className="count">{history.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="console-body">
        {selected && (
          <div className="historical">
            <strong>
              历史快照 · {new Date(selected.time).toLocaleTimeString()}
            </strong>
            <button onClick={() => setSelected(undefined)}>返回实时</button>
            <div className="snapshot-board">
              <TetrisBoard
                board={selected.state.board}
                piece={selected.state.currentPiece}
                target={chosen}
              />
            </div>
          </div>
        )}
        {tab === "概览" && (
          <>
            <div className="section-title">
              <span className="eyebrow">CURRENT DECISION</span>
              <span
                className={
                  result?.source === "Jev / 真实模型"
                    ? "badge purple"
                    : "badge yellow"
                }
              >
                {result?.source ?? (mode === "手动" ? "手动操作" : "等待决策")}
              </span>
            </div>
            <div className="decision-card">
              <div className="flex justify-between">
                <div>
                  <p className="muted">
                    {record?.provider ?? "本地运行时"} /{" "}
                    <span className="purple">
                      {record?.model ?? "deterministic-mock"}
                    </span>
                  </p>
                  <h3>
                    {chosen
                      ? `选择落点 ${chosen.id}`
                      : "让一个决策，变得可见。"}
                  </h3>
                  <p>
                    {record?.protocol ?? "本地模拟"}
                    {result?.attempts
                      ? ` · 实际尝试 ${result.attempts} 次`
                      : ""}
                  </p>
                </div>
                <ArrowUpRight size={22} className="cyan" />
              </div>
              <p>
                {chosen
                  ? `目标 x=${chosen.x}, y=${chosen.y} · 旋转 ${chosen.rotation * 90}°`
                  : "从合法落点开始，观察模型如何选择并执行。"}
              </p>
              <div className="path mono">
                {chosen
                  ? chosen.actions.join(" → ")
                  : "观察 → 决策 → 执行 → 落地"}
              </div>
            </div>
            {record?.error && (
              <div className="error" role="alert">
                {record.error} ·{" "}
                {record.fallback ? "已使用本地启发式兜底" : "已暂停"}
              </div>
            )}
            <div className="metric-grid">
              <Metric
                label="本次耗时"
                value={result ? `${record?.elapsed} ms` : "—"}
              />
              <Metric
                label="本局平均请求耗时"
                value={
                  stats.completedRequests
                    ? `${Math.round(stats.totalMs / stats.completedRequests)} ms`
                    : "—"
                }
              />
              <Metric
                label="棋盘高度 / 洞数"
                value={
                  record
                    ? `${record.state.metrics.maxHeight} / ${record.state.metrics.holes}`
                    : "0 / 0"
                }
              />
              <Metric
                label="当前 / 下一块"
                value={
                  record
                    ? `${record.state.currentPiece.type} / ${record.state.nextPiece}`
                    : "—"
                }
              />
              <Metric
                label="当前凹凸度 / 总高度"
                value={
                  record
                    ? `${record.state.metrics.bumpiness} / ${record.state.metrics.aggregateHeight}`
                    : "0 / 0"
                }
              />
            </div>
            <div className="section-title">
              <span className="eyebrow">MODEL SIGNALS</span>
              <span className="muted">
                {result?.source === "Mock 模拟"
                  ? "模拟值 · 非真实模型输出"
                  : "仅展示已返回数据"}
              </span>
            </div>
            <Signal
              label="风险判断 · 回答“是”的模型概率"
              value={result?.boardRisk}
            />
            <Signal
              label="Confidence · 模型置信度"
              value={result?.confidence}
            />
            <div className="flex justify-between signal">
              <span>棋盘质量 · score</span>
              <span className="mono">
                {result?.boardQuality !== undefined
                  ? `${result.boardQuality.toFixed(2)} / 4`
                  : "未提供"}
              </span>
            </div>
            <div className="signal flex justify-between">
              <span>Usage / Cost</span>
              <span className="mono">
                {raw?.usage || raw?.cost ? "见原始响应" : "未提供"}
              </span>
            </div>
            <div className="local-note">
              <strong>本地指标说明</strong>
              <p>
                {chosen
                  ? `此落点预计消除 ${chosen.after.clearedLines} 行，落地后洞数 ${chosen.after.holes}，最大高度 ${chosen.after.maxHeight}，表面凹凸度 ${chosen.after.bumpiness}。`
                  : "落点特征由游戏引擎计算；模型无需重新数格子。"}
                这些是程序计算的指标，不是模型的隐藏推理。
              </p>
            </div>
            <div className="request-stats">
              <span>
                请求 <b>{stats.requests}</b>
              </span>
              <span>
                失败 <b>{stats.failures}</b>
              </span>
              <span>
                兜底 <b>{stats.fallbacks}</b>
              </span>
            </div>
          </>
        )}
        {tab === "候选方案" && (
          <>
            <p className="muted">
              总计 {record?.total ?? all.length} · 实际提交{" "}
              {record?.state.candidates.length ?? 0} ·{" "}
              {record && record.total > record.state.candidates.length
                ? "已本地筛选（高分 + 位置多样性）"
                : "未筛选"}
            </p>
            <p className="muted">
              {result?.source === "Mock 模拟"
                ? "概率为模拟值，非真实模型输出。"
                : "未提交 / 接口未返回的概率显示“不提供”。"}
              <br />★ 本地最高 · ◉ 模型选择 · ✓ 实际执行
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>候选 / 落点</th>
                    <th>行 / 洞 / 高</th>
                    <th>本地评分</th>
                    <th>模型概率</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr
                      key={c.id}
                      tabIndex={0}
                      onMouseEnter={() => !selected && onTarget(c)}
                      onMouseLeave={() => onTarget(undefined)}
                      onFocus={() => !selected && onTarget(c)}
                      onBlur={() => onTarget(undefined)}
                      onClick={() => !selected && onTarget(c)}
                      className={c.id === chosen?.id ? "chosen" : ""}
                    >
                      <td>
                        <strong className="mono">{c.id}</strong>{" "}
                        {c.id === list[0]?.id ? "★" : ""}
                        {c.id === result?.candidateId &&
                        result.source === "Jev / 真实模型"
                          ? "◉"
                          : ""}
                        {record?.executed?.candidateId === c.id ? "✓" : ""}
                        <small>
                          x {c.x} · {c.rotation * 90}°
                        </small>
                      </td>
                      <td className="mono">
                        {c.after.clearedLines} / {c.after.holes} /{" "}
                        {c.after.maxHeight}
                      </td>
                      <td className="mono">{c.heuristicScore.toFixed(1)}</td>
                      <td>
                        <Probability value={result?.probabilities?.[c.id]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!list.length && (
              <p className="empty">开始或单步执行后生成合法候选。</p>
            )}
          </>
        )}
        {tab === "请求与响应" && (
          <>
            <p className="muted">
              {record?.protocol ?? "尚未请求"} · 已脱敏 · 不包含认证头
            </p>
            <JsonViewer
              label="state · 局面与已计算候选"
              value={record?.state}
            />
            <JsonViewer
              label="questions · type / instructions / criteria"
              value={record?.questions}
            />
            <JsonViewer
              label="原始响应 · answers"
              value={record?.errorResponse ?? result?.raw}
            />
            <JsonViewer
              label="标准化结果"
              value={result ? { ...result, raw: undefined } : undefined}
            />
            <JsonViewer label="实际执行结果" value={record?.executed} />
          </>
        )}
        {tab === "决策历史" && (
          <>
            <p className="muted">最近 100 次 · 点击查看当时的局面和请求响应</p>
            {history.length === 0 && (
              <div className="empty">
                <History size={30} />
                <p>还没有完成的决策</p>
              </div>
            )}
            {history.map((r) => (
              <button
                className="history-row"
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setTab("请求与响应");
                }}
              >
                <span className="piece-icon">{r.state.currentPiece.type}</span>
                <span>
                  <strong>
                    {r.provider} / {r.model}
                  </strong>
                  <small>
                    {new Date(r.time).toLocaleTimeString()} · v
                    {r.state.stateVersion} ·{" "}
                    {r.executed?.candidateId ?? "未执行"} · 消行{" "}
                    {r.executed?.clearedLines ?? 0}
                  </small>
                  <small>{r.error ?? r.result?.source}</small>
                </span>
                <span className="mono">
                  {r.elapsed}ms
                  <br />
                  {r.fallback ? "兜底" : "↗"}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="console-footer">
        <span className="dot" />
        实验数据 · 不代表最优策略或无限生存能力
      </div>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}
function Probability({ value }: { value?: number }) {
  return value === undefined ? (
    <span className="muted">不提供</span>
  ) : (
    <div className="probability">
      <span style={{ width: `${value * 100}%` }} />
      <b>{(value * 100).toFixed(1)}%</b>
    </div>
  );
}
function Signal({ label, value }: { label: string; value?: number }) {
  return (
    <div className="signal">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="mono">
          {value === undefined ? "未提供" : `${(value * 100).toFixed(1)}%`}
        </span>
      </div>
      <div className="signal-bar">
        <span style={{ width: `${(value ?? 0) * 100}%` }} />
      </div>
    </div>
  );
}
