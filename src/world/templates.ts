/**
 * Main-floor room template library — 30+ structurally distinct templates.
 * Each `build(rng)` produces a RoomSpec in local space. Parameterization
 * (prop shifts, blockage, dark chance) changes player decisions, not just
 * dressing. All geometry is original.
 */
import type { Rng } from '../engine/rng';
import type { RoomSpec, RoomTemplate, Port, PropSpec, PropKind, LocalSocket, LocalHiding, LocalNav, LocalZone, LocalCollider, LightSpec, Wall } from './spec';
import { wallColliders, spineNav } from './spec';
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
    props: o.props ?? [],
    sockets: o.sockets ?? [],
    hiding: o.hiding ?? [],
    nav: o.nav ?? spineNav(w, d, entry, exits[0]),
    safeZones: o.safeZones ?? [],
    colliders: [...wallColliders(w, d, h, entry, exits), ...(o.colliders ?? [])],
    lights: o.lights ?? defaultLights(w, d, h),
    floorMaterial: o.floor ?? defaultFloor(biome),
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
};
const WALL_THIN: ReadonlySet<PropKind> = new Set(Object.keys(WALL_MOUNT_Y) as PropKind[]);

function wallProps(w: number, d: number, rng: Rng, kinds: PropKind[], n: number): PropSpec[] {
  const out: PropSpec[] = [];
  for (let i = 0; i < n; i++) {
    const wall = rng.int(0, 2); // 0 west, 1 east, 2 north-ish
    const kind = rng.pick(kinds);
    const inX = WALL_THIN.has(kind) ? 0.12 : 0.5;
    const inZ = WALL_THIN.has(kind) ? 0.15 : 0.6;
    const y = WALL_MOUNT_Y[kind];
    if (wall === 0) out.push({ kind, x: -w / 2 + inX, z: -d / 2 + 1 + rng.float() * (d - 2), y, yaw: Math.PI / 2 });
    else if (wall === 1) out.push({ kind, x: w / 2 - inX, z: -d / 2 + 1 + rng.float() * (d - 2), y, yaw: -Math.PI / 2 });
    else out.push({ kind, x: -w / 2 + 1 + rng.float() * (w - 2), z: d / 2 - inZ, y, yaw: Math.PI });
  }
  return out;
}

const drawerSockets = (spots: [number, number][]): LocalSocket[] =>
  spots.map(([x, z]) => ({ kind: 'drawer' as const, x, z, y: 0, meta: {} }));

const lootSockets = (spots: [number, number][]): LocalSocket[] =>
  spots.map(([x, z]) => ({ kind: 'loot' as const, x, z, y: 0, meta: {} }));

/* ================= CORRIDORS ================= */

const corridorStraight: RoomTemplate = {
  id: 'corr-straight',
  build: (rng) => spec('corr-straight', 'corridor', 3.2, 7 + rng.int(0, 4), 2.9, {
    entryOff: 0,
    props: [
      ...wallProps(3.2, 8, rng, ['painting', 'wallSconce', 'sign', 'wallClock'], rng.int(2, 4)),
      { kind: 'rug', x: 0, z: 0 },
    ],
    sockets: rng.bool(0.4) ? [{ kind: 'drawer', x: 1.0, z: 1.5, meta: {} }] : [],
    lights: [
      { x: 0, y: 2.6, z: -2, color: 0xffd9a0, intensity: 0.8, range: 5, group: 'main', breakable: true },
      { x: 0, y: 2.6, z: 2, color: 0xffd9a0, intensity: 0.8, range: 5, group: 'main', breakable: true },
    ],
    weight: 20,
  }),
};

const corridorWide: RoomTemplate = {
  id: 'corr-wide',
  build: (rng) => spec('corr-wide', 'corridor', 6, 9, 3.2, {
    props: [
      { kind: 'pillar', x: -2, z: 0, meta: { height: 3.2 } },
      { kind: 'pillar', x: 2, z: 0, meta: { height: 3.2 } },
      { kind: 'sofa', x: -2.2, z: 2.5, yaw: Math.PI / 2 },
      { kind: 'table', x: 2.2, z: 2.5 },
      { kind: 'vase', x: 2.2, z: 2.5, y: 0.8 },
      { kind: 'bookshelf', x: -2.6, z: -3.2, yaw: Math.PI / 2 },
      ...wallProps(6, 9, rng, ['painting', 'plant', 'wallSconce', 'wallClock'], 3),
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
    props: wallProps(4, 8, rng, ['wallSconce', 'painting', 'curtain', 'wallClock'], 3),
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
      ...wallProps(5, 10, rng, ['wallSconce', 'sign', 'wallClock'], 3),
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
      ...wallProps(7, 7, rng, ['painting', 'wallSconce', 'wallClock'], 4),
      { kind: 'cabinet', x: 2.6, z: -2.4, yaw: -Math.PI / 2 },
      { kind: 'clock', x: -2.8, z: -2.8 },
      { kind: 'statue', x: 0, z: 2.9, yaw: Math.PI },
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
      { kind: 'bed', x: -1.8, z: 1.4 },
      { kind: 'drawerUnit', x: -0.4, z: 1.5 },
      { kind: 'desk', x: 2.2, z: -1.6, yaw: -Math.PI / 2 },
      { kind: 'chair', x: 1.6, z: -1.6, yaw: Math.PI / 2 },
      { kind: 'rug', x: 0, z: 0.4 },
      { kind: 'clock', x: -2.7, z: -2.4 },
      { kind: 'vase', x: -0.4, z: 1.5, y: 0.72 },
      { kind: 'candle', x: 2.2, z: -1.4, y: 0.82 },
      { kind: 'bookshelf', x: 0.6, z: 2.55, yaw: Math.PI },
      ...wallProps(6.5, 6, rng, ['painting', 'wallSconce', 'curtain', 'wallClock'], 3),
    ],
    sockets: [...drawerSockets([[-0.4, 1.5], [2.2, -1.6]]), ...lootSockets([[0.5, 2.2]])],
    hiding: [
      { kind: 'cabinet', x: 2.5, z: 2.2, yaw: -Math.PI / 2, propKind: 'cabinet' },
      { kind: 'underFurniture', x: -1.8, z: 1.4, yaw: Math.PI, propKind: 'bed' },
    ],
    weight: 12,
  }),
};

const guestTwin: RoomTemplate = {
  id: 'guest-twin',
  build: (rng) => spec('guest-twin', 'guest', 7, 6.5, 2.9, {
    props: [
      { kind: 'bed', x: -1.6, z: 1.6 }, { kind: 'bed', x: 1.6, z: 1.6 },
      { kind: 'drawerUnit', x: 0, z: 1.9 },
      { kind: 'trolley', x: 2.6, z: -1.8 },
      { kind: 'partition', x: 0, z: 0.2, scale: 2.2 },
      ...wallProps(7, 6.5, rng, ['painting', 'wallSconce', 'wallClock'], 3),
    ],
    sockets: [...drawerSockets([[0, 1.9]]), ...lootSockets([[2.6, -1.8], [-2.8, -2]])],
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
      { kind: 'sofa', x: -2.4, z: 0.8, yaw: Math.PI / 2 },
      { kind: 'table', x: -2.4, z: -1.4 },
      { kind: 'bed', x: 3, z: 1.8 },
      { kind: 'desk', x: 3, z: -2, yaw: Math.PI },
      ...wallProps(9, 7, rng, ['painting', 'lamp', 'wallClock'], 4),
    ],
    sockets: [...drawerSockets([[3, -2]]), ...lootSockets([[-2.4, -1.4], [-3.6, 2.4]])],
    hiding: [
      { kind: 'cabinet', x: -3.8, z: -2.4, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'losAlcove', x: -3.6, z: 2.4, yaw: Math.PI / 2, propKind: 'partition' },
      { kind: 'underFurniture', x: 3, z: 1.8, yaw: Math.PI, propKind: 'bed' },
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
      ...wallProps(5, 7.5, rng, ['sign', 'wallSconce', 'wallClock'], 3),
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
      { kind: 'desk', x: -1.8, z: -1.4 }, { kind: 'desk', x: 1.8, z: -1.4 },
      { kind: 'filing', x: -3, z: 2.4 }, { kind: 'filing', x: -2.4, z: 2.4 },
      { kind: 'filing', x: 3, z: 2.4 },
      { kind: 'typewriter', x: -1.8, z: 0.55, y: 0.78 },
      { kind: 'deskLamp', x: 1.8, z: 0.7, y: 0.8 },
      { kind: 'candle', x: -1.8, z: -1.3, y: 0.8 },
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
      { kind: 'puddle', x: -0.4, z: 1.6 },
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
      { kind: 'locker', x: 3.2, z: 1.2, yaw: -Math.PI / 2 },
      { kind: 'stove', x: -3.2, z: -2.8 },
      { kind: 'trolley', x: -1.2, z: 3.2 },
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
      { kind: 'bust', x: -1.4, z: -0.4, y: 1.6 },
      { kind: 'bust', x: 1.4, z: 0.8, y: 1.6 },
      { kind: 'chandelier', x: 0, z: 0, y: 3.2 },
      { kind: 'rug', x: 0, z: 0 },
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
      { kind: 'clock', x: -4.6, z: 3.2, yaw: Math.PI / 2 },
      { kind: 'window', x: -5.2, z: -1, y: 2.2, yaw: Math.PI / 2 },
      { kind: 'window', x: -5.2, z: 1.6, y: 2.2, yaw: Math.PI / 2 },
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
  }),
};

const galleryMezzanine: RoomTemplate = {
  id: 'gallery-mezzanine',
  build: (_rng) => spec('gallery-mezzanine', 'gallery', 8, 9, 4.6, {
    props: [
      { kind: 'stairs', x: -2.6, z: 1.2, meta: { height: 1.8, length: 4 } },
      { kind: 'railing', x: 0, z: 3.2, scale: 7 },
      { kind: 'window', x: 3.6, z: 0.4, y: 2.4, yaw: -Math.PI / 2 },
      { kind: 'painting', x: 3.6, z: -2.4, y: 1.8, yaw: -Math.PI / 2 },
      { kind: 'bookshelf', x: 0.6, z: -2.8 },
      { kind: 'desk', x: 2.4, z: 2.2 },
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
      ...wallProps(9, 8, rng, ['sign', 'wallSconce', 'wallClock'], 3),
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
      { kind: 'plant', x: 0, z: -3.6 },
      { kind: 'window', x: -4.8, z: 0, y: 2.4, yaw: Math.PI / 2 },
      { kind: 'window', x: 4.8, z: 0, y: 2.4, yaw: -Math.PI / 2 },
      { kind: 'table', x: 0, z: 0.4, scale: 1.3 },
      { kind: 'chandelier', x: 0, z: 0, y: 4.0 },
      { kind: 'statue', x: 0, z: -3.8 },
      { kind: 'vase', x: 0.4, z: 0.4, y: 1.05 },
      { kind: 'plant', x: -1.6, z: -2.6 }, { kind: 'plant', x: 1.6, z: -2.6 },
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
      { kind: 'pillar', x: -3.0, z: -2.2, meta: { height: 4 } },
      { kind: 'pillar', x: 3.0, z: 2.2, meta: { height: 4 } },
      { kind: 'window', x: 0, z: 3.8, y: 2.2 },
      { kind: 'curtain', x: -1.4, z: 3.8 },
      { kind: 'curtain', x: 1.4, z: 3.8 },
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
      ...wallProps(5.5, 14, rng, ['painting', 'wallSconce', 'wallClock'], 5),
    ],
    hiding: [
      { kind: 'cabinet', x: -2.3, z: 6, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'cabinet', x: 2.3, z: -6, yaw: -Math.PI / 2, propKind: 'cabinet' },
    ],
    weight: 6,
    perf: 3,
  }),
};

const roomBranchCloset: RoomTemplate = {
  id: 'corr-closet-branch',
  build: (rng) => spec('corr-closet-branch', 'corridor', 5, 8, 2.9, {
    exits: [P(0, 'n'), P(1.4, 'e', 1.1)],
    props: [
      { kind: 'cabinet', x: 2.1, z: 1.4, yaw: -Math.PI / 2 },
      { kind: 'drawerUnit', x: -2.0, z: 1.8, yaw: Math.PI / 2 },
      ...wallProps(5, 8, rng, ['wallSconce', 'sign', 'wallClock'], 3),
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
      { kind: 'machineBox', x: 0.8, z: 3.2, scale: 0.6 },
      { kind: 'snare', x: 0, z: -1.5 },
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
      { kind: 'liftShaft', x: 2.6, z: 2.8 },
      { kind: 'trolley', x: -3.0, z: -1.8 },
      { kind: 'sign', x: 0, z: 3.4, y: 2.6 },
      { kind: 'plant', x: 3.0, z: -1.8 },
      { kind: 'chandelier', x: 0, z: 0, y: 3.2 },
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
  }),
};

const roomMotelCorridor: RoomTemplate = {
  id: 'corr-doors-row',
  build: (_rng) => spec('corr-doors-row', 'corridor', 6, 9, 3.0, {
    props: [
      { kind: 'painting', x: -2.8, z: -2.4, y: 1.7, yaw: Math.PI / 2 },
      { kind: 'painting', x: 2.8, z: -0.8, y: 1.7, yaw: -Math.PI / 2 },
      { kind: 'painting', x: -2.8, z: 1.2, y: 1.7, yaw: Math.PI / 2 },
      { kind: 'cabinet', x: 2.4, z: 3.2, yaw: -Math.PI / 2 },
      { kind: 'rug', x: 0, z: 0 },
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
      { kind: 'desk', x: -2.6, z: -1.4 }, { kind: 'desk', x: 0, z: -1.4 }, { kind: 'desk', x: 2.6, z: -1.4 },
      { kind: 'desk', x: -2.6, z: 1.0 }, { kind: 'desk', x: 0, z: 1.0 }, { kind: 'desk', x: 2.6, z: 1.0 },
      { kind: 'filing', x: -3.8, z: 3.0 }, { kind: 'filing', x: -3.1, z: 3.0 },
      { kind: 'waterCooler', x: 3.8, z: 3.0 },
      { kind: 'typewriter', x: 0, z: -1.45, y: 0.78 },
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
      { kind: 'plant', x: 0, z: -3.2 },
      { kind: 'rug', x: 0, z: 0 },
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
      { kind: 'bed', x: 2.9, z: 1.6 },
      { kind: 'drawerUnit', x: -3.6, z: -2.2 },
      { kind: 'drawerUnit', x: 3.7, z: -2.2 },
      { kind: 'lamp', x: -2.6, z: -0.8 },
    ],
    sockets: [...drawerSockets([[-3.6, -2.2], [3.7, -2.2]]), ...lootSockets([[0.4, 2.8]])],
    hiding: [
      { kind: 'underFurniture', x: -2.6, z: 1.6, yaw: Math.PI, propKind: 'bed' },
      { kind: 'underFurniture', x: 2.9, z: 1.6, yaw: Math.PI, propKind: 'bed' },
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
      { kind: 'rug', x: 0, z: 0 },
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

export const MAIN_TEMPLATES: RoomTemplate[] = [
  corridorStraight, corridorWide, corridorL, corridorZig, corridorJunction,
  guestRoom, guestTwin, suiteSplit, bathAnte,
  recordsStacks, recordsOffice, recordsVault, recordsCross,
  maintPipes, maintBoiler, maintStairsUp, maintFlooded,
  galleryPortraits, galleryAtrium, galleryMezzanine,
  roomHedge, roomDorm, roomLobbySmall, roomDarkHall, roomUnlitStacks,
  roomPuzzleValve, roomArchiveAlcove, roomGalleryBroken, roomLongHall,
  roomBranchCloset, roomStorage, roomNarrowService, roomElevatorLobby,
  roomRecordsCage, roomObsGallery, roomCrawl, roomRotunda,
  roomMotelCorridor, roomOfficeBullpen, roomAnomalyTall, roomImpossible,
  roomGreenRecords, roomDuel, roomVaulted,
  // milestone shells — weight 0, placed explicitly
  roomClinic, roomConservatory, roomIndexAntechamber, roomDecompress, roomFinalAnte,
];

export const MAIN_TEMPLATE_MAP = new Map(MAIN_TEMPLATES.map((t) => [t.id, t]));
