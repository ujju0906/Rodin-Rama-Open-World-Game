/** Quality presets. Tweak numbers here; no code changes needed. */
export type QualityName = 'low' | 'medium' | 'ultra';

export interface QualityPreset {
  label: string;
  /** Upper limit for device pixel ratio. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  godRays: boolean;
  godRaySamples: number;
  smaa: boolean;
  /** Multiplier on grass, trees and particles. */
  scatterDensity: number;
  /** Cloud detail in the sky shader (noise octaves). */
  cloudOctaves: number;
  /** Environment map refresh rate, in game hours between updates. */
  envRefreshHours: number;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  low: {
    label: 'Low',
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    bloom: true,
    godRays: false,
    godRaySamples: 0,
    smaa: false,
    scatterDensity: 0.3,
    cloudOctaves: 3,
    envRefreshHours: 1,
  },
  medium: {
    label: 'Medium',
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 2048,
    bloom: true,
    godRays: true,
    godRaySamples: 40,
    smaa: true,
    scatterDensity: 0.65,
    cloudOctaves: 4,
    envRefreshHours: 0.5,
  },
  ultra: {
    label: 'Ultra',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 4096,
    bloom: true,
    godRays: true,
    godRaySamples: 70,
    smaa: true,
    scatterDensity: 1,
    cloudOctaves: 5,
    envRefreshHours: 0.25,
  },
};

export const QUALITY_ORDER: QualityName[] = ['low', 'medium', 'ultra'];
