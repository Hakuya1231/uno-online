"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getClientAuth } from "@/client/firebase";

/**
 * 返回 Firebase Auth 的真实登录态（用于 Firestore Rules 的 request.auth）。
 *
 * 注意：
 * - localStorage 里的 uid/idToken 不代表 Firestore 请求一定带 auth
 * - Firestore Rules 中的 request.auth 取决于 Firebase Auth SDK 是否已恢复会话
 */
export function useFirebaseAuthUser() {
  const auth = useMemo(() => (typeof window === "undefined" ? null : getClientAuth()), []);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => unsub();
  }, [auth]);

  return { ready, user };
}

