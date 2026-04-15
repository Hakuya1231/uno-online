# UNO 在线联机 - 断线与重连

## 检测方案

使用 **Firebase Realtime Database** 的 Presence 系统检测玩家在线状态。

Realtime Database 仅用于 presence 这一个功能，游戏数据仍存储在 Firestore 中。

### 客户端连接时

1. 匿名登录成功后，向 Realtime Database 写入在线状态：`/presence/{playerId} = { online: true, roomId: "xxx" }`
2. 设置 `onDisconnect()`：连接断开时自动写入 `{ online: false }`

### 订阅 presence

进入房间后，每个客户端监听同房间所有**真人玩家**的 Realtime Database presence 状态（AI 不需要监听）。

### 检测到断线时

1. Realtime Database 服务器检测到客户端连接断开，自动触发 `onDisconnect()`
2. 同房间的其他客户端监听到该玩家 presence 变为 offline
3. 第一个检测到的客户端调用 API：暂停游戏
4. 服务端更新 Firestore：`status = "paused"`，`disconnectedPlayerId = 断线玩家 ID`，`pauseUntil = 当前时间 + 30秒`
5. 所有客户端通过 onSnapshot 收到暂停状态

## 暂停与倒计时

- 服务端不倒计时，只记录 `pauseUntil` 截止时间戳
- 各客户端根据 `pauseUntil - now` 计算剩余秒数并显示倒计时
- 使用截止时间戳而非倒计时数字，保证各客户端显示一致

## 重连

1. 断线玩家刷新页面或网络恢复后，Firebase Auth 自动恢复登录态
2. 从浏览器 localStorage 读取 roomId，重新订阅房间状态和手牌
3. 客户端检查 `pauseUntil`：
   - **未超时**（now < pauseUntil）：调用 API 通知服务端玩家已重连，服务端更新 `status = "playing"`，清除 `disconnectedPlayerId` 和 `pauseUntil`，游戏恢复
   - **已超时**（now >= pauseUntil）：调用 API，服务端更新 `status = "ended"`（房间归档）

## 超时未重连

1. 倒计时 30 秒结束，断线玩家仍未重连
2. 任意在线客户端调用 API：超时结束游戏
3. 服务端做幂等处理（已结束的游戏不会重复结束）
4. 更新 Firestore：`status = "ended"`（房间归档）

## 唯一真人玩家断线

如果房间里只有一个真人玩家且该玩家断线：
- 没有其他在线客户端触发暂停 API，但 `onDisconnect()` 仍会将 presence 标为 offline
- 玩家重连时，客户端检查 `pauseUntil` 判断是否超时，按上述重连逻辑处理
- 如果玩家永远不回来，房间变成孤儿数据，后期可做定时清理
