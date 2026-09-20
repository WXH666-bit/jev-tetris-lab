import { useEffect, useRef, useState, type CSSProperties } from "react";

export type VisualQuality = "standard" | "enhanced" | "reduced";
export function useSpatial(animated: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [quality, setQuality] = useState<VisualQuality>(() => {
    const saved = localStorage.getItem("jev-visual-quality");
    return saved === "enhanced" || saved === "reduced" ? saved : "standard";
  });
  const [systemReduced, setReduced] = useState(false);
  const lowPower =
    typeof navigator !== "undefined" &&
    ((navigator.hardwareConcurrency || 8) <= 4 ||
      ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
        8) <= 4);
  const effective =
    !animated || systemReduced || quality === "reduced"
      ? "reduced"
      : lowPower
        ? "standard"
        : quality;
  useEffect(() => {
    localStorage.setItem("jev-visual-quality", quality);
  }, [quality]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const el = ref.current!;
    let frame = 0;
    const reset = () => {
      el.style.setProperty("--space-x", "0px");
      el.style.setProperty("--space-y", "0px");
    };
    const visibility = () => {
      el.dataset.hidden = String(document.hidden);
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        reset();
      }
    };
    const move = (event: PointerEvent) => {
      if (
        effective !== "enhanced" ||
        document.hidden ||
        event.pointerType !== "mouse" ||
        frame
      )
        return;
      const x = (event.clientX / innerWidth - 0.5) * 18,
        y = (event.clientY / innerHeight - 0.5) * 12;
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--space-x", `${x}px`);
        el.style.setProperty("--space-y", `${y}px`);
        frame = 0;
      });
    };
    visibility();
    reset();
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [effective]);
  return { ref, quality, setQuality, effective, lowPower, systemReduced };
}

export type CoreState = "idle" | "requesting" | "complete" | "error";
export function coreState(
  stage: string,
  error?: string,
  completed = false,
): CoreState {
  if (error) return "error";
  if (/请求模型|请求决策|等待调用|生成候选|校验结果|执行动作/.test(stage))
    return "requesting";
  return completed ? "complete" : "idle";
}
const stateLabels: Record<CoreState, string> = {
  idle: "待机 · 等待实验",
  requesting: "处理中 · 跟随实验状态",
  complete: "结果已接收",
  error: "异常 · 查看错误记录",
};
export function JevCore({
  state = "idle",
  pulseKey,
  compact = false,
}: {
  state?: CoreState;
  pulseKey?: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (ref.current)
        ref.current.dataset.offscreen = String(!entry.isIntersecting);
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`jev-core core-${state} ${compact ? "core-compact" : ""}`}
      role="img"
      aria-label={`Jev AI Core：${stateLabels[state]}`}
    >
      <div className="core-optics" aria-hidden="true">
        <div className="core-shadow" />
        <div className="core-gimbal">
          {[0, 1, 2, 3].map((i) => (
            <div className={`core-orbit orbit-${i}`} key={i}>
              <i />
              <b />
              <em />
            </div>
          ))}
          <div className="core-sphere">
            <div className="core-latitude" />
            <strong>J</strong>
          </div>
          <div key={pulseKey} className="core-result-pulse" />
        </div>
        <div className="core-dais">
          <i />
          <i />
        </div>
        <span className="core-cross cross-one">+</span>
        <span className="core-cross cross-two">+</span>
      </div>
      <div className="core-caption">
        <b>JEV AI CORE</b>
        <span>{stateLabels[state]}</span>
      </div>
    </div>
  );
}

export function OrbitalBackdrop() {
  return (
    <div className="orbital-backdrop" aria-hidden="true">
      <div className="deep-planet">
        <div className="planet-atmosphere" />
        <div className="planet-ring" />
        <div className="planet-surface" />
      </div>
      <div className="station-arc arc-a" />
      <div className="station-arc arc-b" />
      <div className="near-hud">
        <span>JEV / ORBITAL RESEARCH</span>
        <i />
        <span>DECISION SYSTEMS</span>
      </div>
    </div>
  );
}

function Cube({
  x,
  y,
  z,
  color,
}: {
  x: number;
  y: number;
  z: number;
  color: string;
}) {
  return (
    <div
      className="pod-cube"
      style={
        {
          "--cx": `${x}px`,
          "--cy": `${y}px`,
          "--cz": `${z}px`,
          "--cube-color": color,
        } as CSSProperties
      }
    >
      {["front", "back", "left", "right", "top", "bottom"].map((face) => (
        <i key={face} className={`cube-${face}`} />
      ))}
    </div>
  );
}
export function ExperimentPod({
  kind,
  index,
}: {
  kind: string;
  index: number;
}) {
  return (
    <div className={`experiment-pod pod-${kind}`} aria-hidden="true">
      <span className="pod-serial">MODULE / 0{index + 1}</span>
      <span className="pod-coordinate">JEV LAB</span>
      <div className="pod-perspective">
        <div className="pod-scene">
          <div className="pod-base">
            <i />
          </div>
          {kind === "tetris" ? (
            <>
              <div className="pod-glass glass-back" />
              <div className="pod-glass glass-side" />
              {[
                [0, 0, 38],
                [32, 0, 38],
                [64, 0, 38],
                [32, 0, 70],
              ].map(([x, y, z], i) => (
                <Cube key={i} x={x - 32} y={y} z={z} color="#9d8fff" />
              ))}
              <div className="pod-glass glass-front" />
            </>
          ) : kind === "pathfinding" ? (
            <>
              <div className="pod-route" />
              {[
                [-40, 15, 18],
                [30, 15, 18],
                [30, -45, 18],
              ].map(([x, y, z], i) => (
                <Cube key={i} x={x} y={y} z={z} color="#438eaa" />
              ))}
              <div className="pod-beacon beacon-start" />
              <div className="pod-beacon beacon-goal" />
            </>
          ) : (
            <>
              {[0, 1, 2].map((i) => (
                <div className={`pod-data data-${i}`} key={i}>
                  <span>{["choice", "noul", "score"][i]}</span>
                  <i />
                  <i />
                  <b />
                </div>
              ))}
              <div className="pod-node" />
            </>
          )}
        </div>
      </div>
      <div className="pod-floor-shadow" />
    </div>
  );
}
