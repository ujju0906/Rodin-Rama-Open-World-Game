import './hud.css';
import { QUALITY_ORDER, type QualityName } from '../data/quality';

export interface HudState {
  health: number;
  focus: number;
  objective: string;
  /** Angle to the objective relative to the camera (radians, 0 = straight ahead), or null. */
  markerAngle: number | null;
  markerDistance: number;
  camYaw: number;
  spread: number;
  showCross: boolean;
  astras: { key: string; name: string; known: boolean; selected: boolean; cooldown: number }[];
  drishti: { known: boolean; cooldown: number };
  boss: number | null;
  hurt: number;
}

const el = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

/** Minimal HUD: health, focus, astra slots, compass, objective, crosshair, boss bar, story text. */
export class Hud {
  private root: HTMLDivElement;
  private overlay: HTMLDivElement;
  private cardEl: HTMLDivElement;
  private storyTimer = 0;
  private toastTimer = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="vig"></div><div class="gold"></div>
      <div class="compass"></div>
      <div class="objective"></div>
      <div class="toast"></div>
      <div class="cross"><i class="d"></i><i class="l"></i><i class="r"></i><i class="t"></i><i class="b"></i></div>
      <div class="boss"><span>Tataka</span><div class="bar"><i></i></div></div>
      <div class="story"><h3></h3><p></p></div>
      <div class="bars"><div class="bar hp"><i></i></div><div class="bar fo"><i></i></div></div>
      <div class="astras"></div>`;
    this.overlay = document.createElement('div');
    this.overlay.id = 'overlay';
    this.cardEl = document.createElement('div');
    this.cardEl.id = 'card';
    this.cardEl.innerHTML =
      '<div class="art"></div><div class="shade"></div><div class="text"><h2></h2><p></p><small>Click to continue</small></div>';
    document.body.append(this.root, this.overlay, this.cardEl);
  }

  show(on: boolean): void {
    this.root.classList.toggle('on', on);
  }

  /** Full-screen illustrated story card. Resolves when the player clicks or presses Enter. */
  card(art: string, title: string, text: string, portrait = false): Promise<void> {
    const c = this.cardEl;
    (c.querySelector('.art') as HTMLElement).style.backgroundImage =
      `url(${import.meta.env.BASE_URL}art/${art}.jpg)`;
    c.querySelector('h2')!.textContent = title;
    c.querySelector('p')!.textContent = text;
    c.classList.toggle('portrait', portrait);
    c.classList.remove('on');
    void c.offsetWidth; // restart the animations
    c.classList.add('on');
    return new Promise((resolve) => {
      const opened = performance.now();
      const done = (e: Event): void => {
        if (performance.now() - opened < 600) return;
        if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
        c.removeEventListener('click', done);
        window.removeEventListener('keydown', done);
        c.classList.remove('on');
        resolve();
      };
      c.addEventListener('click', done);
      window.addEventListener('keydown', done);
    });
  }

  story(title: string, text: string, seconds = 7): void {
    el('#hud .story h3').textContent = title;
    el('#hud .story p').textContent = text;
    el('#hud .story').classList.add('on');
    this.storyTimer = seconds;
  }

  toast(text: string, seconds = 3): void {
    const t = el('#hud .toast');
    t.textContent = text;
    t.classList.add('on');
    this.toastTimer = seconds;
  }

  flashGold(): void {
    const g = el('#hud .gold');
    g.style.transition = 'none';
    g.style.opacity = '1';
    requestAnimationFrame(() => {
      g.style.transition = 'opacity 1.4s';
      g.style.opacity = '0';
    });
  }

  update(dt: number, s: HudState): void {
    if (this.storyTimer > 0 && (this.storyTimer -= dt) <= 0)
      el('#hud .story').classList.remove('on');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0)
      el('#hud .toast').classList.remove('on');
    el('#hud .hp i').style.transform = `scaleX(${Math.max(0, s.health)})`;
    el('#hud .fo i').style.transform = `scaleX(${Math.max(0, s.focus)})`;
    el('#hud .objective').textContent = s.objective;
    el('#hud .vig').style.opacity = String(Math.min(1, s.hurt * 3 + (s.health < 0.3 ? 0.35 : 0)));

    // Compass: cardinal letters plus the objective marker.
    const width = el('#hud .compass').clientWidth || 420;
    const fov = 1.9;
    let html = '';
    for (const [label, ang] of [
      ['N', Math.PI],
      ['E', -Math.PI / 2],
      ['S', 0],
      ['W', Math.PI / 2],
    ] as const) {
      const rel = Math.atan2(Math.sin(ang - s.camYaw), Math.cos(ang - s.camYaw));
      if (Math.abs(rel) < fov / 2)
        html += `<span style="left:${(0.5 - rel / fov) * width}px">${label}</span>`;
    }
    if (s.markerAngle !== null) {
      const rel = Math.max(-fov / 2 + 0.06, Math.min(fov / 2 - 0.06, s.markerAngle));
      html += `<em style="left:${(0.5 - rel / fov) * width}px">◆ ${Math.round(s.markerDistance)} m</em>`;
    }
    el('#hud .compass').innerHTML = html;

    // Crosshair: four ticks that close in as the bow is drawn.
    const cross = el('#hud .cross');
    cross.style.display = s.showCross ? 'block' : 'none';
    const gap = 5 + s.spread * 7;
    const set = (sel: string, x: number, y: number, w: number, h: number): void => {
      const i = cross.querySelector(sel) as HTMLElement;
      i.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    };
    set('.l', -gap - 9, -1, 9, 2);
    set('.r', gap, -1, 9, 2);
    set('.t', -1, -gap - 9, 2, 9);
    set('.b', -1, gap, 2, 9);

    const slots = [
      ...s.astras.map((a) => ({ ...a, glyph: a.name[0]! })),
      {
        key: 'E',
        name: 'Drishti',
        known: s.drishti.known,
        selected: false,
        cooldown: s.drishti.cooldown,
        glyph: '◉',
      },
    ];
    el('#hud .astras').innerHTML = slots
      .map(
        (a) =>
          `<div class="slot ${a.known ? 'known' : ''} ${a.selected ? 'sel' : ''}"><kbd>${a.key}</kbd><b>${a.known ? a.glyph : '·'}</b>${a.known ? a.name.replace('astra', '') : ''}<u style="height:${Math.min(1, a.cooldown) * 100}%"></u></div>`,
      )
      .join('');

    const boss = el('#hud .boss');
    boss.classList.toggle('on', s.boss !== null);
    if (s.boss !== null)
      (boss.querySelector('i') as HTMLElement).style.transform = `scaleX(${Math.max(0, s.boss)})`;
  }

  /** Pause / death / victory screen. */
  overlayShow(
    kind: 'pause' | 'dead' | 'won',
    opts: {
      quality: QualityName;
      onQuality(q: QualityName): void;
      onResume(): void;
      onVolume(v: number): void;
      onSens(v: number): void;
      volume: number;
      sens: number;
      onReset(): void;
    },
  ): void {
    const controls = `<table>
      <tr><td>Move / look</td><td>W A S D / mouse</td></tr>
      <tr><td>Sprint · dodge · jump</td><td>Shift · Ctrl · Space</td></tr>
      <tr><td>Draw and release the bow</td><td>hold and release left mouse (right mouse: aim)</td></tr>
      <tr><td>Chant an astra</td><td>hold Q, release when the rings are full (1 / 2 or Tab to choose)</td></tr>
      <tr><td>Divya Drishti</td><td>E</td></tr>
      <tr><td>Focus (slow time)</td><td>draw while in the air or just after a dodge</td></tr>
      <tr><td>Photo camera · stats</td><td>P · F</td></tr></table>`;
    const title =
      kind === 'pause' ? 'Paused' : kind === 'dead' ? 'You have fallen' : 'Dharma prevails';
    const text =
      kind === 'dead'
        ? 'The forest waits. You return to the last shrine you lit.'
        : kind === 'won'
          ? 'Tataka is defeated and the swamp breathes again. The path of the bow continues south, towards Kishkindha.'
          : '';
    this.overlay.innerHTML = `<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${kind === 'dead' ? '' : controls}
      <div class="row">Quality ${QUALITY_ORDER.map((q) => `<button data-q="${q}" class="${q === opts.quality ? 'sel' : ''}">${q}</button>`).join('')}</div>
      <div class="row">Volume <input id="ov-vol" type="range" min="0" max="1" step="0.05" value="${opts.volume}"> Sensitivity <input id="ov-sens" type="range" min="0.3" max="2.5" step="0.1" value="${opts.sens}"></div>
      <button class="big" id="ov-go">${kind === 'pause' ? 'Resume' : kind === 'dead' ? 'Rise again' : 'Keep exploring'}</button>
      ${kind === 'dead' ? '' : '<button id="ov-reset">Restart the story</button>'}`;
    this.overlay.classList.add('on');
    this.overlay.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        opts.onQuality(b.dataset.q as QualityName);
        this.overlay
          .querySelectorAll('button[data-q]')
          .forEach((x) => x.classList.toggle('sel', x === b));
      }),
    );
    (this.overlay.querySelector('#ov-vol') as HTMLInputElement).addEventListener('input', (e) =>
      opts.onVolume(Number((e.target as HTMLInputElement).value)),
    );
    (this.overlay.querySelector('#ov-sens') as HTMLInputElement).addEventListener('input', (e) =>
      opts.onSens(Number((e.target as HTMLInputElement).value)),
    );
    (this.overlay.querySelector('#ov-go') as HTMLButtonElement).addEventListener('click', () =>
      opts.onResume(),
    );
    this.overlay.querySelector('#ov-reset')?.addEventListener('click', () => opts.onReset());
  }

  overlayHide(): void {
    this.overlay.classList.remove('on');
  }

  get overlayOpen(): boolean {
    return this.overlay.classList.contains('on');
  }
}
