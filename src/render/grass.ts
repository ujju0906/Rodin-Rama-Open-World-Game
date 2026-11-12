import * as THREE from 'three';
import { fbm2, lerp, mulberry32 } from '../core/noise';
import { POI, WORLD } from '../data/world';
import { pathDistance, swampAmount, type Heightfield } from './heightfield';

function bladeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.075, 1, 1, 4);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - t * 0.9));
    pos.setZ(i, t * t * 0.18);
    colors.set([lerp(0.02, 0.16, t), lerp(0.05, 0.3, t), lerp(0.012, 0.05, t)], i * 3);
    nor.setXYZ(i, 0, 1, 0.25);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function grassMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 gRoot = instanceMatrix[3].xyz;
          float gBend = position.y * position.y;
          float gPhase = uTime * 1.6 + gRoot.x * 0.21 + gRoot.z * 0.17;
          float gGust = sin( uTime * 0.35 + gRoot.x * 0.03 - gRoot.z * 0.02 ) * 0.5 + 0.5;
          vec3 gWind = vec3( sin( gPhase ), 0.0, cos( gPhase * 0.8 ) ) * ( 0.10 + 0.22 * gGust ) + vec3( 0.16, 0.0, 0.06 ) * gGust;
          transformed += ( transpose( mat3( instanceMatrix ) ) * gWind ) * gBend;
        #endif`,
      );
  };
  return mat;
}

/**
 * Grass that follows the camera: the world is divided into cells and only the cells
 * around the camera hold blades. Cells are refilled a couple per frame as you move.
 */
export class Grass {
  readonly group = new THREE.Group();
  private readonly geo = bladeGeometry();
  private readonly mat: THREE.MeshStandardMaterial;
  private pool: { mesh: THREE.InstancedMesh; key: string }[] = [];
  private perCell = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(
    private readonly hf: Heightfield,
    time: { value: number },
  ) {
    this.mat = grassMaterial(time);
    this.group.name = 'grass';
  }

  build(density: number): void {
    for (const p of this.pool) {
      this.group.remove(p.mesh);
      p.mesh.dispose();
    }
    this.perCell = Math.floor(WORLD.grassPerCell * density);
    const side = WORLD.grassRadiusCells * 2 + 1;
    this.pool = [];
    for (let i = 0; i < side * side; i++) {
      const mesh = new THREE.InstancedMesh(this.geo, this.mat, this.perCell);
      mesh.count = 0;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.pool.push({ mesh, key: '' });
    }
  }

  private fill(mesh: THREE.InstancedMesh, cx: number, cz: number): void {
    const hf = this.hf;
    const size = WORLD.grassCell;
    const rand = mulberry32(((cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const d = this.dummy;
    let n = 0;
    for (let i = 0; i < this.perCell; i++) {
      const x = (cx + rand()) * size;
      const z = (cz + rand()) * size;
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      const sw = swampAmount(x, z);
      const h = hf.heightAt(x, z);
      if (h < WORLD.waterLevel + (sw > 0.3 ? -0.3 : 0.12)) continue;
      if (fbm2(x * 0.045 + 40, z * 0.045 + 40, 2) < 0.3 + r1 * 0.22) continue;
      if (pathDistance(x, z) < 2.4) continue;
      if (Math.hypot(x - POI.hermitage.x, z - POI.hermitage.z) < 19) continue;
      if (Math.hypot(x - POI.temple.x, z - POI.temple.z) < 34) continue;
      if (hf.slopeAt(x, z) > 0.2) continue;
      if (Math.hypot(x - POI.swamp.x, z - POI.swamp.z) < 40) continue; // keep the boss arena open
      const reed = sw > 0.3 ? 1.9 : 1;
      d.position.set(x, h - 0.03, z);
      d.rotation.set(0, r2 * 6.28, 0);
      d.scale.set((1 + r3 * 0.8) * (reed > 1 ? 1.2 : 1), (0.5 + r1 * 0.85) * reed, 1);
      d.updateMatrix();
      mesh.setMatrixAt(n, d.matrix);
      const t = (0.7 + r3 * 0.5) * (reed > 1 ? 0.6 : 1);
      mesh.setColorAt(n, this.color.setRGB(t * (1 + r2 * 0.25), t, t * 0.8));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(
        (cx + 0.5) * size,
        hf.heightAt((cx + 0.5) * size, (cz + 0.5) * size),
        (cz + 0.5) * size,
      ),
      size * 1.2,
    );
  }

  /** Call every frame; `budget` is how many cells may be refilled this frame. */
  update(camera: THREE.Vector3, budget = 2): void {
    const size = WORLD.grassCell;
    const r = WORLD.grassRadiusCells;
    const ccx = Math.floor(camera.x / size);
    const ccz = Math.floor(camera.z / size);
    const wanted = new Set<string>();
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) wanted.add(`${ccx + i},${ccz + j}`);
    const have = new Set(this.pool.map((p) => p.key));
    const free = this.pool.filter((p) => !wanted.has(p.key));
    for (const key of wanted) {
      if (have.has(key) || budget <= 0) continue;
      const slot = free.pop();
      if (!slot) break;
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      this.fill(slot.mesh, cx, cz);
      slot.key = key;
      budget--;
    }
  }
}
