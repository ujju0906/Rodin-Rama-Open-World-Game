import { LookupTexture } from 'postprocessing';

const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sCurve = (x: number, k: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t + k * (t * t * (3 - 2 * t) - t);
};

/**
 * Builds the colour-grading LUT in code: teal-indigo shadows, saffron-gold highlights,
 * a gentle filmic contrast curve and slightly richer colour.
 */
export function createGradeLUT(size = 32): LookupTexture {
  const lut = LookupTexture.createNeutral(size);
  const data = lut.image.data as Float32Array;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;
    const l = luma(r, g, b);

    // Split toning.
    const shadow = (1 - l) * (1 - l);
    const high = l * l;
    r += -0.028 * shadow + 0.035 * high;
    g += 0.008 * shadow + 0.012 * high;
    b += 0.04 * shadow - 0.04 * high;

    // Saturation.
    const l2 = luma(r, g, b);
    const sat = 1.12;
    r = l2 + (r - l2) * sat;
    g = l2 + (g - l2) * sat;
    b = l2 + (b - l2) * sat;

    // Contrast.
    data[i] = sCurve(r, 0.35);
    data[i + 1] = sCurve(g, 0.35);
    data[i + 2] = sCurve(b, 0.35);
  }
  lut.needsUpdate = true;
  lut.name = 'saffron-teal';
  return lut;
}
