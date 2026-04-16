import { NextResponse, type NextRequest } from "next/server";
import type { DealerMode } from "@/shared";
import { requireAuth } from "@/server/auth/requireAuth";
import { FirestoreRoomRepo } from "@/server/repos/firestoreRoomRepo";
import { RoomService } from "@/server/services/roomService";
import { generateRoomId } from "@/server/utils/roomId";

/**
 * POST /api/room
 *
 * 创建房间（写操作，必须鉴权）。
 *
 * Auth:
 * - `Authorization: Bearer <idToken>`
 *
 * Body:
 * - `{ hostName: string, dealerMode: "host" | "draw_compare" }`
 *
 * Response:
 * - `200 { roomId: string }`
 *
 * Errors:
 * - `401` 未登录/鉴权失败
 * - `400` 参数非法
 * - `500` 其余服务端错误（含 roomId 冲突等）
 */
export const runtime = "nodejs";

type CreateRoomBody = {
  hostName: string;
  dealerMode: DealerMode;
};

function isDealerMode(v: unknown): v is DealerMode {
  return v === "host" || v === "draw_compare";
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<CreateRoomBody>;

    const hostName = typeof body.hostName === "string" ? body.hostName.trim() : "";
    if (!hostName) return NextResponse.json({ error: "hostName 非法" }, { status: 400 });

    if (!isDealerMode(body.dealerMode)) {
      return NextResponse.json({ error: "dealerMode 非法" }, { status: 400 });
    }

    const svc = new RoomService(new FirestoreRoomRepo(), () => generateRoomId(6));
    const out = await svc.createRoom({
      hostId: user.uid,
      hostName,
      dealerMode: body.dealerMode,
    });

    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

