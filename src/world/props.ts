/**
 * Procedural prop builders. Every mesh is generated code — no external models.
 * Each builder returns a THREE.Group in local prop space and contributes
 * collision boxes (local, relative to prop origin at floor level).
 */
import * as THREE from 'three';
import type { LocalCollider, PropSpec } from './spec';
import { MAT } from './materials';
import { modelInstance, modelCollider } from './modelLibrary';
import type { Rng } from '../engine/rng';

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Scale a BoxGeometry's per-face UVs so 1 uv unit = 1 meter on every face. */
export function uvFixBox(g: THREE.BoxGeometry, w: number, h: number, d: number): THREE.BoxGeometry {
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z — 4 verts each
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function box(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `b${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = geoCache.get(key) as THREE.BoxGeometry | undefined;
  if (!g) { g = uvFixBox(new THREE.BoxGeometry(w, h, d), w, h, d); geoCache.set(key, g); }
  return g;
}
function cyl(rT: number, rB: number, h: number, seg = 10): THREE.CylinderGeometry {
  const key = `c${rT},${rB},${h},${seg}`;
  let g = geoCache.get(key) as THREE.CylinderGeometry | undefined;
  if (!g) { g = new THREE.CylinderGeometry(rT, rB, h, seg); geoCache.set(key, g); }
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  return me;
}

export interface BuiltProp {
  group: THREE.Group;
  colliders: LocalCollider[];
}

type Builder = (spec: PropSpec, rng: Rng) => BuiltProp;

function single(group: THREE.Group, w: number, h: number, d: number, y = 0): BuiltProp {
  return { group, colliders: [{ x: 0, z: 0, y, w, d, h }] };
}

const builders: Partial<Record<PropSpec['kind'], Builder>> = {
  cabinet: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.1, 2.1, 0.62), MAT.darkOak(), 0, 1.05, 0));
    // open front — two doors slightly ajar
    g.add(mesh(box(0.5, 1.95, 0.05), MAT.oak(), -0.28, 1.03, 0.34));
    const door2 = mesh(box(0.5, 1.95, 0.05), MAT.oak(), 0.42, 1.03, 0.42);
    door2.rotation.y = -0.5;
    g.add(door2);
    return single(g, 1.15, 2.1, 0.7);
  },
  locker: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.9, 2.0, 0.55), MAT.steelDark(), 0, 1.0, 0));
    g.add(mesh(box(0.8, 1.85, 0.04), MAT.steel(), 0, 0.98, 0.29));
    g.add(mesh(box(0.08, 0.2, 0.05), MAT.brass(), 0.3, 1.0, 0.32));
    return single(g, 0.95, 2.0, 0.62);
  },
  desk: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.5, 0.06, 0.8), MAT.oak(), 0, 0.76, 0));
    g.add(mesh(box(0.5, 0.7, 0.7), MAT.darkOak(), -0.45, 0.37, 0));
    g.add(mesh(box(0.5, 0.7, 0.7), MAT.darkOak(), 0.45, 0.37, 0));
    return single(g, 1.55, 0.8, 0.85);
  },
  bed: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.0, 0.35, 2.0), MAT.darkOak(), 0, 0.25, 0));
    g.add(mesh(box(0.95, 0.12, 1.9), MAT.paperOld(), 0, 0.48, 0));
    g.add(mesh(box(0.95, 0.09, 0.5), MAT.paper(), 0, 0.56, -0.6));
    g.add(mesh(box(1.0, 0.9, 0.08), MAT.darkOak(), 0, 0.45, -1.0));
    return single(g, 1.05, 0.9, 2.05);
  },
  table: (s) => {
    const g = new THREE.Group();
    const r = (s.scale ?? 1);
    g.add(mesh(cyl(0.55 * r, 0.5 * r, 0.05), MAT.oak(), 0, 0.74, 0));
    g.add(mesh(cyl(0.06, 0.08, 0.72), MAT.darkOak(), 0, 0.37, 0));
    g.add(mesh(cyl(0.35, 0.4, 0.05), MAT.darkOak(), 0, 0.03, 0));
    return single(g, 1.1 * r, 0.8, 1.1 * r);
  },
  chair: (s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.45, 0.05, 0.45), MAT.oak(), 0, 0.45, 0));
    g.add(mesh(box(0.45, 0.5, 0.05), MAT.oak(), 0, 0.72, -0.2));
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const)
      g.add(mesh(box(0.05, 0.45, 0.05), MAT.darkOak(), x, 0.22, z));
    return single(g, 0.5, 1.0, 0.5 * (s.scale ?? 1));
  },
  crate: (s) => {
    const g = new THREE.Group();
    const sc = s.scale ?? 1;
    g.add(mesh(box(0.8 * sc, 0.8 * sc, 0.8 * sc), MAT.oak(), 0, 0.4 * sc, 0));
    g.add(mesh(box(0.82 * sc, 0.06, 0.1), MAT.darkOak(), 0, 0.4 * sc, 0.35 * sc));
    return single(g, 0.85 * sc, 0.85 * sc, 0.85 * sc);
  },
  shelf: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.8, 2.2, 0.4), MAT.darkOak(), 0, 1.1, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(box(1.7, 0.05, 0.36), MAT.oak(), 0, 0.35 + i * 0.5, 0.02));
    return single(g, 1.85, 2.2, 0.45);
  },
  bookshelf: (_s, rng) => {
    const g = new THREE.Group();
    g.add(mesh(box(2.0, 2.3, 0.42), MAT.darkOak(), 0, 1.15, 0));
    for (let i = 0; i < 5; i++) {
      const y = 0.28 + i * 0.44;
      g.add(mesh(box(1.9, 0.04, 0.38), MAT.oak(), 0, y, 0.02));
      // book rows — deterministic color/spacing variation
      let x = -0.85;
      while (x < 0.85) {
        const bw = 0.05 + rng.float() * 0.07;
        const bh = 0.24 + rng.float() * 0.12;
        const palette = [MAT.oxGreen(), MAT.charcoal(), MAT.paperOld(), MAT.steelDark(), MAT.carpet()];
        g.add(mesh(box(bw, bh, 0.28), rng.pick(palette), x + bw / 2, y + bh / 2 + 0.02, 0.04));
        x += bw + 0.01 + (rng.bool(0.12) ? 0.12 : 0);
      }
    }
    return single(g, 2.05, 2.3, 0.48);
  },
  filing: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.55, 1.3, 0.65), MAT.steel(), 0, 0.65, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(box(0.45, 0.24, 0.03), MAT.steelDark(), 0, 0.2 + i * 0.3, 0.33));
    return single(g, 0.6, 1.3, 0.7);
  },
  drawerUnit: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.8, 0.85, 0.5), MAT.oak(), 0, 0.42, 0));
    for (let i = 0; i < 3; i++) {
      g.add(mesh(box(0.7, 0.2, 0.03), MAT.darkOak(), 0, 0.17 + i * 0.25, 0.26));
      g.add(mesh(box(0.15, 0.03, 0.04), MAT.brass(), 0, 0.17 + i * 0.25, 0.28));
    }
    return single(g, 0.85, 0.85, 0.55);
  },
  vent: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.0, 0.7, 0.15), MAT.steelDark(), 0, 0.35, 0));
    for (let i = 0; i < 4; i++) g.add(mesh(box(0.9, 0.05, 0.04), MAT.charcoal(), 0, 0.12 + i * 0.15, 0.08));
    return single(g, 1.0, 0.7, 0.2);
  },
  sofa: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.6, 0.4, 0.7), MAT.oxGreen(), 0, 0.2, 0));
    g.add(mesh(box(1.6, 0.5, 0.2), MAT.oxGreen(), 0, 0.55, -0.25));
    g.add(mesh(box(0.2, 0.5, 0.7), MAT.oxGreen(), -0.7, 0.4, 0));
    g.add(mesh(box(0.2, 0.5, 0.7), MAT.oxGreen(), 0.7, 0.4, 0));
    return single(g, 1.65, 0.85, 0.75);
  },
  lamp: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.03, 0.16, 1.5), MAT.brass(), 0, 0.75, 0));
    g.add(mesh(cyl(0.22, 0.28, 0.3), MAT.paper(), 0, 1.6, 0));
    g.add(mesh(box(0.01, 0.06, 0.01), MAT.amberDim(), 0, 1.55, 0));
    return { group: g, colliders: [{ x: 0, z: 0, w: 0.3, d: 0.3, h: 1.8 }] };
  },
  wallSconce: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.1, 0.25, 0.12), MAT.brass(), 0, 0, 0));
    g.add(mesh(cyl(0.09, 0.12, 0.15), MAT.paper(), 0, 0.18, 0.02));
    return { group: g, colliders: [] };
  },
  painting: (_s, rng) => {
    const g = new THREE.Group();
    const w = 0.7 + rng.float() * 0.5;
    const h = 0.5 + rng.float() * 0.6;
    g.add(mesh(box(w, h, 0.05), MAT.darkOak(), 0, 0, 0));
    const art = rng.pick([MAT.oxGreen(), MAT.plasterDark(), MAT.steelDark(), MAT.charcoal()]);
    g.add(mesh(box(w - 0.1, h - 0.1, 0.02), art, 0, 0, 0.03));
    return { group: g, colliders: [] };
  },
  mirror: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.7, 1.4, 0.06), MAT.brass(), 0, 0, 0));
    g.add(mesh(box(0.6, 1.3, 0.02), MAT.glassDusty(), 0, 0, 0.035));
    return { group: g, colliders: [] };
  },
  window: (_s) => {
    // Cold night light through a 2×2 pane grid — pale emissive panes read
    // as moonlight without spending a real light.
    const g = new THREE.Group();
    g.add(mesh(box(1.2, 1.6, 0.1), MAT.darkOak(), 0, 0, 0));
    const paneMat = new THREE.MeshStandardMaterial({
      color: 0x0e1a26, emissive: 0x7d94ad, emissiveIntensity: 0.55,
      roughness: 0.15, metalness: 0.05,
    });
    paneMat.userData.decalMat = true;
    for (const px of [-0.27, 0.27]) {
      for (const py of [-0.37, 0.37]) {
        g.add(mesh(box(0.48, 0.68, 0.02), paneMat, px, py, 0.05));
      }
    }
    g.add(mesh(box(0.05, 1.45, 0.04), MAT.darkOak(), 0, 0, 0.07));
    g.add(mesh(box(1.05, 0.05, 0.04), MAT.darkOak(), 0, 0, 0.07));
    return { group: g, colliders: [] };
  },
  rug: (_s, rng) => {
    const w = 1.6 + rng.float();
    const d = 2.2 + rng.float();
    const g = new THREE.Group();
    g.add(mesh(box(w, 0.02, d), rng.bool() ? MAT.carpet() : MAT.carpetGreen(), 0, 0.01, 0));
    return { group: g, colliders: [] };
  },
  paperStack: (_s, rng) => {
    const g = new THREE.Group();
    const n = 2 + rng.int(0, 4);
    for (let i = 0; i < n; i++)
      g.add(mesh(box(0.3, 0.02 + rng.float() * 0.05, 0.4), rng.bool() ? MAT.paper() : MAT.paperOld(),
        (rng.float() - 0.5) * 0.1, 0.03 + i * 0.06, (rng.float() - 0.5) * 0.1));
    return { group: g, colliders: [] };
  },
  pipe: (s) => {
    const g = new THREE.Group();
    const len = s.scale ?? 3;
    const p = mesh(cyl(0.06, 0.06, len), MAT.steelDark(), 0, 0, 0);
    p.rotation.z = Math.PI / 2;
    g.add(p);
    return { group: g, colliders: [] };
  },
  rubble: (_s, rng) => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s2 = 0.15 + rng.float() * 0.3;
      const m2 = mesh(box(s2, s2 * 0.7, s2), rng.bool() ? MAT.plasterDark() : MAT.tile(),
        (rng.float() - 0.5) * 0.9, s2 * 0.35, (rng.float() - 0.5) * 0.9);
      m2.rotation.y = rng.float() * Math.PI;
      g.add(m2);
    }
    return { group: g, colliders: [{ x: 0, z: 0, w: 0.9, d: 0.9, h: 0.3, walkable: true }] };
  },
  plant: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.2, 0.15, 0.35), MAT.steelDark(), 0, 0.18, 0));
    for (let i = 0; i < 5; i++) {
      const leaf = mesh(box(0.06, 0.5, 0.02), MAT.oxGreen(), 0, 0.55, 0);
      leaf.rotation.y = (i / 5) * Math.PI * 2;
      leaf.rotation.x = 0.4;
      g.add(leaf);
    }
    return { group: g, colliders: [{ x: 0, z: 0, w: 0.35, d: 0.35, h: 0.6 }] };
  },
  curtain: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.4, 2.0, 0.06), MAT.carpet(), 0, 0, 0));
    return { group: g, colliders: [] };
  },
  sign: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.5, 0.3, 0.03), MAT.paperOld(), 0, 0, 0));
    g.add(mesh(box(0.4, 0.05, 0.01), MAT.ink(), 0, 0.04, 0.02));
    g.add(mesh(box(0.3, 0.04, 0.01), MAT.ink(), 0, -0.06, 0.02));
    return { group: g, colliders: [] };
  },
  pillar: (s) => {
    const g = new THREE.Group();
    const h = (s.meta?.height as number) || 3;
    g.add(mesh(box(0.5, h, 0.5), MAT.plasterDark(), 0, h / 2, 0));
    g.add(mesh(box(0.7, 0.15, 0.7), MAT.plaster(), 0, 0.08, 0));
    g.add(mesh(box(0.7, 0.15, 0.7), MAT.plaster(), 0, h - 0.08, 0));
    return single(g, 0.6, h, 0.6);
  },
  railing: (s) => {
    const g = new THREE.Group();
    const len = s.scale ?? 2;
    g.add(mesh(box(len, 0.06, 0.06), MAT.brass(), 0, 0.95, 0));
    const n = Math.max(2, Math.floor(len / 0.5));
    for (let i = 0; i <= n; i++) g.add(mesh(cyl(0.02, 0.02, 0.95), MAT.brass(), -len / 2 + (i / n) * len, 0.48, 0));
    return { group: g, colliders: [{ x: 0, z: 0, w: len, d: 0.12, h: 1.0 }] };
  },
  stairs: (s) => {
    const g = new THREE.Group();
    const steps = 6;
    const rise = ((s.meta?.height as number) || 1.4) / steps;
    const run = ((s.meta?.length as number) || 2.4) / steps;
    for (let i = 0; i < steps; i++)
      g.add(mesh(box(1.2, rise, run), MAT.plasterDark(), 0, rise * (i + 0.5), -((steps - i - 0.5) * run)));
    return { group: g, colliders: [{ x: 0, z: 0, w: 1.2, d: steps * run, h: 0.3, walkable: true }] };
  },
  partition: (s) => {
    const g = new THREE.Group();
    const w = s.scale ?? 1.8;
    g.add(mesh(box(w, 2.0, 0.08), MAT.plasterDark(), 0, 1.0, 0));
    return { group: g, colliders: [{ x: 0, z: 0, w, d: 0.1, h: 2.0, losOnly: true }] };
  },
  ceilingLamp: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.02, 0.02, 0.5), MAT.charcoal(), 0, 0.25, 0));
    g.add(mesh(cyl(0.2, 0.26, 0.18), MAT.brass(), 0, -0.05, 0));
    g.add(mesh(box(0.12, 0.1, 0.12), MAT.amber(), 0, -0.16, 0));
    return { group: g, colliders: [] };
  },
  chandelier: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.02, 0.02, 0.8), MAT.brass(), 0, 0.4, 0));
    g.add(mesh(cyl(0.4, 0.1, 0.15), MAT.brass(), 0, -0.05, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(box(0.05, 0.12, 0.05), MAT.amber(), Math.cos(a) * 0.35, -0.18, Math.sin(a) * 0.35));
    }
    return { group: g, colliders: [] };
  },
  counter: (s) => {
    const g = new THREE.Group();
    const w = s.scale ?? 2.4;
    g.add(mesh(box(w, 1.05, 0.6), MAT.darkOak(), 0, 0.52, 0));
    g.add(mesh(box(w + 0.1, 0.06, 0.7), MAT.brass(), 0, 1.08, 0));
    return single(g, w + 0.1, 1.1, 0.7);
  },
  till: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.45, 0.4, 0.45), MAT.brass(), 0, 0.2, 0));
    g.add(mesh(box(0.3, 0.15, 0.3), MAT.steelDark(), 0, 0.45, 0));
    return { group: g, colliders: [] };
  },
  trolley: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.7, 0.9, 0.5), MAT.steel(), 0, 0.6, 0));
    g.add(mesh(box(0.65, 0.05, 0.45), MAT.steelDark(), 0, 0.5, 0));
    g.add(mesh(box(0.65, 0.05, 0.45), MAT.steelDark(), 0, 0.9, 0));
    for (const [x, z] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]] as const)
      g.add(mesh(cyl(0.05, 0.05, 0.05), MAT.charcoal(), x, 0.1, z));
    return single(g, 0.75, 1.1, 0.55);
  },
  machineBox: (s, rng) => {
    const g = new THREE.Group();
    const w = (s.scale ?? 1) * 1.4;
    g.add(mesh(box(w, 1.6, 0.9), MAT.steelDark(), 0, 0.8, 0));
    g.add(mesh(box(w * 0.8, 0.4, 0.05), MAT.steel(), 0, 1.1, 0.46));
    for (let i = 0; i < 4; i++)
      g.add(mesh(box(0.08, 0.08, 0.03), rng.bool(0.7) ? MAT.amberDim() : MAT.redLamp(),
        -w * 0.3 + i * w * 0.2, 1.15, 0.49));
    return single(g, w, 1.6, 0.95);
  },
  hangingPanels: (_s, rng) => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = mesh(box(0.7, 1.4, 0.04), rng.bool() ? MAT.paperOld() : MAT.plasterDark(),
        (i - 1) * 0.9, 0, (rng.float() - 0.5) * 0.3);
      p.rotation.y = (rng.float() - 0.5) * 0.4;
      g.add(p);
    }
    return { group: g, colliders: [] };
  },
  deskLamp: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.12, 0.14, 0.03), MAT.brass(), 0, 0.02, 0));
    g.add(mesh(cyl(0.02, 0.02, 0.35), MAT.brass(), 0, 0.2, -0.05));
    const head = mesh(cyl(0.1, 0.14, 0.12), MAT.oxGreen(), 0, 0.4, 0.06);
    head.rotation.x = 0.7;
    g.add(head);
    return { group: g, colliders: [] };
  },
  keypad: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.25, 0.35, 0.06), MAT.steelDark(), 0, 0, 0));
    g.add(mesh(box(0.15, 0.08, 0.02), MAT.amber(), 0, 0.1, 0.04));
    return { group: g, colliders: [] };
  },
  pylon: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.3, 0.45, 2.2, 8), MAT.steelDark(), 0, 1.1, 0));
    g.add(mesh(cyl(0.12, 0.12, 0.3), MAT.brassBright(), 0, 2.3, 0));
    g.add(mesh(cyl(0.35, 0.35, 0.08), MAT.brass(), 0, 0.6, 0));
    return single(g, 0.9, 2.5, 0.9);
  },
  catalogueDesk: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.9, 1.0, 0.1, 12), MAT.darkOak(), 0, 0.85, 0));
    g.add(mesh(cyl(0.15, 0.2, 0.8), MAT.darkOak(), 0, 0.4, 0));
    g.add(mesh(box(0.5, 0.08, 0.7), MAT.paperOld(), 0.1, 0.94, 0));
    g.add(mesh(box(0.04, 0.3, 0.5), MAT.paper(), 0.45, 1.1, 0));
    return single(g, 2.0, 1.0, 2.0);
  },
  sealConsole: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.2, 1.1, 0.5), MAT.steelDark(), 0, 0.55, 0));
    for (let i = 0; i < 3; i++) {
      const ring = mesh(new THREE.TorusGeometry(0.16 + i * 0.07, 0.02, 6, 24), MAT.brass(), 0, 1.25, 0.26);
      ring.rotation.x = Math.PI / 2 - 0.5;
      ring.rotation.z = i;
      g.add(ring);
    }
    return single(g, 1.25, 1.5, 0.6);
  },
  relay: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.3, 0.45, 0.2), MAT.steel(), 0, 0.25, 0));
    g.add(mesh(cyl(0.05, 0.05, 0.4), MAT.brassBright(), 0, 0.65, 0));
    g.add(mesh(box(0.12, 0.12, 0.05), MAT.amber(), 0, 0.5, 0.1));
    return { group: g, colliders: [] };
  },
  liftDoors: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.7, 2.3, 0.1), MAT.steel(), -0.36, 1.15, 0));
    g.add(mesh(box(0.7, 2.3, 0.1), MAT.steel(), 0.36, 1.15, 0));
    g.add(mesh(box(1.6, 0.15, 0.15), MAT.brass(), 0, 2.4, 0));
    return { group: g, colliders: [] };
  },
  routingBoard: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(2.4, 1.6, 0.15), MAT.charcoal(), 0, 1.3, 0));
    for (let i = 0; i < 8; i++)
      g.add(mesh(cyl(0.05, 0.05, 0.06), MAT.brassBright(), -0.9 + (i % 4) * 0.6, 0.9 + Math.floor(i / 4) * 0.7, 0.1));
    return { group: g, colliders: [{ x: 0, z: 0, w: 2.4, d: 0.2, h: 2.1 }] };
  },
  orreryRig: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.5, 0.7, 0.4), MAT.steelDark(), 0, 0, 0));
    for (let i = 0; i < 3; i++) {
      const arm = mesh(box(0.08, 0.08, 3.5 + i), MAT.brass(), 0, -0.1 - i * 0.15, 0);
      arm.rotation.y = (i / 3) * Math.PI;
      g.add(arm);
      g.add(mesh(cyl(0.12, 0.18, 0.3), MAT.steel(), Math.cos((i / 3) * Math.PI) * 1.7, -0.3 - i * 0.15, Math.sin((i / 3) * Math.PI) * 1.7));
    }
    return { group: g, colliders: [] };
  },
  catalogTrack: (s) => {
    const g = new THREE.Group();
    const len = s.scale ?? 6;
    g.add(mesh(box(len, 0.08, 0.08), MAT.brass(), 0, 0, 0));
    for (let i = 0; i < Math.floor(len); i++)
      g.add(mesh(box(0.06, 0.3, 0.2), MAT.steelDark(), -len / 2 + i + 0.5, -0.18, 0));
    return { group: g, colliders: [] };
  },
  rollingLadder: (_s) => {
    const g = new THREE.Group();
    const ladder = mesh(box(0.6, 3.2, 0.08), MAT.oak(), 0, 1.6, 0);
    ladder.rotation.x = -0.2;
    g.add(ladder);
    for (let i = 0; i < 6; i++)
      g.add(mesh(box(0.55, 0.04, 0.04), MAT.darkOak(), 0, 0.35 + i * 0.5, 0.06 + i * 0.1));
    return { group: g, colliders: [{ x: 0, z: 0, w: 0.7, d: 0.5, h: 3 }] };
  },
  merchantCounter: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(3.0, 1.1, 0.8), MAT.darkOak(), 0, 0.55, 0));
    g.add(mesh(box(3.1, 0.08, 0.9), MAT.brass(), 0, 1.14, 0));
    g.add(mesh(box(2.6, 0.8, 0.06), MAT.glassDusty(), 0, 1.6, 0.1));
    // parcel slots behind
    g.add(mesh(box(3.0, 2.0, 0.4), MAT.oak(), 0, 1.0, -1.2));
    for (let i = 0; i < 8; i++)
      g.add(mesh(box(0.6, 0.4, 0.05), MAT.charcoal(), -1.0 + (i % 4) * 0.7, 0.4 + Math.floor(i / 4) * 0.6, -0.97));
    return single(g, 3.1, 2.0, 1.5);
  },
  speakingTube: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.04, 0.04, 1.6), MAT.brass(), 0, 0.8, 0));
    const horn = mesh(cyl(0.12, 0.04, 0.25), MAT.brassBright(), 0, 1.65, 0);
    horn.rotation.x = Math.PI;
    g.add(horn);
    return { group: g, colliders: [] };
  },
  printerRow: (_s, rng) => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      g.add(mesh(box(0.5, 0.4, 0.4), MAT.steel(), (i - 1) * 0.65, 0.2, 0));
      g.add(mesh(box(0.4, 0.06, 0.3), MAT.paper(), (i - 1) * 0.65, 0.44, 0.05));
      if (rng.bool(0.4)) g.add(mesh(box(0.06, 0.06, 0.03), MAT.redLamp(), (i - 1) * 0.65 + 0.15, 0.42, 0.2));
    }
    return single(g, 2.0, 0.6, 0.5);
  },
  alarm: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.15, 0.3, 0.1), MAT.steelDark(), 0, 0, 0));
    g.add(mesh(cyl(0.03, 0.03, 0.25), MAT.redLamp(), 0, -0.05, 0.08));
    return { group: g, colliders: [] };
  },
  trench: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.4, 0.04, 3.0), MAT.charcoal(), 0, -0.5, 0));
    g.add(mesh(box(0.15, 0.55, 3.0), MAT.steelDark(), -0.7, -0.22, 0));
    g.add(mesh(box(0.15, 0.55, 3.0), MAT.steelDark(), 0.7, -0.22, 0));
    return { group: g, colliders: [] };
  },
  freightLift: (_s) => {
    const g = new THREE.Group();
    // cage lift
    g.add(mesh(box(2.4, 0.1, 2.4), MAT.steelDark(), 0, 0.05, 0));
    for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]] as const)
      g.add(mesh(box(0.08, 2.6, 0.08), MAT.steel(), x, 1.3, z));
    g.add(mesh(box(2.4, 0.08, 2.4), MAT.steelDark(), 0, 2.65, 0));
    for (let i = 0; i < 4; i++)
      g.add(mesh(box(2.3, 0.05, 0.05), MAT.steel(), 0, 0.4 + i * 0.55, -1.15));
    return { group: g, colliders: [{ x: 0, z: -1.15, w: 2.4, d: 0.1, h: 2.6 }, { x: -1.15, z: 0, w: 0.1, d: 2.4, h: 2.6 }, { x: 1.15, z: 0, w: 0.1, d: 2.4, h: 2.6 }] };
  },
  stairLanding: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(3.0, 0.15, 3.0), MAT.concreteDark(), 0, -0.07, 0));
    g.add(mesh(box(3.0, 1.1, 0.1), MAT.concrete(), 0, 0.55, 1.45));
    return { group: g, colliders: [{ x: 0, z: 1.45, w: 3.0, d: 0.15, h: 1.1 }] };
  },
  liftShaft: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.8, 3.4, 0.15), MAT.steelDark(), 0, 1.7, 0));
    g.add(mesh(box(0.15, 3.4, 0.6), MAT.steelDark(), -0.9, 1.7, 0.3));
    g.add(mesh(box(0.15, 3.4, 0.6), MAT.steelDark(), 0.9, 1.7, 0.3));
    return { group: g, colliders: [{ x: 0, z: 0, w: 1.8, d: 0.2, h: 3.4 }] };
  },
  // Hazards
  snare: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.9, 0.01, 0.5), MAT.paperOld(), 0, 0.01, 0));
    g.add(mesh(box(0.9, 0.008, 0.06), MAT.redLamp(), 0, 0.015, -0.2));
    return { group: g, colliders: [] };
  },
  puddle: (_s) => {
    const g = new THREE.Group();
    const p = mesh(cyl(0.7, 0.7, 0.015, 14), MAT.waterDark(), 0, 0.008, 0);
    p.scale.x = 1.3;
    g.add(p);
    return { group: g, colliders: [] };
  },
  steamVent: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.15, 0.2, 0.4), MAT.steelDark(), 0, 0.2, 0));
    g.add(mesh(box(0.25, 0.05, 0.25), MAT.steel(), 0, 0.42, 0));
    return { group: g, colliders: [{ x: 0, z: 0, w: 0.35, d: 0.35, h: 0.45 }] };
  },
  fan: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.45, 0.05, 6, 18), MAT.steelDark(), 0, 0, 0));
    for (let i = 0; i < 4; i++) {
      const blade = mesh(box(0.12, 0.5, 0.02), MAT.steel(), 0, 0, 0);
      blade.rotation.z = (i / 4) * Math.PI * 2;
      g.add(blade);
    }
    return { group: g, colliders: [] };
  },
  brokenFloor: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.4, 0.06, 0.4), MAT.darkOak(), -0.3, 0.02, 0.2));
    const tilted = mesh(box(1.2, 0.06, 0.4), MAT.darkOak(), 0.25, -0.08, -0.25);
    tilted.rotation.x = 0.25;
    g.add(tilted);
    return { group: g, colliders: [] };
  },
  // Underscript props
  cubicle: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.8, 1.5, 0.06), MAT.concrete(), 0, 0.75, -0.9));
    g.add(mesh(box(0.06, 1.5, 1.8), MAT.concrete(), -0.9, 0.75, 0));
    g.add(mesh(box(0.06, 1.5, 1.8), MAT.concrete(), 0.9, 0.75, 0));
    g.add(mesh(box(1.6, 0.05, 0.6), MAT.plasterDark(), 0, 0.75, -0.6));
    g.add(mesh(box(0.4, 0.5, 0.4), MAT.charcoal(), -0.3, 1.05, -0.62));
    g.add(mesh(box(0.5, 0.05, 0.35), MAT.ink(), 0.2, 0.79, -0.6));
    return { group: g, colliders: [
      { x: 0, z: -0.9, w: 1.8, d: 0.1, h: 1.5 },
      { x: -0.9, z: 0, w: 0.1, d: 1.8, h: 1.5 },
      { x: 0.9, z: 0, w: 0.1, d: 1.8, h: 1.5 },
    ] };
  },
  breakTable: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.6, 0.05, 0.8), MAT.plasterDark(), 0, 0.72, 0));
    for (const [x, z] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]] as const)
      g.add(mesh(box(0.06, 0.7, 0.06), MAT.steel(), x, 0.35, z));
    g.add(mesh(cyl(0.08, 0.08, 0.2), MAT.paper(), -0.4, 0.82, 0.1));
    return single(g, 1.65, 0.8, 0.85);
  },
  recordsCage: (_s) => {
    const g = new THREE.Group();
    for (let i = 0; i <= 5; i++)
      g.add(mesh(box(0.04, 2.2, 0.04), MAT.steel(), -1.0 + i * 0.4, 1.1, 0));
    g.add(mesh(box(2.1, 0.05, 0.05), MAT.steel(), 0, 2.2, 0));
    g.add(mesh(box(2.1, 0.05, 0.05), MAT.steel(), 0, 0.05, 0));
    return { group: g, colliders: [{ x: 0, z: 0, w: 2.1, d: 0.08, h: 2.2 }] };
  },
  printer: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.6, 0.5, 0.5), MAT.plasterDark(), 0, 0.25, 0));
    g.add(mesh(box(0.45, 0.05, 0.3), MAT.paper(), 0, 0.52, 0.1));
    g.add(mesh(box(0.5, 0.08, 0.1), MAT.ink(), 0, 0.45, 0.2));
    return single(g, 0.65, 0.6, 0.55);
  },
  fluoroTube: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.3, 0.06, 0.15), MAT.fluoro(), 0, 0, 0));
    return { group: g, colliders: [] };
  },
  exitSign: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.55, 0.22, 0.08), MAT.redLamp(), 0, 0, 0));
    return { group: g, colliders: [] };
  },
  typewriter: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.45, 0.18, 0.4), MAT.ink(), 0, 0.1, 0));
    g.add(mesh(box(0.4, 0.1, 0.08), MAT.steel(), 0, 0.24, -0.14));
    g.add(mesh(box(0.35, 0.15, 0.02), MAT.paper(), 0, 0.3, -0.16));
    return { group: g, colliders: [] };
  },
  waterCooler: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.35, 1.0, 0.35), MAT.plasterDark(), 0, 0.5, 0));
    g.add(mesh(cyl(0.16, 0.16, 0.4), MAT.glassDusty(), 0, 1.2, 0));
    return single(g, 0.4, 1.4, 0.4);
  },
  // Desk monitor — dark frame, glowing screen face. Template supplies y (desk top).
  monitor: (_s, rng) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.22, 0.03, 0.2), MAT.charcoal(), 0, 0.02, 0));
    g.add(mesh(box(0.05, 0.14, 0.05), MAT.charcoal(), 0, 0.09, -0.04));
    const scr = rng.pick([MAT.screenGreen(), MAT.screenAmber(), MAT.screenDark()]).clone();
    g.add(mesh(box(0.55, 0.36, 0.05), MAT.charcoal(), 0, 0.32, 0));
    const scrMesh = mesh(box(0.49, 0.3, 0.02), scr, 0, 0.32, 0.032);
    scrMesh.userData.anim = 'screen';
    scrMesh.userData.animSeed = rng.float() * 100;
    g.add(scrMesh);
    return { group: g, colliders: [] };
  },
  // Server rack — dark enclosure, front rows of lit LED dots.
  serverRack: (_s, rng) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.65, 2.0, 0.8), MAT.ink(), 0, 1.0, 0));
    g.add(mesh(box(0.55, 1.9, 0.04), MAT.steelDark(), 0, 1.0, 0.42));
    const leds = [MAT.screenGreen(), MAT.amberDim(), MAT.redLamp(), MAT.screenGreen()];
    for (let row = 0; row < 7; row++) {
      const y = 0.35 + row * 0.24;
      g.add(mesh(box(0.5, 0.14, 0.02), MAT.charcoal(), 0, y, 0.45));
      for (let i = 0; i < 5; i++) {
        const led = mesh(box(0.05, 0.04, 0.015), rng.pick(leds).clone(), -0.2 + i * 0.1, y, 0.47);
        led.userData.anim = 'blink';
        led.userData.animSeed = rng.float() * 100;
        g.add(led);
      }
    }
    return single(g, 0.7, 2.0, 0.85);
  },
  // Loose sheets scattered on the floor — cheap clutter with no collision.
  paperScatter: (_s, rng) => {
    const g = new THREE.Group();
    const n = 5 + rng.int(0, 5);
    for (let i = 0; i < n; i++) {
      const sheet = mesh(box(0.23, 0.004, 0.31), rng.bool() ? MAT.paper() : MAT.paperOld(),
        (rng.float() - 0.5) * 2.4, 0.004 + i * 0.0015, (rng.float() - 0.5) * 2.4);
      sheet.rotation.y = rng.float() * Math.PI;
      g.add(sheet);
    }
    if (rng.bool(0.4)) {
      const fold = mesh(box(0.23, 0.004, 0.16), MAT.paperOld(), (rng.float() - 0.5) * 1.2, 0.02, (rng.float() - 0.5) * 1.2);
      fold.rotation.set(0.5, rng.float() * Math.PI, 0);
      g.add(fold);
    }
    return { group: g, colliders: [] };
  },
  // Glass partition wall — framed glazed panes; blocks movement, not LOS.
  glassWall: (s) => {
    const g = new THREE.Group();
    const w = s.scale ?? 2.4;
    const h = 2.1;
    g.add(mesh(box(w, 0.08, 0.1), MAT.steelDark(), 0, 0.04, 0));
    g.add(mesh(box(w, 0.1, 0.1), MAT.steelDark(), 0, h - 0.05, 0));
    g.add(mesh(box(w - 0.16, h - 0.3, 0.02), MAT.glassDusty(), 0, h / 2, 0));
    const posts = Math.max(2, Math.round(w / 1.2) + 1);
    for (let i = 0; i < posts; i++)
      g.add(mesh(box(0.07, h, 0.09), MAT.steelDark(), -w / 2 + (i / (posts - 1)) * w, h / 2, 0));
    // mid rail — reads as mullions
    g.add(mesh(box(w, 0.07, 0.06), MAT.steelDark(), 0, h * 0.52, 0));
    return { group: g, colliders: [{ x: 0, z: 0, w, d: 0.12, h, movementOnly: true }] };
  },
  // Morgue drawer bank — steel frame, 3×4 drawer fronts; a few sit open
  // with a tray out and a sheeted form on it.
  morgueDrawer: (_s, rng) => {
    const g = new THREE.Group();
    const W = 2.0, H = 2.05, D = 0.62;
    g.add(mesh(box(W, H, D), MAT.steelDark(), 0, H / 2, 0));
    g.add(mesh(box(W + 0.06, 0.08, D + 0.06), MAT.charcoal(), 0, H + 0.02, 0));
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const dx = -W / 2 + 0.36 + c * 0.64;
        const dy = 0.33 + r * 0.47;
        if (rng.bool(0.1)) {
          // open bay: dark cavity, tray pulled out, drawer face at the tray's end
          g.add(mesh(box(0.56, 0.4, 0.04), MAT.ink(), dx, dy, D / 2 + 0.02));
          g.add(mesh(box(0.56, 0.03, 0.52), MAT.steel(), dx, dy - 0.17, D / 2 + 0.29));
          if (rng.bool(0.5))
            g.add(mesh(box(0.4, 0.11, 0.42), MAT.paperOld(), dx, dy - 0.11, D / 2 + 0.27));
          g.add(mesh(box(0.58, 0.42, 0.03), MAT.steel(), dx, dy, D / 2 + 0.56));
          g.add(mesh(box(0.16, 0.03, 0.02), MAT.charcoal(), dx, dy + 0.1, D / 2 + 0.58));
        } else {
          g.add(mesh(box(0.58, 0.42, 0.03), MAT.steel(), dx, dy, D / 2 + 0.015));
          g.add(mesh(box(0.16, 0.03, 0.02), MAT.charcoal(), dx, dy + 0.1, D / 2 + 0.035));
          g.add(mesh(box(0.1, 0.05, 0.008), MAT.paperOld(), dx, dy - 0.12, D / 2 + 0.032));
        }
      }
    }
    return single(g, W + 0.1, H + 0.1, D + 0.15);
  },
  // Morgue/exam gurney — sheeted slab on a thin wheeled frame.
  gurney: (_s, rng) => {
    const g = new THREE.Group();
    g.add(mesh(box(1.8, 0.05, 0.6), MAT.steelDark(), 0, 0.62, 0));
    g.add(mesh(box(1.86, 0.13, 0.66), MAT.paperOld(), 0, 0.72, 0));
    for (const sx of [-0.75, 0.75])
      for (const sz of [-0.24, 0.24]) {
        g.add(mesh(cyl(0.02, 0.02, 0.6, 6), MAT.steelDark(), sx, 0.31, sz));
        g.add(mesh(cyl(0.05, 0.05, 0.03, 8), MAT.charcoal(), sx, 0.035, sz));
      }
    if (rng.bool(0.55))
      g.add(mesh(box(0.5, 0.14, 0.4), MAT.paperOld(), (rng.float() - 0.5) * 0.8, 0.86, 0));
    return single(g, 1.9, 0.95, 0.7);
  },
  // Industrial washer — enameled box with a round porthole.
  washer: (_s, rng) => {
    const g = new THREE.Group();
    g.add(mesh(box(0.74, 0.95, 0.68), MAT.steel(), 0, 0.5, 0));
    g.add(mesh(box(0.74, 0.16, 0.66), MAT.charcoal(), 0, 1.0, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 18), MAT.charcoal());
    ring.position.set(0, 0.52, 0.345);
    g.add(ring);
    const disc = mesh(cyl(0.19, 0.19, 0.02, 18), MAT.ink(), 0, 0.52, 0.345);
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    for (let i = 0; i < 3; i++) {
      const btn = mesh(box(0.05, 0.03, 0.02), (rng.bool(0.4) ? MAT.screenGreen() : MAT.charcoal()), -0.24 + i * 0.1, 1.0, 0.34);
      g.add(btn);
    }
    return single(g, 0.78, 1.1, 0.72);
  },
  // Boiler — horizontal riveted tank on legs, hatch, pipe stubs, valve wheel.
  boilerTank: (_s, rng) => {
    const g = new THREE.Group();
    const shell = mesh(cyl(0.66, 0.66, 1.9, 14), MAT.steelDark(), 0, 0.9, 0);
    shell.rotation.z = Math.PI / 2;
    g.add(shell);
    for (const sx of [-0.62, 0.62])
      g.add(mesh(box(0.22, 0.26, 0.9), MAT.charcoal(), sx, 0.13, 0));
    const hatch = mesh(cyl(0.28, 0.28, 0.1, 12), MAT.charcoal(), -0.98, 0.9, 0);
    hatch.rotation.z = Math.PI / 2;
    g.add(hatch);
    for (const sx of [-0.4, 0.35]) {
      g.add(mesh(cyl(0.07, 0.07, 0.55, 8), MAT.steel(), sx, 1.75, 0));
      g.add(mesh(cyl(0.1, 0.1, 0.08, 8), MAT.steel(), sx, 1.5, 0));
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 14), MAT.steel());
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(-0.98, 0.55, 0.2);
    g.add(wheel);
    const gauge = mesh(cyl(0.055, 0.055, 0.03, 10), MAT.brassBright(), -0.98, 1.2, 0.1);
    gauge.rotation.x = Math.PI / 2;
    g.add(gauge);
    if (rng.bool(0.6))
      g.add(mesh(box(0.34, 0.06, 0.02), MAT.redLamp(), 0, 0.26, 0.67));
    return single(g, 2.1, 1.85, 1.4);
  },
  // Cubicle pod — U-shaped fabric partition, desk, office chair, monitor.
  cubiclePod: (s, rng) => {
    const g = new THREE.Group();
    const panelMat = MAT.plasterDark();
    g.add(mesh(box(1.7, 1.35, 0.05), panelMat, 0, 0.675, -0.78));
    g.add(mesh(box(0.05, 1.35, 1.55), panelMat, -0.82, 0.675, 0));
    g.add(mesh(box(0.05, 1.35, 1.55), panelMat, 0.82, 0.675, 0));
    g.add(mesh(box(1.55, 0.05, 0.62), MAT.oak(), 0, 0.73, -0.45));
    g.add(mesh(box(1.55, 0.62, 0.04), MAT.charcoal(), 0, 0.4, -0.48));
    // office chair — stem + seat + back
    g.add(mesh(cyl(0.03, 0.2, 0.42, 8), MAT.charcoal(), 0.25, 0.24, 0.15));
    g.add(mesh(box(0.48, 0.07, 0.46), MAT.charcoal(), 0.25, 0.48, 0.15));
    g.add(mesh(box(0.46, 0.55, 0.06), MAT.charcoal(), 0.25, 0.85, 0.36));
    const mon = builders.monitor!(s, rng);
    mon.group.position.set(-0.28, 0.755, -0.52);
    mon.group.rotation.y = 0.15;
    g.add(mon.group);
    g.add(mesh(box(0.42, 0.02, 0.15), MAT.charcoal(), -0.24, 0.75, -0.18));
    if (rng.bool(0.6))
      g.add(mesh(box(0.3, 0.05, 0.22), MAT.paperOld(), 0.4, 0.78, -0.5));
    return {
      group: g,
      colliders: [
        { x: 0, z: -0.78, w: 1.7, d: 0.06, h: 1.35 },
        { x: -0.82, z: 0, w: 0.06, d: 1.55, h: 1.35 },
        { x: 0.82, z: 0, w: 0.06, d: 1.55, h: 1.35 },
        { x: 0, z: -0.45, w: 1.55, d: 0.65, h: 0.76 },
      ],
    };
  },
};

// Fixture kinds whose GLTF materials get a warm emissive lift so they read
// as light sources rather than unlit furniture.
const LIT_FIXTURES = new Set(['wallSconce', 'ceilingLamp', 'lamp', 'deskLamp', 'candle', 'chandelier', 'monitor', 'serverRack', 'fluoroStrip', 'cageLight', 'securityLight', 'pipeLamp', 'lantern', 'lanternChandelier', 'chainBulb', 'firePit', 'streetLamp']);

export function buildProp(spec: PropSpec, rng: Rng): BuiltProp {
  const model = modelInstance(spec.kind, rng.float());
  let prop: BuiltProp;
  if (model) {
    if (LIT_FIXTURES.has(spec.kind)) {
      const glow = new THREE.Color(spec.kind === 'stove' ? 0xff5a1e : 0xffc878);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat && mat.emissive) {
            mat.emissive = glow;
            mat.emissiveIntensity = spec.kind === 'chandelier' || spec.kind === 'lanternChandelier' ? 0.35 : 0.55;
          }
        }
      });
    }
    const c = modelCollider(spec.kind)!;
    prop = c[0] > 0 ? single(model, c[0], c[1], c[2]) : { group: model, colliders: [] };
  } else {
    const b = builders[spec.kind];
    prop = b ? b(spec, rng) : single(new THREE.Group(), 0.4, 0.4, 0.4);
  }
  prop.group.rotation.y = spec.yaw ?? 0;
  prop.group.position.set(spec.x, spec.y ?? 0, spec.z);
  // Rotate local colliders with the prop yaw (axis-aligned rotations only for
  // collider validity; arbitrary yaw falls back to a circular footprint).
  const yaw = spec.yaw ?? 0;
  const quarter = Math.round(yaw / (Math.PI / 2)) % 4;
  for (const c of prop.colliders) {
    if (Math.abs(yaw % (Math.PI / 2)) < 0.01) {
      // rotate the box center/dims by quarter turns
      let cx = c.x, cz = c.z, w = c.w, d = c.d;
      for (let i = 0; i < ((quarter % 4) + 4) % 4; i++) {
        [cx, cz] = [cz, -cx];
        [w, d] = [d, w];
      }
      c.x = cx + spec.x; c.z = cz + spec.z; c.w = w; c.d = d;
    } else {
      const r = Math.max(c.w, c.d) / 2;
      c.x += spec.x; c.z += spec.z; c.w = r * 2; c.d = r * 2;
    }
    c.y = (c.y ?? 0) + (spec.y ?? 0);
  }
  return prop;
}

export function disposePropCache(): void {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}
