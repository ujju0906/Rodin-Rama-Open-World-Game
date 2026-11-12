/** All gameplay numbers. Change values here; no code changes needed. */
export const PLAYER = {
  health: 100,
  walk: 2.2,
  run: 5.5,
  sprint: 8.5,
  jumpSpeed: 6.2,
  gravity: 16,
  dodgeDistance: 5,
  dodgeTime: 0.45,
  dodgeInvulnerable: 0.3,
  dodgeCooldown: 0.8,
  swimSpeed: 3,
  focusMax: 100,
  focusDrain: 50,
  focusRegen: 12,
  focusPerHeadshot: 15,
  radius: 0.45,
  height: 1.8,
} as const;

export const BOW = {
  drawTime: 1.2,
  speedMin: 35,
  speedMax: 90,
  damageMin: 12,
  damageMax: 40,
  headshot: 2,
  gravity: 9.8 * 0.6,
  spreadMin: 0.3,
  spreadMax: 4,
  focusTimeScale: 0.3,
  focusWindowAfterDodge: 0.5,
} as const;

export type AstraId = 'agneya' | 'vayavya' | 'varuna' | 'naga' | 'brahma';
export interface AstraDef {
  id: AstraId;
  name: string;
  deity: string;
  chant: number;
  cooldown: number;
  shape: 'cone' | 'cyclone' | 'wave' | 'bind' | 'blast';
  range: number;
  /** Cone half-angle in degrees, or radius in metres for area shapes. */
  size: number;
  damage: number;
  /** Damage per second and duration of the lingering effect. */
  dot: number;
  duration: number;
  color: [number, number, number];
  implemented: boolean;
}

export const ASTRAS: Record<AstraId, AstraDef> = {
  agneya: {
    id: 'agneya',
    name: 'Agneyastra',
    deity: 'Agni',
    chant: 1.5,
    cooldown: 25,
    shape: 'cone',
    range: 18,
    size: 25,
    damage: 60,
    dot: 8,
    duration: 5,
    color: [4, 1.4, 0.25],
    implemented: true,
  },
  vayavya: {
    id: 'vayavya',
    name: 'Vayavyastra',
    deity: 'Vayu',
    chant: 2.0,
    cooldown: 30,
    shape: 'cyclone',
    range: 16,
    size: 7,
    damage: 30,
    dot: 0,
    duration: 4,
    color: [0.8, 2.2, 2.4],
    implemented: true,
  },
  varuna: {
    id: 'varuna',
    name: 'Varunastra',
    deity: 'Varuna',
    chant: 2.0,
    cooldown: 35,
    shape: 'wave',
    range: 25,
    size: 6,
    damage: 45,
    dot: 0,
    duration: 3,
    color: [0.3, 1.2, 3],
    implemented: false,
  },
  naga: {
    id: 'naga',
    name: 'Nagastra',
    deity: 'Nagas',
    chant: 2.5,
    cooldown: 40,
    shape: 'bind',
    range: 20,
    size: 8,
    damage: 0,
    dot: 5,
    duration: 6,
    color: [0.4, 2.4, 0.6],
    implemented: false,
  },
  brahma: {
    id: 'brahma',
    name: 'Brahmastra',
    deity: 'Brahma',
    chant: 3.0,
    cooldown: 180,
    shape: 'blast',
    range: 40,
    size: 30,
    damage: 400,
    dot: 0,
    duration: 0,
    color: [5, 4, 2],
    implemented: false,
  },
};

export const DRISHTI = { radius: 40, cooldown: 8, expand: 1.2, reveal: 5 } as const;

export type EnemyKind = 'grunt' | 'archer' | 'clone' | 'maricha';
export interface EnemyDef {
  hp: number;
  damage: number;
  speed: number;
  scale: number;
  sight: number;
  attackRange: number;
  attackEvery: number;
  xp: number;
}
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: {
    hp: 60,
    damage: 15,
    speed: 4.5,
    scale: 1.15,
    sight: 28,
    attackRange: 2.2,
    attackEvery: 1.5,
    xp: 20,
  },
  archer: {
    hp: 40,
    damage: 12,
    speed: 3.5,
    scale: 1.0,
    sight: 34,
    attackRange: 24,
    attackEvery: 2.5,
    xp: 25,
  },
  clone: {
    hp: 1,
    damage: 10,
    speed: 5,
    scale: 1.15,
    sight: 30,
    attackRange: 2.2,
    attackEvery: 1.4,
    xp: 5,
  },
  maricha: {
    hp: 350,
    damage: 20,
    speed: 6,
    scale: 1.5,
    sight: 60,
    attackRange: 2.8,
    attackEvery: 1.3,
    xp: 150,
  },
};

/** Tataka. Health is lower than the design-doc draft (1200) so the fight lasts about 4 minutes. */
export const BOSS = {
  hp: 720,
  phase2At: 480,
  phase3At: 240,
  scale: 3.1,
  speed: 3.6,
  chargeSpeed: 20,
  chargeWindup: 1.1,
  chargeTime: 1.5,
  chargeDamage: 32,
  stunTime: 2.8,
  stunDamageBonus: 1.5,
  swipeDamage: 22,
  boulderDamage: 20,
  boulderEvery: 5,
  summonEvery: 16,
  poisonPerSecond: 3,
  poisonClearTime: 9,
  arenaRadius: 34,
} as const;
