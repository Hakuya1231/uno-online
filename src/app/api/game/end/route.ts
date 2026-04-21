import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/server/auth/requireAuth";
import { FirestoreRoomRepo } from "@/server/repos/firestoreRoomRepo";
import { GameService } from "@/server/services/gameService";

export const runtime = "nodejs";

type Body = { roomId: string };

function parseRoomId(body: Partial<Body>): string {
  return typeof body.roomId === "string" ? body.roomId.trim().toUpperCase() : "";
}

/**
 * POST /api/game/end
 *
 * 结束游戏（归档房间）。
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

    const svc = new GameService(new FirestoreRoomRepo());
    await svc.endGame({ roomId, playerId: user.uid });
    return NextResponse.json({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

