import { useEffect, useState } from "react";
import {
  Blocks,
  SlidersHorizontal,
  Plug,
  Play,
  Pause,
  RotateCcw,
  StepForward,
  ChevronDown,
  Keyboard,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import type { Candidate, Provider, Settings } from "../../shared/types";
import { api } from "./lib/api";
import {
  modeLabels,
  useDecisionLoop,
  type Mode,
} from "./hooks/useDecisionLoop";
import { TetrisBoard, MiniPiece } from "./components/TetrisBoard";
import { AIPanel } from "./components/AIPanel";
import { ProviderManager } from "./providers/ProviderManager";
import { Modal } from "./components/Modal";
import { Starfield } from "./components/Starfield";
const defaults: Settings = {
  seed: 42,
  minIntervalMs: 2000,
  callLimit: 100,
  candidateLimit: 24,
  fallback: true,
  failureLimit: 3,
  mockDelayMs: 400,
  mockFault: "none",
};
function loadSettings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("jev-settings") || "{}"),
    } as Settings;
  } catch {
    return defaults;
  }
}
export default function App() {
  const [animated, setAnimated] = useState(() => {
    try {
      return localStorage.getItem("jev-motion") !== "off";
    } catch {
      return true;
    }
  });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [health, setHealth] = useState("连接中");
  const [secretMode, setSecretMode] = useState("等待后端");
  const [manager, setManager] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [hover, setHover] = useState<Candidate>();
  const active = providers.find((p) => p.active);
  const loop = useDecisionLoop(active, settings);
  useEffect(() => {
    setHover(undefined);
  }, [loop.game.pieceId]);
  async function refresh() {
    setProviders(await api<Provider[]>("/providers"));
  }
  useEffect(() => {
    let valid = true;
    Promise.all([
      api<Provider[]>("/providers"),
      api<{ secretMode: string }>("/health"),
    ])
      .then(([p, h]) => {
        if (valid) {
          setProviders(p);
          setSecretMode(h.secretMode);
          setHealth("服务已连接");
        }
      })
      .catch(() => {
        if (valid) setHealth("后端未连接 · 本地可用");
      });
    return () => {
      valid = false;
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("jev-settings", JSON.stringify(settings));
  }, [settings]);
  function openManager() {
    loop.pause();
    setManager(true);
  }
  return (
    <div className={`app-shell${animated ? "" : " motion-off"}`}>
      <Starfield animated={animated} />
      <header className="topbar">
        <a className="brand" href="/">
          <div className="brand-icon">
            <Blocks size={23} />
          </div>
          <span>
            Jev <b>Tetris Lab</b>
            <small>A COSMIC DECISION PLAYGROUND</small>
          </span>
          <span className="version">COSMIC EDITION</span>
        </a>
        <div className="top-actions">
          <button
            className="motion-toggle"
            aria-label="星空动态效果"
            aria-pressed={animated}
            title={animated ? "关闭装饰动态效果" : "开启装饰动态效果"}
            onClick={() => {
              setAnimated((v) => !v);
              try {
                localStorage.setItem("jev-motion", animated ? "off" : "on");
              } catch {
                /* Optional preference storage. */
              }
            }}
          >
            <Sparkles size={16} />
            <span>{animated ? "动态开启" : "静谧模式"}</span>
          </button>
          <span className="connection">
            <span className="dot" />
            {health}
          </span>
          <button onClick={openManager}>
            <Plug size={16} />
            模型供应商
          </button>
          <button
            aria-label="设置"
            onClick={() => {
              loop.pause();
              setSettingsOpen(true);
            }}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </header>
      <main>
        <div className="workspace-heading">
          <div className="orbital-art" aria-hidden="true">
            <div className="orbital-ring" />
            <div className="orbital-ring second" />
            <div className="planet" />
            <span className="satellite" />
          </div>
          <div>
            <div className="eyebrow hero-kicker">
              <span /> EXPERIMENT 001 <i /> INTO THE UNKNOWN
            </div>
            <h1>
              在星海中，
              <br className="hero-break" />
              观察 AI 的每一次选择<span>。</span>
            </h1>
            <p>每一个落点，都是一次探索。让模型的决策轨迹，在此刻显现。</p>
          </div>
          <div className="mode-select">
            <span className="badge cyan">
              {loop.mode === "real" && active?.protocol === "mock"
                ? "模拟演示 · 后端"
                : modeLabels[loop.mode]}
            </span>
            <select
              aria-label="选择供应商"
              value={active?.id ?? ""}
              onChange={async (e) => {
                loop.pause();
                try {
                  await api(`/providers/${e.target.value}/active`, {
                    method: "POST",
                  });
                  await refresh();
                } catch {
                  setHealth("切换失败，请检查后端");
                }
              }}
            >
              <option value="" disabled>
                选择模型供应商
              </option>
              {providers
                .filter((p) => p.enabled)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} / {p.modelId}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="workspace">
          <section className="game-panel panel">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <span className="live-indicator" />
                <h2>游戏实验区</h2>
              </div>
              <div className="flex gap-2 items-center">
                <span className="muted mono">SEED {settings.seed}</span>
                <span className="badge">
                  {loop.game.over
                    ? "已结束"
                    : loop.running
                      ? "运行中"
                      : "已暂停"}
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
                  onClick={() =>
                    loop.running ? loop.pause() : void loop.start()
                  }
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
                  {(
                    ["left", "right", "ccw", "cw", "down", "drop"] as const
                  ).map((a, i) => (
                    <button key={a} onClick={() => loop.manual(a)}>
                      {["←", "→", "逆旋", "顺旋", "↓", "硬降"][i]}
                    </button>
                  ))}
                </div>
              )}
              <div className="keyboard-note">
                <Keyboard size={14} />
                手动模式：← → 移动 · ↑ 顺旋 · Z 逆旋 · ↓ 软降 · 空格硬降
              </div>
            </div>
          </section>
          <AIPanel
            stage={loop.stage}
            current={loop.current}
            history={loop.history}
            all={loop.all}
            onTarget={setHover}
            stats={loop.stats}
            mode={modeLabels[loop.mode]}
          />
        </div>
        <footer>
          <span>
            JEV TETRIS LAB <span className="muted">/</span>{" "}
            为观察、比较与复现实验而构建
          </span>
          <span>
            本地模拟无需密钥 <ChevronDown size={12} />
          </span>
        </footer>
      </main>
      {manager && (
        <ProviderManager
          providers={providers}
          refresh={refresh}
          onClose={() => setManager(false)}
          secretMode={secretMode}
        />
      )}
      {settingsOpen && (
        <Modal title="实验设置" onClose={() => setSettingsOpen(false)}>
          <p className="muted">
            修改设置后继续实验生效；随机种子在重新开始时应用。
          </p>
          <div className="form-grid">
            {(
              [
                ["seed", "随机种子", 0, 4294967295],
                ["minIntervalMs", "最小请求间隔 (ms)", 1000, 60000],
                ["callLimit", "本局主要调用上限", 1, 10000],
                ["candidateLimit", "提交候选上限", 2, 100],
                ["failureLimit", "连续失败停止阈值", 1, 10],
                ["mockDelayMs", "模拟延迟 (ms)", 0, 10000],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={settings[key]}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      [key]: Math.min(
                        max,
                        Math.max(min, Number(e.target.value)),
                      ),
                    }))
                  }
                />
              </label>
            ))}
            <label>
              失败处理
              <select
                value={settings.fallback ? "fallback" : "pause"}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    fallback: e.target.value === "fallback",
                  }))
                }
              >
                <option value="fallback">本地启发式兜底</option>
                <option value="pause">暂停并保留错误</option>
              </select>
            </label>
            <label>
              模拟故障
              <select
                value={settings.mockFault}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    mockFault: e.target.value as Settings["mockFault"],
                  }))
                }
              >
                <option value="none">无故障</option>
                <option value="error">格式 / 服务错误</option>
                <option value="timeout">模拟超时</option>
              </select>
            </label>
          </div>
          <div className="local-note">
            <strong>本地策略固定权重（非训练最优参数）</strong>
            <p className="mono">
              消行 +10 · 洞 −7 · 总高度 −0.5
              <br />
              凹凸 −0.35 · 最大高度 −0.8 · 顶部溢出 −10000
            </p>
            <p>主要调用上限不包含重试与连接测试；真实费用以供应商账单为准。</p>
          </div>
          <button className="primary" onClick={() => setSettingsOpen(false)}>
            保存并关闭
          </button>
        </Modal>
      )}
    </div>
  );
}
