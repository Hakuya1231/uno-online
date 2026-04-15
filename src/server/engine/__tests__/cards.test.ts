import { describe, expect, it } from "vitest";
import { createDealerDrawPile, createStandardDeck, flipInitialNumberCard, shuffle } from "../cards";

describe("engine/cards", () => {
  it("createStandardDeck 生成 108 张牌", () => {
    const deck = createStandardDeck();
    expect(deck).toHaveLength(108);
  });

  it("shuffle 在固定 rng 下可复现，且不修改原数组", () => {
    const items = [1, 2, 3, 4, 5];
    const rng = (() => {
      const values = [0.9, 0.1, 0.7, 0.3, 0.2, 0.8];
      let i = 0;
      return () => values[i++ % values.length]!;
    })();

    const a = shuffle(items, rng);
    const rng2 = (() => {
      const values = [0.9, 0.1, 0.7, 0.3, 0.2, 0.8];
      let i = 0;
      return () => values[i++ % values.length]!;
    })();
    const b = shuffle(items, rng2);

    expect(a).toEqual(b);
    expect(a).not.toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it("flipInitialNumberCard：非数字牌回底直到翻出数字牌", () => {
    const drawPile = [
      { type: "skip", color: "red", value: null },
      { type: "wild", color: null, value: null },
      { type: "number", color: "blue", value: 3 },
      { type: "number", color: "red", value: 7 },
    ] as const;

    const { initial, drawPile: next, movedToBottom } = flipInitialNumberCard(drawPile);
    expect(initial).toEqual({ type: "number", color: "blue", value: 3 });
    expect(movedToBottom).toHaveLength(2);
    expect(next).toEqual([
      { type: "number", color: "red", value: 7 },
      { type: "skip", color: "red", value: null },
      { type: "wild", color: null, value: null },
    ]);
  });

  it("createDealerDrawPile：包含 0-9 共 10 张不重复数字牌", () => {
    const pile = createDealerDrawPile(() => 0.42);
    expect(pile).toHaveLength(10);
    const values = pile.map((c) => c.value);
    expect(new Set(values)).toHaveLength(10);
    expect(values.slice().sort((a, b) => a! - b!)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

