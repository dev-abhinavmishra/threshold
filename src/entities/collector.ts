/**
 * The Collector — a toll-taker of the house. It never touches you: it
 * blocks your way, hand out, rattling a tin of teeth, and it wants two
 * imprints or a marginalia. Pay and it bows out, whispering what it knows
 * of the nearest threat. Walk past and it follows — rattling, and the
 * rattle carries to anything that hunts by sound.
 *
 * Never lethal itself: its danger is the noise it wraps around you.
 */
import * as THREE from 'three';
import { Entity } from './base';
import { v3, v3copy, v3dist, type Vec3 } from '../engine/math';
import { tallFigure } from './figure';
import { riggedFigure, type RiggedFigure } from './rigged';
import { MAT } from '../world/materials';
import { ENTITY_TUNING } from '../game/config';
import { Rng } from '../engine/rng';

type Phase = 'approach' | 'demand' | 'follow' | 'paid' | 'leave';

export class Collector extends Entity {
  private mesh: THREE.Object3D | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private homeRoom = 0;
  private lastRoom = 0;
  private phase: Phase = 'approach';
  private tollId = '';
  private followT = 0;
  private rattleT = 0;
  private loseT = 0;
  private roomsFollowed = 0;
  private moveTarget = v3();

  constructor() { super('collector', ENTITY_TUNING.collector); }

  override threatPos(): Vec3 | null {
    return this.phase === 'paid' || this.phase === 'leave' ? null : this.pos;
  }

  protected override onSpawn(): void {
    const c = this.ctx;
    const rng = new Rng(c.seed);
    this.homeRoom = this.lastRoom = c.currentRoomIndex;
    this.tollId = `toll-${c.seed.toString(36)}`;
    // Plant itself on the player's path, ~4m ahead.
    const dir = v3();
    c.player.lookDir(dir);
    this.pos = v3(
      c.player.pos.x + dir.x * (3.8 + rng.float() * 1.2), 0,
      c.player.pos.z + dir.z * (3.8 + rng.float() * 1.2));
    v3copy(this.moveTarget, this.pos);
    this.state = 'engage';

    // Hooded porter silhouette + the tin it rattles.
    const rig = riggedFigure('hooded');
    const g = rig?.group
      ?? tallFigure({
        height: 1.85, body: MAT.shadowFigure(), face: 'mask',
        faceMat: MAT.paper(), eyes: 'amber', hood: true, tattered: true,
      });
    this.rig = rig;
    const tin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8), MAT.brass());
    tin.position.set(0.42, 0.95, 0.16);
    tin.rotation.z = 0.35;
    tin.name = 'collector-tin';
    g.add(tin);
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('collector-rattle', this.pos,
      this.tollPrice() >= 8
        ? '[a tin of teeth rattles — counting what you carry]'
        : '[a tin of teeth rattles, patient]',
      { severity: 'warn' });
  }

  /** The tin counts what you carry: the ask scales with the purse, so a
   *  hoarded run draws a heavier toll — pay it or take the rattle with you. */
  private tollPrice(): number {
    return Math.min(24, Math.max(2, Math.floor((this.ctx.purse?.() ?? 0) * 0.12)));
  }

  private offerToll(): void {
    this.ctx.addInteractable({
      kind: 'toll', id: this.tollId, pos: this.pos,
      prompt: `Pay the toll — ${this.tollPrice()} imprints or a marginalia`,
      holdTime: 0.8, data: { pay: () => this.satisfy(), price: this.tollPrice() },
      enabled: true, priority: 4,
    });
  }

  /** Called from the 'toll' interact after the Game deducts payment. */
  satisfy(): void {
    if (this.phase === 'paid') return;
    this.phase = 'paid';
    this.ctx.removeInteractable(this.tollId);
    const c = this.ctx;
    // It tells you what it heard: the nearest living threat's distance.
    const best = c.nearestThreat(this);
    c.cue('collector-paid', this.pos,
      best
        ? `[the tin accepts — it whispers: ${best.d < 8 ? 'close — a door away' : best.d < 20 ? 'rooms away, moving' : 'far off, for now'}]`
        : '[the tin accepts — it whispers: nothing close]',
      { severity: 'info' });
    this.phase = 'leave'; // satisfied — it walks back to its door
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    const dist = v3dist(this.pos, p.pos);
    this.rig?.update(dt);


    // Face the player while it has business with them.
    if (this.mesh && this.phase !== 'leave') {
      this.mesh.rotation.y = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    }

    switch (this.phase) {
      case 'approach': {
        if (dist > 1.9) { this.step(p.pos, this.tuning.speed, dt); this.rig?.play('move'); }
        else {
          this.rig?.play('idle');
          this.phase = 'demand';
          this.offerToll();
        }
        break;
      }
      case 'demand': {
        // Hold its ground while the player is near; walking away means refusal.
        if (dist > 5.5) {
          this.phase = 'follow';
          this.followT = 0;
          c.removeInteractable(this.tollId);
          c.cue('collector-refuse', this.pos, '[the rattle follows you]', { severity: 'warn' });
        }
        break;
      }
      case 'follow': {
        this.followT += dt;
        // Trail at ~4.5m behind the player's facing.
        const dir = v3();
        p.lookDir(dir);
        this.moveTarget = v3(p.pos.x - dir.x * 4.5, 0, p.pos.z - dir.z * 4.5);
        if (v3dist(this.pos, this.moveTarget) > 1.2) { this.step(this.moveTarget, this.tuning.speed * 1.35, dt); this.rig?.play('move'); }
        else this.rig?.play('idle');
        // The rattle is a real sound — hunters hear it.
        this.rattleT += dt;
        if (this.rattleT > 3.2) {
          this.rattleT = 0;
          c.sound.emit({ x: this.pos.x, y: 1.0, z: this.pos.z, intensity: 0.45, category: 'footstep', caption: '[a tin of teeth rattles]' });
        }
        p.panic = Math.min(1, p.panic + dt * 0.008);
        // Player changed rooms: it keeps up for two rooms, then gives up.
        if (c.currentRoomIndex !== this.lastRoom) {
          this.lastRoom = c.currentRoomIndex;
          this.roomsFollowed++;
          if (this.roomsFollowed > 2) {
            this.phase = 'leave';
            c.cue('collector-leave', this.pos, '[the rattle stops at the threshold]', { severity: 'info' });
            break;
          }
        }
        // Coming back within reach re-opens the offer.
        if (dist < 1.9) {
          this.phase = 'demand';
          this.offerToll();
          break;
        }
        // Hidden players bore it.
        if (p.hiddenSpot || p.protection === 'hidden' || p.protection === 'losSafe') {
          this.loseT += dt;
          if (this.loseT > 6) { this.phase = 'leave'; c.cue('collector-leave', this.pos, '[the tin loses interest]', { severity: 'info' }); }
        } else this.loseT = 0;
        break;
      }
      case 'leave': {
        const home = c.spawnAt(this.homeRoom);
        if (v3dist(this.pos, home) > 0.8) { this.step(home, this.tuning.speed * 1.6, dt); this.rig?.play('move'); }
        if (this.mesh) this.mesh.rotation.y = Math.atan2(home.x - this.pos.x, home.z - this.pos.z);
        if (v3dist(this.pos, home) < 1.0 || dist > 14) this.done();
        break;
      }
      default: break;
    }
    if (this.mesh) this.mesh.position.set(this.pos.x, 0, this.pos.z);
  this.bootSpill(this.pos);
  }

  private step(target: Vec3, speed: number, dt: number): void {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const s = Math.min(speed * dt, d);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
  }

  protected override onDone(): void {
    this.ctx.removeInteractable(this.tollId);
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}
