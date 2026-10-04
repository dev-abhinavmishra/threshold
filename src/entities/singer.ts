import * as THREE from 'three';
import { Entity } from './base';
import { v3, v3dist, type Vec3 } from '../engine/math';
import { tallFigure } from './figure';
import { riggedFigure, type RiggedFigure } from './rigged';
import { MAT } from '../world/materials';
import { ENTITY_TUNING } from '../game/config';

/**
 * The Singer — a shy mimic that walks the player's own trail ~5 seconds
 * behind them. You hear footsteps that aren't yours, in your cadence.
 * Stop walking and it finishes what it recorded, then waits: nothing moves
 * until you do. Look at it and it bolts — it was never hunting you.
 *
 * Never lethal and almost useful: its steps are real sound events, so
 * sound-hunters that hear them track the Singer, not you — a decoy you
 * didn't pay for. The price is knowing something is always behind you.
 */
export class Singer extends Entity {
  private mesh: THREE.Object3D | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private homeRoom = 0;
  private trail: ({ x: number; z: number; y: number } & { t: number })[] = [];
  private phase: 'shadow' | 'flee' = 'shadow';
  private stepT = 0;
  private fleeT = 0;
  private told = false;
  private readonly delay = 5;

  constructor() { super('singer', ENTITY_TUNING.singer); }

  override threatPos(): Vec3 | null {
    return this.phase === 'shadow' ? this.pos : null;
  }

  protected override onSpawn(): void {
    const c = this.ctx;
    this.homeRoom = c.currentRoomIndex;
    // Materialize a couple of doors back — it has to catch up to sing.
    this.pos = c.spawnAt(Math.max(0, c.currentRoomIndex - 2));
    const rig = riggedFigure('ghostSkull');
    const g = rig?.group
      ?? tallFigure({
        height: 1.15, body: MAT.shadowFigure(), face: 'none',
        hood: true, tattered: true,
      });
    this.rig = rig;
    if (rig) g.userData.hover = 0.95; // the skull flies — it never touches floor
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    c.flickerRoom(c.currentRoomIndex, 'dim');
    this.state = 'engage';
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;

    // Record the player's trail; the Singer replays it `delay` seconds late.
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(p.pos.x - last.x, p.pos.z - last.z) > 0.7) {
      this.trail.push({ x: p.pos.x, y: 0, z: p.pos.z, t: c.now });
      if (this.trail.length > 90) this.trail.shift();
    }
    while (this.trail.length > 2 && this.trail[0].t < c.now - this.delay * 2.5) this.trail.shift();

    const dist = v3dist(this.pos, p.pos);

    if (this.phase === 'shadow') {
      // A glance ends the performance — player facing it within 12m, or
      // simply tripping over it, sends it bolting for its door.
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const away = dist > 0.01 ? ((p.pos.x - this.pos.x) * fx + (p.pos.z - this.pos.z) * fz) / dist : 0;
      if ((away < -0.6 && dist < 12) || dist < 3.2) {
        this.phase = 'flee';
        this.fleeT = 0;
        c.cue('singer-flee', this.pos, '[a skitter — something small just bolted]', { severity: 'warn' });
        c.sound.emit({ x: this.pos.x, y: 0.4, z: this.pos.z, intensity: 0.5, category: 'footstep', caption: '' });
        return;
      }
      if (!this.told && dist < 11) {
        this.told = true;
        c.cue('singer-steps', this.pos, '[steps that aren\'t yours — in your cadence]', { severity: 'warn' });
      }
      // Walk the oldest leg of the recorded trail once it's aged `delay`.
      const target = this.trail.find((s) => s.t <= c.now - this.delay);
      if (target) {
        this.stepT += dt;
        this.step(target, this.tuning.speed, dt);
        this.rig?.play('move');
        if (this.mesh) this.mesh.rotation.y = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
        // Its steps are real footsteps — hunters hear a decoy, you hear a tail.
        if (this.stepT > 0.62) {
          this.stepT = 0;
          c.sound.emit({ x: this.pos.x, y: 0.4, z: this.pos.z, intensity: 0.3, category: 'footstep', caption: '' });
        }
        if (v3dist(this.pos, target) < 0.4) this.trail.splice(this.trail.indexOf(target), 1);
      } else {
        this.stepT = 0; // silent when the trail runs out — it waits for you
        this.rig?.play('idle');
      }
      // it never follows past ~2 rooms or when you stop provoking it
      if (this.trail.length === 0 && dist > 18) this.done();
    } else {
      // flee: bolt for the room it crawled from, then gone
      this.fleeT += dt;
      const home = c.spawnAt(this.homeRoom);
      this.step(home, this.tuning.speed * 1.9, dt);
      this.rig?.play('move', 0.08);
      if (this.mesh) this.mesh.rotation.y = Math.atan2(home.x - this.pos.x, home.z - this.pos.z);
      if (this.fleeT > 2.4 || v3dist(this.pos, home) < 1 || dist > 16) this.done();
    }

    if (this.mesh) this.mesh.position.set(this.pos.x, this.pos.y + (this.mesh.userData.hover ?? 0), this.pos.z);
    this.rig?.update(dt);
  }

  private step(target: Vec3, speed: number, dt: number): void {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const s = Math.min(speed * dt, d);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}
