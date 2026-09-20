import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { Provider, Settings } from "../../../shared/types";
import type { RunRecord } from "../../../shared/lab/records";
export type LabContextValue = {
  provider?: Provider;
  settings: Settings;
  publish: (run: RunRecord) => void;
  suspendToken?: number;
};
export const LabContext = createContext<LabContextValue | null>(null);
export function useLab() {
  const c = useContext(LabContext);
  if (!c) throw Error("Missing lab context");
  return c;
}
export function usePublishRun(record: RunRecord | null) {
  const { publish } = useLab();
  const last = useRef<RunRecord | null>(null);
  useEffect(() => {
    const previous = last.current;
    if (
      previous &&
      previous.id !== record?.id &&
      (previous.status === "running" || previous.status === "paused")
    )
      publish({ ...previous, status: "cancelled" });
    last.current = record;
    if (record) publish(record);
  }, [record, publish]);
  useEffect(
    () => () => {
      const r = last.current;
      if (r)
        publish({
          ...r,
          status:
            r.status === "running" || r.status === "paused"
              ? "cancelled"
              : r.status,
        });
    },
    [publish],
  );
}
export function Workspace({
  children,
  observer,
}: {
  children: ReactNode;
  observer: ReactNode;
}) {
  return (
    <div className="experiment-workspace">
      <div className="environment-pane">{children}</div>
      <div className="observer-pane">{observer}</div>
    </div>
  );
}
