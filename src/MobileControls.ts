import type { Input } from './Input';

/** 手机：左摇杆（相机相对），右下 攻/跳/滚 */
export class MobileControls {
  private root: HTMLDivElement;
  private knob: HTMLDivElement;
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
        <button type="button" id="mc-roll" aria-label="翻滚">滚</button>
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
        position: absolute; right: 14px; bottom: 28px;
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        pointer-events: auto; align-items: end;
      }
      #mobile-controls .btns button {
        width: 64px; height: 64px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.45);
        background: rgba(20,24,32,.45); color: #fff;
        font-size: 16px; font-weight: 600;
        -webkit-tap-highlight-color: transparent; user-select: none;
      }
      #mobile-controls #mc-atk {
        grid-column: 2; grid-row: 1 / span 2;
        width: 78px; height: 78px; font-size: 20px; margin-bottom: 8px;
      }
      #mobile-controls #mc-jump { grid-column: 1; grid-row: 2; }
      #mobile-controls #mc-roll { grid-column: 1; grid-row: 1; }
      #mobile-controls .btns button:active { background: rgba(255,200,80,.45); }
      @media (pointer: fine) {
        #mobile-controls.show { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this.root);

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
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    };
    bindBtn('#mc-atk', () => this.input.queueAttack());
    bindBtn('#mc-jump', () => this.input.queueJump());
    bindBtn('#mc-roll', () => this.input.queueRoll());

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
    const nx = dx / this.maxR;
    const ny = -dy / this.maxR;
    const mag = Math.min(1, Math.hypot(nx, ny));
    const dead = 0.18;
    if (mag < dead) {
      this.input.setStick(0, 0, false);
      return;
    }
    const scale = (mag - dead) / (1 - dead);
    this.input.setStick((ny / mag) * scale, (nx / mag) * scale, mag > 0.85);
  }
}
