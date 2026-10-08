import { describe, it, expect } from 'vitest';
import { generateRoute, MILESTONE_TELLS } from '../src/world/generator';
import { FORESHADOW_TELLS } from '../src/world/builder';
import { SAFE_ROOM_TEMPLATES, ENTITY_TUNING, DEATH_NAMES, DEATH_HINTS } from '../src/game/config';
import { TELLS } from '../src/world/foreshadow';
import { validateRoute } from '../src/world/validation';
import type { RoomInstance } from '../src/game/types';
import { aabbFromMinMax, v3 } from '../src/engine/math';
import { portLocalPos, inDoorLane, footprintInDoorLane, footprintInDoorLeaf } from '../src/world/spec';
import { modelCollider } from '../src/world/modelLibrary';
import { modelCollider, MODEL_FOR } from '../src/world/modelLibrary';
import { buildProp } from '../src/world/props';
import { Rng } from '../src/engine/rng';
import { buildRoomMesh } from '../src/world/builder';
import { MAT } from '../src/world/materials';
import * as THREE from 'three';
import { MAIN_TEMPLATES, propsClash, CLASH_OK } from '../src/world/templates';
import { DOCUMENTS } from '../src/game/documents';

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

  it('the night clerk: counter rooms carry two clerk pedestals, every seed answers one (sprint 318)', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const clerked = mainRooms(route).filter((r) => r.sockets.some((s) => s.meta.clerk !== undefined));
      expect(clerked.length, `${seed}: at least one staffed counter`).toBeGreaterThanOrEqual(1);
      for (const r of clerked) {
        expect(r.spec?.props.some((p) => p.kind === 'counter'), `${seed}/${r.index}: clerk only at a counter`).toBe(true);
        const peds = r.sockets.filter((s) => s.meta.clerk !== undefined);
        expect(peds.length, `${seed}/${r.index}: two wares on the counter`).toBe(2);
        // sprint 319 — slot0 also carries the clerk's one seeded page
        const page = r.sockets.find((s) => s.meta.clerk === 'slot0');
        expect(page, `${seed}/${r.index}: the clerk's page`).toBeTruthy();
        expect(['staff', 'hazard', 'claims'], `${seed}/${r.index}: a known question`)
          .toContain(page!.meta.clerkQ);
        const price = page!.meta.clerkQPrice as number;
        expect(price >= 4 && price <= 9, `${seed}/${r.index}: page priced 4-9`).toBe(true);
      }
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

  it('underscript never strands a 5-room stretch without cover (sprint 299)', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      let run = 0;
      for (const room of route.underRooms) {
        if (room.hidingSpots.length || room.safeZones.length) run = 0;
        else run++;
        expect(run, `${seed} U-${room.index}: ${run}-room stretch without hiding cover`).toBeLessThan(5);
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

  it("inspection sheets: watcher foresight on records/maintenance desks only", () => {
    let sheets = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of mainRooms(route)) {
        const ws = r.sockets.filter((x) => x.meta.watchSheet);
        if (!ws.length) continue;
        sheets += ws.length;
        expect(r.authored).toBeFalsy();
        expect(['records', 'maintenance']).toContain(r.biome);
        expect(r.spec?.props.some((p) => p.kind === 'desk' || p.kind === 'writingDesk')).toBe(true);
        // one paper per room — a sheet never shares a room with another book
        expect(r.sockets.some((x) => x.meta.roster || x.meta.complaint)).toBe(false);
        for (const s of ws) {
          expect(s.meta.price as number).toBeGreaterThanOrEqual(4);
          expect(s.meta.price as number).toBeLessThanOrEqual(9);
        }
      }
    }
    expect(sheets).toBeGreaterThanOrEqual(SEEDS.length);
  });

  it("confiscated cases: the prize lives only under a live eye", () => {
    const GOODS = new Set(['latchpick', 'chalkSpool', 'doorChock', 'feltWrap', 'handLamp', 'sparkFlash', 'warrant']);
    let cases = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const watchedLit = mainRooms(route).filter((r) =>
        !r.authored && !r.darkRoom &&
        r.spec?.props.some((p) => p.kind === 'securityCam' || p.kind === 'searchlight'));
      const caseRooms = mainRooms(route).filter((r) => r.sockets.some((s) => s.meta.confiscated));
      // a lit watched room always guards at least one case when one exists
      if (watchedLit.length) expect(caseRooms.length).toBeGreaterThanOrEqual(1);
      for (const r of caseRooms) {
        cases += 1;
        expect(r.authored).toBeFalsy();
        expect(r.darkRoom).toBeFalsy();
        expect(watchedLit).toContain(r);
        const s = r.sockets.find((x) => x.meta.confiscated)!;
        expect(s.filled).toBe(true);
        if (s.meta.contains === 'imprints') {
          expect(s.meta.amount as number).toBeGreaterThanOrEqual(8);
          expect(s.meta.amount as number).toBeLessThanOrEqual(16);
        } else if (s.meta.contains === 'warrant') {
          // the seizure ledger — paperwork, not goods
          expect(s.meta.amount).toBeUndefined();
        } else {
          expect(GOODS.has(s.meta.contains as string)).toBe(true);
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(SEEDS.length);
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
        for (const s of r.sockets.filter((x) => x.filled && !x.meta.vend && !x.meta.workOrder && !x.meta.crewBoard && !x.meta.claimRegister && !x.meta.counterClaim && !x.meta.returnSlip && !x.meta.misfile && (x.kind === 'drawer' || x.kind === 'loot'))) {
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
        for (const p of spec.props.filter((x) => (x.y ?? 0) <= 1.9 && !x.meta?.laneBlock)) {
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

  it('no laneBlock prop leaves a collider sealing a door leaf', () => {
    // laneBlock keeps the mesh, but the builder sheds colliders that park
    // in the door throat — assert that shedding always happens where it
    // must, i.e. no surviving collider covers a leaf's walk channel.
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...mainRooms(route), ...route.underRooms]) {
        const spec = r.spec!;
        const lanes = { width: spec.width, depth: spec.depth, entry: spec.entry, exits: spec.exits };
        for (const p of spec.props.filter((x) => (x.y ?? 0) <= 1.9)) {
          const m = MODEL_FOR[p.kind as keyof typeof MODEL_FOR];
          const cw = m?.collider?.[0] ?? 0, cd = m?.collider?.[2] ?? 0;
          if (!cw && !cd) continue; // no collider — can't seal
          const swap = Math.abs(Math.round((p.yaw ?? 0) / (Math.PI / 2))) % 2 === 1;
          const [hx, hz] = swap ? [cd / 2, cw / 2] : [cw / 2, cd / 2];
          if (!footprintInDoorLeaf(lanes, p.x, p.z, hx, hz)) continue;
          // Collider in the leaf throat is only tolerated as door dressing
          // (laneBlock) — the builder sheds it. Anything else is a seal.
          expect(
            p.meta?.laneBlock === true,
            `${r.index} ${spec.templateId} prop ${p.kind} @ ${p.x},${p.z} collider seals a door leaf`,
          ).toBe(true);
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

  it('wall dressing on one wall keeps breathing room (curated, not cluttered)', () => {
    // sprint 279: different-kind wall filler must sit >=0.6m apart on the
    // same wall post-resolution — tighter reads as a junk pile. Curtain
    // pieces (rod/panel/swag/long) cluster by design: same family, exempt.
    const FAM = new Set(['curtain', 'curtainRod', 'curtainLong', 'curtainSwag', 'drapePanel']);
    const fam = (k: string) => (FAM.has(k as never) ? 'curtain' : k);
    for (const t of MAIN_TEMPLATES) {
      for (const seed of ['a', 'b', 'c']) {
        const spec = t.build(new SeedStreams(seed).roomStream('test', 1));
        const hung = spec.props.filter((p) => p.meta?.wall);
        for (let i = 0; i < hung.length; i++) {
          for (let j = i + 1; j < hung.length; j++) {
            const a = hung[i], b = hung[j];
            if (a.meta?.side !== b.meta?.side || a.meta?.side === undefined) continue;
            if (fam(a.kind) === fam(b.kind)) continue;
            const gap = Math.hypot(a.x - b.x, a.z - b.z);
            expect(
              gap,
              `${t.id} seed=${seed}: ${a.kind}(${a.x.toFixed(1)},${a.z.toFixed(1)}) vs ${b.kind}(${b.x.toFixed(1)},${b.z.toFixed(1)}) same-wall gap ${gap.toFixed(2)}`,
            ).toBeGreaterThanOrEqual(0.6);
          }
        }
      }
    }
  });

  it('authored collider footprints stay clear of door lanes (builder drop rule)', () => {
    // builder.ts culls any prop whose solid collider footprint overlaps a
    // lane — a fixed prop violating that is silently never rendered.
    for (const t of MAIN_TEMPLATES) {
      for (const seed of ['a', 'b', 'c']) {
        const spec = t.build(new SeedStreams(seed).roomStream('test', 1));
        const lanes = { width: spec.width, depth: spec.depth, entry: spec.entry, exits: spec.exits };
        for (const p of spec.props) {
          if ((p.y ?? 0) > 1.9 || p.meta?.laneBlock) continue;
          const m = MODEL_FOR[p.kind as keyof typeof MODEL_FOR];
          const cw = m?.collider?.[0] ?? 0, cd = m?.collider?.[2] ?? 0;
          if (!cw && !cd) continue;
          const swap = Math.abs(Math.round((p.yaw ?? 0) / (Math.PI / 2))) % 2 === 1;
          const [hx, hz] = swap ? [cd / 2, cw / 2] : [cw / 2, cd / 2];
          expect(
            footprintInDoorLane(lanes, p.x, p.z, hx, hz),
            `${t.id} seed=${seed}: ${p.kind}(${p.x},${p.z}) footprint reaches a lane`,
          ).toBe(false);
        }
      }
    }
  });

  it('thin wall mounts survive clash resolution', () => {
    // Sprint-216 regression: resolveWallClashes bound-checked both axes at
    // 0.3m, which dropped every 0.12–0.15m wall mount. Count the mounts
    // that make it through across the whole template set.
    const THIN = new Set(['painting', 'wallSconce', 'mirror', 'wallClock', 'sign', 'curtain', 'pegRail', 'towelRail', 'curtainSwag', 'drapePanel', 'exitSign', 'wallVent', 'keyRack', 'extinguisher', 'fireAlarm', 'potRack', 'sculleryRack']);
    let kept = 0;
    for (const t of MAIN_TEMPLATES) {
      for (const seed of ['a', 'b', 'c']) {
        const spec = t.build(new SeedStreams(seed).roomStream('test', 1));
        kept += spec.props.filter((p) => p.meta?.wall && THIN.has(p.kind)).length;
      }
    }
    expect(kept, 'thin wall mounts across all templates x seeds').toBeGreaterThan(60);
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
    // >=2: the room pool keeps growing (porter-lodge s421) so seeded
    // counts drift — the spec asserts the dressing, the count is a guard
    expect(conn.length).toBeGreaterThanOrEqual(2);
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

describe('old sign (sprint 266)', () => {
  it('every route carries spent hazard sockets — history you can read', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const spent = [...route.rooms, ...route.underRooms].flatMap((r) =>
        (r.sockets ?? []).filter((sk) => sk.meta?.spent === true));
      expect(spent.length, `seed ${seed} carries old sign`).toBeGreaterThan(0);
      for (const sk of spent) expect(['snare', 'steam', 'fan']).toContain(sk.meta.hazard);
    }
  });
});

describe('the belt-wheel (sprint 267)', () => {
  it('mechanical rooms arm live fans', () => {
    const route = generateRoute({ seedText: 's', difficulty: 'standard', includeUnderscript: true });
    const fans = route.rooms.flatMap((r) => (r.sockets ?? []).filter((sk) => sk.meta?.hazard === 'fan'));
    // >=3: seeded pool draws drift as templates join the pool
    expect(fans.length, 'the wheels spin on the main route').toBeGreaterThanOrEqual(3);
  });
});

describe('coaxed drawers (sprint 268)', () => {
  it('already-worked latches: sprung, bare, and scarred', () => {
    let found = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...route.rooms, ...route.underRooms]) {
        for (const sk of r.sockets ?? []) {
          if (sk.meta?.coaxed === true) {
            found++;
            expect(sk.meta.wired, 'a coaxed latch is already sprung').not.toBe(true);
            expect(sk.meta.bare, 'a worked drawer is an empty one').toBe(true);
            expect(sk.meta.drawerLocked, 'the coax beats the lock').not.toBe(true);
          }
        }
      }
    }
    expect(found, 'somebody worked some latches before you').toBeGreaterThan(0);
  });
});

describe('the laundress (sprint 272)', () => {
  it('fouled basins only — flooded rooms with plumbing', () => {
    const PLUMBING = new Set(['pipeManifold', 'conduitRun', 'sumpPump', 'hydrant', 'wallVent']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.rooms) {
        expect(r.scheduled?.some((s) => s.entity === 'laundress') ?? false,
          `laundress on the main route ${seed}`).toBe(false);
      }
      for (const r of route.underRooms) {
        if (!r.scheduled?.some((s) => s.entity === 'laundress')) continue;
        expect(r.flooded, `laundress on a dry room ${seed} u-${r.index}`).toBe(true);
        expect((r.spec?.props ?? []).some((p) => PLUMBING.has(p.kind)),
          `laundress with no basin ${seed} u-${r.index}`).toBe(true);
      }
    }
  });
});

describe('the lost-property cage (sprint 274)', () => {
  it('marginalia claims hang on under cage/locker furniture only', () => {
    const HOSTS = new Set(['recordsCage', 'keyCabinet', 'locker', 'filing', 'cabinet']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.rooms) {
        expect(r.sockets.some((s) => s.meta?.claim && s.meta?.marginalia),
          `imprints-claim flagged marginalia on the main route ${seed}`).toBe(false);
      }
      const claims = route.underRooms.flatMap((r) =>
        r.sockets.filter((s) => s.meta?.claim && s.meta?.marginalia).map((s) => ({ r, s })));
      for (const { r, s } of claims) {
        expect((r.spec?.props ?? []).some((p) => HOSTS.has(p.kind)),
          `claim on a cage-less room ${seed} u-${r.index}`).toBe(true);
        const price = s.meta.price as number;
        expect(price >= 3 && price <= 9, `claim price ${price} in 3-9`).toBe(true);
      }
    }
  });
});

describe('the crew board (sprint 275)', () => {
  it('shift sheets pin to under storage furniture, marginalia-priced', () => {
    const HOSTS = new Set(['keyCabinet', 'cabinet', 'locker', 'stackShelf', 'cubicle']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.rooms) {
        expect(r.sockets?.some((s) => s.meta?.crewBoard) ?? false,
          `crew board on the main route ${seed}`).toBe(false);
      }
      const boards = route.underRooms.flatMap((r) =>
        (r.sockets ?? []).filter((s) => s.meta?.crewBoard).map((s) => ({ r, s })));
      for (const { r, s } of boards) {
        expect((r.spec?.props ?? []).some((p) => HOSTS.has(p.kind)),
          `board on a host-less room ${seed} u-${r.index}`).toBe(true);
        const price = s.meta.price as number;
        expect(price >= 3 && price <= 8, `board price ${price} in 3-8`).toBe(true);
      }
    }
  });
});

describe('the claim register (sprint 276)', () => {
  it('registers sit on under desk furniture, cheapest paper', () => {
    const HOSTS = new Set(['filing', 'cubicle', 'schoolDesk', 'keyCabinet', 'recordsCage']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.rooms) {
        expect(r.sockets?.some((s) => s.meta?.claimRegister) ?? false,
          `claim register on the main route ${seed}`).toBe(false);
      }
      const regs = route.underRooms.flatMap((r) =>
        (r.sockets ?? []).filter((s) => s.meta?.claimRegister).map((s) => ({ r, s })));
      for (const { r, s } of regs) {
        expect((r.spec?.props ?? []).some((p) => HOSTS.has(p.kind)),
          `register on a host-less room ${seed} u-${r.index}`).toBe(true);
        const price = s.meta.price as number;
        expect(price >= 2 && price <= 6, `register price ${price} in 2-6`).toBe(true);
      }
    }
  });
});

describe('the Auditor (sprint 277)', () => {
  it('clerks work dry desk rooms below, never the main route', () => {
    const DESKS = new Set(['filing', 'cubicle', 'schoolDesk', 'recordsCage', 'keyCabinet']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.rooms) {
        expect(r.scheduled?.some((s) => s.entity === 'auditor') ?? false,
          `auditor on the main route ${seed}`).toBe(false);
      }
      const clerks = route.underRooms.filter((r) => r.scheduled?.some((s) => s.entity === 'auditor'));
      for (const r of clerks) {
        expect(r.flooded, `auditor in a flooded room ${seed} u-${r.index}`).not.toBe(true);
        expect((r.spec?.props ?? []).some((p) => DESKS.has(p.kind)),
          `auditor on a desk-less room ${seed} u-${r.index}`).toBe(true);
        expect(r.index % 20, `auditor on a safe landing ${seed}`).not.toBe(0);
      }
    }
  });
});

describe('the House Detective (sprint 278)', () => {
  it('works desk rooms on the main route, never below', () => {
    const DESKS = new Set(['counter', 'desk', 'writingDesk', 'filing']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.underRooms) {
        expect(r.scheduled?.some((s) => s.entity === 'detective') ?? false,
          `detective under the route ${seed}`).toBe(false);
      }
      const suits = route.rooms.filter((r) => r.scheduled?.some((s) => s.entity === 'detective'));
      for (const r of suits) {
        expect((r.spec?.props ?? []).some((p) => DESKS.has(p.kind)),
          `detective on a desk-less room ${seed} r-${r.index}`).toBe(true);
        expect(r.index, `detective too early ${seed}`).toBeGreaterThanOrEqual(18);
      }
    }
  });
});

describe('the marked approach (sprint 288)', () => {
  it('every schedulable entity marks its approach rooms', () => {
    // pursuer/hazard/orrery are milestone- or environment-triggered — no
    // approach rooms to mark. Anything else the scheduler can place needs
    // a prop tell set, or its rooms arrive unsigned.
    const EXEMPT = new Set(['pursuer', 'hazard', 'orrery']);
    for (const id of Object.keys(ENTITY_TUNING)) {
      if (EXEMPT.has(id)) continue;
      expect(TELLS[id], `no foreshadow prop tells for ${id}`).toBeTruthy();
    }
  });

  it('under approach rooms carry foreshadow marks too', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const marked = route.underRooms.filter((r) => (r.spec?.props ?? []).some((p) => p.meta?.foreshadow));
      expect(marked.length, `no under foreshadow props on ${seed}`).toBeGreaterThanOrEqual(5);
      const decalMarked = route.underRooms.filter((r) => r.foreshadow);
      expect(decalMarked.length, `no under foreshadow decals on ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('main approach rooms still carry foreshadow marks', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const marked = mainRooms(route).filter((r) => (r.spec?.props ?? []).some((p) => p.meta?.foreshadow));
      expect(marked.length, `no main foreshadow props on ${seed}`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('the cause reads (sprint 289)', () => {
  // Every schedulable entity — plus the environmental sources — needs a
  // fiction name and a curated advice line, or the death screen falls back
  // to a raw id for some killers and a proper name for others.
  const SOURCES = [...Object.keys(ENTITY_TUNING), 'hazard'];

  it('every kill source has a fiction name', () => {
    for (const id of SOURCES) {
      expect(DEATH_NAMES[id], `no death name for ${id}`).toBeTruthy();
    }
  });

  it('every kill source has a curated advice line', () => {
    for (const id of SOURCES) {
      expect(DEATH_HINTS[id], `no death hint for ${id}`).toBeTruthy();
    }
  });

  it('every kill source unlocks an archive document (sprint 296)', () => {
    // The death screen promises "a new document may be unlocked" — a
    // source with no doc-id makes the promise empty for its victim.
    const docIds = new Set(DOCUMENTS.map((d) => d.id));
    for (const id of SOURCES) {
      expect(docIds.has(`doc-${id}`), `no archive document for ${id}`).toBe(true);
    }
  });
});

describe('injected cover sanity (sprint 302)', () => {
  // Review bugs: corner lockers could eject the player through the wall,
  // and flat floor props (manholes) counted as covering furniture so the
  // locker mesh never spawned.
  const toLocal = (r: { origin: { x: number; z: number }; yaw: number }, wx: number, wz: number) => {
    const dx = wx - r.origin.x, dz = wz - r.origin.z;
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  };

  it('every hiding spot exits inside its own room', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...route.rooms, ...route.underRooms]) {
        if (!r.spec) continue;
        for (const spot of r.hidingSpots ?? []) {
          const { lx, lz } = toLocal(r, spot.exitPos.x, spot.exitPos.z);
          const tag = `seed ${seed} room ${r.index} spot ${spot.id}`;
          expect(Math.abs(lx), `${tag} exits through a side wall`).toBeLessThanOrEqual(r.spec.width / 2 + 0.02);
          expect(Math.abs(lz), `${tag} exits through an end wall`).toBeLessThanOrEqual(r.spec.depth / 2 + 0.02);
        }
      }
    }
  });

  it('injected cabinets sit on a real prop body, not floor dressing', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of [...route.rooms, ...route.underRooms]) {
        if (!r.spec) continue;
        for (const spot of r.hidingSpots ?? []) {
          if (!spot.id.endsWith('-inj')) continue;
          const cx = (spot.volume.minX + spot.volume.maxX) / 2;
          const cz = (spot.volume.minZ + spot.volume.maxZ) / 2;
          const { lx, lz } = toLocal(r, cx, cz);
          const body = r.spec.props.find((p) =>
            Math.hypot(p.x - lx, p.z - lz) <= 1.3 && (modelCollider(p.kind)?.[1] ?? 0) >= 0.5);
          expect(body, `seed ${seed} room ${r.index}: injected cabinet has no visible prop`).toBeTruthy();
        }
      }
    }
  });
});

describe('the sealed warrant (sprint 290)', () => {
  // A warrant is only paperwork worth prying if the ledger has a later
  // entry to report — the last case on the route can never hold one.
  it('every warrant case has a later case to report on', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: false });
      const caseRooms: number[] = [];
      const warrantRooms: number[] = [];
      for (const room of route.rooms) {
        for (const s of room.sockets ?? []) {
          if (!s.meta?.confiscated) continue;
          caseRooms.push(room.index);
          if (s.meta.contains === 'warrant') {
            warrantRooms.push(room.index);
            expect(s.meta.amount, `warrant carries an amount on ${seed}`).toBeUndefined();
          }
        }
      }
      for (const w of warrantRooms) {
        expect(caseRooms.some((ci) => ci > w), `warrant at ${w} has no later case on ${seed}`).toBe(true);
      }
    }
  });
});

describe('the counter-claim (sprint 299)', () => {
  it('clerk forms sit on under desk furniture, marginalia-priced', () => {
    const HOSTS = new Set(['filing', 'cubicle', 'schoolDesk', 'keyCabinet', 'recordsCage']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      let count = 0;
      for (const r of route.rooms) {
        expect((r.sockets ?? []).some((s) => s.meta?.counterClaim),
          `counter-claim on the main route ${seed}`).toBe(false);
      }
      for (const r of route.underRooms) {
        for (const s of r.sockets ?? []) {
          if (!s.meta?.counterClaim) continue;
          count++;
          expect(r.index % 20, `counter-claim on a safe landing ${seed}`).not.toBe(0);
          expect(typeof s.meta.price, `counter-claim unpriced ${seed}`).toBe('number');
          expect((r.spec?.props ?? []).some((p) => HOSTS.has(p.kind)),
            `counter-claim on a desk-less room ${seed} u-${r.index}`).toBe(true);
        }
      }
      expect(count, `no counter-claims on ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the affidavit (sprint 302)', () => {
  it('sworn filings sit on main-route desks, imprint-priced, one paper per room', () => {
    const BIOMES = new Set(['records', 'maintenance', 'lobby', 'guest']);
    const HOSTS = new Set(['desk', 'writingDesk', 'consoleTable']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      let count = 0;
      for (const r of route.underRooms) {
        expect((r.sockets ?? []).some((s) => s.meta?.affidavit),
          `affidavit on the underscript ${seed}`).toBe(false);
      }
      for (const r of route.rooms) {
        for (const s of r.sockets ?? []) {
          if (!s.meta?.affidavit) continue;
          count++;
          expect(r.authored, `affidavit on an authored room ${seed}`).toBeFalsy();
          expect(BIOMES.has(r.biome), `affidavit in ${r.biome} ${seed}`).toBe(true);
          expect(typeof s.meta.price, `affidavit unpriced ${seed}`).toBe('number');
          expect((r.spec?.props ?? []).some((p) => HOSTS.has(p.kind)),
            `affidavit on a desk-less room ${seed} r-${r.index}`).toBe(true);
          // one paper per room — the affidavit defers to every other filing
          const papers = (r.sockets ?? []).filter((x) =>
            x.meta?.register || x.meta?.roster || x.meta?.complaint || x.meta?.watchSheet || x.meta?.affidavit);
          expect(papers.length, `two filings in room ${r.index} ${seed}`).toBe(1);
        }
      }
      expect(count, `no affidavits on ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the quiet amendment (sprint 308)', () => {
  it('amendment forms sit on under desk furniture, marginalia-priced', () => {
    const HOSTS = new Set(['filing', 'cubicle', 'schoolDesk', 'keyCabinet', 'recordsCage']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      let count = 0;
      for (const r of route.rooms) {
        expect((r.sockets ?? []).some((s) => s.meta?.misfile),
          `quiet amendment on the main route ${seed}`).toBe(false);
      }
      for (const r of route.underRooms) {
        for (const s of r.sockets ?? []) {
          if (!s.meta?.misfile) continue;
          count++;
          expect(r.index % 20, `amendment on a safe landing ${seed}`).not.toBe(0);
          expect(typeof s.meta.price, `amendment unpriced ${seed}`).toBe('number');
          expect(s.meta.price as number, `amendment underpriced ${seed}`).toBeGreaterThanOrEqual(6);
          expect((r.spec?.props ?? []).some((p) => HOSTS.has(p.kind)),
            `amendment on a desk-less room ${seed} u-${r.index}`).toBe(true);
        }
      }
      expect(count, `no quiet amendments on ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the return slip (sprint 301)', () => {
  it('return forms sit on under cage furniture, marginalia-priced', () => {
    const HOSTS = new Set(['recordsCage', 'keyCabinet', 'locker', 'filing', 'cabinet']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      let count = 0;
      for (const r of route.rooms) {
        expect((r.sockets ?? []).some((s) => s.meta?.returnSlip),
          `return slip on the main route ${seed}`).toBe(false);
      }
      for (const r of route.underRooms) {
        for (const s of r.sockets ?? []) {
          if (!s.meta?.returnSlip) continue;
          count++;
          expect(r.index % 20, `return slip on a safe landing ${seed}`).not.toBe(0);
          expect(typeof s.meta.price, `return slip unpriced ${seed}`).toBe('number');
          expect((r.spec?.props ?? []).some((p) => HOSTS.has(p.kind)),
            `return slip on a cage-less room ${seed} u-${r.index}`).toBe(true);
        }
      }
      expect(count, `no return slips on ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the Filer (sprint 297)', () => {
  it('clerks work dry index rooms below, never the main route', () => {
    const STATIONS = new Set(['filing', 'recordsCage', 'keyCabinet']);
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.rooms) {
        expect(r.scheduled?.some((s) => s.entity === 'filer') ?? false,
          `filer on the main route ${seed}`).toBe(false);
      }
      const clerks = route.underRooms.filter((r) => r.scheduled?.some((s) => s.entity === 'filer'));
      for (const r of clerks) {
        expect(r.flooded, `filer in a flooded room ${seed} u-${r.index}`).not.toBe(true);
        expect((r.spec?.props ?? []).some((p) => STATIONS.has(p.kind)),
          `filer on an index-less room ${seed} u-${r.index}`).toBe(true);
        expect(r.index % 20, `filer on a safe landing ${seed}`).not.toBe(0);
        expect(r.scheduled!.length, `filer shares a room ${seed} u-${r.index}`).toBe(1);
      }
      // her pass is a post-roll on its own stream — approach marks still land
      const tells = route.underRooms.filter((r) =>
        (r.spec?.props ?? []).some((p) => p.meta?.foreshadow === 'filer'));
      expect(tells.length, `no filer foreshadow on ${seed}`).toBeGreaterThanOrEqual(clerks.length > 0 ? 1 : 0);
    }
  });
});

describe('the undertow (sprint 408)', () => {
  it('rooms flanking both under-passages carry the seep, graded by distance', () => {
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      const gates = new Set<number>();
      const ent = route.rooms.find((r) => r.templateId === 'ms-under-entrance');
      if (ent) gates.add(ent.index);
      const ret = route.rooms[Math.min(route.underReturn, route.rooms.length - 1)];
      if (ret) gates.add(ret.index);
      for (const r of route.rooms) {
        const nearGate = [...gates].some((g) => Math.abs(r.index - g) <= 2);
        if (nearGate) {
          expect(r.underSeep, `gate-adjacent room ${r.index} unmarked on ${seed}`).not.toBeUndefined();
          expect(r.underSeep!, `seep grade out of range ${seed} ${r.index}`).toBeLessThanOrEqual(2);
        } else {
          expect(r.underSeep, `far room ${r.index} seeps on ${seed}`).toBeUndefined();
        }
      }
      // both gates are marked at grade 0
      for (const g of gates) {
        expect(route.rooms.find((r) => r.index === g)?.underSeep,
          `gate room ${g} ungraded on ${seed}`).toBe(0);
      }
    }
  });
});

describe('the set-piece approach (sprints 409/412)', () => {
  it('rooms before chases, the lens hall and baggage bleed that piece\u2019s tells, graded by distance', () => {
    const MAP: Record<string, string> = {
      'ms-chase1': 'pursuer', 'ms-chase2': 'pursuer',
      'ms-lens-hall': 'curator', 'ms-baggage': 'hauler',
    };
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      // every keyed milestone grades the two rooms on its approach
      for (const ms of Object.keys(MAP)) {
        const pos = route.rooms.findIndex((r) => r.templateId === ms);
        expect(pos, `${seed} missing ${ms}`).toBeGreaterThan(0);
        const near = route.rooms[pos - 1];
        expect(near.milestoneTell, `${seed} approach to ${ms}`).toBe(MAP[ms]);
        expect(near.milestoneDist, `${seed} dist for ${ms}`).toBe(0);
        expect(near.foreshadow, `${seed} room ${near.index} double-tells`).toBeUndefined();
        const far = route.rooms[pos - 2];
        if (far && !far.templateId.startsWith('ms-')) {
          expect(far.milestoneDist, `${seed} far approach to ${ms}`).toBe(1);
          expect(far.milestoneTell, `${seed} far tell for ${ms}`).toBeDefined();
        }
      }
      // marks never appear further than one room out, and dist always
      // rides with its tell
      for (const r of route.rooms) {
        expect(r.milestoneDist ?? 0, `${seed} room ${r.index} mark too deep`).toBeLessThanOrEqual(1);
        expect(
          (r.milestoneTell !== undefined) === (r.milestoneDist !== undefined),
          `${seed} room ${r.index} tell/dist mismatch`,
        ).toBe(true);
        if (r.milestoneDist === 0) expect(r.foreshadow, `${seed} room ${r.index} double-tells`).toBeUndefined();
      }
    }
  });
});

describe('the seam bleeds (sprint 413)', () => {
  it('every keyed set piece resolves to a drawable tell for its gap-corridor', () => {
    for (const [tpl, tell] of Object.entries(MILESTONE_TELLS)) {
      expect(tpl.startsWith('ms-'), `${tpl} keyed but not a milestone`).toBe(true);
      expect(FORESHADOW_TELLS[tell], `${tpl} tell '${tell}' missing from FORESHADOW_TELLS`).toBeDefined();
    }
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      const ids = new Set(route.rooms.map((r) => r.templateId));
      for (const tpl of Object.keys(MILESTONE_TELLS)) {
        expect(ids.has(tpl), `${seed} route missing keyed set piece ${tpl}`).toBe(true);
      }
    }
  });
});

describe('the worn way (sprint 414)', () => {
  it('thresholds carry wear decals and locked leaves scar the wall beside them', () => {
    let worn = 0, scars = 0, scarRooms = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route).slice(0, 40)) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => {
          if (o.name === 'worn-threshold') worn++;
          if (o.name === 'lock-scars') scars++;
        });
        if (room.doors.some((d) => d.locked)) scarRooms++;
      }
    }
    // every seed lays wear on most main-route leaves — never zero
    expect(worn, 'no threshold wear laid anywhere').toBeGreaterThan(20);
    // locked leaves exist on every route; when a locked room built, scars
    // should appear somewhere across the suite (0.75 gate per leaf)
    expect(scarRooms, 'no locked doors generated — fixture drifted').toBeGreaterThan(0);
    expect(scars, 'locked doors never scarred').toBeGreaterThan(0);
  });
});

describe('the sparse pass (sprint 415)', () => {
  it('maintenance and gallery rooms carry floor clutter with their own vocabulary', () => {
    const seen: Record<string, Set<string>> = {};
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route)) {
        if (!room.spec || (room.biome !== 'maintenance' && room.biome !== 'gallery')) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        const set = (seen[room.biome] ??= new Set());
        built.group.traverse((o) => { if (o.name.startsWith('clutter-')) set.add(o.name.slice(8)); });
      }
    }
    for (const biome of ['maintenance', 'gallery']) {
      expect(seen[biome]?.size ?? 0, `${biome} rooms never dressed`).toBeGreaterThan(0);
    }
    // biome vocabulary — gallery sheds books, maintenance drifts bulky
    // kinds (carton/rubble/bottles) the paper biomes never carry
    expect(seen.gallery?.has('books'), 'gallery never sheds books').toBe(true);
    const bulky = ['carton', 'rubblePile', 'bleachBottle'].some((k) => seen.maintenance?.has(k));
    expect(bulky, 'maintenance carries no bulky clutter').toBe(true);
  });
});

describe('the ones before you (sprint 416)', () => {
  it('chalk scrawl appears near cover — ambiguous whether refuge or bait', () => {
    let marks = 0, spots = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route)) {
        if (!room.spec || !room.hidingSpots.length) continue;
        spots += room.hidingSpots.length;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'chalk-mark') marks++; });
      }
    }
    expect(spots, 'fixture produced no cover — drifted').toBeGreaterThan(50);
    expect(marks, 'no chalk marks anywhere').toBeGreaterThan(30);
    // the 0.45 gate per spot bounds density — never denser than cover itself
    expect(marks, 'chalk outnumbers the cover it marks').toBeLessThan(spots);
  });
});

describe('the under drifts too (sprint 417)', () => {
  it('underscript rooms carry service-camp clutter, not just litter', () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of route.underRooms) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name.startsWith('clutter-')) kinds.add(o.name.slice(8)); });
      }
    }
    // camp vocabulary — cartons/papers plus ration + rubble kinds the
    // upper floors never get under this name
    expect(kinds.has('carton') || kinds.has('papers'), 'no under clutter laid').toBe(true);
    const camp = ['wineBottles', 'foodCans', 'rubblePile'].some((k) => kinds.has(k));
    expect(camp, 'under carries none of its camp kinds').toBe(true);
  });
});

describe('the lamps take sides (sprint 419)', () => {
  it('dead fixtures favor locked leaves, lit favor open — imperfectly', () => {
    let litOpen = 0, litLocked = 0, deadOpen = 0, deadLocked = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route)) {
        if (!room.spec || !room.doors.length) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        const c = Math.cos(-room.yaw), s = Math.sin(-room.yaw);
        const locals = room.doors.map((d) => {
          const dx = d.pos.x - room.origin.x, dz = d.pos.z - room.origin.z;
          return { locked: d.locked, x: dx * c + dz * s, z: -dx * s + dz * c };
        });
        built.group.traverse((o) => {
          if (!o.name.startsWith('door-lamp-')) return;
          const state = o.name.slice(10);
          let best: (typeof locals)[number] | undefined, bd = Infinity;
          for (const lp of locals) {
            const dd = (o.position.x - lp.x) ** 2 + (o.position.z - lp.z) ** 2;
            if (dd < bd) { bd = dd; best = lp; }
          }
          if (!best) return;
          if (state === 'lit') { if (best.locked) litLocked++; else litOpen++; }
          else if (state === 'dead' || state === 'smoke') { if (best.locked) deadLocked++; else deadOpen++; }
        });
      }
    }
    const fixtures = litOpen + litLocked + deadOpen + deadLocked;
    expect(fixtures, 'no door lamps anywhere').toBeGreaterThan(60);
    // the channel is a rate: locked leaves go dead ~85%, open ~30%
    const deadRateLocked = deadLocked / (deadLocked + litLocked);
    const deadRateOpen = deadOpen / (deadOpen + litOpen);
    expect(deadRateLocked, 'locked leaves never dark').toBeGreaterThan(deadRateOpen * 1.5);
    // imperfect on purpose — open leaves still go dark sometimes
    expect(deadOpen, 'open never misleads — too honest').toBeGreaterThan(10);
    expect(litOpen, 'open leaves never lit').toBeGreaterThan(10);
  });
});

describe('the house remembers routes (sprint 420)', () => {
  it('junctions carry arrows — mostly honest, sometimes bait', () => {
    let honest = 0, lies = 0, aimed = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route)) {
        if (!room.spec || !room.doors.length) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        const ports = [room.spec.entry, ...room.spec.exits].map((p) => portLocalPos(p, room.spec.width, room.spec.depth));
        built.group.traverse((o) => {
          if (o.name === 'way-arrow' || o.name === 'way-arrow-false') {
            if (o.name === 'way-arrow') honest++; else lies++;
            // arrow direction is rotation.z: dir = (cos a, -sin a) in xz
            const ax = Math.cos(o.rotation.z), az = -Math.sin(o.rotation.z);
            const hit = ports.some((lp) => {
              const L = Math.hypot(lp.x, lp.z) || 1;
              return (ax * lp.x / L + az * lp.z / L) > 0.85;
            });
            if (hit) aimed++;
          }
        });
      }
    }
    expect(honest + lies, 'no way arrows at junctions').toBeGreaterThan(10);
    expect(honest, 'no honest arrows').toBeGreaterThan(5);
    expect(lies, 'the house never lies — too honest').toBeGreaterThan(0);
    // arrows steer: nearly all point within ~30° of some door
    expect(aimed / (honest + lies)).toBeGreaterThan(0.9);
  });
});

describe('the lodge keeps watch (sprint 421)', () => {
  it('porter-lodge generates as a rare records room and dresses itself', () => {
    let found = 0, dressed = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route)) {
        if (room.templateId !== 'porter-lodge') continue;
        found++;
        expect(room.spec!.biome).toBe('records');
        expect(room.hidingSpots.length).toBeGreaterThanOrEqual(2);
        const kinds = new Set(room.spec!.props.map((p) => p.kind));
        expect(kinds.has('desk'), 'porter desk missing').toBe(true);
        expect(kinds.has('keyRack'), 'key rack missing').toBe(true);
        const built = buildRoomMesh(room, room.spec!, room.index, 'high');
        let meshes = 0;
        built.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
        expect(meshes, 'lodge built empty').toBeGreaterThan(60);
        dressed++;
      }
    }
    expect(found, 'porter-lodge never generates').toBeGreaterThan(0);
    expect(dressed).toBe(found);
  });
});

describe('the drag (sprint 422)', () => {
  it('heel-trails end at hiding spots across seeds', () => {
    let trails = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route)) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'drag-trail') trails++; });
      }
    }
    expect(trails, 'no drag trails anywhere').toBeGreaterThan(8);
  });
});

describe('the notices (sprint 423)', () => {
  it('paperwork stays pinned beside doors in the lived-in biomes', () => {
    let notices = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed });
      for (const room of mainRooms(route)) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'wall-notice') notices++; });
      }
    }
    expect(notices, 'no notices pinned').toBeGreaterThan(10);
  });
});

describe('the rust keeps score (sprint 424)', () => {
  it('service walls bleed oxidation streaks', () => {
    let streaks = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rust-streak') streaks++; });
      }
    }
    expect(streaks, 'no rust streaks').toBeGreaterThan(15);
  });
});

describe('the wiring shows (sprint 425)', () => {
  it('service ceilings carry drooping cable runs', () => {
    let cables = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'ceiling-cable') cables++; });
      }
    }
    expect(cables, 'no ceiling cables').toBeGreaterThan(10);
  });
});

describe('the ones who ran (sprint 427)', () => {
  it('abandoned effects wait by doors and cover', () => {
    let fled = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'fled-effects') fled++; });
      }
    }
    expect(fled, 'no fled effects').toBeGreaterThan(10);
  });
});

describe('the fallen (sprint 428)', () => {
  it('dropped frames leave a clean ghost on lived-in walls', () => {
    let fallen = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'fallen-frame') fallen++; });
      }
    }
    expect(fallen, 'no fallen frames').toBeGreaterThan(10);
  });
});

describe('the cold hearth (sprint 429)', () => {
  it('ash spills at the feet of dead grates', () => {
    let hearths = 0, near = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const fp = room.spec.props.filter((p) => ['fireplace', 'stove', 'stoveRange', 'firePit'].includes(p.kind));
        if (!fp.length) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => {
          if (o.name !== 'cold-hearth') return;
          hearths++;
          if (fp.some((p) => Math.hypot(o.position.x - p.x, o.position.z - p.z) < 1.2)) near++;
        });
      }
    }
    expect(hearths, 'no ash piles').toBeGreaterThan(8);
    expect(near, 'ash not near a grate').toBeGreaterThanOrEqual(hearths);
    // and no decal may sit on a NaN transform (poisons the room)
    const nanGuard = generateRoute({ seedText: SEEDS[0], includeUnderscript: true }).rooms.every((r) => {
      if (!r.spec) return true;
      const b = buildRoomMesh(r, r.spec, r.index, 'high');
      let bad = false;
      b.group.traverse((o) => { if (o.name === 'cold-hearth' && (!Number.isFinite(o.position.x) || !Number.isFinite(o.position.z))) bad = true; });
      return !bad;
    });
    expect(nanGuard, 'cold-hearth decal at NaN').toBe(true);
  });
});

describe("the inspector tally (sprint 430)", () => {
  it("scratch counts gather beside the hollow seats", () => {
    let trapped = 0, tallies = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        trapped += room.hidingSpots.filter((s) => s.trappedBy).length;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'inspector-tally') tallies++; });
      }
    }
    expect(trapped, 'no trapped seats on any seed').toBeGreaterThan(5);
    expect(tallies, 'no tallies').toBeGreaterThan(4);
  });
});

describe('the drip keeps time (sprint 431)', () => {
  it('wet rings gather under cable and pipe runs', () => {
    let drips = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'drip-keeps-time') drips++; });
      }
    }
    expect(drips, 'no drip spots').toBeGreaterThan(8);
  });
});

describe('the leaf remembers (sprint 432)', () => {
  it('door leaves polish swing arcs into lived-in floors', () => {
    let arcs = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'swing-wear') arcs++; });
      }
    }
    expect(arcs, 'no swing arcs').toBeGreaterThan(15);
  });
});

describe('the dust shadow (sprint 433)', () => {
  it('walls keep the silhouette of long-standing furniture', () => {
    let shadows = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'dust-shadow') shadows++; });
      }
    }
    expect(shadows, 'no dust shadows').toBeGreaterThan(10);
  });
});

describe('the votive (sprint 434)', () => {
  it('watched spots keep a guttered vigil at their feet', () => {
    let votives = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'votive-watch') votives++; });
      }
    }
    expect(votives, 'no votives').toBeGreaterThan(4);
  });
});

describe('the runners slide (sprint 436)', () => {
  it('corridor corners carry crescent scuff arcs', () => {
    let scuffs = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'corner-scuff') scuffs++; });
      }
    }
    expect(scuffs, 'no corner scuffs').toBeGreaterThan(10);
  });
});

describe('the house was hurt before (sprint 435)', () => {
  it('walls carry plaster plug repairs', () => {
    let patches = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'patch-plug') patches++; });
      }
    }
    expect(patches, 'no patch plugs').toBeGreaterThan(8);
  });
});

describe('the numbers changed (sprint 437)', () => {
  it('doors carry a painted numeral, the old one scratched out', () => {
    let nums = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'old-number') nums++; });
      }
    }
    expect(nums, 'no old numbers').toBeGreaterThan(15);
  });
});
