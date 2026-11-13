import * as THREE from 'three';
import type { GameAudio } from '../core/audio';
import type { Input } from '../core/input';
import { mulberry32 } from '../core/noise';
import { ASTRAS, BOSS, BOW, DRISHTI, PLAYER, type AstraId, type EnemyKind } from '../data/gameplay';
import { POI, riverZ } from '../data/world';
import type { World } from '../render/world';
import type { Hud } from '../ui/hud';
import { Colliders, type Box } from './collision';
import { Arrows, type Hittable } from './combat';
import { Enemy, Tataka, VIOLET, type Ctx } from './enemies';
import { createDeer, createTarget } from './models';
import { Particles } from './particles';
import { Player } from './player';
import { Vimana, VIMANA } from './vimana';

const SAVE_KEY = 'ramayana.save.v1';
const BRIDGE_Z = riverZ(60);
const DEER_ROUTE: [number, number][] = [
  [60, BRIDGE_Z + 24],
  [60, BRIDGE_Z - 27],
  [95, -40],
  [130, -110],
  [165, -165],
];
const GATE = { x: POI.temple.x - 16, z: POI.temple.z - 30 };

/** Story steps, in order. `at` is where the compass points. */
const STEPS: { id: string; text: string; at: () => [number, number] | null }[] = [
  {
    id: 'practice',
    text: 'Hit the three practice targets (hold and release the left mouse button)',
    at: () => [POI.hermitage.x, POI.hermitage.z - 18],
  },
  {
    id: 'toShrine',
    text: 'Follow the path east to the forest shrine',
    at: () => [POI.firstShrine.x, POI.firstShrine.z],
  },
  {
    id: 'ambush',
    text: 'Rakshasa scouts! Hold Q to chant the Agneyastra, release when the rings are full',
    at: () => null,
  },
  {
    id: 'toRiver',
    text: 'Take the north path to the river shrine',
    at: () => [POI.riverShrine.x, POI.riverShrine.z],
  },
  {
    id: 'riverFight',
    text: 'Press E for Divya Drishti: the false ones cannot bear the true sight',
    at: () => null,
  },
  {
    id: 'toTemple',
    text: 'Seek the ruined temple on the southern hill',
    at: () => [GATE.x, GATE.z],
  },
  {
    id: 'maze',
    text: 'Reach the heart of the temple. Not every wall is real, and arrows know the difference',
    at: () => [POI.temple.x, POI.temple.z],
  },
  {
    id: 'deer',
    text: 'A golden deer was seen at the river bridge. Follow it, but trust your sight',
    at: () => null,
  },
  { id: 'maricha', text: 'Maricha is unmasked. Defeat him', at: () => null },
  { id: 'vimana', text: 'A vimana descends, sent by the gods. Board it', at: () => null },
  { id: 'flight', text: 'Fly through the gates of light', at: () => null },
  {
    id: 'toSwamp',
    text: 'The poison flows from the swamp to the north-east. Find its source',
    at: () => [POI.swamp.x, POI.swamp.z],
  },
  { id: 'boss', text: 'Defeat Tataka', at: () => null },
  { id: 'done', text: 'The Dandaka Forest is at peace. Explore freely', at: () => null },
];
const stepIndex = (id: string): number => STEPS.findIndex((s) => s.id === id);

interface Save {
  step: number;
  astras: AstraId[];
  drishti: boolean;
  respawn: [number, number];
}

interface Target extends Hittable {
  group: THREE.Group;
}

export class Game {
  readonly player = new Player();
  readonly fx = new Particles();
  readonly col: Colliders;
  private readonly arrows = new Arrows();
  private enemies: Enemy[] = [];
  private boss: Tataka | null = null;
  private targets: Target[] = [];
  private mayaWalls: { box: Box; mesh: THREE.Mesh; fade: number }[] = [];
  private readonly vimana = new Vimana();
  private deer = createDeer();
  private deerPos = new THREE.Vector3();
  private deerWp = 0;
  private deerActive = false;
  private readonly group = new THREE.Group();
  private readonly flash = new THREE.PointLight(0xff8a3c, 0, 40, 1.6);
  private readonly rings: THREE.Mesh[] = [];
  private readonly pulseMesh: THREE.Mesh;
  private readonly heart: THREE.Mesh;

  active = false;
  paused = false;
  camYaw = 0;
  camPitch = -0.12;
  timeScale = 1;
  step = 0;
  private known = new Set<AstraId>();
  private drishtiKnown = false;
  private respawnAt: [number, number] = [POI.hermitage.x + 2, POI.hermitage.z + 8];
  private selected: AstraId = 'agneya';
  private cooldown: Record<string, number> = { agneya: 0, vayavya: 0, drishti: 0 };
  private chantT = 0;
  private focusLatch = false;
  private shake = 0;
  private hitPause = 0;
  private hurtFlash = 0;
  private cyclone: { pos: THREE.Vector3; t: number } | null = null;
  private pulse: { origin: THREE.Vector3; t: number } | null = null;
  private stepClock = 0;
  private aimBlend = 0;
  private bossDarkness = 0;
  private won = false;
  private ctx: Ctx;
  onQuality: (q: import('../data/quality').QualityName) => void = () => undefined;
  getQuality: () => import('../data/quality').QualityName = () => 'medium';

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: World,
    private readonly input: Input,
    private readonly audio: GameAudio,
    private readonly hud: Hud,
  ) {
    this.col = new Colliders(world);
    this.group.name = 'game';
    this.group.add(
      this.player.root,
      this.arrows.group,
      this.fx.points,
      this.flash,
      this.deer.root,
      this.vimana.group,
    );
    this.deer.root.visible = false;

    // Astra glyph rings that spin around the bow while chanting.
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 1.9, 0.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.55 + i * 0.28,
          0.012 + i * 0.004,
          4,
          40 - i * 8,
          Math.PI * (1.7 - i * 0.2),
        ),
        ringMat,
      );
      ring.visible = false;
      this.rings.push(ring);
      this.group.add(ring);
    }
    this.pulseMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        uniforms: { uAlpha: { value: 0 } },
        vertexShader:
          'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader:
          'uniform float uAlpha; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5); gl_FragColor = vec4(vec3(2.6, 1.7, 0.5) * rim * uAlpha, 1.0); }',
      }),
    );
    this.pulseMesh.visible = false;
    this.group.add(this.pulseMesh);

    // The glowing heart of the temple, where the Vayavyastra waits.
    this.heart = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.6, 2.8), fog: false }),
    );
    this.heart.position.set(POI.temple.x, world.structures.templeFloorY + 1.6, POI.temple.z);
    this.group.add(this.heart);

    this.ctx = {
      player: this.player,
      col: this.col,
      arrows: this.arrows,
      fx: this.fx,
      audio: this.audio,
      hurtPlayer: (amount) => this.hurtPlayer(amount),
    };
    this.arrows.onStick = () => this.audio.play('stick');
    this.arrows.onEnemyHit = (head) => {
      this.audio.play('hit');
      if (head) {
        this.hitPause = 0.07;
        this.player.focus = Math.min(PLAYER.focusMax, this.player.focus + PLAYER.focusPerHeadshot);
      }
      this.shake = Math.max(this.shake, head ? 0.25 : 0.1);
    };
    this.arrows.onPlayerHit = (d) => this.hurtPlayer(d);
    this.buildMaya();
    this.buildTargets();
  }

  // ---------------------------------------------------------------- setup

  private buildTargets(): void {
    const { x, z } = POI.hermitage;
    for (const [dx, dz] of [
      [-7, -16],
      [0, -19],
      [7, -16.5],
    ] as const) {
      const group = createTarget();
      const pos = new THREE.Vector3(x + dx, this.col.groundAt(x + dx, z + dz), z + dz);
      group.position.copy(pos);
      this.group.add(group);
      const t: Target = {
        group,
        pos,
        radius: 0.7,
        height: 2.2,
        headY: 1.6,
        alive: true,
        hit: () => {
          t.alive = false;
          group.rotation.x = -1.2;
          this.fx.burst(pos.clone().setY(pos.y + 1.6), 30, 4, 0.6, [3, 2, 0.6], 0.06, 6, 2);
        },
      };
      this.targets.push(t);
    }
  }

  private buildMaya(): void {
    const rand = mulberry32(77);
    const open = [...this.world.structures.templeOpenings].sort(() => rand() - 0.5).slice(0, 8);
    const floor = this.world.structures.templeFloorY;
    for (const o of open) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8a7a8e,
        roughness: 0.25,
        metalness: 0.6,
        emissive: new THREE.Color(0.16, 0.04, 0.24),
        transparent: true,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, 5, o.d), mat);
      mesh.position.set(o.x, floor + 2.5, o.z);
      this.group.add(mesh);
      const box: Box = { x: o.x, z: o.z, w: o.w, d: o.d, h: 5, maya: true };
      this.col.boxes.push(box);
      this.mayaWalls.push({ box, mesh, fade: 0 });
    }
  }

  private spawn(kind: EnemyKind, x: number, z: number): Enemy {
    const e = new Enemy(kind, x, z, this.col.groundAt(x, z));
    e.onDeath = (dead) => {
      const p = dead.pos.clone().setY(dead.pos.y + 1);
      if (dead.kind === 'clone') {
        this.fx.burst(p, 70, 5, 1.1, VIOLET, 0.16, -1, 1.5, 1);
        dead.figure.root.visible = false;
        this.audio.play('dispel');
      } else this.fx.burst(p, 24, 4, 0.7, [1.6, 0.4, 0.2], 0.1, 4, 2);
    };
    this.enemies.push(e);
    this.group.add(e.figure.root);
    return e;
  }

  private spawnGroup(cx: number, cz: number, kinds: EnemyKind[], radius = 9): void {
    kinds.forEach((k, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + 0.6;
      this.spawn(k, cx + Math.cos(a) * radius, cz + Math.sin(a) * radius);
    });
  }

  private clearEnemies(): void {
    for (const e of this.enemies) this.group.remove(e.figure.root);
    this.enemies = [];
    this.boss?.dispose();
    this.boss = null;
  }

  // ---------------------------------------------------------------- save / start

  private save(): void {
    const s: Save = {
      step: this.step,
      astras: [...this.known],
      drishti: this.drishtiKnown,
      respawn: this.respawnAt,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      /* saving is best-effort */
    }
  }

  reset(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    location.reload();
  }

  start(): void {
    this.scene.add(this.group);
    let save: Save | null;
    try {
      save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Save | null;
    } catch {
      save = null;
    }
    if (save && save.step > 0) {
      // Fights restart from the walk that leads into them.
      const back: Record<string, string> = {
        ambush: 'toShrine',
        riverFight: 'toRiver',
        maze: 'toTemple',
        maricha: 'deer',
        flight: 'vimana',
        boss: 'toSwamp',
      };
      const id = STEPS[save.step]?.id ?? 'practice';
      this.known = new Set(save.astras);
      this.drishtiKnown = save.drishti;
      this.respawnAt = save.respawn;
      this.enter(stepIndex(back[id] ?? id), true);
      this.hud.toast('Journey resumed');
    } else {
      this.enter(0, true);
      this.card(
        'hermitage',
        'Dandaka',
        'Exile has brought Rama, Sita and Lakshmana to the hermitage at Panchavati. The forest is beautiful, and it is not what it seems.',
      );
    }
    if (this.known.has('vayavya')) this.heart.visible = false;
    this.player.respawn(
      this.respawnAt[0],
      this.respawnAt[1],
      this.col.groundAt(this.respawnAt[0], this.respawnAt[1]),
    );
    this.player.invulnerable = 0;
    this.player.yaw = this.camYaw + Math.PI; // start facing away from the camera
    this.active = true;
    this.hud.show(true);
  }

  /** Shows an illustrated story card and holds the game until the player continues. */
  private card(art: string, title: string, text: string, portrait = false): void {
    if (navigator.webdriver) {
      this.hud.story(title, text, 8); // automated tests: never block on a click
      return;
    }
    this.paused = true;
    document.exitPointerLock?.();
    this.audio.narrate(art);
    void this.hud.card(art, title, text, portrait).then(() => {
      this.paused = false;
      this.input.requestLock();
    });
  }

  /** Moves the story to a step and sets up whatever that step needs. */
  private enter(i: number, quiet = false): void {
    this.step = i;
    this.stepClock = 0;
    const id = STEPS[i]!.id;
    if (id !== 'practice') for (const t of this.targets) t.alive = false;
    if (id === 'ambush')
      this.spawnGroup(POI.firstShrine.x, POI.firstShrine.z, ['grunt', 'grunt', 'grunt'], 13);
    if (id === 'riverFight')
      this.spawnGroup(
        POI.riverShrine.x,
        POI.riverShrine.z + 6,
        ['clone', 'grunt', 'clone', 'archer', 'clone'],
        14,
      );
    if (id === 'toTemple') this.spawnGroup(60, 190, ['grunt', 'archer', 'grunt'], 7);
    if (id === 'maze') {
      const { x, z } = POI.temple;
      this.spawn('clone', x - 12, z - 12);
      this.spawn('clone', x + 12, z - 4);
      this.spawn('clone', x - 4, z + 12);
      this.spawn('archer', x + 20, z + 20);
      this.spawn('archer', x - 20, z + 12);
      this.spawn('grunt', x + 4, z + 4);
    }
    if (id !== 'vimana' && id !== 'flight') this.vimana.hide(this.scene);
    if (id === 'vimana') {
      if (this.deerPos.lengthSq() < 1)
        this.deerPos.set(
          DEER_ROUTE[DEER_ROUTE.length - 1]![0],
          0,
          DEER_ROUTE[DEER_ROUTE.length - 1]![1],
        );
      const vx = this.deerPos.x + 12;
      const vz = this.deerPos.z + 8;
      this.vimana.park(vx, this.col.groundAt(vx, vz), vz);
    }
    if (id === 'flight') {
      this.vimana.takeOff(this.scene);
      this.player.root.visible = false;
    }
    if (id === 'deer') {
      this.card(
        'deer',
        'The golden deer',
        'Sita has seen a deer of living gold by the river bridge. Nothing so beautiful walks this forest by chance. Follow it, and trust your sight.',
      );
      this.deerWp = 0;
      this.deerActive = true;
      this.deerPos.set(DEER_ROUTE[0]![0], 0, DEER_ROUTE[0]![1]);
      this.deer.root.visible = true;
    } else if (id !== 'maricha') {
      this.deerActive = false;
      this.deer.root.visible = false;
    }
    if (id === 'maricha') {
      this.deer.root.visible = false;
      this.deerActive = false;
      const m = this.spawn('maricha', this.deerPos.x, this.deerPos.z);
      m.revealed = 3;
      this.spawn('clone', this.deerPos.x + 5, this.deerPos.z + 3);
      this.spawn('clone', this.deerPos.x - 5, this.deerPos.z + 3);
      this.fx.burst(
        this.deerPos.clone().setY(this.deerPos.y + 1),
        120,
        7,
        1.2,
        VIOLET,
        0.2,
        -1,
        1.5,
        1,
      );
      this.audio.play('dispel');
      this.hud.story(
        'Maricha',
        'The golden deer was never a deer. The rakshasa Maricha throws off his disguise.',
        6,
      );
    }
    if (id === 'boss') {
      this.boss = new Tataka(POI.swamp.x + 6, POI.swamp.z - 10, this.scene);
      this.boss.onSummon = () => {
        const b = this.boss!;
        this.spawnGroup(b.pos.x, b.pos.z, ['grunt', 'clone', 'grunt', 'clone'], 8);
      };
      this.boss.onPhase = (ph) => {
        this.audio.play('roar');
        this.shake = 0.6;
        if (ph === 2)
          this.hud.story(
            'Brood',
            'Tataka calls her brood and poisons the air. A great wind would clear it.',
            7,
          );
        if (ph === 3)
          this.hud.story(
            'Darkness',
            'She drowns the swamp in darkness. Only true sight, or fire, will show her.',
            7,
          );
      };
      this.boss.onDeath = () => {
        this.audio.play('win');
        this.hud.flashGold();
        this.world.weather.rainTarget = 0;
        for (const e of this.enemies) e.die();
        this.enter(stepIndex('done'));
      };
      this.audio.play('roar');
      this.shake = 0.7;
      this.card(
        'tataka',
        'Tataka',
        'The water heaves. Tataka, who poisoned this forest, rises to meet you. She charges first: step aside and strike while she is stunned.',
        true,
      );
    }
    if (id === 'done') this.won = true;
    if (!quiet) this.save();
  }

  private learn(
    what: AstraId | 'drishti',
    at: [number, number],
    title: string,
    text: string,
  ): void {
    if (what === 'drishti') this.drishtiKnown = true;
    else {
      this.known.add(what);
      this.selected = what;
    }
    this.respawnAt = at;
    this.player.health = this.player.maxHealth;
    this.audio.play('shrine');
    this.hud.flashGold();
    const art = what === 'agneya' ? 'forest' : what === 'drishti' ? 'night' : 'temple';
    this.card(art, title, text);
  }

  // ---------------------------------------------------------------- combat helpers

  private hurtPlayer(amount: number): void {
    if (!this.player.damage(amount)) return;
    this.audio.play('hurt');
    this.shake = Math.max(this.shake, 0.4);
    this.hurtFlash = 0.3;
    this.input.rumble(0.7, 180);
    if (this.chantT > 0) {
      // Being hit breaks the chant and costs half the cooldown.
      this.chantT = 0;
      this.cooldown[this.selected] = ASTRAS[this.selected].cooldown / 2;
      this.hud.toast('Chant broken');
    }
    if (this.player.dead) {
      this.paused = true;
      document.exitPointerLock?.();
      this.showOverlay('dead');
    }
  }

  private hittables(): Hittable[] {
    const list: Hittable[] = [...this.enemies, ...this.targets];
    if (this.boss) list.push(this.boss);
    return list;
  }

  private aimDir(out: THREE.Vector3): THREE.Vector3 {
    const from = this.player.bowPoint(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    return out.copy(this.camera.position).addScaledVector(fwd, 70).sub(from).normalize();
  }

  private castAstra(id: AstraId): void {
    const def = ASTRAS[id];
    const from = this.player.bowPoint(new THREE.Vector3());
    const dir = this.aimDir(new THREE.Vector3());
    this.cooldown[id] = def.cooldown;
    this.shake = 0.5;
    this.input.rumble(1, 300);
    if (def.shape === 'cone') {
      this.audio.play('fire');
      const cos = Math.cos((def.size * Math.PI) / 180);
      for (const h of this.hittables()) {
        if (!h.alive) continue;
        const to = new THREE.Vector3(
          h.pos.x - from.x,
          h.pos.y + h.height * 0.5 - from.y,
          h.pos.z - from.z,
        );
        const d = to.length();
        if (d > def.range + h.radius || to.normalize().dot(dir) < cos) continue;
        h.hit(def.damage, false, dir);
        if (h instanceof Enemy || h instanceof Tataka) h.burn = def.duration;
      }
      if (this.boss && this.boss.pos.distanceTo(this.player.pos) < def.range + 14)
        this.boss.revealed = 6; // the burning reeds light her up
      const v = new THREE.Vector3();
      for (let i = 0; i < 380; i++) {
        v.copy(dir).multiplyScalar(8 + Math.random() * 16);
        v.x += (Math.random() - 0.5) * 9;
        v.y += (Math.random() - 0.5) * 5 + 1;
        v.z += (Math.random() - 0.5) * 9;
        this.fx.emit(
          from,
          v,
          0.5 + Math.random() * 0.9,
          def.color,
          0.14 + Math.random() * 0.2,
          -2,
          1.4,
        );
      }
      this.flash.color.setRGB(1, 0.5, 0.2);
      this.flash.intensity = 900;
      this.flash.position.copy(from).addScaledVector(dir, 6);
    } else if (def.shape === 'cyclone') {
      this.audio.play('wind');
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      const p = this.player.pos.clone().addScaledVector(flat, 12);
      p.y = this.col.groundAt(p.x, p.z);
      this.cyclone = { pos: p, t: def.duration };
      for (const h of this.hittables()) {
        if (!h.alive || Math.hypot(h.pos.x - p.x, h.pos.z - p.z) > def.size + h.radius) continue;
        h.hit(def.damage, false, flat);
        if (h instanceof Enemy) h.lift = 2.6;
      }
      if (this.boss) this.boss.mistCleared = BOSS.poisonClearTime;
    }
  }

  private castDrishti(): void {
    this.cooldown.drishti = DRISHTI.cooldown;
    this.pulse = { origin: this.player.pos.clone().setY(this.player.pos.y + 1), t: 0 };
    this.audio.play('drishti');
    this.hud.flashGold();
  }

  /** Applies the true sight to everything the expanding pulse has reached. */
  private applyPulse(radius: number, origin: THREE.Vector3): void {
    for (const e of this.enemies) {
      if (!e.alive || e.revealed > DRISHTI.reveal - 0.5 || e.pos.distanceTo(origin) > radius)
        continue;
      e.revealed = DRISHTI.reveal;
      if (e.kind === 'clone') e.die();
    }
    for (const w of this.mayaWalls) {
      if (w.box.off || w.fade > 0 || Math.hypot(w.box.x - origin.x, w.box.z - origin.z) > radius)
        continue;
      w.fade = 1;
      this.audio.play('dispel');
      this.fx.burst(w.mesh.position, 80, 4, 1.2, VIOLET, 0.18, -0.5, 1.5);
    }
    if (this.boss && this.boss.alive && this.boss.pos.distanceTo(origin) < radius)
      this.boss.revealed = DRISHTI.reveal;
    if (this.deerActive && this.deerPos.distanceTo(origin) < radius) {
      if (this.deerWp >= DEER_ROUTE.length - 1 && STEPS[this.step]!.id === 'deer')
        this.enter(stepIndex('maricha'));
      else {
        this.fx.burst(
          this.deerPos.clone().setY(this.deerPos.y + 1),
          40,
          3,
          0.9,
          VIOLET,
          0.14,
          -1,
          1.5,
        );
        this.hud.toast('The deer flickers violet. It is not what it seems');
      }
    }
  }

  // ---------------------------------------------------------------- overlay

  private showOverlay(kind: 'pause' | 'dead' | 'won'): void {
    this.hud.overlayShow(kind, {
      quality: this.getQuality(),
      onQuality: (q) => this.onQuality(q),
      volume: this.audio.volume,
      sens: this.input.sensitivity,
      onVolume: (v) => this.audio.setVolume(v),
      onSens: (v) => (this.input.sensitivity = v),
      onReset: () => this.reset(),
      onResume: () => {
        this.hud.overlayHide();
        if (this.player.dead) {
          this.player.respawn(
            this.respawnAt[0],
            this.respawnAt[1],
            this.col.groundAt(this.respawnAt[0], this.respawnAt[1]),
          );
          for (const e of this.enemies)
            if (e.alive && e.pos.distanceTo(this.player.pos) < 12)
              e.pos.addScaledVector(new THREE.Vector3(1, 0, 1), 14);
          if (this.boss) {
            // The boss fight restarts from the swamp's edge.
            this.clearEnemies();
            this.enter(stepIndex('toSwamp'));
          }
        }
        this.paused = false;
        this.input.requestLock();
      },
    });
  }

  pause(): void {
    if (!this.active || this.paused) return;
    this.paused = true;
    this.showOverlay('pause');
  }

  // ---------------------------------------------------------------- frame

  /** Advances the game; returns the time scale the world should use this frame. */
  update(dt: number, elapsed: number): number {
    const input = this.input;
    const p = this.player;
    if (this.paused) return 0;

    // --- time scale: focus slow-motion and hit pause
    this.hitPause = Math.max(0, this.hitPause - dt);
    p.focusActive = this.focusLatch && p.drawing && p.focus > 0;
    const targetScale = this.wheelOpen
      ? 0.15
      : this.hitPause > 0
        ? 0.05
        : p.focusActive
          ? BOW.focusTimeScale
          : 1;
    this.timeScale += (targetScale - this.timeScale) * Math.min(1, dt * 14);
    const gdt = dt * this.timeScale;

    if (STEPS[this.step]!.id === 'flight') {
      this.updateFlight(dt);
      return 1;
    }

    // --- camera look (the astra wheel borrows the mouse while it is open)
    if (input.keys.has('tab')) {
      this.wheelX += input.lookX * 260;
      this.wheelY += input.lookY * 260;
      const len = Math.hypot(this.wheelX, this.wheelY);
      if (len > 150) {
        this.wheelX *= 150 / len;
        this.wheelY *= 150 / len;
      }
      input.lookX = input.lookY = 0;
    }
    this.camYaw -= input.lookX;
    this.camPitch = Math.max(-1.15, Math.min(1.1, this.camPitch - input.lookY));

    // --- bow
    const canAct = !p.dead;
    const chanting = this.chantT > 0;
    p.aiming = (input.aim || chanting) && canAct; // Rama turns to face the aim while chanting
    if (canAct && input.fire && !chanting && !p.dodging) {
      if (!p.drawing) {
        p.drawing = true;
        p.draw = 0;
        this.focusLatch = p.focusEligible;
        this.audio.play('draw');
      }
      p.draw = Math.min(1, p.draw + dt / BOW.drawTime);
    } else if (p.drawing) {
      p.drawing = false;
      if (canAct && p.draw > 0.08) {
        const dir = this.aimDir(new THREE.Vector3());
        const spread = (THREE.MathUtils.lerp(BOW.spreadMax, BOW.spreadMin, p.draw) * Math.PI) / 180;
        dir.x += (Math.random() - 0.5) * spread;
        dir.y += (Math.random() - 0.5) * spread + 0.012;
        dir.z += (Math.random() - 0.5) * spread;
        this.arrows.fire(
          p.bowPoint(new THREE.Vector3()),
          dir,
          THREE.MathUtils.lerp(BOW.speedMin, BOW.speedMax, p.draw),
          THREE.MathUtils.lerp(BOW.damageMin, BOW.damageMax, p.draw),
          false,
        );
        this.audio.play('release');
        this.shake = Math.max(this.shake, 0.06 + p.draw * 0.1);
      }
      p.draw = 0;
      this.focusLatch = false;
    }

    // --- astras and Divya Drishti
    for (const k of Object.keys(this.cooldown))
      this.cooldown[k] = Math.max(0, this.cooldown[k]! - gdt);
    if (input.hit('1') && this.known.has('agneya')) this.selected = 'agneya';
    if (input.hit('2') && this.known.has('vayavya')) this.selected = 'vayavya';
    this.updateWheel();
    const def = ASTRAS[this.selected];
    if (
      canAct &&
      input.keys.has('q') &&
      this.known.has(this.selected) &&
      this.cooldown[this.selected]! <= 0 &&
      !p.drawing
    ) {
      if (this.chantT === 0) this.audio.play('chant');
      this.chantT += dt;
    } else if (this.chantT > 0) {
      if (this.chantT >= def.chant && canAct) this.castAstra(this.selected);
      else this.hud.toast('Chant released too early');
      this.chantT = 0;
    }
    // Tell the player why nothing happened, instead of staying silent.
    if (canAct && input.hit('q')) {
      if (!this.known.has(this.selected))
        this.hud.toast('No astra learned yet: find the forest shrine');
      else if (this.cooldown[this.selected]! > 0)
        this.hud.toast(`${def.name} returns in ${Math.ceil(this.cooldown[this.selected]!)} s`);
    }
    if (canAct && input.hit('e')) {
      if (!this.drishtiKnown) this.hud.toast('Divya Drishti is learned at the river shrine');
      else if (this.cooldown.drishti! > 0)
        this.hud.toast(`Divya Drishti returns in ${Math.ceil(this.cooldown.drishti!)} s`);
      else this.castDrishti();
    }

    // --- player and enemies
    p.aimPitch = this.camPitch;
    if (p.update(gdt, input, this.camYaw, this.col, canAct)) this.audio.play('dodge');
    for (const t of this.targets)
      t.group.visible = STEPS[this.step]!.id === 'practice' || t.group.rotation.x !== 0;
    this.enemies = this.enemies.filter((e) => {
      const keep = e.update(gdt, this.ctx);
      if (!keep) this.group.remove(e.figure.root);
      return keep;
    });
    this.boss?.update(gdt, this.ctx);
    this.arrows.update(gdt, this.col, this.hittables(), { pos: p.pos, alive: !p.dead }, this.fx);

    this.updateEffects(dt, gdt, elapsed, def.chant);
    this.updateStory(gdt);
    this.updateCamera(dt);
    this.fx.update(gdt);

    // --- HUD and audio
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    const fighting =
      this.enemies.some((e) => e.alive && e.pos.distanceTo(p.pos) < 40) || !!this.boss?.alive;
    this.audio.update(this.world.weather.rain, fighting);
    const at = STEPS[this.step]!.at();
    const marker =
      at ??
      (this.deerActive
        ? [this.deerPos.x, this.deerPos.z]
        : this.boss?.alive
          ? null
          : this.nearestEnemy());
    let markerAngle: number | null = null;
    let markerDistance = 0;
    if (marker) {
      const dx = marker[0]! - p.pos.x;
      const dz = marker[1]! - p.pos.z;
      markerDistance = Math.hypot(dx, dz);
      const bearing = Math.atan2(-dx, -dz);
      markerAngle = Math.atan2(Math.sin(bearing - this.camYaw), Math.cos(bearing - this.camYaw));
    }
    this.hud.update(dt, {
      health: p.health / p.maxHealth,
      focus: p.focus / PLAYER.focusMax,
      objective: STEPS[this.step]!.text,
      markerAngle,
      markerDistance,
      camYaw: this.camYaw,
      spread: p.drawing ? 1 - p.draw : 1,
      showCross: true,
      astras: (['agneya', 'vayavya'] as AstraId[]).map((id, i) => ({
        key: String(i + 1),
        name: ASTRAS[id].name,
        known: this.known.has(id),
        selected: this.selected === id && this.known.has(id),
        cooldown: this.cooldown[id]! / ASTRAS[id].cooldown,
      })),
      drishti: { known: this.drishtiKnown, cooldown: this.cooldown.drishti! / DRISHTI.cooldown },
      boss: this.boss?.alive ? this.boss.hp / BOSS.hp : null,
      hurt: this.hurtFlash,
    });
    if (this.won && this.stepClock > 3.5) {
      this.won = false;
      this.paused = true;
      document.exitPointerLock?.();
      if (navigator.webdriver) this.showOverlay('won');
      else
        void this.hud
          .card(
            'rama',
            'Dharma prevails',
            'Tataka is defeated and the swamp breathes again. The path of the bow continues south, towards Kishkindha.',
            true,
          )
          .then(() => this.showOverlay('won'));
    }
    return this.timeScale;
  }

  /** The vimana ride: its own controls, camera and HUD. */
  private updateFlight(dt: number): void {
    const v = this.vimana;
    const cam = this.camera;
    const aim = cam.getWorldDirection(new THREE.Vector3());
    const done = v.update(
      dt,
      this.input,
      this.arrows,
      this.fx,
      this.audio,
      this.scene,
      (x, z) => this.col.groundAt(x, z),
      aim,
    );
    this.player.pos.copy(v.pos);
    this.arrows.update(dt, this.col, v.targets, { pos: this.player.pos, alive: false }, this.fx);
    this.fx.update(dt);
    this.world.weather.rainTarget = 0.25 + 0.75 * v.storm;

    const cp = Math.cos(v.pitch);
    const fwd = new THREE.Vector3(Math.sin(v.yaw) * cp, Math.sin(v.pitch), Math.cos(v.yaw) * cp);
    cam.position
      .copy(v.pos)
      .addScaledVector(fwd, -17)
      .add(new THREE.Vector3(0, 5.5, 0));
    cam.lookAt(v.pos.clone().addScaledVector(fwd, 30));
    const fov = THREE.MathUtils.lerp(
      60,
      85,
      THREE.MathUtils.clamp((v.speed - VIMANA.cruise) / (VIMANA.diveMax - VIMANA.cruise), 0, 1),
    );
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
    this.camYaw = v.yaw + Math.PI;

    this.audio.update(this.world.weather.rain, v.targets.length > 0);
    this.hud.update(dt, {
      health: v.hull / VIMANA.hull,
      focus: 1,
      objective: `Fly through the gates of light (${v.gate} of ${v.gateCount})   ·   Shift: boost   ·   Click: loose arrows`,
      markerAngle: null,
      markerDistance: 0,
      camYaw: this.camYaw,
      spread: 0.3,
      showCross: true,
      astras: [],
      drishti: { known: false, cooldown: 0 },
      boss: null,
      hurt: 0,
    });
    if (done) {
      const [lx, lz] = Vimana.landing();
      this.respawnAt = [lx, lz];
      this.player.respawn(lx, lz, this.col.groundAt(lx, lz));
      this.player.invulnerable = 0;
      this.player.root.visible = true;
      this.camYaw = Math.atan2(-(POI.swamp.x - lx), -(POI.swamp.z - lz));
      this.camPitch = -0.1;
      this.world.weather.rainTarget = 0.5;
      this.hud.story(
        'The swamp',
        'The vimana sets you down at the edge of the poisoned water and rises back into the storm.',
        7,
      );
      this.enter(stepIndex('toSwamp'));
    }
  }

  private wheelOpen = false;
  private wheelX = 0;
  private wheelY = 0;

  /** Hold Tab: time slows and the astra wheel opens; move the mouse towards an astra and release. */
  private updateWheel(): void {
    const ids = Object.keys(ASTRAS) as AstraId[];
    const held = this.input.keys.has('tab') && !this.player.dead;
    const items = ids.map((id) => ({
      name: ASTRAS[id].name,
      deity: ASTRAS[id].deity,
      known: this.known.has(id),
    }));
    let hot = -1;
    if (Math.hypot(this.wheelX, this.wheelY) > 45) {
      const a = Math.atan2(this.wheelY, this.wheelX) + Math.PI / 2;
      hot = Math.round(((((a / (Math.PI * 2)) % 1) + 1) % 1) * ids.length) % ids.length;
    }
    if (held) {
      this.wheelOpen = true;
      this.hud.wheel(true, items, hot);
    } else if (this.wheelOpen) {
      this.wheelOpen = false;
      this.hud.wheel(false);
      const id = ids[hot];
      if (id && this.known.has(id) && ASTRAS[id].implemented) this.selected = id;
      this.wheelX = this.wheelY = 0;
    }
  }

  private nearestEnemy(): [number, number] | null {
    let best: Enemy | null = null;
    for (const e of this.enemies)
      if (
        e.alive &&
        (!best || e.pos.distanceTo(this.player.pos) < best.pos.distanceTo(this.player.pos))
      )
        best = e;
    return best ? [best.pos.x, best.pos.z] : null;
  }

  private updateEffects(dt: number, gdt: number, elapsed: number, chantTime: number): void {
    const p = this.player;
    // Chant rings.
    const k = Math.min(1, this.chantT / chantTime);
    const bow = p.bowPoint(new THREE.Vector3());
    this.rings.forEach((r, i) => {
      r.visible = this.chantT > 0;
      if (!r.visible) return;
      r.position.copy(bow);
      r.rotation.set(
        elapsed * (1.5 + i) * (i % 2 ? -1 : 1),
        elapsed * (0.9 + i * 0.6),
        i * 1.3 + elapsed * 0.5,
      );
      r.scale.setScalar(0.3 + 0.9 * k + (k >= 1 ? Math.sin(elapsed * 14) * 0.05 : 0));
    });
    if (this.chantT > 0 && Math.random() < dt * 60) {
      const c = ASTRAS[this.selected].color;
      this.fx.emit(
        bow
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 2,
            ),
          ),
        new THREE.Vector3(0, 0.6, 0),
        0.6,
        [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7],
        0.05,
      );
    }
    this.flash.intensity *= Math.max(0, 1 - dt * 5);

    // Cyclone column.
    if (this.cyclone) {
      const c = this.cyclone;
      c.t -= gdt;
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2;
        const h = Math.random() * 9;
        const r = 1 + h * 0.55;
        const pos = new THREE.Vector3(
          c.pos.x + Math.cos(a) * r,
          c.pos.y + h,
          c.pos.z + Math.sin(a) * r,
        );
        this.fx.emit(
          pos,
          new THREE.Vector3(-Math.sin(a) * 9, 2.5, Math.cos(a) * 9),
          0.7,
          ASTRAS.vayavya.color,
          0.1 + Math.random() * 0.12,
          0,
          0.6,
        );
      }
      for (const e of this.enemies) {
        if (
          e.alive &&
          e.lift <= 0 &&
          Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) < ASTRAS.vayavya.size
        )
          e.lift = Math.min(2.6, c.t + 0.4);
      }
      if (c.t <= 0) this.cyclone = null;
    }

    // Divya Drishti pulse.
    if (this.pulse) {
      const pu = this.pulse;
      pu.t += dt;
      const r = Math.min(1, pu.t / DRISHTI.expand) * DRISHTI.radius;
      this.pulseMesh.visible = true;
      this.pulseMesh.position.copy(pu.origin);
      this.pulseMesh.scale.setScalar(Math.max(0.1, r));
      (this.pulseMesh.material as THREE.ShaderMaterial).uniforms.uAlpha!.value =
        1.2 * (1 - pu.t / (DRISHTI.expand + 0.5));
      this.applyPulse(r, pu.origin);
      if (pu.t > DRISHTI.expand + 0.5) {
        this.pulse = null;
        this.pulseMesh.visible = false;
      }
    }

    // Maya walls shimmer, and dissolve once seen through.
    for (const w of this.mayaWalls) {
      const m = w.mesh.material as THREE.MeshStandardMaterial;
      if (w.fade > 0) {
        w.fade -= dt;
        m.opacity = Math.max(0, w.fade);
        if (w.fade <= 0) {
          w.box.off = true;
          w.mesh.visible = false;
        }
      } else if (!w.box.off) {
        const s = 0.5 + 0.5 * Math.sin(elapsed * 2.2 + w.box.x);
        m.emissive.setRGB(0.1 + 0.16 * s, 0.03 + 0.12 * (1 - s), 0.22 + 0.1 * s);
      }
    }
    this.heart.rotation.y = elapsed;
    this.heart.position.y =
      this.world.structures.templeFloorY + 1.6 + Math.sin(elapsed * 1.7) * 0.15;

    // Golden deer.
    if (this.deerActive) {
      const d = this.deer;
      const wp = DEER_ROUTE[this.deerWp]!;
      const dx = wp[0] - this.deerPos.x;
      const dz = wp[1] - this.deerPos.z;
      const dist = Math.hypot(dx, dz);
      let moving = false;
      if (dist > 0.6) {
        moving = true;
        this.deerPos.x += (dx / dist) * 9.5 * gdt;
        this.deerPos.z += (dz / dist) * 9.5 * gdt;
        d.root.rotation.y = Math.atan2(dx, dz);
      } else if (this.deerWp < DEER_ROUTE.length - 1 && this.deerPos.distanceTo(p.pos) < 13) {
        this.deerWp++;
      } else {
        d.root.rotation.y =
          Math.atan2(p.pos.x - this.deerPos.x, p.pos.z - this.deerPos.z) + Math.PI * 0.8;
      }
      this.deerPos.y = this.col.groundAt(this.deerPos.x, this.deerPos.z);
      d.root.position.copy(this.deerPos);
      d.legs.forEach(
        (l, i) => (l.rotation.x = moving ? Math.sin(elapsed * 16 + (i % 2) * Math.PI) * 0.8 : 0),
      );
      d.root.position.y += moving ? Math.abs(Math.sin(elapsed * 8)) * 0.35 : 0;
      if (Math.random() < dt * 14)
        this.fx.emit(
          this.deerPos
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 1.2,
                0.5 + Math.random() * 1.2,
                (Math.random() - 0.5) * 1.2,
              ),
            ),
          new THREE.Vector3(0, 0.5, 0),
          1,
          [2.2, 1.4, 0.3],
          0.05,
        );
    }

    // Boss atmosphere: poison in phase 2, darkness in phase 3.
    const b = this.boss;
    this.bossDarkness +=
      ((b?.alive && b.phase === 3 ? 1 : 0) - this.bossDarkness) * Math.min(1, dt * 0.8);
    if (
      b?.alive &&
      b.phase === 2 &&
      b.mistCleared <= 0 &&
      Math.hypot(p.pos.x - POI.swamp.x, p.pos.z - POI.swamp.z) < BOSS.arenaRadius + 12
    ) {
      p.health = Math.max(1, p.health - BOSS.poisonPerSecond * gdt);
      if (Math.random() < dt * 20)
        this.fx.emit(
          p.pos
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                Math.random() * 2,
                (Math.random() - 0.5) * 8,
              ),
            ),
          new THREE.Vector3(0, 0.4, 0),
          1.4,
          [0.25, 0.9, 0.15],
          0.3,
        );
    }
  }

  /** How dark the boss wants the world (0..1); main.ts applies it to light and fog. */
  get darkness(): number {
    return Math.max(
      this.bossDarkness,
      this.vimana.active ? this.vimana.storm * 0.55 * (1 - this.vimana.lightning) : 0,
    );
  }

  private updateStory(gdt: number): void {
    const p = this.player;
    const id = STEPS[this.step]!.id;
    this.stepClock += gdt;
    const near = (x: number, z: number, r: number): boolean =>
      Math.hypot(p.pos.x - x, p.pos.z - z) < r;
    const cleared = this.stepClock > 1 && !this.enemies.some((e) => e.alive);
    switch (id) {
      case 'practice':
        if (this.targets.every((t) => !t.alive)) {
          this.hud.story(
            'Lakshmana',
            '"Your aim is true, brother. The sages speak of a shrine to the east where the old astras can still be heard."',
            8,
          );
          this.enter(this.step + 1);
        }
        break;
      case 'toShrine':
        if (near(POI.firstShrine.x, POI.firstShrine.z, 6)) {
          this.learn(
            'agneya',
            [POI.firstShrine.x + 5, POI.firstShrine.z],
            'Agneyastra',
            "Vishwamitra's teaching returns: the fire of Agni. Hold Q to chant, release when the rings are full.",
          );
          this.enter(this.step + 1);
        }
        break;
      case 'ambush':
      case 'riverFight':
      case 'maricha':
        if (cleared) {
          if (id === 'maricha')
            this.hud.story(
              'Dying words',
              'With his last breath Maricha names the one who sent him: Tataka, in the swamp to the north-east.',
              8,
            );
          this.enter(this.step + 1);
        }
        break;
      case 'toRiver':
        if (near(POI.riverShrine.x, POI.riverShrine.z, 6)) {
          this.learn(
            'drishti',
            [POI.riverShrine.x + 5, POI.riverShrine.z],
            'Divya Drishti',
            'The river clears your eyes. Press E: what is real shines gold, what is maya burns away in violet.',
          );
          this.enter(this.step + 1);
        }
        break;
      case 'toTemple':
        if (near(GATE.x, GATE.z, 9)) {
          this.card(
            'temple',
            'The ruined temple',
            'These halls shift when no one is looking. Some walls are only maya: use Divya Drishti, or test them with an arrow.',
          );
          this.enter(this.step + 1);
        }
        break;
      case 'maze':
        if (near(POI.temple.x, POI.temple.z, 3)) {
          this.learn(
            'vayavya',
            [GATE.x, GATE.z - 6],
            'Vayavyastra',
            'The wind of Vayu answers. Hold Q to raise a cyclone that lifts your enemies and scatters poison. Press 1 or 2 to choose an astra.',
          );
          this.heart.visible = false;
          this.enter(this.step + 1);
        }
        break;
      case 'vimana':
        if (near(this.vimana.pos.x, this.vimana.pos.z, 8)) {
          this.card(
            'vimana',
            'The vimana',
            'A chariot of the gods, with lotus wings. Steer with the mouse or W A S D, hold Shift to boost, click to loose arrows. Fly through the gates of light; a storm stands between you and the swamp.',
          );
          this.enter(this.step + 1);
        }
        break;
      case 'toSwamp':
        if (near(POI.swamp.x, POI.swamp.z, BOSS.arenaRadius)) {
          this.respawnAt = [POI.swamp.x - 62, POI.swamp.z + 52];
          this.enter(this.step + 1);
        }
        break;
    }
  }

  private updateCamera(dt: number): void {
    const p = this.player;
    const cam = this.camera;
    this.aimBlend +=
      ((p.drawing || p.aiming || this.chantT > 0 ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 8);
    const dist = THREE.MathUtils.lerp(4.6, 2.3, this.aimBlend);
    const side = THREE.MathUtils.lerp(0.5, 0.8, this.aimBlend);
    cam.rotation.set(this.camPitch, this.camYaw, 0, 'YXZ');
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
    const eye = new THREE.Vector3(p.pos.x, p.pos.y + 1.62, p.pos.z);
    const want = eye.clone().addScaledVector(fwd, -dist).addScaledVector(right, side);
    // Pull the camera in if a wall is between it and Rama.
    let clear = 1;
    for (let i = 1; i <= 8; i++) {
      if (this.col.blocksView(eye.clone().lerp(want, i / 8))) {
        clear = (i - 1) / 8;
        break;
      }
    }
    cam.position.copy(eye).lerp(want, Math.max(0.12, clear));
    cam.position.y = Math.max(
      cam.position.y,
      this.col.groundAt(cam.position.x, cam.position.z) + 0.35,
    );
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.5;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.rotation.z = (Math.random() - 0.5) * s * 0.15;
    }
    const fov = THREE.MathUtils.lerp(p.speed > 7 ? 60 : 55, 43, this.aimBlend);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 8);
      cam.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------------- test hooks

  debug = {
    teleport: (x: number, z: number): void =>
      void this.player.pos.set(x, this.col.groundAt(x, z), z),
    look: (yaw: number, pitch: number): void => {
      this.camYaw = yaw;
      this.camPitch = pitch;
    },
    step: (id: string): void => {
      this.clearEnemies();
      this.known = new Set(['agneya', 'vayavya']);
      this.drishtiKnown = true;
      if (id === 'vimana')
        this.deerPos.set(
          DEER_ROUTE[DEER_ROUTE.length - 1]![0],
          0,
          DEER_ROUTE[DEER_ROUTE.length - 1]![1],
        );
      this.enter(stepIndex(id), true);
    },
    cast: (what: AstraId | 'drishti'): void =>
      what === 'drishti' ? this.castDrishti() : this.castAstra(what),
    shoot: (): void =>
      this.arrows.fire(
        this.player.bowPoint(new THREE.Vector3()),
        this.aimDir(new THREE.Vector3()),
        BOW.speedMax,
        BOW.damageMax,
        false,
      ),
    state: (): object => ({
      step: STEPS[this.step]!.id,
      health: this.player.health,
      enemies: this.enemies.filter((e) => e.alive).length,
      boss: this.boss ? { hp: this.boss.hp, phase: this.boss.phase } : null,
      pos: this.player.pos.toArray().map((v) => Math.round(v * 10) / 10),
      mayaOpen: this.mayaWalls.filter((w) => w.box.off).length,
    }),
    hurtBoss: (amount: number): void => this.boss?.hit(amount, false),
    autopilot: (): void => void (this.vimana.autopilot = true),
    /** Runs the game logic for a number of seconds without waiting for frames (used by tests). */
    simulate: (seconds: number): void => {
      for (let t = 0; t < seconds; t += 1 / 30) this.update(1 / 30, t);
    },
  };
}
