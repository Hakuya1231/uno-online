/**
 * 一个极薄的 fetch 包装：统一注入 Firebase ID Token。
 *
 * 约定：
 * - `idToken` 由 Firebase Auth `user.getIdToken()` 获得
 * - 服务端 API 通过 `Authorization: Bearer <idToken>` 校验
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit & { idToken?: string },
): Promise<Response> {
  const idToken = init.idToken ?? (typeof window === "undefined" ? "" : window.localStorage.getItem("uno:idToken") ?? "");
  if (!idToken) throw new Error("缺少 idToken（请先完成匿名登录）");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${idToken}`);

  const { idToken: _ignored, ...rest } = init;
  return await fetch(input, { ...rest, headers });
}

