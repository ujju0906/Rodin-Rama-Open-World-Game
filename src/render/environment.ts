import * as THREE from 'three';
import type { Sky } from './sky';

/**
 * Image-based lighting generated from our own sky shader (a procedural HDRI).
 * It is re-baked as the time of day changes so reflections and ambient light always match the sky.
 */
export class SkyEnvironment {
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly bakeScene = new THREE.Scene();
  private target: THREE.WebGLRenderTarget | null = null;
  private lastHour = -99;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly sky: Sky,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), sky.material);
    dome.frustumCulled = false;
    this.bakeScene.add(dome);
  }

  /** Re-bakes if the game clock moved more than `minHours` since the last bake. */
  update(minHours: number, force = false): void {
    const h = this.sky.state.hour;
    let diff = Math.abs(h - this.lastHour);
    diff = Math.min(diff, 24 - diff);
    if (!force && diff < minHours) return;
    this.lastHour = h;
    const next = this.pmrem.fromScene(this.bakeScene, 0, 0.1, 1000);
    this.scene.environment = next.texture;
    this.target?.dispose();
    this.target = next;
  }
}
