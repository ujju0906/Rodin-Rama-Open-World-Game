/** Layout of the Dandaka Forest region. Positions are metres; +x east, +z south. */
export const WORLD = {
  size: 1000,
  waterLevel: -0.6,
  /** Trees/ferns are grouped into square chunks of this size for culling and LOD. */
  chunkSize: 125,
  treeSpacing: 7.5,
  lod0Distance: 150,
  lod1Distance: 560,
  fernDistance: 120,
  grassCell: 26,
  grassRadiusCells: 2,
  grassPerCell: 2600,
} as const;

/** Centre line of the river: z as a function of x. */
export const riverZ = (x: number): number =>
  110 * Math.sin(x * 0.0058 + 0.6) + 45 * Math.sin(x * 0.0137 + 2.1) - 40;

export interface Poi {
  x: number;
  z: number;
  /** Radius of the cleared, flattened area. */
  r: number;
  /** Ground height the clearing is flattened to (undefined = keep the natural height). */
  level?: number;
}

export const POI = {
  hermitage: { x: -150, z: riverZ(-150) + 58, r: 32, level: 2.2 },
  firstShrine: { x: -40, z: 150, r: 9 },
  riverShrine: { x: 60, z: riverZ(60) + 34, r: 9, level: 2.0 },
  temple: { x: 175, z: 240, r: 46, level: 15 },
  swamp: { x: 290, z: -270, r: 95 },
  overlook: { x: -310, z: 300, r: 10 },
} satisfies Record<string, Poi>;

/** Footpaths as chains of points; they become mud tracks with no trees on them. */
export const PATHS: [number, number][][] = [
  [
    [POI.hermitage.x, POI.hermitage.z],
    [-100, 110],
    [POI.firstShrine.x, POI.firstShrine.z],
    [60, 190],
    [POI.temple.x - 20, POI.temple.z - 44],
  ],
  [
    [POI.firstShrine.x, POI.firstShrine.z],
    [20, 70],
    [POI.riverShrine.x, POI.riverShrine.z],
    [60, riverZ(60) - 30],
    [150, -150],
    [POI.swamp.x - 70, POI.swamp.z + 60],
  ],
];

/** Camera viewpoints for review screenshots and the V key. `h` is height above ground. */
export const VIEWPOINTS: {
  name: string;
  x: number;
  z: number;
  h: number;
  yaw: number;
  pitch: number;
}[] = [
  {
    name: 'hermitage',
    x: POI.hermitage.x + 30,
    z: POI.hermitage.z + 30,
    h: 4.5,
    yaw: 0.72,
    pitch: -0.06,
  },
  { name: 'forest-path', x: -72, z: 128, h: 1.9, yaw: -1.9, pitch: 0.1 },
  { name: 'river', x: 22, z: riverZ(22) + 15, h: 2.2, yaw: -1.25, pitch: -0.05 },
  {
    name: 'temple',
    x: POI.temple.x - 22,
    z: POI.temple.z - 62,
    h: 5,
    yaw: Math.PI + 0.32,
    pitch: 0.02,
  },
  { name: 'swamp', x: POI.swamp.x - 78, z: POI.swamp.z + 66, h: 3.2, yaw: -0.85, pitch: -0.03 },
];
