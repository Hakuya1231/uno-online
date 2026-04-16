import type { DealerMode, Player, PublicRoomDoc } from "@/shared";
import type { PrivateGameData, RoomRepo } from "../repos/types";
import { createDealerDrawPile } from "../engine/cards";

export type RoomIdGenerator = () => string;

export type CreateRoomInput = {
  hostId: string;
  hostName: string;
  dealerMode: DealerMode;
  roomId?: string;
};

/**
 * 创建房间时的公开房间文档初始化值。
 *
 * 约束：
 * - draw_compare 模式下，创建阶段尚未选庄，因此 dealerId 为空字符串（由选庄阶段写入）
 * - 其余牌局字段初始化为“未开局/不可操作”的默认值
 */
function makeInitialRoomDoc(input: CreateRoomInput): PublicRoomDoc {
  const host: Player = { id: input.hostId, name: input.hostName, isAI: false };

  return {
    roomId: input.roomId ?? "",
    hostId: input.hostId,
    dealerMode: input.dealerMode,
    dealerId: input.dealerMode === "host" ? input.hostId : "",
    dealerDrawResults: null,

    status: "waiting",
    players: [host],

    discardPile: [],
    chosenColor: null,

    currentPlayerIndex: 0,
    direction: 1,

    pendingDraw: { count: 0, type: null },

    drawPileCount: 0,
    handCounts: { [input.hostId]: 0 },

    scores: { [input.hostId]: 0 },
    currentRound: 1,
    roundWinnerId: null,

    hasDrawnThisTurn: false,
    roomVersion: 1,

    lastAction: null,

    disconnectedPlayerId: null,
    pauseUntil: null,
  };
}

/** 创建房间时的私密文档初始化值。 */
function makeInitialPrivateData(): PrivateGameData {
  return { drawPile: [], dealerDrawPile: null };
}

export class RoomService {
  /**
   * RoomService 仅负责“房间级”业务：
   * - 创建/加入
   * - 开始游戏（推进到 dealing/choosing_dealer 并初始化选庄抽牌堆）
   *
   * 不负责发牌/出牌等牌局动作（由 GameService 负责）。
   */
  constructor(
    private readonly repo: RoomRepo,
    private readonly genRoomId: RoomIdGenerator,
  ) {}

  /**
   * 创建房间。
   *
   * - 初始化 `rooms/{roomId}` 与 `private/gameData`
   * - `roomId` 默认由注入的生成器产生（便于测试）
   */
  async createRoom(input: CreateRoomInput): Promise<{ roomId: string }> {
    const roomId = input.roomId ?? this.genRoomId();
    const room = makeInitialRoomDoc({ ...input, roomId });
    const privateData = makeInitialPrivateData();

    await this.repo.runTransaction(async (tx) => {
      const existing = await this.repo.getRoom(tx, roomId);
      if (existing) throw new Error("roomId 已存在");
      await this.repo.createRoom(tx, room, privateData);
    });

    return { roomId };
  }

  /**
   * 加入房间（房间级）。
   *
   * 约束（对齐文档）：
   * - 仅 status=waiting 允许加入
   * - 总人数最多 8
   * - players 顺序：房主第一、真人按加入时间、AI 永远排最后（因此真人加入要插入到第一个 AI 之前）
   * - 幂等：若已在房间中则直接返回成功（不修改昵称）
   */
  async joinRoom(input: { roomId: string; playerId: string; name: string }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      if (room.status !== "waiting") throw new Error("当前状态不允许加入房间");

      if (room.players.some((p) => p.id === input.playerId)) {
        // 幂等：已在房间中则直接返回成功（不修改昵称）
        return;
      }

      if (room.players.length >= 8) throw new Error("房间已满");

      const nextRoom: PublicRoomDoc = { ...room, roomVersion: room.roomVersion + 1 };

      const newPlayer: Player = { id: input.playerId, name: input.name, isAI: false };
      const firstAiIndex = room.players.findIndex((p) => p.isAI);
      if (firstAiIndex === -1) {
        nextRoom.players = [...room.players, newPlayer];
      } else {
        nextRoom.players = [
          ...room.players.slice(0, firstAiIndex),
          newPlayer,
          ...room.players.slice(firstAiIndex),
        ];
      }

      nextRoom.handCounts = { ...room.handCounts, [input.playerId]: 0 };
      nextRoom.scores = { ...room.scores, [input.playerId]: 0 };

      await this.repo.updateRoom(tx, input.roomId, nextRoom);
    });
  }

  /**
   * 开始游戏（房间级）。
   *
   * - dealerMode=host：直接进入 dealing，庄家=房主
   * - dealerMode=draw_compare：进入 choosing_dealer，并由服务端初始化 dealerDrawPile（10 张不重复数字牌）
   *
   * 说明：
   * - 108 张 drawPile 的初始化在发牌（deal）时由 GameService 负责
   */
  async startRoom(input: {
    roomId: string;
    playerId: string;
  }): Promise<void> {
    await this.repo.runTransaction(async (tx) => {
      const room = await this.repo.getRoom(tx, input.roomId);
      if (!room) throw new Error("房间不存在");
      if (room.status !== "waiting") throw new Error("当前状态不允许开始游戏");
      if (input.playerId !== room.hostId) throw new Error("只有房主可以开始游戏");

      const nextRoom: PublicRoomDoc = { ...room, roomVersion: room.roomVersion + 1 };
      const privateData = await this.repo.getPrivateGameData(tx, input.roomId);
      if (!privateData) throw new Error("私密数据不存在（异常状态）");
      const nextPrivate: PrivateGameData = { ...privateData };

      if (room.dealerMode === "host") {
        nextRoom.dealerId = room.hostId;
        nextRoom.status = "dealing";
        nextRoom.dealerDrawResults = null;
        nextPrivate.dealerDrawPile = null;
      } else {
        nextRoom.status = "choosing_dealer";
        nextRoom.dealerDrawResults = null;
        nextPrivate.dealerDrawPile = createDealerDrawPile();
      }

      await this.repo.updateRoom(tx, input.roomId, nextRoom);
      await this.repo.updatePrivateGameData(tx, input.roomId, nextPrivate);
    });
  }
}

