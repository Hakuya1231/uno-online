# UNO 在线联机 - 安全规则与约束说明

本项目采用「客户端只读订阅 + 所有写操作走 API Routes」的模型，因此需要明确两类约束：

- Firestore / Realtime Database 安全规则（客户端能读写什么）
- 服务端 API 的权限与幂等约束（服务端如何保证一致性与防作弊）

## 一、Firestore 访问约束

### 公开房间文档 `rooms/{roomId}`

- **客户端可读**：房间公开状态（players、status、discardPile、handCounts、scores 等）
- **客户端不可写**：避免绕过服务端逻辑直接改状态（出牌、摸牌、加分、改当前玩家等）
- **服务端可写**：仅由 API Routes（Admin SDK）写入所有字段

### 私密牌堆 `rooms/{roomId}/private/gameData`

- **客户端不可读/不可写**：包含 `drawPile`、`dealerDrawPile` 等敏感信息
- **服务端可读/可写**：仅由 API Routes（Admin SDK）访问

### 手牌 `rooms/{roomId}/hands/{playerId}`

- **客户端可读**：仅允许读取自己的手牌文档（`hands/{myUid}`）
- **客户端不可读**：禁止读取其他玩家的手牌文档
- **客户端不可写**：避免手牌作弊
- **服务端可写**：仅由 API Routes 写入/更新手牌

> 备注：当前设定为“**昵称只在进入游戏阶段由客户端本地设置**（例如 localStorage），创建/加入房间后不允许再改”。因此不需要 `profiles/{playerId}` 这类可写资料文档，也不允许客户端直接改 `rooms/{roomId}.players[]`（避免篡改 isAI/host 等字段）。

## 二、Realtime Database Presence 约束

Presence 只用于在线状态：

- **客户端可写**：仅能写自己的 `/presence/{playerId}`（online、roomId）
- **客户端可读**：在同房间内读取其他真人玩家的 presence
- **服务端可选**：通常不需要写 presence

## 三、API Routes 权限与幂等约束

- **身份**：所有接口的 `playerId` 来自 Firebase Auth token（客户端不在 body 里传 playerId）
- **权限**：
  - 仅房主：添加/移除 AI、开始游戏、开始下一局
  - 仅庄家：发牌
  - 仅当前玩家：出牌/摸牌/跳过
  - 仅被惩罚玩家：接受/质疑
  - 仅断线玩家本人：重连
- **幂等**（至少建议做到以下程度）：
  - `/api/game/pause`：若已 paused 则直接返回成功，不覆盖已写入的断线信息
  - `/api/game/timeout`：若已 ended 则直接返回成功
  - 其他接口：使用 `roomVersion` / transaction 防重入与并发写冲突

## 四、roomVersion 的用途

`roomVersion` 是一个单调递增的版本号（每次服务端成功写入房间状态变更 +1），用来解决两类问题：

1. **并发控制**：两个请求几乎同时到达（比如双击按钮/网络重试/多端同时点击），可在 transaction 中校验“读到的 version 必须仍然是最新”，否则拒绝或重试，避免状态回退/覆盖。
2. **幂等与去重**：配合 `lastAction` 或 `requestId`（可选），可让服务端识别“同一动作被重复提交”，直接返回成功而不重复扣牌/重复摸牌。

## 五、各接口 Transaction 要求

本项目默认策略：

- **凡是会改动房间关键状态/手牌/牌堆的接口，一律使用 Firestore Transaction**，把“读取 → 校验 → 写入”放在同一个 transaction 中。
- 在 transaction 中更新 `rooms/{roomId}` 时，统一做 `roomVersion = roomVersion + 1`（客户端不需要传 `roomVersion`）。

### 房间级

- **创建房间 `/api/room`**：不需要（单次创建写入，不存在并发覆盖问题）
- **加入房间 `/api/room/join`**：需要（会并发抢位/重复加入，需要原子校验人数与状态）
- **添加 AI `/api/room/ai`**：需要（会并发超人数/重复添加，需要原子校验总人数）
- **移除 AI `/api/room/ai`（DELETE）**：需要（避免并发移除/状态变化导致列表覆盖）
- **开始游戏 `/api/room/start`**：需要（状态从 waiting→下一阶段，需要原子切换并初始化选庄/发牌前置数据）

### 牌局级

- **选庄摸牌 `/api/game/draw-for-dealer`**：需要（抽牌与写入结果必须原子，防重复抽/多人同时抽导致结果错乱）
- **庄家发牌 `/api/game/deal`**：需要（会写大量关键状态与多玩家手牌，必须保持一致）
- **出牌 `/api/game/play-card`**：需要（同时改手牌、弃牌堆、轮转、pendingDraw 等，必须原子）
- **摸牌 `/api/game/draw-card`**：需要（同时改牌堆与手牌，并设置 hasDrawnThisTurn，必须原子）
- **跳过 `/api/game/skip`**：需要（依赖 hasDrawnThisTurn 校验与轮转，避免并发覆盖）
- **接受 `/api/game/accept`**：需要（同时清 pendingDraw、从牌堆补牌、轮转，必须原子）
- **质疑 `/api/game/challenge`**：需要（会同时改多方手牌/牌堆/弃牌堆/轮转，必须原子）
- **开始下一局 `/api/game/next-round`**：需要（会重置房间与手牌/牌堆，必须一致）
- **结束游戏 `/api/game/end`**：建议（采用“归档”写入即可：标记 status=ended/archived=true；避免删除带来的误删/半删风险）

### 断线相关

- **暂停 `/api/game/pause`**：需要（幂等；多人同时触发暂停时避免互相覆盖）
- **重连 `/api/game/reconnect`**：需要（从 paused→playing 的状态切换必须原子）
- **超时 `/api/game/timeout`**：需要（幂等；从 paused→ended 的状态切换必须原子）

