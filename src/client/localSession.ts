import type { User } from "firebase/auth";

/**
 * 本地会话存储（localStorage）。
 *
 * - token、userId、昵称都存到 localStorage
 * - token 可能会过期（约 1 小时），因此在每次拿到新 token 时覆盖写入
 */

const KEY_TOKEN = "uno:idToken";
const KEY_UID = "uno:userId";
const KEY_NAME = "uno:nickname";

export type LocalSession = {
  idToken: string;
  userId: string;
  nickname: string;
};

export function getSessionKeys() {
  return { KEY_TOKEN, KEY_UID, KEY_NAME };
}

export function loadLocalSession(): Partial<LocalSession> {
  if (typeof window === "undefined") return {};
  return {
    idToken: window.localStorage.getItem(KEY_TOKEN) ?? "",
    userId: window.localStorage.getItem(KEY_UID) ?? "",
    nickname: window.localStorage.getItem(KEY_NAME) ?? "",
  };
}

export function saveNickname(nickname: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_NAME, nickname);
}

export function saveAuthSession(input: { idToken: string; userId: string }) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_TOKEN, input.idToken);
  window.localStorage.setItem(KEY_UID, input.userId);
}

export async function syncAuthToLocalStorage(user: User): Promise<{ idToken: string; userId: string }> {
  const idToken = await user.getIdToken();
  const userId = user.uid;
  saveAuthSession({ idToken, userId });
  return { idToken, userId };
}

