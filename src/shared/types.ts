export type RoomStatus =
  /** 等待玩家加入/调整 AI */
  | "waiting"
  /** 选庄阶段（摸牌比大小） */
  | "choosing_dealer"
  /** 等待庄家点击发牌 */
  | "dealing"
  /** 对战中 */
  | "playing"
  /** 暂停（真人断线等待重连） */
  | "paused"
  /** 单局结束（可结算/可开始下一局） */
  | "finished"
  /** 房间归档结束（超时或手动结束，不再继续） */
  | "ended";

export type DealerMode = "host" | "draw_compare";

export type CardType =
  | "number"
  | "skip"
  | "reverse"
  | "draw_two"
  | "wild"
  | "wild_draw_four";

export type CardColor = "red" | "yellow" | "green" | "blue" | null;

export type Card = {
  type: CardType;
  color: CardColor;
  /**
   * Only used when type === "number".
   * For all other card types this MUST be null.
   */
  value: number | null;
};

export type Player = {
  id: string;
  name: string;
  isAI: boolean;
};

export type PendingDrawType = "draw_two" | "wild_draw_four" | null;

export type PendingDraw =
  | {
      /** 无叠加惩罚 */
      count: 0;
      type: null;
    }
  | {
      /** +2 叠加惩罚 */
      count: number;
      type: "draw_two";
    }
  | {
      /**
       * +4 叠加惩罚。
       *
       * sourceColor：出这张 +4 之前桌面的“有效颜色”（用于后续质疑判定）。
       */
      count: number;
      type: "wild_draw_four";
      sourceColor: Exclude<CardColor, null>;
    };

export type LastAction =
  | {
      /** 某玩家打出一张牌（可能附带 chosenColor） */
      type: "card_played";
      by: string;
      card: Card;
      chosenColor?: Exclude<CardColor, null>;
      /** 服务器时间戳（ms） */
      at: number;
    }
  | {
      /** 房主开始游戏（进入选庄或发牌阶段） */
      type: "game_started";
      by: string;
      at: number;
    }
  | {
      /** 选庄阶段：某玩家抽取了选庄牌 */
      type: "dealer_card_drawn";
      by: string;
      card: Card;
      at: number;
    }
  | {
      /** 发牌完成并翻出起始牌 */
      type: "dealt";
      by: string;
      initialCard: Card;
      at: number;
    }
  | {
      /** 开始下一局（上一局赢家成为庄家） */
      type: "next_round_started";
      by: string;
      dealerId: string;
      currentRound: number;
      at: number;
    }
  | {
      /** 手动结束整场游戏/房间归档 */
      type: "game_ended";
      by: string;
      at: number;
    }
  | { type: "card_drawn"; by: string; at: number }
  | { type: "skipped"; by: string; at: number }
  | {
      /** 接受 +2/+4 惩罚并完成摸牌 */
      type: "accepted_draw";
      by: string;
      drawType: Exclude<PendingDrawType, null>;
      count: number;
      at: number;
    }
  | {
      /** +4 质疑结果 */
      type: "challenge_result";
      by: string;
      targetId: string;
      result: "success" | "fail";
      at: number;
    };

export type PublicRoomDoc = {
  /** 房间号（与文档 id 一致，便于客户端展示） */
  roomId: string;

  /** 房主（可开始游戏、增删 AI、开始下一局等） */
  hostId: string;
  /** 庄家选择方式 */
  dealerMode: DealerMode;
  /** 当前庄家玩家 ID */
  dealerId: string;
  /** 选庄摸牌结果（简化版：10 张不重复数字牌，理论无平局） */
  dealerDrawResults: Record<string, Card> | null;

  /** 房间/牌局状态 */
  status: RoomStatus;
  /** 玩家列表（按加入时间排序，房主第一，AI 最后） */
  players: Player[];

  /** 弃牌堆（公开） */
  discardPile: Card[];
  /** 万能牌后指定颜色（非万能牌为 null） */
  chosenColor: Exclude<CardColor, null> | null;

  /** 当前出牌人在 players 中的索引 */
  currentPlayerIndex: number;
  /** 出牌方向：1 顺时针，-1 逆时针 */
  direction: 1 | -1;

  /** 叠加摸牌状态 */
  pendingDraw: PendingDraw;

  /** 摸牌堆剩余张数（不暴露具体牌序） */
  drawPileCount: number;
  /** 各玩家手牌数量（不暴露内容） */
  handCounts: Record<string, number>;

  /** 各玩家累计得分 */
  scores: Record<string, number>;
  /** 当前局数（从 1 开始） */
  currentRound: number;
  /**
   * 本局赢家玩家 ID（仅 status="finished" 时应为非 null）。
   *
   * 用途：开始下一局时把赢家设为新庄家。
   */
  roundWinnerId: string | null;

  /** 当前玩家本回合是否已摸过牌（用于校验 skip，支持刷新/重连后继续） */
  hasDrawnThisTurn: boolean;
  /** 房间状态版本号（每次服务端状态写入 +1，用于并发控制/幂等） */
  roomVersion: number;

  /** 最近一次操作（用于 UI 提示/动效触发/调试） */
  lastAction: LastAction | null;

  /** 断线玩家 ID（无断线为 null） */
  disconnectedPlayerId: string | null;
  /** 暂停截止时间戳（ms），客户端用 pauseUntil - now 算倒计时 */
  pauseUntil: number | null;
};

