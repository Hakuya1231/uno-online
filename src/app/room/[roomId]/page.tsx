"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { postJson } from "@/client/api";
import { useLocalSession } from "@/client/useLocalSession";
import { NicknameInput } from "@/app/_components/NicknameInput";
import { getClientFirestore } from "@/client/firestore";
import type { PublicRoomDoc } from "@/shared";

function getRoomIdFromParams(params: Record<string, string | string[]>) {
  const v = params.roomId;
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<Record<string, string | string[]>>();
  const roomId = getRoomIdFromParams(params).toUpperCase();

  const { session, ready } = useLocalSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [nickname, setNickname] = useState<string>(session.nickname || "");

  const [room, setRoom] = useState<PublicRoomDoc | null>(null);
  const [roomError, setRoomError] = useState<string>("");

  useEffect(() => {
    // 允许从其他页面修改昵称后同步到这里
    setNickname(session.nickname || "");
  }, [session.nickname]);

  useEffect(() => {
    if (!roomId) return;
    setRoomError("");
    const db = getClientFirestore();
    const ref = doc(db, "rooms", roomId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRoom(null);
          setRoomError("房间不存在");
          return;
        }
        setRoom(snap.data() as PublicRoomDoc);
      },
      (err) => {
        setRoom(null);
        setRoomError(err instanceof Error ? err.message : "订阅失败");
      },
    );
    return () => unsub();
  }, [roomId]);

  const isHost = Boolean(room && session.userId && room.hostId === session.userId);
  const hasJoined = useMemo(() => {
    if (!room || !session.userId) return false;
    return room.players.some((p) => p.id === session.userId);
  }, [room, session.userId]);

  // 房主开始游戏后，所有已加入玩家都应自动进入游戏页
  useEffect(() => {
    if (!room) return;
    if (!roomId) return;
    if (!ready) return;
    if (!hasJoined) return;

    if (room.status !== "waiting") {
      router.replace(`/game/${roomId}`);
    }
  }, [hasJoined, ready, room, roomId, router]);

  const onJoin = useCallback(async () => {
    const name = nickname.trim();
    if (!name) {
      setMsg("请先设置昵称");
      return;
    }
    if (!roomId) return;

    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/room/join", { roomId, name });
      setMsg("加入成功");
    } catch (e) {
      setMsg(`加入失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [nickname, roomId]);

  const onCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
      setMsg("已复制链接");
    } catch {
      setMsg("复制失败（浏览器不支持或无权限）");
    }
  }, [roomId]);

  const onStart = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/room/start", { roomId });

      router.push(`/game/${roomId}`);
    } catch (e) {
      setMsg(`开始失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId, router]);

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>房间号</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{roomId}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            当前用户：<code>{session.userId || "未知"}</code> 昵称：<code>{session.nickname || "未设置"}</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onCopyLink} disabled={!roomId}>
            复制链接
          </button>
        </div>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <div style={{ display: "grid", gap: 12 }}>
        {roomError ? <div style={{ whiteSpace: "pre-wrap" }}>房间订阅错误：{roomError}</div> : null}

        {room ? (
          <>
            <div style={{ opacity: 0.8 }}>
              庄家方式：{room.dealerMode === "host" ? "房主当庄" : "摸牌比大小"}
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>玩家列表</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {room.players.map((p) => (
                  <li key={p.id}>
                    {p.name}{" "}
                    {p.id === room.hostId ? <span style={{ opacity: 0.8 }}>(房主)</span> : null}{" "}
                    {p.isAI ? <span style={{ opacity: 0.8 }}>[AI]</span> : null}
                  </li>
                ))}
              </ol>
            </div>

            {!isHost ? (
              <>
                {!hasJoined ? (
                  <>
                    <NicknameInput value={nickname} onChange={setNickname} disabled={busy} />
                    <button
                      type="button"
                      onClick={onJoin}
                      disabled={busy || !roomId || !ready || nickname.trim().length === 0}
                    >
                      加入房间
                    </button>
                  </>
                ) : (
                  <div style={{ opacity: 0.8 }}>你已加入房间，等待房主开始游戏…</div>
                )}
              </>
            ) : (
              <button
                onClick={onStart}
                disabled={
                  busy ||
                  !roomId ||
                  !ready ||
                  room.status !== "waiting" ||
                  room.players.length < 2
                }
              >
                开始游戏
              </button>
            )}

            {isHost ? (
              <div style={{ opacity: 0.7, fontSize: 12 }}>
                开始条件：status=waiting 且人数≥2（后续会补“添加/移除 AI”）
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ opacity: 0.8 }}>正在加载房间信息…</div>
        )}

        {msg ? <div style={{ whiteSpace: "pre-wrap" }}>{msg}</div> : null}
      </div>
    </div>
  );
}

