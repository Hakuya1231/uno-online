import { describe, expect, it } from "vitest";
import type { Card, PublicRoomDoc } from "@/shared";
import { createDealerDrawPile } from "../../engine";
import { InMemoryRoomRepo } from "../../repos/inMemoryRoomRepo";
import type { PrivateGameData } from "../../repos/types";
import { GameFlowService } from "../gameFlowService";
import { RoomService } from "../roomService";

async function readRoom(repo: InMemoryRoomRepo, roomId: string) {
  return await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
}

async function writeRoom(repo: InMemoryRoomRepo, roomId: string, room: PublicRoomDoc) {
  await repo.runTransaction((tx) => repo.updateRoom(tx, roomId, room));
}

async function writePrivate(repo: InMemoryRoomRepo, roomId: string, next: PrivateGameData) {
  await repo.runTransaction((tx) => repo.updatePrivateGameData(tx, roomId, next));
}

async function writeHand(repo: InMemoryRoomRepo, roomId: string, playerId: string, cards: Card[]) {
  await repo.runTransaction((tx) => repo.setHand(tx, roomId, playerId, cards));
}

describe("GameFlowService", () => {
  it("startRoom(draw_compare): 会自动让 AI 摸选庄牌", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "ROOM1");
    const flowSvc = new GameFlowService(repo, () => "ROOM1", () => 0);

    const { roomId } = await roomSvc.createRoom({
      hostId: "p1",
      hostName: "玩家A",
      dealerMode: "draw_compare",
    });

    const room = (await readRoom(repo, roomId))!;
    await writeRoom(repo, roomId, {
      ...room,
      players: [...room.players, { id: "ai1", name: "[AI] 1", isAI: true }],
      handCounts: { ...room.handCounts, ai1: 0 },
      scores: { ...room.scores, ai1: 0 },
      roomVersion: room.roomVersion + 1,
    });

    await flowSvc.startRoom({ roomId, playerId: "p1" });

    const nextRoom = (await readRoom(repo, roomId))!;
    expect(nextRoom.status).toBe("choosing_dealer");
    expect(nextRoom.dealerDrawResults?.ai1).toBeTruthy();
    expect(nextRoom.dealerDrawResults?.p1).toBeUndefined();
  });

  it("runAiUntilHuman: AI 庄家会自动发牌", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "ROOM2");
    const flowSvc = new GameFlowService(repo, () => "ROOM2", () => 0);

    const { roomId } = await roomSvc.createRoom({
      hostId: "p1",
      hostName: "玩家A",
      dealerMode: "host",
    });

    const room = (await readRoom(repo, roomId))!;
    await writeRoom(repo, roomId, {
      ...room,
      status: "dealing",
      dealerId: "ai1",
      players: [...room.players, { id: "ai1", name: "[AI] 1", isAI: true }],
      handCounts: { ...room.handCounts, ai1: 0 },
      scores: { ...room.scores, ai1: 0 },
      roomVersion: room.roomVersion + 1,
    });

    await flowSvc.runAiUntilHuman(roomId);

    const nextRoom = (await readRoom(repo, roomId))!;
    expect(nextRoom.status).toBe("playing");
    expect(nextRoom.currentPlayerIndex).toBe(0);
    expect(nextRoom.handCounts.p1).toBe(7);
    expect(nextRoom.handCounts.ai1).toBe(7);
    expect(nextRoom.discardPile).toHaveLength(1);
  });

  it("playCard: 人类动作后会连续执行 AI，直到轮到下一个真人", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "ROOM3");
    const flowSvc = new GameFlowService(repo, () => "ROOM3", () => 0);

    const { roomId } = await roomSvc.createRoom({
      hostId: "p1",
      hostName: "玩家A",
      dealerMode: "host",
    });
    await roomSvc.joinRoom({ roomId, playerId: "p2", name: "玩家B" });

    const room = (await readRoom(repo, roomId))!;
    await writeRoom(repo, roomId, {
      ...room,
      status: "playing",
      dealerId: "p1",
      players: [room.players[0]!, { id: "ai1", name: "[AI] 1", isAI: true }, room.players[1]!],
      discardPile: [{ type: "number", color: "red", value: 5 }],
      chosenColor: null,
      currentPlayerIndex: 0,
      direction: 1,
      pendingDraw: { count: 0, type: null },
      drawPileCount: 2,
      handCounts: { p1: 2, ai1: 2, p2: 1 },
      scores: { p1: 0, ai1: 0, p2: 0 },
      hasDrawnThisTurn: false,
      roomVersion: room.roomVersion + 1,
      lastAction: null,
    });
    await writePrivate(repo, roomId, {
      drawPile: [
        { type: "number", color: "blue", value: 2 },
        { type: "number", color: "green", value: 9 },
      ],
      dealerDrawPile: createDealerDrawPile(),
    });
    await writeHand(repo, roomId, "p1", [
      { type: "number", color: "red", value: 7 },
      { type: "number", color: "green", value: 3 },
    ]);
    await writeHand(repo, roomId, "ai1", [
      { type: "number", color: "yellow", value: 7 },
      { type: "number", color: "blue", value: 1 },
    ]);
    await writeHand(repo, roomId, "p2", [{ type: "number", color: "blue", value: 9 }]);

    await flowSvc.playCard({ roomId, playerId: "p1", cardIndex: 0 });

    const nextRoom = (await readRoom(repo, roomId))!;
    expect(nextRoom.status).toBe("playing");
    expect(nextRoom.currentPlayerIndex).toBe(2);
    expect(nextRoom.handCounts.ai1).toBe(1);
    expect(nextRoom.lastAction).toMatchObject({ type: "card_played", by: "ai1" });
    expect(nextRoom.discardPile.at(-1)).toMatchObject({ color: "yellow", value: 7 });
  });
});
