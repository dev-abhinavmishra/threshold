/**
 * Shared procedural humanoid silhouette for entities — a robed hunched
 * figure: tapered cloak, over-long arms with hands, elongated head, and
 * optional porcelain mask / emissive eyes. Reads as a figure rather than
 * a slab at gameplay distance. `tickFigure` animates breathing sway.
 */
import * as THREE from 'three';
import { MAT } from '../world/materials';
import { modelInstance } from '../world/modelLibrary';

export interface FigureOpts {
  /** Total height in meters (proportions scale from a 2.6m baseline). */
  height?: number;
  face?: 'mask' | 'plate' | 'none';
  /** Body material — defaults to near-black shadow. */
  body?: THREE.Material;
  faceMat?: THREE.Material;
  /** Emissive band across the eye line (signature per entity). */
  band?: THREE.Material;
  bandY?: number;
  /** Floating emissive eyes, color-tinted. */
  eyes?: 'amber' | 'red' | 'white';
  /** Dorsal spine ridge — vertebra cones down the back. */
  spines?: boolean;
  /** Clawed hands — three finger cones per hand. */
  claws?: boolean;
  /** Ragged hem — torn strips hanging off the robe edge. */
  tattered?: boolean;
  /** Hooded drape behind the head. */
  hood?: boolean;
}

const EYE_COLORS = { amber: 0xffb050, red: 0xff2a20, white: 0xffe9b0 } as const;

export function tallFigure(o: FigureOpts = {}): THREE.Group {
  const h = o.height ?? 2.6;
  const s = h / 2.6;
  const body = o.body ?? MAT.figureCloth();
  const g = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};

  // legs, slightly splayed — thin cylinders, mostly hidden under the cloak
  for (const sx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 1.05 * s, 7), body);
    leg.position.set(sx * s, 0.52 * s, 0);
    leg.rotation.z = sx > 0 ? -0.05 : 0.05;
    g.add(leg);
  }
  // robe — open tapered cylinder from knees to shoulders; sells the
  // humanoid silhouette far better than a box.
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * s, 0.48 * s, 1.75 * s, 11, 1, true), body);
  robe.position.set(0, 1.15 * s, 0.02);
  robe.rotation.x = 0.04;
  g.add(robe);
  parts.robe = robe;
  // hunched torso core + shoulder block (keeps robe from collapsing visually)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * s, 0.3 * s, 0.95 * s, 8), body);
  torso.position.set(0, 1.55 * s, 0.02);
  torso.rotation.x = 0.07;
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.74 * s, 0.3 * s, 0.32 * s), body);
  shoulders.position.set(0, 2.0 * s, 0.04);
  shoulders.rotation.x = 0.06;
  g.add(torso, shoulders);
  parts.torso = torso;
  // arms — over-long cylinders hanging past the hips, hands at the ends
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.06 * s, 1.2 * s, 7), body);
    upper.position.y = -0.6 * s;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.22 * s, 0.1 * s), body);
    hand.position.y = -1.28 * s;
    arm.add(upper, hand);
    if (!o.claws) {
      // finger stubs fanned below the palm — reads as a hand, not a stub
      for (let fi = 0; fi < 3; fi++) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * s, 0.014 * s, 0.13 * s, 5), body);
        finger.position.set((fi - 1) * 0.03 * s, -1.44 * s, 0.01 + Math.abs(fi - 1) * 0.012);
        finger.rotation.x = 0.12 + (fi - 1) * 0.08;
        arm.add(finger);
      }
    }
    arm.position.set(sx * 0.44 * s, 2.02 * s, 0.05);
    arm.rotation.z = sx * -0.07;
    g.add(arm);
    parts[sx < 0 ? 'armL' : 'armR'] = arm;
  }
  // elongated head, tilted down — neck, brow ridge and jaw give it a
  // skull-like structure under the hood/shadow rather than a bare egg
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 0.3 * s, 7), body);
  neck.position.set(0, 2.16 * s, 0.05);
  neck.rotation.x = 0.12;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 10, 9), body);
  head.scale.set(0.8, 1.35, 0.75);
  head.position.set(0, 2.34 * s, 0.06);
  head.rotation.x = 0.1;
  g.add(head);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.045 * s, 0.05 * s), body);
  brow.position.set(0, 2.43 * s, 0.17 * s);
  brow.rotation.x = 0.28;
  g.add(brow);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.12 * s, 0.07 * s), body);
  jaw.position.set(0, 2.2 * s, 0.14 * s);
  jaw.rotation.x = 0.3;
  g.add(jaw);
  parts.head = head;

  if (o.tattered) {
    // Torn hem — irregular strips off the robe bottom rim so the cloak
    // reads as worn fabric rather than a clean cone edge.
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(i * 7.3) * 0.2;
      const len = (0.1 + Math.abs(Math.sin(i * 13.7)) * 0.16) * s;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, len, 0.015 * s), body);
      strip.position.set(Math.cos(a) * 0.42 * s, 0.3 * s - len / 2, Math.sin(a) * 0.42 * s + 0.02);
      strip.rotation.set(Math.sin(i * 5.1) * 0.15, -a, Math.cos(i * 3.7) * 0.12);
      g.add(strip);
    }
  }
  if (o.hood) {
    // Hood — a drooped drape behind and over the head.
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24 * s, 0.55 * s, 8, 1, true), body);
    hood.position.set(0, 2.42 * s, -0.05 * s);
    hood.rotation.x = -0.28;
    g.add(hood);
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 0.5 * s, 8, 1, true), body);
    drape.position.set(0, 2.16 * s, -0.08 * s);
    drape.rotation.x = 0.15;
    g.add(drape);
  }
  if (o.face === 'mask') {
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 12, 10), o.faceMat ?? MAT.paperOld());
    mask.scale.set(0.78, 1.05, 0.45);
    mask.position.set(0, 2.34 * s, 0.16 * s);
    g.add(mask);
    for (const ex of [-0.06, 0.06]) {
      const socket = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.08 * s, 0.02), MAT.ink());
      socket.position.set(ex * s, 2.38 * s, 0.29 * s);
      g.add(socket);
    }
    parts.mask = mask;
  } else if (o.face === 'plate') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.5 * s, 0.06 * s), MAT.darkOak());
    plate.position.set(0, 2.3 * s, 0.14 * s);
    g.add(plate);
    parts.mask = plate;
  }
  if (o.spines) {
    // Gnarled dead branches erupting from the back when the CC0 model is
    // loaded; vertebra cones otherwise.
    const branch = modelInstance('deadBranch', Math.random());
    if (branch) {
      for (let i = 0; i < 3; i++) {
        const b = branch.clone(true) as THREE.Group;
        b.scale.setScalar((0.55 + i * 0.12) * s);
        b.position.set((i - 1) * 0.1 * s, (1.35 + i * 0.3) * s, -0.18 * s);
        b.rotation.set(-0.85 - i * 0.2, (i - 1) * 0.6 + Math.PI, 0);
        g.add(b);
      }
    } else {
      const spineMat = o.body ?? body;
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.22 * s, 6), spineMat);
        const fy = (1.1 + i * 0.22) * s;
        sp.position.set(0, fy, -0.24 * s - Math.sin(i * 0.5) * 0.02);
        sp.rotation.x = -1.15;
        g.add(sp);
      }
    }
  }
  if (o.claws) {
    for (const sx of [-1, 1]) {
      for (let fi = 0; fi < 3; fi++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018 * s, 0.2 * s, 5), MAT.ink());
        claw.position.set(
          sx * (0.42 + fi * 0.035) * s,
          0.62 * s - fi * 0.01,
          0.06 + fi * 0.03,
        );
        claw.rotation.x = Math.PI - 0.15 + fi * 0.12;
        g.add(claw);
      }
    }
  }
  if (o.band) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.82 * s, 0.12 * s, 0.38 * s), o.band);
    band.position.set(0, (o.bandY ?? 2.36) * s, 0.06);
    g.add(band);
  }
  if (o.eyes) {
    const c = EYE_COLORS[o.eyes];
    const eyeMat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.6 });
    for (const ex of [-0.055, 0.055]) {
      // sunken socket behind each emissive eye — a hollow pit the glow
      // sits inside, so eyes read as set in a skull, not floating orbs
      if (o.face !== 'mask') {
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.042 * s, 8, 6), MAT.ink());
        socket.scale.set(1, 1.25, 0.6);
        socket.position.set(ex * s, 2.36 * s, 0.185 * s);
        g.add(socket);
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 8, 6), eyeMat);
      eye.position.set(ex * s, 2.36 * s, o.face === 'mask' ? 0.3 * s : 0.2 * s);
      g.add(eye);
    }
    parts.eyes = eyeMat as unknown as THREE.Object3D;
  }
  g.userData.figureParts = parts;
  g.userData.phase = Math.random() * 100;
  return g;
}

export interface StatueFigureOpts {
  height?: number;
  eyes?: 'amber' | 'red' | 'white';
  eyeY?: number;
}

/** The gothic-statue body (CC0 modelLibrary 'statue') used by the Witness:
 * a realistic sculpted figure, far better than the procedural silhouette.
 * Returns null while the model is unloaded — callers fall back to tallFigure. */
export function statueFigure(o: StatueFigureOpts = {}): THREE.Group | null {
  const body = modelInstance('statue', Math.random());
  if (!body) return null;
  const h = o.height ?? 2.3;
  body.scale.multiplyScalar(h / 1.8); // prop scale is 1.8m; Witness wants taller
  const g = new THREE.Group();
  g.add(body);
  const s = h / 2.3;
  if (o.eyes) {
    const c = EYE_COLORS[o.eyes];
    const eyeMat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.6 });
    for (const ex of [-0.055, 0.055]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 8, 6), eyeMat);
      eye.position.set(ex * s, (o.eyeY ?? 1.85) * s, 0.42 * s);
      g.add(eye);
    }
  }
  g.userData.statue = true;
  return g;
}

/** Per-frame idle animation — breathing sway, arm drift, eye pulse.
 *  Call once per entity mesh from the game's entity-anim pass. */
export function tickFigure(group: THREE.Object3D, t: number): void {
  const parts = group.userData.figureParts as Record<string, THREE.Object3D> | undefined;
  if (!parts) return;
  const ph = (group.userData.phase as number) ?? 0;
  const breath = Math.sin(t * 0.9 + ph) * 0.5 + 0.5; // 0..1 slow
  if (parts.robe) {
    parts.robe.rotation.x = 0.04 + Math.sin(t * 0.5 + ph) * 0.015;
    parts.robe.scale.y = 1 + breath * 0.012;
  }
  if (parts.torso) parts.torso.scale.y = 1 + breath * 0.02;
  if (parts.head) {
    parts.head.position.y += 0; // keep base
    parts.head.rotation.x = 0.1 + Math.sin(t * 0.6 + ph * 1.3) * 0.04;
    parts.head.rotation.z = Math.sin(t * 0.23 + ph * 0.7) * 0.05;
  }
  for (const k of ['armL', 'armR'] as const) {
    const arm = parts[k];
    if (arm) arm.rotation.x = Math.sin(t * 0.7 + ph + (k === 'armL' ? 0 : Math.PI * 0.6)) * 0.07;
  }
  const eyeMat = parts.eyes as unknown as THREE.MeshStandardMaterial | undefined;
  if (eyeMat && eyeMat.emissiveIntensity !== undefined) {
    // slow pulse with occasional flare
    const flare = Math.sin(t * 0.31 + ph) > 0.92 ? 1.8 : 0;
    eyeMat.emissiveIntensity = 2.2 + breath * 0.8 + flare;
  }
}
