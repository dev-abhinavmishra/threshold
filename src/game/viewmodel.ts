/**
 * First-person held-item viewmodel — the active inventory slot rendered
 * low-right in frame, gripped by a gloved hand, swaying with look and
 * bobbing with stride. Beats a floating beam at the eye: the lamp reads as
 * something carried, and every other slot item gets a physical presence.
 *
 * Placement mirrors the old heldTorch pattern: a world-space group
 * re-anchored to the camera basis each frame, item transform applied in
 * camera-local space (rotated offsets, not camera children — the camera is
 * not in the scene).
 */
import * as THREE from 'three';
import { MAT } from '../world/materials';
import { modelInstance } from '../world/modelLibrary';
import type { Vec3 } from '../engine/math';

export type HeldMotion = 'toggle' | 'drink' | 'jab' | 'crank' | 'key';

/** Per-item held pose: offsets from the anchor point (camera-local metres),
 *  euler rotation, uniform scale, and which grip the hand takes. */
interface HeldPose {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: number;
  grip: 'fist' | 'palm';
}

const POSES: Record<string, HeldPose> = {
  handLamp: { pos: [0.24, -0.19, 0.38], rot: [-0.06, -0.08, 0], scale: 1, grip: 'fist' },
  pulseLamp: { pos: [0.26, -0.26, 0.42], rot: [0, -0.15, 0], scale: 0.62, grip: 'fist' },
  sparkFlash: { pos: [0.22, -0.17, 0.34], rot: [-0.15, -0.1, 0.1], scale: 1.7, grip: 'fist' },
  tonic: { pos: [0.23, -0.18, 0.35], rot: [-0.2, 0, -0.12], scale: 1, grip: 'fist' },
  bandage: { pos: [0.23, -0.17, 0.34], rot: [0.1, 0.3, 0], scale: 1, grip: 'palm' },
  latchpick: { pos: [0.24, -0.17, 0.34], rot: [-0.1, -0.5, 0.15], scale: 1, grip: 'fist' },
  feltWrap: { pos: [0.23, -0.18, 0.34], rot: [0.15, 0, 0.1], scale: 1, grip: 'palm' },
  resonanceKey: { pos: [0.24, -0.16, 0.33], rot: [0.15, -0.4, 0.6], scale: 1, grip: 'fist' },
  chalkSpool: { pos: [0.23, -0.17, 0.33], rot: [0.3, 0.2, 0.2], scale: 1, grip: 'fist' },
  wardSeal: { pos: [0.22, -0.16, 0.32], rot: [0.4, 0.1, 0.05], scale: 1, grip: 'palm' },
  palimpsest: { pos: [0.2, -0.15, 0.33], rot: [0.5, -0.05, 0], scale: 1, grip: 'palm' },
  doorKey: { pos: [0.24, -0.16, 0.33], rot: [0.15, -0.35, 0.5], scale: 1, grip: 'fist' },
  windAlarm: { pos: [0.23, -0.17, 0.34], rot: [-0.2, 0.4, 0], scale: 1.5, grip: 'palm' },
};

const MOTION_FOR: Record<string, HeldMotion> = {
  handLamp: 'toggle', pulseLamp: 'crank', sparkFlash: 'jab', tonic: 'drink',
  bandage: 'jab', latchpick: 'key', feltWrap: 'jab', resonanceKey: 'key',
  chalkSpool: 'jab', wardSeal: 'jab', palimpsest: 'jab', doorKey: 'key',
  windAlarm: 'jab',
};

const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3d2f22, roughness: 0.92, metalness: 0.02 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x23211e, roughness: 1 });
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x54402c, roughness: 0.8, metalness: 0.05 });
const corkMat = new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.95 });
const tonicGlassMat = new THREE.MeshStandardMaterial({ color: 0x2d3d33, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
const tonicFluidMat = new THREE.MeshStandardMaterial({ color: 0x6a4a1e, roughness: 0.5, emissive: 0x3a2a10, emissiveIntensity: 0.3 });
const chalkMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d6, roughness: 1 });
const sealMat = new THREE.MeshStandardMaterial({ color: 0x7a1e1a, roughness: 0.55 });
const gemMat = new THREE.MeshStandardMaterial({ color: 0xcf9a3a, emissive: 0xa06a20, emissiveIntensity: 0.7, roughness: 0.3 });
const pickMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, metalness: 0.7, roughness: 0.4 });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** The hand each item sits in — forearm wedge entering frame bottom-right,
 *  glove palm under the grip. 'fist' curls finger capsules over a held grip
 *  line; 'palm' opens flat under flat items (pages, seals, bandage). */
function buildHand(grip: 'fist' | 'palm'): THREE.Group {
  const g = new THREE.Group();
  // forearm — a tapered sleeve entering from frame edge
  const sleeve = mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.34, 10), sleeveMat);
  sleeve.position.set(0.055, -0.24, 0.1);
  sleeve.rotation.set(0.9, 0, -0.5);
  // cuff flare
  const cuff = mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.05, 10), gloveMat);
  cuff.position.set(0.022, -0.095, 0.028);
  cuff.rotation.copy(sleeve.rotation);
  // wrist
  const wrist = mesh(new THREE.CapsuleGeometry(0.032, 0.045, 4, 8), gloveMat);
  wrist.position.set(0.012, -0.055, 0.005);
  wrist.rotation.set(1.15, 0, -0.35);
  g.add(sleeve, cuff, wrist);
  if (grip === 'fist') {
    const palm = mesh(new THREE.SphereGeometry(0.042, 10, 8), gloveMat);
    palm.scale.set(0.85, 1.15, 0.9);
    palm.position.set(-0.005, -0.01, -0.005);
    g.add(palm);
    // three curled fingers over the grip line + a thumb hooking around
    for (let i = 0; i < 3; i++) {
      const f = mesh(new THREE.CapsuleGeometry(0.011, 0.05, 3, 6), gloveMat);
      f.position.set(-0.028 - i * 0.002, 0.008 + i * 0.013, -0.028);
      f.rotation.set(1.5, 0.15, -0.5);
      g.add(f);
    }
    const thumb = mesh(new THREE.CapsuleGeometry(0.012, 0.045, 3, 6), gloveMat);
    thumb.position.set(0.03, -0.005, -0.02);
    thumb.rotation.set(0.6, 0, 0.5);
    g.add(thumb);
  } else {
    const palm = mesh(new THREE.SphereGeometry(0.045, 10, 8), gloveMat);
    palm.scale.set(1.0, 0.55, 1.25);
    palm.position.set(-0.005, -0.03, -0.015);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = mesh(new THREE.CapsuleGeometry(0.01, 0.055, 3, 6), gloveMat);
      f.position.set(-0.032 + i * 0.021, -0.012, -0.062);
      f.rotation.set(1.35, 0, 0.05);
      g.add(f);
    }
    const thumb = mesh(new THREE.CapsuleGeometry(0.011, 0.05, 3, 6), gloveMat);
    thumb.position.set(0.045, -0.018, -0.03);
    thumb.rotation.set(1.1, 0.4, -0.5);
    g.add(thumb);
  }
  return g;
}

function buildKey(ornate: boolean): THREE.Group {
  const g = new THREE.Group();
  const bow = mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16), ornate ? MAT.brassBright() : MAT.brass(), 0, 0.055, 0);
  const shaft = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 8), ornate ? MAT.brassBright() : MAT.brass(), 0, -0.015, 0);
  const collar = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8), MAT.brass(), 0, 0.022, 0);
  const bit1 = mesh(new THREE.BoxGeometry(0.02, 0.014, 0.006), MAT.brass(), 0.011, -0.052, 0);
  g.add(bow, shaft, collar, bit1);
  if (ornate) {
    const bit2 = mesh(new THREE.BoxGeometry(0.016, 0.01, 0.006), MAT.brass(), 0.009, -0.038, 0);
    const gem = mesh(new THREE.SphereGeometry(0.009, 8, 6), gemMat, 0, 0.055, 0);
    g.add(bit2, gem);
  }
  return g;
}

/** Build the held mesh for an item id — vendored model where one reads
 *  right at hand scale, procedural otherwise. Returns null while a model
 *  is still loading (caller retries). */
/** Scale/orient/center a vendored model for the low-right held pose.
 *  spec.height scales by Y, which over-inflates props authored lying
 *  flat — rescale by longest axis (~0.26 m) and point it forward. */
function fitHeld(m: THREE.Object3D): void {
  const bb0 = new THREE.Box3().setFromObject(m);
  const s0 = bb0.getSize(new THREE.Vector3());
  if (s0.x >= s0.y && s0.x >= s0.z) m.rotation.y = Math.PI / 2;
  else if (s0.y >= s0.z) m.rotation.x = Math.PI / 2;
  const bb = new THREE.Box3().setFromObject(m);
  const size = bb.getSize(new THREE.Vector3());
  m.scale.multiplyScalar(0.26 / (Math.max(size.x, size.y, size.z) || 1));
  bb.setFromObject(m);
  m.position.sub(bb.getCenter(new THREE.Vector3()));
}

/** Ids whose item has a GLB model — the procedural stand-in upgrades to
 *  the real model once the fetch queue lands it (checked in update). */
const UPGRADEABLE = new Set(['handLamp', 'pulseLamp', 'windAlarm']);

function buildItem(id: string): THREE.Group | null {
  const g = new THREE.Group();
  switch (id) {
    case 'handLamp': {
      const m = modelInstance('flashlight', 0.35);
      if (m) { fitHeld(m); g.add(m); }
      else {
        // procedural stand-in until the GLB lands — steel tube + bezel
        g.userData.vmFallback = true;
        const body = mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.22, 12), MAT.steel(), 0, 0, 0);
        body.rotation.x = Math.PI / 2;
        const bezel = mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.05, 12), MAT.steelDark(), 0, 0, -0.125);
        bezel.rotation.x = Math.PI / 2;
        const ring = mesh(new THREE.TorusGeometry(0.01, 0.004, 6, 12), MAT.steelDark(), 0, 0, 0.11);
        g.add(body, bezel, ring);
      }
      // lit lens — an emissive cap on the head while the beam is on
      const lens = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.008, 12), MAT.amber(), 0, 0.02, -0.115);
      lens.rotation.x = Math.PI / 2;
      lens.name = 'vm-lens';
      g.add(lens);
      return g;
    }
    case 'pulseLamp': {
      const m = modelInstance('lamp', 0.3);
      if (m) { fitHeld(m); g.add(m); }
      else {
        // procedural stand-in — caged oil lamp on a base
        g.userData.vmFallback = true;
        const base = mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.03, 12), MAT.brass(), 0, 0.015, 0);
        const tank = mesh(new THREE.SphereGeometry(0.045, 12, 10), MAT.brass(), 0, 0.06, 0);
        tank.scale.y = 0.75;
        const chimney = mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.12, 10), MAT.glassDusty(), 0, 0.14, 0);
        const cap = mesh(new THREE.ConeGeometry(0.045, 0.05, 10), MAT.brass(), 0, 0.22, 0);
        const handle = mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 14, Math.PI), MAT.brass(), 0, 0.24, 0);
        g.add(base, tank, chimney, cap, handle);
      }
      // crank arm bolted to the side — spins on the crank motion
      const crank = new THREE.Group();
      const arm = mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), MAT.steelDark(), 0, -0.022, 0);
      const knob = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.02, 8), corkMat, 0, -0.05, 0.012);
      knob.rotation.x = Math.PI / 2;
      crank.add(arm, knob);
      crank.position.set(0.09, 0.2, 0);
      crank.name = 'vm-crank';
      g.add(crank);
      return g;
    }
    case 'sparkFlash': {
      const m = modelInstance('lighter', 0.2);
      if (m) { g.add(m); return g; }
      // fallback: short flare stick
      const body = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 10), MAT.paperOld(), 0, 0.03, 0);
      const cap = mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.03, 8), pickMat, 0, 0.1, 0);
      g.add(body, cap);
      return g;
    }
    case 'tonic': {
      const pts: THREE.Vector2[] = [];
      for (const [r, y] of [[0.001, 0], [0.028, 0.01], [0.034, 0.04], [0.02, 0.075], [0.014, 0.09], [0.014, 0.105], [0.001, 0.108]] as const)
        pts.push(new THREE.Vector2(r, y));
      const vial = mesh(new THREE.LatheGeometry(pts, 14), tonicGlassMat);
      const fluid = mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.035, 12), tonicFluidMat, 0, 0.038, 0);
      const cork = mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.02, 8), corkMat, 0, 0.105, 0);
      const tag = mesh(new THREE.BoxGeometry(0.02, 0.014, 0.002), MAT.paperOld(), 0.02, 0.07, 0.012);
      tag.rotation.z = -0.4;
      g.add(vial, fluid, cork, tag);
      return g;
    }
    case 'bandage': {
      const roll = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.045, 14), MAT.paperOld(), 0, 0.035, 0);
      const core = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), MAT.charcoal(), 0, 0.035, 0);
      const strip = mesh(new THREE.BoxGeometry(0.055, 0.002, 0.09), MAT.paperOld(), 0.03, 0.012, 0.03);
      strip.rotation.y = 0.5;
      strip.rotation.z = -0.15;
      g.add(roll, core, strip);
      return g;
    }
    case 'latchpick': {
      for (let i = 0; i < 3; i++) {
        const pick = mesh(new THREE.BoxGeometry(0.004, 0.002, 0.12), pickMat);
        pick.position.set(-0.01 + i * 0.01, 0.01, -0.04);
        pick.rotation.y = -0.25 + i * 0.25;
        pick.rotation.x = -0.1;
        const tip = mesh(new THREE.BoxGeometry(0.003, 0.003, 0.016), pickMat);
        tip.position.set(-0.01 + i * 0.01 - (i - 1) * 0.02, 0.016, -0.1);
        g.add(pick, tip);
      }
      const wrench = mesh(new THREE.BoxGeometry(0.005, 0.002, 0.1), pickMat, 0.025, 0.008, -0.03);
      wrench.rotation.y = 0.9;
      g.add(wrench);
      return g;
    }
    case 'feltWrap': {
      const bundle = mesh(new THREE.SphereGeometry(0.05, 12, 10), MAT.creatureFabric(), 0, 0.04, 0);
      bundle.scale.set(1, 0.75, 1);
      const seam = mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 14), leatherMat, 0, 0.04, 0);
      seam.rotation.x = Math.PI / 2 - 0.3;
      g.add(bundle, seam);
      return g;
    }
    case 'resonanceKey': return buildKey(true);
    case 'doorKey': return buildKey(false);
    case 'chalkSpool': {
      const spool = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.035, 10), MAT.darkOak(), 0, 0.03, 0);
      const rim1 = mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.006, 10), MAT.darkOak(), 0, 0.011, 0);
      const rim2 = mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.006, 10), MAT.darkOak(), 0, 0.049, 0);
      const chalk = mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.06, 8), chalkMat, 0.032, 0.03, 0);
      chalk.rotation.z = -0.25;
      g.add(spool, rim1, rim2, chalk);
      return g;
    }
    case 'wardSeal': {
      const strip = mesh(new THREE.BoxGeometry(0.045, 0.002, 0.16), MAT.paperOld(), 0, 0.01, -0.02);
      strip.rotation.x = 0.08;
      const wax = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.008, 10), sealMat, 0, 0.015, -0.075);
      const inkLine = mesh(new THREE.BoxGeometry(0.03, 0.0022, 0.05), MAT.ink(), 0, 0.012, 0.01);
      g.add(strip, wax, inkLine);
      return g;
    }
    case 'palimpsest': {
      const page = mesh(new THREE.BoxGeometry(0.075, 0.002, 0.11), MAT.paperOld(), 0, 0.012, -0.01);
      page.rotation.y = 0.06;
      const line1 = mesh(new THREE.BoxGeometry(0.05, 0.0022, 0.004), MAT.ink(), 0, 0.013, 0.02);
      const line2 = mesh(new THREE.BoxGeometry(0.058, 0.0022, 0.004), MAT.ink(), 0.004, 0.013, -0.005);
      const line3 = mesh(new THREE.BoxGeometry(0.04, 0.0022, 0.004), MAT.ink(), -0.006, 0.013, -0.03);
      g.add(page, line1, line2, line3);
      return g;
    }
    case 'windAlarm': {
      const m = modelInstance('pocketWatch', 0.2);
      if (m) { fitHeld(m); g.add(m); return g; }
      // procedural stand-in — watch case + wind key
      g.userData.vmFallback = true;
      const face = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), MAT.brass(), 0, 0.03, 0);
      face.rotation.x = Math.PI / 2;
      const dial = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.013, 14), MAT.paperOld(), 0, 0.03, -0.001);
      dial.rotation.x = Math.PI / 2;
      const wkey = mesh(new THREE.BoxGeometry(0.008, 0.024, 0.006), MAT.brassBright(), 0, 0.075, 0);
      g.add(face, dial, wkey);
      return g;
    }
    default:
      return null;
  }
}

export class HeldView {
  /** World-space anchor — repositioned to the camera each frame. */
  readonly group = new THREE.Group();
  private sway = new THREE.Group();
  private equip = new THREE.Group();
  private item = new THREE.Group();
  private handSlot = new THREE.Group();

  private shownId: string | null = null;
  private itemId: string | null = null; // actual built item (may lag behind shownId while loading)
  private raiseT = 1;
  private useT = 0;
  private useMotion: HeldMotion = 'toggle';
  private bobPhase = 0;
  private prevYaw = 0;
  private prevPitch = 0;
  private lagYaw = 0;
  private lagPitch = 0;
  private crankSpin = 0;
  private thrustT = 0;
  private beamOn = false;

  constructor(scene: THREE.Scene) {
    this.equip.add(this.item);
    this.equip.add(this.handSlot);
    this.sway.add(this.equip);
    this.group.add(this.sway);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** World-space position of the item's tip — where beams/glows anchor. */
  tipWorld(out: Vec3): Vec3 {
    this.item.updateWorldMatrix(true, false);
    const v = HeldView.tip.set(0, 0.05, -0.14).applyMatrix4(this.item.matrixWorld);
    out.x = v.x; out.y = v.y; out.z = v.z;
    return out;
  }

  /** Play a use motion for the given item (slot activation). */
  use(itemId: string): void {
    this.useMotion = MOTION_FOR[itemId] ?? 'jab';
    this.useT = 1;
    if (this.useMotion === 'crank') this.crankSpin = Math.PI * 6;
  }

  /** Short lunge toward whatever is being reached for (interact). */
  thrust(): void {
    this.thrustT = 1;
  }

  update(
    dt: number, camera: THREE.Camera, eye: Vec3,
    o: {
      /** Item to hold now — the active slot; falls back to the lit lamp. */
      itemId: string | null;
      lampOn: boolean;
      pulseLampOn: boolean;
      speed: number;
      crouching: boolean;
      reducedMotion: boolean;
      hidden: boolean;
      yaw: number;
      pitch: number;
    },
  ): void {
    // The lamp is physically in hand while its beam is lit — override a
    // non-lamp selection so the light has a source; an empty hand shows.
    const beamItem = o.pulseLampOn ? 'pulseLamp' : o.lampOn ? 'handLamp' : null;
    const want = beamItem ?? o.itemId;
    this.beamOn = beamItem !== null;
    if (want !== this.shownId) {
      this.shownId = want;
      this.raiseT = 0;
      this.itemId = null;
      this.item.clear();
      this.handSlot.clear();
    }
    // (re)build until the model path yields a mesh
    if (want && !this.itemId) {
      const built = buildItem(want);
      if (built) {
        const pose = POSES[want];
        this.itemId = want;
        if (pose) {
          built.scale.setScalar(pose.scale);
          built.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
        }
        this.item.add(built);
        this.handSlot.add(buildHand(pose?.grip ?? 'fist'));
      }
    }
    // The GLTF queue drip-feeds at boot — upgrade the procedural stand-in
    // to the real model once it arrives.
    if (this.itemId && UPGRADEABLE.has(this.itemId) && this.item.children[0]?.userData.vmFallback) {
      const rebuilt = buildItem(this.itemId);
      if (rebuilt && !rebuilt.userData.vmFallback) {
        const pose = POSES[this.itemId];
        this.item.clear();
        if (pose) {
          rebuilt.scale.setScalar(pose.scale);
          rebuilt.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
        }
        this.item.add(rebuilt);
      }
    }

    // Anchor first even when hidden — tipWorld() (beam source) must stay
    // camera-relative or a lit beam would hang at a stale world position.
    const fwd = HeldView.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = HeldView.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = HeldView.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const anchorPose = POSES[this.itemId ?? ''] ?? { pos: [0.24, -0.18, 0.36] as [number, number, number] };
    this.group.position.set(eye.x, eye.y, eye.z)
      .addScaledVector(right, anchorPose.pos[0])
      .addScaledVector(up, anchorPose.pos[1])
      .addScaledVector(fwd, anchorPose.pos[2]);
    this.group.quaternion.copy(camera.quaternion);

    if (!this.itemId || o.hidden) {
      this.group.visible = false;
      this.prevYaw = o.yaw;
      this.prevPitch = o.pitch;
      return;
    }
    this.group.visible = true;

    // Look-lag sway — the item trails view rotation.
    const dyaw = angleDelta(o.yaw, this.prevYaw);
    const dpitch = angleDelta(o.pitch, this.prevPitch);
    this.prevYaw = o.yaw;
    this.prevPitch = o.pitch;
    const k = 1 - Math.exp(-dt * 11);
    this.lagYaw += (THREE.MathUtils.clamp(dyaw * 1.6, -0.16, 0.16) - this.lagYaw) * k;
    this.lagPitch += (THREE.MathUtils.clamp(dpitch * 1.4, -0.12, 0.12) - this.lagPitch) * k;

    // Walk bob — double-bounce per stride + idle breath.
    this.bobPhase += o.speed * dt * 1.55;
    const moving = o.speed > 0.15;
    const bobAmp = moving ? Math.min(0.016, 0.006 + o.speed * 0.0028) : 0;
    const bobY = moving ? Math.abs(Math.sin(this.bobPhase * 2)) * bobAmp : Math.sin(performance.now() * 0.0011) * 0.0035;
    const bobX = moving ? Math.sin(this.bobPhase) * bobAmp * 0.55 : 0;
    const crouchLift = o.crouching ? -0.03 : 0;

    if (o.reducedMotion) {
      this.sway.rotation.set(0, 0, 0);
      this.sway.position.set(0, 0, 0);
    } else {
      this.sway.rotation.set(this.lagPitch * 0.5 + bobY * 1.4, this.lagYaw, this.lagYaw * 0.6);
      this.sway.position.set(bobX - this.lagYaw * 0.09, bobY + crouchLift - this.lagPitch * 0.05, 0);
    }

    // Equip raise — drops in from below with a roll, settles fast.
    this.raiseT = Math.min(1, this.raiseT + dt / 0.32);
    const e = 1 - Math.pow(1 - this.raiseT, 3);
    this.equip.position.y = (1 - e) * -0.26;
    this.equip.rotation.z = (1 - e) * -0.5;
    this.equip.rotation.x = (1 - e) * 0.35;

    // Use motion — a short jab/tilt/crank per item.
    if (this.useT > 0) {
      this.useT = Math.max(0, this.useT - dt / (this.useMotion === 'drink' ? 0.9 : 0.5));
      const s = Math.sin(Math.PI * (1 - this.useT));
      switch (this.useMotion) {
        case 'jab': this.item.position.z = -0.1 * s; this.item.rotation.x = -0.25 * s; break;
        case 'key': this.item.position.z = -0.08 * s; this.item.rotation.z = 0.5 * s; break;
        case 'drink': this.item.position.y = 0.1 * s; this.item.position.z = -0.06 * s; this.item.rotation.x = -1.05 * s; break;
        case 'toggle': this.item.position.y = -0.03 * s; this.item.rotation.x = 0.12 * s; break;
        case 'crank': this.item.rotation.z = 0.08 * s; break;
      }
      if (this.useMotion === 'crank' && this.crankSpin > 0) {
        const crank = this.item.getObjectByName('vm-crank');
        if (crank) crank.rotation.x += dt * 14;
        this.crankSpin = Math.max(0, this.crankSpin - dt * 14);
      }
    } else {
      this.item.position.set(0, 0, 0);
      this.item.rotation.set(0, 0, 0);
    }

    // Interact lunge — reaching for a door/threshold nudges the item toward it.
    this.thrustT = Math.max(0, this.thrustT - dt / 0.32);
    if (this.thrustT > 0) {
      this.item.position.z -= 0.07 * Math.sin(Math.PI * (1 - this.thrustT));
    }

    // Lamp-on presentation: lens glow + beam-forward tilt.
    const lens = this.item.getObjectByName('vm-lens');
    if (lens) lens.visible = this.beamOn;
    if (this.beamOn && this.useT === 0) this.item.rotation.x = 0.05;
  }

  private static fwd = new THREE.Vector3();
  private static right = new THREE.Vector3();
  private static up = new THREE.Vector3();
  private static tip = new THREE.Vector3();
}

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
