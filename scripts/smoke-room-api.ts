import dotenv from "dotenv";
import path from "node:path";
import { getAdminAuth } from "../src/server/firebase/admin.ts";

// 允许从本地 .env.local / .env 读取配置（不覆盖已存在的 process.env）
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: false });

type Env = {
  baseUrl: string;
  apiKey: string;
};

function getEnv(): Env {
  const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const apiKey = process.env.FIREBASE_WEB_API_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("缺少环境变量：FIREBASE_WEB_API_KEY（或 NEXT_PUBLIC_FIREBASE_API_KEY）");
  }
  return { baseUrl, apiKey };
}

function randomId(prefix: string) {
  const rand = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now()}_${rand}`;
}

async function exchangeCustomTokenForIdToken(apiKey: string, customToken: string): Promise<string> {
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`换取 idToken 失败：${text || resp.status}`);
  }

  const json = JSON.parse(text) as { idToken?: string };
  if (!json.idToken) throw new Error("换取 idToken 失败：响应缺少 idToken");
  return json.idToken;
}

async function authedPost(baseUrl: string, path: string, idToken: string, body: unknown) {
  const resp = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`POST ${path} 失败：HTTP ${resp.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const { baseUrl, apiKey } = getEnv();

  // 创建两个临时用户（避免污染你当前浏览器会话）
  const hostUid = randomId("smoke_host");
  const p2Uid = randomId("smoke_p2");

  const hostCustomToken = await getAdminAuth().createCustomToken(hostUid);
  const p2CustomToken = await getAdminAuth().createCustomToken(p2Uid);

  const hostIdToken = await exchangeCustomTokenForIdToken(apiKey, hostCustomToken);
  const p2IdToken = await exchangeCustomTokenForIdToken(apiKey, p2CustomToken);

  console.log(`[smoke] baseUrl=${baseUrl}`);
  console.log(`[smoke] hostUid=${hostUid}`);
  console.log(`[smoke] p2Uid=${p2Uid}`);

  // 1) create room
  const created = (await authedPost(baseUrl, "/api/room", hostIdToken, {
    hostName: "房主冒烟测试",
    dealerMode: "host",
  })) as { roomId: string };
  if (!created.roomId) throw new Error("createRoom 返回缺少 roomId");
  console.log(`[smoke] created roomId=${created.roomId}`);

  // 2) join room (player2)
  await authedPost(baseUrl, "/api/room/join", p2IdToken, { roomId: created.roomId, name: "玩家2冒烟测试" });
  console.log(`[smoke] p2 joined`);

  // 3) start room (host)
  await authedPost(baseUrl, "/api/room/start", hostIdToken, { roomId: created.roomId });
  console.log(`[smoke] room started`);

  console.log("[smoke] ✅ room APIs ok");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

