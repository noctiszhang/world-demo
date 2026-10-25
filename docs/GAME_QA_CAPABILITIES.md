# 游戏自动化测试（已接入门禁）

完整可录入技能见：**`skills/browser-game-iteration-qa/SKILL.md`**

## 门禁命令

```bash
npm run verify   # build + Playwright smoke；红则禁止发体验链接
```

## 本仓库实现

| 组件 | 路径 |
|------|------|
| 状态桥 | `window.__GAME__`（`src/main.ts`） |
| 冒烟断言 | `scripts/smoke-game.mjs` |
| 拉起预览 | `scripts/run-smoke.mjs` |
| Agent 约定 | `AGENTS.md` |
| CI | `.github/workflows/game-smoke.yml` |
| 技能原文 | `skills/browser-game-iteration-qa/SKILL.md` |

## 录入本地技能库

```bash
cp -R skills/browser-game-iteration-qa ~/.cursor/skills/browser-game-iteration-qa
```

（若你本机技能根目录不是 `~/.cursor/skills`，改成 Cursor 实际 skills 路径即可。）
