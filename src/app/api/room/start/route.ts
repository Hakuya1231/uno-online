import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/server/auth/requireAuth";
import { FirestoreRoomRepo } from "@/server/repos/firestoreRoomRepo";
import { RoomService } from "@/server/services/roomService";
import { generateRoomId } from "@/server/utils/roomId";

/**
 * POST /api/room/start
 *
 * 开始游戏（写操作，必须鉴权）。
 *
 * Auth:
 * - `Authorization: Bearer <idToken>`
 *
 * Body:
 * - `{ roomId: string }`
 *
 * Response:
 * - `200 {}`
 *
 * Errors:
 * - `401` 未登录/鉴权失败
 * - `400` 参数非法
 * - `500` 其余服务端错误（例如：房间不存在/状态不允许开始/非房主等）
 */
export const runtime = "nodejs";

type StartRoomBody = {
  roomId: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<StartRoomBody>;

    const roomId = typeof body.roomId === "string" ? body.roomId.trim().toUpperCase() : "";
    if (!roomId) return NextResponse.json({ error: "roomId 非法" }, { status: 400 });

    const svc = new RoomService(new FirestoreRoomRepo(), () => generateRoomId(6));
    await svc.startRoom({ roomId, playerId: user.uid });

    return NextResponse.json({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

