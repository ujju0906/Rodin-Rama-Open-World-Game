import * as THREE from 'three';
import { BOW } from '../data/gameplay';
import type { Colliders } from './collision';
import type { Particles } from './particles';

export interface Hittable {
  pos: THREE.Vector3;
  radius: number;
  height: number;
  /** Height of the head centre above `pos`. */
  headY: number;
  alive: boolean;
  hit(damage: number, head: boolean, dir: THREE.Vector3): void;
}

interface Arrow {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  state: 'free' | 'flying' | 'stuck';
  life: number;
  damage: number;
  hostile: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const step = new THREE.Vector3();

/** Pooled arrows for the player and enemy archers: gravity, glowing trail, sticking, hit tests. */
export class Arrows {
  readonly group = new THREE.Group();
  private pool: Arrow[] = [];
  onStick: (p: THREE.Vector3) => void = () => undefined;
  onEnemyHit: (head: boolean, p: THREE.Vector3) => void = () => undefined;
  onPlayerHit: (damage: number) => void = () => undefined;

  constructor(size = 64) {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.95, 5);
    geo.translate(0, -0.3, 0);
    const good = new THREE.MeshStandardMaterial({
      color: 0xf4d58a,
      emissive: new THREE.Color(1.8, 1.0, 0.3),
      roughness: 0.4,
    });
    const bad = new THREE.MeshStandardMaterial({
      color: 0x2a1512,
      emissive: new THREE.Color(0.9, 0.08, 0.03),
      roughness: 0.6,
    });
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(geo, i < size * 0.6 ? good : bad);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        state: 'free',
        life: 0,
        damage: 0,
        hostile: i >= size * 0.6,
      });
    }
  }

  fire(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    damage: number,
    hostile: boolean,
  ): void {
    let a = this.pool.find((x) => x.hostile === hostile && x.state === 'free');
    if (!a) {
      // Recycle the oldest stuck arrow of this kind.
      a = this.pool
        .filter((x) => x.hostile === hostile && x.state === 'stuck')
        .sort((p, q) => p.life - q.life)[0];
      if (!a) return;
    }
    a.state = 'flying';
    a.life = 6;
    a.damage = damage;
    a.vel.copy(dir).normalize().multiplyScalar(speed);
    a.mesh.position.copy(from);
    a.mesh.visible = true;
    a.mesh.quaternion.setFromUnitVectors(UP, tmp.copy(a.vel).normalize());
  }

  update(
    dt: number,
    col: Colliders,
    targets: Hittable[],
    player: { pos: THREE.Vector3; alive: boolean },
    fx: Particles,
  ): void {
    for (const a of this.pool) {
      if (a.state === 'free') continue;
      a.life -= dt;
      if (a.state === 'stuck') {
        if (a.life <= 0) {
          a.state = 'free';
          a.mesh.visible = false;
        }
        continue;
      }
      if (a.life <= 0) {
        a.state = 'free';
        a.mesh.visible = false;
        continue;
      }
      a.vel.y -= BOW.gravity * dt;
      const p = a.mesh.position;
      const steps = Math.max(1, Math.ceil((a.vel.length() * dt) / 0.45));
      step.copy(a.vel).multiplyScalar(dt / steps);
      for (let s = 0; s < steps && a.state === 'flying'; s++) {
        p.add(step);
        if (a.hostile) {
          if (
            player.alive &&
            Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 0.5 &&
            p.y > player.pos.y &&
            p.y < player.pos.y + 1.9
          ) {
            this.onPlayerHit(a.damage);
            a.state = 'free';
            a.mesh.visible = false;
          }
        } else {
          for (const t of targets) {
            if (!t.alive) continue;
            const dy = p.y - t.pos.y;
            if (dy < 0 || dy > t.height || Math.hypot(p.x - t.pos.x, p.z - t.pos.z) > t.radius)
              continue;
            const head = Math.abs(dy - t.headY) < t.height * 0.12;
            t.hit(a.damage, head, tmp.copy(a.vel).normalize());
            this.onEnemyHit(head, p);
            fx.burst(p, head ? 26 : 14, 5, 0.4, head ? [4, 3, 1] : [3, 1.4, 0.4], 0.05, 9, 2);
            a.state = 'free';
            a.mesh.visible = false;
            break;
          }
        }
        if (a.state === 'flying' && col.solid(p)) {
          a.state = 'stuck';
          a.life = 14;
          this.onStick(p);
          fx.burst(p, 6, 2.5, 0.3, [2, 1.4, 0.6], 0.035, 8, 2);
        }
      }
      if (a.state === 'flying') {
        a.mesh.quaternion.setFromUnitVectors(UP, tmp.copy(a.vel).normalize());
        fx.emit(p, tmp.set(0, 0, 0), 0.32, a.hostile ? [1.6, 0.15, 0.05] : [2.4, 1.5, 0.45], 0.045);
      }
    }
  }
}
