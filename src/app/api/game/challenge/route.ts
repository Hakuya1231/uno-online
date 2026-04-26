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
 * POST /api/game/challenge
 *
 * 质疑 +4。
 * 
 * Body: `{ roomId }`
 * Resp: `{ hand, result }`
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<Body>;
    const roomId = parseRoomId(body);
    if (!roomId) return NextResponse.json({ error: "roomId 非法" }, { status: 400 });

    const repo = new FirestoreRoomRepo();
    const svc = new GameFlowService(repo);
    const out = await svc.challengeWildDrawFour({ roomId, playerId: user.uid });

    // 按 docs 约定：除质疑外，接口响应均为 {}；质疑返回 hand + result（便于客户端立即更新手牌）
    return NextResponse.json({ hand: out.targetHand, result: out.result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
