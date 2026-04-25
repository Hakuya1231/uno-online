"use client";

import "animal-island-ui/style";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { Button, Divider, Footer, Input } from "animal-island-ui";
import { postJson } from "@/client/api";
import { useLocalSession } from "@/client/useLocalSession";
import { getClientFirestore } from "@/client/firestore";
import type { PublicRoomDoc } from "@/shared";
import { randomChuunibyouNickname } from "@/client/nickname";
import { saveNickname } from "@/client/localSession";
import { DEALER_MODE_ZH, ROOM_STATUS_ZH } from "@/client/uiText";
import styles from "./page.module.css";

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
  const canStart = Boolean(
    room &&
      !busy &&
      roomId &&
      ready &&
      room.status === "waiting" &&
      room.players.length >= 2,
  );

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

  const onRandomNickname = useCallback(() => {
    const next = randomChuunibyouNickname({ maxLen: 12 });
    setNickname(next);
    saveNickname(next);
  }, []);

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
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.titleRow}>
              <div>
                <h1 className={styles.title}>白夜大小姐的UNO</h1>
                <div className={styles.roomId}>
                  房间号
                  <span className={styles.roomCode}>{roomId}</span>
                </div>
              </div>
              <Button type="default" onClick={onCopyLink} disabled={!roomId}>
                复制链接
              </Button>
            </div>

            {room ? (
              <div className={styles.metaGrid}>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>房间状态</span>
                  <span className={styles.metaValue}>{ROOM_STATUS_ZH[room.status]}</span>
                </div>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>庄家方式</span>
                  <span className={styles.metaValue}>{DEALER_MODE_ZH[room.dealerMode]}</span>
                </div>
                {room.status !== "waiting" ? (
                  <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>玩家人数</span>
                    <span className={styles.metaValue}>{room.players.length} 人</span>
                  </div>
                ) : null}
                {room.status !== "waiting" ? (
                  <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>我的昵称</span>
                    <span className={styles.metaValue}>{session.nickname || "未设置"}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.metaGrid}>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>房间状态</span>
                  <span className={styles.metaValue}>{roomError ? "加载失败" : "正在加载"}</span>
                </div>
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>我的昵称</span>
                  <span className={styles.metaValue}>{session.nickname || "未设置"}</span>
                </div>
              </div>
            )}
          </div>

          <Divider type="wave-yellow" />

          {roomError ? <div className={styles.message}>房间订阅错误：{roomError}</div> : null}

          {room ? (
            <>
              <section className={styles.section}>
                <div className={styles.sectionTitle}>玩家列表</div>
                <ul className={styles.playerList}>
                  {room.players.map((p) => (
                    <li key={p.id} className={styles.playerItem}>
                      <div className={styles.playerMain}>
                        <span className={styles.playerName}>{p.name}</span>
                      </div>
                      <div className={styles.badges}>
                        {p.id === session.userId ? <span className={styles.badge}>我</span> : null}
                        {p.id === room.hostId ? <span className={styles.badge}>房主</span> : null}
                        {p.isAI ? <span className={styles.badge}>AI</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <Divider type="wave-yellow" />

              {room.status !== "waiting" ? (
                <div className={styles.note}>
                  {hasJoined ? "房间已进入下一阶段，正在为你跳转到对局页面…" : `当前房间状态：${ROOM_STATUS_ZH[room.status]}`}
                </div>
              ) : !isHost ? (
                !hasJoined ? (
                  <div className={styles.actionGroup}>
                    <div className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>昵称</span>
                      <div className={styles.inputRow}>
                        <Input
                          value={nickname}
                          onChange={(e) => {
                            setNickname(e.target.value);
                            saveNickname(e.target.value.trim());
                          }}
                          placeholder="请输入"
                          allowClear
                          onClear={() => {
                            setNickname("");
                            saveNickname("");
                          }}
                          disabled={busy}
                          maxLength={12}
                        />
                        <Button type="default" onClick={onRandomNickname} disabled={busy}>
                          随机
                        </Button>
                      </div>
                    </div>
                    <Button
                      type="primary"
                      block
                      size="large"
                      onClick={onJoin}
                      loading={busy}
                      disabled={busy || !roomId || !ready || nickname.trim().length === 0}
                    >
                      加入房间
                    </Button>
                  </div>
                ) : (
                  <div className={styles.note}>你已加入房间，等待房主开始游戏…</div>
                )
              ) : (
                <div className={styles.actionGroup}>
                  <Button
                    type="primary"
                    block
                    size="large"
                    onClick={onStart}
                    loading={busy}
                    disabled={!canStart}
                  >
                    开始游戏
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.note}>正在加载房间信息…</div>
          )}

          {msg ? <div className={styles.message}>{msg}</div> : null}
        </section>

        <section className={styles.footerBlock}>
          <Footer type="tree" />
        </section>
      </main>
    </div>
  );
}

