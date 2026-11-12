import * as THREE from 'three';
import type { GameAudio } from '../core/audio';
import type { Input } from '../core/input';
import { POI } from '../data/world';
import type { Arrows, Hittable } from './combat';
import { createRakshasa } from './models';
import type { Particles } from './particles';

/** Flight numbers (see DESIGN.md). */
export const VIMANA = {
  cruise: 30,
  boost: 55,
  diveMax: 75,
  boostTime: 3,
  boostRecharge: 6,
  pitchRate: 1.05,
  yawRate: 0.8,
  hull: 150,
  minClearance: 22,
  ceiling: 230,
  fireEvery: 0.28,
} as const;

/** Gates of light the route passes through: x, height above sea level, z. */
const ROUTE: [number, number, number][] = [
  [120, 70, -230],
  [-60, 95, -330],
  [-300, 115, -240],
  [-380, 110, 40],
  [-200, 100, 320],
  [175, 95, 250],
  [390, 105, 80],
  [345, 70, -170],
];

const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.28 });
const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5a26, metalness: 1, roughness: 0.4 });
const petal = new THREE.MeshStandardMaterial({
  color: 0xe8a07a,
  metalness: 0.3,
  roughness: 0.45,
  side: THREE.DoubleSide,
  emissive: new THREE.Color(0.25, 0.08, 0.05),
});
const crystal = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3.2, 3.0), fog: false });
const cloth = new THREE.MeshStandardMaterial({
  color: 0xc8361a,
  roughness: 0.8,
  side: THREE.DoubleSide,
});

/** Procedural vimana: a carved hull, a stepped temple tower, lotus-petal wings and teal crystals. */
function buildModel(): { root: THREE.Group; wings: THREE.Group[]; crystals: THREE.Mesh[] } {
  const root = new THREE.Group();
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = root,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // Hull: a long shallow boat. The craft's nose points along +z.
  const hull = add(
    new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    bronze,
    0,
    0,
    0,
  );
  hull.scale.set(2.6, 1.5, 6.2);
  add(new THREE.CylinderGeometry(2.62, 2.62, 0.22, 28), gold, 0, 0.05, 0).scale.set(1, 1, 2.38);
  add(new THREE.TorusGeometry(1, 0.07, 6, 40), gold, 0, 0.12, 0).scale.set(2.62, 6.2, 1);
  root.children[root.children.length - 1]!.rotation.x = Math.PI / 2;
  // Prow: a bird's head and neck.
  const neck = add(new THREE.CylinderGeometry(0.28, 0.5, 2.6, 10), gold, 0, 1.2, 5.6);
  neck.rotation.x = 0.5;
  add(new THREE.SphereGeometry(0.5, 12, 10), gold, 0, 2.5, 6.3).scale.set(0.8, 0.9, 1.2);
  add(new THREE.ConeGeometry(0.2, 0.9, 8), bronze, 0, 2.35, 7.1).rotation.x = Math.PI / 2 + 0.3;
  // Temple tower amidships.
  let y = 0.2;
  let w = 3.4;
  for (let i = 0; i < 8; i++) {
    const h = i === 0 ? 1.5 : 0.62;
    add(
      new THREE.BoxGeometry(w, h, w * (i === 0 ? 1.5 : 1.15)),
      i % 2 ? gold : bronze,
      0,
      y + h / 2,
      -0.6,
    );
    if (i === 0)
      for (const [px, pz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        add(
          new THREE.CylinderGeometry(0.16, 0.18, 1.5, 8),
          gold,
          px * 1.75,
          y + 0.75,
          -0.6 + pz * 2.6,
        );
    y += h;
    w *= 0.8;
  }
  add(new THREE.SphereGeometry(0.42, 12, 10), gold, 0, y + 0.3, -0.6);
  add(new THREE.ConeGeometry(0.13, 1.0, 8), gold, 0, y + 1.1, -0.6);
  // Banner.
  add(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 5), bronze, 0, 2.6, -5.2);
  const flag = add(new THREE.PlaneGeometry(2.6, 0.8, 6, 1), cloth, 0, 3.9, -6.5);
  flag.rotation.y = Math.PI / 2;
  // Lotus-petal wings.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(1.4, 1.6, 1.3, 4.4, 0, 6.2);
  shape.bezierCurveTo(-1.3, 4.4, -1.4, 1.6, 0, 0);
  const petalGeo = new THREE.ShapeGeometry(shape, 10);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 2.3, 0.5, 0.5);
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(petalGeo, petal);
      p.rotation.set(-Math.PI / 2, 0, -side * (0.75 + i * 0.26));
      p.position.set(0, i * 0.05, -i * 0.25);
      p.scale.setScalar(1 - i * 0.07);
      p.castShadow = true;
      wing.add(p);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.03, 4, 6), gold);
      rim.position.copy(p.position);
      wing.add(rim);
    }
    root.add(wing);
    wings.push(wing);
  }
  // Teal crystals along the keel.
  const crystals: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const c = add(
      new THREE.OctahedronGeometry(i === 3 ? 0.55 : 0.3),
      crystal,
      0,
      -1.45 * Math.cos(t * 2.4) - 0.2,
      t * 9,
    );
    c.scale.y = 1.6;
    crystals.push(c);
  }
  return { root, wings, crystals };
}

interface SkyFoe extends Hittable {
  root: THREE.Group;
  offset: THREE.Vector3;
  phase: number;
}

/** The vimana flight: an arcade ride through gates of light above the canopy and into the storm. */
export class Vimana {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  active = false;
  parked = false;
  hull: number = VIMANA.hull;
  yaw = 0;
  pitch = 0;
  speed: number = VIMANA.cruise;
  gate = 0;
  /** 0..1 storm strength along the route (drives rain, darkness and lightning). */
  storm = 0;
  lightning = 0;
  autopilot = false;
  private boost = 1;
  private fireT = 0;
  private roll = 0;
  private model = buildModel();
  private gates: THREE.Mesh[] = [];
  private foes: SkyFoe[] = [];
  private bolt = new THREE.PointLight(0xaab8ff, 0, 600, 1.2);
  private clock = 0;

  constructor() {
    this.group.add(this.model.root, this.bolt);
    this.group.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 2, 0.6),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    for (const [x, h, z] of ROUTE) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(13, 0.45, 8, 48), ringMat);
      ring.position.set(x, h, z);
      ring.visible = false;
      this.gates.push(ring);
    }
  }

  get gateCount(): number {
    return ROUTE.length;
  }

  get targets(): Hittable[] {
    return this.foes;
  }

  /** Sets the vimana down, waiting to be boarded. */
  park(x: number, y: number, z: number): void {
    this.pos.set(x, y + 2.2, z);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.set(0, 0.6, 0);
    this.group.visible = true;
    this.parked = true;
  }

  hide(scene: THREE.Scene): void {
    this.group.visible = false;
    this.parked = this.active = false;
    for (const g of this.gates) scene.remove(g);
    for (const f of this.foes) scene.remove(f.root);
    this.foes = [];
  }

  takeOff(scene: THREE.Scene): void {
    this.parked = false;
    this.active = true;
    this.hull = VIMANA.hull;
    this.gate = 0;
    this.speed = 12;
    this.pos.y += 3;
    const first = ROUTE[0]!;
    this.yaw = Math.atan2(first[0] - this.pos.x, first[2] - this.pos.z);
    this.pitch = 0.35;
    for (const g of this.gates) {
      g.visible = true;
      scene.add(g);
    }
  }

  private spawnWave(scene: THREE.Scene, ahead: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      const fig = createRakshasa('grunt');
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.ConeGeometry(0.5, 1.9, 4),
          new THREE.MeshStandardMaterial({
            color: 0x1a1216,
            roughness: 0.8,
            side: THREE.DoubleSide,
          }),
        );
        wing.scale.z = 0.12;
        wing.position.set(s * 0.9, 1.35, -0.15);
        wing.rotation.z = -s * 1.25;
        fig.body.add(wing);
      }
      fig.root.scale.setScalar(2.2);
      const foe: SkyFoe = {
        root: fig.root,
        pos: new THREE.Vector3()
          .copy(ahead)
          .add(new THREE.Vector3((i - 1) * 16, (i % 2) * 8 - 4, 0)),
        offset: new THREE.Vector3((i - 1) * 9, 3 + i * 2, 0),
        phase: i * 2.1,
        radius: 2.6,
        height: 4.6,
        headY: 3.7,
        alive: true,
        hit: () => {
          foe.alive = false;
        },
      };
      scene.add(fig.root);
      this.foes.push(foe);
    }
  }

  /** Advances the flight. Returns true on the frame the last gate is passed. */
  update(
    dt: number,
    input: Input,
    arrows: Arrows,
    fx: Particles,
    audio: GameAudio,
    scene: THREE.Scene,
    groundAt: (x: number, z: number) => number,
    aim: THREE.Vector3,
  ): boolean {
    this.clock += dt;
    const m = this.model;
    m.crystals.forEach((c, i) => c.scale.setScalar(1 + 0.18 * Math.sin(this.clock * 4 + i)));
    if (!this.active) {
      m.root.position.y = this.pos.y + Math.sin(this.clock * 1.3) * 0.25;
      return false;
    }

    // Steering.
    const next = ROUTE[Math.min(this.gate, ROUTE.length - 1)]!;
    let yawIn = -input.lookX * 1.6;
    let pitchIn = -input.lookY * 1.6;
    yawIn += ((input.keys.has('a') ? 1 : 0) - (input.keys.has('d') ? 1 : 0)) * VIMANA.yawRate * dt;
    pitchIn +=
      ((input.keys.has('s') ? 1 : 0) - (input.keys.has('w') ? 1 : 0)) * VIMANA.pitchRate * dt; // S climbs, W dives
    if (this.autopilot) {
      const wantYaw = Math.atan2(next[0] - this.pos.x, next[2] - this.pos.z);
      const wantPitch = Math.atan2(
        next[1] - this.pos.y,
        Math.hypot(next[0] - this.pos.x, next[2] - this.pos.z),
      );
      yawIn = THREE.MathUtils.clamp(
        Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw)),
        -VIMANA.yawRate * dt * 1.6,
        VIMANA.yawRate * dt * 1.6,
      );
      pitchIn = THREE.MathUtils.clamp(wantPitch - this.pitch, -dt, dt);
    }
    this.yaw += yawIn;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitchIn, -1.0, 0.9);
    this.roll +=
      (THREE.MathUtils.clamp(-yawIn / Math.max(dt, 0.001), -1, 1) * 0.55 - this.roll) *
      Math.min(1, dt * 3);

    // Speed: boost while Shift is held, extra speed in a dive.
    const boosting = input.keys.has('shift') && this.boost > 0.02;
    this.boost = THREE.MathUtils.clamp(
      this.boost + (boosting ? -dt / VIMANA.boostTime : dt / VIMANA.boostRecharge),
      0,
      1,
    );
    const target = Math.min(
      VIMANA.diveMax,
      (boosting ? VIMANA.boost : VIMANA.cruise) + Math.max(0, -this.pitch) * 28,
    );
    this.speed += (target - this.speed) * Math.min(1, dt * 1.2);
    const cp = Math.cos(this.pitch);
    const fwd = new THREE.Vector3(
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cp,
    );
    this.pos.addScaledVector(fwd, this.speed * dt);
    const floor = groundAt(this.pos.x, this.pos.z) + VIMANA.minClearance;
    if (this.pos.y < floor) {
      this.pos.y = floor;
      this.pitch = Math.max(this.pitch, 0.05);
    }
    this.pos.y = Math.min(this.pos.y, VIMANA.ceiling);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -470, 470);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -470, 470);

    m.root.position.copy(this.pos);
    m.root.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    m.wings.forEach(
      (w, i) =>
        (w.rotation.z =
          (i ? -1 : 1) *
          (0.12 + Math.sin(this.clock * 2.2) * 0.07 - (this.speed / VIMANA.diveMax) * 0.3)),
    );

    // Wind lines and a crystal trail.
    for (let i = 0; i < 3; i++) {
      const p = this.pos
        .clone()
        .addScaledVector(fwd, 30 + Math.random() * 30)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 50,
          ),
        );
      fx.emit(
        p,
        fwd.clone().multiplyScalar(-this.speed * 1.5),
        0.5,
        [0.5, 0.6, 0.7],
        0.05 + this.speed / 900,
      );
    }
    fx.emit(
      this.pos
        .clone()
        .addScaledVector(fwd, -5)
        .setY(this.pos.y - 1.5),
      fwd.clone().multiplyScalar(-4),
      0.9,
      [0.3, 2.2, 2.0],
      boosting ? 0.5 : 0.25,
    );

    // Gates.
    let finished = false;
    this.gates.forEach((g, i) => {
      g.visible = i >= this.gate && i <= this.gate + 1;
      g.rotation.y = Math.atan2(g.position.x - this.pos.x, g.position.z - this.pos.z);
      g.scale.setScalar(i === this.gate ? 1 + 0.06 * Math.sin(this.clock * 5) : 0.8);
    });
    if (this.gate < ROUTE.length && this.pos.distanceTo(this.gates[this.gate]!.position) < 26) {
      fx.burst(this.gates[this.gate]!.position, 90, 30, 1.2, [3, 2, 0.6], 0.6, 0, 1.5);
      audio.play('shrine');
      this.gate++;
      if (this.gate === 2 || this.gate === 4 || this.gate === 6)
        this.spawnWave(scene, this.pos.clone().addScaledVector(fwd, 150));
      if (this.gate >= ROUTE.length) finished = true;
    }

    // The storm sits over the middle of the route.
    this.storm += ((this.gate >= 2 && this.gate <= 6 ? 1 : 0) - this.storm) * Math.min(1, dt * 0.5);
    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (this.storm > 0.5 && Math.random() < dt * 0.45) {
      this.lightning = 1;
      this.bolt.position
        .copy(this.pos)
        .add(new THREE.Vector3((Math.random() - 0.5) * 300, 60, (Math.random() - 0.5) * 300));
      audio.play('roar');
    }
    this.bolt.intensity = this.lightning * 60000;

    // Sky rakshasas hold station around the vimana and dive at it.
    this.foes = this.foes.filter((f) => {
      if (!f.alive) {
        fx.burst(f.pos, 50, 12, 0.9, [2.2, 0.5, 3.2], 0.5, 6, 1.5);
        audio.play('dispel');
        scene.remove(f.root);
        return false;
      }
      f.phase += dt;
      const dive = Math.sin(f.phase * 0.7) > 0.75;
      const want = this.pos
        .clone()
        .addScaledVector(fwd, dive ? 4 : 42)
        .add(
          new THREE.Vector3(
            Math.cos(this.yaw) * f.offset.x,
            f.offset.y + Math.sin(f.phase * 1.7) * 3,
            -Math.sin(this.yaw) * f.offset.x,
          ),
        );
      f.pos.lerp(want, Math.min(1, dt * (dive ? 1.6 : 0.9)));
      f.root.position.copy(f.pos);
      f.root.rotation.set(1.2, Math.atan2(this.pos.x - f.pos.x, this.pos.z - f.pos.z), 0, 'YXZ');
      if (f.pos.distanceTo(this.pos) < 7) {
        this.hull = Math.max(0, this.hull - 10);
        f.alive = false;
        audio.play('hurt');
      }
      return true;
    });

    // Arrows fired from the deck.
    this.fireT -= dt;
    if (input.fire && this.fireT <= 0) {
      this.fireT = VIMANA.fireEvery;
      arrows.fire(this.pos.clone().setY(this.pos.y + 3), aim, 130 + this.speed, 40, false);
      audio.play('release');
    }
    // If the hull is spent, the gates carry the craft home: no fail state mid-flight.
    if (this.hull <= 0) this.autopilot = true;
    return finished;
  }

  /** Where Rama steps off after the flight. */
  static landing(): [number, number] {
    return [POI.swamp.x - 62, POI.swamp.z + 52];
  }
}
