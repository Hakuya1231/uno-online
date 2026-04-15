import type { Card, CardColor, LastAction, PendingDrawType, PublicRoomDoc } from "@/shared";
import { createStandardDeck, drawTop, flipInitialNumberCard, shuffle } from "./cards";
import type { EngineAction, ReduceInput } from "./actions";
import { canStackPenalty, isPlayable } from "./rules";
import { recycleDiscardPile } from "./cards";

export type ReduceResult = {
  room: ReduceInput["room"] & Pick<PublicRoomDoc, "status">;
  /**
   * 当前玩家的手牌（与 action.playerId 对应）。
   * - 对于 DEAL，这里返回庄家的手牌（便于上层写回 hands/{dealerId}）。
   */
  hand: Card[];
  /** 私密摸牌堆（服务端可见） */
  drawPile: Card[];
  /** 选庄抽牌堆（服务端私密） */
  dealerDrawPile: Card[] | null;
  /**
   * 发牌结果（仅 DEAL 产生）。
   * 上层应据此写入 rooms/{roomId}/hands/{playerId}.cards
   */
  dealtHands?: Record<string, Card[]>;
  /**
   * 可选：本次动作直接产出的 lastAction（调用方通常会写回 rooms/{roomId}.lastAction）。
   * room 里也会同步更新 lastAction，因此这里主要用于测试与调试。
   */
  lastAction: LastAction;
};

/** reduce 统一收尾：写入 lastAction，并对 roomVersion 做 +1。 */
function finalize(
  prevRoom: ReduceInput["room"],
  nextRoom: ReduceInput["room"],
  lastAction: LastAction,
) {
  nextRoom.lastAction = lastAction;
  nextRoom.roomVersion = prevRoom.roomVersion + 1;
}

function assertIsPlayersTurn(room: ReduceInput["room"], playerId: string) {
  const current = room.players[room.currentPlayerIndex];
  if (!current) throw new Error("当前玩家索引无效");
  if (current.id !== playerId) throw new Error("未轮到该玩家行动");
}

function nextIndex(room: ReduceInput["room"], steps = 1): number {
  const n = room.players.length;
  if (n <= 0) throw new Error("玩家数量无效");
  const raw = room.currentPlayerIndex + room.direction * steps;
  return ((raw % n) + n) % n;
}

function pendingTypeFromCard(card: Card): PendingDrawType {
  if (card.type === "draw_two") return "draw_two";
  if (card.type === "wild_draw_four") return "wild_draw_four";
  return null;
}

function ensureChosenColor(
  card: Card,
  chosenColor: Exclude<CardColor, null> | null | undefined,
): Exclude<CardColor, null> | null {
  if (card.type === "wild" || card.type === "wild_draw_four") {
    if (!chosenColor) throw new Error("万能牌必须指定 chosenColor");
    return chosenColor;
  }
  return null;
}

/**
 * 确保摸牌堆可抽牌：若 drawPile 已空，则用弃牌堆（除顶牌）洗牌回收为新摸牌堆。
 *
 * 约束：
 * - 弃牌堆至少需要 2 张（顶牌 + 可回收部分），否则视为异常状态。
 */
function ensureDrawPileAvailable(
  drawPile: Card[],
  discardPile: readonly Card[],
): { drawPile: Card[]; drawPileCount: number } {
  if (drawPile.length > 0) return { drawPile, drawPileCount: drawPile.length };
  if (discardPile.length <= 1) throw new Error("摸牌堆耗尽且弃牌堆不足，无法回收");
  const { drawPile: recycled } = recycleDiscardPile(discardPile);
  if (recycled.length === 0) throw new Error("回收后摸牌堆仍为空（异常状态）");
  return { drawPile: recycled, drawPileCount: recycled.length };
}

/**
 * 引擎 reduce（最小版）：仅处理 playing 阶段的出牌/摸牌/跳过。
 *
 * 约束：
 * - 不读取其他玩家手牌
 * - 不做 Firestore 写入，只返回更新后的 room/hand/drawPile
 */
export function reduce(input: ReduceInput, action: EngineAction): ReduceResult {
  const now = Date.now();
  const room = input.room;

  // 基于现有 room 复制一份，避免意外修改入参
  const nextRoom: ReduceInput["room"] = {
    ...room,
    handCounts: { ...room.handCounts },
    dealerDrawResults: room.dealerDrawResults ? { ...room.dealerDrawResults } : null,
  };
  let nextHand = input.hand.slice();
  let nextDrawPile = input.drawPile.slice();
  let nextDealerDrawPile = input.dealerDrawPile ? input.dealerDrawPile.slice() : null;

  switch (action.type) {
    case "DRAW_FOR_DEALER": {
      if (room.status !== "choosing_dealer") throw new Error("当前状态不允许选庄摸牌");
      if (!nextDealerDrawPile || nextDealerDrawPile.length === 0) {
        throw new Error("选庄抽牌堆为空，无法摸牌");
      }
      const playerExists = room.players.some((p) => p.id === action.playerId);
      if (!playerExists) throw new Error("玩家不在房间中，无法选庄摸牌");

      const results = nextRoom.dealerDrawResults ?? {};
      if (results[action.playerId]) throw new Error("该玩家已完成选庄摸牌");

      const { card, pile } = drawTop(nextDealerDrawPile);
      nextDealerDrawPile = pile;
      results[action.playerId] = card;
      nextRoom.dealerDrawResults = results;

      const lastAction: LastAction = { type: "dealer_card_drawn", by: action.playerId, card, at: now };

      // 全员摸完后，选出最大值作为庄家（简化版：0-9 不重复，理论无平局）
      if (Object.keys(results).length === room.players.length) {
        let winnerId: string | null = null;
        let max = -1;
        for (const [pid, c] of Object.entries(results)) {
          const v = c.value ?? -1;
          if (v > max) {
            max = v;
            winnerId = pid;
          }
        }
        if (!winnerId) throw new Error("未能选出庄家（异常选庄结果）");
        nextRoom.dealerId = winnerId;
        nextRoom.status = "dealing";
        nextRoom.dealerDrawResults = null;
        nextDealerDrawPile = null;
      }

      finalize(room, nextRoom, lastAction);
      return {
        room: nextRoom as ReduceResult["room"],
        hand: nextHand,
        drawPile: nextDrawPile,
        dealerDrawPile: nextDealerDrawPile,
        lastAction,
      };
    }
    case "DEAL": {
      if (room.status !== "dealing") throw new Error("当前状态不允许发牌");
      if (action.playerId !== room.dealerId) throw new Error("只有庄家可以发牌");

      const deck = shuffle(createStandardDeck());
      const playerIds = room.players.map((p) => p.id);
      const handSize = 7;
      if (deck.length < playerIds.length * handSize) throw new Error("牌堆数量不足，无法发牌");

      // 发牌（按玩家顺序切牌）
      const dealtHands: Record<string, Card[]> = {};
      let pile = deck;
      for (const pid of playerIds) {
        dealtHands[pid] = pile.slice(0, handSize);
        pile = pile.slice(handSize);
      }

      // 翻起始牌（非数字回底直到数字）
      const flipped = flipInitialNumberCard(pile);
      const initialCard = flipped.initial;
      pile = flipped.drawPile;

      nextRoom.discardPile = [initialCard];
      nextRoom.chosenColor = null;
      nextRoom.direction = 1;
      nextRoom.pendingDraw = { count: 0, type: null };
      nextRoom.hasDrawnThisTurn = false;

      // 从庄家下一位开始
      const dealerIndex = room.players.findIndex((p) => p.id === room.dealerId);
      if (dealerIndex < 0) throw new Error("庄家不在玩家列表中（异常状态）");
      nextRoom.currentPlayerIndex = (dealerIndex + 1) % room.players.length;

      // handCounts 与 drawPileCount
      const handCounts: Record<string, number> = {};
      for (const pid of playerIds) handCounts[pid] = dealtHands[pid]!.length;
      nextRoom.handCounts = handCounts;
      nextRoom.drawPileCount = pile.length;

      nextRoom.status = "playing";

      // 对于返回值：hand 返回庄家手牌，方便上层写回
      nextHand = dealtHands[action.playerId] ?? [];
      nextDrawPile = pile;
      nextDealerDrawPile = null;

      const lastAction: LastAction = { type: "dealt", by: action.playerId, initialCard, at: now };
      finalize(room, nextRoom, lastAction);

      return {
        room: nextRoom as ReduceResult["room"],
        hand: nextHand,
        drawPile: nextDrawPile,
        dealerDrawPile: nextDealerDrawPile,
        dealtHands,
        lastAction,
      };
    }
    case "PLAY_CARD": {
      if (room.status !== "playing") throw new Error("当前状态不允许出牌");
      assertIsPlayersTurn(room, action.playerId);

      const card = nextHand[action.cardIndex];
      if (!card) throw new Error("cardIndex 无效");

      // pendingDraw 存在时，只允许叠加同类型惩罚牌
      if (room.pendingDraw.count > 0) {
        const pendingType = room.pendingDraw.type;
        if (!pendingType) throw new Error("pendingDraw.type 不能为空");
        if (!canStackPenalty(card, pendingType)) {
          throw new Error("当前存在惩罚叠加，只允许叠加同类型惩罚牌");
        }
      } else {
        // 常规可出牌判定
        const topCard = room.discardPile[room.discardPile.length - 1]!;
        if (!isPlayable(card, topCard, room.chosenColor)) {
          throw new Error("该牌不符合当前可出牌规则");
        }
      }

      const chosenColor = ensureChosenColor(card, action.chosenColor ?? null);

      // 从手牌移除
      nextHand.splice(action.cardIndex, 1);
      nextRoom.handCounts[action.playerId] = nextHand.length;

      // 放入弃牌堆
      nextRoom.discardPile = [...room.discardPile, card];
      nextRoom.chosenColor = chosenColor;

      // 处理功能牌对轮转/方向/惩罚的影响
      let steps = 1;

      if (card.type === "reverse") {
        nextRoom.direction = (room.direction === 1 ? -1 : 1) as 1 | -1;
      }

      if (card.type === "skip") {
        steps = 2;
      }

      const penaltyType = pendingTypeFromCard(card);
      if (penaltyType === "draw_two") {
        nextRoom.pendingDraw = { count: room.pendingDraw.count + 2, type: "draw_two" };
      } else if (penaltyType === "wild_draw_four") {
        nextRoom.pendingDraw = { count: room.pendingDraw.count + 4, type: "wild_draw_four" };
      }

      nextRoom.currentPlayerIndex = nextIndex(nextRoom, steps);
      nextRoom.hasDrawnThisTurn = false;

      const lastAction: LastAction = {
        type: "card_played",
        by: action.playerId,
        card,
        ...(chosenColor ? { chosenColor } : {}),
        at: now,
      };
      finalize(room, nextRoom, lastAction);

      // 最小版：不在引擎里结算 scores；但可以标记 finished（后续 service 计算分数）
      if (nextHand.length === 0) {
        (nextRoom as unknown as { status: "finished" }).status = "finished";
      }

      return {
        room: nextRoom as ReduceResult["room"],
        hand: nextHand,
        drawPile: nextDrawPile,
        dealerDrawPile: nextDealerDrawPile,
        lastAction,
      };
    }
    case "DRAW_CARD": {
      if (room.status !== "playing") throw new Error("当前状态不允许摸牌");
      assertIsPlayersTurn(room, action.playerId);
      if (room.pendingDraw.count > 0) throw new Error("当前存在惩罚叠加，不能普通摸牌");
      if (room.hasDrawnThisTurn) throw new Error("本回合已摸过牌，不能再次摸牌");

      const ensured = ensureDrawPileAvailable(nextDrawPile, room.discardPile);
      nextDrawPile = ensured.drawPile;
      nextRoom.drawPileCount = ensured.drawPileCount;

      const { card, pile } = drawTop(nextDrawPile);
      nextDrawPile = pile;
      nextHand = [...nextHand, card];
      nextRoom.handCounts[action.playerId] = nextHand.length;
      nextRoom.drawPileCount = nextDrawPile.length;
      nextRoom.hasDrawnThisTurn = true;

      const lastAction: LastAction = { type: "card_drawn", by: action.playerId, at: now };
      finalize(room, nextRoom, lastAction);

      return {
        room: nextRoom as ReduceResult["room"],
        hand: nextHand,
        drawPile: nextDrawPile,
        dealerDrawPile: nextDealerDrawPile,
        lastAction,
      };
    }
    case "SKIP": {
      if (room.status !== "playing") throw new Error("当前状态不允许跳过");
      assertIsPlayersTurn(room, action.playerId);
      if (room.pendingDraw.count > 0) throw new Error("当前存在惩罚叠加，不能跳过");
      if (!room.hasDrawnThisTurn) throw new Error("未摸牌不能跳过（需先摸一张）");

      nextRoom.currentPlayerIndex = nextIndex(room, 1);
      nextRoom.hasDrawnThisTurn = false;

      const lastAction: LastAction = { type: "skipped", by: action.playerId, at: now };
      finalize(room, nextRoom, lastAction);

      return {
        room: nextRoom as ReduceResult["room"],
        hand: nextHand,
        drawPile: nextDrawPile,
        dealerDrawPile: nextDealerDrawPile,
        lastAction,
      };
    }
  }
}

