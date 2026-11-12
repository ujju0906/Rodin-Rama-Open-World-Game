import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { POI, riverZ, WORLD } from '../data/world';
import type { Heightfield } from './heightfield';
import type { GameTextures } from './textures';

export interface Flame {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  base: number;
}

export interface Structures {
  group: THREE.Group;
  flames: Flame[];
  /** Maze layout of the ruined temple (true = wall), kept for the Phase 4 maya maze. */
  templeWalls: { x: number; z: number; w: number; d: number; h: number }[];
  /** Open doorways inside the maze; some become maya (illusion) walls. */
  templeOpenings: { x: number; z: number; w: number; d: number }[];
  /** Round obstacles (huts, altar, idols). */
  circles: { x: number; z: number; r: number }[];
  /** Height of the temple floor. */
  templeFloorY: number;
}

/** Collects boxes and cylinders into two instanced meshes so each landmark costs few draw calls. */
class Blocks {
  private boxes: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private cyls: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  private d = new THREE.Object3D();

  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    dp: number,
    tint = 1,
    ry = 0,
    rx = 0,
    rz = 0,
  ): void {
    this.d.position.set(x, y, z);
    this.d.rotation.set(rx, ry, rz);
    this.d.scale.set(w, h, dp);
    this.d.updateMatrix();
    this.boxes.push({
      m: this.d.matrix.clone(),
      c: new THREE.Color(tint, tint * 0.97, tint * 0.92),
    });
  }

  cyl(x: number, y: number, z: number, r: number, h: number, tint = 1, rx = 0, rz = 0): void {
    this.d.position.set(x, y, z);
    this.d.rotation.set(rx, 0, rz);
    this.d.scale.set(r * 2, h, r * 2);
    this.d.updateMatrix();
    this.cyls.push({
      m: this.d.matrix.clone(),
      c: new THREE.Color(tint, tint * 0.97, tint * 0.92),
    });
  }

  build(mat: THREE.Material): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const make = (
      geo: THREE.BufferGeometry,
      list: { m: THREE.Matrix4; c: THREE.Color }[],
    ): void => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((e, i) => {
        mesh.setMatrixAt(i, e.m);
        mesh.setColorAt(i, e.c);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    };
    make(new THREE.BoxGeometry(1, 1, 1), this.boxes);
    make(new THREE.CylinderGeometry(0.5, 0.5, 1, 14), this.cyls);
    return out;
  }
}

function addFlame(
  group: THREE.Group,
  flames: Flame[],
  x: number,
  y: number,
  z: number,
  size: number,
  power: number,
): void {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16 * size, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 2.6, 0.5), fog: false }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(1, 1.9, 1);
  const light = new THREE.PointLight(0xff9a3c, power, 30, 1.8);
  light.position.set(x, y + 0.2, z);
  group.add(mesh, light);
  flames.push({ mesh, light, base: power });
}

/** Lamp shrine: stepped base, four pillars, shikhara roof, bronze lamp. */
function shrine(
  stone: Blocks,
  bronze: Blocks,
  group: THREE.Group,
  flames: Flame[],
  x: number,
  y: number,
  z: number,
): void {
  stone.box(x, y + 0.2, z, 7, 0.6, 7, 0.75);
  stone.box(x, y + 0.65, z, 5.8, 0.4, 5.8, 0.95);
  stone.box(x, y + 1.0, z, 4.8, 0.35, 4.8, 1);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const px = x + sx * 1.8;
    const pz = z + sz * 1.8;
    stone.box(px, y + 1.32, pz, 0.8, 0.28, 0.8, 0.8);
    stone.cyl(px, y + 2.9, pz, 0.27, 3, 1);
    bronze.cyl(px, y + 2.1, pz, 0.33, 0.16);
    bronze.cyl(px, y + 3.8, pz, 0.33, 0.16);
    stone.box(px, y + 4.5, pz, 0.85, 0.28, 0.85, 0.8);
  }
  let ry = y + 4.75;
  let w = 5.2;
  for (let i = 0; i < 7; i++) {
    const h = i === 0 ? 0.36 : 0.5;
    stone.box(x, ry + h / 2, z, w, h, w, i % 2 ? 1 : 0.78);
    ry += h;
    w *= 0.78;
  }
  bronze.cyl(x, ry + 0.3, z, 0.36, 0.5);
  bronze.cyl(x, y + 1.65, z, 0.2, 1.0);
  bronze.cyl(x, y + 2.25, z, 0.5, 0.2);
  addFlame(group, flames, x, y + 2.6, z, 1, 55);
}

export function buildStructures(hf: Heightfield, tex: GameTextures): Structures {
  const group = new THREE.Group();
  group.name = 'structures';
  const flames: Flame[] = [];
  const rand = mulberry32(2026);
  const circles: Structures['circles'] = [];
  const templeOpenings: Structures['templeOpenings'] = [];

  tex.stone.repeat.set(1, 1);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: tex.stone,
    normalMap: tex.stoneNormal,
    roughness: 0.86,
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xb8823a,
    roughness: 0.3,
    metalness: 1,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: tex.bark,
    roughness: 0.85,
    color: 0xb89a70,
  });
  const thatchMat = new THREE.MeshStandardMaterial({ map: tex.thatch, roughness: 0.95 });
  const clayMat = new THREE.MeshStandardMaterial({ color: 0x6e3a22, roughness: 0.75 });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xe07a1c,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });

  const stone = new Blocks();
  const bronze = new Blocks();
  const wood = new Blocks();

  // --- Shrines -------------------------------------------------------------
  for (const p of [POI.firstShrine, POI.riverShrine])
    shrine(stone, bronze, group, flames, p.x, hf.heightAt(p.x, p.z) - 0.15, p.z);

  // --- Hermitage -----------------------------------------------------------
  {
    const { x, z } = POI.hermitage;
    const y = POI.hermitage.level;
    const huts: [number, number, number][] = [
      [-11, -7, 4.2],
      [9, -10, 3.6],
      [12, 8, 3.2],
    ];
    for (const [hx, hz, r] of huts) {
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.6, 18, 1, true), woodMat);
      wall.position.set(x + hx, y + 1.3, z + hz);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(r * 1.42, r * 1.25, 20, 3, true),
        thatchMat,
      );
      roof.position.set(x + hx, y + 2.5 + r * 0.6, z + hz);
      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 1.15, r * 1.25, 0.35, 18),
        stoneMat,
      );
      floor.position.set(x + hx, y + 0.12, z + hz);
      for (const m of [wall, roof, floor]) {
        m.castShadow = m.receiveShadow = true;
        group.add(m);
      }
      (tex.thatch.repeat as THREE.Vector2).set(4, 2);
      circles.push({ x: x + hx, z: z + hz, r: r + 0.2 });
      // Dark doorway facing the fire.
      const a = Math.atan2(-hz, -hx);
      wood.box(
        x + hx + Math.cos(a) * r,
        y + 1.0,
        z + hz + Math.sin(a) * r,
        0.25,
        1.9,
        1.15,
        0.12,
        -a,
      );
    }
    // Sacred fire altar.
    stone.box(x, y + 0.25, z, 3.2, 0.5, 3.2, 0.8);
    stone.box(x, y + 0.65, z, 2.3, 0.4, 2.3, 1);
    stone.box(x, y + 0.95, z, 1.5, 0.3, 1.5, 0.7);
    addFlame(group, flames, x, y + 1.45, z, 2.4, 110);
    circles.push({ x, z, r: 1.9 });
    for (let i = 0; i < 5; i++)
      wood.box(
        x + (rand() - 0.5) * 0.9,
        y + 1.15,
        z + (rand() - 0.5) * 0.9,
        0.12,
        0.12,
        1.1,
        0.5,
        rand() * 3,
        0.2,
      );
    // Clay pots.
    for (let i = 0; i < 9; i++) {
      const a = rand() * 6.28;
      const r = 6 + rand() * 9;
      const s = 0.3 + rand() * 0.3;
      const pot = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), clayMat);
      pot.scale.y = 1.15;
      pot.position.set(x + Math.cos(a) * r, y + s * 0.95, z + Math.sin(a) * r);
      pot.castShadow = true;
      group.add(pot);
    }
    // Saffron cloth drying on a line.
    wood.cyl(x - 6, y + 1.2, z + 12, 0.07, 2.4, 0.7);
    wood.cyl(x + 1, y + 1.2, z + 13.5, 0.07, 2.4, 0.7);
    for (let i = 0; i < 3; i++) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5, 4, 4), clothMat);
      const t = (i + 0.5) / 3;
      cloth.position.set(x - 6 + 7 * t, y + 1.55, z + 12 + 1.5 * t);
      cloth.rotation.y = -0.21;
      cloth.castShadow = true;
      group.add(cloth);
    }
    // Low fence posts around the clearing.
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * 6.28;
      if (Math.abs(a - 0.6) < 0.35) continue; // gate towards the path
      const fx = x + Math.cos(a) * 24;
      const fz = z + Math.sin(a) * 24;
      wood.cyl(
        fx,
        hf.heightAt(fx, fz) + 0.55,
        fz,
        0.09,
        1.3,
        0.6 + rand() * 0.3,
        (rand() - 0.5) * 0.2,
        (rand() - 0.5) * 0.2,
      );
    }
  }

  // --- Ruined temple: a real maze footprint under a broken tower -------------
  const templeWalls: Structures['templeWalls'] = [];
  {
    const { x, z } = POI.temple;
    const y = POI.temple.level;
    const cells = 7;
    const cell = 8;
    const half = (cells * cell) / 2;
    stone.box(x, y - 0.8, z, cells * cell + 10, 2.4, cells * cell + 10, 0.7);
    stone.box(x, y + 0.25, z, cells * cell + 5, 0.5, cells * cell + 5, 0.9);
    const floorY = y + 0.5;
    // Entry stairs on the north side (towards the path).
    for (let i = 0; i < 6; i++)
      stone.box(x - 20, y - 1.9 + i * 0.4, z - half - 8 + i * 0.9, 9, 0.4, 1.2, 0.85);

    // Depth-first maze: start with every wall up, knock walls down between visited cells.
    const visited = new Uint8Array(cells * cells);
    const openE = new Uint8Array(cells * cells); // passage to the east neighbour
    const openS = new Uint8Array(cells * cells); // passage to the south neighbour
    const stack = [0];
    visited[0] = 1;
    while (stack.length) {
      const cur = stack[stack.length - 1]!;
      const cx = cur % cells;
      const cz = Math.floor(cur / cells);
      const opts: number[] = [];
      if (cx > 0 && !visited[cur - 1]) opts.push(cur - 1);
      if (cx < cells - 1 && !visited[cur + 1]) opts.push(cur + 1);
      if (cz > 0 && !visited[cur - cells]) opts.push(cur - cells);
      if (cz < cells - 1 && !visited[cur + cells]) opts.push(cur + cells);
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const next = opts[Math.floor(rand() * opts.length)]!;
      if (next === cur + 1) openE[cur] = 1;
      else if (next === cur - 1) openE[next] = 1;
      else if (next === cur + cells) openS[cur] = 1;
      else openS[next] = 1;
      visited[next] = 1;
      stack.push(next);
    }
    const wall = (wx: number, wz: number, w: number, d: number): void => {
      const ruined = rand();
      const h = ruined < 0.22 ? 1 + rand() * 1.6 : 4.2 + rand() * 1.4;
      stone.box(wx, floorY + h / 2, wz, w, h, d, 0.72 + rand() * 0.4, 0, 0, (rand() - 0.5) * 0.02);
      if (h > 4) stone.box(wx, floorY + h + 0.2, wz, w + 0.3, 0.4, d + 0.3, 0.65);
      templeWalls.push({ x: wx, z: wz, w, d, h });
    };
    for (let cz = 0; cz < cells; cz++) {
      for (let cx = 0; cx < cells; cx++) {
        const i = cz * cells + cx;
        const px = x - half + cx * cell;
        const pz = z - half + cz * cell;
        const centre = Math.abs(cx - 3) <= 0 && Math.abs(cz - 3) <= 0;
        if (cx < cells - 1 && !centre) {
          if (!openE[i]) wall(px + cell, pz + cell / 2, 1, cell);
          else templeOpenings.push({ x: px + cell, z: pz + cell / 2, w: 1, d: cell - 1 });
        }
        if (cz < cells - 1 && !centre) {
          if (!openS[i]) wall(px + cell / 2, pz + cell, cell, 1);
          else templeOpenings.push({ x: px + cell / 2, z: pz + cell, w: cell - 1, d: 1 });
        }
      }
    }
    // Outer walls with a gate gap on the north side.
    for (let k = 0; k < cells; k++) {
      const t = -half + k * cell + cell / 2;
      if (k !== 1) wall(x + t, z - half, cell, 1.2);
      wall(x + t, z + half, cell, 1.2);
      wall(x - half, z + t, 1.2, cell);
      wall(x + half, z + t, 1.2, cell);
    }
    // Pillars at every junction; some have fallen.
    for (let cz = 0; cz <= cells; cz++) {
      for (let cx = 0; cx <= cells; cx++) {
        const px = x - half + cx * cell;
        const pz = z - half + cz * cell;
        if (rand() < 0.14) {
          stone.cyl(px + 1.5, floorY + 0.4, pz + 0.8, 0.45, 4.2, 0.8, Math.PI / 2, rand() * 3);
          stone.cyl(px, floorY + 0.5, pz, 0.5, 1, 0.85);
        } else {
          stone.cyl(px, floorY + 3.1, pz, 0.48, 6.2, 0.9 + rand() * 0.2);
          stone.box(px, floorY + 6.4, pz, 1.5, 0.45, 1.5, 0.75);
          bronze.cyl(px, floorY + 5.6, pz, 0.56, 0.2);
        }
      }
    }
    // Central tower, top broken off.
    let ty = floorY + 6.6;
    let tw = cell * 2.6;
    for (let i = 0; i < 9; i++) {
      const h = 1.5;
      stone.box(
        x + (i > 6 ? 0.8 : 0),
        ty + h / 2,
        z,
        tw,
        h,
        tw,
        i % 2 ? 1 : 0.76,
        0,
        0,
        i > 6 ? 0.06 : 0,
      );
      ty += h;
      tw *= 0.84;
    }
    // Fallen blocks around the base.
    for (let i = 0; i < 46; i++) {
      const a = rand() * 6.28;
      const r = half + 3 + rand() * 16;
      const bx = x + Math.cos(a) * r;
      const bz = z + Math.sin(a) * r;
      const s = 0.6 + rand() * 1.6;
      stone.box(
        bx,
        hf.heightAt(bx, bz) + s * 0.25,
        bz,
        s * (1 + rand()),
        s,
        s * (0.7 + rand()),
        0.6 + rand() * 0.4,
        rand() * 3,
        rand() * 0.5,
        rand() * 0.5,
      );
    }
  }

  // --- Swamp: half-sunken idols and a ring of standing stones -----------------
  {
    const { x, z } = POI.swamp;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * 6.28 + 0.2;
      const r = 36 + rand() * 4;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      const h = 3 + rand() * 3.5;
      stone.box(
        sx,
        hf.heightAt(sx, sz) + h / 2 - 0.6,
        sz,
        1.5,
        h,
        1.1,
        0.45 + rand() * 0.2,
        a,
        (rand() - 0.5) * 0.3,
        (rand() - 0.5) * 0.3,
      );
    }
    for (const [ix, iz, s, tilt] of [
      [-14, 9, 3.2, 0.25],
      [17, -12, 2.4, -0.3],
      [4, 22, 2.0, 0.4],
    ] as const) {
      const iy = WORLD.waterLevel - s * 0.25;
      circles.push({ x: x + ix, z: z + iz, r: s * 0.75 });
      stone.box(x + ix, iy + s * 0.5, z + iz, s * 1.1, s, s * 0.9, 0.5, 0.5, 0, tilt); // head
      stone.box(x + ix, iy + s * 1.15, z + iz, s * 1.3, s * 0.35, s * 1.1, 0.42, 0.5, 0, tilt); // crown
      stone.box(
        x + ix + Math.sin(tilt) * -s * 0.6,
        iy + s * 1.55,
        z + iz,
        s * 0.8,
        s * 0.5,
        s * 0.7,
        0.5,
        0.5,
        0,
        tilt,
      );
    }
  }

  // --- Wooden bridge where the path crosses the river --------------------------
  {
    const bx = 60;
    const zc = riverZ(bx);
    const deck = 1.5;
    for (let i = -14; i <= 14; i++) {
      const sag = -0.0022 * i * i * 2 + 0.25;
      wood.box(
        bx + (rand() - 0.5) * 0.1,
        deck + sag,
        zc + i * 1.5,
        3.2,
        0.14,
        1.36,
        0.55 + rand() * 0.3,
        0,
        0,
        (rand() - 0.5) * 0.03,
      );
      if (i % 4 === 0) {
        for (const side of [-1, 1]) {
          const ground = hf.heightAt(bx + side * 1.7, zc + i * 1.5);
          wood.cyl(
            bx + side * 1.7,
            (deck + 1 + ground) / 2 - 0.3,
            zc + i * 1.5,
            0.12,
            deck + 1.8 - ground,
            0.5,
          );
        }
      }
    }
    for (const side of [-1, 1]) wood.box(bx + side * 1.7, deck + 1.15, zc, 0.09, 0.09, 43, 0.5);
  }

  group.add(...stone.build(stoneMat), ...bronze.build(bronzeMat), ...wood.build(woodMat));
  return {
    group,
    flames,
    templeWalls,
    templeOpenings,
    circles,
    templeFloorY: POI.temple.level + 0.5,
  };
}
