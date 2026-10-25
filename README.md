# World Demo — 3D 开放世界小游戏原型

浏览器可玩的第三人称动作 demo，模仿《魔兽世界》操作。
技术栈：Vite + TypeScript + Three.js（原生，无 React）；手写重力/碰撞，无物理引擎。

## 体验入口（优先用这个）

云端可玩地址（本 Agent 会话内有效）：

**https://portal-happiness-trial-apt.trycloudflare.com/**

Cursor 本机端口转发（Agents 窗口右上角插头图标）：

**http://localhost:4173/**

后续测试 / 优化默认基于上述入口验证；改代码后在 Agent 里重新 `npm run build && npm run preview:public` 即可刷新。

稳定公网（可选）：合并部署 workflow 后，在仓库 Settings → Pages 选择 **GitHub Actions**。私有仓库需 GitHub Pro，或把仓库改为 Public。预计地址：`https://noctiszhang.github.io/world-demo/`

## 运行

```bash
npm install
npm run dev              # 开发热更新，默认 5173
npm run build && npm run preview:public   # 生产预览，0.0.0.0:4173
npm run test:smoke       # Playwright 基础回归（移动/攻击朝向/翻滚不入地）
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
- **攻击动效修复**：骨骼名 `upper_arm.R` 与轨道 `upper_armR` 对齐（否则手臂轨绑不上）
- 开放世界：240×240 起伏地形、90 树、35 石头、2 小屋、云、雾、动态阴影
- 相机防穿墙/穿地形（沿视线采样缩短距离）
- 后期：UnrealBloom 辉光 + 暗角
- 战斗：命中帧结算、前向扇形、攻击弧光、镜头微震（攻击跟面朝，不自动扭向怪）
- 可风筝：怪攻击前摇红圈示警、短命中窗、后摇空隙；多只可同时进攻；怪间硬碰撞不重叠；跑远脱战
- 翻滚闪避：K/Ctrl（手机「滚」），前空翻动效 + 无敌帧
- 塞尔达式：镜头相对移动，角色朝移动方向
- 怪物 AI：进仇恨圈追击、近战咬伤；玩家血条 / 死亡提示
- 手机：左虚拟摇杆、右半屏拖视角、滚/跳/攻（粗指针设备自动显示）

## 代码结构

- `src/main.ts` — 渲染器、场景装配、GLB 加载、跟随相机、后期、战斗与 HUD
- `src/Input.ts` — 键鼠输入
- `src/Character.ts` — 角色控制器（移动/转向/重力/动画/血量）
- `src/Animator.ts` — AnimationMixer + 骨骼名重映射
- `src/World.ts` — 地形高度场、场景物件、光照、碰撞表
- `src/Enemy.ts` — 怪物（血条/追击/受击/死亡）
- `public/character.glb` — 带骨架动画的角色（33MB）

## 可继续完善（按体验优先级）

1. **战斗手感**：连击/技能、受击硬直、伤害飘字、死亡后重生点
2. **敌人**：巡逻路径、远程怪、不同血量/外观、击杀掉落
3. **相机**：防穿插值更平滑、遮挡半透、锁定目标镜头
4. **世界**：可交互物件、任务/对话 NPC、小地图、昼夜
5. **系统**：背包、存档、音效/BGM、移动端虚拟摇杆
6. **部署**：合并后启用 GitHub Pages 得稳定公网；仓库已带 workflow

详见 `CONTINUITY.md`。
