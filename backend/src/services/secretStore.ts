import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export class SecretStore {
  private memory = new Map<string, string>();
  private key?: Buffer;
  constructor(master = process.env.MASTER_KEY) {
    if (master) {
      this.key = Buffer.from(master, "base64");
      if (this.key.length !== 32)
        throw Error("MASTER_KEY 必须为 32 字节 Base64");
    }
  }
  get mode() {
    return this.key
      ? "AES-256-GCM 持久化"
      : "会话内存模式（重启后需重新输入密钥）";
  }
  save(id: string, value: string): string | null {
    if (!this.key) {
      this.memory.set(id, value);
      return null;
    }
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(id));
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  read(id: string, encrypted: string | null) {
    if (!encrypted) return this.memory.get(id) || "";
    if (!this.key) return "";
    try {
      const b = Buffer.from(encrypted, "base64"),
        dec = createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
      dec.setAAD(Buffer.from(id));
      dec.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([dec.update(b.subarray(28)), dec.final()]).toString(
        "utf8",
      );
    } catch {
      throw Error("密钥无法解密，请检查 MASTER_KEY 或清除后重新输入");
    }
  }
  clear(id: string) {
    this.memory.delete(id);
  }
}
export function redact(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") {
    let s = value;
    for (const k of secrets.filter(Boolean)) s = s.split(k).join("[REDACTED]");
    return s
      .replace(/Bearer\s+[^\s"\\]+/gi, "Bearer [REDACTED]")
      .replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /authorization|api.?key|secret|token/i.test(k)
          ? "[REDACTED]"
          : redact(v, secrets),
      ]),
    );
  return value;
}
