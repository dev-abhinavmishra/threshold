/**
 * Room mesh builder — turns a RoomInstance (data) into a THREE.Group.
 * Walls come from the spec's collider boxes so visuals and collision always
 * match. Props are procedural. Lights are cheap point lights capped by quality.
 */
import * as THREE from 'three';
import type { RoomInstance } from '../game/types';
import type { PropKind, RoomSpec } from './spec';
import { buildProp } from './props';
import { MAT } from './materials';
import { SeedStreams } from '../engine/rng';
import { aabb } from '../engine/math';
import { portLocalPos } from './spec';
import { TEX } from './textures';
import { box as texBox } from './props';
import { modelInstance } from './modelLibrary';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { grimeStreak, floorStain, ceilingDamp, poster, warningStripe, cobweb, decalQuad, bloodPool, bloodSmear, scratchMarks, handPrints, brickPatch, peeledWallpaper, footprintTrail, crackDecal } from './decals';

export interface BuiltRoom {
  group: THREE.Group;
  /** Door leaf meshes keyed by door id for animation. */
  doorLeaves: Map<string, THREE.Object3D>;
  /** Breakable light meshes keyed by group. */
  lampMeshes: THREE.Mesh[];
  /** Actual THREE lights (few, quality-capped). */
  lights: THREE.PointLight[];
  /** Fake-volumetric cones under lit fixtures. */
  shafts: THREE.Mesh[];
  /** Drifting dust motes (lit rooms only). */
  dust: THREE.Points | null;
  /** Meshes/groups tagged userData.anim — ticked each frame by the game. */
  animated: THREE.Object3D[];
  /** Falling drip particles (leak spots) — animated by the game. */
  drips: THREE.Points | null;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

// Soft radial sprite for dust motes — unmapped PointsMaterial renders as
// hard squares; a radial gradient reads as a dust grain.
let dustTex: THREE.Texture | null = null;
function dustSprite(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (!dustTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    dustTex = new THREE.CanvasTexture(cv);
  }
  return dustTex;
}

// Vertical alpha ramp for light shafts: bright at the fixture, gone at the
// floor — kills the hard bottom ellipse a plain cone draws.
let shaftTex: THREE.Texture | null = null;
function shaftTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (!shaftTex) {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#5a5a5a');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 128);
    shaftTex = new THREE.CanvasTexture(cv);
  }
  return shaftTex;
}

// Radial alpha for floor light pools — soft-edged glow instead of a lit slab.
let poolTex: THREE.Texture | null = null;
function poolTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (!poolTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#6e6e6e');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    poolTex = new THREE.CanvasTexture(cv);
  }
  return poolTex;
}

// Contact-shadow alpha — a dark soft ellipse stamped under floor-standing
// props so furniture reads grounded instead of floating on a lit plane.
let blobTex: THREE.Texture | null = null;
function blobTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (!blobTex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(cv);
  }
  return blobTex;
}
const blobMat = new THREE.MeshBasicMaterial({
  color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity: 0.42,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
});
blobMat.userData.decalMat = true;
const blobGeo = new THREE.PlaneGeometry(1, 1);
const dripMat = new THREE.PointsMaterial({
  color: 0xa8bfd0, size: 0.02, transparent: true, opacity: 0.5,
  depthWrite: false, sizeAttenuation: true,
});
function contactShadow(w: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(Math.min(w * 1.3, 4.2), Math.min(d * 1.3, 4.2), 1);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

// Wallpaper tint palette — subtle per-room cast so corridors don't all read
// the same beige. Multiplies the shared wallpaper map, so materials are
// cloned per room and disposed with it.
const WALLPAPER_TINTS = [0xcfc4ae, 0xb9c0a9, 0xc6b4a6, 0xaeb6b6, 0xc9c0ba];

// Corridor direction signs — institutional green boards, cached per label.
const signTextures = new Map<string, THREE.Texture>();
function signMaterial(label: string): THREE.MeshStandardMaterial | null {
  if (typeof document === 'undefined') return null;
  let tex = signTextures.get(label);
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#1c2b20';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#4a5849';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#d6dcc9';
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 34);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    signTextures.set(label, tex);
  }
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
}
const CORRIDOR_SIGNS = ['RECORDS →', 'EXIT →', '← ARCHIVE', 'SUB-BASEMENT', 'NO ENTRY', 'SERVICE ONLY', '→ STAIR', 'RESTRICTED'];

// Door number plates: canvas textures cached per label (e.g. "050").
const plateTextures = new Map<string, THREE.Texture>();
export function plateMaterial(label: string): THREE.MeshStandardMaterial | null {
  if (typeof document === 'undefined') return null;
  let tex = plateTextures.get(label);
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#14120f';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#8f7a3a';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 120, 56);
    ctx.fillStyle = '#d8cfb4';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 34);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    plateTextures.set(label, tex);
  }
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
}

export function buildRoomMesh(room: RoomInstance, spec: RoomSpec, seed: number, quality: 'low' | 'medium' | 'high'): BuiltRoom {
  const rng = new SeedStreams('').roomStream('dressing', room.index * 31 + 7 + seed);
  const group = new THREE.Group();
  group.name = `room-${room.index}`;

  const isUnder = room.biome === 'underscript';
  let wallMat: THREE.MeshStandardMaterial;
  let isWallpaper = false;
  switch (spec.wallMaterial) {
    case 'tile': wallMat = spec.biome === 'maintenance' || spec.biome === 'guest' || spec.biome === 'corridor' ? TEX.tilesSubway() : TEX.tileWall(); break;
    case 'woodPanel': wallMat = TEX.woodPanel(); break;
    case 'travertine': wallMat = TEX.travertine(); break;
    case 'corrugated': wallMat = TEX.corrugated(); break;
    case 'brick': wallMat = TEX.brick(); break;
    default:
      if (isUnder || spec.biome === 'maintenance' || spec.wallMaterial === 'concrete') wallMat = TEX.concreteWall();
      else if (room.darkRoom) wallMat = TEX.plasterDamaged();
      else { wallMat = TEX.wallpaper(); isWallpaper = true; }
  }
  // Seeded per-biome wall variety when the template doesn't pin a surface:
  // grand rooms get wood paneling or travertine, maintenance gets
  // corrugated steel or damaged brick, underscript stays concrete.
  if (!spec.wallMaterial) {
    const preRoll = wallMat;
    const roll = rng.float();
    let keepPaper = false;
    if (spec.biome === 'gallery' && roll < 0.45) wallMat = TEX.travertine();
    else if (spec.biome === 'lobby' && roll < 0.4) wallMat = TEX.woodPanel();
    else if (spec.biome === 'gallery' && roll < 0.75) wallMat = TEX.woodPanel();
    else if (spec.biome === 'records' && roll < 0.15) wallMat = TEX.woodPanel();
    else if (spec.biome === 'maintenance' && roll < 0.3) wallMat = TEX.corrugated();
    else if (spec.biome === 'maintenance' && roll < 0.55) wallMat = TEX.brick();
    else if (spec.biome === 'maintenance' && roll < 0.62) wallMat = TEX.corrugatedRust();
    else if (isUnder && roll < 0.12) wallMat = TEX.stoneWall();
    else if (isUnder && roll < 0.22) wallMat = TEX.brick();
    else if (isUnder && roll < 0.28) wallMat = TEX.brickOld();
    else if (isUnder && roll < 0.36) wallMat = TEX.plasterPeeling();
    else if (isUnder && roll < 0.45) wallMat = TEX.concreteIndustrial();
    else if ((spec.biome === 'lobby' || spec.biome === 'milestone') && roll < 0.35) { wallMat = TEX.wallpaperDamask(); keepPaper = true; }
    else if (spec.biome === 'lobby' && roll < 0.52) { wallMat = TEX.wallpaperGrand(); keepPaper = true; }
    else if (spec.biome === 'guest' && roll < 0.18) wallMat = TEX.woodPaint();
    else if (spec.biome === 'guest' && roll < 0.35) { wallMat = TEX.plasterFloral(); keepPaper = true; }
    else if (spec.biome === 'guest' && roll < 0.48) { wallMat = TEX.wallpaperStripe(); keepPaper = true; }
    else if (spec.biome === 'maintenance' && roll < 0.68) wallMat = TEX.plasterPeeling();
    else if (spec.biome === 'maintenance' && roll < 0.78) wallMat = TEX.brickPainted();
    else if ((spec.biome === 'corridor' || spec.biome === 'guest' || spec.biome === 'records') && roll < 0.3) wallMat = TEX.plasterPainted();
    else if ((spec.biome === 'corridor' || spec.biome === 'records') && roll < 0.4) { wallMat = TEX.wallpaperFloral(); keepPaper = true; }
    else if (spec.biome === 'lobby' && roll < 0.62) { wallMat = TEX.wallpaperStripe(); keepPaper = true; }
    if (wallMat !== preRoll) isWallpaper = keepPaper;
  }
  if (isWallpaper && rng.float() < 0.55) {
    wallMat = wallMat.clone();
    wallMat.color.setHex(WALLPAPER_TINTS[Math.floor(rng.float() * WALLPAPER_TINTS.length)]);
    wallMat.userData.decalMat = true; // reuse the decal-material disposal path
  }
  const floorRoll = rng.float();
  const floorMat = isUnder
    ? (floorRoll < 0.14 ? TEX.groundDirt() : floorRoll < 0.32 ? TEX.metalWalkway() : floorRoll < 0.46 ? TEX.concreteIndustrial() : TEX.concreteFloor())
    : room.floorMaterial === 'carpet'
      ? (floorRoll < 0.12 && spec.biome === 'guest' ? TEX.carpetShag() : floorRoll < 0.18 && spec.biome === 'guest' ? TEX.carpetPersian() : floorRoll < 0.28 && spec.biome === 'lobby' ? TEX.carpetLobby() : floorRoll < 0.25 ? TEX.carpetWorn() : TEX.carpet())
      : room.floorMaterial === 'stone' || room.floorMaterial === 'metal'
        ? (spec.biome === 'maintenance' && floorRoll < 0.45
          ? (floorRoll < 0.2 ? TEX.metalRusted() : TEX.diamondPlate())
          : TEX.concreteFloor())
        : (spec.biome === 'lobby' || spec.biome === 'gallery' || spec.biome === 'milestone') && floorRoll < 0.5
          ? (floorRoll < 0.1 ? TEX.marbleDark() : floorRoll < 0.2 ? TEX.terrazzo() : floorRoll < 0.28 ? TEX.granite() : floorRoll < 0.34 ? TEX.tilesMosaic() : floorRoll < 0.42 ? TEX.woodParquet() : TEX.marbleFloor())
          : (floorRoll < 0.12 && spec.biome === 'maintenance' ? TEX.woodPlanksDark() : (floorRoll < 0.18 && (spec.biome === 'guest' || spec.biome === 'corridor')) ? TEX.tilesCheckered() : floorRoll < 0.24 ? (spec.biome === 'records' || spec.biome === 'corridor' ? TEX.tilesHex() : TEX.woodFloorWorn()) : floorRoll < 0.38 ? TEX.woodFloorOld() : TEX.woodFloor());
  const ceilRoll = rng.float();
  const ceilMat = isUnder
    ? TEX.concreteFloor()
    : (spec.biome === 'corridor' || spec.biome === 'records' || spec.biome === 'maintenance') && ceilRoll < 0.45
      ? (ceilRoll < 0.15 ? TEX.ceilingOffice() : ceilRoll < 0.3 ? TEX.ceilingPanel() : TEX.ceilingAcoustic())
      : ceilRoll < 0.14 ? TEX.plasterSmooth() : TEX.ceiling();
  const w = room.width, d = room.depth, h = room.height;

  // Floor + ceiling (texBox carries meter-scaled UVs)
  const floor = new THREE.Mesh(texBox(w, 0.1, d), floorMat);
  floor.position.y = -0.05;
  group.add(floor);
  const ceil = new THREE.Mesh(texBox(w, 0.1, d), ceilMat);
  ceil.position.y = h + 0.05;
  // Corridor carpet runner — a worn strip down the length of the passage,
  // edges bound by thin tack strips, floorboards showing either side.
  if (!isUnder && spec.biome === 'corridor' && d > w * 1.15 && room.floorMaterial !== 'carpet' && floorRoll < 0.72) {
    const rw = Math.min(1.3, w * 0.4);
    const runner = new THREE.Mesh(texBox(rw, 0.022, d * 0.94), TEX.carpetRunner());
    runner.position.y = 0.011;
    group.add(runner);
    const tackMat = MAT.darkOak();
    for (const sx of [-1, 1]) {
      const tack = new THREE.Mesh(texBox(0.035, 0.014, d * 0.94), tackMat);
      tack.position.set(sx * (rw / 2 + 0.028), 0.007, 0);
      group.add(tack);
    }
  }
  // Suspended drop ceiling decision — hoisted: it also gates coffers below.
  const suspended = !isUnder && spec.biome != 'maintenance' && h <= 3.6;
  const fixtureY = suspended ? h - 0.22 : h - 0.3;
  // Coffered ceiling — grand rooms get a shallow oak beam grid under the
  // slab; the dropped cross-members read as real joinery from the floor.
  const coffered = (spec.biome === 'lobby' || spec.biome === 'gallery' || spec.biome === 'milestone') && !suspended && w >= 4 && d >= 4 && rng.float() < 0.6;
  if (coffered) {
    const beamMat = MAT.darkOak();
    const nx = Math.max(2, Math.round(w / 2.4));
    const nz = Math.max(2, Math.round(d / 2.4));
    for (let i = 0; i <= nx; i++) {
      const bx = -w / 2 + (i * w) / nx;
      const beam = new THREE.Mesh(texBox(0.16, 0.18, d), beamMat);
      beam.position.set(bx, h - 0.09, 0);
      group.add(beam);
    }
    for (let i = 0; i <= nz; i++) {
      const bz = -d / 2 + (i * d) / nz;
      const beam = new THREE.Mesh(texBox(w, 0.14, 0.16), beamMat);
      beam.position.set(0, h - 0.07, bz);
      group.add(beam);
    }
  }
  // Exposed joists — underscript spans get steel I-beams; tall domestic rooms
  // (never suspended/coffered) get dark timber joists. Both read as real
  // structure and break the flat slab from first person.
  if (isUnder && w >= 4 && d >= 3) {
    const jm = MAT.steelDark();
    const n = Math.min(7, Math.floor(d / 1.5));
    for (let i = 0; i <= n; i++) {
      const jz = -d / 2 + (i * d) / n;
      const beam = new THREE.Mesh(texBox(w, 0.2, 0.12), jm);
      beam.position.set(0, h - 0.12, jz);
      group.add(beam);
      const web = new THREE.Mesh(texBox(w, 0.16, 0.05), jm);
      web.position.set(0, h - 0.26, jz);
      group.add(web);
    }
  } else if (!suspended && !coffered && !isUnder && (spec.biome === 'guest' || spec.biome === 'safe' || spec.biome === 'milestone' || spec.biome === 'unlit') && w >= 3.5 && d >= 3.5) {
    const jm = MAT.darkOak();
    const n = Math.min(8, Math.floor(d / 1.15));
    for (let i = 0; i <= n; i++) {
      const jz = -d / 2 + (i * d) / n;
      const beam = new THREE.Mesh(texBox(w, 0.15, 0.09), jm);
      beam.position.set(0, h - 0.1, jz);
      group.add(beam);
    }
  }
  group.add(ceil);

  // Suspended drop ceiling — tile skin + T-bar grid for interior-height rooms.
  // Service spaces keep an exposed slab with a duct trunk instead.
  if (suspended) {
    const tileSkin = new THREE.Mesh(texBox(w, 0.04, d), ceilMat);
    tileSkin.position.y = h - 0.16;
    group.add(tileSkin);
    const barMat = MAT.charcoal();
    for (let gx = -w / 2 + 0.6; gx < w / 2 - 0.05; gx += 0.6) {
      const bar = new THREE.Mesh(texBox(0.03, 0.035, d - 0.05), barMat);
      bar.position.set(gx, h - 0.19, 0);
      group.add(bar);
    }
    for (let gz = -d / 2 + 0.6; gz < d / 2 - 0.05; gz += 0.6) {
      const bar = new THREE.Mesh(texBox(w - 0.05, 0.035, 0.03), barMat);
      bar.position.set(0, h - 0.19, gz);
      group.add(bar);
    }
    // Missing tiles — dark plenum holes at grid positions, plus the fallen
    // tile on the floor below. Decayed spaces only.
    const decayP = room.darkRoom || spec.biome === 'unlit' ? 0.4 : spec.biome === 'corridor' || spec.biome === 'records' ? 0.15 : 0;
    if (spec.biome !== 'safe' && rng.float() < decayP) {
      const n = 1 + Math.floor(rng.float() * 2);
      const holeMat = MAT.charcoal();
      for (let i = 0; i < n; i++) {
        const tx = Math.round(((rng.float() - 0.5) * (w - 1)) / 0.6) * 0.6;
        const tz = Math.round(((rng.float() - 0.5) * (d - 1)) / 0.6) * 0.6;
        if (Math.abs(tx) > w / 2 - 0.5 || Math.abs(tz) > d / 2 - 0.5) continue;
        const hole = new THREE.Mesh(texBox(0.56, 0.04, 0.56), holeMat);
        hole.position.set(tx, h - 0.185, tz);
        group.add(hole);
        // fallen tile below, askew on the floor
        const fallen = new THREE.Mesh(texBox(0.58, 0.018, 0.58), ceilMat);
        fallen.position.set(tx + (rng.float() - 0.5) * 0.5, 0.012, tz + (rng.float() - 0.5) * 0.5);
        fallen.rotation.y = rng.float() * Math.PI;
        group.add(fallen);
      }
    }
  } else if (isUnder || spec.biome === 'maintenance') {
    // Exposed services — a duct trunk and pipe run below the slab.
    const duct = new THREE.Mesh(texBox(0.5, 0.42, d - 0.4), MAT.steelDark());
    duct.position.set(w * 0.22, h - 0.45, 0);
    group.add(duct);
    // Branch duct peeling off at 90° + elbow collar
    const branch = new THREE.Mesh(texBox(w * 0.45, 0.34, 0.5), MAT.steelDark());
    branch.position.set(-w * 0.1, h - 0.42, (rng.float() - 0.5) * d * 0.4);
    group.add(branch);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.44, 10), MAT.steelDark());
    collar.rotation.z = Math.PI / 2;
    collar.position.set(w * 0.22 - 0.14, h - 0.44, branch.position.z);
    group.add(collar);
    // 2-3 exposed pipe runs along the long axis, some with valve wheels
    const nPipes = 2 + Math.floor(rng.float() * 2);
    for (let i = 0; i < nPipes; i++) {
      const px = -w * 0.35 + rng.float() * w * 0.25;
      const py = h - 0.25 - i * 0.14 - rng.float() * 0.05;
      const r = 0.028 + rng.float() * 0.03;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d - 0.3, 8), MAT.steelDark());
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(px, py, 0);
      group.add(pipe);
      // pipe hangers: thin straps from slab down to the pipe
      for (let hz = -d / 2 + 1; hz < d / 2 - 0.5; hz += 2.4) {
        const strap = new THREE.Mesh(texBox(0.02, h - py - 0.04, r * 2.6), MAT.charcoal());
        strap.position.set(px, (h + py + r) / 2 - 0.02, hz);
        group.add(strap);
      }
      if (rng.float() < 0.55) {
        // valve: small cylinder stub + wheel torus
        const vz = (rng.float() - 0.5) * (d - 2);
        const stub = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.5, 8), MAT.steelDark());
        stub.position.set(px, py - 0.22, vz);
        group.add(stub);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 14), MAT.steel());
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(px, py - 0.46, vz);
        group.add(wheel);
      }
    }
    // Sagging cable drops — TubeGeometry along quadratic curves
    const nDrops = 1 + Math.floor(rng.float() * 3);
    for (let i = 0; i < nDrops; i++) {
      const sx = (rng.float() - 0.5) * (w - 1);
      const sz = (rng.float() - 0.5) * (d - 1);
      const sag = 0.25 + rng.float() * 0.55;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(sx, h - 0.06, sz),
        new THREE.Vector3(sx + (rng.float() - 0.5) * 0.3, h - sag, sz + (rng.float() - 0.5) * 0.3),
        new THREE.Vector3(sx + (rng.float() - 0.5) * 0.2, h - sag - 0.02, sz + (rng.float() - 0.5) * 0.2),
      );
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.012, 5), MAT.charcoal());
      group.add(wire);
    }
  }
  // Vent registers — small louvered grilles on suspended ceilings too.
  if (suspended && rng.float() < 0.6) {
    const vent = new THREE.Mesh(texBox(0.55, 0.02, 0.55), MAT.steelDark());
    vent.position.set((rng.float() - 0.5) * (w - 1.5), h - 0.145, (rng.float() - 0.5) * (d - 1.5));
    group.add(vent);
    for (let lv = -2; lv <= 2; lv++) {
      const louvre = new THREE.Mesh(texBox(0.5, 0.015, 0.05), MAT.charcoal());
      louvre.rotation.x = 0.5;
      louvre.position.set(vent.position.x, h - 0.16, vent.position.z + lv * 0.1);
      group.add(louvre);
    }
  }

  // Walls from collider boxes (local coords → room group is placed at origin with yaw,
  // so we emit wall meshes in LOCAL space matching colliders).
  for (const c of spec.colliders) {
    if (c.walkable) continue;
    if (c.w <= 0.05 || c.d <= 0.05) continue;
    if (c.h < h * 0.5 && !c.losOnly) continue; // only tall wall segments become walls
    const wallMesh = new THREE.Mesh(texBox(c.w, c.h, c.d), wallMat);
    wallMesh.position.set(c.x, (c.y ?? 0) + c.h / 2, c.z);
    group.add(wallMesh);
  }
  // Trim: baseboard + crown strips along the four walls. Wall slabs are
  // ~0.24 thick with the inner face ~0.12 inside the edge — trim centered
  // shallower than that is swallowed by the wall and never seen.
  const grand = spec.biome === 'gallery' || spec.biome === 'lobby' || spec.biome === 'milestone' || spec.biome === 'safe';
  const trimMat = isUnder || spec.biome === 'maintenance' ? MAT.steelDark() : grand ? TEX.woodCarved() : MAT.darkOak();
  const wainsMat = isUnder ? MAT.steelDark() : grand ? TEX.woodCarved() : MAT.darkOak();
  const trimInset = 0.16;
  for (const [sx, sz, sw2, sd] of [
    [0, d / 2 - trimInset, w - 0.3, 0.07],
    [0, -d / 2 + trimInset, w - 0.3, 0.07],
    [w / 2 - trimInset, 0, 0.07, d - 0.3],
    [-w / 2 + trimInset, 0, 0.07, d - 0.3],
  ] as const) {
    const bb = new THREE.Mesh(texBox(sw2, 0.12, sd), trimMat);
    bb.position.set(sx, 0.06, sz);
    group.add(bb);
    const cr = new THREE.Mesh(texBox(sw2, 0.1, sd), trimMat);
    cr.position.set(sx, h - 0.05, sz);
    group.add(cr);
    if (!isUnder && spec.biome !== 'maintenance' && h >= 2.6) {
      // Wainscot panel band + chair rail + picture rail (non-underfloor rooms)
      const panel = new THREE.Mesh(texBox(sw2, 0.85, sd * 0.8), wainsMat);
      panel.position.set(sx, 0.55, sz);
      group.add(panel);
      const chairRail = new THREE.Mesh(texBox(sw2, 0.06, sd), trimMat);
      chairRail.position.set(sx, 0.98, sz);
      group.add(chairRail);
      const picRail = new THREE.Mesh(texBox(sw2, 0.05, sd), trimMat);
      picRail.position.set(sx, Math.min(2.35, h - 0.45), sz);
      group.add(picRail);
      // Wallpaper border — a patterned band just under the picture rail.
      if (isWallpaper) {
        const bMat = TEX.wallpaperGrand();
        bMat.color.setHex(rng.pick([0x4e463a, 0x554733, 0x3f4436]));
        const bdr = new THREE.Mesh(texBox(sw2, 0.11, sd * 1.06), bMat);
        bdr.position.set(sx, Math.min(2.35, h - 0.45) - 0.09, sz);
        group.add(bdr);
      }
    }
  }

  // Pilasters — shallow engaged columns rhythm the long walls of grand
  // rooms; capital + base at crown/baseboard heights.
  if (grand && !isUnder && w >= 6 && h >= 2.9) {
    const n = Math.floor(w / 3.2);
    for (const sgn of [1, -1]) {
      for (let i = 1; i <= n; i++) {
        const px = -w / 2 + (i * w) / (n + 1);
        const pil = new THREE.Mesh(texBox(0.34, h - 0.62, 0.1), wainsMat);
        pil.position.set(px, (h - 0.62) / 2 + 0.1, sgn * (d / 2 - 0.12));
        group.add(pil);
        const cap = new THREE.Mesh(texBox(0.44, 0.14, 0.15), trimMat);
        cap.position.set(px, h - 0.6, sgn * (d / 2 - 0.11));
        group.add(cap);
        const base = new THREE.Mesh(texBox(0.42, 0.24, 0.14), trimMat);
        base.position.set(px, 0.16, sgn * (d / 2 - 0.11));
        group.add(base);
      }
    }
  }

  const wireColliders = (built: ReturnType<typeof buildProp>) => {
    for (const c of built.colliders) {
      const cos = Math.cos(room.yaw), sin = Math.sin(room.yaw);
      const wx = room.origin.x + c.x * cos + c.z * sin;
      const wz = room.origin.z - c.x * sin + c.z * cos;
      const swapped = Math.round(room.yaw / (Math.PI / 2)) % 2 !== 0;
      const ww = swapped ? c.d : c.w;
      const wd = swapped ? c.w : c.d;
      const box = aabb(wx, room.origin.y + (c.y ?? 0) + c.h / 2, wz, ww / 2, c.h / 2, wd / 2);
      if (c.losOnly) {
        room.losBlockers.push(box);
      } else if (!c.walkable) {
        room.colliders.push(box);
        if (!c.movementOnly) room.losBlockers.push(box);
      }
    }
  };

  const dripSpots: [number, number][] = [];

  // Contact shadow under a floor-standing prop — props whose collider sits at
  // floor level get a soft dark ellipse so they read grounded, not floating.
  const groundShadow = (built: ReturnType<typeof buildProp>, x: number, z: number, y = 0) => {
    if (y > 0.05) return;
    let fw = 0, fd = 0;
    for (const c of built.colliders) {
      if ((c.y ?? 0) > 0.05 || c.losOnly || c.movementOnly) continue;
      fw = Math.max(fw, c.w); fd = Math.max(fd, c.d);
    }
    if (fw < 0.12 || fd < 0.12) return;
    const s = contactShadow(fw, fd);
    s.position.set(x, 0.011, z);
    group.add(s);
  };

  // Soft moonlight spill on the floor under a window — shared by the
  // biome-mount roll and template-declared window props.
  const moonlightPool = (px: number, pz: number, yaw: number) => {
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0x5f7791, alphaMap: poolTexture(), transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    poolMat.userData.decalMat = true;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.6), poolMat);
    pool.position.set(px, 0.013, pz);
    pool.rotation.set(-Math.PI / 2, yaw, 0);
    group.add(pool);
  };

  // Door frames at ports
  const doorLeaves = new Map<string, THREE.Object3D>();
  const doorPositions = [spec.entry, ...spec.exits];
  for (const port of doorPositions) {
    const lp = portLocalPos(port, w, d);
    const frame = new THREE.Group();
    const fw = port.width + 0.3;
    const sideW = 0.15;
    const frameMat = isUnder ? MAT.steelDark() : MAT.darkOak();
    const left = new THREE.Mesh(texBox(sideW, 2.3, 0.4), frameMat);
    left.position.set(-fw / 2 + sideW / 2, 1.15, 0);
    const right = new THREE.Mesh(left.geometry, frameMat);
    right.position.set(fw / 2 - sideW / 2, 1.15, 0);
    const top = new THREE.Mesh(texBox(fw, 0.25, 0.4), frameMat);
    top.position.y = 2.4;
    frame.add(left, right, top);
    // Outer architrave casing — shallow lip proud of the wall on both faces
    const caseMat = isUnder ? MAT.steelDark() : MAT.oak();
    for (const zOff of [0.26, -0.26]) {
      const cl = new THREE.Mesh(texBox(0.09, 2.55, 0.05), caseMat);
      cl.position.set(-fw / 2 + sideW / 2, 1.28, zOff);
      const cr2 = new THREE.Mesh(cl.geometry, caseMat);
      cr2.position.set(fw / 2 - sideW / 2, 1.28, zOff);
      const ct = new THREE.Mesh(texBox(fw + 0.12, 0.12, 0.05), caseMat);
      ct.position.set(0, 2.56, zOff);
      frame.add(cl, cr2, ct);
    }
    // Glazed transom over tall-room doors — frosted pane + muntin grid that
    // catches a faint glow from the space beyond.
    if (!(isUnder || spec.biome === 'maintenance' || spec.biome === 'corridor') && h >= 3.0 && rng.float() < 0.55) {
      const tw = fw - 0.2;
      const warm = rng.bool(0.6);
      const tMat = new THREE.MeshStandardMaterial({
        color: 0x161c22, emissive: warm ? 0x7a5a30 : 0x3a5062,
        emissiveIntensity: 0.45 + rng.float() * 0.35, roughness: 0.35, metalness: 0.1,
      });
      const glass = new THREE.Mesh(texBox(tw, 0.4, 0.03), tMat);
      glass.position.set(0, 2.66, 0);
      frame.add(glass);
      for (const mx of [-tw / 6, tw / 6]) {
        const munt = new THREE.Mesh(texBox(0.024, 0.4, 0.05), frameMat);
        munt.position.set(mx, 2.66, 0);
        frame.add(munt);
      }
      const mid = new THREE.Mesh(texBox(tw, 0.024, 0.05), frameMat);
      mid.position.set(0, 2.66, 0);
      frame.add(mid);
      // shallow hood over the transom ties it into the casing
      const hood = new THREE.Mesh(texBox(fw + 0.14, 0.07, 0.1), caseMat);
      hood.position.set(0, 2.9, 0);
      frame.add(hood);
    }
    // Light-switch plate on the latch-side jamb, both faces of the wall.
    if (!isUnder && rng.float() < 0.7) {
      for (const zOff of [0.125, -0.125]) {
        const sw = new THREE.Mesh(texBox(0.09, 0.14, 0.015), MAT.paper());
        sw.position.set(fw / 2 + 0.14, 1.22, zOff);
        frame.add(sw);
        const toggle = new THREE.Mesh(texBox(0.018, 0.05, 0.02), MAT.paperOld());
        toggle.position.set(fw / 2 + 0.14, 1.22, zOff + (zOff > 0 ? 0.013 : -0.013));
        toggle.rotation.x = zOff > 0 ? 0.25 : -0.25;
        frame.add(toggle);
      }
    }
    // Exit signage: service areas get a red EXIT box instead of a number plate.
    const industrial = isUnder || spec.biome === 'maintenance' || spec.biome === 'corridor';
    if (industrial && port !== spec.entry && rng.float() < 0.45) {
      for (const zOff of [0.26, -0.26]) {
        const es = new THREE.Mesh(texBox(0.55, 0.22, 0.06), MAT.redLamp());
        es.position.set(0, 2.62, zOff);
        frame.add(es);
      }
    } else {
      // Numbered label plate above door — exit doors read the next room's number.
      const label = String(port === spec.entry ? room.index : room.index + 1).padStart(3, '0');
      const plate = new THREE.Mesh(texBox(0.55, 0.27, 0.05), plateMaterial(label) ?? MAT.brass());
      plate.name = 'door-plate';
      plate.userData.port = port === spec.entry ? 'entry' : 'exit';
      plate.position.y = 2.68;
      frame.add(plate);
    }
    // leaf — painted/metal variants by biome, seeded per room
    const leafMat = isUnder
      ? MAT.steel()
      : spec.biome === 'maintenance'
        ? MAT.steelDark()
        : rng.pick([TEX.woodFloor(), TEX.woodFloor(), MAT.darkOak(), MAT.oxGreen()]);
    const leafW = port.width - 0.1;
    // Milled 6-panel door (Blender prefab) when loaded — real molded
    // stiles/rails/panels instead of box relief. Falls back to the
    // procedural leaf below until the GLB streams in.
    const doorModel = !industrial ? modelInstance('doorLeaf', rng.float()) : null;
    const leaf: THREE.Object3D = new THREE.Group();
    if (doorModel) {
      // Normalized to 1m wide / 2.2 tall / floor-anchored — stretch to the
      // port width and drop it so the leaf hangs from the hinge pivot.
      doorModel.scale.x = leafW;
      doorModel.position.y = -1.1;
      leaf.add(doorModel);
    } else {
      leaf.add(new THREE.Mesh(texBox(leafW, 2.2, 0.09), leafMat));
    }
    // Raised 6-panel relief + brass hardware on interior (non-industrial)
    // doors — the slab reads flat otherwise.
    if (!industrial && !doorModel) {
      const pw = port.width - 0.1;
      const panelMat = leafMat;
      const recessMat = MAT.darkOak();
      for (const fz of [0.048, -0.048]) {
        for (let col = 0; col < 2; col++) {
          for (let row = 0; row < 3; row++) {
            const ph = row === 0 ? 0.55 : row === 1 ? 0.72 : 0.5;
            const py = row === 0 ? 0.62 : row === 1 ? -0.02 : -0.63;
            // shadowed recess behind each raised panel — reads as a real
            // mortised panel instead of floating trim
            const recess = new THREE.Mesh(texBox(pw * 0.4, ph + 0.05, 0.01), recessMat);
            recess.position.set((col - 0.5) * pw * 0.44, py, fz - Math.sign(fz) * 0.012);
            leaf.add(recess);
            const panel = new THREE.Mesh(texBox(pw * 0.34, ph, 0.018), panelMat);
            panel.position.set((col - 0.5) * pw * 0.44, py, fz);
            leaf.add(panel);
          }
        }
      }
      // knob + backplate on the latch edge, both faces
      for (const fz of [0.06, -0.06]) {
        const bp = new THREE.Mesh(texBox(0.05, 0.16, 0.012), MAT.brass());
        bp.position.set(pw / 2 - 0.14, -0.02, fz);
        leaf.add(bp);
      }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), MAT.brass());
      knob.position.set(pw / 2 - 0.14, -0.02, 0.075);
      leaf.add(knob);
      const knob2 = new THREE.Mesh(knob.geometry, MAT.brass());
      knob2.position.set(pw / 2 - 0.14, -0.02, -0.075);
      leaf.add(knob2);
      // three strap hinges on the hinge stile, both faces
      for (const fz of [0.048, -0.048]) {
        for (const hy of [0.75, -0.02, -0.8]) {
          const hg = new THREE.Mesh(texBox(0.09, 0.14, 0.02), MAT.brass());
          hg.position.set(-pw / 2 + 0.05, hy, fz);
          leaf.add(hg);
        }
      }
    } else {
      // kick plate + rivets on service doors
      const kp = new THREE.Mesh(texBox(port.width - 0.16, 0.3, 0.02), MAT.steelDark());
      kp.position.set(0, -0.88, 0.05);
      leaf.add(kp);
    }
    // Light seeping under the door — the thin emissive seam at the leaf's
    // bottom edge reads as a lit space beyond, warm indoors / cold service.
    if (rng.float() < 0.35) {
      const seamMat = new THREE.MeshStandardMaterial({
        color: 0x1a1510,
        emissive: industrial ? 0x9fb6c8 : 0xd8b070,
        emissiveIntensity: 0.9, roughness: 1,
      });
      seamMat.userData.decalMat = true;
      const seam = new THREE.Mesh(texBox(port.width - 0.12, 0.012, 0.085), seamMat);
      seam.position.set(0, -1.095, 0);
      leaf.add(seam);
    }
    // hinge hardware on metal service doors (interior got its strap
    // hinges inside the raised-panel block)
    if (industrial) {
      for (const hy of [0.75, -0.02, -0.8]) {
        const hg = new THREE.Mesh(texBox(0.07, 0.16, 0.03), MAT.steelDark());
        hg.position.set(-(port.width - 0.1) / 2 + 0.04, hy, 0.05);
        leaf.add(hg);
      }
    }
    // hinge at edge for swing
    const hinge = new THREE.Group();
    leaf.position.set(port.width / 2 - 0.05, 1.1, 0);
    hinge.add(leaf);
    hinge.position.set(-port.width / 2 + 0.05, 0, 0);
    frame.add(hinge);
    frame.position.set(lp.x, 0, lp.z);
    if (port.wall === 'e') frame.rotation.y = -Math.PI / 2;
    else if (port.wall === 'w') frame.rotation.y = Math.PI / 2;
    else if (port.wall === 'n') frame.rotation.y = Math.PI;
    group.add(frame);
    const doorId = port === spec.entry ? `door-${room.index}-in` : `door-${room.index}-out-${port.wall}${port.offset.toFixed(1)}`;
    doorLeaves.set(doorId, leaf);
    leaf.userData.hinge = hinge;
    leaf.userData.closedYaw = 0;
  }

  // Lit sconce/cage fixtures put a real warm point light into the room —
  // emissive alone leaves the fixture glowing but nothing illuminated.
  // Captured in the decal block, consumed in the light-fixture block below.
  let sconcePos: { x: number; y: number; z: number } | null = null;

  // Decal overlays — grime streaks, floor stains, posters, warning stripes
  // on planes slightly offset off surfaces. Boundary walls only.
  {
    const wallDecal = (wall: 'n' | 's' | 'e' | 'w', tex: THREE.Texture | null, dw: number, dh: number, along: number, cy: number) => {
      const m = decalQuad(tex, dw, dh);
      if (wall === 'e') { m.rotation.y = -Math.PI / 2; m.position.set(w / 2 - 0.013, cy, along); }
      else if (wall === 'w') { m.rotation.y = Math.PI / 2; m.position.set(-w / 2 + 0.013, cy, along); }
      else if (wall === 'n') { m.rotation.y = Math.PI; m.position.set(along, cy, d / 2 - 0.013); }
      else { m.position.set(along, cy, -d / 2 + 0.013); }
      group.add(m);
    };
    const portOffsetsOn = (wall: string) => [spec.entry, ...spec.exits].filter((p) => p.wall === wall).map((p) => p.offset);
    const pickWallSpot = (dw: number): { wall: 'n' | 's' | 'e' | 'w'; along: number } | null => {
      for (let tries = 0; tries < 4; tries++) {
        const wall = (['n', 's', 'e', 'w'] as const)[Math.floor(rng.float() * 4)];
        const span = (wall === 'e' || wall === 'w' ? d : w) - dw - 0.4;
        const along = (rng.float() - 0.5) * Math.max(0.2, span);
        if (portOffsetsOn(wall).every((o) => Math.abs(along - o) > dw / 2 + 0.9)) return { wall, along };
      }
      return null;
    };

    // Hostile-space flag — drives the weighting of decay/violence
    // dressing below; hoisted so early blocks can use it.
    const hostile = room.darkRoom || spec.biome === 'unlit' || spec.biome === 'maintenance' || isUnder;

    // Posters / notices — corridor/records/lobby heavy, rare in maintenance.
    const posterP = ({ lobby: 0.6, corridor: 0.6, records: 0.55, guest: 0.3, gallery: 0.25, maintenance: 0.1, unlit: 0.15, milestone: 0.2, safe: 0.3, underscript: 0.05 } as Record<string, number>)[spec.biome] ?? 0.2;
    const nPosters = rng.float() < posterP ? 1 + Math.floor(rng.float() * 3) : 0;
    for (let i = 0; i < nPosters; i++) {
      const spot = pickWallSpot(0.62);
      if (!spot) break;
      wallDecal(spot.wall, poster(rng), 0.5, 0.68, spot.along, 1.35 + rng.float() * 0.35);
    }

    // Grime streaks — every room gets some; service spaces heavier.
    const nGrime = spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder ? 2 + Math.floor(rng.float() * 3) : 1 + Math.floor(rng.float() * 2);
    for (let i = 0; i < nGrime; i++) {
      const spot = pickWallSpot(0.9);
      if (!spot) break;
      wallDecal(spot.wall, grimeStreak(rng), 0.9, 1.9, spot.along, 1.5 + rng.float() * 0.4);
    }

    // Hairline cracks — jagged splits on walls and, rarely, the ceiling.
    const crackP = hostile ? 0.4 : spec.biome === 'safe' ? 0 : 0.12;
    if (rng.float() < crackP) {
      const n = 1 + Math.floor(rng.float() * 2);
      for (let i = 0; i < n; i++) {
        const spot = pickWallSpot(1.1);
        if (!spot) break;
        wallDecal(spot.wall, crackDecal(rng), 1.1, 1.1, spot.along, 1.3 + rng.float() * 0.7);
      }
      if (rng.float() < 0.3) {
        const m = decalQuad(crackDecal(rng), 1.3, 1.3);
        m.rotation.x = Math.PI / 2;
        m.rotation.z = rng.float() * Math.PI;
        m.position.set((rng.float() - 0.5) * (w - 1.6), h - 0.055, (rng.float() - 0.5) * (d - 1.6));
        group.add(m);
      }
    }

    // Cobwebs at wall-ceiling edges — dark, undisturbed spaces only.
    const webP = room.darkRoom ? 0.55 : isUnder || spec.biome === 'maintenance' || spec.biome === 'unlit' ? 0.4 : 0.12;
    if (rng.float() < webP) {
      const nWeb = 1 + Math.floor(rng.float() * 2);
      for (let i = 0; i < nWeb; i++) {
        const spot = pickWallSpot(0.62);
        if (!spot) break;
        const web = decalQuad(cobweb(rng), 0.62, 0.62);
        // cobweb tex anchors top-right; mirror half the time for left corners
        if (rng.bool(0.5)) web.scale.x = -1;
        if (spot.wall === 'e') { web.rotation.y = -Math.PI / 2; web.position.set(w / 2 - 0.013, h - 0.38, spot.along); }
        else if (spot.wall === 'w') { web.rotation.y = Math.PI / 2; web.position.set(-w / 2 + 0.013, h - 0.38, spot.along); }
        else if (spot.wall === 'n') { web.rotation.y = Math.PI; web.position.set(spot.along, h - 0.38, d / 2 - 0.013); }
        else { web.position.set(spot.along, h - 0.38, -d / 2 + 0.013); }
        group.add(web);
      }
    }

    // Violence residue — claw gouges + grabbed walls in the hostile wings,
    // rare enough to stay a shock. Never in safe rooms.
    if (hostile && spec.biome !== 'safe' && rng.float() < (isUnder ? 0.5 : 0.3)) {
      const spot = pickWallSpot(1.0);
      if (spot) {
        if (rng.bool(0.55)) wallDecal(spot.wall, scratchMarks(rng), 0.85, 1.6, spot.along, 1.5 + rng.float() * 0.3);
        else wallDecal(spot.wall, handPrints(rng), 1.1, 0.9, spot.along, 1.35 + rng.float() * 0.3);
      }
    }

    // Warning stripes — machinery rooms mostly.
    const warnP = spec.biome === 'maintenance' ? 0.7 : isUnder ? 0.5 : spec.biome === 'corridor' ? 0.2 : 0;
    if (rng.float() < warnP) {
      const spot = pickWallSpot(2.3);
      if (spot) wallDecal(spot.wall, warningStripe(), 2.3, 0.26, spot.along, 1.05 + rng.float() * 0.3);
    }

    // Power outlets at baseboard height — twin-socket boxes on inside
    // faces; institutional detail that reads at eye level.
    if (!isUnder && rng.float() < 0.55) {
      const nOut = 1 + (rng.float() < 0.4 ? 1 : 0);
      for (let i = 0; i < nOut; i++) {
        const spot = pickWallSpot(0.3);
        if (!spot) break;
        const outlet = new THREE.Mesh(texBox(0.16, 0.09, 0.02), MAT.paper());
        const socket = new THREE.Mesh(texBox(0.11, 0.05, 0.012), MAT.charcoal());
        if (spot.wall === 'e') { outlet.rotation.y = -Math.PI / 2; outlet.position.set(w / 2 - 0.135, 0.28, spot.along); socket.rotation.y = -Math.PI / 2; socket.position.set(w / 2 - 0.142, 0.28, spot.along); }
        else if (spot.wall === 'w') { outlet.rotation.y = Math.PI / 2; outlet.position.set(-w / 2 + 0.135, 0.28, spot.along); socket.rotation.y = Math.PI / 2; socket.position.set(-w / 2 + 0.142, 0.28, spot.along); }
        else if (spot.wall === 'n') { outlet.rotation.y = Math.PI; outlet.position.set(spot.along, 0.28, d / 2 - 0.135); socket.rotation.y = Math.PI; socket.position.set(spot.along, 0.28, d / 2 - 0.142); }
        else { outlet.position.set(spot.along, 0.28, -d / 2 + 0.135); socket.position.set(spot.along, 0.28, -d / 2 + 0.142); }
        group.add(outlet, socket);
      }
    }

    // Peeling wallpaper — torn paper exposing plaster, only where the skin
    // is actually wallpaper. Heavier in damp/hostile rooms, never safe.
    if (isWallpaper && spec.biome !== 'safe' && rng.float() < (hostile ? 0.5 : 0.3)) {
      const n = 1 + (rng.float() < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const spot = pickWallSpot(0.9);
        if (!spot) break;
        wallDecal(spot.wall, peeledWallpaper(rng), 0.75, 1.0, spot.along, 1.15 + rng.float() * 0.55);
      }
    }

    // Broken plaster exposing brick — decay on shabby walls; skipped where
    // the skin is already brick/tile/metal (nothing to expose through).
    const solidSurface = spec.wallMaterial === 'brick' || spec.wallMaterial === 'tile' || spec.wallMaterial === 'corrugated' || spec.wallMaterial === 'travertine' || spec.wallMaterial === 'woodPanel';
    const brickP = room.darkRoom || spec.biome === 'unlit' ? 0.4 : isUnder || spec.biome === 'maintenance' ? 0.3 : 0.05;
    if (!solidSurface && spec.biome !== 'safe' && rng.float() < brickP) {
      const spot = pickWallSpot(1.3);
      if (spot) wallDecal(spot.wall, brickPatch(rng), 1.3, 1.1, spot.along, 1.4 + rng.float() * 0.5);
    }

    // Rat holes — gnawed openings chewed into the baseboard, occasionally
    // with a smear of droppings. Corridors, pantries, service wings.
    const ratP = ({ corridor: 0.3, records: 0.25, maintenance: 0.35, unlit: 0.3, underscript: 0.35, guest: 0.1 } as Record<string, number>)[spec.biome] ?? (isUnder ? 0.35 : 0);
    if (rng.float() < ratP) {
      const spot = pickWallSpot(0.5);
      if (spot) {
        const holeMat = MAT.darkVoid();
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.085, 10, 0, Math.PI), holeMat);
        if (spot.wall === 'e') { hole.rotation.y = -Math.PI / 2; hole.position.set(w / 2 - 0.126, 0.02, spot.along); }
        else if (spot.wall === 'w') { hole.rotation.y = Math.PI / 2; hole.position.set(-w / 2 + 0.126, 0.02, spot.along); }
        else if (spot.wall === 'n') { hole.rotation.y = Math.PI; hole.position.set(spot.along, 0.02, d / 2 - 0.126); }
        else { hole.position.set(spot.along, 0.02, -d / 2 + 0.126); }
        group.add(hole);
        if (rng.bool(0.4)) {
          const droppings = decalQuad(floorStain(rng), 0.3, 0.2);
          droppings.rotation.x = -Math.PI / 2;
          const inward = spot.wall === 'e' ? { x: hole.position.x - 0.25, z: hole.position.z }
            : spot.wall === 'w' ? { x: hole.position.x + 0.25, z: hole.position.z }
            : spot.wall === 'n' ? { x: hole.position.x, z: hole.position.z - 0.25 }
            : { x: hole.position.x, z: hole.position.z + 0.25 };
          droppings.position.set(inward.x, 0.013, inward.z);
          group.add(droppings);
        }
      }
    }

    // Sprinkler run — a pipe hugging the ceiling edge with pendant heads
    // every few meters. Service + institutional spaces.
    const sprinkP = ({ maintenance: 0.55, corridor: 0.4, records: 0.35, underscript: 0.5 } as Record<string, number>)[spec.biome] ?? (isUnder ? 0.5 : 0);
    if (!suspended && h >= 2.7 && rng.float() < sprinkP) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, d * 0.9, 8), MAT.steelDark());
      pipe.rotation.x = Math.PI / 2;
      const px = (rng.float() - 0.5) * (w * 0.5);
      pipe.position.set(px, h - 0.12, 0);
      group.add(pipe);
      const nH = Math.max(1, Math.floor(d / 3));
      for (let i = 0; i < nH; i++) {
        const hz = -d * 0.45 + (i + 0.5) * ((d * 0.9) / nH);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 0.06, 6), MAT.brass());
        head.position.set(px, h - 0.17, hz);
        group.add(head);
        const def = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8), MAT.brass());
        def.position.set(px, h - 0.205, hz);
        group.add(def);
      }
    }

    // Panel molding — picture-frame trim rectangles on formal-room walls
    // between the chair rail and picture rail. Four thin strips per frame.
    const moldingP = ({ gallery: 0.8, lobby: 0.7, milestone: 0.6, guest: 0.35 } as Record<string, number>)[spec.biome] ?? 0;
    if (!isUnder && rng.float() < moldingP) {
      const nFrames = 1 + Math.floor(rng.float() * 2);
      for (let i = 0; i < nFrames; i++) {
        const fw = 1.1 + rng.float() * 0.7, fh = 0.9 + rng.float() * 0.4;
        const spot = pickWallSpot(fw + 0.2);
        if (!spot) break;
        const cy = 1.55 + rng.float() * 0.35;
        const t = 0.035;
        const fr = new THREE.Group();
        for (const [bw, bh, bx, by] of [
          [fw, t, 0, fh / 2], [fw, t, 0, -fh / 2],
          [t, fh, -fw / 2, 0], [t, fh, fw / 2, 0],
        ] as const) {
          const strip = new THREE.Mesh(texBox(bw, bh, 0.03), trimMat);
          strip.position.set(bx, by, 0.005);
          fr.add(strip);
        }
        if (spot.wall === 'e') { fr.rotation.y = -Math.PI / 2; fr.position.set(w / 2 - 0.02, cy, spot.along); }
        else if (spot.wall === 'w') { fr.rotation.y = Math.PI / 2; fr.position.set(-w / 2 + 0.02, cy, spot.along); }
        else if (spot.wall === 'n') { fr.rotation.y = Math.PI; fr.position.set(spot.along, cy, d / 2 - 0.02); }
        else { fr.position.set(spot.along, cy, -d / 2 + 0.02); }
        group.add(fr);
      }
    }

    // Area rug — a bordered carpet runner center-floor in lived-in rooms.
    const rugP = ({ lobby: 0.6, guest: 0.55, gallery: 0.4, records: 0.3, milestone: 0.5, safe: 0.4 } as Record<string, number>)[spec.biome] ?? 0;
    if (!isUnder && rng.float() < rugP && w > 3.4 && d > 3.4) {
      const rw = Math.min(w - 1.6, 1.8 + rng.float() * 1.4);
      const rd = Math.min(d - 1.6, 1.4 + rng.float() * 1.6);
      const rx = (rng.float() - 0.5) * (w - rw - 1.2);
      const rz = (rng.float() - 0.5) * (d - rd - 1.2);
      const rugPal = [0x5a2a24, 0x2c3a4a, 0x3c4a34, 0x4a3c2c];
      const rugMat = rng.bool(0.4) ? TEX.fabricChintz() : TEX.clothWorn();
      rugMat.color.setHex(rugPal[Math.floor(rng.float() * rugPal.length)]);
      const border = new THREE.Mesh(texBox(rw + 0.14, 0.012, rd + 0.14), MAT.darkOak());
      border.position.set(rx, 0.008, rz);
      group.add(border);
      const rug = new THREE.Mesh(texBox(rw, 0.018, rd), rugMat);
      rug.position.set(rx, 0.014, rz);
      group.add(rug);
    }

    // Corridor runner rug — a long worn strip down hallway rooms.
    if (spec.biome === 'corridor' && !isUnder && d > w * 1.3 && rng.float() < 0.4) {
      const rw = Math.min(1.1, w * 0.3);
      const rl = d * (0.6 + rng.float() * 0.25);
      const runMat = rng.bool(0.4) ? TEX.fabricChintz() : TEX.clothWorn();
      runMat.color.setHex(rng.pick([0x4a2620, 0x2e3a3c, 0x3a3028]));
      const run = new THREE.Mesh(texBox(rw, 0.016, rl), runMat);
      run.position.set((rng.float() - 0.5) * (w - rw - 1), 0.012, (rng.float() - 0.5) * (d - rl - 1));
      run.rotation.y = (rng.float() - 0.5) * 0.05;
      group.add(run);
    }

    // Sheet-draped furniture — pale dust covers over anonymous shapes;
    // abandoned-storage reading, solid so it can't be walked through.
    const drapeP = ({ guest: 0.3, lobby: 0.25, gallery: 0.3, records: 0.15, milestone: 0.12, corridor: 0.1 } as Record<string, number>)[spec.biome] ?? 0;
    if (!isUnder && spec.biome !== 'safe' && rng.float() < drapeP) {
      const tall = rng.bool(0.5);
      const dw = tall ? 0.7 + rng.float() * 0.3 : 1.1 + rng.float() * 0.7;
      const dd = tall ? 0.6 + rng.float() * 0.2 : 0.6 + rng.float() * 0.3;
      const dh = tall ? 1.5 + rng.float() * 0.4 : 0.85 + rng.float() * 0.35;
      const px = (rng.float() - 0.5) * (w - dw - 1.4);
      const pz = (rng.float() - 0.5) * (d - dd - 1.4);
      const sheetMat = rng.bool(0.5) ? TEX.fabricChintz() : TEX.clothWorn();
      sheetMat.color.setHex(rng.pick([0xa8a294, 0x96928a, 0xb0a894]));
      const body = new THREE.Mesh(texBox(dw, dh - 0.05, dd), sheetMat);
      body.position.set(px, dh / 2 + 0.02, pz);
      body.rotation.y = (rng.float() - 0.5) * 0.12;
      group.add(body);
      // drape hem — a slightly wider skirt at floor level
      const hem = new THREE.Mesh(texBox(dw + 0.07, 0.14, dd + 0.07), sheetMat);
      hem.position.set(px, 0.09, pz);
      hem.rotation.y = body.rotation.y;
      group.add(hem);
      // solid collision so it can't be walked through
      const cos = Math.cos(room.yaw), sin = Math.sin(room.yaw);
      const wx = room.origin.x + px * cos + pz * sin;
      const wz = room.origin.z - px * sin + pz * cos;
      const swapped = Math.round(room.yaw / (Math.PI / 2)) % 2 !== 0;
      const wb = aabb(wx, room.origin.y + dh / 2, wz, (swapped ? dd : dw) / 2 + 0.03, dh / 2, (swapped ? dw : dd) / 2 + 0.03);
      room.colliders.push(wb);
      if (dh > 1.2) room.losBlockers.push(wb);
    }

    // Chimney breast — masonry bump-out with carved mantel, granite hearth
    // and a charred firebox. Anchors a room like real period joinery.
    const chimP = ({ gallery: 0.3, lobby: 0.22, guest: 0.3, safe: 0.4, milestone: 0.35 } as Record<string, number>)[spec.biome] ?? 0;
    if (!isUnder && !suspended && rng.float() < chimP && w >= 4.5 && d >= 4) {
      const sgn = rng.bool(0.5) ? 1 : -1;
      const bw = 1.7 + rng.float() * 0.5;
      const bd = 0.55;
      const cx = (rng.float() - 0.5) * Math.max(0, w - bw - 2.4);
      const cz = sgn * (d / 2 - 0.12 - bd / 2);
      const front = cz - sgn * (bd / 2); // room-facing surface
      const brickMat = rng.bool(0.5) ? TEX.brick() : TEX.stoneWall();
      brickMat.color.multiplyScalar(0.82 + rng.float() * 0.3);
      const breast = new THREE.Mesh(texBox(bw, h, bd), brickMat);
      breast.position.set(cx, h / 2, cz);
      group.add(breast);
      const carved = TEX.woodCarved();
      carved.color.multiplyScalar(0.9 + rng.float() * 0.2);
      // firebox opening — ink-dark cavity + stone lintel + jamb surround
      const opening = new THREE.Mesh(texBox(bw * 0.5, 0.76, 0.05), MAT.ink());
      opening.position.set(cx, 0.44, front + sgn * 0.028);
      group.add(opening);
      const lintel = new THREE.Mesh(texBox(bw * 0.56, 0.08, 0.08), carved);
      lintel.position.set(cx, 0.85, front + sgn * 0.02);
      group.add(lintel);
      for (const o of [-1, 1]) {
        const jam = new THREE.Mesh(texBox(0.1, 0.84, 0.08), carved);
        jam.position.set(cx + o * bw * 0.28, 0.43, front + sgn * 0.02);
        group.add(jam);
      }
      // mantel shelf + corbels
      const mantel = new THREE.Mesh(texBox(bw * 0.72, 0.08, 0.22), carved);
      mantel.position.set(cx, 0.95, front + sgn * 0.09);
      group.add(mantel);
      // hearth slab
      const hearth = new THREE.Mesh(texBox(bw * 0.78, 0.025, 0.5), TEX.granite());
      hearth.position.set(cx, 0.014, front - sgn * 0.22);
      group.add(hearth);
      // grate bars + charred logs; a quarter smoulder with embers
      const lit = rng.float() < 0.25;
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(texBox(0.02, 0.3, 0.02), MAT.charcoal());
        bar.position.set(cx - bw * 0.18 + i * bw * 0.12, 0.2, front + sgn * 0.045);
        group.add(bar);
      }
      for (let i = 0; i < 3; i++) {
        const logM = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.46, 6), MAT.charcoal());
        logM.rotation.z = Math.PI / 2;
        logM.rotation.y = (rng.float() - 0.5) * 0.5;
        logM.position.set(cx + (i - 1) * 0.08, 0.11 + i * 0.03, front + sgn * 0.05);
        group.add(logM);
      }
      if (lit) {
        for (let i = 0; i < 5; i++) {
          const emberMat = new THREE.MeshStandardMaterial({ color: 0x381408, emissive: 0xff5a1a, emissiveIntensity: 1.4, roughness: 1 });
          emberMat.userData.decalMat = true;
          const ember = new THREE.Mesh(new THREE.SphereGeometry(0.018 + rng.float() * 0.014, 6, 5), emberMat);
          ember.position.set(cx + (rng.float() - 0.5) * bw * 0.3, 0.09 + rng.float() * 0.08, front + sgn * (0.03 + rng.float() * 0.05));
          ember.userData.anim = 'flame';
          ember.userData.animSeed = rng.float() * 10;
          ember.userData.baseEm = 1.4;
          group.add(ember);
        }
      }
      const cos = Math.cos(room.yaw), sin = Math.sin(room.yaw);
      const wx = room.origin.x + cx * cos + cz * sin;
      const wz = room.origin.z - cx * sin + cz * cos;
      const swapped = Math.round(room.yaw / (Math.PI / 2)) % 2 !== 0;
      const cb = aabb(wx, room.origin.y + h / 2, wz, (swapped ? bd : bw) / 2, h / 2, (swapped ? bw : bd) / 2);
      room.colliders.push(cb);
      room.losBlockers.push(cb);
    }

    // Mezzanine balcony — a railed deck band along one long wall of tall
    // grand rooms; pure set-dressing (no access) but reads as a second
    // storey and throws a shadow band underneath.
    if (grand && !isUnder && h >= 3.8 && w >= 6 && rng.float() < 0.4) {
      const sgn = rng.bool(0.5) ? 1 : -1;
      const deckD = 0.42;
      const bz = sgn * (d / 2 - 0.12 - deckD / 2);
      const by = 2.52;
      const bw2 = w - 1.2;
      const deck = new THREE.Mesh(texBox(bw2, 0.08, deckD), wainsMat);
      deck.position.set(0, by, bz);
      group.add(deck);
      const railMat2 = trimMat;
      const railY = by + 0.9;
      const topRail = new THREE.Mesh(texBox(bw2, 0.07, 0.07), railMat2);
      topRail.position.set(0, railY, bz - sgn * (deckD / 2 - 0.05));
      group.add(topRail);
      const botRail = new THREE.Mesh(texBox(bw2, 0.05, 0.05), railMat2);
      botRail.position.set(0, by + 0.12, bz - sgn * (deckD / 2 - 0.05));
      group.add(botRail);
      for (let bx = -bw2 / 2; bx <= bw2 / 2; bx += 0.24) {
        const bal = new THREE.Mesh(texBox(0.028, 0.78, 0.028), railMat2);
        bal.position.set(bx, by + 0.5, bz - sgn * (deckD / 2 - 0.05));
        group.add(bal);
      }
      for (const en of [-1, 1]) {
        const post = new THREE.Mesh(texBox(0.09, 0.98, 0.09), railMat2);
        post.position.set(en * bw2 / 2, by + 0.49, bz - sgn * (deckD / 2 - 0.05));
        group.add(post);
      }
      for (let cx2 = -bw2 / 2 + 0.6; cx2 < bw2 / 2; cx2 += 1.4) {
        const corbel = new THREE.Mesh(texBox(0.1, 0.3, 0.3), railMat2);
        corbel.position.set(cx2, by - 0.19, bz + sgn * (deckD / 2 - 0.15));
        group.add(corbel);
      }
      // shadow band under the deck — the gallery overhang darkens its wall
      const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
      shMat.userData.decalMat = true;
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(bw2, 1.1), shMat);
      sh.position.set(0, by - 0.7, sgn * (d / 2 - 0.115));
      sh.rotation.y = sgn > 0 ? Math.PI : 0;
      sh.renderOrder = 1;
      group.add(sh);
    }

    // Collapsed structure reveal — a floor pit near a wall with rubble,
    // hanging slab fragment and rebar stubs; underscript damage storytelling.
    const collP = ({ underscript: 0.4, maintenance: 0.3, unlit: 0.25, corridor: 0.08 } as Record<string, number>)[spec.biome] ?? 0;
    if (rng.float() < collP && w >= 4 && d >= 4) {
      const hx = (rng.float() - 0.5) * (w - 3);
      const hz = (rng.bool(0.5) ? 1 : -1) * (d / 2 - 0.9);
      // pit mouth — dark ellipse sink
      const pitMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.92, depthWrite: false });
      pitMat.userData.decalMat = true;
      const pit = new THREE.Mesh(new THREE.CircleGeometry(0.55 + rng.float() * 0.4, 14), pitMat);
      pit.rotation.x = -Math.PI / 2;
      pit.scale.set(1, 0.7 + rng.float() * 0.4, 1);
      pit.position.set(hx, 0.014, hz);
      pit.renderOrder = 1;
      group.add(pit);
      // jagged rim — irregular concrete chunks around the mouth
      const chunkMat = TEX.concreteFloor();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rng.float() * 0.5;
        const rr = 0.55 + rng.float() * 0.25;
        const chunk = new THREE.Mesh(texBox(0.22 + rng.float() * 0.3, 0.1 + rng.float() * 0.12, 0.18 + rng.float() * 0.25), chunkMat);
        chunk.position.set(hx + Math.cos(a) * rr, 0.06, hz + Math.sin(a) * rr);
        chunk.rotation.y = rng.float() * Math.PI;
        chunk.rotation.z = (rng.float() - 0.5) * 0.25;
        group.add(chunk);
      }
      // bent rebar stubs poking out of the rim
      for (let i = 0; i < 3; i++) {
        const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3 + rng.float() * 0.2, 5), MAT.charcoal());
        rb.position.set(hx + (rng.float() - 0.5) * 0.9, 0.15, hz + (rng.float() - 0.5) * 0.7);
        rb.rotation.z = (rng.float() - 0.5) * 0.9;
        rb.rotation.x = (rng.float() - 0.5) * 0.9;
        group.add(rb);
      }
      // hanging slab fragment — tilted wedge half-detached above the pit
      const frag = new THREE.Mesh(texBox(0.7 + rng.float() * 0.5, 0.1, 0.5 + rng.float() * 0.3), chunkMat);
      frag.position.set(hx + (rng.float() - 0.5) * 0.4, h - 0.5 - rng.float() * 0.5, hz + (rng.float() - 0.5) * 0.4);
      frag.rotation.z = 0.3 + rng.float() * 0.35;
      frag.rotation.x = (rng.float() - 0.5) * 0.3;
      group.add(frag);
      // keep players out of the pit mouth — shallow blocker ring
      const cos = Math.cos(room.yaw), sin = Math.sin(room.yaw);
      const wx = room.origin.x + hx * cos + hz * sin;
      const wz = room.origin.z - hx * sin + hz * cos;
      room.colliders.push(aabb(wx, room.origin.y + 0.15, wz, 0.55, 0.15, 0.5));
    }

    // Corridor arch ribs — transverse post+lintel frames stepping down the
    // long axis; breaks the flat corridor tunnel into bays.
    if (spec.biome === 'corridor' && !isUnder && d > w * 1.15) {
      const n = Math.floor(d / 3.4);
      for (let i = 1; i <= n; i++) {
        const rz = -d / 2 + (i * d) / (n + 1);
        for (const sgn of [1, -1]) {
          const post = new THREE.Mesh(texBox(0.16, h - 0.6, 0.14), trimMat);
          post.position.set(sgn * (w / 2 - 0.13), (h - 0.6) / 2 + 0.05, rz);
          group.add(post);
        }
        const lintel = new THREE.Mesh(texBox(w - 0.2, 0.24, 0.14), trimMat);
        lintel.position.set(0, h - 0.34, rz);
        group.add(lintel);
      }
    }

    // Radiators — cast-iron fin bank + manifolds + floor feeds under a wall
    // of period rooms; the vertical ribbing is unmistakably domestic.
    const radP = ({ guest: 0.45, lobby: 0.4, records: 0.35, safe: 0.5, gallery: 0.3 } as Record<string, number>)[spec.biome] ?? 0;
    if (!isUnder && rng.float() < radP && w >= 3.5) {
      const sgn = rng.bool(0.5) ? 1 : -1;
      const rw = 0.7 + rng.float() * 0.4;
      const rx = (rng.float() - 0.5) * (w - rw - 1.6);
      const rz = sgn * (d / 2 - 0.19);
      const rMat = rng.bool(0.4) ? MAT.steelDark() : TEX.metalRusted();
      const nFin = Math.max(5, Math.floor(rw / 0.09));
      for (let i = 0; i < nFin; i++) {
        const fin = new THREE.Mesh(texBox(0.045, 0.6, 0.12), rMat);
        fin.position.set(rx - rw / 2 + 0.05 + (i * (rw - 0.1)) / (nFin - 1), 0.46, rz);
        group.add(fin);
      }
      for (const my of [0.74, 0.2]) {
        const man = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, rw - 0.06, 8), rMat);
        man.rotation.z = Math.PI / 2;
        man.position.set(rx, my, rz);
        group.add(man);
      }
      for (const o of [-1, 1]) {
        const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), rMat);
        fp.position.set(rx + o * (rw / 2 - 0.08), 0.1, rz);
        group.add(fp);
      }
      const cos = Math.cos(room.yaw), sin = Math.sin(room.yaw);
      const wx = room.origin.x + rx * cos + rz * sin;
      const wz = room.origin.z - rx * sin + rz * cos;
      room.colliders.push(aabb(wx, room.origin.y + 0.4, wz, rw / 2 + 0.04, 0.4, 0.12));
    }

    // Floor vent registers — recessed grille + slats at wall bases in
    // serviced rooms; small but very "institutional interior".
    const ventP = ({ guest: 0.35, lobby: 0.3, records: 0.4, corridor: 0.3, safe: 0.3 } as Record<string, number>)[spec.biome] ?? 0;
    if (!isUnder && rng.float() < ventP && w >= 3) {
      const n = 1 + (rng.float() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const sgn = rng.bool(0.5) ? 1 : -1;
        const vx = (rng.float() - 0.5) * (w - 2);
        const vz = sgn * (d / 2 - 0.105);
        const recess = new THREE.Mesh(texBox(0.52, 0.2, 0.02), MAT.charcoal());
        recess.position.set(vx, 0.16, vz);
        group.add(recess);
        for (let s = 0; s < 5; s++) {
          const slat = new THREE.Mesh(texBox(0.46, 0.018, 0.02), MAT.steelDark());
          slat.position.set(vx, 0.1 + s * 0.035, vz - sgn * 0.006);
          slat.rotation.x = sgn * 0.35;
          group.add(slat);
        }
      }
    }

    // Floor stains.
    const stainP = spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder ? 0.8 : spec.biome === 'corridor' ? 0.5 : 0.2;
    const nStain = rng.float() < stainP ? 1 + Math.floor(rng.float() * 2) : 0;
    for (let i = 0; i < nStain; i++) {
      const sz = 1.4 + rng.float() * 1.3;
      const m = decalQuad(floorStain(rng), sz, sz);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rng.float() * Math.PI;
      m.position.set((rng.float() - 0.5) * (w - sz), 0.006, (rng.float() - 0.5) * (d - sz));
      group.add(m);
    }

    // Muddy footprint trail — something walked through here. A staggered
    // track crossing the floor; heaviest on the walk-paths, never safe.
    const trackP = isUnder ? 0.5 : spec.biome === 'corridor' ? 0.45 : hostile ? 0.4 : spec.biome === 'records' || spec.biome === 'lobby' ? 0.12 : 0.08;
    if (spec.biome !== 'safe' && rng.float() < trackP) {
      const along = d >= w; // lay the trail along the long axis
      const len = (along ? d : w) * (0.55 + rng.float() * 0.3);
      const m = decalQuad(footprintTrail(rng), 0.9, Math.min(4.2, len));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = (along ? 0 : Math.PI / 2) + (rng.bool(0.5) ? Math.PI : 0) + (rng.float() - 0.5) * 0.25;
      m.position.set((rng.float() - 0.5) * (w - 1.6), 0.0065, (rng.float() - 0.5) * (d - 1.6));
      group.add(m);
    }

    // Blood evidence — pools and drag smears; heaviest in the Underscript
    // and dark rooms, sparse elsewhere. Door lanes avoid pools only — a
    // smear running under a door is the point.
    const goreP = isUnder ? 0.55 : room.darkRoom ? 0.45 : spec.biome === 'maintenance' || spec.biome === 'unlit' ? 0.3 : 0.06;
    if (spec.biome !== 'safe' && rng.float() < goreP) {
      const pool = rng.bool(0.6);
      const sz = pool ? 1.3 + rng.float() * 1.2 : 1.8 + rng.float() * 1.4;
      const m = decalQuad(pool ? bloodPool(rng) : bloodSmear(rng), sz, pool ? sz : sz * 0.55);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rng.float() * Math.PI;
      m.position.set((rng.float() - 0.5) * (w - 1.8), 0.007, (rng.float() - 0.5) * (d - 1.8));
      group.add(m);
      // a pool sometimes spatters the nearest wall too
      if (pool && rng.bool(0.4)) {
        const spot = pickWallSpot(0.9);
        if (spot) wallDecal(spot.wall, handPrints(rng), 1.0, 0.85, spot.along, 1.1 + rng.float() * 0.4);
      }
    }

    // Ceiling water stains — under ducts/pipes in service spaces.
    if ((isUnder || spec.biome === 'maintenance') && rng.float() < 0.7) {
      const sz = 1.1 + rng.float() * 1.4;
      const m = decalQuad(floorStain(rng), sz, sz);
      m.rotation.x = Math.PI / 2;
      m.rotation.z = rng.float() * Math.PI;
      m.position.set((rng.float() - 0.5) * (w - sz), h - 0.06, (rng.float() - 0.5) * (d - sz));
      group.add(m);
    }

    // Wall-mounted props (models are center-anchored; face +z → yaw per wall).
    const mountYaw = { e: -Math.PI / 2, w: Math.PI / 2, n: Math.PI, s: 0 } as const;
    const mounts: { kind: PropKind; y: number; p: number }[] = ({
      corridor: [{ kind: 'extinguisher', y: 1.15, p: 0.4 }, { kind: 'medBox', y: 1.45, p: 0.2 }, { kind: 'wallClock2', y: 1.95, p: 0.25 }, { kind: 'securityCam', y: 2.35, p: 0.2 }, { kind: 'pipeLamp', y: 2.5, p: 0.2 }, { kind: 'powerBox', y: 1.7, p: 0.15 }, { kind: 'fireAlarm', y: 1.8, p: 0.3 }, { kind: 'cagedSconce', y: 2.3, p: 0.15 }, { kind: 'window', y: 1.7, p: 0.15 }],
      records: [{ kind: 'wallClock2', y: 1.95, p: 0.35 }, { kind: 'medBox', y: 1.45, p: 0.15 }, { kind: 'securityCam', y: 2.35, p: 0.25 }, { kind: 'window', y: 1.7, p: 0.2 }, { kind: 'hauntedPortrait', y: 1.7, p: 0.1 }],
      lobby: [{ kind: 'securityCam', y: 2.4, p: 0.5 }, { kind: 'wallClock2', y: 2.0, p: 0.4 }, { kind: 'dartboard', y: 1.7, p: 0.25 }, { kind: 'window', y: 1.7, p: 0.3 }, { kind: 'trophyHead', y: 2.05, p: 0.15 }, { kind: 'kiteShield', y: 1.8, p: 0.12 }, { kind: 'hauntedPortrait', y: 1.7, p: 0.15 }],
      guest: [{ kind: 'wallClock2', y: 1.95, p: 0.25 }, { kind: 'dartboard', y: 1.7, p: 0.15 }, { kind: 'window', y: 1.7, p: 0.35 }, { kind: 'hauntedPortrait', y: 1.65, p: 0.12 }],
      gallery: [{ kind: 'securityCam', y: 2.4, p: 0.35 }, { kind: 'window', y: 1.8, p: 0.25 }, { kind: 'trophyHead', y: 2.1, p: 0.25 }, { kind: 'kiteShield', y: 1.8, p: 0.2 }, { kind: 'hauntedPortrait', y: 1.7, p: 0.3 }],
      maintenance: [{ kind: 'extinguisher', y: 1.15, p: 0.5 }, { kind: 'gasMask', y: 1.55, p: 0.25 }, { kind: 'securityCam', y: 2.3, p: 0.2 }, { kind: 'powerBox', y: 1.7, p: 0.45 }, { kind: 'utilityBox', y: 1.6, p: 0.3 }, { kind: 'pipeLamp', y: 2.45, p: 0.3 }, { kind: 'securityLight', y: 2.55, p: 0.2 }, { kind: 'wallHose', y: 1.1, p: 0.2 }, { kind: 'fireAlarm', y: 1.8, p: 0.3 }, { kind: 'cagedSconce', y: 2.3, p: 0.3 }, { kind: 'airconUnit', y: 2.35, p: 0.3 }, { kind: 'rollerShutter', y: 1.45, p: 0.12 }, { kind: 'weedCluster', p: 0.1 }, { kind: 'rootGrowth', p: 0.08, wallBias: true }],
      unlit: [{ kind: 'gasMask', y: 1.55, p: 0.2 }],
      milestone: [{ kind: 'securityCam', y: 2.4, p: 0.3 }],
      safe: [{ kind: 'medBox', y: 1.45, p: 0.45 }],
      underscript: [{ kind: 'gasMask', y: 1.5, p: 0.3 }, { kind: 'powerBox', y: 1.7, p: 0.35 }, { kind: 'utilityBox', y: 1.6, p: 0.3 }, { kind: 'securityLight', y: 2.55, p: 0.15 }, { kind: 'wallHose', y: 1.1, p: 0.15 }, { kind: 'fireAlarm', y: 1.8, p: 0.4 }, { kind: 'cagedSconce', y: 2.3, p: 0.25 }, { kind: 'airconUnit', y: 2.35, p: 0.25 }],
    } as Record<string, { kind: PropKind; y: number; p: number }[]>)[spec.biome] ?? [];
    const SCONCE_KINDS = new Set<PropKind>(['wallSconce', 'cagedSconce', 'pipeLamp', 'securityLight']);
    for (const mt of mounts) {
      if (rng.float() >= mt.p) continue;
      const spot = pickWallSpot(0.6);
      if (!spot) continue;
      const lp = spot.wall === 'e' ? { x: w / 2 - 0.07, z: spot.along }
        : spot.wall === 'w' ? { x: -w / 2 + 0.07, z: spot.along }
        : spot.wall === 'n' ? { x: spot.along, z: d / 2 - 0.07 }
        : { x: spot.along, z: -d / 2 + 0.07 };
      try {
        const built = buildProp({ kind: mt.kind, x: lp.x, z: lp.z, y: mt.y, yaw: mountYaw[spot.wall] }, rng.fork(7000 + Math.floor(spot.along * 10)));
        group.add(built.group);
        if (SCONCE_KINDS.has(mt.kind) && !sconcePos) {
          const inX = spot.wall === 'e' ? -0.3 : spot.wall === 'w' ? 0.3 : 0;
          const inZ = spot.wall === 'n' ? -0.3 : spot.wall === 's' ? 0.3 : 0;
          sconcePos = { x: lp.x + inX, y: mt.y + 0.05, z: lp.z + inZ };
        }
        // Windows cast a pale light pool onto the floor in front of them.
        if (mt.kind === 'window') {
          const inX = spot.wall === 'e' ? -0.8 : spot.wall === 'w' ? 0.8 : 0;
          const inZ = spot.wall === 'n' ? -0.8 : spot.wall === 's' ? 0.8 : 0;
          moonlightPool(lp.x + inX, lp.z + inZ, mountYaw[spot.wall] + (rng.float() - 0.5) * 0.15);
        }
      } catch { /* dressing only */ }
    }
    // Direction signs on corridor walls — institutional boards beside exits.
    if (spec.biome === 'corridor' && rng.float() < 0.4) {
      const spot = pickWallSpot(0.5);
      if (spot) {
        const label = CORRIDOR_SIGNS[Math.floor(rng.float() * CORRIDOR_SIGNS.length)];
        const board = new THREE.Mesh(texBox(1.1, 0.28, 0.04), signMaterial(label) ?? MAT.charcoal());
        const lp2 = spot.wall === 'e' ? { x: w / 2 - 0.06, z: spot.along }
          : spot.wall === 'w' ? { x: -w / 2 + 0.06, z: spot.along }
          : spot.wall === 'n' ? { x: spot.along, z: d / 2 - 0.06 }
          : { x: spot.along, z: -d / 2 + 0.06 };
        board.position.set(lp2.x, 1.95, lp2.z);
        board.rotation.y = mountYaw[spot.wall];
        group.add(board);
      }
    }

    // Floor props — seeded dressing per biome, biased to walls, lane-clear.
    // `minDim` gates room-scale props to spaces that can take them.
    const floorSet: { kind: PropKind; p: number; wallBias?: boolean; minDim?: number }[] = ({
      corridor: [{ kind: 'wetFloor', p: 0.25 }, { kind: 'stool', p: 0.15, wallBias: true }, { kind: 'bin', p: 0.3, wallBias: true }, { kind: 'broom', p: 0.15, wallBias: true }, { kind: 'baseballBat', p: 0.12, wallBias: true }, { kind: 'handTruck', p: 0.14, wallBias: true }, { kind: 'tyre', p: 0.08, wallBias: true }, { kind: 'spade', p: 0.1, wallBias: true }, { kind: 'plunger', p: 0.1, wallBias: true }, { kind: 'hallFigure', p: 0.09 }, { kind: 'rubblePile', p: 0.08, wallBias: true }],
      records: [{ kind: 'stool', p: 0.3, wallBias: true }, { kind: 'plasticCrate', p: 0.3, wallBias: true }, { kind: 'ladder', p: 0.15, wallBias: true }, { kind: 'foldingStool', p: 0.2, wallBias: true }, { kind: 'screenPanels', p: 0.15, wallBias: true }, { kind: 'cardboardBox', p: 0.25, wallBias: true }, { kind: 'shipModel', p: 0.1 }, { kind: 'watcherFigure', p: 0.07, wallBias: true }, { kind: 'deadTenant', p: 0.06, wallBias: true }, { kind: 'hallFigure', p: 0.05 }, { kind: 'rubblePile', p: 0.12, wallBias: true }],
      lobby: [{ kind: 'wetFloor', p: 0.2 }, { kind: 'armchair', p: 0.35, wallBias: true }, { kind: 'bin', p: 0.35, wallBias: true }, { kind: 'screenPanels', p: 0.25, wallBias: true }, { kind: 'foldingStool', p: 0.2, wallBias: true }, { kind: 'standingFrame', p: 0.2, wallBias: true }, { kind: 'katana', p: 0.1, wallBias: true }, { kind: 'ornament', p: 0.15 }, { kind: 'dollCluster', p: 0.05, wallBias: true }, { kind: 'pianoUpright', p: 0.1, wallBias: true, minDim: 4.5 }, { kind: 'shell', p: 0.08 }],
      guest: [{ kind: 'television', p: 0.4, wallBias: true }, { kind: 'armchair', p: 0.25, wallBias: true }, { kind: 'nightstand', p: 0.5, wallBias: true }, { kind: 'bedOld', p: 0.3, wallBias: true }, { kind: 'screenPanels', p: 0.2, wallBias: true }, { kind: 'masonryHeater', p: 0.25, wallBias: true }, { kind: 'broom', p: 0.1, wallBias: true }, { kind: 'baseballBat', p: 0.15, wallBias: true }, { kind: 'gothicCommode', p: 0.3, wallBias: true }, { kind: 'pianoUpright', p: 0.08, wallBias: true, minDim: 4.5 }, { kind: 'rubberBoots', p: 0.12 }, { kind: 'suitcase', p: 0.2, wallBias: true }, { kind: 'crutches', p: 0.08, wallBias: true }, { kind: 'standingFrame', p: 0.1, wallBias: true }, { kind: 'sportsBall', p: 0.12 }, { kind: 'gamepad', p: 0.12 }, { kind: 'gameConsole', p: 0.1 }, { kind: 'cigaretteCase', p: 0.08 }, { kind: 'cardboardBox', p: 0.14, wallBias: true }, { kind: 'dollCluster', p: 0.14, wallBias: true }, { kind: 'fruit', p: 0.08 }, { kind: 'cakeSlice', p: 0.06 }, { kind: 'fishHat', p: 0.05 }],
      gallery: [{ kind: 'watcherFigure', p: 0.13, wallBias: true }, { kind: 'deadTenant', p: 0.07, wallBias: true }, { kind: 'cannon', p: 0.18, wallBias: true, minDim: 5.5 }, { kind: 'bench', p: 0.3 }, { kind: 'armchair', p: 0.2, wallBias: true }, { kind: 'masonryHeater', p: 0.2, wallBias: true }, { kind: 'screenPanels', p: 0.2, wallBias: true }, { kind: 'galleryStatue', p: 0.2, wallBias: true }, { kind: 'pianoUpright', p: 0.16, wallBias: true, minDim: 4.5 }, { kind: 'dollCluster', p: 0.06, wallBias: true }, { kind: 'standingFrame', p: 0.25, wallBias: true }, { kind: 'katana', p: 0.15, wallBias: true }, { kind: 'spinningWheel', p: 0.12, wallBias: true }],
      maintenance: [{ kind: 'coveredCar', p: 0.1, wallBias: true, minDim: 6.5 }, { kind: 'barrel', p: 0.55, wallBias: true }, { kind: 'propaneTank', p: 0.35, wallBias: true }, { kind: 'toolChest', p: 0.4, wallBias: true }, { kind: 'ladder', p: 0.35, wallBias: true }, { kind: 'bucket', p: 0.3 }, { kind: 'plasticCrate', p: 0.4, wallBias: true }, { kind: 'wrench', p: 0.25 }, { kind: 'plasticCrate2', p: 0.25, wallBias: true }, { kind: 'jerrycan', p: 0.3, wallBias: true }, { kind: 'oilTin', p: 0.25 }, { kind: 'tirePump', p: 0.2, wallBias: true }, { kind: 'woodLadder', p: 0.2, wallBias: true }, { kind: 'cementBag', p: 0.3, wallBias: true }, { kind: 'compostBags', p: 0.3, wallBias: true }, { kind: 'drillPress', p: 0.3, wallBias: true }, { kind: 'jerrycanP', p: 0.25, wallBias: true }, { kind: 'broom', p: 0.25, wallBias: true }, { kind: 'dustpan', p: 0.2 }, { kind: 'sprayCans', p: 0.2 }, { kind: 'rustCan', p: 0.2 }, { kind: 'cleanerBottle', p: 0.2 }, { kind: 'bleachBottle', p: 0.2 }, { kind: 'ammoBox', p: 0.15, wallBias: true }, { kind: 'megaphone', p: 0.1 }, { kind: 'deadTree', p: 0.05, wallBias: true }, { kind: 'crowbar', p: 0.2 }, { kind: 'boltCutters', p: 0.15 }, { kind: 'bunsenBurner', p: 0.1 }, { kind: 'rifle', p: 0.08, wallBias: true }, { kind: 'compressor', p: 0.25, wallBias: true }, { kind: 'handTruck', p: 0.3, wallBias: true }, { kind: 'tyre', p: 0.2, wallBias: true }, { kind: 'wheelRim', p: 0.2, wallBias: true }, { kind: 'spade', p: 0.15, wallBias: true }, { kind: 'powerDrill', p: 0.2 }, { kind: 'pliers', p: 0.2 }, { kind: 'tapeMeasure', p: 0.15 }, { kind: 'handPlane', p: 0.15 }, { kind: 'trowel', p: 0.12 }, { kind: 'metalDetector', p: 0.1, wallBias: true }, { kind: 'plunger', p: 0.12, wallBias: true }, { kind: 'rubberBoots', p: 0.12 }, { kind: 'gallonJug', p: 0.2 }, { kind: 'plasticBin', p: 0.25, wallBias: true }, { kind: 'thermos', p: 0.15 }, { kind: 'machete', p: 0.08 }, { kind: 'pickaxe', p: 0.15, wallBias: true }, { kind: 'blowtorch', p: 0.15 }, { kind: 'gardenGloves', p: 0.15 }, { kind: 'fishingKnife', p: 0.1 }, { kind: 'compostBag', p: 0.2, wallBias: true }, { kind: 'cardboardBox', p: 0.22, wallBias: true }],
      unlit: [{ kind: 'lantern', p: 0.4, wallBias: true }, { kind: 'flashlight', p: 0.2 }, { kind: 'barrel', p: 0.3, wallBias: true }, { kind: 'deadTree', p: 0.08, wallBias: true }, { kind: 'sprayCans', p: 0.15 }, { kind: 'rustCan', p: 0.15 }, { kind: 'ammoBox', p: 0.12, wallBias: true }, { kind: 'deadBranch', p: 0.3, wallBias: true }, { kind: 'watcherFigure', p: 0.12, wallBias: true }, { kind: 'deadTenant', p: 0.08, wallBias: true }, { kind: 'dollCluster', p: 0.09, wallBias: true }, { kind: 'hallFigure', p: 0.05 }, { kind: 'rubblePile', p: 0.15, wallBias: true }, { kind: 'rootGrowth', p: 0.12, wallBias: true }, { kind: 'weedCluster', p: 0.14 }],
      milestone: [{ kind: 'lantern', p: 0.2, wallBias: true }],
      safe: [{ kind: 'lantern', p: 0.5, wallBias: true }, { kind: 'armchair', p: 0.3, wallBias: true }, { kind: 'boombox', p: 0.2 }, { kind: 'foodCans', p: 0.3 }, { kind: 'jerrycanP', p: 0.2, wallBias: true }, { kind: 'megaphone', p: 0.1 }, { kind: 'goblets', p: 0.2 }, { kind: 'rations', p: 0.3 }, { kind: 'medicalTape', p: 0.25 }, { kind: 'thermos', p: 0.2 }, { kind: 'chessSet', p: 0.15 }, { kind: 'boardGame', p: 0.12 }, { kind: 'ornament', p: 0.15 }, { kind: 'compass', p: 0.1 }, { kind: 'pocketWatch', p: 0.1 }, { kind: 'cakeSlice', p: 0.18 }, { kind: 'fruit', p: 0.22 }],
      underscript: [{ kind: 'overheadCrane', p: 0.14, wallBias: true, minDim: 6.5 }, { kind: 'fireEscape', p: 0.16, wallBias: true, minDim: 7 }, { kind: 'coveredCar', p: 0.12, wallBias: true, minDim: 6.5 }, { kind: 'cannon', p: 0.1, wallBias: true, minDim: 5.5 }, { kind: 'boulder', p: 0.3, wallBias: true }, { kind: 'barkDebris', p: 0.15 }, { kind: 'treeStump', p: 0.12, wallBias: true }, { kind: 'wineBarrel', p: 0.45, wallBias: true }, { kind: 'milCrate', p: 0.4, wallBias: true }, { kind: 'lantern', p: 0.3, wallBias: true }, { kind: 'barrel', p: 0.3, wallBias: true }, { kind: 'plasticCrate3', p: 0.3, wallBias: true }, { kind: 'roadBarrier', p: 0.15 }, { kind: 'hydrant', p: 0.12, wallBias: true }, { kind: 'manhole', p: 0.25 }, { kind: 'wetFloor', p: 0.2 }, { kind: 'cementBag', p: 0.2, wallBias: true }, { kind: 'compostBags', p: 0.25, wallBias: true }, { kind: 'drillPress', p: 0.2, wallBias: true }, { kind: 'jerrycanP', p: 0.2, wallBias: true }, { kind: 'deadTree', p: 0.05, wallBias: true }, { kind: 'ammoBox', p: 0.15, wallBias: true }, { kind: 'broom', p: 0.15, wallBias: true }, { kind: 'deadBranch', p: 0.2, wallBias: true }, { kind: 'crowbar', p: 0.12 }, { kind: 'boltCutters', p: 0.1 }, { kind: 'rations', p: 0.2 }, { kind: 'plasticBin', p: 0.2, wallBias: true }, { kind: 'gallonJug', p: 0.15 }, { kind: 'handTruck', p: 0.15, wallBias: true }, { kind: 'wheelRim', p: 0.12, wallBias: true }, { kind: 'compressor', p: 0.12, wallBias: true }, { kind: 'spade', p: 0.1, wallBias: true }, { kind: 'compostBag', p: 0.15, wallBias: true }, { kind: 'pickaxe', p: 0.08, wallBias: true }, { kind: 'gardenGloves', p: 0.1 }, { kind: 'cardboardBox', p: 0.15, wallBias: true }, { kind: 'stickGrenade', p: 0.05 }, { kind: 'fishHat', p: 0.08 }, { kind: 'fruit', p: 0.1 }, { kind: 'shipModel', p: 0.08 }, { kind: 'watcherFigure', p: 0.06, wallBias: true }, { kind: 'deadTenant', p: 0.07, wallBias: true }, { kind: 'dollCluster', p: 0.05, wallBias: true }, { kind: 'rootGrowth', p: 0.32, wallBias: true }, { kind: 'weedCluster', p: 0.34 }],
    } as Record<string, { kind: PropKind; p: number; wallBias?: boolean; minDim?: number }[]>)[spec.biome] ?? [];
    for (const fp of floorSet) {
      if (fp.minDim && Math.min(w, d) < fp.minDim) continue;
      if (rng.float() >= fp.p) continue;
      let px = (rng.float() - 0.5) * (w - 1.6);
      let pz = (rng.float() - 0.5) * (d - 1.6);
      if (fp.wallBias) {
        // push toward a random edge
        if (rng.bool(0.5)) px = Math.sign(px || 1) * (w / 2 - 0.6 - rng.float() * 0.4);
        else pz = Math.sign(pz || 1) * (d / 2 - 0.6 - rng.float() * 0.4);
      }
      const nearDoor = doorPositions.some((p) => {
        const lp = portLocalPos(p, w, d);
        return Math.hypot(px - lp.x, pz - lp.z) < 1.6;
      });
      if (nearDoor) continue;
      try {
        const built = buildProp({ kind: fp.kind, x: px, z: pz, yaw: fp.wallBias && Math.abs(px) > Math.abs(pz) ? Math.sign(px) * -Math.PI / 2 : rng.float() * Math.PI }, rng.fork(6000 + Math.floor(px * 13 + pz * 7)));
        group.add(built.group);
        wireColliders(built);
        groundShadow(built, px, pz);
        if (fp.kind === 'puddle' || fp.kind === 'steamVent') dripSpots.push([px, pz]);
      } catch { /* dressing only */ }
    }
  }

  // Props
  // High-count clutter kinds draw once as an InstancedMesh instead of N
  // separate prop groups — the template's meshes bake into one geometry.
  const INSTANCEABLE = new Set(['paperScatter', 'papers', 'books', 'carton', 'goblets', 'foodCans', 'bottle', 'weedCluster', 'deadBranch', 'rubblePile', 'wineBottles', 'cleanerBottle', 'bleachBottle', 'candle', 'vase']);
  const instanced = new Map<import('./spec').PropKind, { spec: import('./spec').PropSpec; mtx: THREE.Matrix4 }[]>();
  const passthrough: import('./spec').PropSpec[] = [];
  for (const p of spec.props) {
    if (INSTANCEABLE.has(p.kind)) (instanced.get(p.kind) ?? instanced.set(p.kind, []).get(p.kind)!).push({ spec: p, mtx: new THREE.Matrix4() });
    else passthrough.push(p);
  }
  for (const [kind, list] of instanced) {
    if (list.length < 3) { for (const e of list) passthrough.push(e.spec); continue; }
    try {
      const template = buildProp({ kind, x: 0, z: 0 }, rng.fork(kind.length * 131));
      const geos: THREE.BufferGeometry[] = [];
      let mat: THREE.Material | null = null;
      template.group.updateMatrixWorld(true);
      template.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || Array.isArray(m.material)) return;
        if (!mat) mat = m.material as THREE.Material;
        geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
      });
      if (!geos.length || !mat) { for (const e of list) passthrough.push(e.spec); continue; }
      const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!geo) { for (const e of list) passthrough.push(e.spec); continue; }
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = false; im.receiveShadow = true;
      list.forEach((e, i) => {
        const s = e.spec.scale ?? 1;
        e.mtx.compose(
          new THREE.Vector3(e.spec.x, e.spec.y ?? 0, e.spec.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.spec.yaw ?? 0, 0)),
          new THREE.Vector3(s, s, s));
        im.setMatrixAt(i, e.mtx);
      });
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
      template.group.removeFromParent();
    } catch { for (const e of list) passthrough.push(e.spec); }
  }

  for (const p of passthrough) {
    try {
      const built = buildProp({ ...p }, rng.fork(Math.floor(p.x * 97 + p.z * 13)));
      if (p.kind === 'deadTenant') built.group.name = `tenant-${room.index}`;
      if (p.kind === 'coffin') built.group.name = `coffin-${room.index}`;
      if (p.kind === 'pianoUpright') built.group.name = `piano-${room.index}`;
      if (p.kind === 'television') built.group.name = `tv-${room.index}`;
      if (p.kind === 'clock') built.group.name = `clock-${room.index}`;
      if (p.kind === 'steamVent' || p.kind === 'boilerTank' || p.kind === 'pipeManifold') built.group.name = `vent-${room.index}`;
      group.add(built.group);
      wireColliders(built);
      groundShadow(built, p.x, p.z, p.y ?? 0);
      if (p.kind === 'puddle' || p.kind === 'steamVent') dripSpots.push([p.x, p.z]);
      // Template-declared windows spill the same moonlight pool as
      // biome-mount windows — the glow extends toward the room center.
      if (p.kind === 'window') {
        const len = Math.hypot(p.x, p.z) || 1;
        moonlightPool(p.x - (p.x / len) * 0.9, p.z - (p.z / len) * 0.9, (p.yaw ?? 0) + (rng.float() - 0.5) * 0.15);
      }
      // Ceiling rosette under hanging fixtures — plaster medallion + ring
      // where the chain meets the slab.
      if (p.kind === 'chandelier' || p.kind === 'lanternChandelier' || p.kind === 'ceilingLamp' || p.kind === 'chainBulb') {
        const ry = h - (suspended ? 0.2 : 0.03);
        const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.05, 16), ceilMat);
        rose.position.set(p.x, ry, p.z);
        group.add(rose);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.024, 8, 20), trimMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.x, ry - 0.04, p.z);
        group.add(ring);
      }
    } catch {
      // skip broken prop rather than fail room
    }
  }

  // Seeded floor clutter — scattered papers and debris; door lanes stay clear.
  if (!isUnder && (spec.biome === 'corridor' || spec.biome === 'records' || spec.biome === 'guest' || spec.biome === 'unlit')) {
    const n = Math.min(7, Math.floor((w * d) / 15) + rng.int(0, 2));
    for (let i = 0; i < n; i++) {
      const cx = (rng.float() - 0.5) * (w - 1.6);
      const cz = (rng.float() - 0.5) * (d - 1.6);
      const nearDoor = doorPositions.some((p) => {
        const lp = portLocalPos(p, w, d);
        return Math.hypot(cx - lp.x, cz - lp.z) < 1.5;
      });
      if (nearDoor) continue;
      const kind: 'paperScatter' | 'carton' = rng.bool(0.85) ? 'paperScatter' : 'carton';
      // bias cartons toward walls so they don't sit mid-lane
      const px = kind === 'carton' ? Math.sign(cx || 1) * Math.max(Math.abs(cx), w * 0.3) : cx;
      try {
        const built = buildProp({ kind, x: px, z: cz, yaw: rng.float() * Math.PI }, rng.fork(9000 + i));
        group.add(built.group);
        wireColliders(built);
        groundShadow(built, px, cz);
      } catch { /* dressing only */ }
    }
  }

  // Light fixtures (visible lamp meshes) + real lights capped by quality.
  // main/dim lights get real fixtures: recessed troffers under a suspended
  // ceiling, fluoro tubes in service spaces, pendants in tall rooms.
  const lampMeshes: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  if (sconcePos && !room.darkRoom) {
    const sl = new THREE.PointLight(0xffc878, 0.55, 4.5, 2);
    sl.position.set(sconcePos.x, sconcePos.y, sconcePos.z);
    group.add(sl);
    lights.push(sl);
    // Light throw — a warm radial wash on the wall behind the sconce and a
    // small pool on the floor beneath it, the look of a real fixture's spill.
    {
      const onX = Math.abs(sconcePos.x) > Math.abs(sconcePos.z);
      const sgn = onX ? Math.sign(sconcePos.x || 1) : Math.sign(sconcePos.z || 1);
      const wallX = onX ? sgn * (w / 2 - 0.03) : sconcePos.x;
      const wallZ = onX ? sconcePos.z : sgn * (d / 2 - 0.03);
      const throwMat = new THREE.MeshBasicMaterial({
        color: 0xff9d4f, alphaMap: poolTexture(), transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      throwMat.userData.decalMat = true;
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.7), throwMat);
      wash.position.set(wallX, sconcePos.y + 0.15, wallZ);
      wash.rotation.y = onX ? -sgn * Math.PI / 2 : (sgn > 0 ? Math.PI : 0);
      wash.renderOrder = 2;
      group.add(wash);
      const poolMat2 = throwMat.clone(); poolMat2.userData.decalMat = true; poolMat2.opacity = 0.2;
      const fpool = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), poolMat2);
      fpool.rotation.x = -Math.PI / 2;
      fpool.position.set(sconcePos.x * 0.92, 0.013, sconcePos.z * 0.92);
      group.add(fpool);
    }
  }
  const maxLights = quality === 'low' ? 1 : quality === 'medium' ? 2 : 3;
  const sorted = [...spec.lights].sort((a, b) => b.intensity - a.intensity);
  for (const ls of spec.lights) {
    if (ls.group === 'main' || ls.group === 'dim') {
      if (suspended) {
        const frameM = new THREE.Mesh(texBox(1.32, 0.07, 0.64), MAT.charcoal());
        frameM.position.set(ls.x, fixtureY + 0.02, ls.z);
        group.add(frameM);
        const panel = new THREE.Mesh(texBox(1.2, 0.03, 0.54), MAT.fluoro());
        panel.position.set(ls.x, fixtureY - 0.02, ls.z);
        group.add(panel);
        lampMeshes.push(panel);
        if (rng.float() < 0.3) {
          panel.material = (panel.material as THREE.MeshStandardMaterial).clone();
          panel.userData.anim = 'flicker';
          panel.userData.animSeed = rng.float() * 100;
          panel.userData.lsRef = ls;
        }
      } else if (isUnder || spec.biome === 'maintenance') {
        // hanging fluoro bank — pivoted at the stem tops so it can sway
        const pivot = new THREE.Group();
        pivot.position.set(ls.x, ls.y + 0.22, ls.z);
        for (const sx of [-0.45, 0.45]) {
          const stem = new THREE.Mesh(texBox(0.02, 0.22, 0.02), MAT.charcoal());
          stem.position.set(sx, -0.11, 0);
          pivot.add(stem);
        }
        const housing = new THREE.Mesh(texBox(1.32, 0.05, 0.2), MAT.steelDark());
        housing.position.set(0, -0.22, 0);
        pivot.add(housing);
        const tube = new THREE.Mesh(texBox(1.24, 0.03, 0.14), MAT.fluoro());
        tube.position.set(0, -0.255, 0);
        pivot.add(tube);
        if (rng.float() < 0.3) {
          tube.material = (tube.material as THREE.MeshStandardMaterial).clone();
          tube.userData.anim = 'flicker';
          tube.userData.animSeed = rng.float() * 100;
          tube.userData.lsRef = ls;
        }
        lampMeshes.push(tube);
        pivot.userData.anim = 'swing';
        pivot.userData.animAmp = 0.045;
        pivot.userData.animSeed = rng.float() * 100;
        group.add(pivot);
      } else {
        // pendant — cord + shade + bulb, pivoted at the ceiling anchor so it swings
                // plaster ceiling rose anchoring the pendant cord
        const rose = new THREE.Group();
        rose.position.set(ls.x, h - 0.035, ls.z);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.04, 20), MAT.plaster());
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.028, 8, 22), MAT.plaster());
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.02;
        rose.add(disc, ring);
        group.add(rose);
        const pivot = new THREE.Group();
        pivot.position.set(ls.x, ls.y + 0.5, ls.z);
        const cord = new THREE.Mesh(texBox(0.02, 0.5, 0.02), MAT.charcoal());
        cord.position.y = -0.25;
        pivot.add(cord);
        const shade = new THREE.Mesh(texBox(0.3, 0.18, 0.3), MAT.charcoal());
        shade.position.y = -0.54;
        pivot.add(shade);
        const bulb = new THREE.Mesh(unitBox, MAT.amberDim());
        bulb.scale.set(0.12, 0.09, 0.12);
        bulb.position.y = -0.64;
        pivot.add(bulb);
        if (rng.float() < 0.22) {
          bulb.material = (bulb.material as THREE.MeshStandardMaterial).clone();
          bulb.userData.anim = 'flicker';
          bulb.userData.animSeed = rng.float() * 100;
          bulb.userData.lsRef = ls;
        }
        pivot.userData.anim = 'swing';
        pivot.userData.animAmp = 0.11;
        pivot.userData.animSeed = rng.float() * 100;
        group.add(pivot);
        lampMeshes.push(bulb);
      }
    } else {
      const bulb = new THREE.Mesh(unitBox, ls.group === 'warning' ? MAT.redLamp() : MAT.amberDim());
      bulb.scale.set(0.15, 0.08, 0.15);
      bulb.position.set(ls.x, ls.y - 0.05, ls.z);
      group.add(bulb);
      lampMeshes.push(bulb);
    }
  }
  // Decorative ceiling fixtures in non-suspended main rooms — spinning
  // ceiling fans in domestic spaces, swinging lantern chandeliers in
  // grander rooms, both hung on ceiling pivots so they animate.
  if (!suspended && !isUnder && !room.darkRoom && rng.float() < 0.35) {
    const kind: PropKind | null =
      spec.biome === 'lobby' || spec.biome === 'gallery' ? 'lanternChandelier'
      : spec.biome === 'guest' ? 'ceilingFan'
      : null;
    if (kind) {
      const fx = (rng.float() - 0.5) * w * 0.3;
      const fz = (rng.float() - 0.5) * d * 0.3;
      try {
        const built = buildProp({ kind, x: fx, z: fz, y: 0, yaw: rng.float() * Math.PI }, rng.fork(5550));
        const pivot = new THREE.Group();
        pivot.position.set(fx, h - 0.03, fz);
        built.group.position.y = kind === 'ceilingFan' ? -0.28 : -0.62;
        pivot.add(built.group);
        pivot.userData.anim = kind === 'ceilingFan' ? 'spin' : 'swing';
        pivot.userData.animSpeed = 0.9;
        pivot.userData.animAmp = 0.08;
        pivot.userData.animSeed = rng.float() * 100;
        group.add(pivot);
      } catch { /* dressing only */ }
    }
  }
  let shadowAssigned = false;
  for (const ls of sorted.slice(0, maxLights)) {
    // decay=2 physical falloff → boost authored (legacy-scale) intensities
    const pl = new THREE.PointLight(ls.color, ls.intensity * 24 * (room.darkRoom ? 0.25 : 1), ls.range * 1.3, 2);
    pl.position.set(ls.x, ls.y, ls.z);
    pl.userData.ls = ls;
    pl.userData.baseIntensity = pl.intensity;
    if (quality === 'high' && !shadowAssigned && !room.darkRoom) {
      pl.castShadow = true;
      pl.shadow.mapSize.set(512, 512);
      pl.shadow.bias = -0.01;
      pl.shadow.camera.near = 0.2;
      pl.shadow.camera.far = ls.range;
      shadowAssigned = true;
    }
    group.add(pl);
    lights.push(pl);
    pl.userData.group = ls.group;
    pl.userData.baseIntensity = pl.intensity;
  }
  if (room.darkRoom) {
    for (const b of lampMeshes) (b.material as THREE.MeshStandardMaterial) = MAT.charcoal();
  }

  // Fake-volumetric light shafts under lit fixtures + drifting dust motes.
  // Skipped for dark rooms (no light to scatter through).
  const shafts: THREE.Mesh[] = [];
  let dust: THREE.Points | null = null;
  if (!room.darkRoom) {
    let shaftCount = 0;
    for (let li = 0; li < spec.lights.length; li++) {
      const ls = spec.lights[li];
      if (ls.group !== 'main' && ls.group !== 'dim') continue;
      if (shaftCount >= 2) break;
      const topY = suspended || isUnder || spec.biome === 'maintenance' ? fixtureY : ls.y - 0.1;
      const len = topY - 0.12;
      if (len <= 0.4) continue;
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, Math.min(0.62, ls.range * 0.16), len, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: ls.color, transparent: true, opacity: 0.055, alphaMap: shaftTexture(),
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          fog: false,
        }),
      );
      shaft.position.set(ls.x, topY - len / 2, ls.z);
      group.add(shaft);
      shafts.push(shaft);
      shaftCount++;
      // soft glow pool where the shaft lands
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(Math.min(0.9, ls.range * 0.2), 20),
        new THREE.MeshBasicMaterial({
          color: ls.color, alphaMap: poolTexture(), transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(ls.x, 0.014, ls.z);
      group.add(pool);
    }

    // Dust motes — sparse additive points drifting inside lit rooms.
    const count = Math.min(80, Math.floor(w * d * 1.6));
    if (count > 12) {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (rng.float() - 0.5) * (w - 0.8);
        pos[i * 3 + 1] = 0.15 + rng.float() * (h - 0.5);
        pos[i * 3 + 2] = (rng.float() - 0.5) * (d - 0.8);
      }
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      dust = new THREE.Points(dg, new THREE.PointsMaterial({
        color: 0xd8c9a8, size: 0.014, transparent: true, opacity: 0.26,
        map: dustSprite(), alphaTest: 0.01,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }));
      dust.userData.phase = rng.float() * Math.PI * 2;
      group.add(dust);
    }

    // ~1-in-5 lit rooms get a flickering main fixture.
    if (lights.length && rng.float() < 0.2) {
      const l = lights[0];
      l.userData.flicker = true;
      l.userData.flickerSeed = rng.float() * 100;
      // Clone the paired fixture material so its emissive can dip in sync
      // without touching the shared cache.
      const lamp = lampMeshes[0];
      if (lamp) {
        lamp.material = (lamp.material as THREE.MeshStandardMaterial).clone();
        l.userData.lampMesh = lamp;
      }
    }
  }

  // Ceiling fan — slow-turning blades; some rooms shed one for an unbalanced wobble.
  if (!isUnder && spec.biome !== 'maintenance' && h >= 2.9 && rng.float() < 0.32) {
    const fx = (rng.float() - 0.5) * w * 0.35;
    const fz = (rng.float() - 0.5) * d * 0.35;
    const topY = suspended ? h - 0.18 : h - 0.02;
    if (topY - 0.44 > 2.3) {
      const pivot = new THREE.Group();
      pivot.position.set(fx, topY, fz);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 6), MAT.charcoal());
      rod.position.y = -0.2;
      pivot.add(rod);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 10), MAT.steelDark());
      hub.position.y = -0.42;
      pivot.add(hub);
      const spin = new THREE.Group();
      spin.position.y = -0.44;
      const missing = rng.bool(0.25);
      const nBlades = missing ? 3 : 4;
      for (let i = 0; i < nBlades; i++) {
        const a = (i / 4) * Math.PI * 2;
        const blade = new THREE.Mesh(texBox(0.52, 0.015, 0.11), MAT.charcoal());
        blade.position.set(Math.cos(a) * 0.32, 0.02, Math.sin(a) * 0.32);
        blade.rotation.y = -a;
        spin.add(blade);
      }
      spin.userData.anim = 'spin';
      spin.userData.animSpeed = 1.6 + rng.float() * 1.8;
      pivot.add(spin);
      pivot.userData.anim = 'sway';
      pivot.userData.animAmp = missing ? 0.07 : 0.03;
      pivot.userData.animSeed = rng.float() * 100;
      group.add(pivot);
    }
  }

  // Gap corridor to previous exit (jittered milestones): floor + 2 walls +
  // ceiling in room-local space. World endpoints are on the port chain.
  if (room.connectorIn) {
    const toLocal = (wx: number, wz: number) => {
      const dx = wx - room.origin.x, dz = wz - room.origin.z;
      const c = Math.cos(-room.yaw), sn = Math.sin(-room.yaw);
      return { x: dx * c + dz * sn, z: -dx * sn + dz * c };
    };
    const ci = room.connectorIn;
    const pts: { x: number; z: number }[] = [toLocal(ci.a.x, ci.a.z)];
    if (ci.elbow) pts.push(toLocal(ci.elbow.x, ci.elbow.z));
    pts.push(toLocal(ci.b.x, ci.b.z));
    const corr = new THREE.Group();
    for (let si = 0; si < pts.length - 1; si++) {
      const la = pts[si], lb = pts[si + 1];
      const dx = lb.x - la.x, dz = lb.z - la.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) continue;
      const ux = dx / len, uz = dz / len;
      const fl = new THREE.Mesh(texBox(Math.abs(ux) > 0.5 ? len + 2.6 : 2.8, 0.08, Math.abs(ux) > 0.5 ? 2.8 : len + 2.6), floorMat);
      fl.position.set((la.x + lb.x) / 2, -0.04, (la.z + lb.z) / 2);
      corr.add(fl);
      const ce = new THREE.Mesh(fl.geometry, ceilMat);
      ce.position.set(fl.position.x, 2.74, fl.position.z);
      corr.add(ce);
      for (const side of [-1, 1]) {
        const px = -uz * side * 1.3, pz = ux * side * 1.3;
        const wall = new THREE.Mesh(texBox(Math.abs(ux) > 0.5 ? len + 2.6 : 0.24, 2.8, Math.abs(ux) > 0.5 ? 0.24 : len + 2.6), wallMat);
        wall.position.set((la.x + lb.x) / 2 + px, 1.4, (la.z + lb.z) / 2 + pz);
        corr.add(wall);
      }
    }
    group.add(corr);
  }

  // Drawer sockets — give every "Search drawer" point real furniture. When
  // a chest-like prop already stands at the socket, mount a drawer front on
  // it facing the player side; otherwise build a small nightstand pedestal.
  {
    const FURNITURE = new Set(['drawerUnit', 'nightstand', 'gothicCommode', 'vintageCabinet', 'modernCabinet', 'metalDesk', 'desk', 'schoolDesk', 'sideTable', 'cabinet']);
    const dco = Math.cos(room.yaw), dsi = Math.sin(room.yaw);
    for (const sock of room.sockets) {
      if (sock.kind !== 'drawer') continue;
      const dx = sock.pos.x - room.origin.x, dz = sock.pos.z - room.origin.z;
      const lx = dx * dco - dz * dsi, lz = dx * dsi + dz * dco;
      const near = spec.props.find((p) => FURNITURE.has(p.kind) && Math.hypot(p.x - lx, p.z - lz) < 1.0);
      const holder = new THREE.Group();
      const bodyMat = grand ? TEX.woodCarved() : MAT.darkOak();
      let fx = lx, fz = lz, fyaw = Math.atan2(-lx, -lz);
      if (near) {
        fyaw = Math.atan2(lx - near.x, lz - near.z);
        fx = near.x + Math.sin(fyaw) * 0.26;
        fz = near.z + Math.cos(fyaw) * 0.26;
      } else {
        // nightstand pedestal — body, proud top, plinth
        const body = new THREE.Mesh(texBox(0.48, 0.56, 0.4), bodyMat);
        body.position.y = 0.31;
        const top = new THREE.Mesh(texBox(0.52, 0.035, 0.44), bodyMat);
        top.position.y = 0.61;
        const plinth = new THREE.Mesh(texBox(0.52, 0.06, 0.44), MAT.ink());
        plinth.position.y = 0.03;
        holder.add(body, top, plinth);
        holder.position.set(lx, 0, lz);
        holder.rotation.y = fyaw;
        room.colliders.push(aabb(
          room.origin.x + lx * dco + lz * dsi, room.origin.y + 0.33,
          room.origin.z - lx * dsi + lz * dco, 0.28, 0.33, 0.28));
      }
      // sliding drawer front + brass knob; opens on 'Search drawer'
      const face = new THREE.Mesh(texBox(0.4, 0.15, 0.035), bodyMat);
      face.position.set(0, 0.42, 0.205);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), MAT.brass());
      knob.position.set(0, 0.42, 0.24);
      face.add(knob);
      face.userData.anim = 'drawerFront';
      face.userData.sockKey = `${sock.pos.x.toFixed(1)}|${sock.pos.z.toFixed(1)}`;
      const faceHolder = new THREE.Group();
      faceHolder.position.set(fx, 0, fz);
      faceHolder.rotation.y = fyaw;
      faceHolder.add(face);
      group.add(holder, faceHolder);
    }
  }

  // Vending machines — sockets flagged meta.vend stand as a humming steel
  // box with a sickly live glass front. The glass animates on the shared
  // 'screen' ticker; its material is cloned so each machine drifts alone.
  {
    const dco = Math.cos(room.yaw), dsi = Math.sin(room.yaw);
    for (const sock of room.sockets) {
      if (!sock.meta.vend) continue;
      const lx = (sock.pos.x - room.origin.x) * dco - (sock.pos.z - room.origin.z) * dsi;
      const lz = (sock.pos.x - room.origin.x) * dsi + (sock.pos.z - room.origin.z) * dco;
      const m = new THREE.Group();
      const body = new THREE.Mesh(texBox(0.78, 1.62, 0.56), MAT.steelDark());
      body.position.y = 0.86;
      const kick = new THREE.Mesh(texBox(0.8, 0.12, 0.58), MAT.ink());
      kick.position.y = 0.06;
      const slot = new THREE.Mesh(texBox(0.3, 0.07, 0.04), MAT.ink());
      slot.position.set(-0.12, 0.52, 0.3);
      const keypad = new THREE.Mesh(texBox(0.13, 0.5, 0.045), MAT.ink());
      keypad.position.set(0.28, 1.0, 0.29);
      const glassMat = MAT.screenGreen().clone();
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.9), glassMat);
      glass.position.set(-0.06, 1.08, 0.286);
      glass.userData.anim = 'screen';
      glass.userData.animSeed = rng.float() * 40;
      m.add(body, kick, slot, keypad, glass);
      m.position.set(lx, 0, lz);
      m.rotation.y = sock.yaw - room.yaw;
      group.add(m);
      room.colliders.push(aabb(
        room.origin.x + lx * dco + lz * dsi, room.origin.y + 0.9,
        room.origin.z - lx * dsi + lz * dco, 0.42, 0.9, 0.42));
    }
  }

  // Static consolidation — merge every non-animated, non-decal, non-door mesh
  // into a handful of draw calls per material. Big furnished rooms drop from
  // ~250 draw calls to ~30; door leaves, lamp meshes, shafts, decals and
  // anim-tagged meshes stay untouched (they move or get re-materialized).
  {
    const keep = new Set<THREE.Object3D>();
    for (const m of doorLeaves.values()) keep.add(m);
    for (const m of lampMeshes) keep.add(m);
    for (const m of shafts) keep.add(m);
    if (dust) keep.add(dust);
    group.updateMatrixWorld(true);
    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; recv: boolean }>();
    const toRemove: THREE.Object3D[] = [];
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let p: THREE.Object3D | null = m;
      while (p) { if (keep.has(p) || p.userData.anim) return; p = p.parent; }
      if (m.userData.anim || m.userData.decalMat || m.renderOrder !== 0) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (!mat || Array.isArray(m.material) || !mat.isMeshStandardMaterial) return;
      const ms = [
        mat.color.getHex(), mat.roughness.toFixed(2), mat.metalness.toFixed(2),
        mat.emissive?.getHex() ?? 0, (mat.emissiveIntensity ?? 0).toFixed(2),
        mat.map?.uuid ?? '-', mat.normalMap?.uuid ?? '-', mat.opacity.toFixed(2),
        mat.transparent ? 't' : 'o', mat.side, mat.flatShading ? 1 : 0,
      ].join('|');
      const sig = Object.keys(m.geometry.attributes).sort().join(',') + (m.geometry.index ? '|i' : '');
      const key = ms + '||' + sig;
      let b = buckets.get(key);
      if (!b) { b = { mat, geos: [], cast: false, recv: false }; buckets.set(key, b); }
      b.geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
      b.cast ||= m.castShadow; b.recv ||= m.receiveShadow;
      toRemove.push(m);
    });
    for (const m of toRemove) m.parent?.remove(m);
    for (const { mat, geos, cast, recv } of buckets.values()) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = recv;
      group.add(mesh);
      if (geos.length > 1) for (const g of geos) g.dispose();
    }
  }

  // Transform to world
  group.position.set(room.origin.x, room.origin.y, room.origin.z);
  group.rotation.y = room.yaw;

  const animated: THREE.Object3D[] = [];
  group.traverse((o) => { if (o.userData.anim) animated.push(o); });

  // Leak drips — a shared Points column per room; each particle falls from a
  // per-spot ceiling height and wraps. userData carries tops/speeds/phases.
  let drips: THREE.Points | null = null;
  const spots = dripSpots.slice(0, 4);
  if (spots.length) {
    const per = 12;
    const n = spots.length * per;
    const pos = new Float32Array(n * 3);
    const tops = new Float32Array(n), speeds = new Float32Array(n), phases = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [sx, sz] = spots[(i / per) | 0];
      pos[i * 3] = sx + (rng.float() - 0.5) * 0.06;
      pos[i * 3 + 1] = rng.float() * (h - 0.3);
      pos[i * 3 + 2] = sz + (rng.float() - 0.5) * 0.06;
      tops[i] = h - 0.25 - rng.float() * 0.4;
      speeds[i] = 2.1 + rng.float() * 1.3;
      phases[i] = rng.float() * 10;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    drips = new THREE.Points(dg, dripMat);
    drips.userData.tops = tops; drips.userData.speeds = speeds; drips.userData.phases = phases;
    group.add(drips);
    // Ceiling water damage above each leak — tide-ring bloom facing down.
    for (const [sx, sz] of spots) {
      const damp = decalQuad(ceilingDamp(rng), 0.9 + rng.float() * 0.9, 0.9 + rng.float() * 0.9);
      damp.rotation.x = Math.PI / 2;
      damp.rotation.z = rng.float() * Math.PI;
      damp.position.set(sx, h - (suspended ? 0.24 : 0.005), sz);
      group.add(damp);
    }
    // Landing rings — thin expanding circles where each drip hits the floor.
    for (const [sx, sz] of spots) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1.0, 20),
        new THREE.MeshBasicMaterial({ color: 0x9fb4c0, transparent: true, opacity: 0.22, depthWrite: false, fog: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(sx, 0.015, sz);
      ring.userData.anim = 'ripple';
      ring.userData.animSeed = rng.float() * 10;
      group.add(ring);
    }
  }

  return { group, doorLeaves, lampMeshes, lights, shafts, dust, animated, drips };
}

export function disposeRoom(built: BuiltRoom): void {
  built.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && m.geometry !== unitBox) m.geometry.dispose();
    if ((m.userData.decalMat || m.userData.anim) && m.material) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  });
  built.group.clear();
  built.doorLeaves.clear();
  built.lampMeshes.length = 0;
  built.lights.length = 0;
  built.shafts.length = 0;
  built.animated.length = 0;
  built.dust = null;
  built.drips = null;
}
