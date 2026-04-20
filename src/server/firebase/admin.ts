import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin 初始化（仅服务端）。
 *
 * 约定：
 * - 使用环境变量 `FIREBASE_SERVICE_ACCOUNT_JSON`（JSON 字符串）注入 Service Account
 * - 或使用 `GOOGLE_APPLICATION_CREDENTIALS`（由运行环境提供文件路径）
 *
 * 注意：
 * - 本模块只在 Node.js 服务端运行（Next.js API routes / server actions / services）
 */
export function getAdminFirestore() {
  if (getApps().length === 0) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (json) {
      const sa = JSON.parse(json) as Record<string, unknown>;
      // 兼容：某些环境变量粘贴会把换行变成字面量 "\\n"
      if (typeof sa.private_key === "string") {
        sa.private_key = sa.private_key.replace(/\\n/g, "\n");
      }
      initializeApp({ credential: cert(sa as any) });
    } else {
      // fallback: rely on application default credentials (ADC)
      initializeApp();
    }
  }

  return getFirestore();
}

export function getAdminAuth() {
  /**
   * 注意：
   * - `firebase-admin` 只能在 Node.js runtime 使用（不能在 Edge runtime）
   * - `getAuth()` 绑定默认 app；因此这里复用 `getAdminFirestore()` 来确保 app 已完成初始化
   */
  getAdminFirestore();
  return getAuth();
}

