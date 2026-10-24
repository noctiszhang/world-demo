import * as THREE from 'three';
import type { Input } from './Input';
import type { Animator } from './Animator';

// 第三人称角色控制器（魔兽世界式：角色相对移动）
export class Character {
  position = new THREE.Vector3(0, 0, 4);
  velocityY = 0;
  grounded = true;
  speed = 0;
  facing = 0;       // 角色朝向（= object.rotation.y）
  isAttacking = false;
  health = 100;
  maxHealth = 100;
  alive = true;
  private hurtCooldown = 0;

  // 碰撞用近似胶囊
  readonly radius = 0.45;
  readonly height = 1.9;

  constructor(private object: THREE.Object3D, private animator: Animator) {
    this.facing = object.rotation.y;
  }

  // 公开：原地转向到面向世界点 (x,z)
  faceTowards(x: number, z: number) {
    const yaw = Math.atan2(x - this.position.x, z - this.position.z);
    this._desiredYaw = yaw;
  }
  private _desiredYaw: number | null = null;

  // 公开：移动到某点（直接设位置，测试/瞬移用）
  teleport(x: number, y: number, z: number) {
    this.position.set(x, y, z);
  }

  // 公开：触发攻击
  triggerAttack() {
    if (!this.alive || this.isAttacking || !this.grounded) return false;
    this.isAttacking = true;
    this.animator.play('attack');
    return true;
  }

  takeHit(damage: number) {
    if (!this.alive || this.hurtCooldown > 0) return false;
    this.health = Math.max(0, this.health - damage);
    this.hurtCooldown = 0.85; // 受击无敌帧：躲开连打/围殴
    if (this.health <= 0) {
      this.alive = false;
      this.isAttacking = false;
      this._vx = 0;
      this._vz = 0;
    }
    return true;
  }

  update(dt: number, input: Input, groundHeight: (x: number, z: number) => number, colliders: { x: number; z: number; r: number }[]) {
    if (this.hurtCooldown > 0) this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);

    if (!this.alive) {
      this.object.position.copy(this.position);
      // 倒地一点
      this.object.rotation.z = THREE.MathUtils.damp(this.object.rotation.z, Math.PI / 2, 6, dt);
      return;
    }

    // ---- 转身（A/D、方向键、鼠标右键、faceTowards） ----
    if (input.turnLeft) this.object.rotation.y += 2.8 * dt;
    if (input.turnRight) this.object.rotation.y -= 2.8 * dt;
    if (input.rightYawDelta !== 0) {
      this.object.rotation.y += input.rightYawDelta;
      input.rightYawDelta = 0;
    }
    if (this._desiredYaw !== null) {
      let d = this._desiredYaw - this.object.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.object.rotation.y += d * Math.min(1, dt * 14);
      if (Math.abs(d) < 0.01) {
        this.object.rotation.y = this._desiredYaw;
        this._desiredYaw = null;
      }
    }
    this.facing = this.object.rotation.y;

    // ---- 角色相对移动（支持摇杆模拟量） ----
    let mf = input.moveForward;
    let ms = input.moveStrafe;
    // 键盘 A/D 仍为原地转向，不并入平移

    const move = new THREE.Vector3();
    const moveMag = Math.hypot(mf, ms);
    if (moveMag > 0.001) {
      const s = Math.sin(this.facing);
      const c = Math.cos(this.facing);
      const inv = 1 / moveMag;
      move.x = (s * mf + c * ms) * inv;
      move.z = (c * mf - s * ms) * inv;
    }

    let maxSpeed = 4.5 * Math.min(1, moveMag || 1);
    if (mf < -0.25 && Math.abs(mf) >= Math.abs(ms)) maxSpeed = 1.8 * Math.min(1, moveMag);
    else if (input.sprint && mf > 0.35) maxSpeed = 8.5;
    // 攻击中仍可慢速侧移/后撤，便于走位躲开怪的前摇
    if (this.isAttacking) maxSpeed *= 0.45;
    const accel = this.grounded ? 14 : 5;

    const targetVx = move.x * maxSpeed;
    const targetVz = move.z * maxSpeed;
    const vx = THREE.MathUtils.damp(this._vx, targetVx, accel, dt);
    const vz = THREE.MathUtils.damp(this._vz, targetVz, accel, dt);
    this._vx = vx;
    this._vz = vz;
    this.speed = Math.hypot(vx, vz);

    // ---- 重力 / 跳跃 ----
    if (input.jumpPressed && this.grounded && !this.isAttacking) {
      this.velocityY = 7.2;
      this.grounded = false;
      this.animator.play('jump');
    }
    this.velocityY -= 20 * dt;

    let nx = this.position.x + vx * dt;
    let nz = this.position.z + vz * dt;

    const bound = 118;
    nx = THREE.MathUtils.clamp(nx, -bound, bound);
    nz = THREE.MathUtils.clamp(nz, -bound, bound);

    // 圆柱碰撞
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

    // ---- 攻击一次性动作结束检测 ----
    if (this.isAttacking && this.animator.isOneShotDone()) {
      this.isAttacking = false;
    }

    // ---- 选择循环动画 ----
    if (this.animator_isOneShotActive()) {
      // jump/attack 期间不切换
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

  private animator_isOneShotActive() {
    return !this.grounded || this.isAttacking;
  }

  private _vx = 0;
  private _vz = 0;
}
