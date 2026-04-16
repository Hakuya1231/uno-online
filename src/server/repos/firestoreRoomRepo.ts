import type { Card, PublicRoomDoc } from "@/shared";
import type { PrivateGameData, RoomRepo, Tx } from "./types";
import { getAdminFirestore } from "../firebase/admin";

import type { Firestore, Transaction } from "firebase-admin/firestore";

type FirestoreTx = Transaction;

function roomsCol(db: Firestore) {
  return db.collection("rooms");
}

function roomDoc(db: Firestore, roomId: string) {
  return roomsCol(db).doc(roomId);
}

function privateGameDataDoc(db: Firestore, roomId: string) {
  return roomDoc(db, roomId).collection("private").doc("gameData");
}

function handDoc(db: Firestore, roomId: string, playerId: string) {
  return roomDoc(db, roomId).collection("hands").doc(playerId);
}

function assertFirestoreTx(tx: Tx): asserts tx is FirestoreTx {
  if (!tx || typeof tx !== "object") throw new Error("tx 非法（不是 Firestore Transaction）");
  const anyTx = tx as any;
  if (typeof anyTx.get !== "function" || typeof anyTx.set !== "function") {
    throw new Error("tx 非法（不是 Firestore Transaction）");
  }
}

export class FirestoreRoomRepo implements RoomRepo {
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getAdminFirestore();
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await this.db.runTransaction(async (tx) => await fn(tx));
  }

  async createRoom(tx: Tx, room: PublicRoomDoc, privateData: PrivateGameData): Promise<void> {
    assertFirestoreTx(tx);
    const ref = roomDoc(this.db, room.roomId);
    const privRef = privateGameDataDoc(this.db, room.roomId);

    const snap = await tx.get(ref);
    if (snap.exists) throw new Error("roomId 已存在");

    tx.set(ref, room);
    tx.set(privRef, privateData);
  }

  async getRoom(tx: Tx, roomId: string): Promise<PublicRoomDoc | null> {
    assertFirestoreTx(tx);
    const snap = await tx.get(roomDoc(this.db, roomId));
    return snap.exists ? (snap.data() as PublicRoomDoc) : null;
  }

  async updateRoom(tx: Tx, roomId: string, next: PublicRoomDoc): Promise<void> {
    assertFirestoreTx(tx);
    tx.set(roomDoc(this.db, roomId), next);
  }

  async getPrivateGameData(tx: Tx, roomId: string): Promise<PrivateGameData | null> {
    assertFirestoreTx(tx);
    const snap = await tx.get(privateGameDataDoc(this.db, roomId));
    return snap.exists ? (snap.data() as PrivateGameData) : null;
  }

  async updatePrivateGameData(tx: Tx, roomId: string, next: PrivateGameData): Promise<void> {
    assertFirestoreTx(tx);
    tx.set(privateGameDataDoc(this.db, roomId), next);
  }

  async getHand(tx: Tx, roomId: string, playerId: string): Promise<Card[]> {
    assertFirestoreTx(tx);
    const snap = await tx.get(handDoc(this.db, roomId, playerId));
    if (!snap.exists) return [];
    const data = snap.data() as { cards?: Card[] };
    return Array.isArray(data.cards) ? data.cards : [];
  }

  async setHand(tx: Tx, roomId: string, playerId: string, cards: Card[]): Promise<void> {
    assertFirestoreTx(tx);
    tx.set(handDoc(this.db, roomId, playerId), { cards });
  }

  async setHands(tx: Tx, roomId: string, hands: Record<string, Card[]>): Promise<void> {
    assertFirestoreTx(tx);
    for (const [playerId, cards] of Object.entries(hands)) {
      tx.set(handDoc(this.db, roomId, playerId), { cards });
    }
  }
}

