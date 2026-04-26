import type { PublicRoomDoc } from "@/shared";
import type { RoomRepo } from "../repos/types";
import { aiDecide } from "./decide";
import type { RandomSource } from "./types";

export type AiDelayRange = {
  minMs: number;
  maxMs: number;
};

type AiActor = {
  drawForDealer(input: { roomId: string; playerId: string }): Promise<void>;
  deal(input: { roomId: string; playerId: string }): Promise<void>;
  playCard(input: {
    roomId: string;
    playerId: string;
    cardIndex: number;
    chosenColor?: "red" | "yellow" | "green" | "blue" | null;
  }): Promise<void>;
  drawCard(input: { roomId: string; playerId: string }): Promise<void>;
  skip(input: { roomId: string; playerId: string }): Promise<void>;
  acceptDraw(input: { roomId: string; playerId: string }): Promise<void>;
  challengeWildDrawFour(input: { roomId: string; playerId: string }): Promise<unknown>;
};

async function loadRoom(repo: RoomRepo, roomId: string) {
  return await repo.runTransaction(async (tx) => {
    const room = await repo.getRoom(tx, roomId);
    if (!room) return null;

    const current = room.players[room.currentPlayerIndex];
    const currentHand =
      room.status === "playing" && current ? await repo.getHand(tx, roomId, current.id) : null;

    return { room, currentHand };
  });
}

function firstPendingAiForDealer(room: PublicRoomDoc) {
  return room.players.find((p) => p.isAI && !(room.dealerDrawResults?.[p.id] ?? null)) ?? null;
}

function dealerPlayer(room: PublicRoomDoc) {
  return room.players.find((p) => p.id === room.dealerId) ?? null;
}

function pickDelayMs(range: AiDelayRange, rng: RandomSource): number {
  const minMs = Math.max(0, Math.floor(range.minMs));
  const maxMs = Math.max(minMs, Math.floor(range.maxMs));
  return Math.floor(minMs + rng() * (maxMs - minMs + 1));
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAiUntilHuman(params: {
  roomId: string;
  repo: RoomRepo;
  actor: AiActor;
  rng?: RandomSource;
  maxSteps?: number;
  delayRange?: AiDelayRange | null;
}): Promise<void> {
  const rng = params.rng ?? Math.random;
  const maxSteps = params.maxSteps ?? 128;

  for (let step = 0; step < maxSteps; step++) {
    const snap = await loadRoom(params.repo, params.roomId);
    if (!snap?.room) return;

    const { room, currentHand } = snap;
    if (room.status === "waiting" || room.status === "paused" || room.status === "finished" || room.status === "ended") {
      return;
    }

    if (room.status === "choosing_dealer") {
      const pendingAi = firstPendingAiForDealer(room);
      if (!pendingAi) return;
      if (params.delayRange) await sleep(pickDelayMs(params.delayRange, rng));
      await params.actor.drawForDealer({ roomId: params.roomId, playerId: pendingAi.id });
      continue;
    }

    if (room.status === "dealing") {
      const dealer = dealerPlayer(room);
      if (!dealer?.isAI) return;
      if (params.delayRange) await sleep(pickDelayMs(params.delayRange, rng));
      await params.actor.deal({ roomId: params.roomId, playerId: dealer.id });
      continue;
    }

    if (room.status !== "playing") return;

    const current = room.players[room.currentPlayerIndex];
    if (!current?.isAI) return;
    if (!currentHand) throw new Error("缺少 AI 手牌，无法决策");

    const decision = aiDecide({ room, hand: currentHand, playerId: current.id, rng });
    if (params.delayRange) await sleep(pickDelayMs(params.delayRange, rng));

    switch (decision.type) {
      case "draw_for_dealer":
        await params.actor.drawForDealer({ roomId: params.roomId, playerId: current.id });
        break;
      case "deal":
        await params.actor.deal({ roomId: params.roomId, playerId: current.id });
        break;
      case "draw_card":
        await params.actor.drawCard({ roomId: params.roomId, playerId: current.id });
        break;
      case "skip":
        await params.actor.skip({ roomId: params.roomId, playerId: current.id });
        break;
      case "accept_draw":
        await params.actor.acceptDraw({ roomId: params.roomId, playerId: current.id });
        break;
      case "challenge":
        await params.actor.challengeWildDrawFour({ roomId: params.roomId, playerId: current.id });
        break;
      case "play_card":
        await params.actor.playCard({
          roomId: params.roomId,
          playerId: current.id,
          cardIndex: decision.cardIndex,
          chosenColor: decision.chosenColor,
        });
        break;
    }
  }

  throw new Error("AI 连续执行超过上限，已中止");
}
