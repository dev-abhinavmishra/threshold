/**
 * Room-bound and triggered entities: Witness, Whisper, Inkling, Redactor,
 * Echo-Skin, Margin, Stillframe, Hollow, and environmental hazards.
 * Each is a small state machine with deterministic cue windows.
 */
import * as THREE from 'three';
import { Entity, playerExposed, type EntityCtx } from './base';
import { v3, v3copy, v3dist, clamp, hasLineOfSight, type Vec3 } from '../engine/math';
import { shutLeafBlockers, pointInRoom } from '../engine/doorGeo';
import type { RoomInstance } from '../game/types';
import { ENTITY_TUNING } from '../game/config';
import { MAT } from '../world/materials';
import { plateMaterial } from '../world/builder';
import { tallFigure, statueFigure } from './figure';
import { riggedFigure, type RiggedFigure } from './rigged';
import { Rng } from '../engine/rng';
import { noiseCanBeHeard, withinRouseRadius } from '../engine/noiseRouse';
import type { SoundEvent } from '../engine/events';

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
    // sprint 442 — its harm and its pull both travel sight: a shut leaf
    // or wall between you and it breaks the gaze they ride on.
    const wRoom = c.rooms[c.currentRoomIndex];
    const wEye = v3();
    p.eyePos(wEye);
    const wCanSee = hasLineOfSight(wEye, v3(this.pos.x, 1.4, this.pos.z),
      (wRoom ? wRoom.losBlockers : []).concat(shutLeafBlockers(c.rooms, p.pos, this.pos)));
    // Camera pull toward itself (resistible) unless reduced-motion.
    if (!c.accessibility.reducedMotion && wCanSee) {
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
    if (facing > 0.86 && wCanSee) {
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
  /** Relocation count — salts each new bearing so it can't hunt the same
   *  shadow twice. */
  private relocN = 0;

  constructor() { super('whisper', ENTITY_TUNING.whisper); }

  /** A fresh hunting spot near the player: varied every call, and kept
   *  inside their room where a sight line can actually exist — a ring
   *  pick through a wall into a sealed room is a hunt that never
   *  resolves. Falls back to the raw ring if no try lands in-bounds. */
  private relocate(dist = 0): void {
    const c = this.ctx;
    const p = c.player;
    const room = c.rooms[c.currentRoomIndex];
    // A spot inside the room can still hide behind the furniture it was
    // meant to be found through — prefer the candidate a sight line can
    // actually reach; the first in-bounds pick is the honest fallback
    const eye = v3();
    p.eyePos(eye);
    let inside: Vec3 | null = null;
    for (let i = 0; i < 6; i++) {
      const a2 = new Rng(c.seed + 977 + this.relocN * 131).float() * Math.PI * 2;
      const r2 = (3 + dist) + new Rng(c.seed + 311 + this.relocN * 197).float() * 2.5;
      const cand = v3(p.pos.x + Math.cos(a2) * r2, 0, p.pos.z + Math.sin(a2) * r2);
      this.relocN++;
      if (room && !pointInRoom(room, cand.x, cand.z)) continue;
      inside ??= cand;
      if (!room || hasLineOfSight(eye, v3(cand.x, 1.4, cand.z),
        room.losBlockers.concat(shutLeafBlockers(c.rooms, p.pos, cand)))) {
        this.pos = cand;
        if (this.mesh) this.mesh.position.set(this.pos.x, 0, this.pos.z);
        return;
      }
    }
    if (inside) {
      this.pos = inside;
      if (this.mesh) this.mesh.position.set(this.pos.x, 0, this.pos.z);
    }
  }

  /** The eye at the crack: the shy thing that met you through the gap
   *  flinches — the sighting costs it the ambush spot it had. The only
   *  watcher whose answer is to leave rather than come. */
  override eyeTell(_at: Vec3): void {
    if (this.state !== 'engage') return;
    this.relocate();
    this.ctx.cue('moth-flutter', this.pos, '[the shadow flinches — it is somewhere else now]', { severity: 'warn' });
  }

  protected override onSpawn(): void {
    const c = this.ctx;
    const rng = new Rng(c.seed);
    const a = rng.float() * Math.PI * 2;
    const r = 3.5 + rng.float() * 2.5;
    this.pos = v3(c.player.pos.x + Math.cos(a) * r, 0, c.player.pos.z + Math.sin(a) * r);
    // sprint 443 — a spawn ring can park it through a wall where no sight
    // line ever exists; keep the first bearing in the room too
    const spawnRoom = c.rooms[c.currentRoomIndex];
    if (spawnRoom && !pointInRoom(spawnRoom, this.pos.x, this.pos.z)) {
      this.relocate(0.5);
    }
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
    const wRoom = c.rooms[c.currentRoomIndex];
    const eye = v3();
    p.eyePos(eye);
    const dCanSee = hasLineOfSight(eye, v3(this.decoyPos.x, 1.4, this.decoyPos.z),
      (wRoom ? wRoom.losBlockers : []).concat(shutLeafBlockers(c.rooms, p.pos, this.decoyPos)));
    if (this.decoyMesh) {
      const toD = v3(this.decoyPos.x - p.pos.x, 0, this.decoyPos.z - p.pos.z);
      const dd = Math.hypot(toD.x, toD.z) || 1;
      const dfacing = (dir.x * toD.x + dir.z * toD.z) / dd;
      this.decoyMesh.visible = dfacing > 0.75 && dd < 9 && dCanSee;
      if (this.decoyMesh.visible) this.decoyMesh.rotation.y = Math.atan2(p.pos.x - this.decoyPos.x, p.pos.z - this.decoyPos.z);
      if (dfacing > 0.94 && dd < 9 && dCanSee) {
        c.removeEntityMesh(this.decoyMesh);
        this.decoyMesh = null;
        // Relocate the real whisper to a fresh bearing, tighten the window.
        this.relocate();
        this.attackT = this.strikeWindow * 0.35;
        c.cue('whisper-shift', this.pos, '[not it — the voice moved]', { severity: 'warn' });
      }
    }
    const toW = v3(this.pos.x - p.pos.x, 1.0 - p.pos.y - 1.5, this.pos.z - p.pos.z);
    const dn = Math.hypot(toW.x, toW.y, toW.z) || 1;
    const facing = (dir.x * toW.x + dir.y * toW.y + dir.z * toW.z) / dn;
    // Show silhouette when roughly faced — reward for localization.
    // sprint 442 — facing a wall isn't facing it: sight needs air or the
    // silhouette shows through the leaf, and a gaze through it banishes
    // the thing for free.
    const canSee = hasLineOfSight(eye, v3(this.pos.x, 1.4, this.pos.z),
      (wRoom ? wRoom.losBlockers : []).concat(shutLeafBlockers(c.rooms, p.pos, this.pos)));
    if (this.mesh) this.mesh.visible = facing > 0.75 && dn < 9 && canSee;
    if (this.mesh && this.mesh.visible) {
      this.mesh.rotation.y = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      this.rig?.play('idle');
    }
    if (facing > 0.94 && dn < 9 && canSee) {
      c.cue('whisper-dismiss', this.pos, '[it retreats from your regard]', { severity: 'info' });
      this.done();
      return;
    }
    if (this.attackT > this.strikeWindow) {
      if (!canSee) {
        // The strike can't reach through a shut leaf — it relocates to
        // hunt you again instead of landing for free (same move the
        // decoy collapse pays).
        this.relocate();
        this.attackT = this.strikeWindow * 0.35;
        c.cue('whisper-voice', this.pos, '[the whisper moves — still hunting]', { severity: 'warn' });
        return;
      }
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
  private pos = v3();
  override threatPos(): Vec3 { return this.pos; }
  private behind = 0;
  private dispelT = 0;
  private stepT = 0;
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
    this.pos = v3(this.ctx.player.pos.x, 0, this.ctx.player.pos.z - this.approachD);
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.rig?.update(dt);
    // Is the player looking back at it? (checked before it treads so a
    // fast spin can catch it standing in the open)
    const dir = v3();
    p.lookDir(dir);
    const toE = v3(this.pos.x - p.pos.x, 1.0 - 1.6, this.pos.z - p.pos.z);
    const dn = Math.hypot(toE.x, toE.z) || 1;
    const facing = (dir.x * toE.x + dir.z * toE.z) / dn;
    // It treads to stay behind the player's facing — but only in steps,
    // and never while it's being watched. Unseen it re-seats a few times
    // a second; caught in view it stands, which is how a look-back
    // actually lands on it (it used to re-seat every frame, so it could
    // never be faced and never dispelled).
    this.stepT -= dt;
    if (facing <= 0.7 && this.stepT <= 0) {
      this.stepT = 0.35;
      const backYaw = p.yaw + Math.PI;
      this.pos.x = p.pos.x + Math.sin(backYaw) * this.approachD;
      this.pos.z = p.pos.z + Math.cos(backYaw) * this.approachD;
    }
    const bx = this.pos.x, bz = this.pos.z;
    if (this.mesh) {
      this.mesh.position.set(bx, 0, bz);
      this.mesh.rotation.y = Math.atan2(p.pos.x - bx, p.pos.z - bz);
    }
    // Footstep audio while the player moves (the 'extra pair').
    if (p.lastMoveSpeed > 0.5 && Math.random() < dt * 6) {
      c.cue('echoskin-step', v3(bx, 0, bz), '', { severity: 'info' });
    }
    // sprint 442 — you can't fold what you can't see: the dispel only
    // counts a gaze that clears the air between you.
    const eRoom = c.rooms[c.currentRoomIndex];
    const eEye = v3();
    p.eyePos(eEye);
    const eCanSee = hasLineOfSight(eEye, v3(bx, 1.4, bz),
      (eRoom ? eRoom.losBlockers : []).concat(shutLeafBlockers(c.rooms, p.pos, v3(bx, 0, bz))));
    if (facing > 0.7 && this.approachD < 12 && eCanSee) {
      this.dispelT += dt;
      if (this.dispelT > 0.7) {
        c.cue('echoskin-fold', v3(bx, 0, bz), '[it folds into the wall]', { severity: 'info' });
        this.done();
        return;
      }
    } else {
      this.dispelT = 0;
      // It closes while you look away, but a wall between you is still
      // a wall — out of your sight it stops short of contact until the
      // air between you clears; a look-away strike needs the clear line
      const floor = eCanSee ? 1.4 : this.tuning.killRange + 0.4;
      this.approachD = Math.max(floor, this.approachD - this.tuning.speed * dt * (p.lastMoveSpeed < 0.5 ? 1.2 : 0.6));
      if (eCanSee && this.approachD <= this.tuning.killRange + 0.4) {
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
  private noiseUnsub: (() => void) | null = null;
  private provoked = false;
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
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    this.state = 'engage';
  }

  /** It photographs movement — and a crash IS movement. A loud noise in
   *  its earshot while the shutter is open exposes the film: slammed
   *  doors, sprinted steps, your own ringing lure all count the same. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    const w = this.window;
    if (this.state !== 'engage' || !w || this.provoked) return;
    if (c.now <= w.start || c.now > w.end) return;
    if (e.source || !noiseCanBeHeard(e)) return;
    if (!withinRouseRadius(e, c.player.pos.x, c.player.pos.z)) return;
    this.provoked = true;
    c.cue('stillframe-snap', null, '[the shutter catches the noise]', { severity: 'danger' });
    c.damagePlayer(this.tuning.damage, 'stillframe', 'Stillframe photographs movement — a crash in the open shutter is motion enough.');
    this.done();
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
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
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
    // sprint 442 — 'on screen' means on screen: a shut leaf between you
    // and it isn't a glance, and the strain can't build through it.
    const mRoom = c.rooms[c.currentRoomIndex];
    const mEye = v3();
    p.eyePos(mEye);
    const mCanSee = hasLineOfSight(mEye, v3(x, 1.4, z),
      (mRoom ? mRoom.losBlockers : []).concat(shutLeafBlockers(c.rooms, p.pos, v3(x, 0, z))));
    if (facing > 0.35 && mCanSee) {
      // on screen — frozen but instability grows
      this.instability += dt;
      if (this.instability > 5) {
        c.cue('margin-shift', v3(x, 0, z), '[the room strains — look away]', { severity: 'warn' });
        this.instability = 0;
      }
    } else {
      // It drifts closer while you look away — but a wall between you
      // is still a wall: out of sight it stops short of contact until
      // the air clears, and the strike needs the clear line
      this.d = Math.max(mCanSee ? 1.2 : this.tuning.killRange + 0.3, this.d - this.tuning.speed * dt);
      // Positional misdirection: a soft rustle from the mirrored edge.
      this.rustleT -= dt;
      if (this.rustleT <= 0) {
        this.rustleT = 1.25 + new Rng(c.seed + Math.floor(c.now * 7)).float() * 0.9;
        const mx = p.pos.x + Math.sin(p.yaw - side * 1.35) * this.d;
        const mz = p.pos.z + Math.cos(p.yaw - side * 1.35) * this.d;
        c.cue('margin-rustle', v3(mx, 0, mz), '', { severity: 'warn' });
      }
      if (mCanSee && this.d <= this.tuning.killRange) {
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

  /** The eye at the crack: a sleeper doesn't chase sounds it can't reach,
   *  but a kneel thumped through its floor works on it like the beam —
   *  the crack feeds the same anger, and a sleeper near the edge wakes
   *  on the sighting. Once it's up the kneel tells it nothing new. */
  override eyeTell(_at: Vec3): void {
    if (this.state !== 'engage' || this.mode !== 'dormant') return;
    this.anger = Math.min(1.2, this.anger + 0.55);
    if (!this.stirred && this.anger > 0.5) {
      this.stirred = true;
      this.ctx.duckTone?.(2.6);
      this.ctx.cue('husk-stir', this.pos, '[the figure in the corner shifts — it felt the kneel]', { severity: 'warn' });
      if (this.mesh) this.mesh.rotation.x = 0.08;
    }
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
      if (d < this.tuning.killRange && !hidden && playerExposed(c, this.pos) === 'kill') {
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
  snares: { pos: import('../engine/math').Vec3; room: number; armed: boolean; scuffT?: number;
    /** sprint 414 — the grafter's relocated coils: armed wire the under
     *  lays fresh where the living walk. Checkpointed separately so a
     *  reload keeps the graft, same convention as kickedWedges. */
    grafted?: boolean;
    /** sprint 423 — the player's own laid wire: reclaimed coil that
     *  answers to 'Pull the wire free'. Trips the house's walkers too —
     *  the wire doesn't care whose foot. */
    planted?: boolean;
    /** sprint 454 — the house's claim on your wire: the warden's re-lay
     *  re-tied it under its own knot — 'Cut the seal', no coil back. */
    claimed?: boolean;
    /** prop face for laid wire (grafts + planted) — removed with the
     *  snare so a pulled wire never leaves a ghost visual. */
    mesh?: THREE.Object3D }[] = [];
  puddles: { pos: import('../engine/math').Vec3; room: number; radius: number; humT?: number; entT?: number }[] = [];
  steams: { pos: import('../engine/math').Vec3; room: number; phase: number;
    cycle: number; dead: boolean; hitT?: number; warnT?: number; entT?: number;
    /** sprint 581 — `valved=false` means the throat is stripped: a
     *  bled line can re-lay, a throatless one never can. `owner`
     *  names whose valve is threaded — 'player' means player work
     *  the house won't re-lay. */
    valved?: boolean; owner?: 'player' }[] = [];
  /** Fresh sign: every hazard that dies (cut, sprung, bled, drained) leaves
   *  scent a posted hunter can read — quiet work is marked work. A `wipe`
   *  record is the felt-wrap's shadow: the floor was worked clean, and only
   *  the warden's nose bothers to doubt sign planted near it. */
  evidence: { pos: import('../engine/math').Vec3; room: number;
    kind: 'wire' | 'line' | 'water' | 'fan' | 'wipe' | 'blind' | 'work' | 'spring'; t: number; readBy: string[];
    /** sprint 565 — the sign names the hand: the signer's key
     *  ('grafter:N', 'eye:N', ...) so reads can say WHO worked, not
     *  just that work happened. */
    by?: string;
    old?: boolean; weak?: boolean; wiped?: boolean }[] = [];

  /** sprint 475 — a snare pos is free when no floor-band prop box
   *  overlaps it (boxes whose bottom starts above a wader's reach —
   *  lintels, shelves, the watcher mounts — don't hide a wire). */
  private snareFree(x: number, z: number, room: RoomInstance): boolean {
    for (const c of room.colliders ?? []) {
      if (c.minY > 1.4 || c.maxY < 0.2) continue;
      if (x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3) return false;
    }
    return true;
  }

  /** sprint 475 — entombed wire is dead content: scan a deterministic
   *  ring (8 headings × widening radii) for the nearest spot a wader's
   *  foot can reach; falls back to the seeded pos when the whole
   *  socket's pocket is boxed in. */
  private freeSnareSpot(pos: import('../engine/math').Vec3, room: RoomInstance): import('../engine/math').Vec3 {
    if (this.snareFree(pos.x, pos.z, room)) return pos;
    const rm = room;
    for (const rad of [0.45, 0.7, 0.95, 1.2, 1.5, 1.9, 2.4]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = pos.x + Math.cos(a) * rad, z = pos.z + Math.sin(a) * rad;
        if (rm.width && Math.abs(x - rm.origin.x) > rm.width / 2) continue;
        if (rm.depth && Math.abs(z - rm.origin.z) > rm.depth / 2) continue;
        if (this.snareFree(x, z, room)) return { x, y: pos.y, z };
      }
    }
    return pos;
  }
  fans: { pos: import('../engine/math').Vec3; room: number; dead: boolean; hitT: number; warnT: number; entT?: number;
    /** sprint 589 — `belted=false` means the belt walked off: a chocked
     *  wheel re-engages on a re-lay, a beltless one never can (the
     *  strip is the PERMANENT kill). `owner` names whose belt is
     *  fitted — 'player' is outside the house's re-lay jurisdiction.
     *  `chocked` marks a wedge still jammed in the blades: 'Work the
     *  chock free' mints only while one's in there — a seeded spent
     *  wheel or a stripped housing holds none to free. */
    belted?: boolean; owner?: 'player'; chocked?: boolean }[] = [];
  /** Wall eyes: securityCams sweep a lit room on a deterministic arc,
   *  searchlights hold a slower beam lane. Motion inside the cone settles
   *  the eye — a settled eye rings your position to every listener in
   *  earshot. Dead mains kill them; a felt wrap blinds them. */
  watchers: { pos: import('../engine/math').Vec3; yaw: number; room: number;
    arc: number; half: number; range: number; cycle: number; phase0: number;
    dead: boolean; settle: number; lastReport: number; warnT: number;
    filed: boolean; lampCued: boolean;
    /** sprint 561 — the dazzle: bearing the beam lit the eye from, the
     *  last frame it drank, seconds drunk this episode, whether the
     *  work was signed, and whether the drink was announced. */
    dazzleBearing: number; dazzleT: number; dazzleAcc: number;
    dazzleSigned: boolean; dazzleCued: boolean;
    /** sprint 568 — it drank at least once: the episode flags reset
     *  on every blink, but the epitaph counts every eye the light
     *  ever held. */
    everDazzled: boolean;
    /** sprint 597 — the glass itself is a good: pried out it yields
     *  `eyeLens` and the socket can never wake again; `owner` marks a
     *  socket a player seated their own lens into — an owned eye
     *  never settles on you, it murmurs on the house's walkers
     *  instead; `lensHoldUntil` pins the blink while a fed lens holds
     *  the stare; `watchSettle`/`lastMurmur` are the owned eye's
     *  settle clock + murmur throttle. */
    lensed?: boolean; owner?: 'player'; lensHoldUntil?: number;
    watchSettle?: number; lastMurmur?: number }[] = [];
  /** One warn per marking: reset when the book no longer holds you. */
  private markedWarned = false;
  /** sprint 560 — the beam's charge readout, per lamp position, on a
   *  decay (the fuse burns down — re-reading a burning lamp after a
   *  while reports a lower batt and that's the point). */
  private lampBeamRead = new Map<string, number>();
  private wPX = NaN; private wPZ = NaN;
  lastTick = 0;

  constructor() {}

  addFromRoom(room: RoomInstance): void {
    for (const s of room.sockets) {
      if (s.meta.hazard === 'snare') {
        const spent = s.meta.spent === true;
        // sprint 475 — a wire hidden inside furniture threatens nothing:
        // dressing can entomb a seeded socket inside a prop collider.
        // Nudge entombed snares to the nearest free point on a
        // deterministic ring — same seed, same spot. The socket's own
        // pos moves with it so every reader (props, prompts, the
        // checkpoint's spent-match) sees one wire in one place.
        const pos = this.freeSnareSpot(s.pos, room);
        s.pos.x = pos.x; s.pos.z = pos.z;
        this.snares.push({ pos: s.pos, room: room.index, armed: !spent });
        if (spent) this.evidence.push({ pos: s.pos, room: room.index, kind: 'wire', t: -1, readBy: [], old: true });
      }
      if (s.meta.hazard === 'puddle') this.puddles.push({ pos: s.pos, room: room.index, radius: 1.1 });
      if (s.meta.hazard === 'steam') {
        // deterministic per-vent rhythm — same seed, same beat
        // sprint 399 — % keeps the sign in JS: negative-coord rooms fed a
        // negative hsh and ran cycles below their floors.
        const hsh = (((s.pos.x * 7 + s.pos.z * 13 + room.index * 5) % 10) + 10) % 10 / 10;
        const cycle = 4.5 + hsh * 3.0;
        const spent = s.meta.spent === true;
        this.steams.push({ pos: s.pos, room: room.index, phase: hsh * cycle, cycle, dead: spent });
        if (spent) this.evidence.push({ pos: s.pos, room: room.index, kind: 'line', t: -1, readBy: [], old: true });
      }
      if (s.meta.hazard === 'fan') {
        const spent = s.meta.spent === true;
        this.fans.push({ pos: s.pos, room: room.index, dead: spent, hitT: -1, warnT: -10 });
        if (spent) this.evidence.push({ pos: s.pos, room: room.index, kind: 'fan', t: -1, readBy: [], old: true });
      }
    }
    // Wall eyes come from props, not sockets — the dressing pass mounts
    // cams; a couple of templates author searchlights.
    const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
    for (const p of room.spec?.props ?? []) {
      if (p.kind !== 'securityCam' && p.kind !== 'searchlight') continue;
      const wx = room.origin.x + p.x * c + p.z * s;
      const wz = room.origin.z - p.x * s + p.z * c;
      // sprint 399 — same sign trap: a negative hsh shrank the pan cycle
      // below ~6s, so no single in-cone pass could reach the 0.9s settle —
      // eyes in negative-coord rooms could never report anyone.
      const hsh = (((wx * 7 + wz * 13 + room.index * 5) % 10) + 10) % 10 / 10;
      const cam = p.kind === 'securityCam';
      this.watchers.push({
        pos: v3(wx, p.y ?? (cam ? 2.35 : 1.4), wz),
        yaw: (p.yaw ?? 0) + room.yaw,
        room: room.index,
        arc: cam ? 0.95 : 0.5, half: cam ? 0.42 : 0.34,
        range: cam ? 6.5 : 7.5, cycle: cam ? 7 + hsh * 4 : 10 + hsh * 4,
        phase0: hsh * 20,
        dead: false, settle: 0, lastReport: -10, warnT: -10, filed: false, lampCued: false,
        dazzleBearing: NaN, dazzleT: -10, dazzleAcc: 0,
        dazzleSigned: false, dazzleCued: false, everDazzled: false,
        lensHoldUntil: -10, watchSettle: 0, lastMurmur: -10,
      });
    }
  }

  update(ctx: EntityCtx, dt: number): void {
    const p = ctx.player;
    for (const s of this.snares) {
      if (!s.armed) continue;
      // a snare under live floodwater can't be seen — but a slow
      // crouch-wader feels the wire and steps over it; only an upright
      // stride trips what the dark water hides.
      const sr = ctx.rooms[s.room];
      const submerged = !!sr?.flooded && !(ctx.isRoomDrained?.(s.room) ?? false);
      if (v3dist(p.pos, s.pos) < 0.7) {
        if (submerged && p.crouching) {
          if (ctx.now >= (s.scuffT ?? 0)) {
            s.scuffT = ctx.now + 3;
            ctx.sound.emit({ x: s.pos.x, y: 0.2, z: s.pos.z, intensity: 0.25, category: 'footstep', caption: '[wire underfoot]' });
          }
          continue;
        }
        s.armed = false;
        this.evidence.push({ pos: v3(s.pos.x, 0, s.pos.z), room: s.room, kind: 'wire', t: ctx.now, readBy: [] });
        p.rootedUntil = ctx.now + 1.6;
        ctx.damagePlayer(8, 'hazard', 'Paper seals root and rustle. Step around them — everything heard that.');
        ctx.sound.emit({ x: s.pos.x, y: 0.4, z: s.pos.z, intensity: 0.8, category: 'impact', caption: '[paper snare]' });
      }
    }
    // Live pressure lines — a seeded warn → blast → idle rhythm. The
    // blast ticks blood and carries; a bled line is dead metal.
    for (const st of this.steams) {
      if (st.dead || st.room !== ctx.currentRoomIndex) continue;
      const prev = st.phase;
      st.phase = (st.phase + dt) % st.cycle;
      const d = v3dist(p.pos, st.pos);
      if (st.phase < prev && d < 6) {
        ctx.sound.emit({ x: st.pos.x, y: 0.5, z: st.pos.z, intensity: 0.5, category: 'machine', caption: '[a line vents]' });
        ctx.cue('steam-hiss', st.pos, '', {});
      }
      if (st.phase < 1.8 && d < 1.3 && ctx.now - (st.hitT ?? -1) > 0.5) {
        st.hitT = ctx.now;
        ctx.damagePlayer(6, 'hazard', 'Steam blasts off the line. Time it, or bleed it.');
      }
      if (st.phase > st.cycle - 1.2 && d < 3.2 && ctx.now - (st.warnT ?? -10) > 3) {
        st.warnT = ctx.now;
        ctx.cue('steam-hiss', st.pos, '[the line hums — it is about to vent; the valve bleeds it]', { severity: 'warn' });
      }
    }
    // Belt-wheels chew at shoulder height forever — the blades take
    // standing flesh, a duck walks under them, a chock stills them.
    for (const f of this.fans) {
      if (f.dead || f.room !== ctx.currentRoomIndex) continue;
      const d = v3dist(p.pos, f.pos);
      if (d < 2.8 && ctx.now - f.warnT > 4) {
        f.warnT = ctx.now;
        ctx.cue('steam-hiss', f.pos, '[a belt-wheel chews the air at shoulder height — duck under, or chock the blades]', { severity: 'warn' });
      }
      if (d < 1.0 && !p.crouching && ctx.now - f.hitT > 0.6) {
        f.hitT = ctx.now;
        ctx.damagePlayer(7, 'hazard', 'The blades take standing flesh — duck under, or chock the wheel.');
        ctx.sound.emit({ x: f.pos.x, y: 1.2, z: f.pos.z, intensity: 0.55, category: 'machine', caption: '[the wheel bites]' });
      }
    }
    // Wall eyes read MOTION, not presence — inside the cone you stand
    // still and let it pan past, or you move and it settles and tells.
    // And the register talks back: once the book holds a line on you
    // (unpaidHeld > 0 — a lamp's witness, an eye's report, a courier's
    // card, a cut wire) every eye has your description and settles
    // ~1.6x faster. Settle the book and they go back to strangers.
    const marked = (ctx.heldOwed?.() ?? 0) > 0;
    if (!marked) this.markedWarned = false;
    const wMoving = Number.isFinite(this.wPX)
      && Math.hypot(p.pos.x - this.wPX, p.pos.z - this.wPZ) > 0.004;
    this.wPX = p.pos.x; this.wPZ = p.pos.z;
    for (const w of this.watchers) {
      if (w.room !== ctx.currentRoomIndex) continue;
      const rm = ctx.rooms[w.room];
      // sprint 597 — a pried socket joins the dead mains: no glass,
      // no pan, whatever the felt's state says.
      const live = !w.dead && w.lensed !== false && !rm?.darkRoom;
      const dx = p.pos.x - w.pos.x, dz = p.pos.z - w.pos.z;
      const d = Math.hypot(dx, dz);
      // sprint 598 — your own eye doesn't report you: it knows your
      // walk. The hiss and the register's talk-back are the house's
      // tells; an owned socket stays quiet for you.
      if (live && w.owner !== 'player' && d < w.range + 1.5 && ctx.now - w.warnT > 7) {
        w.warnT = ctx.now;
        ctx.cue('steam-hiss', w.pos, '[the eye pans — still feet pass it]', { severity: 'info' });
      }
      if (marked && live && w.owner !== 'player' && !this.markedWarned) {
        this.markedWarned = true;
        ctx.cue('steam-hiss', w.pos, '[the register talks back — the eyes have your description]', { severity: 'warn' });
      }
      if (!live) { w.settle = Math.max(0, w.settle - dt * 2); continue; }
      let facing = w.yaw + Math.sin((ctx.now + w.phase0) * (Math.PI * 2 / w.cycle)) * w.arc;
      // sprint 534 — the eye drinks the light: a pulse lamp left
      // burning inside the sweep's reach holds the pan on it — the
      // cone fixates and breathes slowly over the lamp's bearing
      // instead of travelling the room. Stand beside your own lure
      // and it still reads you: light is not cover.
      let lampBearing = NaN;
      for (const l of ctx.litLamps?.(w.room) ?? []) {
        const ld = Math.hypot(l.x - w.pos.x, l.z - w.pos.z);
        if (ld > w.range + 2) continue;
        const lb = Math.atan2(l.x - w.pos.x, l.z - w.pos.z);
        let d0 = lb - w.yaw;
        while (d0 > Math.PI) d0 -= Math.PI * 2;
        while (d0 < -Math.PI) d0 += Math.PI * 2;
        if (Math.abs(d0) > w.arc + 0.5) continue;
        lampBearing = lb;
        break;
      }
      if (Number.isFinite(lampBearing)) {
        facing = lampBearing
          + Math.sin((ctx.now + w.phase0) * (Math.PI * 2 / (w.cycle * 2))) * w.arc * 0.35;
        if (!w.lampCued) {
          w.lampCued = true;
          ctx.cue('steam-hiss', w.pos, '[the eye drinks the light — its pan fixes on the lamp]', { severity: 'info' });
        }
      } else w.lampCued = false;
      // sprint 561-563 — the eye drinks YOUR beam too: a held lamp
      // aimed at a live eye pins its pan to the bearing the light came
      // from. It stares at where the light WAS — slip off that bearing
      // and the sweep is blind to you until it blinks back (~2.5s).
      // Your beam outranks a dropped lamp's pull — you're actively
      // working the eye. Hold the light 4s+ and the floor keeps the
      // work: 'work' sign hunters can smell (s563).
      if (live) {
        if (ctx.beamCovers?.(w.pos, w.range + 2, 0.7)) {
          // it pins to the FIRST bearing the light came from and holds
          // there while it drinks — the play is light it, then slip
          // off the bearing; the sweep can't find you on its dark edge
          if (!Number.isFinite(w.dazzleBearing)) w.dazzleBearing = Math.atan2(dx, dz);
          w.dazzleT = ctx.now;
          w.dazzleAcc += dt;
          if (!w.dazzleCued) {
            w.dazzleCued = true;
            w.everDazzled = true;
            ctx.cue('steam-hiss', w.pos, '[the eye drinks your light — it stares where you stood]', { severity: 'warn' });
          }
          if (!w.dazzleSigned && w.dazzleAcc > 4) {
            w.dazzleSigned = true;
            ctx.signWork?.(w.pos, `eye:${w.room}`);
            ctx.cue('steam-hiss', w.pos, '[the eye\'s stare was worked — the floor keeps the sign]', { severity: 'info' });
            // sprint 567 — the dazzle's sign rings the eye's spot too:
            // the stare's report is a real sound the house can hear,
            // not just dust a hunter might smell later
            ctx.sound.emit({ x: w.pos.x, y: 1.6, z: w.pos.z, intensity: 0.4, category: 'machine', caption: '' });
          }
        } else if (w.dazzleCued && ctx.now - w.dazzleT > 2.5
          // sprint 599 — a fed lens pins the stare longer than a held
          // beam does: while `lensHoldUntil` runs the eye can't blink,
          // the glass it drank still tastes of itself
          && !(w.lensHoldUntil !== undefined && ctx.now < w.lensHoldUntil)) {
          // sprint 562 — the blink tells: the sweep coming back online
          // is audible to whoever held it — your window is closing.
          // (dazzleCued gates it — an eye that never drank has
          // dazzleT=-10 and must NOT touch this branch every frame:
          // s285 settle specs caught settle=0 stomping plain watches)
          ctx.cue('steam-hiss', w.pos, '[the eye blinks — its pan runs again]', { severity: 'info' });
          // sprint 564 — the blink is a full reset: whatever half-
          // settled read it took while drinking is lost with the light
          w.settle = 0;
          w.dazzleBearing = NaN; w.dazzleAcc = 0;
          w.dazzleSigned = false; w.dazzleCued = false;
          w.lensHoldUntil = -10;
        }
        if (Number.isFinite(w.dazzleBearing)) {
          facing = w.dazzleBearing
            + Math.sin((ctx.now + w.phase0) * (Math.PI * 2 / (w.cycle * 2))) * 0.06;
        }
      }
      // sprint 598 — YOUR eye works the hall for you: a socket seated
      // with your lens never settles on your walk — it knows you — it
      // settles on the house's walkers instead and murmurs crossings
      // back to you. The whir is a real sound; the house can hear its
      // own eye working for somebody else.
      if (w.owner === 'player') {
        let crossing = false;
        for (const e of ctx.walkers?.(w.room) ?? []) {
          const ex = e.x - w.pos.x, ez = e.z - w.pos.z;
          const ed = Math.hypot(ex, ez);
          if (ed > w.range || ed < 0.45) continue;
          let ediff = Math.atan2(ex, ez) - facing;
          while (ediff > Math.PI) ediff -= Math.PI * 2;
          while (ediff < -Math.PI) ediff += Math.PI * 2;
          if (Math.abs(ediff) > w.half) continue;
          crossing = true;
          break;
        }
        w.watchSettle = crossing ? (w.watchSettle ?? 0) + dt
          : Math.max(0, (w.watchSettle ?? 0) - dt * 2);
        if ((w.watchSettle ?? 0) > 0.9 && ctx.now - (w.lastMurmur ?? -10) > 6) {
          w.lastMurmur = ctx.now;
          w.watchSettle = 0;
          ctx.cue('steam-hiss', w.pos, '[your eye murmurs — something crosses its arc]', { severity: 'info' });
          ctx.sound.emit({ x: w.pos.x, y: 1.6, z: w.pos.z, intensity: 0.3, category: 'machine', caption: '[an eye whirs]' });
        }
        continue;
      }
      if (d > w.range || d < 0.45) { w.settle = Math.max(0, w.settle - dt * 2); continue; }
      let diff = Math.atan2(dx, dz) - facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > w.half) { w.settle = Math.max(0, w.settle - dt * 2); continue; }
      // sprint 566 — the light testifies: on a FILED face a beam-held
      // stare settles ~40% faster — your own light confirms the
      // register's description when you stand in the dazzle's bearing
      const lit = Number.isFinite(w.dazzleBearing);
      w.settle = wMoving ? w.settle + dt * (marked ? (lit ? 2.2 : 1.6) : 1) : Math.max(0, w.settle - dt * 2);
      if (w.settle > 0.9 && ctx.now - w.lastReport > 5) {
        w.lastReport = ctx.now;
        ctx.cue('steam-hiss', w.pos, '[the eye settles on you — it has your position]', { severity: 'warn' });
        ctx.sound.emit({ x: p.pos.x, y: p.pos.y, z: p.pos.z, intensity: 0.5, category: 'machine', caption: '' });
        // the house's eye and the crew's lamp file the same statement —
        // once per eye: a held settle is a witness line upstairs
        if (!w.filed) {
          w.filed = true;
          ctx.eyeFiled?.();
          ctx.cue('steam-hiss', w.pos, '[the eye\'s report goes in the register — your face is filed]', { severity: 'warn' });
        }
      }
    }
    // Old sign the PLAYER can read: a sprung wire or a bled line from
    // before you arrived reads as history — someone else worked here.
    // sprint 558 — and the beam reads it at range: aimed lamp light
    // picks old scars out of the dust before you're standing in them.
    for (const ev of this.evidence) {
      if (!ev.old || ev.room !== ctx.currentRoomIndex || ev.readBy.includes('player')) continue;
      const d = v3dist(p.pos, ev.pos);
      const aimed = d <= 9 && (ctx.beamCovers?.(ev.pos, 9, 0.75) ?? false);
      if (d > 3 && !aimed) continue;
      ev.readBy.push('player');
      ctx.cue('floor-creak', ev.pos, aimed
        ? '[the beam picks an old scar — somebody worked here, long ago]'
        : ev.kind === 'wire'
          ? '[a sprung wire, long dry — someone else took this step]'
          : ev.kind === 'line'
            ? '[a bled line, long cold — somebody worked here]'
            : '[a chocked wheel, long still — somebody stopped the blades]', { severity: 'info' });
    }
    // sprint 421 — fresh sign reads too: 'work' marks are hands at
    // hand-height — a grafted splice, the rubble's maintenance — and
    // the dust testifies while it's still warm. Your own work comes
    // pre-read so the floor doesn't narrate your hands back to you.
    // sprint 557 — aimed light reaches it too: the beam finds the
    // hand before your ankle does.
    for (const ev of this.evidence) {
      // wiped sign reads as scrubbed dust — the felt's shadow poisons
      // the player's fresh-read the same as every hunter's
      if (ev.old || ev.wiped || ev.room !== ctx.currentRoomIndex || ev.kind !== 'work'
        || ev.readBy.includes('player')) continue;
      const d = v3dist(p.pos, ev.pos);
      const aimed = d <= 9 && (ctx.beamCovers?.(ev.pos, 9, 0.75) ?? false);
      if (d > 2.6 && !aimed) continue;
      ev.readBy.push('player');
      // sprint 565 — the sign names the hand: a read says WHO worked
      // when the signer left its key, not just that work happened
      const hand = ev.by?.split(':')[0];
      ctx.cue('floor-creak', ev.pos, hand === 'grafter'
        ? '[stone fingers worked this dust — the under was here, recently]'
        : hand === 'eye'
          ? '[a stare was worked out of this spot — light held it, recently]'
          : aimed
            ? '[the beam finds a hand in the dust — worked here, recently]'
            : '[the dust keeps a hand — worked here, recently]', { severity: 'info' });
    }
    // sprint 559 — the beam reads what the ankle can't: hunter-sign
    // (fresh wire/line/fan kills) and wiped floors are invisible to a
    // player on foot, but aimed light catches the fresh break or the
    // scrubbed patch — the wipe's shadow reads back under the beam.
    for (const ev of this.evidence) {
      if (ev.old || ev.room !== ctx.currentRoomIndex || ev.readBy.includes('player')) continue;
      if (!(ev.wiped || ev.kind === 'wire' || ev.kind === 'line' || ev.kind === 'fan' || ev.kind === 'spring')) continue;
      const d = v3dist(p.pos, ev.pos);
      if (d > 9 || !(ctx.beamCovers?.(ev.pos, 9, 0.75) ?? false)) continue;
      ev.readBy.push('player');
      ctx.cue('floor-creak', ev.pos, ev.wiped
        ? '[the dust is scrubbed clean under the beam — someone wiped this]'
        : ev.kind === 'wire'
          ? '[the beam finds a fresh cut — wire died here, recently]'
          : ev.kind === 'line'
            ? '[the beam finds a bled line — somebody worked it, recently]'
            : ev.kind === 'spring'
              ? '[the beam finds a sprung plate — a trap was pried here]'
              : '[the beam finds a stilled wheel — somebody stopped the blades]', { severity: 'info' });
    }
    // sprint 560 — and the beam reads your own lamps' charge: aim at a
    // dropped lamp and its fuse reads back across the room — burning,
    // doused-but-charged, or dead shell. Re-reads decay with the lamp:
    // a burning lamp is worth checking again as the batt runs down.
    for (const l of ctx.floorLamps?.(ctx.currentRoomIndex) ?? []) {
      const key = `${l.x.toFixed(2)},${l.z.toFixed(2)}`;
      const d = v3dist(p.pos, { x: l.x, y: 0, z: l.z });
      if (d > 9 || !(ctx.beamCovers?.({ x: l.x, y: 0, z: l.z }, 9, 0.75) ?? false)) continue;
      if (ctx.now - (this.lampBeamRead.get(key) ?? -60) < 45) continue;
      this.lampBeamRead.set(key, ctx.now);
      ctx.cue('floor-creak', { x: l.x, y: 0.4, z: l.z }, l.batt <= 0
        ? '[a dead lamp under the beam — the shell still holds its shape]'
        : !l.lit
          ? `[your lamp waits dark — ${Math.round(l.batt)} charge in the bottle]`
          : `[the beam finds your lamp — burning, ${Math.round(l.batt)} left]`, { severity: 'info' });
    }
    this.lastTick += dt;
    if (this.lastTick > 0.5) {
      this.lastTick = 0;
      for (const pu of this.puddles) {
        if (pu.room !== ctx.currentRoomIndex) continue;
        // the arc needs its medium — a drained hall is just a wet floor
        const rm = ctx.rooms[pu.room];
        const live = !!rm?.flooded && !(ctx.isRoomDrained?.(pu.room) ?? false);
        if (!live) continue;
        const d = v3dist(p.pos, pu.pos);
        if (d < pu.radius) {
          ctx.damagePlayer(4, 'hazard', 'Electrified water hums amber. Give it the wide step.');
        } else if (d < pu.radius + 2.2 && ctx.now - (pu.humT ?? -10) > 4) {
          // audible before it hurts — the fitting crackles as you close in
          pu.humT = ctx.now;
          ctx.cue('steam-hiss', pu.pos, '[the water ahead hums amber]', { severity: 'warn' });
        }
      }
    }
  }
}

/* ============================ PORTER ============================ */
/** Lintel ambusher — clings in the header space above the room's exit door.
 *  Crossing under it unlooked drops it on you; the counterplay is a verb
 *  nothing else in the hotel teaches: look UP. Hold the lintel in your gaze
 *  ~0.9s and it withdraws into the structure. Dust tells sift down while it
 *  waits. It climbs off when you leave the room. */
export class Porter extends Entity {
  private mesh: THREE.Group | null = null;
  private rig: RiggedFigure | null = null;
  private header = v3();        // lintel point (door pos raised ~2.7m)
  private doorPos = v3();       // the 2D crossing point it guards
  private hostRoom = -1;
  private rng = new Rng(0);
  private siftT = 2.5;
  private gazeT = 0;            // cumulative seconds under player gaze
  private gazeCueAt = -10;
  private underT = 0;           // seconds the player has lingered below
  private expireT = 70;

  constructor() { super('porter', ENTITY_TUNING.porter); }

  protected override onSpawn(): void {
    const c = this.ctx;
    this.rng = new Rng(c.seed);
    this.hostRoom = c.currentRoomIndex;
    const next = c.rooms[this.hostRoom + 1];
    // The door the player will most likely walk under next — the next
    // room's entry. Fall back to any honest door in this room.
    const door = next?.doors.find((d) => d.id.endsWith('-in'))
      ?? c.rooms[this.hostRoom]?.doors.find((d) => !d.falseDoor && !d.locked)
      ?? c.rooms[this.hostRoom]?.doors[0];
    const host = c.rooms[this.hostRoom];
    // The lintel blocker spans y 2.15–2.9 in the wall plane — nothing inside
    // it is ever visible. Cling just inside the room's airspace instead:
    // ~0.5m in from the door, atop the surround at y 2.3.
    if (door && host) {
      const inX = host.origin.x - door.pos.x, inZ = host.origin.z - door.pos.z;
      const inLen = Math.hypot(inX, inZ) || 1;
      this.doorPos = v3(door.pos.x, 0, door.pos.z);
      this.header = v3(door.pos.x + (inX / inLen) * 0.5, 2.3, door.pos.z + (inZ / inLen) * 0.5);
    } else {
      const ex = host?.exitPos ?? c.player.pos;
      this.doorPos = v3(ex.x, 0, ex.z);
      this.header = v3(ex.x, 2.3, ex.z);
    }
    const rig = riggedFigure('ninja');
    this.rig = rig;
    const g = rig?.group ?? tallFigure({
      height: 1.0, body: MAT.shadowFigure(), face: 'mask', eyes: 'amber', hood: true, tattered: true,
    });
    g.position.set(this.header.x, this.header.y, this.header.z);
    g.rotation.x = 0.55;          // head-down clinging pose on the header
    g.scale.setScalar(0.8);
    this.mesh = g;
    c.addEntityMesh(g);
    rig?.play('idle');
    this.state = 'engage';
    c.cue('hide-creak', this.header, '[dust sifts down — something clings above]', { severity: 'warn' });
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.rig?.update(dt);

    // Gone once the player leaves — it climbs down empty.
    this.expireT -= dt;
    if (c.currentRoomIndex !== this.hostRoom || this.expireT <= 0) {
      c.cue('floor-creak', this.header, '[boards settle overhead]', { severity: 'info' });
      this.done();
      return;
    }

    // Dust tells — the only warning it gives.
    this.siftT -= dt;
    if (this.siftT <= 0) {
      this.siftT = 4 + this.rng.float() * 4;
      const drop = v3(this.header.x + this.rng.range(-0.4, 0.4), 1.4, this.header.z + this.rng.range(-0.4, 0.4));
      c.cue(this.rng.bool(0.6) ? 'moth-flutter' : 'hide-creak', drop, '[dust sifts down]', { severity: 'info' });
      c.sound.emit({ x: drop.x, y: 1.2, z: drop.z, intensity: 0.22, category: 'critter', caption: '', source: this.id });
    }

    // Spotted? Requires pitching the gaze UP at the header — the only threat
    // in the hotel that checks the third axis of your look direction.
    const dir = v3();
    p.lookDir(dir);
    const eye = v3();
    p.eyePos(eye);
    const to = v3(this.header.x - eye.x, this.header.y - eye.y, this.header.z - eye.z);
    const len = Math.sqrt(to.x * to.x + to.y * to.y + to.z * to.z);
    let gazing = false;
    if (len > 1e-3) {
      const dot = (dir.x * to.x + dir.y * to.y + dir.z * to.z) / len;
      // dot alone isn't enough — at distance a level gaze covers the header
      // (~7° above eye line) and would spot it for free. Require a genuinely
      // upward pitch so the counterplay is always a deliberate look-up.
      if (dot > 0.62 && dir.y > 0.1) {
        const room = c.rooms[c.currentRoomIndex];
        gazing = hasLineOfSight(eye, this.header, (room ? room.losBlockers : []).concat(shutLeafBlockers(c.rooms, eye, this.header)));
      }
    }
    if (gazing) {
      this.gazeT += dt;
      if (c.now - this.gazeCueAt > 6) {
        this.gazeCueAt = c.now;
        c.cue('hide-creak', this.header, '[it pulls still above the frame]', { severity: 'warn' });
      }
      if (this.gazeT >= 0.9) {
        c.cue('hide-creak', this.header, '[something withdraws above the frame]', { severity: 'info' });
        this.done();
        return;
      }
    } else {
      this.gazeT = Math.max(0, this.gazeT - dt * 0.8);
    }

    // The drop — linger under the lintel unlooked.
    const under = Math.hypot(p.pos.x - this.doorPos.x, p.pos.z - this.doorPos.z) < 0.95;
    if (under && !gazing) this.underT += dt;
    else this.underT = Math.max(0, this.underT - dt);
    if (this.underT > 0.5) {
      this.rig?.play('attack', 0.05);
      c.damagePlayer(this.tuning.damage, 'porter', 'It waited above the lintel — look up before crossing.');
      c.cue('impact', { x: this.header.x, y: 1.4, z: this.header.z }, '[it drops — from above]', { severity: 'danger' });
      c.sound.emit({ x: this.header.x, y: 1, z: this.header.z, intensity: 0.9, category: 'impact', caption: '[drop]', source: this.id });
      this.done();
    }
  }

  override threatPos(): Vec3 | null { return this.state === 'engage' ? this.header : null; }

  protected override onDone(): void {
    if (this.mesh) { this.ctx.removeEntityMesh(this.mesh); this.mesh = null; }
    this.rig = null;
  }
}

/* ============================ GROUNDSWELL ============================ */
/** The room itself fighting back: every few seconds a swell line travels the
 *  floor from the entry door toward the exit — a raised hump of boards you
 *  can see coming as a dark strip + a dust lift. Inside the band when it
 *  passes → stumble (rooted) + damage. The counterplay is spatial: sidestep
 *  into the calm strips along the walls, or stand still nowhere. */
export class Groundswell extends Entity {
  private hostRoom = -1;
  private rng = new Rng(0);
  private axis = v3();        // unit vector, entry→exit
  private perp = v3();        // lateral unit vector
  private start = v3();       // wave origin (entry door)
  private center = v3();
  private span = 0;           // corridor length the wave travels
  private crossHalf = 0;      // room half-width across the axis
  private front = -1;         // metres along axis reached; -1 = idle
  private waveAt = 0;
  private waves = 0;
  private struck = false;
  private rumbleT = 0;
  private swell: THREE.Mesh | null = null;
  private pts: THREE.Points | null = null;
  private pPos: Float32Array | null = null;
  private pLife: Float32Array | null = null;
  private pIdx = 0;
  private noiseUnsub: (() => void) | null = null;
  private provokeCd = 0;

  constructor() { super('groundswell', ENTITY_TUNING.groundswell); }

  protected override onSpawn(): void {
    const c = this.ctx;
    this.rng = new Rng(c.seed);
    const room = c.rooms[c.currentRoomIndex];
    this.hostRoom = c.currentRoomIndex;
    const ex = room.exitPos, en = room.entryPos;
    const ax = ex.x - en.x, az = ex.z - en.z;
    const len = Math.hypot(ax, az);
    if (len < 6) { this.done(); return; }   // too short to wave through
    this.axis = v3(ax / len, 0, az / len);
    this.perp = v3(-this.axis.z, 0, this.axis.x);
    this.start = v3(en.x, 0, en.z);
    this.center = v3(room.origin.x, 0, room.origin.z);
    this.span = len;
    this.crossHalf = Math.min(room.spec?.width ?? 10, room.spec?.depth ?? 10) / 2;
    this.waveAt = c.now + this.tuning.warningTime;
    // The swell strip: a dark hump spanning the calm-bounded middle of the
    // room; its scale.y pulses as it passes.
    const stripLen = Math.max(1.5, (this.crossHalf - 1.0) * 2);
    const geo = new THREE.BoxGeometry(stripLen, 1, 1.35);
    geo.translate(0, 0.5, 0);
    this.swell = new THREE.Mesh(geo, MAT.darkOak());
    this.swell.scale.y = 0.001;
    this.swell.visible = false;
    this.swell.rotation.y = Math.atan2(this.perp.x, this.perp.z) + Math.PI / 2;
    c.addEntityMesh(this.swell);
    // Dust lift along the front.
    this.pPos = new Float32Array(36 * 3);
    this.pLife = new Float32Array(36);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    const pm = new THREE.PointsMaterial({ color: 0x9a8a6d, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
    this.pts = new THREE.Points(pg, pm);
    this.pts.frustumCulled = false;
    c.addEntityMesh(this.pts);
    this.state = 'engage';
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    c.cue('floor-creak', this.start, '[the floor holds its breath]', { severity: 'warn' });
    c.sound.emit({ x: this.center.x, y: 0.2, z: this.center.z, intensity: 0.5, category: 'ambient', caption: '', source: this.id });
  }

  /** Heavy noise in the room provokes it: while a wave is idle, a loud
   *  sound drags the next swell forward. Sprint through and the floor
   *  answers sooner — walk soft, or don't walk at all. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'engage' || this.front >= 0) return;
    if (e.source || !noiseCanBeHeard(e)) return;
    if (!withinRouseRadius(e, this.center.x, this.center.z)) return;
    if (this.waveAt <= c.now + 0.7) return;
    this.waveAt = c.now + 0.7;
    if (this.provokeCd <= c.now) {
      this.provokeCd = c.now + 6;
      c.cue('floor-creak', this.center, '[the boards stir under the noise]', { severity: 'warn' });
    }
  }

  private frontPos(out: Vec3, f: number): Vec3 {
    out.x = this.start.x + this.axis.x * f;
    out.z = this.start.z + this.axis.z * f;
    out.y = 0;
    return out;
  }

  private spawnDust(f: number): void {
    if (!this.pPos || !this.pLife) return;
    for (let k = 0; k < 2; k++) {
      const i = this.pIdx = (this.pIdx + 1) % 36;
      const lat = this.rng.range(-(this.crossHalf - 1.1), this.crossHalf - 1.1);
      this.pPos[i * 3] = this.start.x + this.axis.x * f + this.perp.x * lat;
      this.pPos[i * 3 + 1] = 0.05 + this.rng.float() * 0.25;
      this.pPos[i * 3 + 2] = this.start.z + this.axis.z * f + this.perp.z * lat;
      this.pLife[i] = 0.55;
    }
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    if (c.currentRoomIndex !== this.hostRoom || (this.waves >= 4 && this.front < 0)) {
      c.cue('floor-creak', this.center, '[the floor settles]', { severity: 'info' });
      this.done();
      return;
    }
    // Dust drift
    if (this.pPos && this.pLife) {
      for (let i = 0; i < 36; i++) {
        if (this.pLife[i] <= 0) continue;
        this.pLife[i] -= dt;
        this.pPos[i * 3 + 1] += dt * 0.5;
        if (this.pLife[i] <= 0) this.pPos[i * 3 + 1] = -99;
      }
      const attr = this.pts!.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }

    if (this.front < 0) {
      if (c.now >= this.waveAt) {
        this.front = 0;
        this.struck = false;
        this.waves++;
        this.rumbleT = 0;
        c.cue('rug-slide', this.start, this.waves === 1
          ? '[the boards lift — a swell running the length of the room]'
          : '[another swell — sidestep it]', { severity: 'warn' });
      }
      return;
    }

    // Wave front advances
    this.front += 3.2 * dt;
    const f = this.front;
    this.rumbleT -= dt;
    if (this.rumbleT <= 0) {
      this.rumbleT = 0.35;
      const fp = this.frontPos(v3(), f);
      c.sound.emit({ x: fp.x, y: 0.2, z: fp.z, intensity: 0.45, category: 'ambient', caption: '', source: this.id });
    }
    if (this.swell) {
      const fp = this.frontPos(v3(), f);
      this.swell.visible = true;
      this.swell.position.set(fp.x, 0, fp.z);
      this.swell.scale.y = 0.05 + Math.sin(Math.min(1, f / 0.8) * Math.PI * 0.5) * 0.1;
    }
    this.spawnDust(f);

    // Hit test — inside the moving band, outside the calm wall strips.
    if (!this.struck && !p.dead && !p.hiddenSpot) {
      const relX = p.pos.x - this.start.x, relZ = p.pos.z - this.start.z;
      const along = relX * this.axis.x + relZ * this.axis.z;
      const roomLat = Math.abs((p.pos.x - this.center.x) * this.perp.x + (p.pos.z - this.center.z) * this.perp.z);
      if (Math.abs(along - f) < 0.7 && roomLat < this.crossHalf - 1.0) {
        this.struck = true;
        p.rootedUntil = c.now + 0.7;
        c.damagePlayer(this.tuning.damage, 'groundswell', 'The floor lifts in waves — read the dust and sidestep the hump before it reaches you.');
        c.cue('luggage-thud', { x: p.pos.x, y: 0.3, z: p.pos.z }, '[the boards heave under you]', { severity: 'danger' });
        c.sound.emit({ x: p.pos.x, y: 0.4, z: p.pos.z, intensity: 0.7, category: 'impact', caption: '[heaved]', source: this.id });
      }
    }

    if (f >= this.span) {
      this.front = -1;
      this.waveAt = c.now + 4.6 + this.rng.float() * 1.4;
      if (this.swell) this.swell.visible = false;
    }
  }

  override threatPos(): Vec3 | null {
    if (this.state !== 'engage' || this.front < 0) return null;
    return this.frontPos(v3(), this.front);
  }

  protected override onDone(): void {
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
    if (this.swell) { this.ctx.removeEntityMesh(this.swell); this.swell = null; }
    if (this.pts) { this.ctx.removeEntityMesh(this.pts); this.pts = null; }
  }
}

/**
 * The Inspector (sprint 236) — a livery figure that methodically walks a
 * room testing every hiding spot: it tries each lid in turn. If yours is
 * next, bail out early or hold it shut through the grapple; it never
 * re-checks a spot, so the meta is to stay one spot behind it.
 */
export class Inspector extends Entity {
  private hostRoom = -1;
  private rng = new Rng(0);
  private checked = new Set<string>();
  private spotCount = 0;
  private pos = v3();
  private target: { exitPos: Vec3; id: string; spot: RoomInstance['hidingSpots'][number] } | null = null;
  private testing: RoomInstance['hidingSpots'][number] | null = null;
  private testT = 0;
  private grappling = false;
  private heldShut = 0;
  private required = 4;
  private jingleT = 0;
  private rattleT = 0;
  private shoveCd = 0;
  private expireT = 0;
  private rig: RiggedFigure | null = null;
  private figGroup: import('three').Group | null = null;
  private baseTiltX = 0;
  private noiseUnsub: (() => void) | null = null;
  private glanceCd = 0;

  constructor() { super('inspector', ENTITY_TUNING.inspector); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.hostRoom = room.index;
    this.rng = new Rng(c.seed + 31);
    this.expireT = c.now + 110;

    // Stand just inside the entry door.
    this.pos = v3(room.entryPos.x, 0, room.entryPos.z);
    const rig = riggedFigure('monkroose');
    const brass = MAT.brass();
    const g = rig?.group ?? tallFigure({
      height: 2.0, face: 'plate', body: MAT.darkOak(), eyes: 'amber',
      band: brass, bandY: 1.15,
    });
    this.figGroup = g as import('three').Group;
    // A ring of keys at its hip — its whole job.
    const ring = new THREE.Group();
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 14), brass);
    ring.add(hoop);
    for (let i = 0; i < 4; i++) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.09, 0.026), brass);
      const a = -0.9 + i * 0.6;
      key.position.set(Math.sin(a) * 0.07, -0.055 - (i % 2) * 0.02, Math.cos(a) * 0.07);
      key.rotation.z = (i - 1.5) * 0.12;
      ring.add(key);
    }
    ring.position.set(0.22, 1.05, 0.14);
    g.add(ring);
    g.position.copy(this.pos);
    c.addEntityMesh(g);
    if (rig) { this.rig = rig; rig.play('idle', 0); }
    this.baseTiltX = g.rotation.x;

    this.spotCount = room.hidingSpots.filter((s) => !s.trappedBy).length;
    c.cue('collector-rattle', this.pos, '[a ring of keys — it is checking the rooms]', { severity: 'warn' });
    c.sound.emit({ x: this.pos.x, y: 1.2, z: this.pos.z, intensity: 0.6, category: 'entity-cue', caption: '[keys]', source: this.id });
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    this.state = 'engage';
  }

  /** The eye at the crack: the kneel read like a noise to it — it glances
   *  up off whatever lid it holds, then walks its keys to the cover
   *  nearest YOUR door instead of whatever was next. The sighting
   *  endangers the spot closest to where you knelt. */
  override eyeTell(at: Vec3, leaf?: Vec3): void {
    const c = this.ctx;
    if (this.state !== 'engage' || this.expireT <= c.now) return;
    const room = c.rooms[c.currentRoomIndex];
    if (!room || room.index !== this.hostRoom) return;
    if (this.testing && this.testT > 1.2) this.testT = 1.2;
    const near = leaf ?? at;
    let best: RoomInstance['hidingSpots'][number] | null = null;
    let bestD = Infinity;
    for (const s of room.hidingSpots) {
      if (this.checked.has(s.id) || s.trappedBy) continue;
      const d = v3dist(near, s.exitPos);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best) {
      this.target = { exitPos: best.exitPos, id: best.id, spot: best };
      if (this.glanceCd <= c.now) {
        this.glanceCd = c.now + 8;
        c.cue('collector-rattle', this.pos, '[it glances up — the keys turn toward your door]', { severity: 'warn' });
      }
    }
  }

  /** A loud noise makes it cut the current lid test short — it glances up
   *  and moves to the next spot. Noise buys you seconds at the lid it is
   *  on, at the price of hurrying it toward yours. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'engage' || !this.testing || e.source) return;
    if (!noiseCanBeHeard(e)) return;
    if (!withinRouseRadius(e, this.pos.x, this.pos.z)) return;
    if (this.testT <= 1.2) return;
    this.testT = 1.2;
    if (this.glanceCd <= c.now) {
      this.glanceCd = c.now + 8;
      c.cue('collector-rattle', this.pos, '[it glances up — then back to the lid]', { severity: 'warn' });
    }
  }

  /** Interact presses while it has your lid — route from Game's exitHide. */
  struggle(): void {
    if (!this.grappling) return;
    this.heldShut++;
    this.rig?.play('attack', 0.05);
  }

  private nextSpot(room: RoomInstance): void {
    const c = this.ctx;
    // sprint 514 — it smells the take: a heavy load rings through the
    // lid. Once the take passes sixteen the keys skip straight to the
    // cover you're inside — the load betrays the spot, not the body.
    // sprint 518 — and it smells a parked take the same way: a stash
    // in a lid is take off your back but not out of the house. The
    // heaviest smell wins — your lid if you're carrying more, the
    // stash lid if the parked take outweighs you.
    const load = c.takeLoad?.() ?? 0;
    const hid = c.player.hiddenSpot;
    let smellSpot: RoomInstance['hidingSpots'][number] | null = null;
    let smellLoad = 0;
    if (load >= 16 && hid && !hid.trappedBy && !this.checked.has(hid.id)
      && room.hidingSpots.some((s) => s.id === hid.id)) {
      smellSpot = hid; smellLoad = load;
    }
    for (const s of room.hidingSpots) {
      if (this.checked.has(s.id) || s.trappedBy) continue;
      const st = c.stashLoad?.(s.id) ?? 0;
      if (st > smellLoad) { smellLoad = st; smellSpot = s; }
    }
    if (smellSpot && smellLoad >= 16) {
      this.target = { exitPos: smellSpot.exitPos, id: smellSpot.id, spot: smellSpot };
      if (!this.smelledTake) {
        this.smelledTake = true;
        c.cue('collector-rattle', this.pos, '[the keys stop — it smells the take]', { severity: 'warn' });
      }
      return;
    }
    let best: RoomInstance['hidingSpots'][number] | null = null;
    let bestD = Infinity;
    for (const s of room.hidingSpots) {
      if (this.checked.has(s.id) || s.trappedBy) continue;
      const d = v3dist(this.pos, s.exitPos);
      if (d < bestD) { bestD = d; best = s; }
    }
    this.target = best ? { exitPos: best.exitPos, id: best.id, spot: best } : null;
  }

  private smelledTake = false;

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    const room = c.rooms[c.currentRoomIndex];
    if (!room || room.index !== this.hostRoom) {
      c.cue('collector-rattle', this.pos, '[the keys fade down the corridor]', { severity: 'info' });
      this.done();
      return;
    }
    if (c.now > this.expireT) { this.done(); return; }
    if (this.shoveCd > 0) this.shoveCd -= dt;

    if (this.testing) {
      // Working the lid — rattle + shake; join grapple if the player is inside.
      this.testT -= dt;
      this.rattleT -= dt;
      if (this.rattleT <= 0) {
        this.rattleT = 0.42;
        c.sound.emit({ x: this.testing.exitPos.x, y: 1.1, z: this.testing.exitPos.z, intensity: 0.4, category: 'impact', caption: '', source: this.id });
      }
      if (this.figGroup) this.figGroup.rotation.x = this.baseTiltX + Math.sin(c.now * 26) * 0.03;
      if (!this.grappling && p.hiddenSpot === this.testing) {
        this.grappling = true;
        this.heldShut = 0;
        this.testing.trappedBy = 'inspector';
        c.cue('hide-creak', this.testing.exitPos, '[it has the lid — HOLD IT SHUT]', { severity: 'danger' });
      }
      if (this.testT <= 0) {
        const spot = this.testing;
        if (this.grappling && spot.trappedBy === 'inspector') {
          spot.trappedBy = undefined;
          if (this.heldShut >= this.required) {
            c.cue('hide-creak', spot.exitPos, '[it lets go — moves on]', { severity: 'info' });
          } else {
            p.exitHiding(c.now);
            c.damagePlayer(this.tuning.damage, 'inspector', 'It tests every lid — bail out before it reaches your spot, or hold it shut through the rattle.');
            c.cue('door-rattle', spot.exitPos, '[it pulls you out]', { severity: 'danger' });
          }
        }
        // sprint 518 — the lid test reads what's inside it: goods
        // parked in a lid the keys got to go to the count's locker —
        // the stash's one real peril, the price of parking the take.
        const seized = c.seizeStash?.(spot.id) ?? 0;
        if (seized > 0) {
          c.cue('collector-rattle', spot.exitPos,
            `[the keys read the lid — the count's hands take what it holds · ${seized} goods]`,
            { severity: 'warn' });
        }
        this.checked.add(spot.id);
        this.grappling = false;
        this.testing = null;
        this.target = null;
        if (this.figGroup) this.figGroup.rotation.x = this.baseTiltX;
        this.rig?.play('move');
        return;
      }
      return;
    }

    // All spots checked → it moves on.
    if (this.target === null) this.nextSpot(room);
    if (this.target === null) {
      if (this.checked.size >= this.spotCount) {
        c.cue('collector-rattle', this.pos, '[it moves on to the next room]', { severity: 'info' });
        this.done();
      } else {
        // Remaining spots are all trapped — nothing left to try.
        this.done();
      }
      return;
    }

    // Walk to the next unchecked spot.
    const tgt = this.target.exitPos;
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.42) {
      this.testing = this.target.spot;
      this.testT = 2.6;
      this.grappling = false;
      this.rig?.play('idle');
      c.cue('hide-creak', tgt, '[it tries the lid]', { severity: 'warn' });
      c.sound.emit({ x: tgt.x, y: 1.1, z: tgt.z, intensity: 0.5, category: 'impact', caption: '[rattle]', source: this.id });
      // Player already inside → grapple starts now.
      if (p.hiddenSpot === this.testing) {
        this.grappling = true;
        this.heldShut = 0;
        this.testing.trappedBy = 'inspector';
        c.cue('hide-creak', tgt, '[it has the lid — HOLD IT SHUT]', { severity: 'danger' });
      }
      return;
    }
    const speed = this.tuning.speed;
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
    if (this.figGroup) {
      this.figGroup.position.copy(this.pos);
      this.figGroup.rotation.y = Math.atan2(dx, dz);
    }
    this.rig?.play('move');
    this.rig?.update(dt);
    this.jingleT -= dt;
    if (this.jingleT <= 0) {
      this.jingleT = 1.15 + this.rng.float() * 0.5;
      c.sound.emit({ x: this.pos.x, y: 1.0, z: this.pos.z, intensity: 0.3, category: 'entity-cue', caption: '', source: this.id });
    }
    // Shoulder-check: standing in its path is answered with a shove.
    if (!p.dead && !p.hiddenSpot && v3dist(this.pos, p.pos) < 1.0 && this.shoveCd <= 0) {
      this.shoveCd = 4;
      c.damagePlayer(8, 'inspector', 'It will not be slowed — stay out of its way or stay out of sight.');
      c.cue('luggage-thud', this.pos, '[it shoulders past]', { severity: 'warn' });
    }
  this.bootSpill(this.pos);
  }

  override threatPos(): Vec3 | null {
    if (this.state !== 'engage') return null;
    return this.testing ? this.testing.exitPos : (this.target ? this.target.exitPos : this.pos);
  }

  protected override onDone(): void {
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
    if (this.testing && this.testing.trappedBy === 'inspector') this.testing.trappedBy = undefined;
    if (this.figGroup) { this.ctx.removeEntityMesh(this.figGroup); this.figGroup = null; }
    this.rig = null;
  }
}

/**
 * The Commissionaire (sprint 237) — a livery doorman that plants itself at
 * the room's far door and holds the way back: the moment you step in, the
 * door behind you is shut. It sweeps the room with a lantern gaze on a slow
 * arc; caught in the light it marches at you and throws you back toward the
 * entry. The only way through is to cross on its blind arc — or bait it off
 * its post and touch the exit leaf before it returns. It never leaves the
 * room, and it never unlocks what it holds.
 */
export class Commissionaire extends Entity {
  private hostRoom = -1;
  private pos = v3();            // live position
  private post = v3();           // the post it returns to
  private baseYaw = 0;           // post facing — exit toward entry
  private gazeYaw = 0;
  private sweepT = 0;
  private spotT = 0;
  private chasing = false;
  private lastSeen = v3();
  private chaseLose = 0;
  private shoveCd = 0;
  private rapT = 0;
  private expireT = 0;
  private returning = false;
  private sealedDoors: RoomInstance['doors'] = [];
  private rig: RiggedFigure | null = null;
  private figGroup: import('three').Group | null = null;
  private lampSwing: import('three').Group | null = null;
  private pinYaw: number | null = null;   // heard noise — the light holds there
  private pinUntil = 0;
  private pinCd = 0;
  private noiseUnsub: (() => void) | null = null;

  constructor() { super('commissionaire', ENTITY_TUNING.commissionaire); }

  protected override onSpawn(): void {
    const c = this.ctx;
    const room = c.rooms[c.currentRoomIndex];
    this.hostRoom = room.index;
    this.expireT = c.now + 150;

    const en = room.entryPos, ex = room.exitPos;
    this.baseYaw = Math.atan2(en.x - ex.x, en.z - ex.z);
    this.gazeYaw = this.baseYaw;
    // Post: just inside the exit leaf — you must pass IT to pass the door.
    this.post = v3(ex.x + Math.sin(this.baseYaw) * 1.0, 0, ex.z + Math.cos(this.baseYaw) * 1.0);
    this.pos = v3(this.post.x, 0, this.post.z);

    const rig = riggedFigure('monkroose');
    const brass = MAT.brass();
    const g = rig?.group ?? tallFigure({
      height: 1.95, face: 'mask', body: MAT.darkOak(), eyes: 'white',
      band: brass, bandY: 1.5,
    });
    this.figGroup = g as import('three').Group;
    // The lantern arm — a swinging group so the beam tracks its gaze.
    const swing = new THREE.Group();
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.11), brass);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.1, 0.075),
      new THREE.MeshStandardMaterial({ color: 0xffb35c, emissive: 0xff9a33, emissiveIntensity: 1.7 }),
    );
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 12), brass);
    handle.position.y = 0.11;
    swing.add(cage, glow, handle);
    swing.position.set(0.26, 1.02, 0.16);
    g.add(swing);
    this.lampSwing = swing;
    // The visible sweep — an additive wedge from the lantern along its gaze.
    const coneGeo = new THREE.ConeGeometry(2.1, 6.0, 18, 1, true);
    coneGeo.translate(0, -3.0, 0);       // apex at lantern, base 6m down
    coneGeo.rotateX(-Math.PI / 2);       // beam extends +Z
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xffc36b, transparent: true, opacity: 0.09,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    cone.position.set(0.26, 1.02, 0.16);
    g.add(cone);
    g.position.copy(this.pos);
    g.rotation.y = this.baseYaw;
    c.addEntityMesh(g);

    // Shut the way back: hold the entry leaf on both sides of the doorway.
    const prev = c.rooms[c.currentRoomIndex - 1];
    for (const r of [room, prev]) {
      if (!r) continue;
      for (const d of r.doors) {
        if (Math.hypot(d.pos.x - en.x, d.pos.z - en.z) < 0.9) {
          // sprint 438 — the gloved hand doesn't eat your work: a wired
          // leaf is worked free in one motion (the coil drops as loot),
          // a chocked one skids loose the way a kick drops it. Holds
          // spent, not vanished.
          if (d.heldBy === 'wired') {
            c.strainWire?.(d.pos.x, d.pos.z);
            c.strainWire?.(d.pos.x, d.pos.z);
          } else if (d.heldBy === 'wedge') {
            for (const r2 of c.rooms) {
              for (const d2 of r2.doors) {
                if (d2.heldBy === 'wedge' && v3dist(d2.pos, d.pos) < 0.7) d2.heldBy = undefined;
              }
            }
            c.wedgeKicked?.(d.pos, this.pos);
          }
          d.heldBy = 'commissionaire';
          this.sealedDoors.push(d);
        }
      }
    }
    c.cue('door-locked', this.pos, '[a gloved hand on the frame — the way back is shut]', { severity: 'warn' });
    this.rig = rig ?? null;
    this.rig?.play('idle', 0.1);
    this.noiseUnsub = c.sound.on((e) => this.hear(e));
    this.state = 'engage';
  }

  /** The eye at the crack: the lantern answers the kneel the way it
   *  answers a noise — the light locks on your leaf and holds longer
   *  than a thrown sound could buy it. While it watches the crack,
   *  the far arc stays blind. */
  override eyeTell(_at: Vec3, leaf?: Vec3): void {
    const c = this.ctx;
    if (this.state !== 'engage' || this.chasing || this.returning || !leaf) return;
    this.pinYaw = Math.atan2(leaf.x - this.pos.x, leaf.z - this.pos.z);
    this.pinUntil = c.now + 5;
    if (this.pinCd <= 0) {
      this.pinCd = 6;
      c.cue('floor-creak', this.pos, '[the light locks on the crack]', { severity: 'warn' });
    }
  }

  /** It never leaves its post for a noise — but the light turns to look,
   *  which pins the sweep and blinds the other side of the room. A thrown
   *  lure to one side opens the far arc for the crossing. */
  private hear(e: SoundEvent): void {
    const c = this.ctx;
    if (this.state !== 'engage' || this.chasing || this.returning) return;
    if (e.source || !noiseCanBeHeard(e)) return;
    if (!withinRouseRadius(e, this.pos.x, this.pos.z)) return;
    this.pinYaw = Math.atan2(e.x - this.pos.x, e.z - this.pos.z);
    this.pinUntil = c.now + 3.5;
    if (this.pinCd <= 0) {
      this.pinCd = 6;
      c.cue('floor-creak', this.pos, '[it holds the light on the noise]', { severity: 'warn' });
    }
  }

  private aimYaw(): number {
    if (this.pinYaw !== null && this.ctx.now < this.pinUntil) return this.pinYaw;
    this.pinYaw = null;
    return this.baseYaw + Math.sin(this.sweepT * 0.9) * 1.15;
  }

  /** Player inside the sweep: exposed, in range, inside the arc, in LOS. */
  private inGaze(): boolean {
    const c = this.ctx;
    const p = c.player;
    if (p.dead || p.hiddenSpot) return false;
    const d = v3dist(this.pos, p.pos);
    if (d > 8.5) return false;
    const toP = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let dyaw = toP - this.gazeYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    if (Math.abs(dyaw) > 0.62) return false;
    const room = c.rooms[this.hostRoom];
    const eye = v3(this.pos.x, 1.62, this.pos.z);
    const pe = v3();
    p.eyePos(pe);
    return hasLineOfSight(eye, pe, (room ? room.losBlockers : []).concat(shutLeafBlockers(c.rooms, this.pos, p.pos)));
  }

  /** Thrown back toward the sealed door — the price of the light. */
  private throwBack(): void {
    const c = this.ctx;
    const p = c.player;
    const room = c.rooms[this.hostRoom];
    const en = room.entryPos;
    const dx = en.x - p.pos.x, dz = en.z - p.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const shove = Math.min(2.6, len - 1.2); // stop short of the leaf itself
    if (shove > 0.1) {
      p.teleport(p.pos.x + (dx / len) * shove, 0, p.pos.z + (dz / len) * shove);
    }
    c.damagePlayer(this.tuning.damage, 'commissionaire',
      'It holds the doors — cross on the blind arc, or bait it off its post and run.');
    c.cue('husk-foot', this.pos, '[it throws you back to the door]', { severity: 'danger' });
    c.sound.emit({ x: p.pos.x, y: 1, z: p.pos.z, intensity: 0.9, category: 'impact', caption: '[thrown]', source: this.id });
    this.chasing = false;
    this.returning = true;
    this.spotT = 0;
    this.rig?.play('idle', 0.2);
  }

  protected override onUpdate(dt: number): void {
    const c = this.ctx;
    const p = c.player;
    this.rig?.update(dt);
    this.expireT -= dt;
    if (c.currentRoomIndex !== this.hostRoom || this.expireT <= 0 || p.dead) { this.done(); return; }

    const room = c.rooms[this.hostRoom];
    // Yield: the instant the exit leaf starts opening, the room is won.
    const next = c.rooms[this.hostRoom + 1];
    for (const r of [room, next]) {
      if (!r) continue;
      for (const d of r.doors) {
        if (d.opening && Math.hypot(d.pos.x - room.exitPos.x, d.pos.z - room.exitPos.z) < 0.9) {
          c.cue('sweep-return', this.pos, '[it stands aside — this once]', { severity: 'info' });
          this.done();
          return;
        }
      }
    }

    this.rapT -= dt;
    if (this.rapT <= 0) {
      this.rapT = 4.2;
      c.sound.emit({ x: this.pos.x, y: 1.4, z: this.pos.z, intensity: 0.45, category: 'entity-cue', caption: '[a gloved hand raps the frame]', source: this.id });
    }
    this.shoveCd -= dt;

    const d = v3dist(this.pos, p.pos);
    if (this.chasing) {
      // Track live while it still sees you; else run the last-seen and turn back.
      if (!p.dead && !p.hiddenSpot) {
        const room2 = c.rooms[this.hostRoom];
        const eye = v3(this.pos.x, 1.62, this.pos.z);
        const pe = v3();
        p.eyePos(pe);
        if (hasLineOfSight(eye, pe, (room2 ? room2.losBlockers : []).concat(shutLeafBlockers(c.rooms, this.pos, p.pos)))) {
          v3copy(this.lastSeen, p.pos);
          this.chaseLose = 0;
        } else this.chaseLose += dt;
      } else this.chaseLose += dt;
      const dx = this.lastSeen.x - this.pos.x, dz = this.lastSeen.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.02) {
        const step = Math.min(len, 2.7 * dt);
        this.pos.x += (dx / len) * step;
        this.pos.z += (dz / len) * step;
        this.gazeYaw = Math.atan2(dx, dz);
      }
      if (d < 1.15 && !p.dead) { this.throwBack(); }
      else if (this.chaseLose > 1.8 || (len < 0.2 && this.chaseLose > 0.5)) {
        this.chasing = false;
        this.returning = true;
        this.rig?.play('move', 0.2);
      }
    } else if (this.returning) {
      const dx = this.post.x - this.pos.x, dz = this.post.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.12) {
        this.returning = false;
        this.gazeYaw = this.baseYaw;
        this.rig?.play('idle', 0.2);
      } else {
        const step = Math.min(len, 1.9 * dt);
        this.pos.x += (dx / len) * step;
        this.pos.z += (dz / len) * step;
        this.gazeYaw = Math.atan2(dx, dz);
      }
    } else {
      // On post: sweep the room on a slow blind arc — unless a heard noise
      // has pinned the light. Touching it is being seen.
      this.sweepT += dt;
      this.pinCd -= dt;
      this.gazeYaw = this.aimYaw();
      if (this.inGaze() || (d < 1.3 && !p.hiddenSpot && !p.dead)) {
        this.spotT += dt;
        if (this.spotT > 0.45) {
          this.chasing = true;
          this.chaseLose = 0;
          v3copy(this.lastSeen, p.pos);
          c.cue('alarm-ring', this.pos, '[the lantern finds you]', { severity: 'danger' });
          c.sound.emit({ x: this.pos.x, y: 1.6, z: this.pos.z, intensity: 0.9, category: 'entity-cue', caption: '[lantern cry]', source: this.id });
          this.rig?.play('move', 0.05);
        }
      } else this.spotT = Math.max(0, this.spotT - dt * 1.6);
      if (d < 1.0 && this.shoveCd <= 0) {
        this.shoveCd = 4;
        c.damagePlayer(8, 'commissionaire', 'It holds the doors — cross on the blind arc, or bait it off its post and run.');
        c.cue('husk-foot', this.pos, '[it elbows you away from the post]', { severity: 'warn' });
      }
    }

    if (this.figGroup) {
      this.figGroup.position.set(this.pos.x, 0, this.pos.z);
      this.figGroup.rotation.y = this.chasing
        ? this.gazeYaw
        : this.returning ? this.gazeYaw : this.aimYaw();
      // The lantern arm swings gently while it sweeps, sharp when it runs.
      if (this.lampSwing) this.lampSwing.rotation.x = Math.sin(c.now * (this.chasing ? 9 : 1.8)) * (this.chasing ? 0.3 : 0.12);
    }
  this.bootSpill(this.pos);
  }

  override threatPos(): Vec3 | null {
    if (this.state !== 'engage') return null;
    return this.chasing ? this.lastSeen : this.pos;
  }

  protected override onDone(): void {
    if (this.noiseUnsub) { this.noiseUnsub(); this.noiseUnsub = null; }
    for (const d of this.sealedDoors) d.heldBy = undefined;
    this.sealedDoors = [];
    if (this.figGroup) { this.ctx.removeEntityMesh(this.figGroup); this.figGroup = null; }
    this.lampSwing = null;
    this.rig = null;
  }
}
