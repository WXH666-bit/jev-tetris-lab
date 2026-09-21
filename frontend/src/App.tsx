import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  LayoutDashboard,
  Grid2X2,
  Plug,
  History,
  Settings2,
  Sparkles,
  ArrowUpRight,
  Download,
} from "lucide-react";
import type { Provider } from "../../shared/types";
import type { RunRecord } from "../../shared/lab/records";
import { api } from "./lib/api";
import {
  OrbitalBackdrop,
  ExperimentPod,
  useSpatial,
  type VisualQuality,
} from "./components/SpatialLab";
import { Starfield } from "./components/Starfield";
import { Observatory } from "./visual/Observatory";
import { VisualContext } from "./visual/VisualContext";
import { ProviderManager } from "./providers/ProviderManager";
import { LabContext } from "./lab/context";
import { catalog, frontendExperiments } from "./lab/registry";
import { SettingsPage, loadSettings } from "./lab/SettingsPage";
import { Observer, downloadRuns, statusLabels } from "./lab/Observer";
const modes: Record<string, string> = {
  mock: "Mock 模拟",
  local: "本地策略",
  real: "真实 AI",
  manual: "手动操作",
};
const allowed = new Set([
  "overview",
  "catalog",
  "records",
  "settings",
  ...catalog.map((e) => e.id),
]);
function initialRoute() {
  const value = location.hash.slice(1);
  return allowed.has(value) ? value : "overview";
}
export default function App() {
  const [route, setRoute] = useState(initialRoute);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerLoad, setProviderLoad] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [health, setHealth] = useState("连接中");
  const [secretMode, setSecretMode] = useState("等待后端");
  const [manager, setManager] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [animated, setAnimated] = useState(
    () => localStorage.getItem("jev-motion") !== "off",
  );
  const spatial = useSpatial(animated);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>();
  const [mobilePane, setMobilePane] = useState("environment");
  const [suspendToken, setSuspendToken] = useState(0);
  const provider = providers.find((p) => p.active);
  const definition = catalog.find((d) => d.id === route);
  const Active = frontendExperiments[route]?.component;
  const publish = useCallback(
    (record: RunRecord) =>
      setRuns((all) => {
        const found = all.findIndex((r) => r.id === record.id);
        return found < 0
          ? [record, ...all].slice(0, 100)
          : all.map((r, i) => (i === found ? record : r));
      }),
    [],
  );
  const context = useMemo(
    () => ({ provider, settings, publish, suspendToken }),
    [provider, settings, publish, suspendToken],
  );
  async function refresh() {
    setProviderLoad("loading");
    try {
      const [p, h] = await Promise.all([
        api<Provider[]>("/providers"),
        api<{ secretMode: string }>("/health"),
      ]);
      setProviders(p);
      setSecretMode(h.secretMode);
      setHealth("服务已连接");
      setProviderLoad("ready");
    } catch {
      setHealth("后端不可用 · 本地模式可用");
      setSecretMode("无法读取后端存储状态");
      setProviderLoad("error");
      throw Error("无法读取供应商配置，请启动后端后重新加载。");
    }
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
          setProviderLoad("ready");
        }
      })
      .catch(() => {
        if (valid) {
          setHealth("后端不可用 · 本地模式可用");
          setSecretMode("无法读取后端存储状态");
          setProviderLoad("error");
        }
      });
    const change = () => {
      window.scrollTo(0, 0);
      setRoute(initialRoute());
      setMobilePane("environment");
      setSelectedRun(undefined);
    };
    window.addEventListener("hashchange", change);
    return () => {
      valid = false;
      window.removeEventListener("hashchange", change);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("jev-settings", JSON.stringify(settings));
  }, [settings]);
  function navigate(next: string) {
    location.hash = next;
  }
  function manage() {
    setSuspendToken((v) => v + 1);
    setManager(true);
    void refresh().catch(() => {
      /* Load failure is displayed in the manager. */
    });
  }
  function motion() {
    setAnimated((v) => !v);
    localStorage.setItem("jev-motion", animated ? "off" : "on");
  }
  const selected = runs.find((r) => r.id === selectedRun);
  const title =
    definition?.name ??
    {
      overview: "实验室概览",
      catalog: "实验目录",
      records: "实验记录",
      settings: "设置",
    }[route];
  return (
    <div
      ref={spatial.ref}
      data-quality={spatial.effective}
      data-route={route}
      className={`app-shell lab-shell spatial-lab ${animated ? "" : "motion-off"} pane-${mobilePane}`}
    >
      <Starfield
        animated={spatial.effective !== "reduced"}
        density={
          spatial.effective === "cinematic"
            ? 360
            : spatial.effective === "enhanced"
              ? 240
              : spatial.effective === "reduced"
                ? 65
                : 110
        }
      />
      <OrbitalBackdrop />
      <aside className="lab-nav">
        <button className="lab-brand" onClick={() => navigate("overview")}>
          <FlaskConical size={24} />
          <span>
            Jev AI Lab<small>Jev AI 决策实验室</small>
          </span>
        </button>
        <div className="nav-label">工作空间</div>
        {[
          { id: "overview", label: "实验室概览", Icon: LayoutDashboard },
          { id: "catalog", label: "实验目录", Icon: Grid2X2 },
          { id: "providers", label: "模型供应商", Icon: Plug },
          { id: "records", label: "实验记录", Icon: History },
          { id: "settings", label: "设置", Icon: Settings2 },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            className={
              route === id || (id === "providers" && manager) ? "active" : ""
            }
            onClick={() => (id === "providers" ? manage() : navigate(id))}
          >
            <Icon size={17} />
            {label}
            {id === "records" && runs.length > 0 && (
              <small>{runs.length}</small>
            )}
          </button>
        ))}
        <div className="nav-label">可用实验</div>
        {catalog.map((e, i) => (
          <button
            className={route === e.id ? "active" : ""}
            key={e.id}
            onClick={() => navigate(e.id)}
          >
            <span className="nav-index">0{i + 1}</span>
            {e.name}
          </button>
        ))}
        <div className="nav-bottom">
          <span className="dot" /> 会话内实验记录
          <p>刷新页面后清空。模型配置保存在本机。</p>
        </div>
      </aside>
      <div className="lab-main">
        <header className="lab-topbar">
          <div>
            <span className="eyebrow">
              JEV AI LAB / {definition?.english ?? "WORKSPACE"}
            </span>
            <h1>{title}</h1>
          </div>
          <div className="lab-global-tools">
            <span
              className="connection"
              data-connected={health === "服务已连接"}
            >
              <span className="dot" />
              {health}
            </span>
            <select
              aria-label="全局模型供应商"
              value={provider?.id ?? ""}
              onChange={async (e) => {
                setSuspendToken((v) => v + 1);
                try {
                  await api(`/providers/${e.target.value}/active`, {
                    method: "POST",
                  });
                  await refresh();
                } catch (e) {
                  setHealth((e as Error).message);
                }
              }}
            >
              <option value="" disabled>
                选择模型供应商
              </option>
              {providers
                .filter((p) => p.enabled)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} / {p.modelId}
                  </option>
                ))}
            </select>
            <select
              aria-label="空间视觉质量"
              value={spatial.quality}
              onChange={(e) =>
                spatial.setQuality(e.target.value as VisualQuality)
              }
              title={
                spatial.systemReduced
                  ? "系统减少动态效果已优先生效"
                  : spatial.lowPower
                    ? "低性能设备自动使用标准档"
                    : "仅影响视觉，不改变实验节奏"
              }
            >
              <option value="standard">标准空间</option>
              <option value="enhanced">增强空间</option>
              <option value="cinematic">影院级空间</option>
              <option value="reduced">减少动态</option>
            </select>
            <button
              aria-label="星空动态效果"
              aria-pressed={animated}
              onClick={motion}
            >
              <Sparkles size={17} />
            </button>
          </div>
        </header>
        <main className="lab-content">
          <VisualContext.Provider value={spatial.effective}>
            <LabContext.Provider value={context}>
              {Active ? (
                <>
                  <div className="experiment-intro">
                    <p>{definition?.description}</p>
                    <span className="muted">
                      {provider
                        ? `已选配置：${provider.name} · ${provider.modelId} · ${provider.protocol}`
                        : "尚未选择远端配置；默认无需密钥即可运行"}
                    </span>
                  </div>
                  <div className="mobile-panes" role="tablist">
                    <button
                      role="tab"
                      aria-selected={mobilePane === "environment"}
                      onClick={() => setMobilePane("environment")}
                    >
                      实验环境
                    </button>
                    <button
                      role="tab"
                      aria-selected={mobilePane === "observer"}
                      onClick={() => setMobilePane("observer")}
                    >
                      决策观察台
                    </button>
                  </div>
                  <Active key={route} />
                </>
              ) : route === "settings" ? (
                <SettingsPage
                  settings={settings}
                  onChange={setSettings}
                  animated={animated}
                  onAnimated={motion}
                />
              ) : route === "records" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <h2>本次会话的运行记录</h2>
                      <p>
                        按实验与运行分别保存，暂停、取消、失败和成功独立标记。刷新后不保留；最多保留
                        100 次运行。
                      </p>
                    </div>
                    <button
                      disabled={!runs.length}
                      onClick={() => downloadRuns(runs)}
                    >
                      <Download size={16} />
                      导出全部脱敏 JSON
                    </button>
                  </div>
                  {selected ? (
                    <>
                      <button onClick={() => setSelectedRun(undefined)}>
                        ← 返回记录列表
                      </button>
                      <div className="record-detail">
                        <h2>
                          {
                            catalog.find((d) => d.id === selected.experimentId)
                              ?.name
                          }{" "}
                          · {statusLabels[selected.status]}
                        </h2>
                        <p>
                          {modes[selected.mode]} · {selected.provider.modelId} ·{" "}
                          {new Date(selected.startedAt).toLocaleString()}
                        </p>
                        <button onClick={() => downloadRuns([selected])}>
                          导出本次运行
                        </button>
                        <Observer
                          key={selected.id}
                          stage="历史运行 · 非实时环境"
                          current={selected.steps.at(-1)}
                          steps={selected.steps}
                          metrics={selected.metrics}
                          snapshot={
                            frontendExperiments[selected.experimentId]?.snapshot
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <RunList runs={runs} onSelect={setSelectedRun} />
                  )}
                </>
              ) : (
                <>
                  {route === "overview" ? (
                    <Observatory
                      quality={spatial.effective}
                      navigate={navigate}
                    />
                  ) : (
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">
                          OBSERVE / VERIFY / COMPARE
                        </span>
                        <h2>选择你想观察的决策能力</h2>
                        <p>
                          三个可运行的实验，共用同一条观察、决策与验证链路。
                        </p>
                      </div>
                    </div>
                  )}
                  {route !== "overview" && (
                    <div className="experiment-catalog">
                      {catalog.map((e, i) => (
                        <article className="panel experiment-card" key={e.id}>
                          <ExperimentPod kind={e.id} index={i} />
                          <div className="experiment-copy">
                            <span className="eyebrow">
                              {e.english} · v{e.version}
                            </span>
                            <h3>{e.name}</h3>
                            <p>{e.description}</p>
                            <small>{e.ability}</small>
                            <div className="mode-badges">
                              {e.modes.map((m) => (
                                <span className="badge" key={m}>
                                  {modes[m]}
                                </span>
                              ))}
                            </div>
                            <button onClick={() => navigate(e.id)}>
                              进入实验 <ArrowUpRight size={16} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {route === "overview" && (
                    <section className="recent-runs">
                      <div className="section-title">
                        <h2>最近运行</h2>
                        <button onClick={() => navigate("records")}>
                          全部记录
                        </button>
                      </div>
                      <RunList
                        runs={runs.slice(0, 4)}
                        onSelect={(id) => {
                          window.history.replaceState(null, "", "#records");
                          setSelectedRun(id);
                          setRoute("records");
                        }}
                      />
                    </section>
                  )}
                  <div className="platform-note">
                    <b>一条共同的实验链路</b>
                    <p>
                      配置实验 → 观察状态 → 生成合法候选 → 请求决策 → 校验 →
                      执行 → 回看结果
                    </p>
                    <small>
                      真实模型、本地策略、Mock
                      与错误兜底始终独立标记。尚未提供长期存储、批量运行或模型对比。
                    </small>
                  </div>
                </>
              )}
            </LabContext.Provider>
          </VisualContext.Provider>
        </main>
        <footer className="lab-footer">
          <span>Jev AI Lab · 可观察的决策，不是隐藏推理</span>
          <span>SESSION ONLY / PHASE 01</span>
        </footer>
      </div>
      {manager && (
        <ProviderManager
          providers={providers}
          loadStatus={providerLoad}
          refresh={refresh}
          secretMode={secretMode}
          onClose={() => setManager(false)}
        />
      )}
    </div>
  );
}
function RunList({
  runs,
  onSelect,
}: {
  runs: RunRecord[];
  onSelect: (id: string) => void;
}) {
  return !runs.length ? (
    <div className="panel runs-empty">
      <History size={26} />
      <h3>这里会留下你的第一条实验轨迹</h3>
      <p>
        先运行一个实验。完成的步骤、实际结果和错误都会记录；不会生成虚构的历史或成绩。
      </p>
    </div>
  ) : (
    <div className="run-list">
      {runs.map((r) => (
        <button key={r.id} className="run-row" onClick={() => onSelect(r.id)}>
          <span>
            <b>
              {catalog.find((e) => e.id === r.experimentId)?.name ??
                r.experimentId}
            </b>
            <small>
              {modes[r.mode]} · {r.provider.modelId} ·{" "}
              {new Date(r.startedAt).toLocaleString()}
            </small>
          </span>
          <span className="mono">
            {r.stepCount} 步 · {r.requests} 次请求
          </span>
          <span className={`badge status-${r.status}`}>
            {statusLabels[r.status]}
          </span>
        </button>
      ))}
    </div>
  );
}
