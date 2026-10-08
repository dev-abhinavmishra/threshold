/**
 * Set-piece entities: Pursuer (authored chases), Orrery (Lens Hall beams),
 * and Editor (Underscript climax). These are scripted encounters, not
 * free-roamers — they exist only inside their milestone controllers.
 */
import * as THREE from 'three';
import { Entity, corridorPath, followPath, pathLength } from './base';
import { v3, v3copy, v3dist, clamp } from '../engine/math';
import { ENTITY_TUNING } from '../game/config';
import { MAT } from '../world/materials';
import { riggedFigure, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';
import { noiseCanBeHeard, withinRouseRadius } from '../engine/noiseRouse';
import { pointInRoom } from '../engine/doorGeo';
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

  /** A primed lens — the beams are already mid-sweep when the door opens. */
  prime(): void {
    this.beamAngle += 2.4;
  }
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
  private scentT = 0;
  // sprint 295 — appetite: every in-room mark it drags to teaches it
  // the room is alive; at 2+ it hunts in earnest (faster, longer-lived)
  private markReads = 0;
  private eagerCued = false;
  private get eager() { return this.markReads >= 2; }

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
    // your face on the crew boards reads a tier harder — the rubble
    // marks the wanted at half again its usual reach
    const notices = d < this.tuning.seeRange * (this.ctx.wanted?.() ? 1.5 : 1) && p.protection !== 'hidden' && this.roomOf(p.pos) === this.spawnRoom;
    let speed = this.tuning.speed * (this.eager ? 1.15 : 1);
    if (notices) { this.target = v3(p.pos.x, 0, p.pos.z); speed *= this.eager ? 1.75 : 1.4; }

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

    // Scent: a killed hazard in its room reads as fresh footprints —
    // the rubble drags itself over the sign.
    this.scentT -= dt;
    if (this.scentT <= 0) {
      this.scentT = 1.6;
      const evs = c.hazardEvidence?.(`grafter:${this.spawnRoom}`, this.pos.x, this.pos.z, 40) ?? [];
      for (const ev of evs) {
        if (this.roomOf(ev.pos) !== this.spawnRoom) continue;
        this.markReads += 1;
        this.target = v3(ev.pos.x, 0, ev.pos.z);
        this.roamT = 0;
        c.cue('grafter-grind', this.pos, ev.old ? '[stone drags to an old mark — it does not know]' : ev.weak ? '[stone snuffles the ash — it smells hands]' : '[stone drags to the fresh sign]', { severity: 'warn' });
        break;
      }
      if (this.eager && !this.eagerCued) {
        this.eagerCued = true;
        c.cue('grafter-grind', this.pos, '[stone has tasted too much — it hunts in earnest]', { severity: 'warn' });
      }
    }
    this.grindT += dt;
    if (this.grindT > 4.5) {
      this.grindT = 0;
      c.cue('grafter-grind', this.pos, '[stone drags on stone]', { severity: 'warn' });
    }

    if (d < this.tuning.killRange && p.protection !== 'hidden' && !this.rising()) {
      this.rig?.play('attack', 0.05);
      c.cue('grafter-strike', this.pos, '', { severity: 'danger' });
      c.killPlayer('grafter', 'The Grafter is slow. Walk around it — never let it close the gap.');
      this.done();
      return;
    }
    // it settles back into the floor when the living move on, or when it has
    // wandered itself apart
    if (Math.abs(c.currentRoomIndex - this.spawnRoom) >= 2 || this.lifeT > (this.eager ? 120 : 75)) this.done();
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

/* ============================ SWAMPER ============================ */
/** The drowned crewman of the flooded halls. It lies under the standing
 *  water and answers what the water carries — an upright wader stirs the
 *  flood, and every splash it makes pulls the shape toward it. Crouch-
 *  wading stirs nothing, and an opened drain takes its medium with it. */
export class Swamper extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private target = v3();
  private spawnRoom = 0;
  private room: { origin: { x: number; z: number }; yaw: number; spec?: { width: number; depth: number } | null } | null = null;
  private roomO = v3();
  private roomW = 0;
  private roomD = 0;
  private huntUntil = 0;
  private strikeCd = 0;
  private surfT = 0;
  private driftT = 0;
  private rippleT = 0;
  private lifeT = 0;
  private noiseUnsub: (() => void) | null = null;

  constructor() { super('swamper', ENTITY_TUNING.swamper); }

  override threatPos(): Vec3 { return this.pos; }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.spawnRoom = c.currentRoomIndex;
    this.room = room;
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    this.roomW = room.width;
    this.roomD = room.depth;
    // lie mid-room, on the far corner from where the player wades in
    const p = c.player.pos;
    let bx = this.roomO.x, bz = this.roomO.z, best = -1;
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const px = this.roomO.x + cx * (this.roomW / 2 - 1.4);
      const pz = this.roomO.z + cz * (this.roomD / 2 - 1.4);
      const d = Math.hypot(px - p.x, pz - p.z);
      if (d > best) { best = d; bx = px; bz = pz; }
    }
    this.pos = v3(bx, 0, bz);
    this.target = v3(bx, 0, bz);
    const g = new THREE.Group();
    const rig = riggedFigure('inkGhost');
    if (rig) {
      this.rig = rig;
      rig.play('move', 0);
      g.add(rig.group);
    } else {
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), MAT.ink());
      body.position.y = 0.9;
      g.add(body);
    }
    // the displacement it makes — a dark patch on the sheet
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.8, 18), MAT.ink());
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 1.4; // local; group sits low so this skims the flood
    g.add(patch);
    g.position.set(this.pos.x, -1.35, this.pos.z);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('puddle-splash', this.pos, '[the water is not empty]', { severity: 'warn' });
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    this.state = 'engage';
  }

  /** Everything the flood carries reaches it — wading splashes, thrown
   *  pebbles, the drain crank. It glides to the point and listens; if the
   *  sound is still there, it takes it. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'engage' || !this.room) return;
    if (e.source || !noiseCanBeHeard(e)) return;
    if (!pointInRoom(this.room, e.x, e.z, 0.4)) return;
    this.target = v3(e.x, 0, e.z);
    this.huntUntil = c.now + 5;
  }

  private pickDrift(): void {
    const rng = new Rng(this.ctx.seed + Math.floor(this.lifeT * 131));
    this.target = v3(
      this.roomO.x + rng.range(-this.roomW / 2 + 1.4, this.roomW / 2 - 1.4),
      0,
      this.roomO.z + rng.range(-this.roomD / 2 + 1.4, this.roomD / 2 - 1.4),
    );
    this.driftT = this.ctx.now + 6;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.lifeT += dt;
    // the flood is its medium — drain the room and it leaves with the water
    if (c.isRoomDrained?.(this.spawnRoom)) {
      c.cue('puddle-splash', this.pos, '[something slips down the drain]', { severity: 'info' });
      this.done();
      return;
    }
    if (Math.abs(c.currentRoomIndex - this.spawnRoom) >= 2) { this.done(); return; }

    const dP = v3dist(this.pos, p.pos);
    // Strike: it knows you only by the water you move. An upright wader
    // stirs; a crouched one is a stone.
    const stirred = !p.crouching && Math.hypot(p.vel.x, p.vel.z) > 0.45 && p.protection !== 'hidden';
    if (dP < this.tuning.killRange && stirred && !this.rising() && c.now >= this.strikeCd) {
      this.strikeCd = c.now + 8;
      this.surfT = 0.9;
      this.huntUntil = 0;
      this.rig?.play('attack', 0.05);
      c.cue('puddle-splash', this.pos, '[the water stands up]', { severity: 'danger' });
      c.sound.emit({ x: p.pos.x, y: 0.3, z: p.pos.z, intensity: 0.7, category: 'impact', caption: '[the flood breaks]', source: 'swamper' });
      c.damagePlayer(this.tuning.damage, 'swamper', 'The Swamper finds you by the water you move. Crouch-wade — or open the drain first.');
      // slip back to the far corner and lie again
      let bx = this.roomO.x, bz = this.roomO.z, best = -1;
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const px = this.roomO.x + cx * (this.roomW / 2 - 1.4);
        const pz = this.roomO.z + cz * (this.roomD / 2 - 1.4);
        const d = Math.hypot(px - p.pos.x, pz - p.pos.z);
        if (d > best) { best = d; bx = px; bz = pz; }
      }
      this.target = v3(bx, 0, bz);
    }

    const hunting = c.now < this.huntUntil;
    const speed = hunting ? this.tuning.speed : 0.5;
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 0.3) {
      this.pos.x += (dx / dd) * speed * dt;
      this.pos.z += (dz / dd) * speed * dt;
      this.rig?.play('move');
    } else if (hunting) {
      // arrived at the sound and found it gone — it circles once, then lies
      this.huntUntil = 0;
      c.cue('puddle-splash', this.pos, '[the water moves where the sound was]', { severity: 'info' });
    } else if (c.now > this.driftT) {
      this.pickDrift();
    } else {
      this.rig?.play('idle');
    }

    // A quiet wader gets the tell instead of the teeth: a patch of moving
    // water beside them is the only warning the flood gives.
    if (!hunting && dP < 7 && c.now > this.rippleT) {
      this.rippleT = c.now + 6;
      c.cue('puddle-splash', this.pos, '[the water moves, close]', { severity: 'warn' });
    }

    if (this.mesh) {
      this.surfT = Math.max(0, this.surfT - dt);
      const rise = this.surfT > 0 ? 1.1 * Math.min(1, this.surfT / 0.45) : 0;
      this.mesh.position.set(this.pos.x, -1.35 + rise, this.pos.z);
      if (dd > 0.3) this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    this.rig?.update(dt);
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
  }
}

/* ============================ HAULER ============================ */
/** The under's working drudge: it drags a salvage sledge on a slow a–b
 *  haul through its room, scraping loud enough to hear two doors off.
 *  The sledge is a moving loot source — crouch beside it and pick it
 *  while it hauls. Loud noise near it makes it drop the haul and ram
 *  the point; quiet picking is free. */
export class Hauler extends Entity {
  private pos = v3();
  private target = v3();
  private spawnRoom = 0;
  private roomO = v3();
  private roomW = 0;
  private roomD = 0;
  private endA = v3();
  private endB = v3();
  private heading = v3(0, 0, 1);
  private alerted: Vec3 | null = null;
  private struck = false;
  private scrapeT = 0;
  private lifeT = 0;
  private noiseUnsub: (() => void) | null = null;
  private sledge: THREE.Group | null = null;
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private lampBulb: THREE.Mesh | null = null;
  private lampLight: THREE.PointLight | null = null;

  /** The drag's world position — the interactable anchors here per frame. */
  sledgePos = v3();
  /** World pos of the work-lamp on the sledge's tail — the strip point anchors here. */
  lampPos = v3();
  /** Picks left on the sledge — a sledge picked clean stops registering. */
  stock = 4;
  /** The hooded work-lamp rides the tail — a moving pool of light in dark
   *  rooms. Strip it and the drag goes dark — unless the fixtures are
   *  live here: in a lit room the team scavenges a bulb off the walls and
   *  the lamp fights on, dimmer. One scavenge per haul; the second strip
   *  pays less and the dark is permanent. */
  lampLit = true;
  /** True once the team has scavenged a replacement bulb (lit room only). */
  relit = false;
  private relightT = 0;

  constructor() { super('hauler', ENTITY_TUNING.hauler); }

  override threatPos(): Vec3 { return this.pos; }
  get roomIdx(): number { return this.spawnRoom; }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.spawnRoom = c.currentRoomIndex;
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    this.roomW = room.width;
    this.roomD = room.depth;
    // the haul runs the room's long axis, clear of the walls
    const span = Math.max(this.roomW, this.roomD) / 2 - 1.3;
    const long = this.roomW >= this.roomD ? v3(1, 0, 0) : v3(0, 0, 1);
    this.endA = v3(this.roomO.x - long.x * span, 0, this.roomO.z - long.z * span);
    this.endB = v3(this.roomO.x + long.x * span, 0, this.roomO.z + long.z * span);
    this.pos = v3copy(v3(), this.endA);
    this.target = v3copy(v3(), this.endB);
    this.sledgePos = v3copy(v3(), this.pos);

    const g = new THREE.Group();
    const rig = riggedFigure('yeti');
    if (rig) {
      this.rig = rig;
      rig.play('move', 0);
      g.add(rig.group);
    } else {
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.3, 6), MAT.steelDark());
      body.position.y = 0.65;
      g.add(body);
    }
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    // the sledge itself — a drag behind the haul line
    const s = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 1.1), MAT.darkOak());
    bed.position.y = 0.16;
    s.add(bed);
    for (const [sx, sz, sy] of [[-0.18, -0.2, 0.38], [0.16, 0.22, 0.34]] as const) {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), MAT.figureCloth());
      sack.scale.y = 0.7;
      sack.position.set(sx, sy, sz);
      s.add(sack);
    }
    // a hooded work-lamp on the tail — a moving pool of light in the dark
    const lp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.62, 6), MAT.steelDark());
    pole.position.y = 0.45;
    lp.add(pole);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.12, 8, 1, true), MAT.steelDark());
    hood.position.y = 0.8;
    lp.add(hood);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), MAT.amber());
    bulb.position.y = 0.74;
    lp.add(bulb);
    this.lampBulb = bulb;
    const light = new THREE.PointLight(0xffa95e, 0.85, 5.5, 1.8);
    light.position.y = 0.74;
    lp.add(light);
    this.lampLight = light;
    lp.position.set(0, 0, -0.62);
    s.add(lp);
    s.position.copy(this.sledgePos);
    this.sledge = s;
    c.addEntityMesh(s);
    c.cue('grafter-grind', this.pos, '[something hauls salvage down the hall]', { severity: 'warn' });
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    this.state = 'engage';
  }

  /** It can't see — but the sledge hears enough. A crash near the haul
   *  pulls the whole team onto the sound point, and it rams what it finds. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'engage') return;
    if (e.source || !noiseCanBeHeard(e)) return;
    const room = c.rooms[this.spawnRoom];
    if (!room || !pointInRoom(room, e.x, e.z, 0.4)) return;
    // the wanted get a wider ear — the boards told it to listen
    if (v3dist(this.pos, v3(e.x, 0, e.z)) > 7 * (this.ctx.wanted?.() ? 1.5 : 1)) return;
    this.alerted = v3(e.x, 0, e.z);
    this.struck = false;
    c.cue('grafter-grind', this.pos, '[the scrape halts — it sets the sledge down]', { severity: 'warn' });
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    this.lifeT += dt;
    if (Math.abs(c.currentRoomIndex - this.spawnRoom) >= 2) { this.done(); return; }
    const p = c.player;

    // the ram: the whole team hits the sound point — once per rouse
    if (this.alerted && !this.struck && !this.rising() && v3dist(this.pos, p.pos) < this.tuning.killRange) {
      this.struck = true;
      this.rig?.play('attack', 0.05);
      c.cue('grafter-grind', this.pos, '[the sledge team rams through]', { severity: 'danger' });
      c.sound.emit({ x: this.pos.x, y: 0.5, z: this.pos.z, intensity: 0.6, category: 'impact', caption: '[the sledge slams]', source: 'hauler' });
      c.damagePlayer(this.tuning.damage, 'hauler', 'The Hauler rams what it hears near the sledge — crash noise by the haul line is the mistake. Pick it quiet, or stay loud and gone.');
    }
    const goal = this.alerted ?? this.target;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 0.35) {
      const sp = this.alerted ? this.tuning.speed * 2.6 : this.tuning.speed;
      this.pos.x += (dx / dd) * sp * dt;
      this.pos.z += (dz / dd) * sp * dt;
      this.heading = v3(dx / dd, 0, dz / dd);
      this.rig?.play('move');
      if (!this.alerted && c.now > this.scrapeT) {
        this.scrapeT = c.now + 2.4;
        c.sound.emit({ x: this.pos.x, y: 0.3, z: this.pos.z, intensity: 0.3, category: 'impact', caption: '[the sledge scrapes]', source: 'hauler' });
      }
    } else if (this.alerted) {
      this.alerted = null;
      c.cue('grafter-grind', this.pos, '[it finds nothing — the haul resumes]', { severity: 'info' });
    } else {
      // turn at the end of the haul line
      this.target = this.target === this.endA ? this.endB : this.endA;
      this.rig?.play('idle');
    }

    // the drag trails the haul line
    this.sledgePos = v3(this.pos.x - this.heading.x * 1.25, 0, this.pos.z - this.heading.z * 1.25);
    if (this.mesh) {
      this.mesh.position.copy(this.pos);
      if (dd > 0.35) this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    if (this.sledge) {
      this.sledge.position.copy(this.sledgePos);
      this.sledge.rotation.y = Math.atan2(this.heading.x, this.heading.z);
    }
    this.lampPos.x = this.sledgePos.x - this.heading.x * 0.62;
    this.lampPos.y = 0.75;
    this.lampPos.z = this.sledgePos.z - this.heading.z * 0.62;
    // a stripped lamp only stays dark where the mains are dead — under a
    // lit ceiling the team pulls a bulb off the wall fixtures and wires it
    // back on, weaker than the works lamp was
    if (!this.lampLit && !this.relit) {
      const room = c.rooms[this.spawnRoom];
      if (room && !room.darkRoom) {
        this.relightT += dt;
        if (this.relightT > 3.5) {
          this.relit = true;
          this.lampLit = true;
          if (this.lampLight) { this.lampLight.visible = true; this.lampLight.distance = 4; }
          if (this.lampBulb) this.lampBulb.material = MAT.amber();
          c.cue('drawer', this.lampPos, '[the team scavenges a bulb — the lamp fights on, dimmer]', { severity: 'info' });
        }
      }
    }
    if (this.lampLit && this.lampLight) {
      this.lampLight.intensity = (this.relit ? 0.5 : 0.85) + Math.sin(this.lifeT * 7.3) * 0.1;
    }
    this.rig?.update(dt);
  }

  /** 'Strip the lamp' reaches him — the drag goes dark, the light is yours.
   *  A scavenged bulb is a smaller prize, and it can't be scavenged twice. */
  stripLamp(): void {
    this.lampLit = false;
    if (this.lampLight) this.lampLight.visible = false;
    if (this.lampBulb) this.lampBulb.material = MAT.screenDark();
    this.ctx.cue('drawer', this.lampPos,
      this.relit ? '[the scavenged bulb comes free — this drag stays dark]' : '[the drag goes dark — the team works blind]',
      { severity: 'info' });
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    if (this.sledge) { this.ctx.removeEntityMesh(this.sledge); this.sledge = null; }
    this.lampBulb = null;
    this.lampLight = null;
    this.rig = null;
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
  }
}

/* ============================ LAUNDRESS ============================ */
/** A drowned laundress works a flooded room's drain basin — her wash chokes
 *  the crank. While she keeps the basin the drain verb fails; loud noise
 *  pulls her off it to inspect the splash, which is the window. Touch the
 *  crank while she watches and she takes your hand. When the water goes
 *  she rides it out. */
export class Laundress extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private spawnRoom = 0;
  private roomO = v3();
  private sniffUntil = 0;
  private scrubT = 0;
  private hissT = 0;
  private struckCd = 0;
  private noiseUnsub: (() => void) | null = null;
  /** The basin she guards — public so the drain verb can ask her. */
  drainPos = v3();
  /** Her claimed load — 'Search the wash' skims it while she's off the basin. */
  basketFull = true;
  private keened = false;
  /** The point she left the basin to inspect. */
  private alerted: Vec3 | null = null;
  get guarding(): boolean { return !this.alerted; }

  constructor() { super('laundress', ENTITY_TUNING.laundress); }

  override threatPos(): Vec3 { return this.pos; }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.spawnRoom = c.currentRoomIndex;
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    // her basin: the room's plumbing prop the drain verb sits on
    const DRAIN_PROPS = new Set(['pipeManifold', 'conduitRun', 'sumpPump', 'hydrant', 'wallVent']);
    const basin = (room.spec?.props ?? []).find((pp) => DRAIN_PROPS.has(pp.kind));
    const lx = basin ? basin.x : 0, lz = basin ? basin.z : 0;
    const cyr = Math.cos(room.yaw), syr = Math.sin(room.yaw);
    // generator's rotXZ: x*c + z*s, -x*s + z*c
    this.drainPos = v3(this.roomO.x + lx * cyr + lz * syr, 0, this.roomO.z - lx * syr + lz * cyr);
    // she stands a half-metre off the fitting, facing it
    const ox = this.roomO.x - this.drainPos.x, oz = this.roomO.z - this.drainPos.z;
    const ol = Math.hypot(ox, oz) || 1;
    this.pos = v3(this.drainPos.x + (ox / ol) * 0.55, 0, this.drainPos.z + (oz / ol) * 0.55);
    const g = new THREE.Group();
    const rig = riggedFigure('hooded');
    if (rig) {
      this.rig = rig;
      rig.play('move', 0);
      g.add(rig.group);
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), MAT.ink());
      body.position.y = 1.0;
      g.add(body);
    }
    // the bundle she works — pale cloth over the basin
    const bundle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT.figureCloth());
    bundle.position.set(this.drainPos.x - this.pos.x, 0.55, this.drainPos.z - this.pos.z);
    g.add(bundle);
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('puddle-splash', this.pos, '[wash, wring — somebody works the drain]', { severity: 'warn' });
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    this.state = 'engage';
  }

  private hear(e: SoundEvent): void {
    if (this.state !== 'engage' || e.source || !noiseCanBeHeard(e)) return;
    const room = this.ctx.rooms[this.spawnRoom];
    if (!pointInRoom(room, e.x, e.z, 0.4)) return;
    // the wanted get a wider ear — the boards told her to listen
    if (v3dist(this.pos, v3(e.x, 0, e.z)) > 6 * (this.ctx.wanted?.() ? 1.5 : 1)) return;
    this.alerted = v3(e.x, 0, e.z);
    this.sniffUntil = this.ctx.now + 5;
  }

  /** The drain press reaches her — she takes the hand on the crank. */
  aggravate(p: Vec3): void {
    const c = this.ctx;
    if (this.struckCd > 0 || this.rising()) return;
    c.cue('puddle-splash', this.pos, '[she wrings her hands]', { severity: 'warn' });
    c.sound.emit({ x: this.pos.x, y: 0.5, z: this.pos.z, intensity: 0.5, category: 'impact', caption: '[a hiss through wet cloth]', source: 'laundress' });
    if (v3dist(this.pos, p) < this.tuning.killRange + 0.8) {
      this.struckCd = 2.5;
      this.rig?.play('attack', 0.05);
      c.damagePlayer(this.tuning.damage, 'laundress', 'The Laundress keeps her basin — pull her off the drain with a thrown sound before you touch the crank.');
    }
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player.pos;
    this.hissT -= dt; this.struckCd -= dt; this.scrubT -= dt;
    // when her medium goes she goes with it
    if (c.isRoomDrained?.(this.spawnRoom)) {
      c.cue('puddle-splash', this.pos, '[the wash goes down the drain]', { severity: 'info' });
      this.state = 'done';
      return;
    }
    // work-song at the basin — ambient, below the hearing floor
    if (this.guarding && this.scrubT <= 0) {
      this.scrubT = 3.2;
      c.sound.emit({ x: this.pos.x, y: 0.4, z: this.pos.z, intensity: 0.25, category: 'item', caption: '[wash, wring]', source: 'laundress' });
    }
    // standing too close to a watched basin is its own tell
    if (this.guarding && this.hissT <= 0 && v3dist(this.pos, p) < 1.6) {
      this.hissT = 3;
      c.cue('puddle-splash', this.pos, '[she wrings her hands — the drain is watched]', { severity: 'warn' });
    }
    const goal = this.alerted ?? this.drainPos;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 0.3) {
      const sp = this.alerted ? this.tuning.speed * 1.6 : this.tuning.speed;
      this.pos.x += (dx / dd) * sp * dt;
      this.pos.z += (dz / dd) * sp * dt;
    } else if (this.alerted && c.now > this.sniffUntil) {
      this.alerted = null; // nothing at the splash — back to the basin
      // she counts her load — a pilfered basket keens, loud enough to feed hunters
      if (!this.basketFull && !this.keened) {
        this.keened = true;
        c.cue('puddle-splash', this.pos, '[a keen — the wash is lighter]', { severity: 'warn' });
        c.sound.emit({ x: this.pos.x, y: 0.6, z: this.pos.z, intensity: 0.55, category: 'item', caption: '[a wail at the basin]', source: 'laundress' });
      }
    }
    // hands on her basin while she works are bitten
    if (this.guarding && !this.rising() && this.struckCd <= 0 && v3dist(this.pos, p) < 0.8) {
      this.aggravate(p);
    }
    if (this.mesh) {
      this.mesh.position.copy(this.pos);
      if (dd > 0.3) this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    this.rig?.update(dt);
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
  }
}

/** The Auditor — a desk clerk who knows your hands are in his book. Every
 *  claim tag drawn, sledge picked, and basket stolen below accrues to a
 *  tally the Game counts (`claimsOwed`). He doesn't hunt noise or sight —
 *  he hunts THEFT: enter his room carrying unpaid claims and he holds out
 *  the ledger. Settle at his desk and you're square; walk out owing and he
 *  walks the book after you, room to room, at a clerk's patient pace. His
 *  touch is a beating, not a bargain — the debt still stands. */
export class Auditor extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private spawnRoom = 0;
  private roomO = v3();
  private lifeT = 0;
  private repathT = 0;
  private struckCd = 0;
  private path: Vec3[] = [];
  private traveled = 0;
  private homebound = false;
  private interactId: string | null = null;
  /** His desk — the settle point anchors here. */
  deskPos = v3();
  /** He has noted your hands and holds out the tally. */
  demanded = false;
  /** He has left his desk to collect in person. */
  pursuing = false;

  constructor() { super('auditor', ENTITY_TUNING.auditor); }

  override threatPos(): Vec3 { return this.pos; }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.spawnRoom = c.currentRoomIndex;
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    const DESKS = new Set(['filing', 'cubicle', 'schoolDesk', 'recordsCage', 'keyCabinet']);
    const desk = (room.spec?.props ?? []).find((pp) => DESKS.has(pp.kind));
    const lx = desk ? desk.x : 0, lz = desk ? desk.z : 0;
    const cyr = Math.cos(room.yaw), syr = Math.sin(room.yaw);
    // generator's rotXZ: x*c + z*s, -x*s + z*c
    this.deskPos = v3(this.roomO.x + lx * cyr + lz * syr, 0, this.roomO.z - lx * syr + lz * cyr);
    // he works the room-center side of the desk
    const ox = this.roomO.x - this.deskPos.x, oz = this.roomO.z - this.deskPos.z;
    const ol = Math.hypot(ox, oz) || 1;
    this.pos = v3(this.deskPos.x + (ox / ol) * 0.7, 0, this.deskPos.z + (oz / ol) * 0.7);
    const g = new THREE.Group();
    const rig = riggedFigure('hooded');
    if (rig) { this.rig = rig; rig.play('idle', 0); g.add(rig.group); }
    else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.05, 4, 8), MAT.ink());
      body.position.y = 1.0;
      g.add(body);
    }
    // the book itself — a flat dark slab carried before him
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.26), MAT.darkOak());
    book.position.set(0, 1.05, 0.3);
    book.rotation.x = -0.35;
    g.add(book);
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('chalk-mark', this.pos, '[a ledger opens — somebody tallies what you owe]', { severity: 'warn' });
    // the tally drawer is pilferable — reaching into HIS book is the
    // loudest claim in the under, and he is standing right at the desk
    c.addInteractable({
      kind: 'tallyDrawer', id: this.tallyId(),
      pos: v3(this.deskPos.x, 0.9, this.deskPos.z),
      prompt: 'Rifle the tally drawer', holdTime: 0.9,
      data: { stock: 1, keeper: this as unknown as Record<string, unknown> },
      enabled: true, priority: 3, // outrank desk loot sockets — his own drawer
    });
    this.state = 'engage';
  }

  private roomOf(p: Vec3): number {
    const rooms = this.ctx.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (Math.abs(p.x - r.origin.x) <= r.width / 2 && Math.abs(p.z - r.origin.z) <= r.depth / 2) return i;
    }
    return -1;
  }

  private settleId(): string { return `audit-${this.spawnRoom}`; }
  private tallyId(): string { return `tally-${this.spawnRoom}`; }

  /** Hands in his drawer — the book slaps open at your name on the spot. */
  rifledTally(): void {
    if (this.state === 'done' || this.demanded) return;
    // proximity, not room bounds — a drawer on the room's edge can be
    // reached from the overlap; hands in it mean you are AT his desk
    const dx = this.ctx.player.pos.x - this.deskPos.x, dz = this.ctx.player.pos.z - this.deskPos.z;
    if (dx * dx + dz * dz > 2.6 * 2.6) return;
    this.openLedger();
  }

  private openLedger(): void {
    const c = this.ctx;
    this.demanded = true;
    this.interactId = this.settleId();
    // the point sits a step off his desk toward the room center — settle
    // means walking up to him, not skimming past the furniture
    const ox = this.roomO.x - this.deskPos.x, oz = this.roomO.z - this.deskPos.z;
    const ol = Math.hypot(ox, oz) || 1;
    c.addInteractable({
      kind: 'audit', id: this.interactId,
      pos: v3(this.deskPos.x + (ox / ol) * 1.15, 0.9, this.deskPos.z + (oz / ol) * 1.15),
      prompt: 'Settle the ledger — see the tally', holdTime: 1.0,
      data: { auditor: this as unknown as Record<string, unknown> },
      enabled: true, priority: 4,
    });
    c.cue('chalk-mark', this.pos, '[the clerk licks a thumb — your hands are in his book]', { severity: 'warn' });
  }

  private closeLedger(): void {
    if (this.interactId) { this.ctx.removeInteractable(this.interactId); this.interactId = null; }
  }

  /** The settle press reaches him — the Game has already taken the toll. */
  settled(): void {
    this.demanded = false;
    this.pursuing = false;
    this.homebound = true;
    this.traveled = 0;
    this.path = [];
    this.closeLedger();
    this.ctx.cue('checkpoint', this.pos, '[the clerk stamps you square]', { severity: 'info' });
  }

  private collect(): void {
    const c = this.ctx;
    this.struckCd = 3;
    this.rig?.play('attack', 0.05);
    c.sound.emit({ x: this.pos.x, y: 1, z: this.pos.z, intensity: 0.45, category: 'impact', caption: '[the book slaps shut]', source: 'auditor' });
    c.damagePlayer(this.tuning.damage, 'auditor', 'The Auditor collects in kind — settle his ledger at the desk, or carry your hands past a friendlier door.');
    c.cue('chalk-mark', this.pos, '[the clerk marks your refusal — the tally stands]', { severity: 'warn' });
    // a beaten debtor walks home; the debt still stands for the next clerk
    this.pursuing = false;
    this.demanded = false;
    this.homebound = true;
    this.traveled = 0;
    this.path = [];
  }

  private repath(targetRoom: number): void {
    const c = this.ctx;
    const from = this.roomOf(this.pos);
    const a = from >= 0 ? from : this.spawnRoom;
    this.path = corridorPath(c.rooms, a, targetRoom);
    // walking a→b: if the path runs backward through the chain, follow it
    // from the near end — corridorPath is ordered low→high
    this.traveled = a <= targetRoom ? 0 : Math.max(0, pathLength(this.path));
    // keep our own offset — start slightly ahead/behind the room entry
    this.repathT = 1.5;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player.pos;
    this.lifeT += dt;
    this.struckCd -= dt;
    const owed = c.claimsOwed?.() ?? 0;
    const pRoom = this.roomOf(p);
    const myRoom = this.roomOf(this.pos);

    // desk work: notice unpaid hands in his room
    if (!this.pursuing && !this.homebound) {
      const step = v3(this.deskPos.x + (this.roomO.x - this.deskPos.x) * 0.08, 0, this.deskPos.z + (this.roomO.z - this.deskPos.z) * 0.08);
      const dx = step.x - this.pos.x, dz = step.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.2) { this.pos.x += (dx / dd) * this.tuning.speed * 0.4 * dt; this.pos.z += (dz / dd) * this.tuning.speed * 0.4 * dt; }
      if (pRoom === this.spawnRoom && owed > 0 && !this.demanded) this.openLedger();
      // a debtor who slips his room while owed gets the walk-after
      if (this.demanded && owed > 0 && pRoom !== this.spawnRoom && pRoom >= 0) {
        this.pursuing = true;
        this.closeLedger();
        c.cue('chalk-mark', this.pos, '[the clerk walks his ledger after you]', { severity: 'warn' });
        this.repath(pRoom);
      }
    }

    // the walk-after — a clerk's patience, room to room
    if (this.pursuing) {
      this.repathT -= dt;
      if (pRoom >= 0) {
        if (this.repathT <= 0 || this.path.length === 0) this.repath(pRoom);
        const forward = myRoom <= pRoom;
        this.traveled += (forward ? 1 : -1) * this.tuning.speed * dt;
        this.traveled = Math.max(0, Math.min(pathLength(this.path), this.traveled));
        const f = followPath(this.path, this.traveled);
        const ox = f.pos.x - this.pos.x, oz = f.pos.z - this.pos.z;
        this.pos.x += ox * 0.5; this.pos.z += oz * 0.5;
        if (Math.hypot(ox, oz) > 0.1 && this.mesh) this.mesh.rotation.y = Math.atan2(ox, oz);
      } else {
        // lost the room — drift toward the last seen point
        const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
        const dd = Math.hypot(dx, dz) || 1;
        this.pos.x += (dx / dd) * this.tuning.speed * dt;
        this.pos.z += (dz / dd) * this.tuning.speed * dt;
      }
      this.rig?.play('move');
      // settled or evaded — the book closes (pRoom -1 = between bounds,
      // not evaded — the pursuit stays on)
      if (owed <= 0 || (pRoom >= 0 && Math.abs(pRoom - this.spawnRoom) > 8)) {
        this.pursuing = false;
        this.demanded = false;
        this.homebound = true;
        this.traveled = 0;
        this.path = [];
      } else if (!this.rising() && this.struckCd <= 0 && v3dist(this.pos, p) < this.tuning.killRange) {
        this.collect();
      }
    }

    // the return leg — back to the desk, ledger shut
    if (this.homebound) {
      const dx = this.deskPos.x - this.pos.x, dz = this.deskPos.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.3) {
        // walk the door lines home — repath if the straight line stalls on walls
        this.pos.x += (dx / dd) * this.tuning.speed * dt;
        this.pos.z += (dz / dd) * this.tuning.speed * dt;
        this.rig?.play('move');
      } else {
        this.homebound = false;
        this.rig?.play('idle');
      }
    }

    if (this.mesh) this.mesh.position.copy(this.pos);
    this.rig?.update(dt);
  }

  protected override onDone(): void {
    this.closeLedger();
    this.ctx.removeInteractable(this.tallyId());
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
  }
}

/** The House Detective — a plain suit behind a desk or counter on the main
 *  route, keeping the register of whose held property went out the door.
 *  Every imprint claim drawn accrues to `heldOwed`. Walk into his room
 *  owing and he clocks your face over a slow look — then he doesn't walk
 *  after you. He lifts the house phone: for a stretch of route either way,
 *  every room you enter rings ahead of you, and the room's listeners are
 *  already awake when you arrive. Settle at his desk — pay the register,
 *  he strikes your name — or outrun the wire. Or sabotage it: the house
 *  line runs through a junction box beside his entry door — pull it and
 *  the broadcast dies, but the dead wire is damages he files on the
 *  spot. He never touches you; his weapon is that the building now
 *  knows your face. */
export class Detective extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private spawnRoom = 0;
  private roomO = v3();
  private lifeT = 0;
  private lookT = 0;
  private lastPlayerRoom = -1;
  private homebound = false;
  private interactId: string | null = null;
  /** His desk — the settle point anchors here. */
  deskPos = v3();
  /** He has looked up from the register and knows your face. */
  clocked = false;
  /** Your face is on the wire — rooms ahead ring for you. */
  warranted = false;
  /** His phone line — a junction box on the wall by the entry door.
   *  Pulled, the wire dies; the damages go in his book. */
  lineDead = false;
  private linePos = v3();
  private lineMesh: THREE.Group | null = null;

  constructor() { super('detective', ENTITY_TUNING.detective); }

  override threatPos(): Vec3 { return this.pos; }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.spawnRoom = c.currentRoomIndex;
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    const DESKS = new Set(['counter', 'desk', 'writingDesk', 'filing']);
    const desk = (room.spec?.props ?? []).find((pp) => DESKS.has(pp.kind));
    const lx = desk ? desk.x : 0, lz = desk ? desk.z : 0;
    const cyr = Math.cos(room.yaw), syr = Math.sin(room.yaw);
    // generator's rotXZ: x*c + z*s, -x*s + z*c
    this.deskPos = v3(this.roomO.x + lx * cyr + lz * syr, 0, this.roomO.z - lx * syr + lz * cyr);
    // he stands the room-center side of the desk
    const ox = this.roomO.x - this.deskPos.x, oz = this.roomO.z - this.deskPos.z;
    const ol = Math.hypot(ox, oz) || 1;
    this.pos = v3(this.deskPos.x + (ox / ol) * 0.7, 0, this.deskPos.z + (oz / ol) * 0.7);
    const g = new THREE.Group();
    // plain dark suit — the smallest figure in the library reads as a houseman
    const rig = riggedFigure('ninja');
    if (rig) { this.rig = rig; rig.play('idle', 0); g.add(rig.group); }
    else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.95, 4, 8), MAT.figureCloth());
      body.position.y = 0.95;
      g.add(body);
    }
    // the register — a thicker slab than the clerk's ledger
    const reg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.32), MAT.darkOak());
    reg.position.set(0, 1.0, 0.32);
    reg.rotation.x = -0.3;
    g.add(reg);
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('chalk-mark', this.pos, '[a register opens — the house is checking names]', { severity: 'warn' });
    // the register drawer is pilferable — your hands in HIS book skip the
    // slow look entirely; he watches you file yourself
    c.addInteractable({
      kind: 'registerDrawer', id: this.registerId(),
      pos: v3(this.deskPos.x, 0.9, this.deskPos.z),
      prompt: 'Rifle the register drawer', holdTime: 0.9,
      data: { stock: 1, keeper: this as unknown as Record<string, unknown> },
      enabled: true, priority: 3, // outrank desk loot sockets — his own drawer
    });
    // the house line — a junction box on the wall beside the entry door,
    // the wire's only counterplay short of settling or outrunning it
    {
      const ex = room.entryDir?.x ?? 0, ez = room.entryDir?.z ?? -1;
      const px = -ez, pz = ex; // wall direction, beside the door
      this.linePos = v3(
        room.entryPos.x + px * 0.75 - ex * 0.25, 0,
        room.entryPos.z + pz * 0.75 - ez * 0.25);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.1), MAT.ink());
      box.position.set(this.linePos.x, 1.25, this.linePos.z);
      box.rotation.y = Math.atan2(-ex, -ez);
      // a run of conduit down the jamb
      const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), MAT.ink());
      pipe.position.set(this.linePos.x, 0.7, this.linePos.z);
      const lg = new THREE.Group();
      lg.add(box); lg.add(pipe);
      c.addEntityMesh(lg);
      this.lineMesh = lg;
      c.addInteractable({
        kind: 'houseLine', id: this.lineId(),
        pos: v3(this.linePos.x, 0.95, this.linePos.z),
        prompt: 'Pull the house line', holdTime: 1.4,
        data: { keeper: this as unknown as Record<string, unknown> },
        enabled: true, priority: 3,
      });
    }
    this.state = 'engage';
  }

  private roomOf(p: Vec3): number {
    const rooms = this.ctx.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (Math.abs(p.x - r.origin.x) <= r.width / 2 && Math.abs(p.z - r.origin.z) <= r.depth / 2) return i;
    }
    return -1;
  }

  private settleId(): string { return `settle-${this.spawnRoom}`; }
  private registerId(): string { return `registerdrawer-${this.spawnRoom}`; }
  private lineId(): string { return `houseline-${this.spawnRoom}`; }

  /** The junction box comes off the wall — sabotage he can't un-notice:
   *  his desk phone dies mid-service, so he files whoever stood in the
   *  room. The broadcast dies; the book stays open. */
  pulledLine(): void {
    if (this.state === 'done' || this.lineDead) return;
    this.lineDead = true;
    const c = this.ctx;
    c.removeInteractable(this.lineId());
    if (this.lineMesh) { c.removeEntityMesh(this.lineMesh); this.lineMesh = null; }
    c.sound.emit({
      x: this.linePos.x, y: 1.2, z: this.linePos.z,
      intensity: 0.5, category: 'item', caption: '[a junction box comes off the wall]',
    });
    c.lineCut?.(); // the dead wire is billed — damages
    c.cue('chalk-mark', this.linePos, '[the house line comes off the wall — dead]', { severity: 'warn' });
    if (this.warranted) {
      this.warranted = false;
      c.cue('chalk-mark', this.pos, '[the wire ahead of you goes quiet]', { severity: 'info' });
    }
    // the phone dies on his desk — he lifts it, gets nothing, files a face
    if (!this.clocked) this.openRegister();
  }

  /** Hands in his register — he doesn't need the slow look now. */
  rifledRegister(): void {
    if (this.state === 'done' || this.clocked) return;
    const dx = this.ctx.player.pos.x - this.deskPos.x, dz = this.ctx.player.pos.z - this.deskPos.z;
    if (dx * dx + dz * dz > 2.6 * 2.6) return;
    this.openRegister();
    this.ctx.cue('chalk-mark', this.pos, '[he watches your hands in his book — your face files itself]', { severity: 'warn' });
  }

  private openRegister(): void {
    const c = this.ctx;
    this.clocked = true;
    this.warranted = !this.lineDead;
    this.interactId = this.settleId();
    const ox = this.roomO.x - this.deskPos.x, oz = this.roomO.z - this.deskPos.z;
    const ol = Math.hypot(ox, oz) || 1;
    c.addInteractable({
      kind: 'settle', id: this.interactId,
      pos: v3(this.deskPos.x + (ox / ol) * 1.15, 0.9, this.deskPos.z + (oz / ol) * 1.15),
      prompt: 'Settle the account — see the register', holdTime: 1.0,
      data: { detective: this as unknown as Record<string, unknown> },
      enabled: true, priority: 4,
    });
    c.cue('chalk-mark', this.pos, this.lineDead
      ? '[the line is dead in his hand — he files your name longhand]'
      : '[a plain suit lifts the house phone — your face goes on the wire]', { severity: 'warn' });
  }

  private closeRegister(): void {
    if (this.interactId) { this.ctx.removeInteractable(this.interactId); this.interactId = null; }
  }

  /** The settle press reaches him — the Game has already taken the toll. */
  settled(): void {
    this.clocked = false;
    this.warranted = false;
    this.homebound = true;
    this.closeRegister();
    this.ctx.cue('checkpoint', this.pos, '[the detective strikes your name]', { severity: 'info' });
  }

  private cool(): void {
    // the wire only reaches so far down the route
    this.warranted = false;
    this.clocked = false;
    this.homebound = true;
    this.closeRegister();
    this.ctx.cue('chalk-mark', this.pos, '[the wire ahead of you goes quiet]', { severity: 'info' });
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player.pos;
    this.lifeT += dt;
    const owed = c.heldOwed?.() ?? 0;
    const pRoom = this.roomOf(p);

    // desk work: drift at the counter's edge
    if (!this.homebound) {
      const step = v3(this.deskPos.x + (this.roomO.x - this.deskPos.x) * 0.08, 0, this.deskPos.z + (this.roomO.z - this.deskPos.z) * 0.08);
      const dx = step.x - this.pos.x, dz = step.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.2) { this.pos.x += (dx / dd) * this.tuning.speed * 0.4 * dt; this.pos.z += (dz / dd) * this.tuning.speed * 0.4 * dt; }
    }

    // the slow look — he clocks a debtor in his room over ~2.5s, then the wire
    if (pRoom === this.spawnRoom && owed > 0 && !this.clocked && !this.homebound) {
      this.lookT += dt;
      if (this.lookT > 2.5) {
        this.openRegister();
        c.cue('chalk-mark', this.pos, '[he has your face — settle, or be known]', { severity: 'warn' });
      }
    } else if (pRoom !== this.spawnRoom) {
      this.lookT = 0;
    }

    // the wire: each fresh room you enter inside reach rings ahead of you
    if (this.warranted && owed > 0 && pRoom >= 0 && pRoom !== this.spawnRoom && pRoom !== this.lastPlayerRoom) {
      this.lastPlayerRoom = pRoom;
      if (Math.abs(pRoom - this.spawnRoom) <= 10) {
        c.sound.emit({
          x: p.x, y: 1, z: p.z, intensity: 0.55, category: 'impact',
          caption: '[the house phone rings ahead of you — they know your face]',
          source: 'detective',
        });
      }
    }
    // outrun the wire, or pay it off — either way the register closes.
    // pRoom -1 means between room bounds (a desk-edge niche, a door
    // threshold) — not actually outrun; the warrant stays warm.
    // Gate on clocked too: a dead line never sets warranted, but the
    // face-ledger still has to cool when you outrun the desk.
    if ((this.warranted || this.clocked) && (owed <= 0 || (pRoom >= 0 && Math.abs(pRoom - this.spawnRoom) > 10))) this.cool();

    // the return beat — back to the desk, register shut
    if (this.homebound) {
      const dx = this.deskPos.x - this.pos.x, dz = this.deskPos.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.3) {
        this.pos.x += (dx / dd) * this.tuning.speed * dt;
        this.pos.z += (dz / dd) * this.tuning.speed * dt;
        this.rig?.play('move');
      } else {
        this.homebound = false;
        this.rig?.play('idle');
      }
    }

    if (this.mesh) this.mesh.position.copy(this.pos);
    this.rig?.update(dt);
  }

  protected override onDone(): void {
    this.closeRegister();
    this.ctx.removeInteractable(this.registerId());
    this.ctx.removeInteractable(this.lineId());
    if (this.lineMesh) { this.ctx.removeEntityMesh(this.lineMesh); this.lineMesh = null; }
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
  }
}

/** The Filer — a hooded clerk at an index cabinet in a dry under records
 *  room, keeping the consult ledger. Every paid read of the under's own
 *  paper — a work order, a crew board, a claim register — is a question
 *  logged: `trailOwed` accrues. Walk into her room carrying enough
 *  questions and over a slow look she files your name — then sends a
 *  runner: for a stretch of rooms either way, every room you enter
 *  listens for your step before you arrive. Square the index at her
 *  station — pay the filing fee, she strikes your card — or outrun the
 *  word. She never leaves her drawer; her weapon is that the halls
 *  already know you're coming. */
export class Filer extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private spawnRoom = 0;
  private roomO = v3();
  private lifeT = 0;
  private lookT = 0;
  private lastPlayerRoom = -1;
  private homebound = false;
  private interactId: string | null = null;
  /** Her station — the square point anchors here. */
  deskPos = v3();
  /** Your name is on a card in her drawer. */
  filed = false;
  /** The word is out — rooms ahead listen for your step. */
  posted = false;
  /** The courier — a physical runner carrying the word down the chain.
   *  Catch it ('Cut the runner') and the message dies with it. */
  runnerPos = v3();
  runnerOut = false;
  private runnerPath: Vec3[] = [];
  private runnerTravel = 0;
  private runnerMesh: THREE.Group | null = null;
  private runnerRig: RiggedFigure | null = null;

  constructor() { super('filer', ENTITY_TUNING.filer); }

  override threatPos(): Vec3 { return this.pos; }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.spawnRoom = c.currentRoomIndex;
    this.roomO = v3(room.origin.x, 0, room.origin.z);
    const STATIONS = new Set(['filing', 'recordsCage', 'keyCabinet']);
    const desk = (room.spec?.props ?? []).find((pp) => STATIONS.has(pp.kind));
    const lx = desk ? desk.x : 0, lz = desk ? desk.z : 0;
    const cyr = Math.cos(room.yaw), syr = Math.sin(room.yaw);
    this.deskPos = v3(this.roomO.x + lx * cyr + lz * syr, 0, this.roomO.z - lx * syr + lz * cyr);
    const ox = this.roomO.x - this.deskPos.x, oz = this.roomO.z - this.deskPos.z;
    const ol = Math.hypot(ox, oz) || 1;
    this.pos = v3(this.deskPos.x + (ox / ol) * 0.7, 0, this.deskPos.z + (oz / ol) * 0.7);
    const g = new THREE.Group();
    const rig = riggedFigure('hooded');
    if (rig) { this.rig = rig; rig.play('idle', 0); g.add(rig.group); }
    else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.95, 4, 8), MAT.ink());
      body.position.y = 0.95;
      g.add(body);
    }
    // the index tray — a flat card box wider than the ledger book
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), MAT.darkOak());
    tray.position.set(0, 1.02, 0.32);
    tray.rotation.x = -0.25;
    g.add(tray);
    g.position.copy(this.pos);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('chalk-mark', this.pos, '[an index drawer slides — somebody files what you asked]', { severity: 'warn' });
    // the docket itself is pilferable — rifling the index is the loudest
    // question in the under (the Game prices it against both ledgers)
    c.addInteractable({
      kind: 'docket', id: this.docketId(),
      pos: v3(this.deskPos.x, 0.9, this.deskPos.z),
      prompt: 'Rifle the docket drawer', holdTime: 0.9,
      data: { stock: 1 },
      enabled: true, priority: 2,
    });
    this.state = 'engage';
  }

  private roomOf(p: Vec3): number {
    const rooms = this.ctx.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      if (Math.abs(p.x - r.origin.x) <= r.width / 2 && Math.abs(p.z - r.origin.z) <= r.depth / 2) return i;
    }
    return -1;
  }

  private squareId(): string { return `square-${this.spawnRoom}`; }
  private docketId(): string { return `docket-${this.spawnRoom}`; }

  private openIndex(): void {
    const c = this.ctx;
    this.filed = true;
    this.posted = true;
    this.interactId = this.squareId();
    const ox = this.roomO.x - this.deskPos.x, oz = this.roomO.z - this.deskPos.z;
    const ol = Math.hypot(ox, oz) || 1;
    c.addInteractable({
      kind: 'square', id: this.interactId,
      pos: v3(this.deskPos.x + (ox / ol) * 1.15, 0.9, this.deskPos.z + (oz / ol) * 1.15),
      prompt: 'Square the index — see your file', holdTime: 1.0,
      data: { filer: this as unknown as Record<string, unknown> },
      enabled: true, priority: 4,
    });
    c.cue('chalk-mark', this.pos, '[she sends a runner — the crew reads ahead]', { severity: 'warn' });
    this.sendRunner();
  }

  /** The post goes out on foot — a courier down the under chain, carrying
   *  the word to the rooms ahead. It flees the spine; catching it kills
   *  the message. Escapes ⇒ the word is delivered, unrecallable. */
  private sendRunner(): void {
    const c = this.ctx;
    const dir = this.spawnRoom + 8 <= c.rooms.length - 1 ? 1 : -1;
    const target = Math.max(0, Math.min(c.rooms.length - 1, this.spawnRoom + 8 * dir));
    this.runnerPath = corridorPath(c.rooms, this.spawnRoom, target);
    this.runnerTravel = 0;
    if (this.runnerPath.length >= 2) v3copy(this.runnerPos, this.runnerPath[0]);
    else v3copy(this.runnerPos, this.deskPos);
    const g = new THREE.Group();
    const rig = riggedFigure('ninja');
    if (rig) { this.runnerRig = rig; rig.play('move', 0); g.add(rig.group); }
    else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 4, 8), MAT.ink());
      body.position.y = 0.6;
      g.add(body);
    }
    // the word itself — a sealed fold strapped at the hip
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.12), MAT.paper());
    note.position.set(0.14, 0.7, 0);
    g.add(note);
    g.position.copy(this.runnerPos);
    this.runnerMesh = g;
    c.addEntityMesh(g);
    this.runnerOut = true;
  }

  /** 'Cut the runner' reaches it — you tear the message. The word never
   *  lands; her index closes on a torn card. */
  cutRunner(): void {
    this.runnerOut = false;
    this.dropRunner();
    // the word dies with the courier — same end-state as squaring,
    // without the fee
    this.filed = false;
    this.posted = false;
    this.homebound = true;
    this.closeIndex();
    this.ctx.cue('checkpoint', this.runnerPos, '[you tear the message — the word dies with the runner]', { severity: 'info' });
    this.ctx.cue('chalk-mark', this.pos, '[the filer closes your card — torn]', { severity: 'warn' });
  }

  private escaped(): void {
    this.runnerOut = false;
    this.dropRunner();
    this.ctx.cue('chalk-mark', this.runnerPos, '[the word is out — past reach]', { severity: 'warn' });
    this.ctx.cue('door-locked', this.runnerPos, '[the card reaches the stairs — the house register gains your name]', { severity: 'warn' });
    this.ctx.wordFiled?.();
  }

  private dropRunner(): void {
    if (this.runnerMesh) { this.ctx.removeEntityMesh(this.runnerMesh); this.runnerMesh = null; }
    this.runnerRig = null;
  }

  private closeIndex(): void {
    if (this.interactId) { this.ctx.removeInteractable(this.interactId); this.interactId = null; }
  }

  /** The square press reaches her — the Game has already taken the fee. */
  squared(): void {
    this.filed = false;
    this.posted = false;
    this.runnerOut = false;
    this.dropRunner();
    this.homebound = true;
    this.closeIndex();
    this.ctx.cue('checkpoint', this.pos, '[the filer strikes your card]', { severity: 'info' });
  }

  private cool(): void {
    // the word only travels so far down the halls
    this.posted = false;
    this.filed = false;
    this.runnerOut = false;
    this.dropRunner();
    this.homebound = true;
    this.closeIndex();
    this.ctx.cue('chalk-mark', this.pos, '[the word ahead of you goes quiet]', { severity: 'info' });
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player.pos;
    this.lifeT += dt;
    const trail = c.trailOwed?.() ?? 0;
    const pRoom = this.roomOf(p);

    // drawer work: drift at the station's edge
    if (!this.homebound) {
      const step = v3(this.deskPos.x + (this.roomO.x - this.deskPos.x) * 0.08, 0, this.deskPos.z + (this.roomO.z - this.deskPos.z) * 0.08);
      const dx = step.x - this.pos.x, dz = step.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.2) { this.pos.x += (dx / dd) * this.tuning.speed * 0.4 * dt; this.pos.z += (dz / dd) * this.tuning.speed * 0.4 * dt; }
    }

    // the slow look — she files a persistent asker in her room over ~2.5s
    if (pRoom === this.spawnRoom && trail >= 3 && !this.filed && !this.homebound) {
      this.lookT += dt;
      if (this.lookT > 2.5) {
        this.openIndex();
        c.cue('chalk-mark', this.pos, '[the filer has your name — square it, or be expected]', { severity: 'warn' });
      }
    } else if (pRoom !== this.spawnRoom) {
      this.lookT = 0;
    }

    // the runner: each fresh room you enter inside reach listens for you
    if (this.posted && trail > 0 && pRoom >= 0 && pRoom !== this.spawnRoom && pRoom !== this.lastPlayerRoom) {
      this.lastPlayerRoom = pRoom;
      if (Math.abs(pRoom - this.spawnRoom) <= 8) {
        c.sound.emit({
          x: p.x, y: 1, z: p.z, intensity: 0.5, category: 'impact',
          caption: '[the word arrives before you — the room listens for your step]',
          source: 'filer',
        });
      }
    }
    // the courier sprints the spine at a fast walk — catchable, not for
    // long. It isn't a fighter: closing on it slows its stride, which is
    // the only window the cut gets.
    if (this.runnerOut) {
      const rd = Math.hypot(p.x - this.runnerPos.x, p.z - this.runnerPos.z);
      this.runnerTravel += dt * (rd < 4 ? 1.2 : 3.4);
      const f = followPath(this.runnerPath, this.runnerTravel);
      v3copy(this.runnerPos, f.pos);
      if (this.runnerMesh) {
        this.runnerMesh.position.copy(this.runnerPos);
        const nxt = followPath(this.runnerPath, this.runnerTravel + 0.5);
        const mx = nxt.pos.x - f.pos.x, mz = nxt.pos.z - f.pos.z;
        if (mx * mx + mz * mz > 1e-6) this.runnerMesh.rotation.y = Math.atan2(mx, mz);
      }
      this.runnerRig?.update(dt);
      if (f.doneT || this.runnerTravel > 140) this.escaped();
    }

    // outrun the word, or square it away — either way the card comes out
    // (pRoom -1 = between bounds, not outrun — the post stays up)
    if (this.posted && (trail <= 0 || (pRoom >= 0 && Math.abs(pRoom - this.spawnRoom) > 8))) this.cool();

    // the return beat — back to the drawer, index shut
    if (this.homebound) {
      const dx = this.deskPos.x - this.pos.x, dz = this.deskPos.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.3) {
        this.pos.x += (dx / dd) * this.tuning.speed * dt;
        this.pos.z += (dz / dd) * this.tuning.speed * dt;
        this.rig?.play('move');
      } else {
        this.homebound = false;
        this.rig?.play('idle');
      }
    }

    if (this.mesh) this.mesh.position.copy(this.pos);
    this.rig?.update(dt);
  }

  protected override onDone(): void {
    this.closeIndex();
    this.ctx.removeInteractable(this.docketId());
    this.runnerOut = false;
    this.dropRunner();
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
  }
}
