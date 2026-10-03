/**
 * THE CURATOR — the milestone hunter. Blind: it investigates sound events
 * weighted by intensity and distance. States: patrol, listen, suspicious,
 * investigate, search, pursue, stunned. Uses nav nodes for pathing and
 * never receives omniscience — it must be fed evidence.
 */
import * as THREE from 'three';
import { Entity } from './base';
import { v3, v3copy, v3dist, hasLineOfSight, type Vec3 } from '../engine/math';
import { ENTITY_TUNING } from '../game/config';
import { MAT } from '../world/materials';
import { riggedFigure, type RiggedFigure } from './rigged';
import type { SoundEvent } from '../engine/events';
import type { RoomInstance } from '../game/types';

type CuratorState = 'patrol' | 'listen' | 'suspicious' | 'investigate' | 'search' | 'pursue' | 'stunned';

const SPEED_BY_STATE: Record<CuratorState, number> = {
  patrol: 1.6, listen: 0, suspicious: 0.8, investigate: 2.6,
  search: 2.0, pursue: 4.4, stunned: 0,
};

export class Curator extends Entity {
  private cState: CuratorState = 'patrol';
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
  private target = v3();
  private pathPts: Vec3[] = [];
  private pathI = 0;
  private hearUnsub: (() => void) | null = null;
  private searchT = 0;
  private patrolAnchor = 0;
  private level: 1 | 2 = 1;
  private heardRecently: Vec3 | null = null;
  private containmentRoom: RoomInstance | null = null;
  private lastSoundAt = -99;

  constructor() { super('curator', ENTITY_TUNING.curator); }

  setLevel(l: 1 | 2): void {
    this.level = l;
  }

  /** Contain the curator's wander to one room (milestone arenas). */
  containTo(room: RoomInstance): void {
    this.containmentRoom = room;
  }

  get currentState(): CuratorState {
    return this.cState;
  }

  /** World position for sound/cue source. */
  get position(): Vec3 {
    return this.pos;
  }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = this.containmentRoom ?? c.rooms[c.currentRoomIndex];
    this.pos = v3(room.origin.x, 0, room.origin.z);
    v3copy(this.target, this.pos);
    this.buildBody();
    this.state = 'engage';
    // Listen to world sound events.
    this.hearUnsub = c.sound.on((e) => this.hear(e));
    c.cue('curator-enter', this.pos, '[the archivist unfolds]', { severity: 'warn' });
  }

  private buildBody(): void {
    const g = new THREE.Group();
    // Tall stretched-fabric figure with measuring arms and a blank face.
    const rig = riggedFigure('wizard');
    if (rig) {
      this.rig = rig;
      g.add(rig.group);
    } else {
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 2.6, 8), MAT.creatureFabric());
      torso.position.y = 1.5;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), MAT.creatureSkin());
      head.position.y = 2.95;
      head.scale.y = 1.5;
      g.add(head);
    }
    // catalog-rod arms
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 6), MAT.steel());
      arm.position.set(s * 0.55, 1.9, 0);
      arm.rotation.z = s * 0.5;
      g.add(arm);
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.05), MAT.brass());
      claw.position.set(s * 0.95, 1.2, 0);
      g.add(claw);
    }
    // hem of measuring tape strips
    for (let i = 0; i < 6; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.02), MAT.paperOld());
      const a = (i / 6) * Math.PI * 2;
      strip.position.set(Math.cos(a) * 0.4, 0.6, Math.sin(a) * 0.4);
      g.add(strip);
    }
    this.mesh = g;
    g.position.set(this.pos.x, 0, this.pos.z);
    this.ctx.addEntityMesh(g);
  }

  private hear(e: SoundEvent): void {
    if (this.state !== 'engage') return;
    const c = this.ctx;
    const d = v3dist(this.pos, { x: e.x, y: e.y, z: e.z });
    // Hearing radius scales with intensity; crouch-walking whispers ~3m,
    // sprinting and puzzle failures reach ~20m+.
    const radius = e.intensity * (this.level === 2 ? 26 : 20);
    if (d > radius) return;
    this.lastSoundAt = c.now;
    this.heardRecently = v3(e.x, e.y, e.z);
    if (this.cState === 'patrol' || this.cState === 'listen' || this.cState === 'search') {
      this.setState('suspicious');
      v3copy(this.target, this.heardRecently);
    } else if (this.cState === 'investigate' || this.cState === 'suspicious') {
      v3copy(this.target, this.heardRecently);
    }
  }

  private setState(s: CuratorState): void {
    if (this.cState === s) return;
    this.cState = s;
    this.searchT = 0;
    this.log.push(`curator → ${s} t=${this.ctx.now.toFixed(1)}`);
    const cues: Record<CuratorState, string> = {
      patrol: '', listen: '[it stops — listening]', suspicious: '[it tilts toward the sound]',
      investigate: '[measuring arms extend — it is searching]', search: '[it sweeps the shelves]',
      pursue: '[it has your measure]', stunned: '',
    };
    if (cues[s]) this.ctx.cue('curator-' + s, this.pos, cues[s], { severity: s === 'pursue' ? 'danger' : 'warn' });
  }

  /** Recompute a simple path through the containment room's nav graph. */
  private pathTo(dest: Vec3): void {
    const room = this.containmentRoom;
    if (!room || !room.navNodes.length) {
      this.pathPts = [v3(dest.x, 0, dest.z)];
      this.pathI = 0;
      return;
    }
    // Nearest nav node to self and to dest, then greedy walk by distance.
    const nodes = room.navNodes;
    const nearest = (p: Vec3) => nodes.reduce((a, b) => (v3dist(a.pos, p) < v3dist(b.pos, p) ? a : b));
    const start = nearest(this.pos);
    const goal = nearest(dest);
    const route = [start];
    const visited = new Set([start.id]);
    let cur = start;
    let guard = 0;
    while (cur.id !== goal.id && guard++ < 24) {
      const next = cur.links
        .map((id) => nodes.find((n) => n.id === id || n.id.endsWith(`:${id}`) || n.id === `${room.index}:${id}`))
        .filter((n): n is NonNullable<typeof n> => !!n && !visited.has(n.id))
        .sort((a, b) => v3dist(a.pos, goal.pos) - v3dist(b.pos, goal.pos))[0];
      if (!next) break;
      route.push(next);
      visited.add(next.id);
      cur = next;
    }
    this.pathPts = route.map((n) => v3(n.pos.x, 0, n.pos.z));
    this.pathPts.push(v3(dest.x, 0, dest.z));
    this.pathI = 0;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    const speedMul = (this.level === 2 ? 1.25 : 1) * ({ learning: 0.85, standard: 1, hard: 1.15, qa: 0.9 })[c.difficulty];
    const speed = SPEED_BY_STATE[this.cState] * speedMul;

    // pursue check: close distance + LOS → pursue regardless of noise state
    const dPlayer = v3dist(this.pos, p.pos);
    const eyeP = v3();
    p.eyePos(eyeP);
    const room = this.containmentRoom ?? c.rooms[c.currentRoomIndex];
    const los = hasLineOfSight(v3(this.pos.x, 2.4, this.pos.z), eyeP, room ? room.losBlockers : []);
    const playerAudible = c.now - this.lastSoundAt < 1.5 && this.heardRecently && v3dist(this.heardRecently, p.pos) < 2.5;

    if (this.cState !== 'stunned' && this.cState !== 'pursue') {
      if ((dPlayer < 3.2 && los && p.protection === 'exposed') || (playerAudible && dPlayer < 5 && los)) {
        this.setState('pursue');
      }
    }

    switch (this.cState) {
      case 'patrol': {
        this.patrolAnchor += dt * 0.35;
        const r = Math.min(room.width, room.depth) * 0.32;
        const tx = room.origin.x + Math.cos(this.patrolAnchor) * r;
        const tz = room.origin.z + Math.sin(this.patrolAnchor) * r;
        if (v3dist(this.pos, this.target) < 0.6) this.pathTo(v3(tx, 0, tz));
        break;
      }
      case 'suspicious': {
        if (v3dist(this.pos, this.target) < 1.2) this.setState('investigate');
        else if (this.pathI >= this.pathPts.length) this.pathTo(this.target);
        break;
      }
      case 'investigate': {
        if (v3dist(this.pos, this.target) < 0.8) {
          this.setState('search');
          this.searchT = 0;
        } else if (this.pathI >= this.pathPts.length) this.pathTo(this.target);
        break;
      }
      case 'search': {
        this.searchT += dt;
        // tighten around the last heard position
        if (this.searchT > 3.5) this.setState('patrol');
        if (playerAudible && dPlayer < 6 && los && p.protection === 'exposed') this.setState('pursue');
        break;
      }
      case 'pursue': {
        v3copy(this.target, p.pos);
        this.pathPts = [v3(p.pos.x, 0, p.pos.z)];
        this.pathI = 0;
        if (p.protection === 'hidden' || p.protection === 'losSafe' || !los) {
          // lost them — go to last known position and search
          this.setState('search');
        }
        break;
      }
      case 'stunned': {
        this.searchT += dt;
        if (this.searchT > 3) this.setState('patrol');
        return;
      }
      case 'listen': break;
    }

    // Move along path.
    if (this.pathI < this.pathPts.length && speed > 0) {
      const t = this.pathPts[this.pathI];
      const d = v3(t.x - this.pos.x, 0, t.z - this.pos.z);
      const dist = Math.hypot(d.x, d.z);
      if (dist < 0.3) this.pathI++;
      else {
        const step = Math.min(speed * dt, dist);
        this.pos.x += (d.x / dist) * step;
        this.pos.z += (d.z / dist) * step;
      }
    }

    // Clamp inside containment.
    if (this.containmentRoom) {
      const r = this.containmentRoom;
      this.pos.x = Math.max(r.origin.x - r.width / 2 + 0.8, Math.min(r.origin.x + r.width / 2 - 0.8, this.pos.x));
      this.pos.z = Math.max(r.origin.z - r.depth / 2 + 0.8, Math.min(r.origin.z + r.depth / 2 - 0.8, this.pos.z));
    }

    if (this.rig) {
      this.rig.update(dt);
      this.rig.play(this.pathI < this.pathPts.length && speed > 0 ? 'move' : 'idle');
    }
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, 0, this.pos.z);
      if (this.pathI < this.pathPts.length) {
        const t = this.pathPts[this.pathI];
        this.mesh.rotation.y = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
      }
      // subtle sway
      this.mesh.rotation.z = Math.sin(c.now * 1.7) * 0.04;
      // arms extend while searching/pursuing
      const reach = this.cState === 'pursue' ? 0.9 : this.cState === 'search' ? 0.5 : 0.15;
      this.mesh.scale.x = 1 + reach * 0.4;
    }

    // Contact kill.
    if (dPlayer < this.tuning.killRange && p.protection === 'exposed' && this.cState === 'pursue') {
      c.killPlayer('curator', 'The Curator files runners under “loud”. Crouch, stay off metal, and never run twice the same way.');
    }
  }

  stun(seconds = 3): void {
    this.setState('stunned');
    this.searchT = -Math.max(0, seconds - 3);
  }

  protected override onDone(): void {
    if (this.hearUnsub) this.hearUnsub();
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}
