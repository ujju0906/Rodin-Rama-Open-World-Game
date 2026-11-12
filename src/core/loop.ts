/** The frame loop: calls update with a clamped delta and tracks a smoothed FPS. */
export class Loop {
  fps = 60;
  frameMs = 16.7;
  elapsed = 0;
  private last = 0;
  private running = false;

  constructor(private readonly update: (dt: number, elapsed: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const rawMs = now - this.last;
    this.last = now;
    this.frameMs += (rawMs - this.frameMs) * 0.08;
    this.fps = 1000 / Math.max(this.frameMs, 0.001);
    const dt = Math.min(rawMs / 1000, 0.1);
    this.elapsed += dt;
    this.update(dt, this.elapsed);
    requestAnimationFrame(this.tick);
  };
}

/** Resolves after the browser has painted, so loading-screen text can update. */
export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
