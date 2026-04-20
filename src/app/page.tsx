"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

import type { DealerMode } from "@/shared";
import { loadLocalSession, saveNickname } from "@/client/localSession";
import { postJson } from "@/client/api";
import { randomChuunibyouNickname } from "@/client/nickname";
import { useLocalSession } from "@/client/useLocalSession";

type CreateRoomResp = { roomId: string };

function randomNickname() {
  return randomChuunibyouNickname({ maxLen: 12 });
}

export default function HomePage() {
  const router = useRouter();
  const { session, ready } = useLocalSession();

  const initial = useMemo(() => loadLocalSession(), []);
  const [nickname, setNickname] = useState(initial.nickname || randomNickname());
  const [dealerMode, setDealerMode] = useState<DealerMode>("host");
  const [joinRoomId, setJoinRoomId] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    saveNickname(nickname.trim());
  }, [nickname]);

  const onRandom = useCallback(() => {
    const nn = randomNickname();
    setNickname(nn);
    saveNickname(nn);
  }, []);

  const createRoom = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const { roomId } = await postJson<CreateRoomResp>("/api/room", {
        hostName: nickname.trim(),
        dealerMode,
      });
      router.push(`/room/${roomId}`);
    } catch (e) {
      setMsg(`创建失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [dealerMode, nickname, router]);

  const joinRoom = useCallback(async () => {
    const roomId = joinRoomId.trim().toUpperCase();
    if (!roomId) {
      setMsg("请输入房间号");
      return;
    }

    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/room/join", { roomId, name: nickname.trim() });
      router.push(`/room/${roomId}`);
    } catch (e) {
      setMsg(`加入失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [joinRoomId, nickname, router]);

  return (
    <div className={styles.page}>
      <main className={styles.main} style={{ gap: 16 }}>
        <h1>UNO Online</h1>

        <div style={{ opacity: 0.8 }}>
          {ready ? (
            <span>
              已登录：<code>{session.userId}</code>
            </span>
          ) : (
            <span>正在进入系统...</span>
          )}
        </div>

        <div style={{ width: "100%", maxWidth: 520, display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>昵称</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <button type="button" onClick={onRandom} disabled={busy}>
                随机
              </button>
            </div>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>庄家方式</span>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="dealerMode"
                  value="host"
                  checked={dealerMode === "host"}
                  onChange={() => setDealerMode("host")}
                />
                房主当庄
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="dealerMode"
                  value="draw_compare"
                  checked={dealerMode === "draw_compare"}
                  onChange={() => setDealerMode("draw_compare")}
                />
                摸牌比大小
              </label>
            </div>
          </label>

          <button
            type="button"
            onClick={createRoom}
            disabled={busy || !ready || nickname.trim().length === 0}
          >
            创建房间
          </button>

          <hr style={{ width: "100%" }} />

          <label style={{ display: "grid", gap: 6 }}>
            <span>房间号</span>
            <input value={joinRoomId} onChange={(e) => setJoinRoomId(e.target.value)} placeholder="例如 ABC123" />
          </label>
          <button
            type="button"
            onClick={joinRoom}
            disabled={busy || !ready || nickname.trim().length === 0}
          >
            加入房间
          </button>

          {msg ? <div style={{ whiteSpace: "pre-wrap" }}>{msg}</div> : null}
        </div>
      </main>
    </div>
  );
}
