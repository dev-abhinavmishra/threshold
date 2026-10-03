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
import { v3dist, type Vec3 } from '../engine/math';
import type { EntityId } from '../game/types';
import { ENTITY_TUNING } from '../game/config';
import { MAT } from '../world/materials';
import { tallFigure } from './figure';
import { riggedFigure, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';

export interface CorridorOptions {
  passes?: number;
  /** Returner: path reversed — comes from ahead. */
  fromAhead?: boolean;
  maelstrom?: boolean;
  redline?: boolean;
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
  private rng!: Rng;
  private brokeLights = new Set<number>();

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
    const startRoom = this.opts.fromAhead
      ? Math.min(c.rooms.length - 1, c.currentRoomIndex + 4)
      : Math.max(0, c.currentRoomIndex - 4);
    this.path = corridorPath(c.rooms, startRoom, this.endRoom);
    if (this.opts.fromAhead) this.path = this.path.slice().reverse();
    this.totalLen = pathLength(this.path);
    this.traveled = 0;

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
    }
    this.warnT = tune.warningTime * ({ learning: 1.5, standard: 1, hard: 0.78, qa: 1 })[c.difficulty];

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
      // Sweep / Reprise / Returner — a tall hunched figure, eye-line band.
      const rig = riggedFigure('skeleton');
      if (rig) {
        rig.play('move', 0);
        rig.group.scale.multiplyScalar(2.6 / 2.2);
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
      const speed = this.tuning.speed * ({ learning: 0.9, standard: 1, hard: 1.15, qa: 1 })[c.difficulty];
      this.traveled += speed * dt;
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
