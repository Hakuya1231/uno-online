# UNO Online - 在线联机 UNO 牌游戏

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript |
| 前端框架 | Next.js (React) |
| UI | HTML/CSS 起步，后期加动画 |
| 部署 | Vercel |
| 数据库 + 实时同步 | Firebase Firestore（Spark 免费计划） |
| 认证 | Firebase Auth（匿名登录） |
| 在线状态检测 | Firebase Realtime Database（Presence） |
| 服务端游戏逻辑 | Next.js API Routes + Firebase Admin SDK |

## 架构

所有代码在同一个 Next.js 项目中，运行时客户端/服务端严格分离。

## 通信方式

客户端与服务端之间有三种通信方式：

| 通信方式 | 方向 | 协议 | 用途 |
|---------|------|------|------|
| API Routes 请求 | 客户端 → 服务端 | HTTP | 执行操作（出牌、摸牌、创建房间等） |
| Firestore onSnapshot | 服务端 → 客户端 | WebSocket | 实时推送游戏状态和手牌变化 |
| Realtime Database Presence | 双向 | WebSocket | 写入自己的在线状态 + 监听他人的在线状态 |

## 文档

- [游戏规则](docs/game-rules.md)
- [用户操作流程](docs/user-flow.md)
- [数据模型](docs/data-model.md)
- [客户端方法](docs/client-methods.md)
- [服务端 API Routes](docs/api-routes.md)
- [页面结构与组件](docs/pages.md)
- [AI 玩家逻辑](docs/ai-logic.md)
- [断线与重连](docs/disconnect.md)
- [安全规则与约束说明](docs/security-and-rules.md)
