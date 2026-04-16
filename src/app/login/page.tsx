"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getClientAuth } from "@/client/firebase";
import { authedFetch } from "@/client/authedFetch";
import type { DealerMode } from "@/shared";

type CreateRoomResp = { roomId: string } | { error: string };

// 避免 Next 在 build 时对该页做静态预渲染（本页依赖浏览器侧 Firebase Auth）。
export const dynamic = "force-dynamic";

function parseJsonSafely(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const [authReady, setAuthReady] = useState(false);
  const auth = useMemo(() => (authReady ? getClientAuth() : null), [authReady]);

  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string>("");

  const [hostName, setHostName] = useState<string>("玩家");
  const [dealerMode, setDealerMode] = useState<DealerMode>("host");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [createdRoomId, setCreatedRoomId] = useState<string>("");

  useEffect(() => {
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setCreatedRoomId("");
      setMsg("");
      if (!u) {
        setIdToken("");
        return;
      }
      const t = await u.getIdToken();
      setIdToken(t);
    });
    return () => unsub();
  }, [auth]);

  const doAnonLogin = useCallback(async () => {
    if (!auth) {
      setMsg("Auth 尚未初始化，请稍等");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const cred = await signInAnonymously(auth);
      const t = await cred.user.getIdToken();
      setIdToken(t);
      setMsg("匿名登录成功");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "匿名登录失败");
    } finally {
      setBusy(false);
    }
  }, [auth]);

  const createRoom = useCallback(async () => {
    if (!idToken) {
      setMsg("请先匿名登录");
      return;
    }

    setBusy(true);
    setMsg("");
    setCreatedRoomId("");
    try {
      const resp = await authedFetch("/api/room", {
        method: "POST",
        idToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostName, dealerMode }),
      });

      const text = await resp.text();
      const json = parseJsonSafely(text) as CreateRoomResp | null;

      if (!resp.ok) {
        const err = json && typeof (json as any).error === "string" ? (json as any).error : text;
        setMsg(`创建失败：${err || resp.status}`);
        return;
      }

      if (!json || typeof (json as any).roomId !== "string") {
        setMsg("创建失败：响应格式不符合预期");
        return;
      }

      setCreatedRoomId((json as any).roomId);
      setMsg("创建成功");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }, [dealerMode, hostName, idToken]);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>UNO Online</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        先匿名登录，再创建房间（会调用服务端 `/api/room`）。
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={doAnonLogin} disabled={busy || !auth}>
          匿名登录
        </button>
        <span style={{ opacity: 0.8 }}>
          {user ? (
            <>
              已登录：<code>{user.uid}</code>
            </>
          ) : (
            "未登录"
          )}
        </span>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <h2 style={{ marginBottom: 8 }}>创建房间</h2>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>昵称（hostName）</span>
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="例如：玩家A"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>选庄方式（dealerMode）</span>
          <select value={dealerMode} onChange={(e) => setDealerMode(e.target.value as DealerMode)}>
            <option value="host">房主当庄</option>
            <option value="draw_compare">摸牌比大小选庄</option>
          </select>
        </label>

        <button onClick={createRoom} disabled={busy || !idToken}>
          创建房间
        </button>

        {createdRoomId ? (
          <div>
            创建的 roomId：<code>{createdRoomId}</code>
          </div>
        ) : null}

        {msg ? <div style={{ whiteSpace: "pre-wrap" }}>{msg}</div> : null}
      </div>

      <hr style={{ margin: "20px 0" }} />
      <Link href="/">返回首页</Link>
    </div>
  );
}

