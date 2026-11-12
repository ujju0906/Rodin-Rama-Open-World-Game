import * as THREE from 'three';
import type { Rig } from './rig';

export interface BodySpec {
  /** Cache key: one preparation per model, shared by every character that uses it. */
  key: string;
  /** Packed mesh (see scripts/prep-model.py). */
  data: string;
  /** Texture file prefix in public/art (`<tex>_diffuse.jpg`, `_normal.jpg`, `_orm.jpg`); omit for a mesh with baked vertex colours. */
  tex?: string;
  /** Height of the top of the skull in the model's own units (below any topknot or crown). */
  skullTop: number;
  /** Arm directions of the statue's pose: [upper arm, forearm] for the right and left arm. */
  arms: { right: [THREE.Vector3, THREE.Vector3]; left: [THREE.Vector3, THREE.Vector3] };
  /** Leg directions (thigh and shin share one) when the statue stands with its feet apart. */
  legs?: { right: THREE.Vector3; left: THREE.Vector3 };
  /** Cloth closer to the centre line than this never follows the arms. */
  torsoHalfWidth: number;
}

const cache = new Map<
  string,
  { geo: THREE.BufferGeometry; inverses: THREE.Matrix4[]; mat: THREE.MeshStandardMaterial }
>();

/**
 * A character body made from a Rodin (Hyper3D) model: the Rodin (Hyper3D) model generated from the concept art.
 * The model arrives as a static statue, so it is skinned here at load time:
 * the animated skeleton is posed like the statue, and every statue vertex takes the
 * bone weights of the nearest vertices on the reference body.
 */
function decode(meshData: string, colors: boolean): THREE.BufferGeometry {
  const bytes = Uint8Array.from(atob(meshData), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const n = view.getUint32(0, true);
  const f = view.getUint32(4, true);
  const min = [8, 12, 16].map((o) => view.getFloat32(o, true));
  const max = [20, 24, 28].map((o) => view.getFloat32(o, true));
  let o = 32;
  const q = new Uint16Array(bytes.buffer, o, n * 3);
  o += n * 6;
  const uvq = new Uint16Array(bytes.buffer, o, n * 2);
  o += n * 4;
  const nq = new Int8Array(bytes.buffer, o, n * 3);
  o += n * 3;
  o += (4 - (o % 4)) % 4;
  const index = new Uint32Array(bytes.buffer, o, f * 3);
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) {
    pos[i] = min[i % 3]! + (q[i]! / 65535) * (max[i % 3]! - min[i % 3]!);
    nor[i] = nq[i]! / 127;
  }
  for (let i = 0; i < n * 2; i++) uv[i] = uvq[i]! / 65535;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (colors) {
    // The same four bytes per vertex hold an sRGB colour instead of texture coordinates.
    const cb = new Uint8Array(bytes.buffer, 32 + n * 6, n * 4);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 3; k++) col[i * 3 + k] = Math.pow(cb[i * 4 + k]! / 255, 2.2);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  } else g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(index.slice(), 1));
  return g;
}

function material(tex: string): THREE.MeshStandardMaterial {
  const load = (name: string, srgb: boolean): THREE.Texture => {
    const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/${name}.jpg`);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const orm = load(`${tex}_orm`, false);
  return new THREE.MeshStandardMaterial({
    map: load(`${tex}_diffuse`, true),
    normalMap: load(`${tex}_normal`, false),
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
  });
}

/** Skins the statue to `rig` and returns this character's own material (for hit flashes and tints). */
export function attachBody(rig: Rig, spec: BodySpec): THREE.MeshStandardMaterial {
  const scene = rig.scene;
  const sources: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => o instanceof THREE.SkinnedMesh && sources.push(o));
  const bones = sources[0]!.skeleton.bones;
  for (const m of sources) m.visible = false;

  let prepared = cache.get(spec.key);
  if (!prepared) {
    const geo = prepare(rig, spec, sources, bones);
    const inverses = bones.map((b) => b.matrixWorld.clone().invert());
    prepared = {
      geo,
      inverses,
      mat: spec.tex
        ? material(spec.tex)
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.1 }),
    };
    cache.set(spec.key, prepared);
  }
  // Bind with the statue pose's bone transforms as the bind pose (the same for every instance).
  const mat = prepared.mat.clone();
  const mesh = new THREE.SkinnedMesh(prepared.geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  mesh.bind(
    new THREE.Skeleton(
      bones,
      prepared.inverses.map((m) => m.clone()),
    ),
    new THREE.Matrix4(),
  );
  return mat;
}

function prepare(
  rig: Rig,
  spec: BodySpec,
  sources: THREE.SkinnedMesh[],
  bones: THREE.Bone[],
): THREE.BufferGeometry {
  const geo = decode(spec.data, !spec.tex);
  const scene = rig.scene;

  // 1. Pose the skeleton like the statue: standing, arms down and a little out.
  rig.update(0, 0, 0);
  rig.point('RightArm', 'RightForeArm', spec.arms.right[0], 1);
  rig.point('RightForeArm', 'RightHand', spec.arms.right[1], 1);
  rig.point('LeftArm', 'LeftForeArm', spec.arms.left[0], 1);
  rig.point('LeftForeArm', 'LeftHand', spec.arms.left[1], 1);
  if (spec.legs) {
    rig.point('RightUpLeg', 'RightLeg', spec.legs.right, 1);
    rig.point('RightLeg', 'RightFoot', spec.legs.right, 1);
    rig.point('LeftUpLeg', 'LeftLeg', spec.legs.left, 1);
    rig.point('LeftLeg', 'LeftFoot', spec.legs.left, 1);
  }
  scene.updateMatrixWorld(true);

  // 2. Collect the reference body's vertices in that pose, with their bone weights.
  const boneIndex = new Map(bones.map((b, i) => [b, i]));
  const ref: { p: THREE.Vector3; idx: number[]; w: number[] }[] = [];
  for (const m of sources) {
    m.skeleton.update();
    const pa = m.geometry.attributes.position as THREE.BufferAttribute;
    const si = m.geometry.attributes.skinIndex as THREE.BufferAttribute;
    const sw = m.geometry.attributes.skinWeight as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i += 2) {
      const p = new THREE.Vector3().fromBufferAttribute(pa, i);
      m.applyBoneTransform(i, p);
      p.applyMatrix4(m.matrixWorld);
      const idx: number[] = [];
      const w: number[] = [];
      for (let k = 0; k < 4; k++) {
        const weight = sw.getComponent(i, k);
        if (weight <= 0) continue;
        idx.push(boneIndex.get(m.skeleton.bones[si.getComponent(i, k)]!)!);
        w.push(weight);
      }
      ref.push({ p, idx, w });
    }
  }

  // 3. Scale and centre the statue on the skeleton (skull top to skull top, head over head).
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const headTop = rig.worldPos('HeadTop_End', new THREE.Vector3());
  const scale = headTop.y / spec.skullTop;
  let hx = 0;
  let hz = 0;
  let hn = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > spec.skullTop - 0.17 && pos.getY(i) < spec.skullTop - 0.01) {
      hx += pos.getX(i);
      hz += pos.getZ(i);
      hn++;
    }
  }
  const ox = headTop.x - (hx / hn) * scale;
  const oz = headTop.z - (hz / hn) * scale - 0.01;
  for (let i = 0; i < pos.count; i++)
    pos.setXYZ(i, pos.getX(i) * scale + ox, pos.getY(i) * scale, pos.getZ(i) * scale + oz);

  // 4. Nearest-neighbour weight transfer through a spatial grid.
  const CELL = 0.05;
  const grid = new Map<number, number[]>();
  const keyOf = (x: number, y: number, z: number): number =>
    (Math.floor(x / CELL) + 512) * 1048576 +
    (Math.floor(y / CELL) + 512) * 1024 +
    Math.floor(z / CELL) +
    512;
  ref.forEach((r, i) => {
    const k = keyOf(r.p.x, r.p.y, r.p.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(i);
  });
  const armBones = bones
    .map((b, i) => (/(Arm|ForeArm|Hand)/.test(b.name) ? i : -1))
    .filter((i) => i >= 0);
  const chest = bones.findIndex((b) => b.name.endsWith('Spine2'));
  const skinIndex = new Uint16Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  const acc = new Map<number, number>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const near: [number, number][] = []; // [distance squared, ref index]
    for (let reach = 1; reach <= 6 && near.length < 3; reach++) {
      near.length = 0;
      for (let dx = -reach; dx <= reach; dx++)
        for (let dy = -reach; dy <= reach; dy++)
          for (let dz = -reach; dz <= reach; dz++) {
            const list = grid.get(keyOf(x + dx * CELL, y + dy * CELL, z + dz * CELL));
            if (!list) continue;
            for (const j of list) {
              const p = ref[j]!.p;
              near.push([(p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2, j]);
            }
          }
    }
    near.sort((a, b) => a[0] - b[0]);
    acc.clear();
    for (const [d2, j] of near.slice(0, 4)) {
      const r = ref[j]!;
      const k = 1 / (d2 + 0.0004);
      r.idx.forEach((b, n) => acc.set(b, (acc.get(b) ?? 0) + r.w[n]! * k));
    }
    // Cloth that hangs in front of or behind the torso must not follow the arms, or it fans out when the bow is raised.
    if (Math.abs(x - ox) < spec.torsoHalfWidth) {
      let moved = 0;
      for (const b of armBones) {
        moved += acc.get(b) ?? 0;
        acc.delete(b);
      }
      if (moved > 0) acc.set(chest, (acc.get(chest) ?? 0) + moved);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([b, w], n) => {
      skinIndex[i * 4 + n] = b;
      skinWeight[i * 4 + n] = w / sum;
    });
    if (!top.length) skinWeight[i * 4] = 1; // far from everything: follow the hips (bone 0)
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

  return geo;
}
