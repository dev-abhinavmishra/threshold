import { describe, it, expect } from 'vitest';
import { generateRoute, MILESTONE_TELLS } from '../src/world/generator';
import { FORESHADOW_TELLS } from '../src/world/builder';
import { SAFE_ROOM_TEMPLATES, ENTITY_TUNING, DEATH_NAMES, DEATH_HINTS } from '../src/game/config';
import { TELLS } from '../src/world/foreshadow';
import { validateRoute } from '../src/world/validation';
import type { RoomInstance } from '../src/game/types';
import { aabbFromMinMax, v3 } from '../src/engine/math';
import { portLocalPos, inDoorLane, footprintInDoorLane, footprintInDoorLeaf } from '../src/world/spec';
import { modelCollider, MODEL_FOR } from '../src/world/modelLibrary';
import { buildProp } from '../src/world/props';
import { Rng } from '../src/engine/rng';
import { buildRoomMesh } from '../src/world/builder';
import { MAT } from '../src/world/materials';
import * as THREE from 'three';
import { MAIN_TEMPLATES, propsClash, CLASH_OK } from '../src/world/templates';
import { UNDERSCRIPT_TEMPLATES } from '../src/world/underscriptTemplates';
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

  it('every closed door also gains a stoop-to-the-crack point (sprint 445)', async () => {
    const { InteractionSystem, addCrouchedDoorInteracts } = await import('../src/player/interaction');
    const route = generateRoute({ seedText: 's', difficulty: 'standard', includeUnderscript: true });
    const sys = new InteractionSystem();
    let closed = 0, stoops = 0;
    for (const r of route.rooms.filter((x) => x.index >= 0).slice(0, 40)) {
      sys.clear();
      sys.addRoomInteractables(r);
      addCrouchedDoorInteracts(sys);
      for (const d of r.doors) {
        if (d.openT > 0.4) continue;
        closed++;
        const st = sys.interactables.find((i) => i.kind === 'stoop' && i.data === d);
        if (!st) continue;
        stoops++;
        // centred on the leaf's LATERAL line (the seam verbs live at its
        // edge), floating a step toward the player's side along the normal,
        // above the crouched eye — sprint 469 lifted the lattice out of the
        // eye plane (floor-level anchors sat at eye height 0.9, where the
        // nearer flank always beat the centre on dist); aim must separate
        // LOOK at the seam from REACH through its edges
        const latX = Math.cos(d.yaw), latZ = -Math.sin(d.yaw);
        const latOff = (st.pos.x - d.pos.x) * latX + (st.pos.z - d.pos.z) * latZ;
        expect(Math.abs(latOff)).toBeLessThan(0.06);
        expect(Math.hypot(st.pos.x - d.pos.x, st.pos.z - d.pos.z)).toBeLessThan(0.5);
        expect(st.pos.y).toBeGreaterThan(d.pos.y + 0.8);
        expect(st.pos.y).toBeLessThan(d.pos.y + 1.2);
        expect(st.holdTime).toBeGreaterThanOrEqual(0.8);
      }
    }
    expect(closed).toBeGreaterThan(30);
    expect(stoops).toBe(closed); // false doors keep the crack too — plaster is the tell
  });

  it('closed real doors gain a slip-a-pebble point; false doors have no far side (sprint 447)', async () => {
    const { InteractionSystem, addCrouchedDoorInteracts } = await import('../src/player/interaction');
    const route = generateRoute({ seedText: 's', difficulty: 'standard', includeUnderscript: true });
    const sys = new InteractionSystem();
    let real = 0, slips = 0, falseSlips = 0;
    for (const r of route.rooms.filter((x) => x.index >= 0).slice(0, 40)) {
      sys.clear();
      sys.addRoomInteractables(r);
      addCrouchedDoorInteracts(sys);
      for (const d of r.doors) {
        if (d.openT > 0.4) continue;
        if (d.falseDoor) { if (sys.interactables.some((i) => i.kind === 'slip' && i.data === d)) falseSlips++; continue; }
        real++;
        if (sys.interactables.some((i) => i.kind === 'slip' && i.data === d)) slips++;
      }
    }
    expect(real).toBeGreaterThan(25);
    expect(slips).toBe(real);
    expect(falseSlips).toBe(0);
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

describe('the wall kept the hooks (sprint 438)', () => {
  it('lived-in walls carry rows of old nail holes', () => {
    let rows = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'nail-row') rows++; });
      }
    }
    expect(rows, 'no nail rows').toBeGreaterThan(6);
  });
});

describe('the fan sheds (sprint 439)', () => {
  it('dust rings gather under ceiling fans and vents', () => {
    let falls = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'fan-sheds') falls++; });
      }
    }
    expect(falls, 'no dust falls').toBeGreaterThan(6);
  });
});

describe('the route reads (sprint 441)', () => {
  it('corridors wear a traffic lane door to door', () => {
    let lanes = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'worn-lane') lanes++; });
      }
    }
    expect(lanes, 'no worn lanes').toBeGreaterThan(8);
  });
});

describe('the seam breathes (sprint 442)', () => {
  it('foreshadowed rooms blow a cold draft under the onward door', () => {
    let drafts = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        if (built.draft) drafts++;
      }
    }
    expect(drafts, 'no seam drafts').toBeGreaterThan(4);
  });
});

describe('the vigil still burns (sprint 443)', () => {
  it('some votives keep a guttering flame', () => {
    let flames = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'votive-flame') flames++; });
      }
    }
    // count drifts with the shared rng stream — the invariant is
    // presence, not rate
    expect(flames, 'no votive flames').toBeGreaterThan(0);
  });
});

describe('the inspection stamp (sprint 444)', () => {
  it('doors carry a faded ink seal beside the frame', () => {
    let stamps = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'inspection-stamp') stamps++; });
      }
    }
    expect(stamps, 'no inspection stamps').toBeGreaterThan(6);
  });
});

describe('the mouth it eats from (sprint 445)', () => {
  it('baseboards carry chewed mouse holes', () => {
    let holes = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'mouse-hole') holes++; });
      }
    }
    expect(holes, 'no mouse holes').toBeGreaterThan(6);
  });
});

describe('the wall was opened (sprint 446)', () => {
  it('service walls carry re-plastered chase patches', () => {
    let patches = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'chase-patch') patches++; });
      }
    }
    expect(patches, 'no chase patches').toBeGreaterThan(5);
  });
});

describe('the map nobody trusts (sprint 447)', () => {
  it('lobbies hang framed route plans', () => {
    let maps = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'old-map') maps++; });
      }
    }
    expect(maps, 'no route maps').toBeGreaterThan(4);
  });
});

describe('the register (sprint 448)', () => {
  it('lobbies pin the guest ledger page', () => {
    let pages = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'register-page') pages++; });
      }
    }
    expect(pages, 'no register pages').toBeGreaterThan(4);
  });
});

describe('the paper trail (sprint 448)', () => {
  const count = (name: string) => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === name) n++; });
      }
    }
    return n;
  };

  it('guest doors pin the dispossession notice', () => {
    expect(count('eviction-slip'), 'no eviction slips').toBeGreaterThan(2);
  });

  it('service spaces keep torn repair stubs', () => {
    expect(count('repair-ticket'), 'no repair tickets').toBeGreaterThan(2);
  });

  it('guest rooms pin the booth strip', () => {
    expect(count('photo-strip'), 'no photo strips').toBeGreaterThan(1);
  });
});

describe('the things they left (sprint 448)', () => {
  it('floors keep the dropped belongings', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => {
          if (o.name === 'left-glove' || o.name === 'left-pen' || o.name === 'left-specs') n++;
        });
      }
    }
    expect(n, 'nothing left behind').toBeGreaterThan(3);
  });
});

describe('the house still breathes (sprint 449)', () => {
  const sweep = (match: (o: THREE.Object3D) => boolean) => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (match(o)) n++; });
      }
    }
    return n;
  };

  it('wall fans still work the mains', () => {
    expect(sweep((o) => o.userData.anim === 'spinZ'), 'no turning rotors').toBeGreaterThan(1);
  });

  it('some grates are not dead — a coal still breathes', () => {
    expect(sweep((o) => o.name === 'live-ember'), 'no live embers').toBeGreaterThan(0);
  });

  it('loose cable runs drift from their anchors', () => {
    expect(sweep((o) => o.name === 'cable-drop' && o.userData.anim === 'sway'), 'no drifting cables').toBeGreaterThan(1);
  });

  it('hung signs swing on their nails', () => {
    expect(sweep((o) => o.name === 'sign-hang' && o.userData.anim === 'swing'), 'no drifting signs').toBeGreaterThan(1);
  });
});

describe('the clean walls (sprint 449)', () => {
  it('no wall decal hides behind tall furniture', () => {
    let buried = 0;
    let decals = 0;
    const who: string[] = [];
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        const w = room.width, d = room.depth;
        const wallDecals: { o: THREE.Object3D; wall: string; along: number }[] = [];
        const SPOT_PAPER = new Set(['poster', 'wall-notice', 'register-page', 'eviction-slip', 'repair-ticket', 'photo-strip', 'frame-ghost', 'rust-streak']);
        built.group.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || !o.userData.decalMat) return;
          if (o.position.y < 0.5) return;
          // random-spot paper pieces only — authored marks (chalk scrawl,
          // tallies, old numbers on frames, dust shadows) are intentional
          if (!SPOT_PAPER.has(o.name)) return;
          if (Math.abs(o.position.x - (w / 2 - 0.013)) < 0.01) wallDecals.push({ o, wall: 'e', along: o.position.z });
          else if (Math.abs(o.position.x + (w / 2 - 0.013)) < 0.01) wallDecals.push({ o, wall: 'w', along: o.position.z });
          else if (Math.abs(o.position.z - (d / 2 - 0.013)) < 0.01) wallDecals.push({ o, wall: 'n', along: o.position.x });
          else if (Math.abs(o.position.z + (d / 2 - 0.013)) < 0.01) wallDecals.push({ o, wall: 's', along: o.position.x });
        });
        decals += wallDecals.length;
        for (const dc of wallDecals) {
          for (const p of room.spec.props) {
            const c = modelCollider(p.kind);
            const ph = (c?.[1] ?? 0) + (p.y ?? 0);
            if (ph < 1.05) continue;
            const pw = (c ? Math.max(c[0], c[2]) : 0.8) / 2 + 0.25;
            if (dc.wall === 'e' || dc.wall === 'w') {
              const wx = dc.wall === 'e' ? w / 2 : -w / 2;
              // buried = the decal's centre sits inside the prop's
              // silhouette; edge grazes are still readable
              if (Math.abs(p.x - wx) < pw + 0.3 && Math.abs(dc.along - p.z) < pw - 0.05) { buried++; who.push(`${dc.o.name}@${room.index}`); }
            } else {
              const wz = dc.wall === 'n' ? d / 2 : -d / 2;
              if (Math.abs(p.z - wz) < pw + 0.3 && Math.abs(dc.along - p.x) < pw - 0.05) { buried++; who.push(`${dc.o.name}@${room.index}`); }
            }
          }
        }
      }
    }
    expect(decals, 'no wall decals found').toBeGreaterThan(10);
    expect(buried, `${who.join(', ')} buried behind tall props`).toBe(0);
  });
});

describe('the glass keeps the wrong room (sprint 450)', () => {
  it('some mirrors reflect a corridor that is not this one', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'wrong-room') n++; });
      }
    }
    expect(n, 'no wrong-room panes').toBeGreaterThan(0);
  });
});

describe('the plaster fall (sprint 450)', () => {
  it('cracked walls drop crumbs at their feet', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'plaster-fall') n++; });
      }
    }
    expect(n, 'no plaster fall').toBeGreaterThan(0);
  });
});

describe('the glass sweats (sprint 451)', () => {
  it('some windows fog over — and a few were touched', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'glass-fog') n++; });
      }
    }
    expect(n, 'no fogged glass').toBeGreaterThan(0);
  });
});

describe('the sill keeps the moths (sprint 451)', () => {
  it('dead moths gather under sills that still glow', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'moth-drift') n++; });
      }
    }
    expect(n, 'no moth drifts').toBeGreaterThan(0);
  });
});

describe('the wood keeps the water (sprint 452)', () => {
  it('worked surfaces carry ring stains', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'ring-stain') n++; });
      }
    }
    expect(n, 'no ring stains').toBeGreaterThan(0);
  });
});

describe('the drains drink (sprint 452)', () => {
  it('basins pool a verdigris halo at their feet', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'drain-halo') n++; });
      }
    }
    expect(n, 'no drain halos').toBeGreaterThan(0);
  });
});

describe('the water line (sprint 453)', () => {
  it('rooms that flooded keep the tide mark', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'waterline') n++; });
      }
    }
    expect(n, 'no waterlines').toBeGreaterThan(0);
  });
});

describe('the soot (sprint 453)', () => {
  it('dead hearths keep the bloom they breathed', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'soot-stain') n++; });
      }
    }
    expect(n, 'no soot stains').toBeGreaterThan(0);
  });
});

describe('the beds were slept in (sprint 454)', () => {
  it('some mattresses keep the sleeper\'s shadow', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'slept-in') n++; });
      }
    }
    expect(n, 'no slept-in stains').toBeGreaterThan(0);
  });
});

describe('the letters never sent (sprint 454)', () => {
  it('dropped envelopes wait by beds and tills', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lost-letter') n++; });
      }
    }
    expect(n, 'no lost letters').toBeGreaterThan(0);
  });
});

describe('the wall kept the fist (sprint 455)', () => {
  it('blows landed beside doors at striking height', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'fist-mark') n++; });
      }
    }
    expect(n, 'no fist marks').toBeGreaterThan(0);
  });
});

describe('the ceiling kept the smoke (sprint 455)', () => {
  it('hearths film the plaster above them', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'smoke-stain') n++; });
      }
    }
    expect(n, 'no smoke stains').toBeGreaterThan(0);
  });
});

describe('the bed kept its secrets (sprint 455)', () => {
  it('boxes and cases wait under the frame', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'under-bed') n++; });
      }
    }
    expect(n, 'nothing under the beds').toBeGreaterThan(0);
  });
});

describe('the door was kicked in once (sprint 456)', () => {
  it('splits and shoe shadows ride the leaf', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'kick-split') n++; });
      }
    }
    expect(n, 'no kick splits').toBeGreaterThan(0);
  });
});

describe('the words worked into the glass (sprint 456)', () => {
  it('mirrors keep the scratched writing', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'scratch-writing') n++; });
      }
    }
    expect(n, 'no scratch writing').toBeGreaterThan(0);
  });
});

describe('the count chalked a body (sprint 456)', () => {
  it('outlines stay where someone was found', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'body-outline') n++; });
      }
    }
    expect(n, 'no body outlines').toBeGreaterThan(0);
  });
});

describe('the dust wrote the months (sprint 457)', () => {
  it('dates stay traced in the film on dusty tops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'dust-date') n++; });
      }
    }
    expect(n, 'no dust dates').toBeGreaterThan(0);
  });
});

describe('the curtains kept the sun (sprint 457)', () => {
  it('walls keep the spared strip where a drape hung', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'drape-ghost') n++; });
      }
    }
    expect(n, 'no drape ghosts').toBeGreaterThan(0);
  });
});

describe('the switches kept the hands (sprint 458)', () => {
  it('grease halos gather at shoulder height beside doors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'switch-polish') n++; });
      }
    }
    expect(n, 'no switch polish').toBeGreaterThan(0);
  });
});

describe('the frame kept the years (sprint 458)', () => {
  it('pencil ticks climb lived-in jambs', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'growth-marks') n++; });
      }
    }
    expect(n, 'no growth marks').toBeGreaterThan(0);
  });
});

describe('the sill kept the rain (sprint 458)', () => {
  it('damp fans run down under leaking sills', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'sill-damp') n++; });
      }
    }
    expect(n, 'no sill damp').toBeGreaterThan(0);
  });
});

describe('the radiators wept (sprint 459)', () => {
  it('oxide fans run down behind the ribs', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'radiator-bleed') n++; });
      }
    }
    expect(n, 'no radiator bleeds').toBeGreaterThan(0);
  });
});

describe('the carpet kept the burns (sprint 459)', () => {
  it('char rings gather on lived-in floors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'burn-marks') n++; });
      }
    }
    expect(n, 'no burn marks').toBeGreaterThan(0);
  });
});

describe('the tape never got peeled (sprint 460)', () => {
  it('wartime X\'s still cross some panes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'pane-tape') n++; });
      }
    }
    expect(n, 'no pane tape').toBeGreaterThan(0);
  });
});

describe('the wax held at the thresholds (sprint 460)', () => {
  it('polish arcs shine between the doors of lived-in rooms', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'wax-sheen') n++; });
      }
    }
    expect(n, 'no wax sheen').toBeGreaterThan(0);
  });
});

describe('the vents breathe (sprint 461)', () => {
  it('grilles keep the sooty halo of a long exhale', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'vent-dust') n++; });
      }
    }
    expect(n, 'no vent dust').toBeGreaterThan(0);
  });
});

describe('the boots scuffed (sprint 461)', () => {
  it('heel arcs mark the baseboards along walked lanes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'heel-scuff') n++; });
      }
    }
    expect(n, 'no heel scuffs').toBeGreaterThan(0);
  });
});

describe('the chairs kept the heads (sprint 461)', () => {
  it('pomade sheens crown the backs of old seats', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'chair-halo') n++; });
      }
    }
    expect(n, 'no chair halos').toBeGreaterThan(0);
  });
});

describe('the sconces breathed (sprint 462)', () => {
  it('soot tongues climb above the flame arms', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'sconce-soot') n++; });
      }
    }
    expect(n, 'no sconce soot').toBeGreaterThan(0);
  });
});

describe('the clocks swung (sprint 462)', () => {
  it('pendulum arcs scar the plaster behind old dials', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'clock-ghost') n++; });
      }
    }
    expect(n, 'no clock ghosts').toBeGreaterThan(0);
  });
});

describe('the knobs kept the hands (sprint 462)', () => {
  it('burnished rings crown the working brass', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'knob-shine') n++; });
      }
    }
    expect(n, 'no knob shine').toBeGreaterThan(0);
  });
});

describe('the rail left its screws (sprint 463)', () => {
  it('bracket scars hang above old windows', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rail-ghost') n++; });
      }
    }
    expect(n, 'no rail ghosts').toBeGreaterThan(0);
  });
});

describe('the chairs rubbed the wall (sprint 463)', () => {
  it('a wear band runs at chair-back height', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'chair-rub') n++; });
      }
    }
    expect(n, 'no chair rub').toBeGreaterThan(0);
  });
});

describe('the bedpost kept the count (sprint 463)', () => {
  it('carved ticks mark the head frame', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'bedpost-notches') n++; });
      }
    }
    expect(n, 'no bedpost notches').toBeGreaterThan(0);
  });
});

describe('the glass kept the word (sprint 464)', () => {
  it('finger-writing stays wiped into some panes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'pane-writing') n++; });
      }
    }
    expect(n, 'no pane writing').toBeGreaterThan(0);
  });
});

describe('the boards kept the knives (sprint 464)', () => {
  it('crossed cuts scar the worked tops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'table-scratches') n++; });
      }
    }
    expect(n, 'no table scratches').toBeGreaterThan(0);
  });
});

describe('the phone hung here once (sprint 464)', () => {
  it('case ghosts and cord shadows stay on hall walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'phone-ghost') n++; });
      }
    }
    expect(n, 'no phone ghosts').toBeGreaterThan(0);
  });
});

describe('the corners bloomed (sprint 465)', () => {
  it('mould owns the cold seams of the wet bones', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'mould-bloom') n++; });
      }
    }
    expect(n, 'no mould blooms').toBeGreaterThan(0);
  });
});

describe('the board kept the keys (sprint 465)', () => {
  it('pegboard ghosts hang where the desk worked', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'key-board') n++; });
      }
    }
    expect(n, 'no key boards').toBeGreaterThan(0);
  });
});

describe('the luggage scraped by (sprint 465)', () => {
  it('belt-height drag bands run down the walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'luggage-scuff') n++; });
      }
    }
    expect(n, 'no luggage scuffs').toBeGreaterThan(0);
  });
});

describe('the doors dragged (sprint 466)', () => {
  it('swing crescents scar the floor at the stall point', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'door-drag') n++; });
      }
    }
    expect(n, 'no door drags').toBeGreaterThan(0);
  });
});

describe('the basin kept the tide (sprint 466)', () => {
  it('scum rings mark bowls that stood full', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'soap-scum') n++; });
      }
    }
    expect(n, 'no soap scum').toBeGreaterThan(0);
  });
});

describe('the mirror kept the shaver (sprint 466)', () => {
  it('wiped smears and bristles stay on the glass', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'shaver-smear') n++; });
      }
    }
    expect(n, 'no shaver smears').toBeGreaterThan(0);
  });
});

describe('the treads wore thin (sprint 467)', () => {
  it('polished centers shine on the old steps', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'stair-wear') n++; });
      }
    }
    expect(n, 'no stair wear').toBeGreaterThan(0);
  });
});

describe('the hooks kept the coats (sprint 467)', () => {
  it('greasy halos stand behind the pegs', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hook-wear') n++; });
      }
    }
    expect(n, 'no hook wear').toBeGreaterThan(0);
  });
});

describe('the ceiling keeps its hairlines (sprint 467)', () => {
  it('plaster cracks wander overhead', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'ceiling-hair') n++; });
      }
    }
    expect(n, 'no ceiling hairs').toBeGreaterThan(0);
  });
});

describe('the carts tracked their lanes (sprint 468)', () => {
  it('twin wheel rails scar the service floors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'cart-tracks') n++; });
      }
    }
    expect(n, 'no cart tracks').toBeGreaterThan(0);
  });
});

describe('the grout darkened (sprint 468)', () => {
  it('damp rides the seams between the courses', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'grout-lines') n++; });
      }
    }
    expect(n, 'no grout lines').toBeGreaterThan(0);
  });
});

describe('the counters dripped (sprint 468)', () => {
  it('gravity trails streak the case fronts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'counter-drips') n++; });
      }
    }
    expect(n, 'no counter drips').toBeGreaterThan(0);
  });
});

describe('the sun bleached the boards (sprint 469)', () => {
  it('pale parallelograms pool under the sills', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'sun-fade') n++; });
      }
    }
    expect(n, 'no sun fades').toBeGreaterThan(0);
  });
});

describe('the hinges bled (sprint 469)', () => {
  it('oxide runs drag down the leaf from the knuckles', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hinge-rust') n++; });
      }
    }
    expect(n, 'no hinge rust').toBeGreaterThan(0);
  });
});

describe('the lamps left their rings (sprint 469)', () => {
  it('spared circles of boards mark where they stood', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lamp-ghost') n++; });
      }
    }
    expect(n, 'no lamp ghosts').toBeGreaterThan(0);
  });
});

describe('the rockers swung (sprint 470)', () => {
  it('twin crescents carve the floors under old chairs', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rocker-arcs') n++; });
      }
    }
    expect(n, 'no rocker arcs').toBeGreaterThan(0);
  });
});

describe('the cords wore thin (sprint 470)', () => {
  it('pull-cord drags mark the window reveals', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'cord-wear') n++; });
      }
    }
    expect(n, 'no cord wear').toBeGreaterThan(0);
  });
});

describe('the nightstands kept the glow (sprint 470)', () => {
  it('warm blooms sit behind the bedside lights', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'night-glow') n++; });
      }
    }
    expect(n, 'no night glows').toBeGreaterThan(0);
  });
});

describe('the lace threw its net (sprint 471)', () => {
  it('dappled lattices shadow the walls beside windows', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lace-shadow') n++; });
      }
    }
    expect(n, 'no lace shadows').toBeGreaterThan(0);
  });
});

describe('the flour never left (sprint 471)', () => {
  it('pale films dust the kitchen tops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'flour-dust') n++; });
      }
    }
    expect(n, 'no flour dust').toBeGreaterThan(0);
  });
});

describe('the grease hung (sprint 471)', () => {
  it('oily blooms sit above the ranges', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'grease-cloud') n++; });
      }
    }
    expect(n, 'no grease clouds').toBeGreaterThan(0);
  });
});

describe('the rugs curled (sprint 472)', () => {
  it('lifted lips keep the grit under them', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rug-curl') n++; });
      }
    }
    expect(n, 'no rug curls').toBeGreaterThan(0);
  });
});

describe('the tub kept the ring (sprint 472)', () => {
  it('mineral tide lines run the basin rims', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'bath-ring') n++; });
      }
    }
    expect(n, 'no bath rings').toBeGreaterThan(0);
  });
});

describe('the wardrobe kept the dark (sprint 472)', () => {
  it('door cracks stay black on the untouched cases', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'wardrobe-dark') n++; });
      }
    }
    expect(n, 'no wardrobe darks').toBeGreaterThan(0);
  });
});

describe('the shelves kept the gaps (sprint 473)', () => {
  it('dark slots sit where books were pulled', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'book-gap') n++; });
      }
    }
    expect(n, 'no book gaps').toBeGreaterThan(0);
  });
});

describe('the desks kept the ink (sprint 473)', () => {
  it('blots and nib furrows mark the writing tops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'desk-ink') n++; });
      }
    }
    expect(n, 'no desk ink').toBeGreaterThan(0);
  });
});

describe('the pianos kept the dust (sprint 473)', () => {
  it('settled films ride the closed falls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'piano-dust') n++; });
      }
    }
    expect(n, 'no piano dust').toBeGreaterThan(0);
  });
});

describe('the pipes sweated (sprint 474)', () => {
  it('condensation beads mark the service runs', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'pipe-sweat') n++; });
      }
    }
    expect(n, 'no pipe sweat').toBeGreaterThan(0);
  });
});

describe('the frames leaned (sprint 474)', () => {
  it('rubbing pits sit beside frames against the wall', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'frame-lean') n++; });
      }
    }
    expect(n, 'no frame leans').toBeGreaterThan(0);
  });
});

describe('the drawers kept their slits (sprint 474)', () => {
  it('dark gaps sit on the drawer fronts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'drawer-slit') n++; });
      }
    }
    expect(n, 'no drawer slits').toBeGreaterThan(0);
  });
});

describe('the hearth spilled (sprint 475)', () => {
  it('ash fans sit past the fenders', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hearth-spill') n++; });
      }
    }
    expect(n, 'no hearth spills').toBeGreaterThan(0);
  });
});

describe('the crates dragged (sprint 475)', () => {
  it('splinter fields sit where corners dug in', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'crate-splinters') n++; });
      }
    }
    expect(n, 'no crate splinters').toBeGreaterThan(0);
  });
});

describe('the umbrellas dripped (sprint 475)', () => {
  it('wet rings sit under the stands', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'umbrella-ring') n++; });
      }
    }
    expect(n, 'no umbrella rings').toBeGreaterThan(0);
  });
});

describe('the sheets kept the shape (sprint 476)', () => {
  it('faint sleeper outlines mark the beds', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'sheet-shape') n++; });
      }
    }
    expect(n, 'no sheet shapes').toBeGreaterThan(0);
  });
});

describe('the boards kept the knots (sprint 476)', () => {
  it('seams and knot eyes mark the floors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'knot-holes') n++; });
      }
    }
    expect(n, 'no knot holes').toBeGreaterThan(0);
  });
});

describe('the shafts fell (sprint 476)', () => {
  it('pale light trapezoids sit beside windows', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'dust-shaft') n++; });
      }
    }
    expect(n, 'no dust shafts').toBeGreaterThan(0);
  });
});

describe('the flue stained (sprint 477)', () => {
  it('soot columns rise above the fireplaces', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'flue-stain') n++; });
      }
    }
    expect(n, 'no flue stains').toBeGreaterThan(0);
  });
});

describe('the labels peeled (sprint 477)', () => {
  it('ghost grids sit on the apothecary fronts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'label-ghost') n++; });
      }
    }
    expect(n, 'no label ghosts').toBeGreaterThan(0);
  });
});

describe('the candles dripped (sprint 477)', () => {
  it('wax trails run down the holders', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'candle-drip') n++; });
      }
    }
    expect(n, 'no candle drips').toBeGreaterThan(0);
  });
});

describe('the plaster bulged (sprint 478)', () => {
  it('damp blisters rise on the walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'plaster-bulge') n++; });
      }
    }
    expect(n, 'no plaster bulges').toBeGreaterThan(0);
  });
});

describe('the mirrors blinded (sprint 478)', () => {
  it('tarnish creeps in at the edges', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'mirror-blind') n++; });
      }
    }
    expect(n, 'no mirror blinds').toBeGreaterThan(0);
  });
});

describe('the doors dented the wall (sprint 478)', () => {
  it('impact pits sit behind the swings', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'door-dent') n++; });
      }
    }
    expect(n, 'no door dents').toBeGreaterThan(0);
  });
});

describe('the taps calcified (sprint 479)', () => {
  it('lime crust sits on the spouts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'tap-calc') n++; });
      }
    }
    expect(n, 'no tap calc').toBeGreaterThan(0);
  });
});

describe('the drains rusted (sprint 479)', () => {
  it('oxidation halos ring the floor grates', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rust-halo') n++; });
      }
    }
    expect(n, 'no rust halos').toBeGreaterThan(0);
  });
});

describe('the porcelain crazed (sprint 479)', () => {
  it('crackle lines mark the old basins', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'porcelain-craze') n++; });
      }
    }
    expect(n, 'no porcelain crazing').toBeGreaterThan(0);
  });
});

describe('the hooks sagged (sprint 480)', () => {
  it('pull halos sit under the loaded mounts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hook-sag') n++; });
      }
    }
    expect(n, 'no hook sags').toBeGreaterThan(0);
  });
});

describe('the chains shone (sprint 480)', () => {
  it('worn bright lines ride the dragged chains', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'chain-shine') n++; });
      }
    }
    expect(n, 'no chain shines').toBeGreaterThan(0);
  });
});

describe('the rope frayed (sprint 480)', () => {
  it('snapped fibers curl off the barrier ropes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rope-fray') n++; });
      }
    }
    expect(n, 'no rope frays').toBeGreaterThan(0);
  });
});

describe('the leaves blew in (sprint 481)', () => {
  it('litter scatters under the open panes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'leaf-litter') n++; });
      }
    }
    expect(n, 'no leaf litter').toBeGreaterThan(0);
  });
});

describe('the bells rusted dumb (sprint 481)', () => {
  it('servant rosettes mark the old walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'bell-rose') n++; });
      }
    }
    expect(n, 'no bell roses').toBeGreaterThan(0);
  });
});

describe('the webs veiled the tops (sprint 481)', () => {
  it('thread fans bridge the tall furniture', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'web-drape') n++; });
      }
    }
    expect(n, 'no web drapes').toBeGreaterThan(0);
  });
});

describe('the keyholes kept the fumbles (sprint 482)', () => {
  it('polish rings sit around the key slots', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'keyhole-wear') n++; });
      }
    }
    expect(n, 'no keyhole wear').toBeGreaterThan(0);
  });
});

describe('the candles shed their skins (sprint 482)', () => {
  it('collapsed shells stand on the holders', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'candle-skin') n++; });
      }
    }
    expect(n, 'no candle skins').toBeGreaterThan(0);
  });
});

describe('the treads kept the shine (sprint 482)', () => {
  it('polished lanes mark the stairs', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'tread-shine') n++; });
      }
    }
    expect(n, 'no tread shines').toBeGreaterThan(0);
  });
});


describe('the moths ate the drapes (sprint 483)', () => {
  it('chewed voids mark the hanging curtains', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'moth-bites') n++; });
      }
    }
    expect(n, 'no moth bites').toBeGreaterThan(0);
  });
});

describe('the valances kept the dust (sprint 483)', () => {
  it('dust films sit on the curtain headers', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'valance-dust') n++; });
      }
    }
    expect(n, 'no valance dust').toBeGreaterThan(0);
  });
});

describe('the curtains threw their shade (sprint 483)', () => {
  it('fold shadows sit behind the drapes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'curtain-shade') n++; });
      }
    }
    expect(n, 'no curtain shades').toBeGreaterThan(0);
  });
});

describe('the pots kept their rings (sprint 484)', () => {
  it('scorch brands mark the worktops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'pot-ring') n++; });
      }
    }
    expect(n, 'no pot rings').toBeGreaterThan(0);
  });
});

describe('the lids kept the steam (sprint 484)', () => {
  it('wet rings sit under the lidded pots', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lid-steam') n++; });
      }
    }
    expect(n, 'no lid steam').toBeGreaterThan(0);
  });
});

describe('the wine kept the rack (sprint 484)', () => {
  it('bottle rings and drips mark the racks', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rack-ghost') n++; });
      }
    }
    expect(n, 'no rack ghosts').toBeGreaterThan(0);
  });
});

describe('the walls opened (sprint 485)', () => {
  it('plaster wounds show the lath behind on neglected walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lath-expose') n++; });
      }
    }
    expect(n, 'no lath wounds').toBeGreaterThan(0);
  });
});

describe('the drains wept (sprint 485)', () => {
  it('rust rings stand around the floor grates and scuttles', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'drain-rust') n++; });
      }
    }
    expect(n, 'no drain rust').toBeGreaterThan(0);
  });
});

describe('the dust kept what rolled under (sprint 485)', () => {
  it('a grey pelt and lost things peek out at bed edges', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'underbed-haze') n++; });
      }
    }
    expect(n, 'no underbed haze').toBeGreaterThan(0);
  });
});

describe('the paper let go (sprint 486)', () => {
  it('a wallpaper flap curls off the seam on lived-in walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'paper-peel') n++; });
      }
    }
    expect(n, 'no paper peels').toBeGreaterThan(0);
  });
});

describe('the tiles broke (sprint 486)', () => {
  it('crack webs and dark grout wear the wet-room floors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'tile-crack') n++; });
      }
    }
    expect(n, 'no tile cracks').toBeGreaterThan(0);
  });
});

describe('the scuttle spilled (sprint 486)', () => {
  it('coal dust and lumps stand where the scuttle stood', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'coal-dust') n++; });
      }
    }
    expect(n, 'no coal dust').toBeGreaterThan(0);
  });
});

describe('the pegs kept the shapes (sprint 487)', () => {
  it('coat and hat ghosts fade into the paint beside the rails', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'coat-ghost') n++; });
      }
    }
    expect(n, 'no coat ghosts').toBeGreaterThan(0);
  });
});

describe('the box gave way (sprint 487)', () => {
  it('damp bloom and pulp smear sit under cartons left too long', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'box-rot') n++; });
      }
    }
    expect(n, 'no box rot').toBeGreaterThan(0);
  });
});

describe('the case filmed over (sprint 487)', () => {
  it('a dust film with one wiped arc covers the display glass', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'case-dust') n++; });
      }
    }
    expect(n, 'no case dust').toBeGreaterThan(0);
  });
});

describe('the rug frayed (sprint 488)', () => {
  it('loose threads and a worn binding edge the carpets', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'carpet-fray') n++; });
      }
    }
    expect(n, 'no carpet fray').toBeGreaterThan(0);
  });
});

describe('the board kept the holes (sprint 488)', () => {
  it('pin pocks and paper ghosts stay on the felt', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'pin-scars') n++; });
      }
    }
    expect(n, 'no pin scars').toBeGreaterThan(0);
  });
});

describe('the feet wicked the damp (sprint 488)', () => {
  it('dark tide rings stand where furniture waited in wet rooms', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'leg-rings') n++; });
      }
    }
    expect(n, 'no leg rings').toBeGreaterThan(0);
  });
});

describe('the rail kept its dust (sprint 489)', () => {
  it('a grey ledge and nail pits ride the picture rail', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rail-dust') n++; });
      }
    }
    expect(n, 'no rail dust').toBeGreaterThan(0);
  });
});

describe('the table kept its rings (sprint 489)', () => {
  it('glass rings and polish blooms mark the tops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'wax-rings') n++; });
      }
    }
    expect(n, 'no wax rings').toBeGreaterThan(0);
  });
});

describe('the basket shed (sprint 489)', () => {
  it('wicker splinters and fiber wisps lie under the hampers', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'basket-shed') n++; });
      }
    }
    expect(n, 'no basket shed').toBeGreaterThan(0);
  });
});

describe('the clock stopped (sprint 490)', () => {
  it('dust film and frozen hands hold the faces', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'clock-stopped') n++; });
      }
    }
    expect(n, 'no stopped clocks').toBeGreaterThan(0);
  });
});

describe('the shelf lip kept the dust (sprint 490)', () => {
  it('a grey line and finger wipes edge the shelves', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'shelf-lip') n++; });
      }
    }
    expect(n, 'no shelf lip dust').toBeGreaterThan(0);
  });
});

describe('the boards kept the grime (sprint 490)', () => {
  it('a dirt tide rides the baseboards of wet rooms', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'base-grime') n++; });
      }
    }
    expect(n, 'no base grime').toBeGreaterThan(0);
  });
});

describe('the rail kept the hands (sprint 491)', () => {
  it('a darkened grip band wears the handrails', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rail-grime') n++; });
      }
    }
    expect(n, 'no rail grime').toBeGreaterThan(0);
  });
});

describe('the doors took the boots (sprint 491)', () => {
  it('heel scuffs and finger drags mark the metal leaves', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lift-scuff') n++; });
      }
    }
    expect(n, 'no lift scuffs').toBeGreaterThan(0);
  });
});

describe('the gap kept the drift (sprint 491)', () => {
  it('dust and grit comb under the doors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'door-drift') n++; });
      }
    }
    expect(n, 'no door drifts').toBeGreaterThan(0);
  });
});

describe('the battens left ghosts (sprint 492)', () => {
  it('pale strips and nail pits cross the glass', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'batten-ghost') n++; });
      }
    }
    expect(n, 'no batten ghosts').toBeGreaterThan(0);
  });
});

describe('the jug wept rings (sprint 492)', () => {
  it('a stubborn ring and dried drip mark the vessels', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'jug-ring') n++; });
      }
    }
    expect(n, 'no jug rings').toBeGreaterThan(0);
  });
});

describe('the panels bowed (sprint 492)', () => {
  it('a belly shadow and sprung nails push off the frame', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'panel-bow') n++; });
      }
    }
    expect(n, 'no panel bows').toBeGreaterThan(0);
  });
});

describe('the claws raked low (sprint 493)', () => {
  it('three furrows gouge the foot of some doors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'claw-marks') n++; });
      }
    }
    expect(n, 'no claw marks').toBeGreaterThan(0);
  });
});

describe('the lamps smoked the ceiling (sprint 493)', () => {
  it('soot rings lean above the hanging flames', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lamp-soot') n++; });
      }
    }
    expect(n, 'no lamp soot').toBeGreaterThan(0);
  });
});

describe('someone sat (sprint 493)', () => {
  it('seat dust breaks where a body last landed', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'seat-wipe') n++; });
      }
    }
    expect(n, 'no seat wipes').toBeGreaterThan(0);
  });
});

describe('the book dried open (sprint 494)', () => {
  it('warped covers and page fans sit on abandoned books', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'page-fan') n++; });
      }
    }
    expect(n, 'no page fans').toBeGreaterThan(0);
  });
});

describe('the pages curled (sprint 494)', () => {
  it('damp pulls the corners up on loose paperwork', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'paper-curl') n++; });
      }
    }
    expect(n, 'no paper curls').toBeGreaterThan(0);
  });
});

describe('the ceiling bloomed (sprint 494)', () => {
  it('water rings and blisters grow overhead in wet rooms', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'plaster-bloom') n++; });
      }
    }
    expect(n, 'no plaster blooms').toBeGreaterThan(0);
  });
});

describe('the embers jumped (sprint 495)', () => {
  it('scorch pits lie past the hearth edge', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'ember-pits') n++; });
      }
    }
    expect(n, 'no ember pits').toBeGreaterThan(0);
  });
});

describe('someone traced the wall (sprint 495)', () => {
  it('a finger line drags through the wall dust', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'finger-trace') n++; });
      }
    }
    expect(n, 'no finger traces').toBeGreaterThan(0);
  });
});

describe('the mop dried mid-sweep (sprint 495)', () => {
  it('stroke arcs and a water edge mark wet-room floors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'mop-arcs') n++; });
      }
    }
    expect(n, 'no mop arcs').toBeGreaterThan(0);
  });
});

describe('the ladder left its rub (sprint 496)', () => {
  it('twin polish streaks mark service walls where the ladder leans', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'ladder-rub') n++; });
      }
    }
    expect(n, 'no ladder rub').toBeGreaterThan(0);
  });
});

describe('the sill peeled (sprint 496)', () => {
  it('paint flakes curl off the window board', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'sill-peel') n++; });
      }
    }
    expect(n, 'no sill peel').toBeGreaterThan(0);
  });
});

describe('the drawers kept the scratches (sprint 496)', () => {
  it('pull-rub rings and scuffs mark the drawer fronts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'drawer-scars') n++; });
      }
    }
    expect(n, 'no drawer scars').toBeGreaterThan(0);
  });
});

describe('the boiler shed its skin (sprint 497)', () => {
  it('rust flakes and scale scatter in the drip line', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'boiler-flake') n++; });
      }
    }
    expect(n, 'no boiler flakes').toBeGreaterThan(0);
  });
});

describe('the range kept its grease (sprint 497)', () => {
  it('spatter and fat drips mark the oven face', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'oven-grease') n++; });
      }
    }
    expect(n, 'no oven grease').toBeGreaterThan(0);
  });
});

describe('the dial kept the thumb (sprint 497)', () => {
  it('a polish halo breaks the dust where the tuner lives', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'dial-rubs') n++; });
      }
    }
    expect(n, 'no dial rubs').toBeGreaterThan(0);
  });
});

describe('the mirror crept (sprint 498)', () => {
  it('amalgam eats the glass from the edges in', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'mirror-amalgam') n++; });
      }
    }
    expect(n, 'no mirror amalgam').toBeGreaterThan(0);
  });
});

describe('the basin kept its ring (sprint 498)', () => {
  it('a limescale tide band marks the bowl', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'basin-ring') n++; });
      }
    }
    expect(n, 'no basin ring').toBeGreaterThan(0);
  });
});

describe('the hinge wore the frame (sprint 498)', () => {
  it('swing rub and finger grime mark the cabinet fronts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hinge-wear') n++; });
      }
    }
    expect(n, 'no hinge wear').toBeGreaterThan(0);
  });
});

describe('the head kept its oil (sprint 499)', () => {
  it('a rest-bloom darkens the headboard', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'head-grease') n++; });
      }
    }
    expect(n, 'no head grease').toBeGreaterThan(0);
  });
});

describe('the frame knocked the wall (sprint 499)', () => {
  it('rub arcs and chips sit behind the beds', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'frame-rattle') n++; });
      }
    }
    expect(n, 'no frame rattle').toBeGreaterThan(0);
  });
});

describe('the cushions learned the body (sprint 499)', () => {
  it('settle-dips mark the seats that get sat in', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'seat-sag') n++; });
      }
    }
    expect(n, 'no seat sag').toBeGreaterThan(0);
  });
});

describe('the ribbon kept the words (sprint 500)', () => {
  it('ink ghosts mark the typewriter platen', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'platen-ink') n++; });
      }
    }
    expect(n, 'no platen ink').toBeGreaterThan(0);
  });
});

describe('the breaker kept the burn (sprint 500)', () => {
  it('a carbon bloom marks the panel where the fuse went', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'spark-scorch') n++; });
      }
    }
    expect(n, 'no spark scorch').toBeGreaterThan(0);
  });
});

describe('the wheels kept their ruts (sprint 500)', () => {
  it('twin tracks trail the chairs and gurneys', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'wheel-ruts') n++; });
      }
    }
    expect(n, 'no wheel ruts').toBeGreaterThan(0);
  });
});

describe('the plants died standing (sprint 501)', () => {
  it('shed-leaf rings and spilled soil mark the pots', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'plant-death') n++; });
      }
    }
    expect(n, 'no plant death').toBeGreaterThan(0);
  });
});

describe('the jars kept their dust (sprint 501)', () => {
  it('shoulder film and a wipe mark the bottles', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'jar-dust') n++; });
      }
    }
    expect(n, 'no jar dust').toBeGreaterThan(0);
  });
});

describe('the stools scraped arcs (sprint 501)', () => {
  it('pivot gouges circle the seats', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'stool-drag') n++; });
      }
    }
    expect(n, 'no stool drag').toBeGreaterThan(0);
  });
});

describe("the ladder's feet (sprint 502)", () => {
  it('pad pits and drag scars sit under ladders', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'ladder-feet') n++; });
      }
    }
    expect(n, 'no ladder feet').toBeGreaterThan(0);
  });
});

describe("the vice's grit (sprint 502)", () => {
  it('filings fan out under the work stations', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'vice-grit') n++; });
      }
    }
    expect(n, 'no vice grit').toBeGreaterThan(0);
  });
});

describe("the barrel's rings (sprint 502)", () => {
  it('hoop rust circles sit under barrels and cans', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'barrel-rings') n++; });
      }
    }
    expect(n, 'no barrel rings').toBeGreaterThan(0);
  });
});

describe('the landing wore a turn (sprint 503)', () => {
  it('heel arcs sweep the stair elbows', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'landing-wear') n++; });
      }
    }
    expect(n, 'no landing wear').toBeGreaterThan(0);
  });
});

describe('the cage shook its rust (sprint 503)', () => {
  it('flake falls sit under the rattled cages', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'cage-rattle') n++; });
      }
    }
    expect(n, 'no cage rattle').toBeGreaterThan(0);
  });
});

describe('the call button grubbed (sprint 503)', () => {
  it('a finger halo marks the lift walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'call-grub') n++; });
      }
    }
    expect(n, 'no call grub').toBeGreaterThan(0);
  });
});

describe('the wheel shed its wool (sprint 504)', () => {
  it('lanolin film marks the spinning wheels', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'spin-dust') n++; });
      }
    }
    expect(n, 'no spin dust').toBeGreaterThan(0);
  });
});

describe('the counter kept the coins (sprint 504)', () => {
  it('slide scratches mark the counter tops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'counter-belt') n++; });
      }
    }
    expect(n, 'no counter belt').toBeGreaterThan(0);
  });
});

describe('the bell dulled (sprint 504)', () => {
  it('a palm cap marks the counter bells', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'bell-tap') n++; });
      }
    }
    expect(n, 'no bell tap').toBeGreaterThan(0);
  });
});

describe('the pews wore the knees (sprint 505)', () => {
  it('sit-shine and shin kicks mark the pews', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'pew-wear') n++; });
      }
    }
    expect(n, 'no pew wear').toBeGreaterThan(0);
  });
});

describe('the kneeler kept the weight (sprint 505)', () => {
  it('elbow cups and knee dents mark the kneelers', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'kneel-rubs') n++; });
      }
    }
    expect(n, 'no kneel rubs').toBeGreaterThan(0);
  });
});

describe('the hatch kept its ring (sprint 505)', () => {
  it('pull-ring rust frames the hatches', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hatch-ring') n++; });
      }
    }
    expect(n, 'no hatch ring').toBeGreaterThan(0);
  });
});

describe('the canvas crackled (sprint 506)', () => {
  it('craquelure webs the paintings', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'canvas-crackle') n++; });
      }
    }
    expect(n, 'no canvas crackle').toBeGreaterThan(0);
  });
});

describe('the darts missed the board (sprint 506)', () => {
  it('a pocked halo rings the dartboards', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'dart-splash') n++; });
      }
    }
    expect(n, 'no dart splash').toBeGreaterThan(0);
  });
});

describe('the printers coughed toner (sprint 506)', () => {
  it('grey scatter pools under the machines', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'toner-drift') n++; });
      }
    }
    expect(n, 'no toner drift').toBeGreaterThan(0);
  });
});

describe('the boots kept the mud (sprint 507)', () => {
  it('sole stamps sit under the boot gear', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'boot-prints') n++; });
      }
    }
    expect(n, 'no boot prints').toBeGreaterThan(0);
  });
});

describe('the hooks rusted rings (sprint 507)', () => {
  it('oxide halos mark the hanging hooks', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hook-ring') n++; });
      }
    }
    expect(n, 'no hook rings').toBeGreaterThan(0);
  });
});

describe('the racks remembered weight (sprint 507)', () => {
  it('sag shadows mark the loaded racks', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rack-weight') n++; });
      }
    }
    expect(n, 'no rack weight').toBeGreaterThan(0);
  });
});

describe('the beams kept the dust (sprint 533)', () => {
  it('films ride the joists no hand reaches', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'beam-dust') n++; });
      }
    }
    expect(n, 'no beam dust').toBeGreaterThan(0);
  });
});

describe('the cans ringed rust (sprint 533)', () => {
  it('orange circles sit under the stored tins', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'can-ring') n++; });
      }
    }
    expect(n, 'no can rings').toBeGreaterThan(0);
  });
});

describe('the pegs shone (sprint 533)', () => {
  it('rubbed tips mark the coat rails', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'peg-wear') n++; });
      }
    }
    expect(n, 'no peg wear').toBeGreaterThan(0);
  });
});

describe('the extinguishers kept their tag (sprint 534)', () => {
  it('red pull slivers hang on the brackets', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'exting-tag') n++; });
      }
    }
    expect(n, 'no exting tags').toBeGreaterThan(0);
  });
});

describe('the routing board kept its pins (sprint 534)', () => {
  it('tally strings sag between the holes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'pin-lines') n++; });
      }
    }
    expect(n, 'no pin lines').toBeGreaterThan(0);
  });
});

describe('the buckets dripped (sprint 534)', () => {
  it('damp rings mark where they stood', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'bucket-ring') n++; });
      }
    }
    expect(n, 'no bucket rings').toBeGreaterThan(0);
  });
});

describe('the fans kept their blades (sprint 535)', () => {
  it('dust films ride the sweeps', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'fan-film') n++; });
      }
    }
    expect(n, 'no fan films').toBeGreaterThan(0);
  });
});

describe('the hoses scuffed (sprint 535)', () => {
  it('drag arcs run beside the reels', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hose-scuff') n++; });
      }
    }
    expect(n, 'no hose scuffs').toBeGreaterThan(0);
  });
});

describe('the bottles bloomed (sprint 535)', () => {
  it('dust films sit on the stored glass', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'bottle-bloom') n++; });
      }
    }
    expect(n, 'no bottle blooms').toBeGreaterThan(0);
  });
});

describe('the busts kept their caps (sprint 536)', () => {
  it('crown film and shoulder ledges mark the statues', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'bust-cap') n++; });
      }
    }
    expect(n, 'no bust caps').toBeGreaterThan(0);
  });
});

describe('the board kept its squares (sprint 536)', () => {
  it('clean cells sit in the dust where pieces stood', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'piece-squares') n++; });
      }
    }
    expect(n, 'no piece squares').toBeGreaterThan(0);
  });
});

describe('the globe kept the spins (sprint 536)', () => {
  it('thumb-polish bands mark the waist', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'globe-spin') n++; });
      }
    }
    expect(n, 'no globe spins').toBeGreaterThan(0);
  });
});

describe('the gates kept their tracks (sprint 537)', () => {
  it('rub lines and wheel grease sit under sliding gates', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'gate-track') n++; });
      }
    }
    expect(n, 'no gate tracks').toBeGreaterThan(0);
  });
});

describe('the lift kept its heels (sprint 537)', () => {
  it('heel arcs and finger smears mark the lift leaf', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lift-heels') n++; });
      }
    }
    expect(n, 'no lift heel marks').toBeGreaterThan(0);
  });
});

describe('the shutters kept their chains (sprint 537)', () => {
  it('a polished run marks the haul chain', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'shutter-chain') n++; });
      }
    }
    expect(n, 'no shutter chains').toBeGreaterThan(0);
  });
});

describe('the tea kept its ring (sprint 538)', () => {
  it('tannin tides mark the forgotten cups', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'tea-ring') n++; });
      }
    }
    expect(n, 'no tea rings').toBeGreaterThan(0);
  });
});

describe('the lens kept its veil (sprint 538)', () => {
  it('fog and web film mark the watched glass', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'lens-veil') n++; });
      }
    }
    expect(n, 'no lens veils').toBeGreaterThan(0);
  });
});

describe('the mangle kept the sheet (sprint 538)', () => {
  it('drag streaks mark the feed', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'sheet-drag') n++; });
      }
    }
    expect(n, 'no sheet drags').toBeGreaterThan(0);
  });
});

describe('the tube kept the voice (sprint 545)', () => {
  it('lip polish and breath tarnish mark the speaking tubes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'tube-lip') n++; });
      }
    }
    expect(n, 'no tube lips').toBeGreaterThan(0);
  });
});

describe('the alarm kept the pull (sprint 545)', () => {
  it('finger grease marks the fire alarms', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'alarm-pull') n++; });
      }
    }
    expect(n, 'no alarm pulls').toBeGreaterThan(0);
  });
});

describe('the valve kept the grip (sprint 545)', () => {
  it('rim polish marks the wheels', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'valve-grip') n++; });
      }
    }
    expect(n, 'no valve grips').toBeGreaterThan(0);
  });
});

describe('the panel kept the needle (sprint 546)', () => {
  it('stuck pointers mark the gauge faces', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'needle-ghost') n++; });
      }
    }
    expect(n, 'no needle ghosts').toBeGreaterThan(0);
  });
});

describe('the cable kept its sleeve (sprint 546)', () => {
  it('dust film and web ride the hanging drops', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'cable-sleeve') n++; });
      }
    }
    expect(n, 'no cable sleeves').toBeGreaterThan(0);
  });
});

describe('the key kept its hook (sprint 546)', () => {
  it('tag ghosts hang on the racks', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'key-ghost') n++; });
      }
    }
    expect(n, 'no key ghosts').toBeGreaterThan(0);
  });
});

describe('the vend kept the kicks (sprint 547)', () => {
  it('shoe scuffs and coin wear mark the machines', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'vend-kick') n++; });
      }
    }
    expect(n, 'no vend kicks').toBeGreaterThan(0);
  });
});

describe('the trap kept the spring (sprint 547)', () => {
  it('bait ghosts and blowback mark the traps', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'trap-set') n++; });
      }
    }
    expect(n, 'no trap sets').toBeGreaterThan(0);
  });
});

describe('the tape kept its curl (sprint 547)', () => {
  it('sweep lines mark the dropped measures', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'tape-curl') n++; });
      }
    }
    expect(n, 'no tape curls').toBeGreaterThan(0);
  });
});

describe('the manifold wept (sprint 548)', () => {
  it('flange halos and rust tears mark the pipes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'manifold-rust') n++; });
      }
    }
    expect(n, 'no manifold rust').toBeGreaterThan(0);
  });
});

describe('the crane kept its lane (sprint 548)', () => {
  it('trolley polish marks the overhead beam', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'crane-hook') n++; });
      }
    }
    expect(n, 'no crane lanes').toBeGreaterThan(0);
  });
});

describe('the car kept its veil (sprint 548)', () => {
  it('hem shadow and wheel grime sit under the sheets', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'car-veil') n++; });
      }
    }
    expect(n, 'no car veils').toBeGreaterThan(0);
  });
});

describe('the vent bleached (sprint 549)', () => {
  it('pale cones of leached paint sit under the steam vents', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'steam-bleach') n++; });
      }
    }
    expect(n, 'no steam bleaches').toBeGreaterThan(0);
  });
});

describe('the duct kept its seams (sprint 549)', () => {
  it('grime streaks mark the joints of the runs', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'duct-seam') n++; });
      }
    }
    expect(n, 'no duct seams').toBeGreaterThan(0);
  });
});

describe('the buoy faded (sprint 549)', () => {
  it('sun-bleach and grab marks mark the rings', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'buoy-fade') n++; });
      }
    }
    expect(n, 'no buoy fades').toBeGreaterThan(0);
  });
});

describe('the portrait kept the gaze (sprint 550)', () => {
  it('craquelure webs and eye shine mark the frames', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'gaze-crack') n++; });
      }
    }
    expect(n, 'no gaze cracks').toBeGreaterThan(0);
  });
});

describe('the trophy kept its dust (sprint 550)', () => {
  it('brow film and web spans mark the mounted heads', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'trophy-dust') n++; });
      }
    }
    expect(n, 'no trophy dust').toBeGreaterThan(0);
  });
});

describe('the ship kept its rigging (sprint 550)', () => {
  it('dust sags and grey sails mark the models', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'rigging-dust') n++; });
      }
    }
    expect(n, 'no rigging dust').toBeGreaterThan(0);
  });
});

describe('the crates kept the stencil (sprint 551)', () => {
  it('ghost letters mark the military boxes', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'stencil-ghost') n++; });
      }
    }
    expect(n, 'no stencil ghosts').toBeGreaterThan(0);
  });
});

describe('the welder spat (sprint 551)', () => {
  it('bead tracks and spatter pits lie by the gear', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'weld-spatter') n++; });
      }
    }
    expect(n, 'no weld spatter').toBeGreaterThan(0);
  });
});

describe('the grease kept the box (sprint 551)', () => {
  it('cosmoline film marks the munitions', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'cosmo-grease') n++; });
      }
    }
    expect(n, 'no cosmo grease').toBeGreaterThan(0);
  });
});

describe('the flasks ringed (sprint 552)', () => {
  it('reagent circles mark the chemistry benches', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'flask-ring') n++; });
      }
    }
    expect(n, 'no flask rings').toBeGreaterThan(0);
  });
});

describe('the block kept the cuts (sprint 552)', () => {
  it('cleaver grooves mark the chopping blocks', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'block-cuts') n++; });
      }
    }
    expect(n, 'no block cuts').toBeGreaterThan(0);
  });
});

describe('the torch left its soot (sprint 552)', () => {
  it('black feathers mark the burner walls', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'torch-soot') n++; });
      }
    }
    expect(n, 'no torch soot').toBeGreaterThan(0);
  });
});

describe('the cards curled (sprint 553)', () => {
  it('corner ghosts and tape hinges mark the boards', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'card-curl') n++; });
      }
    }
    expect(n, 'no card curls').toBeGreaterThan(0);
  });
});

describe('the label faded (sprint 553)', () => {
  it('bleached text marks the exhibit labels', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'label-fade') n++; });
      }
    }
    expect(n, 'no label fades').toBeGreaterThan(0);
  });
});

describe('the speakers kept their dust (sprint 553)', () => {
  it('cone rings mark the old electronics', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'speaker-dust') n++; });
      }
    }
    expect(n, 'no speaker dust').toBeGreaterThan(0);
  });
});

describe('the barrel kept the hoop (sprint 554)', () => {
  it('rust bleeds under the bands', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'hoop-rust') n++; });
      }
    }
    expect(n, 'no hoop rust').toBeGreaterThan(0);
  });
});

describe('the bin kept the ash (sprint 554)', () => {
  it('grey crumbs spill where the rim could not hold them', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'ash-ring') n++; });
      }
    }
    expect(n, 'no ash ring').toBeGreaterThan(0);
  });
});

describe('the locker kept its ghosts (sprint 554)', () => {
  it('label shadows and key scratches mark the doors', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'locker-ghost') n++; });
      }
    }
    expect(n, 'no locker ghost').toBeGreaterThan(0);
  });
});

describe('the kettle whistled (sprint 555)', () => {
  it('limescale and heat rings mark the old pots', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'kettle-scale') n++; });
      }
    }
    expect(n, 'no kettle scale').toBeGreaterThan(0);
  });
});

describe('the board kept the cuts (sprint 555)', () => {
  it('knife scoring marks the chopping boards', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'board-scores') n++; });
      }
    }
    expect(n, 'no board scores').toBeGreaterThan(0);
  });
});

describe('the darts missed too (sprint 555)', () => {
  it('a halo of pits rings the dartboards', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'dart-halo') n++; });
      }
    }
    expect(n, 'no dart halo').toBeGreaterThan(0);
  });
});

describe('the jug sweated (sprint 556)', () => {
  it('runnels and a sediment line mark the old glass', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'jug-sweat') n++; });
      }
    }
    expect(n, 'no jug sweat').toBeGreaterThan(0);
  });
});

describe('the shelf kept the folds (sprint 556)', () => {
  it('crease lines and a dragged corner mark the linen stacks', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'fold-pulls') n++; });
      }
    }
    expect(n, 'no fold pulls').toBeGreaterThan(0);
  });
});

describe('the case kept its dust (sprint 556)', () => {
  it('empty ghosts sit where the pieces were taken', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'shelf-dust') n++; });
      }
    }
    expect(n, 'no shelf dust').toBeGreaterThan(0);
  });
});

describe('the till kept the scratch (sprint 557)', () => {
  it('coin rings and drawer rub mark the counters', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'till-scratch') n++; });
      }
    }
    expect(n, 'no till scratch').toBeGreaterThan(0);
  });
});

describe('the screen kept the ghost (sprint 557)', () => {
  it('a burnt frame sits under the dust', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'screen-ghost') n++; });
      }
    }
    expect(n, 'no screen ghost').toBeGreaterThan(0);
  });
});

describe('the bowl boiled over once (sprint 557)', () => {
  it('spatter and a cooked-on ring mark the ovens', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'splat-film') n++; });
      }
    }
    expect(n, 'no splat film').toBeGreaterThan(0);
  });
});

describe('the saw kept its dust (sprint 558)', () => {
  it('a fan thrown sideways marks the work saws', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'sawdust-fan') n++; });
      }
    }
    expect(n, 'no sawdust fan').toBeGreaterThan(0);
  });
});

describe('the wrench kept its prints (sprint 558)', () => {
  it('palm sheen and finger ghosts mark the hand tools', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'oily-grip') n++; });
      }
    }
    expect(n, 'no oily grip').toBeGreaterThan(0);
  });
});

describe('the haft kept its shine (sprint 558)', () => {
  it('seasons of hands burnish the handles', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'haft-shine') n++; });
      }
    }
    expect(n, 'no haft shine').toBeGreaterThan(0);
  });
});

describe('the case kept the journey (sprint 559)', () => {
  it('strap shadows and peeled stickers mark the suitcases', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'strap-scuff') n++; });
      }
    }
    expect(n, 'no strap scuff').toBeGreaterThan(0);
  });
});

describe('the truck kept its toes (sprint 559)', () => {
  it('plate arcs and wheel trails mark the hand trucks', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'toe-rubs') n++; });
      }
    }
    expect(n, 'no toe rubs').toBeGreaterThan(0);
  });
});

describe('the cart kept the mail dust (sprint 559)', () => {
  it('paper film and a torn string tail mark the carts', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => { if (o.name === 'mail-dust') n++; });
      }
    }
    expect(n, 'no mail dust').toBeGreaterThan(0);
  });
});

describe('decals land where they claim (review fixes)', () => {
  it('door dust, jug rings and wall marks stay inside their rooms', () => {
    let found = 0;
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, includeUnderscript: true });
      for (const room of [...mainRooms(route), ...route.underRooms]) {
        if (!room.spec) continue;
        const hw = room.width / 2, hd = room.depth / 2;
        const built = buildRoomMesh(room, room.spec, room.index, 'high');
        built.group.traverse((o) => {
          if (o.name === 'door-drift') {
            found++;
            expect(Math.abs(o.position.x), 'door-drift x out of room').toBeLessThanOrEqual(hw);
            expect(Math.abs(o.position.z), 'door-drift z out of room').toBeLessThanOrEqual(hd);
          }
          if (o.name === 'jug-ring') {
            found++;
            expect(o.position.y, 'jug-ring sank below its surface').toBeGreaterThan(0.005);
          }
          if (o.name === 'frame-rattle' || o.name === 'call-grub') {
            found++;
            expect(Math.abs(o.position.x), `${o.name} mark beyond the wall`).toBeLessThanOrEqual(hw);
            expect(Math.abs(o.position.z), `${o.name} mark beyond the wall`).toBeLessThanOrEqual(hd);
          }
          if (o.name === 'kick-split') {
            found++;
            const wp = new THREE.Vector3();
            o.getWorldPosition(wp);
            expect(wp.y, 'kick-split below the floor').toBeGreaterThan(0.15);
          }
          if (o.name === 'lath-expose') {
            found++;
            expect(['tile', 'corrugated', 'woodPanel', 'brick'],
              `lath-expose on ${room.spec.wallMaterial}`).not.toContain(room.spec.wallMaterial);
          }
        });
      }
    }
    expect(found, 'no decals found to check').toBeGreaterThan(0);
  });
});

describe('the under kept its workings (sprint 604-606)', () => {
  const NEW_UNDER = ['u-mail-sort', 'u-switchboard', 'u-tool-cage', 'u-locker-row', 'u-bunk-nook', 'u-dumbwaiter-bay', 'u-pump-vault', 'u-freight-bay', 'u-burn-room'];

  it('every new under template builds a valid spec', () => {
    for (const id of NEW_UNDER) {
      const t = UNDERSCRIPT_TEMPLATES.find((tp) => tp.id === id);
      expect(t, `template ${id} registered`).toBeTruthy();
      const spec = t!.build(new Rng(`probe-${id}`));
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.props.length, `${id} has no props`).toBeGreaterThan(3);
      expect(spec.hiding.length, `${id} has no hiding spot`).toBeGreaterThan(0);
      const tags = spec.nav.flatMap((n) => n.tags);
      expect(tags).toContain('entry');
      expect(tags).toContain('exit');
    }
  });

  it('the new under templates appear across seeds', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const route = generateRoute({ seedText: seed, difficulty: 'standard', includeUnderscript: true });
      for (const r of route.underRooms) if (NEW_UNDER.includes(r.templateId)) seen.add(r.templateId);
    }
    expect(seen.size, `only ${[...seen].join(',')} appeared`).toBeGreaterThan(3);
  });

  it('new under templates keep hiding spots inside the room', () => {
    for (const id of NEW_UNDER) {
      const spec = UNDERSCRIPT_TEMPLATES.find((tp) => tp.id === id)!.build(new Rng(`hide-${id}`));
      for (const h of spec.hiding) {
        expect(Math.abs(h.x), `${id} hide x`).toBeLessThan(spec.width / 2);
        expect(Math.abs(h.z), `${id} hide z`).toBeLessThan(spec.depth / 2);
      }
    }
  });

  it('new under template props do not embed each other', () => {
    // Under templates never got the propsClash sweep — run it here over the
    // nine new rooms so authored placements stay clean.
    for (const id of NEW_UNDER) {
      const spec = UNDERSCRIPT_TEMPLATES.find((tp) => tp.id === id)!.build(new Rng(`clash-${id}`));
      const floor = spec.props.filter((p) => (p.y ?? 0) < 0.2 && !p.meta?.wallDressing);
      for (let i = 0; i < floor.length; i++) {
        for (let j = i + 1; j < floor.length; j++) {
          const a = floor[i], b = floor[j];
          const ok = CLASH_OK.some(
            ([x, y]) => (x === a.kind && y === b.kind) || (x === b.kind && y === a.kind),
          );
          if (ok) continue;
          expect(
            propsClash(a, b),
            `${id}: ${a.kind}(${a.x},${a.z}) vs ${b.kind}(${b.x},${b.z})`,
          ).toBe(false);
        }
      }
    }
  });
});
