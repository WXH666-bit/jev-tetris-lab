import { JevCore, coreState } from "../components/SpatialLab";
import { useState, type ReactNode } from "react";
import type { StepRecord, RunRecord } from "../../../shared/lab/records";
import { JsonViewer } from "../components/JsonViewer";
import { redact } from "../../../shared/lab/redact";
export const statusLabels: Record<string, string> = {
  running: "运行中",
  paused: "已暂停",
  success: "成功",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  exhausted: "步数耗尽",
};
export function Observer({
  stage,
  current,
  steps,
  metrics = {},
  snapshot,
  onHover,
}: {
  stage: string;
  current?: StepRecord;
  steps: StepRecord[];
  metrics?: Record<string, string | number | boolean>;
  snapshot?: (step: StepRecord) => ReactNode;
  onHover?: (id?: string) => void;
}) {
  const [tab, setTab] = useState("概览");
  const [selected, setSelected] = useState<StepRecord>();
  const record = selected ?? current;
  const answers = record?.result?.answers;
  const raw = record?.result?.raw as Record<string, unknown> | undefined;
  return (
    <section className="panel lab-observer">
      <div className="panel-header">
        <h2>决策观察台</h2>
        <span className="badge">{stage}</span>
      </div>
      <JevCore
        compact
        state={
          selected || stage.includes("历史")
            ? "idle"
            : coreState(stage, record?.error, !!record?.result)
        }
        pulseKey={record?.id + String(!!record?.result)}
      />
      <div className="tabs" role="tablist">
        {["概览", "候选", "请求与响应", "步骤记录"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="observer-content">
        {selected && (
          <div className="historical">
            <b>
              历史快照 · {selected.identity.experimentId} · v
              {selected.identity.stateVersion}
            </b>
            <button
              onClick={() => {
                setSelected(undefined);
                onHover?.();
              }}
            >
              返回当前
            </button>
            {snapshot?.(selected)}
          </div>
        )}
        {tab === "概览" && (
          <>
            <span className="badge purple">
              {record?.result?.source ?? "尚无模型结果"}
            </span>
            <h3>
              {record?.action
                ? `已执行：${record.action}`
                : "等待一次可观察的选择"}
            </h3>
            <p className="muted">
              {record
                ? `${record.provider} / ${record.model} · ${record.protocol}`
                : "选择模式，开始或单步执行实验。"}
            </p>
            {record?.error && (
              <div className="error">
                {record.error}
                {record.fallback ? " · 已使用本地兜底" : ""}
              </div>
            )}
            <div className="lab-metrics">
              {Object.entries(
                selected
                  ? { 状态版本: selected.identity.stateVersion }
                  : metrics,
              ).map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <b>{typeof v === "boolean" ? (v ? "是" : "否") : v}</b>
                </div>
              ))}
            </div>
            <p>
              本次耗时：
              <span className="mono">
                {record ? `${record.elapsed} ms` : "未提供"}
              </span>
            </p>
            {answers &&
              Object.entries(answers).map(([id, a]) => (
                <div className="answer-block" key={id}>
                  <b>
                    {id} <small>{a.type}</small>
                  </b>
                  <p>
                    {a.type === "choice"
                      ? `选择 ${a.choice}`
                      : a.type === "noul"
                        ? `回答“是”的概率 ${(a.noul * 100).toFixed(1)}%`
                        : `评分 ${a.score} / ${(record!.questions[id]?.type === "score" ? (record!.questions[id] as { criteria: string[] }).criteria.length : 1) - 1}`}
                  </p>
                  <small>
                    {a.type !== "noul"
                      ? `confidence：${a.confidence ?? "未提供"}（非正确率）`
                      : "这是对问题回答“是”的模型概率，不是实际失败率。"}
                  </small>
                </div>
              ))}
            <p className="muted">
              {record?.result?.source === "Mock 模拟"
                ? "当前答案及概率为模拟值。"
                : "本地指标说明不代表模型隐藏推理。"}
            </p>
            <JsonViewer
              label="Usage / Cost"
              value={
                raw?.usage !== undefined || raw?.cost !== undefined
                  ? {
                      usage: raw?.usage ?? "未提供",
                      cost: raw?.cost ?? "未提供",
                    }
                  : undefined
              }
            />
          </>
        )}
        {tab === "候选" && (
          <>
            {!record && <p className="empty">执行后展示本次合法候选。</p>}
            {record?.candidates.map((c) => {
              const a =
                answers?.[
                  c.questionId ??
                    (c.id.includes("/") ? c.id.split("/")[0] : "move")
                ];
              const key = c.id.includes("/")
                ? c.id.split("/").slice(1).join("/")
                : c.id;
              const probability =
                c.probability ??
                (a?.type === "choice" ? a.probabilities?.[key] : undefined);
              return (
                <button
                  className="candidate-item"
                  key={c.id}
                  onMouseEnter={() => !selected && onHover?.(c.id)}
                  onMouseLeave={() => onHover?.()}
                  onFocus={() => !selected && onHover?.(c.id)}
                  onBlur={() => onHover?.()}
                  onClick={() => !selected && onHover?.(c.id)}
                >
                  <span>
                    <b>{c.label}</b>
                    {c.baseline && <em> 本地基线</em>}
                    {a?.type === "choice" && a.choice === key && (
                      <em>
                        {" "}
                        {record.result?.source === "Jev / 真实模型"
                          ? "◉ 模型选择"
                          : record.result?.source === "Mock 模拟"
                            ? "◉ Mock 选择"
                            : "◉ 本地选择"}
                      </em>
                    )}
                    {record.action === key && <em> ✓ 已执行</em>}
                    <small>{c.details}</small>
                  </span>
                  <span className="candidate-prob">
                    <i style={{ width: `${(probability ?? 0) * 100}%` }} />
                    <b>
                      {probability === undefined
                        ? "概率未提供"
                        : `${(probability * 100).toFixed(1)}%`}
                    </b>
                  </span>
                </button>
              );
            })}
            <p className="muted">
              候选来自本次状态；Mock
              概率明确为模拟值。本地基线和模型选择独立保留。
            </p>
          </>
        )}
        {tab === "请求与响应" && (
          <>
            <JsonViewer label="运行身份" value={record?.identity} />
            <JsonViewer
              label="state · 实际场景"
              value={redact(record?.state)}
            />
            <JsonViewer
              label="questions · 类型、说明与标准"
              value={redact(record?.questions)}
            />
            <JsonViewer
              label="原始响应（脱敏）"
              value={record?.errorResponse ?? record?.result?.raw}
            />
            <JsonViewer label="标准化答案" value={answers} />
            <JsonViewer label="实际执行结果" value={record?.execution} />
            {record?.error && <div className="error">{record.error}</div>}
          </>
        )}
        {tab === "步骤记录" && (
          <>
            {steps.length === 0 ? (
              <div className="empty">
                尚无已完成步骤。开始一个实验后可在此回看。
              </div>
            ) : (
              [...steps].reverse().map((s, i) => (
                <button
                  key={s.id}
                  className="history-row"
                  onClick={() => {
                    onHover?.();
                    setSelected(s);
                    setTab("请求与响应");
                  }}
                >
                  <span>
                    <b>
                      步骤 {steps.length - i} · {s.action ?? "未执行"}
                    </b>
                    <small>
                      {s.result?.source ?? "未得到结果"} · {s.model}
                    </small>
                    <small>
                      {s.error ?? new Date(s.time).toLocaleTimeString()}
                    </small>
                  </span>
                  <span className="mono">{s.elapsed}ms</span>
                </button>
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
}
export function downloadRuns(runs: RunRecord[]) {
  const data = JSON.stringify(
    redact({
      format: "jev-ai-lab/v1",
      exportedAt: new Date().toISOString(),
      scope: "当前浏览器会话；刷新不保留",
      runs,
    }),
    null,
    2,
  );
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `jev-ai-lab-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
