// 键盘 + 鼠标输入（魔兽世界默认键位）
export class Input {
  private keys = new Set<string>();
  yaw = Math.PI;       // 相机水平角（初始在角色背后）
  pitch = 0.35;       // 相机俯仰
  distance = 7;
  rightYawDelta = 0;  // 本帧鼠标右键产生的转身增量（给角色消费）

  private button = -1;
  private lastX = 0;
  private lastY = 0;

  constructor(canvas: HTMLCanvasElement) {
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
      const yawDelta = -dx * 0.005;
      this.yaw += yawDelta;
      this.pitch = Math.max(0.05, Math.min(1.4, this.pitch - dy * 0.005));
      // 右键拖动：角色跟随转身
      if (this.button === 2) {
        this.rightYawDelta += yawDelta;
      }
    });
    // 屏蔽右键菜单（右键用于转视角）
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      this.distance = Math.max(3, Math.min(14, this.distance + e.deltaY * 0.01));
    }, { passive: true });
  }

  get forward() { return this.keys.has('KeyW') || this.keys.has('ArrowUp'); }
  get back() { return this.keys.has('KeyS') || this.keys.has('ArrowDown'); }
  get turnLeft() { return this.keys.has('KeyA') || this.keys.has('ArrowLeft'); }
  get turnRight() { return this.keys.has('KeyD') || this.keys.has('ArrowRight'); }
  get strafeLeft() { return this.keys.has('KeyQ'); }
  get strafeRight() { return this.keys.has('KeyE'); }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get attackPressed() {
    if (this.keys.has('KeyJ')) {
      if (!this._attackLatch) { this._attackLatch = true; return true; }
    } else {
      this._attackLatch = false;
    }
    return false;
  }
  private _attackLatch = false;

  get jumpPressed() {
    if (this.keys.has('Space')) {
      if (!this._jumpLatch) {
        this._jumpLatch = true;
        return true;
      }
    } else {
      this._jumpLatch = false;
    }
    return false;
  }
  private _jumpLatch = false;
}
