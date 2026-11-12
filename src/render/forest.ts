import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2 } from '../core/noise';
import { POI, WORLD } from '../data/world';
import { swampAmount, type Heightfield } from './heightfield';
import type { GameTextures } from './textures';

type Rand = () => number;

/** A cloud of textured leaf cards with rounded ("spherical") normals for soft canopy lighting. */
function leafCards(
  rand: Rand,
  count: number,
  rx: number,
  ry: number,
  rz: number,
  cy: number,
  sMin: number,
  sMax: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    // Random point in the ellipsoid, biased towards the shell so the crown looks full.
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(rand() * 2 - 1);
    const rr = 0.45 + 0.55 * Math.cbrt(rand());
    c.set(
      Math.sin(ph) * Math.cos(th) * rx * rr,
      Math.cos(ph) * ry * rr + cy,
      Math.sin(ph) * Math.sin(th) * rz * rr,
    );
    q.setFromEuler(e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28));
    const s = (sMin + rand() * (sMax - sMin)) * 0.5;
    a.set(s, 0, 0).applyQuaternion(q);
    b.set(0, s, 0).applyQuaternion(q);
    const base = pos.length / 3;
    for (const [sa, sb, u, w] of [
      [-1, -1, 0, 0],
      [1, -1, 1, 0],
      [1, 1, 1, 1],
      [-1, 1, 0, 1],
    ] as const) {
      v.copy(c).addScaledVector(a, sa).addScaledVector(b, sb);
      pos.push(v.x, v.y, v.z);
      v.y -= cy - ry * 0.35;
      v.normalize();
      nor.push(v.x, v.y * 0.8 + 0.2, v.z);
      uv.push(u, w);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function limb(
  r0: number,
  r1: number,
  len: number,
  radial: number,
  x: number,
  y: number,
  z: number,
  tiltX: number,
  tiltZ: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  g.rotateX(tiltX);
  g.rotateZ(tiltZ);
  g.translate(x, y, z);
  return g;
}

/** Trunk with a flared, buttressed base, a slight lean and a few limbs. */
function trunk(
  rand: Rand,
  height: number,
  rBase: number,
  radial: number,
  limbs: number,
  roots: number,
  rootSpread: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rBase * 0.55, rBase, height, radial, 6, true);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const lean = (rand() - 0.5) * 0.8;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = y / height;
    const ang = Math.atan2(p.getZ(i), p.getX(i));
    const flare = Math.pow(Math.max(0, 1 - t / 0.18), 2) * (0.9 + 0.7 * Math.sin(ang * 5 + 1.3));
    const k = 1 + flare;
    p.setXYZ(
      i,
      p.getX(i) * k + Math.sin(t * 2.2) * lean,
      y,
      p.getZ(i) * k + Math.sin(t * 1.7 + 1) * lean * 0.6,
    );
    uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * (height / 5));
  }
  const parts: THREE.BufferGeometry[] = [g];
  for (let i = 0; i < limbs; i++) {
    const a = rand() * 6.28;
    const y = height * (0.62 + rand() * 0.3);
    parts.push(
      limb(
        rBase * 0.28,
        rBase * 0.1,
        height * (0.3 + rand() * 0.2),
        5,
        Math.sin((y / height) * 2.2) * lean,
        y,
        0,
        Math.cos(a) * 0.9,
        Math.sin(a) * 0.9,
      ),
    );
  }
  // Hanging aerial roots (banyan).
  for (let i = 0; i < roots; i++) {
    const a = rand() * 6.28;
    const r = rootSpread * (0.35 + rand() * 0.65);
    const len = height * (0.75 + rand() * 0.3);
    parts.push(
      limb(
        0.05 + rand() * 0.07,
        0.04,
        len,
        3,
        Math.cos(a) * r,
        height * 1.02 - len,
        Math.sin(a) * r,
        (rand() - 0.5) * 0.06,
        (rand() - 0.5) * 0.06,
      ),
    );
  }
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  return merged;
}

interface TreeType {
  trunk0: THREE.BufferGeometry;
  trunk1: THREE.BufferGeometry;
  canopy0: THREE.BufferGeometry;
  canopy1: THREE.BufferGeometry;
}

function makeTypes(): TreeType[] {
  const r = mulberry32(42);
  return [
    // Sal: tall, straight, high crown.
    {
      trunk0: trunk(r, 19, 0.55, 9, 4, 0, 0),
      trunk1: trunk(r, 19, 0.55, 5, 0, 0, 0),
      canopy0: leafCards(r, 54, 5.2, 4.6, 5.2, 19.5, 4.2, 6.4),
      canopy1: leafCards(r, 12, 4.6, 4.0, 4.6, 19.5, 8, 10.5),
    },
    // Banyan: massive, wide, with hanging roots.
    {
      trunk0: trunk(r, 11, 1.25, 12, 6, 16, 7.5),
      trunk1: trunk(r, 11, 1.25, 6, 0, 5, 7.5),
      canopy0: leafCards(r, 84, 10.5, 4.6, 10.5, 12.5, 4.6, 7),
      canopy1: leafCards(r, 16, 9.5, 4.0, 9.5, 12.5, 10, 13),
    },
    // Understory: short, bushy.
    {
      trunk0: trunk(r, 5, 0.22, 6, 2, 0, 0),
      trunk1: trunk(r, 5, 0.22, 4, 0, 0, 0),
      canopy0: leafCards(r, 20, 2.6, 2.0, 2.6, 5.4, 2.6, 3.8),
      canopy1: leafCards(r, 6, 2.3, 1.8, 2.3, 5.4, 4.6, 5.6),
    },
  ];
}

function fernGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const g = new THREE.PlaneGeometry(0.62, 1.5, 1, 3);
    g.translate(0, 0.75, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / 1.5;
      p.setZ(k, t * t * 0.55); // arch outwards
    }
    g.rotateX(0.55 + (i % 2) * 0.25);
    g.rotateY((i / fronds) * Math.PI * 2 + (i % 3) * 0.2);
    parts.push(g);
  }
  const m = mergeGeometries(parts)!;
  const n = m.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  return m;
}

/** Foliage material: alpha-tested cards, normals not flipped on back faces, gentle wind. */
function foliageMaterial(
  map: THREE.Texture,
  time: { value: number },
  sway: number,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.62,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 fRoot = instanceMatrix[3].xyz;
          float fPh = uTime * 1.1 + fRoot.x * 0.13 + fRoot.z * 0.11 + position.x * 0.6 + position.z * 0.5;
          float fAmt = ${sway.toFixed(3)} * ( 0.6 + 0.4 * sin( uTime * 0.31 + fRoot.x * 0.02 ) );
          transformed += vec3( sin( fPh ), sin( fPh * 1.3 ) * 0.4, cos( fPh * 0.9 ) ) * fAmt * smoothstep( 0.0, 3.0, position.y );
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'),
    );
  };
  return mat;
}

interface Chunk {
  cx: number;
  cz: number;
  near: THREE.Object3D[];
  far: THREE.Object3D[];
  ferns: THREE.Object3D | null;
}

export class Forest {
  readonly group = new THREE.Group();
  private chunks: Chunk[] = [];
  private readonly types = makeTypes();
  private readonly fernGeo = fernGeometry();
  private readonly trunkMat: THREE.MeshStandardMaterial;
  private readonly deadMat: THREE.MeshStandardMaterial;
  private readonly leafMat: THREE.MeshStandardMaterial;
  private readonly fernMat: THREE.MeshStandardMaterial;
  private readonly leafDepth: THREE.MeshDepthMaterial;
  treeCount = 0;
  fernCount = 0;
  /** Trunk positions in 10 m buckets, for character collision. */
  private trunks = new Map<number, { x: number; z: number; r: number }[]>();

  constructor(
    private readonly hf: Heightfield,
    tex: GameTextures,
    time: { value: number },
  ) {
    this.group.name = 'forest';
    this.trunkMat = new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 0.88 });
    this.deadMat = new THREE.MeshStandardMaterial({
      map: tex.bark,
      roughness: 0.95,
      color: 0x57504a,
    });
    this.leafMat = foliageMaterial(tex.leaves, time, 0.16);
    this.fernMat = foliageMaterial(tex.fern, time, 0.05);
    this.leafDepth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: tex.leaves,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    });
  }

  /** (Re)creates all instances for a density multiplier (from the quality preset). */
  build(density: number): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
    }
    this.chunks = [];
    this.trunks.clear();
    this.treeCount = this.fernCount = 0;
    const hf = this.hf;
    const half = WORLD.size / 2;
    const cs = WORLD.chunkSize;
    const per = Math.round(WORLD.size / cs);
    const treeKeep = Math.max(0.55, density);
    const fernKeep = density;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let cj = 0; cj < per; cj++) {
      for (let ci = 0; ci < per; ci++) {
        const x0 = -half + ci * cs;
        const z0 = -half + cj * cs;
        const rand = mulberry32(1000 + cj * 97 + ci);
        const mats: THREE.Matrix4[][] = [[], [], []];
        const tints: number[][] = [[], [], []];
        for (let z = z0; z < z0 + cs; z += WORLD.treeSpacing) {
          for (let x = x0; x < x0 + cs; x += WORLD.treeSpacing) {
            const px = x + rand() * WORLD.treeSpacing;
            const pz = z + rand() * WORLD.treeSpacing;
            const roll = rand();
            const pick = rand();
            const s = 0.78 + rand() * 0.62;
            const rot = rand() * 6.28;
            const tint = 0.72 + rand() * 0.5;
            if (roll > hf.forestDensity(px, pz) * 0.86 * treeKeep) continue;
            const type = pick < 0.07 ? 1 : pick < 0.45 ? 2 : 0;
            dummy.position.set(px, hf.heightAt(px, pz) - 0.35, pz);
            dummy.rotation.set(0, rot, 0);
            dummy.scale.set(s, s * (0.9 + pick * 0.25), s);
            dummy.updateMatrix();
            mats[type]!.push(dummy.matrix.clone());
            const key = Math.floor(px / 10) * 4096 + Math.floor(pz / 10);
            if (!this.trunks.has(key)) this.trunks.set(key, []);
            this.trunks
              .get(key)!
              .push({ x: px, z: pz, r: (type === 1 ? 1.5 : type === 2 ? 0.3 : 0.7) * s });
            tints[type]!.push(tint);
          }
        }
        const chunk: Chunk = { cx: x0 + cs / 2, cz: z0 + cs / 2, near: [], far: [], ferns: null };
        mats.forEach((list, t) => {
          if (!list.length) return;
          const type = this.types[t]!;
          const make = (
            geo: THREE.BufferGeometry,
            mat: THREE.Material,
            leaf: boolean,
            shadow: boolean,
          ): THREE.InstancedMesh => {
            const m = new THREE.InstancedMesh(geo, mat, list.length);
            list.forEach((mx, i) => {
              m.setMatrixAt(i, mx);
              if (leaf) {
                const k = tints[t]![i]!;
                m.setColorAt(i, color.setRGB(k * 1.05, k, k * 0.8));
              }
            });
            m.castShadow = shadow;
            m.receiveShadow = true;
            if (leaf && shadow) m.customDepthMaterial = this.leafDepth;
            m.computeBoundingSphere();
            this.group.add(m);
            return m;
          };
          chunk.near.push(
            make(type.trunk0, this.trunkMat, false, true),
            make(type.canopy0, this.leafMat, true, true),
          );
          chunk.far.push(
            make(type.trunk1, this.trunkMat, false, false),
            make(type.canopy1, this.leafMat, true, false),
          );
          this.treeCount += list.length;
        });

        // Ferns and undergrowth.
        const fernMats: THREE.Matrix4[] = [];
        const step = 3.1;
        for (let z = z0; z < z0 + cs; z += step) {
          for (let x = x0; x < x0 + cs; x += step) {
            const px = x + rand() * step;
            const pz = z + rand() * step;
            const roll = rand();
            const s = 0.6 + rand() * 1.1;
            if (
              roll >
              fernKeep * 0.42 * hf.forestDensity(px, pz) * (0.3 + noise2(px * 0.05, pz * 0.05))
            )
              continue;
            dummy.position.set(px, hf.heightAt(px, pz) - 0.05, pz);
            dummy.rotation.set(0, roll * 40, 0);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            fernMats.push(dummy.matrix.clone());
          }
        }
        if (fernMats.length) {
          const f = new THREE.InstancedMesh(this.fernGeo, this.fernMat, fernMats.length);
          fernMats.forEach((mx, i) => {
            f.setMatrixAt(i, mx);
            const k = 0.7 + ((i * 37) % 10) / 20;
            f.setColorAt(i, color.setRGB(k, k, k * 0.85));
          });
          f.receiveShadow = true;
          f.computeBoundingSphere();
          this.group.add(f);
          chunk.ferns = f;
          this.fernCount += fernMats.length;
        }
        this.chunks.push(chunk);
      }
    }

    // Dead trees standing in the swamp.
    const rand = mulberry32(555);
    const dead: THREE.Matrix4[] = [];
    for (let i = 0; i < 400 && dead.length < 70; i++) {
      const a = rand() * 6.28;
      const r = Math.sqrt(rand()) * (POI.swamp.r + 30);
      const x = POI.swamp.x + Math.cos(a) * r;
      const z = POI.swamp.z + Math.sin(a) * r;
      if (swampAmount(x, z) < 0.35 || r < 34) continue; // keep the middle clear for the arena
      const s = 0.5 + rand() * 0.6;
      dummy.position.set(x, hf.heightAt(x, z) - 0.5, z);
      dummy.rotation.set((rand() - 0.5) * 0.35, rand() * 6.28, (rand() - 0.5) * 0.35);
      dummy.scale.set(s, s * (0.5 + rand() * 0.5), s);
      dummy.updateMatrix();
      dead.push(dummy.matrix.clone());
    }
    const deadMesh = new THREE.InstancedMesh(this.types[0]!.trunk0, this.deadMat, dead.length);
    dead.forEach((mx, i) => deadMesh.setMatrixAt(i, mx));
    deadMesh.castShadow = deadMesh.receiveShadow = true;
    deadMesh.computeBoundingSphere();
    this.group.add(deadMesh);
  }

  /** Pushes a circle out of any tree trunk it overlaps. */
  pushOut(p: THREE.Vector3, r: number): void {
    const cx = Math.floor(p.x / 10);
    const cz = Math.floor(p.z / 10);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.trunks.get((cx + i) * 4096 + cz + j);
        if (!list) continue;
        for (const t of list) {
          const dx = p.x - t.x;
          const dz = p.z - t.z;
          const d = Math.hypot(dx, dz);
          if (d < t.r + r && d > 0.0001) {
            p.x += (dx / d) * (t.r + r - d);
            p.z += (dz / d) * (t.r + r - d);
          }
        }
      }
    }
  }

  /** Switches each chunk between detailed, simplified and hidden based on camera distance. */
  update(camera: THREE.Vector3): void {
    const pad = WORLD.chunkSize * 0.71;
    for (const c of this.chunks) {
      const d = Math.hypot(camera.x - c.cx, camera.z - c.cz) - pad;
      const near = d < WORLD.lod0Distance;
      const far = !near && d < WORLD.lod1Distance;
      for (const o of c.near) o.visible = near;
      for (const o of c.far) o.visible = far;
      if (c.ferns) c.ferns.visible = d < WORLD.fernDistance;
    }
  }
}
