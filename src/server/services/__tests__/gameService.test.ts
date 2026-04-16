import { describe, expect, it } from "vitest";
import { InMemoryRoomRepo } from "../../repos/inMemoryRoomRepo";
import { GameService } from "../gameService";
import { RoomService } from "../roomService";

describe("GameService (in-memory)", () => {
  it("deal: 能发牌并写入 hands/private.drawPile，room 进入 playing", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "r1");
    const gameSvc = new GameService(repo);

    const { roomId } = await roomSvc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await roomSvc.joinRoom({ roomId, playerId: "p2", name: "B" });
    await roomSvc.startRoom({ roomId, playerId: "p1" });

    await gameSvc.deal({ roomId, playerId: "p1" });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    const priv = await repo.runTransaction((tx) => repo.getPrivateGameData(tx, roomId));
    const h1 = await repo.runTransaction((tx) => repo.getHand(tx, roomId, "p1"));
    const h2 = await repo.runTransaction((tx) => repo.getHand(tx, roomId, "p2"));

    expect(room?.status).toBe("playing");
    expect(h1).toHaveLength(7);
    expect(h2).toHaveLength(7);
    expect(room?.handCounts.p1).toBe(7);
    expect(room?.handCounts.p2).toBe(7);
    expect(room?.discardPile.length).toBe(1);
    expect(priv?.drawPile.length).toBe(room?.drawPileCount);
  });

  it("playCard: 玩家出完牌后会结算分数（加到赢家 scores）", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "r1");
    const gameSvc = new GameService(repo);

    const { roomId } = await roomSvc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await roomSvc.joinRoom({ roomId, playerId: "p2", name: "B" });

    // 直接写入一个“对战中”的房间状态，避免依赖发牌随机性
    await repo.runTransaction(async (tx) => {
      const room = await repo.getRoom(tx, roomId);
      const priv = await repo.getPrivateGameData(tx, roomId);
      if (!room || !priv) throw new Error("missing");

      await repo.updateRoom(tx, roomId, {
        ...room,
        status: "playing",
        dealerId: "p1",
        currentPlayerIndex: 0,
        direction: 1,
        discardPile: [{ type: "number", color: "red", value: 5 }],
        chosenColor: null,
        pendingDraw: { count: 0, type: null },
        hasDrawnThisTurn: false,
        handCounts: { p1: 1, p2: 2 },
        scores: { p1: 0, p2: 0 },
      });
      await repo.updatePrivateGameData(tx, roomId, { ...priv, drawPile: [] });
      await repo.setHands(tx, roomId, {
        p1: [{ type: "number", color: "red", value: 7 }], // 出完即胜
        p2: [
          { type: "skip", color: "blue", value: null }, // 20
          { type: "number", color: "green", value: 9 }, // 9
        ],
      });
    });

    await gameSvc.playCard({ roomId, playerId: "p1", cardIndex: 0 });

    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.status).toBe("finished");
    expect(room?.scores.p1).toBe(29);
  });

  it("challengeWildDrawFour: service 会自行读取 targetHand 并完成质疑流程", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "r1");
    const gameSvc = new GameService(repo);

    const { roomId } = await roomSvc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await roomSvc.joinRoom({ roomId, playerId: "p2", name: "B" });

    // 构造：p2 刚打出 +4，轮到 p1 质疑（currentPlayerIndex=0）
    await repo.runTransaction(async (tx) => {
      const room = await repo.getRoom(tx, roomId);
      const priv = await repo.getPrivateGameData(tx, roomId);
      if (!room || !priv) throw new Error("missing");

      await repo.updateRoom(tx, roomId, {
        ...room,
        status: "playing",
        currentPlayerIndex: 0,
        direction: 1,
        discardPile: [
          { type: "number", color: "red", value: 7 },
          { type: "wild_draw_four", color: null, value: null },
        ],
        chosenColor: "blue",
        pendingDraw: { count: 4, type: "wild_draw_four", sourceColor: "red" },
        handCounts: { p1: 1, p2: 1 },
      });
      await repo.updatePrivateGameData(tx, roomId, {
        ...priv,
        drawPile: Array.from({ length: 6 }).map((_, i) => ({ type: "number", color: "green", value: i })),
      });
      // 被质疑者 p2 手里没有 red => +4 合法 => 质疑失败，p1 摸 6 张
      await repo.setHands(tx, roomId, {
        p1: [{ type: "number", color: "yellow", value: 1 }],
        p2: [{ type: "number", color: "blue", value: 9 }],
      });
    });

    const res = await gameSvc.challengeWildDrawFour({ roomId, playerId: "p1" });
    expect(res).toEqual({ result: "fail", targetId: "p2" });
    const p1Hand = await repo.runTransaction((tx) => repo.getHand(tx, roomId, "p1"));
    expect(p1Hand).toHaveLength(7);
  });

  it("nextRound: finished -> dealing，currentRound+1，清空所有玩家手牌", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "r1");
    const gameSvc = new GameService(repo);

    const { roomId } = await roomSvc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await roomSvc.joinRoom({ roomId, playerId: "p2", name: "B" });

    await repo.runTransaction(async (tx) => {
      const room = await repo.getRoom(tx, roomId);
      const priv = await repo.getPrivateGameData(tx, roomId);
      if (!room || !priv) throw new Error("missing");

      await repo.updateRoom(tx, roomId, {
        ...room,
        status: "finished",
        currentRound: 1,
        hostId: "p1",
        dealerId: "p1",
        roundWinnerId: "p2",
        handCounts: { p1: 0, p2: 3 },
      });
      await repo.setHands(tx, roomId, {
        p1: [],
        p2: [
          { type: "number", color: "red", value: 1 },
          { type: "number", color: "red", value: 2 },
          { type: "number", color: "red", value: 3 },
        ],
      });
    });

    // 引擎依赖 roundWinnerId 来确定下一局庄家
    await repo.runTransaction(async (tx) => {
      const room = await repo.getRoom(tx, roomId);
      if (!room) throw new Error("missing");
      await repo.updateRoom(tx, roomId, { ...room, roundWinnerId: "p2" });
    });

    await gameSvc.nextRound({ roomId, playerId: "p1" });
    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    const h1 = await repo.runTransaction((tx) => repo.getHand(tx, roomId, "p1"));
    const h2 = await repo.runTransaction((tx) => repo.getHand(tx, roomId, "p2"));
    expect(room?.status).toBe("dealing");
    expect(room?.dealerId).toBe("p2");
    expect(room?.currentRound).toBe(2);
    expect(h1).toEqual([]);
    expect(h2).toEqual([]);
  });

  it("endGame: 房主可结束并置 status=ended", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "r1");
    const gameSvc = new GameService(repo);

    const { roomId } = await roomSvc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await roomSvc.joinRoom({ roomId, playerId: "p2", name: "B" });

    await repo.runTransaction(async (tx) => {
      const room = await repo.getRoom(tx, roomId);
      const priv = await repo.getPrivateGameData(tx, roomId);
      if (!room || !priv) throw new Error("missing");
      await repo.updateRoom(tx, roomId, { ...room, status: "playing" });
    });

    await gameSvc.endGame({ roomId, playerId: "p1" });
    const room = await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
    expect(room?.status).toBe("ended");
  });

  it("playCard: 非法 chosenColor 会直接报错（避免写入脏数据）", async () => {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "r1");
    const gameSvc = new GameService(repo);

    const { roomId } = await roomSvc.createRoom({ hostId: "p1", hostName: "A", dealerMode: "host" });
    await roomSvc.joinRoom({ roomId, playerId: "p2", name: "B" });

    await repo.runTransaction(async (tx) => {
      const room = await repo.getRoom(tx, roomId);
      const priv = await repo.getPrivateGameData(tx, roomId);
      if (!room || !priv) throw new Error("missing");

      await repo.updateRoom(tx, roomId, {
        ...room,
        status: "playing",
        currentPlayerIndex: 0,
        direction: 1,
        discardPile: [{ type: "number", color: "red", value: 7 }],
        chosenColor: null,
        pendingDraw: { count: 0, type: null },
        handCounts: { p1: 1, p2: 0 },
      });
      await repo.updatePrivateGameData(tx, roomId, { ...priv, drawPile: [] });
      await repo.setHands(tx, roomId, {
        p1: [{ type: "wild", color: null, value: null }],
        p2: [],
      });
    });

    // 强制绕过 TS 类型检查
    await expect(
      gameSvc.playCard({ roomId, playerId: "p1", cardIndex: 0, chosenColor: 1 as any }),
    ).rejects.toThrow(/chosenColor.*非法/);
  });
});

