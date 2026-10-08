/**
 * Entity framework — every entity is an explicit state machine with a
 * lifecycle: warn → engage → resolve → cleanup. Entities get an EntityCtx
 * for world access, sound emission, captions, and player effects. All
 * timers run on the game clock. Entities must clean up listeners/meshes.
 */
import type { Vec3, Aabb } from '../engine/math';
import { v3, v3dist, hasLineOfSight, distToSegment2D } from '../engine/math';
import type { EntityId, RoomInstance, EntityTuning } from '../game/types';
import { shutLeafBlockers } from '../engine/doorGeo';
import type { PlayerController } from '../player/controller';
import type { SoundEventBus } from '../engine/events';
import type { SeedStreams } from '../engine/rng';

export interface EntityCtx {
  player: PlayerController;
  /** Active route (main or underscript). */
  rooms: RoomInstance[];
  /** Current room index the player occupies. */
  currentRoomIndex: number;
  /** Emit a world sound event (entities hear these too). */
  sound: SoundEventBus;
  streams: SeedStreams;
  now: number;
  /** Deterministic per-encounter seed. */
  seed: number;
  /** UI-facing helpers wired by the Game. */
  cue: (name: string, at: Vec3 | null, caption: string, opts?: { severity?: 'info' | 'warn' | 'danger' }) => void;
  damagePlayer: (amount: number, source: EntityId, hint: string) => void;
  killPlayer: (source: EntityId, hint: string) => void;
  addEntityMesh: (obj: import('three').Object3D) => void;
  removeEntityMesh: (obj: import('three').Object3D) => void;
  flickerRoom: (roomIndex: number, mode: 'sweep' | 'reprise' | 'dim' | 'break') => void;
  /** Dip the biome room-tone bed for `seconds` then ease back — the house
   *  holding its breath. Optional: no-ops when no bed is playing. */
  duckTone?: (seconds: number, level?: number) => void;
  spawnAt: (roomIndex: number) => Vec3;
  /** Rolling breadcrumbs of where the player has walked (world XZ, ~1.15m
   *  apart, oldest first). Entities that trail the player read these; it's
   *  live — appended to every frame the player moves. */
  playerTrail?: Vec3[];
  difficulty: import('../game/types').Difficulty;
  accessibility: { reducedMotion: boolean; captions: boolean; minigameAssist: number };
  gameState: () => string;
  /** Register/unregister a promptable interaction point tied to the entity.
   *  Re-applied across room-stream rebuilds while registered. */
  addInteractable: (it: import('../player/interaction').Interactable) => void;
  removeInteractable: (id: string) => void;
  /** Distance to the nearest living spatial threat other than `exclude`
   *  (or null) — used for 'tell me what you heard' whispers. */
  nearestThreat: (exclude: Entity) => { d: number; p: Vec3 } | null;
  /** The player's imprint purse — entities that tax it (the Collector)
   *  read it live. Optional: headless test ctxs may omit it. */
  purse?: () => number;
  /** Flooded-hall drains: true once a room's water has been let out.
   *  Optional: headless test ctxs may omit it. */
  isRoomDrained?: (index: number) => boolean;
  /** The audit tally — marginalia claims / sledge picks / basket steals
   *  the player hasn't settled for. Optional: headless ctxs may omit it. */
  claimsOwed?: () => number;
  /** True while the pack holds a live stack of the given item id.
   *  Optional for headless ctxs (they answer false). */
  playerCarries?: (id: string) => boolean;
  /** Held-property tally in imprints — the Detective's book. */
  heldOwed?: () => number;
  /** True while a wanted notice is posted on the crew boards — the
   *  under-crew saw your hands in the book: their notice reach widens
   *  a tier until the tally is settled. */
  wanted?: () => boolean;
  /** The Filer's courier made the stairs — her card on the player lands
   *  in the house register upstairs: +1 line in the Detective's book.
   *  Optional for headless ctxs. */
  wordFiled?: () => void;
  /** The player pulled the house line off the wall — the dead wire is
   *  billed as damages: +1 line in the Detective's book.
   *  Optional for headless ctxs. */
  lineCut?: () => void;
  /** A pulled line stays dead across a checkpoint — the Game remembers
   *  which detective rooms lost their wire; a fresh spawn skips the
   *  junction box entirely when this returns true. Optional. */
  lineDeadFor?: (roomIdx: number) => boolean;
  /** A wall eye's settle report went upstairs — a witness statement in
   *  the register: +1 line in the Detective's book. Fires once per eye.
   *  Optional for headless ctxs. */
  eyeFiled?: () => void;
  /** The Detective sighted marked stock on the player — the register
   *  wrote that manifest; the sighting files +1 line, once per
   *  detective room even across a checkpoint. Optional. */
  stockSighted?: (roomIdx: number) => void;
  /** True while the player carries marked wares (a hotItems stack with
   *  count > 0). Optional for headless ctxs. */
  carriesMarked?: () => boolean;
  /** Repossess the marked take — strips every hotItems stack and the
   *  marked coin. Returns false when there was nothing to take (honest:
   *  callers cue only on a real seizure). Optional for headless ctxs. */
  seizeMarked?: () => boolean;
  /** A kicked door chock — the bellman booted a 'wedge' hold loose at
   *  `doorPos`; `fromPos` is the kick side. The Game drops the spent
   *  chock on the far side as gatherable loot. Optional for headless
   *  ctxs. */
  wedgeKicked?: (doorPos: Vec3, fromPos: Vec3) => void;
  /** Consult tally — paid reads of the under's own paper (work order,
   *  crew board, claim register) the player hasn't squared for. The
   *  Filer's ledger: questions asked, not goods taken. */
  trailOwed?: () => number;
  /** Scent: killed hazards leave sign a hunter can read. Callers pass a
   *  reader key (e.g. 'warden:33'); returned marks are recorded as read
   *  so each hunter reads each sign once. Optional for headless ctxs. */
  hazardEvidence?: (readerKey: string, x: number, z: number, radius: number)
    => { pos: Vec3; room: number; kind: string; t: number; old?: boolean; weak?: boolean; wiped?: boolean }[];
  /** The house re-lays its own work: a floorkeeper that reads a dead
   *  hazard's sign can bring it back near that spot — wire re-tied,
   *  bled lines re-pressurized, killed wheels re-engaged, felt stripped
   *  off its eyes (the wrap is confiscated — the house pockets it).
   *  Returns what it restored, or null. Optional for headless ctxs. */
  rearmHazard?: (kind: 'wire' | 'line' | 'fan' | 'blind', x: number, z: number)
    => 'snare' | 'steam' | 'fan' | 'eye' | null;
  /** sprint 433 — a walker reaching a coil-bound leaf works the wire:
   *  'strained' on first contact, 'freed' once the bind parts (the
   *  coil drops where it was worked loose), null when nothing wired. */
  strainWire?: (x: number, z: number) => 'strained' | 'freed' | null;
  /** Confiscation isn't deletion — it's carried: a staggered
   *  floorkeeper scatters the felt it pocketed as floor loot. */
  dropWraps?: (pos: Vec3, n: number) => void;
  /** The under's version of maintenance: the scavenger strips dead
   *  wire it stumbles on and carries the coil — then lays it fresh
   *  where the living walk. strip removes a dead snare near (x,z);
   *  plant arms a new (grafted) one at pos in room. */
  stripSnare?: (x: number, z: number) => boolean;
  plantSnare?: (pos: Vec3, room: number, planterKey?: string) => void;
  /** sprint 419 — a carried coil is lost work: a staggered carrier
   *  drops it unlaid — a dead graft at its feet, reclaimable wire. */
  spillSnare?: (pos: Vec3, room: number) => void;
}

export type EntityState = 'idle' | 'warn' | 'engage' | 'resolve' | 'done';

export abstract class Entity {
  readonly id: EntityId;
  state: EntityState = 'idle';
  tuning: EntityTuning;
  protected ctx!: EntityCtx;
  protected stateT = 0;
  protected log: string[] = [];

  constructor(id: EntityId, tuning: EntityTuning) {
    this.id = id;
    this.tuning = tuning;
  }

  spawn(ctx: EntityCtx): void {
    this.ctx = ctx;
    this.state = 'warn';
    this.stateT = 0;
    this.log.push(`${this.id} spawn@${ctx.currentRoomIndex} t=${ctx.now.toFixed(1)}`);
    this.onSpawn();
  }

  protected abstract onSpawn(): void;
  protected abstract onUpdate(dt: number): void;
  protected onDone(): void {}

  /** ctx.playerTrail dropped its oldest crumb — entities that index into it
   *  adjust their cursor. No-op by default. */
  trailShifted(): void {}

  /** true during the first beat after spawning — the rise is the warning.
   *  Contact killers must not strike while rising, so a thing that appears
   *  in the player's own room can never hit before the player can answer it. */
  protected rising(): boolean {
    return this.stateT < 1.4;
  }

  /** The house's own glass: a falling fixture staggers the walker under
   *  it — every timer (stateT-driven warns, wind-ups, walks) holds where
   *  it was until the stagger ends. Any walker is fair game; the glass
   *  does not discriminate between the player's and the house's feet. */
  private staggerUntil = -1;

  stagger(seconds: number): void {
    this.staggerUntil = this.ctx.now + seconds;
    // sprint 415 — the fall is heard: a body going down is a real
    // sound in the house, not fiction — what listens drifts to the
    // crash. No source tag: entity listeners skip sourced events, and
    // the faller isn't exempt — a tripped warden can wake and read the
    // very sign its own fall answered.
    const tp = this.threatPos();
    if (tp) {
      this.ctx.sound.emit({
        x: tp.x, y: 0.3, z: tp.z, intensity: 0.5,
        category: 'impact', caption: '[something heavy goes down]',
      });
    }
  }

  update(dt: number): void {
    if (this.ctx.now < this.staggerUntil) return; // under the glass — the world holds still
    this.stateT += dt;
    this.onUpdate(dt);
  }

  protected done(): void {
    this.state = 'done';
    this.log.push(`${this.id} done t=${this.ctx.now.toFixed(1)}`);
    this.onDone();
  }

  get eventLog(): readonly string[] {
    return this.log;
  }

  dispose(): void {
    this.onDone();
  }

  /** Approximate threat position for proximity systems (dread layer);
   *  null when the entity has no spatial presence. */
  threatPos(): Vec3 | null { return null; }

  /** Corridor telegraph: the index span a pass will cover plus the wave
   *  direction (±1 in index space) and warn progress 0→1. Null when not
   *  telegraphing. Game folds this into lamp intensities each frame. */
  telegraphSpan(): { lo: number; hi: number; dir: number; frac: number } | null { return null; }
}

/* ---------- shared helpers ---------- */

/** Build a traversal path through rooms[start..end] along nav waypoints. */
export function corridorPath(rooms: RoomInstance[], start: number, end: number): Vec3[] {
  const pts: Vec3[] = [];
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(rooms.length - 1, Math.max(start, end));
  for (let i = lo; i <= hi; i++) {
    const r = rooms[i];
    pts.push(v3(r.entryPos.x, 0, r.entryPos.z));
    // interior nav in template order (non-door tags)
    for (const n of r.navNodes) {
      if (n.tags.includes('door')) continue;
      pts.push(v3(n.pos.x, 0, n.pos.z));
    }
    pts.push(v3(r.exitPos.x, 0, r.exitPos.z));
  }
  return pts;
}

/** Player protection test for corridor entities. */
export function playerExposed(ctx: EntityCtx, entPos: Vec3): 'safe' | 'kill' {
  const p = ctx.player;
  if (p.dead || p.hiddenSpot) return 'safe';
  if (p.protection === 'hidden') return 'safe';
  const d = v3dist(entPos, p.pos);
  if (d > 60) return 'safe';
  // losSafe zones protect via volume.
  if (p.protection === 'losSafe') return 'safe';
  // LOS check from entity to player eyes through nearby room colliders.
  const room = ctx.rooms[ctx.currentRoomIndex];
  const eye = v3();
  p.eyePos(eye);
  const entEye = v3(entPos.x, 1.6, entPos.z);
  const colliders: Aabb[] = room ? room.losBlockers : [];
  if (!hasLineOfSight(entEye, eye, colliders)) return 'safe';
  // A shut leaf is a physical panel — sight can't pass it. The kill
  // verdict has to treat it as blocking, or a touch lands through the
  // door the player is holding.
  const leafBlockers = shutLeafBlockers(ctx.rooms, entPos, p.pos);
  if (leafBlockers.length && !hasLineOfSight(entEye, eye, leafBlockers)) return 'safe';
  if (d > 40) return 'safe';
  return 'kill';
}

/** Distance from player to a path polyline (XZ). */
export function distToPath(pos: Vec3, path: Vec3[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegment2D(pos.x, pos.z, path[i].x, path[i].z, path[i + 1].x, path[i + 1].z);
    if (d < best) best = d;
  }
  return best;
}

/** Advance along path at speed; returns position + segment index. */
export function followPath(path: Vec3[], traveled: number): { pos: Vec3; seg: number; doneT: boolean } {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = v3dist(path[i], path[i + 1]);
    if (traveled <= acc + segLen) {
      const t = (traveled - acc) / (segLen || 1);
      return {
        pos: v3(
          path[i].x + (path[i + 1].x - path[i].x) * t,
          path[i].y + (path[i + 1].y - path[i].y) * t,
          path[i].z + (path[i + 1].z - path[i].z) * t,
        ),
        seg: i,
        doneT: false,
      };
    }
    acc += segLen;
  }
  return { pos: path[path.length - 1], seg: path.length - 1, doneT: true };
}

export function pathLength(path: Vec3[]): number {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) acc += v3dist(path[i], path[i + 1]);
  return acc;
}
