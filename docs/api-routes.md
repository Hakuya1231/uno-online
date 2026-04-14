# UNO 在线联机 - 服务端 API Routes

所有接口的 playerId 统一从 Firebase Auth token 中获取（客户端请求时带上 Authorization header）。

通用流程：验证 Auth token → 从 Firestore 读取房间数据 → 校验权限和状态 → 执行游戏逻辑 → 更新 Firestore → 返回结果

除质疑接口外，所有接口响应均为 `{}`，数据变化由 onSnapshot 推送给客户端。

## 房间级


| 名称    | 方法     | 路由                | 请求体                    | 响应           | 权限/校验                     | 数据行为                                                                                                                                                            |
| ----- | ------ | ----------------- | ---------------------- | ------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 创建房间  | POST   | `/api/room`       | `{ dealerMode }`       | `{ roomId }` | 已登录                       | 创建房间文档，初始化所有字段为默认值，status=waiting，players=[房主]                                                                                                                  |
| 加入房间  | POST   | `/api/room/join`  | `{ roomId }`           | `{}`         | 已登录，房间存在，状态为 waiting，人数未满 | 将玩家追加到 players 数组                                                                                                                                               |
| 添加 AI | POST   | `/api/room/ai`    | `{ roomId }`           | `{}`         | 仅房主，总人数 <= 8              | 生成 AI 玩家，追加到 players 数组末尾                                                                                                                                       |
| 移除 AI | DELETE | `/api/room/ai`    | `{ roomId, playerId }` | `{}`         | 仅房主，目标是 AI                | 从 players 数组中移除该 AI                                                                                                                                             |
| 开始游戏  | POST   | `/api/room/start` | `{ roomId }`           | `{}`         | 仅房主，人数 >= 2               | dealerMode=host 时：设 dealerId=hostId，status=dealing；dealerMode=draw_compare 时：生成 **10 张不重复的数字牌**（0-9）洗牌写入 private/gameData.dealerDrawPile，status=choosing_dealer |


## 牌局级


| 名称    | 方法   | 路由                          | 请求体                                   | 响应                 | 权限/校验                       | 数据行为                                                                                                                                                                                                         |
| ----- | ---- | --------------------------- | ------------------------------------- | ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 选庄摸牌  | POST | `/api/game/draw-for-dealer` | `{ roomId }`                          | `{}`               | 状态为 choosing_dealer         | 从 private/gameData.dealerDrawPile 抽一张写入 dealerDrawResults[playerId]；全部玩家摸完后比较大小：有唯一最大则设 dealerId，清除 dealerDrawResults 和 dealerDrawPile，status=dealing（不处理平局重摸；按“10 张不重复数字牌”保证无平局）                            |
| 庄家发牌  | POST | `/api/game/deal`            | `{ roomId }`                          | `{}`               | 仅庄家，状态为 dealing             | 洗牌生成 108 张，每人发 7 张写入 hands 子集合，剩余写入 private/gameData.drawPile，翻起始牌写入 discardPile，更新 drawPileCount、handCounts，设 currentPlayerIndex=庄家下一位，direction=1，status=playing                                           |
| 出牌    | POST | `/api/game/play-card`       | `{ roomId, cardIndex, chosenColor? }` | `{}`               | 轮到该玩家，牌合法                   | 从手牌移除该牌，加入 discardPile，更新 chosenColor，处理功能牌效果（跳过/反转/+2/+4），更新 currentPlayerIndex、direction、pendingDraw（结构化）、handCounts、drawPileCount，检测 UNO 和胜负；若玩家出完手牌则计算本局得分更新 scores，status=finished；并重置 hasDrawnThisTurn |
| 摸牌    | POST | `/api/game/draw-card`       | `{ roomId }`                          | `{}`               | 轮到该玩家                       | 从 drawPile 取一张加入该玩家手牌，更新 drawPileCount、handCounts，设 hasDrawnThisTurn=true；若牌堆耗尽则洗弃牌堆                                                                                                                         |
| 跳过    | POST | `/api/game/skip`            | `{ roomId }`                          | `{}`               | 轮到该玩家，hasDrawnThisTurn=true | 更新 currentPlayerIndex 到下一位，并重置 hasDrawnThisTurn=false                                                                                                                                                        |
| 接受    | POST | `/api/game/accept`          | `{ roomId }`                          | `{}`               | 该玩家被 +2/+4                  | 从 drawPile 取 pendingDraw.count 张牌加入手牌，pendingDraw 归零为 `{count:0,type:null}`，更新 handCounts、drawPileCount，跳过回合，并重置 hasDrawnThisTurn=false                                                                      |
| 质疑    | POST | `/api/game/challenge`       | `{ roomId }`                          | `{ hand, result }` | 该玩家被 +4                     | 读取上家手牌判断合法性，质疑成功：上家摸 4 张、+4 从 discardPile 收回到上家手牌，更新 discardPile；质疑失败：质疑者摸 6 张，跳过回合。更新相关手牌、handCounts、drawPileCount                                                                                          |
| 开始下一局 | POST | `/api/game/next-round`      | `{ roomId }`                          | `{}`               | 仅房主，状态为 finished            | 保留 players 和 scores，重置牌堆、手牌、currentRound+1，上局胜者为庄家（dealerId=胜者），status=dealing                                                                                                                               |
| 结束游戏  | POST | `/api/game/end`             | `{ roomId }`                          | `{}`               | 已登录（可选：仅房主）                 | **归档房间**：更新 `status="ended"`，并清除客户端本地 roomId；不删除 Firestore 数据（后续如需可做定时清理）                                                                                                                                    |


## 断线相关


| 名称   | 方法   | 路由                    | 请求体                                | 响应   | 权限/校验                   | 数据行为                                                                                                                           |
| ---- | ---- | --------------------- | ---------------------------------- | ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 暂停游戏 | POST | `/api/game/pause`     | `{ roomId, disconnectedPlayerId }` | `{}` | 幂等：状态为 playing 或 paused | 若 playing：设 status=paused，写入 disconnectedPlayerId，pauseUntil=now+30s；若已 paused：直接返回成功（不覆盖已存在的 disconnectedPlayerId/pauseUntil） |
| 重连   | POST | `/api/game/reconnect` | `{ roomId }`                       | `{}` | 状态为 paused，是断线玩家本人      | 设 status=playing，清除 disconnectedPlayerId 和 pauseUntil                                                                          |
| 超时结束 | POST | `/api/game/timeout`   | `{ roomId }`                       | `{}` | 状态为 paused，已超时，幂等处理     | 设 status=finished；**本局作废**（不计算本局得分，不变更 scores），写入 lastAction=timed_out_void_round                                              |


