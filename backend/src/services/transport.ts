import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
    public retryMs = 0,
    public raw?: unknown,
  ) {
    super(message);
  }
}
export function endpointURL(endpoint: string) {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    throw new ApiError("Endpoint URL 无效");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    (u.port && u.port !== "443")
  )
    throw new ApiError(
      "Endpoint 必须是 HTTPS 完整地址，端口 443，不含认证、查询参数或片段",
    );
  return u;
}
export function isPublic(ip: string) {
  try {
    return ipaddr.process(ip).range() === "unicast";
  } catch {
    return false;
  }
}
export async function validateEndpoint(endpoint: string) {
  const u = endpointURL(endpoint);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const records = await lookup(host, { all: true });
  if (!records.length || records.some((r) => !isPublic(r.address)))
    throw new ApiError("禁止访问内网、回环、保留或云元数据地址");
  // Pin a validated IPv4 address when available. Some hosts resolve IPv6 first
  // even when the local network has no working IPv6 route; pinning that first
  // address prevents Node from falling back and causes every request to time out.
  // Validate ALL answers above before choosing one to retain the SSRF boundary.
  return { u, record: records.find((r) => r.family === 4) ?? records[0] };
}
export type Transport = (
  endpoint: string,
  key: string,
  payload: unknown,
  timeoutMs: number,
  signal: AbortSignal,
) => Promise<{ status: number; body: unknown }>;
export const transport: Transport = async (
  endpoint,
  key,
  payload,
  timeoutMs,
  signal,
) => {
  const { u, record } = await validateEndpoint(endpoint);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const req = request(
      u,
      {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        lookup: ((_host: unknown, opts: any, cb: any) =>
          opts?.all
            ? cb(null, [record])
            : cb(null, record.address, record.family)) as any,
      },
      (res) => {
        let text = "",
          size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2_000_000) {
            req.destroy(new ApiError("响应超过 2MB 限制"));
            return;
          }
          text += chunk.toString();
        });
        res.on("end", () => {
          const status = res.statusCode ?? 502;
          if (status < 200 || status >= 300) {
            const reasons: Record<number, string> = {
              401: "认证失败",
              402: "余额不足",
              403: "权限不足",
              404: "路径错误或模型不可用",
              408: "上游超时",
              422: "请求格式错误或模型不可用",
              429: "限流",
            };
            const h = res.headers["retry-after"];
            const retry = h
              ? Math.min(
                  30000,
                  Math.max(
                    0,
                    Number(h) * 1000 || Date.parse(String(h)) - Date.now(),
                  ),
                )
              : 0;
            reject(
              new ApiError(
                reasons[status] || `上游 HTTP ${status}（请检查模型和协议）`,
                status,
                retry,
              ),
            );
            return;
          }
          try {
            resolve({ status, body: JSON.parse(text) });
          } catch {
            reject(new ApiError("响应不是有效 JSON", status));
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new ApiError("请求超时", 408)),
      timeoutMs,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", (e) =>
      reject(
        e instanceof ApiError
          ? e
          : signal.aborted
            ? new ApiError("请求已取消")
            : new ApiError("网络连接失败"),
      ),
    );
    req.end(JSON.stringify(payload));
  });
};
export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new ApiError("请求已取消"));
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(new ApiError("请求已取消"));
    };
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
