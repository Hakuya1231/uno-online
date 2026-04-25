"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import type { Card, PublicRoomDoc } from "@/shared";

import { postJson } from "@/client/api";
import { getClientFirestore } from "@/client/firestore";
import { useLocalSession } from "@/client/useLocalSession";
import { useFirebaseAuthUser } from "@/client/useFirebaseAuthUser";
import { ROOM_STATUS_ZH, cardZh, colorZh, directionZh, pendingDrawZh } from "@/client/uiText";

function getRoomIdFromParams(params: Record<string, string | string[]>) {
  const v = params.roomId;
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

const cardText = cardZh;

function topDiscard(room: PublicRoomDoc): Card | null {
  return room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1]! : null;
}

function playerName(room: PublicRoomDoc, playerId: string) {
  const p = room.players.find((x) => x.id === playerId);
  return p ? p.name : playerId;
}

export default function GamePage() {
  const router = useRouter();
  const params = useParams<Record<string, string | string[]>>();
  const roomId = getRoomIdFromParams(params).toUpperCase();
  const { session, ready } = useLocalSession();
  const { user: authUser, ready: authReady } = useFirebaseAuthUser();

  const [room, setRoom] = useState<PublicRoomDoc | null>(null);
  const [roomError, setRoomError] = useState("");

  const [hand, setHand] = useState<Card[] | null>(null);
  const [handError, setHandError] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [chosenColor, setChosenColor] = useState<"red" | "yellow" | "green" | "blue" | null>(null);

  // 订阅公开房间
  useEffect(() => {
    if (!roomId) return;
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
        setRoomError("");
        setRoom(snap.data() as PublicRoomDoc);
      },
      (err) => {
        setRoom(null);
        setRoomError(err instanceof Error ? err.message : "订阅失败");
      },
    );
    return () => unsub();
  }, [roomId]);

  // 订阅“我的手牌”（若规则不允许读取，会提示但不阻塞其他 UI）
  useEffect(() => {
    if (!roomId) return;
    // Firestore Rules 的 request.auth 取决于 Firebase Auth SDK，而非 localStorage
    if (!authReady || !authUser?.uid) return;

    const db = getClientFirestore();
    const ref = doc(db, "rooms", roomId, "hands", authUser.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setHandError("");
        if (!snap.exists()) {
          setHand([]);
          return;
        }
        const data = snap.data() as { cards?: Card[] };
        setHand(Array.isArray(data.cards) ? data.cards : []);
      },
      (err) => {
        setHand(null);
        setHandError(err instanceof Error ? err.message : "订阅手牌失败");
      },
    );
    return () => unsub();
  }, [authReady, authUser?.uid, roomId]);

  // 若房间还在 waiting，说明还没开始游戏，应回房间页
  useEffect(() => {
    if (!room) return;
    if (room.status === "waiting") {
      router.replace(`/room/${roomId}`);
    }
  }, [room, roomId, router]);

  const isHost = Boolean(room && session.userId && room.hostId === session.userId);
  const isDealer = Boolean(room && session.userId && room.dealerId === session.userId);
  const hasJoined = Boolean(room && session.userId && room.players.some((p) => p.id === session.userId));

  const doDrawForDealer = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/draw-for-dealer", { roomId });
    } catch (e) {
      setMsg(`摸牌失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  const doDeal = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/deal", { roomId });
    } catch (e) {
      setMsg(`发牌失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  const doDrawCard = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/draw-card", { roomId });
    } catch (e) {
      setMsg(`摸牌失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  const doSkip = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/skip", { roomId });
    } catch (e) {
      setMsg(`跳过失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  const doAccept = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/accept", { roomId });
    } catch (e) {
      setMsg(`接受失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  const doChallenge = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      const out = await postJson<{ hand: Card[]; result: "success" | "fail" }>("/api/game/challenge", { roomId });
      // 质疑接口会返回“被质疑者手牌”，这里用 msg 列出返回内容；手牌变化仍以 onSnapshot 为准
      const resultZh = out.result === "success" ? "成功" : "失败";
      const cards = Array.isArray(out.hand) ? out.hand : [];
      const cardsText = cards.length > 0 ? cards.map((c) => cardText(c)).join("、") : "（空）";
      setMsg(`质疑结果：${resultZh}\n被质疑者手牌（${cards.length} 张）：${cardsText}`);
    } catch (e) {
      setMsg(`质疑失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  const doPlaySelected = useCallback(async () => {
    if (!roomId) return;
    if (selectedIndex === null) {
      setMsg("请先选择一张手牌");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/play-card", { roomId, cardIndex: selectedIndex, chosenColor });
      setSelectedIndex(null);
      setChosenColor(null);
    } catch (e) {
      setMsg(`出牌失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [chosenColor, roomId, selectedIndex]);

  const doNextRound = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/next-round", { roomId });
    } catch (e) {
      setMsg(`开始下一局失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  const doEnd = useCallback(async () => {
    if (!roomId) return;
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/game/end", { roomId });
      router.push("/");
    } catch (e) {
      setMsg(`结束游戏失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId, router]);

  // paused 倒计时
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const pauseLeft =
    room?.status === "paused" && typeof room.pauseUntil === "number" ? Math.max(0, room.pauseUntil - now) : 0;
  const pauseLeftSec = Math.ceil(pauseLeft / 1000);

  // 选庄结果展示：最后一人摸完后延迟几秒再进入发牌（避免看不到结果）
  const [dealerRevealUntil, setDealerRevealUntil] = useState<number | null>(null);
  const [dealerRevealShownKey, setDealerRevealShownKey] = useState<string | null>(null);
  const dealerRevealKey = useMemo(() => {
    if (!room) return null;
    if (room.dealerMode !== "draw_compare") return null;
    if (room.status !== "dealing") return null;
    if (!room.dealerDrawResults) return null;
    if (Object.keys(room.dealerDrawResults).length < room.players.length) return null;

    const resultsKey = room.players
      .map((p) => {
        const c = room.dealerDrawResults?.[p.id];
        return c ? `${p.id}:${c.type}:${c.color ?? "null"}:${c.value ?? "null"}` : `${p.id}:pending`;
      })
      .join("|");

    return `${room.currentRound}:${room.dealerId}:${resultsKey}`;
  }, [room]);
  useEffect(() => {
    if (!dealerRevealKey) return;
    if (dealerRevealShownKey === dealerRevealKey) return;
    setDealerRevealUntil(Date.now() + 2000);
    setDealerRevealShownKey(dealerRevealKey);
  }, [dealerRevealKey, dealerRevealShownKey]);
  useEffect(() => {
    if (dealerRevealUntil === null) return;
    if (now >= dealerRevealUntil) setDealerRevealUntil(null);
  }, [dealerRevealUntil, now]);
  useEffect(() => {
    // 离开 dealing 后清理，避免影响后续回合
    if (!room) return;
    if (room.status !== "dealing" && dealerRevealUntil !== null) setDealerRevealUntil(null);
  }, [dealerRevealUntil, room]);
  useEffect(() => {
    setDealerRevealUntil(null);
    setDealerRevealShownKey(null);
  }, [roomId]);

  const currentPlayer =
    room && room.players[room.currentPlayerIndex] ? room.players[room.currentPlayerIndex]! : null;
  const isMyTurn = Boolean(room && currentPlayer && session.userId && currentPlayer.id === session.userId);

  const selectedCard = hand && selectedIndex !== null ? hand[selectedIndex] ?? null : null;
  const needsColor = Boolean(selectedCard && (selectedCard.type === "wild" || selectedCard.type === "wild_draw_four"));
  useEffect(() => {
    if (!needsColor) setChosenColor(null);
  }, [needsColor]);

  const shouldDealerReveal = Boolean(dealerRevealKey);
  // 同一批选庄结果只展示一次；首次满足条件但计时尚未落地时也先显示，避免闪到“等待发牌”。
  const showDealerReveal = Boolean(
    dealerRevealKey &&
      (dealerRevealShownKey !== dealerRevealKey || (dealerRevealUntil !== null && now < dealerRevealUntil)),
  );
  const dealerRevealLeftSec =
    dealerRevealUntil !== null ? Math.max(0, Math.ceil((dealerRevealUntil - now) / 1000)) : 0;

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        boxSizing: "border-box",
        maxWidth: 900,
        margin: "40px auto",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>UNO Online</h1>
          <div style={{ opacity: 0.8 }}>房间号：<code>{roomId}</code></div>
          {room ? (
            <div style={{ opacity: 0.8 }}>
              状态：<code>{ROOM_STATUS_ZH[room.status]}</code>
            </div>
          ) : null}
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {roomError ? <div style={{ whiteSpace: "pre-wrap" }}>房间订阅错误：{roomError}</div> : null}
      {handError ? <div style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>手牌订阅错误：{handError}</div> : null}
      {room && (room.status === "playing" || room.status === "paused") ? null : msg ? (
        <div style={{ whiteSpace: "pre-wrap" }}>{msg}</div>
      ) : null}

      {!room ? <div style={{ opacity: 0.8 }}>正在加载…</div> : null}

      {room && !hasJoined ? (
        <div style={{ opacity: 0.8 }}>你尚未加入该房间，请回到房间页加入。</div>
      ) : null}

      {room && (room.status === "choosing_dealer" || showDealerReveal) ? (
        <div style={{ display: "grid", gap: 12, width: "100%" }}>
          <div style={{ fontWeight: 700 }}>选庄 - 摸牌比大小</div>
          <div style={{ opacity: 0.8 }}>
            {showDealerReveal ? `选庄结果已出，${dealerRevealLeftSec}s 后进入发牌…` : "提示：依次摸一张牌，比大小决定庄家。"}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {room.players.map((p) => {
              const c = room.dealerDrawResults?.[p.id] ?? null;
              return (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 160 }}>{p.name}</div>
                  <div style={{ opacity: 0.9 }}>
                    {c ? <code>{cardText(c)}</code> : <span style={{ opacity: 0.7 }}>等待摸牌...</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {!showDealerReveal ? (
            <button type="button" onClick={doDrawForDealer} disabled={busy || !ready}>
              摸牌
            </button>
          ) : null}
        </div>
      ) : null}

      {room && room.status === "dealing" && !showDealerReveal ? (
        <div style={{ display: "grid", gap: 12, width: "100%" }}>
          <div>庄家：{playerName(room, room.dealerId)}</div>
          {isDealer ? (
            <button type="button" onClick={doDeal} disabled={busy || !ready}>
              发牌
            </button>
          ) : (
            <div style={{ opacity: 0.8 }}>等待庄家发牌...</div>
          )}
        </div>
      ) : null}

      {room && (room.status === "playing" || room.status === "paused") ? (
        <div style={{ display: "grid", gap: 12, position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              第{room.currentRound}局 摸牌堆:{room.drawPileCount} 方向:{directionZh(room.direction)} 轮到:
              {currentPlayer ? currentPlayer.name : "（无）"}
            </div>
            <div style={{ opacity: 0.8 }}>
              当前颜色：{room.chosenColor ? colorZh(room.chosenColor) : "（无）"}
              {"  "}叠加摸牌：{pendingDrawZh(room.pendingDraw)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {room.players.map((p) => (
              <div key={p.id} style={{ padding: 8, border: "1px solid #3333", borderRadius: 8, minWidth: 120 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ opacity: 0.8 }}>{room.handCounts[p.id] ?? 0} 张</div>
              </div>
            ))}
          </div>

          <div style={{ padding: 12, border: "1px solid #3333", borderRadius: 8 }}>
            <div style={{ opacity: 0.8, marginBottom: 8 }}>弃牌堆顶</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {topDiscard(room) ? <code>{cardText(topDiscard(room)!)}</code> : "（无）"}
            </div>
          </div>

          <div style={{ padding: 12, border: "1px solid #3333", borderRadius: 8 }}>
            <div style={{ opacity: 0.8, marginBottom: 8 }}>我的手牌</div>
            {msg ? <div style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>{msg}</div> : null}
            {hand === null ? (
              <div style={{ opacity: 0.8 }}>（未能读取手牌；请检查 Firestore Rules 是否允许读取自己的 hands 文档）</div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {hand.map((c, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedIndex(idx);
                      setMsg("");
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: idx === selectedIndex ? "2px solid #111" : "1px solid #3336",
                      background: idx === selectedIndex ? "#eee" : "white",
                      fontSize: 16,
                    }}
                    disabled={busy}
                  >
                    {cardText(c)}
                  </button>
                ))}
              </div>
            )}

            {needsColor ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ opacity: 0.8 }}>选颜色：</span>
                {(["red", "yellow", "green", "blue"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChosenColor(c)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: chosenColor === c ? "2px solid #111" : "1px solid #3336",
                      fontSize: 16,
                    }}
                    disabled={busy}
                  >
                    {c === "red" ? "红" : c === "yellow" ? "黄" : c === "green" ? "绿" : "蓝"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {/* 第一行：出牌/摸牌/跳过（每个按钮占 1/4 行宽） */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <button
                type="button"
                onClick={doPlaySelected}
                disabled={busy || !ready || !isMyTurn || selectedIndex === null || (needsColor && !chosenColor)}
                style={{ padding: "12px 14px", fontSize: 18, borderRadius: 10 }}
              >
                出牌
              </button>
              <button
                type="button"
                onClick={doDrawCard}
                disabled={busy || !ready || !isMyTurn}
                style={{ padding: "12px 14px", fontSize: 18, borderRadius: 10 }}
              >
                摸牌
              </button>
              <button
                type="button"
                onClick={doSkip}
                disabled={busy || !ready || !isMyTurn}
                style={{ padding: "12px 14px", fontSize: 18, borderRadius: 10 }}
              >
                跳过
              </button>
              <div />
            </div>

            {/* 第二行：接受/质疑（每个按钮占 1/4 行宽） */}
            {room.pendingDraw.count > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                <button
                  type="button"
                  onClick={doAccept}
                  disabled={busy || !ready || !isMyTurn}
                  style={{ padding: "12px 14px", fontSize: 18, borderRadius: 10 }}
                >
                  接受
                </button>
                {room.pendingDraw.type === "wild_draw_four" ? (
                  <button
                    type="button"
                    onClick={doChallenge}
                    disabled={busy || !ready || !isMyTurn}
                    style={{ padding: "12px 14px", fontSize: 18, borderRadius: 10 }}
                  >
                    质疑
                  </button>
                ) : (
                  <div />
                )}
                <div />
                <div />
              </div>
            ) : null}
          </div>

          {room.status === "paused" ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                color: "white",
                display: "grid",
                placeItems: "center",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {room.disconnectedPlayerId ? `${playerName(room, room.disconnectedPlayerId)} 已断线` : "已暂停"}
                </div>
                <div style={{ opacity: 0.9, marginTop: 6 }}>等待重连... {pauseLeftSec}s</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {room && room.status === "finished" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>
            第{room.currentRound}局结算 胜者：{room.roundWinnerId ? playerName(room, room.roundWinnerId) : "（未知）"}
          </div>

          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #3333", padding: 8 }}>玩家</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #3333", padding: 8 }}>剩余手牌</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #3333", padding: 8 }}>累计</th>
              </tr>
            </thead>
            <tbody>
              {room.players.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #3331" }}>{p.name}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #3331" }}>
                    {room.handCounts[p.id] ?? 0} 张
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #3331" }}>{room.scores[p.id] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={doNextRound} disabled={busy || !ready || !isHost}>
              开始下一局
            </button>
            <button type="button" onClick={doEnd} disabled={busy || !ready || !isHost}>
              结束游戏
            </button>
          </div>
          {!isHost ? <div style={{ opacity: 0.8 }}>仅房主可开始下一局或结束游戏。</div> : null}
        </div>
      ) : null}

      {room && room.status === "ended" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>房间已结束</div>
          <button type="button" onClick={() => router.push("/")}>
            返回首页
          </button>
        </div>
      ) : null}
    </div>
  );
}

