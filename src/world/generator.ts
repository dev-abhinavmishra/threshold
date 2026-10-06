/**
 * Route generator — produces the full 000-100 Meridian route plus the
 * U-000..U-120 Underscript route from a seed. Deterministic: same seed +
 * build + mode → same sequence, doors, loot, encounters.
 *
 * Rooms are placed by port chaining: each room's entry port is rotated and
 * translated onto the previous room's exit port, so the path bends naturally
 * through turns. Overlaps against earlier rooms are rejected by AABB test.
 */
import { SeedStreams } from '../engine/rng';
import {
  aabb, aabbIntersects2D, aabbFromMinMax, v3, type Aabb, type Vec3,
} from '../engine/math';
import type {
  Biome, Door, EntityId, EntityTuning, HidingSpot, NavNode, RoomInstance, ScheduledEncounter, Socket,
} from '../game/types';
import { ENTITY_TUNING, INCOMPATIBLE, DIRECTOR, SAFE_ROOM_TEMPLATES } from '../game/config';
import type { Port, RoomSpec, RoomTemplate, Wall } from './spec';
import { portLocalPos, portOutwardDir, clearDoorLanes, inDoorLane } from './spec';
import { modelCollider } from './modelLibrary';
import { MAIN_TEMPLATES, MAIN_TEMPLATE_MAP } from './templates';
import { UNDERSCRIPT_TEMPLATES } from './underscriptTemplates';
import { milestoneSpec } from '../encounters/milestoneSpecs';
import { ENTITY_TIER, tierMap, planBeats } from './pacing';
import { applyForeshadowing } from './foreshadow';

export interface GenOptions {
  seedText: string;
  difficulty: import('../game/types').Difficulty;
  /** QA mode shrinks the run to exercise all content quickly. */
  shortRun?: boolean;
  includeUnderscript?: boolean;
}

export interface GeneratedRoute {
  rooms: RoomInstance[];
  /** Underscript rooms, if generated. */
  underRooms: RoomInstance[];
  /** Main-floor index of the Underscript entrance door (0 if none). */
  underEntrance: number;
  /** Main-floor index Underscript exit returns to. */
  underReturn: number;
  seedText: string;
  /** Locked-door/key pairs validated during generation. */
  keyPairs: { keyRoom: number; lockRoom: number; lockId: string }[];
  /** Side-branch loot closets (negative indices), parented via branchOf. */
  branchRooms: RoomInstance[];
  /**
   * Corridor segments bridging a milestone room that couldn't place on the
   * port chain: each connector is a straight hallway from prev exit `a`
   * to the milestone's entry `b` (walls/floor/ceiling drawn by builder).
   */
  connectors: { a: Vec3; b: Vec3; elbow?: Vec3 }[];
  validation: string[];
}

interface PlacedRoom {
  spec: RoomSpec;
  origin: Vec3;
  yaw: number;
  aabb: Aabb;
}

const DEG90 = Math.PI / 2;

function yawToFaceEntry(entryOutwardLocal: Vec3, connectorDir: Vec3): number {
  // R(yaw) * entryOutwardLocal = -connectorDir — the port's outward normal
  // must face back along the incoming corridor so it meets the room's edge
  // instead of tunneling through the interior.
  return Math.atan2(-connectorDir.x, -connectorDir.z) - Math.atan2(entryOutwardLocal.x, entryOutwardLocal.z);
}

function rotXZ(x: number, z: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

function localToWorld(origin: Vec3, yaw: number, x: number, y: number, z: number): Vec3 {
  const r = rotXZ(x, z, yaw);
  return v3(origin.x + r.x, y + origin.y, origin.z + r.z);
}

function specWorldAabb(spec: RoomSpec, origin: Vec3, yaw: number): Aabb {
  // corners of local footprint rotated
  const hw = spec.width / 2, hd = spec.depth / 2;
  const cs = [rotXZ(-hw, -hd, yaw), rotXZ(hw, -hd, yaw), rotXZ(-hw, hd, yaw), rotXZ(hw, hd, yaw)];
  const xs = cs.map((c) => c.x + origin.x);
  const zs = cs.map((c) => c.z + origin.z);
  return aabbFromMinMax(
    Math.min(...xs), origin.y, Math.min(...zs),
    Math.max(...xs), origin.y + spec.height, Math.max(...zs),
  );
}

function placeSpec(spec: RoomSpec, connectorPos: Vec3, connectorDir: Vec3): PlacedRoom {
  const yaw = yawToFaceEntry(portOutwardDir(spec.entry) as Vec3, connectorDir);
  const entryLocal = portLocalPos(spec.entry, spec.width, spec.depth);
  const r = rotXZ(entryLocal.x, entryLocal.z, yaw);
  const origin = v3(connectorPos.x - r.x, 0, connectorPos.z - r.z);
  return { spec, origin, yaw, aabb: specWorldAabb(spec, origin, yaw) };
}

/** Port's world position + outward dir after placement. */
function portWorld(placed: PlacedRoom, port: Port): { pos: Vec3; dir: Vec3 } {
  const l = portLocalPos(port, placed.spec.width, placed.spec.depth);
  const r = rotXZ(l.x, l.z, placed.yaw);
  const dLocal = portOutwardDir(port);
  const d = rotXZ(dLocal.x, dLocal.z, placed.yaw);
  return { pos: v3(placed.origin.x + r.x, 0, placed.origin.z + r.z), dir: v3(d.x, 0, d.z) };
}

interface CandidatePick {
  template: RoomTemplate;
  spec: RoomSpec;
}

function pickSpec(
  candidates: RoomTemplate[],
  rng: import('../engine/rng').Rng,
  roomIndex: number,
  biomeBias: Biome | null,
): CandidatePick[] {
  // Produce a few weighted candidates to try in order.
  const eligible = candidates.filter(() => true);
  const picked: CandidatePick[] = [];
  const pool = eligible.slice();
  let guard = 0;
  while (pool.length && picked.length < 6 && guard++ < 40) {
    const t = rng.weighted(pool, (tp) => {
      // build to inspect weight/minRoom — cache not worth it; specs are small
      const probe = tp.build(rng.fork(picked.length * 7919 + roomIndex));
      if (probe.weight <= 0 || roomIndex < probe.minRoom) return 0;
      let w = probe.weight;
      if (biomeBias && probe.biome === biomeBias) w *= 2.2;
      // Corridors are connective tissue, not destinations — after the
      // tutorial stretch (0–9, corridor-biased) taper their draw so
      // furnished biomes dominate the mid/late run.
      if (probe.biome === 'corridor' && roomIndex > 9 && biomeBias !== 'corridor') w *= 0.4;
      return w;
    });
    const spec = t.build(rng.fork(roomIndex * 131 + picked.length));
    if (spec.weight <= 0 || roomIndex < spec.minRoom) {
      pool.splice(pool.indexOf(t), 1);
      continue;
    }
    picked.push({ template: t, spec });
    pool.splice(pool.indexOf(t), 1);
  }
  return picked;
}

/** Convert placed spec to a RoomInstance (world-space data, no meshes). */
function instantiate(index: number, label: string, placed: PlacedRoom, isMainRouteExit: boolean): RoomInstance {
  const { spec, origin, yaw } = placed;
  // Ghost-collider kinds (archways, transoms, wall dressing) can never
  // reach a door rect — exempt them from the center-based spec cull.
  const isGhost = (kind: string) => {
    const c = modelCollider(kind);
    return c !== null && c[0] === 0;
  };
  clearDoorLanes(spec, isGhost);
  // Hiding spots render no mesh of their own — each needs furniture at its
  // position to hide in/behind. Spawn the declared propKind when no prop is
  // already there. Spots that survived clearDoorLanes are outside door lanes,
  // so the spawned furniture is too.
  for (const h of spec.hiding) {
    const hasFurniture = spec.props.some(
      (p) => Math.hypot(p.x - h.x, p.z - h.z) <= 1.3 && (p.y ?? 0) < 0.2,
    );
    if (!hasFurniture) spec.props.push({ kind: h.propKind, x: h.x, z: h.z, yaw: h.yaw });
  }
  const colliders: Aabb[] = spec.colliders
    .filter((c) => !c.losOnly)
    .map((c) => {
      const p = localToWorld(origin, yaw, c.x, 0, c.z);
      // rotate dims by quarter turns only if axis aligned — walls always are
      const q = Math.abs(((yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
      const w = q < 0.01 ? (Math.round(yaw / (Math.PI / 2)) % 2 === 0 ? c.w : c.d) : Math.max(c.w, c.d);
      const d = q < 0.01 ? (Math.round(yaw / (Math.PI / 2)) % 2 === 0 ? c.d : c.w) : Math.max(c.w, c.d);
      const y0 = c.y ?? 0;
      return aabb(p.x, origin.y + y0 + c.h / 2, p.z, w / 2, c.h / 2, d / 2);
    });

  // LOS blockers = all colliders + losOnly (transparent for movement)
  const losBlockers: Aabb[] = [...colliders];
  for (const c of spec.colliders.filter((c) => c.losOnly)) {
    const p = localToWorld(origin, yaw, c.x, 0, c.z);
    const w = Math.round(yaw / (Math.PI / 2)) % 2 === 0 ? c.w : c.d;
    const d = Math.round(yaw / (Math.PI / 2)) % 2 === 0 ? c.d : c.w;
    losBlockers.push(aabb(p.x, origin.y + (c.y ?? 0) + c.h / 2, p.z, w / 2, c.h / 2, d / 2));
  }

  const navNodes: NavNode[] = spec.nav.map((n) => ({
    id: `${index}:${n.id}`,
    pos: localToWorld(origin, yaw, n.x, n.y ?? 0, n.z),
    links: [], // linked after placement
    tags: n.tags,
  }));

  const entryW = portWorld(placed, spec.entry);
  const exitW = portWorld(placed, spec.exits[0]);

  const doors: Door[] = [];
  const entryDoor: Door = {
    id: `door-${index}-in`,
    roomIndex: index,
    isMainRoute: true,
    pos: v3(entryW.pos.x, 0, entryW.pos.z),
    yaw: yaw + (spec.entry.wall === 's' || spec.entry.wall === 'n' ? 0 : DEG90),
    locked: false,
    label: label,
    openT: index === 0 ? 1 : 0,
    opening: index === 0,
  };
  if (index > 0) doors.push(entryDoor);

  const hidingSpots: HidingSpot[] = spec.hiding.map((h, i) => {
    const center = localToWorld(origin, yaw, h.x, 0, h.z);
    const dYaw = yaw + h.yaw;
    const dir = { x: Math.sin(dYaw), z: Math.cos(dYaw) };
    return {
      id: `hide-${index}-${i}`,
      kind: h.kind,
      volume: aabb(center.x, 1.0, center.z, 0.55, 1.05, 0.55),
      viewPos: v3(center.x, 1.15, center.z),
      viewYaw: dYaw,
      exitPos: v3(center.x + dir.x * 1.0, 0, center.z + dir.z * 1.0),
      roomIndex: index,
      trapClues: [],
    };
  });

  const sockets: Socket[] = spec.sockets.map((s) => {
    const p = localToWorld(origin, yaw, s.x, s.y ?? 0, s.z);
    return { kind: s.kind, pos: p, yaw: yaw + (s.yaw ?? 0), filled: false, meta: s.meta ?? {} };
  });
  // Authored snare props arm themselves — the paper seal on the floor is a
  // live tripwire, not set dressing (the hazard field reads these sockets).
  for (const pr of spec.props) {
    if (pr.kind === 'snare') {
      const p = localToWorld(origin, yaw, pr.x, pr.y ?? 0, pr.z);
      // Old sign: ~6% of wires were sprung before you arrived.
      const spent = ((p.x * 11 + p.z * 3 + index * 17) % 97) < 6;
      sockets.push({ kind: 'hazard', pos: p, yaw: yaw + (pr.yaw ?? 0), filled: false,
        meta: spent ? { hazard: 'snare', spent: true } : { hazard: 'snare' } });
    }
    // Steam fittings are live pressure lines — they blast on a seeded
    // cycle until somebody bleeds the line.
    if (pr.kind === 'steamVent') {
      const p = localToWorld(origin, yaw, pr.x, pr.y ?? 0, pr.z);
      const spent = ((p.x * 11 + p.z * 3 + index * 17) % 97) < 6;
      sockets.push({ kind: 'hazard', pos: p, yaw: yaw + (pr.yaw ?? 0), filled: false,
        meta: spent ? { hazard: 'steam', spent: true } : { hazard: 'steam' } });
    }
  }

  const safeZones = spec.safeZones.map((z) => {
    const p = localToWorld(origin, yaw, z.x, 0, z.z);
    const swap = Math.round(yaw / (Math.PI / 2)) % 2 !== 0;
    return aabb(p.x, 1.0, p.z, (swap ? z.d : z.w) / 2, 1.2, (swap ? z.w : z.d) / 2);
  });

  void isMainRouteExit;
  return {
    index, label,
    templateId: spec.templateId,
    biome: spec.biome,
    origin, yaw,
    width: spec.width, depth: spec.depth, height: spec.height,
    colliders,
    losBlockers,
    doors,
    hidingSpots,
    navNodes,
    sockets,
    entryPos: entryW.pos,
    exitPos: exitW.pos,
    entryDir: v3(-entryW.dir.x, 0, -entryW.dir.z),
    exitDir: exitW.dir,
    lightGroup: 'main',
    darkRoom: false,
    authored: !!spec.special,
    safeZones,
    scheduled: [],
    floorMaterial: spec.floorMaterial,
    spec,
  };
}


/* ==================== ROUTE PLAN ==================== */

interface PlanEntry {
  /** template id for special/milestone rooms, else null = procedural pick */
  fixed?: string;
  biomeBias?: Biome;
  special?: string;
  label: string;
}

function mainFloorPlan(shortRun: boolean): PlanEntry[] {
  // Full 101-entry route. shortRun compresses to a QA-length route that still
  // hits every milestone (used by tests + QA seed).
  const plan: PlanEntry[] = [];
  const push = (label: string, opts: Partial<PlanEntry> = {}) =>
    plan.push({ label, ...opts });

  const n = (i: number) => String(i).padStart(3, '0');

  if (shortRun) {
    push('000', { fixed: 'ms-lobby' });
    push('001'); push('002'); push('003'); push('004'); push('005');
    push('010', { biomeBias: 'corridor' });
    push('012');
    push('018', { fixed: 'ms-baggage' });
    push('020', { biomeBias: 'records' });
    push('030', { fixed: 'ms-chase1' });
    push('035');
    push('040', { fixed: 'special-clinic' });
    push('049', { fixed: 'ms-index-ante' });
    push('050', { fixed: 'ms-index' });
    push('051', { fixed: 'ms-custodian' });
    push('055'); push('060', { fixed: 'ms-under-entrance' });
    push('063'); push('070', { fixed: 'special-conservatory' });
    push('075', { fixed: 'ms-lens-hall' });
    push('080', { fixed: 'ms-chase2' });
    push('085', { biomeBias: 'unlit' }); push('092', { biomeBias: 'unlit' });
    push('099', { fixed: 'ms-final-ante' });
    push('100', { fixed: 'ms-engine' });
    return plan;
  }

  for (let i = 0; i <= 100; i++) {
    const label = n(i);
    if (i === 0) { push(label, { fixed: 'ms-lobby' }); continue; }
    if (i <= 9) { push(label, { biomeBias: i <= 4 ? 'corridor' : undefined }); continue; }
    if (i <= 19) { push(label); continue; }
    if (i === 25) { push(label, { fixed: 'ms-baggage' }); continue; }
    if (i <= 29) { push(label); continue; }
    if (i === 30) { push(label, { fixed: 'ms-chase1' }); continue; }
    if (i <= 39) { push(label); continue; }
    if (i === 40) { push(label, { fixed: 'special-clinic' }); continue; }
    if (i <= 48) { push(label, { biomeBias: 'records' }); continue; }
    if (i === 49) { push(label, { fixed: 'ms-index-ante' }); continue; }
    if (i === 50) { push(label, { fixed: 'ms-index' }); continue; }
    if (i === 51) { push(label, { fixed: 'ms-decompress' }); continue; }
    if (i === 52) { push(label, { fixed: 'ms-custodian' }); continue; }
    if (i <= 59) { push(label); continue; }
    if (i === 60) { push(label); continue; }
    if (i === 61) { push(label, { fixed: 'ms-under-entrance' }); continue; }
    if (i <= 69) { push(label, { biomeBias: i >= 63 ? 'maintenance' : undefined }); continue; }
    if (i === 70) { push(label, { fixed: 'special-conservatory' }); continue; }
    if (i <= 74) { push(label); continue; }
    if (i === 75) { push(label, { fixed: 'ms-lens-hall' }); continue; }
    if (i <= 79) { push(label); continue; }
    if (i === 80) { push(label, { fixed: 'ms-chase2' }); continue; }
    if (i === 85) { push(label, { fixed: 'ms-wake' }); continue; }
    if (i <= 89) { push(label); continue; }
    if (i <= 98) { push(label, { biomeBias: 'unlit' }); continue; }
    if (i === 99) { push(label, { fixed: 'ms-final-ante' }); continue; }
    push('100', { fixed: 'ms-engine' });
  }
  return plan;
}

/* ==================== GENERATION ==================== */

export function generateRoute(opts: GenOptions): GeneratedRoute {
  const streams = new SeedStreams(opts.seedText);
  const structRng = streams.stream('structure');
  const dressRng = streams.stream('dressing');
  void dressRng;
  const encRng = streams.stream('encounter');
  const lootRng = streams.stream('loot');

  const plan = mainFloorPlan(!!opts.shortRun);
  const placed: PlacedRoom[] = [];
  const rooms: RoomInstance[] = [];
  const validation: string[] = [];

  // Connector starts at origin facing +Z.
  let connPos = v3(0, 0, 0);
  let connDir = v3(0, 0, 1);
  const connectors: GeneratedRoute['connectors'] = [];

  const closetTemplate = MAIN_TEMPLATE_MAP.get('corr-closet-branch')!;

  for (let i = 0; i < plan.length; i++) {
    const entry = plan[i];
    let placedRoom: PlacedRoom | null = null;

    if (entry.fixed) {
      const spec = milestoneSpec(entry.fixed, streams.roomStream('structure', i), entry.label)
        ?? MAIN_TEMPLATE_MAP.get(entry.fixed)?.build(streams.roomStream('structure', i));
      if (!spec) throw new Error(`Unknown fixed room ${entry.fixed}`);
      placedRoom = tryPlaceWithJitters(spec, connPos, connDir, placed);
      if (!placedRoom) throw new Error(`Milestone ${entry.fixed} unplaceable at ${i}`);
    } else {
      const candidates = pickSpec(MAIN_TEMPLATES, structRng, i, entry.biomeBias ?? biomeBiasFor(i));
      // Corridor-flood guard: a corridor spec fits almost anywhere, so once
      // corridors start landing back-to-back the chain is stuck in a pocket
      // where they short-circuit every furnished room drawn after them. Keep
      // the normal draw order while the run is healthy; after 2+ consecutive
      // corridors, try furnished candidates first — and if none place, draw
      // one more round before conceding the slot.
      let consec = 0;
      for (let k = rooms.length - 1; k >= 0; k--) {
        if (rooms[k].index < 0) continue;          // branch closets ride the tail
        if (rooms[k].biome === 'corridor') consec++; else break;
      }
      const flooding = consec >= 2;
      const ordered = flooding
        ? [...candidates].sort((a, b) => Number(a.spec.biome === 'corridor') - Number(b.spec.biome === 'corridor'))
        : candidates;
      for (const cand of ordered) {
        placedRoom = tryPlace(cand.spec, connPos, connDir, placed)
          ?? jitteredPlace(cand.spec, connPos, connDir, placed);
        if (placedRoom) break;
      }
      if (!placedRoom && flooding) {
        const extra = pickSpec(MAIN_TEMPLATES, structRng, i + 1000, entry.biomeBias ?? biomeBiasFor(i));
        for (const cand of extra) {
          if (cand.spec.biome === 'corridor') continue;
          placedRoom = tryPlace(cand.spec, connPos, connDir, placed)
            ?? jitteredPlace(cand.spec, connPos, connDir, placed);
          if (placedRoom) break;
        }
      }
      if (!placedRoom) {
        // Guaranteed fit: corridor fallbacks. When lateral drift is near the
        // map bound (or the chain is backtracking south), prefer a turn
        // corridor so the chain bends back along the spine instead of
        // marching out of bounds and flooding with corridors. Also fires when
        // the connector is already outside the x-bound and marching parallel
        // to it — otherwise forced corridors escape sideways forever while
        // every furnished room is bound-rejected.
        const outX = Math.abs(connPos.x) > 70;
        const turning = outX || (Math.abs(connPos.x) > 40 && Math.abs(connDir.x) > 0.7) || connDir.z < -0.7;
        const fallbacks: RoomSpec[] = [];
        if (turning) {
          const lturn = MAIN_TEMPLATE_MAP.get('corr-l-turn')!.build(streams.roomStream('structure', i));
          const mirrored = { ...lturn,
            exits: lturn.exits.map((p): Port => ({ ...p, wall: (p.wall === 'e' ? 'w' : p.wall === 'w' ? 'e' : p.wall) as Wall, offset: (p.wall === 'n' || p.wall === 's') ? -p.offset : p.offset })),
            nav: lturn.nav.map((n) => ({ ...n, x: -n.x })),
          };
          // 'e' exit maps to world dir (connDir.z, -connDir.x); 'w' its opposite.
          if (outX) {
            // Steer back inside: prefer the variant whose exit points toward
            // the spine (x sign opposite to the connector's).
            const exitX = (sp: RoomSpec) => portWorld(placeSpec(sp, connPos, connDir), sp.exits[0]).dir.x;
            const want = -Math.sign(connPos.x);
            fallbacks.push(...(exitX(lturn) * want > 0 ? [lturn, mirrored] : [mirrored, lturn]));
          } else {
            // Prefer the turn that keeps northward progress.
            if (-connDir.x > 0) fallbacks.push(lturn, mirrored); else fallbacks.push(mirrored, lturn);
          }
        }
        fallbacks.push(MAIN_TEMPLATE_MAP.get('corr-straight')!.build(streams.roomStream('structure', i)));
        for (const fb of fallbacks) {
          placedRoom = jitteredPlace(fb, connPos, connDir, placed);
          if (placedRoom) break;
        }
        if (!placedRoom) {
          // Force-place the preferred fallback (the turn, when turning) — a
          // forced straight would keep marching out of bounds forever.
          const pos = v3(connPos.x + connDir.x * 2, 0, connPos.z + connDir.z * 2);
          pendingConnector = { a: v3(connPos.x, 0, connPos.z), b: pos };
          placedRoom = tryPlace(fallbacks[0], pos, connDir, placed, true)!;
        }
      }
    }

    const conn = pendingConnector;
    if (conn) {
      connectors.push(conn);
      pendingConnector = null;
    }
    placed.push(placedRoom);
    const room = instantiate(i, entry.label, placedRoom, true);
    if (conn) addConnectorColliders(room, conn);
    rooms.push(room);

    // Dressing & dark roll
    const dr = streams.roomStream('dressing', i);
    if (dr.float() < placedRoom.spec.darkChance && i > 8) room.darkRoom = true;

    // Next connector = this room's primary exit.
    const pw = portWorld(placedRoom, placedRoom.spec.exits[0]);
    connPos = pw.pos;
    connDir = pw.dir;

    // Optional branch closet on secondary exits — adds a small loot room.
    for (let e = 1; e < placedRoom.spec.exits.length; e++) {
      const bw = portWorld(placedRoom, placedRoom.spec.exits[e]);
      const bspec = closetTemplate.build(streams.roomStream('dressing', i * 31 + e));
      // closet uses its entry port on the branch wall
      const bp = tryPlace(bspec, bw.pos, bw.dir, placed);
      if (bp) {
        // Branch rooms are generated lazily — record a side door on the parent
        // and mark the socket as a branch loot closet reachable now.
        placed.push(bp);
        const broom = instantiate(-1000 - i * 10 - e, `B${entry.label}`, bp, false);
        broom.branchOf = i;
        // Toll doors: some branch closets hold out for imprints — never on
        // the main route, so they can never block forward progress.
        const rng = streams.roomStream('loot', i * 61 + e);
        const toll = rng.bool(0.35);
        const deep = !toll && rng.bool(0.3);
        room.doors.push({
          id: `door-${i}-b${e}`, roomIndex: i, isMainRoute: false,
          pos: bw.pos, yaw: Math.atan2(bw.dir.x, bw.dir.z),
          locked: toll, lockId: toll ? 'toll' : undefined,
          deep, label: '—', openT: 0, opening: false,
        });
        rooms.push(broom); // appended out of order; streamer indexes by .index — keep sorted later
      }
    }
  }

  // Sort: main route indices 0..N in order, branch rooms (negative) attached after their parent.
  const mainRooms = rooms.filter((r) => r.index >= 0).sort((a, b) => a.index - b.index);
  const branchRooms = rooms.filter((r) => r.index < 0);

  // Fill sockets: loot, keys for locks, lore.
  const keyPairs = fillSockets(mainRooms, branchRooms, lootRng, opts);

  // Hiding density: a lethal-corridor run is only fair if hiding exists nearby.
  ensureHidingDensity(mainRooms, dressRng);

  // Encounter scheduling via director rules.
  scheduleEncounters(mainRooms, encRng, opts, planBeats(streams.stream('pacing'), mainRooms));
  applyForeshadowing(mainRooms, streams.stream('scare'));

  // The forged page — a book near a forger of doors can be rewritten. A
  // ledger within sight of a redactor's door (inside the book's own
  // +10 read window) omits that filing — the first lie the books tell,
  // legible only in retrospect (one page of still-wet ink). Stamped here,
  // after every scheduled pass has settled.
  for (const room of mainRooms) {
    const sock = room.sockets.find((s) => s.meta.register);
    if (!sock) continue;
    const cover = mainRooms.find((rx) => rx.index > room.index && rx.index <= room.index + 10
      && rx.scheduled.some((s) => s.entity === 'redactor'))?.index;
    if (cover !== undefined) { sock.meta.forged = true; sock.meta.forgedCover = cover; }
  }

  // Underscript
  let underRooms: RoomInstance[] = [];
  let underEntrance = 0;
  let underReturn = 0;
  if (opts.includeUnderscript !== false) {
    underEntrance = opts.shortRun ? 16 : 61; // ms-under-entrance room index in plan
    underReturn = opts.shortRun ? 20 : 70;
    underRooms = generateUnderscript(streams, opts);
    if (underRooms.length) {
      // Under caches — the subfloor keeps a little, sparser and meaner than
      // upstairs. No door locks down here; the under has its own pacing.
      const underMul = { learning: 1.4, standard: 1, hard: 0.7, qa: 1 }[opts.difficulty];
      const underTable: { item: string; w: number }[] = [
        { item: 'imprints', w: 46 }, { item: 'bandage', w: 7 }, { item: 'tonic', w: 7 },
        { item: 'sparkFlash', w: 10 }, { item: 'latchpick', w: 8 }, { item: 'feltWrap', w: 5 },
        { item: 'chalkSpool', w: 4 }, { item: 'wardSeal', w: 4 }, { item: 'windAlarm', w: 6 },
        { item: 'lore', w: 6 },
      ];
      for (const room of underRooms) {
        if (room.index % 20 === 0) continue; // landings stay safe
        for (const s of room.sockets) {
          if (s.filled || s.kind === 'key' || s.meta.broker !== undefined || s.meta.shop !== undefined) continue;
          if (s.kind !== 'drawer' && s.kind !== 'loot') continue;
          if (!lootRng.bool(0.38 * underMul)) continue;
          s.filled = true;
          const roll = lootRng.weighted(underTable, (t) => t.w).item;
          if (roll === 'imprints') s.meta = { contains: 'imprints', amount: lootRng.int(2, 9) };
          else if (roll === 'lore') s.meta = { contains: 'lore', doc: `doc-u${room.index}` };
          else s.meta = { contains: roll };
          if (s.kind === 'drawer' && lootRng.bool(0.25)) s.meta.drawerLocked = true;
          // Wired drawers — the latch bites the unwary. Unlocked ones only;
          // the tell rides the prompt ('the latch looks forced').
          if (s.kind === 'drawer' && !s.meta.drawerLocked && lootRng.bool(0.1)) s.meta.wired = true;
        }
      }
      // Under vending — rarer, hungrier.
      const vendItemsU = ['bandage', 'tonic', 'sparkFlash', 'latchpick', 'windAlarm', 'wardSeal', 'doorChock', 'doorChock'];
      for (const room of underRooms) {
        if (room.index % 20 === 0 || !room.spec || !lootRng.bool(0.12)) continue;
        const lx = room.spec.width / 2 - 1.1;
        const lz = lootRng.range(-room.spec.depth / 3, room.spec.depth / 3);
        const p = localToWorld(room.origin, room.yaw, lx, 0, lz);
        room.sockets.push({
          kind: 'loot', pos: v3(p.x, 0.7, p.z), yaw: room.yaw - Math.PI / 2, filled: true,
          meta: { vend: true, price: lootRng.int(5, 11), vendItem: vendItemsU[lootRng.int(0, vendItemsU.length - 1)] },
        });
        // The machine is real now — vend sockets hang on a milled unit
        // (skipped where a door lane claims the footprint).
        if (!inDoorLane(room.spec, lx + 0.45, lz)) {
          room.spec.props.push({ kind: 'vendingUnit', x: lx + 0.45, z: lz, yaw: -Math.PI / 2 });
        }
      }
      // The work-order book — the under's fourth paper. Where the books
      // above answer threats and staff, the order sheet answers CARGO:
      // which rooms still hold unclaimed stock (and where the egress is
      // stamped). Priced in marginalia — the crew's own currency.
      const WORK_ORDER_ROOMS = new Set([
        'u-office-row', 'u-open-office', 'u-print-shop', 'u-server',
        'u-break', 'u-records-cage', 'u-lobby',
      ]);
      const WORK_ORDER_SURF = new Set([
        'printerRow', 'breakTable', 'schoolDesk', 'filing', 'keyCabinet',
        'machineBox', 'typewriter', 'counter', 'cubicle', 'printer',
      ]);
      for (const room of underRooms) {
        if (!WORK_ORDER_ROOMS.has(room.templateId) || !room.spec || !lootRng.bool(0.12)) continue;
        const surf = room.spec.props.find((p) => WORK_ORDER_SURF.has(p.kind));
        if (!surf) continue;
        const wp = localToWorld(room.origin, room.yaw, surf.x, 0, surf.z);
        const toW = { x: room.origin.x - wp.x, z: room.origin.z - wp.z };
        const twL = Math.hypot(toW.x, toW.z) || 1;
        room.sockets.push({
          kind: 'loot',
          pos: v3(wp.x + (toW.x / twL) * 0.5, 0.9, wp.z + (toW.z / twL) * 0.5),
          yaw: 0, filled: true,
          meta: { workOrder: true, price: lootRng.int(3, 8) },
        });
      }
      const entranceRoom = mainRooms.find((r) => r.templateId === 'ms-under-entrance');
      const exitRoom = underRooms[underRooms.length - 1];
      const returnRoom = mainRooms[Math.min(underReturn, mainRooms.length - 1)];
      if (entranceRoom && exitRoom && returnRoom) {
        entranceRoom.sockets.push({ kind: 'key', pos: v3(entranceRoom.entryPos.x, 0, entranceRoom.entryPos.z), yaw: 0, filled: true, meta: { underEntrance: true } });
        exitRoom.sockets.push({ kind: 'key', pos: v3(exitRoom.exitPos.x, 0, exitRoom.exitPos.z), yaw: 0, filled: true, meta: { underExit: true, returnTo: returnRoom.index } });
      }
    }
  }

  return {
    rooms: mainRooms,
    underRooms,
    underEntrance,
    underReturn,
    connectors,
    seedText: opts.seedText,
    keyPairs,
    branchRooms,
    validation,
  };
}

function biomeBiasFor(i: number): Biome | null {
  if (i <= 4) return 'corridor';
  if (i <= 14) return 'guest';
  if (i <= 28) return 'records';
  if (i <= 48) return null;
  if (i <= 62) return null;
  if (i <= 72) return 'maintenance';
  if (i <= 88) return null;
  return 'unlit';
}

/**
 * Place a milestone room without overlapping: try the connector position,
 * then lateral/forward jitters. Forced overlap is a last resort and avoided
 * unless every jitter fails.
 */
function tryPlaceWithJitters(spec: RoomSpec, connPos: Vec3, connDir: Vec3, placed: PlacedRoom[], boundC = v3(0, 0, 0)): PlacedRoom | null {
  const p = jitteredPlace(spec, connPos, connDir, placed, boundC);
  if (p) return p;
  // Long forward scan before the forced fallback — big milestone rooms can
  // need more runway than jitteredPlace's 30m reach.
  for (const fz of [34, 40, 48, 56, 64, 72, 80]) {
    const pos = v3(connPos.x + connDir.x * fz, 0, connPos.z + connDir.z * fz);
    const p2 = tryPlace(spec, pos, connDir, placed, false, boundC);
    if (p2) {
      pendingConnector = { a: v3(connPos.x, 0, connPos.z), b: pos };
      return p2;
    }
  }
  // Last resort: forced placement 2m forward (still bridge it visually).
  const pos = v3(connPos.x + connDir.x * 2, 0, connPos.z + connDir.z * 2);
  pendingConnector = { a: v3(connPos.x, 0, connPos.z), b: pos };
  return tryPlace(spec, pos, connDir, placed, true, boundC);
}

/** Jittered placement without the forced-overlap fallback (null when nothing fits). */
function jitteredPlace(spec: RoomSpec, connPos: Vec3, connDir: Vec3, placed: PlacedRoom[], boundC = v3(0, 0, 0)): PlacedRoom | null {
  // 1) Extend the connector forward: the stretch between prev exit and the
  //    milestone's entry becomes a drawn gap corridor (straight, drawable).
  for (const fz of [0, 2, 4, 6, 8, 10, 14, 18, 24, 30]) {
    const pos = v3(connPos.x + connDir.x * fz, 0, connPos.z + connDir.z * fz);
    const p = tryPlace(spec, pos, connDir, placed, false, boundC);
    if (p) {
      if (fz > 0) pendingConnector = { a: v3(connPos.x, 0, connPos.z), b: pos };
      return p;
    }
  }
  // 2) L-shaped sidestep: forward a bit, then laterally clear of whatever
  //    blocks the lane. Corridor is two axis-aligned segments.
  const perp = v3(-connDir.z, 0, connDir.x);
  const half = Math.max(spec.width, spec.depth) / 2;
  for (const f of [0, 1.5, 3, 5, 8, 12, 18]) {
    for (const side of [1, -1]) {
      for (const extra of [0, 3, 6, 10, 16, 24, 32, 40]) {
        const off = half + 2.5 + extra;
        const elbow = v3(connPos.x + connDir.x * f, 0, connPos.z + connDir.z * f);
        const pos = v3(elbow.x + perp.x * side * off, 0, elbow.z + perp.z * side * off);
        const p = tryPlace(spec, pos, connDir, placed, false, boundC);
        if (p) {
          pendingConnector = { a: v3(connPos.x, 0, connPos.z), elbow, b: pos };
          return p;
        }
      }
    }
  }
  // 3) Far-forward scan before giving up: a long drawn corridor into free space.
  for (const fz of [34, 42, 50, 60, 70, 80]) {
    const pos = v3(connPos.x + connDir.x * fz, 0, connPos.z + connDir.z * fz);
    const p = tryPlace(spec, pos, connDir, placed, false, boundC);
    if (p) {
      pendingConnector = { a: v3(connPos.x, 0, connPos.z), b: pos };
      return p;
    }
  }
  return null;
}

let pendingConnector: { a: Vec3; b: Vec3; elbow?: Vec3 } | null = null;

/** Corridor side-wall colliders for a gap connector (also block entity LOS). */
function addConnectorColliders(room: RoomInstance, conn: { a: Vec3; b: Vec3; elbow?: Vec3 }): void {
  room.connectorIn = { a: conn.a, b: conn.b, elbow: conn.elbow };
  const segs: [Vec3, Vec3][] = conn.elbow
    ? [[conn.a, conn.elbow], [conn.elbow, conn.b]]
    : [[conn.a, conn.b]];
  for (const [sa, sb] of segs) {
    const dx = sb.x - sa.x;
    const dz = sb.z - sa.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const ux = dx / len, uz = dz / len;
    const px = -uz, pz = ux;
    for (const side of [-1, 1]) {
      const cx = (sa.x + sb.x) / 2 + px * side * 1.3;
      const cz = (sa.z + sb.z) / 2 + pz * side * 1.3;
      const w = Math.abs(ux) > 0.5 ? len : 0.3;
      const d = Math.abs(ux) > 0.5 ? 0.3 : len;
      const wallBox: Aabb = {
        minX: cx - w / 2, minY: 0, minZ: cz - d / 2,
        maxX: cx + w / 2, maxY: 3, maxZ: cz + d / 2,
      };
      room.colliders.push(wallBox);
      room.losBlockers.push(wallBox);
    }
  }
}

function tryPlace(spec: RoomSpec, connPos: Vec3, connDir: Vec3, placed: PlacedRoom[], force = false, boundC = v3(0, 0, 0)): PlacedRoom | null {
  const p = placeSpec(spec, connPos, connDir);
  if (force) return p;
  const shrink = 0.5;
  const eps = 0.05; // float-edge tolerance for non-adjacent rooms
  for (const q of placed) {
    const adjacent = q === placed[placed.length - 1];
    const s = adjacent ? shrink : eps;
    const a: Aabb = { ...p.aabb, minX: p.aabb.minX + s, maxX: p.aabb.maxX - s, minZ: p.aabb.minZ + s, maxZ: p.aabb.maxZ - s };
    const b: Aabb = { ...q.aabb, minX: q.aabb.minX + s, maxX: q.aabb.maxX - s, minZ: q.aabb.minZ + s, maxZ: q.aabb.maxZ - s };
    if (aabbIntersects2D(a, b)) {
      // Allow touching the immediately previous room (shared boundary wall).
      if (adjacent) {
        // Only OK if intersection is a thin boundary overlap.
        const ix = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const iz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (ix < 0.8 || iz < 0.8) continue;
      }
      return null;
    }
  }
  // Keep the route bounded: reject extreme lateral drift so the map stays sane.
  const c = p.aabb;
  const cx = (c.minX + c.maxX) / 2;
  const cz = (c.minZ + c.maxZ) / 2;
  if (Math.abs(cx - boundC.x) > 90 || Math.abs(cz - boundC.z) > 900) return null;
  return p;
}

/* ==================== SOCKET FILL ==================== */

function fillSockets(rooms: RoomInstance[], branches: RoomInstance[], lootRng: import('../engine/rng').Rng, opts: GenOptions): GeneratedRoute['keyPairs'] {
  const keyPairs: GeneratedRoute['keyPairs'] = [];
  const resourceMul = { learning: 1.4, standard: 1, hard: 0.7, qa: 1 }[opts.difficulty];

  // Locks: some normal rooms have locked exit doors; key socket filled in the
  // same or previous room (never beyond — guarantees key-before-lock).
  for (const room of rooms) {
    if (room.index < 8 || room.authored || room.biome === 'safe') continue;
    if (lootRng.bool(0.18)) {
      const door = room.doors.find((d) => d.isMainRoute);
      if (!door) continue;
      const lockId = `lock-${room.index}`;
      door.locked = true;
      door.lockId = lockId;
      // Put a key socket in an earlier room — strictly key-before-lock.
      // Prefer a free socket within the previous 4 rooms; otherwise synth one.
      const lo = Math.max(2, room.index - 4);
      let hostRoom: RoomInstance | undefined;
      let socket: Socket | undefined;
      for (let i = room.index - 1; i >= lo; i--) {
        const cand = rooms[i];
        if (!cand) continue;
        socket = cand.sockets.find((s) => !s.filled && (s.kind === 'drawer' || s.kind === 'loot' || s.kind === 'key'));
        if (socket) { hostRoom = cand; break; }
      }
      if (!hostRoom || !socket) {
        hostRoom = rooms[room.index - 1];
        socket = { kind: 'key', pos: v3(hostRoom.origin.x, 0.8, hostRoom.origin.z), yaw: 0, filled: false, meta: {} };
        hostRoom.sockets.push(socket);
      }
      socket.filled = true;
      socket.meta = { ...socket.meta, contains: 'doorKey', lockId };
      keyPairs.push({ keyRoom: hostRoom.index, lockRoom: room.index, lockId });
    }
  }

  // Loot/imprints/items.
  const itemTable: { item: string; w: number }[] = [
    { item: 'imprints', w: 42 }, { item: 'bandage', w: 9 }, { item: 'tonic', w: 8 },
    { item: 'sparkFlash', w: 6 }, { item: 'latchpick', w: 6 }, { item: 'feltWrap', w: 5 },
    { item: 'chalkSpool', w: 5 }, { item: 'wardSeal', w: 2.5 }, { item: 'resonanceKey', w: 0 }, // placed specially
    { item: 'lore', w: 8 }, { item: 'handLamp', w: 3 },
  ];
  for (const room of rooms) {
    for (const s of room.sockets) {
      // Meta-flagged sockets (arrival register, shop/broker markers) are
      // authored — the loot table must not roll 'contains' over them.
      if (s.filled || s.kind === 'key' || s.meta.arrivalRegister || s.meta.broker !== undefined || s.meta.shop !== undefined) continue;
      if (s.kind === 'drawer') {
        if (lootRng.bool(0.55 * resourceMul)) {
          s.filled = true;
          const locked = lootRng.bool(0.18);
          const roll = lootRng.weighted(itemTable, (t) => t.w).item;
          // Locked drawers pay better: richer imprints than open ones.
          if (roll === 'imprints') s.meta = { contains: 'imprints', amount: locked ? lootRng.int(15, 30) : lootRng.int(3, 14) };
          else if (roll === 'lore') s.meta = { contains: 'lore', doc: `doc-${room.index}` };
          else s.meta = { contains: roll };
          if (locked) s.meta.drawerLocked = true;
          else if (!SAFE_ROOM_TEMPLATES.has(room.templateId) && lootRng.bool(0.09)) s.meta.wired = true;
        }
      } else if (s.kind === 'loot') {
        if (lootRng.bool(0.5 * resourceMul)) {
          s.filled = true;
          const roll = lootRng.weighted(itemTable, (t) => t.w).item;
          if (roll === 'imprints') s.meta = { contains: 'imprints', amount: lootRng.int(4, 18) };
          else if (roll === 'lore') s.meta = { contains: 'lore', doc: `doc-${room.index}` };
          else s.meta = { contains: roll };
        }
      }
    }
  }

  // Old sign guaranteed: every route remembers somebody's earlier work —
  // if no hazard rolled spent, the first one carries the mark.
  {
    const haz = rooms.flatMap((r) => r.sockets.filter((sk) => sk.meta.hazard === 'snare' || sk.meta.hazard === 'steam'));
    if (haz.length && !haz.some((sk) => sk.meta.spent === true)) haz[0].meta.spent = true;
  }

  // Hand lamp guaranteed early (dark rooms incoming).
  const early = rooms.find((r) => r.index === 6) ?? rooms[6];
  let lampSock = early.sockets.find((s) => !s.filled && s.kind !== 'key');
  if (!lampSock) {
    lampSock = { kind: 'itemPedestal', pos: v3(early.exitPos.x - early.exitDir.x * 1.6, 0, early.exitPos.z - early.exitDir.z * 1.6), yaw: 0, filled: false, meta: {} };
    early.sockets.push(lampSock);
  }
  lampSock.filled = true;
  lampSock.meta = { contains: 'handLamp' };

  // Resonance key guaranteed before Underscript entrance (~room 45).
  const resHost = rooms[Math.min(45, rooms.length - 10)];
  const resSock = { kind: 'key' as const, pos: v3(resHost.origin.x, 0.8, resHost.origin.z), yaw: 0, filled: true, meta: { contains: 'resonanceKey', pedestal: true } };
  resHost.sockets.push(resSock);

  // Vending machines — maintenance and records rooms sometimes carry one.
  // Filled but never lootable for free: `meta.vend` routes it to the
  // imprint-feed interaction. The vendItem is seeded so runs differ.
  const vendItems = ['bandage', 'tonic', 'sparkFlash', 'latchpick', 'windAlarm', 'wardSeal', 'doorChock', 'doorChock'];
  for (const room of rooms) {
    if (room.authored || !room.spec || (room.biome !== 'maintenance' && room.biome !== 'records')) continue;
    if (!lootRng.bool(0.22)) continue;
    const lx = room.spec.width / 2 - 1.1;
    const lz = lootRng.range(-room.spec.depth / 3, room.spec.depth / 3);
    const p = localToWorld(room.origin, room.yaw, lx, 0, lz);
    room.sockets.push({
      kind: 'loot', pos: v3(p.x, 0.7, p.z), yaw: room.yaw - Math.PI / 2, filled: true,
      meta: { vend: true, price: lootRng.int(4, 9), vendItem: vendItems[lootRng.int(0, vendItems.length - 1)] },
    });
    // The machine is real now — vend sockets hang on a milled unit
    // (skipped where a door lane claims the footprint).
    if (!inDoorLane(room.spec, lx + 0.45, lz)) {
      room.spec.props.push({ kind: 'vendingUnit', x: lx + 0.45, z: lz, yaw: -Math.PI / 2 });
    }
  }

  // The porter's cage — the guest wing's own spend point. A key cabinet
  // of "held bags" whose owners never came back: 2–3 claim tags per cage,
  // each priced and semi-blind (the tag names the claimant, not the
  // contents). Distinct from the vend machine's single stocked item.
  const claimTags = ['Voss', 'Halloran', 'Marchetti', 'Oduya', 'Pemberton', 'Reyes', 'Sable', 'Thorne', 'Whitlock', 'Yarrow', 'Iverson', 'Cray', 'Bellamy', 'Renner', 'Ashcombe'];
  const claimPool = [
    'bandage', 'tonic', 'chalkSpool', 'latchpick', 'feltWrap', 'sparkFlash',
    'doorChock', 'doorChock', 'windAlarm', 'wardSeal', 'imprints', 'lore',
  ];
  for (const room of rooms) {
    if (room.authored || !room.spec || (room.biome !== 'guest' && room.biome !== 'lobby')) continue;
    if (!lootRng.bool(0.38)) continue;
    const w = room.spec.width, d = room.spec.depth;
    // Try the wall spots in seeded order — first that's lane-free and
    // clear of already-placed furniture wins.
    const spots = [
      { x: w / 2 - 1.1, z: lootRng.range(-d / 3, d / 3), yaw: -Math.PI / 2 },
      { x: -w / 2 + 1.1, z: lootRng.range(-d / 3, d / 3), yaw: Math.PI / 2 },
      { x: lootRng.range(-w / 4, w / 4), z: -d / 2 + 1.1, yaw: 0 },
      { x: lootRng.range(-w / 4, w / 4), z: d / 2 - 1.1, yaw: Math.PI },
    ];
    // The cabinet carries no collider — clearance is for visual overlap only.
    const spot = spots.find((s) => !inDoorLane(room.spec!, s.x, s.z) && !(room.spec!.props as { x: number; z: number; kind: string }[]).some((p) => !/runner|stain|tray/.test(p.kind) && Math.hypot(p.x - s.x, p.z - s.z) < 0.7));
    if (!spot) continue;
    room.spec.props.push({ kind: 'keyCabinet', x: spot.x, z: spot.z, yaw: spot.yaw });
    const nBags = lootRng.int(2, 3);
    const p = localToWorld(room.origin, room.yaw, spot.x, 0, spot.z);
    const faceX = Math.sin(room.yaw + spot.yaw), faceZ = Math.cos(room.yaw + spot.yaw);
    for (let i = 0; i < nBags; i++) {
      const roll = claimPool[lootRng.int(0, claimPool.length - 1)];
      const meta: Record<string, number | string | boolean> = {
        claim: true, price: lootRng.int(6, 15), claimTag: claimTags[lootRng.int(0, claimTags.length - 1)],
      };
      if (roll === 'imprints') { meta.contains = 'imprints'; meta.amount = lootRng.int(8, 26); }
      else meta.contains = roll;
      const off = (i - (nBags - 1) / 2) * 0.3;
      room.sockets.push({
        kind: 'loot',
        pos: v3(p.x + faceX * 0.42 - faceZ * off, 0.7, p.z + faceZ * 0.42 + faceX * off),
        yaw: spot.yaw, filled: true, meta,
      });
    }
  }

  // The guest ledger — a priced foresight read on real reception counters.
  // The hotel's own book says who is expected: the next few doors' waiting
  // things, in its own euphemisms. Information is the second economy.
  for (const room of rooms) {
    if (room.authored || !room.spec) continue;
    const counter = room.spec.props.find((p) => p.kind === 'counter');
    if (!counter) continue;
    if (!lootRng.bool(0.6)) continue;
    const cp = localToWorld(room.origin, room.yaw, counter.x, 0, counter.z);
    const toC = { x: room.origin.x - cp.x, z: room.origin.z - cp.z };
    const tcL = Math.hypot(toC.x, toC.z) || 1;
    room.sockets.push({
      kind: 'loot',
      pos: v3(cp.x + (toC.x / tcL) * 0.55, 1.0, cp.z + (toC.z / tcL) * 0.55),
      yaw: 0, filled: true,
      meta: { register: true, price: lootRng.int(9, 16) },
    });
  }

  // The duty roster — the records wing's counterpart to the guest ledger.
  // Where the ledger predicts, the roster LOCATES: which staff are marked
  // working right now, and where. Cheaper paper, narrower knowledge.
  for (const room of rooms) {
    if (room.authored || !room.spec) continue;
    if (room.biome !== 'records' && room.biome !== 'maintenance') continue;
    const desk = room.spec.props.find((p) => p.kind === 'desk' || p.kind === 'writingDesk');
    if (!desk) continue;
    if (!lootRng.bool(0.5)) continue;
    const dp = localToWorld(room.origin, room.yaw, desk.x, 0, desk.z);
    const toC = { x: room.origin.x - dp.x, z: room.origin.z - dp.z };
    const tcL = Math.hypot(toC.x, toC.z) || 1;
    room.sockets.push({
      kind: 'loot',
      pos: v3(dp.x + (toC.x / tcL) * 0.5, 0.9, dp.z + (toC.z / tcL) * 0.5),
      yaw: 0, filled: true,
      meta: { roster: true, price: lootRng.int(4, 9) },
    });
  }

  // The complaint book — cheapest paper of the three. Maintenance work-
  // tables keep 'the fault book', gallery sideboards 'the complaint
  // book'; either way it files HAZARDS by door: what the other two books
  // don't cover — heaving floors, biting lids, doors that aren't doors.
  for (const room of rooms) {
    if (room.authored || !room.spec) continue;
    const isMaint = room.biome === 'maintenance';
    const isGallery = room.biome === 'gallery';
    if (!isMaint && !isGallery) continue;
    const surf = room.spec.props.find((p) =>
      isMaint ? (p.kind === 'table' || p.kind === 'toolChest' || p.kind === 'toolbox')
              : (p.kind === 'sideboard' || p.kind === 'desk' || p.kind === 'consoleTable'));
    if (!surf) continue;
    if (!lootRng.bool(0.5)) continue;
    const sp = localToWorld(room.origin, room.yaw, surf.x, 0, surf.z);
    const toC = { x: room.origin.x - sp.x, z: room.origin.z - sp.z };
    const tcL = Math.hypot(toC.x, toC.z) || 1;
    room.sockets.push({
      kind: 'loot',
      pos: v3(sp.x + (toC.x / tcL) * 0.5, 0.9, sp.z + (toC.z / tcL) * 0.5),
      yaw: 0, filled: true,
      meta: { complaint: true, fault: isMaint, price: lootRng.int(3, 8) },
    });
  }

  void branches;
  return keyPairs;
}

/* ==================== HIDING DENSITY ==================== */

/**
 * Guarantees a usable survival option every few rooms by injecting a cabinet
 * hiding spot into rooms that lack one when their neighbors don't either.
 * Deterministic — uses the dressing stream.
 */
function ensureHidingDensity(rooms: RoomInstance[], rng: import('../engine/rng').Rng): void {
  for (let i = 8; i < rooms.length; i++) {
    const r = rooms[i];
    if (r.biome === 'safe') continue;
    let covered = false;
    for (let j = Math.max(0, i - 2); j <= Math.min(rooms.length - 1, i + 2); j++) {
      if (rooms[j].hidingSpots.length > 0 || rooms[j].safeZones.length > 0) { covered = true; break; }
    }
    if (covered) continue;
    const w = r.spec?.width ?? 6;
    const d = r.spec?.depth ?? 8;
    const corners = [
      { x: -w / 2 + 0.9, z: -d / 2 + 0.9, yaw: 0 },
      { x: w / 2 - 0.9, z: -d / 2 + 0.9, yaw: Math.PI / 2 },
      { x: -w / 2 + 0.9, z: d / 2 - 0.9, yaw: -Math.PI / 2 },
    ];
    const clear = r.spec ? corners.filter((c) => !inDoorLane(r.spec!, c.x, c.z)) : corners;
    const corner = rng.pick(clear.length ? clear : corners);
    const center = localToWorld(r.origin, r.yaw, corner.x, 0, corner.z);
    const dYaw = r.yaw + corner.yaw;
    const dir = { x: Math.sin(dYaw), z: Math.cos(dYaw) };
    r.hidingSpots.push({
      id: `hide-${r.index}-inj`,
      kind: 'cabinet',
      volume: aabb(center.x, 1.0, center.z, 0.55, 1.05, 0.55),
      viewPos: v3(center.x, 1.15, center.z),
      viewYaw: dYaw,
      exitPos: v3(center.x + dir.x * 1.0, 0, center.z + dir.z * 1.0),
      roomIndex: r.index,
      trapClues: [],
    });
    if (r.spec) {
      r.spec.hiding.push({ kind: 'cabinet', x: corner.x, z: corner.z, yaw: corner.yaw, propKind: 'locker' });
    }
  }
}

/* ==================== ENCOUNTER SCHEDULING ==================== */

function scheduleEncounters(rooms: RoomInstance[], encRng: import('../engine/rng').Rng, opts: GenOptions, beats?: import('./pacing').Beat[]): void {
  const diff = opts.difficulty;
  const cooldowns = new Map<EntityId, number>();
  let roomsSinceDeath = 999;

  const eligibleRooms = rooms.filter((r) => !r.authored && r.biome !== 'safe' && r.index >= 10);

  const tiers = beats ? tierMap(beats, rooms) : null;
  const TIER_MULT = [0.25, 0.7, 1.1, 1.0];
  for (const room of eligibleRooms) {
    roomsSinceDeath++;
    const mercy = roomsSinceDeath <= DIRECTOR.mercyRoomsAfterDeath ? 0.4 : 1;
    const tier = tiers?.get(room.index) ?? 2;
    if (tier === 0 && !encRng.bool(0.15)) continue;

    for (const [id, t] of Object.entries(ENTITY_TUNING) as [EntityId, EntityTuning][]) {
      if (['pursuer', 'editor', 'hazard', 'redline', 'stillframe', 'returner', 'margin', 'swamper'].includes(id)) continue;
      if (t.spawnChance <= 0) continue;
      if (room.index < t.minRoom || (t.maxRoom !== undefined && room.index > t.maxRoom)) continue;
      if ((cooldowns.get(id) ?? -999) + t.cooldown > room.index) continue;
      if (t.biomes && !t.biomes.includes(room.biome)) continue;
      const spec = room.spec;
      if (spec?.forbidEntities?.includes(id)) continue;
      if (spec?.allowOnlyEntities && !spec.allowOnlyEntities.includes(id)) continue;
      // Corridor threats need a route + hiding guarantee.
      if ((id === 'sweep' || id === 'reprise' || id === 'maelstrom' || id === 'behemoth' || id === 'bellman') && !hasSurvivalOption(rooms, room.index)) continue;
      if ((ENTITY_TIER[id] ?? 2) > tier) continue;
      if (id === 'whisper' && !room.darkRoom) continue;
      if (id === 'inkling' && !room.darkRoom) continue;
      // The Inspector needs lids to test.
      if (id === 'inspector' && room.hidingSpots.length < 2) continue;
      if (id === 'echoskin' && room.index < 63) continue;
      if (id === 'maelstrom' && room.index < 55) continue;
      // Witness needs apertures.
      if (id === 'witness' && !(spec?.tags ?? []).includes('witness-eligible') && !encRng.bool(0.3)) continue;
      // Incompatibility: don't schedule if a conflicting entity is already
      // scheduled in the same validation window (blocks of 6 rooms).
      const wLo = Math.floor(room.index / 6) * 6;
      const near = rooms.slice(wLo, Math.min(rooms.length, wLo + 6))
        .flatMap((r) => r.scheduled.map((s) => s.entity));
      if (INCOMPATIBLE.some(([a, b]) => (a === id && near.includes(b)) || (b === id && near.includes(a)))) continue;
      // Only one scheduled entity per room.
      if (room.scheduled.length > 0) break;

      const chance = t.spawnChance * mercy * TIER_MULT[tier] * ({ learning: 0.55, standard: 1, hard: 1.35, qa: 1 })[diff];
      if (encRng.bool(chance)) {
        const sched: ScheduledEncounter = { entity: id, triggerRoom: room.index, seed: encRng.int(0, 0x7fffffff) };
        if (id === 'reprise') sched.passes = encRng.int(2, 4);
        room.scheduled.push(sched);
        cooldowns.set(id, room.index);
        break;
      }
    }
  }

  // Guarantee teaching encounters: first Sweep around 12-16, first Witness 20-28,
  // first Reprise 31-38, first Echo-Skin 63-68, first Maelstrom 55-70.
  guarantee(rooms, encRng, 'sweep', 12, 16);
  guarantee(rooms, encRng, 'witness', 20, 28);
  guarantee(rooms, encRng, 'reprise', 31, 38);
  guarantee(rooms, encRng, 'echoskin', 63, 68);
  guarantee(rooms, encRng, 'maelstrom', 55, 70);
  // The Inspector teaches hiding discipline — pin one early-mid instance
  // in a room that actually has lids to test.
  if (!rooms.some((r) => r.scheduled.some((s) => s.entity === 'inspector'))) {
    const room = rooms.find((r) => r.index >= 22 && r.index <= 44 && !r.authored && r.biome !== 'safe'
      && r.hidingSpots.length >= 2 && r.scheduled.length === 0 && windowCompatible(rooms, r, 'inspector'));
    if (room) room.scheduled.push({ entity: 'inspector', triggerRoom: room.index, seed: encRng.int(0, 0x7fffffff) });
  }
  // The Bellman teaches gaze discipline — pin one mid-route too; it can
  // kill, so the pinned room must offer survival like the scheduler gate.
  if (!rooms.some((r) => r.scheduled.some((s) => s.entity === 'bellman'))) {
    const room = rooms.find((r) => r.index >= 30 && r.index <= 52 && !r.authored && r.biome !== 'safe'
      && r.scheduled.length === 0 && hasSurvivalOption(rooms, r.index) && windowCompatible(rooms, r, 'bellman'));
    if (room) room.scheduled.push({ entity: 'bellman', triggerRoom: room.index, seed: encRng.int(0, 0x7fffffff) });
  }
  // The Commissionaire gates the forward path — pin one early-mid so every
  // run teaches the bait-and-cross before the deep schedule can skip it.
  if (!rooms.some((r) => r.scheduled.some((s) => s.entity === 'commissionaire'))) {
    const room = rooms.find((r) => r.index >= 24 && r.index <= 46 && !r.authored && r.biome !== 'safe'
      && r.scheduled.length === 0 && windowCompatible(rooms, r, 'commissionaire'));
    if (room) room.scheduled.push({ entity: 'commissionaire', triggerRoom: room.index, seed: encRng.int(0, 0x7fffffff) });
  }

  // Density floor: no stretch of 11+ eligible rooms stays unscheduled — seed a
  // low-tier presence at each void's midpoint so valleys never become voids.
  const FLOOR_SET: EntityId[] = ['whisper', 'inkling', 'redactor', 'hollow'];
  {
    const schedIdx = rooms.filter((r) => r.index >= 0 && r.scheduled.length > 0).map((r) => r.index);
    const marks = [9, ...schedIdx, 101];
    for (let k = 0; k < marks.length - 1; k++) {
      const lo = marks[k], hi = marks[k + 1];
      if (hi - lo <= 10) continue;
      const mid = Math.floor((lo + hi) / 2);
      for (let off = 0; off <= 3; off++) {
        const cand = rooms.find((r) => r.index === mid + off) ?? rooms.find((r) => r.index === mid - off);
        if (!cand || cand.authored || cand.biome === 'safe' || cand.scheduled.length > 0) continue;
        const pick = FLOOR_SET.find((id) => {
          const t = ENTITY_TUNING[id];
          if (!t) return false;
          if (cand.index < t.minRoom || (t.maxRoom !== undefined && cand.index > t.maxRoom)) return false;
          if (t.biomes && !t.biomes.includes(cand.biome)) return false;
          if ((id === 'whisper' || id === 'inkling') && !cand.darkRoom) return false;
          const spec = cand.spec;
          if (spec?.forbidEntities?.includes(id) || (spec?.allowOnlyEntities && !spec.allowOnlyEntities.includes(id))) return false;
          return true;
        });
        if (!pick) continue;
        cand.scheduled.push({ entity: pick, triggerRoom: cand.index, seed: encRng.int(0, 0x7fffffff) });
        break;
      }
    }
  }

  // Hollow traps: mark some hiding spots trapped (never all in a room).
  for (const room of rooms) {
    if (room.index < 12 || room.authored) continue;
    const spots = room.hidingSpots;
    if (spots.length < 2) continue;
    if (encRng.bool(0.3)) {
      const idx = encRng.int(0, spots.length - 1);
      const s = spots[idx];
      s.trappedBy = 'hollow';
      s.trapClues = encRng.shuffle(['off-hum', 'dark-residue', 'warped-slats', 'faint-move', 'breathing']).slice(0, 2);
    }
  }
}

function hasSurvivalOption(rooms: RoomInstance[], atIndex: number): boolean {
  // Check rooms [atIndex-2, atIndex+2] for a free hiding spot or LOS safe zone.
  for (let i = Math.max(0, atIndex - 2); i <= Math.min(rooms.length - 1, atIndex + 2); i++) {
    const r = rooms[i];
    if (r.hidingSpots.some((h) => !h.trappedBy)) return true;
    if (r.safeZones.length > 0) return true;
  }
  return false;
}

/** Entities already scheduled in the 6-room validation window containing `room`. */
function windowEntities(rooms: RoomInstance[], room: RoomInstance): EntityId[] {
  const wLo = Math.floor(room.index / 6) * 6;
  return rooms.slice(wLo, Math.min(rooms.length, wLo + 6))
    .flatMap((r) => r.scheduled.map((s) => s.entity));
}

function windowCompatible(rooms: RoomInstance[], room: RoomInstance, id: EntityId): boolean {
  const near = windowEntities(rooms, room);
  return INCOMPATIBLE.every(([a, b]) => !(a === id && near.includes(b)) && !(b === id && near.includes(a)));
}

function guarantee(rooms: RoomInstance[], encRng: import('../engine/rng').Rng, id: EntityId, lo: number, hi: number): void {
  const window = rooms.filter((r) => r.index >= lo && r.index <= hi && !r.authored && r.biome !== 'safe');
  if (!window.length) return;
  if (window.some((r) => r.scheduled.some((s) => s.entity === id))) return;
  if (id === 'sweep' || id === 'reprise' || id === 'maelstrom') {
    const ok = window.filter((r) => hasSurvivalOption(rooms, r.index) && r.scheduled.length === 0 && windowCompatible(rooms, r, id));
    if (!ok.length) return;
    const room = ok[0];
    room.scheduled.push({ entity: id, triggerRoom: room.index, seed: encRng.int(0, 0x7fffffff), passes: id === 'reprise' ? 2 : undefined });
    return;
  }
  const room = window.find((r) => r.scheduled.length === 0 && windowCompatible(rooms, r, id));
  if (!room) return;
  room.scheduled.push({ entity: id, triggerRoom: room.index, seed: encRng.int(0, 0x7fffffff) });
}

/* ==================== UNDERSCRIPT ==================== */

/** Under templates that can hold standing water — the low service halls
 *  water actually collects in (never the staffed offices or safe landings). */
const FLOOD_TEMPLATES = new Set(['u-corridor', 'u-long-hall', 'u-server', 'u-narrow-stacks', 'u-partition-maze', 'u-break']);

function generateUnderscript(streams: SeedStreams, opts: GenOptions): RoomInstance[] {
  const count = opts.shortRun ? 21 : 121; // U-000..U-120
  const placed: PlacedRoom[] = [];
  const rooms: RoomInstance[] = [];
  let connPos = v3(400, -40, 0); // far offset — separate space
  let connDir = v3(0, 0, 1);

  for (let i = 0; i < count; i++) {
    const isLanding = i % 20 === 0 && i > 0;
    const isFirst = i === 0;
    const isLast = i === count - 1;
    const spec = isFirst
      ? UNDERSCRIPT_TEMPLATES.find((t) => t.id === 'u-lobby')!.build(streams.roomStream('structure', 500 + i))
      : isLast
        ? UNDERSCRIPT_TEMPLATES.find((t) => t.id === 'u-dead-end-loot')!.build(streams.roomStream('structure', 500 + i))
        : isLanding
          ? UNDERSCRIPT_TEMPLATES.find((t) => t.id === 'u-stair-landing')!.build(streams.roomStream('structure', 500 + i))
          : pickSpec(UNDERSCRIPT_TEMPLATES, streams.stream('structure'), i, null)[0]?.spec
            ?? UNDERSCRIPT_TEMPLATES[0].build(streams.roomStream('structure', 500 + i));
    const uBound = v3(400, -40, 0);
    let p = tryPlaceWithJitters(spec, connPos, connDir, placed, uBound);
    if (!p) {
      const fb = UNDERSCRIPT_TEMPLATES[0].build(streams.roomStream('structure', 900 + i));
      p = tryPlace(fb, connPos, connDir, placed, true, uBound)!;
    }
    const uConn = pendingConnector;
    if (uConn) pendingConnector = null;
    placed.push(p);
    const room = instantiate(i, `U-${String(i).padStart(3, '0')}`, p, true);
    if (uConn) addConnectorColliders(room, uConn);
    room.biome = 'underscript';
    // Flooded runs — water collects in the low service halls. Wading is
    // slow and every step carries; the drain is the paid quiet.
    if (FLOOD_TEMPLATES.has(room.templateId) && streams.roomStream('dressing', 710 + i).bool(0.12)) room.flooded = true;
    // Drowned mains — flooded halls lose their lights far more often.
    if (streams.roomStream('dressing', 700 + i).bool(room.flooded ? 0.7 : 0.45)) room.darkRoom = true;
    // Submerged wires — the dark water hides paper snares: an upright
    // wader trips them loud, a slow wader feels them and steps over.
    if (room.flooded && room.darkRoom) {
      const sr = streams.roomStream('dressing', 720 + i);
      const count = 1 + (sr.bool(0.55) ? 1 : 0);
      for (let placed = 0, tries = 0; placed < count && tries < 8; tries++) {
        const lx = sr.range(-room.width / 2 + 1.0, room.width / 2 - 1.0);
        const lz = sr.range(-room.depth / 2 + 1.0, room.depth / 2 - 1.0);
        const wp = localToWorld(room.origin, room.yaw, lx, 0, lz);
        if (room.doors.some((d) => Math.hypot(d.pos.x - wp.x, d.pos.z - wp.z) < 1.6)) continue;
        room.spec?.props.push({ kind: 'snare', x: lx, z: lz, yaw: sr.float() * Math.PI * 2 });
        const spentWire = ((wp.x * 11 + wp.z * 3 + room.index * 17) % 97) < 6;
        room.sockets.push({ kind: 'hazard', pos: wp, yaw: room.yaw, filled: false,
          meta: spentWire ? { hazard: 'snare', submerged: true, spent: true } : { hazard: 'snare', submerged: true } });
        placed++;
      }
    }
    // Electrified water — the flip side of drowned mains: a LIVE flooded
    // hall arcs around its powered fittings (drowned halls carry dead
    // wires instead). The drain takes the arc's medium with the water.
    if (room.flooded && !room.darkRoom) {
      const ARC_PROPS = new Set(['serverRack', 'machineBox', 'controlPanel', 'fluoroTube', 'conduitRun', 'breakerPanel', 'pipeManifold']);
      const ar = streams.roomStream('dressing', 730 + i);
      const lives = (room.spec?.props ?? []).filter((pp) => ARC_PROPS.has(pp.kind));
      const count = Math.min(lives.length > 3 ? 2 : lives.length, 2);
      for (let n = 0; n < count && lives.length; n++) {
        const pick = lives.splice(ar.int(0, lives.length - 1), 1)[0];
        const wp = localToWorld(room.origin, room.yaw, pick.x, 0, pick.z);
        if (room.doors.some((d) => Math.hypot(d.pos.x - wp.x, d.pos.z - wp.z) < 1.5)) continue;
        room.sockets.push({ kind: 'hazard', pos: wp, yaw: 0, filled: false, meta: { hazard: 'puddle', electrified: true } });
      }
    }
    rooms.push(room);
    const pw = portWorld(p, p.spec.exits[0]);
    connPos = pw.pos; connDir = pw.dir;
  }

  // Underscript encounters: redline/returner (corridor), stillframe, margin.
  const encRng = streams.stream('encounter');
  const cooldowns = new Map<EntityId, number>();
  for (const room of rooms) {
    if (room.index === 0 || room.index % 20 === 0) continue; // safe landings
    const candidates: EntityId[] = ['swamper', 'redline', 'stillframe', 'returner', 'margin', 'grafter'];
    for (const id of candidates) {
      const t = ENTITY_TUNING[id];
      if ((cooldowns.get(id) ?? -99) + t.cooldown > room.index) continue;
      if (id === 'swamper' && !room.flooded) continue;
      if (id === 'redline' || id === 'returner') {
        if (!hasSurvivalOption(rooms, room.index)) continue;
      }
      const near = rooms.slice(Math.max(0, room.index - 2), room.index + 1).flatMap((r) => r.scheduled.map((s) => s.entity));
      if (INCOMPATIBLE.some(([a, b]) => (a === id && near.includes(b)) || (b === id && near.includes(a)))) continue;
      if (encRng.bool(t.spawnChance * 0.8)) {
        room.scheduled.push({ entity: id, triggerRoom: room.index, seed: encRng.int(0, 0x7fffffff) });
        cooldowns.set(id, room.index);
        break;
      }
    }
  }

  // The Editor authored climax at the final stair landing.
  const last = rooms[rooms.length - 1];
  if (last) last.scheduled.push({ entity: 'editor', triggerRoom: last.index, seed: encRng.int(0, 0x7fffffff) });

  return rooms;
}
