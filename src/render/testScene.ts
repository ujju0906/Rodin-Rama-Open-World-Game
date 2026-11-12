import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm2, lerp, mulberry32, noise2, smoothstep } from '../core/noise';
import type { SkyState } from './sky';

/**
 * Phase 1 test scene: a misty forest clearing with a small lamp shrine.
 * Everything is procedural. Phase 2 replaces this with the real Dandaka Forest.
 */

const TERRAIN_SIZE = 640;
const TERRAIN_SEGMENTS = 220;

export function heightAt(x: number, z: number): number {
  const big = (fbm2(x * 0.0055 + 11.3, z * 0.0055 - 4.7, 5) - 0.5) * 46;
  const small = (fbm2(x * 0.035, z * 0.035, 3) - 0.5) * 3.2;
  const r = Math.hypot(x, z);
  return lerp(0, big + small, smoothstep(16, 75, r));
}

function buildTerrain(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const moss = [0.055, 0.105, 0.03];
  const grass = [0.09, 0.15, 0.035];
  const mud = [0.115, 0.075, 0.045];
  const rock = [0.17, 0.165, 0.15];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const slope = 1 - nor.getY(i);
    const n = fbm2(x * 0.05 + 40, z * 0.05 + 40, 3);
    const path = 1 - smoothstep(0.0, 0.07, Math.abs(noise2(x * 0.012 + 3, z * 0.012 + 9) - 0.5));
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let v = lerp(moss[k]!, grass[k]!, smoothstep(0.35, 0.65, n));
      v = lerp(v, mud[k]!, Math.max(path * 0.85, smoothstep(0.55, 0.3, n) * 0.5));
      v = lerp(v, rock[k]!, smoothstep(0.1, 0.28, slope));
      c[k] = v * (0.8 + 0.4 * noise2(x * 0.7, z * 0.7));
    }
    colors.set(c, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function buildShrine(): { group: THREE.Group; flame: THREE.Mesh; lamp: THREE.PointLight } {
  const group = new THREE.Group();
  group.name = 'shrine';
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.86 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x5e4a36, roughness: 0.9 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb8823a, roughness: 0.32, metalness: 1 });
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Stepped base.
  add(new THREE.BoxGeometry(9, 0.5, 9), stoneDark, 0, 0.25, 0);
  add(new THREE.BoxGeometry(7.4, 0.45, 7.4), stone, 0, 0.72, 0);
  add(new THREE.BoxGeometry(6, 0.4, 6), stone, 0, 1.15, 0);

  // Four carved pillars.
  const shaft = new THREE.CylinderGeometry(0.3, 0.36, 3.4, 12);
  const band = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 12);
  const cap = new THREE.BoxGeometry(0.95, 0.3, 0.95);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const x = sx * 2.2;
    const z = sz * 2.2;
    add(cap, stoneDark, x, 1.5, z);
    add(shaft, stone, x, 3.3, z);
    add(band, bronze, x, 2.3, z);
    add(band, bronze, x, 4.3, z);
    add(cap, stoneDark, x, 5.15, z);
  }

  // Roof: a stepped shikhara tower.
  let y = 5.5;
  let w = 6.2;
  for (let i = 0; i < 7; i++) {
    const h = i === 0 ? 0.4 : 0.55;
    add(new THREE.BoxGeometry(w, h, w), i % 2 ? stone : stoneDark, 0, y + h / 2, 0);
    y += h;
    w *= 0.78;
  }
  add(new THREE.SphereGeometry(0.42, 16, 12), bronze, 0, y + 0.35, 0).scale.set(1, 0.7, 1);
  add(new THREE.ConeGeometry(0.14, 0.9, 10), bronze, 0, y + 1.0, 0);

  // Lamp: bronze stand, bowl and flame.
  add(new THREE.CylinderGeometry(0.14, 0.4, 1.1, 14), bronze, 0, 1.9, 0);
  add(new THREE.CylinderGeometry(0.62, 0.2, 0.3, 20), bronze, 0, 2.6, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 2.6, 0.5), fog: false });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), flameMat);
  flame.position.set(0, 2.98, 0);
  flame.scale.set(1, 1.9, 1);
  group.add(flame);
  const lamp = new THREE.PointLight(0xff9a3c, 60, 26, 1.8);
  lamp.position.set(0, 3.1, 0);
  group.add(lamp);

  group.position.y = heightAt(0, 0);
  return { group, flame, lamp };
}

/** Wind sway for instanced grass, injected into the standard material. */
function grassMaterial(time: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
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

function bladeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.075, 1, 1, 4);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - t * 0.9));
    pos.setZ(i, t * t * 0.18);
    colors.set([lerp(0.02, 0.2, t), lerp(0.05, 0.34, t), lerp(0.012, 0.06, t)], i * 3);
    nor.setXYZ(i, 0, 1, 0.25);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function canopyGeometry(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs = [
    [0, 0, 0, 3.4],
    [2.2, -0.6, 0.6, 2.4],
    [-1.9, -0.4, 1.2, 2.5],
    [0.4, -0.7, -2.1, 2.3],
    [-0.6, 1.5, -0.3, 2.2],
  ] as const;
  for (const [bx, by, bz, br] of blobs) {
    const g = new THREE.IcosahedronGeometry(br, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const seed = rand() * 100;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const d = 0.72 + 0.56 * fbm2(x * 0.9 + seed + y * 0.6, z * 0.9 - seed + y * 0.4, 3);
      p.setXYZ(i, x * d + bx, y * d * 0.72 + by, z * d + bz);
    }
    parts.push(g);
  }
  const raw = mergeGeometries(parts)!;
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const merged = mergeVertices(raw, 0.01); // weld so normals are smooth, not faceted
  merged.computeVertexNormals();
  const p = merged.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = smoothstep(-2.2, 3.2, p.getY(i));
    const n = 0.75 + 0.5 * noise2(p.getX(i) * 1.7, p.getZ(i) * 1.7);
    colors.set(
      [lerp(0.012, 0.085, t) * n, lerp(0.035, 0.17, t) * n, lerp(0.015, 0.035, t) * n],
      i * 3,
    );
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

function rockGeometry(): THREE.BufferGeometry {
  const rawRock = new THREE.IcosahedronGeometry(1, 3);
  rawRock.deleteAttribute('normal');
  rawRock.deleteAttribute('uv');
  const g = mergeVertices(rawRock, 0.001);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = 0.7 + 0.6 * fbm2(x * 1.3 + y, z * 1.3 - y, 4);
    p.setXYZ(i, x * d, y * d * 0.7, z * d);
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const top = smoothstep(0.35, 0.8, nor.getY(i));
    colors.set([lerp(0.2, 0.07, top), lerp(0.19, 0.14, top), lerp(0.17, 0.04, top)], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const emberVertex = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime * ( 0.25 + aSeed.x * 0.35 ) + aSeed.y * 40.0;
  p.y += mod( t * 1.6, 14.0 );
  p.x += sin( t * 1.3 + aSeed.z * 6.28 ) * 1.4;
  p.z += cos( t * 1.1 + aSeed.w * 6.28 ) * 1.4;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  float life = mod( t * 1.6, 14.0 ) / 14.0;
  vAlpha = smoothstep( 0.0, 0.12, life ) * ( 1.0 - smoothstep( 0.7, 1.0, life ) ) * ( 0.5 + 0.5 * sin( t * 5.0 + aSeed.z * 30.0 ) );
  gl_PointSize = ( 2.0 + aSeed.w * 4.0 ) * uPixelRatio * ( 26.0 / max( -mv.z, 1.0 ) );
}`;

const emberFragment = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length( gl_PointCoord - 0.5 );
  float a = smoothstep( 0.5, 0.0, d );
  gl_FragColor = vec4( uColor * a * a * vAlpha, 1.0 );
}`;

export interface TestScene {
  focus: THREE.Vector3;
  update(dt: number, elapsed: number, sky: SkyState): void;
  rebuildScatter(density: number, pixelRatio: number): void;
}

export function buildTestScene(scene: THREE.Scene): TestScene {
  scene.add(buildTerrain());
  const shrine = buildShrine();
  scene.add(shrine.group);

  const time = { value: 0 };
  const grassMat = grassMaterial(time);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.95 });
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const emberMat = new THREE.ShaderMaterial({
    vertexShader: emberVertex,
    fragmentShader: emberFragment,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
    uniforms: {
      uTime: time,
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(3, 1.4, 0.35) },
    },
  });

  const bladeGeo = bladeGeometry();
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.62, 10, 9, 4);
  trunkGeo.translate(0, 5, 0);
  const canopyGeo = canopyGeometry(mulberry32(7));
  canopyGeo.translate(0, 11, 0);
  const rockGeo = rockGeometry();

  const scatter = new THREE.Group();
  scatter.name = 'scatter';
  scene.add(scatter);
  const dummy = new THREE.Object3D();

  function rebuildScatter(density: number, pixelRatio: number): void {
    for (const child of [...scatter.children]) {
      scatter.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
      if (child instanceof THREE.Points) child.geometry.dispose();
    }
    const rand = mulberry32(1234);

    // Grass.
    const grassCount = Math.floor(120000 * density);
    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
    let placed = 0;
    for (let tries = 0; placed < grassCount && tries < grassCount * 6; tries++) {
      const r = 6.5 + Math.sqrt(rand()) * 95;
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (fbm2(x * 0.06 + 40, z * 0.06 + 40, 2) < 0.34 + rand() * 0.2) continue;
      dummy.position.set(x, heightAt(x, z) - 0.03, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const s = 0.55 + rand() * 0.9;
      dummy.scale.set(1 + rand() * 0.8, s, 1);
      dummy.updateMatrix();
      grass.setMatrixAt(placed, dummy.matrix);
      const tint = 0.75 + rand() * 0.5;
      grass.setColorAt(placed, new THREE.Color(tint * (1 + rand() * 0.25), tint, tint * 0.8));
      placed++;
    }
    grass.count = placed;
    grass.receiveShadow = true;
    grass.frustumCulled = false;
    scatter.add(grass);

    // Trees: trunk and canopy share instance transforms.
    const treeCount = Math.floor(520 * density) + 40;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    placed = 0;
    for (let tries = 0; placed < treeCount && tries < treeCount * 10; tries++) {
      const r = 24 + Math.sqrt(rand()) * 280;
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (fbm2(x * 0.018 + 5, z * 0.018 + 5, 3) < 0.4 && r > 40) continue;
      const s = 0.85 + rand() * 1.25;
      dummy.position.set(x, heightAt(x, z) - 0.4, z);
      dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
      dummy.scale.set(s, s * (0.9 + rand() * 0.5), s);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      canopies.setMatrixAt(placed, dummy.matrix);
      const tint = 0.7 + rand() * 0.6;
      canopies.setColorAt(placed, new THREE.Color(tint * (0.9 + rand() * 0.35), tint, tint * 0.85));
      placed++;
    }
    trunks.count = canopies.count = placed;
    trunks.castShadow = canopies.castShadow = true;
    canopies.receiveShadow = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    scatter.add(trunks, canopies);

    // Rocks.
    const rockCount = Math.floor(160 * density) + 20;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    for (let i = 0; i < rockCount; i++) {
      const r = 7 + Math.sqrt(rand()) * 150;
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.3 + rand() * rand() * 2.6;
      dummy.position.set(x, heightAt(x, z) + s * 0.15, z);
      dummy.rotation.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6);
      dummy.scale.set(s * (0.8 + rand() * 0.7), s * (0.6 + rand() * 0.6), s * (0.8 + rand() * 0.7));
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.computeBoundingSphere();
    scatter.add(rocks);

    // Embers by day, fireflies by night.
    const emberCount = Math.floor(900 * density) + 150;
    const positions = new Float32Array(emberCount * 3);
    const seeds = new Float32Array(emberCount * 4);
    for (let i = 0; i < emberCount; i++) {
      const r = Math.sqrt(rand()) * 55;
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      positions.set([x, heightAt(x, z) + 0.2, z], i * 3);
      seeds.set([rand(), rand(), rand(), rand()], i * 4);
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const embers = new THREE.Points(emberGeo, emberMat);
    embers.frustumCulled = false;
    emberMat.uniforms.uPixelRatio!.value = pixelRatio;
    scatter.add(embers);
  }

  const emberDay = new THREE.Color(3.2, 1.5, 0.35);
  const emberNight = new THREE.Color(0.9, 2.6, 1.1);

  return {
    focus: new THREE.Vector3(0, heightAt(0, 0) + 3.4, 0),
    rebuildScatter,
    update(_dt, elapsed, sky) {
      time.value = elapsed;
      const flicker = 0.85 + 0.15 * Math.sin(elapsed * 17) * Math.sin(elapsed * 7.3 + 1.2);
      shrine.lamp.intensity = lerp(22, 90, sky.night) * flicker;
      shrine.flame.scale.set(1, 1.7 + 0.35 * flicker, 1);
      (emberMat.uniforms.uColor!.value as THREE.Color).copy(emberDay).lerp(emberNight, sky.night);
    },
  };
}
