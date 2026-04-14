# UNO 在线联机 - 客户端方法

## 全局级

| 方法 | 入参 | 出参 | 说明 |
|------|------|------|------|
| 生成随机昵称 | 无 | string | 6-10 个中文字符，首次进入时自动触发，持久化到浏览器 |
| 匿名登录 | 无 | playerId | 首次进入时自动触发，登录态持久化到浏览器 |
| 复制房间号/链接 | 无 | 无 | 复制到剪切板 |

## 房间级

| 方法 | 入参 | 出参 | 说明 |
|------|------|------|------|
| 创建房间 | 庄家选择方式 | roomId | hostId 从 auth context 获取，roomId持久化到浏览器  |
| 加入房间 | roomId | 房间信息 | playerId 从 auth context 获取，roomId持久化到浏览器   |
| 订阅房间/牌局状态 | roomId | 实时推送 | Firestore onSnapshot，详见下方 |
| 订阅自己的手牌 | roomId | 实时推送 | Firestore onSnapshot，仅自己可读 |
| 添加 AI | roomId | Player | 需校验总人数 <= 8 |
| 移除 AI | roomId, playerId | 无 | |
| 开始游戏 | roomId | 无 | 需校验人数 >= 2，仅房主可操作 |


## 牌局级

| 方法 | 入参 | 出参 | 说明 |
|------|------|------|------|
| 选庄摸牌 | roomId | Card | 摸牌比大小模式下，每人摸一张数字牌 |
| 庄家发牌 | roomId | 无 | 发牌 + 自动翻起始牌，仅庄家可操作 |
| 出牌 | roomId, cardIndex, chosenColor? | 无 | chosenColor 仅万能牌时必传 |
| 摸牌 | roomId | Card | 从摸牌堆摸一张 |
| 跳过 | roomId | 无 | 摸牌后不出，跳过本回合 |
| 接受 | roomId | Card[] | 接受 +2/+4 惩罚，返回摸到的牌 |
| 质疑 | roomId | 上家手牌, 质疑结果 | 质疑 +4，手牌仅展示给质疑者（3 秒） |
| 开始下一局 | roomId | 无 | 仅房主可操作 |
| 结束游戏 | roomId | 无 | 清除浏览器缓存的 roomId |

### onSnapshot 推送内容

**房间/牌局文档（公开信息，所有玩家可见）：**

- hostId（房主）
- status（游戏状态）
- dealerMode（庄家选择方式）
- dealerId（庄家）
- players（玩家列表：昵称、是否 AI 等）
- currentPlayerIndex（轮到谁）
- direction（出牌方向）
- discardPile 顶牌（当前要匹配的牌）
- chosenColor（万能牌指定颜色）
- pendingDraw（累计摸牌数）
- drawPile 数量（摸牌堆剩余张数，不暴露具体牌）
- 各玩家手牌数量（不暴露内容）
- scores（各玩家累计得分）
- currentRound（当前局数）
- disconnectedPlayerId（断线玩家 ID）
- pauseUntil（暂停截止时间戳，客户端用 pauseUntil - now 算剩余秒数）

**自己的手牌（私密信息，仅自己可读）：**

- hands/{playerId}（自己的手牌列表）