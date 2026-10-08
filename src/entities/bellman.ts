/**
 * The Bellman — the hotel's trailing usher. Scheduled on a room: when the
 * player enters, it is already standing at the door they just closed behind
 * them, a few steps back. It then walks the player's own breadcrumb trail,
 * slightly slower than a walking stride — it can never catch you while you
 * keep moving; it only reaches you if you linger.
 *
 *   - Doors don't stop it, they announce it: closed leaves on its path get a
 *     latch-rattle knock, then swing open a beat later.
 *   - Direct observation freezes it — look at it and it waits; keep looking
 *     and it yields, folding back into the hall. A lit lamp is the same gaze.
 *   - It will not cross into resting rooms: at a safe-room threshold it
 *     stops, then gives up the trail.
 *   - Starvation: caught up to the newest crumb with nothing left to follow,
 *     it paces a moment and fades — "the second set of steps falls away".
 *
 * Counterplay summary: keep moving, or hold it in your sight until it quits.
 * Hiding also breaks it — it reads no crumb it can't reach.
 */
import * as THREE from 'three';
import { Entity, playerExposed } from './base';
import { v3, v3dist, v3norm, v3scale, hasLineOfSight, type Vec3 } from '../engine/math';
import type { Door, RoomInstance } from '../game/types';
import { ENTITY_TUNING, SAFE_ROOM_TEMPLATES } from '../game/config';
import { MAT } from '../world/materials';
import { tallFigure } from './figure';
import { riggedFigure, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';
import { noiseCanBeHeard, withinRouseRadius } from '../engine/noiseRouse';
import { doorBetween, atRoomDoor } from '../engine/doorGeo';
import type { SoundEvent } from '../engine/events';

const KNOCK_LINES = [
  '[the latch rattles — three slow turns]',
  '[a knock — patient, courteous]',
  '[the door shakes once — it knows the handle]',
];
const GAZE_LINES = [
  '[it goes still under your gaze]',
  '[it waits — hands folded]',
];
const BAR_LINES = [
  '[it tests the bar]',
  '[the latch strains against your weight]',
  '[a palm flat on the far panel — it pushes]',
];
const KEYS_LINES = [
  '[a ring of keys works the lock]',
  '[keys turning — one after another]',
  '[metal in the keyway — patient, unhurried]',
];

export class Bellman extends Entity {
  private pos = v3();
  private group: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private rng = new Rng(0);
  private crumb = 0;             // index into ctx.playerTrail
  private watchT = 0;            // cumulative seconds under direct gaze
  private starveT = 0;           // seconds with no fresh crumb
  private doorHoldT = 0;         // seconds blocked at a safe-room threshold or a braced door
  private rattleT = 0;           // cadence for testing a braced leaf
  private stepT = 0.4;
  private gazeCueAt = -10;
  private pendingDoors: { d: Door; at: number }[] = [];
  private knocked = new Set<object>();
  private noiseCrumb: Vec3 | null = null;  // a loud sound it detours to sniff
  private noiseUnsub: (() => void) | null = null;
  /** sprint 396 — the ring was cut: no more keys. Locked leaves are
   *  walls for him now, same as for you. */
  private keysCut = false;

  /** True while he stands yielded under a close, unbroken stare — the
   *  one moment the keyring can be cut. The Game mints 'Cut the
   *  keyring' on his chest while this holds. */
  get cuttable(): boolean {
    return this.state === 'engage' && !this.keysCut && this.underGaze();
  }

  /** The ring parts — the house's master keys scatter on the floor.
   *  Gone, not taken: the reward is his hobbling, not your pocket. The
   *  chime pulls his eyes down a beat (a stagger — the escape window
   *  you earn for reaching this far). */
  cutKeys(): void {
    const c = this.ctx;
    this.keysCut = true;
    this.stagger(1.6);
    c.cue('item', v3(this.pos.x, 0.5, this.pos.z), "[the ring parts — the house's keys scatter at his feet]", { severity: 'warn' });
    c.sound.emit({ x: this.pos.x, y: 0.5, z: this.pos.z, intensity: 0.35, category: 'item', caption: '[keys scatter on the floor]', source: this.id });
  }

  constructor() { super('bellman', ENTITY_TUNING.bellman); }

  protected onSpawn(): void {
    const c = this.ctx;
    this.rng = new Rng(c.seed);
    this.keysCut = false;
    // Start at the live head of the trail — it picks up where the player is
    // now, not where the run began.
    this.crumb = Math.max(0, (c.playerTrail?.length ?? 0) - 1);
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    // Start on the outside of the door the player just closed — the room's
    // entry door, owned by this room.
    const room = c.rooms[c.currentRoomIndex];
    const entry = room?.doors.find((d) => d.id.endsWith('-in'));
    this.pos = v3(entry?.pos.x ?? c.player.pos.x, 0, entry?.pos.z ?? c.player.pos.z);
    const rig = riggedFigure('monkroose');
    this.rig = rig;
    const g = rig?.group ?? tallFigure({
      height: 2.1, body: MAT.shadowFigure(), face: 'mask',
      band: MAT.brass(), bandY: 1.82, eyes: 'amber', tattered: true,
    });
    // Brass service bell at the end of its arm — the whole joke of the thing.
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.11, 8), MAT.brass());
    bell.position.set(0.34, 1.25, 0.24);
    g.add(bell);
    g.position.copy(this.pos);
    this.group = g;
    c.addEntityMesh(g);
    this.rig?.play('idle');
    c.cue('knock', v3(this.pos.x, 1.4, this.pos.z), '[a second set of steps — keeping pace]', { severity: 'warn' });
    c.sound.emit({ x: this.pos.x, y: 1, z: this.pos.z, intensity: 0.5, category: 'entity-cue', caption: '[knock]', source: this.id });
  }

  private roomAt(pos: Vec3): RoomInstance | null {
    for (const r of this.ctx.rooms) {
      const spec = r.spec;
      if (!spec) continue;
      const dx = pos.x - r.origin.x, dz = pos.z - r.origin.z;
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= spec.width / 2 + 0.25 && Math.abs(lz) <= spec.depth / 2 + 0.25) return r;
    }
    return null;
  }

  /** Player looking directly at it: gaze ray + line of sight + close enough. */
  private underGaze(): boolean {
    const c = this.ctx;
    const p = c.player;
    const d = v3dist(this.pos, p.pos);
    if (d > 11) return false;
    const dir = v3();
    p.lookDir(dir);
    const to = v3(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z);
    v3norm(to, to);
    if (dir.x * to.x + dir.z * to.z < 0.7) return false;
    const eye = v3();
    p.eyePos(eye);
    const room = this.roomAt(p.pos);
    const blockers = room ? room.losBlockers : [];
    if (!hasLineOfSight(v3(this.pos.x, 1.7, this.pos.z), eye, blockers)) return false;
    // sprint 399 — the stare must meet his eyes through air: a shut leaf
    // between them blocks the gaze even though room losBlockers can't know
    // the leaf is there (door state is runtime, not room geometry). Without
    // this the fold always beat the keys pass — the player could banish him
    // through a locked door he was still keying, for free.
    const his = this.roomAt(this.pos);
    for (const r of [room, his]) {
      if (!r) continue;
      for (const dor of r.doors) {
        if (!dor.opening && (dor.openT ?? 0) < 0.5 && doorBetween(dor, this.pos, p.pos)) return false;
      }
    }
    return true;
  }

  private knockDoor(): void {
    const c = this.ctx;
    const ready = this.pendingDoors.filter((p) => c.now >= p.at);
    this.pendingDoors = this.pendingDoors.filter((p) => c.now < p.at);
    for (const pending of ready) {
      if (pending.d.heldBy) continue;  // braced in the 0.85s since the knock
      pending.d.opening = true;
      c.cue('door-open', { x: pending.d.pos.x, y: 1.2, z: pending.d.pos.z }, '[the door swings for it]', { severity: 'warn' });
    }
    for (const r of c.rooms) {
      for (const d of r.doors) {
        if (d.opening || d.openT > 0.15 || d.locked || d.falseDoor || d.heldBy || this.knocked.has(d)) continue;
        if (v3dist(this.pos, d.pos) > 1.25) continue;
        this.knocked.add(d);
        this.pendingDoors.push({ d, at: c.now + 0.85 });
        c.cue('door-rattle', { x: d.pos.x, y: 1.2, z: d.pos.z }, KNOCK_LINES[this.rng.int(0, KNOCK_LINES.length - 1)], { severity: 'warn' });
        c.sound.emit({ x: d.pos.x, y: 1.2, z: d.pos.z, intensity: 0.55, category: 'door', caption: '[rattle]', source: this.id });
        return;
      }
    }
  }

  /** A closed leaf on the path to the target — it waits for the swing it
   *  knocked for, or holds (and eventually quits) at a braced one. Radius
   *  sits inside the 1.25 knock reach so a head-on approach knocks first. */
  private blockingDoorNear(target: Vec3): Door | null {
    // Cluster doors stack in the seam — a held leaf is the real obstacle and
    // must win over a merely-closed sibling, or the walk waits forever on a
    // leaf nobody knocked (the wait-for-swing branch has no timeout).
    let held: Door | null = null;
    let closed: Door | null = null;
    for (const r of this.ctx.rooms) {
      for (const d of r.doors) {
        if (d.opening || d.openT > 0.5 || d.falseDoor) continue;
        if (v3dist(this.pos, d.pos) > 1.2) continue;
        if (!doorBetween(d, this.pos, target)) continue;
        if (d.heldBy) held ??= d;
        else closed ??= d;
      }
    }
    return held ?? closed;
  }

  /** Rattle against a brace, on a cadence — felt through the leaf. */
  private rattleBar(dt: number, held: Door): void {
    const c = this.ctx;
    this.rattleT -= dt;
    if (this.rattleT > 0) return;
    this.rattleT = 1.6;
    c.cue('door-rattle', { x: held.pos.x, y: 1.2, z: held.pos.z },
      BAR_LINES[this.rng.int(0, BAR_LINES.length - 1)], { severity: 'warn' });
    c.sound.emit({ x: held.pos.x, y: 1.2, z: held.pos.z, intensity: 0.55, category: 'door', caption: '[rattle]', source: this.id });
  }

  protected onUpdate(dt: number): void {
    const c = this.ctx;
    if (this.state === 'warn') {
      if (this.stateT >= 1.5) { this.state = 'engage'; this.stateT = 0; }
      this.rig?.update(dt);
      return;
    }
    if (this.state !== 'engage') return;

    const p = c.player;
    const trail = c.playerTrail ?? [];
    const d = v3dist(this.pos, p.pos);

    // Open doors it reaches. Braced leaves it can only rattle.
    this.knockDoor();

    // Observation freeze — the counterplay. Being watched yields after 2.6s.
    const frozen = this.underGaze();
    if (frozen) {
      // At arm's reach the stare pins him — he cannot fold away from a
      // gaze this close (sprint 396: this is the cut-the-keyring window).
      if (d >= 1.7) this.watchT += dt;
      if (c.now - this.gazeCueAt > 7 && d < 9) {
        this.gazeCueAt = c.now;
        c.cue('hide-creak', v3(this.pos.x, 1.4, this.pos.z), GAZE_LINES[this.rng.int(0, GAZE_LINES.length - 1)], { severity: 'info' });
      }
      if (this.watchT >= 2.6) {
        c.cue('door-breath', v3(this.pos.x, 1.4, this.pos.z), '[it folds back into the hall]', { severity: 'warn' });
        this.done();
        this.rig?.update(dt);
        return;
      }
      this.rig?.play('idle');
      this.rig?.update(dt);
      return;
    }
    this.watchT = Math.max(0, this.watchT - dt * 0.5);

    // Touch kill — exposed and unfrozen.
    if (!p.dead && !this.rising() && d < this.tuning.killRange && playerExposed(c, this.pos) === 'kill') {
      this.rig?.play('attack', 0.05);
      c.killPlayer(this.id, 'It had been walking your steps all along.');
      this.done();
      this.rig?.update(dt);
      return;
    }

    // Follow the trail — or the crumb a loud noise just dropped for it.
    let moved = false;
    while (this.crumb < trail.length && v3dist(this.pos, trail[this.crumb]) < 0.4) this.crumb++;
    const target = this.noiseCrumb ?? (trail[this.crumb] as Vec3 | undefined);
    if (this.noiseCrumb && v3dist(this.pos, this.noiseCrumb) < 0.45) this.noiseCrumb = null;
    if (target) {
      // Won't cross into resting rooms — hold at the boundary. Sound it
      // heard in a resting room it simply refuses to chase.
      const room = this.roomAt(target);
      // Doors it can't pass hold it at the threshold: a knocked closed leaf
      // it waits out (the swing is a beat behind the rattle); a braced leaf
      // it tests, then loses interest and drifts off.
      const blocking = this.blockingDoorNear(target);
      if (room && SAFE_ROOM_TEMPLATES.has(room.templateId)) {
        if (this.noiseCrumb && target === this.noiseCrumb) {
          this.noiseCrumb = null;
        } else {
          this.doorHoldT += dt;
          if (this.doorHoldT > 5.5) {
            c.cue('knock', v3(this.pos.x, 1.4, this.pos.z), '[it stops at the threshold — it will not follow]', { severity: 'info' });
            this.done();
            return;
          }
        }
      } else if (blocking?.locked && !this.keysCut) {
        // The house's own ring: a locked leaf is a pause, not a wall.
        // The keys work for a beat, the lock turns for it, and it comes
        // through the seam — the leaf never opens and stays locked for
        // you. Locks save you from guests, not from the staff. (With the
        // ring cut he has no keys — a locked leaf is just a wall now.)
        this.doorHoldT += dt;
        this.rattleT -= dt;
        if (this.rattleT <= 0) {
          this.rattleT = 1.9;
          c.cue('door-rattle', { x: blocking.pos.x, y: 1.2, z: blocking.pos.z },
            KEYS_LINES[this.rng.int(0, KEYS_LINES.length - 1)], { severity: 'warn' });
          c.sound.emit({ x: blocking.pos.x, y: 1.2, z: blocking.pos.z, intensity: 0.55, category: 'door', caption: '[a ring of keys works the lock]', source: this.id });
        }
        if (this.doorHoldT > 3.2) {
          const to = v3(target.x - this.pos.x, 0, target.z - this.pos.z);
          const len = v3dist(target, this.pos) || 1;
          v3scale(to, to, 1 / len);
          this.pos.x = blocking.pos.x + to.x * 0.8;
          this.pos.z = blocking.pos.z + to.z * 0.8;
          this.doorHoldT = 0;
          c.cue('door-open', { x: blocking.pos.x, y: 1.2, z: blocking.pos.z }, '[the lock turns for it — the leaf never opens]', { severity: 'warn' });
          c.sound.emit({ x: blocking.pos.x, y: 1.2, z: blocking.pos.z, intensity: 0.5, category: 'door', caption: '[the lock turns for it]', source: this.id });
        }
      } else if (blocking?.heldBy) {
        this.doorHoldT += dt;
        this.rattleBar(dt, blocking);
        if (blocking.heldBy === 'wedge') {
          // Rubber gives before weight: after a few seconds of worrying the
          // chock it kicks it loose and comes through — the wedge buys you
          // distance, not a stand.
          if (this.doorHoldT > 6) {
            for (const r of this.ctx.rooms) {
              for (const d of r.doors) {
                if (d.heldBy === 'wedge' && v3dist(d.pos, blocking.pos) < 0.7) d.heldBy = undefined;
              }
            }
            // the kick doesn't eat the chock — it slides under the leaf
            // to the far side, where the Game drops it as gatherable loot
            c.wedgeKicked?.(blocking.pos, this.pos);
            c.cue('door-slam', v3(blocking.pos.x, 1.2, blocking.pos.z), '[the wedge skids loose — kicked under the leaf]', { severity: 'warn' });
            c.sound.emit({ x: blocking.pos.x, y: 1.2, z: blocking.pos.z, intensity: 0.85, category: 'door', caption: '[the wedge skids loose]', source: this.id });
            this.doorHoldT = 0;
          }
        } else if (this.doorHoldT > 14) {
          c.cue('knock', v3(this.pos.x, 1.4, this.pos.z), '[its steps fade down the hall — it lost interest]', { severity: 'info' });
          this.done();
          return;
        }
      } else if (blocking) {
        // Waiting for a knocked leaf to swing — a pause, not a stall, and
        // bounded: a leaf that swung and shut behind it stays in `knocked`,
        // so it never re-knocks — without a bound the walk parks here
        // forever on a leaf that never answers.
        this.doorHoldT += dt;
        if (this.doorHoldT > 8) {
          c.cue('knock', v3(this.pos.x, 1.4, this.pos.z), '[its steps fade down the hall — it lost interest]', { severity: 'info' });
          this.done();
          return;
        }
      } else {
        this.doorHoldT = 0;
        const to = v3(target.x - this.pos.x, 0, target.z - this.pos.z);
        const len = v3dist(target, this.pos);
        if (len > 1e-4) {
          v3scale(to, to, 1 / len);
          const step = Math.min(len, this.tuning.speed * dt);
          this.pos.x += to.x * step;
          this.pos.z += to.z * step;
          moved = true;
        }
      }
      this.starveT = 0;
    } else {
      // Trail exhausted — it has reached where you last stood.
      this.starveT += dt;
      if (this.starveT > 9) {
        c.cue('floor-creak', v3(this.pos.x, 1, this.pos.z), '[the second set of steps falls away]', { severity: 'info' });
        this.done();
        return;
      }
    }

    // Face along its motion / toward the player when close.
    if (this.group) {
      if (d < 6) {
        this.group.rotation.y = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      } else if (target) {
        this.group.rotation.y = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
      }
      this.group.position.copy(this.pos);
    }

    // Positional footfalls — heard behind you, keeping pace.
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = moved ? 0.55 : 0.9;
      c.sound.emit({
        x: this.pos.x, y: 1.0, z: this.pos.z,
        intensity: Math.min(0.85, Math.max(0.1, 1.15 - d / 14)),
        category: 'footstep', caption: '', source: this.id,
      });
    }

    this.rig?.play(moved ? 'move' : 'idle');
    this.rig?.update(dt);
  }

  /** A loud noise drops a virtual crumb — it stoops to sniff the sound,
   *  then resumes the trail. Sprint strides and slams feed it too: noise
   *  you make becomes part of the path it walks. Frozen under your gaze it
   *  hears nothing.
   */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    // 'warn' counts — a crumb dropped while it approaches still lands once it engages.
    if ((this.state !== 'engage' && this.state !== 'warn') || e.source) return;
    if (this.underGaze()) return;
    if (!noiseCanBeHeard(e)) return;
    if (!withinRouseRadius(e, this.pos.x, this.pos.z)) return;
    // Can't ghost a wall for a sound — noise in another room is reachable
    // only while it stands at one of that room's doors (it lives at
    // thresholds); the rest is still answered by your trail itself.
    const crumbRoom = this.roomAt(v3(e.x, 0, e.z));
    if (crumbRoom && crumbRoom !== this.roomAt(this.pos)) {
      if (!atRoomDoor(crumbRoom, this.pos)) return;
    }
    if (this.noiseCrumb && v3dist(this.noiseCrumb, e) < 0.6) return;
    this.noiseCrumb = v3(e.x, 0, e.z);
    c.cue('knock', v3(this.pos.x, 1.4, this.pos.z), '[it stoops to the sound]', { severity: 'warn' });
  }

  /** The trail array dropped its oldest crumb — keep our cursor aligned. */
  override trailShifted(): void { this.crumb = Math.max(0, this.crumb - 1); }

  override threatPos(): Vec3 | null { return this.state === 'engage' ? this.pos : null; }

  protected override onDone(): void {
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
    if (this.group) { this.ctx.removeEntityMesh(this.group); this.group = null; }
    this.rig = null;
  }
}
