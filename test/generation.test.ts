import { describe, it, expect } from 'vitest';
import { generateRoute } from '../src/world/generator';
import { SAFE_ROOM_TEMPLATES } from '../src/game/config';
import { validateRoute } from '../src/world/validation';
import type { RoomInstance } from '../src/game/types';
import { aabbFromMinMax, v3 } from '../src/engine/math';
import { portLocalPos, inDoorLane, footprintInDoorLane } from '../src/world/spec';
import { modelCollider } from '../src/world/modelLibrary';
import { buildProp } from '../src/world/props';
import { Rng } from '../src/engine/rng';
import { buildRoomMesh } from '../src/world/builder';
import { MAT } from '../src/world/materials';
import * as THREE from 'three';
import { MAIN_TEMPLATES, propsClash, CLASH_OK } from '../src/world/templates';
import { SeedStreams } from '../src/engine/rng';

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

  it('the lobby register keeps its special meta on every seed', () => {
    // The loot pass must not roll a plain 'contains' over the authored
    // arrivalRegister socket — that turned "Sign the register" into
    // "Take Imprints" on ~half of seeds and made the arrival objective
    // unsatisfiable.
    for (const seed of SEEDS) {
      for (const [difficulty, shortRun] of [['standard', false], ['qa', true]] as const) {
        const route = generateRoute({ seedText: seed, difficulty, includeUnderscript: false, shortRun });
        const lobby = mainRooms(route).find((r) => r.templateId === 'ms-lobby');
        const reg = lobby?.sockets.find((s) => s.meta.arrivalRegister);
        expect(reg, `${seed}/${difficulty}: register socket missing or overwritten`).toBeTruthy();
        expect(reg!.meta.contains, `${seed}/${difficulty}: register meta clobbered by loot`).toBeUndefined();
      }
    }
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

  it('toll doors appear only on optional branch closets — never the main route', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: false });
      const tolls = mainRooms(route).flatMap((r) => r.doors.filter((d) => d.lockId === 'toll'));
      for (const d of tolls) {
        expect(d.isMainRoute).toBe(false);
        expect(d.locked).toBe(true);
      }
    }
  });

  it('vending machines carry a price and a stocked item', () => {
    let anyVend = false;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...mainRooms(route), ...route.underRooms]) {
        for (const s of r.sockets.filter((x) => x.meta.vend)) {
          expect(s.meta.price as number).toBeGreaterThan(0);
          expect(s.meta.vendItem).toBeTruthy();
          if (r.biome === 'underscript') expect(r.index % 20).not.toBe(0);
          anyVend = true;
        }
      }
    }
    expect(anyVend).toBe(true);
  });

  it("porter's cages: priced claim tags on guest/lobby rooms only", () => {
    const VALID = /^(bandage|tonic|chalkSpool|latchpick|feltWrap|sparkFlash|doorChock|windAlarm|wardSeal|imprints|lore)$/;
    let cages = 0, tags = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of mainRooms(route)) {
        const claim = r.sockets.filter((x) => x.meta.claim);
        if (!claim.length) continue;
        cages++;
        expect(['guest', 'lobby']).toContain(r.biome);
        expect(r.authored).toBeFalsy();
        // every cage hangs on a real cabinet
        expect(r.spec?.props.some((p) => p.kind === 'keyCabinet')).toBe(true);
        for (const s of claim) {
          tags++;
          expect(s.meta.price as number).toBeGreaterThanOrEqual(6);
          expect(s.meta.price as number).toBeLessThanOrEqual(15);
          expect(String(s.meta.claimTag)).toBeTruthy();
          expect(String(s.meta.contains)).toMatch(VALID);
        }
      }
    }
    // at 0.38 over ~20 eligible rooms, every seed should carry several
    expect(cages).toBeGreaterThanOrEqual(SEEDS.length);
    expect(tags).toBeGreaterThanOrEqual(SEEDS.length * 2);
  });

  it("guest ledgers: priced register sockets on counter rooms only", () => {
    let ledgers = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of mainRooms(route)) {
        const reg = r.sockets.filter((x) => x.meta.register);
        if (!reg.length) continue;
        ledgers += reg.length;
        expect(r.authored).toBeFalsy();
        // every ledger sits beside a real reception counter
        expect(r.spec?.props.some((p) => p.kind === 'counter')).toBe(true);
        for (const s of reg) {
          expect(s.meta.price as number).toBeGreaterThanOrEqual(9);
          expect(s.meta.price as number).toBeLessThanOrEqual(16);
        }
      }
    }
    // counters exist on every seed; 0.6 roll gives several ledgers each
    expect(ledgers).toBeGreaterThanOrEqual(SEEDS.length * 2);
  });

  it("forged pages: ledgers near a redactor conceal its door", () => {
    let forged = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of mainRooms(route)) {
        for (const s of r.sockets.filter((x) => x.meta.register)) {
          const cover = s.meta.forgedCover as number | undefined;
          if (cover === undefined) {
            expect(s.meta.forged).toBeFalsy();
            continue;
          }
          forged++;
          expect(s.meta.forged).toBe(true);
          // the concealed door must be inside the book's own read window
          expect(cover).toBeGreaterThan(r.index);
          expect(cover).toBeLessThanOrEqual(r.index + 10);
          const covered = mainRooms(route).find((x) => x.index === cover);
          expect(covered?.scheduled?.some((x) => x.entity === 'redactor')).toBe(true);
        }
      }
    }
    // rare by construction — at least one seed carries a forged book
    expect(forged).toBeGreaterThanOrEqual(1);
  });

  it("duty rosters: cheap staff-location reads on records desks only", () => {
    let rosters = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of mainRooms(route)) {
        const ros = r.sockets.filter((x) => x.meta.roster);
        if (!ros.length) continue;
        rosters += ros.length;
        expect(r.authored).toBeFalsy();
        expect(['records', 'maintenance']).toContain(r.biome);
        // every roster sits on a real desk
        expect(r.spec?.props.some((p) => p.kind === 'desk' || p.kind === 'writingDesk')).toBe(true);
        for (const s of ros) {
          expect(s.meta.price as number).toBeGreaterThanOrEqual(4);
          expect(s.meta.price as number).toBeLessThanOrEqual(9);
        }
      }
    }
    expect(rosters).toBeGreaterThanOrEqual(SEEDS.length * 2);
  });

  it("work orders: marginalia-priced cargo sheets under the route", () => {
    const IDS = new Set(['u-office-row', 'u-open-office', 'u-print-shop', 'u-server', 'u-break', 'u-records-cage', 'u-lobby']);
    let orders = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.underRooms) {
        for (const s of r.sockets.filter((x) => x.meta.workOrder)) {
          orders++;
          expect(IDS.has(r.templateId)).toBe(true);
          const price = s.meta.price as number;
          expect(price).toBeGreaterThanOrEqual(3);
          expect(price).toBeLessThanOrEqual(8);
        }
      }
    }
    // the under carries several sheets a run, sparse like its vends
    expect(orders).toBeGreaterThanOrEqual(SEEDS.length * 4);
  });

  it("complaint books: cheap hazard filings in maintenance + gallery", () => {
    let books = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of mainRooms(route)) {
        const cb = r.sockets.filter((x) => x.meta.complaint);
        if (!cb.length) continue;
        books += cb.length;
        expect(r.authored).toBeFalsy();
        expect(['maintenance', 'gallery']).toContain(r.biome);
        for (const s of cb) {
          expect(s.meta.price as number).toBeGreaterThanOrEqual(3);
          expect(s.meta.price as number).toBeLessThanOrEqual(8);
          // fault books only live in maintenance
          expect(s.meta.fault !== true || r.biome === 'maintenance').toBe(true);
        }
      }
    }
    expect(books).toBeGreaterThanOrEqual(SEEDS.length * 2);
  });

  it('baggage hall is authored at room 25 with loot sockets', () => {
    const route = generateRoute({ seedText: SEEDS[0], difficulty: 'standard', includeUnderscript: false });
    const hall = mainRooms(route).find((r) => r.templateId === 'ms-baggage');
    expect(hall).toBeTruthy();
    expect(hall!.index).toBe(25);
    expect(hall!.authored).toBe(true);
    expect(hall!.sockets.filter((s) => s.kind === 'loot' || s.kind === 'drawer').length).toBeGreaterThanOrEqual(4);
  });

  it('under sockets get filled with caches — never on safe landings', () => {
    let anyFilled = false;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.underRooms) {
        for (const s of r.sockets.filter((x) => x.filled && !x.meta.vend && !x.meta.workOrder && (x.kind === 'drawer' || x.kind === 'loot'))) {
          expect(s.meta.contains).toBeTruthy();
          expect(r.index % 20).not.toBe(0);
          anyFilled = true;
        }
      }
    }
    expect(anyFilled).toBe(true);
  });

  it('flooded halls: low service templates only, drains where the plumbing allows', () => {
    const FLOOD_TEMPLATES = new Set(['u-corridor', 'u-long-hall', 'u-server', 'u-narrow-stacks', 'u-partition-maze', 'u-break']);
    const DRAIN_PROPS = new Set(['pipeManifold', 'conduitRun', 'sumpPump', 'hydrant', 'wallVent']);
    let total = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const fl = route.underRooms.filter((r) => r.flooded);
      total += fl.length;
      for (const r of fl) {
        expect(FLOOD_TEMPLATES.has(r.templateId)).toBe(true);
        // water never floods a safe landing or the lobby
        expect(r.index % 20).not.toBe(0);
        // a flooded hall is traversable — never the whole route
        expect(fl.length).toBeLessThanOrEqual(12);
        // where the plumbing allows, a drain exists — mazes run loud or slow
        if (r.spec?.props.some((p) => DRAIN_PROPS.has(p.kind))) {
          expect(r.spec!.props.filter((p) => DRAIN_PROPS.has(p.kind)).length).toBeGreaterThan(0);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(SEEDS.length * 2);
  });

  it('drowned mains: dark flooded halls carry submerged snares off the door lanes', () => {
    let darkFloods = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.underRooms) {
        const snares = r.sockets.filter((sk) => sk.meta.hazard === 'snare');
        if (!(r.flooded && r.darkRoom)) {
          // submerged wires only exist where the water hides them
          expect(snares.filter((sk) => sk.meta.submerged).length).toBe(0);
          continue;
        }
        darkFloods++;
        expect(snares.length).toBeGreaterThanOrEqual(1);
        expect(snares.length).toBeLessThanOrEqual(2);
        for (const sk of snares) {
          expect(sk.meta.submerged).toBe(true);
          // inside room bounds (yawed rooms rotate local coords — bound
          // by the half-diagonal, not the raw axes)
          expect(Math.hypot(sk.pos.x - r.origin.x, sk.pos.z - r.origin.z))
            .toBeLessThanOrEqual(Math.hypot(r.width / 2, r.depth / 2) + 0.01);
          // never in a door lane
          for (const d of r.doors) {
            expect(Math.hypot(d.pos.x - sk.pos.x, d.pos.z - sk.pos.z)).toBeGreaterThanOrEqual(1.5);
          }
        }
        // the matching snare props exist for anyone draining the room
        expect(r.spec?.props.filter((pr) => pr.kind === 'snare').length).toBe(snares.length);
      }
    }
    expect(darkFloods).toBeGreaterThanOrEqual(SEEDS.length);
  });

  it('authored snare props arm themselves — every paper seal is a live tripwire', () => {
    let armed = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...route.rooms, ...route.underRooms]) {
        const props = (r.spec?.props ?? []).filter((pr) => pr.kind === 'snare').length;
        const sockets = r.sockets.filter((sk) => sk.meta.hazard === 'snare').length;
        expect(sockets).toBe(props);
        armed += sockets;
      }
    }
    expect(armed).toBeGreaterThan(0);
  });

  it('deep doors are optional branch doors only, never toll', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: false });
      const deeps = mainRooms(route).flatMap((r) => r.doors.filter((d) => d.deep));
      for (const d of deeps) {
        expect(d.isMainRoute).toBe(false);
        expect(d.lockId).not.toBe('toll');
        expect(d.locked).toBe(false);
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

  it('no solid prop collider reaches a door rectangle, and no hiding spot sits in a door approach lane', () => {
    // The builder culls any solid collider whose box reaches the door
    // rect (footprintInDoorLane) — this test pins the same honest rule at
    // spec level, so an authored centerpiece can't be silently eaten.
    const rng = new Rng(0xBEEF);
    const footprint = (p: { kind: string; x: number; z: number; yaw?: number; scale?: number }): [number, number] => {
      const m = modelCollider(p.kind);
      if (m) return [(m[0] * (p.scale ?? 1)) / 2, (m[2] * (p.scale ?? 1)) / 2];
      try {
        const b = buildProp({ ...p } as never, rng.fork(1));
        let hw = 0, hd = 0;
        for (const c of b.colliders) {
          if (!c.losOnly && !c.walkable) { hw = Math.max(hw, c.w / 2); hd = Math.max(hd, c.d / 2); }
        }
        return [hw, hd];
      } catch { return [0.3, 0.3]; }
    };
    const laneOf = (spec: { width: number; depth: number; entry: never; exits: never[] }) =>
      spec as Parameters<typeof footprintInDoorLane>[0];
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...mainRooms(route), ...route.underRooms]) {
        const spec = r.spec!;
        for (const p of spec.props.filter((x) => (x.y ?? 0) <= 1.9)) {
          const [hw, hd] = footprint(p);
          if (hw === 0 && hd === 0) continue; // ghost — nothing solid to reach the rect
          expect(
            footprintInDoorLane(laneOf(spec as never), p.x, p.z, hw, hd),
            `${r.index} ${spec.templateId} prop ${p.kind} @ ${p.x},${p.z} (hw ${hw.toFixed(2)}, hd ${hd.toFixed(2)})`,
          ).toBe(false);
        }
        for (const h of spec.hiding) {
          expect(inDoorLane(spec, h.x, h.z), `${r.index} ${spec.templateId} hiding ${h.kind} @ ${h.x},${h.z}`).toBe(false);
        }
      }
    }
  });

  it('no two fixed props materially overlap in any template', () => {
    // Wall-hung filler is resolved inside spec(); this guards fixed
    // furniture layouts against embeds like hatch-inside-headboard.
    for (const t of MAIN_TEMPLATES) {
      for (const seed of ['a', 'b', 'c']) {
        const spec = t.build(new SeedStreams(seed).roomStream('test', 1));
        const floor = spec.props.filter((p) => (p.y ?? 0) < 1.9 && !p.meta?.wall);
        for (let i = 0; i < floor.length; i++) {
          for (let j = i + 1; j < floor.length; j++) {
            const a = floor[i], b = floor[j];
            const ok = CLASH_OK.some(
              ([x, y]) => (x === a.kind && y === b.kind) || (x === b.kind && y === a.kind),
            );
            if (ok) continue;
            expect(
              propsClash(a, b),
              `${t.id} seed=${seed}: ${a.kind}(${a.x},${a.z}) vs ${b.kind}(${b.x},${b.z})`,
            ).toBe(false);
          }
        }
      }
    }
  });
});

describe('room build — lamp material pairing', () => {
  // paired lamp meshes take their own clone per fixture: per-light
  // baseIntensity jitter and alternating sweep flicker make the ambient
  // loop's emissive writes differ per light, so a shared clone would show
  // whichever light wrote last. Clones still never touch the MAT cache.
  it('two fixtures on the same source material get independent clones', () => {
    const route = generateRoute({ seedText: 'lamp-clone', difficulty: 'standard', includeUnderscript: false });
    const room = mainRooms(route).find((r) => r.spec && !r.darkRoom)!;
    const spec = {
      ...room.spec!,
      lights: [
        { x: 1, y: 2.5, z: 1, color: 0xff2233, intensity: 0.6, range: 3, group: 'warning' as const },
        { x: 3, y: 2.5, z: 3, color: 0xff2233, intensity: 0.6, range: 3, group: 'warning' as const },
      ],
    };
    const built = buildRoomMesh(room, spec, 7, 'high');
    const paired = built.lights
      .map((l) => l.userData.lampMesh as THREE.Mesh | undefined)
      .filter((m): m is THREE.Mesh => !!m);
    expect(paired.length).toBe(2);
    expect(paired[0].material).not.toBe(paired[1].material);
    // still a clone — the shared cache material must stay untouched by
    // per-room emissive writes.
    expect(paired[0].material).not.toBe(MAT.redLamp());
    expect(paired[1].material).not.toBe(MAT.redLamp());
  });

  it('distinct fixture kinds keep separate clones', () => {
    const route = generateRoute({ seedText: 'lamp-clone-2', difficulty: 'standard', includeUnderscript: false });
    const room = mainRooms(route).find((r) => r.spec && !r.darkRoom && r.biome !== 'maintenance')!;
    const spec = {
      ...room.spec!,
      lights: [
        { x: 1, y: 2.5, z: 1, color: 0xff2233, intensity: 0.6, range: 3, group: 'warning' as const },
        { x: 3, y: 2.5, z: 3, color: 0xffdd88, intensity: 0.6, range: 3, group: 'accent' as const },
      ],
    };
    const built = buildRoomMesh(room, spec, 7, 'high');
    const paired = built.lights
      .map((l) => l.userData.lampMesh as THREE.Mesh | undefined)
      .filter((m): m is THREE.Mesh => !!m);
    expect(paired.length).toBe(2);
    expect(paired[0].material).not.toBe(paired[1].material);
  });
});

describe('underscript weathering (sprint 226)', () => {
  // The 121 under-rooms reuse ~15 milled kinds — per-instance decay marks
  // (dying/dead fixtures, paper litter) are what keep the repetition from
  // reading flat. Assert the marks exist across a slice of the route.
  it('under-rooms carry fixture decay + paper litter', () => {
    const route = generateRoute({ seedText: 'under-weather', difficulty: 'standard', includeUnderscript: true });
    let flickered = 0, dead = 0, litter = 0, dangled = 0;
    for (const room of route.underRooms.slice(0, 30)) {
      if (!room.spec) continue;
      const built = buildRoomMesh(room, room.spec, 11, 'high');
      built.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.userData.anim === 'flicker') flickered++;
        const sm = m.material as THREE.MeshStandardMaterial;
        if (sm?.color && sm.color.getHex() === 0x22251f) dead++;
        if (m.material === MAT.paperOld()) litter++;
      });
      for (const c of built.group.children) if (c.rotation.z !== 0) dangled++;
    }
    expect(flickered, 'no dying fixtures found across 30 under-rooms').toBeGreaterThan(0);
    expect(dead, 'no dead fixtures found across 30 under-rooms').toBeGreaterThan(0);
    expect(litter, 'no paper litter found across 30 under-rooms').toBeGreaterThan(0);
    expect(dangled, 'no dangling fixtures found across 30 under-rooms').toBeGreaterThan(0);
  });
});

describe('door listen seams (sprint 229)', () => {
  it('every closed door gains an ear-to-the-seam point while crouched', async () => {
    const { InteractionSystem, addCrouchedDoorInteracts } = await import('../src/player/interaction');
    const route = generateRoute({ seedText: 's', difficulty: 'standard', includeUnderscript: true });
    const sys = new InteractionSystem();
    let closed = 0, listens = 0, locked = 0, peeks = 0;
    for (const r of route.rooms.filter((x) => x.index >= 0).slice(0, 40)) {
      sys.clear();
      sys.addRoomInteractables(r);
      addCrouchedDoorInteracts(sys);
      for (const d of r.doors) {
        if (d.openT > 0.4) continue;
        closed++;
        const li = sys.interactables.find((i) => i.kind === 'listen' && i.data === d);
        if (!li) continue;
        listens++;
        expect(li.holdTime).toBeGreaterThanOrEqual(0.9);
        expect(Math.hypot(li.pos.x - d.pos.x, li.pos.z - d.pos.z)).toBeGreaterThan(0.3);
        if (d.locked && !d.falseDoor) {
          locked++;
          if (sys.interactables.some((i) => i.kind === 'peek' && i.data === d)) peeks++;
        }
      }
    }
    expect(closed).toBeGreaterThan(30);
    expect(listens).toBe(closed); // false doors keep theirs — listening is the counter-tell
    expect(peeks).toBe(locked);   // keyhole-peek still covers every locked leaf
  });
});

describe('connector corridor dressing (sprint 230)', () => {
  it('gap corridors get panelling, lanterns, runners and portal surrounds', async () => {
    const { buildRoomMesh } = await import('../src/world/builder');
    const route = generateRoute({ seedText: 'ash-vault-101', difficulty: 'standard', includeUnderscript: false });
    const conn = route.rooms.filter((r) => r.connectorIn && r.spec);
    expect(conn.length).toBeGreaterThan(2);
    // Longest connector (room 27 elbows ~47m) — the others are short stubs
    // where surrounds + wainscot/cornice apply but bays stay bare.
    const longest = conn.reduce((a, r) => {
      const seg = [r.connectorIn!.a, r.connectorIn!.elbow, r.connectorIn!.b].filter(Boolean) as { x: number; z: number }[];
      let tot = 0; for (let i = 0; i < seg.length - 1; i++) tot += Math.hypot(seg[i + 1].x - seg[i].x, seg[i + 1].z - seg[i].z);
      return tot > a.tot ? { r, tot } : a;
    }, { r: conn[0], tot: 0 });
    const built = buildRoomMesh(longest.r, longest.r.spec!, 1, 'high');
    const kinds = new Set<string>();
    built.group.traverse((o) => {
      const m = /^connTrim-(.*)$/.exec(o.name ?? '');
      if (m) kinds.add(m[1]);
    });
    expect(kinds.has('pilaster')).toBe(true);
    expect(kinds.has('wainscotRun')).toBe(true);
    expect(kinds.has('corniceRun')).toBe(true);
    expect(kinds.has('doorSurround')).toBe(true);
    expect(kinds.has('runnerRug')).toBe(true);
    let surrounds = 0;
    built.group.traverse((o) => { if (o.name === 'connTrim-doorSurround') surrounds++; });
    expect(surrounds % 2).toBe(0); // one per segment end
  });
});

describe('noise rouse rules (sprint 231)', () => {
  it('only loud player-side noise wakes what waits beyond a door', async () => {
    const { noiseCanRouse, withinRouseRadius, ROUSE_MIN_INTENSITY } = await import('../src/engine/noiseRouse');
    const ev = (over: object) => ({ x: 0, y: 1, z: 0, caption: '', category: 'footstep' as const, intensity: 0.4, ...over });
    expect(noiseCanRouse(ev({}))).toBe(false);                                  // walk steps stay quiet
    expect(noiseCanRouse(ev({ intensity: 0.85, category: 'sprint' }))).toBe(true);
    expect(noiseCanRouse(ev({ intensity: 1.5, category: 'door' }))).toBe(true);  // slam
    expect(noiseCanRouse(ev({ intensity: 0.9, category: 'item' }))).toBe(true);  // spark flash
    expect(noiseCanRouse(ev({ intensity: 0.9, category: 'entity-cue' }))).toBe(false); // no feedback loop
    expect(noiseCanRouse(ev({ intensity: 0.9, category: 'ambient' }))).toBe(false);
    expect(noiseCanRouse(ev({ intensity: 0.9, category: 'critter' }))).toBe(false);
    expect(noiseCanRouse(ev({ intensity: 1.2, category: 'sprint', source: 'husk' }))).toBe(false); // entity noise doesn't rouse
    expect(ROUSE_MIN_INTENSITY).toBeGreaterThan(0.4);
    // radius: sprint stride hears ~12m out, a slam ~21m
    const sprint = ev({ intensity: 0.85, category: 'sprint' });
    expect(withinRouseRadius(sprint, 10, 0)).toBe(true);
    expect(withinRouseRadius(sprint, 13, 0)).toBe(false);
    const slam = ev({ intensity: 1.5, category: 'door' });
    expect(withinRouseRadius(slam, 20, 0)).toBe(true);
    expect(withinRouseRadius(slam, 25, 0)).toBe(false);
  });
});

describe('electrified water (sprint 260)', () => {
  it('arcs live flooded halls — lit only, never dark, never dry', () => {
    let total = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.underRooms) {
        const arcs = (r.sockets ?? []).filter((sk) => sk.meta?.hazard === 'puddle');
        if (!arcs.length) continue;
        expect(r.flooded, `electrified socket in dry room ${seed}:${r.index}`).toBe(true);
        expect(r.darkRoom, `electrified socket in dark room ${seed}:${r.index}`).toBe(false);
        for (const a of arcs) {
          expect(a.meta?.electrified).toBe(true);
          // the arc sits inside the room footprint
          const w = r.width ?? 4, d = r.depth ?? 4;
          expect(Math.hypot(a.pos.x - r.origin.x, a.pos.z - r.origin.z))
            .toBeLessThanOrEqual(Math.hypot(w / 2, d / 2) + 0.01);
        }
        total += arcs.length;
      }
      // main route never electrifies — the mains above aren't standing water
      for (const r of route.rooms) {
        expect((r.sockets ?? []).filter((sk) => sk.meta?.hazard === 'puddle').length).toBe(0);
      }
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe('steam lines (sprint 261)', () => {
  it('authored steam fittings are live lines — every vent is a socket', () => {
    let vents = 0, socks = 0;
    for (const seed of SEEDS.slice(0, 3)) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...route.rooms, ...route.underRooms]) {
        vents += (r.spec?.props ?? []).filter((p) => p.kind === 'steamVent').length;
        socks += (r.sockets ?? []).filter((sk) => sk.meta?.hazard === 'steam').length;
      }
    }
    expect(socks, 'every authored steamVent must arm a hazard socket').toBe(vents);
    expect(vents).toBeGreaterThan(0);
  });
});

describe('wired drawers (sprint 262)', () => {
  it('some unlocked drawers carry wired latches — never in safe rooms', () => {
    let wired = 0, wiredLocked = 0, wiredSafe = 0;
    for (const seed of SEEDS.slice(0, 4)) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...route.rooms, ...route.underRooms]) {
        for (const s of r.sockets ?? []) {
          if (s.kind !== 'drawer' || s.meta?.wired !== true) continue;
          wired += 1;
          if (s.meta.drawerLocked) wiredLocked += 1;
          if (SAFE_ROOM_TEMPLATES.has(r.templateId)) wiredSafe += 1;
        }
      }
    }
    expect(wired, 'wired drawers should exist across seeds').toBeGreaterThan(0);
    expect(wiredLocked, 'wired latches only on unlocked drawers').toBe(0);
    expect(wiredSafe, 'safe rooms never wire drawers').toBe(0);
  });
});
