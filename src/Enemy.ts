import * as THREE from 'three';

export interface EnemyConfig {
  x: number;
  z: number;
  heightAt: (x: number, z: number) => number;
}

export type EnemyPhase = 'idle' | 'chase' | 'windup' | 'strike' | 'recover';

/**
 * 战斗相位（参考 GDKeys / Souls 类拆分）：
 * windup 示警可走位 → strike 短命中窗 → recover 还击/逃跑空隙
 */
export class Enemy {
  group: THREE.Group;
  health = 100;
  maxHealth = 100;
  alive = true;
  phase: EnemyPhase = 'idle';
  /** 前摇示警进度 0..1，供主循环画危险圈 */
  windupProgress = 0;
  private bar: THREE.Sprite;
  private barMat: THREE.SpriteMaterial;
  private bob = Math.random() * Math.PI * 2;
  hitFlash = 0;
  private heightAt: (x: number, z: number) => number;
  private attackCd = Math.random() * 0.8;
  private phaseT = 0;
  private homeX: number;
  private homeZ: number;
  private lockedDir = new THREE.Vector2(0, 1);

  // 可风筝参数：玩家步行 4.5 / 奔跑 8.5，怪追击更慢
  private readonly aggroRange = 9;
  private readonly leashRange = 16;
  private readonly attackRange = 1.5;
  private readonly moveSpeed = 1.85;
  private readonly windupDur = 0.72;   // 反应+侧移缓冲，红圈出现后可跑开
  private readonly strikeDur = 0.1;    // 短命中窗
  private readonly recoverDur = 0.85;  // 还击/逃跑空隙
  private readonly attackDamage = 12;
  private readonly preferDist = 2.4;   // 非主攻者保持距离环绕
  private readonly windupCommitRange = 2.15; // 前摇中离开此距离 → 落空

  constructor(cfg: EnemyConfig) {
    this.heightAt = cfg.heightAt;
    this.homeX = cfg.x;
    this.homeZ = cfg.z;
    const y = cfg.heightAt(cfg.x, cfg.z);
    this.group = new THREE.Group();
    this.group.position.set(cfg.x, y, cfg.z);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x6b3fa0, roughness: 0.5, flatShading: true, emissive: 0x000000
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), bodyMat);
    body.scale.set(1, 0.85, 1);
    body.position.y = 0.55;
    body.castShadow = true;
    body.name = 'enemyBody';
    this.group.add(body);

    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, flatShading: true });
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 8), hornMat);
      horn.position.set(sx * 0.22, 1.05, 0);
      horn.rotation.z = sx * 0.3;
      this.group.add(horn);
    }

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3333 });
    eyeMat.emissive.setHex(0xff2222);
    eyeMat.emissiveIntensity = 4;
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
      e.position.set(sx * 0.2, 0.65, -0.5);
      this.group.add(e);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 16;
    const tex = new THREE.CanvasTexture(canvas);
    this.barMat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    this.bar = new THREE.Sprite(this.barMat);
    this.bar.scale.set(1.3, 0.18, 1);
    this.bar.position.y = 1.6;
    this.group.add(this.bar);
    this.drawBar();
  }

  private drawBar() {
    const canvas = this.barMat.map!.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 3, canvas.width, 10);
    const ratio = Math.max(0, this.health / this.maxHealth);
    ctx.fillStyle = ratio > 0.4 ? '#4be06b' : '#e04b4b';
    ctx.fillRect(2, 5, (canvas.width - 4) * ratio, 6);
    this.barMat.map!.needsUpdate = true;
  }

  takeHit(damage: number) {
    if (!this.alive) return;
    this.health -= damage;
    this.hitFlash = 1;
    // 受击打断前摇
    if (this.phase === 'windup') {
      this.phase = 'recover';
      this.phaseT = this.recoverDur * 0.5;
      this.windupProgress = 0;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
    this.drawBar();
  }

  private die() {
    this.alive = false;
    this.phase = 'idle';
    this.windupProgress = 0;
    this.bar.visible = false;
    this.group.rotation.z = Math.PI / 2;
  }

  /**
   * @param canStrike 本帧是否允许成为「主攻者」（限制围殴）
   * @param separation 与其他怪的推开向量
   * @returns 对玩家造成的伤害（仅 strike 命中窗）
   */
  update(
    dt: number,
    time: number,
    playerPos: THREE.Vector3 | undefined,
    playerAlive: boolean,
    canStrike: boolean,
    separation: { x: number; z: number },
  ): number {
    if (!this.alive) {
      this.group.position.y = Math.max(-0.9, this.group.position.y - dt * 0.6);
      return 0;
    }

    if (this.attackCd > 0) this.attackCd = Math.max(0, this.attackCd - dt);

    let dealt = 0;
    const body = this.group.getObjectByName('enemyBody') as THREE.Mesh | undefined;

    if (!playerPos || !playerAlive) {
      this.phase = 'idle';
      this.windupProgress = 0;
    } else {
      const dx = playerPos.x - this.group.position.x;
      const dz = playerPos.z - this.group.position.z;
      const dist = Math.hypot(dx, dz);
      const homeDist = Math.hypot(this.group.position.x - this.homeX, this.group.position.z - this.homeZ);

      // 脱战回巢：跑远或扯太远
      if (dist > this.leashRange || (this.phase !== 'idle' && homeDist > this.leashRange + 2)) {
        this.phase = 'idle';
        this.windupProgress = 0;
        const hx = this.homeX - this.group.position.x;
        const hz = this.homeZ - this.group.position.z;
        const hd = Math.hypot(hx, hz);
        if (hd > 0.4) {
          this.group.position.x += (hx / hd) * this.moveSpeed * 1.2 * dt;
          this.group.position.z += (hz / hd) * this.moveSpeed * 1.2 * dt;
          this.group.rotation.y = Math.atan2(hx, hz);
        }
      } else if (this.phase === 'windup') {
        this.phaseT -= dt;
        this.windupProgress = 1 - Math.max(0, this.phaseT) / this.windupDur;
        this.group.rotation.y = Math.atan2(this.lockedDir.x, this.lockedDir.y);
        // 前摇站桩，玩家可侧移/后撤躲开
        if (body) body.scale.set(1 + this.windupProgress * 0.25, 0.85, 1 + this.windupProgress * 0.15);
        // 前摇中跑出承诺距离 → 直接落空进入后摇（可操作防御的核心）
        if (dist > this.windupCommitRange) {
          this.phase = 'recover';
          this.phaseT = this.recoverDur * 0.65;
          this.windupProgress = 0;
          this.attackCd = 0.55;
          if (body) body.scale.set(1, 0.85, 1);
        } else if (this.phaseT <= 0) {
          this.phase = 'strike';
          this.phaseT = this.strikeDur;
          this.windupProgress = 1;
        }
      } else if (this.phase === 'strike') {
        this.phaseT -= dt;
        this.group.rotation.y = Math.atan2(this.lockedDir.x, this.lockedDir.y);
        // 仅短窗结算一次；距离与朝向都要满足
        if (this.phaseT > this.strikeDur - dt * 1.5) {
          const sdx = playerPos.x - this.group.position.x;
          const sdz = playerPos.z - this.group.position.z;
          const sd = Math.hypot(sdx, sdz);
          if (sd < this.attackRange + 0.12 && sd > 0.001) {
            const dot = (sdx / sd) * this.lockedDir.x + (sdz / sd) * this.lockedDir.y;
            if (dot > 0.55) dealt = this.attackDamage;
          }
        }
        if (this.phaseT <= 0) {
          this.phase = 'recover';
          this.phaseT = this.recoverDur;
          this.windupProgress = 0;
          this.attackCd = 1.05;
          if (body) body.scale.set(1, 0.85, 1);
        }
      } else if (this.phase === 'recover') {
        this.phaseT -= dt;
        this.windupProgress = 0;
        if (this.phaseT <= 0) this.phase = 'chase';
      } else {
        // idle / chase
        if (dist < this.aggroRange && dist > 0.001) {
          this.phase = 'chase';
          this.group.rotation.y = Math.atan2(dx, dz);

          if (canStrike && dist <= this.attackRange && this.attackCd <= 0) {
            this.phase = 'windup';
            this.phaseT = this.windupDur;
            this.windupProgress = 0;
            this.lockedDir.set(dx / dist, dz / dist);
          } else {
            // 主攻者贴脸；其余保持环绕距离，避免叠罗汉
            const targetDist = canStrike ? this.attackRange * 0.92 : this.preferDist;
            if (dist > targetDist + 0.15) {
              const step = Math.min(dist - targetDist, this.moveSpeed * dt);
              this.group.position.x += (dx / dist) * step;
              this.group.position.z += (dz / dist) * step;
            } else if (!canStrike && dist < this.preferDist - 0.2) {
              // 稍退开
              this.group.position.x -= (dx / dist) * this.moveSpeed * 0.6 * dt;
              this.group.position.z -= (dz / dist) * this.moveSpeed * 0.6 * dt;
            }
          }
        } else {
          this.phase = 'idle';
        }
      }
    }

    // 怪间分离
    this.group.position.x += separation.x * dt;
    this.group.position.z += separation.z * dt;

    this.group.position.y = this.heightAt(this.group.position.x, this.group.position.z);

    this.bob += dt * 3;
    if (body) {
      if (this.phase !== 'windup') {
        body.position.y = 0.55 + Math.sin(this.bob) * 0.06;
      } else {
        body.position.y = 0.55 + this.windupProgress * 0.2;
      }
      if (this.hitFlash > 0) {
        this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
        const mat = body.material as THREE.MeshStandardMaterial;
        mat.emissive.setRGB(this.hitFlash * 0.8, this.phase === 'windup' ? 0.3 : 0, 0);
      } else if (this.phase === 'windup') {
        const mat = body.material as THREE.MeshStandardMaterial;
        mat.emissive.setRGB(0.55 * this.windupProgress, 0.1, 0);
      } else {
        const mat = body.material as THREE.MeshStandardMaterial;
        mat.emissive.setRGB(0, 0, 0);
      }
    }
    return dealt;
  }
}
