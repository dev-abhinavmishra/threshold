/**
 * Set-piece entities: Pursuer (authored chases), Orrery (Lens Hall beams),
 * and Editor (Underscript climax). These are scripted encounters, not
 * free-roamers — they exist only inside their milestone controllers.
 */
import * as THREE from 'three';
import { Entity } from './base';
import { v3, v3copy, v3dist, clamp } from '../engine/math';
import { ENTITY_TUNING } from '../game/config';
import { MAT } from '../world/materials';
import { riggedFigure, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';
import { noiseCanBeHeard, withinRouseRadius } from '../engine/noiseRouse';
import type { SoundEvent } from '../engine/events';
import type { Vec3 } from '../engine/math';

/* ============================ PURSUER ============================ */
/** Chase entity: follows the corridor path behind the player during an
 * authored sequence. Always slightly slower than sprint — the tension is
 * the route, not the speed. Catches if the player stalls on obstacles. */
export class Pursuer extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
  private waypoints: Vec3[] = [];
  private wi = 0;
  private active = false;

  constructor() { super('pursuer', ENTITY_TUNING.pursuer); }

  begin(waypoints: Vec3[]): void {
    this.waypoints = waypoints;
    this.wi = 0;
    v3copy(this.pos, waypoints[0]);
    this.active = true;
    const c = this.ctx;
    c.cue('pursuer-roar', this.pos, '[the corridor inhales — RUN]', { severity: 'danger' });
  }

  protected override onSpawn(): void {
    const g = new THREE.Group();
    // A mass of door frames, all wrong
    for (let i = 0; i < 5; i++) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2 + i * 0.3, 1.3), i % 2 ? MAT.shadowFigure() : MAT.ink());
      frame.position.set((i - 2) * 0.35, 1.1 + i * 0.15, 0);
      frame.rotation.y = (i - 2) * 0.18;
      g.add(frame);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), MAT.redLamp());
    glow.position.y = 1.6;
    g.add(glow);
    // The thing dragging the frames — a rigged body at the mass's heart,
    // counter-rotated against the frame spin to face its prey.
    this.rig = riggedFigure('demon');
    if (this.rig) {
      this.rig.play('move', 0);
      g.add(this.rig.group);
    }
    this.mesh = g;
    this.ctx.addEntityMesh(g);
    this.state = 'engage';
  }

  protected override onUpdate(dt: number): void {
    if (!this.active || !this.mesh) return;
    const c = this.ctx;
    const p = c.player;
    const speedMul = ({ learning: 0.85, standard: 1, hard: 1.1, qa: 0.9 })[c.difficulty];
    const speed = this.tuning.speed * speedMul;

    if (this.wi < this.waypoints.length) {
      const t = this.waypoints[this.wi];
      const d = v3(t.x - this.pos.x, 0, t.z - this.pos.z);
      const dist = Math.hypot(d.x, d.z);
      if (dist < 0.5) this.wi++;
      else {
        const step = Math.min(speed * dt, dist);
        this.pos.x += (d.x / dist) * step;
        this.pos.z += (d.z / dist) * step;
      }
    }
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y += dt * 2.2;
    if (this.rig) {
      this.rig.update(dt);
      // Hold the body facing the next waypoint while the shell spins.
      const t = this.waypoints[Math.min(this.waypoints.length - 1, this.wi)];
      const face = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
      this.rig.group.rotation.y = face - this.mesh.rotation.y;
    }

    const d = v3dist(this.pos, p.pos);
    if (d < this.tuning.killRange && p.protection !== 'hidden') {
      this.rig?.play('attack', 0.05);
      c.killPlayer('pursuer', 'The Pursuer only wins if you stop. Sprint the whole sequence — vaults and gates slow it too.');
      this.done();
      return;
    }
    if (d < 20 && Math.random() < dt * 4) {
      c.cue('pursuer-crash', this.pos, '', { severity: 'danger' });
    }
  }

  /** Chase over (player reached the end or died). */
  end(): void {
    this.active = false;
    this.done();
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ ORRERY ============================ */
/** Lens Hall: a ceiling orrery whose rotating beams must be broken by
 * activating 4 resonance pylons (hold E while they spin). */
export class Orrery extends Entity {
  private rig: THREE.Group | null = null;
  private beams: THREE.Mesh[] = [];
  private beamAngle = 0;
  /** pylon progress 0..1, each needs 2.5s of held interact within beam cycles */
  pylonProgress = [0, 0, 0, 0];
  solved = false;

  constructor() { super('orrery', { speed: 0, seeRange: 0, killRange: 0.8, damage: 35, warningTime: 0, cooldown: 0, spawnChance: 0, minRoom: 0 }); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms.find((r) => r.templateId === 'ms-lens-hall');
    const g = new THREE.Group();
    const cx = room ? room.origin.x : 0;
    const cz = room ? room.origin.z : 0;
    // four rotating beam arms at ceiling height
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 14, 6), MAT.brass());
      arm.rotation.z = Math.PI / 2;
      arm.position.y = 0;
      const pivot = new THREE.Group();
      pivot.position.set(cx, 5.6, cz);
      pivot.rotation.y = (i / 4) * Math.PI;
      pivot.add(arm);
      g.add(pivot);
      this.beams.push(arm);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), MAT.afterglow());
    core.position.set(cx, 5.6, cz);
    g.add(core);
    this.rig = g;
    c.addEntityMesh(g);
    this.state = 'engage';
    c.cue('orrery-wake', v3(cx, 5.6, cz), '[the lens wakes — align the pylons]', { severity: 'warn' });
  }

  /** Projected beam ground position for damage test — beams sweep low
   * when the arm is between the pylon positions. */
  beamTipWorld(i: number): Vec3 {
    const arm = this.beams[i];
    if (!arm || !this.rig) return v3();
    const parent = arm.parent as THREE.Group;
    const a = parent.rotation.y;
    const cx = this.rig.position.x;
    const cz = this.rig.position.z;
    void cx; void cz;
    return v3(parent.position.x + Math.cos(a) * 7, 0, parent.position.z + Math.sin(a) * 7);
  }

  protected override onUpdate(dt: number): void {
    if (this.solved || !this.rig) return;
    const c = this.ctx;
    this.beamAngle += dt * 0.5;
    for (const b of this.beams) {
      const p = b.parent as THREE.Group;
      p.rotation.y += dt * (0.4 + this.beams.indexOf(b) * 0.13);
    }
    // Beam sweep damage: check distance from player to each beam's line.
    const p = c.player;
    for (const arm of this.beams) {
      const pivot = arm.parent as THREE.Group;
      const a = pivot.rotation.y;
      const dirX = Math.cos(a), dirZ = Math.sin(a);
      // beam is a line from pivot extending ±7m
      const px = pivot.position.x, pz = pivot.position.z;
      // perpendicular distance player→beam line
      const rel = v3(p.pos.x - px, 0, p.pos.z - pz);
      const along = rel.x * dirX + rel.z * dirZ;
      const perp = Math.abs(-rel.x * dirZ + rel.z * dirX);
      if (Math.abs(along) < 7 && perp < 0.45 && p.pos.y < 2.5 && !p.hiddenSpot) {
        c.damagePlayer(this.tuning.damage * dt, 'orrery', 'The beam reads everything below it. Crouch behind cover or time the gaps.');
      }
    }
  }

  /** Called when player holds interact on a pylon. */
  chargePylon(i: number, dt: number): void {
    this.pylonProgress[i] = clamp(this.pylonProgress[i] + dt / 2.5, 0, 1);
    if (this.pylonProgress.every((x) => x >= 1)) {
      this.solved = true;
      this.ctx.cue('orrery-done', null, '[the lens closes — the way ahead is written]', { severity: 'info' });
      this.done();
    }
  }

  protected override onDone(): void {
    if (this.rig) {
      // leave the rig visible but stopped — it's a fixture
      for (const b of this.beams) (b.parent as THREE.Group).rotation.y = 0;
    }
  }
}

/* ============================ EDITOR ============================ */
/** Underscript climax: patrols the last stretch, enforcing amendments.
 * Deletion zones erase floor tiles — the player must stay out of red
 * zones and reach the final door. */
export class Editor extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
  private patrolT = 0;
  private deletionZones: { x: number; z: number; r: number }[] = [];
  private roomW = 10;
  private roomD = 10;
  private roomO = v3();
  finished = false;

  constructor() { super('editor', ENTITY_TUNING.editor); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.rooms.length - 1];
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    this.roomW = room.width;
    this.roomD = room.depth;
    this.pos = v3(this.roomO.x, 0, this.roomO.z - this.roomD * 0.3);
    const g = new THREE.Group();
    const rig = riggedFigure('blueDemon');
    if (rig) {
      rig.play('move', 0);
      this.rig = rig;
      g.add(rig.group);
    } else {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 2.4, 6), MAT.ink());
      body.position.y = 1.2;
      g.add(body);
    }
    const pen = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.2, 4), MAT.redLamp());
    pen.position.set(0.5, 1.6, 0);
    pen.rotation.z = -0.4;
    g.add(pen);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('editor-enter', this.pos, '[the Editor audits this floor — mind the deletions]', { severity: 'danger' });
    this.state = 'engage';
    // initial deletion zones
    const rng = new Rng(c.seed);
    for (let i = 0; i < 4; i++) {
      this.deletionZones.push({
        x: this.roomO.x + rng.range(-this.roomW * 0.35, this.roomW * 0.35),
        z: this.roomO.z + rng.range(-this.roomD * 0.35, this.roomD * 0.35),
        r: 1.6 + rng.float() * 1.4,
      });
    }
  }

  get zones(): readonly { x: number; z: number; r: number }[] {
    return this.deletionZones;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.patrolT += dt;
    this.rig?.update(dt);
    // slow orbit patrol around center
    const a = this.patrolT * this.tuning.speed * 0.1;
    this.pos.x = this.roomO.x + Math.cos(a) * this.roomW * 0.28;
    this.pos.z = this.roomO.z + Math.sin(a) * this.roomD * 0.28;
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, 0, this.pos.z);
      this.mesh.rotation.y = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    }
    // spawn new deletion zone near the player every ~6s
    if (this.patrolT % 6 < dt) {
      const rng = new Rng(c.seed + Math.floor(this.patrolT));
      this.deletionZones.push({
        x: p.pos.x + rng.range(-3, 3),
        z: p.pos.z + rng.range(-3, 3),
        r: 1.5 + rng.float(),
      });
      if (this.deletionZones.length > 8) this.deletionZones.shift();
      c.cue('editor-delete', v3(p.pos.x, 0, p.pos.z), '[a deletion zone is being written]', { severity: 'warn' });
    }
    // damage inside zones (after a 1.2s grace where the zone materializes)
    for (const z of this.deletionZones) {
      const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
      if (d < z.r * 0.75) {
        c.damagePlayer(this.tuning.damage * dt * 0.5, 'editor', 'Red-lined floor is being deleted. Move before the cut finishes.');
      }
    }
    // contact
    if (v3dist(this.pos, p.pos) < this.tuning.killRange + 0.4 && p.protection !== 'hidden') {
      c.killPlayer('editor', 'The Editor deletes whatever it touches. The floor it marks is already gone — keep moving.');
      this.done();
    }
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ GRAFTER ============================ */
/** Underscript roamer — loose masonry that remembers a body. Slow drifting
 * patrol through a room; notices the living within ~9m and drifts to them.
 * The only winning move is distance. */
export class Grafter extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
  private target = v3();
  private roomO = v3();
  private roomW = 10;
  private roomD = 10;
  private spawnRoom = 0;
  private grindT = 0;
  private roamT = 0;
  private lifeT = 0;
  private noiseUnsub: (() => void) | null = null;
  private noiseDriftCd = 0;

  constructor() { super('grafter', ENTITY_TUNING.grafter); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.spawnRoom = c.currentRoomIndex;
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    this.roomW = room.width;
    this.roomD = room.depth;
    // rise in the far corner
    const p = c.player.pos;
    let bx = this.roomO.x, bz = this.roomO.z, best = -1;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const px = this.roomO.x + cx * (this.roomW / 2 - 1.2);
      const pz = this.roomO.z + cz * (this.roomD / 2 - 1.2);
      const d = Math.hypot(px - p.x, pz - p.z);
      if (d > best) { best = d; bx = px; bz = pz; }
    }
    this.pos = v3(bx, 0, bz);
    this.target = v3(bx, 0, bz);
    const g = new THREE.Group();
    const rig = riggedFigure('goleling');
    if (rig) {
      this.rig = rig;
      rig.play('move', 0);
      g.add(rig.group);
    } else {
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), MAT.ink());
      body.position.y = 1.4;
      g.add(body);
    }
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('grafter-wake', this.pos, '[the rubble folds into a shape]', { severity: 'danger' });
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    this.state = 'engage';
  }

  /** Loose masonry drags toward a crash — a pulled bell or a slammed
   *  door bends its amble to the sound point, so a lure genuinely
   *  walks it across the room. A real body in sight outranks noise. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'engage') return;
    if (e.source || !noiseCanBeHeard(e)) return;
    if (!withinRouseRadius(e, this.pos.x, this.pos.z)) return;
    if (this.roomOf(v3(e.x, 0, e.z)) !== this.spawnRoom) return;
    const p = c.player;
    const d = v3dist(this.pos, p.pos);
    if (d < this.tuning.seeRange && p.protection !== 'hidden' && this.roomOf(p.pos) === this.spawnRoom) return;
    this.target = v3(e.x, 0, e.z);
    this.roamT = 0;
    if (this.noiseDriftCd <= c.now) {
      this.noiseDriftCd = c.now + 7;
      c.cue('grafter-grind', this.pos, '[the rubble drags toward the sound]', { severity: 'warn' });
    }
  }

  private pickRoam(): void {
    const rng = new Rng(this.ctx.seed + Math.floor(this.lifeT * 97));
    this.target = v3(
      this.roomO.x + rng.range(-this.roomW / 2 + 1.2, this.roomW / 2 - 1.2),
      0,
      this.roomO.z + rng.range(-this.roomD / 2 + 1.2, this.roomD / 2 - 1.2),
    );
    this.roamT = 0;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.lifeT += dt;
    this.roamT += dt;
    this.rig?.update(dt);

    const d = v3dist(this.pos, p.pos);
    // it notices the living within its range — hidden reads as furniture
    const notices = d < this.tuning.seeRange && p.protection !== 'hidden' && this.roomOf(p.pos) === this.spawnRoom;
    let speed = this.tuning.speed;
    if (notices) { this.target = v3(p.pos.x, 0, p.pos.z); speed *= 1.4; }

    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 0.25) {
      this.pos.x += (dx / dd) * speed * dt;
      this.pos.z += (dz / dd) * speed * dt;
      this.rig?.play('move');
      if (this.mesh) this.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      this.rig?.play('idle');
      if (this.roamT > 1.4) this.pickRoam();
    }
    if (this.mesh) this.mesh.position.copy(this.pos);
    if (this.rig) this.rig.group.position.y = 0.12 + Math.sin(this.lifeT * 1.7) * 0.1;

    this.grindT += dt;
    if (this.grindT > 4.5) {
      this.grindT = 0;
      c.cue('grafter-grind', this.pos, '[stone drags on stone]', { severity: 'warn' });
    }

    if (d < this.tuning.killRange && p.protection !== 'hidden') {
      this.rig?.play('attack', 0.05);
      c.cue('grafter-strike', this.pos, '', { severity: 'danger' });
      c.killPlayer('grafter', 'The Grafter is slow. Walk around it — never let it close the gap.');
      this.done();
      return;
    }
    // it settles back into the floor when the living move on, or when it has
    // wandered itself apart
    if (Math.abs(c.currentRoomIndex - this.spawnRoom) >= 2 || this.lifeT > 75) this.done();
  }

  private roomOf(p: Vec3): number {
    const rooms = this.ctx.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (Math.abs(p.x - r.origin.x) <= r.width / 2 && Math.abs(p.z - r.origin.z) <= r.depth / 2) return i;
    }
    return -1;
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
  }
}
