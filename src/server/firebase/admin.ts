import { cert, getApps, initializeApp } from "firebase-admin/app";
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
      initializeApp({ credential: cert(JSON.parse(json)) });
    } else {
      // fallback: rely on application default credentials (ADC)
      initializeApp();
    }
  }

  return getFirestore();
}

