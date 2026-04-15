import { describe, expect, it, vi } from "vitest";
import type { Card } from "@/shared";
import type { ReduceInput } from "../actions";
import { reduce } from "../reduce";

function baseInput(overrides?: Partial<ReduceInput>): ReduceInput {
  const room: ReduceInput["room"] = {
    roomId: "r1",
    status: "playing",
    players: [
      { id: "p1", name: "A", isAI: false },
      { id: "p2", name: "B", isAI: false },
    ],
    dealerId: "p1",
    dealerDrawResults: null,
    currentPlayerIndex: 0,
    direction: 1,
    discardPile: [{ type: "number", color: "red", value: 7 }],
    chosenColor: null,
    pendingDraw: { count: 0, type: null },
    hasDrawnThisTurn: false,
    drawPileCount: 10,
    handCounts: { p1: 2, p2: 2 },
    roomVersion: 1,
    lastAction: null,
  };

  return {
    room: { ...room, ...(overrides?.room ?? {}) },
    hand: overrides?.hand ?? [
      { type: "number", color: "red", value: 3 },
      { type: "number", color: "blue", value: 7 }, // 数字匹配
    ],
    drawPile: overrides?.drawPile ?? [
      { type: "number", color: "green", value: 1 },
      { type: "skip", color: "yellow", value: null },
    ],
    dealerDrawPile: overrides?.dealerDrawPile ?? null,
  };
}

describe("engine/reduce (minimal)", () => {
  it("PLAY_CARD: 合法出牌会更新弃牌堆/手牌/轮转", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const input = baseInput();

    const out = reduce(input, { type: "PLAY_CARD", playerId: "p1", cardIndex: 1 });

    expect(out.hand).toHaveLength(1);
    expect(out.room.discardPile).toHaveLength(2);
    expect(out.room.currentPlayerIndex).toBe(1);
    expect(out.room.hasDrawnThisTurn).toBe(false);
    expect(out.room.roomVersion).toBe(2);
    expect(out.lastAction.type).toBe("card_played");
  });

  it("DRAW_CARD: 摸牌后 hasDrawnThisTurn=true，且手牌+1", () => {
    vi.spyOn(Date, "now").mockReturnValue(2000);
    const input = baseInput({ hand: [{ type: "number", color: "blue", value: 9 }] });

    const out = reduce(input, { type: "DRAW_CARD", playerId: "p1" });

    expect(out.hand).toHaveLength(2);
    expect(out.room.hasDrawnThisTurn).toBe(true);
    expect(out.room.handCounts.p1).toBe(2);
    expect(out.room.drawPileCount).toBe(1);
    expect(out.lastAction.type).toBe("card_drawn");
  });

  it("DRAW_CARD: 摸牌堆耗尽时会自动回收弃牌堆（保留顶牌）", () => {
    const input = baseInput({
      room: {
        discardPile: [
          { type: "number", color: "red", value: 7 },
          { type: "skip", color: "red", value: null },
          { type: "number", color: "blue", value: 2 }, // 顶牌（保留）
        ],
        drawPileCount: 0,
      },
      drawPile: [],
      hand: [{ type: "number", color: "green", value: 9 }],
    });

    const out = reduce(input, { type: "DRAW_CARD", playerId: "p1" });
    expect(out.hand).toHaveLength(2);
    // 回收 2 张后抽 1 张，剩 1 张
    expect(out.room.drawPileCount).toBe(1);
  });

  it("DRAW_CARD: 摸牌堆耗尽且弃牌堆只有 1 张时直接报错", () => {
    const input = baseInput({
      room: { discardPile: [{ type: "number", color: "red", value: 7 }], drawPileCount: 0 },
      drawPile: [],
    });
    expect(() => reduce(input, { type: "DRAW_CARD", playerId: "p1" })).toThrow(/弃牌堆不足/);
  });

  it("SKIP: 必须先摸牌才能跳过", () => {
    const input = baseInput();
    expect(() => reduce(input, { type: "SKIP", playerId: "p1" })).toThrow(/未摸牌不能跳过/);
  });

  it("SKIP: 已摸牌后跳过会切换到下一位并重置 hasDrawnThisTurn", () => {
    vi.spyOn(Date, "now").mockReturnValue(3000);
    const input = baseInput({ room: { hasDrawnThisTurn: true } });

    const out = reduce(input, { type: "SKIP", playerId: "p1" });

    expect(out.room.currentPlayerIndex).toBe(1);
    expect(out.room.hasDrawnThisTurn).toBe(false);
    expect(out.lastAction.type).toBe("skipped");
  });

  it("PLAY_CARD: 打出万能牌必须提供 chosenColor", () => {
    const input = baseInput({
      hand: [{ type: "wild", color: null, value: null } satisfies Card],
    });

    expect(() =>
      reduce(input, { type: "PLAY_CARD", playerId: "p1", cardIndex: 0 }),
    ).toThrow(/chosenColor/);
  });

  it("DRAW_FOR_DEALER: 全员摸完后选出最大点数为庄家并进入 dealing", () => {
    vi.spyOn(Date, "now").mockReturnValue(4000);
    const input = baseInput({
      room: {
        status: "choosing_dealer",
        dealerId: "p1",
        dealerDrawResults: null,
      },
      dealerDrawPile: [
        { type: "number", color: null, value: 2 },
        { type: "number", color: null, value: 9 },
      ],
    });

    const out1 = reduce(input, { type: "DRAW_FOR_DEALER", playerId: "p1" });
    expect(out1.room.status).toBe("choosing_dealer");
    expect(out1.room.dealerDrawResults?.p1?.value).toBe(2);
    expect(out1.dealerDrawPile).toHaveLength(1);
    expect(out1.lastAction.type).toBe("dealer_card_drawn");

    const input2: ReduceInput = { ...input, room: out1.room, dealerDrawPile: out1.dealerDrawPile };
    const out2 = reduce(input2, { type: "DRAW_FOR_DEALER", playerId: "p2" });
    expect(out2.room.status).toBe("dealing");
    expect(out2.room.dealerId).toBe("p2"); // 9 最大
    expect(out2.room.dealerDrawResults).toBeNull();
    expect(out2.dealerDrawPile).toBeNull();
  });

  it("DEAL: 发牌后进入 playing，所有玩家 7 张，起始牌为数字牌", () => {
    vi.spyOn(Date, "now").mockReturnValue(5000);
    const input = baseInput({
      room: {
        status: "dealing",
        dealerId: "p1",
        discardPile: [], // 发牌时会重置
        drawPileCount: 0,
        handCounts: { p1: 0, p2: 0 },
      },
      drawPile: [],
    });

    const out = reduce(input, { type: "DEAL", playerId: "p1" });
    expect(out.room.status).toBe("playing");
    expect(out.dealtHands).toBeTruthy();
    expect(Object.keys(out.dealtHands!)).toEqual(["p1", "p2"]);
    expect(out.dealtHands!.p1).toHaveLength(7);
    expect(out.dealtHands!.p2).toHaveLength(7);
    expect(out.room.handCounts.p1).toBe(7);
    expect(out.room.handCounts.p2).toBe(7);
    expect(out.room.discardPile).toHaveLength(1);
    expect(out.room.discardPile[0]!.type).toBe("number");
    expect(out.room.drawPileCount).toBe(out.drawPile.length);
    expect(out.lastAction.type).toBe("dealt");
  });
});

