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
  /** sprint 514 — total units of take on the player's back (inventory
   *  counts + marked coin). A heavy take betrays a hide: it rings. */
  takeLoad?: () => number;
  /** sprint 518 — units of take parked in a hiding spot's stash. A
   *  parked take still betrays the lid: the keys smell it too. */
  stashLoad?: (spotId: string) => number;
  /** sprint 518 — the count's hands take a found stash: moves every
   *  good in that lid to the count's locker under a fresh tag.
   *  Returns units seized (0 = nothing found). Optional for headless. */
  seizeStash?: (spotId: string) => number;
  /** sprint 524 — wireCoil units parked in a hiding spot's stash.
   *  Wire is the one good the under's scavenger has a pocket for. */
  stashWire?: (spotId: string) => number;
  /** sprint 524 — the under's robbery: pull ONE coil out of a stashed
   *  lid (the claiming stoop's yield). Returns false when the lid has
   *  no wire left. Optional for headless ctxs. */
  robStashWire?: (spotId: string) => boolean;
  /** sprint 534 — pulse lamps left burning on a floor. A wall eye
   *  whose sweep reaches one drinks the light: its pan fixates on the
   *  lamp's bearing instead of travelling the room. Optional for
   *  headless ctxs. */
  litLamps?: (room: number) => { x: number; z: number }[];
  /** sprint 560 — every dropped lamp in a room, burning or not, for
   *  the beam's charge readout. litLamps stays the burning-only view
   *  the eyes drink; this is the whole pile. Optional for headless
   *  ctxs. */
  floorLamps?: (room: number) => { x: number; z: number; batt: number; lit: boolean }[];
  /** sprint 557 — the held beam as a reader: true when a held lamp is
   *  on, pos is inside its cone (same s444 cover rules: in reach, in
   *  the cone, sight clear of walls and shut leaves). Sign-readers use
   *  it to extend dust-reads to aimed range. Optional for headless
   *  ctxs. */
  beamCovers?: (pos: Vec3, maxD?: number, minDot?: number) => boolean;
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
  rearmHazard?: (kind: 'wire' | 'line' | 'fan' | 'blind' | 'spring' | 'work', x: number, z: number)
    => 'snare' | 'steam' | 'fan' | 'fanChock' | 'eye' | 'trap' | 'crimp' | 'reclaim' | 'pull' | 'lensTear' | 'platePull' | 'lidSweep' | 'lidHeld' | null;
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
  /** Push a 'work' evidence mark at pos, pre-read under signerKey so
   *  the signer doesn't chase its own sign — the splice's own signing
   *  convention, shared for non-snare work (shell-stripping etc.). */
  signWork?: (pos: Vec3, signerKey: string) => void;
  /** sprint 675 — the under's answer to a 'work' mark: a grafter that
   *  reaches fresh sign strips the armed work it names — your planted
   *  wire comes up as a carried coil, your cocked plate folds into
   *  stock. The under relocates live work; it doesn't dead it.
   *  Returns what it took, or null when the mark lied (the work left
   *  first, or what it found isn't yours). */
  stripWork?: (x: number, z: number)
    => 'coil' | 'plate' | 'belt' | 'lens' | 'throat' | null;
  /** sprint 419 — a carried coil is lost work: a staggered carrier
   *  drops it unlaid — a dead graft at its feet, reclaimable wire. */
  spillSnare?: (pos: Vec3, room: number) => void;
  /** sprint 477 — a paid hand keeps your coin: a staggered grafter drops
   *  its pouch where it falls, gatherable like any spill. */
  spillPouch?: (pos: Vec3, n: number, hot: number) => void;
  /** sprint 481-482 — the house and the under both reclaim their spill:
   *  a quiet walker reads the nearest dropped pile to drag toward, then
   *  takes it back on arrival. `nearestSpill` finds the closest pile of
   *  the given kinds within maxD of (x,z); `scavengeSpill` splices the
   *  pile underfoot — `take` names what the caller has a pocket for.
   *  The spill window is a race, not a timer: beat it back to your own
   *  coin or it keeps the money. */
  nearestSpill?: (x: number, z: number, maxD: number,
    kinds?: ('pouch' | 'coil' | 'wrap' | 'wedge' | 'lamp' | 'shell' | 'spring' | 'belt' | 'lens')[])
    => { x: number; z: number; kind: 'pouch' | 'coil' | 'wrap' | 'wedge' | 'lamp' | 'shell' | 'spring' | 'belt' | 'lens'; bait?: boolean } | null;
  scavengeSpill?: (x: number, z: number, take: { coil?: boolean; wrap?: boolean; wedge?: boolean; lamp?: boolean; shell?: boolean; spring?: boolean; belt?: boolean; lens?: boolean })
    => { kind: 'pouch'; n: number; hot: number; bait?: boolean } | { kind: 'coil' } | { kind: 'wrap'; n: number } | { kind: 'wedge' } | { kind: 'lamp'; batt: number } | { kind: 'shell' } | { kind: 'spring' } | { kind: 'belt' } | { kind: 'lens' } | null;
  /** sprint 489 — a confiscated chock is carried too: a staggered
   *  floorkeeper spills pocketed chocks back as kicked-wedge drops. */
  spillChocks?: (pos: Vec3, n: number) => void;
  /** sprint 539 — a pocketed lamp spills back still burning: the
   *  warden's stagger re-lights the floor where it went down, one
   *  lamp per charge left under its coat. */
  spillLamps?: (pos: Vec3, batts: number[]) => void;
  /** sprint 578 — pocketed plates spill back as dead goods: a
   *  staggered floorkeeper drops confiscated springs like chocks. */
  spillSprings?: (pos: Vec3, n: number) => void;
  /** sprint 593 — pocketed belts spill back the same way: a staggered
   *  floorkeeper drops the muscle it pulled off your wheels. */
  spillBelts?: (pos: Vec3, n: number) => void;
  /** sprint 601 — pocketed lenses spill back the same way: a staggered
   *  floorkeeper drops the glass it tore off your eyes. */
  spillLenses?: (pos: Vec3, n: number) => void;
  /** sprint 598 — a player-seated eye's walkers list: positions of the
   *  living cast inside a room so the eye can murmur on crossings for
   *  you (it never settles on your own walk). Optional for headless
   *  ctxs. */
  walkers?: (room: number) => { x: number; z: number }[];
  /** sprint 646 — the under re-threads what it carries: a graftable
   *  substrate is a muscle-less fan housing (`belted===false`) for a
   *  carried belt, or a pried socket (`lensed===false`) for a carried
   *  lens. Returns the nearest site within maxD, or null. */
  nearestGraft?: (x: number, z: number, maxD: number, kind?: 'wheel' | 'socket' | 'plate')
    => { x: number; z: number; kind: 'wheel' | 'socket' | 'plate' } | null;
  /** sprint 646 — and the graft itself: claims the substrate for the
   *  under (owner='under'), wakes it, and signs 'work' under the
   *  grafter's key so the house can smell whose hands went there.
   *  Returns true when the kind matched a live site. */
  graft?: (x: number, z: number, kind: 'wheel' | 'socket' | 'plate', byKey: string) => boolean;
  /** sprint 494 — a striding walker boots loose goods it doesn't read:
   *  any pile within reach is scattered further along, not pocketed.
   *  Returns true if it kicked anything. */
  scatterSpill?: (x: number, z: number) => boolean;
  /** sprint 710 — a filed floor pulls the patrol: sites the tally
   *  struck twice and hasn't cooled drag a floorkeeper back to stand
   *  over your worked spot — the register's mark is a standing order.
   *  Optional for headless ctxs. */
  filedFloors?: (x: number, z: number, radius: number)
    => { x: number; z: number; room: number; strikes: number }[];
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
    // Already down — the crash was heard when it fell; re-staggering
    // under standing water or steam extends the hold without lying
    // that something heavy hit the floor again.
    const wasDown = this.ctx.now < this.staggerUntil;
    this.staggerUntil = this.ctx.now + seconds;
    if (wasDown) return;
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
      // sprint 505 — the fall boots what it lands on: a body going down
      // scatters the pile under it, same as any stride. The staggered
      // warden can kick its own spill further — floor pinball is honest.
      this.ctx.scatterSpill?.(tp.x, tp.z);
    }
  }

  update(dt: number): void {
    if (this.ctx.now < this.staggerUntil) return; // under the glass — the world holds still
    this.stateT += dt;
    this.onUpdate(dt);
  }

  /** sprint 503 — every walker boots it for real: a stride that moved
   *  this update scatters loose goods underfoot. Floor-readers (warden,
   *  grafter, the lamp) keep their deliberate take and never call this;
   *  everyone else's feet are dumb. Call at the end of onUpdate with the
   *  entity's stride position. */
  private bootX = Number.NaN;
  private bootZ = Number.NaN;
  protected bootSpill(at: Vec3): void {
    if (at.x === this.bootX && at.z === this.bootZ) return;
    this.bootX = at.x; this.bootZ = at.z;
    this.ctx.scatterSpill?.(at.x, at.z);
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

  /** The eye at the crack told on the player: the watcher that met a
   *  stoop through the gap now knows where the kneel happened. Entities
   *  that can act on a sighting override this — it feeds their existing
   *  pursuit machinery (a dropped crumb, an investigate point), never a
   *  teleport. `at` is where the player knelt; `leaf` is the door's own
   *  position for watchers that can't leave their room. */
  eyeTell?(at: Vec3, leaf?: Vec3): void;

  /** sprint 472 — is this watcher currently pressed against that leaf?
   *  Implemented by watchers whose posture at a crack is a lean — the
   *  camp the eye's tell starts. Game reads it to put their weight on
   *  the leaf's swing: a camped leaf is a held leaf. */
  seamCamped?(leaf: Vec3): boolean;
  /** sprint 479 — a coin under the crack is bait too: true when this
   *  leaf sits in the room the answerer can actually reach (the
   *  grafter is room-locked — a coin under a foreign leaf is a lie). */
  seamBaitable?(leaf: Vec3): boolean;
  /** sprint 477/479/480 — a coin under the leaf: fed to buy quiet,
   *  slid cold as bait, or picked off your hip mid-grab. The hand
   *  pockets it into the pouch and remembers the smell. */
  takeCoin?(hot: number, leaf: Vec3): void;
  /** sprint 571 — a coil slid under a leaf the hand is working: it
   *  pockets the wire as graft stock instead of letting it plant. */
  takeCoil?(leaf: Vec3): void;

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
  const colliders: Aabb[] = room?.losBlockers ?? [];
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
