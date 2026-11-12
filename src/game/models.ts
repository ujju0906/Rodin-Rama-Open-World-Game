import * as THREE from 'three';

/**
 * Procedural placeholder characters. Each is a small jointed figure that can be
 * animated in code; rigged GLB models can replace them later without touching gameplay.
 */
export interface Figure {
  root: THREE.Group;
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  head: THREE.Mesh;
  /** Materials that flash when the figure is hit or revealed. */
  skins: THREE.MeshStandardMaterial[];
  /** World-space height of the head centre for a figure of scale 1. */
  headY: number;
}

const std = (color: number, roughness = 0.7, metalness = 0): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  parent?: THREE.Object3D,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent?.add(m);
  return m;
}

interface HumanoidLook {
  skin: number;
  cloth: number;
  bulk: number;
  skirt: number; // length of the lower garment, 0 for none
}

function humanoid(look: HumanoidLook): Figure {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = std(look.skin, 0.62);
  const cloth = std(look.cloth, 0.85);
  const b = look.bulk;

  mesh(new THREE.CapsuleGeometry(0.17 * b, 0.36, 6, 12), skin, 0, 1.26, 0, body).scale.set(
    1.25,
    1,
    0.8,
  );
  mesh(new THREE.CylinderGeometry(0.2 * b, 0.23 * b, 0.26, 12), cloth, 0, 0.98, 0, body);
  if (look.skirt > 0) {
    mesh(
      new THREE.CylinderGeometry(0.21 * b, 0.27 * b, look.skirt, 12, 1, true),
      cloth,
      0,
      0.9 - look.skirt / 2,
      0,
      body,
    );
    (cloth as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  }
  mesh(new THREE.CylinderGeometry(0.06 * b, 0.07 * b, 0.1, 8), skin, 0, 1.56, 0, body);
  const head = mesh(new THREE.SphereGeometry(0.13 * b, 16, 12), skin, 0, 1.68, 0, body);
  head.scale.set(0.92, 1.08, 1);

  const limb = (x: number, y: number, len: number, r: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    mesh(new THREE.CapsuleGeometry(r, len - r * 2, 4, 8), skin, 0, -len / 2, 0, g);
    body.add(g);
    return g;
  };
  const armL = limb(0.27 * b, 1.46, 0.62, 0.055 * b);
  const armR = limb(-0.27 * b, 1.46, 0.62, 0.055 * b);
  const legL = limb(0.11 * b, 0.94, 0.94, 0.075 * b);
  const legR = limb(-0.11 * b, 0.94, 0.94, 0.075 * b);
  return { root, body, armL, armR, legL, legR, head, skins: [skin], headY: 1.68 };
}

export interface RamaFigure extends Figure {
  bow: THREE.Group;
  string: THREE.Mesh;
  nocked: THREE.Mesh;
}

/** Rama in exile: dusky blue skin, saffron garments, topknot, quiver and the bow Kodanda. */
export function createRama(): RamaFigure {
  const f = humanoid({ skin: 0x3b5d86, cloth: 0xd9781e, bulk: 1, skirt: 0.5 });
  const hair = std(0x0c0a0a, 0.5);
  const gold = std(0xd9a441, 0.3, 1);
  const wood = std(0x5a3a1e, 0.6);
  mesh(new THREE.SphereGeometry(0.14, 14, 10, 0, 6.3, 0, 1.75), hair, 0, 1.7, -0.015, f.body);
  mesh(new THREE.SphereGeometry(0.07, 10, 8), hair, 0, 1.87, -0.02, f.body);
  mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), gold, 0, 1.82, -0.02, f.body).rotation.x =
    Math.PI / 2;
  // Sash across the chest and a bark-cloth wrap.
  const sash = mesh(
    new THREE.BoxGeometry(0.09, 0.66, 0.34),
    std(0xe9a23b, 0.85),
    0,
    1.28,
    0,
    f.body,
  );
  sash.rotation.z = 0.72;
  sash.scale.z = 1.05;
  mesh(
    new THREE.TorusGeometry(0.2, 0.03, 6, 16),
    std(0x6d4a2a, 0.9),
    0,
    1.06,
    0,
    f.body,
  ).rotation.x = Math.PI / 2;
  for (const arm of [f.armL, f.armR])
    mesh(new THREE.TorusGeometry(0.062, 0.014, 6, 12), gold, 0, -0.14, 0, arm).rotation.x =
      Math.PI / 2;
  // Quiver.
  const quiver = mesh(
    new THREE.CylinderGeometry(0.06, 0.05, 0.6, 8),
    wood,
    -0.1,
    1.32,
    -0.2,
    f.body,
  );
  quiver.rotation.z = -0.35;
  for (let i = 0; i < 4; i++)
    mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4),
      gold,
      -0.02 + i * 0.02,
      0.38,
      (i % 2) * 0.02,
      quiver,
    );

  // Kodanda, held in the left hand.
  const bow = new THREE.Group();
  const arc = mesh(new THREE.TorusGeometry(0.72, 0.022, 6, 28, Math.PI * 0.86), gold, 0, 0, 0, bow);
  arc.rotation.z = -Math.PI * 0.43;
  const string = mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 1.38, 4),
    std(0xf4e6c8, 0.4),
    -0.3,
    0,
    0,
    bow,
  );
  const nocked = mesh(
    new THREE.CylinderGeometry(0.009, 0.009, 0.95, 5),
    new THREE.MeshStandardMaterial({
      color: 0xf4d58a,
      emissive: new THREE.Color(1.6, 0.9, 0.25),
      roughness: 0.4,
    }),
    0.1,
    0,
    0,
    bow,
  );
  nocked.rotation.z = Math.PI / 2;
  nocked.visible = false;
  bow.position.set(0, -0.6, 0.05);
  bow.rotation.set(0, Math.PI / 2, 0);
  f.armL.add(bow);
  return { ...f, bow, string, nocked };
}

export function createRakshasa(kind: 'grunt' | 'archer' | 'maricha'): Figure {
  const f = humanoid({
    skin: kind === 'maricha' ? 0x3a2416 : 0x241a20,
    cloth: kind === 'maricha' ? 0x8a6a1e : 0x5a1616,
    bulk: 1.3,
    skirt: 0.34,
  });
  const bone = std(0xc9bfa5, 0.6);
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.5, 0.1), fog: false });
  for (const s of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.045, 0.3, 7), bone, s * 0.1, 1.86, 0, f.body);
    horn.rotation.z = -s * 0.5;
    mesh(new THREE.SphereGeometry(0.024, 6, 6), eye, s * 0.055, 1.71, 0.135, f.body);
    mesh(new THREE.ConeGeometry(0.02, 0.08, 5), bone, s * 0.05, 1.6, 0.14, f.body);
  }
  if (kind === 'archer') {
    const arc = mesh(
      new THREE.TorusGeometry(0.55, 0.02, 5, 18, Math.PI * 0.86),
      std(0x2c1b12, 0.6),
      0,
      -0.6,
      0.05,
      f.armL,
    );
    arc.rotation.set(0, Math.PI / 2, -Math.PI * 0.43);
  } else {
    const club = mesh(
      new THREE.CylinderGeometry(0.09, 0.04, 0.95, 8),
      std(0x2c1b12, 0.8),
      0,
      -0.75,
      0.2,
      f.armR,
    );
    club.rotation.x = Math.PI / 2.4;
  }
  return f;
}

/** Tataka: a towering rakshasi with wild hair, tusks, bronze plates and vermilion markings. */
export function createTataka(): Figure {
  const f = humanoid({ skin: 0x4b4a4c, cloth: 0x1c1418, bulk: 1.45, skirt: 0.78 });
  const mark = new THREE.MeshStandardMaterial({
    color: 0x7a1408,
    emissive: new THREE.Color(2.4, 0.35, 0.08),
    roughness: 0.6,
  });
  const bronze = std(0x9c6a2c, 0.35, 1);
  const hair = std(0x15100e, 0.9);
  const bone = std(0xd6ccb2, 0.5);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const lock = mesh(
      new THREE.ConeGeometry(0.07, 0.55 + (i % 3) * 0.15, 6),
      hair,
      Math.cos(a) * 0.15,
      1.72,
      Math.sin(a) * 0.15 - 0.03,
      f.body,
    );
    lock.rotation.set(Math.sin(a) * 1.9 + Math.PI, 0, -Math.cos(a) * 1.9);
  }
  for (const s of [-1, 1]) {
    mesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.8, 0.1), fog: false }),
      s * 0.065,
      1.72,
      0.17,
      f.body,
    );
    mesh(new THREE.ConeGeometry(0.028, 0.16, 6), bone, s * 0.07, 1.6, 0.17, f.body).rotation.x =
      Math.PI;
    mesh(new THREE.SphereGeometry(0.19, 10, 8, 0, 6.3, 0, 1.6), bronze, s * 0.36, 1.5, 0, f.body);
    mesh(
      new THREE.TorusGeometry(0.085, 0.022, 6, 12),
      bronze,
      0,
      -0.3,
      0,
      s > 0 ? f.armL : f.armR,
    ).rotation.x = Math.PI / 2;
  }
  mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20), mark, 0, 1.3, 0, f.body).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 20), mark, 0, 1.12, 0, f.body).rotation.x =
    Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.34, 0.045, 6, 20), bronze, 0, 0.98, 0, f.body).rotation.x =
    Math.PI / 2;
  return f;
}

export function createDeer(): {
  root: THREE.Group;
  material: THREE.MeshStandardMaterial;
  legs: THREE.Group[];
} {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xf2b53a,
    metalness: 1,
    roughness: 0.22,
    emissive: new THREE.Color(0.9, 0.5, 0.08),
  });
  mesh(new THREE.CapsuleGeometry(0.24, 0.62, 6, 12), material, 0, 0.92, 0, root).rotation.x =
    Math.PI / 2;
  const neck = mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), material, 0, 1.25, 0.5, root);
  neck.rotation.x = 0.5;
  mesh(new THREE.SphereGeometry(0.12, 12, 10), material, 0, 1.52, 0.66, root).scale.set(
    0.85,
    0.9,
    1.35,
  );
  for (const s of [-1, 1]) {
    const antler = mesh(new THREE.ConeGeometry(0.02, 0.42, 5), material, s * 0.07, 1.78, 0.6, root);
    antler.rotation.z = -s * 0.4;
    mesh(new THREE.ConeGeometry(0.014, 0.18, 5), material, s * 0.15, 1.82, 0.6, root).rotation.z =
      -s * 1.1;
  }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [0.13, 0.33],
    [-0.13, 0.33],
    [0.13, -0.33],
    [-0.13, -0.33],
  ] as const) {
    const g = new THREE.Group();
    g.position.set(x, 0.8, z);
    mesh(new THREE.CylinderGeometry(0.04, 0.025, 0.8, 6), material, 0, -0.4, 0, g);
    root.add(g);
    legs.push(g);
  }
  return { root, material, legs };
}

export function createTarget(): THREE.Group {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 8), std(0x4a3320, 0.9), 0, 0.85, 0, g);
  const rings = [0xd8c69a, 0xb5371c, 0xd8c69a, 0xd9a441];
  rings.forEach((c, i) => {
    const disc = mesh(
      new THREE.CylinderGeometry(0.55 - i * 0.13, 0.55 - i * 0.13, 0.08 + i * 0.012, 24),
      std(c, 0.9),
      0,
      1.6,
      0,
      g,
    );
    disc.rotation.x = Math.PI / 2;
  });
  return g;
}
