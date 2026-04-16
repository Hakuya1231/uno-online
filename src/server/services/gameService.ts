import type { Card, PublicRoomDoc } from "@/shared";
import { createStandardDeck, shuffle } from "../engine/cards";
import type { EngineAction } from "../engine/actions";
import { scoreHand } from "../engine/rules";
import { reduce } from "../engine/reduce";
import type { RoomRepo } from "../repos/types";

export class GameService {
  /**
   * GameService 负责“牌局级”动作的事务编排：
   * - 读取 room/private/hands
   * - 调用 engine.reduce 产出下一状态
   * - 写回 room/private/hands
   *
   * 约束：
   * - service 不直接包含出牌规则细节（规则在 engine）
   * - 计分结算（full scoring）约定放在 service（尚未实现）
   */
  constructor(private readonly repo: RoomRepo) {}

  /** 选庄摸牌（draw_compare 模式）。 */
  async drawForDealer(input: { roomId: string; playerId: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);

      const action: EngineAction = { type: "DRAW_FOR_DEALER", playerId: input.playerId };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });
    });
  }

  /**
   * 发牌（庄家点击）。
   *
   * - 由 service 负责初始化并持久化 108 张洗牌后的 drawPile
   * - 然后调用 engine.DEAL 消费该 drawPile 完成发牌与翻起始牌
   */
  async deal(input: { roomId: string; playerId: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      // 初始化洗牌后的 drawPile
      const shuffled = shuffle(createStandardDeck());
      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);

      const action: EngineAction = { type: "DEAL", playerId: input.playerId };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: shuffled,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });

      if (!out.dealtHands) throw new Error("DEAL 未返回 dealtHands（异常）");
      await this.repo.setHands(tx, input.roomId, out.dealtHands);
    });
  }

  /**
   * 出牌。
   *
   * - 引擎会更新公开房间状态（discardPile/pendingDraw/currentPlayerIndex...）
   * - service 负责把当前玩家手牌写回 hands 子集合
   */
  async playCard(input: { roomId: string; playerId: string; cardIndex: number; chosenColor?: any }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);

      const action: EngineAction = {
        type: "PLAY_CARD",
        playerId: input.playerId,
        cardIndex: input.cardIndex,
        chosenColor: input.chosenColor ?? null,
      };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      const nextRoom = out.room as unknown as PublicRoomDoc;

      // full scoring：若当前玩家出完牌，则将其他玩家剩余手牌计分累加到赢家
      if (nextRoom.status === "finished") {
        const winnerId = input.playerId;
        let delta = 0;
        for (const p of nextRoom.players) {
          if (p.id === winnerId) continue;
          const otherHand = await this.repo.getHand(tx, input.roomId, p.id);
          delta += scoreHand(otherHand);
        }
        nextRoom.scores = { ...nextRoom.scores, [winnerId]: (nextRoom.scores[winnerId] ?? 0) + delta };
        nextRoom.roundWinnerId = winnerId;
      }

      await this.repo.updateRoom(tx, input.roomId, nextRoom);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });
      await this.repo.setHand(tx, input.roomId, input.playerId, out.hand);

    });
  }

  /** 摸牌（普通摸 1 张）。 */
  async drawCard(input: { roomId: string; playerId: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);
      const action: EngineAction = { type: "DRAW_CARD", playerId: input.playerId };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });
      await this.repo.setHand(tx, input.roomId, input.playerId, out.hand);
    });
  }

  /** 跳过回合（需先摸牌且本回合未出牌）。 */
  async skip(input: { roomId: string; playerId: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);
      const action: EngineAction = { type: "SKIP", playerId: input.playerId };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });
      await this.repo.setHand(tx, input.roomId, input.playerId, out.hand);
    });
  }

  /** 接受 +2/+4 惩罚并完成摸牌。 */
  async acceptDraw(input: { roomId: string; playerId: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);
      const action: EngineAction = { type: "ACCEPT_DRAW", playerId: input.playerId };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });
      await this.repo.setHand(tx, input.roomId, input.playerId, out.hand);
    });
  }

  /**
   * 开始下一局。
   *
   * - 牌局必须为 finished
   * - 上一局赢家成为新庄家（room.roundWinnerId）
   * - 清空所有玩家手牌（hands 子集合）与私密 drawPile（下一局发牌时再初始化）
   *
   * 说明：赢家由引擎在结束时写入 `roundWinnerId`，这里直接使用它。
   */
  async nextRound(input: { roomId: string; playerId: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);
      const action: EngineAction = {
        type: "NEXT_ROUND",
        playerId: input.playerId,
      };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });

      // 清空所有玩家手牌，保持与 handCounts=0 对齐
      const cleared: Record<string, Card[]> = {};
      for (const p of room.players) cleared[p.id] = [];
      await this.repo.setHands(tx, input.roomId, cleared);
    });
  }

  /**
   * 结束游戏（归档房间）。
   *
   * - 仅房主可结束
   * - 不删除数据，只将 status 置为 ended
   */
  async endGame(input: { roomId: string; playerId: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);
      const action: EngineAction = { type: "END_GAME", playerId: input.playerId };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });
      await this.repo.setHand(tx, input.roomId, input.playerId, out.hand);
    });
  }

  /**
   * 质疑 +4。
   *
   * 返回：
   * - result：质疑成功/失败
   * - targetId：被质疑者玩家 ID
   */
  async challengeWildDrawFour(input: {
    roomId: string;
    playerId: string;
  }): Promise<{ result: "success" | "fail"; targetId: string }> {
    return await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");

      const hand = await this.repo.getHand(tx, input.roomId, input.playerId);
      // 引擎会基于 currentPlayerIndex 计算被质疑者（上一位出 +4 的玩家）是谁。
      // service 这里提前算一次 targetId，用于读取被质疑者手牌并传入引擎。
      const n = room.players.length;
      if (n <= 0) throw new Error("玩家数量无效");
      const targetIndex = ((room.currentPlayerIndex + room.direction * -1) % n + n) % n;
      const targetId = room.players[targetIndex]?.id;
      if (!targetId) throw new Error("被质疑者索引无效");
      const targetHand = await this.repo.getHand(tx, input.roomId, targetId);

      const action: EngineAction = {
        type: "CHALLENGE_WILD_DRAW_FOUR",
        playerId: input.playerId,
        targetHand,
      };
      const out = reduce(
        {
          room: room as unknown as Parameters<typeof reduce>[0]["room"],
          hand,
          drawPile: privateData.drawPile,
          dealerDrawPile: privateData.dealerDrawPile,
        },
        action,
      );

      await this.repo.updateRoom(tx, input.roomId, out.room as unknown as PublicRoomDoc);
      await this.repo.updatePrivateGameData(tx, input.roomId, {
        ...privateData,
        drawPile: out.drawPile,
        dealerDrawPile: out.dealerDrawPile,
      });
      await this.repo.setHand(tx, input.roomId, input.playerId, out.hand);
      if (out.handsPatch) {
        await this.repo.setHands(tx, input.roomId, out.handsPatch);
      }

      if (out.lastAction.type !== "challenge_result") {
        throw new Error("质疑未产生 challenge_result（异常）");
      }
      return { result: out.lastAction.result, targetId: out.lastAction.targetId };
    });
  }
}

