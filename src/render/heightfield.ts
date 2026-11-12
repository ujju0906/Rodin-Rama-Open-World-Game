import { fbm2, lerp, noise2, smoothstep } from '../core/noise';
import { PATHS, POI, riverZ, WORLD, type Poi } from '../data/world';

const HALF = WORLD.size / 2;
const N = 513; // samples per side
const CELL = WORLD.size / (N - 1);

const dist = (x: number, z: number, p: Poi): number => Math.hypot(x - p.x, z - p.z);

/** Distance from a point to the nearest footpath. */
export function pathDistance(x: number, z: number): number {
  let best = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i]!;
      const [bx, bz] = path[i + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
  }
  // Wobble the edge so paths do not look ruler-drawn.
  return best + (noise2(x * 0.09, z * 0.09) - 0.5) * 3;
}

export const riverDistance = (x: number, z: number): number => Math.abs(z - riverZ(x));

/** 0 outside the swamp, 1 well inside it. */
export const swampAmount = (x: number, z: number): number =>
  smoothstep(POI.swamp.r + 45, POI.swamp.r - 20, dist(x, z, POI.swamp));

/** Terrain height straight from the formulas (slow; used once to bake the grid). */
function rawHeight(x: number, z: number): number {
  let h =
    2.5 +
    fbm2(x * 0.0042 + 3.1, z * 0.0042 - 7.4, 5) * 40 +
    (fbm2(x * 0.022, z * 0.022, 3) - 0.5) * 4;
  h = Math.max(h, 0.6);

  // River valley and channel.
  const rd = riverDistance(x, z);
  h = lerp(h, 1.3 + (noise2(x * 0.03, z * 0.03) - 0.5) * 0.8, smoothstep(130, 18, rd) * 0.9);
  h -= smoothstep(17, 5, rd) * 4.4;

  // Swamp basin: shallow water broken up by mud islands.
  const sw = swampAmount(x, z);
  h = lerp(h, -1.0 + fbm2(x * 0.045 + 9, z * 0.045 + 2, 3) * 1.7, sw);

  // Flattened clearings.
  for (const p of [POI.hermitage, POI.riverShrine, POI.temple] as Poi[]) {
    const k = smoothstep(p.r * 1.9, p.r, dist(x, z, p));
    h = lerp(h, p.level!, k);
  }
  return h;
}

/** Baked terrain heights plus fast lookups used by every scatter system. */
export class Heightfield {
  readonly data = new Float32Array(N * N);
  readonly resolution = N;

  constructor() {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        this.data[j * N + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
      }
    }
  }

  /** Bilinear height at a world position. */
  heightAt(x: number, z: number): number {
    const fx = Math.min(N - 1.001, Math.max(0, (x + HALF) / CELL));
    const fz = Math.min(N - 1.001, Math.max(0, (z + HALF) / CELL));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const d = this.data;
    const a = d[iz * N + ix]!;
    const b = d[iz * N + ix + 1]!;
    const c = d[(iz + 1) * N + ix]!;
    const e = d[(iz + 1) * N + ix + 1]!;
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + e) * tx * tz;
  }

  /** 0 on flat ground, towards 1 on cliffs. */
  slopeAt(x: number, z: number): number {
    const dx = this.heightAt(x + 1.5, z) - this.heightAt(x - 1.5, z);
    const dz = this.heightAt(x, z + 1.5) - this.heightAt(x, z - 1.5);
    return 1 - 3 / Math.hypot(dx, 3, dz);
  }

  /** How strongly trees and undergrowth should grow here (0..1). */
  forestDensity(x: number, z: number): number {
    if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6) return 0;
    const h = this.heightAt(x, z);
    if (h < WORLD.waterLevel + 0.5) return 0;
    let d = smoothstep(0.25, 0.55, fbm2(x * 0.012 + 20, z * 0.012 + 20, 3)) * 0.75 + 0.25;
    d *= smoothstep(10, 24, riverDistance(x, z));
    d *= smoothstep(2.5, 6, pathDistance(x, z));
    d *= 1 - swampAmount(x, z);
    d *= smoothstep(POI.hermitage.r - 2, POI.hermitage.r + 12, dist(x, z, POI.hermitage));
    d *= smoothstep(POI.temple.r + 2, POI.temple.r + 16, dist(x, z, POI.temple));
    for (const p of [POI.firstShrine, POI.riverShrine, POI.overlook] as Poi[]) {
      d *= smoothstep(p.r - 2, p.r + 5, dist(x, z, p));
    }
    d *= 1 - smoothstep(0.22, 0.4, this.slopeAt(x, z));
    return d;
  }
}
