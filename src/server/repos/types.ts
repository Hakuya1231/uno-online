import type { Card, PublicRoomDoc } from "@/shared";

export type PrivateGameData = {
  /** 私密摸牌堆（已洗牌，由服务端维护） */
  drawPile: Card[];
  /** 选庄抽牌堆（仅 draw_compare 模式使用） */
  dealerDrawPile: Card[] | null;
};

/**
 * 数据访问层的“事务”抽象。
 *
 * - 这里不直接依赖 Firestore SDK，便于单元测试使用内存实现。
 * - 后续接 Firestore 时，用真实的 Transaction 包一层适配即可。
 */
export type Tx = unknown;

export type RoomRepo = {
  /**
   * 在同一个事务上下文中执行读写。
   *
   * - Firestore 实现：`tx` 对应 Transaction
   * - 内存实现：`tx` 只是占位
   */
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;

  /** 创建房间（同时写入公开 room 与私密 privateData）。 */
  createRoom(tx: Tx, room: PublicRoomDoc, privateData: PrivateGameData): Promise<void>;
  /** 读取公开房间文档。 */
  getRoom(tx: Tx, roomId: string): Promise<PublicRoomDoc | null>;
  /** 覆盖写入公开房间文档（通常在事务内）。 */
  updateRoom(tx: Tx, roomId: string, next: PublicRoomDoc): Promise<void>;

  /** 读取私密牌局数据文档。 */
  getPrivateGameData(tx: Tx, roomId: string): Promise<PrivateGameData | null>;
  /** 覆盖写入私密牌局数据文档。 */
  updatePrivateGameData(tx: Tx, roomId: string, next: PrivateGameData): Promise<void>;

  /** 读取某玩家手牌（不存在则视为 []） */
  getHand(tx: Tx, roomId: string, playerId: string): Promise<Card[]>;
  /** 写入某玩家手牌 */
  setHand(tx: Tx, roomId: string, playerId: string, cards: Card[]): Promise<void>;
  /** 批量写入手牌（用于发牌/多人补牌） */
  setHands(tx: Tx, roomId: string, hands: Record<string, Card[]>): Promise<void>;
};

