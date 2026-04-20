"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { loadLocalSession } from "@/client/localSession";

function getRoomIdFromParams(params: Record<string, string | string[]>) {
  const v = params.roomId;
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

export default function GamePage() {
  const params = useParams<Record<string, string | string[]>>();
  const roomId = getRoomIdFromParams(params).toUpperCase();
  const session = useMemo(() => loadLocalSession(), []);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>游戏页</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        roomId：<code>{roomId}</code>，userId：<code>{session.userId || "未知"}</code>
      </div>

      <div style={{ opacity: 0.8 }}>
        说明：这里会按 `docs/pages.md` 根据 room.status 切换视图（选庄/发牌/对战/暂停遮罩/结算）。
      </div>
    </div>
  );
}

