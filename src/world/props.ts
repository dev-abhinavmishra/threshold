/**
 * Procedural prop builders. Every mesh is generated code — no external models.
 * Each builder returns a THREE.Group in local prop space and contributes
 * collision boxes (local, relative to prop origin at floor level).
 */
import * as THREE from 'three';
import type { LocalCollider, PropSpec } from './spec';
import { MAT } from './materials';
import { TEX } from './textures';
import { modelInstance, modelCollider, MODEL_FOR } from './modelLibrary';
import { nightBackdrop, rainStreaks, floorStain, decalQuad, wrongRoom, glassFog, ringStains, sleptIn, scratchWriting, dustDate, paneTape, chairHalo, bedpostNotches, paneWriting, tableScratches, soapScum, shaverSmear, stairWear, counterDrips, flourDust, bathRing, wardrobeDark, bookGap, deskInk, pianoDust, drawerSlit, sheetShape, labelGhost, candleDrip, mirrorBlind, tapCalc, porcelainCraze, chainShine, ropeFray, webDrape, candleSkin, treadShine, mothBites, valanceDust, potRing, lidSteam, rackGhost, caseDust, carpetFray, pinScars, waxRings, clockStopped, shelfLip, railGrime, liftScuff, panelBow, seatWipe, pageFan, paperCurl, sillPeel, drawerScars, ovenGrease, dialRubs, mirrorAmalgam, basinRing, hingeWear, headGrease, seatSag, platenInk, sparkScorch, jarDust, spinDust, counterBelt, bellTap, pewWear, kneelRubs, hatchRing, canvasCrackle, dartSplash, hookRing, rackWeight , canRing, pegWear, extingTag, pinLines, fanFilm, bottleBloom, bustCap, pieceSquares, globeSpin, gateTrack, liftHeels, shutterChain, teaRing, lensVeil, sheetDrag, tubeLip, alarmPull, valveGrip, needleGhost, cableSleeve, keyGhost, vendKick, trapSet, tapeCurl, manifoldRust, craneHook, carVeil, steamBleach, ductSeam, buoyFade, gazeCrack, trophyDust, riggingDust, stencilGhost, weldSpatter, cosmoGrease, flaskRing, blockCuts, torchSoot, cardCurl, labelFade, speakerDust, hoopRust, ashRing, lockerGhost, kettleScale, boardScores, dartHalo, jugSweat, foldPulls, shelfDust, tillScratch, screenGhost, splatFilm, sawdustFan, oilyGrip, haftShine, strapScuff, toeRubs, mailDust, bellThumb, slotScratch, windowLatch, pianoKeys, vaseRing, springDust, ironStamp, seatDust, catHalo, viceJaw, nailSpill, mirrorFox, powderPuff } from './decals';
import { tallFigure } from '../entities/figure';
import type { Rng } from '../engine/rng';

const geoCache = new Map<string, THREE.BufferGeometry>();

// Vendored GLBs report zero-size colliders, so a zero axis means "unknown":
// height falls back to the model's declared display height, other axes to
// the caller's guess. Center-anchored models (wall/ceiling mounts) measure
// vertical offsets from their mid-height, not their base.
const decalDim = (kind: string, dc: [number, number, number] | null, i: 0 | 1 | 2, fb: number) =>
  (dc && dc[i] > 0.01 ? dc[i] : (i === 1 ? MODEL_FOR[kind]?.height : undefined) ?? fb);
const decalY = (kind: string, dc: [number, number, number] | null, frac: number, fb: number) =>
  MODEL_FOR[kind]?.anchor === 'center' ? decalDim(kind, dc, 1, fb) * (frac - 0.5) : decalDim(kind, dc, 1, fb) * frac;


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
    ch.position.set(0, decalY(spec.kind, dc, 0.82, 0.9), -(decalDim(spec.kind, dc, 2, 0.5) * 0.38));
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
    ss.position.set(0, decalY(spec.kind, dc, 1, 0.8) - 0.04, 0.02);
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
    cd.position.set((rng.float() - 0.5) * 0.3, decalY(spec.kind, dc, 0.55, 0.9), decalDim(spec.kind, dc, 2, 0.5) / 2 + 0.005);
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
    fd.position.set((rng.float() - 0.5) * 0.2, decalY(spec.kind, dc, 1, 0.85) + 0.004, (rng.float() - 0.5) * 0.16);
    prop.group.add(fd);
    if (!prop.group.name) prop.group.name = 'flour-dust';
  }
  // The tub kept the ring — a mineral tide line and caught hair on
  // the basin that never drained clean.
  if ((spec.kind === 'basinSink' || spec.kind === 'washStand') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const br = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.2),
      new THREE.MeshStandardMaterial({ map: bathRing(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    br.name = 'bath-ring';
    br.userData.decalMat = true;
    br.position.set(0, decalY(spec.kind, dc, 0.55, 0.6), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.004);
    prop.group.add(br);
    if (!prop.group.name) prop.group.name = 'bath-ring';
  }
  // The wardrobe kept the dark — the crack the light never reached
  // between doors that haven't opened since it arrived.
  if ((spec.kind === 'wardrobe' || spec.kind === 'cabinet' || spec.kind === 'vintageCabinet' || spec.kind === 'apothecaryCabinet' || spec.kind === 'keyCabinet') && rng.bool(0.3)) {
    const dc = modelCollider(spec.kind);
    const wd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.9),
      new THREE.MeshStandardMaterial({ map: wardrobeDark(rng) ?? undefined, transparent: true, roughness: 1, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    wd.name = 'wardrobe-dark';
    wd.userData.decalMat = true;
    wd.position.set(0, decalY(spec.kind, dc, 0.55, 1.8), decalDim(spec.kind, dc, 2, 0.5) / 2 + 0.006);
    prop.group.add(wd);
    if (!prop.group.name) prop.group.name = 'wardrobe-dark';
  }
  // The shelves kept the gaps — dark slots where books were pulled
  // and never came back.
  const BOOKSHELVES: ReadonlySet<PropSpec['kind']> = new Set(['bookshelf', 'stackShelf', 'shelfWood', 'linenShelf', 'pantryShelf', 'shelf', 'bookCart']);
  if (BOOKSHELVES.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.34),
      new THREE.MeshStandardMaterial({ map: bookGap(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    bg.name = 'book-gap';
    bg.userData.decalMat = true;
    bg.position.set((rng.float() - 0.5) * 0.4, decalY(spec.kind, dc, 1, 1.6) * (0.35 + rng.float() * 0.45), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.005);
    prop.group.add(bg);
    if (!prop.group.name) prop.group.name = 'book-gap';
  }
  // The desks kept the ink — blot and nib furrows under the pot.
  const WRITING_TOPS: ReadonlySet<PropSpec['kind']> = new Set(['writingDesk', 'desk', 'catalogueDesk', 'schoolDesk']);
  if (WRITING_TOPS.has(spec.kind) && rng.bool(0.3)) {
    const dc = modelCollider(spec.kind);
    const di = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.44),
      new THREE.MeshStandardMaterial({ map: deskInk(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    di.name = 'desk-ink';
    di.userData.decalMat = true;
    di.rotation.x = -Math.PI / 2;
    di.rotation.z = rng.float() * Math.PI * 2;
    di.position.set((rng.float() - 0.5) * 0.3, decalY(spec.kind, dc, 1, 0.8) + 0.004, (rng.float() - 0.5) * 0.2);
    prop.group.add(di);
    if (!prop.group.name) prop.group.name = 'desk-ink';
  }
  // The pianos kept the dust — a settled film on the closed fall.
  if (spec.kind === 'pianoUpright' && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const pd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.4),
      new THREE.MeshStandardMaterial({ map: pianoDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    pd.name = 'piano-dust';
    pd.userData.decalMat = true;
    pd.rotation.x = -Math.PI / 2;
    pd.position.set(0, decalY(spec.kind, dc, 1, 1.1) + 0.004, 0);
    prop.group.add(pd);
    if (!prop.group.name) prop.group.name = 'piano-dust';
  }
  // The drawers kept their slits — dark gaps and pull grease on
  // fronts that never quite shut.
  const DRAWERS: ReadonlySet<PropSpec['kind']> = new Set(['drawerUnit', 'filing', 'cabinet', 'vintageCabinet', 'apothecaryCabinet', 'dresser', 'chest', 'toolChest', 'morgueDrawer']);
  if (DRAWERS.has(spec.kind) && rng.bool(0.35)) {
    const dc = modelCollider(spec.kind);
    const ds = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.26),
      new THREE.MeshStandardMaterial({ map: drawerSlit(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ds.name = 'drawer-slit';
    ds.userData.decalMat = true;
    ds.position.set((rng.float() - 0.5) * 0.3, decalY(spec.kind, dc, 1, 1.1) * (0.3 + rng.float() * 0.5), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.006);
    prop.group.add(ds);
    if (!prop.group.name) prop.group.name = 'drawer-slit';
  }
  // The sheets kept the shape — the sleeper's faint outline on
  // mattresses and beds that kept one.
  if ((spec.kind === 'bed' || spec.kind === 'bedOld' || spec.kind === 'daybed') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      new THREE.MeshStandardMaterial({ map: sheetShape(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    sh.name = 'sheet-shape';
    sh.userData.decalMat = true;
    sh.rotation.x = -Math.PI / 2;
    sh.rotation.z = rng.float() * Math.PI * 2;
    sh.position.set(0, decalY(spec.kind, dc, 1, 0.5) + 0.004, (rng.float() - 0.5) * 0.3);
    prop.group.add(sh);
    if (!prop.group.name) prop.group.name = 'sheet-shape';
  }
  // The labels peeled — pale ghost grids on apothecary shelves.
  if ((spec.kind === 'apothecaryCabinet' || spec.kind === 'pantryShelf') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const lg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshStandardMaterial({ map: labelGhost(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    lg.name = 'label-ghost';
    lg.userData.decalMat = true;
    lg.position.set((rng.float() - 0.5) * 0.3, decalY(spec.kind, dc, 0.55, 1.4), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.005);
    prop.group.add(lg);
    if (!prop.group.name) prop.group.name = 'label-ghost';
  }
  // The candles dripped — wax trails down holders and pools at
  // their bases.
  const CANDLES: ReadonlySet<PropSpec['kind']> = new Set(['candle', 'candelabra', 'candelabrum', 'mantelClock']);
  if (CANDLES.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const cd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.42),
      new THREE.MeshStandardMaterial({ map: candleDrip(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    cd.name = 'candle-drip';
    cd.userData.decalMat = true;
    cd.position.set(0, decalY(spec.kind, dc, 0.5, 0.3), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(cd);
    if (!prop.group.name) prop.group.name = 'candle-drip';
  }
  // The mirrors blinded — silvering lost to tarnish and fog.
  if (spec.kind === 'mirror' && rng.bool(0.4)) {
    const mb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ map: mirrorBlind(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    mb.name = 'mirror-blind';
    mb.userData.decalMat = true;
    mb.position.set((rng.float() - 0.5) * 0.15, 0.05, 0.048);
    prop.group.add(mb);
    if (!prop.group.name) prop.group.name = 'mirror-blind';
  }
  // The taps calcified — lime crust and verdigris on the spouts.
  if ((spec.kind === 'basinSink' || spec.kind === 'washStand' || spec.kind === 'dishDrainer') && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const tc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.24),
      new THREE.MeshStandardMaterial({ map: tapCalc(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    tc.name = 'tap-calc';
    tc.userData.decalMat = true;
    tc.position.set((rng.float() - 0.5) * 0.1, decalY(spec.kind, dc, 0.55, 0.9), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.006);
    prop.group.add(tc);
    if (!prop.group.name) prop.group.name = 'tap-calc';
  }
  // The porcelain crazed — crackle hairlines and rust bleeds on
  // the basins that held decades of water.
  if ((spec.kind === 'basinSink' || spec.kind === 'washStand') && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const pc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshStandardMaterial({ map: porcelainCraze(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pc.name = 'porcelain-craze';
    pc.userData.decalMat = true;
    pc.rotation.x = -Math.PI / 2;
    pc.position.set(0, decalY(spec.kind, dc, 1, 0.9) - 0.02, 0);
    prop.group.add(pc);
    if (!prop.group.name) prop.group.name = 'porcelain-craze';
  }
  // The chains shone — worn bright lines through the grime where
  // dragged chains rode.
  const CHAINS: ReadonlySet<PropSpec['kind']> = new Set(['chainBulb', 'chainFence', 'ropeBarrier']);
  if (CHAINS.has(spec.kind) && rng.bool(0.4)) {
    const cs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.22),
      new THREE.MeshStandardMaterial({ map: chainShine(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    cs.name = 'chain-shine';
    cs.userData.decalMat = true;
    cs.position.set(0, decalY(spec.kind, modelCollider(spec.kind), 0.4, 0.4), decalDim(spec.kind, modelCollider(spec.kind), 2, 0.3) / 2 + 0.006);
    prop.group.add(cs);
    if (!prop.group.name) prop.group.name = 'chain-shine';
  }
  // The rope frayed — snapped fibers curling off the lay on the
  // barrier ropes that held the line.
  if ((spec.kind === 'ropeBarrier' || spec.kind === 'chainFence') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const rf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.5),
      new THREE.MeshStandardMaterial({ map: ropeFray(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    rf.name = 'rope-fray';
    rf.userData.decalMat = true;
    rf.position.set((rng.float() - 0.5) * 0.2, decalY(spec.kind, dc, 0.55, 0.9), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.005);
    prop.group.add(rf);
    if (!prop.group.name) prop.group.name = 'rope-fray';
  }
  // The webs veiled the tops — thread fans worked between tall
  // furniture and the wall behind it.
  const TALLS: ReadonlySet<PropSpec['kind']> = new Set(['wardrobe', 'bookshelf', 'cabinet', 'vintageCabinet', 'filing', 'drawerUnit', 'dresser', 'grandfatherClock', 'stackShelf']);
  if (TALLS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const wb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: webDrape(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    wb.name = 'web-drape';
    wb.userData.decalMat = true;
    wb.position.set((rng.float() - 0.5) * 0.4, decalY(spec.kind, dc, 1, 1.8) - 0.05, -decalDim(spec.kind, dc, 2, 0.4) / 2 - 0.004);
    prop.group.add(wb);
    if (!prop.group.name) prop.group.name = 'web-drape';
  }
  // The bells kept the thumbs — polished brass and greasy arcs on
  // counter bells rung a thousand times.
  const BELL_TOPS: ReadonlySet<PropSpec['kind']> = new Set(['counterBell', 'writingDesk', 'catalogueDesk', 'dresser', 'nightstand']);
  if (BELL_TOPS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const bt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshStandardMaterial({ map: bellThumb(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    bt.name = 'bell-thumb';
    bt.userData.decalMat = true;
    bt.rotation.x = -Math.PI / 2;
    bt.position.set(0, (dc?.[1] ?? 0.12) + 0.004, 0);
    prop.group.add(bt);
    if (!prop.group.name) prop.group.name = 'bell-thumb';
  }
  // The slots kept the scratches — key arcs and push smudges on the
  // flaps that took the post.
  const SLOTS: ReadonlySet<PropSpec['kind']> = new Set(['dumbWaiterDoor']);
  if (SLOTS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ss = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.36),
      new THREE.MeshStandardMaterial({ map: slotScratch(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ss.name = 'slot-scratch';
    ss.userData.decalMat = true;
    ss.position.set(0, (dc?.[1] ?? 2) * 0.28, (dc?.[2] ?? 0.08) / 2 + 0.006);
    prop.group.add(ss);
    if (!prop.group.name) prop.group.name = 'slot-scratch';
  }
  // The latches kept the thumbs — grease and turn arcs on window
  // latches worked by a thousand hands.
  const LATCHED: ReadonlySet<PropSpec['kind']> = new Set(['window', 'transomWindow', 'traceryWindow', 'windowArch']);
  if (LATCHED.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const wl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.22),
      new THREE.MeshStandardMaterial({ map: windowLatch(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    wl.name = 'window-latch';
    wl.userData.decalMat = true;
    wl.position.set((rng.float() - 0.5) * 0.3, (dc?.[1] ?? 1.6) * 0.45, (dc?.[2] ?? 0.1) / 2 + 0.005);
    prop.group.add(wl);
    if (!prop.group.name) prop.group.name = 'window-latch';
  }
  // The keys kept the shine — ivory edge wear on the piano's fall.
  if (spec.kind === 'pianoUpright' && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const pk = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.28),
      new THREE.MeshStandardMaterial({ map: pianoKeys(rng) ?? undefined, transparent: true, roughness: 0.75, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    pk.name = 'piano-keys';
    pk.userData.decalMat = true;
    pk.position.set(0, (dc?.[1] ?? 1.1) * 0.62, (dc?.[2] ?? 0.6) / 2 + 0.005);
    prop.group.add(pk);
    if (!prop.group.name) prop.group.name = 'piano-keys';
  }
  // The vases kept their rings — moisture circles and shelf dust
  // pushed out from under what stood too long.
  const VASE_TOPS: ReadonlySet<PropSpec['kind']> = new Set(['vase', 'plant', 'planter']);
  if (VASE_TOPS.has(spec.kind) && rng.bool(0.5)) {
    const vr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshStandardMaterial({ map: vaseRing(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    vr.name = 'vase-ring';
    vr.userData.decalMat = true;
    vr.rotation.x = -Math.PI / 2;
    vr.position.set(0, 0.006, 0);
    prop.group.add(vr);
    if (!prop.group.name) prop.group.name = 'vase-ring';
  }
  // The springs shed their dust — rail shadows and coil ghosts on
  // the frames that carried sagging beds.
  const SPRUNG: ReadonlySet<PropSpec['kind']> = new Set(['bed', 'bedOld', 'daybed']);
  if (SPRUNG.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const sd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.22),
      new THREE.MeshStandardMaterial({ map: springDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    sd.name = 'spring-dust';
    sd.userData.decalMat = true;
    sd.position.set(0, (dc?.[1] ?? 0.55) * 0.5, (dc?.[2] ?? 2) / 2 + 0.005);
    prop.group.add(sd);
    if (!prop.group.name) prop.group.name = 'spring-dust';
  }
  // The stoves kept their stamp — maker's plates and rivet ghosts
  // on the cast-iron fronts.
  const STAMPED: ReadonlySet<PropSpec['kind']> = new Set(['stove', 'kitchenRange', 'stoveRange', 'masonryHeater', 'firePit', 'boilerDrum', 'boilerTank']);
  if (STAMPED.has(spec.kind) && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const st = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: ironStamp(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    st.name = 'iron-stamp';
    st.userData.decalMat = true;
    st.position.set((rng.float() - 0.5) * 0.4, (dc?.[1] ?? 0.9) * 0.6, (dc?.[2] ?? 0.6) / 2 + 0.005);
    prop.group.add(st);
    if (!prop.group.name) prop.group.name = 'iron-stamp';
  }
  // The seats kept their dust — undisturbed film on the chairs
  // nobody sat in.
  const SEATED: ReadonlySet<PropSpec['kind']> = new Set(['chair', 'armchair', 'schoolChair', 'diningChair', 'chapelPew', 'pewRow', 'streetSeat', 'bench', 'bedBench', 'stool', 'barStool', 'foldingStool', 'plasticChair', 'wheelchair']);
  if (SEATED.has(spec.kind) && rng.bool(0.3)) {
    const dc = modelCollider(spec.kind);
    const sdz = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.3),
      new THREE.MeshStandardMaterial({ map: seatDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sdz.name = 'seat-dust';
    sdz.userData.decalMat = true;
    sdz.rotation.x = -Math.PI / 2;
    sdz.position.set((rng.float() - 0.5) * 0.15, (dc?.[1] ?? 0.46) * 0.55 + 0.004, (rng.float() - 0.5) * 0.15);
    prop.group.add(sdz);
    if (!prop.group.name) prop.group.name = 'seat-dust';
  }
  // The warm spots kept the cat — curled heat halos on the warm
  // tops where a pet used to sleep.
  const WARM_TOPS: ReadonlySet<PropSpec['kind']> = new Set(['radiatorFin', 'radiatorTall', 'masonryHeater', 'bench', 'bedBench']);
  if (WARM_TOPS.has(spec.kind) && rng.bool(0.3)) {
    const dc = modelCollider(spec.kind);
    const ch = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.26),
      new THREE.MeshStandardMaterial({ map: catHalo(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ch.name = 'cat-halo';
    ch.userData.decalMat = true;
    ch.rotation.x = -Math.PI / 2;
    ch.position.set((rng.float() - 0.5) * 0.4, (dc?.[1] ?? 0.6) + 0.004, (rng.float() - 0.5) * 0.3);
    prop.group.add(ch);
    if (!prop.group.name) prop.group.name = 'cat-halo';
  }
  // The vices kept their jaws — bite marks and filings on the tops
  // of benches and chests that took the grip.
  const VICED: ReadonlySet<PropSpec['kind']> = new Set(['benchVice', 'toolChest', 'toolbox', 'utilityBox', 'toolCart']);
  if (VICED.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const vj = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshStandardMaterial({ map: viceJaw(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    vj.name = 'vice-jaw';
    vj.userData.decalMat = true;
    vj.rotation.x = -Math.PI / 2;
    vj.position.set((rng.float() - 0.5) * 0.2, (dc?.[1] ?? 0.8) + 0.004, (rng.float() - 0.5) * 0.2);
    prop.group.add(vj);
    // the spilled nails
    if (rng.bool(0.4)) {
      const ns = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.28),
        new THREE.MeshStandardMaterial({ map: nailSpill(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      );
      ns.name = 'nail-spill';
      ns.userData.decalMat = true;
      ns.rotation.x = -Math.PI / 2;
      ns.position.set((rng.float() - 0.5) * 0.4, (dc?.[1] ?? 0.8) + 0.005, (rng.float() - 0.5) * 0.4);
      prop.group.add(ns);
    }
    if (!prop.group.name) prop.group.name = 'vice-jaw';
  }
  // The mirrors foxed — desilvered spots blooming on the glass.
  if (spec.kind === 'mirror' && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const mf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.5),
      new THREE.MeshStandardMaterial({ map: mirrorFox(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    mf.name = 'mirror-fox';
    mf.userData.decalMat = true;
    mf.position.set((rng.float() - 0.5) * 0.2, (dc?.[1] ?? 1.2) * 0.55, (dc?.[2] ?? 0.2) / 2 + 0.006);
    prop.group.add(mf);
    if (!prop.group.name) prop.group.name = 'mirror-fox';
  }
  // The vanities kept their powder — talc blooms on the dressing
  // tops where the puff was set down.
  const VANITY: ReadonlySet<PropSpec['kind']> = new Set(['vanityTable', 'dresser', 'nightstand', 'washStand']);
  if (VANITY.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const pp2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshStandardMaterial({ map: powderPuff(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    pp2.name = 'powder-puff';
    pp2.userData.decalMat = true;
    pp2.rotation.x = -Math.PI / 2;
    pp2.position.set((rng.float() - 0.5) * 0.3, (dc?.[1] ?? 0.75) + 0.004, (rng.float() - 0.5) * 0.3);
    prop.group.add(pp2);
    if (!prop.group.name) prop.group.name = 'powder-puff';
  }
  // The candles shed their skins — collapsed wax shells on the
  // holders that burned all the way down.
  const BURNED_CANDLES: ReadonlySet<PropSpec['kind']> = new Set(['candle', 'candelabra', 'candelabrum', 'lantern', 'wallLantern']);
  if (BURNED_CANDLES.has(spec.kind) && rng.bool(0.35)) {
    const cs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.36),
      new THREE.MeshStandardMaterial({ map: candleSkin(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    cs.name = 'candle-skin';
    cs.userData.decalMat = true;
    cs.position.set(0, 0.17, decalDim(spec.kind, modelCollider(spec.kind), 2, 0.15) / 2 + 0.006);
    prop.group.add(cs);
    if (!prop.group.name) prop.group.name = 'candle-skin';
  }
  // The treads kept the shine — polished lanes and heel chips on
  // the stairs that carried the house's weight.
  if ((spec.kind === 'stairs' || spec.kind === 'stairLanding' || spec.kind === 'grandStair') && rng.bool(0.5)) {
    const ts = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshStandardMaterial({ map: treadShine(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ts.name = 'tread-shine';
    ts.userData.decalMat = true;
    ts.rotation.x = -Math.PI / 2;
    ts.rotation.z = rng.float() * Math.PI * 2;
    ts.position.set((rng.float() - 0.5) * 0.4, spec.kind === 'stairLanding' ? 0.02 : 0.16, (rng.float() - 0.5) * 0.4);
    prop.group.add(ts);
    if (!prop.group.name) prop.group.name = 'tread-shine';
  }
  // The moths ate the drapes — chewed voids and shed scales on
  // hanging curtains.
  const DRAPES: ReadonlySet<PropSpec['kind']> = new Set(['curtain', 'curtainLong', 'drapePanel', 'curtainSwag']);
  if (DRAPES.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const mb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ map: mothBites(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    mb.name = 'moth-bites';
    mb.userData.decalMat = true;
    mb.position.set((rng.float() - 0.5) * 0.3, decalY(spec.kind, dc, 1, 2) * (0.2 + rng.float() * 0.5), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(mb);
    if (!prop.group.name) prop.group.name = 'moth-bites';
  }
  // The valances kept the dust — a grey film on curtain headers.
  if (DRAPES.has(spec.kind) && rng.bool(0.35)) {
    const dc = modelCollider(spec.kind);
    const vd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.18),
      new THREE.MeshStandardMaterial({ map: valanceDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    vd.name = 'valance-dust';
    vd.userData.decalMat = true;
    vd.position.set(0, decalY(spec.kind, dc, 1, 2) - 0.06, decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(vd);
    if (!prop.group.name) prop.group.name = 'valance-dust';
  }
  // The pots kept their rings — scorch brands on worktops the
  // kitchen put down hot.
  const POT_TOPS: ReadonlySet<PropSpec['kind']> = new Set(['table', 'diningTable', 'counter', 'merchantCounter', 'breakTable', 'stove', 'stoveRange', 'kitchenRange']);
  if (POT_TOPS.has(spec.kind) && rng.bool(0.25)) {
    const dc = modelCollider(spec.kind);
    const pr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: potRing(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pr.name = 'pot-ring';
    pr.userData.decalMat = true;
    pr.rotation.x = -Math.PI / 2;
    pr.rotation.z = rng.float() * Math.PI * 2;
    pr.position.set((rng.float() - 0.5) * 0.4, decalY(spec.kind, dc, 1, 0.85) + 0.005, (rng.float() - 0.5) * 0.3);
    prop.group.add(pr);
    if (!prop.group.name) prop.group.name = 'pot-ring';
  }
  // The lids kept the steam — wet rings and drip beads under the
  // lidded pots and kettles.
  const LIDDED: ReadonlySet<PropSpec['kind']> = new Set(['brassPot', 'enamelPot', 'pan', 'kettle', 'jug']);
  if (LIDDED.has(spec.kind) && rng.bool(0.45)) {
    const ls = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshStandardMaterial({ map: lidSteam(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ls.name = 'lid-steam';
    ls.userData.decalMat = true;
    ls.rotation.x = -Math.PI / 2;
    ls.position.set((rng.float() - 0.5) * 0.2, 0.002, (rng.float() - 0.5) * 0.2);
    prop.group.add(ls);
    if (!prop.group.name) prop.group.name = 'lid-steam';
  }
  // The wine kept the rack — bottle rings and drip stains on the
  // racks that held the cellar.
  if ((spec.kind === 'wineRack' || spec.kind === 'wineBarrel' || spec.kind === 'barrel') && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const rg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.45),
      new THREE.MeshStandardMaterial({ map: rackGhost(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    rg.name = 'rack-ghost';
    rg.userData.decalMat = true;
    rg.position.set(0, decalY(spec.kind, dc, 0.6, 1.4), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.006);
    prop.group.add(rg);
    if (!prop.group.name) prop.group.name = 'rack-ghost';
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
  // Filmed over — display cases keep a dust film with one wiped arc
  // where somebody last looked inside.
  if (spec.kind === 'displayCase' && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const cd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshStandardMaterial({ map: caseDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    cd.name = 'case-dust';
    cd.userData.decalMat = true;
    cd.position.set(0, decalY(spec.kind, dc, 0.62, 1.2), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.006);
    prop.group.add(cd);
    if (!prop.group.name) prop.group.name = 'case-dust';
  }
  // The rug frayed — loose threads and a worn binding along one edge.
  if ((spec.kind === 'rug') && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const cf = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.35),
      new THREE.MeshStandardMaterial({ map: carpetFray(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    cf.name = 'carpet-fray';
    cf.userData.decalMat = true;
    cf.rotation.x = -Math.PI / 2;
    cf.position.set(0, 0.024, decalDim(spec.kind, dc, 2, 1.2) / 2 + 0.06);
    prop.group.add(cf);
    if (!prop.group.name) prop.group.name = 'carpet-fray';
  }
  // The board kept the holes — pin pocks and paper ghosts on the
  // felt long after the notices came down.
  if (spec.kind === 'board' && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ps = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshStandardMaterial({ map: pinScars(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ps.name = 'pin-scars';
    ps.userData.decalMat = true;
    ps.position.set(0, decalY(spec.kind, dc, 0.55, 1.2), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(ps);
    if (!prop.group.name) prop.group.name = 'pin-scars';
  }
  // The table kept its rings — glass rings and a polish bloom on
  // the tops that held glasses and plates for decades.
  const TABLE_TOPS = new Set(['diningTable', 'consoleTable', 'roundTable', 'breakTable', 'coffeeTable', 'picnicTable']);
  if (TABLE_TOPS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const wr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshStandardMaterial({ map: waxRings(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    wr.name = 'wax-rings';
    wr.userData.decalMat = true;
    wr.rotation.x = -Math.PI / 2;
    wr.rotation.z = rng.float() * Math.PI * 2;
    wr.position.set(0, decalY(spec.kind, dc, 1, 0.75) + 0.006, 0);
    prop.group.add(wr);
    if (!prop.group.name) prop.group.name = 'wax-rings';
  }
  // The clock stopped — dust film and frozen hands on the faces
  // that haven't counted an hour in years.
  const CLOCK_FACES = new Set(['grandfatherClock', 'wallClock', 'mantelClock', 'clock', 'alarmClock']);
  if (CLOCK_FACES.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const cs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshStandardMaterial({ map: clockStopped(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    cs.name = 'clock-stopped';
    cs.userData.decalMat = true;
    cs.position.set(0, decalY(spec.kind, dc, 0.72, 1.6), decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.006);
    prop.group.add(cs);
    prop.group.traverse((o) => { if (o.userData.anim) o.userData.anim = undefined; });
    if (!prop.group.name) prop.group.name = 'clock-stopped';
  }
  // The shelf lip kept the dust — a grey line on the front edge,
  // broken by the finger wipes of whoever last reached past.
  const SHELF_KINDS = new Set(['shelf', 'bookshelf', 'shelfWood', 'stackShelf', 'linenShelf', 'pantryShelf']);
  if (SHELF_KINDS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const sl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.3),
      new THREE.MeshStandardMaterial({ map: shelfLip(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    sl.name = 'shelf-lip';
    sl.userData.decalMat = true;
    sl.position.set(0, decalY(spec.kind, dc, 0.55, 1.6), decalDim(spec.kind, dc, 2, 0.35) / 2 + 0.006);
    prop.group.add(sl);
    if (!prop.group.name) prop.group.name = 'shelf-lip';
  }
  // The rail kept the hands — a darkened grip band worn into the
  // handrail where decades of hands slid down.
  if (spec.kind === 'railing' && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const rgm = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.3),
      new THREE.MeshStandardMaterial({ map: railGrime(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    rgm.name = 'rail-grime';
    rgm.userData.decalMat = true;
    rgm.rotation.x = -Math.PI / 2;
    rgm.position.set(0, decalY(spec.kind, dc, 1, 0.9) + 0.006, 0);
    prop.group.add(rgm);
    if (!prop.group.name) prop.group.name = 'rail-grime';
  }
  // The doors took the boots — heel scuffs and finger drags on the
  // metal leaves of the lifts and shutters.
  const METAL_DOORS = new Set(['liftDoors', 'dumbWaiterDoor', 'shutterDoor']);
  if (METAL_DOORS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ls = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshStandardMaterial({ map: liftScuff(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ls.name = 'lift-scuff';
    ls.userData.decalMat = true;
    ls.position.set(0, decalY(spec.kind, dc, 0.5, 1.8), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(ls);
    if (!prop.group.name) prop.group.name = 'lift-scuff';
  }
  // The panels bowed — a belly shadow and sprung nail heads where
  // the boards pulled away from the frame.
  const PANEL_KINDS = new Set(['wallPanel', 'woodPanel', 'screenPanels', 'hangingPanels']);
  if (PANEL_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const pb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshStandardMaterial({ map: panelBow(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pb.name = 'panel-bow';
    pb.userData.decalMat = true;
    pb.position.set(0, decalY(spec.kind, dc, 0.5, 1.4), decalDim(spec.kind, dc, 2, 0.12) / 2 + 0.006);
    prop.group.add(pb);
    if (!prop.group.name) prop.group.name = 'panel-bow';
  }
  // Someone sat — seat dust broken by one clean wipe where a body
  // last landed and steadied itself.
  const SEAT_KINDS = new Set(['armchair', 'chair', 'bench', 'stool']);
  if (SEAT_KINDS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const sw = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshStandardMaterial({ map: seatWipe(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    sw.name = 'seat-wipe';
    sw.userData.decalMat = true;
    sw.rotation.x = -Math.PI / 2;
    sw.rotation.z = (rng.float() - 0.5) * 0.6;
    sw.position.set(0, decalY(spec.kind, dc, 0.52, 0.9), 0);
    prop.group.add(sw);
    if (!prop.group.name) prop.group.name = 'seat-wipe';
  }
  // The book dried open — warped covers and a dead page fan on the
  // books nobody closed.
  if ((spec.kind === 'books' || spec.kind === 'bookCart') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const pf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.34),
      new THREE.MeshStandardMaterial({ map: pageFan(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pf.name = 'page-fan';
    pf.userData.decalMat = true;
    pf.rotation.x = -Math.PI / 2;
    pf.position.set(0, decalY(spec.kind, dc, 1, 0.5) + 0.006, 0);
    prop.group.add(pf);
    if (!prop.group.name) prop.group.name = 'page-fan';
  }
  // The pages curled — damp pulled the corners up and ran the ink
  // on the loose paperwork.
  const PAPER_KINDS = new Set(['papers', 'paperStack', 'paperScatter', 'paper']);
  if (PAPER_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const pc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ map: paperCurl(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pc.name = 'paper-curl';
    pc.userData.decalMat = true;
    pc.rotation.x = -Math.PI / 2;
    pc.rotation.z = rng.float() * Math.PI * 2;
    pc.position.set(0, decalY(spec.kind, dc, 1, 0.2) + 0.006, 0);
    prop.group.add(pc);
    if (!prop.group.name) prop.group.name = 'paper-curl';
  }
  // The sill peeled — flakes curling off the board where the weather
  // got at it, damp trails dropping under the lip.
  const WINDOW_KINDS = new Set(['window', 'windowArch', 'transomWindow', 'roseWindow', 'traceryWindow']);
  if (WINDOW_KINDS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const sp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshStandardMaterial({ map: sillPeel(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    sp.name = 'sill-peel';
    sp.userData.decalMat = true;
    sp.position.set(0, decalY(spec.kind, dc, 0.22, 1.6), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(sp);
    if (!prop.group.name) prop.group.name = 'sill-peel';
  }
  // The drawers kept the scratches — ring-pull rubs, scuffed fronts,
  // dust packed into the seams.
  const DRAWER_KINDS = new Set(['dresser', 'nightstand', 'drawerUnit', 'sideboard', 'chest', 'toolChest', 'morgueDrawer', 'vanityTable']);
  if (DRAWER_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const ds = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshStandardMaterial({ map: drawerScars(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ds.name = 'drawer-scars';
    ds.userData.decalMat = true;
    ds.position.set(0, decalY(spec.kind, dc, 0.55, 0.9), decalDim(spec.kind, dc, 2, 0.5) / 2 + 0.006);
    prop.group.add(ds);
    if (!prop.group.name) prop.group.name = 'drawer-scars';
  }
  // The range kept its grease — spatter burst and fat drips on the
  // oven door face.
  const RANGE_KINDS = new Set(['stove', 'stoveRange', 'kitchenRange']);
  if (RANGE_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const og = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.44),
      new THREE.MeshStandardMaterial({ map: ovenGrease(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    og.name = 'oven-grease';
    og.userData.decalMat = true;
    og.position.set(0, decalY(spec.kind, dc, 0.5, 0.9), decalDim(spec.kind, dc, 2, 0.6) / 2 + 0.006);
    prop.group.add(og);
    if (!prop.group.name) prop.group.name = 'oven-grease';
  }
  // The dial kept the thumb — a polish halo broken out of the dust
  // where one hand always found the tuner.
  const DIAL_KINDS = new Set(['radio', 'boombox', 'cassettePlayer']);
  if (DIAL_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const dr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.28),
      new THREE.MeshStandardMaterial({ map: dialRubs(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    dr.name = 'dial-rubs';
    dr.userData.decalMat = true;
    dr.position.set(0, decalY(spec.kind, dc, 0.55, 0.35), decalDim(spec.kind, dc, 2, 0.25) / 2 + 0.005);
    prop.group.add(dr);
    if (!prop.group.name) prop.group.name = 'dial-rubs';
  }
  // The mirror crept — amalgam eating in from the edges and corners.
  if ((spec.kind === 'mirror' || spec.kind === 'pierMirror') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const ma = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshStandardMaterial({ map: mirrorAmalgam(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ma.name = 'mirror-amalgam';
    ma.userData.decalMat = true;
    ma.position.set(0, decalY(spec.kind, dc, 0.5, 1.4), decalDim(spec.kind, dc, 2, 0.08) / 2 + 0.005);
    prop.group.add(ma);
    if (!prop.group.name) prop.group.name = 'mirror-amalgam';
  }
  // The basin kept its ring — limescale tide line and scum film in
  // the bowl where the water always stops.
  if ((spec.kind === 'basinSink' || spec.kind === 'washStand') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const br = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: basinRing(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    br.name = 'basin-ring';
    br.userData.decalMat = true;
    br.rotation.x = -Math.PI / 2;
    br.position.set(0, decalY(spec.kind, dc, 1, 0.8) + 0.005, 0);
    prop.group.add(br);
    if (!prop.group.name) prop.group.name = 'basin-ring';
  }
  // The hinge wore the frame — swing rub, finger grime and nail
  // crescents on the cabinet fronts that get opened.
  const CABINET_KINDS = new Set(['cabinet', 'modernCabinet', 'vintageCabinet', 'apothecaryCabinet', 'keyCabinet', 'wardrobe', 'locker', 'cageLocker']);
  if (CABINET_KINDS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const hw = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.42),
      new THREE.MeshStandardMaterial({ map: hingeWear(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    hw.name = 'hinge-wear';
    hw.userData.decalMat = true;
    hw.position.set(0, decalY(spec.kind, dc, 0.55, 1.3), decalDim(spec.kind, dc, 2, 0.45) / 2 + 0.006);
    prop.group.add(hw);
    if (!prop.group.name) prop.group.name = 'hinge-wear';
  }
  // The head kept its oil — a dark bloom on the headboard where the
  // same head rested a thousand nights.
  const HEAD_KINDS = new Set(['headboard', 'bed', 'bedOld', 'daybed']);
  if (HEAD_KINDS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const hg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.45),
      new THREE.MeshStandardMaterial({ map: headGrease(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    hg.name = 'head-grease';
    hg.userData.decalMat = true;
    hg.position.set(0, decalY(spec.kind, dc, 0.75, 1.1), spec.kind === 'headboard' ? decalDim(spec.kind, dc, 2, 0.2) / 2 + 0.015 : -decalDim(spec.kind, dc, 2, 1.8) / 2 + 0.12);
    prop.group.add(hg);
    if (!prop.group.name) prop.group.name = 'head-grease';
  }
  // The cushions learned the body — a settle-dip, pulled buttons and
  // the crumb line on seats that get sat in.
  const SAG_KINDS = new Set(['sofa', 'settee', 'armchair', 'daybed']);
  if (SAG_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const sg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshStandardMaterial({ map: seatSag(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    sg.name = 'seat-sag';
    sg.userData.decalMat = true;
    sg.rotation.x = -Math.PI / 2;
    sg.position.set(0, spec.kind === 'sofa' ? 0.5 : decalY(spec.kind, dc, 0.55, 0.85) + 0.006, 0);
    prop.group.add(sg);
    if (!prop.group.name) prop.group.name = 'seat-sag';
  }
  // The ribbon kept the words — an ink halo and ghosted lines on
  // the typewriter platen.
  if (spec.kind === 'typewriter' && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const pi = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.28),
      new THREE.MeshStandardMaterial({ map: platenInk(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pi.name = 'platen-ink';
    pi.userData.decalMat = true;
    pi.position.set(0, decalY(spec.kind, dc, 0.7, 0.25), decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.005);
    prop.group.add(pi);
    if (!prop.group.name) prop.group.name = 'platen-ink';
  }
  // The breaker kept the burn — a carbon bloom on the panel face
  // where a fuse let go, smuts where fingers reset the rest.
  if (spec.kind === 'breakerPanel' && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ss = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ map: sparkScorch(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ss.name = 'spark-scorch';
    ss.userData.decalMat = true;
    ss.position.set(0, decalY(spec.kind, dc, 0.55, 1.4), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(ss);
    if (!prop.group.name) prop.group.name = 'spark-scorch';
  }
  // The jars kept their dust — shoulder film and a lid cap on the
  // bottles and jugs nobody lifts.
  const JAR_KINDS = new Set(['gallonJug', 'brassPot', 'enamelPot', 'bleachBottle', 'cleanerBottle', 'foodCans', 'vase']);
  if (JAR_KINDS.has(spec.kind) && rng.bool(0.4)) {
    const dc = modelCollider(spec.kind);
    const jd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.24),
      new THREE.MeshStandardMaterial({ map: jarDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    jd.name = 'jar-dust';
    jd.userData.decalMat = true;
    jd.position.set(0, decalY(spec.kind, dc, 0.6, 0.35), decalDim(spec.kind, dc, 2, 0.25) / 2 + 0.005);
    prop.group.add(jd);
    if (!prop.group.name) prop.group.name = 'jar-dust';
  }
  // The wheel shed its wool — lanolin film and fiber wisps on the
  // spinning wheels nobody turns anymore.
  if (spec.kind === 'spinningWheel' && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const sd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.34),
      new THREE.MeshStandardMaterial({ map: spinDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    sd.name = 'spin-dust';
    sd.userData.decalMat = true;
    sd.position.set(0, decalY(spec.kind, dc, 0.6, 0.9), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.005);
    prop.group.add(sd);
    if (!prop.group.name) prop.group.name = 'spin-dust';
  }
  // The counter kept the coins — slide scratches and elbow polish
  // on counters that took payment for years.
  const COUNTER_KINDS = new Set(['counter', 'merchantCounter']);
  if (COUNTER_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const cb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.45),
      new THREE.MeshStandardMaterial({ map: counterBelt(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    cb.name = 'counter-belt';
    cb.userData.decalMat = true;
    cb.rotation.x = -Math.PI / 2;
    cb.position.set(0, spec.kind === 'merchantCounter' ? 1.19 : decalY(spec.kind, dc, 1, 0.9) + 0.006, 0);
    prop.group.add(cb);
    if (!prop.group.name) prop.group.name = 'counter-belt';
  }
  // The bell dulled — a palm cap on the counter bells that still
  // get rung for nobody.
  if (spec.kind === 'counterBell') {
    const dc = modelCollider(spec.kind);
    const bt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshStandardMaterial({ map: bellTap(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    bt.name = 'bell-tap';
    bt.userData.decalMat = true;
    bt.rotation.x = -Math.PI / 2;
    bt.position.set(0, decalY(spec.kind, dc, 1, 0.1) + 0.004, 0);
    prop.group.add(bt);
    if (!prop.group.name) prop.group.name = 'bell-tap';
  }
  // The pews wore the knees — sit-shine, shin kicks and a hymnal
  // groove on the bench fronts.
  if ((spec.kind === 'chapelPew' || spec.kind === 'pewRow') && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const pw = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.4),
      new THREE.MeshStandardMaterial({ map: pewWear(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pw.name = 'pew-wear';
    pw.userData.decalMat = true;
    pw.position.set(0, decalY(spec.kind, dc, 0.5, 0.6), decalDim(spec.kind, dc, 2, 0.5) / 2 + 0.006);
    prop.group.add(pw);
    if (!prop.group.name) prop.group.name = 'pew-wear';
  }
  // The kneeler kept the weight — elbow cups on the rail, knee dents
  // in the pad.
  if (spec.kind === 'prayerKneeler' && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const kr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.42),
      new THREE.MeshStandardMaterial({ map: kneelRubs(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    kr.name = 'kneel-rubs';
    kr.userData.decalMat = true;
    kr.position.set(0, decalY(spec.kind, dc, 0.55, 0.7), decalDim(spec.kind, dc, 2, 0.5) / 2 + 0.006);
    prop.group.add(kr);
    if (!prop.group.name) prop.group.name = 'kneel-rubs';
  }
  // The hatch kept its ring — pull-ring rust and the seam's dust
  // frame on hatches nobody opens.
  if (spec.kind === 'hatch' && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const hr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshStandardMaterial({ map: hatchRing(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    hr.name = 'hatch-ring';
    hr.userData.decalMat = true;
    hr.position.set(0, decalY(spec.kind, dc, 0.5, 1.0), decalDim(spec.kind, dc, 2, 0.12) / 2 + 0.006);
    prop.group.add(hr);
    if (!prop.group.name) prop.group.name = 'hatch-ring';
  }
  // The canvas crackled — age craquelure and slack shadow on the
  // paintings and portraits.
  const CANVAS_KINDS = new Set(['painting', 'hauntedPortrait', 'standingFrame', 'frameStand']);
  if (CANVAS_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const cc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshStandardMaterial({ map: canvasCrackle(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    cc.name = 'canvas-crackle';
    cc.userData.decalMat = true;
    cc.position.set(0, decalY(spec.kind, dc, 0.5, 1.4), decalDim(spec.kind, dc, 2, 0.08) / 2 + 0.005);
    prop.group.add(cc);
    if (!prop.group.name) prop.group.name = 'canvas-crackle';
  }
  // The darts missed the board — a pocked halo on the wall face
  // around the target.
  if (spec.kind === 'dartboard' && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ds = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshStandardMaterial({ map: dartSplash(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ds.name = 'dart-splash';
    ds.userData.decalMat = true;
    ds.position.set(0, decalY(spec.kind, dc, 0.5, 1.6), decalDim(spec.kind, dc, 2, 0.08) / 2 + 0.006);
    prop.group.add(ds);
    if (!prop.group.name) prop.group.name = 'dart-splash';
  }
  // The hooks rusted rings — oxide halos and drip threads on the
  // hanging hooks.
  const HOOK_KINDS = new Set(['meatHook', 'ceilingHook']);
  if (HOOK_KINDS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const hk = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.28),
      new THREE.MeshStandardMaterial({ map: hookRing(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    hk.name = 'hook-ring';
    hk.userData.decalMat = true;
    hk.position.set(0, decalY(spec.kind, dc, 0.6, 0.6), decalDim(spec.kind, dc, 2, 0.2) / 2 + 0.005);
    prop.group.add(hk);
    if (!prop.group.name) prop.group.name = 'hook-ring';
  }
  // The racks remembered weight — sag shadow and load dents on the
  // racks holding cases and keys.
  const RACK_KINDS = new Set(['luggageRack', 'keyRack']);
  if (RACK_KINDS.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const rw = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.4),
      new THREE.MeshStandardMaterial({ map: rackWeight(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    rw.name = 'rack-weight';
    rw.userData.decalMat = true;
    rw.position.set(0, decalY(spec.kind, dc, 0.55, 1.5), decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.006);
    prop.group.add(rw);
    if (!prop.group.name) prop.group.name = 'rack-weight';
  }
  // The cans ringed rust — orange circles under the tins that sat
  // too long on their shelves.
  const CANS: ReadonlySet<PropSpec['kind']> = new Set(['foodCans', 'oilCan', 'oilTin', 'rustCan', 'sprayCans', 'wateringCan', 'jerrycan', 'jerrycanP']);
  if (CANS.has(spec.kind) && rng.bool(0.45)) {
    const cr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshStandardMaterial({ map: canRing(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    cr.name = 'can-ring';
    cr.userData.decalMat = true;
    cr.rotation.x = -Math.PI / 2;
    cr.position.set((rng.float() - 0.5) * 0.15, 0.003, (rng.float() - 0.5) * 0.15);
    prop.group.add(cr);
    if (!prop.group.name) prop.group.name = 'can-ring';
  }
  // The pegs shone — rubbed tips and sag shadows on rails that
  // carried coats every day.
  if ((spec.kind === 'pegRail' || spec.kind === 'towelRail' || spec.kind === 'ceilingHook') && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const pw = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.28),
      new THREE.MeshStandardMaterial({ map: pegWear(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    pw.name = 'peg-wear';
    pw.userData.decalMat = true;
    pw.position.set((rng.float() - 0.5) * 0.3, decalY(spec.kind, dc, 0.55, 0.9), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.006);
    prop.group.add(pw);
    if (!prop.group.name) prop.group.name = 'peg-wear';
  }
  // The extinguishers kept their tag — red pull slivers and slack
  // strings on the ones nobody ever pulled.
  if (spec.kind === 'extinguisher' && rng.bool(0.55)) {
    const et = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.3),
      new THREE.MeshStandardMaterial({ map: extingTag(rng) ?? undefined, transparent: true, roughness: 0.85, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    et.name = 'exting-tag';
    et.userData.decalMat = true;
    et.position.set(0.04, decalY(spec.kind, modelCollider(spec.kind), 0.5, 0.6), 0.09);
    prop.group.add(et);
    if (!prop.group.name) prop.group.name = 'exting-tag';
  }
  // The routing board kept its pins — tally strings strung between
  // holes in rough rows.
  if (spec.kind === 'routingBoard') {
    const pl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ map: pinLines(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    pl.name = 'pin-lines';
    pl.userData.decalMat = true;
    pl.position.set((rng.float() - 0.5) * 0.2, decalY(spec.kind, modelCollider(spec.kind), 0.55, 1.3), decalDim(spec.kind, modelCollider(spec.kind), 2, 0.16) / 2 + 0.012);
    prop.group.add(pl);
    if (!prop.group.name) prop.group.name = 'pin-lines';
  }
  // The fans kept their blades — dust films on the sweeps no one
  // wiped.
  if ((spec.kind === 'fan' || spec.kind === 'ceilingFan') && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ff = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ map: fanFilm(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    );
    ff.name = 'fan-film';
    ff.userData.decalMat = true;
    if (spec.kind === 'ceilingFan') {
      ff.rotation.x = Math.PI / 2;
      ff.position.set(0, -0.15, 0);
    } else {
      ff.position.set(0, decalY(spec.kind, dc, 0.6, 1.6), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.005);
    }
    prop.group.add(ff);
    if (!prop.group.name) prop.group.name = 'fan-film';
  }
  // The bottles bloomed — dust films and drip ghosts on stored
  // bottles.
  const BOTTLES: ReadonlySet<PropSpec['kind']> = new Set(['wineBottles', 'bleachBottle', 'cleanerBottle', 'thermos', 'vase']);
  if (BOTTLES.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const bb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.3),
      new THREE.MeshStandardMaterial({ map: bottleBloom(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    bb.name = 'bottle-bloom';
    bb.userData.decalMat = true;
    bb.position.set((rng.float() - 0.5) * 0.15, decalY(spec.kind, dc, 0.55, 0.3), decalDim(spec.kind, dc, 2, 0.12) / 2 + 0.004);
    prop.group.add(bb);
    if (!prop.group.name) prop.group.name = 'bottle-bloom';
  }
  // The busts kept their caps — crown film, shoulder ledges and a
  // clean nose where hands steadied them.
  const BUSTS: ReadonlySet<PropSpec['kind']> = new Set(['bust', 'marbleBust', 'galleryStatue', 'hallFigure']);
  if (BUSTS.has(spec.kind) && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const bc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.45),
      new THREE.MeshStandardMaterial({ map: bustCap(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    bc.name = 'bust-cap';
    bc.userData.decalMat = true;
    bc.position.set(0, decalY(spec.kind, dc, 0.72, 1.4), decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.005);
    prop.group.add(bc);
    if (!prop.group.name) prop.group.name = 'bust-cap';
  }
  // The board kept its squares — clean cells in the dust where the
  // pieces stood.
  const BOARDS: ReadonlySet<PropSpec['kind']> = new Set(['chessSet', 'boardGame']);
  if (BOARDS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const ps = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: pieceSquares(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ps.name = 'piece-squares';
    ps.userData.decalMat = true;
    ps.rotation.x = -Math.PI / 2;
    ps.position.set(0, decalY(spec.kind, dc, 1, 0.08) + 0.004, 0);
    prop.group.add(ps);
    if (!prop.group.name) prop.group.name = 'piece-squares';
  }
  // The globe kept the spins — thumb-polish bands at the waist,
  // dust on the cap and foot.
  if (spec.kind === 'globeStand' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const gs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.5),
      new THREE.MeshStandardMaterial({ map: globeSpin(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    gs.name = 'globe-spin';
    gs.userData.decalMat = true;
    gs.position.set(0, decalY(spec.kind, dc, 0.6, 0.9), decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.005);
    prop.group.add(gs);
    if (!prop.group.name) prop.group.name = 'globe-spin';
  }
  // The gates kept their tracks — rub lines and wheel grease
  // under sliding gates.
  const GATES: ReadonlySet<PropSpec['kind']> = new Set(['scissorgate', 'ironGate', 'portcullis', 'gateLatch']);
  if (GATES.has(spec.kind) && rng.bool(0.6)) {
    const gt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.45),
      new THREE.MeshStandardMaterial({ map: gateTrack(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    gt.name = 'gate-track';
    gt.userData.decalMat = true;
    gt.rotation.x = -Math.PI / 2;
    gt.position.set(0, 0.006 - (spec.y ?? 0), 0);
    prop.group.add(gt);
    if (!prop.group.name) prop.group.name = 'gate-track';
  }
  // The lift kept its heels — heel arcs at the sill, finger smears
  // on the leaf.
  const LIFTS: ReadonlySet<PropSpec['kind']> = new Set(['freightLift', 'liftDoors', 'dumbwaiter', 'dumbWaiterDoor']);
  if (LIFTS.has(spec.kind) && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const lh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ map: liftHeels(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    lh.name = 'lift-heels';
    lh.userData.decalMat = true;
    lh.position.set(0, decalY(spec.kind, dc, 0.45, 1.8), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.005);
    prop.group.add(lh);
    if (!prop.group.name) prop.group.name = 'lift-heels';
  }
  // The shutters kept their chains — a polished run down the
  // jamb where the haul chain slides.
  const SHUTTERS: ReadonlySet<PropSpec['kind']> = new Set(['rollerShutter', 'shutterDoor']);
  if (SHUTTERS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const sc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.5),
      new THREE.MeshStandardMaterial({ map: shutterChain(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sc.name = 'shutter-chain';
    sc.userData.decalMat = true;
    sc.position.set(decalDim(spec.kind, dc, 0, 0.8) / 2 - 0.08, decalY(spec.kind, dc, 0.55, 1.6), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.005);
    prop.group.add(sc);
    if (!prop.group.name) prop.group.name = 'shutter-chain';
  }
  // The tea kept its ring — tannin tides in the forgotten cups.
  if (spec.kind === 'teaSet' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const tr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshStandardMaterial({ map: teaRing(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    tr.name = 'tea-ring';
    tr.userData.decalMat = true;
    tr.rotation.x = -Math.PI / 2;
    tr.position.set(0, decalY(spec.kind, dc, 0.55, 0.1), 0);
    prop.group.add(tr);
    if (!prop.group.name) prop.group.name = 'tea-ring';
  }
  // The lens kept its veil — fog and web film on the watched
  // glass.
  const CAMS: ReadonlySet<PropSpec['kind']> = new Set(['securityCam', 'vidCamera', 'camera']);
  if (CAMS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const lv = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshStandardMaterial({ map: lensVeil(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    lv.name = 'lens-veil';
    lv.userData.decalMat = true;
    lv.position.set(0, decalY(spec.kind, dc, 0.62, 0.22), decalDim(spec.kind, dc, 2, 0.2) / 2 + 0.004);
    prop.group.add(lv);
    if (!prop.group.name) prop.group.name = 'lens-veil';
  }
  // The mangle kept the sheet — drag streaks and starch ghosts in
  // the feed.
  if (spec.kind === 'manglePress' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const sd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.3),
      new THREE.MeshStandardMaterial({ map: sheetDrag(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sd.name = 'sheet-drag';
    sd.userData.decalMat = true;
    sd.rotation.x = -Math.PI / 2;
    sd.position.set(0, decalY(spec.kind, dc, 1, 0.9) + 0.004, 0);
    prop.group.add(sd);
    if (!prop.group.name) prop.group.name = 'sheet-drag';
  }
  // The tube kept the voice — lip polish and breath tarnish on the
  // speaking tubes. A singleton prop (the custodian's only tube), so no
  // gate: the builder rng is index-seeded, not seed-seeded — a gate that
  // lands cold stays cold on every seed.
  if (spec.kind === 'speakingTube') {
    const dc = modelCollider(spec.kind);
    const tl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.22),
      new THREE.MeshStandardMaterial({ map: tubeLip(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    tl.name = 'tube-lip';
    tl.userData.decalMat = true;
    tl.position.set(0, 1.65, decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.004);
    prop.group.add(tl);
    if (!prop.group.name) prop.group.name = 'tube-lip';
  }
  // The alarm kept the pull — finger grease and glass dust on the
  // fire alarms.
  if (spec.kind === 'fireAlarm' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const ap = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.26),
      new THREE.MeshStandardMaterial({ map: alarmPull(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ap.name = 'alarm-pull';
    ap.userData.decalMat = true;
    ap.position.set(0, 0, decalDim(spec.kind, dc, 2, 0.1) / 2 + 0.004);
    prop.group.add(ap);
    if (!prop.group.name) prop.group.name = 'alarm-pull';
  }
  // The valve kept the grip — rim polish and hub grease on the
  // wheel.
  if (spec.kind === 'valveWheel' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const vg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshStandardMaterial({ map: valveGrip(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    vg.name = 'valve-grip';
    vg.userData.decalMat = true;
    vg.position.set(0, 0, decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.012);
    prop.group.add(vg);
    if (!prop.group.name) prop.group.name = 'valve-grip';
  }
  // The panel kept the needle — stuck pointers and dial dust on
  // the instrument faces.
  const PANELS: ReadonlySet<PropSpec['kind']> = new Set(['instrPanel', 'breakerPanel', 'powerBox', 'utilityBox']);
  if (PANELS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ng = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshStandardMaterial({ map: needleGhost(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ng.name = 'needle-ghost';
    ng.userData.decalMat = true;
    ng.position.set((rng.float() - 0.5) * 0.2, decalY(spec.kind, dc, 0.6, 1.2), decalDim(spec.kind, dc, 2, 0.12) / 2 + 0.004);
    prop.group.add(ng);
    if (!prop.group.name) prop.group.name = 'needle-ghost';
  }
  // The cable kept its sleeve — dust film and web on the hanging
  // drops.
  const CABLES: ReadonlySet<PropSpec['kind']> = new Set(['hangingCable', 'chainBulb', 'cageLight']);
  if (CABLES.has(spec.kind) && rng.bool(0.45)) {
    const dc = modelCollider(spec.kind);
    const cs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.4),
      new THREE.MeshStandardMaterial({ map: cableSleeve(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    cs.name = 'cable-sleeve';
    cs.userData.decalMat = true;
    cs.position.set(0, decalY(spec.kind, dc, 0.5, 1), decalDim(spec.kind, dc, 2, 0.06) / 2 + 0.004);
    prop.group.add(cs);
    if (!prop.group.name) prop.group.name = 'cable-sleeve';
  }
  // The key kept its hook — tag ghosts and hook shine on the
  // racks.
  const KEYS: ReadonlySet<PropSpec['kind']> = new Set(['keyRack', 'keyCabinet']);
  if (KEYS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const kg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.22),
      new THREE.MeshStandardMaterial({ map: keyGhost(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    kg.name = 'key-ghost';
    kg.userData.decalMat = true;
    kg.position.set(0, decalY(spec.kind, dc, 0.5, 1.2), decalDim(spec.kind, dc, 2, 0.14) / 2 + 0.012);
    prop.group.add(kg);
    if (!prop.group.name) prop.group.name = 'key-ghost';
  }
  // The vend kept the kicks — shoe scuffs and coin-cup wear on
  // the machines.
  if (spec.kind === 'vendingUnit' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const vk = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.6),
      new THREE.MeshStandardMaterial({ map: vendKick(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    vk.name = 'vend-kick';
    vk.userData.decalMat = true;
    vk.position.set(0, decalY(spec.kind, dc, 0.4, 1.8), decalDim(spec.kind, dc, 2, 0.6) / 2 + 0.004);
    prop.group.add(vk);
    if (!prop.group.name) prop.group.name = 'vend-kick';
  }
  // The trap kept the spring — bait ghosts and sprung blowback.
  if (spec.kind === 'mousetrap' && rng.bool(0.7)) {
    const ts = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshStandardMaterial({ map: trapSet(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ts.name = 'trap-set';
    ts.userData.decalMat = true;
    ts.rotation.x = -Math.PI / 2;
    ts.position.set(0, 0.006, 0);
    prop.group.add(ts);
    if (!prop.group.name) prop.group.name = 'trap-set';
  }
  // The tape kept its curl — sweep lines and hook curls under the
  // measures.
  const TAPES: ReadonlySet<PropSpec['kind']> = new Set(['tapeMeasure']);
  if (TAPES.has(spec.kind) && rng.bool(0.5)) {
    const tc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.18),
      new THREE.MeshStandardMaterial({ map: tapeCurl(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    tc.name = 'tape-curl';
    tc.userData.decalMat = true;
    tc.rotation.x = -Math.PI / 2;
    tc.rotation.z = rng.float() * Math.PI * 2;
    tc.position.set(0, 0.006, 0.15);
    prop.group.add(tc);
    if (!prop.group.name) prop.group.name = 'tape-curl';
  }
  // The manifold wept — flange halos and rust tears on the pipe
  // manifolds.
  if (spec.kind === 'pipeManifold' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const mr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.45),
      new THREE.MeshStandardMaterial({ map: manifoldRust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    mr.name = 'manifold-rust';
    mr.userData.decalMat = true;
    mr.position.set(0, decalY(spec.kind, dc, 0.5, 1), decalDim(spec.kind, dc, 2, 0.2) / 2 + 0.005);
    prop.group.add(mr);
    if (!prop.group.name) prop.group.name = 'manifold-rust';
  }
  // The crane kept its lane — trolley polish and grease drops on
  // the overhead beam.
  if (spec.kind === 'overheadCrane' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const ch = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshStandardMaterial({ map: craneHook(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ch.name = 'crane-hook';
    ch.userData.decalMat = true;
    ch.position.set(0, decalY(spec.kind, dc, 0.5, 2.4), decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.005);
    prop.group.add(ch);
    if (!prop.group.name) prop.group.name = 'crane-hook';
  }
  // The car kept its veil — hem shadow and wheel grime under the
  // dust sheets.
  if (spec.kind === 'coveredCar' && rng.bool(0.7)) {
    const cv = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.8),
      new THREE.MeshStandardMaterial({ map: carVeil(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    cv.name = 'car-veil';
    cv.userData.decalMat = true;
    cv.rotation.x = -Math.PI / 2;
    cv.position.set(0, 0.007, 0);
    prop.group.add(cv);
    if (!prop.group.name) prop.group.name = 'car-veil';
  }
  // The vent bleached — pale cones of leached paint under the
  // steam vents.
  const VENTS: ReadonlySet<PropSpec['kind']> = new Set(['steamVent', 'wallVent', 'ductCirc']);
  if (VENTS.has(spec.kind) && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const sb = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.6),
      new THREE.MeshStandardMaterial({ map: steamBleach(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sb.name = 'steam-bleach';
    sb.userData.decalMat = true;
    if (spec.kind === 'steamVent' && (spec.y ?? 0) < 0.5) {
      sb.rotation.x = -Math.PI / 2;
      sb.position.set(0, 0.007, 0.12);
    } else {
      sb.position.set(0, -decalY(spec.kind, dc, 0.3, 0.4), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.004);
    }
    prop.group.add(sb);
    if (!prop.group.name) prop.group.name = 'steam-bleach';
  }
  // The duct kept its seams — grime streaks at the joints of the
  // runs.
  const DUCTS: ReadonlySet<PropSpec['kind']> = new Set(['ductRun', 'ductRect', 'cableTray']);
  if (DUCTS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const ds = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshStandardMaterial({ map: ductSeam(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ds.name = 'duct-seam';
    ds.userData.decalMat = true;
    if (spec.kind === 'cableTray' && (spec.y ?? 0) < 0.5) {
      ds.position.set(0, 0.09, 0);
      ds.rotation.x = -Math.PI / 2;
    } else {
      ds.position.set(0, -decalY(spec.kind, dc, 1, 0.3) / 2 - 0.004, 0);
      ds.rotation.x = Math.PI / 2;
    }
    prop.group.add(ds);
    if (!prop.group.name) prop.group.name = 'duct-seam';
  }
  // The buoy faded — sun-bleach and grab marks on the rings.
  if (spec.kind === 'lifebuoy' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const bf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: buoyFade(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    bf.name = 'buoy-fade';
    bf.userData.decalMat = true;
    bf.position.set(0, 0, decalDim(spec.kind, dc, 2, 0.1) / 2 + 0.004);
    prop.group.add(bf);
    if (!prop.group.name) prop.group.name = 'buoy-fade';
  }
  // The portrait kept the gaze — craquelure webs and a shine
  // across the eyes.
  const PORTRAITS: ReadonlySet<PropSpec['kind']> = new Set(['hauntedPortrait', 'painting', 'standingFrame']);
  if (PORTRAITS.has(spec.kind) && rng.bool(0.5)) {
    const dc = modelCollider(spec.kind);
    const gc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.5),
      new THREE.MeshStandardMaterial({ map: gazeCrack(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    gc.name = 'gaze-crack';
    gc.userData.decalMat = true;
    gc.position.set(0, decalY(spec.kind, dc, 0.2, 0.9), decalDim(spec.kind, dc, 2, 0.05) / 2 + 0.004);
    prop.group.add(gc);
    if (!prop.group.name) prop.group.name = 'gaze-crack';
  }
  // The trophy kept its dust — brow film and web spans on the
  // mounted heads.
  if (spec.kind === 'trophyHead' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const td = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshStandardMaterial({ map: trophyDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    td.name = 'trophy-dust';
    td.userData.decalMat = true;
    td.position.set(0, 0, decalDim(spec.kind, dc, 2, 0.2) / 2 + 0.004);
    prop.group.add(td);
    if (!prop.group.name) prop.group.name = 'trophy-dust';
  }
  // The ship kept its rigging — dust sags and grey sails on the
  // models.
  if (spec.kind === 'shipModel' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const rd = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.34),
      new THREE.MeshStandardMaterial({ map: riggingDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    rd.name = 'rigging-dust';
    rd.userData.decalMat = true;
    rd.position.set(0, decalY(spec.kind, dc, 0.5, 0.4), decalDim(spec.kind, dc, 2, 0.15) / 2 + 0.005);
    prop.group.add(rd);
    if (!prop.group.name) prop.group.name = 'rigging-dust';
  }
  // The crates kept the stencil — ghost letters and corner wear
  // on the military crates.
  const CRATES: ReadonlySet<PropSpec['kind']> = new Set(['milCrate', 'crate', 'toolbox']);
  if (CRATES.has(spec.kind) && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const sg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.26),
      new THREE.MeshStandardMaterial({ map: stencilGhost(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sg.name = 'stencil-ghost';
    sg.userData.decalMat = true;
    sg.position.set(0, decalY(spec.kind, dc, 0.5, 0.4), decalDim(spec.kind, dc, 2, 0.5) / 2 + 0.004);
    prop.group.add(sg);
    if (!prop.group.name) prop.group.name = 'stencil-ghost';
  }
  // The welder spat — bead tracks and spatter pits by the carts
  // and torches.
  const WELD: ReadonlySet<PropSpec['kind']> = new Set(['weldingCart', 'blowtorch', 'propaneTorch', 'propaneTank']);
  if (WELD.has(spec.kind) && rng.bool(0.55)) {
    const ws = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.34),
      new THREE.MeshStandardMaterial({ map: weldSpatter(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ws.name = 'weld-spatter';
    ws.userData.decalMat = true;
    ws.rotation.x = -Math.PI / 2;
    ws.rotation.z = rng.float() * Math.PI * 2;
    ws.position.set(0.2, 0.007, 0.2);
    prop.group.add(ws);
    if (!prop.group.name) prop.group.name = 'weld-spatter';
  }
  // The grease kept the box — cosmoline film and wrapped ghosts
  // on the munitions.
  const MUNITION: ReadonlySet<PropSpec['kind']> = new Set(['ammoBox', 'stickGrenade']);
  if (MUNITION.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const cg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.28),
      new THREE.MeshStandardMaterial({ map: cosmoGrease(rng) ?? undefined, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    cg.name = 'cosmo-grease';
    cg.userData.decalMat = true;
    cg.position.set(0, decalY(spec.kind, dc, 0.6, 0.25), decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.004);
    prop.group.add(cg);
    if (!prop.group.name) prop.group.name = 'cosmo-grease';
  }
  // The flasks ringed — reagent circles and scorch marks around
  // the chemistry work.
  const CHEM: ReadonlySet<PropSpec['kind']> = new Set(['chemistrySet', 'bunsenBurner', 'apothecaryCabinet']);
  if (CHEM.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const fr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: flaskRing(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    fr.name = 'flask-ring';
    fr.userData.decalMat = true;
    fr.rotation.x = -Math.PI / 2;
    fr.position.set(0, decalY(spec.kind, dc, 1, 0.9) + 0.004, 0);
    prop.group.add(fr);
    if (!prop.group.name) prop.group.name = 'flask-ring';
  }
  // The block kept the cuts — cleaver grooves and fat sheen on
  // the chopping blocks.
  if (spec.kind === 'choppingBlock' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const bc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: blockCuts(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    bc.name = 'block-cuts';
    bc.userData.decalMat = true;
    bc.rotation.x = -Math.PI / 2;
    bc.position.set(0, decalY(spec.kind, dc, 1, 0.5) + 0.004, 0);
    prop.group.add(bc);
    if (!prop.group.name) prop.group.name = 'block-cuts';
  }
  // The torch left its soot — black feathers behind the burners.
  if (spec.kind === 'propaneTorch' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const ts = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshStandardMaterial({ map: torchSoot(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ts.name = 'torch-soot';
    ts.userData.decalMat = true;
    ts.position.set(0, decalY(spec.kind, dc, 0.5, 0.3), decalDim(spec.kind, dc, 2, 0.1) / 2 + 0.004);
    prop.group.add(ts);
    if (!prop.group.name) prop.group.name = 'torch-soot';
  }
  // The cards curled — corner ghosts and tape hinges on the
  // postcard boards.
  if (spec.kind === 'postcards' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const cc = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.3),
      new THREE.MeshStandardMaterial({ map: cardCurl(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    cc.name = 'card-curl';
    cc.userData.decalMat = true;
    cc.position.set(0, decalY(spec.kind, dc, 0.3, 1.2), decalDim(spec.kind, dc, 2, 0.05) / 2 + 0.004);
    prop.group.add(cc);
    if (!prop.group.name) prop.group.name = 'card-curl';
  }
  // The label faded — bleached text and lifted corners on the
  // exhibit labels.
  if (spec.kind === 'exhibitLabel' && rng.bool(0.7)) {
    const dc = modelCollider(spec.kind);
    const lf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.15),
      new THREE.MeshStandardMaterial({ map: labelFade(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    lf.name = 'label-fade';
    lf.userData.decalMat = true;
    lf.position.set(0, 0, decalDim(spec.kind, dc, 2, 0.02) / 2 + 0.003);
    prop.group.add(lf);
    if (!prop.group.name) prop.group.name = 'label-fade';
  }
  // The speakers kept their dust — cone rings and grille film on
  // the old electronics.
  const SOUNDS: ReadonlySet<PropSpec['kind']> = new Set(['boombox', 'cassettePlayer']);
  if (SOUNDS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const sd2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.24),
      new THREE.MeshStandardMaterial({ map: speakerDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sd2.name = 'speaker-dust';
    sd2.userData.decalMat = true;
    sd2.position.set(0, decalY(spec.kind, dc, 0.5, 0.2), decalDim(spec.kind, dc, 2, 0.12) / 2 + 0.004);
    prop.group.add(sd2);
    if (!prop.group.name) prop.group.name = 'speaker-dust';
  }
  // The barrel kept the hoop — rust bleeding under each band.
  if (spec.kind === 'barrel' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const hr = new THREE.Mesh(
      new THREE.PlaneGeometry(dc?.[0] ?? 0.7, decalDim(spec.kind, dc, 1, 0.9) * 0.8),
      new THREE.MeshStandardMaterial({ map: hoopRust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    hr.name = 'hoop-rust';
    hr.userData.decalMat = true;
    hr.position.set(0, decalY(spec.kind, dc, 0.4, 0.9), decalDim(spec.kind, dc, 2, 0.35) / 2 + 0.005);
    prop.group.add(hr);
    if (!prop.group.name) prop.group.name = 'hoop-rust';
  }
  // The bin kept the ash — a spill of grey crumbs it could not hold.
  if (spec.kind === 'bin' && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const ar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshStandardMaterial({ map: ashRing(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ar.name = 'ash-ring';
    ar.userData.decalMat = true;
    ar.rotation.x = -Math.PI / 2;
    ar.position.set(0, 0.006, decalDim(spec.kind, dc, 2, 0.3) / 2 + 0.1);
    prop.group.add(ar);
    if (!prop.group.name) prop.group.name = 'ash-ring';
  }
  // The locker kept its ghosts — label shadows and key scratches.
  const LOCKERS: ReadonlySet<PropSpec['kind']> = new Set(['locker', 'cageLocker']);
  if (LOCKERS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const lg = new THREE.Mesh(
      new THREE.PlaneGeometry(decalDim(spec.kind, dc, 0, 0.5) * 0.6, decalDim(spec.kind, dc, 1, 1.8) * 0.7),
      new THREE.MeshStandardMaterial({ map: lockerGhost(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    lg.name = 'locker-ghost';
    lg.userData.decalMat = true;
    lg.position.set(0, decalY(spec.kind, dc, 0.45, 1.8), decalDim(spec.kind, dc, 2, 0.45) / 2 + 0.004);
    prop.group.add(lg);
    if (!prop.group.name) prop.group.name = 'locker-ghost';
  }
  // The kettle whistled — limescale and heat rings on the old pots.
  const POTS: ReadonlySet<PropSpec['kind']> = new Set(['kettle', 'enamelPot', 'brassPot']);
  if (POTS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const ks = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshStandardMaterial({ map: kettleScale(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ks.name = 'kettle-scale';
    ks.userData.decalMat = true;
    ks.position.set(0, decalY(spec.kind, dc, 0.35, 0.25), decalDim(spec.kind, dc, 2, 0.24) / 2 + 0.008);
    prop.group.add(ks);
    if (!prop.group.name) prop.group.name = 'kettle-scale';
  }
  // The board kept the cuts — a hundred meals' knife scoring.
  if (spec.kind === 'cuttingBoard' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const bs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.3),
      new THREE.MeshStandardMaterial({ map: boardScores(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    bs.name = 'board-scores';
    bs.userData.decalMat = true;
    bs.rotation.x = -Math.PI / 2;
    bs.position.set(0, decalY(spec.kind, dc, 1, 0.04) + 0.002, 0);
    prop.group.add(bs);
    if (!prop.group.name) prop.group.name = 'board-scores';
  }
  // The darts missed too — a halo of pits around the board.
  if (spec.kind === 'dartboard' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const dh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshStandardMaterial({ map: dartHalo(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    dh.name = 'dart-halo';
    dh.userData.decalMat = true;
    dh.position.set(0, 0, decalDim(spec.kind, dc, 2, 0.04) / 2 + 0.004);
    prop.group.add(dh);
    if (!prop.group.name) prop.group.name = 'dart-halo';
  }
  // The jug sweated — runnels and a sediment line on the old glass.
  const JUGS: ReadonlySet<PropSpec['kind']> = new Set(['gallonJug', 'jug']);
  if (JUGS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const js = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.32),
      new THREE.MeshStandardMaterial({ map: jugSweat(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    js.name = 'jug-sweat';
    js.userData.decalMat = true;
    js.position.set(0, decalY(spec.kind, dc, 0.4, 0.3), decalDim(spec.kind, dc, 2, 0.2) / 2 + 0.008);
    prop.group.add(js);
    if (!prop.group.name) prop.group.name = 'jug-sweat';
  }
  // The shelf kept the folds — crease lines and one dragged corner.
  if (spec.kind === 'linenShelf' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const fp = new THREE.Mesh(
      new THREE.PlaneGeometry(decalDim(spec.kind, dc, 0, 0.9) * 0.7, 0.4),
      new THREE.MeshStandardMaterial({ map: foldPulls(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    fp.name = 'fold-pulls';
    fp.userData.decalMat = true;
    fp.position.set(0, decalY(spec.kind, dc, 0.5, 1.6), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.005);
    prop.group.add(fp);
    if (!prop.group.name) prop.group.name = 'fold-pulls';
  }
  // The case kept its dust — empty ghosts where the pieces were taken.
  if (spec.kind === 'displayCase' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const sdx = new THREE.Mesh(
      new THREE.PlaneGeometry(decalDim(spec.kind, dc, 0, 1.0) * 0.8, 0.45),
      new THREE.MeshStandardMaterial({ map: shelfDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sdx.name = 'shelf-dust';
    sdx.userData.decalMat = true;
    sdx.rotation.x = -Math.PI / 2;
    sdx.position.set(0, spec.kind === 'displayCase' ? 0.77 : decalY(spec.kind, dc, 0.55, 0.9), 0);
    prop.group.add(sdx);
    if (!prop.group.name) prop.group.name = 'shelf-dust';
  }
  // The till kept the scratch — coin rings and a drawer-rub line.
  const TILLS: ReadonlySet<PropSpec['kind']> = new Set(['register', 'till']);
  if (TILLS.has(spec.kind) && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const ts2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.36),
      new THREE.MeshStandardMaterial({ map: tillScratch(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ts2.name = 'till-scratch';
    ts2.userData.decalMat = true;
    ts2.position.set(0, decalY(spec.kind, dc, 0.5, 0.4), decalDim(spec.kind, dc, 2, 0.47) / 2 + 0.03);
    prop.group.add(ts2);
    if (!prop.group.name) prop.group.name = 'till-scratch';
  }
  // The screen kept the ghost — a burnt frame under the dust.
  if (spec.kind === 'television' && rng.bool(0.65)) {
    const dc = modelCollider(spec.kind);
    const sg = new THREE.Mesh(
      new THREE.PlaneGeometry(decalDim(spec.kind, dc, 0, 0.6) * 0.8, decalDim(spec.kind, dc, 1, 0.5) * 0.7),
      new THREE.MeshStandardMaterial({ map: screenGhost(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sg.name = 'screen-ghost';
    sg.userData.decalMat = true;
    sg.position.set(0, decalY(spec.kind, dc, 0.5, 0.5), decalDim(spec.kind, dc, 2, 0.4) / 2 + 0.004);
    prop.group.add(sg);
    if (!prop.group.name) prop.group.name = 'screen-ghost';
  }
  // The bowl boiled over once — spatter and a cooked-on ring.
  if (spec.kind === 'microwave' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const sf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshStandardMaterial({ map: splatFilm(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sf.name = 'splat-film';
    sf.userData.decalMat = true;
    sf.position.set(0, decalY(spec.kind, dc, 0.5, 0.3), decalDim(spec.kind, dc, 2, 0.35) / 2 + 0.004);
    prop.group.add(sf);
    if (!prop.group.name) prop.group.name = 'splat-film';
  }
  // The saw kept its dust — a fan thrown sideways by the stroke.
  if (spec.kind === 'handsaw' && rng.bool(0.6)) {
    const sf2 = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshStandardMaterial({ map: sawdustFan(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    sf2.name = 'sawdust-fan';
    sf2.userData.decalMat = true;
    sf2.rotation.x = -Math.PI / 2;
    sf2.position.set(0.1, 0.007, 0.2);
    prop.group.add(sf2);
    if (!prop.group.name) prop.group.name = 'sawdust-fan';
  }
  // The wrench kept its prints — palm sheen and finger ghosts.
  const HANDTOOLS: ReadonlySet<PropSpec['kind']> = new Set(['wrench', 'hammer', 'pliers', 'screwdrivers']);
  if (HANDTOOLS.has(spec.kind) && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const og = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshStandardMaterial({ map: oilyGrip(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    og.name = 'oily-grip';
    og.userData.decalMat = true;
    og.position.set(0, decalY(spec.kind, dc, 0.4, 0.1), decalDim(spec.kind, dc, 2, 0.06) / 2 + 0.004);
    prop.group.add(og);
    if (!prop.group.name) prop.group.name = 'oily-grip';
  }
  // The haft kept its shine — seasons of hands burnished the wood.
  const HAFTS: ReadonlySet<PropSpec['kind']> = new Set(['pickaxe', 'sledge', 'spade', 'axe', 'broom', 'machete']);
  if (HAFTS.has(spec.kind) && rng.bool(0.55)) {
    const dc = modelCollider(spec.kind);
    const hs = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.5),
      new THREE.MeshStandardMaterial({ map: haftShine(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    hs.name = 'haft-shine';
    hs.userData.decalMat = true;
    hs.position.set(0, decalY(spec.kind, dc, 0.5, 0.9), decalDim(spec.kind, dc, 2, 0.06) / 2 + 0.004);
    prop.group.add(hs);
    if (!prop.group.name) prop.group.name = 'haft-shine';
  }
  // The case kept the journey — strap shadows and peeled stickers.
  if (spec.kind === 'suitcase' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const ss = new THREE.Mesh(
      new THREE.PlaneGeometry(decalDim(spec.kind, dc, 0, 0.6) * 0.8, decalDim(spec.kind, dc, 1, 0.4) * 0.8),
      new THREE.MeshStandardMaterial({ map: strapScuff(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    ss.name = 'strap-scuff';
    ss.userData.decalMat = true;
    ss.position.set(0, decalY(spec.kind, dc, 0.5, 0.4), decalDim(spec.kind, dc, 2, 0.2) / 2 + 0.004);
    prop.group.add(ss);
    if (!prop.group.name) prop.group.name = 'strap-scuff';
  }
  // The truck kept its toes — plate arcs and wheel trails.
  if (spec.kind === 'handTruck' && rng.bool(0.6)) {
    const tr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.6),
      new THREE.MeshStandardMaterial({ map: toeRubs(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    tr.name = 'toe-rubs';
    tr.userData.decalMat = true;
    tr.rotation.x = -Math.PI / 2;
    tr.position.set(0, 0.007, 0.15);
    prop.group.add(tr);
    if (!prop.group.name) prop.group.name = 'toe-rubs';
  }
  // The cart kept the mail dust — paper film and a torn string tail.
  if (spec.kind === 'mailCart' && rng.bool(0.6)) {
    const dc = modelCollider(spec.kind);
    const md = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.4),
      new THREE.MeshStandardMaterial({ map: mailDust(rng) ?? undefined, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    md.name = 'mail-dust';
    md.userData.decalMat = true;
    md.rotation.x = -Math.PI / 2;
    md.position.set(0, decalY(spec.kind, dc, 0.7, 0.7), 0);
    prop.group.add(md);
    if (!prop.group.name) prop.group.name = 'mail-dust';
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
