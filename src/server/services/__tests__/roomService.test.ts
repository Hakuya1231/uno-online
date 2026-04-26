import { describe, expect, it } from "vitest";
import { InMemoryRoomRepo } from "../../repos/inMemoryRoomRepo";
import { RoomService } from "../roomService";

describe("RoomService", () => {
  it("createRoom: initializes a waiting room with the host", async () => {
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

  it("joinRoom: waiting allows joins and initializes handCounts/scores", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });

    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(room?.handCounts.p2).toBe(0);
    expect(room?.scores.p2).toBe(0);
  });

  it("joinRoom: human players are inserted before existing AI players", async () => {
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
          { id: "ai1", name: "桃桃兔兔", isAI: true },
          { id: "ai2", name: "星星团子", isAI: true },
        ],
        handCounts: { ...room.handCounts, ai1: 0, ai2: 0 },
        scores: { ...room.scores, ai1: 0, ai2: 0 },
      });
    });

    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.players.map((p) => p.id)).toEqual(["p1", "p2", "ai1", "ai2"]);
  });

  it("joinRoom: duplicate names are rejected", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "白夜", dealerMode: "host" });

    await expect(svc.joinRoom({ roomId, playerId: "p2", name: "白夜" })).rejects.toThrow(/昵称重复/);
  });

  it("joinRoom: non-waiting rooms reject joins", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await svc.joinRoom({ roomId, playerId: "p2", name: "B" });
    await svc.startRoom({ roomId, playerId: "p1" });
    await expect(svc.joinRoom({ roomId, playerId: "p2", name: "B" })).rejects.toThrow(/不允许加入/);
  });

  it("addAi: host can add an AI in waiting state", async () => {
    const repo = new InMemoryRoomRepo();
    const svc = new RoomService(repo, () => "r1");
    const { roomId } = await svc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });

    await svc.addAi({ roomId, playerId: "p1" });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    const ai = room?.players[1];
    expect(room?.players).toHaveLength(2);
    expect(ai?.isAI).toBe(true);
    expect(ai?.name).toBeTruthy();
    expect(ai?.name.length).toBeLessThanOrEqual(12);
    expect(room?.handCounts[ai!.id]).toBe(0);
    expect(room?.scores[ai!.id]).toBe(0);
  });

  it("removeAi: host can remove a specific AI and clear derived maps", async () => {
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

  it("addAi/removeAi: only the host can manage AI, and humans cannot be removed", async () => {
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

  it("startRoom(draw_compare): waiting -> choosing_dealer and initializes dealerDrawPile", async () => {
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
