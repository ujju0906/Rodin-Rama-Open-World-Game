/** Small dev overlay: FPS, frame time, draw calls, triangles, quality, game clock. */
export class FpsMeter {
  private readonly el: HTMLDivElement;
  private acc = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'fps-meter';
    document.body.appendChild(this.el);
  }

  set visible(v: boolean) {
    this.el.style.display = v ? 'block' : 'none';
  }

  get visible(): boolean {
    return this.el.style.display !== 'none';
  }

  update(
    dt: number,
    info: { fps: number; ms: number; calls: number; tris: number; quality: string; hour: number },
  ): void {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const hh = Math.floor(info.hour);
    const mm = Math.floor((info.hour - hh) * 60);
    this.el.textContent =
      `${info.fps.toFixed(0)} fps  ${info.ms.toFixed(1)} ms\n` +
      `${info.calls} draws  ${(info.tris / 1000).toFixed(0)}k tris\n` +
      `${info.quality}  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
