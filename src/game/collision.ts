import * as THREE from 'three';
import { POI, riverZ, WORLD } from '../data/world';
import type { World } from '../render/world';

export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Maya walls stop people but not arrows. */
  maya?: boolean;
  off?: boolean;
}

/** Ground height and simple obstacle tests for characters and arrows. */
export class Colliders {
  readonly boxes: Box[];
  private readonly circles: { x: number; z: number; r: number }[];
  private readonly floorY: number;
  private readonly bridgeZ = riverZ(60);

  constructor(private readonly world: World) {
    this.boxes = world.structures.templeWalls.map((w) => ({ ...w }));
    this.circles = world.structures.circles;
    this.floorY = world.structures.templeFloorY;
  }

  /** Walkable height: terrain, the temple platform or the bridge deck. */
  groundAt(x: number, z: number): number {
    let h = this.world.hf.heightAt(x, z);
    const dx = Math.abs(x - POI.temple.x);
    const dz = Math.abs(z - POI.temple.z);
    const edge = Math.max(dx, dz);
    if (edge < 32.5)
      h = Math.max(h, this.floorY - THREE.MathUtils.smoothstep(edge, 30.5, 32.5) * 0.5);
    if (Math.abs(x - 60) < 1.7 && Math.abs(z - this.bridgeZ) < 21.5) {
      const i = (z - this.bridgeZ) / 1.5;
      h = Math.max(h, 1.57 - 0.0044 * i * i + 0.25);
    }
    return h;
  }

  inWater(x: number, z: number): boolean {
    return this.groundAt(x, z) < WORLD.waterLevel - 0.55;
  }

  /** Pushes a circle out of walls and round obstacles. `feetY` lets tall jumps clear low rubble. */
  resolve(p: THREE.Vector3, r: number, feetY: number): void {
    const floor = this.floorY;
    for (const b of this.boxes) {
      if (b.off || feetY > floor + b.h) continue;
      const hx = b.w / 2 + r;
      const hz = b.d / 2 + r;
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
      const px = hx - Math.abs(dx);
      const pz = hz - Math.abs(dz);
      if (px < pz) p.x += Math.sign(dx || 1) * px;
      else p.z += Math.sign(dz || 1) * pz;
    }
    for (const c of this.circles) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 0.0001) {
        p.x += (dx / d) * (min - d);
        p.z += (dz / d) * (min - d);
      }
    }
    const lim = WORLD.size / 2 - 6;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
  }

  /** True if a camera at this point would be inside a wall. */
  blocksView(p: THREE.Vector3): boolean {
    if (Math.abs(p.x - POI.temple.x) > 38 || Math.abs(p.z - POI.temple.z) > 38) return false;
    for (const b of this.boxes) {
      if (b.off) continue;
      if (
        Math.abs(p.x - b.x) < b.w / 2 + 0.3 &&
        Math.abs(p.z - b.z) < b.d / 2 + 0.3 &&
        p.y < this.floorY + b.h + 0.3
      )
        return true;
    }
    return false;
  }

  /** True if an arrow at this point has hit the ground or a real wall. */
  solid(p: THREE.Vector3): boolean {
    if (p.y < this.groundAt(p.x, p.z)) return true;
    if (Math.abs(p.x - POI.temple.x) > 36 || Math.abs(p.z - POI.temple.z) > 36) return false;
    for (const b of this.boxes) {
      if (b.maya || b.off) continue;
      if (Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2 && p.y < this.floorY + b.h)
        return true;
    }
    return false;
  }
}
