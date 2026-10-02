/**
 * The Underscript — subfloor template library. 12+ base layouts with strong
 * permutations: stripped office stacks, concrete service corridors, records
 * cages, silent break rooms, recurring stair landings. Repetition is
 * intentional — it supports attention-based play.
 */
import type { RoomSpec, RoomTemplate, Port, PropSpec, Wall } from './spec';
import { wallColliders, spineNav } from './spec';

const P = (offset: number, wall: Wall, width = 1.3): Port => ({ offset, wall, width });

function us(id: string, w: number, d: number, h: number, opts: Partial<RoomSpec> & { entryOff?: number; exits?: Port[] }): RoomSpec {
  const entry = P(opts.entryOff ?? 0, 's');
  const exits = opts.exits ?? [P(0, 'n')];
  return {
    templateId: id, version: 1, biome: 'underscript',
    width: w, depth: d, height: h, entry, exits,
    props: opts.props ?? [], sockets: opts.sockets ?? [], hiding: opts.hiding ?? [],
    nav: opts.nav ?? spineNav(w, d, entry, exits[0]),
    safeZones: opts.safeZones ?? [],
    colliders: [...wallColliders(w, d, h, entry, exits), ...(opts.colliders ?? [])],
    lights: opts.lights ?? [{ x: 0, y: h - 0.15, z: 0, color: 0xf2eeda, intensity: 0.7, range: Math.max(w, d), group: 'main', breakable: true }],
    floorMaterial: 'concrete',
    tags: opts.tags ?? [],
    darkChance: 0.5,
    weight: 10,
    perfCost: 2,
    minRoom: 0,
    special: opts.special,
  };
}

const u_corridor: RoomTemplate = {
  id: 'u-corridor',
  build: (rng) => us('u-corridor', 2.8, 8 + rng.int(0, 4), 2.5, {
    props: [
      { kind: 'fluoroTube', x: 0, z: -2, y: 2.4 },
      { kind: 'fluoroTube', x: 0, z: 2, y: 2.4 },
      { kind: 'pipe', x: -1.2, z: 0, y: 2.1, scale: 8 },
      { kind: 'manhole', x: 0.5, z: 0.8, y: 0.01 },
      ...(rng.bool(0.4) ? [{ kind: 'printer' as const, x: 0.9, z: 1.2 }] : []),
      ...(rng.bool(0.5) ? [{ kind: 'plasticCrate2' as const, x: -1.0, z: -3.0 }] : []),
    ],
    sockets: rng.bool(0.35) ? [{ kind: 'loot', x: 0.9, z: 1.2, meta: {} }] : [],
    weight: 16,
  }),
};

const u_officeRow: RoomTemplate = {
  id: 'u-office-row',
  build: (_rng) => us('u-office-row', 8, 8, 2.7, {
    props: [
      { kind: 'cubicle', x: -2.6, z: -1.8 }, { kind: 'cubicle', x: 0, z: -1.8 }, { kind: 'cubicle', x: 2.6, z: -1.8 },
      { kind: 'cubicle', x: -2.6, z: 0.8, yaw: Math.PI }, { kind: 'cubicle', x: 2.6, z: 0.8, yaw: Math.PI },
      { kind: 'schoolDesk', x: -3.4, z: 3.0 }, { kind: 'schoolChair', x: -3.4, z: 2.4, yaw: Math.PI },
      { kind: 'fluoroTube', x: -2, z: -0.5, y: 2.6 }, { kind: 'fluoroTube', x: 2, z: 0.5, y: 2.6 },
      { kind: 'typewriter', x: 0, z: 0.75, y: 0.78 },
    ],
    sockets: [{ kind: 'loot', x: 0, z: -1.8, meta: {} }, { kind: 'loot', x: -3.4, z: 3.0, meta: {} }],
    hiding: [
      { kind: 'cabinet', x: 3.4, z: 3.0, yaw: -Math.PI / 2, propKind: 'locker' },
      { kind: 'underFurniture', x: -2.6, z: -1.8, yaw: 0, propKind: 'desk' },
    ],
    weight: 12, perfCost: 3,
  }),
};

const u_breakRoom: RoomTemplate = {
  id: 'u-break',
  build: (_rng) => us('u-break', 6, 6, 2.6, {
    props: [
      { kind: 'breakTable', x: 0, z: 0 },
      { kind: 'chair', x: -0.8, z: 0.5, yaw: Math.PI }, { kind: 'chair', x: 0.8, z: -0.5 },
      { kind: 'waterCooler', x: 2.4, z: -2.4 },
      { kind: 'printer', x: -2.4, z: -2.4 },
      { kind: 'microwave', x: 0.4, z: 0.05, y: 0.78 },
      { kind: 'plasticChair', x: -0.2, z: -1.1, yaw: 0.4 },
      { kind: 'sign', x: 0, z: 2.95, y: 1.8 },
      { kind: 'fluoroTube', x: 0, z: 0, y: 2.5 },
    ],
    sockets: [{ kind: 'loot', x: -2.4, z: -2.4, meta: {} }, { kind: 'loot', x: 2.4, z: 2.4, meta: {} }],
    hiding: [{ kind: 'cabinet', x: -2.6, z: 2.4, yaw: Math.PI / 2, propKind: 'locker' }],
    weight: 8,
  }),
};

const u_recordsCageRoom: RoomTemplate = {
  id: 'u-records-cage',
  build: (_rng) => us('u-records-cage', 7, 8, 2.8, {
    props: [
      { kind: 'recordsCage', x: -2, z: -1 },
      { kind: 'recordsCage', x: 0.6, z: -1 },
      { kind: 'recordsCage', x: -0.7, z: 1.8 },
      { kind: 'filing', x: 2.8, z: -2.6 }, { kind: 'filing', x: 2.8, z: -1.9 },
      { kind: 'chainFence', x: -3.3, z: 0.4, yaw: Math.PI / 2 },
      { kind: 'cableTray', x: 0, z: -1, y: 2.6 },
      { kind: 'fluoroTube', x: 0, z: 0, y: 2.7 },
    ],
    sockets: [{ kind: 'loot', x: -2, z: -0.6, meta: {} }, { kind: 'drawer', x: 2.8, z: -2.2, meta: {} }],
    hiding: [
      { kind: 'cabinet', x: -2.9, z: 3.0, yaw: Math.PI / 2, propKind: 'locker' },
      { kind: 'losAlcove', x: 2.9, z: 3.0, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 2.9, z: 3.0, w: 1.2, d: 1.2 }],
    weight: 10,
  }),
};

const u_longHall: RoomTemplate = {
  id: 'u-long-hall',
  build: (_rng) => us('u-long-hall', 3.2, 15, 2.6, {
    props: [
      { kind: 'fluoroTube', x: 0, z: -5, y: 2.5 }, { kind: 'fluoroTube', x: 0, z: 0, y: 2.5 }, { kind: 'fluoroTube', x: 0, z: 5, y: 2.5 },
      { kind: 'pipe', x: -1.3, z: 0, y: 2.2, scale: 15 },
      { kind: 'exitSign', x: 0, z: 6.8, y: 2.4 },
      { kind: 'printer', x: 1.0, z: -3 },
      { kind: 'shutterDoor', x: -1.5, z: 3.5, yaw: Math.PI / 2 },
      { kind: 'hydrant', x: 1.2, z: 4.5 },
      { kind: 'cableTray', x: -1.3, z: -2, y: 2.3 },
    ],
    hiding: [{ kind: 'cabinet', x: -1.1, z: -6.5, yaw: Math.PI / 2, propKind: 'locker' }],
    sockets: [{ kind: 'loot', x: 1.0, z: -3, meta: {} }],
    weight: 8,
  }),
};

const u_stairLanding: RoomTemplate = {
  id: 'u-stair-landing',
  build: (_rng) => us('u-stair-landing', 5, 6, 4.4, {
    props: [
      { kind: 'stairLanding', x: 0, z: 1.4 },
      { kind: 'stairs', x: -1.4, z: -0.8, meta: { height: 1.3, length: 3 } },
      { kind: 'exitSign', x: 0, z: 2.8, y: 2.6 },
      { kind: 'woodLadder', x: 1.8, z: -1.6, yaw: 0.3 },
      { kind: 'fireAlarm', x: 2.45, z: 0.5, y: 1.8, yaw: -Math.PI / 2 },
      { kind: 'fluoroTube', x: 0, z: 0, y: 4.2 },
    ],
    colliders: [{ x: 0, z: 1.4, w: 3.0, d: 0.1, h: 1.1 }],
    nav: [
      { id: 'entry', x: 0, z: -2.1, links: ['up'], tags: ['door', 'entry'] },
      { id: 'up', x: -1.4, z: 0.4, links: ['entry', 'exit'], tags: ['stairs'] },
      { id: 'exit', x: 0, z: 2.1, links: ['up'], tags: ['door', 'exit'] },
    ],
    weight: 7,
    special: 'stairwell',
  }),
};

const u_openOffice: RoomTemplate = {
  id: 'u-open-office',
  build: (_rng) => us('u-open-office', 11, 9, 2.8, {
    props: [
      ...(Array.from({ length: 8 }, (_, i) => ({
        kind: 'cubicle' as const,
        x: -3.6 + (i % 4) * 2.4, z: -2.2 + Math.floor(i / 4) * 2.6,
        yaw: (i % 2) ? Math.PI : 0,
      }))),
      { kind: 'fluoroTube', x: -2, z: -1, y: 2.7 }, { kind: 'fluoroTube', x: 2, z: 1, y: 2.7 },
      { kind: 'printerRow', x: 0, z: 3.8 },
      { kind: 'waterCooler', x: -5, z: 3.6 },
      { kind: 'schoolDesk', x: 4.6, z: 0.4, yaw: -Math.PI / 2 }, { kind: 'schoolChair', x: 4.0, z: 0.4, yaw: -Math.PI / 2 },
      { kind: 'plasticCrate3', x: -4.8, z: -3.8 },
    ],
    sockets: [
      { kind: 'loot', x: -3.6, z: -2.2, meta: {} }, { kind: 'loot', x: 2.4, z: 0.4, meta: {} },
      { kind: 'loot', x: 0, z: 3.8, meta: {} }, { kind: 'drawer', x: -1.2, z: -2.2, meta: {} },
    ],
    hiding: [
      { kind: 'cabinet', x: 5, z: -3.6, yaw: -Math.PI / 2, propKind: 'locker' },
      { kind: 'cabinet', x: -5, z: -3.6, yaw: Math.PI / 2, propKind: 'locker' },
      { kind: 'losAlcove', x: 5, z: 3.6, yaw: -Math.PI / 2, propKind: 'partition' },
    ],
    safeZones: [{ x: 5, z: 3.6, w: 1.3, d: 1.3 }],
    weight: 8, perfCost: 4,
  }),
};

const u_serverRoom: RoomTemplate = {
  id: 'u-server',
  build: (_rng) => us('u-server', 8, 8, 2.9, {
    props: [
      { kind: 'machineBox', x: -2.4, z: -2.4, scale: 1.3 },
      { kind: 'machineBox', x: 0, z: -2.4, scale: 1.3 },
      { kind: 'machineBox', x: 2.4, z: -2.4, scale: 1.3 },
      { kind: 'machineBox', x: -2.4, z: 1.0, scale: 1.3 },
      { kind: 'machineBox', x: 2.4, z: 1.0, scale: 1.3 },
      { kind: 'chainFence', x: -1.9, z: -0.7 },
      { kind: 'cableTray', x: 0, z: -1.2, y: 2.7 },
      { kind: 'fluoroTube', x: 0, z: 0, y: 2.8 },
    ],
    colliders: [
      { x: -2.4, z: -2.4, w: 1.9, d: 1.0, h: 1.6 },
      { x: 0, z: -2.4, w: 1.9, d: 1.0, h: 1.6 },
      { x: 2.4, z: -2.4, w: 1.9, d: 1.0, h: 1.6 },
      { x: -2.4, z: 1.0, w: 1.9, d: 1.0, h: 1.6 },
      { x: 2.4, z: 1.0, w: 1.9, d: 1.0, h: 1.6 },
    ],
    sockets: [{ kind: 'loot', x: 0, z: 1.0, meta: {} }],
    hiding: [{ kind: 'losAlcove', x: 0, z: 3.2, yaw: Math.PI, propKind: 'partition' }],
    safeZones: [{ x: 0, z: 3.3, w: 1.4, d: 1.0 }],
    weight: 6,
  }),
};

const u_maze: RoomTemplate = {
  id: 'u-partition-maze',
  build: (rng) => {
    // Partition maze — permuted wall positions per seed.
    const parts = [
      { x: -2, z: -2 }, { x: 1.4, z: -1.2 }, { x: -1.4, z: 0.6 },
      { x: 2.2, z: 1.8 }, { x: -2.4, z: 2.8 },
    ];
    rng.shuffle(parts);
    return us('u-partition-maze', 9, 9, 2.7, {
      props: ([
        ...parts.map((p) => ({ kind: 'partition' as const, x: p.x, z: p.z, scale: 2.6, yaw: rng.bool() ? 0 : Math.PI / 2 })),
        { kind: 'fluoroTube' as const, x: 0, z: 0, y: 2.6 },
      ]) as PropSpec[],
      sockets: [{ kind: 'loot', x: 3.6, z: -3.6, meta: {} }],
      hiding: [{ kind: 'cabinet', x: -3.6, z: -3.6, yaw: Math.PI / 2, propKind: 'locker' }],
      safeZones: [{ x: -3.6, z: 3.6, w: 1.3, d: 1.3 }],
      nav: [
        { id: 'entry', x: 0, z: -3.6, links: ['m1'], tags: ['door', 'entry'] },
        { id: 'm1', x: 0.6, z: -0.4, links: ['entry', 'm2'], tags: [] },
        { id: 'm2', x: -0.6, z: 1.6, links: ['m1', 'exit'], tags: [] },
        { id: 'exit', x: 0, z: 3.6, links: ['m2'], tags: ['door', 'exit'] },
      ],
      weight: 6, perfCost: 3,
    });
  },
};

const u_printShop: RoomTemplate = {
  id: 'u-print-shop',
  build: (_rng) => us('u-print-shop', 8, 7, 2.7, {
    props: [
      { kind: 'printerRow', x: -1.8, z: -2.4 },
      { kind: 'printerRow', x: 1.8, z: -2.4 },
      { kind: 'printerRow', x: 0, z: 0.4 },
      { kind: 'paperStack', x: -3.2, z: 1.8 }, { kind: 'paperStack', x: 3.2, z: 1.8 },
      { kind: 'projector', x: 0, z: 0.45, y: 0.95 },
      { kind: 'fluoroTube', x: 0, z: -1, y: 2.6 },
    ],
    sockets: [{ kind: 'loot', x: 0, z: 0.4, meta: {} }, { kind: 'loot', x: -3.2, z: 1.8, meta: {} }],
    hiding: [{ kind: 'cabinet', x: 3.4, z: -0.6, yaw: -Math.PI / 2, propKind: 'locker' }],
    weight: 5,
    special: 'print-shop',
  }),
};

const u_lobby: RoomTemplate = {
  id: 'u-lobby',
  build: (_rng) => us('u-lobby', 9, 7, 3.2, {
    props: [
      { kind: 'counter', x: 0, z: 2.2, scale: 2.6 },
      { kind: 'sofa', x: -3.2, z: -1.4, yaw: Math.PI / 2 },
      { kind: 'sofa', x: 3.2, z: -1.4, yaw: -Math.PI / 2 },
      { kind: 'waterCooler', x: -3.6, z: 2.6 },
      { kind: 'shutterDoor', x: 0, z: 3.4 },
      { kind: 'plasticChair', x: 1.8, z: -0.8, yaw: 2.6 },
      { kind: 'fluoroTube', x: 0, z: 0, y: 3.1 },
      { kind: 'exitSign', x: 0, z: 3.4, y: 2.6 },
    ],
    sockets: [{ kind: 'loot', x: 0, z: 2.2, meta: {} }, { kind: 'loot', x: -3.6, z: 2.6, meta: {} }],
    hiding: [{ kind: 'cabinet', x: 3.8, z: 2.6, yaw: -Math.PI / 2, propKind: 'locker' }],
    weight: 5,
  }),
};

const u_deadEnd: RoomTemplate = {
  id: 'u-dead-end-loot',
  build: (_rng) => us('u-dead-end-loot', 4, 5, 2.5, {
    exits: [P(1.2, 'e'), P(0, 'n')],
    props: [
      { kind: 'filing', x: 1.4, z: -1.8 }, { kind: 'filing', x: 1.4, z: -1.1 },
      { kind: 'crate', x: -1.2, z: 1.6 },
      { kind: 'fluoroTube', x: 0, z: 0, y: 2.4 },
    ],
    sockets: [{ kind: 'loot', x: 1.4, z: -1.4, meta: {} }, { kind: 'loot', x: -1.2, z: 1.6, meta: {} }],
    weight: 4,
  }),
};

const u_doubleCubicle: RoomTemplate = {
  id: 'u-double-cubicle',
  build: (_rng) => us('u-double-cubicle', 10, 8, 2.7, {
    props: [
      { kind: 'cubicle', x: -3, z: -2 }, { kind: 'cubicle', x: -0.6, z: -2 }, { kind: 'cubicle', x: 1.8, z: -2 },
      { kind: 'cubicle', x: -3, z: 1.2, yaw: Math.PI }, { kind: 'cubicle', x: -0.6, z: 1.2, yaw: Math.PI }, { kind: 'cubicle', x: 1.8, z: 1.2, yaw: Math.PI },
      { kind: 'breakTable', x: 4.0, z: -0.4 },
      { kind: 'fluoroTube', x: -2, z: -0.4, y: 2.6 }, { kind: 'fluoroTube', x: 2, z: 0.4, y: 2.6 },
    ],
    sockets: [{ kind: 'loot', x: -3, z: -2, meta: {} }, { kind: 'loot', x: 1.8, z: 1.2, meta: {} }, { kind: 'drawer', x: -0.6, z: -2, meta: {} }],
    hiding: [
      { kind: 'cabinet', x: 4.4, z: 3.0, yaw: -Math.PI / 2, propKind: 'locker' },
      { kind: 'underFurniture', x: 4.0, z: -0.4, yaw: Math.PI, propKind: 'desk' },
    ],
    weight: 7, perfCost: 3,
  }),
};

const u_narrowStacks: RoomTemplate = {
  id: 'u-narrow-stacks',
  build: (_rng) => us('u-narrow-stacks', 6, 10, 2.8, {
    props: [
      { kind: 'filing', x: -2.2, z: -3.4 }, { kind: 'filing', x: -2.2, z: -2.7 },
      { kind: 'filing', x: -2.2, z: -0.7 }, { kind: 'filing', x: -2.2, z: 0 },
      { kind: 'filing', x: 2.2, z: -2 }, { kind: 'filing', x: 2.2, z: -1.3 },
      { kind: 'filing', x: 2.2, z: 1.4 }, { kind: 'filing', x: 2.2, z: 2.1 },
      { kind: 'fluoroTube', x: 0, z: -2, y: 2.7 }, { kind: 'fluoroTube', x: 0, z: 2, y: 2.7 },
    ],
    colliders: [
      { x: -2.2, z: -3.05, w: 0.6, d: 1.4, h: 1.3 }, { x: -2.2, z: -0.35, w: 0.6, d: 1.4, h: 1.3 },
      { x: 2.2, z: -1.65, w: 0.6, d: 1.4, h: 1.3 }, { x: 2.2, z: 1.75, w: 0.6, d: 1.4, h: 1.3 },
    ],
    sockets: [{ kind: 'loot', x: -2.2, z: 2.0, meta: {} }, { kind: 'drawer', x: 2.2, z: 3.6, meta: {} }],
    hiding: [{ kind: 'losAlcove', x: 0, z: -4.2, yaw: 0, propKind: 'partition' }],
    safeZones: [{ x: 0, z: -4.3, w: 1.2, d: 1.0 }],
    weight: 7,
  }),
};

export const UNDERSCRIPT_TEMPLATES: RoomTemplate[] = [
  u_corridor, u_officeRow, u_breakRoom, u_recordsCageRoom, u_longHall,
  u_stairLanding, u_openOffice, u_serverRoom, u_maze, u_printShop,
  u_lobby, u_deadEnd, u_doubleCubicle, u_narrowStacks,
];

export const UNDERSCRIPT_TEMPLATE_MAP = new Map(UNDERSCRIPT_TEMPLATES.map((t) => [t.id, t]));
