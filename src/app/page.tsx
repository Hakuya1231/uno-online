"use client";

import "animal-island-ui/style";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Divider, Footer, Input } from "animal-island-ui";
import styles from "./page.module.css";

import type { DealerMode } from "@/shared";
import { loadLocalSession } from "@/client/localSession";
import { randomChuunibyouNickname } from "@/client/nickname";
import { postJson } from "@/client/api";
import { saveNickname } from "@/client/localSession";
import { useLocalSession } from "@/client/useLocalSession";
import { DEALER_MODE_ZH } from "@/client/uiText";

type CreateRoomResp = { roomId: string };

export default function HomePage() {
  const router = useRouter();
  const { ready } = useLocalSession();

  const initial = useMemo(() => loadLocalSession(), []);
  const [nickname, setNickname] = useState(initial.nickname || "");
  const [dealerMode, setDealerMode] = useState<DealerMode>("host");
  const [joinRoomId, setJoinRoomId] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onRandomNickname = useCallback(() => {
    const next = randomChuunibyouNickname({ maxLen: 12 });
    setNickname(next);
    saveNickname(next);
  }, []);

  const createRoom = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const { roomId } = await postJson<CreateRoomResp>("/api/room", {
        hostName: nickname.trim(),
        dealerMode,
      });
      router.push(`/room/${roomId}`);
    } catch (e) {
      setMsg(`创建失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [dealerMode, nickname, router]);

  const joinRoom = useCallback(async () => {
    const roomId = joinRoomId.trim().toUpperCase();
    if (!roomId) {
      setMsg("请输入房间号");
      return;
    }

    setBusy(true);
    setMsg("");
    try {
      await postJson("/api/room/join", { roomId, name: nickname.trim() });
      router.push(`/room/${roomId}`);
    } catch (e) {
      setMsg(`加入失败：${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [joinRoomId, nickname, router]);

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <section className={styles.formPanel}>
          <div className={styles.panelHeader}>
            <h1 className={styles.panelTitle}>白夜大小姐的UNO</h1>
            <p className={styles.panelStatus}>{ready ? "已进入系统" : "正在进入系统..."}</p>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>昵称</span>
            <div className={styles.inputRow}>
              <Input
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  saveNickname(e.target.value.trim());
                }}
                placeholder="请输入"
                allowClear
                onClear={() => {
                  setNickname("");
                  saveNickname("");
                }}
                disabled={busy}
                maxLength={12}
              />
              <Button type="default" onClick={onRandomNickname} disabled={busy}>
                随机
              </Button>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>庄家方式</span>
            <div className={styles.modeRow}>
              <Button
                type={dealerMode === "host" ? "primary" : "default"}
                onClick={() => setDealerMode("host")}
                disabled={busy}
              >
                {DEALER_MODE_ZH.host}
              </Button>
              <Button
                type={dealerMode === "draw_compare" ? "primary" : "default"}
                onClick={() => setDealerMode("draw_compare")}
                disabled={busy}
              >
                {DEALER_MODE_ZH.draw_compare}
              </Button>
            </div>
          </div>

          <div className={styles.actionRow}>
            <Button
              type="primary"
              block
              size="large"
              onClick={createRoom}
              loading={busy}
              disabled={!ready || nickname.trim().length === 0}
            >
              创建房间
            </Button>
          </div>

          <Divider type="wave-yellow" />

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>房间号</span>
            <Input
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              placeholder="例如 ABC123"
              allowClear
              onClear={() => setJoinRoomId("")}
              disabled={busy}
            />
          </div>

          <div className={styles.actionRow}>
            <Button
              type="default"
              block
              size="large"
              onClick={joinRoom}
              loading={busy}
              disabled={!ready || nickname.trim().length === 0}
            >
              加入房间
            </Button>
          </div>

          {msg ? <div className={styles.message}>{msg}</div> : null}
        </section>

        <section className={styles.footerBlock}>
          <Footer type="tree" />
        </section>
      </main>
    </div>
  );
}
