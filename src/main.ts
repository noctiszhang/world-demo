import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Input } from './Input';
import { Character } from './Character';
import { Animator, renameBonesForTracks } from './Animator';
import { buildWorld } from './World';
import { Enemy } from './Enemy';
import { MobileControls } from './MobileControls';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = buildWorld(scene);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

const input = new Input(renderer.domElement);
new MobileControls(input);

// ---------- 暗角后期 Shader ----------
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.1 },
    darkness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float vig = clamp(1.0 - dot(uv,uv) * darkness, 0.0, 1.0);
      gl_FragColor = vec4(tex.rgb * vig, 1.0);
    }
  `,
};

const loader = new GLTFLoader();
loader.load(
  `${import.meta.env.BASE_URL}character.glb`,
  (gltf) => {
    const model = gltf.scene;

    // 轨道名无点、骨骼名有点 → 统一成无点，否则攻击手臂轨绑不上
    renameBonesForTracks(model);

    // model(脚底) → rollPivot(翻滚绕骨盆) → inner(骨架)
    const rollPivot = new THREE.Group();
    rollPivot.name = 'rollPivot';
    // 网格以自身中心为原点，上下各约 0.95。枢轴放在身体中心，脚才贴地，翻滚也绕腰而不是绕脚。
    rollPivot.position.y = 0.95;
    const inner = new THREE.Group();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    [...model.children].forEach((c) => inner.add(c));
    rollPivot.add(inner);
    model.add(rollPivot);
    model.position.set(0, 0, 4);
    scene.add(model);

    const animator = new Animator(inner, gltf.animations);
    start(model, rollPivot, animator);
  },
  undefined,
  (err) => {
    document.getElementById('loading')!.textContent = '角色加载失败：' + err;
  }
);

function start(model: THREE.Object3D, rollPivot: THREE.Object3D, animator: Animator) {
  const character = new Character(model, rollPivot, animator);
  character.position.set(0, 0, 4);

  // ---------- 后期合成（辉光 + 暗角） ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.55,  // strength
    0.6,   // radius
    0.85   // threshold（只让高亮/发光物泛光）
  );
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);

  document.getElementById('loading')!.style.display = 'none';

  // ---------- 玩家血条 HUD ----------
  const hpEl = document.createElement('div');
  hpEl.id = 'hp';
  hpEl.innerHTML = '<div class="label">生命</div><div class="track"><div class="fill"></div></div>';
  document.body.appendChild(hpEl);
  const hpFill = hpEl.querySelector('.fill') as HTMLDivElement;
  const style = document.createElement('style');
  style.textContent = `
    #hp {
      position: fixed; left: 16px; top: 14px; z-index: 10;
      width: 220px; pointer-events: none;
      font: 12px/1.4 -apple-system, "PingFang SC", sans-serif; color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,.6);
    }
    @media (pointer: coarse) {
      #hp { top: auto; bottom: 168px; left: 18px; width: 160px; }
      #hud { font-size: 11px; max-width: 55vw; }
    }
    #hp .label { margin-bottom: 4px; opacity: .9; }
    #hp .track {
      height: 12px; border-radius: 3px; background: rgba(0,0,0,.45);
      border: 1px solid rgba(255,255,255,.25); overflow: hidden;
    }
    #hp .fill {
      height: 100%; width: 100%; background: linear-gradient(90deg,#3ecf6a,#7dff9a);
      transform-origin: left center; transition: width .15s linear;
    }
    #dead {
      position: fixed; inset: 0; display: none; place-items: center;
      background: rgba(10,0,0,.55); color: #fff; z-index: 30;
      font: 22px/1.6 -apple-system, "PingFang SC", sans-serif; text-align: center;
    }
  `;
  document.head.appendChild(style);
  const deadEl = document.createElement('div');
  deadEl.id = 'dead';
  deadEl.innerHTML = '你倒下了<br/><span style="font-size:14px;opacity:.85">刷新页面重来</span>';
  document.body.appendChild(deadEl);

  // 水平月牙，弧心在本地 +Z（正前方）。左右端点对称，从背后也能看见，不会只亮在身体一侧。
  const slashMat = new THREE.MeshBasicMaterial({
    color: 0xffd24a,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const slash = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.45, 28, 1, -Math.PI / 2 - 1.15, 2.3),
    slashMat,
  );
  slash.rotation.x = -Math.PI / 2;
  slash.position.set(0, 1.2, 0.15);
  slash.renderOrder = 10;
  slash.visible = false;
  model.add(slash);
  // 弧中点：theta=-π/2，半径约 1.1，在网格局部是 (0, -1.1, 0)，转到世界后沿 +Z
  const slashTipLocal = new THREE.Vector3(0, -1.1, 0);
  const slashTipWorld = new THREE.Vector3();
  let slashLife = 0;

  // ---------- 怪物 ----------
  const enemySpots: Array<[number, number]> = [
    [6, -4], [-9, -8], [12, 4], [-6, 10], [16, -12],
  ];
  const enemies = enemySpots.map(([x, z]) => {
    const e = new Enemy({ x, z, heightAt: world.groundHeight });
    scene.add(e.group);
    return e;
  });
  // 前摇危险圈（红色示警）
  const warnRings = enemies.map(() => {
    const g = new THREE.RingGeometry(0.2, 1.6, 32);
    const m = new THREE.MeshBasicMaterial({
      color: 0xff3333, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat: m };
  });
  let attackHitDone = false;
  const attackRange = 2.6;
  const attackArc = Math.cos(0.85); // 约 ~96° 前向扇形
  const HIT_FRAME = 0.38; // 动作约 38% 处结算（挥到最前）

  const clock = new THREE.Clock();
  let shake = 0;

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // 翻滚 / 攻击（攻击严格跟角色面朝，不再自动扭向附近怪）
    if (input.rollPressed && character.alive) {
      character.triggerRoll(input, camera);
    }
    if (input.attackPressed && character.alive) {
      if (character.triggerAttack()) {
        attackHitDone = false;
        slashLife = 0.6;
        slash.visible = true;
        slashMat.opacity = 0.85;
      }
    }

    character.update(dt, input, camera, world.groundHeight, world.colliders);
    animator.update(dt);

    // 攻击命中：在命中帧结算一次
    if (character.isAttacking && !attackHitDone && animator.oneShotProgress >= HIT_FRAME) {
      const fx = Math.sin(character.facing);
      const fz = Math.cos(character.facing);
      let anyHit = false;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.group.position.x - character.position.x;
        const dz = e.group.position.z - character.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > attackRange || dist < 0.001) continue;
        const dot = (dx / dist) * fx + (dz / dist) * fz;
        if (dot > attackArc) {
          e.takeHit(50);
          anyHit = true;
        }
      }
      if (anyHit) shake = 0.18;
      attackHitDone = true;
    }

    const living = enemies.filter((e) => e.alive);
    for (const e of living) {
      const dmg = e.update(dt, time, character.position, character.alive);
      if (dmg > 0 && character.takeHit(dmg)) shake = Math.max(shake, 0.22);
    }

    // 怪间硬碰撞：迭代推开，禁止重叠
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < living.length; i++) {
        for (let j = i + 1; j < living.length; j++) {
          const a = living[i];
          const b = living[j];
          const dx = a.group.position.x - b.group.position.x;
          const dz = a.group.position.z - b.group.position.z;
          let d = Math.hypot(dx, dz);
          const minD = a.bodyRadius + b.bodyRadius;
          if (d < 1e-4) {
            // 完全重叠时给随机微偏移
            a.group.position.x += (Math.random() - 0.5) * 0.05;
            continue;
          }
          if (d < minD) {
            const push = (minD - d) * 0.5;
            const nx = dx / d;
            const nz = dz / d;
            a.group.position.x += nx * push;
            a.group.position.z += nz * push;
            b.group.position.x -= nx * push;
            b.group.position.z -= nz * push;
            a.group.position.y = world.groundHeight(a.group.position.x, a.group.position.z);
            b.group.position.y = world.groundHeight(b.group.position.x, b.group.position.z);
          }
        }
      }
    }

    // 前摇危险圈：地面红环随风摇放大
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const ring = warnRings[i];
      if (e.alive && e.phase === 'windup' && e.windupProgress > 0) {
        ring.mesh.visible = true;
        ring.mesh.position.set(e.group.position.x, e.group.position.y + 0.08, e.group.position.z);
        const s = 0.55 + e.windupProgress * 0.9;
        ring.mesh.scale.set(s, s, s);
        ring.mat.opacity = 0.25 + e.windupProgress * 0.55;
      } else {
        ring.mesh.visible = false;
        ring.mat.opacity = 0;
      }
    }

    if (slashLife > 0) {
      slashLife -= dt;
      slash.visible = true;
      slashMat.opacity = Math.max(0, slashLife / 0.6) * 0.9;
      if (slashLife <= 0) slash.visible = false;
    }

    hpFill.style.width = `${(character.health / character.maxHealth) * 100}%`;
    if (!character.alive) deadEl.style.display = 'grid';

    // 塞尔达：镜头只跟拖动，走路时绝不自动回正（自动跟随会和「镜头相对 WASD」打架发飘）
    const target = character.position.clone();
    target.y += 1.5;

    const cp = Math.cos(input.pitch);
    const sp = Math.sin(input.pitch);
    const dir = new THREE.Vector3(
      Math.sin(input.yaw) * cp,
      sp,
      Math.cos(input.yaw) * cp
    );
    // 相机防穿
    const safeDist = resolveCameraDistanceSafe(target, input.distance, dir);
    camera.position.copy(target).add(dir.clone().multiplyScalar(safeDist));
    camera.lookAt(target);

    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      const a = shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
    }

    // 自动化测试 / Agent 调试桥（只读）
    const g = (window as unknown as { __GAME__?: Record<string, unknown> }).__GAME__;
    if (g) {
      const look = new THREE.Vector3();
      camera.getWorldDirection(look);
      look.y = 0;
      if (look.lengthSq() > 1e-8) look.normalize();
      else look.set(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), look).normalize();
      g.ready = true;
      model.updateWorldMatrix(true, true);
      const nose = new THREE.Vector3(0, 1.2, 0.8).applyMatrix4(model.matrixWorld);
      slashTipWorld.copy(slashTipLocal).applyMatrix4(slash.matrixWorld);
      const ndc = character.position.clone();
      ndc.y += 1.2;
      ndc.project(camera);
      const marker = new THREE.Vector3(0, 2, 0);
      marker.project(camera);
      g.markerScreenX = marker.x;
      g.player = {
        x: character.position.x,
        y: character.position.y,
        z: character.position.z,
        facing: character.facing,
        speed: character.speed,
        health: character.health,
        alive: character.alive,
        isAttacking: character.isAttacking,
        isRolling: character.isRolling,
        nose: { x: nose.x, z: nose.z },
        screenX: ndc.x,
        screenY: ndc.y,
        rollVisual: character.rollVisual,
      };
      g.slashTip = {
        x: slashTipWorld.x,
        z: slashTipWorld.z,
        visible: slash.visible,
      };
      const ce = camera.matrixWorld.elements;
      g.camera = {
        yaw: input.yaw,
        pitch: input.pitch,
        // 屏幕右 = 相机矩阵 X 列（与移动代码同一来源，测试另用几何复核）
        forward: { x: look.x, z: look.z },
        right: { x: right.x, z: right.z },
        px: camera.position.x,
        pz: camera.position.z,
        matrixRight: { x: ce[0], z: ce[2] },
      };
      g.enemiesAlive = enemies.filter((e) => e.alive).length;
    }

    composer.render();
    requestAnimationFrame(animate);
  }

  (window as unknown as { __GAME__: Record<string, unknown> }).__GAME__ = {
    ready: true,
    version: '0.2.0',
  };

  function resolveCameraDistanceSafe(target: THREE.Vector3, fullDist: number, dir: THREE.Vector3) {
    const N = 14;
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * fullDist;
      const p = target.clone().add(dir.clone().multiplyScalar(t));
      let blocked = p.y < world.groundHeight(p.x, p.z) + 0.35;
      if (!blocked) {
        for (const c of world.colliders) {
          const d = Math.hypot(p.x - c.x, p.z - c.z);
          const dy = Math.abs(p.y - target.y);
          if (d < c.r + 0.25 && dy < 4) { blocked = true; break; }
        }
      }
      if (blocked) return Math.max(0.9, ((i - 1) / N) * fullDist);
    }
    return fullDist;
  }

  animate();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
