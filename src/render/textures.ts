import * as THREE from 'three';
import { mulberry32 } from '../core/noise';

/**
 * Procedural textures, generated once at load. They stand in for scanned PBR sets
 * (Poly Haven / ambientCG / Higgsfield tileables) until real ones are dropped in.
 */

function thash(ix: number, iy: number, period: number, seed: number): number {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let h = Math.imul(x + seed * 131, 374761393) + Math.imul(y + seed * 17, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise: repeats every `period` units. */
function tnoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = thash(ix, iy, period, seed);
  const b = thash(ix + 1, iy, period, seed);
  const c = thash(ix, iy + 1, period, seed);
  const d = thash(ix + 1, iy + 1, period, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function tfbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let p = basePeriod;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tnoise(u * p, v * p, p, seed + i * 7);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function colorTexture(size: number, fn: (u: number, v: number) => RGB): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0]));
      data[i + 1] = Math.max(0, Math.min(255, c[1]));
      data[i + 2] = Math.max(0, Math.min(255, c[2]));
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Tangent-space normal map derived from a tileable height function. */
function normalTexture(
  size: number,
  strength: number,
  height: (u: number, v: number) => number,
): THREE.DataTexture {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) h[y * size + x] = height(x / size, y / size);
  const at = (x: number, y: number): number => h[((y + size) % size) * size + ((x + size) % size)]!;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = (-dx / l) * 127.5 + 127.5;
      data[i + 1] = (-dy / l) * 127.5 + 127.5;
      data[i + 2] = (1 / l) * 127.5 + 127.5;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void,
  repeat = false,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface GameTextures {
  mud: THREE.Texture;
  moss: THREE.Texture;
  rock: THREE.Texture;
  sand: THREE.Texture;
  groundNormal: THREE.Texture;
  waterNormal: THREE.Texture;
  stone: THREE.Texture;
  stoneNormal: THREE.Texture;
  bark: THREE.Texture;
  thatch: THREE.Texture;
  leaves: THREE.Texture;
  fern: THREE.Texture;
}

export function createTextures(): GameTextures {
  const S = 256;
  const mud = colorTexture(S, (u, v) => {
    const n = tfbm(u, v, 4, 5, 1);
    const wet = Math.max(0, tfbm(u, v, 3, 3, 9) - 0.5) * 2;
    return mix(mix([74, 56, 38], [112, 88, 60], n), [48, 38, 28], wet);
  });
  const moss = colorTexture(S, (u, v) => {
    const n = tfbm(u, v, 5, 5, 2);
    const speck = tnoise(u * 64, v * 64, 64, 5);
    const leaf = Math.max(0, tfbm(u, v, 8, 3, 12) - 0.58) * 5;
    return mix(
      mix([44, 72, 24], [88, 122, 44], n * 0.7 + speck * 0.3),
      [92, 72, 36],
      Math.min(1, leaf),
    );
  });
  const rock = colorTexture(S, (u, v) => {
    const n = tfbm(u, v, 4, 6, 3);
    const crack = Math.abs(tfbm(u, v, 6, 4, 21) - 0.5);
    const c = mix([70, 68, 64], [128, 122, 110], n);
    return mix(
      [30, 30, 28],
      mix(c, [52, 74, 34], Math.max(0, tfbm(u, v, 3, 3, 30) - 0.55) * 2.5),
      Math.min(1, crack * 14 + 0.25),
    );
  });
  const sand = colorTexture(S, (u, v) => {
    const n = tfbm(u, v, 6, 5, 4);
    const pebble = tnoise(u * 48, v * 48, 48, 8) > 0.86 ? 0.6 : 1;
    const c = mix([118, 98, 70], [168, 146, 108], n);
    return [c[0] * pebble, c[1] * pebble, c[2] * pebble];
  });
  const groundNormal = normalTexture(S, 5, (u, v) => tfbm(u, v, 6, 5, 40));
  const waterNormal = normalTexture(
    S,
    3.2,
    (u, v) => tfbm(u, v, 4, 4, 50) + 0.4 * Math.abs(tfbm(u, v, 8, 3, 51) - 0.5),
  );
  const stone = colorTexture(S, (u, v) => {
    const n = tfbm(u, v, 4, 6, 60);
    const course =
      Math.min(
        Math.abs(((v * 4) % 1) - 0.5),
        Math.abs((((u + (Math.floor(v * 4) % 2) * 0.5) * 2) % 1) - 0.5),
      ) * 2;
    const mortar = course > 0.955 ? 0.55 : 1;
    const c = mix(
      mix([118, 92, 62], [176, 142, 100], n),
      [60, 78, 40],
      Math.max(0, tfbm(u, v, 3, 4, 61) - 0.56) * 3,
    );
    return [c[0] * mortar, c[1] * mortar, c[2] * mortar];
  });
  const stoneNormal = normalTexture(S, 4, (u, v) => {
    const course =
      Math.min(
        Math.abs(((v * 4) % 1) - 0.5),
        Math.abs((((u + (Math.floor(v * 4) % 2) * 0.5) * 2) % 1) - 0.5),
      ) * 2;
    return tfbm(u, v, 8, 5, 62) * 0.7 - (course > 0.955 ? 0.5 : 0);
  });

  const rand = mulberry32(99);
  const bark = canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#33291f';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 520; i++) {
        const x = rand() * s;
        const w = 1 + rand() * 5;
        const y = rand() * s;
        const len = 20 + rand() * 120;
        const l = 12 + rand() * 26;
        ctx.fillStyle = `hsla(${24 + rand() * 12},${10 + rand() * 14}%,${l}%,0.5)`;
        ctx.fillRect(x, y, w, len);
        ctx.fillRect(x, y - s, w, len);
      }
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `hsla(${80 + rand() * 25},22%,${17 + rand() * 10}%,0.22)`;
        ctx.beginPath();
        ctx.ellipse(rand() * s, rand() * s, 4 + rand() * 16, 6 + rand() * 26, 0, 0, 7);
        ctx.fill();
      }
    },
    true,
  );
  const thatch = canvasTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = '#6e5a34';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        const x = rand() * s;
        const y = rand() * s;
        ctx.strokeStyle = `hsla(${36 + rand() * 14},${30 + rand() * 25}%,${22 + rand() * 38}%,0.7)`;
        ctx.lineWidth = 0.6 + rand() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 8, y + 14 + rand() * 30);
        ctx.stroke();
      }
    },
    true,
  );
  const leaves = canvasTexture(512, (ctx, s) => {
    // Faint green haze first so mip-mapped edges stay green instead of going dark.
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, 'rgba(40,70,22,0.2)');
    g.addColorStop(1, 'rgba(40,70,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 330; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.pow(rand(), 0.62) * s * 0.44;
      const x = s / 2 + Math.cos(a) * r;
      const y = s / 2 + Math.sin(a) * r * 0.92;
      const len = s * (0.05 + rand() * 0.055);
      const depth = i / 330; // later leaves sit on top and are lighter
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (rand() - 0.5) * 2.2);
      ctx.fillStyle = `hsl(${78 + rand() * 38},${42 + rand() * 26}%,${9 + depth * 22 + rand() * 9}%)`;
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.quadraticCurveTo(0, -len * 0.5, len, 0);
      ctx.quadraticCurveTo(0, len * 0.5, -len, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,210,120,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.restore();
    }
  });
  const fern = canvasTexture(256, (ctx, s) => {
    ctx.translate(s / 2, s);
    ctx.fillStyle = 'rgba(40,80,25,0.06)';
    ctx.fillRect(-s / 2, -s, s, s);
    ctx.strokeStyle = '#2c4a17';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -s * 0.97);
    ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const y = -s * (0.06 + t * 0.9);
      const len = s * 0.44 * Math.sin(Math.PI * (0.12 + t * 0.88)) * (1 - t * 0.35);
      for (const side of [-1, 1]) {
        ctx.fillStyle = `hsl(${92 + rand() * 22},${46 + rand() * 18}%,${15 + t * 14 + rand() * 7}%)`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(side * len * 0.5, y - s * 0.05, side * len, y - s * 0.012);
        ctx.quadraticCurveTo(side * len * 0.5, y + s * 0.022, 0, y + s * 0.02);
        ctx.fill();
      }
    }
  });

  return {
    mud,
    moss,
    rock,
    sand,
    groundNormal,
    waterNormal,
    stone,
    stoneNormal,
    bark,
    thatch,
    leaves,
    fern,
  };
}
