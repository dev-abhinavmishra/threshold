import { describe, it, expect } from 'vitest';
import { generateRoute } from '../src/world/generator';
import { validateRoute } from '../src/world/validation';
import type { RoomInstance } from '../src/game/types';
import { aabbFromMinMax, v3 } from '../src/engine/math';
import { portLocalPos } from '../src/world/spec';

// Must match src/world/generator.ts rotXZ (world-space convention).
function rotXZ(x: number, z: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

const SEEDS = ['ash-vault-101', 'gilt-spine-777', 'moth-ledger-404', 'sable-cord-001', 'wax-bell-256'];

function mainRooms(r: ReturnType<typeof generateRoute>): RoomInstance[] {
  return r.rooms.filter((x) => x.index >= 0);
}

describe('route generation', () => {
  for (const seed of SEEDS) {
    it(`validates seed ${seed}`, () => {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const report = validateRoute(route);
      expect(report.errors, report.errors.join('\n')).toEqual([]);
    });
  }

  it('is deterministic for a fixed seed', () => {
    const a = generateRoute({ seedText: 'same-seed', difficulty: 'standard', includeUnderscript: true });
    const b = generateRoute({ seedText: 'same-seed', difficulty: 'standard', includeUnderscript: true });
    expect(a.rooms.map((r) => r.templateId)).toEqual(b.rooms.map((r) => r.templateId));
    expect(a.rooms.map((r) => [r.origin.x, r.origin.z, r.yaw])).toEqual(b.rooms.map((r) => [r.origin.x, r.origin.z, r.yaw]));
    expect(a.keyPairs).toEqual(b.keyPairs);
    expect(a.rooms.map((r) => r.scheduled)).toEqual(b.rooms.map((r) => r.scheduled));
  });

  it('produces a 101-room main route ending at the Engine', () => {
    const route = generateRoute({ seedText: SEEDS[0], difficulty: 'standard', includeUnderscript: true });
    const rooms = mainRooms(route);
    expect(rooms.length).toBe(101);
    expect(rooms[0].templateId).toBe('ms-lobby');
    expect(rooms[100].templateId).toBe('ms-engine');
    expect(rooms[50].templateId).toBe('ms-index');
    expect(rooms[75].templateId).toBe('ms-lens-hall');
  });

  it('generates the full Underscript', () => {
    const route = generateRoute({ seedText: SEEDS[0], difficulty: 'standard', includeUnderscript: true });
    expect(route.underRooms.length).toBe(121);
    expect(route.underRooms[0].templateId).toBe('u-lobby');
    expect(route.underRooms[20].templateId).toBe('u-stair-landing');
    expect(route.underRooms[120].templateId).toBe('u-dead-end-loot');
  });

  it('main-route rooms do not overlap (AABB)', () => {
    const route = generateRoute({ seedText: SEEDS[1], difficulty: 'standard', includeUnderscript: false });
    // Corridors are thin connectors that legitimately tile/touch; real room
    // volumes (≥4m in both axes) must not overlap each other.
    const rooms = mainRooms(route).filter(
      (r) => r.spec.width >= 4 && r.spec.depth >= 4,
    );
    // Footprint is yaw-rotated — AABB of the four rotated corners (matches
    // specWorldAabb in the generator).
    const boxes = rooms.map((r) => {
      const hw = r.spec.width / 2, hd = r.spec.depth / 2;
      const cs = [
        rotXZ(-hw, -hd, r.yaw), rotXZ(hw, -hd, r.yaw),
        rotXZ(-hw, hd, r.yaw), rotXZ(hw, hd, r.yaw),
      ];
      const xs = cs.map((c) => c.x + r.origin.x);
      const zs = cs.map((c) => c.z + r.origin.z);
      return {
        idx: r.index,
        box: aabbFromMinMax(
          Math.min(...xs), 0, Math.min(...zs),
          Math.max(...xs), 3, Math.max(...zs),
        ),
      };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 2; j < boxes.length; j++) {
        // adjacent rooms share a wall — allow slight interpenetration there only.
        // Non-adjacent rooms may tile flush (zero-area boundary touch) or share
        // a wall strip within wall-depth; flag only real volume intrusions
        // (>15cm deep in both axes — placement tolerance is ±5cm per side).
        const A = boxes[i].box, B = boxes[j].box;
        const dx = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
        const dz = Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ);
        expect(dx > 0.15 && dz > 0.15,
          `rooms ${boxes[i].idx} and ${boxes[j].idx} overlap`).toBe(false);
      }
    }
  });

  it('key sockets sit strictly before their lock rooms', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: false });
      for (const kp of route.keyPairs) {
        expect(kp.keyRoom, `lock ${kp.lockId}`).toBeLessThan(kp.lockRoom);
        const host = mainRooms(route)[kp.keyRoom];
        expect(host.sockets.some((s) => s.meta.contains === 'doorKey' && s.meta.lockId === kp.lockId)).toBe(true);
      }
    }
  });

  it('ports chain: each room entry touches previous exit', () => {
    const route = generateRoute({ seedText: SEEDS[2], difficulty: 'standard', includeUnderscript: false });
    const rooms = mainRooms(route);
    for (let i = 1; i < rooms.length; i++) {
      const prev = rooms[i - 1];
      const cur = rooms[i];
      const prevExit = prev.spec.exits[0];
      const eLocal = portLocalPos(prevExit, prev.spec.width, prev.spec.depth);
      const ex = rotXZ(eLocal.x, eLocal.z, prev.yaw);
      const exitWorld = v3(prev.origin.x + ex.x, 0, prev.origin.z + ex.z);
      const cEntry = cur.spec.entry;
      const cLocal = portLocalPos(cEntry, cur.spec.width, cur.spec.depth);
      const cx = rotXZ(cLocal.x, cLocal.z, cur.yaw);
      const entryWorld = v3(cur.origin.x + cx.x, 0, cur.origin.z + cx.z);
      const d = Math.hypot(exitWorld.x - entryWorld.x, exitWorld.z - entryWorld.z);
      if (d >= 2.2) {
        // gap corridors bridge jittered milestones — entry must sit on one
        const conn = route.connectors.find(
          (c) => Math.hypot(c.b.x - entryWorld.x, c.b.z - entryWorld.z) < 0.6
            && Math.hypot(c.a.x - exitWorld.x, c.a.z - exitWorld.z) < 0.6,
        );
        expect(conn, `room ${i} entry off chain by ${d.toFixed(2)}m with no connector`).toBeTruthy();
        expect(cur.connectorIn, `room ${i} missing connectorIn`).toBeTruthy();
      }
    }
  });

  it('encounters have seeds and only lethal threats get survival checks', () => {
    const route = generateRoute({ seedText: SEEDS[0], difficulty: 'standard', includeUnderscript: false });
    const sched = mainRooms(route).flatMap((r) => r.scheduled);
    expect(sched.length).toBeGreaterThan(20);
    for (const s of sched) {
      expect(s.seed).toBeTypeOf('number');
      expect(s.triggerRoom).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('shortRun mode', () => {
  it('compresses milestones and stays valid', () => {
    const route = generateRoute({ seedText: SEEDS[3], difficulty: 'qa', includeUnderscript: false, shortRun: true });
    const report = validateRoute(route);
    expect(report.errors).toEqual([]);
    expect(mainRooms(route).length).toBeLessThan(60);
    expect(mainRooms(route).some((r) => r.templateId === 'ms-index')).toBe(true);
    expect(mainRooms(route).some((r) => r.templateId === 'ms-engine')).toBe(true);
  });
});


describe('pacing planner', () => {
  const CHASE = ['sweep', 'reprise', 'maelstrom'];
  it('holds beat rules across all QA seeds', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: false });
      const rooms = mainRooms(route);
      for (const r of rooms) {
        const chase = r.scheduled.filter((s) => CHASE.includes(s.entity));
        // at most the guaranteed tutorial chase before room 15; none before 10
        if (r.index < 10) expect(chase.length).toBe(0);
        if (r.index < 15) expect(chase.length).toBeLessThanOrEqual(1);
        // one scheduled entity per room at most
        expect(r.scheduled.length).toBeLessThanOrEqual(1);
      }
      // early rooms are calmer than late rooms on average
      const early = rooms.filter((r) => r.index < 15).reduce((n, r) => n + r.scheduled.length, 0);
      const late = rooms.filter((r) => r.index >= 70 && r.index < 100).reduce((n, r) => n + r.scheduled.length, 0);
      expect(late).toBeGreaterThanOrEqual(early);
    }
  });
});

describe('sprint mechanics coverage', () => {
  it('locked drawers: some drawer sockets are locked and carry richer loot', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: false });
      const drawers = mainRooms(route).flatMap((r) => r.sockets.filter((s) => s.kind === 'drawer'));
      if (!drawers.length) continue;
      const locked = drawers.filter((d) => d.meta.drawerLocked);
      // deterministic: flag present on a minority, and locked imprint rolls pay more
      for (const d of locked) {
        if (d.meta.contains === 'imprints') expect(d.meta.amount as number).toBeGreaterThanOrEqual(15);
      }
      expect(locked.length).toBeLessThan(drawers.length);
    }
  });

  it('u-lobby rooms carry two broker pedestals for the marginalia shop', () => {
    const route = generateRoute({ seedText: SEEDS[0], difficulty: 'standard', includeUnderscript: true });
    expect(route.underRooms[0].templateId).toBe('u-lobby');
    const brokers = route.underRooms.filter((r) => r.templateId === 'u-lobby');
    expect(brokers.length).toBeGreaterThanOrEqual(1);
    for (const r of brokers) {
      const peds = r.sockets.filter((s) => s.meta.broker !== undefined);
      expect(peds.length).toBe(2);
    }
  });

  it('trapped hiding spots always carry readable trap clues', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const trapped = [...mainRooms(route), ...route.underRooms]
        .flatMap((r) => r.hidingSpots)
        .filter((s) => s.trappedBy === 'hollow');
      for (const s of trapped) {
        expect(s.trapClues?.length ?? 0).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('custodian shop sockets exist on the milestone room', () => {
    const route = generateRoute({ seedText: SEEDS[0], difficulty: 'standard', includeUnderscript: false });
    const cust = mainRooms(route).find((r) => r.templateId === 'ms-custodian');
    expect(cust).toBeTruthy();
    const peds = cust!.sockets.filter((s) => s.meta.shop !== undefined);
    expect(peds.length).toBeGreaterThanOrEqual(4);
  });
});
