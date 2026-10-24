import * as THREE from 'three';
import type { Input } from './Input';
import type { Animator } from './Animator';

const ROLL_DUR = 0.48;
const ROLL_SPEED = 11.5;
const ROLL_CD = 0.55;

/** 塞尔达式：相机相对移动；角色朝向速度方向 */
export class Character {
  position = new THREE.Vector3(0, 0, 4);
  velocityY = 0;
  grounded = true;
  speed = 0;
  facing = 0;
  isAttacking = false;
  isRolling = false;
  health = 100;
  maxHealth = 100;
  alive = true;
  private hurtCooldown = 0;
  private rollT = 0;
  private rollCd = 0;
  private rollDir = new THREE.Vector2(0, 1);
  private _desiredYaw: number | null = null;
  private _vx = 0;
  private _vz = 0;

  readonly radius = 0.45;
  readonly height = 1.9;

  /**
   * @param object 外层位移节点（脚底）
   * @param rollPivot 翻滚时绕局部 X 旋转的视觉节点（含骨架）
   */
  constructor(
    private object: THREE.Object3D,
    private rollPivot: THREE.Object3D,
    private animator: Animator,
  ) {
    this.facing = object.rotation.y;
  }

  faceTowards(x: number, z: number) {
    this._desiredYaw = Math.atan2(x - this.position.x, z - this.position.z);
  }

  teleport(x: number, y: number, z: number) {
    this.position.set(x, y, z);
  }

  get invulnerable() {
    return this.hurtCooldown > 0 || this.isRolling;
  }

  triggerAttack() {
    if (!this.alive || this.isAttacking || this.isRolling || !this.grounded) return false;
    this.isAttacking = true;
    this.animator.play('attack');
    return true;
  }

  triggerRoll(input: Input) {
    if (!this.alive || this.isRolling || this.isAttacking || !this.grounded || this.rollCd > 0) {
      return false;
    }
    // 翻滚方向：当前输入（相机相对已在 update 外算好的话用速度），否则朝向
    const mf = input.moveForward;
    const ms = input.moveStrafe;
    const camYaw = input.yaw;
    const fX = -Math.sin(camYaw);
    const fZ = -Math.cos(camYaw);
    const rX = -Math.cos(camYaw);
    const rZ = Math.sin(camYaw);
    let dx = fX * mf + rX * ms;
    let dz = fZ * mf + rZ * ms;
    const mag = Math.hypot(dx, dz);
    if (mag > 0.15) {
      dx /= mag;
      dz /= mag;
    } else {
      dx = Math.sin(this.facing);
      dz = Math.cos(this.facing);
    }
    this.rollDir.set(dx, dz);
    this.isRolling = true;
    this.rollT = ROLL_DUR;
    this.rollCd = ROLL_CD;
    this.isAttacking = false;
    this.facing = Math.atan2(dx, dz);
    this.object.rotation.y = this.facing;
    this.hurtCooldown = Math.max(this.hurtCooldown, ROLL_DUR); // 全程无敌
    this.animator.playRoll();
    return true;
  }

  takeHit(damage: number) {
    if (!this.alive || this.invulnerable) return false;
    this.health = Math.max(0, this.health - damage);
    this.hurtCooldown = 0.75;
    if (this.health <= 0) {
      this.alive = false;
      this.isAttacking = false;
      this.isRolling = false;
      this._vx = 0;
      this._vz = 0;
      this.rollPivot.rotation.x = 0;
    }
    return true;
  }

  update(dt: number, input: Input, groundHeight: (x: number, z: number) => number, colliders: { x: number; z: number; r: number }[]) {
    if (this.hurtCooldown > 0) this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    if (this.rollCd > 0) this.rollCd = Math.max(0, this.rollCd - dt);

    if (!this.alive) {
      this.object.position.copy(this.position);
      this.object.rotation.z = THREE.MathUtils.damp(this.object.rotation.z, Math.PI / 2, 6, dt);
      this.rollPivot.rotation.x = 0;
      return;
    }

    // ---- 翻滚 ----
    if (this.isRolling) {
      this.rollT -= dt;
      const p = 1 - Math.max(0, this.rollT) / ROLL_DUR;
      // 前空翻一圈（绕局部 X）
      this.rollPivot.rotation.x = p * Math.PI * 2;
      this._vx = this.rollDir.x * ROLL_SPEED;
      this._vz = this.rollDir.y * ROLL_SPEED;
      this.speed = ROLL_SPEED;
      this.velocityY -= 20 * dt;

      let nx = this.position.x + this._vx * dt;
      let nz = this.position.z + this._vz * dt;
      nx = THREE.MathUtils.clamp(nx, -118, 118);
      nz = THREE.MathUtils.clamp(nz, -118, 118);
      ({ x: nx, z: nz } = this.resolveColliders(nx, nz, colliders));

      let ny = this.position.y + this.velocityY * dt;
      const gh = groundHeight(nx, nz);
      if (ny <= gh) {
        ny = gh;
        this.velocityY = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
      this.position.set(nx, ny, nz);
      this.object.position.copy(this.position);
      this.object.rotation.y = this.facing;
      this.object.rotation.z = 0;

      if (this.rollT <= 0) {
        this.isRolling = false;
        this.rollPivot.rotation.x = 0;
        this.animator.endRoll();
        this._vx *= 0.35;
        this._vz *= 0.35;
      }
      return;
    }

    this.rollPivot.rotation.x = THREE.MathUtils.damp(this.rollPivot.rotation.x, 0, 16, dt);

    // ---- 相机相对移动（塞尔达） ----
    const mf = input.moveForward;
    const ms = input.moveStrafe;
    const camYaw = input.yaw;
    const fX = -Math.sin(camYaw);
    const fZ = -Math.cos(camYaw);
    const rX = -Math.cos(camYaw);
    const rZ = Math.sin(camYaw);

    const move = new THREE.Vector3();
    const moveMag = Math.hypot(mf, ms);
    if (moveMag > 0.001) {
      const inv = 1 / moveMag;
      move.x = (fX * mf + rX * ms) * inv;
      move.z = (fZ * mf + rZ * ms) * inv;
    }

    // 朝向：有移动跟速度；攻击锁定 faceTowards；镜头拖动不转身
    if (this._desiredYaw !== null) {
      let d = this._desiredYaw - this.object.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.object.rotation.y += d * Math.min(1, dt * 14);
      if (Math.abs(d) < 0.02) {
        this.object.rotation.y = this._desiredYaw;
        this._desiredYaw = null;
      }
    } else if (moveMag > 0.2 && !this.isAttacking) {
      const targetYaw = Math.atan2(move.x, move.z);
      let d = targetYaw - this.object.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.object.rotation.y += d * Math.min(1, dt * 12);
    }
    // 消费镜头增量但不转身（仅清零，避免堆积）
    input.rightYawDelta = 0;
    this.facing = this.object.rotation.y;

    let maxSpeed = 4.5 * Math.min(1, moveMag || 1);
    if (input.sprint && moveMag > 0.55) maxSpeed = 8.5;
    if (this.isAttacking) maxSpeed *= 0.45;
    const accel = this.grounded ? 14 : 5;

    const targetVx = move.x * maxSpeed;
    const targetVz = move.z * maxSpeed;
    const vx = THREE.MathUtils.damp(this._vx, targetVx, accel, dt);
    const vz = THREE.MathUtils.damp(this._vz, targetVz, accel, dt);
    this._vx = vx;
    this._vz = vz;
    this.speed = Math.hypot(vx, vz);

    if (input.jumpPressed && this.grounded && !this.isAttacking) {
      this.velocityY = 7.2;
      this.grounded = false;
      this.animator.play('jump');
    }
    this.velocityY -= 20 * dt;

    let nx = this.position.x + vx * dt;
    let nz = this.position.z + vz * dt;
    nx = THREE.MathUtils.clamp(nx, -118, 118);
    nz = THREE.MathUtils.clamp(nz, -118, 118);
    ({ x: nx, z: nz } = this.resolveColliders(nx, nz, colliders));

    let ny = this.position.y + this.velocityY * dt;
    const gh = groundHeight(nx, nz);
    if (ny <= gh) {
      ny = gh;
      this.velocityY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.position.set(nx, ny, nz);
    this.object.position.copy(this.position);
    this.object.rotation.z = THREE.MathUtils.damp(this.object.rotation.z, 0, 10, dt);

    if (this.isAttacking && this.animator.isOneShotDone()) {
      this.isAttacking = false;
    }

    if (this.isAttacking || (!this.grounded && this.animator.currentName === 'jump')) {
      // keep one-shot
    } else if (!this.grounded) {
      this.animator.play('jump');
    } else if (this.speed > 6) {
      this.animator.play('run');
    } else if (this.speed > 0.4) {
      this.animator.play('walk');
    } else {
      this.animator.play('idle');
    }
  }

  private resolveColliders(nx: number, nz: number, colliders: { x: number; z: number; r: number }[]) {
    for (const c of colliders) {
      const dx = nx - c.x;
      const dz = nz - c.z;
      const dist = Math.hypot(dx, dz);
      const minDist = c.r + this.radius;
      if (dist < minDist && dist > 0.0001) {
        nx = c.x + (dx / dist) * minDist;
        nz = c.z + (dz / dist) * minDist;
      }
    }
    return { x: nx, z: nz };
  }
}
