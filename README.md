# World Demo — 3D 开放世界小游戏原型

浏览器可玩的第三人称动作 demo，模仿《魔兽世界》操作。
技术栈：Vite + TypeScript + Three.js（原生，无 React）；手写重力/碰撞，无物理引擎。

## 体验入口（优先用这个）

云端可玩地址（本 Agent 会话内有效）：

**https://candidates-mariah-diffs-bring.trycloudflare.com/**

Cursor 本机端口转发（Agents 窗口右上角插头图标）：

**http://localhost:4173/**

后续测试 / 优化默认基于上述入口验证；改代码后在 Agent 里重新 `npm run build && npm run preview:public` 即可刷新。

稳定公网（可选）：合并部署 workflow 后，在仓库 Settings → Pages 选择 **GitHub Actions**。私有仓库需 GitHub Pro，或把仓库改为 Public。预计地址：`https://noctiszhang.github.io/world-demo/`

## 运行

```bash
npm install
npm run dev              # 开发热更新，默认 5173
npm run build && npm run preview:public   # 生产预览，0.0.0.0:4173
```

打开页面后点击画布即可操作。

## 操作

- W 前进 / S 慢速后退
- A / D 原地左右转向（默认魔兽逻辑，非横移）
- Q / E 左右平移
- Shift 奔跑 · Space 跳跃
- 鼠标右键拖动 = 转身（角色跟随）
- 鼠标左键拖动 = 环顾（松开自动回正到背后）
- 滚轮缩放 · J 攻击

## 当前已实现

- 角色 GLB：20 骨人形骨架 + 5 个动画（idle / walk / run / jump / attack）
- 开放世界：240×240 起伏地形、90 树、35 石头、2 小屋、云、雾、动态阴影
- 相机防穿墙/穿地形（沿视线采样缩短距离）
- 后期：UnrealBloom 辉光 + 暗角
- 怪物战斗：5 只低模怪，头顶血条；J 攻击，前向扇形+距离命中，受击闪红，两击击杀后倒地下沉

## 代码结构

- `src/main.ts` — 渲染器、场景装配、GLB 加载、跟随相机、后期、怪物管理、命中判定
- `src/Input.ts` — 键鼠输入
- `src/Character.ts` — 角色控制器（移动/转向/重力/动画状态）
- `src/Animator.ts` — AnimationMixer 封装（动作切换/淡入淡出）
- `src/World.ts` — 地形高度场、场景物件、光照、碰撞表
- `src/Enemy.ts` — 怪物（血条/受击/死亡）
- `public/character.glb` — 带骨架动画的角色（33MB）

## 待办（下一步建议）

- 敌人 AI（巡逻/追击/攻击玩家）与玩家血量/死亡
- 攻击在动作"命中帧"结算（目前在动作前段一次性判定）
- 相机：防穿更平滑、可选碰撞遮挡半透
- 任务/HUD、背包、小地图、存档
- 部署：`npm run build` 为纯静态；仓库已带 GitHub Pages workflow（`.github/workflows/deploy-pages.yml`）

详见 `CONTINUITY.md`。
