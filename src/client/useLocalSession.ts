"use client";

import { useEffect, useState } from "react";
import { getSessionKeys, loadLocalSession, type LocalSession } from "@/client/localSession";

/**
 * 读取并订阅 localStorage 中的会话信息。
 *
 * 更新来源：
 * - 其他 tab 的 localStorage 变更（storage 事件）
 * - 本 tab 的认证同步完成（我们手动派发 `uno:session` 事件）
 */
export function useLocalSession() {
  const [session, setSession] = useState<Partial<LocalSession>>(() => loadLocalSession());

  useEffect(() => {
    const onUpdate = () => setSession(loadLocalSession());

    const onStorage = (e: StorageEvent) => {
      const { KEY_TOKEN, KEY_UID, KEY_NAME } = getSessionKeys();
      if (e.key === KEY_TOKEN || e.key === KEY_UID || e.key === KEY_NAME) onUpdate();
    };

    window.addEventListener("uno:session", onUpdate as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("uno:session", onUpdate as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const ready = Boolean(session.idToken && session.userId);
  return { session, ready };
}

