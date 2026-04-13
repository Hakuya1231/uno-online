# UNO 在线联机 - 数据模型

## 卡牌（Card）

| 字段 | 类型 | 说明 |
|------|------|------|
| type | `"number" \| "skip" \| "reverse" \| "draw_two" \| "wild" \| "wild_draw_four"` | 牌类型 |
| color | `"red" \| "yellow" \| "green" \| "blue" \| null` | 牌颜色，万能牌为 null |
| value | `0-9 \| "跳过" \| "反转" \| "+2" \| "变色" \| "+4"` | 面值或中文名称 |

示例：

```json
{ "type": "number", "color": "red", "value": 7 }
{ "type": "skip", "color": "blue", "value": "跳过" }
{ "type": "reverse", "color": "green", "value": "反转" }
{ "type": "draw_two", "color": "yellow", "value": "+2" }
{ "type": "wild", "color": null, "value": "变色" }
{ "type": "wild_draw_four", "color": null, "value": "+4" }
```

牌的功能效果由游戏逻辑代码根据 type 执行，不存储在数据中。

## 玩家（Player）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识（真人为 Firebase Auth uid，AI 为生成的 uuid） |
| name | string | 昵称（随机生成，可修改） |
| isAI | boolean | 是否为 AI 玩家 |

## 牌局/房间（Game）

### 属性

| 字段 | 类型 | 说明 |
|------|------|------|
| roomId | string | 房间号 |
| hostId | string | 房主玩家 ID |
| dealerMode | `"host" \| "draw_compare"` | 庄家选择方式（房主当庄家 / 摸牌比大小） |
| dealerId | string | 庄家玩家 ID |
| status | `"waiting" \| "playing" \| "finished"` | 房间状态 |
| players | Player[] | 玩家列表（按加入时间排序，房主第一，AI 排最后） |
| drawPile | Card[] | 摸牌堆 |
| discardPile | Card[] | 弃牌堆 |
| chosenColor | `"red" \| "yellow" \| "green" \| "blue" \| null` | 万能牌出牌后指定的颜色，非万能牌时为 null |
| currentPlayerIndex | number | 当前出牌人在玩家列表中的索引 |
| direction | `1 \| -1` | 出牌方向（1 顺时针，-1 逆时针） |
| pendingDraw | number | 叠加累计摸牌数（+2/+4 叠加时累积，默认 0） |
| hands | Map\<playerId, Card[]\> | 各玩家手牌 |
| scores | Map\<playerId, number\> | 各玩家累计得分 |
| currentRound | number | 当前局数 |

### 方法

#### 全局级

| 方法 | 入参 | 出参 | 说明 |
|------|------|------|------|
| 生成随机昵称 | 无 | string | 6-10 个中文字符 |
| 匿名登录 | 无 | playerId | 首次进入时自动触发，登录态持久化到浏览器 |
| 复制房间号/链接 | 无 | 无 | 复制到剪切板 |

#### 房间级

| 方法 | 入参 | 出参 | 说明 |
|------|------|------|------|
| 创建房间 | 庄家选择方式 | roomId | hostId 从 auth context 获取 |
| 加入房间 | roomId | 房间信息 | playerId 从 auth context 获取 |
| 订阅房间状态 | roomId | 实时房间信息 | Firestore onSnapshot 实时监听 |
| 添加 AI | roomId | Player | 需校验总人数 <= 8 |
| 移除 AI | roomId, playerId | 无 | |
| 开始游戏 | roomId | 无 | 需校验人数 >= 2，仅房主可操作 |

#### 牌局级

待讨论。
