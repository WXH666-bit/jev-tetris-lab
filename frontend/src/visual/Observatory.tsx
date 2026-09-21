import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Orbit } from "lucide-react";
import type { Quality } from "./tokens";
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
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let cancelled = false;
    let scene:
      | ReturnType<typeof import("./ObservatoryScene").mountObservatory>
      | undefined;
    setStatus("loading");
    import("./ObservatoryScene")
      .then(({ mountObservatory }) => {
        if (cancelled || !host.current) return;
        try {
          scene = mountObservatory(
            host.current,
            quality,
            () => {},
            setStatus,
            "home",
          );
        } catch {
          setStatus("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      scene?.dispose();
    };
  }, [quality]);
  const ready = status === "实时 3D";
  return (
    <section
      className="observatory"
      data-appearance="resonance"
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
      <div className="core-name">
        <b>JEV / RESONANCE</b>
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
    </section>
  );
}
