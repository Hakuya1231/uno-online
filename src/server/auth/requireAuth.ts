import type { NextRequest } from "next/server";
import { getAdminAuth } from "../firebase/admin";

export type AuthedUser = {
  uid: string;
};

function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/**
 * 约定：所有写操作 API 都必须鉴权。
 *
 * - 客户端需要先用 Firebase Auth 登录（匿名也可），拿到 `idToken`
 * - 然后在请求头带上：`Authorization: Bearer <idToken>`
 *
 * 返回：
 * - `{ uid }`：作为服务端识别玩家身份的唯一来源
 *
 * 错误：
 * - 未携带 token 会抛出包含“未登录”的错误，route 层统一映射为 401
 */
export async function requireAuth(req: NextRequest): Promise<AuthedUser> {
  const token = parseBearer(req.headers.get("authorization"));
  if (!token) throw new Error("未登录：缺少 Authorization: Bearer <idToken>");

  const decoded = await getAdminAuth().verifyIdToken(token);
  return { uid: decoded.uid };
}

