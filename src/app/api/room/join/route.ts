import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/server/auth/requireAuth";
import { FirestoreRoomRepo } from "@/server/repos/firestoreRoomRepo";
import { RoomService } from "@/server/services/roomService";
import { generateRoomId } from "@/server/utils/roomId";

/**
 * POST /api/room/join
 *
 * 加入房间（写操作，必须鉴权）。
 *
 * Auth:
 * - `Authorization: Bearer <idToken>`
 *
 * Body:
 * - `{ roomId: string, name: string }`
 *
 * Response:
 * - `200 {}`
 *
 * Errors:
 * - `401` 未登录/鉴权失败
 * - `400` 参数非法
 * - `500` 其余服务端错误（房间不存在/不允许加入/房间已满等目前统一映射为 500，后续可细分为 404/409）
 */
export const runtime = "nodejs";

type JoinRoomBody = {
  roomId: string;
  name: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<JoinRoomBody>;

    const roomId = typeof body.roomId === "string" ? body.roomId.trim().toUpperCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!roomId) return NextResponse.json({ error: "roomId 非法" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "name 非法" }, { status: 400 });

    const svc = new RoomService(new FirestoreRoomRepo(), () => generateRoomId(6));
    await svc.joinRoom({ roomId, playerId: user.uid, name });

    return NextResponse.json({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

