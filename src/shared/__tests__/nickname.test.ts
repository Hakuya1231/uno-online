import { describe, expect, it } from "vitest";
import { randomChuunibyouNickname, randomCuteNickname, randomNickname } from "../nickname";

describe("nickname generator", () => {
  it("randomCuteNickname: respects maxLen", () => {
    const name = randomCuteNickname({ maxLen: 8 });
    expect(name.length).toBeLessThanOrEqual(8);
  });

  it("randomChuunibyouNickname: still available for compatibility", () => {
    const name = randomChuunibyouNickname({ maxLen: 12 });
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(12);
  });

  it("randomNickname: default style generates a non-empty name", () => {
    const name = randomNickname();
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(12);
  });
});
