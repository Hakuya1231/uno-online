import { describe, expect, it } from "vitest";
import { InMemoryRoomRepo } from "../../repos/inMemoryRoomRepo";
import { RoomService } from "../roomService";

describe("RoomService", () => {
  it("createRoom: 初始化为 waiting，players=[host]", async () => {
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

  it("joinRoom: 已有相同昵称时不允许加入", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "白夜", dealerMode: "host" });

    await expect(svc.joinRoom({ roomId, playerId: "p2", name: "白夜" })).rejects.toThrow(/昵称重复/);
  });

  it("joinRoom: 非 waiting 状态不允许加入", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    await svc.startRoom({ roomId, playerId: "p1" });
    await expect(svc.joinRoom({ roomId, playerId: "p2", name: "B" })).rejects.toThrow(/不允许加入/);
  });

  it("addAi: 房主可在 waiting 阶段添加 AI，并初始化 handCounts/scores", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });

    await svc.addAi({ roomId, playerId: "p1" });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.players).toHaveLength(2);
    expect(room?.players[1]?.isAI).toBe(true);
    expect(room?.players[1]?.name).toBe("[AI] 1");
    expect(room?.handCounts[room!.players[1]!.id]).toBe(0);
    expect(room?.scores[room!.players[1]!.id]).toBe(0);
  });

  it("removeAi: 房主可移除指定 AI，并清理 handCounts/scores", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });

    await svc.addAi({ roomId, playerId: "p1" });
    const before = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    const aiId = before?.players[1]?.id;
    expect(aiId).toBeTruthy();

    await svc.removeAi({ roomId, playerId: "p1", targetPlayerId: aiId! });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.players.map((p) => p.id)).toEqual(["p1"]);
    expect(room?.handCounts[aiId!]).toBeUndefined();
    expect(room?.scores[aiId!]).toBeUndefined();
  });

  it("addAi/removeAi: 非房主不允许操作，且不能移除真人", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    await svc.addAi({ roomId, playerId: "p1" });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    const aiId = room?.players.find((p) => p.isAI)?.id;
    expect(aiId).toBeTruthy();

    await expect(svc.addAi({ roomId, playerId: "p2" })).rejects.toThrow(/只有房主可以添加AI/);
    await expect(svc.removeAi({ roomId, playerId: "p2", targetPlayerId: aiId! })).rejects.toThrow(
      /只有房主可以移除AI/,
    );
    await expect(svc.removeAi({ roomId, playerId: "p1", targetPlayerId: "p2" })).rejects.toThrow(
      /只能移除AI玩家/,
    );
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
