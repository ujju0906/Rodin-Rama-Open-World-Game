/** Keyboard, mouse (pointer lock) and gamepad, merged into one state the game reads each frame. */
export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  lookX = 0;
  lookY = 0;
  moveX = 0;
  moveY = 0;
  fire = false;
  aim = false;
  locked = false;
  sensitivity = 1;
  private padPrev: boolean[] = [];
  private padButtons: boolean[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (k === 'tab' || k === ' ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.fire = this.aim = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX * 0.0023 * this.sensitivity;
      this.lookY += e.movementY * 0.0023 * this.sensitivity;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.aim = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.aim = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock(): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => undefined);
    } catch {
      /* pointer lock can be refused; the game then waits for another click */
    }
  }

  /** True once per key press. */
  hit(key: string): boolean {
    return this.pressed.has(key);
  }

  private padHit(i: number): boolean {
    return !!this.padButtons[i] && !this.padPrev[i];
  }

  /** Call at the start of a frame: reads the gamepad and builds the move vector. */
  poll(): void {
    let mx = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0);
    let my = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0);
    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    this.padPrev = this.padButtons;
    this.padButtons = [];
    if (pad) {
      const dz = (v: number): number => (Math.abs(v) < 0.18 ? 0 : v);
      mx += dz(pad.axes[0] ?? 0);
      my -= dz(pad.axes[1] ?? 0);
      this.lookX += dz(pad.axes[2] ?? 0) * 0.045 * this.sensitivity;
      this.lookY += dz(pad.axes[3] ?? 0) * 0.035 * this.sensitivity;
      this.padButtons = pad.buttons.map((b) => b.pressed);
      const set = (i: number, key: string): void => {
        if (this.padButtons[i]) this.keys.add(key);
        else if (this.padPrev[i]) this.keys.delete(key);
        if (this.padHit(i)) this.pressed.add(key);
      };
      set(0, ' ');
      set(1, 'control');
      set(3, 'e');
      set(2, 'f');
      set(5, 'q');
      set(4, 'tab');
      set(10, 'shift');
      this.aim = this.aim || !!this.padButtons[6];
      if (this.padButtons[7]) this.fire = true;
      else if (this.padPrev[7]) this.fire = false;
      if (this.padPrev[6] && !this.padButtons[6]) this.aim = false;
    }
    const len = Math.hypot(mx, my);
    this.moveX = len > 1 ? mx / len : mx;
    this.moveY = len > 1 ? my / len : my;
  }

  /** Call at the end of a frame. */
  endFrame(): void {
    this.pressed.clear();
    this.lookX = this.lookY = 0;
  }

  rumble(strength: number, ms: number): void {
    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    const act = (
      pad as unknown as {
        vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> };
      }
    )?.vibrationActuator;
    act
      ?.playEffect?.('dual-rumble', {
        duration: ms,
        strongMagnitude: strength,
        weakMagnitude: strength,
      })
      ?.catch(() => undefined);
  }
}
