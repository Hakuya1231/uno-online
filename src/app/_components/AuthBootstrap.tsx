"use client";

import { useEffect } from "react";
import { useAutoAnonAuth } from "@/client/useAutoAnonAuth";

/**
 * 全局“进入系统”逻辑：
 * - 自动恢复/匿名登录
 * - 将 token/uid 同步到 localStorage（由 useAutoAnonAuth 完成）
 *
 * 该组件只负责副作用，不渲染 UI。
 */
export function AuthBootstrap() {
  const { ready, error } = useAutoAnonAuth();

  useEffect(() => {
    if (!ready) return;
    window.dispatchEvent(new Event("uno:session"));
  }, [ready]);

  useEffect(() => {
    if (!error) return;
    window.dispatchEvent(new Event("uno:session"));
  }, [error]);

  return null;
}

