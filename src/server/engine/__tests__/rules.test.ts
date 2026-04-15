import { describe, expect, it } from "vitest";
import type { Card } from "@/shared";
import { canPlayWildDrawFour, canStackPenalty, getActiveColor, isPlayable, scoreHand } from "../rules";

describe("engine/rules", () => {
  it("getActiveColor: 普通牌使用自身颜色", () => {
    const top: Card = { type: "number", color: "red", value: 7 };
    expect(getActiveColor(top, null)).toBe("red");
  });

  it("getActiveColor: 万能牌必须提供 chosenColor", () => {
    const top: Card = { type: "wild", color: null, value: null };
    expect(() => getActiveColor(top, null)).toThrow(/chosenColor/);
    expect(getActiveColor(top, "green")).toBe("green");
  });

  it("isPlayable: 颜色匹配可出", () => {
    const top: Card = { type: "number", color: "yellow", value: 3 };
    const card: Card = { type: "skip", color: "yellow", value: null };
    expect(isPlayable(card, top, null)).toBe(true);
  });

  it("isPlayable: 数字匹配可出（不同色同数字）", () => {
    const top: Card = { type: "number", color: "blue", value: 5 };
    const card: Card = { type: "number", color: "red", value: 5 };
    expect(isPlayable(card, top, null)).toBe(true);
  });

  it("isPlayable: 符号匹配可出（同类型不同色）", () => {
    const top: Card = { type: "reverse", color: "green", value: null };
    const card: Card = { type: "reverse", color: "red", value: null };
    expect(isPlayable(card, top, null)).toBe(true);
  });

  it("isPlayable: 万能牌始终可出", () => {
    const top: Card = { type: "number", color: "green", value: 9 };
    expect(isPlayable({ type: "wild", color: null, value: null }, top, null)).toBe(true);
    expect(isPlayable({ type: "wild_draw_four", color: null, value: null }, top, null)).toBe(true);
  });

  it("canStackPenalty: +2 只能叠 +2，+4 只能叠 +4", () => {
    const plus2: Card = { type: "draw_two", color: "red", value: null };
    const plus4: Card = { type: "wild_draw_four", color: null, value: null };
    expect(canStackPenalty(plus2, "draw_two")).toBe(true);
    expect(canStackPenalty(plus4, "draw_two")).toBe(false);
    expect(canStackPenalty(plus4, "wild_draw_four")).toBe(true);
    expect(canStackPenalty(plus2, "wild_draw_four")).toBe(false);
  });

  it("scoreHand: 数字/功能/万能牌分值正确", () => {
    const hand: Card[] = [
      { type: "number", color: "red", value: 9 }, // 9
      { type: "skip", color: "blue", value: null }, // 20
      { type: "wild", color: null, value: null }, // 50
    ];
    expect(scoreHand(hand)).toBe(79);
  });

  it("canPlayWildDrawFour: 只检查是否有有效颜色的牌", () => {
    const hand1: Card[] = [
      { type: "number", color: "red", value: 1 },
      { type: "skip", color: "blue", value: null },
    ];
    expect(canPlayWildDrawFour(hand1, "red")).toBe(false);
    expect(canPlayWildDrawFour(hand1, "green")).toBe(true);
  });
});

