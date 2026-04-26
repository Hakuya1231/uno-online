import { authedFetch } from "@/client/authedFetch";

type ApiOk<T> = T;
type ApiErr = { error: string };

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getErrorMessage(status: number, text: string): string {
  const json = parseJsonSafely(text) as ApiErr | null;
  const msg = json && typeof (json as any).error === "string" ? (json as any).error : "";
  return msg || text || `HTTP ${status}`;
}

/**
 * 统一的 JSON POST：
 * - 自动带 Authorization（由 authedFetch 从 localStorage 读取 token）
 * - 自动设置 content-type
 * - 自动 JSON.stringify(body)
 * - 失败时抛出可直接展示给用户的 Error(message)
 */
export async function postJson<TResp>(
  url: string,
  body: unknown,
  init?: Omit<RequestInit, "method" | "headers" | "body"> & { headers?: HeadersInit },
): Promise<ApiOk<TResp>> {
  const resp = await authedFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(getErrorMessage(resp.status, text));
  }

  const json = parseJsonSafely(text) as TResp | null;
  if (json === null) {
    throw new Error("响应不是合法 JSON");
  }
  return json;
}

/**
 * 统一的 JSON DELETE：
 * - 自动带 Authorization（由 authedFetch 从 localStorage 读取 token）
 * - 自动设置 content-type
 * - 自动 JSON.stringify(body)
 * - 失败时抛出可直接展示给用户的 Error(message)
 */
export async function deleteJson(
  url: string,
  body: unknown,
  init?: Omit<RequestInit, "method" | "headers" | "body"> & { headers?: HeadersInit },
): Promise<void> {
  const resp = await authedFetch(url, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(getErrorMessage(resp.status, text));
  }
}
