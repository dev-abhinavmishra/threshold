/**
 * Procedural prop builders. Every mesh is generated code — no external models.
 * Each builder returns a THREE.Group in local prop space and contributes
 * collision boxes (local, relative to prop origin at floor level).
 */
import * as THREE from 'three';
import type { LocalCollider, PropSpec } from './spec';
import { MAT } from './materials';
import { TEX } from './textures';
import { modelInstance, modelCollider } from './modelLibrary';
import { nightBackdrop, rainStreaks, floorStain, decalQuad, wrongRoom, glassFog, ringStains, sleptIn, scratchWriting, dustDate, paneTape, chairHalo, bedpostNotches, paneWriting, tableScratches, soapScum, shaverSmear, stairWear, counterDrips, flourDust } from './decals';
import { tallFigure } from '../entities/figure';
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
  cardboardBox: (_s, rng) => {
    // taped shipping box, sometimes a second one stacked or flaps open
    const g = new THREE.Group();
    const bw = 0.42 + rng.float() * 0.22;
    const bh = 0.3 + rng.float() * 0.18;
    const bd = 0.36 + rng.float() * 0.18;
    g.add(mesh(box(bw, bh, bd), TEX.cardboard(), 0, bh / 2, 0));
    // packing tape strip across the lid
    g.add(mesh(box(bw * 0.94, 0.008, 0.05), MAT.paperOld(), 0, bh + 0.004, 0));
    if (rng.bool(0.3)) {
      // open flaps splayed outward
      for (const sx of [-1, 1]) {
        const flap = mesh(box(bw * 0.46, 0.01, bd * 0.9), TEX.cardboard(), sx * bw * 0.28, bh + 0.06, 0);
        flap.rotation.z = sx * 0.7;
        g.add(flap);
      }
    } else if (rng.bool(0.4)) {
      const bw2 = bw * (0.7 + rng.float() * 0.2);
      const bh2 = bh * 0.8;
      const top = mesh(box(bw2, bh2, bd * 0.85), TEX.cardboard(), (rng.float() - 0.5) * 0.08, bh + bh2 / 2 + 0.01, (rng.float() - 0.5) * 0.08);
      top.rotation.y = (rng.float() - 0.5) * 0.6;
      g.add(top);
    }
    return single(g, bw + 0.06, bh + 0.6, bd + 0.06);
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
    // mesh grille behind the louvers — metal grid texture reads as
    // perforated steel, not four floating bars
    g.add(mesh(box(0.94, 0.62, 0.02), TEX.metalGrid(), 0, 0.35, 0.075));
    for (let i = 0; i < 4; i++) g.add(mesh(box(0.9, 0.05, 0.04), MAT.charcoal(), 0, 0.12 + i * 0.15, 0.08));
    return single(g, 1.0, 0.7, 0.2);
  },
  sofa: (_s, rng) => {
    const g = new THREE.Group();
    const fab = rng.bool(0.5) ? TEX.fabricChintz() : TEX.leatherWorn();
    fab.color.multiplyScalar(0.9 + rng.float() * 0.25);
    g.add(mesh(box(1.6, 0.4, 0.7), fab, 0, 0.2, 0));
    g.add(mesh(box(1.6, 0.5, 0.2), fab, 0, 0.55, -0.25));
    g.add(mesh(box(0.2, 0.5, 0.7), fab, -0.7, 0.4, 0));
    g.add(mesh(box(0.2, 0.5, 0.7), fab, 0.7, 0.4, 0));
    // seat + back cushions — the subdivided surface sells upholstery
    g.add(mesh(box(0.7, 0.11, 0.55), fab, -0.37, 0.44, 0.03));
    g.add(mesh(box(0.7, 0.11, 0.55), fab, 0.37, 0.44, 0.03));
    g.add(mesh(box(0.68, 0.4, 0.11), fab, -0.37, 0.66, -0.16));
    g.add(mesh(box(0.68, 0.4, 0.11), fab, 0.37, 0.66, -0.16));
    return single(g, 1.65, 0.85, 0.75);
  },
  lamp: (_s) => {
    const g = new THREE.Group();
    g.add(mesh(cyl(0.03, 0.16, 1.5), MAT.brass(), 0, 0.75, 0));
    g.add(mesh(cyl(0.22, 0.28, 0.3), MAT.paper(), 0, 1.6, 0));
    const bead = mesh(box(0.01, 0.06, 0.01), MAT.amberDim().clone(), 0, 1.55, 0);
    bead.userData.anim = 'device';
    bead.userData.baseEm = (bead.material as THREE.MeshStandardMaterial).emissiveIntensity;
    g.add(bead);
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
  window: (_s, rng) => {
    // Cold night light through a 2×2 pane grid — translucent panes over a
    // night-skyline backdrop give the pane real depth instead of a flat glow.
    const g = new THREE.Group();
    g.add(mesh(box(1.2, 1.6, 0.1), MAT.darkOak(), 0, 0, 0));
    const backMat = new THREE.MeshStandardMaterial({
      map: nightBackdrop(rng) ?? undefined, color: 0x8ea6bc,
      emissive: 0x51677f, emissiveIntensity: 0.5, roughness: 1, metalness: 0,
    });
    backMat.userData.decalMat = true;
    const back = mesh(box(1.06, 1.42, 0.015), backMat, 0, 0, 0.02);
    g.add(back);
    const paneMat = new THREE.MeshStandardMaterial({
      color: 0x0e1a26, emissive: 0x7d94ad, emissiveIntensity: 0.4,
      roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.45,
      depthWrite: false,
    });
    paneMat.userData.decalMat = true;
    for (const px of [-0.27, 0.27]) {
      for (const py of [-0.37, 0.37]) {
        g.add(mesh(box(0.48, 0.68, 0.015), paneMat, px, py, 0.055));
      }
    }
    g.add(mesh(box(0.05, 1.45, 0.04), MAT.darkOak(), 0, 0, 0.07));
    g.add(mesh(box(1.05, 0.05, 0.04), MAT.darkOak(), 0, 0, 0.07));
    // Rain on the glass — beaded runnels over the panes; skipped when
    // boarded (planks sit proud of the glass anyway).
    const boarded = rng.bool(0.22);
    if (!boarded && rng.bool(0.4)) {
      const rainMat = new THREE.MeshStandardMaterial({
        map: rainStreaks(rng) ?? undefined, transparent: true, opacity: 0.9,
        roughness: 0.3, metalness: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3,
      });
      rainMat.userData.decalMat = true;
      const rain = mesh(new THREE.PlaneGeometry(1.06, 1.44), rainMat, 0, 0, 0.068);
      g.add(rain);
    }
    // Inside fog — the warm room breathes on the cold glass; sometimes
    // somebody wiped it, or dragged a finger through.
    if (!boarded && rng.bool(0.45)) {
      const fogMat = new THREE.MeshStandardMaterial({
        map: glassFog(rng) ?? undefined, transparent: true,
        roughness: 0.6, metalness: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4,
      });
      fogMat.userData.decalMat = true;
      const fog = mesh(new THREE.PlaneGeometry(1.06, 1.44), fogMat, 0, 0, 0.069);
      fog.name = 'glass-fog';
      fog.userData.decalMat = true;
      g.add(fog);
    }
    // The house put tape on the glass once — an X that never got
    // peeled, weathered cream, lifting at the corners.
    if (!boarded && rng.bool(0.16)) {
      const pt = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.24),
        new THREE.MeshStandardMaterial({ map: paneTape(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 }));
      pt.name = 'pane-tape';
      pt.userData.decalMat = true;
      pt.position.set(0, 0, 0.071);
      g.add(pt);
    }
    // The glass kept the word — a finger dragged through the sweat
    // spelled something once; the wiped field never fully fogged back.
    if (!boarded && rng.bool(0.1)) {
      const pw = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72),
        new THREE.MeshStandardMaterial({ map: paneWriting(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
      pw.name = 'pane-writing';
      pw.userData.decalMat = true;
      pw.position.set(0, -0.1, 0.0705);
      g.add(pw);
    }
    // Boarded up — rough planks nailed across the panes; the night glow
    // still leaks through the gaps, which is the whole point.
    if (boarded) {
      const nB = 3 + Math.floor(rng.float() * 2);
      for (let i = 0; i < nB; i++) {
        const by = -0.6 + (i + 0.5) * (1.2 / nB) + (rng.float() - 0.5) * 0.08;
        const plank = mesh(box(1.5 + rng.float() * 0.25, 0.16 + rng.float() * 0.06, 0.03), TEX.woodPlanksDark(), 0, by, 0.1);
        plank.rotation.z = (rng.float() - 0.5) * 0.24;
        g.add(plank);
      }
    }
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
  curtain: (_s, rng) => {
    const g = new THREE.Group();
    const mat = TEX.curtainFabric();
    mat.color.multiplyScalar(0.85 + rng.float() * 0.3);
    // rod + finials
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.7, 8), MAT.brass());
    rod.rotation.z = Math.PI / 2;
    rod.position.y = 0.06;
    g.add(rod);
    for (const ex of [-0.83, 0.83]) {
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), MAT.brass());
      fin.position.set(ex, 0.06, 0);
      g.add(fin);
    }
    // alternating deep/shallow folds read as pleated fabric — each hangs
    // from a rod-level pivot so 'sway' billows it like a hung drape
    for (let i = 0; i < 5; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(-0.56 + i * 0.28, 0.02, 0);
      pivot.add(mesh(box(0.28, 2.0, i % 2 ? 0.05 : 0.12), mat, 0, -1.0, 0));
      pivot.userData.anim = 'sway';
      pivot.userData.animSeed = rng.float() * 6 + i * 0.9;
      pivot.userData.animAmp = 0.025 + rng.float() * 0.025;
      g.add(pivot);
    }
    return { group: g, colliders: [] };
  },
  sign: (_s, rng) => {
    const g = new THREE.Group();
    // hung on a nail at the top edge — a loose sign drifts in the draft
    const pivot = new THREE.Group();
    pivot.add(mesh(box(0.5, 0.3, 0.03), MAT.paperOld(), 0, -0.15, 0));
    pivot.add(mesh(box(0.4, 0.05, 0.01), MAT.ink(), 0, -0.11, 0.02));
    pivot.add(mesh(box(0.3, 0.04, 0.01), MAT.ink(), 0, -0.21, 0.02));
    pivot.name = 'sign-hang';
    if (rng.bool(0.4)) {
      pivot.userData.anim = 'swing';
      pivot.userData.animAmp = 0.03 + rng.float() * 0.03;
      pivot.userData.animSeed = rng.float() * 100;
      pivot.rotation.x = (rng.float() - 0.5) * 0.1;
    }
    g.add(pivot);
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
    const tread = MAT.darkOak(), skirt = MAT.plasterDark(), railM = MAT.brass();
    for (let i = 0; i < steps; i++) {
      const zt = rise * (i + 0.5), zy = -((steps - i - 0.5) * run);
      g.add(mesh(box(1.2, rise, run), skirt, 0, zt, zy));
      // tread nosing — proud lip on each step front
      g.add(mesh(box(1.24, 0.04, 0.06), tread, 0, rise * (i + 1) - 0.02, zy - run / 2 - 0.02));
      // worn tread cap
      g.add(mesh(box(1.2, 0.02, run), tread, 0, rise * (i + 1) - 0.005, zy));
    }
    // stringer skirts along both cheeks
    const len = steps * run, hgt = steps * rise;
    const slope = Math.atan2(hgt, len);
    for (const side of [-1, 1]) {
      const b = mesh(box(0.06, 0.28, Math.hypot(len, hgt)), skirt, side * 0.62, hgt / 2 - 0.1, -len / 2 + run / 2);
      b.rotation.x = slope;
      g.add(b);
    }
    // handrail on the +x cheek: sloped rail + posts at both ends
    const rail = mesh(box(0.05, 0.07, Math.hypot(len, hgt) + 0.2), railM, 0.6, hgt / 2 + 0.75, -len / 2 + run / 2 - 0.05);
    rail.rotation.x = slope;
    g.add(rail);
    for (const [pz, ph] of [[-0.1, rise], [-len + 0.1, hgt]]) {
      g.add(mesh(cyl(0.03, 0.03, 0.78), railM, 0.6, ph + 0.36, pz + run / 2 - 0.05));
    }
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
  // Seated rag dolls clustered against a wall — cloth body, porcelain head,
  // button eyes (sometimes one missing). One doll in each cluster watches.
  dollCluster: (_s, rng) => {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < n; i++) {
      const h = 0.34 + rng.float() * 0.2;
      const doll = new THREE.Group();
      const cloth = MAT.figureCloth();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.42, h * 0.58, 9), cloth);
      body.position.y = h * 0.3;
      body.castShadow = true;
      doll.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.17, 10, 8), MAT.creatureSkin());
      head.position.set(0, h * 0.66, h * 0.02);
      head.scale.set(1, 1.15, 1);
      head.rotation.z = (rng.float() - 0.5) * 0.7;
      doll.add(head);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.05, h * 0.06, h * 0.4, 6), cloth);
        arm.position.set(sx * h * 0.2, h * 0.42, h * 0.08);
        arm.rotation.z = sx * (1.0 + rng.float() * 0.35);
        arm.rotation.x = -0.4;
        doll.add(arm);
      }
      const eyeMat = rng.bool(0.35) ? MAT.eyeGlow() : MAT.ink();
      const eye = new THREE.Mesh(new THREE.SphereGeometry(h * 0.028, 6, 5), eyeMat);
      eye.position.set(-h * 0.06, h * 0.68, h * 0.14);
      doll.add(eye);
      if (rng.bool(0.8)) {
        const eye2 = eye.clone();
        eye2.position.x *= -1;
        doll.add(eye2);
      }
      doll.position.set((i - (n - 1) / 2) * 0.42 + (rng.float() - 0.5) * 0.12, 0, (rng.float() - 0.5) * 0.3);
      doll.rotation.y = (rng.float() - 0.5) * 0.9;
      if (i === Math.floor(rng.float() * n)) {
        doll.userData.anim = 'watch';
        doll.userData.animSeed = rng.float() * 10;
        doll.userData.creepMax = 0.16;
      }
      g.add(doll);
    }
    return single(g, 1.1, 0.7, 0.6);
  },
  // Upright parlor piano — body, fallboard, key slip, castored legs.
  pianoUpright: (_s, rng) => {
    const g = new THREE.Group();
    const body = MAT.darkOak();
    g.add(mesh(box(1.46, 1.28, 0.64), body, 0, 0.72, -0.1));
    // top lid overhang + carved front panel
    g.add(mesh(box(1.52, 0.05, 0.7), body, 0, 1.4, -0.08));
    g.add(mesh(box(1.34, 0.42, 0.04), TEX.woodCarved(), 0, 1.16, 0.23));
    // fallboard slope covering the keys + the keys themselves
    const fall = mesh(box(1.32, 0.36, 0.04), body, 0, 0.86, 0.26);
    fall.rotation.x = -0.22;
    g.add(fall);
    g.add(mesh(box(1.3, 0.05, 0.3), body, 0, 0.72, 0.3));
    g.add(mesh(box(1.18, 0.022, 0.24), MAT.paper(), 0, 0.75, 0.32));
    for (let i = 0; i < 18; i++) {
      g.add(mesh(box(0.028, 0.024, 0.1), MAT.ink(), -0.56 + i * 0.066 + (i % 7 < 3 ? 0.03 : 0.045), 0.764, 0.26));
    }
    // music rest + candle nubs + pedals
    g.add(mesh(box(0.5, 0.34, 0.03), body, 0, 1.18, 0.26));
    for (const px of [-0.14, 0, 0.14]) {
      const pedal = mesh(box(0.05, 0.02, 0.14), MAT.brass(), px, 0.02, 0.24);
      g.add(pedal);
    }
    for (const sx of [-0.6, 0.6]) {
      g.add(mesh(cyl(0.05, 0.04, 0.68, 8), body, sx, 0.34, 0.16));
      if (rng.bool(0.4)) g.add(mesh(box(0.14, 0.1, 0.05), MAT.wax(), sx * 0.8, 1.45, -0.1));
    }
    return single(g, 1.55, 1.45, 0.75);
  },
  // Rubble — fallen plaster chunks and snapped lath at the foot of a wall,
  // over a dust-mound decal.
  rubblePile: (_s, rng) => {
    const g = new THREE.Group();
    const dust = decalQuad(floorStain(rng), 1.1 + rng.float() * 0.5, 1.0 + rng.float() * 0.4);
    dust.rotation.x = -Math.PI / 2;
    dust.rotation.z = rng.float() * Math.PI;
    dust.position.y = 0.012;
    g.add(dust);
    const lumps = 5 + Math.floor(rng.float() * 5);
    for (let i = 0; i < lumps; i++) {
      const r = 0.04 + rng.float() * 0.12;
      const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rng.bool(0.7) ? MAT.plaster() : MAT.plasterDark());
      lump.position.set((rng.float() - 0.5) * 0.9, r * 0.6, (rng.float() - 0.5) * 0.6);
      lump.rotation.set(rng.float() * 3, rng.float() * 3, rng.float() * 3);
      lump.scale.y = 0.5 + rng.float() * 0.5;
      lump.castShadow = true;
      g.add(lump);
    }
    for (let i = 0; i < 2 + Math.floor(rng.float() * 3); i++) {
      const lath = mesh(box(0.035, 0.02, 0.4 + rng.float() * 0.4), MAT.darkOak(), (rng.float() - 0.5) * 0.7, 0.02 + i * 0.012, (rng.float() - 0.5) * 0.5);
      lath.rotation.y = rng.float() * Math.PI;
      g.add(lath);
    }
    return single(g, 1.1, 0.22, 0.9);
  },
  // Roots breaching the underfloor walls — the CC0 root-cluster model when
  // loaded, dead-leaf litter and a damp stain spread around the breach.
  rootGrowth: (_s, rng) => {
    const g = new THREE.Group();
    const root = modelInstance('rootCluster', rng.float());
    if (root) {
      root.rotation.z = (rng.float() - 0.5) * 0.5;
      root.rotation.x = rng.float() * 0.15;
      g.add(root);
    } else {
      for (let i = 0; i < 5; i++) {
        const r = mesh(cyl(0.015, 0.05, 0.8 + rng.float() * 0.6, 5), MAT.darkOak(),
          (rng.float() - 0.5) * 0.7, 0.3 + rng.float() * 0.3, (rng.float() - 0.5) * 0.5);
        r.rotation.z = 0.7 + rng.float() * 0.6;
        r.rotation.y = rng.float() * Math.PI;
        g.add(r);
      }
    }
    const stain = decalQuad(floorStain(rng), 1.2 + rng.float() * 0.6, 1.0 + rng.float() * 0.4);
    stain.rotation.x = -Math.PI / 2;
    stain.rotation.z = rng.float() * Math.PI;
    stain.position.y = 0.013;
    g.add(stain);
    const leaves = 2 + Math.floor(rng.float() * 3);
    for (let i = 0; i < leaves; i++) {
      const leaf = modelInstance('deadLeaf', rng.float());
      if (leaf) {
        leaf.scale.setScalar(0.4 + rng.float() * 0.3);
        leaf.position.set((rng.float() - 0.5) * 1.1, 0.01, (rng.float() - 0.5) * 0.9);
        leaf.rotation.y = rng.float() * Math.PI * 2;
        g.add(leaf);
      }
    }
    return single(g, 1.2, 0.5, 0.9);
  },
  // Damp weeds reclaiming the floor — shrub and fern clumps with litter.
  weedCluster: (_s, rng) => {
    const g = new THREE.Group();
    const n = 1 + Math.floor(rng.float() * 3);
    for (let i = 0; i < n; i++) {
      const m = modelInstance(rng.bool(0.6) ? 'weedShrub' : 'fernClump', rng.float());
      if (m) {
        m.position.set((rng.float() - 0.5) * 1.0, 0, (rng.float() - 0.5) * 0.8);
        m.rotation.y = rng.float() * Math.PI * 2;
        g.add(m);
      }
    }
    const leaf = modelInstance('deadLeaf', rng.float());
    if (leaf) {
      leaf.scale.setScalar(0.5);
      leaf.position.y = 0.01;
      g.add(leaf);
    }
    if (rng.bool(0.5)) {
      const stain = decalQuad(floorStain(rng), 0.9 + rng.float() * 0.5, 0.8 + rng.float() * 0.4);
      stain.rotation.x = -Math.PI / 2;
      stain.rotation.z = rng.float() * Math.PI;
      stain.position.y = 0.011;
      g.add(stain);
    }
    return single(g, 1.1, 0.4, 0.9);
  },
  // Gilt-framed portrait whose painted head slowly tracks the player — but
  // only while they're not looking (weeping-angel 'watch', no creep).
  hauntedPortrait: (_s, rng) => {
    const g = new THREE.Group();
    const fw = 0.72 + rng.float() * 0.3, fh = 0.95 + rng.float() * 0.35;
    const fm = TEX.woodCarved();
    g.add(mesh(box(fw, 0.1, 0.06), fm, 0, fh / 2, 0));
    g.add(mesh(box(fw, 0.1, 0.06), fm, 0, -fh / 2, 0));
    g.add(mesh(box(0.1, fh, 0.06), fm, -fw / 2, 0, 0));
    g.add(mesh(box(0.1, fh, 0.06), fm, fw / 2, 0, 0));
    g.add(mesh(box(fw - 0.1, 0.028, 0.05), MAT.brass(), 0, fh / 2 - 0.065, 0.012));
    g.add(mesh(box(fw - 0.1, 0.028, 0.05), MAT.brass(), 0, -fh / 2 + 0.065, 0.012));
    g.add(mesh(box(0.028, fh - 0.1, 0.05), MAT.brass(), -fw / 2 + 0.065, 0, 0.012));
    g.add(mesh(box(0.028, fh - 0.1, 0.05), MAT.brass(), fw / 2 - 0.065, 0, 0.012));
    g.add(mesh(box(fw - 0.16, fh - 0.16, 0.02), MAT.creatureFabric(), 0, 0, 0.005));
    // painted bust — flattened geometry reads as oil-on-canvas at distance
    const bust = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), MAT.creatureSkin());
    head.scale.set(0.85, 1.1, 0.45);
    head.position.y = fh * 0.18;
    bust.add(head);
    const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.19, 0.24, 8), MAT.figureCloth());
    shoulders.scale.z = 0.5;
    shoulders.position.y = -fh * 0.06;
    bust.add(shoulders);
    if (rng.bool(0.3)) {
      for (const ex of [-0.045, 0.045]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), MAT.eyeGlow());
        e.position.set(ex, fh * 0.2, 0.055);
        bust.add(e);
      }
    } else {
      for (const ex of [-0.045, 0.045]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), MAT.ink());
        e.position.set(ex, fh * 0.2, 0.055);
        bust.add(e);
      }
    }
    bust.position.z = 0.03;
    bust.userData.anim = 'watch';
    bust.userData.animSeed = rng.float() * 10;
    bust.userData.creepMax = 0;
    g.add(bust);
    return { group: g, colliders: [] };
  },
  // Half-seen silhouette at the far end of a corridor: a shadow figure that
  // is only there while you're not looking — glimpse it and it's gone.
  hallFigure: (_s, rng) => {
    const g = new THREE.Group();
    const fig = tallFigure({
      height: 1.9 + rng.float() * 0.3,
      body: MAT.shadowFigure(),
      face: 'none',
      hood: rng.bool(0.6),
      tattered: true,
    });
    g.add(fig);
    g.userData.anim = 'vanish';
    g.userData.animSeed = rng.float() * 10;
    return { group: g, colliders: [] };
  },
  watcherFigure: (_s, rng) => {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(box(0.66, 0.14, 0.66), MAT.charcoal());
    plinth.position.y = 0.07;
    g.add(plinth);
    const fig = tallFigure({
      height: 1.85 + rng.float() * 0.35,
      body: MAT.figureCloth(),
      face: 'none', eyes: rng.bool(0.3) ? 'white' : undefined,
      hood: true, tattered: true,
    });
    fig.position.y = 0.14;
    g.add(fig);
    g.userData.anim = 'watch';
    g.userData.animSeed = rng.float() * 10;
    return single(g, 0.9, 2.1, 0.9);
  },
  // A seated figure slumped against the wall — still dressed, long past
  // caring. Dressing-only dread; the head runs the shared 'watch' anim, so
  // it is only ever aimed at you while you aren't looking.
  deadTenant: (_s, rng) => {
    const g = new THREE.Group();
    const cloth = MAT.figureCloth(), skin = MAT.creatureSkin();
    const llen = 0.62 + rng.float() * 0.15;
    for (const sx of [-1, 1]) {
      const leg = mesh(box(0.11, 0.11, llen), cloth, sx * 0.16, 0.06, llen * 0.42);
      leg.rotation.y = sx * (0.18 + rng.float() * 0.2);
      leg.rotation.x = -0.06;
      g.add(leg);
      g.add(mesh(box(0.11, 0.08, 0.2), MAT.ink(), sx * 0.2, 0.05, llen * 0.95));
    }
    const torso = mesh(box(0.42, 0.62, 0.24), cloth, 0, 0.42, -0.05);
    torso.rotation.x = -0.24;
    g.add(torso);
    for (const sx of [-1, 1]) {
      const arm = mesh(box(0.08, 0.5, 0.08), cloth, sx * 0.26, 0.3, 0.05);
      arm.rotation.x = 0.15; arm.rotation.z = sx * 0.12;
      g.add(arm);
      g.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), skin, sx * 0.3, 0.05, 0.12));
    }
    const head = new THREE.Group();
    const skull = mesh(new THREE.SphereGeometry(0.11, 10, 8), skin, 0, 0, 0);
    skull.scale.set(0.85, 1.05, 0.95);
    head.add(skull);
    const hair = mesh(new THREE.SphereGeometry(0.115, 8, 6), MAT.ink(), 0, 0.03, -0.02);
    hair.scale.set(0.9, 0.9, 0.9);
    head.add(hair);
    head.position.set(0, 0.72, 0.08);
    head.rotation.x = 0.6;
    head.userData.anim = 'watch';
    head.userData.animSeed = rng.float() * 10;
    head.userData.creepMax = 0;
    g.add(head);
    const pool = mesh(new THREE.CircleGeometry(0.55 + rng.float() * 0.2, 14), MAT.ink(), 0, 0.012, 0.3);
    pool.rotation.x = -Math.PI / 2;
    pool.name = 'tenant-pool';
    g.add(pool);
    return single(g, 0.9, 0.9, 1.0);
  },
  // Funerary bier centerpiece — a long box on trestles, the lid always
  // ajar. What it holds is the room's business.
  coffin: (_s, rng) => {
    const g = new THREE.Group();
    const wood = MAT.darkOak(), cloth = MAT.figureCloth();
    for (const sz of [-1, 1]) g.add(mesh(box(0.95, 0.55, 0.16), wood, 0, 0.28, sz * 0.6)); // trestles
    g.add(mesh(box(0.85, 0.52, 1.95), wood, 0, 0.82, 0)); // shell
    g.add(mesh(box(0.92, 0.05, 2.0), wood, 0, 1.1, 0)); // rim lip
    // ink-dark interior, a pale pillow at the head
    g.add(mesh(box(0.74, 0.4, 1.8), MAT.ink(), 0, 0.82, 0));
    g.add(mesh(box(0.4, 0.08, 0.3), cloth, 0, 1.0, -0.7));
    // pall folded over the foot
    g.add(mesh(box(0.9, 0.06, 0.7), cloth, 0, 1.13, 0.62));
    // the lid, propped ajar against the shoulder end
    const lid = mesh(box(0.8, 0.05, 1.9), wood, 0.3, 1.14, 0);
    lid.name = 'lid';
    lid.rotation.z = 0.5;
    lid.rotation.y = rng.bool(0.5) ? 0.05 : -0.05;
    g.add(lid);
    return single(g, 1.0, 1.3, 2.05);
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
    // 'device' anims carry no per-mesh seed — LEDs on one source material
    // share the clone; the last write wins and every write is identical.
    const ledPool = [MAT.amberDim().clone(), MAT.redLamp().clone()];
    for (let i = 0; i < 4; i++) {
      const led = mesh(box(0.08, 0.08, 0.03), rng.bool(0.7) ? ledPool[0] : ledPool[1],
        -w * 0.3 + i * w * 0.2, 1.15, 0.49);
      led.userData.anim = 'device';
      led.userData.baseEm = (led.material as THREE.MeshStandardMaterial).emissiveIntensity;
      g.add(led);
    }
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
    let ledMat: THREE.MeshStandardMaterial | null = null;
    for (let i = 0; i < 3; i++) {
      g.add(mesh(box(0.5, 0.4, 0.4), MAT.steel(), (i - 1) * 0.65, 0.2, 0));
      g.add(mesh(box(0.4, 0.06, 0.3), MAT.paper(), (i - 1) * 0.65, 0.44, 0.05));
      if (rng.bool(0.4)) {
        ledMat ??= MAT.redLamp().clone();
        const led = mesh(box(0.06, 0.06, 0.03), ledMat, (i - 1) * 0.65 + 0.15, 0.42, 0.2);
        led.userData.anim = 'device';
        led.userData.baseEm = (led.material as THREE.MeshStandardMaterial).emissiveIntensity;
        g.add(led);
      }
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
  fan: (_s, rng) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.45, 0.05, 6, 18), MAT.steelDark(), 0, 0, 0));
    // rotor on its own group so the blades can keep turning — most vent
    // fans still work the mains; a few are seized or wobble on a bent hub
    const rotor = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = mesh(box(0.12, 0.5, 0.02), MAT.steel(), 0, 0, 0);
      blade.rotation.z = (i / 4) * Math.PI * 2;
      rotor.add(blade);
    }
    if (!rng.bool(0.22)) {
      rotor.userData.anim = 'spinZ';
      rotor.userData.animSpeed = 1.2 + rng.float() * 2.4;
      if (rng.bool(0.3)) {
        // bent hub — the rotor cants and drags
        rotor.rotation.x = 0.08 + rng.float() * 0.1;
        rotor.userData.animSpeed = (rotor.userData.animSpeed as number) * 0.35;
      }
    }
    g.add(rotor);
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
    // 'blink' is seeded — LEDs that share (material clone, seed) render
    // identically, so pool per row: a whole row is one server unit and
    // blinks the same fault code. 7 clones per rack instead of 35.
    for (let row = 0; row < 7; row++) {
      const y = 0.35 + row * 0.24;
      g.add(mesh(box(0.5, 0.14, 0.02), MAT.charcoal(), 0, y, 0.45));
      const rowMat = rng.pick(leds).clone();
      const rowSeed = rng.float() * 100;
      for (let i = 0; i < 5; i++) {
        const led = mesh(box(0.05, 0.04, 0.015), rowMat, -0.2 + i * 0.1, y, 0.47);
        led.userData.anim = 'blink';
        led.userData.animSeed = rowSeed;
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
    let litMat: THREE.MeshStandardMaterial | null = null;
    for (let i = 0; i < 3; i++) {
      const lit = rng.bool(0.4);
      if (lit) litMat ??= MAT.screenGreen().clone();
      const btn = mesh(box(0.05, 0.03, 0.02), lit ? litMat! : MAT.charcoal(), -0.24 + i * 0.1, 1.0, 0.34);
      if (lit) {
        btn.userData.anim = 'device';
        btn.userData.baseEm = (btn.material as THREE.MeshStandardMaterial).emissiveIntensity;
      }
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
const LIT_FIXTURES = new Set(['wallSconce', 'ceilingLamp', 'lamp', 'deskLamp', 'candle', 'chandelier', 'monitor', 'serverRack', 'fluoroStrip', 'cageLight', 'securityLight', 'pipeLamp', 'lantern', 'lanternChandelier', 'chainBulb', 'firePit', 'streetLamp', 'searchlight']);

export function buildProp(spec: PropSpec, rng: Rng): BuiltProp {
  const model = modelInstance(spec.kind, rng.float());
  let prop: BuiltProp;
  if (model) {
    if (LIT_FIXTURES.has(spec.kind)) {
      const glow = new THREE.Color(spec.kind === 'stove' ? 0xff5a1e : 0xffc878);
      const openFlame = spec.kind === 'candle' || spec.kind === 'lantern' || spec.kind === 'lanternChandelier' || spec.kind === 'firePit';
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          // Clone before lifting/tagging — model clones share materials, and
          // per-instance anim writes would otherwise bleed across rooms.
          const src = m.material as THREE.MeshStandardMaterial;
          if (src && src.emissive) {
            const mat = src.clone();
            m.material = mat;
            mat.emissive = glow;
            mat.emissiveIntensity = spec.kind === 'chandelier' || spec.kind === 'lanternChandelier' ? 0.35 : 0.55;
            if (openFlame) {
              m.userData.anim = 'flame';
              m.userData.animSeed = rng.float() * 100;
              m.userData.baseEm = mat.emissiveIntensity;
            } else {
              // Mains-powered fixture — the game dims it with the room.
              m.userData.anim = 'device';
              m.userData.baseEm = mat.emissiveIntensity;
            }
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
  // Some portraits are occupied: a pair of painted eyes that only open in
  // your periphery — the game fades them out under direct observation.
  // Attached at buildProp level so GLB frames and the procedural fallback
  // both get exactly one pair.
  if (spec.kind === 'painting' && rng.bool(0.3)) {
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xd8c9a3, transparent: true, opacity: 0, depthWrite: false,
    });
    const gaze = new THREE.Group();
    for (const sx of [-0.09, 0.09]) {
      const eye = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.017), eyeMat);
      eye.position.set(sx, 0, 0);
      gaze.add(eye);
    }
    gaze.position.set(0, 0.14, 0.08);
    gaze.userData.anim = 'gaze';
    gaze.userData.animSeed = rng.float() * 10;
    gaze.userData.gazeMat = eyeMat;
    gaze.userData.lx = 0;
    gaze.userData.ly = 0.14;
    gaze.userData.gazed = false;
    prop.group.add(gaze);
  }
  // A few panes and canvases lie outright — the frame hangs a corridor
  // that isn't in this room. An overlay on the glass, like the eyes but
  // never shy: it doesn't care whether you look.
  if ((spec.kind === 'mirror' && rng.bool(0.2)) || (spec.kind === 'painting' && rng.bool(0.07))) {
    const portrait = spec.kind === 'mirror';
    const wr = new THREE.Mesh(
      new THREE.PlaneGeometry(portrait ? 0.52 : 0.62, portrait ? 1.2 : 0.5),
      new THREE.MeshStandardMaterial({ map: wrongRoom(rng) ?? undefined, roughness: portrait ? 0.4 : 0.6, metalness: portrait ? 0.12 : 0 }),
    );
    wr.userData.decalMat = true;
    wr.position.set(0, portrait ? 0 : 0.14, portrait ? 0.05 : 0.08);
    // a named group survives the static-prop bake that would merge the
    // overlay's identity away
    prop.group.name = 'wrong-room';
    prop.group.add(wr);
  }
  // The words worked into the glass — a pin, a nail, the pressure
  // changing mid-letter. Mirrors only; sits under the wrong-room pane.
  if (spec.kind === 'mirror' && rng.bool(0.22)) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3),
      new THREE.MeshStandardMaterial({ map: scratchWriting(rng) ?? undefined, transparent: true, roughness: 0.3, metalness: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    sw.name = 'scratch-writing';
    sw.userData.decalMat = true;
    sw.position.set(0, 0.32, 0.045);
    prop.group.add(sw);
    if (!prop.group.name) prop.group.name = 'scratch-writing';
  }
  // The wood keeps the water — rings where generations of glasses were
  // set down and one honest spill that soaked through the varnish.
  const TOPS: Partial<Record<PropSpec['kind'], number>> = {
    desk: 0.8, table: 0.8, dresser: 0.98, sideboard: 1.2, writingDesk: 0.82,
    breakTable: 0.78, counter: 1.13, nightstand: 0.72, till: 1.05,
  };
  if (spec.kind in TOPS && rng.bool(0.28)) {
    const c = modelCollider(spec.kind);
    const topY = (c?.[1] ?? TOPS[spec.kind as keyof typeof TOPS]!) + 0.004;
    const rw = c ? Math.min(c[0] * 0.8, 1.1) : 0.8;
    const rs = new THREE.Mesh(
      new THREE.PlaneGeometry(rw, rw * 0.8),
      new THREE.MeshStandardMaterial({ map: ringStains(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    rs.name = 'ring-stain';
    rs.userData.decalMat = true;
    rs.rotation.x = -Math.PI / 2;
    rs.rotation.z = rng.float() * Math.PI * 2;
    rs.position.set((rng.float() - 0.5) * 0.3, topY, (rng.float() - 0.5) * 0.15);
    prop.group.add(rs);
  }
  // The dust wrote the months — a date finger-traced through the film
  // on a tabletop somebody never came back to wipe.
  if (spec.kind in TOPS && rng.bool(0.16)) {
    const dc = modelCollider(spec.kind);
    const dustY = (dc?.[1] ?? TOPS[spec.kind as keyof typeof TOPS]!) + 0.005;
    const dd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.28),
      new THREE.MeshStandardMaterial({ map: dustDate(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    dd.name = 'dust-date';
    dd.userData.decalMat = true;
    dd.rotation.x = -Math.PI / 2;
    dd.rotation.z = rng.float() * Math.PI * 2;
    dd.position.set((rng.float() - 0.5) * 0.4, dustY, (rng.float() - 0.5) * 0.2);
    prop.group.add(dd);
    if (!prop.group.name) prop.group.name = 'dust-date';
  }
  // The boards kept the knives — a worked patch of crossed cuts on
  // surfaces that did years of service.
  if (spec.kind in TOPS && rng.bool(0.14)) {
    const dc = modelCollider(spec.kind);
    const cutY = (dc?.[1] ?? TOPS[spec.kind as keyof typeof TOPS]!) + 0.006;
    const ts = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.42),
      new THREE.MeshStandardMaterial({ map: tableScratches(rng) ?? undefined, transparent: true, roughness: 0.92, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ts.name = 'table-scratches';
    ts.userData.decalMat = true;
    ts.rotation.x = -Math.PI / 2;
    ts.rotation.z = rng.float() * Math.PI * 2;
    ts.position.set((rng.float() - 0.5) * 0.3, cutY, (rng.float() - 0.5) * 0.2);
    prop.group.add(ts);
    if (!prop.group.name) prop.group.name = 'table-scratches';
  }
  // The chairs kept the heads — a pomade sheen on the back of a seat
  // someone leaned into for years.
  const BACKED: ReadonlySet<PropSpec['kind']> = new Set(['armchair', 'chair', 'diningChair', 'bench', 'bedBench', 'schoolChair', 'streetSeat', 'chapelPew', 'pewRow']);
  if (BACKED.has(spec.kind) && rng.bool(0.22)) {
    const dc = modelCollider(spec.kind);
    const ch = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.3),
      new THREE.MeshStandardMaterial({ map: chairHalo(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    ch.name = 'chair-halo';
    ch.userData.decalMat = true;
    ch.position.set(0, (dc?.[1] ?? 0.9) * 0.82, -((dc?.[2] ?? 0.5) * 0.38));
    prop.group.add(ch);
    if (!prop.group.name) prop.group.name = 'chair-halo';
  }
  // The bedpost kept the count — small carved ticks where a sleeper
  // marked nights on the head frame. Raw wood shows through the cuts.
  if (spec.kind === 'bed' && rng.bool(0.22)) {
    const bn = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.34),
      new THREE.MeshStandardMaterial({ map: bedpostNotches(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    bn.name = 'bedpost-notches';
    bn.userData.decalMat = true;
    bn.position.set(rng.bool(0.5) ? 0.42 : -0.42, 0.62, -0.78);
    prop.group.add(bn);
    if (!prop.group.name) prop.group.name = 'bedpost-notches';
  }
  // The basin kept the tide — a scum ring and drainward drips on the
  // bowl that stood full too many times.
  if (spec.kind === 'basinSink' && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const ss = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.22),
      new THREE.MeshStandardMaterial({ map: soapScum(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    ss.name = 'soap-scum';
    ss.userData.decalMat = true;
    ss.rotation.x = -Math.PI / 2;
    ss.position.set(0, (dc?.[1] ?? 0.8) - 0.04, 0.02);
    prop.group.add(ss);
    if (!prop.group.name) prop.group.name = 'soap-scum';
  }
  // The mirror kept the shaver — a hand wiped through the soap film
  // and left the bristles in it.
  if (spec.kind === 'mirror' && rng.bool(0.18)) {
    const sm = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.3),
      new THREE.MeshStandardMaterial({ map: shaverSmear(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sm.name = 'shaver-smear';
    sm.userData.decalMat = true;
    sm.position.set((rng.float() - 0.5) * 0.1, 0.26, 0.043);
    prop.group.add(sm);
    if (!prop.group.name) prop.group.name = 'shaver-smear';
  }
  // The treads wore thin — polished centers and ground noses on
  // steps that carried a million feet.
  if ((spec.kind === 'stairs' || spec.kind === 'stairLanding' || spec.kind === 'grandStair') && rng.bool(0.5)) {
    const sw = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.85),
      new THREE.MeshStandardMaterial({ map: stairWear(rng) ?? undefined, transparent: true, roughness: 0.92, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    sw.name = 'stair-wear';
    sw.userData.decalMat = true;
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(0, 0.36, 0);
    prop.group.add(sw);
    if (!prop.group.name) prop.group.name = 'stair-wear';
  }
  // The counters dripped — spills that escaped the top streak the
  // face below the lip.
  const CASED: ReadonlySet<PropSpec['kind']> = new Set(['cabinet', 'apothecaryCabinet', 'chest', 'dresser', 'drawerUnit', 'sideboard', 'wardrobe', 'vintageCabinet', 'modernCabinet', 'keyCabinet', 'toolChest', 'washStand', 'nightstand', 'vanityTable', 'counter', 'merchantCounter']);
  if (CASED.has(spec.kind) && rng.bool(0.2)) {
    const dc = modelCollider(spec.kind);
    const cd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.5),
      new THREE.MeshStandardMaterial({ map: counterDrips(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    cd.name = 'counter-drips';
    cd.userData.decalMat = true;
    cd.position.set((rng.float() - 0.5) * 0.3, (dc?.[1] ?? 0.9) * 0.55, (dc?.[2] ?? 0.5) / 2 + 0.005);
    prop.group.add(cd);
    if (!prop.group.name) prop.group.name = 'counter-drips';
  }
  // The flour never left — a pale film and kneaded patch on the
  // tops that fed the kitchen.
  const KITCHEN_TOPS: ReadonlySet<PropSpec['kind']> = new Set(['counter', 'merchantCounter', 'breakTable', 'sculleryRack', 'table', 'diningTable', 'picnicTable', 'schoolDesk']);
  if (KITCHEN_TOPS.has(spec.kind) && rng.bool(0.16)) {
    const dc = modelCollider(spec.kind);
    const fd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.44),
      new THREE.MeshStandardMaterial({ map: flourDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    fd.name = 'flour-dust';
    fd.userData.decalMat = true;
    fd.rotation.x = -Math.PI / 2;
    fd.rotation.z = rng.float() * Math.PI * 2;
    fd.position.set((rng.float() - 0.5) * 0.2, (dc?.[1] ?? 0.85) + 0.004, (rng.float() - 0.5) * 0.16);
    prop.group.add(fd);
    if (!prop.group.name) prop.group.name = 'flour-dust';
  }
  // Slept-in — some mattresses keep the shadow of whoever lay too long.
  if (spec.kind === 'bed' && rng.bool(0.3)) {
    const si = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 1.6),
      new THREE.MeshStandardMaterial({ map: sleptIn(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    si.name = 'slept-in';
    si.userData.decalMat = true;
    si.rotation.x = -Math.PI / 2;
    si.rotation.z = (rng.float() - 0.5) * 0.5;
    si.position.set(0, 0.585, 0.1);
    prop.group.add(si);
    if (!prop.group.name) prop.group.name = 'slept-in';
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
