export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Jev-Client": "1",
      ...options.headers,
    },
  });
  const body = await res.json();
  if (!res.ok)
    throw Object.assign(Error(body.error || `HTTP ${res.status}`), {
      raw: body.raw,
      status: res.status,
    });
  return body as T;
}
