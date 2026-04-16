import type { Card, PublicRoomDoc } from "@/shared";
import type { PrivateGameData, RoomRepo, Tx } from "./types";

type StoredRoom = {
  room: PublicRoomDoc;
  privateData: PrivateGameData;
  hands: Map<string, Card[]>;
};

/**
 * 单元测试用的内存版 RoomRepo。
 *
 * - 不做并发控制
 * - Tx 只是占位
 */
export class InMemoryRoomRepo implements RoomRepo {
  private readonly store = new Map<string, StoredRoom>();

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await fn({});
  }

  async createRoom(tx: Tx, room: PublicRoomDoc, privateData: PrivateGameData): Promise<void> {
    void tx;
    if (this.store.has(room.roomId)) throw new Error("roomId 已存在");
    const hands = new Map<string, Card[]>();
    // 初始化已知玩家的手牌为空数组，便于测试/调试
    for (const p of room.players) {
      hands.set(p.id, []);
    }
    this.store.set(room.roomId, {
      room: structuredClone(room),
      privateData: structuredClone(privateData),
      hands,
    });
  }

  async getRoom(tx: Tx, roomId: string): Promise<PublicRoomDoc | null> {
    void tx;
    const found = this.store.get(roomId);
    return found ? structuredClone(found.room) : null;
  }

  async updateRoom(tx: Tx, roomId: string, next: PublicRoomDoc): Promise<void> {
    void tx;
    const found = this.store.get(roomId);
    if (!found) throw new Error("房间不存在");
    this.store.set(roomId, { room: structuredClone(next), privateData: found.privateData, hands: found.hands });
  }

  async getPrivateGameData(tx: Tx, roomId: string): Promise<PrivateGameData | null> {
    void tx;
    const found = this.store.get(roomId);
    return found ? structuredClone(found.privateData) : null;
  }

  async updatePrivateGameData(tx: Tx, roomId: string, next: PrivateGameData): Promise<void> {
    void tx;
    const found = this.store.get(roomId);
    if (!found) throw new Error("房间不存在");
    this.store.set(roomId, { room: found.room, privateData: structuredClone(next), hands: found.hands });
  }

  async getHand(tx: Tx, roomId: string, playerId: string): Promise<Card[]> {
    void tx;
    const found = this.store.get(roomId);
    if (!found) throw new Error("房间不存在");
    return structuredClone(found.hands.get(playerId) ?? []);
  }

  async setHand(tx: Tx, roomId: string, playerId: string, cards: Card[]): Promise<void> {
    void tx;
    const found = this.store.get(roomId);
    if (!found) throw new Error("房间不存在");
    found.hands.set(playerId, structuredClone(cards));
  }

  async setHands(tx: Tx, roomId: string, hands: Record<string, Card[]>): Promise<void> {
    void tx;
    const found = this.store.get(roomId);
    if (!found) throw new Error("房间不存在");
    for (const [pid, cards] of Object.entries(hands)) {
      found.hands.set(pid, structuredClone(cards));
    }
  }
}

