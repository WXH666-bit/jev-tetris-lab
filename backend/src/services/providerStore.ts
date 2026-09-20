import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Provider,
  ProviderInput,
  TestResult,
} from "../../../shared/types.js";
import { SecretStore } from "./secretStore.js";
import { providerSchema } from "../../../shared/schemas.js";
type Row = {
  id: string;
  config: string;
  secret: string | null;
  version: number;
  active: number;
  test: string | null;
};
export class ProviderStore {
  db: DatabaseSync;
  secrets: SecretStore;
  constructor(
    path = process.env.DATABASE_PATH || "./data/jev.sqlite",
    master = process.env.MASTER_KEY,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.secrets = new SecretStore(master);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS providers(id TEXT PRIMARY KEY, config TEXT NOT NULL, secret TEXT, version INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0, test TEXT);",
    );
  }
  row(id: string) {
    const r = this.db.prepare("SELECT * FROM providers WHERE id=?").get(id) as
      Row | undefined;
    if (!r) throw Error("供应商不存在");
    return r;
  }
  public(r: Row): Provider {
    let hasKey = false;
    try {
      hasKey = !!this.secrets.read(r.id, r.secret);
    } catch {
      /* Decryption status is shown on use, never expose ciphertext. */
    }
    return {
      ...JSON.parse(r.config),
      id: r.id,
      version: r.version,
      active: !!r.active,
      hasKey,
      keyMask: hasKey ? "••••••••" : "未配置",
      lastTest: r.test ? JSON.parse(r.test) : null,
    };
  }
  list() {
    return (
      this.db.prepare("SELECT * FROM providers ORDER BY rowid").all() as Row[]
    ).map((r) => this.public(r));
  }
  get(id: string) {
    return this.public(this.row(id));
  }
  credentials(id: string) {
    const r = this.row(id);
    return { ...this.public(r), apiKey: this.secrets.read(id, r.secret) };
  }
  save(input: ProviderInput, id: string = randomUUID()) {
    const exists = this.db
      .prepare("SELECT * FROM providers WHERE id=?")
      .get(id) as Row | undefined;
    const { apiKey, clearKey, ...config } = providerSchema.parse(input);
    let secret = exists?.secret ?? null;
    if (clearKey) {
      secret = null;
      this.secrets.clear(id);
    }
    if (apiKey) {
      secret = this.secrets.save(id, apiKey);
    }
    const old = exists ? JSON.parse(exists.config) : null;
    const changed =
      !old ||
      ["endpoint", "protocol", "modelId"].some(
        (k) => old[k] !== config[k as keyof typeof config],
      ) ||
      !!apiKey ||
      !!clearKey;
    this.db
      .prepare(
        "INSERT INTO providers(id,config,secret,version,active,test) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,secret=excluded.secret,version=excluded.version,active=excluded.active,test=excluded.test",
      )
      .run(
        id,
        JSON.stringify(config),
        secret,
        (exists?.version ?? 0) + 1,
        input.enabled ? (exists?.active ?? 0) : 0,
        changed ? null : (exists?.test ?? null),
      );
    return this.get(id);
  }
  remove(id: string) {
    this.row(id);
    this.db.prepare("DELETE FROM providers WHERE id=?").run(id);
    this.secrets.clear(id);
  }
  active(id: string) {
    if (!this.get(id).enabled) throw Error("供应商已禁用");
    this.db.exec("UPDATE providers SET active=0");
    this.db.prepare("UPDATE providers SET active=1 WHERE id=?").run(id);
  }
  test(id: string, r: TestResult, version: number) {
    if (this.get(id).version === version)
      this.db
        .prepare("UPDATE providers SET test=? WHERE id=?")
        .run(JSON.stringify(r), id);
  }
}
