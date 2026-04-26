"use client";

import "animal-island-ui/style";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import type { Card, PublicRoomDoc } from "@/shared";
import { Button, Card as UiCard, Divider, Footer } from "animal-island-ui";

import { postJson } from "@/client/api";
import { getClientFirestore } from "@/client/firestore";
import { useLocalSession } from "@/client/useLocalSession";
import { useFirebaseAuthUser } from "@/client/useFirebaseAuthUser";
import { ROOM_STATUS_ZH, cardZh, colorZh, directionZh, pendingDrawZh } from "@/client/uiText";
import styles from "./page.module.css";

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

function handCardClass(card: Card) {
  if (card.color === "red") return styles.handRed;
  if (card.color === "yellow") return styles.handYellow;
  if (card.color === "green") return styles.handGreen;
  if (card.color === "blue") return styles.handBlue;
  return styles.handWild;
}

function lastActionKey(action: PublicRoomDoc["lastAction"]) {
  if (!action) return null;
  return `${action.type}:${action.at}:${"by" in action ? action.by : "system"}`;
}

function lastActionText(room: PublicRoomDoc, action: NonNullable<PublicRoomDoc["lastAction"]>) {
  switch (action.type) {
    case "card_played":
      return `${playerName(room, action.by)} 打出了 ${cardText(action.card)}`;
    case "game_started":
      return `${playerName(room, action.by)} 开始了游戏`;
    case "dealer_card_drawn":
      return `${playerName(room, action.by)} 摸到了选庄牌 ${cardText(action.card)}`;
    case "dealt":
      return `${playerName(room, action.by)} 完成发牌，起始牌是 ${cardText(action.initialCard)}`;
    case "next_round_started":
      return `${playerName(room, action.by)} 开始了第 ${action.currentRound} 局`;
    case "game_ended":
      return `${playerName(room, action.by)} 结束了游戏`;
    case "card_drawn":
      return `${playerName(room, action.by)} 摸了一张牌`;
    case "skipped":
      return `${playerName(room, action.by)} 选择了跳过`;
    case "accepted_draw":
      return `${playerName(room, action.by)} 接受了 ${action.drawType === "draw_two" ? "+2" : "+4"}，共摸 ${action.count} 张`;
    case "challenge_result":
      return `${playerName(room, action.by)} 质疑${action.result === "success" ? "成功" : "失败"}`;
  }
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
  const [actionToast, setActionToast] = useState<string>("");
  const [seenActionKey, setSeenActionKey] = useState<string | null>(null);
  const [unoToast, setUnoToast] = useState<string>("");
  const [seenUnoKey, setSeenUnoKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (!room?.lastAction) return;
    const key = lastActionKey(room.lastAction);
    if (!key) return;
    if (seenActionKey === null) {
      setSeenActionKey(key);
      return;
    }
    if (key === seenActionKey) return;

    setSeenActionKey(key);
    setActionToast(lastActionText(room, room.lastAction));
  }, [room, seenActionKey]);

  useEffect(() => {
    if (!actionToast) return;
    const timer = window.setTimeout(() => setActionToast(""), 1000);
    return () => window.clearTimeout(timer);
  }, [actionToast]);

  useEffect(() => {
    if (!room?.lastAction) return;
    if (room.lastAction.type !== "card_played") return;
    const key = lastActionKey(room.lastAction);
    if (!key) return;
    if (seenUnoKey === null) {
      setSeenUnoKey(key);
      return;
    }
    if (key === seenUnoKey) return;

    setSeenUnoKey(key);
    if ((room.handCounts[room.lastAction.by] ?? -1) === 1) {
      setUnoToast(`${playerName(room, room.lastAction.by)} 骄傲地喊出了 UNO！`);
    }
  }, [room, seenUnoKey]);

  useEffect(() => {
    if (!unoToast) return;
    const timer = window.setTimeout(() => setUnoToast(""), 2000);
    return () => window.clearTimeout(timer);
  }, [unoToast]);

  return (
    <div className={styles.page}>
      {actionToast ? (
        <div className={styles.toastViewport}>
          <div className={styles.actionToast}>{actionToast}</div>
        </div>
      ) : null}
      {unoToast ? (
        <div className={styles.unoToastViewport}>
          <UiCard type="title" className={styles.unoToastCard}>
            {unoToast}
          </UiCard>
        </div>
      ) : null}
      <main className={styles.shell}>
        <section className={styles.topPanel}>
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.title}>UNO Time</h1>
              <div className={styles.roomMeta}>
                房间号
                <span className={styles.roomCode}>{roomId}</span>
                <span className={styles.roomMetaDivider}>|</span>
                我的昵称
                <span className={styles.roomCode}>{session.nickname || "未设置"}</span>
              </div>
              {room && (room.status === "playing" || room.status === "paused") ? (
                <div className={styles.roomSubMeta}>第 {room.currentRound} 局</div>
              ) : null}
            </div>
          </div>

          {room && (room.status === "playing" || room.status === "paused") ? (
            <ul className={styles.playerCountList}>
              {room.players.map((p) => (
                <li
                  key={p.id}
                  className={`${styles.playerCountItem} ${currentPlayer?.id === p.id ? styles.currentPlayerItem : ""}`}
                >
                  <span className={styles.playerCountName}>{p.name}</span>
                  <span className={styles.playerCountValue}>{room.handCounts[p.id] ?? 0} 张</span>
                </li>
              ))}
            </ul>
          ) : room && room.status === "finished" ? null : (
            <div className={styles.metaGrid}>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>房间状态</span>
                <span className={styles.metaValue}>{room ? ROOM_STATUS_ZH[room.status] : "正在加载"}</span>
              </div>
              {room && room.status !== "choosing_dealer" ? (
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>当前庄家</span>
                  <span className={styles.metaValue}>{playerName(room, room.dealerId)}</span>
                </div>
              ) : null}
              {room && room.status === "choosing_dealer" ? (
                <div className={styles.metaCard}>
                  <span className={styles.metaLabel}>庄家方式</span>
                  <span className={styles.metaValue}>{room.dealerMode === "draw_compare" ? "摸牌比大小" : "房主当庄"}</span>
                </div>
              ) : null}
            </div>
          )}

          {roomError ? <div className={styles.message}>房间订阅错误：{roomError}</div> : null}
          {handError ? <div className={styles.subtle}>手牌订阅错误：{handError}</div> : null}
          {room && (room.status === "playing" || room.status === "paused") ? null : msg ? (
            <div className={styles.message}>{msg}</div>
          ) : null}

          {!room ? <div className={styles.subtle}>正在加载…</div> : null}
          {room && !hasJoined ? <div className={styles.subtle}>你尚未加入该房间，请回到房间页加入。</div> : null}
        </section>

        {room && (room.status === "choosing_dealer" || showDealerReveal) ? (
          <section className={styles.phasePanel}>
            <div className={styles.phaseHeader}>
              <h2 className={styles.phaseTitle}>选庄</h2>
              <p className={styles.phaseSubtitle}>
                {showDealerReveal ? `选庄结果已出，${dealerRevealLeftSec}s 后进入发牌…` : "依次摸一张牌，比大小决定庄家。"}
              </p>
            </div>

            <Divider type="wave-yellow" />

            <ul className={styles.resultList}>
              {room.players.map((p) => {
                const c = room.dealerDrawResults?.[p.id] ?? null;
                return (
                  <li key={p.id} className={styles.resultItem}>
                    <span className={styles.playerName}>{p.name}</span>
                    {c ? <span className={styles.cardValue}>{cardText(c)}</span> : <span className={styles.pending}>等待摸牌...</span>}
                  </li>
                );
              })}
            </ul>

            {!showDealerReveal ? (
              <div className={styles.actionGroup}>
                <Button type="primary" block size="large" onClick={doDrawForDealer} loading={busy} disabled={busy || !ready}>
                  摸牌
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {room && room.status === "dealing" && !showDealerReveal ? (
          <section className={styles.phasePanel}>
            <div className={styles.phaseHeader}>
              <h2 className={styles.phaseTitle}>等待发牌</h2>
              <p className={styles.phaseSubtitle}>庄家：{playerName(room, room.dealerId)}</p>
            </div>

            <Divider type="wave-yellow" />

            {isDealer ? (
              <div className={styles.actionGroup}>
                <Button type="primary" block size="large" onClick={doDeal} loading={busy} disabled={busy || !ready}>
                  发牌
                </Button>
              </div>
            ) : (
              <div className={styles.subtle}>等待庄家发牌...</div>
            )}
          </section>
        ) : null}

        {room && (room.status === "playing" || room.status === "paused") ? (
          <section className={styles.handPanel}>
              {msg ? <div className={styles.message}>{msg}</div> : null}

              {hand === null ? (
                <div className={styles.subtle}>未能读取手牌，请刷新页面。</div>
              ) : (
                <div className={styles.handGrid}>
                  {hand.map((c, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedIndex(idx);
                        setMsg("");
                      }}
                      className={`${styles.handCard} ${handCardClass(c)} ${idx === selectedIndex ? styles.handCardSelected : ""}`}
                      disabled={busy}
                    >
                      <div className={styles.handCardInner}>
                        <span className={styles.handCardText}>{cardText(c)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {needsColor ? (
                <div className={styles.colorPicker}>
                  <span className={styles.colorLabel}>选颜色：</span>
                  {(["red", "yellow", "green", "blue"] as const).map((c) => (
                    <Button
                      key={c}
                      type={chosenColor === c ? "primary" : "default"}
                      onClick={() => setChosenColor(c)}
                      disabled={busy}
                    >
                      {c === "red" ? "红" : c === "yellow" ? "黄" : c === "green" ? "绿" : "蓝"}
                    </Button>
                  ))}
                </div>
              ) : null}

              <div className={styles.controlsGrid}>
                <div className={styles.controlRow}>
                  <Button
                    type="primary"
                    block
                    onClick={doPlaySelected}
                    loading={busy && false}
                    disabled={busy || !ready || !isMyTurn || selectedIndex === null || (needsColor && !chosenColor)}
                  >
                    出牌
                  </Button>
                  <Button type="default" block onClick={doDrawCard} disabled={busy || !ready || !isMyTurn}>
                    摸牌
                  </Button>
                  <Button type="default" block onClick={doSkip} disabled={busy || !ready || !isMyTurn}>
                    跳过
                  </Button>
                </div>

                {room.pendingDraw.count > 0 ? (
                  <div className={room.pendingDraw.type === "wild_draw_four" ? styles.controlRowShort : styles.controlRowShort}>
                    <Button type="default" block onClick={doAccept} disabled={busy || !ready || !isMyTurn}>
                      接受
                    </Button>
                    {room.pendingDraw.type === "wild_draw_four" ? (
                      <Button type="default" block onClick={doChallenge} disabled={busy || !ready || !isMyTurn}>
                        质疑
                      </Button>
                    ) : (
                      <div />
                    )}
                  </div>
                ) : null}
              </div>

              {room.status === "paused" ? (
                <div className={styles.pauseOverlay}>
                  <div className={styles.pauseContent}>
                    <div className={styles.pauseTitle}>
                      {room.disconnectedPlayerId ? `${playerName(room, room.disconnectedPlayerId)} 已断线` : "已暂停"}
                    </div>
                    <div className={styles.pauseSubtitle}>等待重连... {pauseLeftSec}s</div>
                  </div>
                </div>
              ) : null}
            </section>
        ) : null}

        {room && room.status === "finished" ? (
        <section className={styles.settlementPanel}>
          <div className={styles.phaseHeader}>
            <p className={styles.phaseSubtitle}>第 {room.currentRound} 局已经结束。</p>
          </div>

          <div className={styles.winnerCard}>
            <span className={styles.winnerLabel}>本局胜者</span>
            <span className={styles.winnerName}>
              {room.roundWinnerId ? playerName(room, room.roundWinnerId) : "（未知）"}
            </span>
          </div>

          <div className={styles.settlementList}>
            {room.players.map((p) => {
              const isWinner = room.roundWinnerId === p.id;
              return (
                <div key={p.id} className={`${styles.settlementItem} ${isWinner ? styles.settlementItemWinner : ""}`}>
                  <div className={styles.settlementMain}>
                    <span className={styles.settlementName}>{p.name}</span>
                    {isWinner ? <span className={styles.settlementBadge}>WIN</span> : null}
                  </div>
                  <div className={styles.settlementStats}>
                    <div className={styles.settlementStat}>
                      <span className={styles.settlementStatLabel}>剩余手牌</span>
                      <span className={styles.settlementStatValue}>{room.handCounts[p.id] ?? 0} 张</span>
                    </div>
                    <div className={styles.settlementStat}>
                      <span className={styles.settlementStatLabel}>累计分数</span>
                      <span className={styles.settlementStatValue}>{room.scores[p.id] ?? 0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {isHost ? (
            <div className={styles.settlementActions}>
              <Button type="primary" block onClick={doNextRound} disabled={busy || !ready}>
                开始下一局
              </Button>
              <Button type="default" block onClick={doEnd} disabled={busy || !ready}>
                结束游戏
              </Button>
            </div>
          ) : null}
        </section>
        ) : null}

        {room && room.status === "ended" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Button type="primary" onClick={() => router.push("/")}>
            返回首页
          </Button>
        </div>
        ) : null}

        {(room?.status === "choosing_dealer" || room?.status === "dealing" || showDealerReveal) ? (
          <section className={styles.footerBlock}>
            <Footer type="tree" />
          </section>
        ) : null}
      </main>
    </div>
  );
}
