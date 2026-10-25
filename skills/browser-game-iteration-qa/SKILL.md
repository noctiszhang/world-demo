---
name: browser-game-iteration-qa
description: >-
  Mandatory Playwright smoke + __GAME__ bridge for browser Three.js/Vite games.
  Use on every iteration that touches movement, camera, combat, animation, or
  input. Block sharing play URLs until verify passes. Also use when the user
  asks for game QA automation, smoke tests, or regression before handoff.
---

# Browser Game Iteration QA（必跑门禁）

面向 **Vite + Three.js（或同类 Canvas）浏览器游戏** 的 Agent 迭代门禁。  
**硬规则：改完代码 → `npm run verify` 全绿 → 才能给用户公网/体验链接。红则自修，禁止把基础方向/朝向/入地问题甩给用户。**

## When to use（必须触发）

在下列任一情况 **MUST** 启用本技能并跑通门禁：

- 改了移动、镜头、键位、触屏、翻滚、攻击、碰撞、动画
- 准备「开公网隧道 / 更新体验链接 / 让用户测」
- 用户抱怨操作怪、方向反、朝向错、模型入地等基础手感问题
- 用户要求「先 debug 再给我」

不要只用 computerUse 手点代替冒烟：手测是加分项，**冒烟是门禁**。

## Hard gate（不准跳过）

```bash
npm run verify
# = npm run build && npm run test:smoke
```

| 结果 | Agent 行为 |
|------|------------|
| 退出码 0 | 才可开隧道、写体验链接、更新 PR 请用户玩 |
| 非 0 | 根据失败断言修代码，重跑至绿；**不得**把失败项当成「请用户帮忙看」 |

向用户交付时必须能说清：本次 `verify` 已通过（可附关键断言名称）。

## 项目契约：`window.__GAME__`

游戏主循环每帧更新只读桥（见 `src/main.ts`）。冒烟 **只读状态、不读像素**。

最低字段：

```ts
window.__GAME__ = {
  ready: boolean,
  player: {
    x, y, z, facing, speed, health, alive,
    isAttacking, isRolling,
  },
  camera: {
    yaw, pitch,
    forward: { x, z },  // getWorldDirection 水平单位向量
    right: { x, z },    // up × forward
  },
  enemiesAlive: number,
}
```

新增玩法时：先扩展 `__GAME__`，再加对应断言。不要只加手测步骤。

## 仓库命令

| 命令 | 作用 |
|------|------|
| `npm run build` | `tsc && vite build` |
| `npm run test:smoke` | 起 preview → Playwright 无头跑 `scripts/smoke-game.mjs` |
| `npm run verify` | **门禁**：build + smoke |
| `SMOKE_URL=http://127.0.0.1:4173/ node scripts/smoke-game.mjs` | 已有 preview 时单跑断言 |

首次环境需：`npx playwright install chromium`

## 当前冒烟断言（改相关系统时保持全绿）

实现：`scripts/smoke-game.mjs`（由 `scripts/run-smoke.mjs` 拉起预览）。

1. **W**：相对相机前方有位移（`forward · Δpos` 为正）
2. **A+W**：有前进分量，且 **偏左**（`right · Δpos < 0`）——防止左右轴写反
3. **J**：进入攻击；`facing` 相对攻击前 **不猛扭**（已禁止自动扭向附近怪）
4. **K**：进入 `isRolling`；`minY` 不明显入地；`maxY` 有 hop；结束后退出翻滚
5. **pageerror**：页面 JS 异常记失败

镜头相对移动的左右判定 **必须** 用 `__GAME__.camera.forward/right`，不要手写一套 yaw 公式另算。

## 标准迭代流程

1. 实现改动  
2. `npm run verify`  
3. （可选）computerUse / 录屏抽检手感  
4. 开公网隧道或端口转发  
5. 更新 PR / 把链接给用户，并注明 verify 已过  

**禁止顺序：** 改完直接丢链接 → 让用户发现 A+W 反了 / 攻击朝左 / 滚进地里。

## CI

PR 上跑 `.github/workflows/game-smoke.yml`（`npm run verify`）。本地门禁与 CI 同一套脚本，避免「我这边绿、CI 红」两套逻辑。

## 扩展下一批用例（按需加断言）

- 脱战：跑远后敌人 `phase`/距离回巢  
- 怪间不重叠：两只活怪距离 ≥ `bodyRadius` 和  
- 受击无敌：翻滚中 `takeHit` 不掉血（需向 `__GAME__` 暴露 hit 事件或 health 序列）  
- 截图回归：Playwright `toHaveScreenshot`（需冻结动画 / seed RNG）  

参考（可另装进技能库，不必替代本门禁）：

- [playableintelligence/game-creator](https://github.com/PlayableIntelligence/game-creator) → `game-qa`
- [testomut/pixijs-e2e-testing-demo](https://github.com/testomut/pixijs-e2e-testing-demo)
- [janmrow/astro-drift](https://github.com/janmrow/astro-drift)

安装 game-creator 全家桶（可选）：

```bash
npx skills add playableintelligence/game-creator -a cursor
```

## 录入本地技能库

把本目录拷到 Cursor 技能目录即可，例如：

```bash
# 个人技能（示例路径，按你本机 Cursor skills 根目录调整）
cp -R skills/browser-game-iteration-qa ~/.cursor/skills/browser-game-iteration-qa
```

或在 Cursor 技能设置里「Add skill」指向该 `SKILL.md`。  
录入后：只要做浏览器游戏迭代 / 发体验链接，Agent 应自动匹配本技能描述并执行门禁。

## 本技能与 walkthrough 的关系

- **本技能**：功能回归门禁（状态断言）  
- **walkthrough-artifacts**：给用户看的录屏/截图证明  

两者都要：先 verify 绿，再录 walkthrough，再发链接。
