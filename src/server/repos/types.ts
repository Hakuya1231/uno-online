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
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;

  createRoom(tx: Tx, room: PublicRoomDoc, privateData: PrivateGameData): Promise<void>;
  getRoom(tx: Tx, roomId: string): Promise<PublicRoomDoc | null>;
  updateRoom(tx: Tx, roomId: string, next: PublicRoomDoc): Promise<void>;

  getPrivateGameData(tx: Tx, roomId: string): Promise<PrivateGameData | null>;
  updatePrivateGameData(tx: Tx, roomId: string, next: PrivateGameData): Promise<void>;
};

