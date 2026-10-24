import * as THREE from 'three';

export type AnimName = 'idle' | 'walk' | 'run' | 'jump' | 'attack';

// 管理 gltf 的 AnimationMixer：按状态切换动画、淡入淡出
export class Animator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimName, THREE.AnimationAction>();
  private current: AnimName | null = null;
  private manualTime = 0;   // jump/attack 的累计播放时间

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) {
      const name = clip.name as AnimName;
      if (['idle', 'walk', 'run', 'jump', 'attack'].includes(name)) {
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        this.actions.set(name, action);
      }
    }
    this.play('idle', 0.15);
  }

  play(name: AnimName, fade = 0.2) {
    if (name === this.current) return;
    const next = this.actions.get(name);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : null;

    if (name === 'jump' || name === 'attack') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.reset();
      next.setEffectiveTimeScale(1);
      next.fadeIn(0.05).play();
      // 旧动作不淡出（让 jump/attack 叠加在移动姿态上更自然），但记录
      this.current = name;
      this.manualTime = 0;
      return;
    }

    // 循环类
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.reset().fadeIn(fade).play();
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
