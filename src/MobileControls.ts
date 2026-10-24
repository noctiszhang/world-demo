import type { Input } from './Input';

/** 手机：左摇杆移动，右下攻击/跳跃 */
export class MobileControls {
  private root: HTMLDivElement;
  private knob: HTMLDivElement;
  private base: HTMLDivElement;
  private active = false;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly maxR = 54;

  constructor(private input: Input) {
    this.root = document.createElement('div');
    this.root.id = 'mobile-controls';
    this.root.innerHTML = `
      <div class="stick" id="mc-stick">
        <div class="base"></div>
        <div class="knob"></div>
      </div>
      <div class="btns">
        <button type="button" id="mc-jump" aria-label="跳跃">跳</button>
        <button type="button" id="mc-atk" aria-label="攻击">攻</button>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
      #mobile-controls {
        display: none; position: fixed; inset: 0; z-index: 40;
        pointer-events: none; touch-action: none;
        font-family: -apple-system, "PingFang SC", "Noto Sans SC", sans-serif;
      }
      #mobile-controls.show { display: block; }
      #mobile-controls .stick {
        position: absolute; left: 18px; bottom: 28px;
        width: 128px; height: 128px; pointer-events: auto;
      }
      #mobile-controls .base {
        position: absolute; inset: 0; border-radius: 50%;
        background: rgba(0,0,0,.28); border: 2px solid rgba(255,255,255,.35);
      }
      #mobile-controls .knob {
        position: absolute; left: 50%; top: 50%; width: 52px; height: 52px;
        margin: -26px 0 0 -26px; border-radius: 50%;
        background: rgba(255,255,255,.55); border: 2px solid rgba(255,255,255,.7);
        box-shadow: 0 2px 8px rgba(0,0,0,.25);
      }
      #mobile-controls .btns {
        position: absolute; right: 16px; bottom: 36px;
        display: flex; flex-direction: column; gap: 14px; pointer-events: auto;
      }
      #mobile-controls .btns button {
        width: 72px; height: 72px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.45);
        background: rgba(20,24,32,.45); color: #fff;
        font-size: 18px; font-weight: 600; pointer-events: auto;
        -webkit-tap-highlight-color: transparent; user-select: none;
      }
      #mobile-controls .btns button:active { background: rgba(255,200,80,.45); }
      #mobile-controls #mc-atk { width: 84px; height: 84px; font-size: 20px; }
      @media (pointer: fine) {
        #mobile-controls.show { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this.root);

    this.base = this.root.querySelector('.base') as HTMLDivElement;
    this.knob = this.root.querySelector('.knob') as HTMLDivElement;
    const stick = this.root.querySelector('#mc-stick') as HTMLDivElement;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      stick.setPointerCapture(e.pointerId);
      this.pointerId = e.pointerId;
      this.active = true;
      const rect = stick.getBoundingClientRect();
      this.originX = rect.left + rect.width / 2;
      this.originY = rect.top + rect.height / 2;
      this.updateKnob(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.active || e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this.updateKnob(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.active = false;
      this.pointerId = null;
      this.knob.style.transform = 'translate(0,0)';
      this.input.setStick(0, 0, false);
    };
    stick.addEventListener('pointerdown', onDown);
    stick.addEventListener('pointermove', onMove);
    stick.addEventListener('pointerup', onUp);
    stick.addEventListener('pointercancel', onUp);

    const bindBtn = (id: string, fn: () => void) => {
      const el = this.root.querySelector(id) as HTMLButtonElement;
      const fire = (e: Event) => { e.preventDefault(); e.stopPropagation(); fn(); };
      el.addEventListener('pointerdown', fire);
    };
    bindBtn('#mc-atk', () => this.input.queueAttack());
    bindBtn('#mc-jump', () => this.input.queueJump());

    this.syncVisibility();
    window.addEventListener('resize', () => this.syncVisibility());
  }

  private syncVisibility() {
    const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.root.classList.toggle('show', touch);
  }

  private updateKnob(x: number, y: number) {
    let dx = x - this.originX;
    let dy = y - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > this.maxR) {
      dx = (dx / len) * this.maxR;
      dy = (dy / len) * this.maxR;
    }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    // 屏幕坐标：上=-y → 前进；右=+x → 右平移
    const nx = dx / this.maxR;
    const ny = -dy / this.maxR;
    const mag = Math.min(1, Math.hypot(nx, ny));
    const dead = 0.18;
    if (mag < dead) {
      this.input.setStick(0, 0, false);
      return;
    }
    const scale = (mag - dead) / (1 - dead);
    const fx = (nx / mag) * scale;
    const fy = (ny / mag) * scale;
    this.input.setStick(fy, fx, mag > 0.85);
  }
}
