import * as THREE from 'three';
import { fbm2, smoothstep } from '../core/noise';
import { WORLD } from '../data/world';
import { pathDistance, riverDistance, swampAmount, type Heightfield } from './heightfield';
import type { GameTextures } from './textures';

const SEGMENTS = 400;

/**
 * Terrain mesh with a four-layer splat material (mud, moss, rock, sand).
 * Layer weights are stored per vertex; the layers are blended in the fragment shader
 * on top of Three's standard PBR lighting.
 */
export function buildTerrain(
  hf: Heightfield,
  tex: GameTextures,
  wet: { value: number },
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, hf.heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;

  const splat = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - nor.getY(i);
    const n = fbm2(x * 0.03 + 50, z * 0.03 + 50, 3);
    const rock = smoothstep(0.1, 0.26, slope + (n - 0.5) * 0.08);
    const shore = smoothstep(1.7, 0.1, h - WORLD.waterLevel);
    const sw = swampAmount(x, z);
    const sand = shore * (1 - sw) * smoothstep(40, 12, riverDistance(x, z));
    const mud = Math.max(
      smoothstep(4.2, 1.6, pathDistance(x, z)),
      sw * 0.9,
      shore * sw,
      smoothstep(0.66, 0.78, n) * 0.4,
    );
    let wRock = rock;
    let wSand = sand * (1 - wRock);
    let wMud = mud * (1 - wRock) * (1 - wSand);
    let wMoss = Math.max(0, 1 - wRock - wSand - wMud);
    const sum = wRock + wSand + wMud + wMoss;
    wRock /= sum;
    wSand /= sum;
    wMud /= sum;
    wMoss /= sum;
    splat.set([wMud, wMoss, wRock, wSand], i * 4);
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));

  tex.groundNormal.repeat.set(170, 170);
  const mat = new THREE.MeshStandardMaterial({
    roughness: 1,
    metalness: 0,
    normalMap: tex.groundNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tMud: { value: tex.mud },
      tMoss: { value: tex.moss },
      tRock: { value: tex.rock },
      tSand: { value: tex.sand },
      uWet: wet,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vTerrainPos;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSplat = splat;\nvTerrainPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tMud; uniform sampler2D tMoss; uniform sampler2D tRock; uniform sampler2D tSand;
        uniform float uWet;
        varying vec4 vSplat; varying vec3 vTerrainPos;`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec2 tuv = vTerrainPos.xz * 0.21;
        vec3 layers = texture2D( tMud, tuv ).rgb * vSplat.x
                    + texture2D( tMoss, tuv ).rgb * vSplat.y
                    + texture2D( tRock, tuv * 0.6 ).rgb * vSplat.z
                    + texture2D( tSand, tuv ).rgb * vSplat.w;
        // Large-scale variation hides the tiling.
        float macro = texture2D( tMoss, vTerrainPos.xz * 0.013 ).g * 1.6 + texture2D( tRock, vTerrainPos.xz * 0.0031 ).r * 1.2;
        layers *= 0.8 + 0.4 * macro;
        layers *= 1.0 - 0.12 * uWet; // wet ground is darker
        diffuseColor.rgb *= layers;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        float roughnessFactor = dot( vSplat, vec4( 0.62, 0.9, 0.82, 0.86 ) );
        roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.45, uWet * ( 0.4 + 0.6 * vSplat.x ) );`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Terrain height packed into an 8-bit texture so the water shader can read depth. */
export function buildHeightTexture(hf: Heightfield): THREE.DataTexture {
  const n = 512;
  const data = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = hf.heightAt((i / (n - 1) - 0.5) * WORLD.size, (j / (n - 1) - 0.5) * WORLD.size);
      data[j * n + i] = Math.max(0, Math.min(255, ((h + 6) / 12) * 255));
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
