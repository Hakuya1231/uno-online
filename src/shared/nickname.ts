import { uniqueNamesGenerator } from "unique-names-generator";

export type NicknameStyle = "cute" | "chuunibyou" | "mixed";

type NicknameGeneratorOptions = {
  maxLen?: number;
  style?: NicknameStyle;
};

const cuteTitles = [
  "奶糖",
  "棉花",
  "星星",
  "月亮",
  "桃桃",
  "莓莓",
  "糯米",
  "团子",
  "雪团",
  "果冻",
  "布丁",
  "泡芙",
  "软软",
  "绵绵",
  "铃兰",
  "小云",
  "晚风",
  "晴晴",
  "小桃",
  "白白",
  "团团",
  "甜筒",
  "芝芝",
  "柚柚",
];

const cuteLinkers = ["", "", "的", "小", "超"];

const cuteCores = [
  "小猫",
  "兔兔",
  "熊崽",
  "海豹",
  "水母",
  "布偶",
  "团雀",
  "奶盖",
  "曲奇",
  "云朵",
  "果果",
  "星砂",
  "甜莓",
  "棉球",
  "月饼",
  "铃铛",
  "糯团",
  "豆豆",
  "小狐",
  "灯笼",
  "桃心",
  "雨滴",
  "花卷",
  "毛球",
];

const cuteSuffixes = ["", "", "酱", "宝", "崽", "喵", "呀", "子"];

const chuunibyouTitles = [
  "漆黑",
  "苍蓝",
  "赤红",
  "纯白",
  "银烬",
  "绯月",
  "夜鸦",
  "星痕",
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
  "寂火",
  "霜歌",
  "天穹",
  "残响",
];

const chuunibyouLinkers = ["之", "·", "", ""];

const chuunibyouCores = [
  "使徒",
  "巡礼者",
  "观测者",
  "魔导书持有者",
  "断罪之刃",
  "幻影旅人",
  "星界来客",
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
  "终焉信使",
  "霜痕骑士",
  "秘仪观星者",
  "梦境漂流者",
  "夜色收束者",
];

const chuunibyouSuffixes = ["", "", "改", "式", "Mk.II", "EX", "Ver.2"];

function clampNickname(s: string, maxLen: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}

function buildNickname(style: Exclude<NicknameStyle, "mixed">) {
  if (style === "cute") {
    return uniqueNamesGenerator({
      dictionaries: [cuteTitles, cuteLinkers, cuteCores, cuteSuffixes],
      separator: "",
    });
  }

  return uniqueNamesGenerator({
    dictionaries: [chuunibyouTitles, chuunibyouLinkers, chuunibyouCores, chuunibyouSuffixes],
    separator: "",
  });
}

export function randomNickname(opts?: NicknameGeneratorOptions): string {
  const maxLen = opts?.maxLen ?? 12;
  const style = opts?.style ?? "cute";
  const resolvedStyle =
    style === "mixed" ? (Math.random() < 0.7 ? "cute" : "chuunibyou") : style;

  return clampNickname(buildNickname(resolvedStyle), maxLen);
}

export function randomCuteNickname(opts?: Omit<NicknameGeneratorOptions, "style">): string {
  return randomNickname({ ...opts, style: "cute" });
}

export function randomChuunibyouNickname(opts?: Omit<NicknameGeneratorOptions, "style">): string {
  return randomNickname({ ...opts, style: "chuunibyou" });
}
