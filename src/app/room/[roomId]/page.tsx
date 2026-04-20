"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { postJson } from "@/client/api";
import { useLocalSession } from "@/client/useLocalSession";

function getRoomIdFromParams(params: Record<string, string | string[]>) {
  const v = params.roomId;
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<Record<string, string | string[]>>();
  const roomId = getRoomIdFromParams(params).toUpperCase();

  const { session, ready } = useLocalSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
      setMsg("已复制链接");
    } catch {
      setMsg("复制失败（浏览器不支持或无权限）");
    }
  }, [roomId]);

  const onStart = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/room/start", { roomId });

      router.push(`/game/${roomId}`);
    } catch (e) {
      setMsg(`开始失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [roomId, router]);

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>房间号</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{roomId}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            当前用户：<code>{session.userId || "未知"}</code> 昵称：<code>{session.nickname || "未设置"}</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onCopyLink} disabled={!roomId}>
            复制链接
          </button>
        </div>
      </div>

      <hr style={{ margin: "20px 0" }} />

      {/* 先按文档把页面骨架搭起来；玩家列表/AI 增删/实时订阅后续接入 */}
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ opacity: 0.8 }}>
          说明：房间页后续会接 Firestore `onSnapshot` 展示玩家列表与房主操作。
        </div>

        <button onClick={onStart} disabled={busy || !roomId || !ready}>
          开始游戏
        </button>

        {msg ? <div style={{ whiteSpace: "pre-wrap" }}>{msg}</div> : null}
      </div>
    </div>
  );
}

