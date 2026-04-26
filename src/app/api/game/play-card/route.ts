import { NextResponse, type NextRequest } from "next/server";
import type { CardColor } from "@/shared";
import { requireAuth } from "@/server/auth/requireAuth";
import { FirestoreRoomRepo } from "@/server/repos/firestoreRoomRepo";
import { GameFlowService } from "@/server/services/gameFlowService";

export const runtime = "nodejs";

type Body = {
  roomId: string;
  cardIndex: number;
  chosenColor?: Exclude<CardColor, null> | null;
};

function parseRoomId(body: Partial<Body>): string {
  return typeof body.roomId === "string" ? body.roomId.trim().toUpperCase() : "";
}

function parseCardIndex(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null;
  return v;
}

function parseChosenColor(v: unknown): Exclude<CardColor, null> | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (v === "red" || v === "yellow" || v === "green" || v === "blue") return v;
  throw new Error("chosenColor 非法");
}

/**
 * POST /api/game/play-card
 *
 * 出牌。
 *
 * Body: `{ roomId, cardIndex, chosenColor? }`
 * Resp: `{}`
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<Body>;

    const roomId = parseRoomId(body);
    if (!roomId) return NextResponse.json({ error: "roomId 非法" }, { status: 400 });

    const cardIndex = parseCardIndex(body.cardIndex);
    if (cardIndex === null) return NextResponse.json({ error: "cardIndex 非法" }, { status: 400 });

    let chosenColor: Exclude<CardColor, null> | null | undefined;
    try {
      chosenColor = parseChosenColor((body as any).chosenColor);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "chosenColor 非法";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const svc = new GameFlowService(new FirestoreRoomRepo());
    await svc.playCard({ roomId, playerId: user.uid, cardIndex, chosenColor });
    return NextResponse.json({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
