/**
 * All sound is synthesised with Web Audio (no audio files yet): rain and wind beds,
 * a tanpura-like drone, combat pulse, and one-shot effects. Starts after the first click.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rainGain!: GainNode;
  private combatGain!: GainNode;
  private droneGain!: GainNode;
  volume = 0.7;

  start(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    const noise = this.noiseBuffer(3);
    const bed = (freq: number, q: number, type: BiquadFilterType, gain: number): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return g;
    };
    this.rainGain = bed(5200, 0.4, 'highpass', 0);
    bed(320, 0.6, 'lowpass', 0.05); // forest air / distant river

    // Drone: root, fifth and octave with slow beating.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    this.droneGain.connect(this.master);
    for (const [f, g] of [
      [73.42, 0.5],
      [110, 0.28],
      [146.83, 0.3],
      [147.6, 0.2],
      [220.4, 0.08],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(lp).connect(og).connect(this.droneGain);
      o.start();
    }

    // Combat pulse: a low drum hit twice a second, faded in during fights.
    this.combatGain = ctx.createGain();
    this.combatGain.gain.value = 0;
    this.combatGain.connect(this.master);
    const beat = (): void => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      for (const [dt, f, g] of [
        [0, 62, 0.9],
        [0.25, 62, 0.5],
        [0.375, 92, 0.4],
        [0.5, 62, 0.8],
        [0.75, 124, 0.3],
      ] as const) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.frequency.setValueAtTime(f * 1.8, t + dt);
        o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.09);
        og.gain.setValueAtTime(g, t + dt);
        og.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.22);
        o.connect(og).connect(this.combatGain);
        o.start(t + dt);
        o.stop(t + dt + 0.25);
      }
      setTimeout(beat, 1000);
    };
    beat();
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  /** Call each frame with rain strength (0..1) and whether a fight is on. */
  update(rain: number, combat: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain * 0.11, t, 0.8);
    this.combatGain.gain.setTargetAtTime(combat ? 0.32 : 0, t, combat ? 0.5 : 1.5);
    this.droneGain.gain.setTargetAtTime(combat ? 0.03 : 0.055, t, 1);
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(freq: number, q: number, dur: number, gain: number, sweepTo = freq): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  play(
    name:
      | 'draw'
      | 'release'
      | 'hit'
      | 'stick'
      | 'hurt'
      | 'chant'
      | 'fire'
      | 'wind'
      | 'drishti'
      | 'dispel'
      | 'shrine'
      | 'roar'
      | 'dodge'
      | 'win',
  ): void {
    switch (name) {
      case 'draw':
        this.tone('triangle', 90, 190, 0.5, 0.05);
        break;
      case 'release':
        this.tone('triangle', 420, 110, 0.18, 0.2);
        this.burst(2600, 1.2, 0.22, 0.14, 700);
        break;
      case 'hit':
        this.tone('sine', 160, 50, 0.18, 0.35);
        this.burst(900, 1, 0.1, 0.2);
        break;
      case 'stick':
        this.burst(1500, 3, 0.07, 0.12);
        break;
      case 'hurt':
        this.tone('sawtooth', 220, 70, 0.3, 0.2);
        break;
      case 'chant':
        for (const [i, f] of [146.83, 220, 293.66].entries())
          this.tone('sine', f, f * 1.01, 1.6, 0.07, i * 0.12);
        break;
      case 'fire':
        this.burst(500, 0.5, 1.3, 0.5, 120);
        this.tone('sawtooth', 110, 40, 0.9, 0.16);
        break;
      case 'wind':
        this.burst(700, 2.5, 2.6, 0.4, 1800);
        break;
      case 'drishti':
        for (const [i, f] of [587.33, 880, 1174.66].entries())
          this.tone('sine', f, f, 1.4, 0.07, i * 0.07);
        break;
      case 'dispel':
        this.burst(3000, 4, 0.5, 0.2, 500);
        break;
      case 'shrine':
        for (const [i, f] of [293.66, 369.99, 440, 587.33].entries())
          this.tone('sine', f, f, 1.8, 0.09, i * 0.16);
        break;
      case 'roar':
        this.tone('sawtooth', 95, 38, 1.6, 0.4);
        this.burst(260, 0.7, 1.5, 0.4, 90);
        break;
      case 'dodge':
        this.burst(900, 1, 0.2, 0.1, 300);
        break;
      case 'win':
        for (const [i, f] of [293.66, 440, 587.33, 739.99, 880].entries())
          this.tone('sine', f, f, 2.6, 0.1, i * 0.22);
        break;
    }
  }
}
