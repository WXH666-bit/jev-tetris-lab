const usageKeys = new Set([
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "prompt_tokens",
  "completion_tokens",
  "cached_tokens",
  "reasoning_tokens",
]);
export function redact(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === "string") {
    let s = value;
    for (const k of secrets.filter(Boolean)) s = s.split(k).join("[REDACTED]");
    return s
      .replace(/Bearer\s+[^\s"\\]+/gi, "Bearer [REDACTED]")
      .replace(/(?:sk-|gh[pousr]_)[a-zA-Z0-9_-]+/g, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        String(redact(k, secrets)),
        usageKeys.has(k) &&
        typeof v === "number" &&
        Number.isFinite(v) &&
        v >= 0
          ? v
          : /authorization|api.?key|secret|token|password|credential/i.test(k)
            ? "[REDACTED]"
            : redact(v, secrets),
      ]),
    );
  return value;
}
