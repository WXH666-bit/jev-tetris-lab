import { useContext, useEffect, useRef, useState } from "react";
import { JevCore, type CoreState } from "../components/SpatialLab";
import { VisualContext } from "./VisualContext";
type Instance = ReturnType<
  typeof import("./ObservatoryScene").mountObservatory
>;
/** The observer core listens to actual stages; it never drives the experiment. */
export function LiveCore({
  state,
  paused,
  pulseKey,
}: {
  state: CoreState;
  paused: boolean;
  pulseKey: string;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<Instance | undefined>(undefined);
  const current = useRef({ state, paused });
  current.current = { state, paused };
  const quality = useContext(VisualContext);
  const [status, setStatus] = useState("加载装置");
  useEffect(() => {
    let cancelled = false;
    setStatus("加载装置");
    import("./ObservatoryScene")
      .then(({ mountObservatory }) => {
        if (cancelled || !host.current) return;
        try {
          instance.current = mountObservatory(
            host.current,
            quality,
            () => {},
            setStatus,
            "core",
          );
          instance.current.setState(
            current.current.state,
            current.current.paused,
          );
        } catch {
          setStatus("二维备用视图");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("二维备用视图");
      });
    return () => {
      cancelled = true;
      instance.current?.dispose();
      instance.current = undefined;
    };
  }, [quality]);
  useEffect(() => {
    instance.current?.setState(state, paused);
  }, [state, paused, pulseKey]);
  return (
    <div className={`live-core core-${state}`}>
      <div
        className="live-core-scene"
        ref={host}
        style={{ opacity: status === "实时 3D" ? 1 : 0 }}
      />
      {status !== "实时 3D" && (
        <JevCore compact state={state} pulseKey={pulseKey} />
      )}
      <div className="live-core-caption">
        <b>JEV CORE</b>
        <span>
          {state === "error"
            ? "异常 · 查看本次错误"
            : paused
              ? "实验已暂停"
              : state === "requesting"
                ? "处理中 · 等待实际结果"
                : state === "complete"
                  ? "结果已接收"
                  : "待机 · 等待实验"}
        </span>
      </div>
    </div>
  );
}
