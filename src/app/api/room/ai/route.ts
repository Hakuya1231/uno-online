import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/server/auth/requireAuth";
import { FirestoreRoomRepo } from "@/server/repos/firestoreRoomRepo";
import { RoomService } from "@/server/services/roomService";

export const runtime = "nodejs";

type AddAiBody = {
  roomId: string;
};

type RemoveAiBody = {
  roomId: string;
  playerId: string;
};

function parseRoomId(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function parsePlayerId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<AddAiBody>;
    const roomId = parseRoomId(body.roomId);
    if (!roomId) return NextResponse.json({ error: "roomId 非法" }, { status: 400 });

    const svc = new RoomService(new FirestoreRoomRepo(), () => "__unused__");
    await svc.addAi({ roomId, playerId: user.uid });

    return NextResponse.json({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = (await req.json()) as Partial<RemoveAiBody>;
    const roomId = parseRoomId(body.roomId);
    const targetPlayerId = parsePlayerId(body.playerId);

    if (!roomId) return NextResponse.json({ error: "roomId 非法" }, { status: 400 });
    if (!targetPlayerId) return NextResponse.json({ error: "playerId 非法" }, { status: 400 });

    const svc = new RoomService(new FirestoreRoomRepo(), () => "__unused__");
    await svc.removeAi({ roomId, playerId: user.uid, targetPlayerId });

    return NextResponse.json({});
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    const status = msg.includes("未登录") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
