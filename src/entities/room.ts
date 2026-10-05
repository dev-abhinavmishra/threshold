/**
 * Room-bound and triggered entities: Witness, Whisper, Inkling, Redactor,
 * Echo-Skin, Margin, Stillframe, Hollow, and environmental hazards.
 * Each is a small state machine with deterministic cue windows.
 */
import * as THREE from 'three';
import { Entity, type EntityCtx } from './base';
import { v3, v3dist, clamp, type Vec3 } from '../engine/math';
import type { RoomInstance } from '../game/types';
import { ENTITY_TUNING } from '../game/config';
import { MAT } from '../world/materials';
import { plateMaterial } from '../world/builder';
import { tallFigure, statueFigure } from './figure';
import { riggedFigure, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';

/* ============================ WITNESS ============================ */
/** Gaze hazard in rooms with windows/mirrors/portraits. Pulls the camera;
 * looking at it damages; look away to pass. */
export class Witness extends Entity {
  private mesh: THREE.Group | null = null;
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
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
  override threatPos(): Vec3 { return this.pos; }
  private attackT = 0;
  private strikeWindow = 6.0;
  /** Mimic variant: the first silhouette is a decoy that collapses when faced,
   *  relocating the real whisper with a tightened strike window. */
  private decoyMesh: THREE.Object3D | null = null;
  private decoyPos = v3();

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
    // ~1/3 of whispers lead with a decoy silhouette at a different bearing
    if (rng.bool(0.34)) {
      const da = a + (rng.bool() ? 1 : -1) * (0.9 + rng.float() * 0.9);
      this.decoyPos = v3(c.player.pos.x + Math.cos(da) * r * 0.8, 0, c.player.pos.z + Math.sin(da) * r * 0.8);
      const decoy = tallFigure({ height: 1.9, body: MAT.shadowFigure(), face: 'none', eyes: 'white', hood: true, tattered: true });
      decoy.position.set(this.decoyPos.x, 0, this.decoyPos.z);
      decoy.visible = false;
      this.decoyMesh = decoy;
      c.addEntityMesh(decoy);
    }
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
    // Decoy logic: it localizes just like the real one, but facing it squarely
    // collapses it and relocates the real whisper instead of ending the fight.
    if (this.decoyMesh) {
      const toD = v3(this.decoyPos.x - p.pos.x, 0, this.decoyPos.z - p.pos.z);
      const dd = Math.hypot(toD.x, toD.z) || 1;
      const dfacing = (dir.x * toD.x + dir.z * toD.z) / dd;
      this.decoyMesh.visible = dfacing > 0.75 && dd < 9;
      if (this.decoyMesh.visible) this.decoyMesh.rotation.y = Math.atan2(p.pos.x - this.decoyPos.x, p.pos.z - this.decoyPos.z);
      if (dfacing > 0.94 && dd < 9) {
        c.removeEntityMesh(this.decoyMesh);
        this.decoyMesh = null;
        // Relocate the real whisper to a fresh bearing, tighten the window.
        const a2 = new Rng(c.seed + 977).float() * Math.PI * 2;
        const r2 = 3 + new Rng(c.seed + 311).float() * 2.5;
        this.pos = v3(p.pos.x + Math.cos(a2) * r2, 0, p.pos.z + Math.sin(a2) * r2);
        if (this.mesh) this.mesh.position.set(this.pos.x, 0, this.pos.z);
        this.attackT = this.strikeWindow * 0.35;
        c.cue('whisper-shift', this.pos, '[not it — the voice moved]', { severity: 'warn' });
      }
    }
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
    if (this.decoyMesh) { this.ctx.removeEntityMesh(this.decoyMesh); this.decoyMesh = null; }
  }
}

/* ============================ LURKER ============================ */
/** Ambush predator: crouches near a wall; stalks while unlit at close range.
 *  Holding the torch on it for ~1.2s drives it off — darkness defense lesson. */
export class Lurker extends Entity {
  /** Set by Game when the player's light cone covers this entity. */
  lightOnIt = 0;
  private mesh: THREE.Object3D | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
  private litT = 0;
  private lungeT = 0;

  constructor() { super('lurker', ENTITY_TUNING.lurker); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const rng = new Rng(c.seed);
    // crouch along the room's side wall, offset from the door lane
    const a = rng.bool(0.5) ? 1 : -1;
    this.pos = v3(c.player.pos.x + a * 2.4, 0, c.player.pos.z + rng.range(1.5, 3.5));
    this.state = 'engage';
    const rig = riggedFigure('ninja');
    const g = rig?.group ?? tallFigure({ height: 1.4, body: MAT.shadowFigure(), face: 'none', eyes: 'amber', tattered: true });
    this.rig = rig;
    g.position.copy(this.pos);
    g.scale.setScalar(0.72); // crouched silhouette
    this.mesh = g;
    c.addEntityMesh(this.mesh);
    this.rig?.play('idle');
    c.flickerRoom(c.currentRoomIndex, 'dim');
    c.cue('lurker-stalk', this.pos, '[something crouches — it hates the light]', { severity: 'warn' });
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.rig?.update(dt);
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.mesh) this.mesh.rotation.y = Math.atan2(dx, dz);

    // Game marks entities inside the player's light cone via lightOnIt
    const lit = this.lightOnIt > 0;
    if (lit) {
      this.litT += dt;
      this.rig?.play('idle');
      if (this.litT > 1.2) {
        c.cue('lurker-flee', this.pos, '[it recoils from the beam — gone]', { severity: 'info' });
        this.done();
        return;
      }
    } else {
      this.litT = Math.max(0, this.litT - dt * 0.5);
      // stalk: close distance slowly while unlit
      if (dist > this.tuning.killRange && dist < this.tuning.seeRange) {
        const step = this.tuning.speed * dt;
        this.pos.x += (dx / dist) * step; this.pos.z += (dz / dist) * step;
        if (this.mesh) this.mesh.position.copy(this.pos);
        this.rig?.play('move');
      }
      this.lungeT += dt;
    }
    if (dist <= this.tuning.killRange || this.lungeT > 9) {
      c.damagePlayer(this.tuning.damage, 'lurker', 'The Lurker stalks in the dark — hold your light on it to drive it off.');
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
  override threatPos(): Vec3 { return this.pos; }
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
    c.flickerRoom(c.currentRoomIndex, 'dim');
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
    this.ctx.flickerRoom(this.ctx.currentRoomIndex, 'dim');
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
  /** Twin-forgery variant: a second, subtler forgery on the opposite side. */
  private mesh2: THREE.Group | null = null;
  private falseDoorPos2 = v3();
  triggered = false;
  /** Positions of every forgery (1–2) for interaction wiring. */
  forgeryPositions(): Vec3[] {
    const out = [this.falseDoorPos];
    if (this.mesh2) out.push(this.falseDoorPos2);
    return out;
  }

  constructor() { super('redactor', ENTITY_TUNING.redactor); }

  private buildForgery(telltale: 'plate' | 'gap', wrongNumber: number): THREE.Group {
    const g = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.09), MAT.oak());
    leaf.position.y = 1.1;
    if (telltale === 'plate') {
      // Tell: a real plate carrying the WRONG room number — the sequence is off.
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.25, 0.05),
        plateMaterial(String(wrongNumber).padStart(3, '0')) ?? MAT.brass(),
      );
      plate.position.set(0.12, 2.62, 0);
      g.add(plate);
    } else {
      // subtler tell: no plate at all + leaf sits a few cm off the wall
      g.position.z += 0.14;
    }
    g.add(leaf);
    return g;
  }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    const rng = new Rng(c.seed + 41);
    // Plant the false exit beside the real one on the same wall, offset.
    this.falseDoorPos = v3(room.exitPos.x + 2.4, 0, room.exitPos.z);
    // Wrong numbers are always off the true sequence (real exit reads index+1).
    const wrong = room.index + 2 + Math.floor(rng.float() * 3);
    const g = this.buildForgery(rng.bool(0.4) ? 'gap' : 'plate', wrong);
    g.position.add(this.falseDoorPos as unknown as THREE.Vector3);
    this.mesh = g;
    c.addEntityMesh(g);
    if (rng.bool(0.4)) {
      this.falseDoorPos2 = v3(room.exitPos.x - 2.4, 0, room.exitPos.z);
      const wrong2 = Math.max(0, room.index - 1 - Math.floor(rng.float() * 2));
      const g2 = this.buildForgery('gap', wrong2);
      g2.position.add(this.falseDoorPos2 as unknown as THREE.Vector3);
      this.mesh2 = g2;
      c.addEntityMesh(g2);
    }
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
    if (this.mesh2) { this.ctx.removeEntityMesh(this.mesh2); this.mesh2 = null; }
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
    c.flickerRoom(c.currentRoomIndex, 'dim');
    c.duckTone?.(1.4);
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
  /** Beats until the next ventriloquist rustle — the sound comes from the
   *  wrong edge, so audio alone can't be trusted to find it. */
  private rustleT = 0;

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
    c.flickerRoom(c.currentRoomIndex, 'dim');
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
      // Positional misdirection: a soft rustle from the mirrored edge.
      this.rustleT -= dt;
      if (this.rustleT <= 0) {
        this.rustleT = 1.25 + new Rng(c.seed + Math.floor(c.now * 7)).float() * 0.9;
        const mx = p.pos.x + Math.sin(p.yaw - side * 1.35) * this.d;
        const mz = p.pos.z + Math.cos(p.yaw - side * 1.35) * this.d;
        c.cue('margin-rustle', v3(mx, 0, mz), '', { severity: 'warn' });
      }
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
    c.duckTone?.(2.2);
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


/* ============================ HUSK ============================ */
/** A sleeper in the big rooms — dormant until the beam paints it or someone
 * bumps it. Wakes to a short heavy charge, then settles back. The readable
 * rule: sweep slowly, and never stop near it. */
export class Husk extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
  private home = v3();
  private lastSeen = v3();
  private mode: 'dormant' | 'hunt' | 'return' = 'dormant';
  private anger = 0;
  private huntT = 0;
  private giveUpT = 0;
  private footT = 0;
  private stirred = false;
  /** 1 while the player's lamp/pulse is lit — computed by Game each frame. */
  lightOnIt = 0;

  constructor() { super('husk', ENTITY_TUNING.husk); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    const rng = new Rng(c.seed);
    // doze against a wall, biased away from the entry the player just used
    const side = rng.bool(0.5) ? 1 : -1;
    const hx = rng.range(-room.width / 2 + 1.2, room.width / 2 - 1.2);
    const hz = side * (room.depth / 2 - 1.1);
    const c2 = Math.cos(room.yaw), s2 = Math.sin(room.yaw);
    const wx = room.origin.x + hx * c2 + hz * s2;
    const wz = room.origin.z - hx * s2 + hz * c2;
    this.pos = v3(wx, 0, wz);
    this.home = v3(wx, 0, wz);
    const rig = riggedFigure('yeti');
    const g = new THREE.Group();
    if (rig) {
      this.rig = rig;
      rig.play('idle', 0);
      g.add(rig.group);
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.4, 4, 8), MAT.ink());
      body.position.y = 1.0;
      g.add(body);
    }
    g.position.copy(this.pos);
    g.rotation.y = Math.atan2(room.origin.x - wx, room.origin.z - wz);
    g.rotation.x = 0.22; // slumped forward
    this.mesh = g;
    c.addEntityMesh(g);
    this.state = 'engage';
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.rig?.update(dt);
    const d = v3dist(this.pos, p.pos);
    const roomIdx = this.roomOf(p.pos);
    void roomIdx;

    if (this.mode === 'dormant') {
      // beam sweeps over it — the player must hold the beam on it to wake it
      if (this.lightOnIt > 0.4 && d < this.tuning.seeRange) {
        const dir = v3();
        p.lookDir(dir);
        const toE = v3(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z);
        const dn = Math.hypot(toE.x, toE.z) || 1;
        if ((dir.x * toE.x + dir.z * toE.z) / dn > 0.86) this.anger += dt * 0.85;
      }
      // proximity and sprint noise also stir it
      if (d < 3.4) this.anger += dt * 2.2;
      if (p.lastMoveSpeed > 6 && d < 7) this.anger += dt * 1.1;
      this.anger = Math.max(0, this.anger - dt * 0.12);
      if (this.anger > 0.5 && !this.stirred) {
        this.stirred = true;
        c.duckTone?.(2.6);
        c.cue('husk-stir', this.pos, '[the figure in the corner shifts]', { severity: 'warn' });
        if (this.mesh) this.mesh.rotation.x = 0.08;
      }
      if (this.anger >= 1) {
        this.mode = 'hunt';
        this.huntT = 0;
        this.giveUpT = 0;
        this.lastSeen = v3(p.pos.x, 0, p.pos.z);
        if (this.mesh) this.mesh.rotation.x = 0;
        this.rig?.play('move', 0.08);
        c.duckTone?.(5);
        c.cue('husk-bellow', this.pos, '[it wakes]', { severity: 'danger' });
      }
      return;
    }

    if (this.mode === 'hunt') {
      this.huntT += dt;
      this.footT += dt;
      const hidden = p.protection === 'hidden';
      if (!hidden) { this.lastSeen = v3(p.pos.x, 0, p.pos.z); this.giveUpT = 0; }
      else this.giveUpT += dt;
      const dx = this.lastSeen.x - this.pos.x, dz = this.lastSeen.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.25) {
        this.pos.x += (dx / dd) * this.tuning.speed * dt;
        this.pos.z += (dz / dd) * this.tuning.speed * dt;
        if (this.mesh) {
          this.mesh.rotation.y = Math.atan2(dx, dz);
          this.mesh.position.copy(this.pos);
        }
      }
      if (this.footT > 0.38) {
        this.footT = 0;
        c.cue('husk-foot', this.pos, '', { severity: 'warn' });
      }
      if (d < this.tuning.killRange && !hidden) {
        this.rig?.play('attack', 0.05);
        c.killPlayer('husk', 'It sleeps until you paint it with light or crowd it. Sweep slowly.');
        this.done();
        return;
      }
      // lose the living — trudge home and slump
      if (this.giveUpT > 4 || this.huntT > 14) {
        this.mode = 'return';
        c.cue('husk-calm', this.pos, '[it loses the trail]', { severity: 'warn' });
      }
      return;
    }

    // returning home
    const dx = this.home.x - this.pos.x, dz = this.home.z - this.pos.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 0.3) {
      this.pos.x += (dx / dd) * this.tuning.speed * 0.55 * dt;
      this.pos.z += (dz / dd) * this.tuning.speed * 0.55 * dt;
      if (this.mesh) {
        this.mesh.rotation.y = Math.atan2(dx, dz);
        this.mesh.position.copy(this.pos);
      }
    } else {
      this.mode = 'dormant';
      this.anger = 0.15;
      this.stirred = false;
      if (this.mesh) { this.mesh.rotation.x = 0.22; this.mesh.position.copy(this.home); }
      this.pos = v3(this.home.x, 0, this.home.z);
      this.rig?.play('idle');
    }
  }

  private roomOf(p: { x: number; z: number }): number {
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
