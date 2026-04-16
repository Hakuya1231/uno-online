# UNO 在线联机 - 数据模型

## 卡牌（Card）


| 字段 | 类型 | 说明 |
|------|------|------|
| type | `"number" \| "skip" \| "reverse" \| "draw_two" \| "wild" \| "wild_draw_four"` | 牌类型 |
| color | `"red" \| "yellow" \| "green" \| "blue" \| null` | 牌颜色，万能牌为 null |
| value | `number \| null` | 仅数字牌（type=number）使用的面值（0-9）；其余牌为 null |


示例：

```json
{ "type": "number", "color": "red", "value": 7 }
{ "type": "skip", "color": "blue", "value": null }
{ "type": "reverse", "color": "green", "value": null }
{ "type": "draw_two", "color": "yellow", "value": null }
{ "type": "wild", "color": null, "value": null }
{ "type": "wild_draw_four", "color": null, "value": null }
```

牌的功能效果由游戏逻辑代码根据 type 执行，不存储在数据中。

## 玩家（Player）


| 字段   | 类型      | 说明                                       |
| ---- | ------- | ---------------------------------------- |
| id   | string  | 唯一标识（真人为 Firebase Auth uid，AI 为生成的 uuid） |
| name | string  | 昵称（随机生成，可修改）                             |
| isAI | boolean | 是否为 AI 玩家                                |


## Firestore 数据结构

```
rooms (集合)
  └── {roomId} (文档 - 公开信息，所有玩家可读)
        ├── 房间/牌局公开字段...
        │
        ├── private (子集合)
        │     └── gameData (文档 - 仅服务端可读写)
        │           └── drawPile: Card[]
        │
        └── hands (子集合)
              ├── {playerId} (文档 - 仅对应玩家可读)
              │     └── cards: Card[]
              ├── {playerId} ...
              └── ...
```

### 房间文档 `rooms/{roomId}`（公开信息）

所有玩家通过 onSnapshot 订阅，可见全部字段。


| 字段 | 类型 | 说明 |
|------|------|------|
| roomId | string | 房间号 |
| hostId | string | 房主玩家 ID |
| dealerMode | `"host" \| "draw_compare"` | 庄家选择方式（房主当庄家 / 摸牌比大小） |
| dealerId | string | 庄家玩家 ID |
| dealerDrawResults | `Record<string, Card> \| null` | 选庄摸牌结果（仅 draw_compare 模式，选庄完成后清除） |
| status | `"waiting" \| "choosing_dealer" \| "dealing" \| "playing" \| "paused" \| "finished" \| "ended"` | 房间状态（`ended` 表示已归档结束） |
| players | Player[] | 玩家列表（按加入时间排序，房主第一，AI 排最后） |
| discardPile | Card[] | 弃牌堆 |
| chosenColor | `"red" \| "yellow" \| "green" \| "blue" \| null` | 万能牌出牌后指定的颜色，非万能牌时为 null |
| currentPlayerIndex | number | 当前出牌人在玩家列表中的索引 |
| direction | `1 \| -1` | 出牌方向（1 顺时针，-1 逆时针） |
| pendingDraw | `PendingDraw` | 叠加累计摸牌；见下方结构（+4 会带 `sourceColor` 用于质疑判定） |
| drawPileCount | number | 摸牌堆剩余张数（不暴露具体牌） |
| handCounts | `Record<string, number>` | 各玩家手牌数量（不暴露内容） |
| scores | `Record<string, number>` | 各玩家累计得分 |
| currentRound | number | 当前局数 |
| hasDrawnThisTurn | boolean | 当前玩家本回合是否已经摸过牌（用于刷新/重连后仍能正确校验 skip） |
| roomVersion | number | 房间状态版本号（每次服务端成功写入状态变更 +1，用于并发控制与幂等） |
| lastAction | `LastAction \| null` | 最近一次操作（仅记录牌局过程相关，用于 UI 提示/动效触发/调试） |
| disconnectedPlayerId | string \| null | 断线玩家 ID，无断线时为 null |
| pauseUntil | number \| null | 暂停截止时间戳（毫秒） |


#### lastAction 结构（示例）

`lastAction` 主要用于“游戏过程中的 UI 提示/动效触发/调试”。

```ts
type LastAction =
  | { type: "card_played"; by: string; card: Card; chosenColor?: "red" | "yellow" | "green" | "blue"; at: number }
  | { type: "card_drawn"; by: string; at: number }
  | { type: "skipped"; by: string; at: number }
  | { type: "accepted_draw"; by: string; drawType: "draw_two" | "wild_draw_four"; count: number; at: number }
  | { type: "challenge_result"; by: string; targetId: string; result: "success" | "fail"; at: number };
```

#### pendingDraw 结构（示例）

`pendingDraw` 用于表示“累计惩罚摸牌”状态，并且把 `+4` 质疑所需的判定依据一起绑定在这段状态里。

```ts
type PendingDraw =
  | { count: 0; type: null }
  | { count: number; type: "draw_two" }
  | { count: number; type: "wild_draw_four"; sourceColor: "red" | "yellow" | "green" | "blue" };
```

### 私密文档 `rooms/{roomId}/private/gameData`（仅服务端）

仅服务端通过 Admin SDK 读写，客户端无权访问。


| 字段 | 类型 | 说明 |
|------|------|------|
| drawPile | Card[] | 摸牌堆具体内容 |
| dealerDrawPile | Card[] \| null | 选庄抽牌堆（仅 draw_compare 模式，选庄完成后为 null） |


### 手牌文档 `rooms/{roomId}/hands/{playerId}`（仅对应玩家可读）

每个玩家只能读自己的手牌文档。


| 字段    | 类型     | 说明       |
| ----- | ------ | -------- |
| cards | Card[] | 该玩家的手牌列表 |


