import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/server/auth/requireAuth";
import { FirestoreRoomRepo } from "@/server/repos/firestoreRoomRepo";
import { GameFlowService } from "@/server/services/gameFlowService";

export const runtime = "nodejs";

type Body = { roomId: string };

function parseRoomId(body: Partial<Body>): string {
  return typeof body.roomId === "string" ? body.roomId.trim().toUpperCase() : "";
}

/**
 * POST /api/game/draw-card
 *
 * 摸牌（普通摸 1 张）。
 *
 * Body: `{ roomId }`
 * Resp: `{}`
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<Body>;
    const roomId = parseRoomId(body);
    if (!roomId) return NextResponse.json({ error: "roomId 非法" }, { status: 400 });

    const svc = new GameFlowService(new FirestoreRoomRepo());
    await svc.drawCard({ roomId, playerId: user.uid });
    return NextResponse.json({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
