import { randomBytes } from "crypto";

/**
 * 房间号字符集：
 * - 仅大写字母 + 数字
 * - 去掉易混淆字符：I/O/0/1
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomId(length = 6): string {
  // 长度做硬约束：太短易碰撞，太长不利于输入
  if (!Number.isFinite(length) || length < 4 || length > 12) {
    throw new Error("roomId 长度非法");
  }

  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

