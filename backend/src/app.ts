import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import {
  providerSchema,
  stateSchema,
  identitySchema,
} from "../../shared/schemas.js";
import { newGame } from "../../shared/game/engine.js";
import { candidates, snapshot } from "../../shared/game/candidates.js";
import { questions } from "../../shared/decisions.js";
import { ProviderStore } from "./services/providerStore.js";
import { decide } from "./adapters/adapter.js";
import {
  ApiError,
  validateEndpoint,
  type Transport,
} from "./services/transport.js";
import type { ProviderInput, TestResult } from "../../shared/types.js";
import { runIdentitySchema, inputErrors } from "../../shared/lab/contracts.js";
import { validateExperiment } from "../../shared/experiments/registry.js";
import { decideStructured } from "./adapters/structured.js";
export function createApp(store: ProviderStore, send?: Transport) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const host = req.headers.host?.split(":")[0];
    if (!["localhost", "127.0.0.1"].includes(host || ""))
      return res.status(403).json({ error: "仅允许本机访问" });
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        `http://${req.headers.host}`,
      ].includes(origin)
    )
      return res.status(403).json({ error: "请求来源不允许" });
    if (req.method !== "GET" && req.headers["x-jev-client"] !== "1")
      return res.status(403).json({ error: "缺少同源客户端标记" });
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  const inflight = new Map<string, AbortController>();
  const recent = new Map<string, number>();
  let calls: number[] = [];
  const tests = new Map<
    string,
    { fingerprint: string; result: TestResult; time: number }
  >();
  const fingerprint = (p: ProviderInput) =>
    createHash("sha256")
      .update(
        JSON.stringify([p.protocol, p.endpoint, p.modelId, p.apiKey || ""]),
      )
      .digest("hex");
  function saveWithTest(
    p: ProviderInput,
    id: string | undefined,
    receipt: unknown,
  ) {
    const saved = id ? store.save(p, id) : store.save(p);
    if (typeof receipt === "string") {
      const test = tests.get(receipt);
      if (
        test &&
        Date.now() - test.time < 600000 &&
        test.fingerprint === fingerprint(store.credentials(saved.id))
      )
        store.test(saved.id, test.result, saved.version);
      tests.delete(receipt);
    }
    return store.get(saved.id);
  }
  function invalidate() {
    for (const c of inflight.values()) c.abort();
    inflight.clear();
  }
  async function check(p: ProviderInput) {
    if (p.protocol !== "mock") await validateEndpoint(p.endpoint);
  }
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, secretMode: store.secrets.mode }),
  );
  app.get("/api/providers", (_req, res) => res.json(store.list()));
  app.post("/api/providers", async (req, res) => {
    const p = providerSchema.parse(req.body);
    await check(p);
    invalidate();
    res.json(saveWithTest(p, undefined, req.body.testReceipt));
  });
  app.put("/api/providers/:id", async (req, res) => {
    const p = providerSchema.parse(req.body);
    store.get(req.params.id);
    await check(p);
    invalidate();
    res.json(saveWithTest(p, req.params.id, req.body.testReceipt));
  });
  app.delete("/api/providers/:id", (req, res) => {
    invalidate();
    store.remove(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/providers/:id/active", (req, res) => {
    invalidate();
    store.active(req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/providers/:id/copy", (req, res) => {
    const p = store.get(req.params.id);
    res.json(store.save({ ...p, name: `${p.name} 副本`, apiKey: undefined }));
  });
  app.post("/api/providers/test", async (req, res) => {
    const body = z
      .object({ id: z.string().optional(), config: providerSchema })
      .parse(req.body);
    const p = { ...body.config, retries: 0 };
    if (body.id && !p.apiKey && !p.clearKey)
      p.apiKey = store.credentials(body.id).apiKey;
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    const start = performance.now();
    let result: TestResult;
    try {
      await check(p);
      const g = newGame(42),
        state = snapshot(g, candidates(g).slice(0, 2));
      const r = await decide(p, state, controller.signal, send);
      result = {
        success: true,
        protocol: p.protocol,
        modelId: p.modelId,
        status: r.status ?? null,
        latencyMs: Math.round(performance.now() - start),
        time: new Date().toISOString(),
        formatValid: true,
        summary: `决策成功，选择 ${r.candidateId}；三种答案通过校验${p.protocol === "mock" ? "（本地模拟）" : ""}`,
      };
    } catch (e) {
      result = {
        success: false,
        protocol: p.protocol,
        modelId: p.modelId,
        status: e instanceof ApiError ? e.status : null,
        latencyMs: Math.round(performance.now() - start),
        time: new Date().toISOString(),
        formatValid: false,
        summary: e instanceof ApiError ? e.message : "配置或网络错误",
      };
    }
    for (const [id, t] of tests)
      if (Date.now() - t.time > 600000) tests.delete(id);
    const receipt = randomUUID();
    tests.set(receipt, {
      fingerprint: fingerprint(p),
      result,
      time: Date.now(),
    });
    if (body.id) {
      const saved = store.credentials(body.id);
      if (
        ["endpoint", "protocol", "modelId"].every(
          (k) => saved[k as keyof typeof saved] === p[k as keyof typeof p],
        ) &&
        saved.apiKey === p.apiKey
      )
        store.test(body.id, result, saved.version);
    }
    res.json({ ...result, receipt });
  });
  app.post("/api/lab/decisions", async (req, res) => {
    const body = z
      .object({
        providerId: z.string(),
        identity: runIdentitySchema,
        state: z.unknown(),
        questions: z.unknown(),
      })
      .parse(req.body);
    const { identity } = body;
    const input = validateExperiment(
      identity.experimentId,
      body.state,
      body.questions,
    );
    const p = store.credentials(body.providerId);
    if (identity.configVersion !== p.version)
      throw new ApiError("供应商配置已过期", 409);
    const key = identity.runId;
    if (inflight.has(key)) throw new ApiError("运行已有决策请求", 409);
    const stamp = Date.now();
    calls = calls.filter((t) => stamp - t < 60000);
    if (calls.length >= 60)
      throw new ApiError("本机接口达到每分钟 60 次安全上限", 429);
    for (const [id, time] of recent)
      if (stamp - time > 3600000) recent.delete(id);
    if (recent.has(identity.requestId))
      throw new ApiError("重复 requestId", 409);
    recent.set(identity.requestId, stamp);
    calls.push(stamp);
    const controller = new AbortController();
    inflight.set(key, controller);
    res.on("close", () => controller.abort());
    try {
      const result = await decideStructured(
        p,
        input.state,
        input.questions,
        controller.signal,
        send,
      );
      if (
        controller.signal.aborted ||
        store.get(p.id).version !== identity.configVersion
      )
        throw new ApiError("响应已过期", 409);
      res.json({ identity, result, payload: { model: p.modelId, ...input } });
    } finally {
      if (inflight.get(key) === controller) inflight.delete(key);
    }
  });
  // Compatibility endpoint for the original Tetris client; new modules use /lab/decisions.
  app.post("/api/decisions", async (req, res) => {
    const { providerId, state, identity } = z
      .object({
        providerId: z.string(),
        state: stateSchema,
        identity: identitySchema,
      })
      .parse(req.body);
    const p = store.credentials(providerId);
    if (
      identity.sessionId !== state.sessionId ||
      identity.pieceId !== state.pieceId ||
      identity.stateVersion !== state.stateVersion ||
      identity.configVersion !== p.version
    )
      throw new ApiError("决策状态或配置已过期", 409);
    if (!p.enabled) throw new ApiError("供应商已禁用", 409);
    const key = state.sessionId;
    if (inflight.has(key)) throw new ApiError("该会话已有请求进行中", 409);
    const stamp = Date.now();
    calls = calls.filter((t) => stamp - t < 60000);
    if (calls.length >= 60)
      throw new ApiError("本机接口达到每分钟 60 次安全上限", 429);
    calls.push(stamp);
    for (const [k, t] of recent) if (stamp - t > 3600000) recent.delete(k);
    if (recent.has(identity.requestId))
      throw new ApiError("重复 requestId", 409);
    recent.set(identity.requestId, stamp);
    const controller = new AbortController();
    inflight.set(key, controller);
    res.on("close", () => controller.abort());
    try {
      const result = await decide(p, state, controller.signal, send);
      if (
        controller.signal.aborted ||
        store.get(providerId).version !== identity.configVersion
      )
        throw new ApiError("响应已过期", 409);
      res.json({
        identity,
        result,
        payload: { model: p.modelId, state, questions: questions(state) },
      });
    } finally {
      if (inflight.get(key) === controller) inflight.delete(key);
    }
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(
          err instanceof ApiError
            ? err.status && err.status >= 400
              ? err.status
              : 400
            : 400,
        )
        .json({
          raw: err instanceof ApiError ? err.raw : undefined,
          error:
            err instanceof ZodError
              ? inputErrors(err)
              : err instanceof ApiError
                ? err.message
                : "配置操作失败，请检查供应商是否存在及安全存储配置",
        });
    },
  );
  return app;
}
