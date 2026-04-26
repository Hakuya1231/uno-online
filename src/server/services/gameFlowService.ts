import type { Card } from "@/shared";
import { runAiUntilHuman, type RandomSource } from "../ai";
import type { AiDelayRange } from "../ai/runAiLoop";
import type { RoomIdGenerator } from "./roomService";
import { RoomService } from "./roomService";
import { GameService } from "./gameService";
import type { RoomRepo } from "../repos/types";

export class GameFlowService {
  private readonly roomService: RoomService;
  private readonly gameService: GameService;

  constructor(
    private readonly repo: RoomRepo,
    roomIdGen: RoomIdGenerator = () => "__unused__",
    private readonly rng: RandomSource = Math.random,
    private readonly aiDelayRange: AiDelayRange | null = { minMs: 800, maxMs: 1200 },
  ) {
    this.roomService = new RoomService(repo, roomIdGen);
    this.gameService = new GameService(repo);
  }

  async runAiUntilHuman(roomId: string): Promise<void> {
    await runAiUntilHuman({
      roomId,
      repo: this.repo,
      actor: this.gameService,
      rng: this.rng,
      delayRange: this.aiDelayRange,
    });
  }

  async startRoom(input: { roomId: string; playerId: string }): Promise<void> {
    await this.roomService.startRoom(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async drawForDealer(input: { roomId: string; playerId: string }): Promise<void> {
    await this.gameService.drawForDealer(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async deal(input: { roomId: string; playerId: string }): Promise<void> {
    await this.gameService.deal(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async playCard(input: {
    roomId: string;
    playerId: string;
    cardIndex: number;
    chosenColor?: "red" | "yellow" | "green" | "blue" | null;
  }): Promise<void> {
    await this.gameService.playCard(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async drawCard(input: { roomId: string; playerId: string }): Promise<void> {
    await this.gameService.drawCard(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async skip(input: { roomId: string; playerId: string }): Promise<void> {
    await this.gameService.skip(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async acceptDraw(input: { roomId: string; playerId: string }): Promise<void> {
    await this.gameService.acceptDraw(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async challengeWildDrawFour(input: {
    roomId: string;
    playerId: string;
  }): Promise<{ result: "success" | "fail"; targetId: string; targetHand: Card[] }> {
    const out = await this.gameService.challengeWildDrawFour(input);
    await this.runAiUntilHuman(input.roomId);
    return out;
  }

  async nextRound(input: { roomId: string; playerId: string }): Promise<void> {
    await this.gameService.nextRound(input);
    await this.runAiUntilHuman(input.roomId);
  }

  async endGame(input: { roomId: string; playerId: string }): Promise<void> {
    await this.gameService.endGame(input);
  }
}
