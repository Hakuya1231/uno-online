import { describe, expect, it, vi } from "vitest";
import type { Card } from "@/shared";
import type { ReduceInput } from "../actions";
import { reduce } from "../reduce";

type BaseInputOverrides = {
  room?: Partial<ReduceInput["room"]>;
  hand?: ReduceInput["hand"];
  drawPile?: ReduceInput["drawPile"];
  dealerDrawPile?: ReduceInput["dealerDrawPile"];
};

function baseInput(overrides?: BaseInputOverrides): ReduceInput {
  const room: ReduceInput["room"] = {
    roomId: "r1",
    status: "playing",
    hostId: "p1",
    dealerMode: "host",
    players: [
      { id: "p1", name: "A", isAI: false },
      { id: "p2", name: "B", isAI: false },
    ],
    dealerId: "p1",
    dealerDrawResults: null,
    scores: { p1: 0, p2: 0 },
    currentRound: 1,
    roundWinnerId: null,
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

  it("PLAY_CARD: 2 人局打出 Reverse 等价于 Skip（跳过对手）", () => {
    vi.spyOn(Date, "now").mockReturnValue(12000);
    const input = baseInput({
      room: {
        status: "playing",
        players: [
          { id: "p1", name: "A", isAI: false },
          { id: "p2", name: "B", isAI: false },
        ],
        currentPlayerIndex: 0,
        direction: 1,
        discardPile: [{ type: "number", color: "green", value: 1 }],
        chosenColor: null,
        pendingDraw: { count: 0, type: null },
      },
      hand: [{ type: "reverse", color: "green", value: null }],
      drawPile: [{ type: "number", color: "red", value: 1 }],
    });

    const out = reduce(input, { type: "PLAY_CARD", playerId: "p1", cardIndex: 0 });
    // 翻转方向，但由于 steps=2，依然轮到 p1
    expect(out.room.direction).toBe(-1);
    expect(out.room.currentPlayerIndex).toBe(0);
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
    expect(out2.room.dealerDrawResults).toEqual({
      p1: { type: "number", color: null, value: 2 },
      p2: { type: "number", color: null, value: 9 },
    });
    expect(out2.dealerDrawPile).toBeNull();
  });

  it("DEAL: 发牌后进入 playing，所有玩家 7 张，起始牌为数字牌", () => {
    vi.spyOn(Date, "now").mockReturnValue(5000);
    const input = baseInput({
      room: {
        status: "dealing",
        dealerId: "p1",
        dealerDrawResults: {
          p1: { type: "number", color: null, value: 2 },
          p2: { type: "number", color: null, value: 9 },
        },
        discardPile: [], // 发牌时会重置
        drawPileCount: 0,
        handCounts: { p1: 0, p2: 0 },
      },
      // 方案A：摸牌堆由上层初始化并传入（已洗牌）
      // - 前 14 张会被切给两位玩家
      // - 接下来先是功能牌，再是数字牌，用于验证 flipInitialNumberCard 会“非数字回底直到数字”
      drawPile: [
        // p1 手牌 7 张
        { type: "number", color: "red", value: 0 },
        { type: "number", color: "red", value: 1 },
        { type: "number", color: "red", value: 2 },
        { type: "number", color: "red", value: 3 },
        { type: "number", color: "red", value: 4 },
        { type: "number", color: "red", value: 5 },
        { type: "number", color: "red", value: 6 },
        // p2 手牌 7 张
        { type: "number", color: "blue", value: 0 },
        { type: "number", color: "blue", value: 1 },
        { type: "number", color: "blue", value: 2 },
        { type: "number", color: "blue", value: 3 },
        { type: "number", color: "blue", value: 4 },
        { type: "number", color: "blue", value: 5 },
        { type: "number", color: "blue", value: 6 },
        // 起始牌阶段：先功能牌，再数字牌
        { type: "skip", color: "yellow", value: null },
        { type: "number", color: "green", value: 9 },
        // 余牌
        { type: "reverse", color: "green", value: null },
      ],
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
    expect(out.room.discardPile[0]!.value).toBe(9);
    expect(out.room.drawPileCount).toBe(out.drawPile.length);
    expect(out.room.dealerDrawResults).toBeNull();
    expect(out.lastAction.type).toBe("dealt");
  });

  it("START_GAME(host): waiting -> dealing，庄家=hostId", () => {
    vi.spyOn(Date, "now").mockReturnValue(6000);
    const input = baseInput({
      room: {
        status: "waiting",
        dealerMode: "host",
        hostId: "p1",
        dealerId: "",
        discardPile: [],
        drawPileCount: 0,
        handCounts: { p1: 0, p2: 0 },
      },
    });

    const out = reduce(input, { type: "START_GAME", playerId: "p1" });
    expect(out.room.status).toBe("dealing");
    expect(out.room.dealerId).toBe("p1");
    expect(out.lastAction.type).toBe("game_started");
  });

  it("START_GAME(draw_compare): waiting -> choosing_dealer（要求已初始化 dealerDrawPile）", () => {
    const input = baseInput({
      room: {
        status: "waiting",
        dealerMode: "draw_compare",
        hostId: "p1",
        dealerId: "p1",
      },
      dealerDrawPile: [{ type: "number", color: null, value: 1 }],
    });

    const out = reduce(input, { type: "START_GAME", playerId: "p1" });
    expect(out.room.status).toBe("choosing_dealer");
    expect(out.dealerDrawPile).toHaveLength(1);
  });

  it("NEXT_ROUND: finished -> dealing，currentRound+1，winner 成为庄家", () => {
    vi.spyOn(Date, "now").mockReturnValue(7000);
    const input = baseInput({
      room: {
        status: "finished",
        hostId: "p1",
        currentRound: 3,
        dealerId: "p1",
        roundWinnerId: "p2",
        discardPile: [{ type: "number", color: "red", value: 7 }],
        drawPileCount: 20,
        handCounts: { p1: 1, p2: 0 },
      },
      drawPile: [{ type: "number", color: "blue", value: 1 }],
    });

    const out = reduce(input, { type: "NEXT_ROUND", playerId: "p1" });
    expect(out.room.status).toBe("dealing");
    expect(out.room.dealerId).toBe("p2");
    expect(out.room.currentRound).toBe(4);
    expect(out.room.roundWinnerId).toBeNull();
    expect(out.room.discardPile).toEqual([]);
    expect(out.room.drawPileCount).toBe(0);
    expect(out.room.handCounts).toEqual({ p1: 0, p2: 0 });
    expect(out.lastAction.type).toBe("next_round_started");
  });

  it("END_GAME: 任意非 ended 状态 -> ended（仅房主）", () => {
    vi.spyOn(Date, "now").mockReturnValue(8000);
    const input = baseInput({ room: { status: "playing", hostId: "p1" } });
    const out = reduce(input, { type: "END_GAME", playerId: "p1" });
    expect(out.room.status).toBe("ended");
    expect(out.lastAction.type).toBe("game_ended");
  });

  it("ACCEPT_DRAW: +2 时当前玩家摸牌并清空 pendingDraw，轮到下一位", () => {
    vi.spyOn(Date, "now").mockReturnValue(9000);
    const input = baseInput({
      room: {
        currentPlayerIndex: 0,
        pendingDraw: { count: 2, type: "draw_two" },
        hasDrawnThisTurn: true,
      },
      hand: [{ type: "number", color: "red", value: 1 }],
      drawPile: [
        { type: "number", color: "green", value: 1 },
        { type: "number", color: "green", value: 2 },
      ],
    });

    const out = reduce(input, { type: "ACCEPT_DRAW", playerId: "p1" });
    expect(out.hand).toHaveLength(3);
    expect(out.room.pendingDraw).toEqual({ count: 0, type: null });
    expect(out.room.hasDrawnThisTurn).toBe(false);
    expect(out.room.currentPlayerIndex).toBe(1);
    expect(out.lastAction.type).toBe("accepted_draw");
  });

  it("CHALLENGE_WILD_DRAW_FOUR: +4 合法则质疑失败，质疑者摸 6 张并轮转", () => {
    vi.spyOn(Date, "now").mockReturnValue(10000);
    const input = baseInput({
      room: {
        currentPlayerIndex: 0, // p1 质疑者
        discardPile: [
          { type: "number", color: "red", value: 7 },
          { type: "wild_draw_four", color: null, value: null },
        ],
        chosenColor: "blue",
        pendingDraw: { count: 4, type: "wild_draw_four", sourceColor: "red" },
        handCounts: { p1: 1, p2: 1 },
      },
      hand: [{ type: "number", color: "yellow", value: 1 }], // p1
      drawPile: Array.from({ length: 6 }).map((_, i) => ({ type: "number", color: "green", value: i })),
    });

    const out = reduce(input, {
      type: "CHALLENGE_WILD_DRAW_FOUR",
      playerId: "p1",
      // p2 手里没有 red => 合法
      targetHand: [{ type: "number", color: "blue", value: 9 }],
    });
    expect(out.lastAction.type).toBe("challenge_result");
    expect(out.lastAction).toMatchObject({ result: "fail", targetId: "p2" });
    expect(out.hand).toHaveLength(7); // 1 + 6
    expect(out.room.pendingDraw).toEqual({ count: 0, type: null });
    expect(out.room.currentPlayerIndex).toBe(1);
  });

  it("CHALLENGE_WILD_DRAW_FOUR: +4 不合法则质疑成功，被质疑者摸 4 张并返回 handsPatch", () => {
    vi.spyOn(Date, "now").mockReturnValue(11000);
    const input = baseInput({
      room: {
        currentPlayerIndex: 0, // p1 质疑者
        discardPile: [
          { type: "number", color: "red", value: 7 },
          { type: "wild_draw_four", color: null, value: null },
        ],
        chosenColor: "blue",
        pendingDraw: { count: 4, type: "wild_draw_four", sourceColor: "red" },
        handCounts: { p1: 1, p2: 1 },
      },
      hand: [{ type: "number", color: "yellow", value: 1 }], // p1
      drawPile: Array.from({ length: 4 }).map((_, i) => ({ type: "number", color: "green", value: i })),
    });

    const out = reduce(input, {
      type: "CHALLENGE_WILD_DRAW_FOUR",
      playerId: "p1",
      // p2 手里有 red => 不合法
      targetHand: [{ type: "number", color: "red", value: 9 }],
    });
    expect(out.lastAction.type).toBe("challenge_result");
    expect(out.lastAction).toMatchObject({ result: "success", targetId: "p2" });
    expect(out.handsPatch?.p2).toHaveLength(5); // 1 + 4
    expect(out.room.handCounts.p2).toBe(5);
    expect(out.room.pendingDraw).toEqual({ count: 0, type: null });
  });
});
