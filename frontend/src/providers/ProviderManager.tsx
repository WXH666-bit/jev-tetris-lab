import { useState } from "react";
import {
  Plus,
  Copy,
  Trash2,
  Check,
  ArrowLeft,
  Eye,
  EyeOff,
  FlaskConical,
} from "lucide-react";
import type {
  Provider,
  ProviderInput,
  Protocol,
  TestResult,
} from "../../../shared/types";
import { api } from "../lib/api";
import { Modal } from "../components/Modal";
export const protocolLabels: Record<Protocol, string> = {
  "openrouter-decisions": "OpenRouter Decisions",
  "typesafe-systemone": "TypeSafe System One",
  mock: "本地模拟",
};
export const preset = (protocol: Protocol): ProviderInput => ({
  name:
    protocol === "openrouter-decisions"
      ? "OpenRouter"
      : protocol === "typesafe-systemone"
        ? "TypeSafe"
        : "Local Mock",
  protocol,
  endpoint:
    protocol === "openrouter-decisions"
      ? "https://openrouter.ai/api/alpha/decisions"
      : protocol === "typesafe-systemone"
        ? "https://api.typesafe.ai/v1/systemone"
        : "",
  modelId:
    protocol === "openrouter-decisions"
      ? "typesafe/jev-1.13"
      : protocol === "typesafe-systemone"
        ? "jev-latest"
        : "heuristic-mock",
  timeoutMs: 15000,
  retries: 0,
  notes: "",
  enabled: true,
});
export function ProviderManager({
  providers,
  refresh,
  onClose,
  secretMode,
  loadStatus = "ready",
}: {
  providers: Provider[];
  refresh: () => Promise<void>;
  onClose: () => void;
  secretMode: string;
  loadStatus?: "loading" | "ready" | "error";
}) {
  const [editing, setEditing] = useState<Provider | null | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(path: string, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await api(path, { method });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="模型供应商" onClose={onClose} wide>
      <div className="security-note">
        密钥存储：{secretMode}。浏览器不会收到已保存的密钥。
      </div>
      {loadStatus === "error" && (
        <div role="alert" className="notice">
          <strong>供应商配置读取失败，不代表配置已删除。</strong>
          <p>
            请确认本机后端已启动。只运行 Vite 前端时，网页无法读取 SQLite
            中保存的供应商。
          </p>
          <p>
            已有前端运行时，可在项目目录另开终端执行{" "}
            <code>npx tsx watch backend/src/server.ts</code>，然后重新加载。
          </p>
          {providers.length > 0 && (
            <p>下方为上次成功读取的配置，当前连接状态尚未确认。</p>
          )}
          <button
            onClick={() => {
              void refresh().catch(() => {});
            }}
          >
            重新加载配置
          </button>
        </div>
      )}
      {loadStatus === "loading" && <p role="status">正在读取本机供应商配置…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {editing !== undefined ? (
        <ProviderForm
          provider={editing}
          onBack={() => setEditing(undefined)}
          onSave={async () => {
            await refresh();
            setEditing(undefined);
          }}
        />
      ) : (
        <>
          <div className="section-title">
            <p>管理接口、凭据与模型。名称只是你定义的标签。</p>
            <button className="primary" onClick={() => setEditing(null)}>
              <Plus size={16} />
              添加供应商
            </button>
          </div>
          <div className="provider-grid">
            {loadStatus === "ready" && providers.length === 0 && (
              <div className="empty">
                <FlaskConical size={30} />
                <h3>接入你的第一个模型</h3>
                <p>本地模拟已经就绪。添加供应商，开始真实决策实验。</p>
              </div>
            )}
            {providers.map((p) => (
              <article className="provider-card" key={p.id}>
                <div className="flex items-center justify-between">
                  <h3>{p.name}</h3>
                  <span className={p.active ? "badge green" : "badge"}>
                    {p.active ? "✓ 当前使用" : p.enabled ? "已启用" : "已禁用"}
                  </span>
                </div>
                <div className="purple">{protocolLabels[p.protocol]}</div>
                <p className="mono">{p.modelId}</p>
                <p className="muted break-all">
                  {p.endpoint || "本地运行 · 不发送网络请求"}
                </p>
                <p>密钥：{p.hasKey ? "已配置 " + p.keyMask : "未配置"}</p>
                <p className={p.lastTest?.success ? "green-text" : "muted"}>
                  {p.lastTest
                    ? `${p.lastTest.success ? "✓ 测试通过" : "! 测试失败"} · ${p.lastTest.latencyMs}ms · ${new Date(p.lastTest.time).toLocaleString()}`
                    : "尚未测试 / 配置变更后需重新测试"}
                </p>
                {p.lastTest && <small>{p.lastTest.summary}</small>}
                <div className="card-actions">
                  <button onClick={() => setEditing(p)}>编辑 / 测试</button>
                  <button
                    disabled={busy || !p.enabled || p.active}
                    onClick={() => action(`/providers/${p.id}/active`)}
                  >
                    <Check size={14} />
                    设为当前
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`复制 ${p.name}`}
                    title="复制配置，不复制密钥"
                    onClick={() => action(`/providers/${p.id}/copy`)}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`删除 ${p.name}`}
                    onClick={() => action(`/providers/${p.id}`, "DELETE")}
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await api(`/providers/${p.id}`, {
                          method: "PUT",
                          body: JSON.stringify({ ...p, enabled: !p.enabled }),
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {p.enabled ? "禁用" : "启用"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
function ProviderForm({
  provider,
  onBack,
  onSave,
}: {
  provider: Provider | null;
  onBack: () => void;
  onSave: () => Promise<void>;
}) {
  const [form, setForm] = useState<ProviderInput>(
    provider ? { ...provider, apiKey: "" } : preset("openrouter-decisions"),
  );
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<TestResult | null>(
    provider?.lastTest ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  function change<K extends keyof ProviderInput>(
    key: K,
    value: ProviderInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
    setTest(null);
    setRevision((v) => v + 1);
  }
  async function submit(testOnly: boolean) {
    setBusy(true);
    setError("");
    try {
      if (testOnly) {
        const r = await api<TestResult>("/providers/test", {
          method: "POST",
          body: JSON.stringify({ id: provider?.id, config: form }),
        });
        setTest(r);
      } else {
        await api(provider ? `/providers/${provider.id}` : "/providers", {
          method: provider ? "PUT" : "POST",
          body: JSON.stringify({ ...form, testReceipt: test?.receipt }),
        });
        setForm((f) => ({ ...f, apiKey: "" }));
        await onSave();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <button type="button" className="ghost" onClick={onBack} disabled={busy}>
        <ArrowLeft size={16} />
        返回供应商列表
      </button>
      <fieldset disabled={busy} className="form-grid">
        <label>
          供应商显示名称
          <input
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </label>
        <label>
          接口协议
          <select
            value={form.protocol}
            onChange={(e) => {
              const p = e.target.value as Protocol;
              setForm((f) => ({ ...f, ...preset(p), apiKey: "" }));
              setTest(null);
              setRevision(revision + 1);
            }}
          >
            <option value="openrouter-decisions">OpenRouter Decisions</option>
            <option value="typesafe-systemone">TypeSafe System One</option>
            <option value="mock">本地模拟</option>
            <option disabled>OpenAI Chat Completions · 尚未实现</option>
            <option disabled>Anthropic Messages · 尚未实现</option>
          </select>
        </label>
        <label className="full">
          完整请求地址 Endpoint URL
          <input
            type={form.protocol === "mock" ? "text" : "url"}
            required={form.protocol !== "mock"}
            disabled={form.protocol === "mock"}
            value={form.endpoint}
            onChange={(e) => change("endpoint", e.target.value)}
            placeholder="https://.../完整路径"
          />
          <small className="muted break-all">
            最终 POST URL：{form.endpoint || "本地模式无需 URL"} ·
            不自动拼接路径
          </small>
        </label>
        <label className="full">
          API Key {provider?.hasKey && "· 已配置 ••••••••（留空保留）"}
          <div className="input-action">
            <input
              autoComplete="new-password"
              type={show ? "text" : "password"}
              value={form.apiKey ?? ""}
              onChange={(e) => change("apiKey", e.target.value)}
              placeholder="输入新的密钥"
            />
            <button
              type="button"
              aria-label={show ? "隐藏密钥" : "显示密钥"}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {provider?.hasKey && (
            <span>
              <input
                id="clear-key"
                type="checkbox"
                checked={!!form.clearKey}
                onChange={(e) => change("clearKey", e.target.checked)}
              />
              <label htmlFor="clear-key" className="inline">
                清除已保存密钥
              </label>
            </span>
          )}
        </label>
        <label className="full">
          模型 ID
          <input
            required
            value={form.modelId}
            onChange={(e) => change("modelId", e.target.value)}
          />
        </label>
        <label>
          请求超时（毫秒）
          <input
            type="number"
            min={1000}
            max={120000}
            required
            value={form.timeoutMs}
            onChange={(e) => change("timeoutMs", Number(e.target.value))}
          />
        </label>
        <label>
          最大重试次数
          <input
            type="number"
            min={0}
            max={3}
            required
            value={form.retries}
            onChange={(e) => change("retries", Number(e.target.value))}
          />
        </label>
        <label className="full">
          备注
          <textarea
            maxLength={1000}
            value={form.notes}
            onChange={(e) => change("notes", e.target.value)}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {test && (
        <div
          role="status"
          className={test.success ? "test-result success" : "test-result error"}
        >
          <strong>{test.success ? "✓ 连接测试成功" : "! 连接测试失败"}</strong>
          <p>
            {protocolLabels[test.protocol]} · {test.modelId} · HTTP{" "}
            {test.status ?? "不适用"} · {test.latencyMs}ms
          </p>
          <p>
            格式校验：{test.formatValid ? "通过" : "未通过"} · {test.summary}
          </p>
          <small>{new Date(test.time).toLocaleString()}</small>
        </div>
      )}
      <div className="form-footer">
        <p className="muted">
          将发送一次小型测试请求，可能产生少量费用。测试不重试。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            <FlaskConical size={16} />
            {busy ? "处理中…" : "测试连接"}
          </button>
          <button className="primary" disabled={busy} type="submit">
            保存供应商
          </button>
        </div>
      </div>
    </form>
  );
}
