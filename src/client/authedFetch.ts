/**
 * 一个极薄的 fetch 包装：统一注入 Firebase ID Token。
 *
 * 约定：
 * - `idToken` 由 Firebase Auth `user.getIdToken()` 获得
 * - 服务端 API 通过 `Authorization: Bearer <idToken>` 校验
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit & { idToken: string },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${init.idToken}`);

  const { idToken: _ignored, ...rest } = init;
  return await fetch(input, { ...rest, headers });
}

