# 游戏自动化测试能力清单（可收入本地技能库）

调研来源：`agent-reach` 搜 GitHub / 网页（2026-10）。

## 强烈推荐装进 Agent 技能库

| 能力 | 来源 | 做什么 |
|------|------|--------|
| **game-qa（Playwright）** | [playableintelligence/game-creator](https://github.com/PlayableIntelligence/game-creator) → `skills/game-qa/` | 构建检查、无头 Chromium 运行时、玩法断言、截图视觉回归、FPS |
| **`window.render_game_to_text()` / `__GAME__` 桥** | 同上 architecture | 不读像素，Agent/CI 直接读 JSON 状态（位置、血量、场景） |
| **确定性 RNG seed** | game-qa visual-regression 文档 | `page.addInitScript` 固定 `Math.random`，回归可复现 |
| **Pixi/Canvas E2E 只读桥** | [testomut/pixijs-e2e-testing-demo](https://github.com/testomut/pixijs-e2e-testing-demo) + Playwright 套件 | Canvas 游戏可测性范例 |
| **SDET 向 Canvas 游戏** | [janmrow/astro-drift](https://github.com/janmrow/astro-drift) | Vitest 单测 + Playwright E2E 工程示范 |
| **Three.js game-testing skill** | [skills.rest/skill/game-testing](https://skills.rest/skill/game-testing) | 静态服 + Playwright：加载、输入、截图、console 错误 |

安装 game-creator 技能（Cursor）：

```bash
npx skills add playableintelligence/game-creator -a cursor
```

## 本仓库已落地的最小闭环

- 运行时只读桥：`window.__GAME__`（`player / camera / enemiesAlive / ready`）
- 冒烟脚本：`npm run test:smoke` → `scripts/smoke-game.mjs`
  - W 有位移
  - A+W 必须偏左（相对相机），防止左右轴写反
  - J 攻击不应相对面朝猛扭 >~40°
  - K 翻滚 `minY` 不得明显低于翻滚前地面

**约定：每次改移动/战斗/动画后先跑 `npm run test:smoke`，再给人公网链接。**

## Agent 迭代建议流程

1. 改代码 → `npm run build`
2. `npm run test:smoke`（红则不准「请用户测」）
3. computerUse / 录屏抽检手感
4. 开公网隧道 + 更新 PR
