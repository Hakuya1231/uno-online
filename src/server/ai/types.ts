import type { Card, CardColor, PublicRoomDoc } from "@/shared";

export type RandomSource = () => number;

export type AiDecision =
  | { type: "draw_for_dealer" }
  | { type: "deal" }
  | { type: "draw_card" }
  | { type: "skip" }
  | { type: "accept_draw" }
  | { type: "challenge" }
  | {
      type: "play_card";
      cardIndex: number;
      chosenColor?: Exclude<CardColor, null> | null;
    };

export type AiDecisionInput = {
  room: PublicRoomDoc;
  hand: readonly Card[];
  playerId: string;
  rng?: RandomSource;
};
