import { describe, expect, it } from "vitest";
import { InMemoryRoomRepo } from "../../repos/inMemoryRoomRepo";
import { RoomService } from "../roomService";

describe("RoomService", () => {
  it("createRoom: 初始化 waiting，players=[host]", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");

    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    expect(roomId).toBe("r1");

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.status).toBe("waiting");
    expect(room?.players.map((p) => p.id)).toEqual(["p1"]);
    expect(room?.dealerMode).toBe("host");
  });

  it("startRoom(host): waiting -> dealing", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });

    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    await svc.startRoom({ roomId, playerId: "p1" });
    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.status).toBe("dealing");
    expect(room?.dealerId).toBe("p1");
  });

  it("joinRoom: waiting 状态允许加入，且会初始化 handCounts/scores", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });

    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(room?.handCounts.p2).toBe(0);
    expect(room?.scores.p2).toBe(0);
  });

  it("joinRoom: 真人加入会插入到第一个 AI 之前", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });

    // 直接改房间数据以模拟已有 AI（addAI 还未实现）
    await repo.runTransaction(async (tx) => {
      const room = await repo.getRoom(tx, roomId);
      if (!room) throw new Error("room missing");
      await repo.updateRoom(tx, roomId, {
        ...room,
        players: [
          ...room.players,
          { id: "ai1", name: "[AI] 1", isAI: true },
          { id: "ai2", name: "[AI] 2", isAI: true },
        ],
        handCounts: { ...room.handCounts, ai1: 0, ai2: 0 },
        scores: { ...room.scores, ai1: 0, ai2: 0 },
      });
    });

    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.players.map((p) => p.id)).toEqual(["p1", "p2", "ai1", "ai2"]);
  });

  it("joinRoom: 非 waiting 状态不允许加入", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    await svc.startRoom({ roomId, playerId: "p1" });
    await expect(svc.joinRoom({ roomId, playerId: "p2", name: "B" })).rejects.toThrow(/不允许加入/);
  });

  it("startRoom(draw_compare): waiting -> choosing_dealer，且写入 dealerDrawPile", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({
      hostId: "p1",
      hostName: "A",
      dealerMode: "draw_compare",
    });
    const before = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(before?.dealerId).toBe("");

    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    await svc.startRoom({ roomId, playerId: "p1" });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    const priv = await repo.runTransaction((tx) => repo.getPrivateGameData(tx, roomId));
    expect(room?.status).toBe("choosing_dealer");
    expect(priv?.dealerDrawPile?.length).toBe(10);
  });
});

