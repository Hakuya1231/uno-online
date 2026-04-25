import type { Card, CardColor, CardType, DealerMode, PendingDraw, PublicRoomDoc, RoomStatus } from "@/shared";

export const ROOM_STATUS_ZH: Record<RoomStatus, string> = {
  waiting: "等待中",
  choosing_dealer: "选庄中",
  dealing: "等待发牌",
  playing: "对战中",
  paused: "暂停中",
  finished: "结算中",
  ended: "已结束",
};

export const DEALER_MODE_ZH: Record<DealerMode, string> = {
  host: "房主当庄",
  draw_compare: "摸牌比大小",
};

export function directionZh(dir: PublicRoomDoc["direction"]) {
  return dir === 1 ? "顺时针" : "逆时针";
}

export function colorZh(c: CardColor | Exclude<CardColor, null> | null) {
  if (c === "red") return "红";
  if (c === "yellow") return "黄";
  if (c === "green") return "绿";
  if (c === "blue") return "蓝";
  return "无";
}

export function cardTypeZh(t: CardType) {
  switch (t) {
    case "number":
      return "数字";
    case "skip":
      return "跳过";
    case "reverse":
      return "反转";
    case "draw_two":
      return "+2";
    case "wild":
      return "万能";
    case "wild_draw_four":
      return "+4";
  }
}

export function cardZh(card: Card): string {
  if (card.type === "number") return `${colorZh(card.color)}${card.value ?? "?"}`;
  if (card.type === "wild") return "万能";
  if (card.type === "wild_draw_four") return "+4";
  // 其余功能牌：带颜色
  return `${colorZh(card.color)}${cardTypeZh(card.type)}`;
}

export function pendingDrawZh(p: PendingDraw): string {
  if (p.count <= 0 || p.type === null) return "无";
  const t = p.type === "draw_two" ? "+2" : "+4";
  return `${t} ×${p.count}`;
}

