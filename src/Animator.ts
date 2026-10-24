import * as THREE from 'three';

export type AnimName = 'idle' | 'walk' | 'run' | 'jump' | 'attack';

/**
 * glTF 轨道用 shoulderL / upper_armR 这类无点名；
 * Blender 导出骨骼却是 shoulder.L / upper_arm.R。
 * Three.js PropertyBinding 按 '.' 拆路径，带点骨骼名绑不上，
 * 所以加载后要把骨骼改成与轨道一致的无点名。
 */
export const BONE_DOT_TO_TRACK: Record<string, string> = {
  'shoulder.L': 'shoulderL',
  'upper_arm.L': 'upper_armL',
  'forearm.L': 'forearmL',
  'hand.L': 'handL',
  'shoulder.R': 'shoulderR',
  'upper_arm.R': 'upper_armR',
  'forearm.R': 'forearmR',
  'hand.R': 'handR',
  'thigh.L': 'thighL',
  'shin.L': 'shinL',
  'foot.L': 'footL',
  'thigh.R': 'thighR',
  'shin.R': 'shinR',
  'foot.R': 'footR',
};

export function renameBonesForTracks(root: THREE.Object3D) {
  root.traverse((o) => {
    const mapped = BONE_DOT_TO_TRACK[o.name];
    if (mapped) o.name = mapped;
  });
}

// 管理 gltf 的 AnimationMixer：按状态切换动画、淡入淡出
export class Animator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName | null = null;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const name = clip.name as AnimName;
      if (['idle', 'walk', 'run', 'jump', 'attack'].includes(name)) {
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.enabled = true;
        this.actions.set(name, action);
      }
    }
    this.play('idle', 0.15);
  }

  get currentName() {
    return this.current;
  }

  /** 0..1 当前一次性动作进度；非 one-shot 返回 0 */
  get oneShotProgress() {
    if (this.current !== 'jump' && this.current !== 'attack') return 0;
    const a = this.actions.get(this.current);
    if (!a) return 0;
    const dur = a.getClip().duration;
    return dur > 0 ? Math.min(1, a.time / dur) : 1;
  }

  play(name: AnimName, fade = 0.2) {
    const next = this.actions.get(name);
    if (!next) return;

    // 允许在攻击中重触发：重置动作
    if (name === this.current && (name === 'attack' || name === 'jump')) {
      next.reset();
      next.setEffectiveWeight(1);
      next.fadeIn(0.05).play();
      return;
    }
    if (name === this.current) return;

    const prev = this.current ? this.actions.get(this.current) : null;

    if (name === 'jump' || name === 'attack') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.reset();
      next.setEffectiveWeight(1);
      next.fadeIn(0.05).play();
      if (prev && prev !== next) prev.fadeOut(0.12);
      this.current = name;
      return;
    }

    // 循环类
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.reset();
    next.setEffectiveWeight(1);
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.current = name;
  }

  // jump/attack 播完后由外部决定回到哪个循环动作
  isOneShotDone() {
    if (this.current !== 'jump' && this.current !== 'attack') return false;
    const a = this.actions.get(this.current);
    if (!a) return true;
    return !a.isRunning() || a.time >= a.getClip().duration - 0.02;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}
