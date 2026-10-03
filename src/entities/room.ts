/**
 * Room-bound and triggered entities: Witness, Whisper, Inkling, Redactor,
 * Echo-Skin, Margin, Stillframe, Hollow, and environmental hazards.
 * Each is a small state machine with deterministic cue windows.
 */
import * as THREE from 'three';
import { Entity, type EntityCtx } from './base';
import { v3, v3dist, clamp } from '../engine/math';
import type { RoomInstance } from '../game/types';
import { ENTITY_TUNING } from '../game/config';
import { MAT } from '../world/materials';
import { tallFigure, statueFigure } from './figure';
import { riggedFigure, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';

/* ============================ WITNESS ============================ */
/** Gaze hazard in rooms with windows/mirrors/portraits. Pulls the camera;
 * looking at it damages; look away to pass. */
export class Witness extends Entity {
  private mesh: THREE.Group | null = null;
  private pos = v3();
  private exposure = 0;

  constructor() { super('witness', ENTITY_TUNING.witness); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    const rng = new Rng(c.seed);
    // Anchor at a room edge — a window/mirror position or fallback wall point.
    this.pos = v3(
      room.origin.x + (rng.bool() ? 1 : -1) * room.width * 0.4,
      0,
      room.origin.z + rng.range(-room.depth * 0.3, room.depth * 0.3),
    );
    this.state = 'engage';
    const g = new THREE.Group();
    const figure = statueFigure({ height: 2.3, eyes: 'white', eyeY: 1.92 })
      ?? tallFigure({ height: 2.3, face: 'mask', faceMat: MAT.paper(), eyes: 'white', hood: true, tattered: true });
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 16), MAT.eyeGlow());
    halo.position.y = 2.0;
    g.add(figure, halo);
    this.mesh = g;
    g.position.copy(this.pos as unknown as THREE.Vector3);
    c.addEntityMesh(g);
    c.cue('witness-appear', this.pos, '[a watching presence — do not meet it]', { severity: 'warn' });
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    const d = v3dist(this.pos, p.pos);
    if (d > 18 || p.protection === 'hidden') { this.done(); return; }
    if (this.mesh) this.mesh.rotation.y = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    // Camera pull toward itself (resistible) unless reduced-motion.
    if (!c.accessibility.reducedMotion) {
      const want = Math.atan2(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
      let dy = want - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const pullRate = clamp((10 - d) * 0.12, 0, 0.55);
      p.yaw += dy * pullRate * dt * 6;
    }
    // Damage while facing it.
    const dir = v3();
    p.lookDir(dir);
    const toW = v3(this.pos.x - p.pos.x, 1.4 - p.pos.y - 1.6, this.pos.z - p.pos.z);
    const dn = Math.hypot(toW.x, toW.y, toW.z) || 1;
    const facing = (dir.x * toW.x + dir.y * toW.y + dir.z * toW.z) / dn;
    if (facing > 0.86) {
      this.exposure += dt;
      if (this.exposure > 0.25) {
        c.damagePlayer(this.tuning.damage * dt, 'witness', 'The Witness harms what it holds in your sight. Look away.');
        if (this.exposure > 3.0 && !c.accessibility.reducedMotion) {
          c.cue('witness-drone', this.pos, '', { severity: 'danger' });
        }
      }
    } else {
      this.exposure = Math.max(0, this.exposure - dt * 2);
    }
    if (d > 15 || p.protection === 'losSafe') this.done();
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ WHISPER ============================ */
/** Dark-room threat: a spatial whisper — find the silhouette before it strikes. */
export class Whisper extends Entity {
  private mesh: THREE.Object3D | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  private attackT = 0;
  private strikeWindow = 6.0;

  constructor() { super('whisper', ENTITY_TUNING.whisper); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const rng = new Rng(c.seed);
    const a = rng.float() * Math.PI * 2;
    const r = 3.5 + rng.float() * 2.5;
    this.pos = v3(c.player.pos.x + Math.cos(a) * r, 0, c.player.pos.z + Math.sin(a) * r);
    this.state = 'engage';
    const rig = riggedFigure('ghost');
    const g = rig?.group
      ?? tallFigure({ height: 1.9, body: MAT.shadowFigure(), face: 'none', eyes: 'white', hood: true, tattered: true });
    this.rig = rig;
    g.position.set(this.pos.x, 0, this.pos.z);
    g.visible = false; // nearly invisible — found by silhouette at range
    this.mesh = g as unknown as THREE.Object3D;
    this.mesh.visible = false;
    c.addEntityMesh(this.mesh);
    // caption reports direction relative to player
    c.cue('whisper-voice', this.pos, '[a whisper, close — turn toward it]', { severity: 'warn' });
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.attackT += dt;
    this.rig?.update(dt);
    const dir = v3();
    p.lookDir(dir);
    const toW = v3(this.pos.x - p.pos.x, 1.0 - p.pos.y - 1.5, this.pos.z - p.pos.z);
    const dn = Math.hypot(toW.x, toW.y, toW.z) || 1;
    const facing = (dir.x * toW.x + dir.y * toW.y + dir.z * toW.z) / dn;
    // Show silhouette when roughly faced — reward for localization.
    if (this.mesh) this.mesh.visible = facing > 0.75 && dn < 9;
    if (this.mesh && this.mesh.visible) {
      this.mesh.rotation.y = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      this.rig?.play('idle');
    }
    if (facing > 0.94 && dn < 9) {
      c.cue('whisper-dismiss', this.pos, '[it retreats from your regard]', { severity: 'info' });
      this.done();
      return;
    }
    if (this.attackT > this.strikeWindow) {
      c.damagePlayer(this.tuning.damage, 'whisper', 'Whisper asks you to locate it. Turn toward the voice until the shape shows.');
      this.done();
    }
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ INKLING ============================ */
/** Darkness threat: a corner cluster enraged by continuous light at close range. */
export class Inkling extends Entity {
  private mesh: THREE.Group | null = null;
  private rigs: RiggedFigure[] = [];
  private pos = v3();
  private agitation = 0;

  constructor() { super('inkling', ENTITY_TUNING.inkling); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    const rng = new Rng(c.seed);
    this.pos = v3(
      room.origin.x + rng.range(-room.width * 0.4, room.width * 0.4), 0,
      room.origin.z + rng.range(-room.depth * 0.4, room.depth * 0.4),
    );
    const g = new THREE.Group();
    // Tar-dark slimes pooled in the corner — or bare shadow-blobs before the model lands.
    for (let i = 0; i < 3; i++) {
      const rig = riggedFigure('slime');
      if (rig) {
        rig.group.position.set((rng.float() - 0.5) * 0.9, 0, (rng.float() - 0.5) * 0.9);
        rig.group.rotation.y = rng.float() * Math.PI * 2;
        rig.play('idle');
        this.rigs.push(rig);
        g.add(rig.group);
      } else {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.14 + rng.float() * 0.1, 6, 6), MAT.shadowFigure());
        s.position.set((rng.float() - 0.5) * 0.6, 0.3 + rng.float() * 0.5, (rng.float() - 0.5) * 0.6);
        g.add(s);
      }
    }
    this.mesh = g;
    g.position.copy(this.pos as unknown as THREE.Vector3);
    c.addEntityMesh(g);
    c.cue('inkling-settle', this.pos, '[something gathers in the dark — mind your light]', { severity: 'warn' });
    this.state = 'engage';
  }

  /** lightIntensityOnIt: 0..1 computed by game from player lamp state. */
  lightOnIt = 0;

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const d = v3dist(this.pos, c.player.pos);
    if (d > 12) { this.done(); return; }
    for (const r of this.rigs) r.update(dt);
    const lit = this.lightOnIt > 0.4 && d < this.tuning.seeRange;
    if (lit) {
      this.agitation += dt;
      for (const r of this.rigs) r.play('attack');
      if (this.agitation > 0.6) c.cue('inkling-hiss', this.pos, '[it recoils and presses closer]', { severity: 'warn' });
      if (this.agitation > 2.2) {
        c.damagePlayer(this.tuning.damage, 'inkling', 'Inkling hates held light. Angle the beam away or go dark.');
        this.done();
        return;
      }
    } else {
      this.agitation = Math.max(0, this.agitation - dt * 1.5);
    }
    if (this.mesh) {
      const s = 1 + this.agitation * 0.3;
      this.mesh.scale.set(s, s, s);
    }
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ ECHO-SKIN ============================ */
/** Rear stalker: footsteps that don't match yours. Look back to dispel. */
export class EchoSkin extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private behind = 0;
  private dispelT = 0;
  private approachD = 8;

  constructor() { super('echoskin', ENTITY_TUNING.echoskin); }

  protected override onSpawn(): void {
    this.state = 'engage';
    this.ctx.cue('echoskin-steps', null, '[footsteps continue after yours stop]', { severity: 'warn' });
    const rig = riggedFigure('demon');
    rig?.play('idle');
    const g = rig?.group
      ?? tallFigure({ height: 2.4, face: 'plate', body: MAT.creatureSkin(), eyes: 'amber', spines: true, claws: true, tattered: true });
    this.rig = rig;
    this.mesh = g;
    this.ctx.addEntityMesh(g);
    this.approachD = 9;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    // It positions behind the player's facing.
    const backYaw = p.yaw + Math.PI;
    const bx = p.pos.x + Math.sin(backYaw) * this.approachD;
    const bz = p.pos.z + Math.cos(backYaw) * this.approachD;
    this.rig?.update(dt);
    if (this.mesh) {
      this.mesh.position.set(bx, 0, bz);
      this.mesh.rotation.y = Math.atan2(p.pos.x - bx, p.pos.z - bz);
    }
    // Footstep audio while the player moves (the 'extra pair').
    if (p.lastMoveSpeed > 0.5 && Math.random() < dt * 6) {
      c.cue('echoskin-step', v3(bx, 0, bz), '', { severity: 'info' });
    }
    // Is the player looking back at it?
    const dir = v3();
    p.lookDir(dir);
    const toE = v3(bx - p.pos.x, 1.0 - 1.6, bz - p.pos.z);
    const dn = Math.hypot(toE.x, toE.z) || 1;
    const facing = (dir.x * toE.x + dir.z * toE.z) / dn;
    if (facing > 0.7 && this.approachD < 12) {
      this.dispelT += dt;
      if (this.dispelT > 0.7) {
        c.cue('echoskin-fold', v3(bx, 0, bz), '[it folds into the wall]', { severity: 'info' });
        this.done();
        return;
      }
    } else {
      this.dispelT = 0;
      this.approachD = Math.max(1.4, this.approachD - this.tuning.speed * dt * (p.lastMoveSpeed < 0.5 ? 1.2 : 0.6));
      if (this.approachD <= this.tuning.killRange + 0.4) {
        c.damagePlayer(this.tuning.damage, 'echoskin', 'Echo-Skin borrows your footsteps. Stop, listen, and hold it in view.');
        this.done();
      }
    }
    void this.behind;
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ REDACTOR ============================ */
/** False-door threat: plants a duplicate exit with readable tells. */
export class Redactor extends Entity {
  private falseDoorPos = v3();
  private mesh: THREE.Group | null = null;
  triggered = false;

  constructor() { super('redactor', ENTITY_TUNING.redactor); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    // Plant the false exit beside the real one on the same wall, offset.
    this.falseDoorPos = v3(room.exitPos.x + 2.4, 0, room.exitPos.z);
    const g = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.09), MAT.oak());
    leaf.position.y = 1.1;
    // tell: slightly misaligned plate + wrong label
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.05), MAT.brass());
    plate.position.set(0.12, 2.62, 0);
    g.add(leaf, plate);
    g.position.copy(this.falseDoorPos as unknown as THREE.Vector3);
    this.mesh = g;
    c.addEntityMesh(g);
    this.state = 'engage';
    c.cue('redactor-sense', this.falseDoorPos, '[a second exit — the sequence feels wrong]', { severity: 'info' });
  }

  /** Player interacted with the false door. */
  punish(): void {
    const c = this.ctx;
    this.triggered = true;
    c.damagePlayer(this.tuning.damage, 'redactor', 'Redactor forges exits. Check the number, the frame seam, the hum.');
    c.cue('redactor-sting', this.falseDoorPos, '[the door was paper]', { severity: 'danger' });
    this.done();
  }

  protected override onUpdate(): void {
    if (this.stateT > 90) this.done(); // clean up if player never engages
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ STILLFRAME ============================ */
/** Underscript: release ALL input during the freeze window or be struck. */
export class Stillframe extends Entity {
  private mesh: THREE.Mesh | null = null;
  private window: { start: number; end: number } | null = null;
  grace = 1.2; // accessibility can extend

  constructor() { super('stillframe', ENTITY_TUNING.stillframe); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const assist = c.accessibility.minigameAssist;
    this.grace = 1.2 + assist * 1.2;
    c.cue('stillframe-snap', null, '[a shutter — freeze]', { severity: 'danger' });
    this.window = { start: c.now + 0.55, end: c.now + 0.55 + this.grace + 1.6 };
    const geo = new THREE.PlaneGeometry(1.1, 1.5);
    this.mesh = new THREE.Mesh(geo, MAT.paperOld());
    this.mesh.position.set(0, 1.4, 0);
    c.addEntityMesh(this.mesh);
    this.state = 'engage';
  }

  /** Called by input layer each frame with "any input held". */
  inputHeld = false;

  protected override onUpdate(): void {
    const c = this.ctx;
    const w = this.window!;
    if (this.mesh) {
      // frame follows camera
      const p = c.player;
      const d = v3();
      p.lookDir(d);
      this.mesh.position.set(p.pos.x + d.x * 1.6, p.pos.y + 1.5, p.pos.z + d.z * 1.6);
      this.mesh.rotation.y = p.yaw + Math.PI;
    }
    if (c.now < w.start) return;
    if (c.now > w.end) { this.done(); return; }
    if (this.inputHeld && c.now > w.start + (this.ctx.accessibility.minigameAssist > 0 ? this.grace : 0.3)) {
      c.damagePlayer(this.tuning.damage, 'stillframe', 'Stillframe photographs movement. When the shutter sounds, hold still.');
      this.done();
    }
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ MARGIN ============================ */
/** Underscript positional threat: advances while fully off-screen; looking
 * toward it freezes it but raises instability. */
export class Margin extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private instability = 0;
  private d = 14;

  constructor() { super('margin', ENTITY_TUNING.margin); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const rig = riggedFigure('inkGhost');
    const g = rig?.group
      ?? tallFigure({ height: 2.1, body: MAT.ink(), face: 'none', eyes: 'red', spines: true, tattered: true });
    this.rig = rig;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.3), MAT.redLamp());
    edge.position.set(0.4, 1.05, 0);
    g.add(edge);
    this.mesh = g;
    c.addEntityMesh(g);
    c.cue('margin-edge', null, '[something waits at the edge of sight]', { severity: 'warn' });
    this.state = 'engage';
    this.d = 14;
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    // Sit at screen edge (peripheral, behind a strafe direction).
    const side = Math.sign(Math.sin(c.now * 0.07) || 1);
    const yaw = p.yaw + side * 1.35;
    const x = p.pos.x + Math.sin(yaw) * this.d;
    const z = p.pos.z + Math.cos(yaw) * this.d;
    this.rig?.update(dt);
    if (this.mesh) {
      this.mesh.position.set(x, 0, z);
      this.mesh.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
    }
    const dir = v3();
    p.lookDir(dir);
    const toM = v3(x - p.pos.x, 0, z - p.pos.z);
    const dn = Math.hypot(toM.x, toM.z) || 1;
    const facing = (dir.x * toM.x + dir.z * toM.z) / dn;
    if (facing > 0.35) {
      // on screen — frozen but instability grows
      this.instability += dt;
      if (this.instability > 5) {
        c.cue('margin-shift', v3(x, 0, z), '[the room strains — look away]', { severity: 'warn' });
        this.instability = 0;
      }
    } else {
      this.d = Math.max(1.2, this.d - this.tuning.speed * dt);
      if (this.d <= this.tuning.killRange) {
        c.damagePlayer(this.tuning.damage, 'margin', 'Margin moves when unseen. Glance at it — but never too long.');
        this.done();
      }
    }
    if (v3dist(c.player.pos, c.rooms[Math.min(c.rooms.length - 1, c.currentRoomIndex + 1)].entryPos) < 1.5) this.done();
  }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
  }
}

/* ============================ HOLLOW ============================ */
/** Hiding-spot trap — triggered on entry, not scheduled like others. */
export class Hollow extends Entity {
  private rig: RiggedFigure | null = null;
  escapeProgress = 0;
  required = 3; // interact presses to escape
  constructor() { super('hollow', ENTITY_TUNING.hollow); }

  protected override onSpawn(): void {
    this.state = 'engage';
    const c = this.ctx;
    // The thing sharing the cabinet — its body pressed against the slats.
    const spot = c.player.hiddenSpot;
    if (spot) {
      const rig = riggedFigure('alien');
      if (rig) {
        const cx = (spot.volume.minX + spot.volume.maxX) / 2;
        const cz = (spot.volume.minZ + spot.volume.maxZ) / 2;
        rig.group.position.set(cx + Math.sin(spot.viewYaw) * 0.5, 0, cz + Math.cos(spot.viewYaw) * 0.5);
        rig.group.rotation.y = spot.viewYaw + Math.PI;
        rig.play('attack', 0.05);
        this.rig = rig;
        c.addEntityMesh(rig.group);
      }
    }
    c.cue('hollow-wake', null, '[the cabinet breathes — get out]', { severity: 'danger' });
  }

  /** Player pressed interact during the grapple. */
  struggle(): void {
    this.escapeProgress++;
    this.rig?.play('attack', 0.05);
    if (this.escapeProgress >= this.required) {
      this.ctx.cue('hollow-release', null, '[it lets go]', { severity: 'info' });
      this.done();
    }
  }

  protected override onUpdate(dt: number): void {
    this.rig?.update(dt);
    if (this.stateT > 4 && this.escapeProgress < this.required) {
      this.ctx.damagePlayer(this.tuning.damage, 'hollow', 'Hollow waits inside warm cabinets. Check for the off-hum and the residue.');
      this.done();
    }
  }

  protected override onDone(): void {
    if (this.rig) { this.ctx.removeEntityMesh(this.rig.group); this.rig = null; }
  }
}

/* ============================ HAZARDS ============================ */
/** Environmental hazard runtime: snares, electrified puddles, steam, fans. */
export class HazardField {
  snares: { pos: import('../engine/math').Vec3; room: number; armed: boolean }[] = [];
  puddles: { pos: import('../engine/math').Vec3; room: number; radius: number }[] = [];
  lastTick = 0;

  constructor() {}

  addFromRoom(room: RoomInstance): void {
    for (const s of room.sockets) {
      if (s.meta.hazard === 'snare') this.snares.push({ pos: s.pos, room: room.index, armed: true });
      if (s.meta.hazard === 'puddle') this.puddles.push({ pos: s.pos, room: room.index, radius: 1.1 });
    }
  }

  update(ctx: EntityCtx, dt: number): void {
    const p = ctx.player;
    for (const s of this.snares) {
      if (!s.armed) continue;
      if (v3dist(p.pos, s.pos) < 0.7) {
        s.armed = false;
        p.rootedUntil = ctx.now + 1.6;
        ctx.damagePlayer(8, 'hazard', 'Paper seals root and rustle. Step around them — everything heard that.');
        ctx.sound.emit({ x: s.pos.x, y: 0.4, z: s.pos.z, intensity: 0.8, category: 'impact', caption: '[paper snare]' });
      }
    }
    this.lastTick += dt;
    if (this.lastTick > 0.5) {
      this.lastTick = 0;
      for (const pu of this.puddles) {
        if (pu.room !== ctx.currentRoomIndex) continue;
        if (v3dist(p.pos, pu.pos) < pu.radius) {
          ctx.damagePlayer(4, 'hazard', 'Electrified water hums amber. Give it the wide step.');
        }
      }
    }
  }
}
