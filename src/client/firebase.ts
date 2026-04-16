import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * 浏览器侧 Firebase 初始化（仅用于 Auth/前端能力）。
 *
 * 注意：
 * - 这里只能使用 `NEXT_PUBLIC_*` 环境变量
 * - 这些值不是“密钥”，可以暴露在前端；真正的权限控制靠 Firestore Rules + 服务端校验
 */

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !authDomain || !projectId) {
    throw new Error(
      "缺少 NEXT_PUBLIC_FIREBASE_* 环境变量（至少需要 API_KEY/AUTH_DOMAIN/PROJECT_ID）",
    );
  }

  return { apiKey, authDomain, projectId };
}

export function getClientFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("getClientFirebaseApp 只能在浏览器端调用");
  }

  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp(getFirebaseConfig());
}

export function getClientAuth(): Auth {
  return getAuth(getClientFirebaseApp());
}

