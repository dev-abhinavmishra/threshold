/**
 * Corridor threats — entities that traverse the room chain:
 *   SWEEP    — one forward pass, pressure-wave cues
 *   REPRISE  — forward + rebound passes
 *   REDLINE  — underscript single pass (printer cascade + red lamps)
 *   RETURNER — approaches from AHEAD, forcing retreat to known cover
 *   MAELSTROM— elite pass; if it sees you hide in a cabinet → Stabilization
 *
 * Shared runner mechanics with distinct cue language, timing, and rules.
 */
import * as THREE from 'three';
import { Entity, playerExposed, corridorPath, followPath, pathLength } from './base';
import { v3, v3copy, v3dist, hasLineOfSight, type Vec3 } from '../engine/math';
import type { EntityId } from '../game/types';
import { ENTITY_TUNING } from '../game/config';
import { noiseCanBeHeard, withinRouseRadius } from '../engine/noiseRouse';
import type { SoundEvent } from '../engine/events';
import { MAT } from '../world/materials';
import { tallFigure } from './figure';
import { riggedFigure, RIGGED, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';

export interface CorridorOptions {
  passes?: number;
  /** Returner: path reversed — comes from ahead. */
  fromAhead?: boolean;
  maelstrom?: boolean;
  redline?: boolean;
  /** Behemoth: slow airborne blockade — dragon rig, wide body. */
  behemoth?: boolean;
}

export class CorridorRunner extends Entity {
  private path: ReturnType<typeof corridorPath> = [];
  private traveled = 0;
  private totalLen = 0;
  private pass = 0;
  private maxPasses = 1;
  private pauseUntil = 0;
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private warnT = 0;
  private warned = false;
  private hasKilled = false;
  private opts: CorridorOptions;
  private sawPlayerHide = false;
  private endRoom: number;
  private startRoom = 0;
  private warnTotal = 0;
  private rng!: Rng;
  private brokeLights = new Set<number>();
  private nearMissSpots = new Set<object>();
  private nearMissUntil = 0;
  /** Second touch of a furniture-check — scheduled game-time. */
  private pendingTap = 0;
  /** Path distance the warn front has already creaked past. */
  private lastFrontTick = 0;
  /** Path distance at which the warn front reaches the player's room. */
  private thresholdTravel = 0;
  private frontArrived = false;
  private wasHidden = false;
  private playerHidAt = -99;
  /** Rebound variant: sweep reverses once for a faster surprise pass. */
  private rebounded = false;
  private reboundBoost = 1;
  private stepT = 0;

  constructor(id: EntityId, opts: CorridorOptions = {}) {
    super(id, ENTITY_TUNING[id]);
    this.opts = opts;
    this.maxPasses = opts.passes ?? 1;
    this.endRoom = 0;
  }

  protected override onSpawn(): void {
    const c = this.ctx;
    this.rng = new Rng(c.seed);
    this.endRoom = Math.min(c.rooms.length - 1, c.currentRoomIndex + 2);
    this.startRoom = this.opts.fromAhead
      ? Math.min(c.rooms.length - 1, c.currentRoomIndex + 4)
      : Math.max(0, c.currentRoomIndex - 4);
    this.path = corridorPath(c.rooms, this.startRoom, this.endRoom);
    if (this.opts.fromAhead) this.path = this.path.slice().reverse();
    this.totalLen = pathLength(this.path);
    this.traveled = 0;

    // The telegraph front crawls along the pass route; the distance at
    // which it reaches the player's own door is where the arrival rattle
    // fires — before the body itself gets there.
    const entry = c.rooms[c.currentRoomIndex]?.entryPos;
    this.thresholdTravel = this.totalLen;
    if (entry) {
      let acc = 0;
      for (let i = 0; i < this.path.length - 1; i++) {
        acc += v3dist(this.path[i], this.path[i + 1]);
        if (v3dist(this.path[i], entry) < 0.6) { this.thresholdTravel = acc; break; }
      }
    }

    // Warning cues — each family has a distinct language.
    const tune = this.tuning;
    if (this.id === 'sweep') {
      c.cue('sweep-warn', this.path[0], '[pressure builds — the doors behind you exhale]', { severity: 'warn' });
      for (let i = Math.max(0, c.currentRoomIndex - 2); i <= c.currentRoomIndex; i++) c.flickerRoom(i, 'sweep');
    } else if (this.id === 'reprise') {
      c.cue('reprise-warn', this.path[0], '[a two-tone pulse — something means to pass twice]', { severity: 'warn' });
      for (let i = Math.max(0, c.currentRoomIndex - 2); i <= c.currentRoomIndex; i++) c.flickerRoom(i, 'reprise');
    } else if (this.id === 'redline') {
      c.cue('redline-warn', this.path[0], '[printer cascade — red lamps waking in sequence]', { severity: 'warn' });
      for (let i = Math.max(0, c.currentRoomIndex - 2); i <= c.currentRoomIndex; i++) c.flickerRoom(i, 'reprise');
    } else if (this.id === 'returner') {
      c.cue('returner-warn', this.path[0], '[doors ahead latch in reverse order — turn back]', { severity: 'warn' });
      for (let i = c.currentRoomIndex; i <= Math.min(c.rooms.length - 1, c.currentRoomIndex + 2); i++) c.flickerRoom(i, 'sweep');
    } else if (this.id === 'maelstrom') {
      c.cue('maelstrom-warn', this.path[0], '[a long silence — then a rotating shriek]', { severity: 'danger' });
      for (let i = Math.max(0, c.currentRoomIndex - 2); i <= c.currentRoomIndex; i++) c.flickerRoom(i, 'sweep');
    } else if (this.id === 'behemoth') {
      c.cue('behemoth-warn', this.path[0], '[the ceiling drops a shadow — it is too large for this hall]', { severity: 'danger' });
      for (let i = Math.max(0, c.currentRoomIndex - 3); i <= c.currentRoomIndex; i++) c.flickerRoom(i, 'sweep');
    }
    this.warnT = tune.warningTime * ({ learning: 1.5, standard: 1, hard: 0.78, qa: 1 })[c.difficulty];
    this.warnTotal = this.warnT;

    // Track whether Maelstrom sees the player enter a cabinet.
    if (this.id === 'maelstrom') {
      const checkHidden = () => {
        if (this.ctx.player.hiddenSpot && this.ctx.player.hiddenSpot.kind === 'cabinet') {
          const d = v3dist(this.currentPos(), this.ctx.player.pos);
          if (d < this.tuning.seeRange) this.sawPlayerHide = true;
        }
      };
      this.hideWatch = setInterval(checkHidden, 120);
    }
    }

  private hideWatch: ReturnType<typeof setInterval> | null = null;

  private currentPos() {
    const f = followPath(this.path, this.traveled);
    return f.pos;
  }

  override threatPos(): Vec3 { return this.posApprox(); }

  /** Darkness wave crawling along the pass span during the warning window:
   *  front starts at startRoom and reaches the player's end as warnT drains. */
  override telegraphSpan(): { lo: number; hi: number; dir: number; frac: number } | null {
    if (this.state !== 'warn' || this.warnTotal <= 0) return null;
    return {
      lo: Math.min(this.startRoom, this.endRoom),
      hi: Math.max(this.startRoom, this.endRoom),
      dir: this.opts.fromAhead ? -1 : 1,
      frac: Math.min(1, Math.max(0, 1 - this.warnT / this.warnTotal)),
    };
  }

  /** Approximate world position for systems that need proximity (panic). */
  posApprox(): Vec3 {
    if (this.state === 'warn' || this.path.length === 0) {
      return this.path.length ? this.path[0] : this.ctx.player.pos;
    }
    return this.currentPos();
  }

  private buildMesh(): THREE.Group {
    const g = new THREE.Group();
    if (this.id === 'redline') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.7), MAT.ink());
      body.position.y = 1.1;
      g.add(body);
      const lampRow = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.1), MAT.redLamp());
      lampRow.position.set(0, 2.25, 0.2);
      g.add(lampRow);
    } else if (this.id === 'maelstrom') {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 2.6, 8), MAT.steelDark());
      core.position.y = 1.3;
      g.add(core);
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.3), MAT.brass());
        fin.rotation.y = (i / 4) * Math.PI;
        fin.position.y = 0.8 + i * 0.45;
        g.add(fin);
      }
    } else {
      // Sweep / Reprise / Returner — distinct bodies per runner: gaunt sprinter,
      // armoured brute, antlered thing closing from ahead.
      const kind = this.id === 'behemoth' ? 'dragon' : this.id === 'returner' ? 'monkroose' : this.id === 'reprise' ? 'orc' : 'skeleton';
      const rig = riggedFigure(kind as 'skeleton');
      if (rig) {
        rig.play('move', 0);
        rig.group.scale.multiplyScalar((this.id === 'behemoth' ? 3.4 : 2.6) / RIGGED[kind].height);
        if (this.id === 'behemoth') rig.group.position.y = 0.9; // airborne blockade
        this.rig = rig;
        g.add(rig.group);
      } else {
        const fig = tallFigure({
          height: 2.6,
          face: 'mask',
          spines: true,
          tattered: true,
          hood: this.id === 'sweep',
          band: this.id === 'reprise' ? MAT.steel() : MAT.amber(),
          bandY: this.id === 'returner' ? 2.42 : 2.36,
          eyes: this.id === 'returner' ? 'red' : 'amber',
        });
        g.add(fig);
      }
      if (this.id === 'reprise') {
        const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.38), MAT.steel());
        band2.position.y = 2.15;
        g.add(band2);
      }
    }
    return g;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    if (this.state === 'warn') {
      this.warnT -= dt;
      // rising cue — once, at the half-way point of the warning
      if (!this.warned && this.warnT < this.tuning.warningTime * 0.5) {
        this.warned = true;
        c.cue(this.id + '-approach', this.path[0], '', { severity: 'warn' });
      }
      // The darkness front is heard crawling toward the player: a floor
      // creak every few metres, then the door shivering as it arrives.
      const frac = Math.min(1, Math.max(0, 1 - this.warnT / this.warnTotal));
      const front = frac * this.totalLen;
      if (front > 0.5 && front - this.lastFrontTick > 3.5) {
        this.lastFrontTick = front;
        c.cue('floor-creak', followPath(this.path, front).pos, '', { severity: 'warn' });
      }
      if (!this.frontArrived && front >= this.thresholdTravel) {
        this.frontArrived = true;
        c.duckTone?.(1.8);
        const rp = c.rooms[c.currentRoomIndex]?.entryPos ?? null;
        c.cue('door-rattle', rp, '[the door shivers — it is here]', { severity: 'danger' });
      }
      if (this.warnT <= 0) {
        this.state = 'engage';
        this.mesh = this.buildMesh();
        c.addEntityMesh(this.mesh);
        c.cue(this.id + '-roar', this.path[0], '[it is moving — hide]', { severity: 'danger' });
      }
      return;
    }

    if (this.state === 'engage') {
      // Pause between rebound passes
      if (this.pauseUntil > 0) {
        if (c.now < this.pauseUntil) return;
        this.pauseUntil = 0;
        this.traveled = 0;
        c.cue(this.id + '-return', this.path[0], '[it turns back — hold]', { severity: 'danger' });
      }
      const speed = this.tuning.speed * this.reboundBoost * ({ learning: 0.9, standard: 1, hard: 1.15, qa: 1 })[c.difficulty];
      this.traveled += speed * dt * (c.now < this.nearMissUntil ? 0.35 : 1);
      const f = followPath(this.path, this.traveled);
      this.rig?.update(dt);
      if (this.mesh) {
        this.mesh.position.set(f.pos.x, 0, f.pos.z);
        const nxt = this.path[Math.min(this.path.length - 1, f.seg + 1)];
        this.mesh.rotation.y = Math.atan2(nxt.x - f.pos.x, nxt.z - f.pos.z);
      }
      // Maelstrom: does it see the player hide?
      if (this.id === 'maelstrom' && this.ctx.player.hiddenSpot && !this.sawPlayerHide) {
        if (v3dist(f.pos, this.ctx.player.pos) < this.tuning.seeRange) this.sawPlayerHide = true;
      }
      // Kill check — the runner must be near the player's room segment.
      const p = c.player;
      const d = v3dist(f.pos, p.pos);
      // Positional stride — the pass is heard approaching and receding; cadence
      // follows actual speed so a slowed near-miss reads as hesitant steps.
      this.stepT -= dt;
      if (this.stepT <= 0) {
        const heavy = this.opts.behemoth || this.id === 'maelstrom';
        this.stepT = (heavy ? 0.7 : 0.42) * (this.tuning.speed / Math.max(1, speed));
        c.sound.emit({
          x: f.pos.x, y: 1.0, z: f.pos.z,
          intensity: Math.min(1.3, Math.max(0.15, 1.3 - d / 18)) * (heavy ? 1.25 : 1),
          category: 'footstep', caption: '', source: this.id,
        });
      }
      // Track fresh hides — a runner that watched the door close plays the
      // harder near-miss.
      if (p.hiddenSpot && !this.wasHidden) this.playerHidAt = c.now;
      this.wasHidden = !!p.hiddenSpot;
      // Near-miss: passing the hide slows the thing — once per spot, so a
      // re-hide can still be grazed. Variants keep repeat encounters from
      // reading identically.
      if (p.hiddenSpot && d < 5.5 && !this.nearMissSpots.has(p.hiddenSpot)) {
        this.nearMissSpots.add(p.hiddenSpot);
        const recentHide = c.now - this.playerHidAt < 1.6;
        const pick = this.rng.float();
        if (recentHide && this.id !== 'maelstrom') {
          this.nearMissUntil = c.now + 2.4;
          c.cue('door-breath', p.pos, '[it saw the door close]', { severity: 'danger' });
          this.pendingTap = c.now + 0.8;
        } else if (pick < 0.35) {
          this.nearMissUntil = c.now + 1.8;
          c.cue('door-rattle', p.pos, '[it tests the door of your hiding place]', { severity: 'warn' });
          this.pendingTap = c.now + 0.6;
        } else if (pick < 0.65) {
          this.nearMissUntil = c.now + 2.3;
          c.cue('hide-creak', p.pos, '[it stops — listening]', { severity: 'warn' });
        } else {
          this.nearMissUntil = c.now + 1.2;
          c.cue('hide-creak', p.pos, '[it slows — breathing held]', { severity: 'warn' });
        }
      }
      // The second touch of a furniture-check lands a beat later.
      if (this.pendingTap && c.now >= this.pendingTap) {
        this.pendingTap = 0;
        if (p.hiddenSpot && d < 7) c.cue('knock', p.pos, '[a second touch — patient]', { severity: 'warn' });
      }
      if (!this.hasKilled && d < this.tuning.killRange + 8) {
        const verdict = playerExposed(c, f.pos);
        if (verdict === 'kill' && d < this.tuning.seeRange) {
          this.hasKilled = true;
          this.rig?.play('attack', 0.05);
          c.killPlayer(this.id, this.deathHint());
          return;
        }
      }
      // Light break after passing (Sweep signature).
      if (this.id === 'sweep' && !this.brokeLights.has(c.currentRoomIndex) && d > 14 && d < 40) {
        this.brokeLights.add(c.currentRoomIndex);
        if (this.rng.bool(0.5)) c.flickerRoom(c.currentRoomIndex, 'break');
      }
      if (f.doneT || this.traveled >= this.totalLen) {
        this.pass++;
        // Rebound variant (sweep only): an unannounced second pass back
        // through — catches players who step out as it finishes.
        if (this.id === 'sweep' && this.pass >= this.maxPasses && !this.rebounded && this.rng.bool(0.3)) {
          this.rebounded = true;
          this.path = this.path.slice().reverse();
          this.traveled = 0;
          this.reboundBoost = 1.5;
          this.pauseUntil = c.now + 1.4;
          c.cue('sweep-return', f.pos, '[it is not done — turn around]', { severity: 'danger' });
          return;
        }
        if (this.pass < this.maxPasses) {
          this.pauseUntil = c.now + (this.id === 'reprise' ? this.rng.range(1.6, 3.2) : 0.8);
          return;
        }
        // Maelstrom: if it saw the player hide, trigger stabilization instead of passing
        if (this.id === 'maelstrom' && this.sawPlayerHide && c.player.hiddenSpot) {
          c.cue('maelstrom-attack', f.pos, '[it knows where you are]', { severity: 'danger' });
          this.stabilizeTriggered = true;
        }
        this.state = 'resolve';
        this.stateT = 0;
      }
      return;
    }

    if (this.state === 'resolve') {
      if (this.stateT > 0.6) this.done();
    }
  }

  /** Read by the game: Maelstrom wants the stabilization minigame. */
  stabilizeTriggered = false;

  private deathHint(): string {
    switch (this.id) {
      case 'sweep': return 'Sweep follows open thresholds. Break its sight or conceal yourself before the pressure peaks.';
      case 'reprise': return 'Reprise comes back. Stay hidden through every pass, or find deep cover.';
      case 'redline': return 'Redline announces with printer cascades and red lamps. Get behind a cabinet door or deep corner.';
      case 'returner': return 'The Returner approaches from ahead. Retreat to cover you have already seen.';
      case 'maelstrom': return 'Maelstrom watches where you hide. Reach a physical safe spot it cannot read.';
      default: return 'Hide before it passes.';
    }
  }

  protected override onDone(): void {
    if (this.hideWatch) clearInterval(this.hideWatch);
    if (this.mesh) {
      this.ctx.removeEntityMesh(this.mesh);
      this.mesh = null;
    }
  }
}

/* ============================ WARDEN ============================ */
/** Corridor patrol — paces a corridor room's spine between its two doors.
 *  Runners pass through and are gone; the Warden STAYS, walking its post,
 *  so crossing the corridor becomes the stealth problem: slip by while its
 *  back is turned or break its line of sight when the whistle blows.
 *  Seen in the open → whistle blast (rouses everything in earshot) → charge. */
export class Warden extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private a = v3();           // patrol endpoints: the room's entry/exit doors
  private b = v3();
  private towardB = true;
  private pauseT = 0;
  private hostRoom = -1;
  private charging = false;
  private seenT = 0;          // continuous seconds the player has been in view
  private lostT = 0;          // seconds since the charge lost sight
  private lastSeen = v3();    // where it last saw you — it charges THAT, not your live pos
  private stepT = 0;
  private expireT = 120;
  private investigate: Vec3 | null = null;   // a heard noise it walks to check
  private investigateScan = 0;
  private noiseUnsub: (() => void) | null = null;

  constructor() { super('warden', ENTITY_TUNING.warden); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.hostRoom = c.currentRoomIndex;
    this.a = v3(room.entryPos.x, 0, room.entryPos.z);
    this.b = v3(room.exitPos.x, 0, room.exitPos.z);
    this.pos = v3((this.a.x + this.b.x) / 2, 0, (this.a.z + this.b.z) / 2);
    const rig = riggedFigure('orc');
    this.rig = rig;
    const g = rig?.group ?? tallFigure({
      height: 2.0, body: MAT.shadowFigure(), face: 'plate', eyes: 'white', band: MAT.brass(), bandY: 1.55,
    });
    // A whistle on a brass cord — the thing that calls the floor on you.
    const whistle = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), MAT.brass());
    whistle.position.set(0, 1.5, 0.18);
    whistle.rotation.x = Math.PI / 2;
    g.add(whistle);
    g.position.set(this.pos.x, 0, this.pos.z);
    this.mesh = g;
    c.addEntityMesh(g);
    rig?.play('move');
    this.state = 'engage';
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    c.cue('husk-foot', this.pos, '[measured pacing — a walk, not a hunt]', { severity: 'warn' });
  }

  /** Loud noise pulls it off the a–b line: it walks to the sound and scans.
   *  Sprint strides, slams, machine knocks, wind-up lures — the windAlarm
   *  is a real lure here, not just flavour. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'engage' || this.charging || this.investigate) return;
    if (e.source || !noiseCanBeHeard(e)) return;
    if (!withinRouseRadius(e, this.pos.x, this.pos.z)) return;
    // Noise through walls reaches it, but it can only check what's in its
    // own room — a point beyond the plaster would have it walk through it.
    const room = c.rooms[this.hostRoom];
    if (room?.spec) {
      const dx = e.x - room.origin.x, dz = e.z - room.origin.z;
      const cs = Math.cos(room.yaw), sn = Math.sin(room.yaw);
      if (Math.abs(dx * cs - dz * sn) > room.spec.width / 2 + 0.25
        || Math.abs(dx * sn + dz * cs) > room.spec.depth / 2 + 0.25) return;
    }
    this.investigate = v3(e.x, 0, e.z);
    this.investigateScan = 0;
    c.cue('floor-creak', this.pos, '[it turns toward the noise]', { severity: 'warn' });
    this.rig?.play('move', 0.1);
  }

  /** In-view test: same room, in range, unhidden, LOS clear, and in front of
   *  its walk (the behind check is skipped while charging — it already has you). */
  private canSee(): boolean {
    const c = this.ctx;
    const p = c.player;
    if (p.dead || p.hiddenSpot) return false;
    const d = v3dist(this.pos, p.pos);
    if (d > this.tuning.seeRange) return false;
    const room = c.rooms[this.hostRoom];
    if (!room) return false;
    const eyeW = v3(this.pos.x, 1.7, this.pos.z);
    const eyeP = v3(p.pos.x, p.pos.y + 1.5, p.pos.z);
    if (!hasLineOfSight(eyeW, eyeP, room.losBlockers)) return false;
    if (!this.charging && d > 1.6 && this.mesh) {
      const hx = Math.sin(this.mesh.rotation.y), hz = Math.cos(this.mesh.rotation.y);
      if ((hx * (p.pos.x - this.pos.x) / d + hz * (p.pos.z - this.pos.z) / d) < 0.3) return false;
    }
    return true;
  }

  private updateCharge(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    if (this.canSee()) { this.lostT = 0; v3copy(this.lastSeen, p.pos); }
    else this.lostT += dt;
    if (this.lostT > 2.2 || p.dead) {
      this.charging = false;
      this.lostT = 0;
      this.seenT = -1.4;      // grace — it doesn't instantly re-spot what it lost
      c.cue('floor-creak', this.pos, '[the whistle dies — it resumes its walk]', { severity: 'info' });
      return;
    }
    const dx = this.lastSeen.x - this.pos.x, dz = this.lastSeen.z - this.pos.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      const step = Math.min(len, 3.5 * dt);
      this.pos.x += (dx / len) * step;
      this.pos.z += (dz / len) * step;
    }
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, 0, this.pos.z);
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    if (v3dist(this.pos, p.pos) < 1.0 && !p.dead) {
      c.damagePlayer(this.tuning.damage, 'warden', 'Its whistle calls the floor — break its line of sight and it loses the scent.');
      c.cue('husk-foot', this.pos, '[the Warden strikes — and returns to its walk]', { severity: 'danger' });
      this.charging = false;
      this.lostT = 0;
      this.seenT = -1.4;
      // Resume the walk from the nearer end.
      this.towardB = v3dist(this.pos, this.b) < v3dist(this.pos, this.a);
    }
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.rig?.update(dt);
    this.expireT -= dt;
    if (c.currentRoomIndex !== this.hostRoom || this.expireT <= 0) { this.done(); return; }

    if (this.charging) { this.updateCharge(dt); return; }

    if (this.canSee()) {
      this.seenT += dt;
      if (this.seenT > 0.35) {
        this.charging = true;
        this.lostT = 0;
        v3copy(this.lastSeen, p.pos);
        c.cue('alarm-ring', this.pos, '[a whistle — the Warden has you]', { severity: 'danger' });
        c.sound.emit({ x: this.pos.x, y: 1.6, z: this.pos.z, intensity: 1.0, category: 'entity-cue', caption: '[whistle blast]', source: this.id });
        this.rig?.play('move', 0.05);
        return;
      }
    } else {
      this.seenT = Math.max(this.seenT > 0 ? 0 : this.seenT, this.seenT - dt * 2);
    }

    // Off the line, checking a noise it heard — its eyes still work.
    if (this.investigate) {
      const dx = this.investigate.x - this.pos.x, dz = this.investigate.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.4) {
        const step = Math.min(len, this.tuning.speed * 1.4 * dt);
        this.pos.x += (dx / len) * step;
        this.pos.z += (dz / len) * step;
        if (this.mesh) {
          this.mesh.position.set(this.pos.x, 0, this.pos.z);
          this.mesh.rotation.y = Math.atan2(dx, dz);
        }
      } else {
        this.investigateScan += dt;
        if (this.mesh) this.mesh.rotation.y += dt * 2.4;
        if (this.investigateScan > 1.8) this.investigate = null;
      }
      return;
    }

    // Patrol between the doors; at each end it turns and scans.
    if (this.pauseT > 0) {
      this.pauseT -= dt;
      if (this.mesh) this.mesh.rotation.y += dt * 0.9;
      return;
    }
    const target = this.towardB ? this.b : this.a;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.35) {
      this.towardB = !this.towardB;
      this.pauseT = 1.6;
      return;
    }
    const step = Math.min(len, this.tuning.speed * dt);
    this.pos.x += (dx / len) * step;
    this.pos.z += (dz / len) * step;
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, 0, this.pos.z);
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    this.stepT += dt;
    if (this.stepT > 0.55) {
      this.stepT = 0;
      c.sound.emit({ x: this.pos.x, y: 0.3, z: this.pos.z, intensity: 0.32, category: 'footstep', caption: '', source: this.id });
    }
  }

  override threatPos(): Vec3 | null { return this.state === 'engage' ? this.pos : null; }

  protected override onDone(): void {
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
  }
}
