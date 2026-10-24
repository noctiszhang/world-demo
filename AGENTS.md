# Agent 约定（world-demo）

## 强制门禁

改动移动 / 镜头 / 输入 / 战斗 / 动画 / 碰撞后，**必须**先：

```bash
npm run verify
```

全绿才能开公网隧道或请用户体验。失败则自修重跑，禁止把基础方向/朝向/入地问题丢给用户。

技能说明（可录入本地技能库）：`skills/browser-game-iteration-qa/SKILL.md`

## 运行时调试桥

`window.__GAME__`：只读 player / camera.forward|right / enemiesAlive。扩展玩法时同步扩展桥与 `scripts/smoke-game.mjs`。
