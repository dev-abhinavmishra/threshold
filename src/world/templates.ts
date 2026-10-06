/**
 * Main-floor room template library — 30+ structurally distinct templates.
 * Each `build(rng)` produces a RoomSpec in local space. Parameterization
 * (prop shifts, blockage, dark chance) changes player decisions, not just
 * dressing. All geometry is original.
 */
import type { Rng } from '../engine/rng';
import type { RoomSpec, RoomTemplate, Port, PropSpec, PropKind, LocalSocket, LocalHiding, LocalNav, LocalZone, LocalCollider, LightSpec, Wall } from './spec';
import { wallColliders, spineNav, inDoorLane } from './spec';
import { MODEL_FOR } from './modelLibrary';
import type { Biome } from '../game/types';

const P = (offset: number, wall: Wall, width = 1.4): Port => ({ offset, wall, width });

interface Opts {
  entryOff?: number;
  exits?: Port[];
  props?: PropSpec[];
  sockets?: LocalSocket[];
  hiding?: LocalHiding[];
  nav?: LocalNav[];
  safeZones?: LocalZone[];
  colliders?: LocalCollider[];
  lights?: LightSpec[];
  floor?: RoomSpec['floorMaterial'];
  wall?: RoomSpec['wallMaterial'];
  tags?: string[];
  darkChance?: number;
  weight?: number;
  perf?: number;
  minRoom?: number;
  special?: string;
  forbid?: RoomSpec['forbidEntities'];
}

function spec(id: string, biome: Biome, w: number, d: number, h: number, o: Opts): RoomSpec {
  const entry = P(o.entryOff ?? 0, 's', 1.4);
  const exits = o.exits ?? [P(0, 'n', 1.4)];
  return {
    templateId: id,
    version: 1,
    biome,
    width: w, depth: d, height: h,
    entry, exits,
    props: resolveWallClashes(o.props ?? [], w, d, entry, exits),
    sockets: o.sockets ?? [],
    hiding: o.hiding ?? [],
    nav: o.nav ?? spineNav(w, d, entry, exits[0]),
    safeZones: o.safeZones ?? [],
    colliders: [...wallColliders(w, d, h, entry, exits), ...(o.colliders ?? [])],
    lights: o.lights ?? defaultLights(w, d, h),
    floorMaterial: o.floor ?? defaultFloor(biome),
    wallMaterial: o.wall,
    tags: o.tags ?? [],
    forbidEntities: o.forbid,
    darkChance: o.darkChance ?? defaultDark(biome),
    weight: o.weight ?? 10,
    perfCost: o.perf ?? 2,
    minRoom: o.minRoom ?? 1,
    special: o.special,
  };
}

function defaultFloor(b: Biome): RoomSpec['floorMaterial'] {
  switch (b) {
    case 'corridor': return 'carpet';
    case 'guest': return 'wood';
    case 'records': return 'wood';
    case 'maintenance': return 'metal';
    case 'gallery': return 'stone';
    case 'unlit': return 'carpet';
    case 'underscript': return 'concrete';
    case 'milestone': return 'stone';
    case 'safe': return 'carpet';
    default: return 'wood';
  }
}

function defaultDark(b: Biome): number {
  switch (b) {
    case 'unlit': return 0.7;
    case 'maintenance': return 0.35;
    case 'records': return 0.25;
    case 'corridor': return 0.2;
    case 'guest': return 0.15;
    default: return 0.1;
  }
}

function defaultLights(w: number, d: number, h: number): LightSpec[] {
  return [
    { x: 0, y: h - 0.3, z: 0, color: 0xffd9a0, intensity: 1.0, range: Math.max(w, d) * 0.9, group: 'main', breakable: true },
  ];
}

// Common prop scatter helpers
// Wall-hung kinds sit flush on the surface and mount at eye height.
const WALL_MOUNT_Y: Partial<Record<PropKind, number>> = {
  painting: 1.6, wallSconce: 2.05, mirror: 1.55, wallClock: 2.25, sign: 2.1, curtain: 1.25,
  ductCirc: 2.3, ductRect: 2.35, gutter: 2.4, indPipes: 1.8, cableTray: 2.3, lifebuoy: 1.7,
  keyRack: 1.5, exitSign: 2.35, wallVent: 2.25, extinguisher: 1.15, fireAlarm: 1.9,
  sculleryRack: 1.75, potRack: 2.0,
  pegRail: 1.75, towelRail: 1.35,
  curtainRod: 1.1, curtainLong: 1.18,
  curtainSwag: 2.35, drapePanel: 1.2, valveWheel: 1.35, dumbWaiterDoor: 1.15,
  wineRack: 1.7,
};
const WALL_THIN: ReadonlySet<PropKind> = new Set(Object.keys(WALL_MOUNT_Y) as PropKind[]);

function wallProps(w: number, d: number, rng: Rng, kinds: PropKind[], n: number, exitLanes: { xs?: number[]; zs?: number[] } = {}): PropSpec[] {
  const laneX = exitLanes.xs ?? [0]; // +z exit wall: avoid these x centers
  const laneZ = exitLanes.zs ?? [];  // e/w exit walls: avoid these z centers
  const out: PropSpec[] = [];
  const free = (v: number, lanes: number[]) => lanes.every((l) => Math.abs(v - l) >= 1.95);
  for (let i = 0; i < n; i++) {
    const wall = rng.int(0, 2); // 0 west, 1 east, 2 exit (+z) wall
    const kind = rng.pick(kinds);
    const inX = WALL_THIN.has(kind) ? 0.12 : 0.5;
    const inZ = WALL_THIN.has(kind) ? 0.15 : 0.6;
    const y = WALL_MOUNT_Y[kind];
    if (wall === 0 || wall === 1) {
      const x = (wall === 0 ? -1 : 1) * (w / 2 - inX);
      const yaw = wall === 0 ? Math.PI / 2 : -Math.PI / 2;
      let z = -d / 2 + 1 + rng.float() * (d - 2);
      for (let t = 0; t < 8 && !free(z, laneZ); t++) z = -d / 2 + 1 + rng.float() * (d - 2);
      if (!free(z, laneZ)) continue;
      out.push({ kind, x, z, y, yaw, meta: { wall: true } });
    } else {
      let x = -w / 2 + 1 + rng.float() * (w - 2);
      for (let t = 0; t < 8 && !free(x, laneX); t++) x = -w / 2 + 1 + rng.float() * (w - 2);
      if (!free(x, laneX)) continue; // no wall segment clear of the exit lane
      out.push({ kind, x, z: d / 2 - inZ, y, yaw: Math.PI, meta: { wall: true } });
    }
  }
  return out;
}

/* ---- prop-vs-prop clash resolution ----
 * wallProps filler lands blind to the room's fixed furniture, so spec()
 * resolves collisions after the fact: a wall-hung prop that materially
 * overlaps an earlier prop is shifted along its own wall; if no shifted
 * spot is clear (and clear of door lanes) it's dropped, matching the
 * drop-on-conflict behavior of clearDoorLanes. Fixed-vs-fixed pairs are
 * authored and left alone — tools/verify_lanes.ts reports them as CLASH. */
function propFootprint(p: PropSpec): [number, number] {
  const m = MODEL_FOR[p.kind as keyof typeof MODEL_FOR];
  if (!m || !m.collider || m.collider[0] === 0) return [0.25, 0.25];
  const [cw, , cd] = m.collider;
  const yaw = p.yaw ?? 0;
  const quarter = Math.round(yaw / (Math.PI / 2));
  const swap = Math.abs(quarter * Math.PI * 0.5 - yaw) < 0.05 && Math.abs(quarter) % 2 === 1;
  return swap ? [cd / 2, cw / 2] : [cw / 2, cd / 2];
}

function propVspan(p: PropSpec): [number, number] {
  const m = MODEL_FOR[p.kind as keyof typeof MODEL_FOR];
  const y = p.y ?? 0;
  if (!m) return [y, y + 0.3];
  return m.anchor === 'center' ? [y - m.height / 2, y + m.height / 2] : [y, y + m.height];
}

/** Authored co-locations — prop pairs designed to share floor space
 * (chairs pulled to tables, clutter piles, displays in niches). The
 * placement sweep and the clash test both whitelist these. */
export const CLASH_OK: ReadonlyArray<readonly [PropKind, PropKind]> = [
  ['bust', 'pillar'],             // bust on the pillar pedestal
  ['diningChair', 'diningTable'], // chairs pulled to the table
  ['chair', 'desk'],              // chair tucked under desk
  ['bed', 'nightstand'],
  ['bed', 'upholsteredHeadboard'],
  ['chair', 'ukulele'],           // leaning on the chair
  ['desk', 'ukulele'],            // propped at desk height
  ['bust', 'painting'],           // sculpture standing before artwork
  ['colonnade', 'wallNiche'],     // column standing in the niche
  ['filing', 'filing'],           // filing-cabinet rows
  ['candle', 'candle'],           // votive clusters
  ['toolChest', 'jerrycan'],      // workshop clutter pile
  ['bin', 'searchlight'],
  ['radiatorTall', 'handTruck'],  // truck parked against the radiator
  ['weldingCart', 'pipeManifold'],
  ['cannon', 'ropeBarrier'],      // barrier rings the exhibit
  ['wallNiche', 'painting'],      // art set into the niche
  ['stove', 'handsaw'],           // tools leaned on the stove
  ['bookCart', 'desk'],
  ['payphone', 'stairGate'],
  ['stackShelf', 'toppledColumn'],// column fallen against the shelf
  ['bookshelf', 'libraryLadder'],// ladder leans on the shelf
  ['hatch', 'portcullis'],        // gate beside the service hatch endcap
  ['stairGate', 'balustrade'],    // rails flanking the stair enclosure
  ['bust', 'wallNiche'],          // bust standing in the niche
];

/** True when two props materially share the same floor space. */
export function propsClash(a: PropSpec, b: PropSpec): boolean {
  // Two elevated props are tabletop clutter — authored position is the
  // design; footprint rules only exist to catch furniture-scale embeds.
  if ((a.y ?? 0) > 0.5 && (b.y ?? 0) > 0.5) return false;
  const [ax, az] = propFootprint(a);
  const [bx, bz] = propFootprint(b);
  const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
  if (dx > ax + bx || dz > az + bz) return false;
  const ox = Math.max(0, ax + bx - dx);
  const oz = Math.max(0, az + bz - dz);
  const smallArea = Math.min(ax * az, bx * bz) * 4 || 1;
  const frac = (ox * oz) / smallArea;
  const dist = Math.hypot(dx, dz);
  if (frac < 0.28 && !(dist < 0.5 && ax + az + bx + bz >= 0.8)) return false;
  const [a0, a1] = propVspan(a), [b0, b1] = propVspan(b);
  if (Math.min(a1, b1) - Math.max(a0, b0) < 0.3) return false;
  if (Math.min(a1 - a0, b1 - b0) < 0.5) return false;
  if (a0 >= b1 - 0.15 || b0 >= a1 - 0.15) return false; // tabletop stack
  return true;
}

function resolveWallClashes(props: PropSpec[], w: number, d: number, entry: Port, exits: Port[]): PropSpec[] {
  const lanes = { width: w, depth: d, entry, exits };
  const kept: PropSpec[] = [];
  for (const p of props) {
    if (!p.meta?.wall) { kept.push(p); continue; }
    const sideWall = Math.abs(p.x) > w / 2 - 0.5;
    let placed = p;
    const ok = () =>
      !kept.some((q) => propsClash(placed, q)) &&
      !inDoorLane(lanes, placed.x, placed.z, 0.5) &&
      Math.abs(placed.x) < w / 2 - 0.3 &&
      Math.abs(placed.z) < d / 2 - 0.3;
    for (const shift of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) {
      if (ok()) break;
      placed = sideWall ? { ...p, z: p.z + shift } : { ...p, x: p.x + shift };
    }
    if (ok()) kept.push(placed);
  }
  return kept;
}

const drawerSockets = (spots: [number, number][]): LocalSocket[] =>
  spots.map(([x, z]) => ({ kind: 'drawer' as const, x, z, y: 0, meta: {} }));

const lootSockets = (spots: [number, number][]): LocalSocket[] =>
  spots.map(([x, z]) => ({ kind: 'loot' as const, x, z, y: 0, meta: {} }));

/* ================= CORRIDORS ================= */

const corridorStraight: RoomTemplate = {
  id: 'corr-straight',
  build: (rng) => {
    const d = 7 + rng.int(0, 4);
    return spec('corr-straight', 'corridor', 3.2, d, 2.9, {
    entryOff: 0,
    props: [
      ...wallProps(3.2, d, rng, ['painting', 'wallSconce', 'sign', 'wallClock', 'keyRack', 'exitSign', 'pegRail'], rng.int(2, 4)),
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'fireplace', x: -5.15, z: 0, yaw: Math.PI / 2 },
      { kind: 'medallion', x: 0, z: -2.5, y: 4.3 }, { kind: 'medallion', x: 0, z: 2.5, y: 4.3 },
      { kind: 'payphone', x: 1.3, z: -1.2, yaw: -Math.PI / 2 },
      { kind: 'bin', x: 1.35, z: -0.35, yaw: -Math.PI / 2 },
      { kind: 'conduitRun', x: 0, z: 0, y: 2.72 },
      { kind: 'hangingCable', x: -0.7, z: 1.8, y: 2.75 },
      { kind: 'exitSign', x: 0, z: -d / 2 + 0.12, y: 2.62 },
      { kind: 'extinguisher', x: -1.42, z: 0.6, y: 1.15, yaw: Math.PI / 2 },
      { kind: 'wallVent', x: 1.42, z: 2.4, y: 2.3, yaw: -Math.PI / 2 },
      ...(rng.bool(0.45) ? [{ kind: 'umbrellaStand' as const, x: -1.25, z: -3.1 }] : []),
      ...(rng.bool(0.35) ? [{ kind: 'wetFloor' as const, x: 0.5, z: 2.9, yaw: 0.4 }] : []),
      ...(rng.bool(0.4) ? [{ kind: 'radiatorFin' as const, x: -1.35, z: 1.8, yaw: Math.PI / 2 }] : []),
    ],
    sockets: rng.bool(0.4) ? [{ kind: 'drawer', x: 1.0, z: 1.5, meta: {} }] : [],
    lights: [
      { x: 0, y: 2.6, z: -2, color: 0xffd9a0, intensity: 0.8, range: 5, group: 'main', breakable: true },
      { x: 0, y: 2.6, z: 2, color: 0xffd9a0, intensity: 0.8, range: 5, group: 'main', breakable: true },
    ],
    weight: 20,
    });
  },
};

const corridorWide: RoomTemplate = {
  id: 'corr-wide',
  build: (rng) => spec('corr-wide', 'corridor', 6, 9, 3.2, {
    props: [
      { kind: 'archway', x: 0, z: -0.2, scale: 0.88 },
      { kind: 'transomWindow', x: 0, z: -4.42, y: 2.3 },
      { kind: 'transomWindow', x: 0, z: 4.42, y: 2.3, yaw: Math.PI },
      { kind: 'radiatorFin', x: -2.82, z: 1.2, yaw: Math.PI / 2 },
      { kind: 'radiatorTall', x: 2.82, z: -2.2, yaw: -Math.PI / 2 },
      { kind: 'pillar', x: -2, z: 0, meta: { height: 3.2 } },
      { kind: 'pillar', x: 2, z: 0, meta: { height: 3.2 } },
      { kind: 'sofa', x: -2.2, z: 2.5, yaw: Math.PI / 2 },
      { kind: 'table', x: 2.2, z: 2.5 },
      { kind: 'vase', x: 2.2, z: 2.5, y: 0.8 },
      { kind: 'shipModel', x: 1.55, z: 2.5, y: 0.8 },
      { kind: 'bookshelf', x: -2.6, z: -3.2, yaw: Math.PI / 2 },
      { kind: 'bench', x: -2.3, z: -1.4, yaw: Math.PI / 2 },
      { kind: 'planter', x: 2.6, z: -3.6 },
      { kind: 'wallVent', x: -2.9, z: 1.4, y: 2.2, yaw: Math.PI / 2 },
      { kind: 'breakerPanel', x: 2.85, z: -0.8, y: 0.9, yaw: -Math.PI / 2 },
      { kind: 'planter', x: -2.5, z: 3.7 },
      { kind: 'bin', x: 2.6, z: 1.6 },
      { kind: 'papers', x: 2.0, z: 2.4, y: 0.8 },
      { kind: 'mailCart', x: -2.5, z: 0.2, yaw: Math.PI / 2 },
      { kind: 'luggageRack', x: 2.5, z: 3.6 },
      { kind: 'fireAlarm', x: -2.9, z: -2.0, y: 1.9, yaw: Math.PI / 2 },
      { kind: 'exitSign', x: 0, z: -4.35, y: 2.6 },
      ...(rng.bool(0.4) ? [{ kind: 'wetFloor' as const, x: 0.8, z: -1.6, yaw: 0.7 }] : []),
      ...(rng.bool(0.35) ? [{ kind: 'handTruck' as const, x: 2.55, z: -2.2, yaw: -Math.PI / 2 }] : []),
      ...(rng.bool(0.3) ? [{ kind: 'hangingCable' as const, x: 1.1, z: -0.6, y: 2.9 }] : []),
      ...wallProps(6, 9, rng, ['painting', 'plant', 'wallSconce', 'wallClock', 'pegRail'], 3, { zs: [1.2] }),
    ],
    sockets: lootSockets([[2.2, 2.5]]),
    hiding: [{ kind: 'cabinet', x: -2.4, z: -3, yaw: Math.PI / 2, propKind: 'cabinet' }],
    safeZones: [],
    weight: 8,
  }),
};

const corridorL: RoomTemplate = {
  id: 'corr-l-turn',
  build: (rng) => spec('corr-l-turn', 'corridor', 4, 8, 2.9, {
    exits: [P(1.2, 'e'), P(0, 'n', 1.4)], // exit east; north retained only if branch
    props: [
      ...wallProps(4, 8, rng, ['wallSconce', 'painting', 'curtain', 'wallClock', 'keyRack', 'pegRail'], 3, { zs: [1.2] }),
      { kind: 'conduitRun', x: 0, z: 0, y: 2.68 },
      { kind: 'radiatorFin', x: -1.82, z: -0.6, yaw: Math.PI / 2 },
      { kind: 'wallVent', x: 1.82, z: -2.2, y: 2.25, yaw: -Math.PI / 2 },
      { kind: 'exitSign', x: 1.9, z: 1.2, y: 2.55, yaw: -Math.PI / 2 },
      ...(rng.bool(0.4) ? [{ kind: 'hangingCable' as const, x: 0.3, z: -0.9, y: 2.7 }] : []),
      ...(rng.bool(0.35) ? [{ kind: 'bin' as const, x: -1.6, z: 2.6 }] : []),
    ],
    sockets: rng.bool(0.5) ? drawerSockets([[0.8, 2.2]]) : [],
    nav: [
      { id: 'entry', x: 0, z: -3.1, links: ['elbow'], tags: ['door', 'entry'] },
      { id: 'elbow', x: 0.8, z: 1.2, links: ['entry', 'exit'], tags: ['turn'] },
      { id: 'exit', x: 1.1, z: 1.2, links: ['elbow'], tags: ['door', 'exit'] },
    ],
    weight: 8,
  }),
};

const corridorZig: RoomTemplate = {
  id: 'corr-zigzag',
  build: (rng) => spec('corr-zigzag', 'corridor', 5, 10, 2.9, {
    entryOff: -1.4,
    exits: [P(1.4, 'n')],
    props: [
      { kind: 'partition', x: -0.6, z: -1.4, scale: 2.4 },
      { kind: 'partition', x: 0.9, z: 1.6, scale: 2.6 },
      { kind: 'drawerUnit', x: 1.9, z: -3, yaw: -Math.PI / 2 },
      { kind: 'bin', x: -2.2, z: 3.6 },
      { kind: 'conduitRun', x: 0, z: 0, y: 2.68 },
      { kind: 'wallVent', x: -2.32, z: 0.4, y: 2.25, yaw: Math.PI / 2 },
      { kind: 'extinguisher', x: 2.32, z: 2.8, y: 1.15, yaw: -Math.PI / 2 },
      ...(rng.bool(0.4) ? [{ kind: 'wetFloor' as const, x: -0.9, z: 0.3, yaw: -0.3 }] : []),
      ...(rng.bool(0.35) ? [{ kind: 'hangingCable' as const, x: -0.5, z: -2.6, y: 2.72 }] : []),
      ...(rng.bool(0.35) ? [{ kind: 'radiatorFin' as const, x: 2.3, z: -0.8, yaw: -Math.PI / 2 }] : []),
      ...wallProps(5, 10, rng, ['wallSconce', 'sign', 'wallClock', 'fireAlarm', 'pegRail'], 3, { xs: [1.4] }),
    ],
    sockets: drawerSockets([[1.9, -3]]),
    hiding: [{ kind: 'cabinet', x: -1.9, z: 2.8, yaw: Math.PI / 2, propKind: 'cabinet' }],
    nav: [
      { id: 'entry', x: -1.4, z: -4.1, links: ['j1'], tags: ['door', 'entry'] },
      { id: 'j1', x: -1.0, z: -0.6, links: ['entry', 'j2'], tags: [] },
      { id: 'j2', x: 1.0, z: 0.8, links: ['j1', 'exit'], tags: [] },
      { id: 'exit', x: 1.4, z: 4.1, links: ['j2'], tags: ['door', 'exit'] },
    ],
    weight: 8,
  }),
};

const corridorJunction: RoomTemplate = {
  id: 'corr-junction',
  build: (rng) => spec('corr-junction', 'corridor', 7, 7, 3.0, {
    exits: [P(0, 'n'), P(-1.8, 'w'), P(1.8, 'e')],
    props: [
      { kind: 'pillar', x: 0, z: 0, meta: { height: 3 } },
      ...wallProps(7, 7, rng, ['painting', 'wallSconce', 'wallClock', 'pegRail', 'curtainSwag'], 4, { zs: [-1.8, 1.8] }),
      { kind: 'cabinet', x: 2.6, z: -2.4, yaw: -Math.PI / 2 },
      { kind: 'clock', x: -2.8, z: -2.8 },
      { kind: 'statue', x: 0, z: 2.9, yaw: Math.PI },
      { kind: 'payphone', x: 3.0, z: -1.9, yaw: -Math.PI / 2 },
      { kind: 'bin', x: 3.0, z: -1.1 },
      { kind: 'bench', x: -3.0, z: 0.6, yaw: Math.PI / 2 },
      { kind: 'chainBulb', x: 0, z: 0, y: 2.78 },
      { kind: 'keyRack', x: -1.6, z: -3.32, y: 1.5 },
      { kind: 'mailCart', x: -2.7, z: 1.9, yaw: Math.PI / 2 },
      { kind: 'umbrellaStand', x: 2.7, z: -3.0 },
      { kind: 'exitSign', x: 0, z: -3.4, y: 2.58 },
      { kind: 'exitSign', x: -3.35, z: -1.8, y: 2.58, yaw: Math.PI / 2 },
      ...(rng.bool(0.35) ? [{ kind: 'wetFloor' as const, x: 1.4, z: 0.9, yaw: 1.1 }] : []),
      ...(rng.bool(0.3) ? [{ kind: 'hangingCable' as const, x: 0.9, z: -1.5, y: 2.8 }] : []),
    ],
    sockets: lootSockets([[-2.6, 2.4]]),
    hiding: [{ kind: 'cabinet', x: 2.6, z: -2.4, yaw: -Math.PI / 2, propKind: 'cabinet' }],
    nav: [
      { id: 'entry', x: 0, z: -2.6, links: ['mid'], tags: ['door', 'entry'] },
      { id: 'mid', x: 0, z: 0, links: ['entry', 'exit', 'wBranch', 'eBranch'], tags: ['center'] },
      { id: 'exit', x: 0, z: 2.6, links: ['mid'], tags: ['door', 'exit'] },
      { id: 'wBranch', x: -2.6, z: -1.8, links: ['mid'], tags: ['door', 'branch'] },
      { id: 'eBranch', x: 2.6, z: 1.8, links: ['mid'], tags: ['door', 'branch'] },
    ],
    weight: 6,
    perf: 3,
  }),
};

/* ================= GUEST / HOTEL ================= */

const guestRoom: RoomTemplate = {
  id: 'guest-standard',
  build: (rng) => spec('guest-standard', 'guest', 6.5, 6, 2.9, {
    props: [
      { kind: 'bed', x: -2.4, z: 1.4 },
      { kind: 'drawerUnit', x: -2.8, z: -2.5, yaw: Math.PI },
      { kind: 'desk', x: 2.2, z: -1.6, yaw: -Math.PI / 2 },
      { kind: 'chair', x: 2.0, z: -1.1, yaw: Math.PI / 2 },
      { kind: 'rug', x: 0, z: 0.4 },
      { kind: 'vase', x: -2.8, z: -2.5, y: 0.72 },
      { kind: 'shipModel', x: -2.55, z: -2.45, y: 0.72 },
      { kind: 'fruit', x: -3.05, z: -2.35, y: 0.72 },
      { kind: 'candle', x: 2.2, z: -1.4, y: 0.82 },
      { kind: 'bookshelf', x: 2.62, z: 0.9, yaw: -Math.PI / 2 },
      { kind: 'radiatorFin', x: -2.0, z: -2.86 },
      { kind: 'transomWindow', x: 0, z: -2.92, y: 2.3 },
      { kind: 'suitcase', x: -2.9, z: 0.2, yaw: 0.4 },
      { kind: 'wardrobe', x: 2.6, z: 2.4, yaw: Math.PI },
      { kind: 'nightstand', x: -2.75, z: 1.6 },
      { kind: 'dresser', x: 2.6, z: -0.3, yaw: -Math.PI / 2 },
      { kind: 'vanityTable', x: 2.45, z: 1.1, yaw: -Math.PI / 2 },
      { kind: 'papers', x: 2.2, z: -1.85, y: 0.8 },
      // rod + swag dresses the doorway transom — mounted above the 1.9
      // door-lane exemption (it's over the leaf, not in the walkway)
      { kind: 'curtainRod', x: 0, z: -2.88, y: 2.15, yaw: 0 },
      { kind: 'ottoman', x: -2.4, z: 0.1, yaw: 0.3 },
      { kind: 'pillows', x: -2.4, z: 2.15, y: 0.58 },
      { kind: 'upholsteredHeadboard', x: -2.4, z: 2.62, yaw: Math.PI },
      { kind: 'sideTable', x: -2.9, z: -1.2 },
      { kind: 'radio', x: -2.9, z: -1.2, y: 0.62 },
      { kind: 'ukulele', x: 1.95, z: -1.05, y: 0.48 },
      { kind: 'mousetrap', x: 1.9, z: -2.6 },
      { kind: 'basket', x: -3.0, z: -0.5 },
      { kind: 'ceilingRose', x: 0, z: 0.1, y: 2.86 },
      ...wallProps(6.5, 6, rng, ['painting', 'wallSconce', 'curtain', 'wallClock', 'pegRail', 'curtainSwag', 'drapePanel'], 4),
    ],
    sockets: [...drawerSockets([[-2.8, -2.5], [2.2, -1.6]]), ...lootSockets([[0.5, 2.2]])],
    hiding: [
      { kind: 'cabinet', x: 2.5, z: 2.2, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'underFurniture', x: -2.4, z: 1.4, yaw: Math.PI, propKind: 'bed' },
    ],
    weight: 12,
  }),
};

const guestTwin: RoomTemplate = {
  id: 'guest-twin',
  build: (rng) => spec('guest-twin', 'guest', 7, 6.5, 2.9, {
    props: [
      { kind: 'bed', x: -2.55, z: 1.6 }, { kind: 'bed', x: 2.55, z: 1.6 },
      { kind: 'drawerUnit', x: -3.05, z: -1.9, yaw: Math.PI / 2 },
      { kind: 'trolley', x: 2.6, z: -1.8 },
      { kind: 'partition', x: 0, z: 0.2, scale: 2.2 },
      { kind: 'suitcase', x: 2.9, z: 0.9, yaw: 1.2 },
      { kind: 'bin', x: 3.2, z: 0.2 },
      { kind: 'pillows', x: -2.55, z: 2.3, y: 0.58 }, { kind: 'pillows', x: 2.55, z: 2.3, y: 0.58 },
      { kind: 'upholsteredHeadboard', x: -2.55, z: 2.92, yaw: Math.PI },
      { kind: 'upholsteredHeadboard', x: 2.55, z: 2.92, yaw: Math.PI },
      { kind: 'basket', x: 3.1, z: 2.4 },
      { kind: 'cigs', x: -2.9, z: -1.95, y: 0.72 }, { kind: 'lighter', x: -2.9, z: -1.75, y: 0.72 },
      { kind: 'mousetrap', x: -3.1, z: -0.8 },
      { kind: 'bedBench', x: -1.95, z: -0.15 }, { kind: 'bedBench', x: 1.95, z: -0.15 },
      { kind: 'curtainLong', x: 3.36, z: -1.0, y: 1.18, yaw: -Math.PI / 2 },
      { kind: 'dressingScreen', x: 2.95, z: -2.65, yaw: 0.5 },
      ...wallProps(7, 6.5, rng, ['painting', 'wallSconce', 'wallClock', 'pegRail', 'curtainSwag', 'drapePanel'], 4),
    ],
    sockets: [...drawerSockets([[-3.05, -1.9]]), ...lootSockets([[2.6, -1.8], [-2.8, -2]])],
    hiding: [
      { kind: 'cabinet', x: -3, z: -2.2, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 2.9, z: 1.9, yaw: Math.PI, propKind: 'partition' },
    ],
    safeZones: [{ x: 2.4, z: 1.4, w: 1.4, d: 1.4 }],
    weight: 9,
  }),
};

const suiteSplit: RoomTemplate = {
  id: 'suite-split',
  build: (rng) => spec('suite-split', 'guest', 9, 7, 3.1, {
    entryOff: -2,
    exits: [P(2, 'n')],
    props: [
      { kind: 'partition', x: 0.5, z: -0.5, scale: 4, yaw: Math.PI / 2 },
      { kind: 'fireplace', x: -4.2, z: 0.9, yaw: Math.PI / 2 },
      { kind: 'sofa', x: -2.4, z: 0.8, yaw: Math.PI / 2 },
      { kind: 'table', x: -2.4, z: -0.9 },
      { kind: 'bed', x: 3, z: -0.5 },
      { kind: 'upholsteredHeadboard', x: 3, z: 0.65, yaw: Math.PI },
      { kind: 'dresser', x: 4.25, z: 0.4, yaw: -Math.PI / 2 },
      { kind: 'nightstand', x: 3.9, z: 1.7 },
      { kind: 'wardrobe', x: 4.0, z: -2.6, yaw: Math.PI },
      { kind: 'desk', x: 3, z: -2, yaw: Math.PI },
      { kind: 'suitcase', x: 4.0, z: -0.4, yaw: -0.3 },
      { kind: 'bin', x: -4.0, z: 2.9 },
      { kind: 'papers', x: 2.8, z: -2.1, y: 0.8 },
      { kind: 'coffeeTable', x: -1.6, z: 0.8, yaw: Math.PI / 2 },
      { kind: 'pillows', x: -2.4, z: 1.6, y: 0.72 },
      { kind: 'teaSet', x: -2.4, z: -0.9, y: 0.8 },
      { kind: 'sideTable', x: -3.4, z: 0.8 },
      { kind: 'radio', x: -3.4, z: 0.8, y: 0.62 },
      { kind: 'wineBottles', x: -2.2, z: -0.8, y: 0.8 },
      { kind: 'frameStand', x: 3.0, z: -1.9, y: 0.8 },
      { kind: 'ottoman', x: -1.5, z: 1.7 },
      { kind: 'bedBench', x: 3, z: -1.9 },
      { kind: 'teaTrolley', x: 0.9, z: -1.7, yaw: 0.2 },
      { kind: 'wardrobe', x: -4.0, z: -0.7, yaw: Math.PI / 2 },
      { kind: 'ceilingRose', x: -2.2, z: 0, y: 2.95 },
      { kind: 'curtainLong', x: -4.35, z: -1.6, y: 1.18, yaw: Math.PI / 2 },
      { kind: 'vanityTable', x: 1.3, z: -3.05, yaw: 0 },
      { kind: 'dressingScreen', x: 0.5, z: -3.05, yaw: -0.5 },
      ...wallProps(9, 7, rng, ['painting', 'lamp', 'wallClock', 'pegRail', 'curtainSwag', 'drapePanel', 'curtainRod'], 5, { xs: [2] }),
    ],
    sockets: [...drawerSockets([[3, -2]]), ...lootSockets([[-2.4, -1.4], [-3.6, 2.4]])],
    hiding: [
      { kind: 'cabinet', x: -3.8, z: -0.7, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: -3.6, z: 2.4, yaw: Math.PI / 2, propKind: 'partition' },
      { kind: 'underFurniture', x: 3, z: -0.5, yaw: Math.PI, propKind: 'bed' },
    ],
    safeZones: [{ x: -3.6, z: 2.4, w: 1.4, d: 1.4 }],
    nav: [
      { id: 'entry', x: -2, z: -2.6, links: ['west'], tags: ['door', 'entry'] },
      { id: 'west', x: -2.4, z: 0, links: ['entry', 'around'], tags: [] },
      { id: 'around', x: 0.8, z: 1.8, links: ['west', 'exit'], tags: [] },
      { id: 'exit', x: 2, z: 2.6, links: ['around'], tags: ['door', 'exit'] },
    ],
    weight: 7,
    perf: 3,
  }),
};

const bathAnte: RoomTemplate = {
  id: 'guest-bath-ante',
  build: (rng) => spec('guest-bath-ante', 'guest', 5, 7.5, 2.8, {
    props: [
      { kind: 'counter', x: -1.8, z: 2.6, scale: 1.6 },
      { kind: 'mirror', x: -1.8, z: 2.95, y: 1.6 },
      { kind: 'machineBox', x: 2.0, z: 2.6, scale: 0.8 },
      { kind: 'puddle', x: 0.3, z: 0.6 },
      { kind: 'bin', x: -2.1, z: -3.0 },
      { kind: 'papers', x: -1.8, z: 2.5, y: 1.1 },
      { kind: 'basinSink', x: 2.15, z: -1.2, yaw: -Math.PI / 2 },
      ...wallProps(5, 7.5, rng, ['sign', 'wallSconce', 'wallClock', 'towelRail'], 3),
    ],
    sockets: lootSockets([[-1.8, 2.6], [1.9, -2.8]]),
    hiding: [{ kind: 'vent', x: 2.3, z: 0.5, yaw: -Math.PI / 2, propKind: 'vent' }],
    weight: 5,
    floor: 'stone',
  }),
};

/* ================= RECORDS / ARCHIVE ================= */

const recordsStacks: RoomTemplate = {
  id: 'records-stacks',
  build: (rng) => {
    const w = 8, d = 9;
    const shelves: PropSpec[] = [];
    const cols: LocalCollider[] = [];
    const aisle = rng.pick([2.0, 2.4]);
    for (const sx of [-aisle, 0, aisle]) {
      shelves.push({ kind: 'bookshelf', x: sx, z: 0, yaw: Math.PI / 2 });
      cols.push({ x: sx, z: 0, w: 0.5, d: 6.4, h: 2.3 });
    }
    return spec('records-stacks', 'records', w, d, 3.0, {
      props: [
        ...shelves,
        { kind: 'rollingLadder', x: aisle + 0.5, z: -1.5 },
        { kind: 'deskLamp', x: -3.2, z: 3.4, y: 0.8 },
        { kind: 'desk', x: -3.2, z: 3.4 },
        { kind: 'books', x: -3.5, z: 3.4, y: 0.8 },
        { kind: 'stackShelf', x: 3.55, z: -2.6, yaw: -Math.PI / 2 },
        { kind: 'stackShelf', x: 3.55, z: -0.8, yaw: -Math.PI / 2 },
        { kind: 'stackShelf', x: 3.55, z: 1.0, yaw: -Math.PI / 2 },
        { kind: 'rack', x: 3.4, z: 2.6, yaw: -Math.PI / 2 },
        { kind: 'bookCart', x: -aisle - 0.6, z: 2.8, yaw: 0.25 },
        ...wallProps(w, d, rng, ['paperStack', 'sign', 'wallClock'], 3),
      ],
      colliders: cols,
      sockets: [...drawerSockets([[-3.2, 3.4]]), ...lootSockets([[3.4, 3.4], [-3.4, -3.4]])],
      hiding: [
        { kind: 'cabinet', x: 3.4, z: -3.4, yaw: -Math.PI / 2, propKind: 'cabinet' },
        { kind: 'losAlcove', x: -3.4, z: -0.5, yaw: Math.PI / 2, propKind: 'partition' },
      ],
      safeZones: [{ x: -3.4, z: -0.5, w: 1.2, d: 1.4 }],
      nav: [
        { id: 'entry', x: 0, z: -3.6, links: ['a1'], tags: ['door', 'entry'] },
        { id: 'a1', x: -1.2, z: -2, links: ['entry', 'a2'], tags: ['aisle'] },
        { id: 'a2', x: -1.2, z: 1.6, links: ['a1', 'exit'], tags: ['aisle'] },
        { id: 'exit', x: 0, z: 3.6, links: ['a2'], tags: ['door', 'exit'] },
      ],
      weight: 12,
      darkChance: 0.4,
      perf: 3,
    });
  },
};

const recordsOffice: RoomTemplate = {
  id: 'records-office',
  build: (rng) => spec('records-office', 'records', 7, 6.5, 2.9, {
    props: [
      { kind: 'desk', x: -1.8, z: 0.6 }, { kind: 'desk', x: 1.8, z: 0.6 },
      { kind: 'writingDesk', x: -1.8, z: -1.4 }, { kind: 'desk', x: 1.8, z: -1.4 },
      { kind: 'filing', x: -3, z: 2.4 }, { kind: 'filing', x: -2.4, z: 2.4 },
      { kind: 'filing', x: 3, z: 2.4 },
      { kind: 'printer', x: 3, z: 1.5 },
      { kind: 'bookCart', x: 2.0, z: -2.55, yaw: -0.3 },
      { kind: 'dumbwaiter', x: -3.32, z: -0.6, yaw: Math.PI / 2 },
      { kind: 'typewriter', x: -1.8, z: 0.55, y: 0.78 },
      { kind: 'deskLamp', x: 1.8, z: 0.7, y: 0.8 },
      { kind: 'candle', x: -1.8, z: -1.3, y: 0.8 },
      { kind: 'monitor', x: 1.65, z: 0.75, y: 0.78, yaw: Math.PI },
      { kind: 'monitor', x: -1.7, z: -1.55, y: 0.78 },
      { kind: 'papers', x: 1.9, z: 0.5, y: 0.8 },
      { kind: 'papers', x: -1.6, z: -1.5, y: 0.8 },
      { kind: 'books', x: 1.6, z: -1.3, y: 0.8 },
      { kind: 'magnifier', x: -1.9, z: 0.5, y: 0.78 },
      { kind: 'camera', x: 1.7, z: -1.6, y: 0.78 },
      { kind: 'vidCamera', x: -3.0, z: -2.0, y: 1.15, yaw: 0.6 },
      { kind: 'binoculars', x: 1.9, z: -1.35, y: 0.78 },
      { kind: 'microscope', x: -1.9, z: -1.2, y: 0.78 },
      { kind: 'stapler', x: 1.75, z: 0.45, y: 0.78 },
      { kind: 'stationery', x: -1.6, z: 0.75, y: 0.78 },
      { kind: 'postcards', x: 1.85, z: -1.5, y: 0.78 },
      { kind: 'wristWatch', x: -1.95, z: 0.45, y: 0.78 },
      { kind: 'chemistrySet', x: 1.9, z: -0.9, y: 0.78 },
      { kind: 'glassWall', x: 0, z: -0.4, scale: 1.8 },
      { kind: 'ceilingRose', x: 0, z: 0.6, y: 2.86 },
      { kind: 'board', x: 2.15, z: 2.85, yaw: Math.PI },
      { kind: 'bin', x: -3.1, z: -2.4 },
      { kind: 'apothecaryCabinet', x: 3.15, z: -2.55, yaw: -Math.PI / 2 },
      ...wallProps(7, 6.5, rng, ['paperStack', 'painting', 'sign', 'wallClock'], 4),
    ],
    sockets: [...drawerSockets([[-1.8, 0.6], [1.8, 0.6], [-1.8, -1.4], [1.8, -1.4]]), ...lootSockets([[3, -2.4]])],
    hiding: [
      { kind: 'underFurniture', x: -1.8, z: 0.6, yaw: 0, propKind: 'desk' },
      { kind: 'cabinet', x: 3.1, z: -2.4, yaw: -Math.PI / 2, propKind: 'cabinet' },
    ],
    weight: 10,
  }),
};

const recordsVault: RoomTemplate = {
  id: 'records-vault',
  build: (rng) => spec('records-vault', 'records', 6, 6, 3.4, {
    props: [
      { kind: 'pillar', x: -1.8, z: -1.8, meta: { height: 3.4 } },
      { kind: 'pillar', x: 1.8, z: -1.8, meta: { height: 3.4 } },
      { kind: 'pillar', x: -1.8, z: 1.8, meta: { height: 3.4 } },
      { kind: 'pillar', x: 1.8, z: 1.8, meta: { height: 3.4 } },
      { kind: 'catalogueDesk', x: 0, z: 0 },
      { kind: 'books', x: 0.35, z: -0.3, y: 0.92 },
      { kind: 'papers', x: -0.3, z: 0.35, y: 0.9 },
      { kind: 'shipModel', x: -0.95, z: 0.35, y: 0.9 },
      { kind: 'fishHat', x: 0.55, z: 0.35, y: 0.9 },
      { kind: 'chest', x: -2.2, z: 0.4, yaw: 0.5 },
      { kind: 'magnifier', x: 0.15, z: 0.3, y: 0.92 },
      { kind: 'exhibitLabel', x: 0.15, z: -0.5, y: 0.95 },
      ...wallProps(6, 6, rng, ['wallSconce', 'wallClock'], 4),
    ],
    sockets: lootSockets([[0, 0], [-2.4, 2.4], [2.4, -2.4]]),
    hiding: [
      { kind: 'cabinet', x: -2.4, z: 2.5, yaw: Math.PI / 4, propKind: 'cabinet' },
    ],
    safeZones: [{ x: 2.4, z: 2.4, w: 1.2, d: 1.2 }],
    weight: 6,
    perf: 3,
  }),
};

const recordsCross: RoomTemplate = {
  id: 'records-cross',
  build: (rng) => spec('records-cross', 'records', 10, 8, 3.2, {
    props: [
      { kind: 'bookshelf', x: -2.5, z: -1, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -2.5, z: 1.4, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: 2.5, z: -1, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 2.5, z: 1.4, yaw: -Math.PI / 2 },
      { kind: 'catalogTrack', x: 0, z: 0, y: 2.8, scale: 8 },
      { kind: 'board', x: -4.4, z: 2.8, yaw: Math.PI / 2 },
      { kind: 'rack', x: 4.4, z: 0.4, yaw: -Math.PI / 2 },
      { kind: 'bookCart', x: -1.2, z: -2.6, yaw: 0.5 },
      { kind: 'bookCart', x: 1.4, z: 2.8, yaw: -0.4 },
      ...wallProps(10, 8, rng, ['paperStack', 'wallClock'], 4),
    ],
    colliders: [
      { x: -2.5, z: -1, w: 0.5, d: 2.1, h: 2.3 },
      { x: -2.5, z: 1.4, w: 0.5, d: 2.1, h: 2.3 },
      { x: 2.5, z: -1, w: 0.5, d: 2.1, h: 2.3 },
      { x: 2.5, z: 1.4, w: 0.5, d: 2.1, h: 2.3 },
    ],
    sockets: lootSockets([[-4.2, 3.2], [4.2, 3.2], [0, -3.2]]),
    hiding: [
      { kind: 'cabinet', x: -4.2, z: -3.2, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 4.2, z: -3.2, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 4.2, z: -3.2, w: 1.3, d: 1.3 }],
    nav: [
      { id: 'entry', x: 0, z: -3.1, links: ['mid'], tags: ['door', 'entry'] },
      { id: 'mid', x: 0, z: 0, links: ['entry', 'exit'], tags: ['center'] },
      { id: 'exit', x: 0, z: 3.1, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 7,
    perf: 4,
  }),
};

/* ================= MAINTENANCE ================= */

const maintPipes: RoomTemplate = {
  id: 'maint-pipes',
  build: (_rng) => spec('maint-pipes', 'maintenance', 4, 9, 2.7, {
    props: [
      { kind: 'pipe', x: -1.6, z: 0, y: 2.2, scale: 9 },
      { kind: 'pipe', x: -1.4, z: 0, y: 2.0, scale: 9 },
      { kind: 'machineBox', x: 1.5, z: 2.4, scale: 0.9 },
      { kind: 'steamVent', x: 0.9, z: -1.2 },
      { kind: 'breakerPanel', x: 1.55, z: 0.4, y: 0.7, yaw: -Math.PI / 2 },
      { kind: 'wallVent', x: -1.8, z: -2.2, y: 1.6, yaw: Math.PI / 2 },
      { kind: 'puddle', x: -0.4, z: 1.6 },
      { kind: 'weldingCart', x: 1.4, z: -2.6, yaw: Math.PI },
      { kind: 'generator', x: -1.3, z: -3.4 },
      { kind: 'indPipes', x: 1.95, z: 0, y: 1.5, yaw: -Math.PI / 2 },
      { kind: 'ductRect', x: -1.95, z: -1.5, y: 2.3, yaw: Math.PI / 2 },
      { kind: 'mousetrap', x: 0.4, z: 3.4 },
      { kind: 'hatch', x: -1.6, z: -4.4 },
      { kind: 'dumbwaiter', x: 1.72, z: -0.6, yaw: -Math.PI / 2 },
      { kind: 'ironGrate', x: -0.3, z: 0.6 },
      { kind: 'ironGrate', x: 0.7, z: -3.0 },
      { kind: 'conduitRun', x: -1.95, z: 2.0, y: 1.9, yaw: Math.PI / 2 },
      { kind: 'hangingCable', x: 0, z: 1.5, y: 2.35 },
      { kind: 'valveWheel', x: 1.85, z: 3.6, y: 1.35, yaw: -Math.PI / 2 },
      { kind: 'valveWheel', x: -1.88, z: -3.8, y: 1.5, yaw: Math.PI / 2 },
      { kind: 'grateDrain', x: 0.2, z: -1.4 },
    ],
    sockets: lootSockets([[1.4, -3.4]]),
    hiding: [{ kind: 'vent', x: -1.6, z: 3.4, yaw: Math.PI / 2, propKind: 'vent' }],
    weight: 9,
    floor: 'metal',
  }),
};

const maintBoiler: RoomTemplate = {
  id: 'maint-boiler',
  build: (_rng) => spec('maint-boiler', 'maintenance', 7.5, 8, 3.4, {
    props: [
      { kind: 'machineBox', x: -2.4, z: 0, scale: 1.6 },
      { kind: 'machineBox', x: 2.4, z: -1.6, scale: 1.2 },
      { kind: 'pipe', x: 0, z: -3.2, y: 1.8, scale: 7 },
      { kind: 'steamVent', x: 0.6, z: 1.8 },
      { kind: 'steamVent', x: -1.4, z: 2.6 },
      { kind: 'rubble', x: 1.8, z: 2.8 },
      { kind: 'hatch', x: 2.8, z: -3.85 },
      { kind: 'boilerDrum', x: -2.2, z: -2.4 },
      { kind: 'pipeManifold', x: 3.55, z: 0.4, y: 0, yaw: -Math.PI / 2 },
      { kind: 'locker', x: 3.2, z: 1.2, yaw: -Math.PI / 2 },
      { kind: 'stove', x: -3.2, z: -2.8 },
      { kind: 'trolley', x: -1.2, z: 3.2 },
      { kind: 'generator', x: 0.6, z: -3.0 },
      { kind: 'weldingCart', x: 3.0, z: 0.3, yaw: -Math.PI / 2 },
      { kind: 'bin', x: -3.3, z: 0.6 },
      { kind: 'ductCirc', x: 0, z: -3.9, y: 3.0 },
      { kind: 'gutter', x: 3.65, z: -0.6, y: 2.9, yaw: -Math.PI / 2 },
      { kind: 'sledge', x: -3.5, z: -1.2, yaw: 0.5 },
      { kind: 'handsaw', x: -3.4, z: -2.5, y: 0 },
      { kind: 'valveWheel', x: 3.68, z: -3.0, y: 1.4, yaw: -Math.PI / 2 },
      { kind: 'grateDrain', x: -0.6, z: 0.6 },
      { kind: 'oilCan', x: -3.0, z: -2.4 },
      { kind: 'mousetrap', x: 1.0, z: -3.6 },
      { kind: 'dumbwaiter', x: 1.4, z: 3.72, yaw: Math.PI },
      { kind: 'ironGrate', x: -1.0, z: 0.8 },
      { kind: 'ironGrate', x: 0.8, z: -1.0 },
      { kind: 'sumpPump', x: -2.8, z: 3.4 },
      { kind: 'ductRun', x: 1.0, z: 1.5, y: 3.0, yaw: Math.PI / 2 },
    ],
    sockets: lootSockets([[-3.2, -3.2], [2.8, 3.0]]),
    hiding: [
      { kind: 'cabinet', x: 3.2, z: 1.2, yaw: -Math.PI / 2, propKind: 'locker' },
      { kind: 'losAlcove', x: -3.2, z: 3.0, yaw: Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: -3.2, z: 3.0, w: 1.3, d: 1.3 }],
    weight: 7,
    floor: 'metal',
    darkChance: 0.4,
    perf: 3,
  }),
};

const maintStairsUp: RoomTemplate = {
  id: 'maint-stairs',
  build: (_rng) => spec('maint-stairs', 'maintenance', 5, 8, 4.4, {
    props: [
      { kind: 'stairs', x: 0, z: 1.4, meta: { height: 1.4, length: 3.6 } },
      { kind: 'railing', x: -1.4, z: 1.4, scale: 3.6 },
      { kind: 'pipe', x: 1.8, z: 0, y: 2.6, scale: 8 },
      { kind: 'rubble', x: -1.6, z: -2.6 },
    ],
    colliders: [{ x: 0, z: 3.2, w: 2.4, d: 1.4, h: 0.7, walkable: true }],
    sockets: lootSockets([[1.6, -3.2]]),
    hiding: [{ kind: 'cabinet', x: -1.9, z: 3.4, yaw: Math.PI / 2, propKind: 'locker' }],
    nav: [
      { id: 'entry', x: 0, z: -3.1, links: ['base'], tags: ['door', 'entry'] },
      { id: 'base', x: 0, z: -0.5, links: ['entry', 'top'], tags: [] },
      { id: 'top', x: 0, z: 3.1, y: 0, links: ['base'], tags: ['door', 'exit'] },
    ],
    weight: 6,
    floor: 'metal',
    darkChance: 0.3,
  }),
};

const maintFlooded: RoomTemplate = {
  id: 'maint-flooded',
  build: (_rng) => spec('maint-flooded', 'maintenance', 6.5, 8.5, 2.8, {
    props: [
      { kind: 'puddle', x: 0, z: 0 },
      { kind: 'puddle', x: -1.8, z: 1.8 },
      { kind: 'machineBox', x: -2.6, z: -2.6, scale: 1.1 },
      { kind: 'pipe', x: 0, z: 3.4, y: 2.0, scale: 6 },
      { kind: 'crate', x: 2.4, z: -2.4 },
      { kind: 'crate', x: 2.7, z: -1.5, scale: 0.7 },
      { kind: 'weldingCart', x: -2.8, z: 0.6, yaw: Math.PI / 2 },
      { kind: 'breakerPanel', x: 3.0, z: 2.4, y: 0.7, yaw: -Math.PI / 2 },
      { kind: 'wallVent', x: -3.0, z: -3.4, y: 1.8, yaw: Math.PI / 2 },
      { kind: 'carton', x: 2.7, z: -0.4, yaw: 0.3 },
      { kind: 'pipeManifold', x: -3.0, z: 0.8, yaw: Math.PI / 2 },
      { kind: 'sumpPump', x: -2.6, z: 3.6 },
      { kind: 'ductRun', x: 0, z: -1, y: 2.55, yaw: Math.PI / 2 },
      { kind: 'grateDrain', x: 1.2, z: 0.8 },
      { kind: 'grateDrain', x: -1.6, z: -1.2 },
      { kind: 'valveWheel', x: 3.1, z: -3.4, y: 1.3, yaw: -Math.PI / 2 },
    ],
    sockets: lootSockets([[2.4, -2.4], [-2.8, 3.2]]),
    hiding: [{ kind: 'vent', x: 2.8, z: 3.0, yaw: -Math.PI / 2, propKind: 'vent' }],
    weight: 5,
    floor: 'concrete',
    darkChance: 0.45,
    tags: ['hazard-electrified-eligible'],
  }),
};

/* ================= GALLERY / OBSERVATION ================= */

const galleryPortraits: RoomTemplate = {
  id: 'gallery-portraits',
  build: (_rng) => spec('gallery-portraits', 'gallery', 7, 10, 3.6, {
    props: [
      { kind: 'painting', x: -3.2, z: -2, y: 1.7, yaw: Math.PI / 2 },
      { kind: 'painting', x: -3.2, z: 0.6, y: 1.7, yaw: Math.PI / 2 },
      { kind: 'painting', x: -3.2, z: 3, y: 1.7, yaw: Math.PI / 2 },
      { kind: 'mirror', x: 3.2, z: -1, y: 1.6, yaw: -Math.PI / 2 },
      { kind: 'painting', x: 3.2, z: 1.8, y: 1.7, yaw: -Math.PI / 2 },
      { kind: 'pillar', x: -1.4, z: -0.4, meta: { height: 3.6 } },
      { kind: 'pillar', x: 1.4, z: 0.8, meta: { height: 3.6 } },
      { kind: 'statue', x: 0, z: -3.6 },
      { kind: 'cannon', x: -2.6, z: -3.6, yaw: 0.5 },
      { kind: 'bust', x: -1.4, z: -0.4, y: 1.6 },
      { kind: 'bust', x: 1.4, z: 0.8, y: 1.6 },
      { kind: 'displayCase', x: 0, z: 2.2 },
      { kind: 'ropeBarrier', x: -3.0, z: -2, yaw: Math.PI / 2 },
      { kind: 'ropeBarrier', x: 3.0, z: 1.8, yaw: -Math.PI / 2 },
      { kind: 'exhibitLabel', x: -3.15, z: -2.8, y: 1.35, yaw: Math.PI / 2 },
      { kind: 'exhibitLabel', x: -3.15, z: 1.4, y: 1.35, yaw: Math.PI / 2 },
      { kind: 'chandelier', x: 0, z: 0, y: 3.2 },
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'fireplace', x: -5.15, z: 0, yaw: Math.PI / 2 },
      { kind: 'medallion', x: 0, z: -2.5, y: 4.3 }, { kind: 'medallion', x: 0, z: 2.5, y: 4.3 },
      { kind: 'candelabra', x: 2.6, z: -3.6 },
      { kind: 'curtainSwag', x: -3.15, z: -0.4, y: 2.6, yaw: Math.PI / 2 },
      { kind: 'curtainSwag', x: 3.15, z: 0.4, y: 2.6, yaw: -Math.PI / 2 },
    ],
    sockets: lootSockets([[-2.8, 4.2]]),
    hiding: [
      { kind: 'cabinet', x: 2.8, z: -4.0, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: -2.8, z: -4.0, yaw: Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: -2.8, z: -4.0, w: 1.3, d: 1.3 }],
    weight: 7,
    darkChance: 0.3,
    tags: ['witness-eligible'],
    perf: 3,
    wall: 'woodPanel',
  }),
};

const galleryAtrium: RoomTemplate = {
  id: 'gallery-atrium',
  build: (_rng) => spec('gallery-atrium', 'gallery', 11, 9, 5.0, {
    props: [
      { kind: 'pillar', x: -3.4, z: -2, meta: { height: 5 } },
      { kind: 'pillar', x: 3.4, z: -2, meta: { height: 5 } },
      { kind: 'pillar', x: -3.4, z: 2, meta: { height: 5 } },
      { kind: 'pillar', x: 3.4, z: 2, meta: { height: 5 } },
      { kind: 'chandelier', x: 0, z: 0, y: 4.4 },
      { kind: 'table', x: 0, z: 0, scale: 1.4 },
      { kind: 'hangingPanels', x: -4.5, z: 0, y: 3.2 },
      { kind: 'hangingPanels', x: 4.5, z: 0, y: 3.2 },
      { kind: 'statue', x: -4.2, z: -3.4 },
      { kind: 'statue', x: 4.2, z: 3.4, yaw: Math.PI },
      { kind: 'marbleBust', x: -3.4, z: -1.55, y: 1.35 },
      { kind: 'marbleBust', x: 3.4, z: 1.55, y: 1.35 },
      { kind: 'clock', x: -4.6, z: 3.2, yaw: Math.PI / 2 },
      { kind: 'window', x: -5.2, z: -1, y: 2.2, yaw: Math.PI / 2 },
      { kind: 'window', x: -5.2, z: 1.6, y: 2.2, yaw: Math.PI / 2 },
      { kind: 'colonnade', x: -5.0, z: 0, yaw: Math.PI / 2 },
      { kind: 'archway', x: 0, z: 4.3, yaw: Math.PI },
      { kind: 'medallion', x: 2.6, z: -2.6, y: 4.9 },
      { kind: 'windowArch', x: -5.35, z: -3.3, y: 0.9, yaw: Math.PI / 2 },
      { kind: 'displayCase', x: 0, z: -3.8 },
      { kind: 'displayCase', x: -3.9, z: 3.4, yaw: 0.5 },
      { kind: 'ropeBarrier', x: -4.4, z: -0.4, yaw: Math.PI / 2 },
      { kind: 'ropeBarrier', x: 4.4, z: -0.4, yaw: -Math.PI / 2 },
      { kind: 'plinth', x: 4.2, z: -3.4 },
      { kind: 'bust', x: 4.2, z: -3.4, y: 1.1 },
      { kind: 'globeStand', x: 4.6, z: -2.2, yaw: -0.5 },
    ],
    sockets: lootSockets([[0, 0], [-4.6, 3.6], [4.6, -3.6]]),
    hiding: [
      { kind: 'cabinet', x: -4.6, z: 3.6, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'cabinet', x: 4.6, z: -3.6, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: -4.6, z: -3.6, yaw: Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: -4.6, z: -3.6, w: 1.5, d: 1.5 }],
    nav: [
      { id: 'entry', x: 0, z: -3.6, links: ['w1', 'e1'], tags: ['door', 'entry'] },
      { id: 'w1', x: -1.8, z: 0, links: ['entry', 'exit'], tags: [] },
      { id: 'e1', x: 1.8, z: 0, links: ['entry', 'exit'], tags: [] },
      { id: 'exit', x: 0, z: 3.6, links: ['w1', 'e1'], tags: ['door', 'exit'] },
    ],
    weight: 5,
    perf: 4,
    minRoom: 15,
    wall: 'travertine',
  }),
};

const galleryMezzanine: RoomTemplate = {
  id: 'gallery-mezzanine',
  build: (_rng) => spec('gallery-mezzanine', 'gallery', 8, 9, 4.6, {
    props: [
      { kind: 'stairs', x: -2.6, z: 1.2, meta: { height: 1.8, length: 4 } },
      { kind: 'railing', x: 0, z: 3.2, scale: 7 },
      { kind: 'balustrade', x: -0.4, z: 2.75 },
      { kind: 'balustrade', x: 2.6, z: 2.75 },
      { kind: 'window', x: 3.6, z: 0.4, y: 2.4, yaw: -Math.PI / 2 },
      { kind: 'painting', x: 3.6, z: -2.4, y: 1.8, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: -2.5, z: -2.75 },
      { kind: 'libraryLadder', x: -2.2, z: -2.4, yaw: Math.PI },
      { kind: 'desk', x: 2.4, z: 2.2 },
      { kind: 'papers', x: 2.3, z: 2.0, y: 0.8 },
      { kind: 'books', x: 2.7, z: 2.45, y: 0.8 },
      { kind: 'bin', x: 3.6, z: -1.4 },
      { kind: 'plinth', x: 3.5, z: -2.6 },
      { kind: 'bust', x: 3.5, z: -2.6, y: 1.1 },
    ],
    colliders: [{ x: -2.6, z: 3.2, w: 2.6, d: 1.6, h: 1.8, walkable: true }],
    sockets: [...drawerSockets([[2.4, 2.2]]), ...lootSockets([[0.6, -2.8]])],
    hiding: [
      { kind: 'underFurniture', x: 2.4, z: 2.2, yaw: Math.PI, propKind: 'desk' },
      { kind: 'cabinet', x: -3.4, z: -3.4, yaw: Math.PI / 2, propKind: 'cabinet' },
    ],
    weight: 4,
    minRoom: 20,
    perf: 3,
  }),
};

/* ================= SPECIAL/ANOMALY ================= */

const roomHedge: RoomTemplate = {
  id: 'anomaly-hedge',
  build: (rng) => spec('anomaly-hedge', 'corridor', 6, 11, 3.0, {
    props: [
      { kind: 'partition', x: -1.2, z: -2.4, scale: 3.2 },
      { kind: 'partition', x: 1.2, z: -0.6, scale: 3.4 },
      { kind: 'partition', x: -1.2, z: 1.4, scale: 3.2 },
      { kind: 'partition', x: 1.2, z: 3.0, scale: 2.4 },
      ...wallProps(6, 11, rng, ['wallSconce', 'wallClock'], 4),
    ],
    sockets: lootSockets([[2.4, -4.6]]),
    hiding: [{ kind: 'cabinet', x: -2.5, z: 4.4, yaw: Math.PI / 2, propKind: 'cabinet' }],
    nav: [
      { id: 'entry', x: 0, z: -4.6, links: ['z1'], tags: ['door', 'entry'] },
      { id: 'z1', x: 1.1, z: -1.5, links: ['entry', 'z2'], tags: [] },
      { id: 'z2', x: -1.1, z: 0.4, links: ['z1', 'z3'], tags: [] },
      { id: 'z3', x: 1.1, z: 2.2, links: ['z2', 'exit'], tags: [] },
      { id: 'exit', x: 0, z: 4.6, links: ['z3'], tags: ['door', 'exit'] },
    ],
    weight: 5,
    minRoom: 15,
  }),
};

const roomDorm: RoomTemplate = {
  id: 'guest-dormitory',
  build: (rng) => spec('guest-dormitory', 'guest', 9, 8, 3.0, {
    props: [
      { kind: 'bed', x: -2.8, z: -1.6 }, { kind: 'bed', x: -2.8, z: 1.2 },
      { kind: 'bed', x: 0, z: -1.6 }, { kind: 'bed', x: 0, z: 1.2 },
      { kind: 'bed', x: 2.8, z: -1.6 }, { kind: 'bed', x: 2.8, z: 1.2 },
      { kind: 'suitcase', x: -2.0, z: 0.0, yaw: 0.3 },
      { kind: 'suitcase', x: 1.4, z: 2.6, yaw: -0.8 },
      { kind: 'cageLocker', x: -4.2, z: -3.2, yaw: Math.PI / 2 },
      { kind: 'cageLocker', x: -4.2, z: -1.9, yaw: Math.PI / 2 },
      { kind: 'cageLocker', x: -4.2, z: -0.6, yaw: Math.PI / 2 },
      { kind: 'linenShelf', x: 4.2, z: -2.4, yaw: -Math.PI / 2 },
      ...wallProps(9, 8, rng, ['sign', 'wallSconce', 'wallClock', 'pegRail'], 3),
    ],
    sockets: lootSockets([[-2.8, 3.2], [0, 3.2], [2.8, 3.2]]),
    hiding: [
      { kind: 'underFurniture', x: -2.8, z: -1.6, yaw: 0, propKind: 'bed' },
      { kind: 'underFurniture', x: 2.8, z: 1.2, yaw: Math.PI, propKind: 'bed' },
      { kind: 'cabinet', x: -4.0, z: 3.2, yaw: Math.PI / 2, propKind: 'cabinet' },
    ],
    weight: 5,
    minRoom: 8,
  }),
};

const roomLobbySmall: RoomTemplate = {
  id: 'guest-reception',
  build: (rng) => spec('guest-reception', 'guest', 8, 7, 3.4, {
    props: [
      { kind: 'counter', x: 0, z: 1.8, scale: 3 },
      { kind: 'till', x: 0.6, z: 1.8, y: 1.1 },
      { kind: 'sofa', x: -2.8, z: -1.4, yaw: Math.PI / 2 },
      { kind: 'table', x: -2.8, z: -0.2 },
      { kind: 'plant', x: 3.2, z: -2.6 },
      { kind: 'chandelier', x: 0, z: -0.5, y: 3.0 },
      { kind: 'monitor', x: -0.5, z: 1.75, y: 1.12, yaw: Math.PI },
      { kind: 'monitor', x: 1.35, z: 1.75, y: 1.12, yaw: Math.PI + 0.3 },
      { kind: 'bench', x: 3.35, z: -1.4, yaw: -Math.PI / 2 },
      { kind: 'bench', x: 3.35, z: 0.8, yaw: -Math.PI / 2 },
      { kind: 'planter', x: -3.55, z: -2.6, yaw: Math.PI / 2 },
      { kind: 'bin', x: 2.4, z: -2.7 },
      { kind: 'board', x: 1.6, z: 3.05, yaw: Math.PI },
      { kind: 'bellCart', x: -1.45, z: -2.95, yaw: 0.3 },
      { kind: 'curtainLong', x: 3.85, z: -0.3, y: 1.18, yaw: -Math.PI / 2 },
      { kind: 'settee', x: -3.55, z: 0.7, yaw: Math.PI / 2 },
      ...wallProps(8, 7, rng, ['painting', 'sign', 'wallClock'], 3),
    ],
    sockets: [...lootSockets([[0.6, 1.8], [3.2, 2.8]]), ...drawerSockets([[0, 1.8]])],
    hiding: [
      { kind: 'cabinet', x: 3.4, z: 2.8, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: -3.4, z: 2.8, yaw: Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: -3.4, z: 2.8, w: 1.4, d: 1.4 }],
    weight: 6,
    floor: 'stone',
  }),
};

const roomDarkHall: RoomTemplate = {
  id: 'unlit-hall',
  build: (_rng) => spec('unlit-hall', 'unlit', 5, 9, 2.8, {
    props: [
      { kind: 'paperStack', x: -1.6, z: -1.4 },
      { kind: 'paperStack', x: 1.4, z: 0.6 },
      { kind: 'paperStack', x: -0.8, z: 2.6 },
      { kind: 'shelf', x: 2.0, z: -2.8, yaw: -Math.PI / 2 },
      { kind: 'snare', x: 0, z: 1.2 },
      { kind: 'carton', x: -2.0, z: -3.0, yaw: 0.7 },
      { kind: 'boneArch', x: 0, z: -4.4 },
    ],
    sockets: lootSockets([[2.0, -2.8]]),
    hiding: [
      { kind: 'cabinet', x: -2.0, z: 3.4, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 1.9, z: -3.6, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 1.9, z: -3.6, w: 1.2, d: 1.2 }],
    lights: [{ x: 0, y: 2.5, z: -3, color: 0x8a7a50, intensity: 0.25, range: 4, group: 'dim', breakable: true }],
    weight: 8,
    darkChance: 0.85,
    minRoom: 85,
    floor: 'paper',
  }),
};

const roomUnlitStacks: RoomTemplate = {
  id: 'unlit-stacks',
  build: (_rng) => spec('unlit-stacks', 'unlit', 9, 9, 3.2, {
    props: [
      { kind: 'bookshelf', x: -2.2, z: -1, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: 0.4, z: -1, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: 2.8, z: -1, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -1.2, z: 2.2, yaw: Math.PI / 2 },
      { kind: 'snare', x: -1.8, z: 0.8 },
      { kind: 'snare', x: 1.4, z: -2.6 },
    ],
    colliders: [
      { x: -2.2, z: -1, w: 0.5, d: 2.1, h: 2.3 },
      { x: 0.4, z: -1, w: 0.5, d: 2.1, h: 2.3 },
      { x: 2.8, z: -1, w: 0.5, d: 2.1, h: 2.3 },
      { x: -1.2, z: 2.2, w: 0.5, d: 2.1, h: 2.3 },
    ],
    sockets: lootSockets([[-3.6, 3.4], [3.6, 3.4]]),
    hiding: [
      { kind: 'cabinet', x: -3.6, z: -3.4, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 3.6, z: -3.4, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 3.6, z: -3.4, w: 1.3, d: 1.3 }],
    lights: [{ x: 0, y: 2.8, z: 0, color: 0x776a45, intensity: 0.2, range: 5, group: 'dim', breakable: true }],
    weight: 7,
    darkChance: 0.9,
    minRoom: 85,
    perf: 3,
  }),
};

// The Sunken Vault — endgame mill architecture: arch-framed doors, vault
// ceiling panels, a portcullised side bay, and a bier someone left open.
const roomUnlitVault: RoomTemplate = {
  id: 'unlit-vault',
  build: (_rng) => spec('unlit-vault', 'unlit', 10, 12, 4.2, {
    props: [
      { kind: 'archway', x: 0, z: -5.8 },
      { kind: 'boneArch', x: 0, z: 5.8, yaw: Math.PI },
      { kind: 'vault', x: 0, z: -2.8, y: 3.9 },
      { kind: 'vault', x: 0, z: 2.8, y: 3.9 },
      { kind: 'medallion', x: 0, z: 0, y: 4.15 },
      { kind: 'portcullis', x: -4.9, z: 0, y: 0, yaw: Math.PI / 2 },
      { kind: 'coffin', x: 0, z: 1.2 },
      { kind: 'watcherFigure', x: -3.8, z: -4.6, yaw: Math.PI / 4 },
      { kind: 'statue', x: 4.0, z: -4.8, yaw: -Math.PI / 4 },
      { kind: 'statue', x: 4.0, z: 4.8, yaw: -Math.PI * 0.75 },
      { kind: 'bust', x: -4.2, z: 2.6, y: 1.1 },
      { kind: 'rubblePile', x: 3.4, z: -1.2 },
      { kind: 'rubblePile', x: -2.8, z: 3.6 },
      { kind: 'rootGrowth', x: 4.6, z: 0.4 },
      { kind: 'candle', x: -1.1, z: 0.6 },
      { kind: 'candle', x: 1.2, z: 2.0 },
      { kind: 'candle', x: -0.6, z: 3.1 },
      { kind: 'toppledColumn', x: -2.0, z: -3.6, yaw: 0.4 },
      { kind: 'paperStack', x: -1.8, z: -3.2 },
      { kind: 'snare', x: 1.6, z: -2.4 },
      { kind: 'puddle', x: -1.2, z: -0.8 },
    ],
    sockets: lootSockets([[-4.2, 2.6], [3.4, -1.2]]),
    hiding: [
      { kind: 'cabinet', x: -4.4, z: -4.4, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 4.4, z: 4.2, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 4.4, z: 4.2, w: 1.3, d: 1.3 }],
    lights: [
      { x: -1.1, y: 1.4, z: 0.6, color: 0xffa04a, intensity: 0.28, range: 3.5, group: 'dim', breakable: true },
      { x: 0, y: 3.2, z: -4.0, color: 0x776a45, intensity: 0.16, range: 4, group: 'dim', breakable: true },
    ],
    weight: 6,
    darkChance: 0.9,
    minRoom: 88,
    perf: 5,
    floor: 'stone',
  }),
};

// The Undercroft — a low crypt aisle: shelf-niches, a floor hatch that
// doesn't go anywhere you want, and tenants seated where they were left.
const roomUnlitCrypt: RoomTemplate = {
  id: 'unlit-crypt',
  build: (_rng) => spec('unlit-crypt', 'unlit', 8, 10, 3.0, {
    props: [
      { kind: 'stackShelf', x: -3.4, z: -1.4, yaw: Math.PI / 2 },
      { kind: 'stackShelf', x: -3.4, z: 1.2, yaw: Math.PI / 2 },
      { kind: 'stackShelf', x: 3.4, z: -0.2, yaw: -Math.PI / 2 },
      { kind: 'coffin', x: 0.6, z: -3.0, yaw: Math.PI / 2 },
      { kind: 'deadTenant', x: -2.6, z: 4.2, yaw: Math.PI },
      { kind: 'dollCluster', x: 1.8, z: 4.0 },
      { kind: 'hatch', x: 2.4, z: 1.4 },
      { kind: 'wallVent', x: -3.9, z: -3.2, y: 2.2, yaw: Math.PI / 2 },
      { kind: 'mirror', x: 0, z: 4.92, y: 1.55, yaw: Math.PI },
      { kind: 'candle', x: -1.0, z: -4.0 },
      { kind: 'candle', x: 2.2, z: -4.2 },
      { kind: 'boneArch', x: 0, z: -4.9 },
      { kind: 'toppledColumn', x: -2.4, z: -0.6, yaw: -0.3 },
      { kind: 'ironGrate', x: 0.8, z: -1.4 },
      { kind: 'weedCluster', x: -1.4, z: 0.2 },
      { kind: 'rootGrowth', x: 3.0, z: 3.4 },
      { kind: 'paperScatter', x: -0.8, z: 1.8 },
      { kind: 'snare', x: -1.6, z: -1.8 },
      { kind: 'puddle', x: 0.8, z: 0.4 },
    ],
    colliders: [
      { x: -3.4, z: -1.4, w: 0.6, d: 1.8, h: 2.3 },
      { x: -3.4, z: 1.2, w: 0.6, d: 1.8, h: 2.3 },
      { x: 3.4, z: -0.2, w: 0.6, d: 1.8, h: 2.3 },
    ],
    sockets: lootSockets([[2.6, -4.3], [-3.0, -4.3]]),
    hiding: [
      { kind: 'cabinet', x: 3.4, z: -4.3, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: -3.4, z: -4.3, yaw: Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: -3.4, z: -4.3, w: 1.2, d: 1.2 }],
    lights: [{ x: -1.0, y: 1.3, z: -4.0, color: 0xffa04a, intensity: 0.24, range: 3, group: 'dim', breakable: true }],
    weight: 6,
    darkChance: 0.92,
    minRoom: 88,
    perf: 4,
    floor: 'stone',
  }),
};

const roomClinic: RoomTemplate = {
  id: 'special-clinic',
  build: (_rng) => spec('special-clinic', 'safe', 7, 6, 2.9, {
    props: [
      { kind: 'bed', x: -2.2, z: 1.2 }, { kind: 'bed', x: -0.4, z: 1.2 },
      { kind: 'trolley', x: 1.4, z: 1.0 },
      { kind: 'counter', x: 2.8, z: -1.8, scale: 1.8 },
      { kind: 'sign', x: 0, z: 2.9, y: 1.9 },
      { kind: 'curtain', x: -1.3, z: 1.2, yaw: Math.PI / 2 },
    ],
    sockets: lootSockets([[2.8, -1.8], [1.4, 1.0]]),
    hiding: [{ kind: 'cabinet', x: -3.0, z: -2.2, yaw: Math.PI / 2, propKind: 'cabinet' }],
    weight: 0, // placed explicitly by the generator
    special: 'clinic',
    floor: 'stone',
    darkChance: 0,
  }),
};

const roomConservatory: RoomTemplate = {
  id: 'special-conservatory',
  build: (_rng) => spec('special-conservatory', 'safe', 10, 9, 4.5, {
    props: [
      { kind: 'plant', x: -3.4, z: -3 }, { kind: 'plant', x: 3.4, z: -3 },
      { kind: 'plant', x: -3.4, z: 3 }, { kind: 'plant', x: 3.4, z: 3 },
      { kind: 'plant', x: -1.0, z: -3.3 },
      { kind: 'quiverTree', x: -3.0, z: -0.5 }, { kind: 'quiverTree', x: 3.0, z: 0.8 },
      { kind: 'deadTree', x: -4.0, z: 1.2 },
      { kind: 'window', x: -4.8, z: 0, y: 2.4, yaw: Math.PI / 2 },
      { kind: 'window', x: 4.8, z: 0, y: 2.4, yaw: -Math.PI / 2 },
      { kind: 'table', x: 0, z: 0.4, scale: 1.3 },
      { kind: 'chandelier', x: 0, z: 0, y: 4.0 },
      { kind: 'statue', x: 0, z: -3.8 },
      { kind: 'vase', x: 0.4, z: 0.4, y: 1.05 },
      { kind: 'plant', x: -1.6, z: -2.6 }, { kind: 'plant', x: 1.6, z: -2.6 },
      { kind: 'seedTray', x: -0.5, z: 0.3, y: 1.05 },
      { kind: 'wateringCan', x: 0.9, z: 0.9 },
      { kind: 'treeStump', x: 4.1, z: -1.8 },
      { kind: 'moss', x: -2.4, z: 1.8 }, { kind: 'moss', x: 2.6, z: -1.2 },
      { kind: 'stone', x: -4.3, z: -0.6 },
      { kind: 'candle', x: -0.4, z: 0.4, y: 1.05 },
    ],
    sockets: lootSockets([[0, 0.4], [-4.2, 3.8]]),
    hiding: [],
    weight: 0,
    special: 'conservatory',
    darkChance: 0,
    perf: 3,
  }),
};

const roomPuzzleValve: RoomTemplate = {
  id: 'puzzle-valve',
  build: (_rng) => spec('puzzle-valve', 'maintenance', 6, 7, 2.9, {
    props: [
      { kind: 'machineBox', x: 0, z: 2.6, scale: 1.4 },
      { kind: 'keypad', x: 1.2, z: 2.6, y: 1.2 },
      { kind: 'pipe', x: -1.8, z: 2.8, y: 1.4, scale: 5 },
      { kind: 'pipe', x: -1.5, z: 2.8, y: 1.1, scale: 5 },
      { kind: 'steamVent', x: -0.6, z: 0.4 },
    ],
    sockets: [{ kind: 'key', x: 1.2, z: 2.6, meta: { puzzle: 'valve' } }, ...lootSockets([[-2.2, -2.4]])],
    hiding: [{ kind: 'vent', x: 2.4, z: -2.6, yaw: -Math.PI / 2, propKind: 'vent' }],
    weight: 5,
    minRoom: 10,
    tags: ['key-room'],
  }),
};

const roomArchiveAlcove: RoomTemplate = {
  id: 'records-alcoves',
  build: (_rng) => spec('records-alcoves', 'records', 8, 8, 3.0, {
    props: [
      { kind: 'partition', x: -2.4, z: -1.6, scale: 2.4 },
      { kind: 'partition', x: 2.4, z: -1.6, scale: 2.4 },
      { kind: 'partition', x: -2.4, z: 1.8, scale: 2.4 },
      { kind: 'partition', x: 2.4, z: 1.8, scale: 2.4 },
      { kind: 'drawerUnit', x: -3.4, z: -0.2, yaw: Math.PI / 2 },
      { kind: 'drawerUnit', x: 3.4, z: 0.4, yaw: -Math.PI / 2 },
      { kind: 'paperStack', x: 0, z: 0.2 },
      { kind: 'board', x: 3.4, z: -3.2, yaw: -Math.PI / 2 },
      { kind: 'bin', x: -3.5, z: -3.0, yaw: Math.PI / 2 },
    ],
    sockets: [...drawerSockets([[-3.4, -0.2], [3.4, 0.4]]), ...lootSockets([[0, 3.4]])],
    hiding: [
      { kind: 'losAlcove', x: -2.4, z: -2.6, yaw: Math.PI, propKind: 'partition' },
      { kind: 'losAlcove', x: 2.4, z: 2.6, yaw: 0, propKind: 'partition' },
      { kind: 'cabinet', x: 0, z: -3.4, yaw: 0, propKind: 'cabinet' },
    ],
    safeZones: [{ x: -2.4, z: -2.8, w: 1.4, d: 1.0 }, { x: 2.4, z: 2.8, w: 1.4, d: 1.0 }],
    weight: 8,
  }),
};

const roomGalleryBroken: RoomTemplate = {
  id: 'gallery-broken',
  build: (_rng) => spec('gallery-broken', 'gallery', 9, 8, 4.0, {
    props: [
      { kind: 'rubble', x: -1.6, z: 0.6 },
      { kind: 'rubble', x: 1.2, z: 1.8 },
      { kind: 'hangingPanels', x: 0, z: -0.6, y: 2.6 },
      { kind: 'deadTree', x: -2.6, z: 2.6 },
      { kind: 'stone', x: -0.4, z: 1.2 },
      { kind: 'stone', x: 2.0, z: 0.4 },
      { kind: 'moss', x: -2.0, z: -1.0 },
      { kind: 'pillar', x: -3.0, z: -2.2, meta: { height: 4 } },
      { kind: 'pillar', x: 3.0, z: 2.2, meta: { height: 4 } },
      { kind: 'toppledColumn', x: 0.8, z: -1.6, yaw: 0.35 },
      { kind: 'toppledColumn', x: -3.4, z: 0.2, yaw: -0.9 },
      { kind: 'wallNiche', x: -4.45, z: 1.8, y: 0, yaw: Math.PI / 2 },
      { kind: 'wallNiche', x: 4.45, z: -1.6, y: 0, yaw: -Math.PI / 2 },
      { kind: 'window', x: 0, z: 3.8, y: 2.2 },
      { kind: 'curtain', x: -1.4, z: 3.8 },
      { kind: 'curtain', x: 1.4, z: 3.8 },
      { kind: 'displayCase', x: 3.6, z: 2.4, yaw: -0.4 },
      { kind: 'ropeBarrier', x: 0.4, z: -2.6 },
    ],
    sockets: lootSockets([[3.6, -3.0]]),
    hiding: [
      { kind: 'losAlcove', x: -3.6, z: 3.0, yaw: Math.PI / 2, propKind: 'partition' },
      { kind: 'cabinet', x: 3.6, z: 3.2, yaw: -Math.PI / 2, propKind: 'cabinet' },
    ],
    safeZones: [{ x: -3.6, z: 3.0, w: 1.4, d: 1.4 }],
    weight: 4,
    minRoom: 25,
    darkChance: 0.4,
    perf: 3,
  }),
};

const roomLongHall: RoomTemplate = {
  id: 'corr-grand-hall',
  build: (rng) => spec('corr-grand-hall', 'corridor', 5.5, 14, 3.4, {
    props: [
      { kind: 'pillar', x: -1.8, z: -4, meta: { height: 3.4 } },
      { kind: 'pillar', x: 1.8, z: -4, meta: { height: 3.4 } },
      { kind: 'pillar', x: -1.8, z: 0, meta: { height: 3.4 } },
      { kind: 'pillar', x: 1.8, z: 0, meta: { height: 3.4 } },
      { kind: 'pillar', x: -1.8, z: 4, meta: { height: 3.4 } },
      { kind: 'pillar', x: 1.8, z: 4, meta: { height: 3.4 } },
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'fireplace', x: -5.15, z: 0, yaw: Math.PI / 2 },
      { kind: 'medallion', x: 0, z: -2.5, y: 4.3 }, { kind: 'medallion', x: 0, z: 2.5, y: 4.3 },
      { kind: 'planter', x: -2.2, z: -5.9, yaw: Math.PI / 2 },
      { kind: 'planter', x: 2.2, z: 5.9, yaw: Math.PI / 2 },
      { kind: 'bin', x: 2.3, z: -5.9 },
      { kind: 'horseStatue', x: 0, z: -6.2 },
      { kind: 'transomWindow', x: 0, z: -6.92, y: 2.42 },
      { kind: 'transomWindow', x: 0, z: 6.92, y: 2.42, yaw: Math.PI },
      { kind: 'wallNiche', x: -2.68, z: -1.8, y: 0, yaw: Math.PI / 2 },
      { kind: 'wallNiche', x: 2.68, z: 1.8, y: 0, yaw: -Math.PI / 2 },
      { kind: 'console', x: -2.2, z: 2.2, yaw: Math.PI / 2 },
      { kind: 'teaSet', x: -2.2, z: 2.0, y: 0.92 },
      { kind: 'frameStand', x: -2.2, z: 2.5, y: 0.92 },
      { kind: 'roundTable', x: 2.2, z: -1.8 },
      { kind: 'wineBottles', x: 2.1, z: -1.9, y: 0.78 },
      { kind: 'goblets', x: 2.35, z: -1.7, y: 0.78 },
      { kind: 'ottoman', x: -2.2, z: -0.6 },
      { kind: 'radiatorTall', x: -2.62, z: -3.0, yaw: Math.PI / 2 },
      { kind: 'radiatorTall', x: 2.62, z: 3.1, yaw: -Math.PI / 2 },
      { kind: 'bellCart', x: 2.44, z: 4.6, yaw: -Math.PI / 2 },
      ...wallProps(5.5, 14, rng, ['painting', 'wallSconce', 'wallClock', 'pegRail'], 5, { zs: [1.4] }),
    ],
    hiding: [
      { kind: 'cabinet', x: -2.3, z: 6, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'cabinet', x: 2.3, z: -6, yaw: -Math.PI / 2, propKind: 'cabinet' },
    ],
    weight: 6,
    perf: 3,
    wall: 'woodPanel',
  }),
};

const roomBranchCloset: RoomTemplate = {
  id: 'corr-closet-branch',
  build: (rng) => spec('corr-closet-branch', 'corridor', 5, 8, 2.9, {
    exits: [P(0, 'n'), P(1.4, 'e', 1.1)],
    props: [
      { kind: 'cabinet', x: 2.1, z: 1.4, yaw: -Math.PI / 2 },
      { kind: 'drawerUnit', x: -2.0, z: 1.8, yaw: Math.PI / 2 },
      { kind: 'bin', x: -2.2, z: -2.6 },
      { kind: 'radiatorFin', x: -2.32, z: -0.4, yaw: Math.PI / 2 },
      { kind: 'wallVent', x: 2.32, z: -1.6, y: 2.25, yaw: -Math.PI / 2 },
      { kind: 'keyRack', x: -0.8, z: -3.85, y: 1.5 },
      { kind: 'exitSign', x: 0, z: -3.9, y: 2.55 },
      { kind: 'exitSign', x: 2.4, z: 1.4, y: 2.35, yaw: -Math.PI / 2 },
      { kind: 'conduitRun', x: 0, z: 0, y: 2.7 },
      ...(rng.bool(0.4) ? [{ kind: 'hallTree' as const, x: 2.0, z: -3.3, yaw: -Math.PI / 2 }] : []),
      ...(rng.bool(0.35) ? [{ kind: 'hangingCable' as const, x: -0.9, z: -1.1, y: 2.72 }] : []),
      ...wallProps(5, 8, rng, ['wallSconce', 'sign', 'wallClock', 'pegRail'], 3),
      { kind: 'linenHamper', x: -2.15, z: -1.3 },
    ],
    sockets: [...drawerSockets([[-2.0, 1.8]]), ...lootSockets([[2.1, 1.4]])],
    hiding: [{ kind: 'cabinet', x: 2.1, z: 1.4, yaw: -Math.PI / 2, propKind: 'cabinet' }],
    weight: 7,
  }),
};

const roomStorage: RoomTemplate = {
  id: 'guest-storage',
  build: (_rng) => spec('guest-storage', 'guest', 6, 6.5, 2.8, {
    props: [
      { kind: 'crate', x: -1.8, z: -1.8 }, { kind: 'crate', x: -1.1, z: -1.9, scale: 0.7 },
      { kind: 'crate', x: 1.8, z: 1.6 }, { kind: 'crate', x: 2.2, z: 0.8, scale: 0.8 },
      { kind: 'trolley', x: 0.2, z: -2.2 },
      { kind: 'shelf', x: -2.4, z: 2.2 },
      { kind: 'paperStack', x: 1.0, z: 0.2 },
      { kind: 'carton', x: -0.4, z: 1.8, yaw: 0.5 },
      { kind: 'carton', x: 2.55, z: 2.4, yaw: -0.4 },
      { kind: 'spinningWheel', x: -0.6, z: 0.4, yaw: 0.5 },
      { kind: 'chest', x: 1.4, z: -1.6, yaw: -0.4 },
      { kind: 'basket', x: 0.6, z: 1.9 },
      { kind: 'suitcase', x: -2.6, z: 0.6, yaw: 0.9 },
      { kind: 'mousetrap', x: 2.0, z: -0.4 },
      { kind: 'football', x: -1.2, z: 2.5 },
      { kind: 'cheeseBox', x: -2.0, z: 0.9 },
      { kind: 'carvedPlate', x: 0.9, z: 1.1 },
      { kind: 'cageLocker', x: 2.65, z: -0.4, yaw: -Math.PI / 2 },
      { kind: 'linenHamper', x: -2.65, z: -1.0 },
      { kind: 'linenShelf', x: -2.85, z: 0.5, yaw: Math.PI / 2 },
    ],
    sockets: lootSockets([[-1.8, -1.8], [1.8, 1.6], [-2.4, 2.2], [0.2, -2.2]]),
    hiding: [
      { kind: 'cabinet', x: 2.4, z: -2.4, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: -0.8, z: 2.4, yaw: Math.PI, propKind: 'partition' },
    ],
    safeZones: [{ x: -0.8, z: 2.4, w: 1.3, d: 1.1 }],
    weight: 8,
  }),
};

const roomNarrowService: RoomTemplate = {
  id: 'maint-service-narrow',
  build: (_rng) => spec('maint-service-narrow', 'maintenance', 2.6, 10, 2.5, {
    props: [
      { kind: 'pipe', x: -1.0, z: 0, y: 2.0, scale: 10 },
      { kind: 'pipe', x: 1.0, z: 0, y: 1.7, scale: 10 },
      { kind: 'indPipes', x: -1.15, z: -2.0 },
      { kind: 'cableTray', x: 1.15, z: 1.0 },
      { kind: 'machineBox', x: 0.8, z: 3.2, scale: 0.6 },
      { kind: 'mousetrap', x: -0.9, z: -3.4 },
      { kind: 'snare', x: 0, z: -1.5 },
      { kind: 'hatch', x: 0, z: 4.7, yaw: Math.PI },
      { kind: 'portcullis', x: 1.1, z: 4.75, yaw: Math.PI },
      { kind: 'conduitRun', x: 1.15, z: -3.5, y: 1.6, yaw: -Math.PI / 2 },
      { kind: 'hangingCable', x: 0, z: -4.2, y: 2.15 },
    ],
    hiding: [{ kind: 'vent', x: -0.9, z: 4.0, yaw: Math.PI / 2, propKind: 'vent' }],
    sockets: lootSockets([[0.8, 3.2]]),
    weight: 6,
    floor: 'metal',
    darkChance: 0.5,
  }),
};

const roomElevatorLobby: RoomTemplate = {
  id: 'gallery-lift-lobby',
  build: (_rng) => spec('gallery-lift-lobby', 'gallery', 7, 7, 3.6, {
    props: [
      { kind: 'liftShaft', x: -2.6, z: 2.8 },
      { kind: 'scissorgate', x: -2.6, z: 2.3, yaw: Math.PI },
      { kind: 'liftShaft', x: 2.6, z: 2.8 },
      { kind: 'scissorgate', x: 2.6, z: 2.3, yaw: Math.PI },
      { kind: 'trolley', x: -3.0, z: -1.8 },
      { kind: 'sign', x: 0, z: 3.4, y: 2.6 },
      { kind: 'plant', x: 3.0, z: -1.8 },
      { kind: 'chandelier', x: 0, z: 0, y: 3.2 },
      { kind: 'streetSeat', x: 0, z: -2.8 },
      { kind: 'sideTable', x: 3.0, z: -0.6 },
      { kind: 'mousetrap', x: -2.0, z: -2.4 },
      { kind: 'displayCase', x: 0, z: 0.9 },
      { kind: 'ropeBarrier', x: 0, z: 1.9 },
      { kind: 'exhibitLabel', x: 0.55, z: 0.55, y: 1.3 },
    ],
    sockets: lootSockets([[-3.0, -1.8]]),
    hiding: [{ kind: 'cabinet', x: 3.2, z: 1.4, yaw: -Math.PI / 2, propKind: 'cabinet' }],
    weight: 4,
    minRoom: 55,
    floor: 'stone',
    perf: 3,
  }),
};

const roomRecordsCage: RoomTemplate = {
  id: 'records-cage-room',
  build: (rng) => spec('records-cage-room', 'records', 7, 7.5, 3.0, {
    props: [
      { kind: 'recordsCage', x: -1.4, z: -0.8 },
      { kind: 'recordsCage', x: 1.4, z: -0.8 },
      { kind: 'recordsCage', x: 0, z: 2.2 },
      { kind: 'desk', x: -2.6, z: 2.6 },
      { kind: 'libraryLadder', x: 1.45, z: -0.35, yaw: 0 },
      { kind: 'bookCart', x: 2.8, z: 1.4, yaw: 0.4 },
      { kind: 'cageLocker', x: 1.3, z: -3.35, yaw: 0 },
      ...wallProps(7, 7.5, rng, ['paperStack', 'sign', 'wallClock'], 3),
    ],
    sockets: [...drawerSockets([[-2.6, 2.6]]), ...lootSockets([[2.6, 2.8]])],
    hiding: [{ kind: 'cabinet', x: 2.8, z: -3.0, yaw: -Math.PI / 2, propKind: 'cabinet' }],
    weight: 6,
    minRoom: 12,
  }),
};

const roomObsGallery: RoomTemplate = {
  id: 'gallery-observation',
  build: (_rng) => spec('gallery-observation', 'gallery', 8, 9, 4.2, {
    props: [
      { kind: 'window', x: -3.8, z: -2, y: 2.0, yaw: Math.PI / 2 },
      { kind: 'window', x: -3.8, z: 0.4, y: 2.0, yaw: Math.PI / 2 },
      { kind: 'window', x: -3.8, z: 2.8, y: 2.0, yaw: Math.PI / 2 },
      { kind: 'desk', x: 2.6, z: 0.2, yaw: -Math.PI / 2 },
      { kind: 'machineBox', x: 3.2, z: -2.6, scale: 1.0 },
      { kind: 'hangingPanels', x: 0, z: 1.4, y: 2.8 },
      { kind: 'serverRack', x: -2.0, z: 3.9, yaw: Math.PI },
      { kind: 'serverRack', x: -1.2, z: 3.9, yaw: Math.PI },
      { kind: 'serverRack', x: -0.4, z: 3.9, yaw: Math.PI },
      { kind: 'monitor', x: 2.55, z: -0.1, y: 0.78, yaw: -Math.PI / 2 },
    ],
    sockets: [...drawerSockets([[2.6, 0.2]]), ...lootSockets([[-3.2, -3.6]])],
    hiding: [
      { kind: 'underFurniture', x: 2.6, z: 0.2, yaw: Math.PI / 2, propKind: 'desk' },
      { kind: 'losAlcove', x: -3.2, z: 3.8, yaw: Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: -3.2, z: 3.8, w: 1.3, d: 1.2 }],
    weight: 6,
    minRoom: 18,
    tags: ['witness-eligible'],
    perf: 3,
  }),
};

const roomCrawl: RoomTemplate = {
  id: 'maint-crawl',
  build: (_rng) => spec('maint-crawl', 'maintenance', 4, 8, 2.2, {
    props: [
      { kind: 'pipe', x: -1.2, z: 0, y: 1.7, scale: 8 },
      { kind: 'crate', x: 1.2, z: -2.2, scale: 0.7 },
      { kind: 'rubble', x: -1.0, z: 1.4 },
      { kind: 'vent', x: 1.4, z: 2.8, yaw: -Math.PI / 2 },
      { kind: 'carton', x: -1.4, z: -2.8, yaw: 0.6 },
      { kind: 'indPipes', x: -1.85, z: 0.6 },
      { kind: 'mousetrap', x: 0.6, z: -3.2 },
      { kind: 'hangingCable', x: 0, z: -2.0, y: 1.95 },
    ],
    sockets: lootSockets([[1.2, -2.2]]),
    hiding: [{ kind: 'vent', x: 1.4, z: 2.8, yaw: -Math.PI / 2, propKind: 'vent' }],
    weight: 4,
    floor: 'concrete',
    darkChance: 0.55,
  }),
};

const roomRotunda: RoomTemplate = {
  id: 'gallery-rotunda',
  build: (_rng) => spec('gallery-rotunda', 'gallery', 9, 9, 4.8, {
    props: [
      { kind: 'pillar', x: -2.6, z: -2.6, meta: { height: 4.8 } },
      { kind: 'pillar', x: 2.6, z: -2.6, meta: { height: 4.8 } },
      { kind: 'pillar', x: -2.6, z: 2.6, meta: { height: 4.8 } },
      { kind: 'pillar', x: 2.6, z: 2.6, meta: { height: 4.8 } },
      { kind: 'catalogueDesk', x: 0, z: 0 },
      { kind: 'chandelier', x: 0, z: 0, y: 4.2 },
      { kind: 'catalogTrack', x: 0, z: -3.5, y: 4.0, scale: 7 },
      { kind: 'colonnade', x: 4.4, z: 0, yaw: -Math.PI / 2 },
      { kind: 'archway', x: 0, z: -4.2 },
    ],
    sockets: lootSockets([[0, 0], [-4, 0], [4, 0]]),
    hiding: [
      { kind: 'losAlcove', x: -4, z: -4, yaw: Math.PI / 4, propKind: 'partition' },
      { kind: 'losAlcove', x: 4, z: 4, yaw: -Math.PI / 4, propKind: 'partition' },
    ],
    safeZones: [{ x: -4, z: -4, w: 1.3, d: 1.3 }, { x: 4, z: 4, w: 1.3, d: 1.3 }],
    weight: 3,
    minRoom: 30,
    perf: 4,
    wall: 'travertine',
  }),
};

const roomMotelCorridor: RoomTemplate = {
  id: 'corr-doors-row',
  build: (rng) => spec('corr-doors-row', 'corridor', 6, 9, 3.0, {
    props: [
      { kind: 'painting', x: -2.8, z: -2.4, y: 1.7, yaw: Math.PI / 2 },
      { kind: 'painting', x: 2.8, z: -0.8, y: 1.7, yaw: -Math.PI / 2 },
      { kind: 'painting', x: -2.8, z: 1.2, y: 1.7, yaw: Math.PI / 2 },
      { kind: 'cabinet', x: 2.4, z: 3.2, yaw: -Math.PI / 2 },
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'fireplace', x: -5.15, z: 0, yaw: Math.PI / 2 },
      { kind: 'medallion', x: 0, z: -2.5, y: 4.3 }, { kind: 'medallion', x: 0, z: 2.5, y: 4.3 },
      { kind: 'payphone', x: 2.55, z: -3.4, yaw: -Math.PI / 2 },
      { kind: 'bench', x: -2.5, z: -3.3, yaw: Math.PI / 2 },
      { kind: 'bin', x: 2.5, z: -2.3 },
      { kind: 'keyRack', x: 1.4, z: -4.35, y: 1.5 },
      { kind: 'radiatorFin', x: -2.82, z: 2.4, yaw: Math.PI / 2 },
      { kind: 'wallVent', x: 2.82, z: 0.6, y: 2.3, yaw: -Math.PI / 2 },
      { kind: 'exitSign', x: 0, z: -4.42, y: 2.55 },
      { kind: 'conduitRun', x: 0, z: 0, y: 2.76 },
      ...(rng.bool(0.4) ? [{ kind: 'luggageRack' as const, x: -2.4, z: 0.4, yaw: Math.PI / 2 }] : []),
      ...(rng.bool(0.35) ? [{ kind: 'wetFloor' as const, x: -0.9, z: -1.4, yaw: 0.9 }] : []),
    ],
    sockets: lootSockets([[2.4, 3.2], [-2.4, -3.2]]),
    hiding: [{ kind: 'cabinet', x: 2.4, z: 3.2, yaw: -Math.PI / 2, propKind: 'cabinet' }],
    weight: 9,
    tags: ['redactor-eligible'],
  }),
};

const roomOfficeBullpen: RoomTemplate = {
  id: 'records-bullpen',
  build: (_rng) => spec('records-bullpen', 'records', 9, 8, 3.0, {
    props: [
      { kind: 'desk', x: -2.6, z: -1.4 }, { kind: 'writingDesk', x: 0, z: -1.4 }, { kind: 'desk', x: 2.6, z: -1.4 },
      { kind: 'desk', x: -2.6, z: 1.0 }, { kind: 'desk', x: 0, z: 1.0 }, { kind: 'desk', x: 2.6, z: 1.0 },
      { kind: 'filing', x: -3.8, z: 3.0 }, { kind: 'filing', x: -3.1, z: 3.0 },
      { kind: 'waterCooler', x: 3.8, z: 3.0 },
      { kind: 'typewriter', x: 0, z: -1.45, y: 0.78 },
      { kind: 'monitor', x: -2.7, z: -1.55, y: 0.78 },
      { kind: 'monitor', x: 0.15, z: -1.55, y: 0.78 },
      { kind: 'monitor', x: 2.5, z: -1.55, y: 0.78 },
      { kind: 'monitor', x: -2.5, z: 0.85, y: 0.78, yaw: Math.PI },
      { kind: 'monitor', x: 0.15, z: 0.85, y: 0.78, yaw: Math.PI },
      { kind: 'monitor', x: 2.7, z: 0.85, y: 0.78, yaw: Math.PI },
      { kind: 'chair', x: -2.6, z: -0.55, yaw: Math.PI },
      { kind: 'chair', x: 0, z: -0.55, yaw: Math.PI },
      { kind: 'chair', x: 2.6, z: -0.55, yaw: Math.PI },
      { kind: 'chair', x: -2.6, z: 1.85 },
      { kind: 'chair', x: 2.6, z: 1.85 },
      { kind: 'papers', x: -2.4, z: -1.3, y: 0.8 },
      { kind: 'papers', x: 0.2, z: 1.2, y: 0.8 },
      { kind: 'books', x: 2.8, z: -1.5, y: 0.8 },
      { kind: 'glassWall', x: -3.6, z: -0.4, scale: 3.2, yaw: Math.PI / 2 },
      { kind: 'board', x: -0.8, z: 3.2, yaw: Math.PI },
      { kind: 'bin', x: 3.9, z: 2.2 },
    ],
    sockets: [...drawerSockets([[-2.6, -1.4], [0, -1.4], [2.6, -1.4], [-2.6, 1.0], [0, 1.0], [2.6, 1.0]]), ...lootSockets([[3.8, -3.2]])],
    hiding: [
      { kind: 'underFurniture', x: 0, z: -1.4, yaw: 0, propKind: 'desk' },
      { kind: 'underFurniture', x: -2.6, z: 1.0, yaw: Math.PI, propKind: 'desk' },
      { kind: 'cabinet', x: 3.8, z: -3.2, yaw: -Math.PI / 2, propKind: 'cabinet' },
    ],
    weight: 7,
    minRoom: 15,
    perf: 3,
  }),
};

const roomAnomalyTall: RoomTemplate = {
  id: 'anomaly-tall',
  build: (_rng) => spec('anomaly-tall', 'corridor', 4, 6, 7.5, {
    props: [
      { kind: 'rollingLadder', x: 1.2, z: 0.5 },
      { kind: 'bookshelf', x: -1.4, z: 0, yaw: Math.PI / 2 },
      { kind: 'hangingPanels', x: 0, z: 1.5, y: 5.5 },
      { kind: 'wallSconce', x: -1.8, z: -2, y: 4.5 },
      { kind: 'wallSconce', x: 1.8, z: 2, y: 6.0 },
    ],
    hiding: [{ kind: 'cabinet', x: -1.5, z: 2.2, yaw: Math.PI / 2, propKind: 'cabinet' }],
    weight: 2,
    minRoom: 35,
    darkChance: 0.5,
    perf: 3,
    special: 'tall',
  }),
};

const roomImpossible: RoomTemplate = {
  id: 'anomaly-impossible',
  build: (_rng) => spec('anomaly-impossible', 'corridor', 5, 12, 3.0, {
    entryOff: 0,
    exits: [P(0, 'n')],
    props: [
      { kind: 'partition', x: 0, z: -2.0, scale: 3.6 },
      { kind: 'partition', x: 0, z: 2.0, scale: 3.6 },
      { kind: 'sign', x: -1.2, z: -1.9, y: 1.6 },
      { kind: 'sign', x: 1.2, z: 2.1, y: 1.6 },
      { kind: 'paperStack', x: 0, z: 0 },
      { kind: 'cabinet', x: -2.0, z: 0, yaw: Math.PI / 2 },
    ],
    hiding: [{ kind: 'cabinet', x: -2.0, z: 0, yaw: Math.PI / 2, propKind: 'cabinet' }],
    nav: [
      { id: 'entry', x: 0, z: -5.1, links: ['r1'], tags: ['door', 'entry'] },
      { id: 'r1', x: -1.8, z: -2.0, links: ['entry', 'r2'], tags: [] },
      { id: 'r2', x: -1.8, z: 2.0, links: ['r1', 'r3'], tags: [] },
      { id: 'r3', x: 0, z: 3.6, links: ['r2', 'exit'], tags: [] },
      { id: 'exit', x: 0, z: 5.1, links: ['r3'], tags: ['door', 'exit'] },
    ],
    weight: 2,
    minRoom: 40,
    special: 'impossible',
  }),
};

const roomGreenRecords: RoomTemplate = {
  id: 'records-green',
  build: (_rng) => spec('records-green', 'records', 7.5, 8, 3.1, {
    props: [
      { kind: 'shelf', x: -3.2, z: -1, yaw: Math.PI / 2 },
      { kind: 'shelf', x: -3.2, z: 1.4, yaw: Math.PI / 2 },
      { kind: 'shelf', x: 3.2, z: 0.2, yaw: -Math.PI / 2 },
      { kind: 'desk', x: 0, z: 1.8 },
      { kind: 'deskLamp', x: 0.3, z: 1.75, y: 0.78 },
      { kind: 'monitor', x: -0.35, z: 1.7, y: 0.78, yaw: Math.PI },
      { kind: 'papers', x: 0.55, z: 1.95, y: 0.8 },
      { kind: 'plant', x: 0, z: -3.2 },
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'fireplace', x: -5.15, z: 0, yaw: Math.PI / 2 },
      { kind: 'medallion', x: 0, z: -2.5, y: 4.3 }, { kind: 'medallion', x: 0, z: 2.5, y: 4.3 },
    ],
    sockets: [...drawerSockets([[0, 1.8]]), ...lootSockets([[-3.2, 3.4], [3.2, -3.0]])],
    hiding: [
      { kind: 'underFurniture', x: 0, z: 1.8, yaw: 0, propKind: 'desk' },
      { kind: 'cabinet', x: -3.2, z: 3.4, yaw: Math.PI / 2, propKind: 'cabinet' },
    ],
    weight: 8,
    floor: 'carpet',
  }),
};

const roomDuel: RoomTemplate = {
  id: 'guest-two-baths',
  build: (_rng) => spec('guest-two-baths', 'guest', 8.5, 7, 2.9, {
    entryOff: -1.5,
    exits: [P(1.5, 'n')],
    props: [
      { kind: 'partition', x: 0.6, z: 0, scale: 6, yaw: Math.PI / 2 },
      { kind: 'bed', x: -2.6, z: 1.6 },
      // right bed shifted east — its footboard corner clipped the exit
      // door rectangle at x1.5 (see clearDoorLanes)
      { kind: 'bed', x: 3.25, z: 1.6 },
      { kind: 'drawerUnit', x: -3.6, z: -2.2 },
      { kind: 'drawerUnit', x: 3.7, z: -2.2 },
      { kind: 'lamp', x: -2.6, z: -0.8 },
      { kind: 'bin', x: 1.6, z: -3.0 },
      { kind: 'basinSink', x: -0.4, z: -3.2, yaw: 0 }, { kind: 'basinSink', x: 2.6, z: -3.2, yaw: 0 },
      { kind: 'towelRail', x: -0.4, z: -3.35, y: 1.35, yaw: 0 }, { kind: 'towelRail', x: 2.6, z: -3.35, y: 1.35, yaw: 0 },
      { kind: 'bedBench', x: -2.6, z: 0.3 }, { kind: 'bedBench', x: 3.25, z: 0.3 },
      { kind: 'headboard', x: -2.6, z: 3.0, yaw: Math.PI }, { kind: 'headboard', x: 3.15, z: 3.0, yaw: Math.PI },
      { kind: 'vanityTable', x: 3.95, z: -0.9, yaw: -Math.PI / 2 },
    ],
    sockets: [...drawerSockets([[-3.6, -2.2], [3.7, -2.2]]), ...lootSockets([[0.4, 2.8]])],
    hiding: [
      { kind: 'underFurniture', x: -2.6, z: 1.6, yaw: Math.PI, propKind: 'bed' },
      { kind: 'underFurniture', x: 3.25, z: 1.6, yaw: Math.PI, propKind: 'bed' },
      { kind: 'cabinet', x: 0.6, z: -2.6, yaw: 0, propKind: 'cabinet' },
    ],
    nav: [
      { id: 'entry', x: -1.5, z: -2.6, links: ['j'], tags: ['door', 'entry'] },
      { id: 'j', x: -1.5, z: 0, links: ['entry', 'exit'], tags: [] },
      { id: 'exit', x: 1.5, z: 2.6, links: ['j'], tags: ['door', 'exit'] },
    ],
    weight: 5,
    minRoom: 5,
  }),
};

const maintServer: RoomTemplate = {
  id: 'maint-server',
  build: (_rng) => spec('maint-server', 'maintenance', 8, 10, 3.0, {
    props: [
      { kind: 'serverRack', x: -1.7, z: -2.4, yaw: Math.PI },
      { kind: 'serverRack', x: -1.7, z: -1.4, yaw: Math.PI },
      { kind: 'serverRack', x: -1.7, z: -0.4, yaw: Math.PI },
      { kind: 'serverRack', x: -1.7, z: 0.6, yaw: Math.PI },
      { kind: 'serverRack', x: -1.7, z: 1.6, yaw: Math.PI },
      { kind: 'serverRack', x: 1.7, z: -2.4 },
      { kind: 'serverRack', x: 1.7, z: -1.4 },
      { kind: 'serverRack', x: 1.7, z: -0.4 },
      { kind: 'serverRack', x: 1.7, z: 0.6 },
      { kind: 'serverRack', x: 1.7, z: 1.6 },
      { kind: 'weldingCart', x: -3.0, z: -3.4 },
      { kind: 'bin', x: 3.3, z: -3.4 },
      { kind: 'ductRect', x: -3.6, z: 0.6 },
      { kind: 'cableTray', x: 3.6, z: 3.0 },
      { kind: 'indPipes', x: 3.6, z: -1.4 },
      { kind: 'toolChest', x: -3.2, z: 0.4, yaw: Math.PI / 2 },
      { kind: 'circuitBoard', x: -3.1, z: 0.5, y: 0.92 },
      { kind: 'propaneTorch', x: -3.2, z: 1.4 },
      { kind: 'searchlight', x: 2.9, z: -3.2, yaw: 0.6 },
      { kind: 'pipeManifold', x: -3.85, z: -2.0, yaw: Math.PI / 2 },
      { kind: 'boilerDrum', x: 2.9, z: -4.4 },
      { kind: 'breakerPanel', x: -3.85, z: 2.6, y: 0.8, yaw: Math.PI / 2 },
    ],
    sockets: lootSockets([[-3.2, 3.4], [3.2, 2.2]]),
    hiding: [{ kind: 'cabinet', x: -3.3, z: 3.4, yaw: Math.PI / 2, propKind: 'locker' }],
    lights: [
      { x: 0, y: 2.6, z: -2.6, color: 0xcfd8e8, intensity: 0.5, range: 5, group: 'dim', breakable: true },
      { x: 0, y: 2.6, z: 1.8, color: 0xcfd8e8, intensity: 0.4, range: 5, group: 'dim', breakable: true },
    ],
    nav: [
      { id: 'entry', x: 0, z: -4.1, links: ['mid'], tags: ['door', 'entry'] },
      { id: 'mid', x: 0, z: -0.4, links: ['entry', 'exit'], tags: ['aisle'] },
      { id: 'exit', x: 0, z: 4.1, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 6,
    minRoom: 30,
    floor: 'metal',
    darkChance: 0.35,
    perf: 4,
  }),
};

const roomVaulted: RoomTemplate = {
  id: 'gallery-vaulted',
  build: (_rng) => spec('gallery-vaulted', 'gallery', 10, 10, 6, {
    props: [
      { kind: 'pillar', x: -3, z: -3, meta: { height: 6 } },
      { kind: 'pillar', x: 3, z: -3, meta: { height: 6 } },
      { kind: 'pillar', x: -3, z: 3, meta: { height: 6 } },
      { kind: 'pillar', x: 3, z: 3, meta: { height: 6 } },
      { kind: 'chandelier', x: 0, z: -2, y: 5.2 },
      { kind: 'chandelier', x: 0, z: 2, y: 5.2 },
      { kind: 'painting', x: -4.8, z: 0, y: 2.4, yaw: Math.PI / 2 },
      { kind: 'painting', x: 4.8, z: 0, y: 2.4, yaw: -Math.PI / 2 },
      { kind: 'statue', x: -4.3, z: -4.3 },
      { kind: 'cannon', x: 0, z: -4.3, yaw: 0.3 },
      { kind: 'vault', x: 0, z: 0, y: 5.65 },
      { kind: 'archway', x: 0, z: 4.8, yaw: Math.PI },
      { kind: 'statue', x: 4.3, z: 4.3, yaw: Math.PI },
      { kind: 'marbleBust', x: -3, z: -2.55, y: 1.35 },
      { kind: 'marbleBust', x: 3, z: 2.55, y: 1.35 },
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'fireplace', x: -5.15, z: 0, yaw: Math.PI / 2 },
      { kind: 'medallion', x: 0, z: -2.5, y: 4.3 }, { kind: 'medallion', x: 0, z: 2.5, y: 4.3 },
    ],
    sockets: lootSockets([[0, 0], [-4.2, 4.2], [4.2, -4.2]]),
    hiding: [
      { kind: 'cabinet', x: -4.2, z: 4.2, yaw: Math.PI / 4, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 4.2, z: 4.2, yaw: -Math.PI / 4, propKind: 'partition' },
    ],
    safeZones: [{ x: 4.2, z: 4.2, w: 1.4, d: 1.4 }],
    weight: 3,
    minRoom: 25,
    perf: 4,
    wall: 'travertine',
  }),
};

/* ================= MILESTONE SHELLS (special-handled) ================= */

const roomIndexAntechamber: RoomTemplate = {
  id: 'ms-index-ante',
  build: () => spec('ms-index-ante', 'milestone', 6, 7, 4.2, {
    props: [
      { kind: 'pillar', x: -2, z: -1, meta: { height: 4.2 } },
      { kind: 'pillar', x: 2, z: -1, meta: { height: 4.2 } },
      { kind: 'sign', x: 0, z: 3.4, y: 2.6 },
      { kind: 'wallSconce', x: -2.6, z: 0, y: 2.0 },
      { kind: 'wallSconce', x: 2.6, z: 0, y: 2.0 },
    ],
    hiding: [{ kind: 'cabinet', x: -2.4, z: 2.6, yaw: Math.PI / 2, propKind: 'cabinet' }],
    weight: 0, special: 'indexAnte', floor: 'stone', darkChance: 0,
  }),
};

const roomDecompress: RoomTemplate = {
  id: 'ms-decompress',
  build: (rng) => spec('ms-decompress', 'milestone', 3.4, 8, 3.0, {
    props: wallProps(3.4, 8, rng, ['wallSconce', 'wallClock'], 3),
    weight: 0, special: 'decompress', floor: 'stone', darkChance: 0,
  }),
};

const roomFinalAnte: RoomTemplate = {
  id: 'ms-final-ante',
  build: () => spec('ms-final-ante', 'milestone', 5, 6, 3.4, {
    props: [
      { kind: 'sign', x: 0, z: 2.9, y: 2.0 },
      { kind: 'wallSconce', x: -2.2, z: 0, y: 2.0 },
      { kind: 'wallSconce', x: 2.2, z: 0, y: 2.0 },
      { kind: 'counter', x: -1.9, z: 1.8, scale: 1.4 },
    ],
    sockets: lootSockets([[-1.9, 1.8]]),
    hiding: [{ kind: 'cabinet', x: 1.9, z: 1.8, yaw: -Math.PI / 2, propKind: 'cabinet' }],
    weight: 0, special: 'finalAnte', floor: 'stone', darkChance: 0,
  }),
};

/* ================= SPRINT-10 THEMED ROOMS ================= */

const roomMorgue: RoomTemplate = {
  id: 'morgue-drawers',
  build: (_rng) => spec('morgue-drawers', 'maintenance', 8, 9, 3.0, {
    props: [
      { kind: 'morgueDrawer', x: -3.55, z: -2.4, yaw: Math.PI / 2 },
      { kind: 'morgueDrawer', x: -3.55, z: 0.0, yaw: Math.PI / 2 },
      { kind: 'morgueDrawer', x: -3.55, z: 2.4, yaw: Math.PI / 2 },
      { kind: 'morgueDrawer', x: 3.55, z: -1.6, yaw: -Math.PI / 2 },
      { kind: 'morgueDrawer', x: 3.55, z: 1.0, yaw: -Math.PI / 2 },
      { kind: 'gurney', x: -0.8, z: -1.1, yaw: 0.12 },
      { kind: 'gurney', x: 1.0, z: 1.5, yaw: -0.2 },
      { kind: 'counter', x: -2.0, z: 4.0, yaw: Math.PI },
      { kind: 'medBox', x: 1.9, z: 4.35, y: 1.4, yaw: Math.PI },
      { kind: 'wetFloor', x: 1.3, z: -2.2 },
      { kind: 'bucket', x: -1.7, z: 3.5 },
      { kind: 'extinguisher', x: 2.2, z: -4.3, y: 1.4 },
      { kind: 'wheelchair', x: 2.9, z: 3.6, yaw: -0.7 },
      { kind: 'plasticChair', x: -2.6, z: -4.0, yaw: 0.9 },
      { kind: 'toolbox', x: -2.0, z: 3.4, y: 0.92 },
      { kind: 'utilityBox', x: -3.85, z: -4.1, y: 1.6, yaw: Math.PI / 2 },
      { kind: 'ceilingHook', x: 0, z: -3.0, y: 2.63 },
      { kind: 'ceilingHook', x: 1.2, z: 0.8, y: 2.63 },
    ],
    sockets: [...drawerSockets([[-2.0, 4.0]]), ...lootSockets([[-0.8, -1.1], [1.0, 1.5]])],
    hiding: [
      { kind: 'underFurniture', x: -0.8, z: -1.1, yaw: 0, propKind: 'gurney' },
      { kind: 'cabinet', x: 2.9, z: -3.8, yaw: Math.PI, propKind: 'locker' },
    ],
    lights: [
      { x: 0, y: 2.62, z: -1.6, color: 0xd4e8dc, intensity: 0.85, range: 8, group: 'main', breakable: true },
      { x: 0, y: 2.62, z: 2.6, color: 0xd4e8dc, intensity: 0.5, range: 6, group: 'dim', breakable: true },
    ],
    nav: [
      { id: 'entry', x: 0, z: -4.1, links: ['mid'], tags: ['door', 'entry'] },
      { id: 'mid', x: 0.2, z: 0.2, links: ['entry', 'exit'], tags: ['aisle'] },
      { id: 'exit', x: 0, z: 4.1, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 7,
    minRoom: 20,
    floor: 'stone',
    wall: 'tile',
    darkChance: 0.15,
    perf: 4,
  }),
};

const roomLaundry: RoomTemplate = {
  id: 'laundry-hall',
  build: (_rng) => spec('laundry-hall', 'maintenance', 7, 10, 3.0, {
    props: [
      { kind: 'washer', x: -2.9, z: -3.4, yaw: Math.PI / 2 },
      { kind: 'washer', x: -2.9, z: -2.4, yaw: Math.PI / 2 },
      { kind: 'washer', x: -2.9, z: -1.4, yaw: Math.PI / 2 },
      { kind: 'washer', x: -2.9, z: -0.4, yaw: Math.PI / 2 },
      { kind: 'washer', x: -2.9, z: 0.6, yaw: Math.PI / 2 },
      { kind: 'washer', x: 2.9, z: -2.9, yaw: -Math.PI / 2 },
      { kind: 'washer', x: 2.9, z: -1.9, yaw: -Math.PI / 2 },
      { kind: 'washer', x: 2.9, z: -0.9, yaw: -Math.PI / 2 },
      { kind: 'washer', x: 2.9, z: 0.1, yaw: -Math.PI / 2 },
      { kind: 'trolley', x: 0.4, z: 2.2, yaw: 0.4 },
      { kind: 'plasticCrate', x: -2.6, z: 2.4 },
      { kind: 'plasticCrate', x: -2.3, z: 3.1, yaw: 0.5 },
      { kind: 'bucket', x: 2.4, z: 2.2 },
      { kind: 'wetFloor', x: -0.6, z: -0.9 },
      { kind: 'puddle', x: 0.8, z: -1.8 },
      { kind: 'puddle', x: -1.9, z: -0.6 },
      { kind: 'steamVent', x: -2.1, z: 4.4 },
      { kind: 'extinguisher', x: 2.9, z: 4.4, y: 1.4, yaw: Math.PI },
      { kind: 'toolCart', x: -2.5, z: 4.0, yaw: 0.3 },
      { kind: 'wallHose', x: 2.0, z: 4.85, y: 1.1, yaw: Math.PI },
      { kind: 'linenHamper', x: -1.9, z: 4.4 },
      { kind: 'cageLocker', x: -3.19, z: 4.3, yaw: Math.PI / 2 },
      { kind: 'basinSink', x: 1.9, z: -4.6, yaw: 0 },
      { kind: 'stackedLinen', x: 2.9, z: 3.2, yaw: -Math.PI / 2 },
    ],
    sockets: lootSockets([[0.4, 2.6], [-2.6, 3.4]]),
    hiding: [{ kind: 'cabinet', x: 2.9, z: 3.6, yaw: -Math.PI / 2, propKind: 'locker' }],
    lights: [
      { x: 0, y: 2.62, z: -2.4, color: 0xdde4ee, intensity: 0.55, range: 6, group: 'dim', breakable: true },
      { x: 0, y: 2.62, z: 1.8, color: 0xdde4ee, intensity: 0.55, range: 6, group: 'dim', breakable: true },
    ],
    nav: [
      { id: 'entry', x: 0, z: -4.6, links: ['a', 'mid'], tags: ['door', 'entry'] },
      { id: 'a', x: -0.5, z: -2.0, links: ['entry', 'mid'], tags: [] },
      { id: 'mid', x: 0.3, z: 0.6, links: ['a', 'exit'], tags: ['aisle'] },
      { id: 'exit', x: 0, z: 4.6, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 7,
    minRoom: 25,
    floor: 'metal',
    wall: 'tile',
    darkChance: 0.3,
    perf: 4,
  }),
};

const roomBoilerDetail: RoomTemplate = {
  id: 'boiler-tank-room',
  build: (_rng) => spec('boiler-tank-room', 'maintenance', 8, 9, 3.4, {
    props: [
      { kind: 'boilerTank', x: 0, z: 0.8, yaw: Math.PI / 2 },
      { kind: 'propaneTank', x: -3.2, z: 3.4 },
      { kind: 'propaneTank', x: -2.7, z: 3.6, yaw: 0.4 },
      { kind: 'pipeManifold', x: 3.5, z: -1.0, y: 0 },
      { kind: 'pipeManifold', x: -3.5, z: -1.6, y: 0 },
      { kind: 'barrel', x: 2.9, z: -3.4 },
      { kind: 'barrel', x: 3.3, z: -2.8, yaw: 0.7 },
      { kind: 'toolChest', x: -3.0, z: -3.4 },
      { kind: 'wrench', x: -3.0, z: -3.4, y: 0.95 },
      { kind: 'multimeter', x: -2.6, z: -3.4, y: 0.95 },
      { kind: 'wetFloor', x: 1.6, z: -2.0 },
      { kind: 'steamVent', x: 2.4, z: 1.8 },
      { kind: 'extinguisher', x: -2.0, z: -4.3, y: 1.4 },
      { kind: 'stove', x: 2.8, z: 3.4 },
      { kind: 'jerrycan', x: -3.4, z: -3.0 },
      { kind: 'jerrycan', x: -3.1, z: -2.6, yaw: 0.8 },
      { kind: 'lpgTank', x: 3.5, z: 0.6 },
      { kind: 'toolbox', x: -2.5, z: -3.0, y: 0 },
      { kind: 'powerBox', x: 3.85, z: -2.2, y: 1.6, yaw: -Math.PI / 2 },
      { kind: 'benchVice', x: -3.0, z: -3.2, y: 0.95 },
      { kind: 'sledge', x: -3.6, z: -0.4, yaw: 0.4 },
      { kind: 'handsaw', x: -3.1, z: -3.15, y: 0.95 },
      { kind: 'screwdrivers', x: -2.8, z: -3.5, y: 0.95 },
      { kind: 'oilCan', x: -2.4, z: -3.3, y: 0.95 },
      { kind: 'lightbulb', x: -2.2, z: -3.15, y: 0.95 },
      { kind: 'mousetrap', x: 1.2, z: -3.6 },
      { kind: 'instrPanel', x: 3.6, z: 2.6, yaw: -Math.PI / 2 },
      { kind: 'handDrill', x: -2.0, z: -3.4, y: 0.95 },
    ],
    sockets: [...lootSockets([[-3.0, -3.4], [2.8, 3.4]]), ...drawerSockets([[-3.0, -3.4]])],
    hiding: [{ kind: 'cabinet', x: -3.4, z: 1.6, yaw: Math.PI / 2, propKind: 'locker' }],
    lights: [
      { x: 0, y: 2.9, z: -2.2, color: 0xffd9a0, intensity: 0.55, range: 6, group: 'dim', breakable: true },
      { x: 0, y: 2.9, z: 2.4, color: 0xff9a50, intensity: 0.5, range: 5, group: 'warning', breakable: false },
    ],
    nav: [
      { id: 'entry', x: 0, z: -4.1, links: ['l', 'r'], tags: ['door', 'entry'] },
      { id: 'l', x: -1.9, z: -0.6, links: ['entry', 'mid'], tags: [] },
      { id: 'r', x: 1.9, z: -0.6, links: ['entry', 'mid'], tags: [] },
      { id: 'mid', x: 0, z: 2.4, links: ['l', 'r', 'exit'], tags: [] },
      { id: 'exit', x: 0, z: 4.1, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 8,
    minRoom: 25,
    floor: 'metal',
    darkChance: 0.35,
    perf: 5,
  }),
};

const roomCubicleOffice: RoomTemplate = {
  id: 'cubicle-office',
  build: (_rng) => spec('cubicle-office', 'records', 10, 9, 2.9, {
    props: [
      { kind: 'cubiclePod', x: -3.0, z: -2.4, yaw: Math.PI / 2 },
      { kind: 'cubiclePod', x: -3.0, z: 0.0, yaw: Math.PI / 2 },
      { kind: 'cubiclePod', x: -3.0, z: 2.4, yaw: Math.PI / 2 },
      { kind: 'cubiclePod', x: 3.0, z: -2.4, yaw: -Math.PI / 2 },
      { kind: 'cubiclePod', x: 3.0, z: 0.0, yaw: -Math.PI / 2 },
      { kind: 'cubiclePod', x: 3.0, z: 2.4, yaw: -Math.PI / 2 },
      { kind: 'filing', x: -2.2, z: 4.2 },
      { kind: 'filing', x: -3.4, z: 4.2 },
      { kind: 'waterCooler', x: 1.4, z: 4.1 },
      { kind: 'plant', x: -4.4, z: 4.0 },
      { kind: 'bin', x: 4.4, z: 4.0 },
      { kind: 'rug', x: 0, z: 0.2 },
      { kind: 'wallClock2', x: 4.4, z: -3.6, y: 2.1, yaw: -Math.PI / 2 },
      { kind: 'paperScatter', x: -1.0, z: -1.4 },
      { kind: 'projScreen', x: 0, z: 4.5, yaw: Math.PI },
      { kind: 'projector', x: 0, z: 0.6, y: 0.75 },
      { kind: 'mousetrap', x: 4.0, z: -1.8 },
    ],
    sockets: [...drawerSockets([[-2.2, 4.2], [-3.4, 4.2]]), ...lootSockets([[4.4, -3.0]])],
    hiding: [
      { kind: 'underFurniture', x: -3.0, z: 0.0, yaw: Math.PI / 2, propKind: 'desk' },
      { kind: 'cabinet', x: 4.4, z: -3.9, yaw: -Math.PI / 2, propKind: 'cabinet' },
    ],
    lights: [
      { x: -2.4, y: 2.62, z: -1.4, color: 0xfff0d8, intensity: 0.8, range: 7, group: 'main', breakable: true },
      { x: 2.4, y: 2.62, z: 1.8, color: 0xfff0d8, intensity: 0.8, range: 7, group: 'main', breakable: true },
    ],
    nav: [
      { id: 'entry', x: 0, z: -4.1, links: ['mid'], tags: ['door', 'entry'] },
      { id: 'mid', x: 0, z: 0.2, links: ['entry', 'exit', 'w', 'e'], tags: ['aisle'] },
      { id: 'w', x: -4.2, z: 0.2, links: ['mid'], tags: [] },
      { id: 'e', x: 4.2, z: 0.2, links: ['mid'], tags: [] },
      { id: 'exit', x: 0, z: 4.1, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 8,
    minRoom: 15,
    floor: 'carpet',
    darkChance: 0.2,
    perf: 5,
  }),
};

const roomLibraryStacks: RoomTemplate = {
  id: 'library-stacks',
  build: (_rng) => spec('library-stacks', 'records', 9, 11, 3.4, {
    props: [
      // 4 parallel stacks, each split at the mid cross-aisle
      { kind: 'bookshelf', x: -3.4, z: -2.7, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -3.4, z: -1.3, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -3.4, z: 1.4, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -3.4, z: 2.8, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -1.4, z: -2.7, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -1.4, z: -1.3, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -1.4, z: 1.4, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: -1.4, z: 2.8, yaw: Math.PI / 2 },
      { kind: 'bookshelf', x: 1.4, z: -2.7, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 1.4, z: -1.3, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 1.4, z: 1.4, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 1.4, z: 2.8, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 3.4, z: -2.7, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 3.4, z: -1.3, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 3.4, z: 1.4, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 3.4, z: 2.8, yaw: -Math.PI / 2 },
      { kind: 'rollingLadder', x: -3.4, z: -3.9, yaw: Math.PI / 2 },
      { kind: 'stool', x: 2.4, z: 0.0 },
      { kind: 'desk', x: 0, z: -4.6 },
      { kind: 'deskLamp', x: 0.3, z: -4.6, y: 0.78 },
      { kind: 'papers', x: -0.4, z: -4.55, y: 0.8 },
      { kind: 'magnifier', x: 0.15, z: -4.5, y: 0.8 },
      { kind: 'frameStand', x: -0.3, z: -4.75, y: 0.8 },
      { kind: 'teaSet', x: 0.5, z: -4.65, y: 0.8 },
      { kind: 'paperScatter', x: -2.4, z: 0.0 },
      { kind: 'paperScatter', x: 2.4, z: -0.6 },
      { kind: 'rug', x: 0, z: -3.6 },
      { kind: 'clock', x: 4.0, z: -4.6, yaw: Math.PI },
      { kind: 'globeStand', x: 4.1, z: 3.9, yaw: -Math.PI / 4 },
    ],
    sockets: [...drawerSockets([[0, -4.6]]), ...lootSockets([[-2.4, 0.0], [2.4, 3.6], [0.0, 4.5]])],
    hiding: [
      { kind: 'cabinet', x: -4.0, z: -4.6, yaw: 0, propKind: 'cabinet' },
      { kind: 'underFurniture', x: 0, z: -4.6, yaw: Math.PI, propKind: 'desk' },
    ],
    lights: [
      { x: -2.4, y: 3.0, z: 0, color: 0xffd9a0, intensity: 0.6, range: 6, group: 'dim', breakable: true },
      { x: 2.4, y: 3.0, z: 0, color: 0xffd9a0, intensity: 0.6, range: 6, group: 'dim', breakable: true },
      { x: 0, y: 2.2, z: -4.6, color: 0xffc878, intensity: 0.5, range: 4, group: 'dim', breakable: false },
    ],
    nav: [
      { id: 'entry', x: 0, z: -5.1, links: ['mid'], tags: ['door', 'entry'] },
      { id: 'mid', x: 0, z: 0.0, links: ['entry', 'exit', 'w', 'e'], tags: ['aisle'] },
      { id: 'w', x: -2.4, z: 0.0, links: ['mid'], tags: [] },
      { id: 'e', x: 2.4, z: 0.0, links: ['mid'], tags: [] },
      { id: 'exit', x: 0, z: 5.1, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 6,
    minRoom: 35,
    floor: 'carpet',
    darkChance: 0.35,
    perf: 5,
    wall: 'woodPanel',
  }),
};

/* ---------------- sprint 45: themed rooms on the deep asset inventory ------- */

// A musty projection room — tiered chairs face a pulled-down screen while the
// projector still spins. Archive smell included.
const roomProjection: RoomTemplate = {
  id: 'records-projection',
  build: (_rng) => spec('records-projection', 'records', 8, 10, 3.2, {
    props: [
      { kind: 'projScreen', x: 0, z: 4.6, yaw: Math.PI },
      { kind: 'table', x: 0, z: -1.4 },
      { kind: 'projector', x: 0, z: -1.4, y: 0.78 },
      { kind: 'cassettePlayer', x: 0.6, z: -1.35, y: 0.78 },
      { kind: 'schoolChair', x: -1.4, z: 1.2, yaw: Math.PI }, { kind: 'schoolChair', x: -0.4, z: 1.2, yaw: Math.PI }, { kind: 'schoolChair', x: 0.6, z: 1.2, yaw: Math.PI }, { kind: 'schoolChair', x: 1.5, z: 1.3, yaw: Math.PI },
      { kind: 'schoolChair', x: -1.3, z: 2.5, yaw: Math.PI }, { kind: 'schoolChair', x: -0.3, z: 2.5, yaw: Math.PI }, { kind: 'schoolChair', x: 0.7, z: 2.5, yaw: Math.PI }, { kind: 'schoolChair', x: 1.6, z: 2.4, yaw: Math.PI },
      { kind: 'schoolChair', x: -1.2, z: 3.7, yaw: Math.PI }, { kind: 'schoolChair', x: 0.4, z: 3.7, yaw: Math.PI }, { kind: 'schoolChair', x: 1.4, z: 3.7, yaw: Math.PI },
      { kind: 'postcards', x: -3.4, z: 0.2, y: 0.78 },
      { kind: 'sideTable', x: -3.4, z: 0.2 },
      { kind: 'books', x: -3.4, z: -1.1, y: 0.78 },
      { kind: 'crate', x: -3.4, z: -1.1 },
      { kind: 'suitcase', x: 3.3, z: -0.6, yaw: 0.5 },
      ...wallProps(8, 10, _rng, ['painting', 'wallSconce'], 2),
    ],
    sockets: lootSockets([[3.3, -0.6], [-3.4, 0.2]]),
    hiding: [{ kind: 'cabinet', x: -3.5, z: 3.4, yaw: Math.PI / 2, propKind: 'cabinet' }],
    lights: [
      { x: 0, y: 2.9, z: -2.5, color: 0xffd9a4, intensity: 0.5, range: 6, group: 'dim', breakable: true },
      { x: 0, y: 1.2, z: -1.4, color: 0xbfd0ff, intensity: 0.3, range: 3, group: 'dim', breakable: false },
    ],
    weight: 6, minRoom: 25, darkChance: 0.25, perf: 4,
  }),
};

// The good room — a suite that was kept for a guest who never checked out.
const roomGrandSuite: RoomTemplate = {
  id: 'guest-suite-grand',
  build: (_rng) => spec('guest-suite-grand', 'guest', 9, 8, 3.4, {
    props: [
      { kind: 'daybed', x: -2.6, z: 1.8 },
      { kind: 'modernCabinet', x: 0.4, z: 3.4, yaw: Math.PI },
      { kind: 'television', x: 0.4, z: 3.35, y: 1.42, yaw: Math.PI },
      { kind: 'armchair', x: 2.2, z: 0.6, yaw: -0.6 }, { kind: 'armchair', x: -0.6, z: -1.2, yaw: 0.4 },
      { kind: 'roundTable', x: 1.0, z: -0.2 },
      { kind: 'teaSet', x: 1.0, z: -0.2, y: 0.76 },
      { kind: 'diningChair', x: 1.9, z: -0.5, yaw: -0.4 }, { kind: 'diningChair', x: 0.1, z: -0.6, yaw: 0.5 },
      { kind: 'chandelier', x: 0, z: 0, y: 3.0 },
      { kind: 'marbleBust', x: -3.8, z: -1.4, y: 0.86 },
      { kind: 'console', x: -3.8, z: -1.4 },
      { kind: 'rug', x: 0.2, z: -0.6 },
      { kind: 'mantelClock', x: -0.05, z: 3.32, y: 1.42, yaw: Math.PI },
      { kind: 'vase', x: 0.82, z: 3.36, y: 1.42, yaw: Math.PI },
      { kind: 'ottoman', x: -2.0, z: -0.4, yaw: 0.3 },
      { kind: 'suitcase', x: 3.9, z: 2.6, yaw: 0.9 },
      { kind: 'frameStand', x: 3.9, z: -2.6, yaw: -Math.PI / 2 },
      { kind: 'curtainLong', x: -1.9, z: 3.85, y: 1.18, yaw: Math.PI },
      { kind: 'settee', x: -1.6, z: -3.3, yaw: 0 },
      { kind: 'vanityTable', x: 3.3, z: 3.55, yaw: Math.PI },
      { kind: 'writingDesk', x: -4.0, z: 0.1, yaw: Math.PI / 2 },
      { kind: 'globeStand', x: -3.9, z: -3.3, yaw: 0 },
      { kind: 'dressingScreen', x: 2.9, z: -3.2, yaw: 0.6 },
      ...wallProps(9, 8, _rng, ['painting', 'curtain', 'curtainRod', 'wallSconce', 'mirror', 'pegRail'], 4),
    ],
    sockets: lootSockets([[3.9, 2.6], [-3.8, -1.4]]),
    hiding: [{ kind: 'cabinet', x: -3.9, z: 3.1, yaw: Math.PI / 2, propKind: 'cabinet' }],
    weight: 5, minRoom: 20, darkChance: 0.3, perf: 4,
  }),
};

// A fabrication bay — benches, carts, tools, a detector gate nobody uses.
const roomFabShop: RoomTemplate = {
  id: 'maint-fabshop',
  build: (_rng) => spec('maint-fabshop', 'maintenance', 9, 8, 3.1, {
    props: [
      { kind: 'table', x: -2.4, z: -3.0 }, { kind: 'table', x: -0.4, z: -3.0 },
      { kind: 'benchVice', x: -2.4, z: -3.0, y: 0.78 },
      { kind: 'multimeter', x: -0.4, z: -3.0, y: 0.78 },
      { kind: 'handsaw', x: -1.4, z: -3.0, y: 0.78 },
      { kind: 'oilCan', x: -2.0, z: -2.8, y: 0.78 },
      { kind: 'weldingCart', x: 3.2, z: -2.6, yaw: -0.4 },
      { kind: 'propaneTank', x: 3.8, z: -1.6 },
      { kind: 'propaneTorch', x: 3.4, z: -1.9 },
      { kind: 'toolCart', x: 1.6, z: -1.0, yaw: 0.3 },
      { kind: 'toolChest', x: -3.6, z: -0.8 },
      { kind: 'drillPress', x: -3.5, z: 2.0 },
      { kind: 'metalDetector', x: 0, z: -0.4 },
      { kind: 'ladder', x: 4.1, z: 1.2, yaw: -Math.PI / 2 },
      { kind: 'indPipes', x: 4.35, z: -1.5, y: 1.8, yaw: -Math.PI / 2 },
      { kind: 'wallHose', x: -4.35, z: 0.5, y: 1.1, yaw: Math.PI / 2 },
      { kind: 'cableTray', x: -4.35, z: -2.0, y: 2.3, yaw: Math.PI / 2 },
      { kind: 'screwdrivers', x: -2.6, z: -2.8, y: 0.78 },
      { kind: 'wrench', x: -0.1, z: -3.1, y: 0.78 },
      { kind: 'tapeMeasure', x: 1.7, z: -0.9, y: 0.78 },
      { kind: 'toolbox', x: -3.9, z: 0.6 },
      { kind: 'blowtorch', x: 2.8, z: -2.0 },
      { kind: 'chainBulb', x: 0, z: 0, y: 2.75 },
      { kind: 'cageLight', x: -4.35, z: 2.5, y: 2.2, yaw: Math.PI / 2 },
      { kind: 'ceilingHook', x: -1.2, z: -3.0, y: 2.73 },
      { kind: 'cageLocker', x: -4.19, z: -3.3, yaw: Math.PI / 2 },
    ],
    sockets: lootSockets([[1.6, -1.0], [-3.6, 0.9]]),
    hiding: [{ kind: 'cabinet', x: 3.9, z: 2.9, yaw: -Math.PI / 2, propKind: 'locker' }],
    lights: [
      { x: 0, y: 2.75, z: -2.6, color: 0xd8e0e8, intensity: 0.6, range: 7, group: 'main', breakable: true },
      { x: 1.5, y: 2.75, z: 1.5, color: 0xffd9a4, intensity: 0.4, range: 5, group: 'dim', breakable: true },
    ],
    weight: 7, minRoom: 22, floor: 'metal', darkChance: 0.25, perf: 4,
  }),
};

// A barricaded corridor — the checkpoint everyone kept meaning to staff.
const roomCheckpoint: RoomTemplate = {
  id: 'corridor-checkpoint',
  build: (_rng) => spec('corridor-checkpoint', 'corridor', 4.5, 9, 2.9, {
    props: [
      { kind: 'roadBarrier', x: -0.9, z: -0.6, yaw: 0.15 },
      { kind: 'roadBarrier', x: 0.9, z: 0.5, yaw: -0.1 },
      { kind: 'chainFence', x: 0, z: 2.2 },
      { kind: 'searchlight', x: 1.4, z: 3.6, yaw: Math.PI },
      { kind: 'securityCam', x: -1.9, z: -2.9, y: 2.3, yaw: Math.PI / 2 },
      { kind: 'megaphone', x: -1.5, z: -3.4 },
      { kind: 'wetFloor', x: 0.6, z: -2.2 },
      { kind: 'plasticChair', x: 1.5, z: -3.2, yaw: -0.5 },
      { kind: 'papers', x: -1.2, z: -1.4 },
      { kind: 'jerrycanP', x: 1.7, z: 1.4 },
      { kind: 'fireAlarm', x: -2.1, z: 0.4, y: 1.9, yaw: Math.PI / 2 },
    ],
    lights: [
      { x: 0, y: 2.65, z: 2.2, color: 0xffd9a4, intensity: 0.55, range: 6, group: 'main', breakable: true },
      { x: 0, y: 2.65, z: -3.0, color: 0xdde4ee, intensity: 0.35, range: 5, group: 'dim', breakable: true },
    ],
    weight: 8, minRoom: 15, darkChance: 0.2, perf: 3,
  }),
};

// Waiting area — rows of chairs, dead payphones, one flickering clock.
const roomWaiting: RoomTemplate = {
  id: 'lobby-waiting',
  build: (_rng) => spec('lobby-waiting', 'lobby', 9, 7, 3.4, {
    props: [
      { kind: 'chair', x: -1.4, z: -0.8, yaw: Math.PI }, { kind: 'plasticChair', x: -0.4, z: -0.8, yaw: Math.PI }, { kind: 'chair', x: 0.6, z: -0.8, yaw: Math.PI },
      { kind: 'chair', x: -1.4, z: 0.9, yaw: 0 }, { kind: 'plasticChair', x: -0.4, z: 0.9, yaw: 0 }, { kind: 'chair', x: 0.6, z: 0.9, yaw: 0 },
      { kind: 'payphone', x: -4.35, z: -1.4, y: 0.6, yaw: Math.PI / 2 },
      { kind: 'payphone', x: -4.35, z: -0.7, y: 0.6, yaw: Math.PI / 2 },
      { kind: 'wallClock', x: 0, z: 3.4, y: 2.25, yaw: Math.PI },
      { kind: 'planter', x: 3.9, z: -0.6 }, { kind: 'planter', x: 3.9, z: 0.6 },
      { kind: 'stairGate', x: -3.8, z: -2.4, yaw: Math.PI / 2 },
      { kind: 'radiatorFin', x: 4.4, z: -2.0, yaw: -Math.PI / 2 },
      { kind: 'screenPanels', x: 2.4, z: -2.9 },
      { kind: 'counter', x: 0.4, z: 3.1, yaw: Math.PI },
      { kind: 'trolley', x: -3.4, z: 1.8, yaw: 0.4 },
      { kind: 'wetFloor', x: -2.4, z: 0.3 },
      { kind: 'bin', x: -2.4, z: -3.15 },
      { kind: 'register', x: 0.4, z: 3.05, y: 0.95, yaw: Math.PI },
      { kind: 'papers', x: 0.2, z: 3.0, y: 0.95 },
      { kind: 'wallSconce', x: -4.35, z: 1.4, y: 2.05, yaw: Math.PI / 2 },
      { kind: 'radiatorTall', x: -3.2, z: 3.35, yaw: Math.PI },
      { kind: 'settee', x: 2.4, z: 1.9, yaw: Math.PI },
      { kind: 'sideboard', x: -2.4, z: -3.1, yaw: 0 },
      ...wallProps(9, 7, _rng, ['painting', 'curtain'], 2),
    ],
    sockets: lootSockets([[0.4, 3.1], [-3.4, 1.8]]),
    weight: 6, minRoom: 18, darkChance: 0.15, perf: 4,
  }),
};


// The Cathedral — the mill's full kit in one room: twin colonnade aisles,
// arched clerestory windows, coffered vault panels, portal frames on both doors.
const roomCathedral: RoomTemplate = {
  id: 'gallery-cathedral',
  build: (_rng) => spec('gallery-cathedral', 'gallery', 13, 10, 7, {
    props: [
      { kind: 'colonnade', x: -5.9, z: 0, yaw: Math.PI / 2 },
      { kind: 'colonnade', x: 5.9, z: 0, yaw: -Math.PI / 2 },
      { kind: 'vault', x: 0, z: -2.2, y: 6.6 },
      { kind: 'vault', x: 0, z: 2.2, y: 6.6 },
      { kind: 'medallion', x: 0, z: 0, y: 6.9 },
      { kind: 'archway', x: 0, z: -4.8 },
      { kind: 'archway', x: 0, z: 4.8, yaw: Math.PI },
      { kind: 'windowArch', x: -5.95, z: -3.4, y: 3.4, yaw: Math.PI / 2 },
      { kind: 'windowArch', x: -5.95, z: 3.4, y: 3.4, yaw: Math.PI / 2 },
      { kind: 'windowArch', x: 5.95, z: -3.4, y: 3.4, yaw: -Math.PI / 2 },
      { kind: 'windowArch', x: 5.95, z: 3.4, y: 3.4, yaw: -Math.PI / 2 },
      { kind: 'chandelier', x: 0, z: 0, y: 5.6 },
      { kind: 'wallNiche', x: -5.95, z: 0, y: 0, yaw: Math.PI / 2 },
      { kind: 'wallNiche', x: 5.95, z: 0, y: 0, yaw: -Math.PI / 2 },
      { kind: 'statue', x: -4.4, z: -4.0, yaw: Math.PI / 4 },
      { kind: 'statue', x: 4.4, z: -4.0, yaw: -Math.PI / 4 },
      { kind: 'statue', x: -4.4, z: 4.0, yaw: Math.PI * 0.75 },
      { kind: 'statue', x: 4.4, z: 4.0, yaw: -Math.PI * 0.75 },
      { kind: 'marbleBust', x: -5.4, z: -1.8, y: 1.35 },
      { kind: 'marbleBust', x: -5.4, z: 1.8, y: 1.35 },
      { kind: 'marbleBust', x: 5.4, z: -1.8, y: 1.35 },
      { kind: 'marbleBust', x: 5.4, z: 1.8, y: 1.35 },
      { kind: 'pewRow', x: -1.9, z: -1.6 }, { kind: 'pewRow', x: 1.9, z: -1.6 },
      { kind: 'pewRow', x: -1.9, z: 0.6 }, { kind: 'pewRow', x: 1.9, z: 0.6 },
      { kind: 'rug', x: 0, z: 0, scale: 1.6 },
    ],
    sockets: lootSockets([[-5.4, -1.8], [5.4, 1.8]]),
    hiding: [
      { kind: 'cabinet', x: -6, z: -4.4, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'cabinet', x: 6, z: 4.4, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 6, z: -4.4, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 6, z: -4.4, w: 1.4, d: 1.4 }],
    nav: [
      { id: 'entry', x: 0, z: -4.0, links: ['mid'], tags: ['door', 'entry'] },
      { id: 'mid', x: 0, z: 0, links: ['entry', 'exit'], tags: [] },
      { id: 'exit', x: 0, z: 4.0, links: ['mid'], tags: ['door', 'exit'] },
    ],
    weight: 2,
    minRoom: 45,
    perf: 6,
    wall: 'travertine',
  }),
};

// The Chapel — twin pew blocks on a centre aisle, stone altar under a
// cold rose light, votive racks burning low in the chancel. Mill kit
// pieces only — every furnishing is real geometry.
const roomChapel: RoomTemplate = {
  id: 'gallery-chapel',
  build: (_rng) => spec('gallery-chapel', 'gallery', 11, 14, 5, {
    props: [
      // pew blocks face the altar (+Z); centre aisle stays clear
      { kind: 'chapelPew', x: -2.4, z: -1.0, yaw: 0 }, { kind: 'chapelPew', x: 2.4, z: -1.0, yaw: 0 },
      { kind: 'chapelPew', x: -2.4, z: 0.9, yaw: 0 }, { kind: 'chapelPew', x: 2.4, z: 0.9, yaw: 0 },
      { kind: 'chapelPew', x: -2.4, z: 2.8, yaw: 0 }, { kind: 'chapelPew', x: 2.4, z: 2.8, yaw: 0 },
      // hymnal + leavings on seats
      { kind: 'books', x: -2.2, z: -1.0, y: 0.5 },
      { kind: 'papers', x: 2.5, z: 0.9, y: 0.5 },
      // chancel rail: kneelers before the altar step
      { kind: 'prayerKneeler', x: -1.1, z: 4.35, yaw: 0 },
      { kind: 'prayerKneeler', x: 0, z: 4.35, yaw: 0 },
      { kind: 'prayerKneeler', x: 1.1, z: 4.35, yaw: 0 },
      // altar frontal faces the congregation (-Z)
      { kind: 'chapelAltar', x: 0, z: 5.6, yaw: Math.PI },
      { kind: 'candelabrum', x: -1.7, z: 5.2 }, { kind: 'candelabrum', x: 1.7, z: 5.2 },
      { kind: 'votiveStand', x: -4.2, z: 4.0, yaw: Math.PI / 2 + 0.4 },
      { kind: 'votiveStand', x: 4.2, z: 4.0, yaw: -Math.PI / 2 - 0.4 },
      { kind: 'sideboard', x: -4.9, z: 5.4, yaw: Math.PI / 2 },
      { kind: 'books', x: -4.9, z: 5.2, y: 1.02 },
      { kind: 'wallNiche', x: 5.35, z: 1.0, y: 0, yaw: -Math.PI / 2 },
      { kind: 'bust', x: 5.35, z: 1.0, y: 0.62, yaw: -Math.PI / 2 },
      { kind: 'windowArch', x: -5.4, z: -3.5, y: 3.0, yaw: Math.PI / 2 },
      { kind: 'windowArch', x: -5.4, z: 0.5, y: 3.0, yaw: Math.PI / 2 },
      { kind: 'windowArch', x: -5.4, z: 3.5, y: 3.0, yaw: Math.PI / 2 },
      { kind: 'windowArch', x: 5.4, z: -3.5, y: 3.0, yaw: -Math.PI / 2 },
      { kind: 'windowArch', x: 5.4, z: 0.5, y: 3.0, yaw: -Math.PI / 2 },
      { kind: 'windowArch', x: 5.4, z: 3.5, y: 3.0, yaw: -Math.PI / 2 },
      { kind: 'medallion', x: 0, z: 4.5, y: 4.9 },
      { kind: 'chandelier', x: 0, z: 0.9, y: 4.3 },
      { kind: 'archway', x: 0, z: 6.8 },
      { kind: 'archway', x: 0, z: -6.8, yaw: Math.PI },
      { kind: 'statue', x: -4.6, z: -4.8, yaw: Math.PI / 4 },
      { kind: 'statue', x: 4.6, z: -4.8, yaw: -Math.PI / 4 },
      { kind: 'rug', x: 0, z: 0.9, scale: 1.4 },
      { kind: 'candle', x: -0.55, z: 5.4, y: 1.14 }, { kind: 'candle', x: 0.55, z: 5.4, y: 1.14 },
      { kind: 'rootGrowth', x: 5.0, z: -5.5 },
    ],
    sockets: [...lootSockets([[-4.9, 5.4], [-2.2, -1.0], [2.5, 0.9], [5.0, -5.5]]), ...drawerSockets([[-4.9, 5.4]])],
    hiding: [
      { kind: 'losAlcove', x: -4.8, z: -3.9, yaw: Math.PI / 2, propKind: 'partition' },
      { kind: 'cabinet', x: -4.8, z: -5.8, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 4.8, z: -5.8, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: -4.8, z: -5.8, w: 1.4, d: 1.4 }],
    nav: [
      { id: 'entry', x: 0, z: -6.0, links: ['aisle'], tags: ['door', 'entry'] },
      { id: 'aisle', x: 0, z: 0.9, links: ['entry', 'chancel'], tags: [] },
      { id: 'chancel', x: 0, z: 4.2, links: ['aisle', 'exit'], tags: [] },
      { id: 'exit', x: 0, z: 6.2, links: ['chancel'], tags: ['door', 'exit'] },
    ],
    lights: [
      { x: 0, y: 4.4, z: 5.2, color: 0xffe6b8, intensity: 0.7, range: 8, group: 'main', breakable: true },
      { x: -4.0, y: 1.4, z: 4.0, color: 0xff9a3c, intensity: 0.5, range: 3.5, group: 'dim', breakable: true },
      { x: 4.0, y: 1.4, z: 4.0, color: 0xff9a3c, intensity: 0.5, range: 3.5, group: 'dim', breakable: true },
      { x: -5.0, y: 4.2, z: 0.5, color: 0x9fb6ff, intensity: 0.45, range: 7, group: 'dim', breakable: true },
    ],
    weight: 5,
    minRoom: 28,
    perf: 5,
    wall: 'travertine',
  }),
};

// Banquet — a long table still dressed for dinner in the dark.
const roomBanquet: RoomTemplate = {
  id: 'gallery-banquet',
  build: (_rng) => spec('gallery-banquet', 'gallery', 11, 8, 4.4, {
    props: [
      { kind: 'diningTable', x: -1.6, z: 0, yaw: Math.PI / 2 }, { kind: 'diningTable', x: 1.6, z: 0, yaw: Math.PI / 2 },
      { kind: 'diningChair', x: -1.6, z: -1.9 }, { kind: 'diningChair', x: -1.6, z: -0.7 }, { kind: 'diningChair', x: -1.6, z: 0.7 }, { kind: 'diningChair', x: -1.6, z: 1.9 },
      { kind: 'diningChair', x: 1.6, z: -1.9 }, { kind: 'diningChair', x: 1.6, z: -0.7 }, { kind: 'diningChair', x: 1.6, z: 0.7 }, { kind: 'diningChair', x: 1.6, z: 1.9 },
      { kind: 'goblets', x: -1.7, z: -0.4, y: 0.8 }, { kind: 'goblets', x: 1.5, z: 0.6, y: 0.8 },
      { kind: 'wineBottles', x: -1.5, z: 0.5, y: 0.8 }, { kind: 'wineBottles', x: 1.7, z: -0.6, y: 0.8 },
      { kind: 'candle', x: -1.6, z: 0.1, y: 0.8 }, { kind: 'candle', x: 1.6, z: -0.1, y: 0.8 },
      { kind: 'sideboard', x: 4.9, z: 0.6, yaw: -Math.PI / 2 },
      { kind: 'pastry', x: -1.5, z: -0.9, y: 0.8 }, { kind: 'fruit', x: 1.5, z: 0.9, y: 0.8 },
      { kind: 'platedRoast', x: -1.6, z: -0.2, y: 0.8 }, { kind: 'platedPie', x: 1.6, z: 0.35, y: 0.8 },
      { kind: 'chandelier', x: -1.6, z: 0, y: 3.6 }, { kind: 'chandelier', x: 1.6, z: 0, y: 3.6 },
      { kind: 'galleryStatue', x: -5.0, z: 3.3, yaw: Math.PI / 2 }, { kind: 'galleryStatue', x: 5.0, z: 3.3, yaw: -Math.PI / 2 },
      { kind: 'rug', x: 0, z: 0 },
      { kind: 'fireplace', x: -5.15, z: 0, yaw: Math.PI / 2 },
      { kind: 'medallion', x: 0, z: -2.5, y: 4.3 }, { kind: 'medallion', x: 0, z: 2.5, y: 4.3 },
      { kind: 'vase', x: -4.6, z: -3.4 }, { kind: 'vase', x: 4.6, z: -3.4 },
      ...wallProps(11, 8, _rng, ['painting', 'mirror'], 4),
    ],
    hiding: [{ kind: 'cabinet', x: -5.0, z: -3.3, yaw: Math.PI / 2, propKind: 'cabinet' }],
    weight: 4, minRoom: 28, darkChance: 0.4, perf: 5,
  }),
};

// Someone lived down here once — stocked, warm-ish, now dusted over.
const roomBunker: RoomTemplate = {
  id: 'safe-bunker',
  build: (_rng) => spec('safe-bunker', 'safe', 6, 5.5, 2.8, {
    props: [
      { kind: 'bedOld', x: -1.9, z: 1.3 },
      { kind: 'generator', x: 2.2, z: -1.9 },
      { kind: 'rations', x: 0.6, z: 2.2, y: 0.78 }, { kind: 'rations', x: 0.2, z: 2.25, y: 0.78 }, { kind: 'rations', x: 0.4, z: 1.9, y: 0.78 },
      { kind: 'table', x: 0.4, z: 2.2 },
      { kind: 'television', x: 0.4, z: 2.15, y: 0.78, yaw: Math.PI },
      { kind: 'ottoman', x: -0.4, z: -0.6, yaw: 0.4 },
      { kind: 'medBox', x: -2.55, z: -0.8, y: 1.3, yaw: Math.PI / 2 },
      { kind: 'lantern', x: -2.5, z: 2.0 },
      { kind: 'lantern', x: 1.3, z: -0.4, y: 0.78 },
      { kind: 'plasticBin', x: 2.4, z: 0.8 },
      { kind: 'thermos', x: 0.9, z: 2.1, y: 0.78 },
      { kind: 'plasticChair', x: -0.9, z: 1.9, yaw: 0.6 },
      { kind: 'boombox', x: -2.55, z: -1.9 },
      { kind: 'rifle', x: 2.5, z: 1.8, yaw: -0.5 },
      { kind: 'plasticCrate', x: -2.55, z: 0.4 },
      { kind: 'clock', x: -0.2, z: -2.4 },
      { kind: 'rug', x: -0.4, z: 0.2 },
    ],
    sockets: lootSockets([[2.4, 0.8]]),
    hiding: [{ kind: 'cabinet', x: -2.55, z: -2.0, yaw: Math.PI / 2, propKind: 'cabinet' }],
    lights: [
      { x: 0, y: 2.5, z: 0, color: 0xffd9a4, intensity: 0.55, range: 6, group: 'main', breakable: true },
    ],
    weight: 5, minRoom: 40, darkChance: 0, floor: 'carpet',
  }),
};


// The lobby the guests remember — a grand stair sealed at its gate,
// mail niches behind the counter, luggage that never got claimed.
const roomLobbyFoyer: RoomTemplate = {
  id: 'lobby-foyer',
  build: (_rng) => spec('lobby-foyer', 'lobby', 11, 8, 4.2, {
    props: [
      { kind: 'stairGate', x: 0, z: 3.4, yaw: Math.PI },
      { kind: 'balustrade', x: -2.2, z: 3.4 }, { kind: 'balustrade', x: 2.2, z: 3.4 },
      { kind: 'counter', x: -3.6, z: 0.6, yaw: Math.PI / 2, scale: 2.2 },
      { kind: 'wallNiche', x: -5.32, z: -1.0, y: 0.4, yaw: Math.PI / 2 },
      { kind: 'wallNiche', x: -5.32, z: 0.2, y: 0.4, yaw: Math.PI / 2 },
      { kind: 'wallNiche', x: -5.32, z: 1.4, y: 0.4, yaw: Math.PI / 2 },
      { kind: 'register', x: -3.6, z: 0.5, y: 0.95, yaw: Math.PI / 2 },
      { kind: 'trolley', x: 2.8, z: -0.8, yaw: -0.35 },
      { kind: 'suitcase', x: 3.3, z: -0.2, yaw: 0.5 },
      { kind: 'suitcase', x: 3.05, z: 0.45, yaw: -0.2 },
      { kind: 'sofa', x: 1.6, z: -2.6, yaw: Math.PI },
      { kind: 'coffeeTable', x: 1.6, z: -1.5 },
      { kind: 'vase', x: 1.6, z: -1.5, y: 0.5 },
      { kind: 'planter', x: -4.6, z: -2.8 }, { kind: 'planter', x: 4.6, z: -2.8 },
      { kind: 'radiatorFin', x: 5.32, z: 1.8, yaw: -Math.PI / 2 },
      { kind: 'wetFloor', x: -0.8, z: -1.0 },
      { kind: 'clock', x: 0, z: -3.6, y: 2.4 },
      { kind: 'chandelier', x: 0, z: 0, y: 3.6 },
      { kind: 'rug', x: 0, z: -1.2, scale: 1.4 },
      { kind: 'transomWindow', x: 0, z: -3.92, y: 2.7 },
      { kind: 'transomWindow', x: 0, z: 3.92, y: 2.7, yaw: Math.PI },
      { kind: 'payphone', x: 5.32, z: -2.4, y: 0.6, yaw: -Math.PI / 2 },
      { kind: 'bin', x: -4.8, z: 2.6 },
      { kind: 'bellCart', x: 4.55, z: -1.2, yaw: -Math.PI / 2 },
      ...wallProps(11, 8, _rng, ['painting', 'wallSconce', 'wallClock'], 4),
    ],
    sockets: lootSockets([[-3.6, 0.6], [4.6, -2.8]]),
    hiding: [
      { kind: 'cabinet', x: -4.6, z: 2.4, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: 4.6, z: 2.6, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 4.6, z: 2.6, w: 1.3, d: 1.3 }],
    lights: [
      { x: 0, y: 3.4, z: 0, color: 0xffd9a4, intensity: 0.5, range: 9, group: 'main', breakable: true },
    ],
    weight: 5, minRoom: 15, darkChance: 0.2, perf: 4,
  }),
};

// A chapel the House cannot enter — checkpoint rooms that still ask a tithe
// of attention: pews, a bare altar, candles someone keeps replacing.
const roomSanctuary: RoomTemplate = {
  id: 'safe-sanctuary',
  build: (_rng) => spec('safe-sanctuary', 'safe', 7, 8, 3.6, {
    props: [
      { kind: 'chapelPew', x: -1.6, z: -0.6, yaw: Math.PI }, { kind: 'chapelPew', x: 1.6, z: -0.6, yaw: Math.PI },
      { kind: 'chapelPew', x: -1.6, z: 0.8, yaw: Math.PI }, { kind: 'chapelPew', x: 1.6, z: 0.8, yaw: Math.PI },
      { kind: 'chapelPew', x: -1.6, z: 2.2, yaw: Math.PI }, { kind: 'chapelPew', x: 1.6, z: 2.2, yaw: Math.PI },
      { kind: 'chapelAltar', x: 0, z: -2.9, yaw: 0 },
      { kind: 'candle', x: -0.4, z: -2.9, y: 1.12 }, { kind: 'candle', x: 0.4, z: -2.9, y: 1.12 },
      { kind: 'candle', x: 0, z: -2.7, y: 1.12 },
      { kind: 'prayerKneeler', x: 1.55, z: -2.0, yaw: Math.PI },
      { kind: 'votiveStand', x: -2.85, z: -3.0, yaw: Math.PI / 4 },
      { kind: 'candelabrum', x: -1.35, z: -2.75 }, { kind: 'candelabrum', x: 1.35, z: -2.75 },
      { kind: 'wallNiche', x: 0, z: -3.82, y: 0.5, yaw: 0 },
      { kind: 'bust', x: 0, z: -3.5, y: 0.62, yaw: 0 },
      { kind: 'rug', x: 0, z: -0.4, scale: 1.2 },
      { kind: 'rootGrowth', x: -3.2, z: -3.4 },
      { kind: 'candle', x: -2.9, z: 3.4, y: 0.02 }, { kind: 'candle', x: -3.1, z: 3.2, y: 0.02 },
      { kind: 'books', x: 0.2, z: -2.75, y: 1.12 },
      { kind: 'ottoman', x: 0, z: -1.6, yaw: Math.PI },
      { kind: 'chapelAltar', x: 1.9, z: 3.45, yaw: Math.PI },
      { kind: 'wallVent', x: 3.32, z: 1.8, y: 2.4, yaw: -Math.PI / 2 },
      ...wallProps(7, 8, _rng, ['painting', 'wallSconce'], 3),
    ],
    sockets: lootSockets([[0, -2.9], [-2.9, 3.4]]),
    hiding: [{ kind: 'cabinet', x: 3.1, z: 3.3, yaw: -Math.PI / 2, propKind: 'cabinet' }],
    lights: [
      { x: 0, y: 2.6, z: -2.4, color: 0xffc98a, intensity: 0.6, range: 6, group: 'main', breakable: true },
      { x: 0, y: 2.9, z: 2.0, color: 0x9fb6ff, intensity: 0.3, range: 7, group: 'dim', breakable: true },
    ],
    weight: 4, minRoom: 34, darkChance: 0, floor: 'carpet',
  }),
};

// Sprint 213 — service wing: kitchen / scullery / staff dining.
const roomKitchen: RoomTemplate = {
  id: 'kitchen-service',
  build: (rng) => spec('kitchen-service', 'maintenance', 9, 9, 3.1, {
    props: [
      { kind: 'kitchenRange', x: -3.4, z: -3.6, yaw: 0 },
      { kind: 'coalScuttle', x: -2.4, z: -3.9 },
      { kind: 'sculleryRack', x: -2.1, z: -4.36, y: 1.75, yaw: Math.PI },
      { kind: 'potRack', x: 2.6, z: -4.36, y: 2.0, yaw: Math.PI },
      { kind: 'pantryShelf', x: 3.6, z: -3.9, yaw: Math.PI },
      { kind: 'pantryShelf', x: 4.25, z: -1.6, yaw: -Math.PI / 2 },
      { kind: 'table', x: 0.4, z: 0.4 },
      { kind: 'cuttingBoard', x: 0.15, z: 0.3, y: 0.78 },
      { kind: 'kettle', x: 0.75, z: 0.55, y: 0.78 },
      { kind: 'carvedPlate', x: -0.25, z: 0.7, y: 0.78 },
      { kind: 'platedPie', x: 0.6, z: 0.85, y: 0.78 },
      { kind: 'stool', x: 0.2, z: 1.6 },
      { kind: 'stool', x: 1.0, z: -0.6, yaw: 0.7 },
      { kind: 'basinSink', x: 4.25, z: 1.9, yaw: -Math.PI / 2 },
      { kind: 'teaTrolley', x: -2.9, z: 2.2, yaw: 0.3 },
      { kind: 'woodenSpoon', x: 0.5, z: 0.1, y: 0.8 },
      { kind: 'crate2', x: -3.6, z: 0.4 },
      { kind: 'potRack', x: -4.36, z: 1.4, y: 2.0, yaw: Math.PI / 2 },
      { kind: 'wardrobe', x: -4.1, z: 3.3, yaw: Math.PI / 2 },
      { kind: 'meatHook', x: -1.4, z: 1.8, y: 2.35 },
      { kind: 'meatHook', x: 0.9, z: 2.5, y: 2.35 },
      { kind: 'grateDrain', x: 0.9, z: 1.9 },
      { kind: 'grateDrain', x: -2.6, z: -0.8 },
      { kind: 'valveWheel', x: -4.38, z: -0.5, y: 1.35, yaw: Math.PI / 2 },
      { kind: 'bucket', x: 3.4, z: 3.4 },
      { kind: 'wetFloor', x: 1.6, z: 1.3 },
      { kind: 'extinguisher', x: 4.32, z: 3.6, y: 1.4, yaw: -Math.PI / 2 },
      ...wallProps(9, 9, rng, ['wallSconce', 'keyRack'], 3),
    ],
    sockets: lootSockets([[0.4, 0.4], [3.6, -3.9]]),
    hiding: [{ kind: 'cabinet', x: -3.8, z: 3.3, yaw: Math.PI / 2, propKind: 'cabinet' }],
    lights: [
      { x: -2.4, y: 2.7, z: -2.2, color: 0xffb061, intensity: 0.75, range: 6.5, group: 'main', breakable: true },
      { x: 1.8, y: 2.7, z: 1.8, color: 0xdde4ee, intensity: 0.5, range: 6, group: 'dim', breakable: true },
    ],
    weight: 7,
    minRoom: 44,
    floor: 'metal',
    wall: 'tile',
    darkChance: 0.25,
    perf: 4,
  }),
};

const roomScullery: RoomTemplate = {
  id: 'scullery',
  build: (rng) => spec('scullery', 'maintenance', 7, 8, 2.9, {
    props: [
      { kind: 'basinSink', x: -2.9, z: -2.9, yaw: Math.PI / 2 },
      { kind: 'basinSink', x: -2.9, z: -1.7, yaw: Math.PI / 2 },
      { kind: 'sculleryRack', x: -3.38, z: 0.6, y: 1.75, yaw: Math.PI / 2 },
      { kind: 'sculleryRack', x: 3.38, z: -2.2, y: 1.75, yaw: -Math.PI / 2 },
      { kind: 'stackedLinen', x: 2.9, z: 2.6, yaw: -Math.PI / 2 },
      { kind: 'linenHamper', x: 2.2, z: -2.8, yaw: 0.2 },
      { kind: 'linenHamper', x: -2.2, z: 2.9, yaw: -0.4 },
      { kind: 'bucket', x: -2.0, z: -3.4 },
      { kind: 'puddle', x: -0.8, z: -0.8 },
      { kind: 'puddle', x: 1.6, z: 0.6 },
      { kind: 'wetFloor', x: 2.4, z: -1.8 },
      { kind: 'towelRail', x: 3.38, z: 1.2, y: 1.35, yaw: -Math.PI / 2 },
      { kind: 'table', x: 2.2, z: 0.8 },
      { kind: 'grateDrain', x: 0.5, z: 0.1 },
      { kind: 'dumbWaiterDoor', x: -2.3, z: 3.92, y: 1.15, yaw: Math.PI },
      { kind: 'linenPress', x: -3.2, z: -0.6, yaw: Math.PI / 2 },
      { kind: 'pears', x: -2.9, z: -2.6, y: 0.95 },
      ...wallProps(7, 8, rng, ['wallSconce', 'pegRail', 'wallVent'], 3),
    ],
    sockets: lootSockets([[2.9, 2.6]]),
    hiding: [{ kind: 'underFurniture', x: 2.2, z: 0.8, yaw: Math.PI, propKind: 'table' }],
    lights: [
      { x: 0, y: 2.5, z: -1.4, color: 0xdde4ee, intensity: 0.6, range: 5.5, group: 'main', breakable: true },
      { x: 0, y: 2.5, z: 2.2, color: 0xffc98a, intensity: 0.4, range: 5, group: 'dim', breakable: true },
    ],
    weight: 7,
    minRoom: 40,
    floor: 'metal',
    wall: 'tile',
    darkChance: 0.3,
    perf: 4,
  }),
};

const roomStaffDining: RoomTemplate = {
  id: 'staff-dining',
  build: (rng) => spec('staff-dining', 'records', 8, 9, 2.9, {
    props: [
      { kind: 'table', x: 0, z: -0.6 },
      { kind: 'table', x: 0, z: 1.0 },
      { kind: 'bedBench', x: -0.8, z: -0.6, yaw: Math.PI / 2 },
      { kind: 'bedBench', x: 0.8, z: -0.6, yaw: Math.PI / 2 },
      { kind: 'bedBench', x: -0.8, z: 1.0, yaw: Math.PI / 2 },
      { kind: 'bedBench', x: 0.8, z: 1.0, yaw: Math.PI / 2 },
      { kind: 'dresser', x: -3.3, z: -3.4, yaw: Math.PI / 2 },
      { kind: 'stackedLinen', x: 3.3, z: -3.4, yaw: -Math.PI / 2 },
      { kind: 'wardrobe', x: -3.35, z: 1.2, yaw: Math.PI / 2 },
      { kind: 'carvedPlate', x: -0.3, z: -0.7, y: 0.78 },
      { kind: 'carvedPlate', x: 0.35, z: 0.9, y: 0.78 },
      { kind: 'platedRoast', x: 0.15, z: -0.45, y: 0.78 },
      { kind: 'platedPie', x: -0.4, z: 1.05, y: 0.78 },
      { kind: 'ceilingRose', x: 0, z: 0.2, y: 2.86 },
      { kind: 'fruit', x: 0.1, z: 0.1, y: 0.78 },
      { kind: 'candle', x: -0.15, z: -0.5, y: 0.78 },
      { kind: 'podiumLectern', x: -3.2, z: 3.2, yaw: Math.PI * 0.75 },
      { kind: 'upholsteredHeadboard', x: 2.8, z: -4.35, yaw: Math.PI },
      { kind: 'teaTrolley', x: 3.0, z: 3.4 },
      { kind: 'candelabra', x: -2.7, z: -3.7 },
      { kind: 'wineRack', x: 3.85, z: -0.6, y: 1.7, yaw: -Math.PI / 2 },
      { kind: 'linenPress', x: -3.6, z: -2.0, yaw: Math.PI / 2 },
      { kind: 'dumbWaiterDoor', x: 3.88, z: 1.9, y: 1.15, yaw: -Math.PI / 2 },
      ...wallProps(8, 9, rng, ['painting', 'wallSconce', 'wallClock', 'keyRack'], 4),
    ],
    sockets: [...drawerSockets([[-3.3, -3.4]]), ...lootSockets([[3.0, 3.4]])],
    hiding: [{ kind: 'cabinet', x: -3.35, z: 1.2, yaw: Math.PI / 2, propKind: 'cabinet' }],
    lights: [
      { x: 0, y: 2.55, z: 0.2, color: 0xffc98a, intensity: 0.6, range: 6.5, group: 'main', breakable: true },
      { x: -2.4, y: 2.55, z: -3.0, color: 0xffc98a, intensity: 0.35, range: 5, group: 'dim', breakable: true },
    ],
    weight: 6,
    minRoom: 46,
    floor: 'wood',
    darkChance: 0.2,
    perf: 3,
  }),
};

export const MAIN_TEMPLATES: RoomTemplate[] = [
  corridorStraight, corridorWide, corridorL, corridorZig, corridorJunction,
  guestRoom, guestTwin, suiteSplit, bathAnte,
  recordsStacks, recordsOffice, recordsVault, recordsCross,
  maintPipes, maintBoiler, maintStairsUp, maintFlooded,
  galleryPortraits, galleryAtrium, galleryMezzanine,
  roomHedge, roomDorm, roomLobbySmall, roomDarkHall, roomUnlitStacks,
  roomUnlitVault, roomUnlitCrypt,
  roomPuzzleValve, roomArchiveAlcove, roomGalleryBroken, roomLongHall,
  roomBranchCloset, roomStorage, roomNarrowService, roomElevatorLobby,
  roomRecordsCage, roomObsGallery, roomCrawl, roomRotunda,
  roomMotelCorridor, roomOfficeBullpen, roomAnomalyTall, roomImpossible, maintServer,
  roomGreenRecords, roomDuel, roomVaulted,
  roomMorgue, roomLaundry, roomBoilerDetail, roomCubicleOffice, roomLibraryStacks,
  roomKitchen, roomScullery, roomStaffDining,
  roomProjection, roomGrandSuite, roomFabShop, roomCheckpoint, roomWaiting, roomBanquet, roomBunker, roomLobbyFoyer, roomSanctuary, roomCathedral,
  roomChapel,
  // milestone shells — weight 0, placed explicitly
  roomClinic, roomConservatory, roomIndexAntechamber, roomDecompress, roomFinalAnte,
];

export const MAIN_TEMPLATE_MAP = new Map(MAIN_TEMPLATES.map((t) => [t.id, t]));
