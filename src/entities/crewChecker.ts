/**
 * The checker — the crew's answer to a rung count. When a loss-report
 * rings (crewCount), the books send somebody to look: a hooded clerk
 * with a lamp who walks the under spine to the rung socket, sweeps it,
 * then walks on. It never touches you — but a lamp that finds you in the
 * room cries the find to every listener in reach. Delayed heat lands
 * where you WERE: pilfer-and-move and it checks your shadow; linger in
 * the room and it stands you in the book.
 *
 * Not an Entity — it's reactive, owned by Game (the count can ring
 * anywhere, anytime), with an injected hook surface so vitest can drive
 * it headless. One checker walks at a time; further rings keep their
 * noise but don't stack walkers.
 */
import * as THREE from 'three';
import { corridorPath, followPath } from './base';
import { riggedFigure, type RiggedFigure } from './rigged';
import { MAT } from '../world/materials';
import { v3, v3copy } from '../engine/math';
import type { Vec3 } from '../engine/math';
import type { RoomInstance } from '../game/types';
import type { SoundEvent } from '../engine/events';

export interface CheckerHooks {
  addMesh: (o: THREE.Object3D) => void;
  removeMesh: (o: THREE.Object3D) => void;
  cue: (name: string, at: Vec3 | null, caption: string, opts?: { severity?: 'info' | 'warn' | 'danger' }) => void;
  emit: (e: SoundEvent) => void;
}

export interface CheckerPlayer {
  pos: Vec3;
  /** Index in the walker's rooms array; -1 when outside the space. */
  room: number;
  /** Not hidden / not LOS-safe — what the lamp can see. */
  exposed: boolean;
}

/** Rooms either side of the socket the walk covers. */
const REACH = 6;
/** Deliberate walk — the crew doesn't hurry for the count. */
const WALK = 2.4;
/** How long it stands at the rung socket. */
const SWEEP_T = 26;
/** Exposed linger time before the lamp "finds" you. */
const SPOT_T = 1.4;
/** How loud the find rings — rouses through doors, pulls the room. */
const FOUND_INTENSITY = 0.75;

export function roomOf(rooms: RoomInstance[], p: { x: number; z: number }): number {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (Math.abs(p.x - r.origin.x) <= r.width / 2 && Math.abs(p.z - r.origin.z) <= r.depth / 2) return i;
  }
  return -1;
}

export class CrewChecker {
  private path: Vec3[] = [];
  private travel = 0;
  private sweepAt = 0;
  private sweepRoom = -1;
  private state: 'idle' | 'inbound' | 'sweep' | 'outbound' = 'idle';
  private sweepT = 0;
  private spotT = 0;
  private found = false;
  private pos = v3();
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private lamp: THREE.PointLight | null = null;
  /** Its working light — stealable. A blind sweep finds nobody. */
  lampLit = true;

  get active(): boolean { return this.state !== 'idle'; }
  get stage(): string { return this.state; }
  get position(): Vec3 { return this.pos; }

  /** 'Strip the lamp' completes — the most brazen pilfer in the under.
   *  It is holding the light: it feels it die on the spot, and the lamp
   *  is crew property, so the Game files this strip to the count too.
   *  Returns the charge the stolen lamp hands over. */
  stripLamp(hooks: CheckerHooks): number {
    if (!this.lampLit) return 0;
    this.lampLit = false;
    if (this.lamp) this.lamp.intensity = 0;
    hooks.emit({
      x: this.pos.x, y: 1, z: this.pos.z,
      intensity: 0.65, category: 'impact',
      caption: '[the lamp dies in your hands — it felt it go]',
    });
    return 45;
  }

  /** Answer a rung count. Returns false when a checker is already out —
   *  the books send one walker per beat, not a crowd. */
  dispatch(rooms: RoomInstance[], socket: { x: number; z: number }, hooks: CheckerHooks): boolean {
    if (this.active) return false;
    const socketRoom = roomOf(rooms, socket);
    if (socketRoom < 0) return false;
    this.sweepRoom = socketRoom;
    const lo = Math.max(0, socketRoom - REACH);
    const hi = Math.min(rooms.length - 1, socketRoom + REACH);
    // the crew comes from deeper in the under — walk hi → lo
    this.path = corridorPath(rooms, lo, hi).reverse();
    // the sweep stands on the path point nearest the rung socket
    let acc = 0, best = Infinity;
    this.sweepAt = 0;
    for (let i = 0; i < this.path.length - 1; i++) {
      const d = Math.hypot(this.path[i].x - socket.x, this.path[i].z - socket.z);
      if (d < best) { best = d; this.sweepAt = acc; }
      acc += Math.hypot(this.path[i + 1].x - this.path[i].x, this.path[i + 1].z - this.path[i].z);
    }
    this.travel = 0;
    this.sweepT = 0;
    this.spotT = 0;
    this.found = false;
    this.lampLit = true;
    v3copy(this.pos, this.path[0]);
    const g = new THREE.Group();
    const rig = riggedFigure('hooded');
    if (rig) { this.rig = rig; rig.play('move', 0); g.add(rig.group); }
    else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), MAT.ink());
      body.position.y = 0.9;
      g.add(body);
    }
    // the count's lamp — a swinging brass can on a short chain
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 6), MAT.brass());
    can.position.set(0.26, 0.8, 0.1);
    g.add(can);
    const lamp = new THREE.PointLight(0xff9a4a, 1.7, 7.5, 2);
    lamp.position.set(0.26, 0.95, 0.1);
    g.add(lamp);
    this.lamp = lamp;
    g.position.copy(this.pos);
    this.mesh = g;
    hooks.addMesh(g);
    this.state = 'inbound';
    hooks.cue('chalk-mark', this.pos, '[the count is answered — somebody walks the row with a lamp]', { severity: 'warn' });
    return true;
  }

  update(dt: number, _rooms: RoomInstance[], player: CheckerPlayer, hooks: CheckerHooks): void {
    if (!this.active) return;
    if (this.state === 'inbound') {
      this.travel += WALK * dt;
      const f = followPath(this.path, this.travel);
      v3copy(this.pos, f.pos);
      this.face(this.travel + 0.5);
      if (this.travel >= this.sweepAt || f.doneT) {
        this.state = 'sweep';
        this.rig?.play('idle');
      }
    } else if (this.state === 'sweep') {
      this.sweepT += dt;
      // the lamp swings a slow scan over the socket
      if (this.mesh) this.mesh.rotation.y += Math.sin(this.sweepT * 0.9) * 0.35 * dt;
      if (this.lamp && this.lampLit) this.lamp.intensity = 1.7 + Math.sin(this.sweepT * 7.3) * 0.25;
      if (!this.found && this.lampLit && player.room === this.sweepRoom && player.exposed) {
        this.spotT += dt;
        if (this.spotT >= SPOT_T) {
          this.found = true;
          hooks.emit({
            x: player.pos.x, y: 1, z: player.pos.z,
            intensity: FOUND_INTENSITY, category: 'impact',
            caption: "[the checker's lamp finds you — the count stands]",
          });
        }
      } else {
        this.spotT = 0;
      }
      if (this.sweepT >= SWEEP_T) {
        this.state = 'outbound';
        this.rig?.play('move');
        hooks.cue('chalk-mark', this.pos, this.found
          ? '[the checker closes the count — you are in the book]'
          : this.lampLit
            ? '[the checker counts the till and moves on]'
            : '[the checker counts blind — the count stays open]', { severity: this.found || !this.lampLit ? 'warn' : 'info' });
      }
    } else {
      this.travel += WALK * dt;
      const f = followPath(this.path, this.travel);
      v3copy(this.pos, f.pos);
      this.face(this.travel + 0.5);
      if (f.doneT) this.despawn(hooks);
    }
    if (this.mesh) this.mesh.position.copy(this.pos);
    this.rig?.update(dt);
  }

  private face(ahead: number): void {
    if (!this.mesh) return;
    const nxt = followPath(this.path, ahead);
    const mx = nxt.pos.x - this.pos.x, mz = nxt.pos.z - this.pos.z;
    if (mx * mx + mz * mz > 1e-6) this.mesh.rotation.y = Math.atan2(mx, mz);
  }

  private despawn(hooks: CheckerHooks): void {
    if (this.mesh) { hooks.removeMesh(this.mesh); this.mesh = null; }
    this.rig = null;
    this.lamp = null;
    this.state = 'idle';
  }

  /** Hard cleanup — run teardown / route rebuild. */
  reset(hooks: CheckerHooks): void {
    if (this.active) this.despawn(hooks);
    this.state = 'idle';
  }
}
