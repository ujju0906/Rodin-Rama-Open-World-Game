import * as THREE from 'three';
import type { QualityPreset } from '../data/quality';

/** Creates the WebGL renderer. Tone mapping and sRGB output happen in the post stack. */
export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // ACES is applied by the post stack
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  return renderer;
}

export function applyRendererQuality(renderer: THREE.WebGLRenderer, q: QualityPreset): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.maxPixelRatio));
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.needsUpdate = true;
}
