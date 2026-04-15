import type { Card, CardColor, PendingDrawType } from "@/shared";

/**
 * 获取当前需要匹配的“有效颜色”。
 *
 * - 普通牌：使用弃牌堆顶牌自身颜色
 * - 万能牌（变色 / +4）：使用 chosenColor（必须由出牌者指定）
 */
export function getActiveColor(
  topCard: Card,
  chosenColor: Exclude<CardColor, null> | null,
): Exclude<CardColor, null> {
  if (topCard.type === "wild" || topCard.type === "wild_draw_four") {
    if (!chosenColor) {
      throw new Error("万能牌需要 chosenColor 才能确定有效颜色");
    }
    return chosenColor;
  }
  // 非万能牌的 color 一定不为 null
  return topCard.color as Exclude<CardColor, null>;
}

/**
 * 判断一张牌在当前局面是否可出（不考虑“是否轮到该玩家”等流程条件）。
 *
 * 规则：
 * - 颜色匹配：与有效颜色一致
 * - 数字匹配：两者都是数字牌且 value 相同
 * - 符号匹配：Skip/Reverse/+2 与顶牌同类型可出
 * - 万能牌：始终可出
 */
export function isPlayable(
  card: Card,
  topCard: Card,
  chosenColor: Exclude<CardColor, null> | null,
): boolean {
  if (card.type === "wild" || card.type === "wild_draw_four") return true;

  const activeColor = getActiveColor(topCard, chosenColor);
  if (card.color === activeColor) return true;

  // 数字匹配
  if (card.type === "number" && topCard.type === "number" && card.value === topCard.value) {
    return true;
  }

  // 符号匹配（同类型）
  if (card.type !== "number" && topCard.type === card.type) return true;

  return false;
}

/**
 * 在 pendingDraw 存在时，是否允许用该牌继续“叠加”。
 *
 * 规则（对齐文档）：+2 只能叠 +2；+4 只能叠 +4；两者不能互叠。
 */
export function canStackPenalty(card: Card, pendingType: PendingDrawType): boolean {
  if (pendingType === null) return false;
  if (pendingType === "draw_two") return card.type === "draw_two";
  return card.type === "wild_draw_four";
}

/** 单张牌计分。 */
export function scoreCard(card: Card): number {
  if (card.type === "number") return card.value ?? 0;
  if (card.type === "wild" || card.type === "wild_draw_four") return 50;
  return 20; // skip / reverse / draw_two
}

/** 手牌计分（用于结算赢家得分）。 */
export function scoreHand(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + scoreCard(c), 0);
}

/**
 * 判断 +4 是否可合法打出（用于质疑判定）。
 *
 * 规则：只有当手里没有任何“有效颜色(activeColor)”的牌时，才允许出 +4。
 * 注意：这里仅检查颜色，不考虑数字/符号匹配。
 */
export function canPlayWildDrawFour(hand: readonly Card[], activeColor: Exclude<CardColor, null>): boolean {
  return !hand.some((c) => c.color === activeColor);
}

