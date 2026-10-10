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
import { doorBetween, atRoomDoor, pointInRoom, shutLeafBlockers } from '../engine/doorGeo';
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
  private noiseUnsub: (() => void) | null = null;
  private bellAnswered = false;
  /** A crack it was caught watching — the pass slows over that leaf once. */
  private crackLeaf: Vec3 | null = null;

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
    // The Returner answers loud noise while still latching doors ahead —
    // the crew's bells were wired for it, and a pulled alarm is a summons.
    if (this.id === 'returner') this.noiseUnsub = c.sound.on((e) => this.hear(e));
    }

  /** A crash within earshot of the latching end shortens the warning to a
   *  heartbeat — it answers the bell once, then it's already coming. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'warn' || this.bellAnswered) return;
    if (e.source || !noiseCanBeHeard(e)) return;
    const at = this.path[0] ?? c.player.pos;
    if (!withinRouseRadius(e, at.x, at.z)) return;
    this.bellAnswered = true;
    this.warnT = Math.min(this.warnT, 1.0);
    c.cue('returner-warn', at, '[the latching quickens toward the sound]', { severity: 'warn' });
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
      this.bootSpill(f.pos);
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
      // sprint 464 — the eye told: a crack it met your kneel through
      // slows the pass over that leaf — it sniffs the seam on the way by.
      if (this.crackLeaf && v3dist(f.pos, this.crackLeaf) < 1.3) {
        this.crackLeaf = null;
        this.nearMissUntil = c.now + 2.2;
        this.pendingTap = c.now + 0.8;
        c.cue('door-breath', f.pos, '[it slows over the seam — it tasted the crack]', { severity: 'warn' });
      }
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

  /** The eye at the crack: a pass is rail-bound — it can't turn aside —
   *  but a kneel it watched lands where the route already runs: it slows
   *  through your leaf like it smelled the seam. One sniff per sighting. */
  override eyeTell(_at: Vec3, leaf?: Vec3): void {
    if (this.state !== 'engage' || !leaf) return;
    this.crackLeaf = v3copy(v3(), leaf);
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
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
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
  private investigateKind: string | null = null; // which sign it's checking (noise checks carry none)
  private pocketed = 0; // felt wraps confiscated off blinded eyes — carried, not deleted
  private pocketedChocks = 0; // sprint 489 — kicked chocks confiscated off the floor, same rule
  private pocketedSprings = 0; // sprint 578 — loose sprung plates pocket the same way
  private pocketedBelts = 0; // sprint 593 — pulled drive belts pocket the same way
  private pocketedLenses = 0; // sprint 601 — torn eye lenses pocket the same way
  // sprint 537 — a burning lamp is loose goods too: he pinches it out
  // and pockets it, charge still draining under the coat. A stagger
  // spills it back still burning (s539).
  private pocketedLamps: number[] = [];

  /** The house keeps what it takes — until it staggers. A floorkeeper
   *  that goes down (your wire, the glass, a wet floor) spills the
   *  wraps it peeled where they fell — confiscation is carried, and
   *  carried means it can be lost. */
  override stagger(seconds: number): void {
    super.stagger(seconds);
    if (this.pocketed > 0) {
      const n = this.pocketed;
      this.pocketed = 0;
      this.ctx.dropWraps?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it goes down — the felt it pocketed scatters]', { severity: 'warn' });
    }
    if (this.pocketedChocks > 0) {
      const n = this.pocketedChocks;
      this.pocketedChocks = 0;
      this.ctx.spillChocks?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it goes down — the chocks it pocketed scatter too]', { severity: 'warn' });
    }
    if (this.pocketedSprings > 0) {
      const n = this.pocketedSprings;
      this.pocketedSprings = 0;
      this.ctx.spillSprings?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it goes down — the plates it pocketed scatter too]', { severity: 'warn' });
    }
    if (this.pocketedBelts > 0) {
      const n = this.pocketedBelts;
      this.pocketedBelts = 0;
      this.ctx.spillBelts?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it goes down — the belts it pocketed slap the boards]', { severity: 'warn' });
    }
    if (this.pocketedLenses > 0) {
      const n = this.pocketedLenses;
      this.pocketedLenses = 0;
      this.ctx.spillLenses?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it goes down — the glass it pocketed slaps the boards]', { severity: 'warn' });
    }
    if (this.pocketedLamps.length > 0) {
      const bs = this.pocketedLamps;
      this.pocketedLamps = [];
      this.ctx.spillLamps?.(this.pos, bs);
      this.ctx.cue('floor-creak', this.pos,
        '[it goes down — the lamp rolls out still burning]', { severity: 'warn' });
    }
  }
  private scentT = 0;                          // evidence polling
  private signReads = 0;                       // marks it has weighed in its room
  private learnedCued = false;                 // the second read teaches — once
  private braceShoveT = 0;                     // seconds since it last shouldered a live brace
  private workUntil = 0;                       // mid-doorwork hold: it stands at a bound leaf and works the bind
  private noiseUnsub: (() => void) | null = null;

  /** The second read teaches: a warden that has weighed two marks knows
   *  the floor is worked — faster line, shorter pauses, a longer scan
   *  at whatever it does check. */
  private get learned(): boolean { return this.signReads >= 2; }

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
    // In-room noise it checks directly. Noise in the NEXT room reaches it
    // too — but only when its patrol has brought it to that room's door,
    // so it can shoulder through instead of walking the plaster.
    const room = c.rooms[this.hostRoom];
    if (room?.spec && !pointInRoom(room, e.x, e.z)) {
      const noiseRoom = c.rooms.find((r) => r !== room && pointInRoom(r, e.x, e.z));
      if (!noiseRoom || !atRoomDoor(noiseRoom, this.pos, 2.2)) return;
    }
    this.investigate = v3(e.x, 0, e.z);
    this.investigateKind = null;
    this.investigateScan = 0;
    c.cue('floor-creak', this.pos, '[it turns toward the noise]', { severity: 'warn' });
    this.rig?.play('move', 0.1);
  }

  /** The eye at the crack: it met your stoop through the gap — the kneel
   *  lands as an investigate point on your side of the leaf, and its
   *  usual door-work decides what the leaf does next (shoulder through
   *  or turn back on a held leaf). */
  override eyeTell(at: Vec3): void {
    if (this.state !== 'engage' || this.charging || this.investigate) return;
    this.investigate = v3(at.x, 0, at.z);
    this.investigateKind = null;
    this.investigateScan = 0;
    this.ctx.cue('floor-creak', this.pos, '[it turns toward the crack]', { severity: 'warn' });
    this.rig?.play('move', 0.1);
  }

  /** Doors on the way to a heard noise: braced or locked leaves turn it
   *  back; everything else it puts a shoulder through and keeps walking. */
  private doorOnPath(): 'blocked' | 'working' | null {
    if (!this.investigate) return null;
    const c = this.ctx;
    // Cluster doors stack in the seam — scan every leaf on the path across
    // all rooms before deciding, or iteration order decides: a braced or
    // locked leaf turns it back even when a merely-closed sibling of the
    // same aperture would otherwise answer first.
    let free: { pos: Vec3 } | null = null;
    for (const r of c.rooms) {
      for (const d of r.doors) {
        if (d.opening || d.openT > 0.5 || d.falseDoor) continue;
        if (v3dist(this.pos, d.pos) > 1.1 || !doorBetween(d, this.pos, this.investigate)) continue;
        if (d.heldBy === 'wired') {
          // sprint 433 — wire yields slower than a chock: he works the
          // bind over two contacts, then it parts and the coil drops.
          // sprint 454 — the first pass only strains: he stands at the
          // leaf and works it instead of giving the check up.
          if (c.now < this.workUntil) return 'working';
          if (this.ctx.strainWire?.(d.pos.x, d.pos.z) === 'freed') {
            free ??= d;
            continue;
          }
          this.workUntil = c.now + 2.2;
          return 'working';
        }
        if (d.heldBy === 'player' && v3dist(c.player.pos, d.pos) <= 1.9) {
          // sprint 454 — a fresh walker's wind-up isn't refusal: inside
          // the shoulder's cooldown he waits out the remainder at the
          // leaf rather than abandoning the check he just took
          if (this.braceShoveT < 4) return 'working';
          // sprint 446 — your weight is answered here too: a live brace
          // gets one shoulder per visit before he turns away. The shove
          // moves the holder, not the hold — past the brace's keep radius
          // the grip fails on the Game's own rule.
          this.braceShoveT = 0;
          const p = c.player;
          // the shoulder bows the LEAF, not the holder — the frame flexes
          // a crack open and the grip fails on the Game's own brace-release
          // rule (openT > 0.05), wherever furniture left the holder
          d.openT = Math.max(d.openT ?? 0, 0.08);
          // and the holder still gets moved when there's room — along the
          // leaf's normal, back into their own room
          const nx = Math.sin(d.yaw), nz = Math.cos(d.yaw);
          const side = Math.sign((p.pos.x - d.pos.x) * nx + (p.pos.z - d.pos.z) * nz) || 1;
          p.teleport(p.pos.x + nx * side * 0.55, 0, p.pos.z + nz * side * 0.55);
          c.cue('door-slam', v3(d.pos.x, 1.2, d.pos.z), '[it shoulders the leaf — your grip slips]', { severity: 'danger' });
          c.sound.emit({ x: d.pos.x, y: 1.2, z: d.pos.z, intensity: 0.9, category: 'door', caption: '[the leaf bows under a shoulder]', source: this.id });
          return 'blocked';
        }
        if (d.heldBy || d.locked) return 'blocked';
        free ??= d;
      }
    }
    if (!free) return null;
    // The doorway is one physical leaf whatever the stack — shove the
    // cluster's free leaves so both side leaves swing together; braced or
    // locked leaves hold.
    for (const r2 of c.rooms) {
      for (const d2 of r2.doors) {
        if (Math.hypot(d2.pos.x - free.pos.x, d2.pos.z - free.pos.z) < 0.7 && !d2.heldBy && !d2.locked && !d2.falseDoor) d2.opening = true;
      }
    }
    c.cue('door-slam', { x: free.pos.x, y: 1.2, z: free.pos.z }, '[the Warden puts a shoulder through the door]', { severity: 'warn' });
    c.sound.emit({ x: free.pos.x, y: 1.2, z: free.pos.z, intensity: 1.1, category: 'impact', caption: '[door slammed]', source: this.id });
    return null;
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
    if (!hasLineOfSight(eyeW, eyeP, room.losBlockers.concat(shutLeafBlockers(c.rooms, this.pos, p.pos)))) return false;
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
      const step = Math.min(len, (this.learned ? 4.3 : 3.5) * dt);
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

    // The shoulder's cooldown ticks even mid-check — doorwork reads it
    // whether he's walking or standing at the bind
    this.braceShoveT += dt;

    if (this.canSee()) {
      this.seenT += dt;
      if (this.seenT > (this.learned ? 0.12 : 0.35)) {
        this.charging = true;
        this.lostT = 0;
        v3copy(this.lastSeen, p.pos);
        c.cue('alarm-ring', this.pos, this.learned
          ? '[a whistle — the Warden already knows you]'
          : '[a whistle — the Warden has you]', { severity: 'danger' });
        c.sound.emit({ x: this.pos.x, y: 1.6, z: this.pos.z, intensity: 1.0, category: 'entity-cue', caption: '[whistle blast]', source: this.id });
        this.rig?.play('move', 0.05);
        return;
      }
    } else {
      this.seenT = Math.max(this.seenT > 0 ? 0 : this.seenT, this.seenT - dt * 2);
    }

    // Off the line, checking a noise it heard — its eyes still work.
    if (this.investigate) {
      const doorAns = this.doorOnPath();
      if (doorAns === 'blocked') {
        // A held or locked leaf answers the shoulder — it gives the check up.
        this.investigate = null;
        this.investigateKind = null;
        this.ctx.cue('door-locked', this.pos, '[it turns from the held door]', { severity: 'info' });
        return;
      }
      if (doorAns === 'working') {
        // Hands in the bind — it stands at the leaf and works it. The
        // eyes still work (canSee ran above); the feet stop.
        return;
      }
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
        // sprint 416 — caught mid-tying: slip close while his hands are
        // in the wires and the read breaks — the work stays dead, he
        // turns on the interruption instead. (The far louder option —
        // getting seen — was already checked above this block; a hidden
        // slip still aborts the re-lay, it just doesn't pull the whistle.)
        // A hidden slip still breaks the read — the comment above said
        // so already; sprint 454 makes the check honor it: furniture
        // cover is the quiet interruption, 'hidden' protection is the
        // loud one that also pulls the whistle below
        if (v3dist(this.pos, p.pos) < 1.8 && !p.hiddenSpot) {
          const kind = this.investigateKind;
          this.investigate = null;
          this.investigateKind = null;
          this.investigateScan = 0;
          if (kind === 'wire' || kind === 'line' || kind === 'fan' || kind === 'blind') {
            c.cue('floor-creak', this.pos,
              '[it stops mid-tying — your footfall reaches it; the work lies half-fast]',
              { severity: 'warn' });
          } else if (kind === 'wrapSpill') {
            c.cue('floor-creak', this.pos,
              '[it stops mid-gather — your footfall reaches it; the felt lies where it fell]',
              { severity: 'warn' });
          }
          // a close face in his hands answers like any sighting —
          // he turns on you; hidden means the abort is the whole cost
          if (p.protection !== 'hidden') this.seenT = Math.max(this.seenT, 0.1);
          return;
        }
        if (this.investigateScan > (this.learned ? 2.6 : 1.8)) {
          // sprint 410-411 — the house re-lays its work: a read that
          // ends on a dead hazard's sign brings it back — wire re-tied,
          // bled lines re-pressurized, wheels re-engaged, felt stripped
          // off its eyes (the wrap is pocketed, not returned).
          if (this.investigateKind === 'wrapSpill') {
            // sprint 482 — the floor folds its felt back in: the pile
            // the stagger scattered goes back in his pocket — carried
            // again, spillable again the next time he goes down.
            // sprint 489 — a kicked chock is loose goods on the same
            // floor: it gets pocketed, not left for you.
            const got = this.ctx.scavengeSpill?.(this.investigate.x, this.investigate.z,
              { wrap: true, wedge: true, lamp: true, spring: true, belt: true, lens: true });
            if (got?.kind === 'wrap') {
              this.pocketed += got.n;
              this.ctx.cue('floor-creak', this.investigate,
                '[it gathers the spilled felt — the pocket closes over it]', { severity: 'warn' });
              this.ctx.sound.emit({
                x: this.investigate.x, y: 0.4, z: this.investigate.z,
                intensity: 0.3, category: 'item', caption: '[felt gathers]',
                source: this.id });
            } else if (got?.kind === 'wedge') {
              this.pocketedChocks++;
              this.ctx.cue('floor-creak', this.investigate,
                '[it pockets the loose chock — the floor is tidy again]', { severity: 'warn' });
              this.ctx.sound.emit({
                x: this.investigate.x, y: 0.4, z: this.investigate.z,
                intensity: 0.3, category: 'item', caption: '[a chock disappears]',
                source: this.id });
            } else if (got?.kind === 'lamp') {
              // sprint 537 — it pinches the light out into its coat:
              // the lamp keeps draining in the dark until a stagger
              // spills it back still burning, or the charge is spent.
              this.pocketedLamps.push(got.batt);
              this.ctx.cue('floor-creak', this.investigate,
                '[it pinches the light out — the lamp goes under its coat]', { severity: 'warn' });
              this.ctx.sound.emit({
                x: this.investigate.x, y: 0.4, z: this.investigate.z,
                intensity: 0.3, category: 'item', caption: '[the light goes out in its fist]',
                source: this.id });
            } else if (got?.kind === 'spring') {
              // sprint 578 — a loose plate is tidy goods too: it pockets
              // the sprung metal like a chock. A stagger drops it again.
              this.pocketedSprings++;
              this.ctx.cue('floor-creak', this.investigate,
                '[it pockets the sprung plate — the floor is tidy again]', { severity: 'warn' });
              this.ctx.sound.emit({
                x: this.investigate.x, y: 0.4, z: this.investigate.z,
                intensity: 0.3, category: 'item', caption: '[a plate disappears]',
                source: this.id });
            } else if (got?.kind === 'belt') {
              // sprint 593 — a pulled belt is tidy goods too: he strips
              // your wheel's muscle and carries it off like the plate.
              this.pocketedBelts++;
              this.ctx.cue('floor-creak', this.investigate,
                '[it pockets the loose belt — the floor is tidy again]', { severity: 'warn' });
              this.ctx.sound.emit({
                x: this.investigate.x, y: 0.4, z: this.investigate.z,
                intensity: 0.3, category: 'item', caption: '[a belt disappears]',
                source: this.id });
            } else if (got?.kind === 'lens') {
              // sprint 601 — a torn lens is tidy goods too: he pockets
              // the glass he pulled off your eye like the belt.
              this.pocketedLenses++;
              this.ctx.cue('floor-creak', this.investigate,
                '[it pockets the loose glass — the floor is tidy again]', { severity: 'warn' });
              this.ctx.sound.emit({
                x: this.investigate.x, y: 0.4, z: this.investigate.z,
                intensity: 0.3, category: 'item', caption: '[a lens disappears]',
                source: this.id });
            }
          }
          if (this.investigateKind === 'wire' || this.investigateKind === 'line'
            || this.investigateKind === 'fan' || this.investigateKind === 'blind'
            || this.investigateKind === 'spring' || this.investigateKind === 'work') {
            const kind = this.investigateKind;
            const restored = this.ctx.rearmHazard?.(kind, this.investigate.x, this.investigate.z);
            if (restored === 'eye') this.pocketed++; // the wrap goes in his pocket — carried, until he staggers
            // sprint 591 — a chocked wheel re-engaging frees the wedge
            // the same way the felt frees off an eye: he pockets it.
            if (restored === 'fanChock') this.pocketedChocks++;
            if (restored) {
              this.ctx.cue('floor-creak', this.investigate,
                restored === 'snare' ? '[it bends and re-lays the wire — the floor relearns your walk]'
                  : restored === 'steam' ? '[it works the valve back open — the line breathes again]'
                    : restored === 'fanChock' ? '[it re-engages the wheel — and pockets your chock]'
                      : restored === 'fan' ? '[it re-engages the wheel — the blades turn again]'
                        : restored === 'trap' ? '[it cocks the plate back — the floor relearns your step]'
                          : restored === 'crimp' ? '[it crimps your line shut — the pressure dies in your own throat]'
                            : restored === 'pull' ? '[it pulls the belt off your wheel — the muscle slaps the boards]'
                              : restored === 'lensTear' ? '[it tears the lens off your eye — the glass slaps the boards]'
                                : '[it peels your felt off the eye — and pockets it]', { severity: 'warn' });
              // the house's work is audible like yours — re-tying wire
              // rustles where it happens, tagged to him so he doesn't
              // pull to his own hands
              this.ctx.sound.emit({
                x: this.investigate.x, y: 0.5, z: this.investigate.z,
                intensity: 0.35, category: 'item', caption: '[wire retied]',
                source: this.id });
            }
          }
          this.investigate = null;
          this.investigateKind = null;
        }
      }
      return;
    }

    // Scent: a hazard that died in its room is a footprint. It leaves
    // the line to read the sign — quiet work is marked work.
    this.scentT -= dt;
    if (this.scentT <= 0) {
      this.scentT = 1.4;
      const evs = c.hazardEvidence?.(`warden:${this.hostRoom}`, this.pos.x, this.pos.z, 30) ?? [];
      const room0 = c.rooms[this.hostRoom];
      const wipes = evs.filter((e) => e.wiped);
      for (const ev of evs) {
        if (ev.wiped) continue; // a wipe is a filter on the sign, not a target
        if (room0?.spec && !pointInRoom(room0, ev.pos.x, ev.pos.z)) continue;
        // The register's face is on the sign — while the register holds
        // a line on you (heldOwed > 0), every fresh mark has a name
        // attached and teaches him double: two strangers' reads to
        // learn, one filed face's.
        const named = (c.heldOwed?.() ?? 0) > 0;
        this.signReads += named ? 2 : 1;
        // Sign in smelling range of a wiped floor — it could be a lie. The
        // warden doubts and stays on the line (the mark is already spent:
        // hazardEvidence marked it read when it returned it).
        if (wipes.some((w) => Math.hypot(w.pos.x - ev.pos.x, w.pos.z - ev.pos.z) < 3.5)) {
          c.cue('floor-creak', this.pos, '[it doubts the mark — the floor smells wiped]', { severity: 'info' });
          continue;
        }
        this.investigate = v3(ev.pos.x, 0, ev.pos.z);
        this.investigateScan = 0;
        this.investigateKind = ev.kind;
        c.cue('floor-creak', this.pos, named
          ? '[the register\'s face is on this sign — it knows these hands]'
          : '[it reads the sign — someone has been here]', { severity: 'warn' });
        this.rig?.play('move', 0.1);
        break;
      }
      // sprint 482 — felt on the floor is unfinished work: a pile its
      // own stagger scattered (or anyone's) reads as a point to fold
      // back in — the floor pockets what fell, the spill is a race.
      if (!this.investigate && room0?.spec) {
        const spill = c.nearestSpill?.(this.pos.x, this.pos.z, 30, ['wrap', 'wedge', 'lamp', 'spring', 'belt']) ?? null;
        if (spill && pointInRoom(room0, spill.x, spill.z)) {
          this.investigate = v3(spill.x, 0, spill.z);
          this.investigateScan = 0;
          this.investigateKind = 'wrapSpill';
          c.cue('floor-creak', this.pos, spill.kind === 'wedge'
            ? '[it bends for the loose chock]'
            : spill.kind === 'lamp'
              ? '[it bends for the burning lamp]'
              : spill.kind === 'belt'
                ? '[it bends for the pulled belt]'
                : '[it bends for the felt that fell]', { severity: 'warn' });
          this.rig?.play('move', 0.1);
        }
      }
      if (this.learned && !this.learnedCued) {
        this.learnedCued = true;
        c.cue('floor-creak', this.pos, '[it knows this floor is worked — the pace quickens]', { severity: 'warn' });
      }
      if (this.investigate) return;
    }

    // sprint 539 — the dynamo drains under the coat, lit or not: a
    // pocketed lamp burns down where he carries it — spill it before
    // the charge is spent or the light is gone for good.
    if (this.pocketedLamps.length > 0) {
      this.pocketedLamps = this.pocketedLamps
        .map((b) => b - dt * 1.1).filter((b) => b > 0);
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
      this.pauseT = this.learned ? 0.9 : 1.6;
      return;
    }
    const step = Math.min(len, this.tuning.speed * (this.learned ? 1.18 : 1) * dt);
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
    // sprint 502 — the settle spills too: pocketed felt and chocks lie
    // where the floorkeeper went under — confiscated, not destroyed.
    if (this.pocketed > 0) {
      const n = this.pocketed;
      this.pocketed = 0;
      this.ctx.dropWraps?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it settles — the felt it pocketed spills loose]', { severity: 'warn' });
    }
    if (this.pocketedChocks > 0) {
      const n = this.pocketedChocks;
      this.pocketedChocks = 0;
      this.ctx.spillChocks?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it settles — the chocks it pocketed spill loose]', { severity: 'warn' });
    }
    if (this.pocketedLamps.length > 0) {
      const bs = this.pocketedLamps;
      this.pocketedLamps = [];
      this.ctx.spillLamps?.(this.pos, bs);
      this.ctx.cue('floor-creak', this.pos,
        '[it settles — the lamp spills out still burning]', { severity: 'warn' });
    }
    if (this.pocketedSprings > 0) {
      const n = this.pocketedSprings;
      this.pocketedSprings = 0;
      this.ctx.spillSprings?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it settles — the plates it pocketed spill loose]', { severity: 'warn' });
    }
    if (this.pocketedBelts > 0) {
      const n = this.pocketedBelts;
      this.pocketedBelts = 0;
      this.ctx.spillBelts?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it settles — the belts it pocketed spill loose]', { severity: 'warn' });
    }
    if (this.pocketedLenses > 0) {
      const n = this.pocketedLenses;
      this.pocketedLenses = 0;
      this.ctx.spillLenses?.(this.pos, n);
      this.ctx.cue('floor-creak', this.pos,
        '[it settles — the glass it pocketed spills loose]', { severity: 'warn' });
    }
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
  }
}
