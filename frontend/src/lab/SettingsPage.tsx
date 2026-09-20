import type { Settings } from "../../../shared/types";
export const defaultSettings: Settings = {
  seed: 42,
  minIntervalMs: 2000,
  callLimit: 100,
  candidateLimit: 24,
  fallback: true,
  failureLimit: 3,
  mockDelayMs: 400,
  mockFault: "none",
};
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("jev-settings") || "{}");
    return {
      ...defaultSettings,
      ...Object.fromEntries(
        Object.keys(defaultSettings)
          .filter(
            (k) => typeof s[k] === typeof defaultSettings[k as keyof Settings],
          )
          .map((k) => [k, s[k]]),
      ),
    };
  } catch {
    return defaultSettings;
  }
}
export function SettingsPage({
  settings,
  onChange,
  animated,
  onAnimated,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  animated: boolean;
  onAnimated: () => void;
}) {
  return (
    <section className="panel settings-page">
      <h2>运行与显示设置</h2>
      <p className="muted">
        更改设置会使正在进行的请求失效。调用预算独立于动画速度；取消不能保证上游不计费。
      </p>
      <div className="form-grid">
        {(
          [
            ["seed", "默认随机种子", 0, 4294967295],
            ["minIntervalMs", "最小请求间隔 (ms)", 1000, 60000],
            ["callLimit", "单次运行主要调用上限", 1, 10000],
            ["candidateLimit", "俄罗斯方块提交候选上限", 2, 100],
            ["failureLimit", "连续失败停止阈值", 1, 10],
            ["mockDelayMs", "Mock 延迟 (ms)", 0, 10000],
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
                onChange({
                  ...settings,
                  [key]: Math.max(
                    min,
                    Math.min(max, Math.floor(Number(e.target.value))),
                  ),
                })
              }
            />
          </label>
        ))}
        <label>
          错误处理
          <select
            value={settings.fallback ? "fallback" : "pause"}
            onChange={(e) =>
              onChange({ ...settings, fallback: e.target.value === "fallback" })
            }
          >
            <option value="fallback">回合制实验使用本地兜底</option>
            <option value="pause">暂停并保留错误</option>
          </select>
        </label>
        <label>
          模拟故障
          <select
            value={settings.mockFault}
            onChange={(e) =>
              onChange({
                ...settings,
                mockFault: e.target.value as Settings["mockFault"],
              })
            }
          >
            <option value="none">无</option>
            <option value="error">Mock 错误</option>
            <option value="timeout">Mock 超时</option>
          </select>
        </label>
      </div>
      <button aria-pressed={animated} onClick={onAnimated}>
        {animated ? "关闭装饰动态效果" : "开启装饰动态效果"}
      </button>
      <p className="muted">
        系统“减少动态效果”优先。结构化工作台失败后不自动替换业务答案，也不会循环重试整轮运行。
      </p>
      <div className="local-note">
        俄罗斯方块基线：消行 +10、洞 −7、总高度 −0.5、凹凸 −0.35、最大高度
        −0.8、溢出 −10000。路径基线：完全可见地图上的
        BFS。固定种子不保证远端模型输出一致。
      </div>
    </section>
  );
}
