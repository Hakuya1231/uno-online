import { describe, expect, it } from "vitest";
import type { Card, PublicRoomDoc } from "@/shared";
import { isPlayable } from "../../engine";
import { InMemoryRoomRepo } from "../../repos/inMemoryRoomRepo";
import { GameService } from "../gameService";
import { RoomService } from "../roomService";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function cardToText(card: Card): string {
  const color =
    card.color === "red"
      ? "红"
      : card.color === "yellow"
        ? "黄"
        : card.color === "green"
          ? "绿"
          : card.color === "blue"
            ? "蓝"
            : "无色";
  const face =
    card.type === "number"
      ? String(card.value ?? "?")
      : card.type === "skip"
        ? "跳过"
        : card.type === "reverse"
          ? "反转"
          : card.type === "draw_two"
            ? "+2"
            : card.type === "wild"
              ? "万能"
              : "+4";
  return `${color}${face}`;
}

function getTopCard(room: PublicRoomDoc): Card | null {
  return room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1]! : null;
}

describe("simulate full flow (in-memory)", () => {
  it("step-by-step loggable flow should run without exceptions", async () => {
    const seed = 42;
    const saved = Math.random;
    Math.random = mulberry32(seed);

    try {
      const repo = new InMemoryRoomRepo();
      const roomSvc = new RoomService(repo, () => "ROOM1");
      const gameSvc = new GameService(repo);

      const hostId = "p1";
      const p2Id = "p2";

      const { roomId } = await roomSvc.createRoom({ hostId, hostName: "玩家A", dealerMode: "host" });
      await roomSvc.joinRoom({ roomId, playerId: p2Id, name: "玩家B" });
      await roomSvc.startRoom({ roomId, playerId: hostId });
      await gameSvc.deal({ roomId, playerId: hostId });

      let room = (await repo.runTransaction((tx) => repo.getRoom(tx, roomId)))!;
      expect(room.status).toBe("playing");

      for (let step = 1; step <= 40; step++) {
        room = (await repo.runTransaction((tx) => repo.getRoom(tx, roomId)))!;
        if (room.status === "finished" || room.status === "ended") break;
        expect(room.status).toBe("playing");

        const current = room.players[room.currentPlayerIndex]!;
        const pid = current.id;
        const top = getTopCard(room)!;
        const hand = await repo.runTransaction((tx) => repo.getHand(tx, roomId, pid));

        if (room.pendingDraw.count > 0) {
          // eslint-disable-next-line no-console
          console.log(`step ${step}: 轮到 ${current.name}，动作：接受惩罚 ${room.pendingDraw.type} x${room.pendingDraw.count}`);
          await gameSvc.acceptDraw({ roomId, playerId: pid });
          continue;
        }

        let playableIndex = -1;
        for (let idx = 0; idx < hand.length; idx++) {
          if (isPlayable(hand[idx]!, top, room.chosenColor)) {
            playableIndex = idx;
            break;
          }
        }

        if (playableIndex >= 0) {
          const card = hand[playableIndex]!;
          const chosenColor =
            card.type === "wild" || card.type === "wild_draw_four" ? ("red" as const) : null;
          // eslint-disable-next-line no-console
          console.log(`step ${step}: 轮到 ${current.name}，动作：出牌 ${cardToText(card)}`);
          await gameSvc.playCard({ roomId, playerId: pid, cardIndex: playableIndex, chosenColor });
          continue;
        }

        // 没牌可出：摸一张，然后若仍不能出则 skip（避免同回合二次摸牌报错）
        // eslint-disable-next-line no-console
        console.log(`step ${step}: 轮到 ${current.name}，动作：摸牌`);
        await gameSvc.drawCard({ roomId, playerId: pid });

        const roomAfterDraw = (await repo.runTransaction((tx) => repo.getRoom(tx, roomId)))!;
        const handAfterDraw = await repo.runTransaction((tx) => repo.getHand(tx, roomId, pid));
        const topAfterDraw = getTopCard(roomAfterDraw)!;
        let playableAfterDraw = -1;
        for (let idx = 0; idx < handAfterDraw.length; idx++) {
          if (isPlayable(handAfterDraw[idx]!, topAfterDraw, roomAfterDraw.chosenColor)) {
            playableAfterDraw = idx;
            break;
          }
        }
        if (playableAfterDraw >= 0) {
          const card = handAfterDraw[playableAfterDraw]!;
          const chosenColor =
            card.type === "wild" || card.type === "wild_draw_four" ? ("red" as const) : null;
          // eslint-disable-next-line no-console
          console.log(`step ${step}: 轮到 ${current.name}，动作：出牌 ${cardToText(card)}`);
          await gameSvc.playCard({ roomId, playerId: pid, cardIndex: playableAfterDraw, chosenColor });
        } else {
          // eslint-disable-next-line no-console
          console.log(`step ${step}: 轮到 ${current.name}，动作：跳过`);
          await gameSvc.skip({ roomId, playerId: pid });
        }
      }
    } finally {
      Math.random = saved;
    }
  });
});

