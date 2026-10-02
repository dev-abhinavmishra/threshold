/**
 * Shared procedural humanoid silhouette for entities — hunched torso,
 * over-long arms, and an optional porcelain mask face. Reads as a figure
 * rather than a slab at gameplay distance.
 */
import * as THREE from 'three';
import { MAT } from '../world/materials';

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
}

export function tallFigure(o: FigureOpts = {}): THREE.Group {
  const h = o.height ?? 2.6;
  const s = h / 2.6;
  const body = o.body ?? MAT.shadowFigure();
  const g = new THREE.Group();
  // legs, slightly splayed
  for (const sx of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 1.0 * s, 0.18 * s), body);
    leg.position.set(sx * s, 0.5 * s, 0);
    leg.rotation.z = sx > 0 ? -0.04 : 0.04;
    g.add(leg);
  }
  // hunched torso + shoulder block
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 1.0 * s, 0.3 * s), body);
  torso.position.set(0, 1.5 * s, 0.02);
  torso.rotation.x = 0.06;
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.78 * s, 0.34 * s, 0.34 * s), body);
  shoulders.position.set(0, 1.98 * s, 0.04);
  g.add(torso, shoulders);
  // arms hanging past the hips
  for (const sx of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 1.15 * s, 0.12 * s), body);
    arm.position.set(sx * s, 1.45 * s, 0.05);
    arm.rotation.z = sx > 0 ? -0.06 : 0.06;
    g.add(arm);
  }
  // elongated head, tilted down
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.4 * s, 0.24 * s), body);
  head.position.set(0, 2.34 * s, 0.06);
  head.rotation.x = 0.1;
  g.add(head);
  if (o.face === 'mask') {
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 12, 10), o.faceMat ?? MAT.paperOld());
    mask.scale.set(0.78, 1.05, 0.45);
    mask.position.set(0, 2.34 * s, 0.16 * s);
    g.add(mask);
    for (const ex of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.08 * s, 0.02), MAT.ink());
      eye.position.set(ex * s, 2.38 * s, 0.29 * s);
      g.add(eye);
    }
  } else if (o.face === 'plate') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.5 * s, 0.06 * s), MAT.darkOak());
    plate.position.set(0, 2.3 * s, 0.14 * s);
    g.add(plate);
  }
  if (o.band) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.82 * s, 0.12 * s, 0.38 * s), o.band);
    band.position.set(0, (o.bandY ?? 2.36) * s, 0.06);
    g.add(band);
  }
  return g;
}
