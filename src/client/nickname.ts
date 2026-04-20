import { uniqueNamesGenerator } from "unique-names-generator";

/**
 * 中二风随机昵称生成器（可自行扩充词库）。
 *
 * 风格：
 * - 「称号 + 连接词 + 核心名词 + 后缀」的组合
 * - 尽量控制长度，避免太长影响 UI
 */

const titles = [
  "漆黑",
  "苍蓝",
  "赤红",
  "纯白",
  "银翼",
  "绯月",
  "夜鸦",
  "星辉",
  "深渊",
  "终焉",
  "虚无",
  "断罪",
  "裁决",
  "观测",
  "封印",
  "禁忌",
  "黄昏",
  "黎明",
  "极光",
  "暗影",
];

const linkers = ["の", "·", "", ""];

const cores = [
  "终焉使徒",
  "堕天之翼",
  "夜之支配者",
  "第七观测者",
  "魔导书持有者",
  "断罪之刃",
  "幻影旅人",
  "星界旅者",
  "深渊回响",
  "虚空行者",
  "裁决者",
  "封印执行者",
  "禁忌司书",
  "影之眷属",
  "时之守望者",
  "月下歌姬",
  "孤高剑士",
  "暗夜猎手",
  "命运编织者",
  "无名之王",
];

const suffixes = ["", "", "", "α", "β", "Ω", "Mk.II", "EX", "改", "Ver.2"];

function clampNickname(s: string, maxLen: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

export function randomChuunibyouNickname(opts?: { maxLen?: number }): string {
  const maxLen = opts?.maxLen ?? 10;
  const raw = uniqueNamesGenerator({
    dictionaries: [titles, linkers, cores, suffixes],
    separator: "",
  });

  return clampNickname(raw, maxLen);
}

