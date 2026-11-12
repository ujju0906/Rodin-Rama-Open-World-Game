/** Sky, light and fog colours for the day/night cycle. Linear RGB, 0..1 (sun can exceed 1). */
export const ATMOSPHERE = {
  /** Game hour at start (0..24). 6.6 is just after sunrise: golden hour. */
  startHour: 6.6,
  /** Game hours per real second when the cycle runs. */
  cycleSpeed: 0.02,

  zenithDay: [0.1, 0.27, 0.58],
  zenithNight: [0.006, 0.01, 0.035],
  horizonDay: [0.55, 0.7, 0.82],
  horizonNight: [0.02, 0.035, 0.08],
  /** Colour the horizon is pulled towards at sunrise and sunset. */
  horizonGolden: [1.0, 0.5, 0.2],

  sunColorHigh: [1.0, 0.95, 0.85],
  sunColorLow: [1.0, 0.5, 0.2],
  sunIntensity: 4.2,
  moonColor: [0.45, 0.62, 1.0],
  moonIntensity: 0.45,

  /** Height fog. Density is at ground level; falloff is how fast it thins with height. */
  fogDensityDay: 0.0055,
  fogDensityDawn: 0.011,
  fogDensityNight: 0.008,
  fogHeightFalloff: 0.045,
  fogBaseHeight: 0,
} as const;
