import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Input } from './Input';
import { Character } from './Character';
import { Animator } from './Animator';
import { buildWorld } from './World';
import { Enemy } from './Enemy';

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
  '/character.glb',
  (gltf) => {
    const model = gltf.scene;

    // 几何中心在原点：包一层 inner 上移 0.95，使外层位置=脚底
    const inner = new THREE.Group();
    inner.position.y = 0.95;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    [...model.children].forEach((c) => inner.add(c));
    model.add(inner);
    model.position.set(0, 0, 4);
    scene.add(model);

    const animator = new Animator(inner, gltf.animations);
    start(model, animator);
  },
  undefined,
  (err) => {
    document.getElementById('loading')!.textContent = '角色加载失败：' + err;
  }
);

function start(model: THREE.Object3D, animator: Animator) {
  const character = new Character(model, animator);
  character.position.set(0, 0, 4);

  // ---------- 后期合成（任务4：辉光 + 暗角） ----------
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

  // ---------- 怪物（任务6） ----------
  const enemySpots: Array<[number, number]> = [
    [6, -4], [-9, -8], [12, 4], [-6, 10], [16, -12],
  ];
  const enemies = enemySpots.map(([x, z]) => {
    const e = new Enemy({ x, z, heightAt: world.groundHeight });
    scene.add(e.group);
    return e;
  });
  let attackHitDone = false;
  const attackRange = 2.6;
  const attackArc = Math.cos(0.8); // 约90度前向扇形

  const clock = new THREE.Clock();

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    // 攻击输入
    if (input.attackPressed) {
      if (character.triggerAttack()) attackHitDone = false;
    }

    character.update(dt, input, world.groundHeight, world.colliders);
    animator.update(dt);

    // 攻击命中判定：攻击动作进行中、且只结算一次（在动作前段）
    if (character.isAttacking && !attackHitDone) {
      const fx = Math.sin(character.facing);
      const fz = Math.cos(character.facing);
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.group.position.x - character.position.x;
        const dz = e.group.position.z - character.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > attackRange) continue;
        const dot = (dx / dist) * fx + (dz / dist) * fz;
        if (dot > attackArc) {
          e.takeHit(50);
        }
      }
      attackHitDone = true;
    }

    for (const e of enemies) e.update(dt, time);

    // 魔兽跟随镜头
    const desiredYaw = character.facing + Math.PI;
    let diff = desiredYaw - input.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    input.yaw += diff * Math.min(1, dt * 4);

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

    composer.render();
    requestAnimationFrame(animate);
  }

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
