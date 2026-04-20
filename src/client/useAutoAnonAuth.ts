"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getClientAuth } from "@/client/firebase";
import { syncAuthToLocalStorage } from "@/client/localSession";

/**
 * 进入系统时的无感匿名登录：
 * - 若浏览器已有 Firebase Auth 会话：刷新 token 并写入 localStorage
 * - 若没有会话：自动 signInAnonymously，再写入 localStorage
 */
export function useAutoAnonAuth() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string>("");
  const [error, setError] = useState<string>("");

  const auth = useMemo(() => (typeof window === "undefined" ? null : getClientAuth()), []);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setError("");
      setUser(u);
      if (!u) {
        setIdToken("");
        return;
      }
      const { idToken: t } = await syncAuthToLocalStorage(u);
      setIdToken(t);
      setReady(true);
    });
    return () => unsub();
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    if (ready) return;
    if (user) return;

    let cancelled = false;
    (async () => {
      try {
        const cred = await signInAnonymously(auth);
        if (cancelled) return;
        const { idToken: t } = await syncAuthToLocalStorage(cred.user);
        if (cancelled) return;
        setIdToken(t);
        setUser(cred.user);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "匿名登录失败");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, ready, user]);

  return { ready, user, idToken, error };
}

