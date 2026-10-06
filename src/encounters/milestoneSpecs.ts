/**
 * Authored milestone rooms as RoomSpecs. These are the fixed, authored
 * encounters of the run: lobby, antechambers, The Index, the Custodian's
 * Counter, the Lens Hall, both Pursuer chases, and The Engine.
 *
 * `special` markers are interpreted by encounter controllers at runtime.
 */
import type { Rng } from '../engine/rng';
import type { RoomSpec, Port } from '../world/spec';
import { wallColliders } from '../world/spec';

const p = (offset: number, wall: Port['wall'], width = 1.4): Port => ({ offset, wall, width });

function base(id: string, w: number, d: number, h: number, spec: Partial<RoomSpec>): RoomSpec {
  const entry = spec.entry ?? p(0, 's', 1.4);
  const exits = spec.exits ?? [p(0, 'n', 1.4)];
  return {
    templateId: id, version: 1, biome: 'milestone',
    width: w, depth: d, height: h, entry, exits,
    props: spec.props ?? [], sockets: spec.sockets ?? [], hiding: spec.hiding ?? [],
    nav: spec.nav ?? [], safeZones: spec.safeZones ?? [],
    colliders: [...wallColliders(w, d, h, entry, exits), ...(spec.colliders ?? [])],
    lights: spec.lights ?? [{ x: 0, y: h - 0.4, z: 0, color: 0xffe0b0, intensity: 1.0, range: Math.max(w, d), group: 'main' }],
    floorMaterial: spec.floorMaterial ?? 'stone',
    tags: spec.tags ?? [], darkChance: 0, weight: 0, perfCost: 4, minRoom: 0,
    special: spec.special,
  };
}

function lobbySpec(): RoomSpec {
  return base('ms-lobby', 10, 9, 4.5, {
    special: 'lobby',
    floorMaterial: 'carpet',
    props: [
      // The front desk: counter, register, bell, the ledger — arrival theater.
      { kind: 'counter', x: 0, z: 1.5, scale: 3.4 },
      { kind: 'register', x: 0.8, z: 1.5, y: 1.15 },
      { kind: 'counterBell', x: 1.55, z: 1.4, y: 1.12 },
      { kind: 'paperStack', x: -0.9, z: 1.5, y: 1.1 },
      { kind: 'vase', x: -1.8, z: 1.5, y: 1.05 },
      // Pigeonhole key/mail racks flanking the lift behind the desk.
      { kind: 'keyRack', x: -3.15, z: 4.36, y: 1.35, yaw: Math.PI },
      { kind: 'keyRack', x: 3.15, z: 4.36, y: 1.35, yaw: Math.PI },
      { kind: 'liftDoors', x: 0, z: 4.45 },
      { kind: 'chandelier', x: 0, z: 0, y: 4.0 },
      // Seating islands.
      { kind: 'sofa', x: -3.6, z: 0.4, yaw: Math.PI / 2 },
      { kind: 'sofa', x: 3.6, z: 0.4, yaw: -Math.PI / 2 },
      { kind: 'coffeeTable', x: -3.4, z: 1.6 },
      { kind: 'pillows', x: -3.6, z: 0.2, y: 0.72 },
      { kind: 'teaSet', x: -3.4, z: 1.5, y: 0.5 },
      { kind: 'coffeeTable', x: 3.4, z: 1.6 },
      { kind: 'plant', x: -4.2, z: -3.2 }, { kind: 'plant', x: 4.2, z: -3.2 },
      { kind: 'statue', x: -4.4, z: 3.8, yaw: Math.PI },
      { kind: 'statue', x: 4.4, z: 3.8, yaw: Math.PI },
      { kind: 'clock', x: -4.4, z: -1.6, yaw: Math.PI / 2 },
      { kind: 'coffeeCart', x: -4.0, z: -0.8, yaw: Math.PI / 2 },
      // Luggage drop by the door — somebody checked in and never left.
      { kind: 'luggageRack', x: -4.15, z: -3.5, yaw: Math.PI / 2 },
      { kind: 'suitcase', x: -3.35, z: -3.55, yaw: 0.4 },
      { kind: 'suitcase', x: -4.2, z: -3.45, y: 0.5 },
      { kind: 'suitcase', x: -3.5, z: -4.05, yaw: -0.25 },
      { kind: 'trolley', x: 4.3, z: -3.3, yaw: -Math.PI / 2 },
      // Wall rhythm, west: sconce — painting — sconce.
      { kind: 'wallSconce', x: -4.86, z: -1.4, y: 2.05, yaw: Math.PI / 2 },
      { kind: 'painting', x: -4.86, z: 0.1, y: 1.6, yaw: Math.PI / 2 },
      { kind: 'wallSconce', x: -4.86, z: 1.6, y: 2.05, yaw: Math.PI / 2 },
      // East: sconce — mirror — sconce — payphone.
      { kind: 'wallSconce', x: 4.86, z: -1.4, y: 2.05, yaw: -Math.PI / 2 },
      { kind: 'mirror', x: 4.86, z: 0.3, y: 1.55, yaw: -Math.PI / 2 },
      { kind: 'wallSconce', x: 4.86, z: 1.8, y: 2.05, yaw: -Math.PI / 2 },
      { kind: 'payphone', x: 4.7, z: 3.9, yaw: -Math.PI / 2 },
      { kind: 'sign', x: 0, z: -4.2, y: 2.6 },
      { kind: 'wallClock', x: -2.3, z: -4.4, y: 2.25, yaw: 0 },
      { kind: 'curtain', x: 2.3, z: -4.35, y: 1.25, yaw: 0 },
    ],
    sockets: [
      // The register — arrival beat: signing it grants imprints + a document
      // and cues the objective. Always filled; the lobby is the tutorial.
      { kind: 'loot', x: 0, z: 2.0, y: 1.05, meta: { arrivalRegister: true } },
    ],
    lights: [
      { x: 0, y: 3.8, z: 0, color: 0xffe2b8, intensity: 1.4, range: 12, group: 'main' },
      { x: -3.5, y: 2.4, z: -3, color: 0xffd9a0, intensity: 0.6, range: 5, group: 'accent' },
      { x: 3.5, y: 2.4, z: -3, color: 0xffd9a0, intensity: 0.6, range: 5, group: 'accent' },
    ],
  });
}

function indexSpec(rng: Rng): RoomSpec {
  // Two-level circular indexing chamber (approximated by radial shelf rings).
  const shelves: RoomSpec['props'] = [];
  const colliders: RoomSpec['colliders'] = [];
  const sockets: RoomSpec['sockets'] = [];
  const nav: RoomSpec['nav'] = [];
  // Radial shelves around center, leaving aisles.
  const ringR = 5.2;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + (rng.float() - 0.5) * 0.06;
    const x = Math.cos(a) * ringR;
    const z = Math.sin(a) * ringR;
    shelves.push({ kind: 'bookshelf', x, z, yaw: a + Math.PI / 2 });
    colliders.push({ x, z, w: 2.0, d: 0.5, h: 2.3 });
  }
  // Inner ring pillars + upper gallery impression.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    shelves.push({ kind: 'pillar', x: Math.cos(a) * 2.4, z: Math.sin(a) * 2.4, meta: { height: 4.6 } });
    colliders.push({ x: Math.cos(a) * 2.4, z: Math.sin(a) * 2.4, w: 0.6, d: 0.6, h: 4.6 });
  }
  shelves.push({ kind: 'catalogueDesk', x: 0, z: 0 });
  // Seal console hugs the back wall OFF the door axis — dead-center at
  // (0,-9.4) sat inside the entry door's swing lane and was lane-culled
  // out of existence (sprint-222 find).
  shelves.push({ kind: 'sealConsole', x: 3.6, z: -9.2 });
  shelves.push({ kind: 'catalogTrack', x: 0, z: 0, y: 4.2, scale: 14 });
  shelves.push({ kind: 'catalogTrack', x: 0, z: 0, y: 4.2, scale: 14, yaw: Math.PI / 2 });
  shelves.push({ kind: 'rollingLadder', x: 4.4, z: 2.0 });
  // Catalogue card/cylinder sockets around the chamber.
  const sockSpots: [number, number][] = [
    [-4.6, -4.4], [4.6, -4.4], [-4.6, 4.4], [4.6, 4.4], [0, 5.4],
    [-6.4, 0], [6.4, 0], [-2.6, -6.8], [2.6, -6.8], [3.4, 7.4], [-3.4, 7.4],
  ];
  for (const [x, z] of sockSpots) sockets.push({ kind: 'clue', x, z, y: 1.1, meta: {} });
  sockets.push({ kind: 'clue', x: 0, z: 0, y: 1.0, meta: { catalogue: true } });
  nav.push(
    { id: 'entry', x: 0, z: -8.6, links: ['ring-s'], tags: ['door', 'entry'] },
    { id: 'ring-s', x: 0, z: -5.6, links: ['entry', 'ring-e', 'ring-w', 'center'], tags: ['ring'] },
    { id: 'ring-e', x: 5.6, z: 0, links: ['ring-s', 'ring-n'], tags: ['ring'] },
    { id: 'ring-w', x: -5.6, z: 0, links: ['ring-s', 'ring-n'], tags: ['ring'] },
    { id: 'ring-n', x: 0, z: 5.6, links: ['ring-e', 'ring-w', 'exit'], tags: ['ring'] },
    { id: 'center', x: 0, z: 0, links: ['ring-s', 'ring-e', 'ring-w'], tags: ['center'] },
    { id: 'exit', x: 0, z: 8.6, links: ['ring-n'], tags: ['door', 'exit'] },
  );
  return base('ms-index', 21, 21, 4.6, {
    special: 'index',
    props: shelves,
    colliders,
    sockets,
    nav,
    hiding: [
      { kind: 'losAlcove', x: -7.6, z: -7.6, yaw: Math.PI / 4, propKind: 'partition' },
      { kind: 'losAlcove', x: 7.6, z: -7.6, yaw: -Math.PI / 4, propKind: 'partition' },
      { kind: 'losAlcove', x: -7.6, z: 7.6, yaw: Math.PI * 0.75, propKind: 'partition' },
      { kind: 'losAlcove', x: 7.6, z: 7.6, yaw: -Math.PI * 0.75, propKind: 'partition' },
      { kind: 'cabinet', x: -9.4, z: 0, yaw: Math.PI / 2, propKind: 'cabinet' },
      { kind: 'cabinet', x: 9.4, z: 0, yaw: -Math.PI / 2, propKind: 'cabinet' },
    ],
    safeZones: [
      { x: -7.6, z: -7.6, w: 1.6, d: 1.6 }, { x: 7.6, z: -7.6, w: 1.6, d: 1.6 },
      { x: -7.6, z: 7.6, w: 1.6, d: 1.6 }, { x: 7.6, z: 7.6, w: 1.6, d: 1.6 },
    ],
    floorMaterial: 'wood',
    tags: ['index', 'carpet-edges'],
    lights: [
      { x: 0, y: 4.2, z: 0, color: 0xcfe0b8, intensity: 1.2, range: 14, group: 'main' },
      { x: -6, y: 3.4, z: -6, color: 0xaac8a0, intensity: 0.5, range: 6, group: 'accent' },
      { x: 6, y: 3.4, z: 6, color: 0xaac8a0, intensity: 0.5, range: 6, group: 'accent' },
    ],
  });
}

function custodianSpec(): RoomSpec {
  return base('ms-custodian', 8, 8, 3.4, {
    special: 'custodian',
    floorMaterial: 'wood',
    props: [
      { kind: 'merchantCounter', x: 0, z: 1.6 },
      { kind: 'speakingTube', x: -0.8, z: 1.6, y: 0 },
      { kind: 'till', x: 0.7, z: 1.3, y: 1.15 },
      { kind: 'trolley', x: -3.2, z: -1.8 },
      { kind: 'lamp', x: 3.2, z: -1.6 },
      { kind: 'sign', x: 0, z: -3.4, y: 2.2 },
      { kind: 'paperStack', x: -1.5, z: 1.2, y: 1.1 },
      { kind: 'register', x: 0.7, z: 1.45, y: 1.15 },
      { kind: 'basket', x: 1.6, z: 1.3 },
    ],
    sockets: [
      { kind: 'itemPedestal', x: -1.0, z: 1.0, y: 1.15, meta: { shop: 'slot0' } },
      { kind: 'itemPedestal', x: -0.35, z: 1.0, y: 1.15, meta: { shop: 'slot1' } },
      { kind: 'itemPedestal', x: 0.35, z: 1.0, y: 1.15, meta: { shop: 'slot2' } },
      { kind: 'itemPedestal', x: 1.0, z: 1.0, y: 1.15, meta: { shop: 'slot3' } },
      { kind: 'loot', x: -3.2, z: 3.2, meta: {} },
    ],
    hiding: [],
    lights: [
      { x: 0, y: 3.0, z: 1.0, color: 0xffd9a0, intensity: 1.2, range: 9, group: 'main' },
      { x: 0, y: 2.2, z: 2.4, color: 0xffe8c0, intensity: 0.8, range: 4, group: 'accent' },
    ],
  });
}

function underEntranceSpec(): RoomSpec {
  return base('ms-under-entrance', 7, 8, 3.2, {
    special: 'underEntrance',
    floorMaterial: 'concrete',
    props: [
      { kind: 'machineBox', x: -2.4, z: 1.6, scale: 1.2 },
      { kind: 'keypad', x: -1.4, z: 1.6, y: 1.2 },
      { kind: 'pipe', x: 0, z: 3.4, y: 2.2, scale: 7 },
      { kind: 'sign', x: 0.4, z: 3.4, y: 2.2 },
      { kind: 'vent', x: 2.8, z: -1.6, yaw: -Math.PI / 2 },
      { kind: 'machineBox', x: 2.4, z: 1.6, scale: 1.0 },
      { kind: 'liftShaft', x: 2.6, z: 3.4 },
      { kind: 'instrPanel', x: -3.2, z: 0.2, yaw: Math.PI / 2 },
      { kind: 'mousetrap', x: 1.6, z: -2.4 },
    ],
    sockets: [
      { kind: 'key', x: -2.4, z: 1.6, y: 1.4, meta: { sealClamp: 'a' } },
      { kind: 'key', x: 2.4, z: 1.6, y: 1.4, meta: { sealClamp: 'b' } },
      { kind: 'key', x: 2.6, z: 3.4, y: 1.2, meta: { underDoor: true } },
    ],
    hiding: [{ kind: 'vent', x: 2.8, z: -1.6, yaw: -Math.PI / 2, propKind: 'vent' }],
    lights: [{ x: 0, y: 2.8, z: 0, color: 0xd0e0d8, intensity: 0.7, range: 8, group: 'main' }],
  });
}

function lensHallSpec(): RoomSpec {
  const nav: RoomSpec['nav'] = [
    { id: 'entry', x: 0, z: -8.6, links: ['a', 'b'], tags: ['door', 'entry'] },
    { id: 'a', x: -4.5, z: -4.5, links: ['entry', 'c'], tags: [] },
    { id: 'b', x: 4.5, z: -4.5, links: ['entry', 'd'], tags: [] },
    { id: 'c', x: -4.5, z: 4.5, links: ['a', 'exit'], tags: [] },
    { id: 'd', x: 4.5, z: 4.5, links: ['b', 'exit'], tags: [] },
    { id: 'exit', x: 0, z: 8.6, links: ['c', 'd'], tags: ['door', 'exit'] },
  ];
  return base('ms-lens-hall', 20, 20, 7.0, {
    special: 'lensHall',
    floorMaterial: 'stone',
    props: [
      { kind: 'orreryRig', x: 0, z: 0, y: 6.4 },
      { kind: 'pylon', x: -6.5, z: -5.5 },
      { kind: 'pylon', x: 6.5, z: -5.5 },
      { kind: 'pylon', x: -6.5, z: 5.5 },
      { kind: 'pylon', x: 6.5, z: 5.5 },
      { kind: 'pillar', x: -2.6, z: 0, meta: { height: 7 } },
      { kind: 'pillar', x: 2.6, z: 0, meta: { height: 7 } },
      { kind: 'machineBox', x: 0, z: -3.4, scale: 1.4 },
      { kind: 'machineBox', x: -3.6, z: 2.0, scale: 1.1 },
      { kind: 'hangingPanels', x: 0, z: 3.0, y: 4.4 },
      { kind: 'trench', x: 0, z: -6.5 },
      { kind: 'pillar', x: 0, z: 4.2, meta: { height: 7 } },
    ],
    colliders: [
      { x: -2.6, z: 0, w: 0.6, d: 0.6, h: 7 },
      { x: 2.6, z: 0, w: 0.6, d: 0.6, h: 7 },
      { x: 0, z: -3.4, w: 2.0, d: 1.0, h: 1.6 },
      { x: -3.6, z: 2.0, w: 1.6, d: 1.0, h: 1.6 },
      { x: 0, z: 4.2, w: 0.6, d: 0.6, h: 7 },
    ],
    sockets: [
      { kind: 'key', x: -6.5, z: -5.5, y: 1.2, meta: { pylon: 0 } },
      { kind: 'key', x: 6.5, z: -5.5, y: 1.2, meta: { pylon: 1 } },
      { kind: 'key', x: -6.5, z: 5.5, y: 1.2, meta: { pylon: 2 } },
      { kind: 'key', x: 6.5, z: 5.5, y: 1.2, meta: { pylon: 3 } },
    ],
    nav,
    hiding: [
      { kind: 'losAlcove', x: -8.6, z: 0, yaw: Math.PI / 2, propKind: 'partition' },
      { kind: 'losAlcove', x: 8.6, z: 0, yaw: -Math.PI / 2, propKind: 'partition' },
      { kind: 'losAlcove', x: 0, z: -8.0, yaw: 0, propKind: 'partition' },
    ],
    safeZones: [
      { x: -8.6, z: 0, w: 1.5, d: 1.6 }, { x: 8.6, z: 0, w: 1.5, d: 1.6 },
      { x: 0, z: -8.0, w: 1.6, d: 1.2 },
    ],
    lights: [
      { x: 0, y: 6.2, z: 0, color: 0x88aaff, intensity: 0.8, range: 20, group: 'main' },
      { x: -6.5, y: 2.6, z: -5.5, color: 0xd88b2a, intensity: 0.5, range: 4, group: 'warning' },
      { x: 6.5, y: 2.6, z: -5.5, color: 0xd88b2a, intensity: 0.5, range: 4, group: 'warning' },
      { x: -6.5, y: 2.6, z: 5.5, color: 0xd88b2a, intensity: 0.5, range: 4, group: 'warning' },
      { x: 6.5, y: 2.6, z: 5.5, color: 0xd88b2a, intensity: 0.5, range: 4, group: 'warning' },
    ],
    tags: ['lensHall'],
  });
}

function chaseSpec(id: string, second: boolean): RoomSpec {
  // Authored chase corridor: a long segmented route with obstacles, vaults,
  // crouch passages, and a branch read. Built as a wide segmented room.
  const props: RoomSpec['props'] = [];
  const colliders: RoomSpec['colliders'] = [];
  const nav: RoomSpec['nav'] = [];
  const w = 6, d = second ? 26 : 20;
  // Segmented gates with alternating openings the player must read.
  const gateCount = second ? 6 : 4;
  let side = -1;
  for (let i = 0; i < gateCount; i++) {
    const z = -d / 2 + (i + 1) * (d / (gateCount + 1));
    const gapX = side * 1.6; // alternate gap side — route is readable via swinging lamps
    props.push({ kind: 'wallSconce', x: gapX, z: z - 0.4, y: 2.0 });
    // wall with gap at gapX
    const gw = 1.6;
    colliders.push({ x: (-w / 2 + gapX - gw / 2) / 2 - 0.4, z, w: (gapX - gw / 2) + w / 2, d: 0.3, h: 3.2 });
    colliders.push({ x: (w / 2 + gapX + gw / 2) / 2 + 0.4, z, w: w / 2 - (gapX + gw / 2), d: 0.3, h: 3.2 });
    props.push({ kind: 'hangingPanels', x: gapX, z: z + 0.3, y: 2.4 });
    nav.push({ id: `gate${i}`, x: gapX, z, links: i === 0 ? ['entry'] : [`gate${i - 1}`], tags: ['gate'] });
    // occasional crouch/vault props between gates
    if (i % 2 === 1) {
      props.push({ kind: 'crate', x: -gapX * 0.6, z: z + 1.4, scale: 0.9 });
      colliders.push({ x: -gapX * 0.6, z: z + 1.4, w: 0.8, d: 0.8, h: 0.8, walkable: true });
    }
    side = -side;
  }
  nav.unshift({ id: 'entry', x: 0, z: -d / 2 + 1, links: ['gate0'], tags: ['door', 'entry'] });
  nav[nav.length - 1].links.push('exit');
  nav.push({ id: 'exit', x: 0, z: d / 2 - 1, links: [`gate${gateCount - 1}`], tags: ['door', 'exit'] });
  if (second) {
    // second chase adds one hazard set: snares + steam
    props.push({ kind: 'snare', x: -1.2, z: -4 });
    props.push({ kind: 'steamVent', x: 1.4, z: 6 });
  }
  return base(id, w, d, 3.2, {
    special: second ? 'chase2' : 'chase1',
    floorMaterial: 'stone',
    props, colliders, nav,
    lights: [
      { x: 0, y: 2.9, z: -d / 4, color: 0xd88b2a, intensity: 0.8, range: 8, group: 'main' },
      { x: 0, y: 2.9, z: d / 4, color: 0xd88b2a, intensity: 0.8, range: 8, group: 'main' },
      { x: 0, y: 2.9, z: 0, color: 0xa83226, intensity: 0.4, range: 10, group: 'warning' },
    ],
    tags: ['chase'],
  });
}

function engineSpec(): RoomSpec {
  // Three-level engine chamber approximated as a tall hall with platforms,
  // relay sockets distributed across levels, central routing board, freight lift.
  const props: RoomSpec['props'] = [
    { kind: 'freightLift', x: 0, z: 10.5 },
    { kind: 'liftDoors', x: 0, z: 9.0 },
    { kind: 'routingBoard', x: 0, z: -6.5 },
    { kind: 'machineBox', x: -5.5, z: -4, scale: 1.6 },
    { kind: 'machineBox', x: 5.5, z: -4, scale: 1.6 },
    { kind: 'machineBox', x: -5.5, z: 3, scale: 1.2 },
    { kind: 'machineBox', x: 5.5, z: 3, scale: 1.2 },
    { kind: 'pillar', x: -3, z: 0, meta: { height: 7 } },
    { kind: 'pillar', x: 3, z: 0, meta: { height: 7 } },
    { kind: 'stairs', x: -6.5, z: -1.5, meta: { height: 2.2, length: 4 }, yaw: Math.PI / 2 },
    { kind: 'stairs', x: 6.5, z: 1.5, meta: { height: 2.2, length: 4 }, yaw: -Math.PI / 2 },
    { kind: 'railing', x: -5.0, z: 2.8, scale: 4, yaw: Math.PI / 2 },
    { kind: 'railing', x: 5.0, z: -2.8, scale: 4, yaw: Math.PI / 2 },
    { kind: 'catalogTrack', x: 0, z: 0, y: 6.4, scale: 15 },
    { kind: 'hangingPanels', x: -2, z: 5, y: 4.4 },
    { kind: 'hangingPanels', x: 2, z: -7, y: 4.4 },
    { kind: 'pipe', x: -7.5, z: 0, y: 3.2, scale: 18 },
    { kind: 'pipe', x: 7.5, z: 0, y: 3.2, scale: 18 },
    { kind: 'steamVent', x: -3.5, z: 6.5 },
    { kind: 'steamVent', x: 3.5, z: 6.5 },
    { kind: 'instrPanel', x: -8.2, z: -4, yaw: Math.PI / 2 },
    { kind: 'instrPanel', x: 8.2, z: -4, yaw: -Math.PI / 2 },
    { kind: 'instrPanel', x: -8.2, z: 3, yaw: Math.PI / 2 },
    { kind: 'ironGate', x: -1.9, z: -10.6, yaw: 0 },
    { kind: 'ironGate', x: 1.9, z: -10.6, yaw: 0 },
    { kind: 'barrel', x: -7.6, z: -7.4 },
    { kind: 'propaneTank', x: 7.6, z: -7.2 },
    { kind: 'toolChest', x: -6.8, z: -7.2 },
  ];
  const sockets: RoomSpec['sockets'] = [];
  // 7 relay sockets across the chamber
  const relaySpots: [number, number][] = [
    [-6.5, -4.5], [6.5, -4.5], [-7, 1.5], [7, -1.5],
    [-4, 6], [4, 6], [0, 2.5],
  ];
  for (const [x, z] of relaySpots) sockets.push({ kind: 'key', x, z, y: 1.1, meta: { relay: true } });
  sockets.push({ kind: 'key', x: 0, z: -6.5, y: 1.2, meta: { board: true } });
  sockets.push({ kind: 'key', x: 0, z: -8.8, y: 1.2, meta: { isolator: true } });
  const nav: RoomSpec['nav'] = [
    { id: 'entry', x: 0, z: -9.1, links: ['lower'], tags: ['door', 'entry'] },
    { id: 'lower', x: 0, z: -4.5, links: ['entry', 'westUp', 'eastUp', 'center'], tags: [] },
    { id: 'westUp', x: -5.5, z: -0.5, links: ['lower', 'westTop'], tags: [] },
    { id: 'westTop', x: -5.5, z: 2.5, links: ['westUp', 'bridge'], tags: ['upper'] },
    { id: 'eastUp', x: 5.5, z: -0.5, links: ['lower', 'eastTop'], tags: [] },
    { id: 'eastTop', x: 5.5, z: 2.5, links: ['eastUp', 'bridge'], tags: ['upper'] },
    { id: 'center', x: 0, z: 0, links: ['lower', 'liftArea'], tags: ['center'] },
    { id: 'bridge', x: 0, z: 4.5, links: ['westTop', 'eastTop', 'liftArea'], tags: ['upper'] },
    { id: 'liftArea', x: 0, z: 8.5, links: ['center', 'bridge'], tags: ['lift'] },
    { id: 'exit', x: 0, z: 9.6, links: ['liftArea'], tags: ['door', 'exit'] },
  ];
  return base('ms-engine', 18, 22, 7.0, {
    special: 'engine',
    floorMaterial: 'metal',
    props, sockets, nav,
    colliders: [
      { x: -5.5, z: -4, w: 2.2, d: 1.0, h: 1.6 },
      { x: 5.5, z: -4, w: 2.2, d: 1.0, h: 1.6 },
      { x: -5.5, z: 3, w: 1.8, d: 1.0, h: 1.6 },
      { x: 5.5, z: 3, w: 1.8, d: 1.0, h: 1.6 },
      // upper platforms (walkable tops, approximated by ramps at runtime)
      { x: -5.5, z: 2.5, w: 3.0, d: 5.0, h: 0.1 },
    ],
    hiding: [
      { kind: 'losAlcove', x: -7.6, z: -7.6, yaw: Math.PI / 4, propKind: 'partition' },
      { kind: 'losAlcove', x: 7.6, z: 7.0, yaw: -Math.PI / 4, propKind: 'partition' },
      { kind: 'cabinet', x: -7.8, z: 4.5, yaw: Math.PI / 2, propKind: 'locker' },
    ],
    safeZones: [{ x: -7.6, z: -7.6, w: 1.6, d: 1.6 }, { x: 7.6, z: 7.0, w: 1.6, d: 1.6 }],
    lights: [
      { x: 0, y: 6.0, z: 0, color: 0xd8a04a, intensity: 1.0, range: 18, group: 'main' },
      { x: 0, y: 3.0, z: 9.5, color: 0xa83226, intensity: 0.7, range: 8, group: 'warning' },
      { x: -6, y: 4.0, z: -5, color: 0x88a0c0, intensity: 0.5, range: 7, group: 'accent' },
      { x: 6, y: 4.0, z: -5, color: 0x88a0c0, intensity: 0.5, range: 7, group: 'accent' },
    ],
    tags: ['engine'],
  });
}

export function milestoneSpec(id: string, rng: Rng, _label: string): RoomSpec | null {
  switch (id) {
    case 'ms-lobby': return lobbySpec();
    case 'ms-index': return indexSpec(rng);
    case 'ms-custodian': return custodianSpec();
    case 'ms-under-entrance': return underEntranceSpec();
    case 'ms-lens-hall': return lensHallSpec();
    case 'ms-chase1': return chaseSpec('ms-chase1', false);
    case 'ms-chase2': return chaseSpec('ms-chase2', true);
    case 'ms-engine': return engineSpec();
    case 'ms-final-ante':
      return base('ms-final-ante', 5, 6, 3.4, {
        special: 'finalAnte', floorMaterial: 'stone',
        props: [
          { kind: 'sign', x: 0, z: 2.9, y: 2.0 },
          { kind: 'wallSconce', x: -2.2, z: 0, y: 2.0 },
          { kind: 'wallSconce', x: 2.2, z: 0, y: 2.0 },
          { kind: 'counter', x: -1.9, z: 0.8, scale: 1.4 },
        ],
        sockets: [{ kind: 'loot', x: -1.9, z: 1.8, meta: {} }],
        hiding: [{ kind: 'cabinet', x: 1.9, z: 1.8, yaw: -Math.PI / 2, propKind: 'cabinet' }],
      });
    case 'ms-index-ante':
      return base('ms-index-ante', 6, 7, 4.2, {
        special: 'indexAnte', floorMaterial: 'stone',
        props: [
          { kind: 'pillar', x: -2, z: -1, meta: { height: 4.2 } },
          { kind: 'pillar', x: 2, z: -1, meta: { height: 4.2 } },
          { kind: 'sign', x: 0, z: 3.4, y: 2.6 },
          { kind: 'wallSconce', x: -2.6, z: 0, y: 2.0 },
          { kind: 'wallSconce', x: 2.6, z: 0, y: 2.0 },
        ],
        hiding: [{ kind: 'cabinet', x: -2.4, z: 2.6, yaw: Math.PI / 2, propKind: 'cabinet' }],
      });
    case 'ms-baggage':
      return base('ms-baggage', 10, 14, 3.6, {
        special: 'baggage', floorMaterial: 'carpet',
        props: [
          { kind: 'sign', x: 0, z: 4.2, y: 2.6 },
          { kind: 'wallSconce', x: -4.2, z: 0, y: 2.0 },
          { kind: 'wallSconce', x: 4.2, z: 0, y: 2.0 },
          { kind: 'trolley', x: -3.2, z: -2.5 },
          { kind: 'trolley', x: 3.2, z: 1.0 },
          { kind: 'trolley', x: -3.2, z: 4.0 },
          { kind: 'suitcase', x: -1.8, z: -1.5, yaw: 0.4 },
          { kind: 'suitcase', x: -1.2, z: -1.2, yaw: -0.3 },
          { kind: 'suitcase', x: 0.8, z: -0.5, yaw: 1.1 },
          { kind: 'suitcase', x: 1.6, z: 0.2, yaw: -0.8 },
          { kind: 'suitcase', x: -0.4, z: 1.4, yaw: 2.2 },
          { kind: 'suitcase', x: 2.4, z: 2.2, yaw: 0.2 },
          { kind: 'suitcase', x: -2.2, z: 2.8, yaw: -1.4 },
          { kind: 'suitcase', x: 0.4, z: 3.4, yaw: 0.9 },
          { kind: 'carton', x: 3.6, z: -3.2, yaw: 0.1 },
          { kind: 'carton', x: 3.2, z: -2.6, y: 0.6, yaw: 0.5 },
          { kind: 'carton', x: -3.8, z: 0.2, yaw: -0.2 },
          { kind: 'paperScatter', x: 0.5, z: -2.8 },
          { kind: 'paperScatter', x: -1.0, z: 0.8 },
          { kind: 'ceilingLamp', x: 0, z: -2 },
          { kind: 'ceilingLamp', x: 0, z: 3 },
        ],
        sockets: [
          { kind: 'loot', x: -3.2, z: -2.0, meta: {} },
          { kind: 'loot', x: 3.2, z: 1.5, meta: {} },
          { kind: 'loot', x: -3.2, z: 4.5, meta: {} },
          { kind: 'drawer', x: 0.8, z: -4.6, meta: {} },
          { kind: 'drawer', x: -1.2, z: 5.0, meta: {} },
        ],
        hiding: [
          { kind: 'cabinet', x: 4.2, z: -4.8, yaw: -Math.PI / 2, propKind: 'cabinet' },
          { kind: 'underFurniture', x: 0, z: 0.6, yaw: Math.PI / 2, propKind: 'trolley' },
        ],
      });
    case 'ms-wake':
      // The Wake — a chapel of rest in the post-chase lull. Benches face a
      // candle-lit bier; the lid was never quite closed. Authored dread:
      // no locks, no encounters — the room itself is the encounter.
      return base('ms-wake', 12, 11, 3.6, {
        special: 'wake', floorMaterial: 'carpet',
        props: [
          { kind: 'coffin', x: 0, z: 2.0 },
          { kind: 'screenPanels', x: 0, z: 4.8, yaw: 0 },
          { kind: 'statue', x: -2.8, z: 4.3, yaw: Math.PI },
          { kind: 'statue', x: 2.8, z: 4.3, yaw: Math.PI },
          { kind: 'bench', x: -1.4, z: 0.4, yaw: Math.PI },
          { kind: 'bench', x: 1.4, z: 0.4, yaw: Math.PI },
          { kind: 'bench', x: -1.4, z: 1.6, yaw: Math.PI },
          { kind: 'bench', x: 1.4, z: 1.6, yaw: Math.PI },
          { kind: 'bench', x: -1.4, z: 2.8, yaw: Math.PI },
          { kind: 'bench', x: 1.4, z: 2.8, yaw: Math.PI },
          { kind: 'candle', x: -1.1, z: 3.0 }, { kind: 'candle', x: 1.1, z: 3.0 },
          { kind: 'candle', x: -1.3, z: 4.1 }, { kind: 'candle', x: 1.3, z: 4.1 },
          { kind: 'candle', x: 0.4, z: 4.4 }, { kind: 'candle', x: -0.5, z: 4.4 },
          { kind: 'vase', x: -2.0, z: 4.5 }, { kind: 'vase', x: 2.0, z: 4.5 },
          { kind: 'clock', x: -4.6, z: -4.4, yaw: Math.PI / 2 },
          { kind: 'sign', x: 0, z: -5.0, y: 2.6 },
          { kind: 'paperScatter', x: 0.8, z: 0.2 },
          { kind: 'paperScatter', x: -1.6, z: 1.1 },
          { kind: 'wallSconce', x: -5.4, z: 1.0, y: 2.0 },
          { kind: 'wallSconce', x: 5.4, z: 1.0, y: 2.0 },
          { kind: 'wallSconce', x: -5.4, z: 3.6, y: 2.0 },
          { kind: 'wallSconce', x: 5.4, z: 3.6, y: 2.0 },
        ],
        sockets: [
          { kind: 'loot', x: -1.5, z: 3.7, meta: {} },
          { kind: 'loot', x: 1.5, z: 3.7, meta: {} },
          { kind: 'drawer', x: -4.8, z: -4.4, meta: {} },
        ],
        hiding: [
          { kind: 'cabinet', x: 4.8, z: -4.2, yaw: -Math.PI / 2, propKind: 'cabinet' },
          { kind: 'underFurniture', x: 0, z: 1.6, yaw: Math.PI / 2, propKind: 'bench' },
        ],
        lights: [
          { x: 0, y: 3.0, z: 0, color: 0xd8d0c0, intensity: 0.45, range: 10, group: 'dim' },
          { x: 0, y: 2.4, z: 3.6, color: 0xffc878, intensity: 0.8, range: 5, group: 'accent' },
          { x: 0, y: 2.2, z: -4, color: 0xffd9a0, intensity: 0.35, range: 4, group: 'accent' },
        ],
      });
    case 'ms-decompress':
      return base('ms-decompress', 3.4, 8, 3.0, {
        special: 'decompress', floorMaterial: 'stone',
        props: [
          { kind: 'wallSconce', x: -1.5, z: -2, y: 2.0 },
          { kind: 'wallSconce', x: 1.5, z: 2, y: 2.0 },
        ],
      });
    default: return null;
  }
}
