// 键盘 + 鼠标 + 触屏（魔兽世界式：角色相对移动）
export class Input {
  private keys = new Set<string>();
  yaw = Math.PI;       // 相机水平角（初始在角色背后）
  pitch = 0.35;       // 相机俯仰
  distance = 7;
  rightYawDelta = 0;  // 本帧产生的转身增量（给角色消费）

  /** 触屏摇杆：角色相对，-1..1 */
  stickForward = 0;
  stickStrafe = 0;
  touchSprint = false;
  private touchAttack = false;
  private touchJump = false;
  private _attackLatch = false;
  private _jumpLatch = false;

  private button = -1;
  private lastX = 0;
  private lastY = 0;
  private lookTouchId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  readonly isTouch: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.button = e.button;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => (this.button = -1));
    window.addEventListener('mousemove', (e) => {
      if (this.button !== 0 && this.button !== 2) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.applyLookDelta(dx, dy, this.button === 2);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      this.distance = Math.max(3, Math.min(14, this.distance + e.deltaY * 0.01));
    }, { passive: true });

    // 右半屏拖动转视角（避开左侧摇杆与右侧按钮区）
    canvas.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.lookTouchId !== null) continue;
        if (t.clientX < window.innerWidth * 0.42) continue; // 左半给摇杆
        if (t.clientX > window.innerWidth * 0.72 && t.clientY > window.innerHeight * 0.55) continue; // 右下按钮
        this.lookTouchId = t.identifier;
        this.lookLastX = t.clientX;
        this.lookLastY = t.clientY;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (this.lookTouchId === null) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.lookTouchId) continue;
        const dx = t.clientX - this.lookLastX;
        const dy = t.clientY - this.lookLastY;
        this.lookLastX = t.clientX;
        this.lookLastY = t.clientY;
        this.applyLookDelta(dx, dy, true); // 拖动同时转身（类右键）
      }
    }, { passive: true });

    const endLook = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    canvas.addEventListener('touchend', endLook, { passive: true });
    canvas.addEventListener('touchcancel', endLook, { passive: true });
  }

  private applyLookDelta(dx: number, dy: number, turnCharacter: boolean) {
    const yawDelta = -dx * 0.005;
    this.yaw += yawDelta;
    this.pitch = Math.max(0.05, Math.min(1.4, this.pitch - dy * 0.005));
    if (turnCharacter) this.rightYawDelta += yawDelta;
  }

  /** 由 MobileControls 写入摇杆 */
  setStick(forward: number, strafe: number, sprint: boolean) {
    this.stickForward = forward;
    this.stickStrafe = strafe;
    this.touchSprint = sprint;
  }

  queueAttack() { this.touchAttack = true; }
  queueJump() { this.touchJump = true; }

  get moveForward(): number {
    let v = this.stickForward;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v -= 1;
    return Math.max(-1, Math.min(1, v));
  }
  get moveStrafe(): number {
    let v = this.stickStrafe;
    if (this.keys.has('KeyQ')) v -= 1;
    if (this.keys.has('KeyE')) v += 1;
    return Math.max(-1, Math.min(1, v));
  }

  get forward() { return this.moveForward > 0.25; }
  get back() { return this.moveForward < -0.25; }
  get turnLeft() { return this.keys.has('KeyA') || this.keys.has('ArrowLeft'); }
  get turnRight() { return this.keys.has('KeyD') || this.keys.has('ArrowRight'); }
  get strafeLeft() { return this.moveStrafe < -0.25; }
  get strafeRight() { return this.moveStrafe > 0.25; }
  get sprint() {
    return this.touchSprint || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  get attackPressed() {
    if (this.touchAttack) {
      this.touchAttack = false;
      return true;
    }
    if (this.keys.has('KeyJ')) {
      if (!this._attackLatch) { this._attackLatch = true; return true; }
    } else {
      this._attackLatch = false;
    }
    return false;
  }

  get jumpPressed() {
    if (this.touchJump) {
      this.touchJump = false;
      return true;
    }
    if (this.keys.has('Space')) {
      if (!this._jumpLatch) { this._jumpLatch = true; return true; }
    } else {
      this._jumpLatch = false;
    }
    return false;
  }
}
