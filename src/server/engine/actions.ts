import type { Card, DealerMode, LastAction, PendingDraw, RoomStatus } from "@/shared";

/**
 * 引擎层动作（最小版）。
 *
 * 说明：
 * - action 只描述“意图”，不直接包含 Firestore 写入细节。
 * - playerId 由服务端鉴权得到，并在调用 reduce 前传入。
 */
export type EngineAction =
  | {
      type: "START_GAME";
      /** 房主玩家（鉴权得到） */
      playerId: string;
    }
  | {
      type: "DRAW_FOR_DEALER";
      /** 参与选庄摸牌的玩家 */
      playerId: string;
    }
  | {
      type: "DEAL";
      /** 发牌者（庄家） */
      playerId: string;
    }
  | {
      type: "NEXT_ROUND";
      /** 发起者（通常为房主） */
      playerId: string;
    }
  | {
      type: "END_GAME";
      /** 房主玩家（鉴权得到） */
      playerId: string;
    }
  | {
      /** 接受 +2/+4 惩罚并完成摸牌 */
      type: "ACCEPT_DRAW";
      /** 当前玩家（摸牌者/接受者） */
      playerId: string;
    }
  | {
      /** 质疑上一位玩家出的 +4 */
      type: "CHALLENGE_WILD_DRAW_FOUR";
      /** 当前玩家（质疑者） */
      playerId: string;
      /**
       * 被质疑者（上一位出 +4 的玩家）的手牌（服务端读库后传入）。
       * 引擎不主动读取其他玩家手牌，避免信息泄露。
       */
      targetHand: Card[];
    }
  | {
      type: "PLAY_CARD";
      /** 当前玩家（出牌者） */
      playerId: string;
      /** 在该玩家手牌数组中的索引 */
      cardIndex: number;
      /** 若打出万能牌，则必须指定颜色；否则为 null/undefined */
      chosenColor?: "red" | "yellow" | "green" | "blue" | null;
    }
  | {
      type: "DRAW_CARD";
      /** 当前玩家（摸牌者） */
      playerId: string;
    }
  | {
      type: "SKIP";
      /** 当前玩家（跳过者） */
      playerId: string;
    };

/**
 * reduce 的输入除了 action，还需要当前玩家的手牌。
 * 这里单独定义类型，便于 service 层把 `hands/{playerId}` 读出来喂给引擎。
 */
export type ReduceInput = {
  room: {
    roomId: string;
    status: RoomStatus;

    /** 房主玩家 ID */
    hostId: string;
    /** 庄家选择方式 */
    dealerMode: DealerMode;

    players: { id: string; isAI: boolean; name: string }[];
    currentPlayerIndex: number;
    direction: 1 | -1;

    discardPile: Card[];
    chosenColor: "red" | "yellow" | "green" | "blue" | null;

    pendingDraw: PendingDraw;
    hasDrawnThisTurn: boolean;

    drawPileCount: number;
    handCounts: Record<string, number>;
    roomVersion: number;

    /** 最近一次操作（用于 UI 提示/调试） */
    lastAction: LastAction | null;

    /** 庄家玩家 ID */
    dealerId: string;
    /** 选庄摸牌结果（playerId -> 抽到的牌） */
    dealerDrawResults: Record<string, Card> | null;

    /** 各玩家累计得分 */
    scores: Record<string, number>;
    /** 当前局数（从 1 开始） */
    currentRound: number;
    /** 本局赢家（仅 finished 时应为非 null） */
    roundWinnerId: string | null;
  };
  /**
   * 当前玩家的手牌（与 action.playerId 对应）。
   * 引擎不会读取其他玩家手牌，避免信息泄露。
   */
  hand: Card[];
  /**
   * 私密摸牌堆（服务端可见）。
   * 这里先用数组表示，后续可改为更高效的结构。
   */
  drawPile: Card[];

  /**
   * 选庄用抽牌堆（服务端私密）。
   * - 仅 status=choosing_dealer 时使用
   * - 其余状态应为 null
   */
  dealerDrawPile: Card[] | null;
};

