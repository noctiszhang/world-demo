import * as THREE from 'three';

export type AnimName = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'roll';

/**
 * glTF 轨道用 shoulderL / upper_armR 这类无点名；
 * Blender 导出骨骼却是 shoulder.L / upper_arm.R。
 * Three.js PropertyBinding 按 '.' 拆路径，带点骨骼名绑不上。
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

/**
 * 基于 jump 剪辑生成翻滚用动作：加速播放 + 略缩时长，
 * 配合 Character 的 rollPivot 前空翻旋转形成翻滚动效。
 */
function buildRollClipFromJump(jump: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = jump.tracks.map((t) => t.clone());
  const clip = new THREE.AnimationClip('roll', Math.min(0.48, jump.duration * 0.55), tracks);
  return clip;
}

export class Animator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName | null = null;
  private rolling = false;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const name = clip.name as AnimName;
      if (['idle', 'walk', 'run', 'jump', 'attack'].includes(name)) {
        // root 轨会把骨架整体拧离控制器朝向，攻击看起来朝向和人相反
        clip.tracks = clip.tracks.filter((t) => !t.name.startsWith('root.'));
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.enabled = true;
        this.actions.set(name, action);
      }
    }
    const jump = clips.find((c) => c.name === 'jump');
    if (jump) {
      const rollClip = buildRollClipFromJump(jump);
      const rollAction = this.mixer.clipAction(rollClip);
      rollAction.setLoop(THREE.LoopOnce, 1);
      rollAction.clampWhenFinished = true;
      rollAction.timeScale = 1.65;
      this.actions.set('roll', rollAction);
    }
    this.play('idle', 0.15);
  }

  get currentName() {
    return this.current;
  }

  get oneShotProgress() {
    if (this.current !== 'jump' && this.current !== 'attack' && this.current !== 'roll') return 0;
    const a = this.actions.get(this.current!);
    if (!a) return 0;
    const dur = a.getClip().duration;
    return dur > 0 ? Math.min(1, a.time / dur) : 1;
  }

  play(name: AnimName, fade = 0.2) {
    if (this.rolling && name !== 'roll') return;
    const next = this.actions.get(name);
    if (!next) return;

    if (name === this.current && (name === 'attack' || name === 'jump')) {
      next.reset();
      next.setEffectiveWeight(1);
      next.fadeIn(0.05).play();
      return;
    }
    if (name === this.current) return;

    const prev = this.current ? this.actions.get(this.current) : null;

    if (name === 'jump' || name === 'attack' || name === 'roll') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.reset();
      next.setEffectiveWeight(1);
      next.fadeIn(0.05).play();
      if (prev && prev !== next) prev.fadeOut(0.1);
      this.current = name;
      return;
    }

    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.reset();
    next.setEffectiveWeight(1);
    next.fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    this.current = name;
  }

  playRoll() {
    // 翻滚视觉只靠 rollPivot 前空翻，不再播 jump/run（叠在一起会拧成诡异姿势）
    this.rolling = true;
    const cur = this.current ? this.actions.get(this.current) : null;
    if (cur) cur.fadeOut(0.08);
    this.current = 'roll';
  }

  endRoll() {
    this.rolling = false;
    this.current = null;
  }

  isOneShotDone() {
    if (this.current !== 'jump' && this.current !== 'attack' && this.current !== 'roll') return false;
    const a = this.actions.get(this.current!);
    if (!a) return true;
    const dur = a.getClip().duration;
    // clampWhenFinished 时 isRunning 可能一直为 true，以时间进度为准
    return a.time >= dur - 0.05 || a.getEffectiveWeight() < 0.05;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}
