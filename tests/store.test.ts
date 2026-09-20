import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProviderStore } from "../backend/src/services/providerStore";
import { SecretStore, redact } from "../backend/src/services/secretStore";
const config = {
  name: "Test",
  protocol: "mock" as const,
  endpoint: "",
  modelId: "mock",
  timeoutMs: 1000,
  retries: 0,
  notes: "",
  enabled: true,
};
describe("provider persistence and secrets", () => {
  it("AES GCM authenticated encryption, no plaintext/cross-provider decrypt", () => {
    const store = new SecretStore(randomBytes(32).toString("base64")),
      encrypted = store.save("a", "fixture-secret")!;
    expect(encrypted).not.toContain("fixture-secret");
    expect(store.read("a", encrypted)).toBe("fixture-secret");
    expect(() => store.read("b", encrypted)).toThrow();
  });
  it("memory mode never returns a persistent secret", () => {
    const s = new SecretStore("");
    expect(s.save("a", "fixture")).toBeNull();
    expect(s.read("a", null)).toBe("fixture");
    expect(new SecretStore("").read("a", null)).toBe("");
  });
  it("redacts auth headers, keys and nested echoed secret", () => {
    const out = JSON.stringify(
      redact(
        {
          Authorization: "Bearer fixture",
          data: ["echo fixture-secret"],
          apiKey: "fixture",
        },
        ["fixture-secret"],
      ),
    );
    expect(out).not.toContain("fixture");
  });
  it("CRUD, copy without key, invalidate test and retain empty edit key", () => {
    const s = new ProviderStore(":memory:", "");
    try {
      const p = s.save({ ...config, apiKey: "fixture" });
      expect(p.hasKey).toBe(true);
      expect(JSON.stringify(s.list())).not.toContain("fixture");
      s.test(
        p.id,
        {
          success: true,
          status: 200,
          protocol: "mock",
          modelId: "mock",
          latencyMs: 2,
          time: "now",
          formatValid: true,
          summary: "ok",
        },
        p.version,
      );
      s.active(p.id);
      const changed = s.save({ ...config, modelId: "new", apiKey: "" }, p.id);
      expect(changed.lastTest).toBeNull();
      expect(changed.active).toBe(true);
      expect(s.credentials(p.id).apiKey).toBe("fixture");
      const copy = s.save({ ...changed, name: "copy" });
      expect(copy.hasKey).toBe(false);
      expect(copy.active).toBe(false);
      s.save({ ...config, clearKey: true }, p.id);
      expect(s.get(p.id).hasKey).toBe(false);
      s.remove(copy.id);
      expect(s.list()).toHaveLength(1);
    } finally {
      s.db.close();
    }
  });
  it("non-sensitive SQLite configuration survives process-store recreation", () => {
    const dir = mkdtempSync(join(tmpdir(), "jev-test-"));
    let s: ProviderStore | undefined;
    try {
      const path = join(dir, "test.sqlite");
      s = new ProviderStore(path, "");
      const p = s.save({ ...config, apiKey: "fixture" });
      s.db.close();
      s = new ProviderStore(path, "");
      expect(s.get(p.id).modelId).toBe("mock");
      expect(s.get(p.id).hasKey).toBe(false);
    } finally {
      s?.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
