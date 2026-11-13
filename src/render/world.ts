import * as THREE from 'three';
import { nextFrame } from '../core/loop';
import { POI } from '../data/world';
import { Forest } from './forest';
import { Grass } from './grass';
import { Heightfield } from './heightfield';
import type { Sky } from './sky';
import { buildStructures, type Structures } from './structures';
import { buildHeightTexture, buildTerrain } from './terrain';
import { createTextures } from './textures';
import { Water } from './water';
import { Weather } from './weather';

/** The Dandaka Forest region: terrain, water, forest, grass, weather and landmarks. */
export class World {
  readonly hf = new Heightfield();
  readonly time = { value: 0 };
  readonly wet = { value: 0 };
  readonly weather = new Weather();
  forest!: Forest;
  grass!: Grass;
  water!: Water;
  structures!: Structures;

  /** Builds everything, reporting progress between the heavy steps. */
  async build(scene: THREE.Scene, progress: (f: number, label: string) => void): Promise<void> {
    progress(0.3, 'Shaping the land');
    await nextFrame();
    const tex = createTextures();
    scene.add(buildTerrain(this.hf, tex, this.wet));
    progress(0.45, 'Filling the river');
    await nextFrame();
    this.water = new Water(buildHeightTexture(this.hf), tex);
    scene.add(this.water.mesh);
    progress(0.55, 'Raising the temple');
    await nextFrame();
    this.structures = buildStructures(this.hf, tex);
    scene.add(this.structures.group);
    progress(0.65, 'Growing the forest');
    await nextFrame();
    this.forest = new Forest(this.hf, tex, this.time);
    this.grass = new Grass(this.hf, this.time);
    scene.add(this.forest.group, this.grass.group, this.weather.group);
  }

  applyQuality(density: number, pixelRatio: number): void {
    this.forest.build(density);
    this.grass.build(density);
    this.weather.build(density, pixelRatio);
  }

  /** 0 away from the swamp, 1 inside it; drives the green swamp mist. */
  swampNearness(p: THREE.Vector3): number {
    const d = Math.hypot(p.x - POI.swamp.x, p.z - POI.swamp.z);
    return 1 - THREE.MathUtils.smoothstep(d, POI.swamp.r * 0.7, POI.swamp.r * 1.9);
  }

  update(dt: number, elapsed: number, camera: THREE.Vector3, sky: Sky): void {
    const s = sky.state;
    this.time.value = elapsed;
    this.weather.update(
      dt,
      elapsed,
      camera,
      this.hf.heightAt(camera.x, camera.z),
      s.night,
      1 - s.night * 0.8,
    );
    this.wet.value +=
      (Math.min(1, this.weather.rain * 1.6) - this.wet.value) * Math.min(1, dt * 0.2);
    this.forest.update(camera);
    this.grass.update(camera);
    this.water.update(elapsed, s, sky.material.uniforms, this.weather.rain);
    for (const f of this.structures.flames) {
      const flicker = 0.85 + 0.15 * Math.sin(elapsed * 17 + f.base) * Math.sin(elapsed * 7.3 + 1.2);
      f.light.intensity = f.base * (0.12 + 0.88 * s.night) * flicker;
      f.mesh.scale.y = 1.7 + 0.35 * flicker;
    }
  }
}
