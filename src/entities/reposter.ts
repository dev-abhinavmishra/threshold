/**
 * The reposter — the boards' counterplay made flesh. When the wanted
 * sheets all come down, the clerk reaches for fresh paper: after the
 * repost window he walks the under spine with a bundle of new sheets
 * and re-pins each bare board in person, room by room. Slow and
 * unarmed — 'Cut the reposter' (a hold beside him) spills the bundle
 * and kills THIS walk; the boards it hadn't reached stay bare, and
 * the clerk only reaches again after another beat. Let him finish
 * and every board stands re-sheeted.
 *
 * Not an Entity — reactive, owned by Game (the repost can arm anywhere),
 * with an injected hook surface so vitest can drive it headless. One
 * reposter walks at a time.
 */
import * as THREE from 'three';
import { corridorPath, followPath } from './base';
import { riggedFigure, type RiggedFigure } from './rigged';
import { MAT } from '../world/materials';
import { v3, v3copy } from '../engine/math';
import type { Vec3 } from '../engine/math';
import type { RoomInstance } from '../game/types';

export interface ReposterHooks {
  addMesh: (o: THREE.Object3D) => void;
  removeMesh: (o: THREE.Object3D) => void;
  cue: (name: string, at: Vec3 | null, caption: string, opts?: { severity?: 'info' | 'warn' | 'danger' }) => void;
  /** The reposter pinned a fresh sheet on this room's board. */
  repost: (roomIdx: number, host: { x: number; z: number }) => void;
}

export interface ReposterHost {
  roomIdx: number;
  x: number;
  z: number;
}

/** Rooms either side of the board run the walk covers. */
const REACH = 4;
/** A clerk carrying paper ambles — catchable if you keep after it. */
const WALK = 1.6;
/** How long a re-pin takes at each bare board. */
const PIN_T = 2.2;

export class Reposter {
  private path: Vec3[] = [];
  private travel = 0;
  private stops: { at: number; room: number; host: { x: number; z: number } }[] = [];
  private stopIdx = 0;
  private pinAt = 0;
  private pinT = 0;
  private state: 'idle' | 'inbound' | 'pin' | 'outbound' = 'idle';
  private pos = v3();
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;

  get active(): boolean { return this.state !== 'idle'; }
  get stage(): string { return this.state; }
  get position(): Vec3 { return this.pos; }

  /** Walk out with fresh paper. Every host is a bare board to re-pin —
   *  the walk runs hi → lo the way the crew comes from deeper. */
  dispatch(rooms: RoomInstance[], hosts: ReposterHost[], hooks: ReposterHooks): boolean {
    if (this.active || hosts.length === 0) return false;
    const lo = Math.max(0, Math.min(...hosts.map((h) => h.roomIdx)) - REACH);
    const hi = Math.min(rooms.length - 1, Math.max(...hosts.map((h) => h.roomIdx)) + REACH);
    this.path = corridorPath(rooms, lo, hi).reverse();
    if (this.path.length < 2) return false;
    const segAt: number[] = [0];
    for (let i = 0; i < this.path.length - 1; i++)
      segAt.push(segAt[i] + Math.hypot(this.path[i + 1].x - this.path[i].x, this.path[i + 1].z - this.path[i].z));
    this.stops = hosts.map((h) => {
      let best = Infinity, at = 0;
      for (let i = 0; i < this.path.length - 1; i++) {
        const d = Math.hypot(this.path[i].x - h.x, this.path[i].z - h.z);
        if (d < best) { best = d; at = segAt[i]; }
      }
      return { at, room: h.roomIdx, host: { x: h.x, z: h.z } };
    }).sort((a, b) => a.at - b.at);
    this.stopIdx = 0;
    this.pinAt = this.stops[0].at;
    this.pinT = 0;
    this.travel = 0;
    v3copy(this.pos, this.path[0]);
    const g = new THREE.Group();
    const rig = riggedFigure('hooded');
    if (rig) { this.rig = rig; rig.play('move', 0); g.add(rig.group); }
    else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), MAT.ink());
      body.position.y = 0.9;
      g.add(body);
    }
    // the bundle — a roll of fresh sheets slung at the hip
    const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), MAT.paper());
    bundle.position.set(-0.18, 0.75, 0.05);
    bundle.rotation.z = 0.9;
    g.add(bundle);
    g.position.copy(this.pos);
    this.mesh = g;
    hooks.addMesh(g);
    this.state = 'inbound';
    hooks.cue('chalk-mark', this.pos, '[the clerk walks out with fresh paper — the boards won\'t stay bare]', { severity: 'warn' });
    return true;
  }

  update(dt: number, _rooms: RoomInstance[], _player: { pos: Vec3 }, hooks: ReposterHooks): void {
    if (!this.active) return;
    if (this.state === 'inbound') {
      this.travel += WALK * dt;
      const f = followPath(this.path, this.travel);
      v3copy(this.pos, f.pos);
      this.face(this.travel + 0.5);
      if (this.travel >= this.pinAt || f.doneT) {
        this.state = 'pin';
        this.pinT = 0;
        this.rig?.play('idle');
      }
    } else if (this.state === 'pin') {
      this.pinT += dt;
      if (this.pinT >= PIN_T) {
        const stop = this.stops[this.stopIdx];
        hooks.repost(stop.room, stop.host);
        hooks.cue('chalk-mark', this.pos, '[a sheet goes back up — the boards have one more name for you]', { severity: 'warn' });
        this.stopIdx++;
        if (this.stopIdx < this.stops.length) {
          this.state = 'inbound';
          this.pinAt = this.stops[this.stopIdx].at;
          this.rig?.play('move');
        } else {
          this.state = 'outbound';
          this.rig?.play('move');
          hooks.cue('chalk-mark', this.pos, '[the boards stand re-sheeted — the clerk folds his bundle away]', { severity: 'warn' });
        }
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

  /** 'Cut the reposter' completes — the bundle spills and this walk is
   *  dead. The boards it never reached stay bare. */
  cutBy(hooks: ReposterHooks): void {
    hooks.cue('chalk-mark', this.pos, '[you grab the bundle — the paper spills, the walk is dead]', { severity: 'info' });
    this.despawn(hooks);
  }

  private face(ahead: number): void {
    if (!this.mesh) return;
    const nxt = followPath(this.path, ahead);
    const mx = nxt.pos.x - this.pos.x, mz = nxt.pos.z - this.pos.z;
    if (mx * mx + mz * mz > 1e-6) this.mesh.rotation.y = Math.atan2(mx, mz);
  }

  private despawn(hooks: ReposterHooks): void {
    if (this.mesh) { hooks.removeMesh(this.mesh); this.mesh = null; }
    this.rig = null;
    this.state = 'idle';
  }

  /** Hard cleanup — run teardown / route rebuild. */
  reset(hooks: ReposterHooks): void {
    if (this.active) this.despawn(hooks);
    this.state = 'idle';
  }
}
