import * as THREE from 'three';
import type { GameAudio } from '../core/audio';
import { BOSS, ENEMIES, type EnemyKind } from '../data/gameplay';
import { POI } from '../data/world';
import type { Colliders } from './collision';
import type { Arrows, Hittable } from './combat';
import { createRakshasa, createTataka, type Figure } from './models';
import type { Particles } from './particles';
import type { Player } from './player';

export interface Ctx {
  player: Player;
  col: Colliders;
  arrows: Arrows;
  fx: Particles;
  audio: GameAudio;
  /** Called with the amount actually dealt, for screen shake and HUD. */
  hurtPlayer(amount: number): void;
}

const VIOLET: [number, number, number] = [2.2, 0.5, 3.2];
const tmp = new THREE.Vector3();

function animateWalk(f: Figure, phase: number, amount: number, attack: number): void {
  const s = Math.sin(phase) * amount * 0.7;
  f.legL.rotation.x = s;
  f.legR.rotation.x = -s;
  f.armL.rotation.x = -s * 0.7;
  f.armR.rotation.x = s * 0.7 - attack * 2.4;
}

export class Enemy implements Hittable {
  readonly figure: Figure;
  readonly pos = new THREE.Vector3();
  readonly def;
  radius: number;
  height: number;
  headY: number;
  alive = true;
  hp: number;
  /** Seconds this enemy stays outlined after a Divya Drishti pulse. */
  revealed = 0;
  burn = 0;
  lift = 0;
  private state: 'idle' | 'chase' | 'windup' | 'recover' = 'idle';
  private timer = 0;
  private stagger = 0;
  private flash = 0;
  private phase = Math.random() * 6;
  private knock = new THREE.Vector3();
  private home = new THREE.Vector3();
  private dying = 0;
  private side = Math.random() < 0.5 ? -1 : 1;
  private liftY = 0;
  onDeath: (e: Enemy) => void = () => undefined;

  constructor(
    readonly kind: EnemyKind,
    x: number,
    z: number,
    ground: number,
  ) {
    this.def = ENEMIES[kind];
    this.figure = createRakshasa(kind === 'clone' ? 'grunt' : kind);
    this.figure.root.scale.setScalar(this.def.scale);
    this.hp = this.def.hp;
    this.radius = 0.55 * this.def.scale;
    this.height = 1.95 * this.def.scale;
    this.headY = this.figure.headY * this.def.scale;
    this.pos.set(x, ground, z);
    this.home.copy(this.pos);
    this.figure.root.position.copy(this.pos);
  }

  hit(damage: number, head: boolean, dir: THREE.Vector3): void {
    if (!this.alive) return;
    const total = damage * (head ? 2 : 1);
    this.hp -= total;
    this.flash = 0.15;
    this.state = this.state === 'idle' ? 'chase' : this.state;
    if (total >= 40) this.knock.copy(dir).setY(0).multiplyScalar(7);
    if (total >= 20) this.stagger = Math.max(this.stagger, total >= 40 ? 0.7 : 0.35);
    else this.stagger = Math.max(this.stagger, 0.12);
    if (this.hp <= 0) this.die();
  }

  die(): void {
    if (!this.alive) return;
    this.alive = false;
    this.dying = 0.7;
    this.onDeath(this);
  }

  /** Returns false once the body has finished falling and can be removed. */
  update(dt: number, c: Ctx): boolean {
    const f = this.figure;
    if (!this.alive) {
      this.dying -= dt;
      f.root.rotation.x = Math.min(Math.PI / 2, f.root.rotation.x + dt * 4);
      f.root.position.y -= dt * 0.4;
      return this.dying > 0;
    }
    const p = c.player;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.revealed = Math.max(0, this.revealed - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.stagger = Math.max(0, this.stagger - dt);

    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= 8 * dt;
      if (Math.random() < dt * 30)
        c.fx.emit(
          tmp.copy(this.pos).setY(this.pos.y + 0.4 + Math.random() * 1.4),
          new THREE.Vector3(0, 1.5, 0),
          0.5,
          [4, 1.3, 0.2],
          0.08,
        );
      if (this.hp <= 0) this.die();
    }

    const ground = c.col.groundAt(this.pos.x, this.pos.z);
    if (this.lift > 0) {
      // Caught in a cyclone: spun and held in the air, then dropped.
      this.lift -= dt;
      this.liftY = Math.min(4.5, this.liftY + dt * 5);
      f.root.rotation.y += dt * 9;
      if (this.lift <= 0) this.hit(25, false, tmp.set(0, 0, 0));
    } else {
      this.liftY = Math.max(0, this.liftY - dt * 14);
    }

    let moveX = 0;
    let moveZ = 0;
    let attackPose = 0;
    if (this.lift <= 0 && this.stagger <= 0 && !p.dead) {
      if (this.state === 'idle') {
        if (dist < this.def.sight) this.state = 'chase';
        else {
          // Slow patrol around the spawn point.
          this.phase += dt * 0.3;
          const tx = this.home.x + Math.cos(this.phase * 0.7) * 4 - this.pos.x;
          const tz = this.home.z + Math.sin(this.phase * 0.9) * 4 - this.pos.z;
          const tl = Math.hypot(tx, tz) || 1;
          moveX = (tx / tl) * 0.3;
          moveZ = (tz / tl) * 0.3;
        }
      } else if (this.kind === 'archer') {
        this.timer -= dt;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        if (dist < 9) {
          moveX = -nx;
          moveZ = -nz;
        } else if (dist > this.def.attackRange) {
          moveX = nx;
          moveZ = nz;
        } else {
          moveX = -nz * this.side * 0.45;
          moveZ = nx * this.side * 0.45;
          if (this.timer <= 0) {
            this.timer = this.def.attackEvery * (0.8 + Math.random() * 0.4);
            if (Math.random() < 0.3) this.side *= -1;
            const from = tmp.copy(this.pos).setY(this.pos.y + 1.5);
            const t = dist / 38;
            const dir = new THREE.Vector3(
              dx,
              p.pos.y + 1.1 - from.y + 0.5 * 5.88 * t * t,
              dz,
            ).normalize();
            c.arrows.fire(from, dir, 38, this.def.damage, true);
            attackPose = 1;
          }
        }
      } else if (this.state === 'chase') {
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        // Circle in from the side when far, straight in when close.
        const flank = dist > 6 ? 0.55 * this.side : 0;
        moveX = nx - nz * flank;
        moveZ = nz + nx * flank;
        if (dist < this.def.attackRange) {
          this.state = 'windup';
          this.timer = 0.42;
        }
      } else if (this.state === 'windup') {
        this.timer -= dt;
        attackPose = 1 - this.timer / 0.42;
        if (this.timer <= 0) {
          if (dist < this.def.attackRange + 0.9) c.hurtPlayer(this.def.damage);
          this.state = 'recover';
          this.timer = this.def.attackEvery;
        }
      } else if (this.state === 'recover') {
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'chase';
      }
    }

    const ml = Math.hypot(moveX, moveZ);
    const speed = this.def.speed * Math.min(1, ml);
    if (ml > 0.01) {
      this.pos.x += (moveX / ml) * speed * dt;
      this.pos.z += (moveZ / ml) * speed * dt;
    }
    this.pos.x += this.knock.x * dt;
    this.pos.z += this.knock.z * dt;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
    c.col.resolve(this.pos, this.radius, this.pos.y);
    this.pos.y = ground;

    f.root.position.set(this.pos.x, ground + this.liftY, this.pos.z);
    if (this.lift <= 0 && this.state !== 'idle') f.root.rotation.y = Math.atan2(dx, dz);
    else if (this.lift <= 0 && ml > 0.01) f.root.rotation.y = Math.atan2(moveX, moveZ);
    this.phase += dt * (2 + speed * 1.8);
    animateWalk(f, this.phase, Math.min(1, speed / 3), attackPose);
    f.body.rotation.x = this.stagger > 0 ? -0.35 : 0;
    const glow =
      this.revealed > 0 ? (this.kind === 'clone' ? [1.2, 0.2, 1.8] : [1.6, 1.0, 0.2]) : [0, 0, 0];
    for (const m of f.skins)
      m.emissive.setRGB(
        glow[0]! + this.flash * 20,
        glow[1]! + this.flash * 12,
        glow[2]! + this.flash * 5,
      );
    return true;
  }
}

interface Boulder {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  live: boolean;
}

/** Tataka: three phases (fury, brood, darkness). See DESIGN.md section 6. */
export class Tataka implements Hittable {
  readonly figure = createTataka();
  readonly pos = new THREE.Vector3();
  radius = 0.62 * BOSS.scale;
  height = 1.95 * BOSS.scale;
  headY = 1.68 * BOSS.scale;
  alive = true;
  hp: number = BOSS.hp;
  phase: 1 | 2 | 3 = 1;
  revealed = 0;
  /** Seconds the swamp mist stays cleared after a cyclone. */
  mistCleared = 0;
  burn = 0;
  private state: 'stalk' | 'windup' | 'charge' | 'stunned' | 'swipe' = 'stalk';
  private timer = 3;
  private boulderT: number = BOSS.boulderEvery;
  private summonT = 4;
  private dir = new THREE.Vector3();
  private walk = 0;
  private flash = 0;
  private boulders: Boulder[] = [];
  onSummon: () => void = () => undefined;
  onPhase: (phase: number) => void = () => undefined;
  onDeath: () => void = () => undefined;

  constructor(
    x: number,
    z: number,
    private readonly scene: THREE.Scene,
  ) {
    this.figure.root.scale.setScalar(BOSS.scale);
    this.pos.set(x, 0, z);
    const geo = new THREE.IcosahedronGeometry(0.9, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3c3a36, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.boulders.push({ mesh, vel: new THREE.Vector3(), live: false });
    }
    scene.add(this.figure.root);
  }

  dispose(): void {
    this.scene.remove(this.figure.root);
    for (const b of this.boulders) this.scene.remove(b.mesh);
  }

  get stunned(): boolean {
    return this.state === 'stunned';
  }

  hit(damage: number, head: boolean): void {
    if (!this.alive) return;
    this.hp -= damage * (head ? 2 : 1) * (this.stunned ? BOSS.stunDamageBonus : 1);
    this.flash = 0.15;
    if (this.phase === 3) this.revealed = Math.max(this.revealed, 0.6);
    const next = this.hp <= BOSS.phase3At ? 3 : this.hp <= BOSS.phase2At ? 2 : 1;
    if (next !== this.phase && this.hp > 0) {
      this.phase = next;
      this.state = 'stalk';
      this.timer = 2.5;
      this.onPhase(next);
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.onDeath();
    }
  }

  update(dt: number, c: Ctx): void {
    const f = this.figure;
    const p = c.player;
    if (!this.alive) {
      f.root.rotation.x = Math.min(Math.PI / 2, f.root.rotation.x + dt * 0.9);
      f.root.position.y -= dt * 0.5;
      f.root.visible = true;
      return;
    }
    this.flash = Math.max(0, this.flash - dt);
    this.revealed = Math.max(0, this.revealed - dt);
    this.mistCleared = Math.max(0, this.mistCleared - dt);
    if (this.burn > 0) {
      this.burn -= dt;
      this.hp -= 8 * dt;
      this.revealed = Math.max(this.revealed, 0.3);
      if (Math.random() < dt * 40)
        c.fx.emit(
          tmp.copy(this.pos).setY(this.pos.y + 1 + Math.random() * 4),
          new THREE.Vector3(0, 2, 0),
          0.6,
          [4, 1.3, 0.2],
          0.14,
        );
    }
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;
    let speed = 0;
    let attackPose = 0;
    this.timer -= dt;

    if (this.state === 'stunned') {
      if (this.timer <= 0) this.state = 'stalk';
      f.body.rotation.x = 0.5;
    } else if (this.state === 'windup') {
      attackPose = 0.4;
      f.body.rotation.x = -0.25;
      f.root.rotation.y = Math.atan2(nx, nz);
      if (Math.random() < dt * 40)
        c.fx.emit(
          tmp.copy(this.pos).setY(this.pos.y + 0.3),
          new THREE.Vector3((Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6),
          0.5,
          [3, 0.4, 0.1],
          0.12,
        );
      if (this.timer <= 0) {
        this.state = 'charge';
        this.timer = BOSS.chargeTime;
        this.dir.set(nx, 0, nz);
      }
    } else if (this.state === 'charge') {
      speed = BOSS.chargeSpeed;
      this.pos.addScaledVector(this.dir, speed * dt);
      f.body.rotation.x = 0.45;
      if (dist < this.radius + 1.2) {
        c.hurtPlayer(BOSS.chargeDamage);
        this.state = 'stalk';
        this.timer = 2.5;
      }
      const fromCentre = Math.hypot(this.pos.x - POI.swamp.x, this.pos.z - POI.swamp.z);
      if (this.timer <= 0 || fromCentre > BOSS.arenaRadius) {
        // Missed: she crashes to a stop and is open to attack.
        this.state = 'stunned';
        this.timer = BOSS.stunTime;
        c.fx.burst(
          tmp.copy(this.pos).setY(this.pos.y + 1),
          60,
          9,
          0.8,
          [1.5, 1.3, 1],
          0.16,
          6,
          2,
          3,
        );
        c.audio.play('hit');
      }
    } else if (this.state === 'swipe') {
      attackPose = 1 - this.timer / 0.6;
      if (this.timer <= 0) {
        if (dist < this.radius + 3) c.hurtPlayer(BOSS.swipeDamage);
        this.state = 'stalk';
        this.timer = this.phase === 3 ? 2.2 : 3.5;
      }
    } else {
      // Stalk: phase 2 holds the centre, otherwise close in on the player.
      f.body.rotation.x = 0;
      if (this.phase === 2) {
        const cx = POI.swamp.x - this.pos.x;
        const cz = POI.swamp.z - this.pos.z;
        const cl = Math.hypot(cx, cz);
        if (cl > 2) {
          speed = BOSS.speed;
          this.pos.x += (cx / cl) * speed * dt;
          this.pos.z += (cz / cl) * speed * dt;
        }
        this.summonT -= dt;
        if (this.summonT <= 0) {
          this.summonT = BOSS.summonEvery;
          this.onSummon();
          c.audio.play('roar');
        }
      } else {
        speed = BOSS.speed * (this.phase === 3 ? 1.5 : 1);
        this.pos.x += nx * speed * dt;
        this.pos.z += nz * speed * dt;
      }
      f.root.rotation.y = Math.atan2(nx, nz);
      if (dist < this.radius + 2.4 && this.timer <= 0) {
        this.state = 'swipe';
        this.timer = 0.6;
      } else if (this.phase === 1 && this.timer <= 0 && dist > 9) {
        this.state = 'windup';
        this.timer = BOSS.chargeWindup;
        c.audio.play('roar');
      }
      this.boulderT -= dt;
      if (this.phase !== 3 && this.boulderT <= 0 && dist > 8) {
        this.boulderT = BOSS.boulderEvery * (this.phase === 2 ? 0.7 : 1);
        const b = this.boulders.find((x) => !x.live);
        if (b) {
          const t = 1.3;
          b.live = true;
          b.mesh.visible = true;
          b.mesh.position.set(this.pos.x, this.pos.y + 5, this.pos.z);
          b.vel.set(dx / t, (p.pos.y - (this.pos.y + 5)) / t + 0.5 * 16 * t, dz / t);
          attackPose = 1;
        }
      }
    }

    for (const b of this.boulders) {
      if (!b.live) continue;
      b.vel.y -= 16 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 5;
      if (b.mesh.position.y < c.col.groundAt(b.mesh.position.x, b.mesh.position.z) + 0.3) {
        b.live = false;
        b.mesh.visible = false;
        c.fx.burst(b.mesh.position, 40, 7, 0.6, [1.4, 1.2, 0.9], 0.13, 8, 2, 3);
        if (b.mesh.position.distanceTo(p.pos) < 3.4) c.hurtPlayer(BOSS.boulderDamage);
        c.audio.play('hit');
      }
    }

    this.pos.y = Math.max(c.col.groundAt(this.pos.x, this.pos.z), -1.2);
    f.root.position.copy(this.pos);
    this.walk += dt * (1.5 + speed * 0.6);
    animateWalk(f, this.walk, Math.min(1, speed / 3), attackPose);
    f.root.visible = this.phase !== 3 || this.revealed > 0 || this.stunned;
    const g = this.revealed > 0 && this.phase === 3 ? 0.9 : 0;
    for (const m of f.skins)
      m.emissive.setRGB(g * 1.6 + this.flash * 14, g + this.flash * 8, g * 0.2 + this.flash * 3);
  }
}

export { VIOLET };
