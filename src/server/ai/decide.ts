import type { Card, CardColor, PublicRoomDoc } from "@/shared";
import { canStackPenalty, isPlayable } from "../engine";
import type { AiDecision, AiDecisionInput, RandomSource } from "./types";

const COLORS: Exclude<CardColor, null>[] = ["red", "yellow", "green", "blue"];

function topDiscard(room: PublicRoomDoc): Card | null {
  return room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1]! : null;
}

function randomPick<T>(items: readonly T[], rng: RandomSource): T {
  const idx = Math.floor(rng() * items.length);
  return items[Math.min(items.length - 1, Math.max(0, idx))]!;
}

function playableIndices(room: PublicRoomDoc, hand: readonly Card[]): number[] {
  const top = topDiscard(room);
  if (!top) return [];

  const out: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i]!;
    if (room.pendingDraw.count > 0) {
      if (room.pendingDraw.type === "draw_two" && canStackPenalty(card, "draw_two")) {
        out.push(i);
      }
      continue;
    }
    if (isPlayable(card, top, room.chosenColor)) {
      out.push(i);
    }
  }
  return out;
}

function randomChosenColor(rng: RandomSource): Exclude<CardColor, null> {
  return randomPick(COLORS, rng);
}

export function aiDecide(input: AiDecisionInput): AiDecision {
  const rng = input.rng ?? Math.random;
  const { room, hand, playerId } = input;

  if (room.status === "choosing_dealer") {
    return { type: "draw_for_dealer" };
  }

  if (room.status === "dealing") {
    return { type: "deal" };
  }

  if (room.status !== "playing") {
    throw new Error("AI 当前状态不可决策");
  }

  const current = room.players[room.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new Error("未轮到该 AI 行动");
  }

  if (room.pendingDraw.count > 0) {
    if (room.pendingDraw.type === "draw_two") {
      const stackable = playableIndices(room, hand);
      if (stackable.length > 0) {
        return { type: "play_card", cardIndex: randomPick(stackable, rng) };
      }
      return { type: "accept_draw" };
    }

    if (room.pendingDraw.type === "wild_draw_four") {
      return rng() < 0.5 ? { type: "challenge" } : { type: "accept_draw" };
    }
  }

  const legal = playableIndices(room, hand);

  if (room.hasDrawnThisTurn) {
    if (legal.length > 0 && rng() < 0.5) {
      const cardIndex = randomPick(legal, rng);
      const card = hand[cardIndex]!;
      return {
        type: "play_card",
        cardIndex,
        chosenColor: card.type === "wild" || card.type === "wild_draw_four" ? randomChosenColor(rng) : null,
      };
    }
    return { type: "skip" };
  }

  if (legal.length > 0) {
    const cardIndex = randomPick(legal, rng);
    const card = hand[cardIndex]!;
    return {
      type: "play_card",
      cardIndex,
      chosenColor: card.type === "wild" || card.type === "wild_draw_four" ? randomChosenColor(rng) : null,
    };
  }

  return { type: "draw_card" };
}
