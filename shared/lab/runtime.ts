import type { Settings } from "../types.js";
export class Epoch {
  private version = 0;
  invalidate() {
    this.version++;
  }
  capture() {
    const v = this.version;
    return () => v === this.version;
  }
}
export function budgetError(
  requests: number,
  failures: number,
  settings: Pick<Settings, "callLimit" | "failureLimit">,
) {
  if (requests >= settings.callLimit) return "本次运行调用上限已达到";
  if (failures >= settings.failureLimit)
    return "连续失败达到阈值，请检查供应商后重置";
  return "";
}
export function abortableWait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(Error("已取消"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(Error("已取消"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
