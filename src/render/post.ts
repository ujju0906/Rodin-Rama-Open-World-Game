import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  KernelSize,
  LUT3DEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing';
import type { QualityPreset } from '../data/quality';
import { createGradeLUT } from './grade';

export interface PostStack {
  composer: EffectComposer;
  godRays: GodRaysEffect | null;
  bloom: BloomEffect | null;
  render(dt: number): void;
  setSize(w: number, h: number): void;
  dispose(): void;
}

/**
 * Post-processing chain, in order:
 * scene -> god rays + bloom (HDR) -> ACES tone mapping + LUT grade + vignette -> SMAA.
 * Depth of field for cutscenes is added in Phase 6.
 */
export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sunSource: THREE.Mesh,
  q: QualityPreset,
): PostStack {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  const hdr: Effect[] = [];
  let godRays: GodRaysEffect | null = null;
  if (q.godRays) {
    godRays = new GodRaysEffect(camera, sunSource, {
      height: 360,
      kernelSize: KernelSize.SMALL,
      density: 0.95,
      decay: 0.93,
      weight: 0.42,
      exposure: 0.5,
      samples: q.godRaySamples,
      clampMax: 1,
    });
    hdr.push(godRays);
  }
  let bloom: BloomEffect | null = null;
  if (q.bloom) {
    bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.95,
      luminanceSmoothing: 0.35,
      intensity: 0.85,
      radius: 0.78,
    });
    hdr.push(bloom);
  }
  if (hdr.length) composer.addPass(new EffectPass(camera, ...hdr));

  const lut = createGradeLUT(32);
  composer.addPass(
    new EffectPass(
      camera,
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new LUT3DEffect(lut),
      new VignetteEffect({ offset: 0.28, darkness: 0.62 }),
    ),
  );

  if (q.smaa) {
    composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })));
  }

  return {
    composer,
    godRays,
    bloom,
    render: (dt) => composer.render(dt),
    setSize: (w, h) => composer.setSize(w, h),
    dispose: () => {
      composer.dispose();
      lut.dispose();
    },
  };
}
