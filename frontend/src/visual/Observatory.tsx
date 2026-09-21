import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Orbit, Pause, Play, RotateCcw } from "lucide-react";
import { REFERENCE_END } from "./resonanceChoreography";
import type { Quality } from "./tokens";
import type { SceneStats } from "./ObservatoryScene";
import { JevCore } from "../components/SpatialLab";
const entries = [
  {
    id: "tetris",
    title: "空间的下一种可能",
    name: "俄罗斯方块",
    note: "布局 · 收益 · 风险",
    en: "TETRIS LAB",
  },
  {
    id: "pathfinding",
    title: "寻找通向目标的路",
    name: "路径规划",
    note: "多步规划 · 目标一致性",
    en: "PATHFINDING LAB",
  },
  {
    id: "playground",
    title: "让判断拥有结构",
    name: "结构化决策",
    note: "Choice · Noul · Score",
    en: "DECISION PLAYGROUND",
  },
];
export function Observatory({
  quality,
  navigate,
}: {
  quality: Quality;
  navigate: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef =
    useRef<ReturnType<typeof import("./ObservatoryScene").mountObservatory>>(
      undefined,
    );
  const [appearance, setAppearance] = useState<"resonance" | "pearl">(
    "resonance",
  );
  const appearanceRef = useRef(appearance);
  const [presentation, setPresentation] = useState({ time: 0, paused: false });
  const presentationRef = useRef(presentation);
  function reportPresentation(time: number, paused: boolean) {
    // Clamp the inspection timeline only; the particle animation continues beyond 7.17 s.
    const next = { time: Math.min(time, REFERENCE_END), paused };
    if (
      next.time !== presentationRef.current.time ||
      next.paused !== presentationRef.current.paused
    ) {
      presentationRef.current = next;
      setPresentation(next);
    }
  }
  appearanceRef.current = appearance;
  useEffect(() => {
    sceneRef.current?.setAppearance(appearance);
  }, [appearance]);
  const [status, setStatus] = useState("正在加载 3D 装置");
  const [stats, setStats] = useState<SceneStats>();
  const [fallback, setFallback] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let scene:
      | ReturnType<typeof import("./ObservatoryScene").mountObservatory>
      | undefined;
    setStats(undefined);
    if (fallback) {
      setStatus("二维备用视图");
      return;
    }
    setStatus("正在加载 3D 装置");
    import("./ObservatoryScene")
      .then(({ mountObservatory }) => {
        if (cancelled || !host.current) return;
        try {
          scene = mountObservatory(
            host.current,
            quality,
            setStats,
            setStatus,
            "home",
            reportPresentation,
          );
          sceneRef.current = scene;
          scene.setAppearance(appearanceRef.current);
          scene.setPresentation(
            presentationRef.current.time,
            presentationRef.current.paused,
          );
        } catch {
          setStatus("WebGL 不可用 · 已切换备用视图");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("3D 资源加载失败 · 已切换备用视图");
      });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = undefined;
    };
  }, [quality, fallback, attempt]);
  const ready = status === "实时 3D";
  return (
    <section
      className="observatory"
      data-appearance={appearance}
      aria-label="星云观测站"
    >
      <div className="observatory-heading">
        <span className="eyebrow">
          <Orbit size={14} /> JEV / CELESTIAL OBSERVATORY
        </span>
        <h2>
          让每一次选择，
          <br />
          <em>照亮一种可能。</em>
        </h2>
        <p>
          在可交互的环境中，
          <br />
          观察、验证并比较 AI 的决策。
        </p>
        <span className="observatory-id">状态 → 候选 → 决策 → 实际结果</span>
      </div>
      <div className={`observatory-scene ${ready ? "ready" : ""}`} ref={host} />
      {!ready && (
        <div className="observatory-fallback">
          <JevCore />
          <span>实验入口始终可用</span>
        </div>
      )}
      <div className="core-name">
        <b>
          {appearance === "resonance" && ready ? "JEV / RESONANCE" : "JEV CORE"}
        </b>
        <span>装饰预览 · 非模型数据</span>
        <div className="scene-selector" role="group" aria-label="首页装置">
          <button
            aria-pressed={appearance === "resonance"}
            onClick={() => setAppearance("resonance")}
          >
            星轨共振
          </button>
          <button
            aria-pressed={appearance === "pearl"}
            onClick={() => setAppearance("pearl")}
          >
            珠光核心
          </button>
        </div>
      </div>
      <div className="observatory-entries">
        {entries.map((e, i) => (
          <button
            className={`observatory-entry entry-${i}`}
            key={e.id}
            onClick={() => navigate(e.id)}
          >
            <span className="eyebrow">
              0{i + 1} / {e.en}
            </span>
            <strong>
              {e.name}
              <ArrowUpRight size={18} />
            </strong>
            <span>{e.note}</span>
          </button>
        ))}
      </div>
      <div className="renderer-tools">
        {appearance === "resonance" && ready && (
          <div
            className="presentation-controls"
            role="group"
            aria-label="装置镜头回看"
          >
            <button
              disabled={quality === "reduced"}
              aria-label={presentation.paused ? "播放装置" : "暂停装置"}
              onClick={() =>
                sceneRef.current?.setPresentation(
                  undefined,
                  !presentation.paused,
                )
              }
            >
              {presentation.paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max={REFERENCE_END}
              step="0.01"
              value={presentation.time}
              aria-label="参考镜头时间"
              title="拖动以定格查看；始终保持斜前方视角"
              onChange={(event) =>
                sceneRef.current?.setPresentation(
                  Number(event.target.value),
                  true,
                )
              }
            />
            <output className="mono">{presentation.time.toFixed(2)} s</output>
            <button
              aria-label="重播参考镜头"
              onClick={() => sceneRef.current?.setPresentation(0, false)}
            >
              <RotateCcw size={13} /> 重播
            </button>
          </div>
        )}
        <span className="renderer-status">{status}</span>
        <button
          onClick={() => {
            setFallback((v) => !v);
            setAttempt((v) => v + 1);
          }}
        >
          {fallback ? "恢复 3D" : "使用备用视图"}
        </button>
        {!ready && !fallback && (
          <button onClick={() => setAttempt((v) => v + 1)}>重试加载</button>
        )}
        <details>
          <summary>渲染监测</summary>
          <div>
            {stats && ready
              ? `${stats.fps} FPS · CPU 提交 ${stats.frameMs} ms · ${stats.calls} draws · ${stats.triangles.toLocaleString()} 三角形 · DPR ${stats.dpr.toFixed(2)}`
              : quality === "reduced"
                ? "静态呈现 · 仅在尺寸变化时渲染"
                : "采样未提供"}
            <p>本地渲染采样，非模型耗时；离屏或后台暂停。</p>
          </div>
        </details>
      </div>
    </section>
  );
}
