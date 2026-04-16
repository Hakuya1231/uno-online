import type { Card, PublicRoomDoc } from "../src/shared/types.ts";
import { isPlayable } from "../src/server/engine/rules.ts";
import { InMemoryRoomRepo } from "../src/server/repos/inMemoryRoomRepo.ts";
import { GameService } from "../src/server/services/gameService.ts";
import { RoomService } from "../src/server/services/roomService.ts";

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

function getTopCard(room: PublicRoomDoc): Card | null {
  return room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1]! : null;
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

function findNewCards(before: readonly Card[], after: readonly Card[]): Card[] {
  if (after.length <= before.length) return [];
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
  const out: Card[] = [];
  for (const [k, v] of counts.entries()) {
    for (let i = 0; i < v; i++) out.push(JSON.parse(k) as Card);
  }
  return out;
}

function colorText(c: PublicRoomDoc["chosenColor"]): string {
  if (!c) return "（无）";
  return c === "red" ? "红" : c === "yellow" ? "黄" : c === "green" ? "绿" : "蓝";
}

function logRoom(step: number, room: PublicRoomDoc, msg: string) {
  const top = getTopCard(room);
  const topText = top ? cardToText(top) : "（无）";
  const current = room.players[room.currentPlayerIndex];
  const curText = current ? `${current.name}(${current.id})` : "（无）";
  console.log(
    `[${String(step).padStart(2, "0")}] 状态=${room.status} 轮到=${curText} 顶牌=${topText} 指定色=${colorText(room.chosenColor)} pending=${room.pendingDraw.type ?? "无"}/${room.pendingDraw.count}`,
  );
  console.log(`     ${msg}`);
}

async function readRoom(repo: InMemoryRoomRepo, roomId: string) {
  return await repo.runTransaction((tx) => repo.getRoom(tx, roomId));
}

async function readPrivateGameData(repo: InMemoryRoomRepo, roomId: string) {
  return await repo.runTransaction((tx) => repo.getPrivateGameData(tx, roomId));
}

async function readHand(repo: InMemoryRoomRepo, roomId: string, playerId: string) {
  return await repo.runTransaction((tx) => repo.getHand(tx, roomId, playerId));
}

async function main() {
  const seed = 20260415;
  const saved = Math.random;
  Math.random = mulberry32(seed);

  try {
    const repo = new InMemoryRoomRepo();
    const roomSvc = new RoomService(repo, () => "ROOM_DC");
    const gameSvc = new GameService(repo);

    const ids = [
      { id: "p1", name: "玩家A" },
      { id: "p2", name: "玩家B" },
      { id: "p3", name: "玩家C" },
      { id: "p4", name: "玩家D" },
    ] as const;

    const { roomId } = await roomSvc.createRoom({
      hostId: ids[0].id,
      hostName: ids[0].name,
      dealerMode: "draw_compare",
    });
    for (const p of ids.slice(1)) {
      await roomSvc.joinRoom({ roomId, playerId: p.id, name: p.name });
    }

    await roomSvc.startRoom({ roomId, playerId: ids[0].id });
    let step = 1;
    let room = (await readRoom(repo, roomId))!;
    logRoom(step++, room, `创建房间（draw_compare）并开始游戏：roomId=${roomId}`);

    // 选庄摸牌：每人摸一张
    while (true) {
      room = (await readRoom(repo, roomId))!;
      if (room.status !== "choosing_dealer") break;
      for (const p of room.players) {
        if (room.status !== "choosing_dealer") break;
        if (room.dealerDrawResults?.[p.id]) continue;
        // 重要：最后一位玩家摸完后，engine 可能立刻清空 dealerDrawResults 并切到 dealing，
        // 这里先从 private 里偷看下一张“将要抽到的牌”，确保日志一定能打印出来。
        const priv = await readPrivateGameData(repo, roomId);
        const predicted = priv?.dealerDrawPile?.[0] ?? null;
        logRoom(step++, room, `选庄：${p.name}(${p.id}) 摸牌`);
        await gameSvc.drawForDealer({ roomId, playerId: p.id });
        room = (await readRoom(repo, roomId))!;
        const card = room.dealerDrawResults?.[p.id];
        if (card || predicted) {
          logRoom(step++, room, `选庄：${p.name} 摸到 ${cardToText(card ?? predicted!)}`);
        }
      }
    }

    room = (await readRoom(repo, roomId))!;
    logRoom(step++, room, `选庄结束：庄家=${room.dealerId}`);

    // 发牌
    await gameSvc.deal({ roomId, playerId: room.dealerId });
    room = (await readRoom(repo, roomId))!;
    logRoom(step++, room, `庄家发牌完成`);

    // 强制构造一次“+4 出牌 + 质疑”场景，保证日志里一定出现“变色 + 质疑”
    await repo.runTransaction(async (tx) => {
      const r = await repo.getRoom(tx, roomId);
      const priv = await repo.getPrivateGameData(tx, roomId);
      if (!r || !priv) throw new Error("missing room/private");

      const attackerId = r.players[0]!.id; // p1
      const challengerId = r.players[1]!.id; // p2

      await repo.updateRoom(tx, roomId, {
        ...r,
        status: "playing",
        currentPlayerIndex: 0,
        direction: 1,
        discardPile: [{ type: "number", color: "red", value: 7 }],
        chosenColor: null,
        pendingDraw: { count: 0, type: null },
        hasDrawnThisTurn: false,
        handCounts: { ...r.handCounts, [attackerId]: 2, [challengerId]: 1 },
      });

      // attacker 打 +4 并选红；challenger 手牌带 red（使 +4 不合法→质疑成功）
      await repo.setHands(tx, roomId, {
        [attackerId]: [
          { type: "wild_draw_four", color: null, value: null },
          { type: "number", color: "red", value: 1 },
        ],
        [challengerId]: [{ type: "number", color: "red", value: 3 }],
      });

      // 确保牌堆有足够牌给质疑成功时“被质疑者摸 4 张”
      if (priv.drawPile.length < 4) {
        await repo.updatePrivateGameData(tx, roomId, {
          ...priv,
          drawPile: [
            { type: "number", color: "green", value: 0 },
            { type: "number", color: "green", value: 1 },
            { type: "number", color: "green", value: 2 },
            { type: "number", color: "green", value: 3 },
            ...priv.drawPile,
          ],
        });
      }
    });

    room = (await readRoom(repo, roomId))!;
    logRoom(step++, room, `（强制场景）轮到 ${room.players[room.currentPlayerIndex]!.name} 出 +4 并变色`);
    await gameSvc.playCard({ roomId, playerId: room.players[room.currentPlayerIndex]!.id, cardIndex: 0, chosenColor: "red" });
    room = (await readRoom(repo, roomId))!;
    logRoom(step++, room, `（强制场景）下一位尝试质疑 +4`);
    const challengerId = room.players[room.currentPlayerIndex]!.id;
    const beforeChallengerHand = await readHand(repo, roomId, challengerId);
    const beforeTargetHand = await readHand(repo, roomId, room.players[0]!.id);
    const challenge = await gameSvc.challengeWildDrawFour({ roomId, playerId: challengerId });
    room = (await readRoom(repo, roomId))!;
    logRoom(step++, room, `质疑结果：${challenge.result} target=${challenge.targetId}`);
    if (challenge.result === "success") {
      const afterTargetHand = await readHand(repo, roomId, challenge.targetId);
      const gained = findNewCards(beforeTargetHand, afterTargetHand);
      if (gained.length > 0) {
        logRoom(step++, room, `被质疑者补牌：${gained.map(cardToText).join("、")}`);
      }
    } else {
      const afterChallengerHand = await readHand(repo, roomId, challengerId);
      const gained = findNewCards(beforeChallengerHand, afterChallengerHand);
      if (gained.length > 0) {
        logRoom(step++, room, `质疑者摸牌：${gained.map(cardToText).join("、")}`);
      }
    }

    // 继续跑到 finished
    const maxSteps = 1000;
    let guard = 0;
    while (guard++ < maxSteps) {
      room = (await readRoom(repo, roomId))!;
      if (!room) throw new Error("room missing");
      if (room.status === "finished" || room.status === "ended") break;
      if (room.status === "dealing") {
        logRoom(step++, room, `状态=dealing，自动让庄家发牌`);
        await gameSvc.deal({ roomId, playerId: room.dealerId });
        continue;
      }
      if (room.status !== "playing") {
        logRoom(step++, room, `遇到未处理状态=${room.status}，跳过本轮循环继续观察`);
        continue;
      }

      const current = room.players[room.currentPlayerIndex]!;
      const pid = current.id;

      if (room.pendingDraw.count > 0) {
        // 对 +4：优先尝试质疑（展示一次即可），其他情况 accept
        if (room.pendingDraw.type === "wild_draw_four") {
          logRoom(step++, room, `轮到 ${current.name}，动作：质疑 +4`);
          try {
            const beforeChallenger = await readHand(repo, roomId, pid);
            const beforeTarget = await readHand(repo, roomId, room.players[((room.currentPlayerIndex + room.direction * -1) % room.players.length + room.players.length) % room.players.length]!.id);
            const res = await gameSvc.challengeWildDrawFour({ roomId, playerId: pid });
            room = (await readRoom(repo, roomId))!;
            logRoom(step++, room, `质疑结果：${res.result} target=${res.targetId}`);
            if (res.result === "success") {
              const afterTarget = await readHand(repo, roomId, res.targetId);
              const gained = findNewCards(beforeTarget, afterTarget);
              if (gained.length > 0) logRoom(step++, room, `被质疑者补牌：${gained.map(cardToText).join("、")}`);
            } else {
              const afterChallenger = await readHand(repo, roomId, pid);
              const gained = findNewCards(beforeChallenger, afterChallenger);
              if (gained.length > 0) logRoom(step++, room, `质疑者摸牌：${gained.map(cardToText).join("、")}`);
            }
          } catch (e) {
            logRoom(step++, room, `质疑失败（不满足条件），改为接受惩罚`);
            const before = await readHand(repo, roomId, pid);
            await gameSvc.acceptDraw({ roomId, playerId: pid });
            const after = await readHand(repo, roomId, pid);
            const gained = findNewCards(before, after);
            if (gained.length > 0) {
              room = (await readRoom(repo, roomId))!;
              logRoom(step++, room, `摸到：${gained.map(cardToText).join("、")}`);
            }
          }
        } else {
          logRoom(step++, room, `轮到 ${current.name}，动作：接受惩罚摸牌（${room.pendingDraw.type} x${room.pendingDraw.count}）`);
          const before = await readHand(repo, roomId, pid);
          await gameSvc.acceptDraw({ roomId, playerId: pid });
          const after = await readHand(repo, roomId, pid);
          const gained = findNewCards(before, after);
          if (gained.length > 0) {
            room = (await readRoom(repo, roomId))!;
            logRoom(step++, room, `摸到：${gained.map(cardToText).join("、")}`);
          }
        }
        continue;
      }

      const hand = await readHand(repo, roomId, pid);
      const top = getTopCard(room)!;

      let playableIndex = -1;
      for (let idx = 0; idx < hand.length; idx++) {
        if (isPlayable(hand[idx]!, top, room.chosenColor)) {
          playableIndex = idx;
          break;
        }
      }

      if (playableIndex >= 0) {
        const c = hand[playableIndex]!;
        const chosenColor =
          c.type === "wild" || c.type === "wild_draw_four" ? ("red" as const) : null;
        logRoom(step++, room, `轮到 ${current.name}，动作：出牌（${cardToText(c)}${chosenColor ? "，选色=红" : ""}）`);
        await gameSvc.playCard({ roomId, playerId: pid, cardIndex: playableIndex, chosenColor });
        continue;
      }

      logRoom(step++, room, `轮到 ${current.name}，动作：摸牌`);
      const beforeDraw = await readHand(repo, roomId, pid);
      await gameSvc.drawCard({ roomId, playerId: pid });

      const roomAfterDraw = (await readRoom(repo, roomId))!;
      const handAfterDraw = await readHand(repo, roomId, pid);
      const drawn = findNewCard(beforeDraw, handAfterDraw);
      if (drawn) {
        logRoom(step++, roomAfterDraw, `摸到：${cardToText(drawn)}`);
      }
      const topAfterDraw = getTopCard(roomAfterDraw)!;

      let playableAfterDraw = -1;
      for (let idx = 0; idx < handAfterDraw.length; idx++) {
        if (isPlayable(handAfterDraw[idx]!, topAfterDraw, roomAfterDraw.chosenColor)) {
          playableAfterDraw = idx;
          break;
        }
      }

      if (playableAfterDraw >= 0) {
        const c = handAfterDraw[playableAfterDraw]!;
        const chosenColor =
          c.type === "wild" || c.type === "wild_draw_four" ? ("red" as const) : null;
        logRoom(step++, roomAfterDraw, `轮到 ${current.name}，动作：出牌（${cardToText(c)}${chosenColor ? "，选色=红" : ""}）`);
        await gameSvc.playCard({ roomId, playerId: pid, cardIndex: playableAfterDraw, chosenColor });
      } else {
        logRoom(step++, roomAfterDraw, `轮到 ${current.name}，动作：跳过`);
        await gameSvc.skip({ roomId, playerId: pid });
      }
    }

    room = (await readRoom(repo, roomId))!;
    console.log(`\n=== 结束 ===`);
    if (room.status !== "finished" && room.status !== "ended") {
      console.log(`（未在 maxSteps=${maxSteps} 内结束：当前状态=${room.status}。将由房主执行 endGame 归档。）`);
      await gameSvc.endGame({ roomId, playerId: ids[0].id });
      room = (await readRoom(repo, roomId))!;
    }
    console.log(
      `状态=${room.status} 局数=${room.currentRound} 分数=${JSON.stringify(room.scores)} 本局赢家=${room.roundWinnerId ?? "无"}`,
    );
  } finally {
    Math.random = saved;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

