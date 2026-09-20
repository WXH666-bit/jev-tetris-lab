import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../backend/src/app";
import { ProviderStore } from "../backend/src/services/providerStore";
import { mockDecision } from "../backend/src/adapters/adapter";
import { newGame } from "../shared/game/engine";
import { candidates, snapshot } from "../shared/game/candidates";
const config = {
  name: "Contract provider",
  protocol: "openrouter-decisions" as const,
  endpoint: "https://openrouter.ai/api/alpha/decisions",
  modelId: "fixture-model",
  timeoutMs: 1000,
  retries: 0,
  notes: "",
  enabled: true,
  apiKey: "fixture-only-not-a-real-key",
};
describe("backend HTTP workflow", () => {
  let store: ProviderStore, server: Server, url: string;
  const g = newGame(42),
    state = snapshot(g, candidates(g).slice(0, 3));
  const send = vi.fn();
  beforeEach(async () => {
    store = new ProviderStore(":memory:", "");
    send.mockReset();
    send.mockImplementation(async (_url, _key, payload) => ({
      status: 200,
      body: mockDecision(payload.state).raw,
    }));
    server = createApp(store, send).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    url = `http://127.0.0.1:${(server.address() as any).port}/api`;
  });
  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    store.db.close();
  });
  async function post(path: string, body: unknown, method = "POST") {
    return fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", "X-Jev-Client": "1" },
      body: JSON.stringify(body),
    });
  }
  it("create, list, activate, clone and delete are real persistence operations", async () => {
    const res = await post("/providers", {
      ...config,
      protocol: "mock",
      endpoint: "",
    });
    const p = await res.json();
    expect(p.hasKey).toBe(true);
    expect(JSON.stringify(p)).not.toContain(config.apiKey);
    await post(`/providers/${p.id}/active`, {});
    const list = await (await fetch(url + "/providers")).json();
    expect(list[0].active).toBe(true);
    const copy = await (await post(`/providers/${p.id}/copy`, {})).json();
    expect(copy.hasKey).toBe(false);
    await fetch(url + `/providers/${copy.id}`, {
      method: "DELETE",
      headers: { "X-Jev-Client": "1" },
    });
    expect(await (await fetch(url + "/providers")).json()).toHaveLength(1);
  });
  it("test-before-save sends exact form credentials, endpoint and model once", async () => {
    const response = await post("/providers/test", { config });
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(config.endpoint);
    expect(send.mock.calls[0][1]).toBe(config.apiKey);
    expect(send.mock.calls[0][2].model).toBe(config.modelId);
    expect(store.list()).toHaveLength(0);
    const saved = await (
      await post("/providers", { ...config, testReceipt: body.receipt })
    ).json();
    expect(saved.lastTest.success).toBe(true);
  });
  it("uses stored credentials and returns identity for frontend freshness check", async () => {
    const p = store.save(config);
    const identity = {
      requestId: crypto.randomUUID(),
      sessionId: state.sessionId,
      pieceId: state.pieceId,
      stateVersion: state.stateVersion,
      configVersion: p.version,
    };
    const r = await post("/decisions", { providerId: p.id, state, identity });
    const body = await r.json();
    expect(body.identity).toEqual(identity);
    expect(body.result.candidateId).toBe(state.candidates[0].id);
    expect(JSON.stringify(body)).not.toContain(config.apiKey);
    const stale = await post("/decisions", {
      providerId: p.id,
      state,
      identity: {
        ...identity,
        requestId: crypto.randomUUID(),
        configVersion: 999,
      },
    });
    expect(stale.status).toBe(409);
  });
  it("configuration changes invalidate an already pending response", async () => {
    const p = store.save(config);
    let release!: () => void;
    send.mockImplementation(async () => {
      await new Promise<void>((r) => (release = r));
      return { status: 200, body: mockDecision(state).raw };
    });
    const identity = {
      requestId: crypto.randomUUID(),
      sessionId: state.sessionId,
      pieceId: state.pieceId,
      stateVersion: state.stateVersion,
      configVersion: p.version,
    };
    const pending = post("/decisions", { providerId: p.id, state, identity });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    store.save({ ...config, modelId: "different" }, p.id);
    release();
    expect((await pending).status).toBe(409);
  });
  it("rejects cross-origin and missing client header mutations", async () => {
    const res = await fetch(url + "/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    expect(res.status).toBe(403);
    const evil = await fetch(url + "/providers", {
      headers: { Origin: "https://evil.example" },
    });
    expect(evil.status).toBe(403);
  });
});
