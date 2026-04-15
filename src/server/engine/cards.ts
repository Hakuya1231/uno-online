import type { Card, CardColor } from "@/shared";

/** 随机数生成器：返回 [0, 1) 的浮点数。 */
export type Rng = () => number;

/** 生成标准 UNO 108 张牌组（不洗牌）。 */
export function createStandardDeck(): Card[] {
  const colors: Exclude<CardColor, null>[] = ["red", "yellow", "green", "blue"];
  const deck: Card[] = [];

  for (const color of colors) {
    // 每色 1 张 0
    deck.push({ type: "number", color, value: 0 });

    // 每色 1-9 各 2 张
    for (let v = 1; v <= 9; v++) {
      deck.push({ type: "number", color, value: v });
      deck.push({ type: "number", color, value: v });
    }

    // 每色功能牌各 2 张：跳过 / 反转 / +2
    for (let i = 0; i < 2; i++) {
      deck.push({ type: "skip", color, value: null });
      deck.push({ type: "reverse", color, value: null });
      deck.push({ type: "draw_two", color, value: null });
    }
  }

  // 万能牌各 4 张：变色 / +4
  for (let i = 0; i < 4; i++) {
    deck.push({ type: "wild", color: null, value: null });
    deck.push({ type: "wild_draw_four", color: null, value: null });
  }

  return deck;
}

/**
 * Fisher–Yates 洗牌。
 *
 * - 如果传入的 rng 可复现，则洗牌结果可复现（便于测试）。
 * - 返回新数组，不修改原数组。
 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** 从牌堆顶抽 1 张（不修改输入数组）。 */
export function drawTop<T>(pile: readonly T[]): { card: T; pile: T[] } {
  if (pile.length === 0) {
    throw new Error("牌堆为空，无法抽牌");
  }
  const [card, ...rest] = pile;
  // card 一定存在（已检查 length）
  return { card: card as T, pile: rest };
}

/** 从牌堆顶抽 n 张（不修改输入数组）。 */
export function drawMany<T>(
  pile: readonly T[],
  n: number,
): { cards: T[]; pile: T[] } {
  if (n < 0) throw new Error("抽牌数量不能为负数");
  if (n === 0) return { cards: [], pile: pile.slice() };
  if (pile.length < n) throw new Error("牌堆数量不足，无法抽取指定张数");
  return { cards: pile.slice(0, n) as T[], pile: pile.slice(n) };
}

/** 将牌放到牌堆底部（不修改输入数组）。 */
export function placeBottom<T>(pile: readonly T[], card: T): T[] {
  return [...pile, card];
}

/** 查看牌堆顶牌（不修改输入数组）。 */
export function peekTop<T>(pile: readonly T[]): T | null {
  return pile.length > 0 ? (pile[0] as T) : null;
}

/**
 * 从摸牌堆翻起始牌：如果不是数字牌，则放回牌堆底部继续翻，直到翻出数字牌。
 *
 * 返回：
 * - initial：翻出的数字牌（作为弃牌堆第一张）
 * - drawPile：更新后的摸牌堆
 * - movedToBottom：过程中被移到底部的非数字牌（便于测试/调试，可不用）
 */
export function flipInitialNumberCard(drawPile: readonly Card[]): {
  initial: Card;
  drawPile: Card[];
  movedToBottom: Card[];
} {
  if (drawPile.length === 0) throw new Error("摸牌堆为空，无法翻起始牌");

  let pile = drawPile.slice();
  const movedToBottom: Card[] = [];

  // 理论上总会翻到数字牌（牌组里数字牌占多数），这里加上上限避免意外死循环
  for (let i = 0; i < drawPile.length; i++) {
    const top = pile[0]!;
    pile = pile.slice(1);
    if (top.type === "number") {
      return { initial: top, drawPile: pile, movedToBottom };
    }
    movedToBottom.push(top);
    pile = [...pile, top];
  }

  throw new Error("未能翻到数字起始牌（异常牌堆或规则不匹配）");
}

/**
 * 当摸牌堆耗尽时，用弃牌堆（除顶牌）洗牌后作为新的摸牌堆。
 *
 * - discardTop：弃牌堆顶牌必须保留在桌面
 * - 返回的新摸牌堆从“洗好的那叠”的顶端开始抽
 */
export function recycleDiscardPile(
  discardPile: readonly Card[],
  rng: Rng = Math.random,
): { discardTop: Card; drawPile: Card[] } {
  if (discardPile.length === 0) throw new Error("弃牌堆为空，无法回收");
  const discardTop = discardPile[discardPile.length - 1]!;
  const rest = discardPile.slice(0, -1);
  const drawPile = shuffle(rest, rng);
  return { discardTop, drawPile };
}

/**
 * 生成选庄用抽牌堆（简化版）：10 张不重复数字牌（0-9）。
 *
 * 用于 dealerMode=draw_compare，确保每位玩家抽到的数字不重复，从而不需要平局重摸逻辑。
 */
export function createDealerDrawPile(rng: Rng = Math.random): Card[] {
  const base: Card[] = [];
  for (let v = 0; v <= 9; v++) {
    base.push({ type: "number", color: null, value: v });
  }
  return shuffle(base, rng);
}

