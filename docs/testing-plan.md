# UNO 在线联机 - 测试计划

本计划将测试分为三大块：**纯游戏逻辑单元测试**、**API 测试**、**E2E 交互测试**。按依赖与成本由下到上推进，先固化规则与状态机，再验证接口一致性，最后用少量端到端用例覆盖主路径。

相关文档：

- [游戏规则](game-rules.md)
- [数据模型](data-model.md)
- [服务端 API Routes](api-routes.md)
- [安全规则与约束说明](security-and-rules.md)
- [页面结构与组件](pages.md)

---

## 目标与原则

- **目标**：保证 UNO 规则、状态机、计分、断线暂停/归档等关键逻辑在重构与迭代中稳定可回归。
- **原则**：
  - 先写**用例清单**（Given/When/Then），再写实现与自动化测试（TDD-lite）。
  - 单元测试优先覆盖纯函数/纯模块，避免网络与时间依赖。
  - API 与状态变更使用 **Firestore Transaction + roomVersion**，测试中要覆盖幂等与并发边界（至少少量样例）。
  - E2E 保持少量，覆盖主路径即可，避免早期 UI 改动导致测试脆弱。
  - CI（持续集成）先不接入，待本地跑通后再配置。

---

## 一、纯游戏逻辑单元测试（优先）

### 范围

与 Firestore / HTTP / React 无关的纯 TypeScript 模块（建议抽为纯函数或类），例如：

- 牌组生成、洗牌
- 可出牌判定
- 轮转与方向
- `pendingDraw` 叠加与清零
- 起始牌翻堆规则
- 计分与胜负判定

### 建议用例（第一批）

对齐 [game-rules.md](game-rules.md)：

- **牌组**
  - 生成 108 张：每色数字牌数量正确、功能牌数量正确、万能牌数量正确
  - 洗牌不丢牌、不重复（可注入固定随机种子）
- **可出牌判定**
  - 颜色匹配：可出/不可出
  - 数字匹配：同数字不同色可出
  - 符号匹配：Skip/Reverse/+2 同类不同色可出
  - 万能牌：任意时刻可出；万能牌后需 `chosenColor`
- **起始牌规则**
  - 连续翻到非数字牌：应回底并继续翻，最终顶牌为数字牌
- **轮转**
  - 顺时针/逆时针索引计算（取模）
  - Skip 跳过下一位
  - Reverse 改变方向（若你保留“两人 Reverse 等价 Skip”，需单测覆盖）
- **叠加与惩罚**
  - +2 叠加：`pendingDraw={count:+2n,type:draw_two}` 逐步累加
  - +4 叠加：`pendingDraw={count:+4n,type:wild_draw_four}` 逐步累加
  - +2 与 +4 不互叠：非法动作应被拒绝
  - 接受惩罚后 `pendingDraw` 清零
- **质疑 +4**
  - 成功/失败两条路径：摸牌数量与轮转结果正确
  - 质疑成功时 +4 从弃牌堆收回（牌堆/弃牌堆一致性）
- **计分**
  - 数字/功能/万能牌计分正确
  - 单局结束更新胜者得分（累计）

### 工具与组织

- **测试框架**：Vitest
- **目录建议**：`src/lib/game/`（实现）+ `src/lib/game/__tests__/`（测试）
- **输出**：建议先把用例写到 `docs/test-cases.md`（纯文本用例，不写代码），后续实现时逐条转为自动化测试。

---

## 二、API 测试（集成）

### 范围

Next.js `app/api/**/route.ts` 的请求/响应、权限校验、事务一致性、幂等行为。

对齐：

- [api-routes.md](api-routes.md)
- [security-and-rules.md](security-and-rules.md)

### 运行环境

- **Firebase Emulator（官方现成组件）**：建议模拟 Firestore + Auth（Presence 用例可先不测）

### 必测项（首批）

- **鉴权**
  - 无 token / token 无效 → 401/403
- **权限**
  - 非房主调用：添加/移除 AI、开始游戏、开始下一局 → 403
  - 非庄家发牌 → 403
  - 非当前玩家出牌/摸牌/跳过 → 403/409
  - 非断线玩家调用重连 → 403
- **状态机**
  - waiting/choosing_dealer/dealing/playing/paused/finished/ended 的状态转换合法性
- **幂等**
  - `/api/game/pause`：重复触发不覆盖已存在断线信息
  - `/api/game/timeout`：已 ended 再调用直接成功返回
- **一致性**
  - 关键接口（deal/play/draw/accept/challenge）在 transaction 内同时更新：房间公开文档、private/gameData、hands 子集合，并保持 `roomVersion` 单调递增

---

## 三、E2E（交互测试）

### 范围

少量主路径，覆盖“能玩起来”，不追求所有规则的 UI 自动化。

对齐：

- [pages.md](pages.md)
- [user-flow.md](user-flow.md)

### 首批用例（建议 2～3 条）

- 首页可生成/修改昵称 → 创建房间 → 跳转到房间页显示 roomId
- 第二个浏览器上下文加入同房间 → 房间页玩家列表更新
- 进入游戏页后能看到关键 UI（弃牌堆、手牌、操作按钮区域）并能触发至少一次出牌流程（可用 stub/mock 降低依赖）

### 工具

- Playwright

---

## 执行顺序（建议）

1. 写 `docs/test-cases.md`（第一批规则用例清单）
2. 建立 `src/lib/game/` 纯逻辑模块并用 Vitest 跑通核心用例
3. 在 Emulator 下补齐关键 API 测试（鉴权/权限/状态/幂等/一致性）
4. UI 稳定后再加少量 E2E

