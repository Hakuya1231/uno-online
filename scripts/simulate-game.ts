import type { Card, PublicRoomDoc } from "../src/shared";
import { isPlayable } from "../src/server/engine";
import { InMemoryRoomRepo } from "../src/server/repos/inMemoryRoomRepo";
import { GameService } from "../src/server/services/gameService";
import { RoomService } from "../src/server/services/roomService";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function cardToText(card: Card): string {
  const color =
    card.color === "red"
      ? "红"
      : card.color === "yellow"
        ? "黄"
        : card.color === "green"
          ? "绿"
          : card.color === "blue"
            ? "蓝"
            : "无色";
  const face =
    card.type === "number"
      ? String(card.value ?? "?")
      : card.type === "skip"
        ? "跳过"
        : card.type === "reverse"
          ? "反转"
          : card.type === "draw_two"
            ? "+2"
            : card.type === "wild"
              ? "万能"
              : "+4";
  return `${color}${face}`;
}

function playerLabel(room: PublicRoomDoc, playerId: string) {
  const p = room.players.find((x) => x.id === playerId);
  return p ? `${p.name}(${p.id})` : playerId;
}

function findNewCard(before: readonly Card[], after: readonly Card[]): Card | null {
  if (after.length !== before.length + 1) return null;
  const key = (c: Card) => JSON.stringify(c);
  const counts = new Map<string, number>();
  for (const c of after) {
    const k = key(c);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const c of before) {
    const k = key(c);
    counts.set(k, (counts.get(k) ?? 0) - 1);
  }
  for (const [k, v] of counts.entries()) {
    if (v === 1) return JSON.parse(k) as Card;
  }
  return null;
}

async function readRoom(repo: InMemoryRoomRepo, roomId: string) {
  return await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
}

async function readHand(repo: InMemoryRoomRepo, roomId: string, playerId: string) {
  return await repo.runTransaction((tx) => repo.getHand(tx, roomId, playerId));
}

function getTopCard(room: PublicRoomDoc): Card | null {
  return room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1]! : null;
}

function logStep(step: number, room: PublicRoomDoc, msg: string) {
  const top = getTopCard(room);
  const topText = top ? cardToText(top) : "（无）";
  const active = room.chosenColor
    ? room.chosenColor === "red"
      ? "红"
      : room.chosenColor === "yellow"
        ? "黄"
        : room.chosenColor === "green"
          ? "绿"
          : "蓝"
    : "（无）";
  const current = room.players[room.currentPlayerIndex];
  const curText = current ? `${current.name}(${current.id})` : "（无）";
  console.log(
    `[${String(step).padStart(2, "0")}] 状态=${room.status} 轮到=${curText} 顶牌=${topText} 指定色=${active} pending=${room.pendingDraw.type ?? "无"}/${room.pendingDraw.count}`,
  );
  console.log(`     ${msg}`);
}

async function main() {
  // 固定随机种子，保证“发牌/选庄”等随机结果可复现
  const seed = 20260415;
  const saved = Math.random;
  Math.random = mulberry32(seed);

  try {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "ROOM1");
    const gameSvc = new GameService(repo);

    const hostId = "p1";
    const p2Id = "p2";
    const p3Id = "p3";
    const p4Id = "p4";
    const { roomId } = await roomSvc.createRoom({ hostId, hostName: "玩家A", dealerMode: "host" });
    await roomSvc.joinRoom({ roomId, playerId: p2Id, name: "玩家B" });
    await roomSvc.joinRoom({ roomId, playerId: p3Id, name: "玩家C" });
    await roomSvc.joinRoom({ roomId, playerId: p4Id, name: "玩家D" });
    await roomSvc.startRoom({ roomId, playerId: hostId });

    let room = (await readRoom(repo, roomId))!;
    let step = 1;
    logStep(step++, room, `创建房间并开始游戏：roomId=${roomId}`);

    await gameSvc.deal({ roomId, playerId: hostId });
    room = (await readRoom(repo, roomId))!;
    logStep(step++, room, `庄家发牌完成`);

    // 简单策略：能出就出；否则摸；摸完若仍不能出则 skip；遇到 pendingDraw 先 accept。
    // 用 while 跑到 finished，并保留 maxSteps 避免死循环。
    const maxSteps = 800;
    let guard = 0;
    while (guard++ < maxSteps) {
      room = (await readRoom(repo, roomId))!;
      if (!room) throw new Error("room missing");
      if (room.status === "finished" || room.status === "ended") break;
      if (room.status !== "playing") {
        logStep(step++, room, `当前状态非 playing，停止模拟`);
        break;
      }

      const current = room.players[room.currentPlayerIndex]!;
      const pid = current.id;

      // pendingDraw 优先处理：直接 accept
      if (room.pendingDraw.count > 0) {
        logStep(step++, room, `轮到 ${playerLabel(room, pid)}，动作：接受惩罚摸牌（${room.pendingDraw.type} x${room.pendingDraw.count}）`);
        await gameSvc.acceptDraw({ roomId, playerId: pid });
        continue;
      }

      const hand = await readHand(repo, roomId, pid);
      const top = getTopCard(room)!;

      // 找一张可出的牌
      let playableIndex = -1;
      for (let idx = 0; idx < hand.length; idx++) {
        const c = hand[idx]!;
        if (isPlayable(c, top, room.chosenColor)) {
          playableIndex = idx;
          break;
        }
      }

      if (playableIndex >= 0) {
        const c = hand[playableIndex]!;
        const chosenColor =
          c.type === "wild" || c.type === "wild_draw_four"
            ? ("red" as const) // 简化：固定选红
            : null;
        logStep(
          step++,
          room,
          `轮到 ${playerLabel(room, pid)}，动作：出牌（${cardToText(c)}${chosenColor ? `，选色=${"红"}` : ""}）`,
        );
        await gameSvc.playCard({ roomId, playerId: pid, cardIndex: playableIndex, chosenColor });
        continue;
      }

      // 没牌可出：摸一张
      const beforeDrawHand = await readHand(repo, roomId, pid);
      logStep(step++, room, `轮到 ${playerLabel(room, pid)}，动作：摸牌`);
      await gameSvc.drawCard({ roomId, playerId: pid });

      // 摸完再尝试出牌，否则跳过
      const roomAfterDraw = (await readRoom(repo, roomId))!;
      const handAfterDraw = await readHand(repo, roomId, pid);
      const drawn = findNewCard(beforeDrawHand, handAfterDraw);
      if (drawn) {
        logStep(step++, roomAfterDraw, `摸到：${cardToText(drawn)}`);
      }
      const topAfterDraw = getTopCard(roomAfterDraw)!;
      let playableAfterDraw = -1;
      for (let idx = 0; idx < handAfterDraw.length; idx++) {
        const c = handAfterDraw[idx]!;
        if (isPlayable(c, topAfterDraw, roomAfterDraw.chosenColor)) {
          playableAfterDraw = idx;
          break;
        }
      }

      if (playableAfterDraw >= 0) {
        const c = handAfterDraw[playableAfterDraw]!;
        const chosenColor =
          c.type === "wild" || c.type === "wild_draw_four" ? ("red" as const) : null;
        logStep(
          step++,
          roomAfterDraw,
          `轮到 ${playerLabel(roomAfterDraw, pid)}，动作：出牌（${cardToText(c)}${chosenColor ? `，选色=${"红"}` : ""}）`,
        );
        await gameSvc.playCard({ roomId, playerId: pid, cardIndex: playableAfterDraw, chosenColor });
      } else {
        logStep(step++, roomAfterDraw, `轮到 ${playerLabel(roomAfterDraw, pid)}，动作：跳过`);
        await gameSvc.skip({ roomId, playerId: pid });
      }
    }

    room = (await readRoom(repo, roomId))!;
    if (room) {
      console.log(`\n=== 结束 ===`);
      if (room.status !== "finished") {
        console.log(`（未在 maxSteps=${maxSteps} 内结束，可能需要调大上限或改策略）`);
      }
      console.log(`状态=${room.status} 局数=${room.currentRound} 分数=${JSON.stringify(room.scores)} 本局赢家=${room.roundWinnerId ?? "无"}`);
    }
  } finally {
    Math.random = saved;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

