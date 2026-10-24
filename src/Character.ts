import * as THREE from 'three';
import type { Input } from './Input';
import type { Animator } from './Animator';

const ROLL_DUR = 0.48;
const ROLL_SPEED = 11.5;
const ROLL_CD = 0.55;
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** 塞尔达式：用相机真实朝向算移动，避免手写 yaw 符号搞反 */
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
  private baseY = 0; // 翻滚前离地高度，用于 hop

  readonly radius = 0.45;
  readonly height = 1.9;

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

  /** 世界前方单位向量（与角色视觉朝向一致） */
  getForwardXZ(out = new THREE.Vector2()) {
    return out.set(Math.sin(this.facing), Math.cos(this.facing));
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

  triggerRoll(input: Input, camera: THREE.Camera) {
    if (!this.alive || this.isRolling || this.isAttacking || !this.grounded || this.rollCd > 0) {
      return false;
    }
    this.computeCamBasis(camera);
    const mf = input.moveForward;
    const ms = input.moveStrafe;
    let dx = _fwd.x * mf + _right.x * ms;
    let dz = _fwd.z * mf + _right.z * ms;
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
    this.baseY = this.position.y;
    this.hurtCooldown = Math.max(this.hurtCooldown, ROLL_DUR);
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
      this.rollPivot.rotation.set(0, 0, 0);
      this.rollPivot.position.y = 0;
    }
    return true;
  }

  update(
    dt: number,
    input: Input,
    camera: THREE.Camera,
    groundHeight: (x: number, z: number) => number,
    colliders: { x: number; z: number; r: number }[],
  ) {
    if (this.hurtCooldown > 0) this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    if (this.rollCd > 0) this.rollCd = Math.max(0, this.rollCd - dt);

    if (!this.alive) {
      this.object.position.copy(this.position);
      this.object.rotation.z = THREE.MathUtils.damp(this.object.rotation.z, Math.PI / 2, 6, dt);
      this.rollPivot.rotation.set(0, 0, 0);
      this.rollPivot.position.y = 0;
      return;
    }

    if (this.isRolling) {
      this.rollT -= dt;
      const p = 1 - Math.max(0, this.rollT) / ROLL_DUR;
      // 绕角色右轴前翻一圈（局部 X），抬离地面。不再叠 jump 片段，避免肢体乱拧。
      this.rollPivot.position.y = 0.9;
      this.rollPivot.rotation.x = p * Math.PI * 2;
      this.rollPivot.rotation.y = 0;
      this.rollPivot.rotation.z = 0;
      this._vx = this.rollDir.x * ROLL_SPEED;
      this._vz = this.rollDir.y * ROLL_SPEED;
      this.speed = ROLL_SPEED;
      this.velocityY = 0;

      let nx = this.position.x + this._vx * dt;
      let nz = this.position.z + this._vz * dt;
      nx = THREE.MathUtils.clamp(nx, -118, 118);
      nz = THREE.MathUtils.clamp(nz, -118, 118);
      ({ x: nx, z: nz } = this.resolveColliders(nx, nz, colliders));
      const gh = groundHeight(nx, nz);
      const hop = Math.sin(p * Math.PI) * 0.7;
      this.position.set(nx, gh + hop, nz);
      this.object.position.copy(this.position);
      this.object.rotation.y = this.facing;
      this.object.rotation.z = 0;
      this.grounded = hop < 0.05;

      if (this.rollT <= 0) {
        this.isRolling = false;
        this.rollPivot.rotation.set(0, 0, 0);
        this.rollPivot.position.y = 0;
        this.position.y = gh;
        this.object.position.y = gh;
        this.grounded = true;
        this.animator.endRoll();
        this._vx *= 0.35;
        this._vz *= 0.35;
      }
      return;
    }

    this.rollPivot.rotation.x = THREE.MathUtils.damp(this.rollPivot.rotation.x, 0, 16, dt);
    this.rollPivot.position.y = THREE.MathUtils.damp(this.rollPivot.position.y, 0, 16, dt);

    this.computeCamBasis(camera);
    const mf = input.moveForward;
    const ms = input.moveStrafe;

    const move = new THREE.Vector3();
    const moveMag = Math.hypot(mf, ms);
    if (moveMag > 0.001) {
      const inv = 1 / moveMag;
      move.x = (_fwd.x * mf + _right.x * ms) * inv;
      move.z = (_fwd.z * mf + _right.z * ms) * inv;
    }

    if (this._desiredYaw !== null) {
      let d = this._desiredYaw - this.object.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.object.rotation.y += d * Math.min(1, dt * 16);
      if (Math.abs(d) < 0.02) {
        this.object.rotation.y = this._desiredYaw;
        this._desiredYaw = null;
      }
    } else if (moveMag > 0.15 && !this.isAttacking) {
      const targetYaw = Math.atan2(move.x, move.z);
      let d = targetYaw - this.object.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.object.rotation.y += d * Math.min(1, dt * 22);
      if (Math.abs(d) < 0.08) this.object.rotation.y = targetYaw;
    }
    input.rightYawDelta = 0;
    this.facing = this.object.rotation.y;

    const analog = Math.abs(input.stickForward) > 0.01 || Math.abs(input.stickStrafe) > 0.01;
    const speedScale = analog ? Math.min(1, moveMag) : (moveMag > 0.01 ? 1 : 0);
    let maxSpeed = 4.5 * speedScale;
    if (input.sprint && moveMag > 0.35) maxSpeed = 8.5 * (analog ? Math.min(1, moveMag) : 1);
    if (this.isAttacking) maxSpeed *= 0.45;
    const accel = this.grounded ? 18 : 6;

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
      // keep
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

  private computeCamBasis(camera: THREE.Camera) {
    // lookAt 相机的局部 +X 在画面上是左边，不能拿来当「屏幕右」。
    // 视线水平分量 × 世界上方向的反过来：up × look = 屏幕右。
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
    else _fwd.normalize();
    _right.crossVectors(_up, _fwd);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
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
