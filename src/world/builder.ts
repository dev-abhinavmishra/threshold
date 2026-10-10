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
import { portLocalPos, portOutwardDir, footprintInDoorLane, footprintInDoorLeaf } from './spec';
import { TEX } from './textures';
import { box as texBox } from './props';
import { modelInstance, modelCollider, MODEL_FOR } from './modelLibrary';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MILESTONE_TELLS } from './generator';
import { grimeStreak, floorStain, ceilingDamp, poster, warningStripe, cobweb, decalQuad, bloodPool, bloodSmear, scratchMarks, handPrints, brickPatch, peeledWallpaper, footprintTrail, crackDecal, thresholdWear, chalkMark, wayArrow, dragTrail, wallNotice, rustStreak, frameGhost, ashPile, tallyMarks, dampSpot, swingWear, dustShadow, votiveWax, patchPlug, cornerScuff, oldNumber, nailRow, dustFall, wornLane, inspectionStamp, mouseHole, chasePatch, oldMap, registerPage, evictionSlip, repairTicket, photoStrip, droppedGlove, inkSpill, fallenSpecs, plasterFall, mothDrift, drainHalo, waterline, sootStain, lostLetter, fistMark, smokeStain, underBed, kickSplit, bodyOutline, drapeGhost, switchPolish, growthMarks, sillDamp, radiatorBleed, burnMarks, waxSheen, ventDust, heelScuff, sconceSoot, clockGhost, knobShine, railGhost, chairRub, phoneGhost, mouldBloom, keyBoard, luggageScuff, doorDrag, hookWear, ceilingHair, cartTracks, groutLines, sunFade, hingeRust, lampGhost, rockerArcs, cordWear, nightGlow, laceShadow, greaseCloud, rugCurl, pipeSweat, frameLean, hearthSpill, crateSplinters, umbrellaRing, knotHoles, dustShaft, flueStain, plasterBulge, doorDent, rustHalo, hookSag, leafLitter, bellRose, keyholeWear, curtainShade, lathExpose, drainRust, underbedHaze, paperPeel, tileCrack, coalDust, coatGhost, boxRot, legRings, railDust, basketShed, baseGrime, doorDrift, battenGhost, jugRing, clawMarks, lampSoot, plasterBloom, emberPits, fingerTrace, mopArcs, ladderRub, boilerFlake, frameRattle, wheelRuts, plantDeath, stoolDrag, ladderFeet, viceGrit, barrelRings, landingWear, cageRattle, callGrub, tonerDrift, bootPrints , beamDust, bucketRing, hoseScuff, ocheLine, lockerKick, pumpSeep, mailDrift, doorGlow, sconcePool, sootFan, fuseTally, hatchGrease, bunkBoots, hookShadow, chainDrag, ceilingRing, plasterVein, pendantGhost, fixtureSoot, tileSag, corniceLine, atticStain, paintFlake, heaterGhost } from './decals';

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
  /** Door-seam draft motes (foreshadowed onward doors) — animated. */
  draft: THREE.Points | null;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

// Underscript weathering — ~121 rooms reuse a small set of milled pieces, so
// per-instance decay is what keeps the repetition from reading flat. Dead
// fixtures share one dark material so they still merge per room; dying ones
// carry a cloned emissive + the 'flicker' anim (coupled to the nearest room
// light through lsRef, resolved lazily by the game loop).
const DEAD_TUBE_MAT = new THREE.MeshStandardMaterial({ color: 0x22251f, roughness: 0.8, metalness: 0.15 });
const U_JITTER: Record<string, number> = {
  paperStack: 0.5, typewriter: 0.5, waterCooler: 0.25,
  printer: 0.08, breakTable: 0.08, dishDrainer: 0.3,
};

// Signature of everything mergeGeometries() requires to match across
// geometries: attribute names, index-ness, morph attribute names and
// morphTargetsRelative. Buckets with identical signatures always merge.
function mergeSig(g: THREE.BufferGeometry): string {
  const morph = Object.keys(g.morphAttributes).sort().join(';');
  return Object.keys(g.attributes).sort().join(',')
    + (morph ? `|ma:${morph}` : '')
    + (g.morphTargetsRelative ? '|m' : '')
    + (g.index ? '|i' : '');
}

// Entity tell marks — what a thing leaves in the room before it. `wall`
// marks go on a free stretch of wall; floor marks lie on the walk path.
interface ForeshadowTell {
  wall?: boolean;
  tex: (r: import('../engine/rng').Rng) => THREE.Texture | null;
  w: number; h: number; n?: number; cy?: number;
}
export const FORESHADOW_TELLS: Record<string, ForeshadowTell[]> = {
  pursuer: [{ tex: footprintTrail, w: 0.9, h: 3.6 }, { wall: true, tex: scratchMarks, w: 0.9, h: 1.1 }],
  reprise: [{ tex: footprintTrail, w: 0.9, h: 4.0, n: 2 }],
  sweep: [{ tex: footprintTrail, w: 0.9, h: 3.8 }],
  returner: [{ wall: true, tex: scratchMarks, w: 1.0, h: 1.2, cy: 1.9 }],
  stillframe: [{ wall: true, tex: crackDecal, w: 1.1, h: 1.1 }, { tex: floorStain, w: 1.2, h: 1.2 }],
  redactor: [{ wall: true, tex: handPrints, w: 0.8, h: 1.0, n: 2 }],
  margin: [{ wall: true, tex: scratchMarks, w: 0.6, h: 0.8, cy: 1.0 }],
  whisper: [{ wall: true, tex: peeledWallpaper, w: 0.9, h: 1.6 }],
  echoskin: [{ tex: footprintTrail, w: 0.9, h: 3.2, n: 2 }],
  inkling: [{ tex: floorStain, w: 1.0, h: 1.0, n: 3 }, { wall: true, tex: bloodSmear, w: 0.8, h: 0.7, cy: 0.8 }],
  maelstrom: [{ tex: bloodSmear, w: 2.2, h: 1.1 }],
  curator: [{ tex: floorStain, w: 0.8, h: 0.8, n: 3 }, { wall: true, tex: peeledWallpaper, w: 0.7, h: 1.2 }],
  husk: [{ tex: floorStain, w: 2.2, h: 2.2 }],
  hollow: [{ wall: true, tex: handPrints, w: 0.8, h: 1.0 }, { tex: floorStain, w: 0.9, h: 0.9 }],
  witness: [{ wall: true, tex: handPrints, w: 0.9, h: 1.3, n: 2, cy: 1.8 }],
  grafter: [{ wall: true, tex: crackDecal, w: 1.2, h: 1.2 }, { tex: floorStain, w: 0.9, h: 0.9, n: 2 }],
  editor: [{ wall: true, tex: () => warningStripe(), w: 0.5, h: 2.0, cy: 1.4 }],
  redline: [{ wall: true, tex: () => warningStripe(), w: 0.5, h: 2.0, cy: 1.4 }],
  lurker: [{ wall: true, tex: scratchMarks, w: 0.9, h: 0.7, cy: 0.6 }],
  behemoth: [{ wall: true, tex: crackDecal, w: 1.4, h: 1.4 }, { wall: true, tex: grimeStreak, w: 0.9, h: 1.9 }],
  orrery: [{ wall: true, tex: grimeStreak, w: 0.9, h: 1.9, cy: 0.7 }],
  collector: [{ tex: floorStain, w: 0.5, h: 0.5, n: 3 }, { wall: true, tex: handPrints, w: 0.5, h: 0.6, cy: 0.8 }],
  singer: [{ tex: footprintTrail, w: 0.8, h: 1.6, n: 2 }],
  // Sprint 288 — the rest of the schedulable cast marks its approach too.
  bellman: [{ tex: footprintTrail, w: 0.8, h: 3.4 }],
  porter: [{ wall: true, tex: grimeStreak, w: 0.8, h: 1.8, cy: 2.1 }],
  warden: [{ tex: footprintTrail, w: 0.9, h: 4.0 }],
  groundswell: [{ tex: crackDecal, w: 1.5, h: 1.5, n: 2 }],
  inspector: [{ wall: true, tex: handPrints, w: 0.8, h: 1.0, cy: 1.0 }],
  commissionaire: [{ wall: true, tex: scratchMarks, w: 0.9, h: 1.0, cy: 1.1 }],
  detective: [{ wall: true, tex: handPrints, w: 0.6, h: 0.7, cy: 1.5 }],
  swamper: [{ tex: floorStain, w: 2.0, h: 2.0 }],
  hauler: [{ tex: footprintTrail, w: 1.0, h: 4.2 }, { wall: true, tex: grimeStreak, w: 0.9, h: 1.2, cy: 0.6 }],
  laundress: [{ tex: floorStain, w: 1.4, h: 1.4, n: 2 }],
  auditor: [{ wall: true, tex: handPrints, w: 0.8, h: 1.0, cy: 1.2 }],
};

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
// Cold draft through a watched door's seam — cooler, finer than dust.
const draftMat = new THREE.PointsMaterial({
  color: 0xc4ccd8,
  size: 0.035,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

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
  // Flooded halls — a dark sheet lying on the floor. It stays a live named
  // mesh (never merged) so the game can sink it when the drain opens.
  if (room.flooded) {
    const sheet = new THREE.Mesh(texBox(w * 0.97, 0.02, d * 0.97), MAT.waterDark());
    sheet.position.y = 0.05;
    sheet.name = `flood-${room.index}`;
    sheet.userData.anim = 'flood';
    group.add(sheet);
  }
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
      // hang the run from its ceiling anchor so a loose line can drift
      wire.geometry.translate(-sx, -(h - 0.06), -sz);
      const pivot = new THREE.Group();
      pivot.name = 'cable-drop';
      pivot.position.set(sx, h - 0.06, sz);
      pivot.add(wire);
      if (rng.bool(0.45)) {
        pivot.userData.anim = 'sway';
        pivot.userData.animAmp = 0.012 + rng.float() * 0.012;
        pivot.userData.animSeed = rng.float() * 100;
      }
      group.add(pivot);
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
  const frameHardware: THREE.Object3D[] = [];
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
    // The jamb kept its metal — strike plate across from the latch,
    // knuckles down the hinge stile, the stop strip the leaf slams into.
    if (!(isUnder || spec.biome === 'maintenance' || spec.biome === 'corridor')) {
      const st = new THREE.Mesh(texBox(0.02, 0.12, 0.06), MAT.brass());
      st.name = 'strike-plate';
      st.position.set(fw / 2 - sideW - 0.004, 1.08, 0);
      frame.add(st);
      frameHardware.push(st);
      for (const hy of [0.35, 1.15, 1.9]) {
        const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), MAT.brass());
        kn.name = 'hinge-knuckle';
        kn.position.set(-fw / 2 + sideW + 0.008, hy, 0.05);
        frame.add(kn);
        frameHardware.push(kn);
      }
      const stop = new THREE.Mesh(texBox(fw - 0.1, 0.03, 0.02), frameMat);
      stop.name = 'door-stop';
      stop.position.set(0, 2.28, 0.15);
      frame.add(stop);
      frameHardware.push(stop);
      for (const sx of [-1, 1]) {
        const sb = new THREE.Mesh(texBox(0.03, 2.2, 0.02), frameMat);
        sb.position.set(sx * (fw / 2 - sideW - 0.015), 1.15, 0.15);
        frame.add(sb);
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
    // Raised relief + brass hardware on interior (non-industrial)
    // doors — the slab reads flat otherwise. The house hung more than
    // one kind of door: most are the six-panel estate door, some are
    // planked scullery doors, some are louvered cupboards, some are
    // glazed half-glass parlour doors.
    if (!industrial && !doorModel) {
      const pw = port.width - 0.1;
      const panelMat = leafMat;
      const recessMat = MAT.darkOak();
      const styleRoll = rng.float();
      const leafStyle = styleRoll < 0.62 ? 'panel' : styleRoll < 0.78 ? 'plank' : styleRoll < 0.9 ? 'louver' : 'glass';
      if (leafStyle === 'panel') {
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
      } else if (leafStyle === 'plank') {
        // Vertical boards + ledged braces — the scullery/pantry door.
        for (const fz of [0.049, -0.049]) {
          for (let b = 0; b < 5; b++) {
            const bd = new THREE.Mesh(texBox(pw / 5 - 0.015, 2.1, 0.012), panelMat);
            bd.name = 'leaf-plank';
            bd.position.set(-pw / 2 + (b + 0.5) * (pw / 5), 0, fz);
            leaf.add(bd);
          }
          for (const by of [0.78, -0.78]) {
            const lg = new THREE.Mesh(texBox(pw - 0.12, 0.14, 0.016), recessMat);
            lg.name = 'leaf-ledge';
            lg.position.set(0, by, fz);
            leaf.add(lg);
          }
        }
      } else if (leafStyle === 'louver') {
        // Angled slats in two banks — the linen cupboard door.
        for (const fz of [0.049, -0.049]) {
          for (const bankY of [0.52, -0.5]) {
            for (let s = 0; s < 7; s++) {
              const sl = new THREE.Mesh(texBox(pw - 0.18, 0.07, 0.008), recessMat);
              sl.name = 'leaf-louver';
              sl.rotation.x = -0.5;
              sl.position.set(0, bankY + (s - 3) * 0.085, fz);
              leaf.add(sl);
            }
          }
        }
      } else {
        // Half-glazed parlour door — 2×3 panes over a solid lower half.
        for (const fz of [0.049, -0.049]) {
          const lower = new THREE.Mesh(texBox(pw - 0.14, 0.95, 0.014), panelMat);
          lower.name = 'leaf-lower';
          lower.position.set(0, -0.58, fz);
          leaf.add(lower);
        }
        const gMat = new THREE.MeshStandardMaterial({
          color: 0x141c24, emissive: 0x2c4054, emissiveIntensity: 0.3,
          roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.65,
        });
        gMat.userData.decalMat = true;
        for (let col = 0; col < 2; col++) {
          for (let row = 0; row < 3; row++) {
            const pane = new THREE.Mesh(texBox(pw * 0.36, 0.3, 0.008), gMat);
            pane.name = 'leaf-pane';
            pane.position.set((col - 0.5) * pw * 0.42, 0.38 + (row - 1) * 0.36, 0);
            leaf.add(pane);
            for (const fz of [0.049, -0.049]) {
              const munt = new THREE.Mesh(texBox(pw * 0.36, 0.03, 0.012), recessMat);
              munt.position.set((col - 0.5) * pw * 0.42, 0.38 + (row - 1) * 0.36 + 0.165, fz);
              leaf.add(munt);
            }
          }
        }
        const stile = new THREE.Mesh(texBox(0.04, 1.15, 0.015), recessMat);
        stile.name = 'leaf-stile';
        stile.position.set(0, 0.38, 0.049);
        leaf.add(stile);
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
      // The furniture a real door carries — mail slot, peephole,
      // deadbolt, escutcheon, push plate, number. Seeded per leaf so
      // no two doors read identical.
      if (rng.bool(0.4)) {
        for (const fz of [0.056, -0.056]) {
          const ms = new THREE.Mesh(texBox(0.26, 0.06, 0.018), MAT.brass());
          ms.name = 'mail-slot';
          ms.position.set(0, -0.5, fz);
          leaf.add(ms);
        }
      }
      if (rng.bool(0.45)) {
        for (const fz of [0.045, -0.045]) {
          const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 8), MAT.brass());
          ph.name = 'peephole';
          ph.rotation.x = Math.PI / 2;
          ph.position.set(pw / 2 - 0.14, 0.55, fz);
          leaf.add(ph);
        }
      }
      if (rng.bool(0.5)) {
        for (const fz of [0.056, -0.056]) {
          const db = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.024, 10), MAT.brass());
          db.name = 'deadbolt';
          db.rotation.x = Math.PI / 2;
          db.position.set(pw / 2 - 0.14, 0.22, fz);
          leaf.add(db);
        }
      }
      if (rng.bool(0.6)) {
        for (const fz of [0.052, -0.052]) {
          const es = new THREE.Mesh(texBox(0.035, 0.07, 0.01), MAT.brass());
          es.name = 'escutcheon';
          es.position.set(pw / 2 - 0.14, -0.15, fz);
          leaf.add(es);
        }
      }
      if (rng.bool(0.4)) {
        const fp = new THREE.Mesh(texBox(0.18, 0.5, 0.012), MAT.steelDark());
        fp.name = 'finger-plate';
        fp.position.set(pw / 2 - 0.19, -0.15, 0.055);
        leaf.add(fp);
      }
      if (rng.bool(0.3)) {
        const dn = new THREE.Mesh(texBox(0.12, 0.07, 0.012), MAT.brass());
        dn.name = 'door-number';
        dn.position.set(0, 0.58, 0.056);
        leaf.add(dn);
      }
    } else {
      // kick plate + rivets on service doors
      const kp = new THREE.Mesh(texBox(port.width - 0.16, 0.3, 0.02), MAT.steelDark());
      kp.position.set(0, -0.88, 0.05);
      leaf.add(kp);
      // The service doors kept their bar — a crash bar at hip height
      // where the night shift ran them flat-handed.
      if (rng.bool(0.55)) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, port.width - 0.3, 8), MAT.steelDark());
        bar.name = 'crash-bar';
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, -0.1, 0.07);
        leaf.add(bar);
        for (const sx of [-1, 1]) {
          const mnt = new THREE.Mesh(texBox(0.05, 0.08, 0.05), MAT.steelDark());
          mnt.position.set(sx * (port.width / 2 - 0.16), -0.1, 0.05);
          leaf.add(mnt);
        }
      }
      // And its eye — a wire-glass window up high to see what waits
      // behind the fire door before you owe it your face.
      if (rng.bool(0.4)) {
        const wpMat = new THREE.MeshStandardMaterial({
          color: 0x1a2630, emissive: 0x39506a, emissiveIntensity: 0.35,
          roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.7,
        });
        wpMat.userData.decalMat = true;
        const wp = new THREE.Mesh(texBox(0.3, 0.4, 0.02), wpMat);
        wp.name = 'wire-window';
        wp.position.set(0, 0.62, 0.05);
        leaf.add(wp);
      }
    }
    // The door was kicked in once — the split by the latch, the
    // splinters still raised, the shoe shadow under the blow.
    if (!industrial && rng.float() < 0.15) {
      const ks = decalQuad(kickSplit(rng), 0.5, 0.75);
      ks.name = 'kick-split';
      // Leaf-local y=0 is door mid-height — keep the blow just above
      // the kick plate, ~0.4m off the floor, not below it.
      ks.position.set(port.width / 2 - 0.5, -0.72, 0.052);
      leaf.add(ks);
    }
    // The knobs kept the hands — a burnished ring in the paint where
    // ten thousand grips turned the same brass.
    if (!industrial && rng.float() < 0.25) {
      const ksh = decalQuad(knobShine(rng), 0.3, 0.3);
      ksh.name = 'knob-shine';
      ksh.position.set(port.width / 2 - 0.14, 0.02, 0.054);
      leaf.add(ksh);
    }
    // The hinges bled — oxidised runs dragged down the face from
    // each knuckle that wept for years.
    if (!industrial && rng.float() < 0.18) {
      const hr = decalQuad(hingeRust(rng), 0.16, 0.9);
      hr.name = 'hinge-rust';
      hr.position.set(-(port.width / 2) + 0.14, -0.1, 0.052);
      leaf.add(hr);
    }
    // The keyholes kept the fumbles — a polish ring and scratch fan
    // where a lifetime of keys missed the slot.
    if (!industrial && rng.float() < 0.3) {
      const kw = decalQuad(keyholeWear(rng), 0.22, 0.22);
      kw.name = 'keyhole-wear';
      kw.position.set(port.width / 2 - 0.14, 0.16, 0.053);
      leaf.add(kw);
    }
    // The claws raked low — three furrows gouged at the door's foot
    // where something wanted through and was refused.
    if (!industrial && rng.float() < 0.14) {
      const cm = decalQuad(clawMarks(rng), 0.5, 0.5);
      cm.name = 'claw-marks';
      cm.position.set(0, -0.78, 0.053);
      leaf.add(cm);
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
    // Room-number plaque beside the jamb — the hotel registers every door.
    const plaque = modelInstance('doorPlaque');
    if (plaque && !industrial) {
      plaque.position.set(port.width / 2 + 0.34, 1.92, 0.05);
      frame.add(plaque);
    }
    // The sill kept the crossing — a transition strip where the two
    // rooms' floors meet under the leaf line.
    if (rng.float() < (industrial ? 0.35 : 0.6)) {
      const strip = new THREE.Mesh(texBox(port.width + 0.06, 0.008, 0.14), industrial ? MAT.steelDark() : MAT.brass());
      strip.name = 'threshold-strip';
      strip.position.set(0, 0.004, 0);
      frame.add(strip);
      frameHardware.push(strip);
    }
    // The seam throws a fan — light pooling on the floor just outside
    // the leaf, the tell that something lit waits on the far side.
    if (rng.float() < 0.3) {
      for (const gz of [0.5, -0.5]) {
        const gl = decalQuad(doorGlow(rng), 1.1, 1.1);
        gl.name = 'door-glow';
        gl.rotation.x = -Math.PI / 2;
        gl.position.set(0, 0.012, gz);
        if (gz < 0) gl.rotation.z = Math.PI;
        frame.add(gl);
      }
    }
    frame.position.set(lp.x, 0, lp.z);
    if (port.wall === 'e') frame.rotation.y = -Math.PI / 2;
    else if (port.wall === 'w') frame.rotation.y = Math.PI / 2;
    else if (port.wall === 'n') frame.rotation.y = Math.PI;
    group.add(frame);
    const doorId = port === spec.entry ? `door-${room.index}-in` : `door-${room.index}-out-${port.wall}${port.offset.toFixed(1)}`;
    doorLeaves.set(doorId, leaf);
    leaf.userData.hinge = hinge;
    leaf.userData.closedYaw = 0;
    leaf.userData.leafW = leafW;
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
      if (dw <= 0.78) m.userData.paperWall = true;
      if (wall === 'e') { m.rotation.y = -Math.PI / 2; m.position.set(w / 2 - 0.013, cy, along); }
      else if (wall === 'w') { m.rotation.y = Math.PI / 2; m.position.set(-w / 2 + 0.013, cy, along); }
      else if (wall === 'n') { m.rotation.y = Math.PI; m.position.set(along, cy, d / 2 - 0.013); }
      else { m.position.set(along, cy, -d / 2 + 0.013); }
      group.add(m);
    };
    const portOffsetsOn = (wall: string) => [spec.entry, ...spec.exits].filter((p) => p.wall === wall).map((p) => p.offset);
    // A wall spot is clean only if nothing tall stands in front of it:
    // decals buried behind wardrobes are clutter you never see (and
    // z-fight when the furniture crowds the plaster).
    const tallCoverOn = (wall: 'n' | 's' | 'e' | 'w', along: number, dw: number) => {
      for (const p of spec.props) {
        const c = modelCollider(p.kind);
        const ph = (c?.[1] ?? 0) + (p.y ?? 0);
        if (ph < 1.05) continue;
        const pw = (c ? Math.max(c[0], c[2]) : 0.8) / 2 + 0.25;
        if (wall === 'e' || wall === 'w') {
          const wx = wall === 'e' ? w / 2 : -w / 2;
          if (Math.abs(p.x - wx) < pw + 0.45 && Math.abs(along - p.z) < dw / 2 + pw) return true;
        } else {
          const wz = wall === 'n' ? d / 2 : -d / 2;
          if (Math.abs(p.z - wz) < pw + 0.45 && Math.abs(along - p.x) < dw / 2 + pw) return true;
        }
      }
      return false;
    };
    const pickWallSpot = (dw: number): { wall: 'n' | 's' | 'e' | 'w'; along: number } | null => {
      // paper-sized pieces must sit in the open; big streaks and
      // repairs may legitimately run behind furniture
      const avoidCover = dw <= 0.75;
      for (let tries = 0; tries < 4; tries++) {
        const wall = (['n', 's', 'e', 'w'] as const)[Math.floor(rng.float() * 4)];
        const span = (wall === 'e' || wall === 'w' ? d : w) - dw - 0.4;
        const along = (rng.float() - 0.5) * Math.max(0.2, span);
        if (portOffsetsOn(wall).every((o) => Math.abs(along - o) > dw / 2 + 0.9)
          && (!avoidCover || !tallCoverOn(wall, along, dw))) return { wall, along };
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
      const pn = group.children[group.children.length - 1];
      if (pn && !pn.name) pn.name = 'poster';
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
        // what fell out of the wound lands at the wall's feet
        if (rng.float() < 0.45) {
          const f = decalQuad(plasterFall(rng), 0.8, 0.8);
          f.name = 'plaster-fall';
          f.rotation.x = -Math.PI / 2;
          f.rotation.z = rng.float() * Math.PI;
          const ins = 0.13 + rng.float() * 0.15;
          if (spot.wall === 'e') f.position.set(w / 2 - ins, 0.0075, spot.along);
          else if (spot.wall === 'w') f.position.set(-w / 2 + ins, 0.0075, spot.along);
          else if (spot.wall === 'n') f.position.set(spot.along, 0.0075, d / 2 - ins);
          else f.position.set(spot.along, 0.0075, -d / 2 + ins);
          group.add(f);
        }
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

    // The house tells on itself — the entity or set piece in the NEXT
    // room leaves its mark in this one: prints, scuffs, drag-lines a
    // careful player learns to read before the door.
    const approachTell = room.foreshadow ?? room.milestoneTell;
    // Marks fade with distance from the set piece: dist 0 (the room on the
    // milestone's door) keeps full density; one room back the trail thins.
    // Entity foreshadows always dress at full density.
    const tellNear = room.milestoneTell === undefined ? 1 : 1 - (room.milestoneDist ?? 0) * 0.45;
    if (approachTell && rng.float() < 0.8 * tellNear) {
      for (const t of FORESHADOW_TELLS[approachTell] ?? []) {
        for (let n = 0; n < Math.max(1, Math.round((t.n ?? 1) * tellNear)); n++) {
          if (t.wall) {
            const spot = pickWallSpot(t.w);
            if (!spot) break;
            wallDecal(spot.wall, t.tex(rng), t.w, t.h, spot.along, t.cy ?? (1.2 + rng.float() * 0.9));
          } else {
            const m = decalQuad(t.tex(rng), t.w, t.h);
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = t.h >= 2.5
              ? (d >= w ? 0 : Math.PI / 2) + (rng.float() - 0.5) * 0.4
              : rng.float() * Math.PI;
            m.position.set(
              (rng.float() - 0.5) * Math.max(0.4, w - t.w - 0.6), 0.0075,
              (rng.float() - 0.5) * Math.max(0.4, d - t.h - 0.6));
            group.add(m);
          }
        }
      }
    }

    // The worn way — thresholds carry the traffic: a polished strip just
    // inside every leaf, and a tried leaf scars the wall beside it (a
    // locked leaf was worried before you; a toll leaf doubly so).
    for (const door of room.doors) {
      const ddx = door.pos.x - room.origin.x, ddz = door.pos.z - room.origin.z;
      const dc = Math.cos(-room.yaw), dsn = Math.sin(-room.yaw);
      const dp = { x: ddx * dc + ddz * dsn, z: -ddx * dsn + ddz * dc };
      const dil = Math.hypot(dp.x, dp.z) || 1;
      const inx = -dp.x / dil, inz = -dp.z / dil;
      if (rng.float() < (door.isMainRoute ? 0.85 : 0.45)) {
        const m = decalQuad(thresholdWear(rng), 1.15, 0.55);
        m.name = 'worn-threshold';
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = room.yaw - door.yaw - Math.PI / 2;
        m.position.set(dp.x + inx * 0.34, 0.0055, dp.z + inz * 0.34);
        group.add(m);
      }
      // scratches crowd the lock side — pick one leaf edge, pile marks on it
      if (door.locked && rng.float() < 0.75) {
        const side = rng.bool() ? 1 : -1;
        const px = inz * side, pz = -inx * side;
        const n = door.lockId === 'toll' ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const m = decalQuad(door.lockId === 'toll' ? handPrints(rng) : scratchMarks(rng), 0.5 + rng.float() * 0.3, 0.5 + rng.float() * 0.35);
          m.name = 'lock-scars';
          m.position.set(
            dp.x + inx * 0.08 + px * (0.52 + rng.float() * 0.2), 1.05 + rng.float() * 0.5,
            dp.z + inz * 0.08 + pz * (0.52 + rng.float() * 0.2));
          m.rotation.y = Math.atan2(inx, inz);
          group.add(m);
        }
      }
    }

    // The ones before you — chalk scrawl near cover: tallies, arrows,
    // ringed dots where someone hid and lived to mark it. Trapped spots
    // mark at the same rate — chalk stays ambiguous: refuge or bait.
    for (const spot of room.hidingSpots) {
      if (rng.float() >= 0.45) continue;
      const hx = (spot.volume.minX + spot.volume.maxX) / 2 - room.origin.x;
      const hz = (spot.volume.minZ + spot.volume.maxZ) / 2 - room.origin.z;
      const hc = Math.cos(-room.yaw), hs = Math.sin(-room.yaw);
      const lx = hx * hc + hz * hs, lz = -hx * hs + hz * hc;
      const m = decalQuad(chalkMark(rng), 0.5 + rng.float() * 0.15, 0.5 + rng.float() * 0.15);
      m.name = 'chalk-mark';
      // nearest wall face wins when the cover hugs it; mid-room cover
      // gets a floor scrawl beside the spot instead
      const wx = w / 2 - Math.abs(lx), wz = d / 2 - Math.abs(lz);
      const edge = Math.min(wx, wz);
      if (edge < 1.6) {
        const onX = wx < wz;
        const sgn = onX ? Math.sign(lx || 1) : Math.sign(lz || 1);
        const along = onX ? lz : lx;
        const lim = (onX ? d : w) / 2 - 0.4;
        m.position.set(
          onX ? sgn * (w / 2 - 0.04) : Math.max(-lim, Math.min(lim, along + (rng.float() - 0.5) * 0.5)),
          0.95 + rng.float() * 0.45,
          onX ? Math.max(-lim, Math.min(lim, along + (rng.float() - 0.5) * 0.5)) : sgn * (d / 2 - 0.04));
        m.rotation.y = onX ? -sgn * Math.PI / 2 : (sgn > 0 ? Math.PI : 0);
      } else {
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = rng.float() * Math.PI;
        m.position.set(
          Math.max(-w / 2 + 0.5, Math.min(w / 2 - 0.5, lx + (rng.float() - 0.5) * 0.8)), 0.0065,
          Math.max(-d / 2 + 0.5, Math.min(d / 2 - 0.5, lz + (rng.float() - 0.5) * 0.8)));
      }
      group.add(m);
    }

    // The drag — a heel-trail ends at a hiding spot: whoever scratched
    // the chalk didn't always finish the lesson.
    if (room.hidingSpots.length && rng.float() < 0.3) {
      const spot = room.hidingSpots[Math.floor(rng.float() * room.hidingSpots.length)];
      const cx = (spot.volume.minX + spot.volume.maxX) / 2 - room.origin.x;
      const cz = (spot.volume.minZ + spot.volume.maxZ) / 2 - room.origin.z;
      const dc = Math.cos(-room.yaw), dsn = Math.sin(-room.yaw);
      const lx = cx * dc + cz * dsn, lz = -cx * dsn + cz * dc;
      const ang = rng.float() * Math.PI * 2;
      const len = 1.4 + rng.float() * 1.6;
      const sx = Math.max(-w / 2 + 0.4, Math.min(w / 2 - 0.4, lx - Math.cos(ang) * len));
      const sz = Math.max(-d / 2 + 0.4, Math.min(d / 2 - 0.4, lz - Math.sin(ang) * len));
      const mx = (sx + lx) / 2, mz = (sz + lz) / 2;
      const run = Math.hypot(lx - sx, lz - sz);
      if (run > 0.8) {
        const m = decalQuad(dragTrail(rng), run, 0.55);
        m.name = 'drag-trail';
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = Math.atan2(-(lz - sz), lx - sx);
        m.position.set(mx, 0.0065, mz);
        group.add(m);
      }
    }

    // The rust keeps score — oxidation bleeding down from fixtures in
    // the service bones of the place.
    if (['maintenance', 'underscript', 'unlit', 'corridor'].includes(spec.biome) && rng.float() < 0.4) {
      const drops = 1 + Math.floor(rng.float() * 2);
      for (let i = 0; i < drops; i++) {
        const spot = pickWallSpot(0.5);
        if (!spot) break;
        const cy = 1.5 + rng.float() * 0.7;
        wallDecal(spot.wall, rustStreak(rng), 0.4 + rng.float() * 0.25, 0.9 + rng.float() * 0.5, spot.along, cy + 0.4);
        const rs = group.children[group.children.length - 1];
        if (rs && !rs.name) rs.name = 'rust-streak';
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'rust-streak';
      }
    }

    // The wiring shows — drooping cable runs in the service bones,
    // kept off the door lanes.
    if (['maintenance', 'underscript', 'unlit'].includes(spec.biome) && rng.float() < 0.4) {
      const runs = 1 + Math.floor(rng.float() * 2);
      for (let i = 0; i < runs; i++) {
        const cx = (rng.float() - 0.5) * (w - 2), cz = (rng.float() - 0.5) * (d - 2);
        if (footprintInDoorLane(spec, cx, cz, 0.5, 0.5)) continue;
        try {
          const cb = buildProp({ kind: rng.float() < 0.3 ? 'conduitRun' : 'hangingCable', x: cx, z: cz, y: h - 0.28, yaw: rng.float() * Math.PI }, rng.fork(6600 + i));
          cb.group.name = 'ceiling-cable';
          group.add(cb.group);
        } catch { /* dressing only */ }
      }
    }

    // The notices — the building's paperwork pinned beside its doors.
    if (['corridor', 'records', 'lobby', 'unlit', 'guest'].includes(spec.biome) && rng.float() < 0.3) {
      const port = [spec.entry, ...spec.exits][Math.floor(rng.float() * (1 + spec.exits.length))];
      const dw = 0.55 + rng.float() * 0.15;
      const side = rng.float() < 0.5 ? -1 : 1;
      const span = (port.wall === 'e' || port.wall === 'w' ? d : w) / 2 - 0.7;
      let along = Math.max(-span, Math.min(span, port.offset + side * (1.15 + rng.float() * 0.7)));
      if (tallCoverOn(port.wall, along, dw)) {
        along = Math.max(-span, Math.min(span, port.offset - side * (1.15 + rng.float() * 0.7)));
      }
      if (!tallCoverOn(port.wall, along, dw)) {
        wallDecal(port.wall, wallNotice(rng), dw, 0.6 + rng.float() * 0.15, along, 1.45 + rng.float() * 0.25);
        const last = group.children[group.children.length - 1];
        if (last) last.name = 'wall-notice';
      }
    }

    // The house remembers routes — at junctions a dragged arrow points
    // the way on. Mostly honest; sometimes it points down the branch —
    // whoever dragged it had their own errand.
    if (spec.exits.length >= 1) {
      const junction = spec.exits.length >= 2;
      const roll = rng.float();
      let target: { x: number; z: number } | undefined;
      let honest = true;
      if (junction && roll < 0.2) { target = portLocalPos(spec.exits[1 + Math.floor(rng.float() * (spec.exits.length - 1))], w, d); honest = false; }
      else if (roll < (junction ? 0.9 : 0.3)) target = portLocalPos(spec.exits[0], w, d);
      if (target) {
        const entryL = portLocalPos(spec.entry, w, d);
        const tl = Math.hypot(target.x, target.z) || 1;
        const a = decalQuad(wayArrow(rng), 0.9, 0.65);
        a.name = honest ? 'way-arrow' : 'way-arrow-false';
        a.rotation.x = -Math.PI / 2;
        a.rotation.z = Math.atan2(-target.z, target.x);
        // stands just past the entry door, where you arrive
        a.position.set(entryL.x * 0.7 + (target.x / tl) * 0.15, 0.0065, entryL.z * 0.7 + (target.z / tl) * 0.15);
        group.add(a);
      }
    }

    // The ones who ran — personal effects abandoned mid-flight beside the
    // doors and the cover they didn't reach: a grip left standing, a hat,
    // someone's boots. Whoever dragged the arrows ran out of pockets.
    if (['lobby', 'guest', 'corridor', 'records'].includes(spec.biome) && rng.float() < 0.35) {
      const port = spec.exits.length
        ? spec.exits[Math.floor(rng.float() * spec.exits.length)]
        : spec.entry;
      const pl = portLocalPos(port, w, d);
      const inward = port.wall === 's' ? { x: 0, z: 1 } : port.wall === 'n' ? { x: 0, z: -1 } : port.wall === 'e' ? { x: -1, z: 0 } : { x: 1, z: 0 };
      const side = rng.float() < 0.5 ? -1 : 1;
      const along = 1.1 + rng.float() * 0.8;
      const deep = 0.35 + rng.float() * 0.25;
      const fx = port.wall === 'n' || port.wall === 's'
        ? pl.x + side * along
        : pl.x + inward.x * deep;
      const fz = port.wall === 'e' || port.wall === 'w'
        ? pl.z + side * along
        : pl.z + inward.z * deep;
      if (!footprintInDoorLane(spec, fx, fz, 0.5, 0.5)) {
        const pieces: { kind: Parameters<typeof buildProp>[0]['kind']; yaw: number }[] = [{ kind: 'suitcase', yaw: rng.float() * Math.PI }];
        if (rng.float() < 0.5) pieces.push({ kind: rng.float() < 0.5 ? 'fishHat' : 'cigaretteCase', yaw: rng.float() * Math.PI * 2 });
        pieces.forEach((p, i) => {
          try {
            const built = buildProp({
              kind: p.kind,
              x: fx + (rng.float() - 0.5) * 0.3 * i,
              z: fz + inward.z * (0.35 * i) + (rng.float() - 0.5) * 0.3 * i,
              yaw: p.yaw,
            }, rng.fork(7700 + i));
            built.group.name = 'fled-effects';
            group.add(built.group);
          } catch { /* dressing only */ }
        });
      }
      // near a hiding spot: the hat or boots that waited too long
      if (room.hidingSpots.length && rng.float() < 0.5) {
        const spot = room.hidingSpots[Math.floor(rng.float() * room.hidingSpots.length)];
        const cx = (spot.volume.minX + spot.volume.maxX) / 2 - room.origin.x;
        const cz = (spot.volume.minZ + spot.volume.maxZ) / 2 - room.origin.z;
        const dc = Math.cos(-room.yaw), dsn = Math.sin(-room.yaw);
        const hx = cx * dc + cz * dsn, hz = -cx * dsn + cz * dc;
        const hxo = hx + (rng.float() - 0.5) * 0.9, hzo = hz + (rng.float() - 0.5) * 0.9;
        if (!footprintInDoorLane(spec, hxo, hzo, 0.3, 0.3)) {
          try {
            const built = buildProp({ kind: rng.float() < 0.5 ? 'rubberBoots' : 'fishHat', x: hxo, z: hzo, yaw: rng.float() * Math.PI * 2 }, rng.fork(7800));
            built.group.name = 'fled-effects';
            group.add(built.group);
          } catch { /* dressing only */ }
        }
      }
    }

    // The fallen — a clean ghost where a picture hung for years, and the
    // frame face-up at the wall's base. Whatever dropped it wasn't careful
    // with the rest of the room either.
    if (['guest', 'lobby', 'corridor', 'records', 'gallery'].includes(spec.biome) && rng.float() < 0.25) {
      const spot = pickWallSpot(0.6);
      if (spot) {
        wallDecal(spot.wall, frameGhost(rng), 0.55 + rng.float() * 0.2, 0.7 + rng.float() * 0.2, spot.along, 1.65 + rng.float() * 0.3);
        const fg = group.children[group.children.length - 1];
        if (fg && !fg.name) fg.name = 'frame-ghost';
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'fallen-frame';
        const inset = 0.3 + rng.float() * 0.25;
        const fx = spot.wall === 'e' ? w / 2 - inset : spot.wall === 'w' ? -w / 2 + inset : spot.along + (rng.float() - 0.5) * 0.4;
        const fz = spot.wall === 'n' ? d / 2 - inset : spot.wall === 's' ? -d / 2 + inset : spot.along + (rng.float() - 0.5) * 0.4;
        if (!footprintInDoorLane(spec, fx, fz, 0.5, 0.5)) {
          try {
            const built = buildProp({ kind: 'painting', x: fx, z: fz, y: 0.05, yaw: rng.float() * Math.PI * 2 }, rng.fork(7900));
            built.group.rotation.x = -Math.PI / 2;
            built.group.name = 'fallen-frame';
            group.add(built.group);
          } catch { /* dressing only */ }
        }
      }
    }

    // The cold hearth — every dead grate kept its last fire's business:
    // an ash mound spilling from the grate mouth, dust blown out into
    // the room. Nothing here has burned in a long time.
    for (const p of spec.props) {
      if (p.kind !== 'fireplace' && p.kind !== 'stove' && p.kind !== 'stoveRange' && p.kind !== 'firePit') continue;
      // the rare grate that is NOT dead — a banked coal still breathing
      // ember-light under the ash, breathing slow enough you doubt it
      if (!isUnder && rng.float() < 0.18) {
        const py = p.yaw ?? 0;
        const coal = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x1c0d06, emissive: 0xff5718, emissiveIntensity: 0.85, roughness: 1 }));
        coal.scale.y = 0.4;
        coal.position.set(p.x + Math.sin(py) * 0.3, 0.09, p.z + Math.cos(py) * 0.3);
        coal.name = 'live-ember';
        coal.userData.anim = 'ember';
        coal.userData.animSeed = rng.float() * 100;
        group.add(coal);
      }
      // The soot — the fire breathed black up the wall above its mouth
      // for years; the bloom keeps the shape long after the grate died.
      if (rng.float() < 0.55) {
        const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
        const md = Math.min(dE, dW, dN, dS);
        const sw = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
        const along = sw === 'e' || sw === 'w' ? p.z : p.x;
        wallDecal(sw, sootStain(rng), 0.9 + rng.float() * 0.3, 0.85 + rng.float() * 0.3, along, 1.4 + rng.float() * 0.25);
        const sl = group.children[group.children.length - 1];
        if (sl && !sl.name) sl.name = 'soot-stain';
      }
      // The ceiling kept the smoke — the greasy film above where
      // the fire ran, browner than the paint around it ever was.
      if (rng.float() < 0.45) {
        const ss = decalQuad(smokeStain(rng), 1.5 + rng.float() * 0.4, 1.5 + rng.float() * 0.4);
        ss.name = 'smoke-stain';
        ss.rotation.x = Math.PI / 2;
        ss.rotation.z = rng.float() * Math.PI;
        const hy = p.yaw ?? 0;
        ss.position.set(p.x + Math.sin(hy) * 0.3, h - 0.058, p.z + Math.cos(hy) * 0.3);
        group.add(ss);
      }
      if (rng.float() >= 0.55) continue;
      const m = decalQuad(ashPile(rng), 0.9 + rng.float() * 0.4, 0.75 + rng.float() * 0.3);
      m.name = 'cold-hearth';
      m.rotation.x = -Math.PI / 2;
      // grate mouth faces the prop's forward (+z rotated by yaw)
      const py = p.yaw ?? 0;
      m.rotation.z = -py;
      m.position.set(
        p.x + Math.sin(py) * 0.55,
        0.007,
        p.z + Math.cos(py) * 0.55);
      group.add(m);
    }

    // The curtains kept the sun — the wall stayed dark where a
    // drape hung, bleached pale around its fold edges.
    for (const p of spec.props) {
      if (p.kind !== 'window' || rng.float() >= 0.35) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const dww: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const dAlong = dww === 'e' || dww === 'w' ? p.z : p.x;
      wallDecal(dww, drapeGhost(rng), 0.6 + rng.float() * 0.15, 1.5 + rng.float() * 0.3,
        dAlong + (rng.float() < 0.5 ? -1 : 1) * (0.8 + rng.float() * 0.25),
        1.35 + rng.float() * 0.25);
      const dg = group.children[group.children.length - 1];
      if (dg && !dg.name) dg.name = 'drape-ghost';
      // The sill kept the rain — damp fans running down the wall
      // under the leak line. Independent of the drape ghost roll.
      if (rng.float() < 0.45) {
        wallDecal(dww, sillDamp(rng), 0.8 + rng.float() * 0.2, 1.0 + rng.float() * 0.25,
          dAlong + (rng.float() - 0.5) * 0.3, 0.62 + rng.float() * 0.15);
        const sd = group.children[group.children.length - 1];
        if (sd && !sd.name) sd.name = 'sill-damp';
      }
      // The rail left its screws — bracket scars and a shadow line
      // high above the frame where the rod hung for decades.
      if (rng.float() < 0.35) {
        wallDecal(dww, railGhost(rng), 1.3 + rng.float() * 0.2, 0.55 + rng.float() * 0.1,
          dAlong + (rng.float() - 0.5) * 0.15, 2.3 + rng.float() * 0.15);
        const rg = group.children[group.children.length - 1];
        if (rg && !rg.name) rg.name = 'rail-ghost';
      }
      // The sun bleached the boards — a parallelogram of pale wood
      // pooled on the floor under the sill.
      if (rng.float() < 0.4) {
        const sf = decalQuad(sunFade(rng), 1.3 + rng.float() * 0.3, 1.0 + rng.float() * 0.25);
        sf.name = 'sun-fade';
        sf.rotation.x = -Math.PI / 2;
        sf.rotation.z = (dww === 'n' ? Math.PI : dww === 's' ? 0 : dww === 'e' ? Math.PI / 2 : -Math.PI / 2) + (rng.float() - 0.5) * 0.2;
        const six = dww === 'e' ? -1.0 : dww === 'w' ? 1.0 : 0;
        const siz = dww === 'n' ? 1.0 : dww === 's' ? -1.0 : 0;
        const sp2 = portLocalPos({ wall: dww, offset: dAlong, width: 0.9 }, w, d);
        sf.position.set(sp2.x + six, 0.0095, sp2.z + siz);
        group.add(sf);
      }
    }

    // The switches kept the hands — a decade of reaching leaves a
    // grease halo at shoulder height beside every working door.
    for (const port of doorPositions) {
      if (rng.float() >= 0.45) continue;
      const lp3 = portLocalPos(port, w, d);
      const a3 = port.wall === 'e' || port.wall === 'w' ? lp3.z : lp3.x;
      wallDecal(port.wall, switchPolish(rng), 0.5 + rng.float() * 0.1, 0.55 + rng.float() * 0.1,
        a3 + (rng.float() < 0.5 ? -1 : 1) * (0.62 + rng.float() * 0.2),
        1.05 + rng.float() * 0.1);
      const sp = group.children[group.children.length - 1];
      if (sp && !sp.name) sp.name = 'switch-polish';
    }
    // The frame kept the years — pencil ticks climbing the jamb of a
    // room a family stayed in. Lived-in biomes only.
    const livedIn = spec.biome !== 'maintenance' && spec.biome !== 'unlit' && spec.biome !== 'gallery' && !isUnder;
    if (livedIn && doorPositions.length > 0 && rng.float() < 0.3) {
      const port = doorPositions[Math.floor(rng.float() * doorPositions.length)];
      const lp4 = portLocalPos(port, w, d);
      const a4 = port.wall === 'e' || port.wall === 'w' ? lp4.z : lp4.x;
      wallDecal(port.wall, growthMarks(rng), 0.42, 1.15,
        a4 + (rng.float() < 0.5 ? -1 : 1) * (0.58 + rng.float() * 0.12),
        1.0);
      const gm = group.children[group.children.length - 1];
      if (gm && !gm.name) gm.name = 'growth-marks';
    }

    // The radiators wept — oxide fans run down the wall behind the
    // ribs where the joints sweated for years.
    for (const p of spec.props) {
      if ((p.kind !== 'radiatorFin' && p.kind !== 'radiatorTall') || rng.float() >= 0.5) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const rw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = rw === 'e' || rw === 'w' ? p.z : p.x;
      wallDecal(rw, radiatorBleed(rng), 0.8 + rng.float() * 0.2, 0.85 + rng.float() * 0.2, along, 0.55 + rng.float() * 0.15);
      const rb = group.children[group.children.length - 1];
      if (rb && !rb.name) rb.name = 'radiator-bleed';
    }
    // The carpet kept the burns — cigarette and ember scars cluster
    // where a hand would have dropped. Lived-in floors only.
    if (livedIn && rng.float() < 0.25) {
      const bm = decalQuad(burnMarks(rng), 0.8, 0.8);
      bm.name = 'burn-marks';
      bm.rotation.x = -Math.PI / 2;
      bm.rotation.z = rng.float() * Math.PI * 2;
      bm.position.set((rng.float() - 0.5) * (w - 2), 0.009, (rng.float() - 0.5) * (d - 2));
      group.add(bm);
    }

    // The wax held at the thresholds — half-moon sheen arcs where a
    // polisher last buffed the boards between the doors.
    if (livedIn && doorPositions.length >= 2 && rng.float() < 0.3) {
      const ws = decalQuad(waxSheen(rng), 1.3 + rng.float() * 0.4, 0.9 + rng.float() * 0.2);
      ws.name = 'wax-sheen';
      ws.rotation.x = -Math.PI / 2;
      ws.rotation.z = rng.float() * Math.PI;
      ws.position.set((rng.float() - 0.5) * (w - 2.4), 0.0095, (rng.float() - 0.5) * (d - 2.4));
      group.add(ws);
    }

    // The vents breathe — sooty halos around the grilles that never
    // stopped exhaling, drift running down beneath them.
    for (const p of spec.props) {
      if ((p.kind !== 'vent' && p.kind !== 'wallVent' && p.kind !== 'airconUnit' && p.kind !== 'steamVent')
        || rng.float() >= 0.5) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const vw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = vw === 'e' || vw === 'w' ? p.z : p.x;
      wallDecal(vw, ventDust(rng), 0.7 + rng.float() * 0.2, 0.9 + rng.float() * 0.2, along, 2.0 + rng.float() * 0.3);
      const vd = group.children[group.children.length - 1];
      if (vd && !vd.name) vd.name = 'vent-dust';
    }
    // The boots scuffed — black heel arcs along the baseboards where
    // feet swung close, heaviest on the walked lanes.
    if (rng.float() < (livedIn ? 0.35 : 0.15)) {
      const spot = pickWallSpot(1.4);
      if (spot) {
        wallDecal(spot.wall, heelScuff(rng), 1.5 + rng.float() * 0.4, 0.32, spot.along, 0.13);
        const hs = group.children[group.children.length - 1];
        if (hs && !hs.name) hs.name = 'heel-scuff';
      }
    }

    // The sconces breathed — soot tongues climbing the wall above the
    // flame arms that never went out.
    for (const p of spec.props) {
      if ((p.kind !== 'wallSconce' && p.kind !== 'cagedSconce' && p.kind !== 'wallLantern')
        || rng.float() >= 0.55) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const sw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = sw === 'e' || sw === 'w' ? p.z : p.x;
      wallDecal(sw, sconceSoot(rng), 0.55 + rng.float() * 0.15, 0.9 + rng.float() * 0.2, along, 2.05 + rng.float() * 0.2);
      const ss = group.children[group.children.length - 1];
      if (ss && !ss.name) ss.name = 'sconce-soot';
    }
    // The clocks swung — case ghosts and scribed pendulum arcs where a
    // dial hung long enough to wear the plaster.
    for (const p of spec.props) {
      const floorCase = p.kind === 'grandfatherClock';
      if ((p.kind !== 'wallClock' && p.kind !== 'clock' && !floorCase) || rng.float() >= 0.4) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const cw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = cw === 'e' || cw === 'w' ? p.z : p.x;
      wallDecal(cw, clockGhost(rng), 0.75 + rng.float() * 0.2, 1.1 + rng.float() * 0.25,
        along, floorCase ? 1.45 + rng.float() * 0.2 : 1.85 + rng.float() * 0.2);
      const cg = group.children[group.children.length - 1];
      if (cg && !cg.name) cg.name = 'clock-ghost';
    }

    // The chairs rubbed the wall — a wear band at chair-back height
    // where seat tops kept knocking the same stretch of plaster.
    if (livedIn && rng.float() < 0.3) {
      const spot = pickWallSpot(1.7);
      if (spot) {
        wallDecal(spot.wall, chairRub(rng), 1.7 + rng.float() * 0.3, 0.5, spot.along, 0.82);
        const cr = group.children[group.children.length - 1];
        if (cr && !cr.name) cr.name = 'chair-rub';
      }
    }

    // The phone hung here once — a case ghost and cord shadow on walls
    // the hallway traffic passed for decades.
    if (livedIn && rng.float() < 0.18) {
      const spot = pickWallSpot(0.9);
      if (spot) {
        wallDecal(spot.wall, phoneGhost(rng), 0.55 + rng.float() * 0.1, 0.75 + rng.float() * 0.15, spot.along, 1.5);
        const pg = group.children[group.children.length - 1];
        if (pg && !pg.name) pg.name = 'phone-ghost';
      }
    }

    // The corners bloomed — mold owns the cold joints in the wet
    // bones: spore clusters creeping out of the ceiling seams.
    if ((!livedIn || spec.props.some(p => p.kind === 'basinSink' || p.kind === 'puddle')) && rng.float() < 0.3) {
      const spot = pickWallSpot(1.0);
      if (spot) {
        wallDecal(spot.wall, mouldBloom(rng), 0.7 + rng.float() * 0.3, 0.7 + rng.float() * 0.3,
          spot.along, 2.35 + rng.float() * 0.2);
        const mb = group.children[group.children.length - 1];
        if (mb && !mb.name) mb.name = 'mould-bloom';
      }
    }
    // The board kept the keys — a pegboard ghost with swung key
    // shadows on the walls where the desk worked.
    if (livedIn && rng.float() < 0.16) {
      const spot = pickWallSpot(0.9);
      if (spot) {
        wallDecal(spot.wall, keyBoard(rng), 0.7 + rng.float() * 0.15, 0.7 + rng.float() * 0.15, spot.along, 1.55);
        const kb = group.children[group.children.length - 1];
        if (kb && !kb.name) kb.name = 'key-board';
      }
    }
    // The luggage scraped by — a belt-height drag band down the walls
    // that carried the traffic.
    if (rng.float() < 0.25) {
      const spot = pickWallSpot(1.8);
      if (spot) {
        wallDecal(spot.wall, luggageScuff(rng), 1.8 + rng.float() * 0.4, 0.4, spot.along, 0.72);
        const ls = group.children[group.children.length - 1];
        if (ls && !ls.name) ls.name = 'luggage-scuff';
      }
    }

    // The doors dragged — a sagging leaf scrapes its swing's far
    // reach into the floor, darkest where the leaf stalls.
    for (const port of doorPositions) {
      if (rng.float() >= 0.2) continue;
      const lp = portLocalPos(port, w, d);
      const inx = port.wall === 'n' ? 0 : port.wall === 's' ? 0 : port.wall === 'e' ? -0.55 : 0.55;
      const inz = port.wall === 'n' ? 0.55 : port.wall === 's' ? -0.55 : 0;
      const dg2 = decalQuad(doorDrag(rng), 1.1 + rng.float() * 0.3, 0.55);
      dg2.name = 'door-drag';
      dg2.rotation.x = -Math.PI / 2;
      dg2.rotation.z = (port.wall === 'n' ? 0 : port.wall === 's' ? Math.PI : port.wall === 'e' ? Math.PI / 2 : -Math.PI / 2) + (rng.float() - 0.5) * 0.3;
      dg2.position.set(lp.x + inx, 0.0085, lp.z + inz);
      group.add(dg2);
    }

    // The hooks kept the coats — greasy halos and swing arcs behind
    // the pegs that still stand.
    for (const p of spec.props) {
      if ((p.kind !== 'keyRack' && p.kind !== 'ceilingHook') || rng.float() >= 0.45) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const hw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = hw === 'e' || hw === 'w' ? p.z : p.x;
      wallDecal(hw, hookWear(rng), 0.55 + rng.float() * 0.15, 0.85 + rng.float() * 0.15, along, 1.6 + rng.float() * 0.15);
      const hwk = group.children[group.children.length - 1];
      if (hwk && !hwk.name) hwk.name = 'hook-wear';
    }
    // The ceiling keeps its hairlines — a plaster crack that wandered
    // and set, pale dust along its lip.
    if (rng.float() < 0.25) {
      const ch = decalQuad(ceilingHair(rng), 1.4 + rng.float() * 0.5, 1.0 + rng.float() * 0.3);
      ch.name = 'ceiling-hair';
      ch.rotation.x = Math.PI / 2;
      ch.rotation.z = rng.float() * Math.PI * 2;
      ch.position.set((rng.float() - 0.5) * (w - 3), h - 0.056, (rng.float() - 0.5) * (d - 3));
      group.add(ch);
    }

    // The carts tracked their lanes — twin wheel rails ground into
    // the service floors, dust ridge between the treads.
    if (!livedIn && rng.float() < 0.35) {
      const ct = decalQuad(cartTracks(rng), 1.3 + rng.float() * 0.3, 1.6 + rng.float() * 0.4);
      ct.name = 'cart-tracks';
      ct.rotation.x = -Math.PI / 2;
      ct.rotation.z = (rng.bool(0.5) ? 0 : Math.PI / 2) + (rng.float() - 0.5) * 0.4;
      ct.position.set((rng.float() - 0.5) * (w - 3), 0.009, (rng.float() - 0.5) * (d - 3));
      group.add(ct);
    }
    // The grout darkened — the damp follows the seams between the
    // tile courses in the wet rooms.
    if ((spec.props.some(p => p.kind === 'basinSink' || p.kind === 'puddle') || !livedIn) && rng.float() < 0.3) {
      const spot = pickWallSpot(1.5);
      if (spot) {
        wallDecal(spot.wall, groutLines(rng), 1.5 + rng.float() * 0.3, 1.1 + rng.float() * 0.2, spot.along, 1.0 + rng.float() * 0.2);
        const gl = group.children[group.children.length - 1];
        if (gl && !gl.name) gl.name = 'grout-lines';
      }
    }

    // The lamps left their rings — a spared circle of boards where
    // a standing lamp kept the dark off for years.
    if (livedIn && rng.float() < 0.25) {
      const spot = pickWallSpot(0.6);
      if (spot) {
        const lp = portLocalPos({ wall: spot.wall, offset: spot.along, width: 0.9 }, w, d);
        const ix = spot.wall === 'e' ? -0.7 : spot.wall === 'w' ? 0.7 : 0;
        const iz = spot.wall === 'n' ? 0.7 : spot.wall === 's' ? -0.7 : 0;
        const lg = decalQuad(lampGhost(rng), 0.75 + rng.float() * 0.2, 0.75 + rng.float() * 0.2);
        lg.name = 'lamp-ghost';
        lg.rotation.x = -Math.PI / 2;
        lg.rotation.z = rng.float() * Math.PI * 2;
        lg.position.set(lp.x + ix, 0.009, lp.z + iz);
        group.add(lg);
      }
    }

    // The rockers swung — twin crescents carved under the runners of
    // chairs that rocked a decade of nights.
    for (const p of spec.props) {
      if ((p.kind !== 'armchair' && p.kind !== 'chair')
        || rng.float() >= 0.25) continue;
      const ra = decalQuad(rockerArcs(rng), 0.9 + rng.float() * 0.15, 0.85 + rng.float() * 0.15);
      ra.name = 'rocker-arcs';
      ra.rotation.x = -Math.PI / 2;
      ra.rotation.z = rng.float() * Math.PI;
      ra.position.set(p.x + (rng.float() - 0.5) * 0.2, 0.0085, p.z + (rng.float() - 0.5) * 0.2);
      group.add(ra);
    }
    // The cords wore thin — greasy drags down the reveals where pull
    // cords hung for decades. In the window loop instead of a wall pick.
    for (const p of spec.props) {
      if (p.kind !== 'window' || rng.float() >= 0.35) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const cww: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = cww === 'e' || cww === 'w' ? p.z : p.x;
      wallDecal(cww, cordWear(rng), 0.35 + rng.float() * 0.1, 1.3 + rng.float() * 0.3,
        along + (rng.float() < 0.5 ? -1 : 1) * (0.68 + rng.float() * 0.15), 1.5);
      const cw = group.children[group.children.length - 1];
      if (cw && !cw.name) cw.name = 'cord-wear';
    }
    // The nightstands kept the glow — a warm amber bloom on the wall
    // behind the bedside light that burned every night.
    for (const p of spec.props) {
      if ((p.kind !== 'nightstand' && p.kind !== 'deskLamp' && p.kind !== 'lamp' && p.kind !== 'washStand')
        || rng.float() >= 0.35) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const nw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = nw === 'e' || nw === 'w' ? p.z : p.x;
      wallDecal(nw, nightGlow(rng), 0.85 + rng.float() * 0.2, 0.85 + rng.float() * 0.2, along, 1.4 + rng.float() * 0.15);
      const ng = group.children[group.children.length - 1];
      if (ng && !ng.name) ng.name = 'night-glow';
    }

    // The lace threw its net — a dappled lattice on the wall beside
    // windows that once hung fine curtains.
    for (const p of spec.props) {
      if (p.kind !== 'window' || !livedIn || rng.float() >= 0.3) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const lw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = lw === 'e' || lw === 'w' ? p.z : p.x;
      wallDecal(lw, laceShadow(rng), 0.8 + rng.float() * 0.2, 0.9 + rng.float() * 0.2,
        along + (rng.float() < 0.5 ? -1 : 1) * (0.75 + rng.float() * 0.2), 1.5 + rng.float() * 0.3);
      const ls2 = group.children[group.children.length - 1];
      if (ls2 && !ls2.name) ls2.name = 'lace-shadow';
    }
    // The grease hung — an oily bloom on the ceiling above every
    // range that fed the house for years.
    for (const p of spec.props) {
      if ((p.kind !== 'stove' && p.kind !== 'kitchenRange' && p.kind !== 'stoveRange')
        || rng.float() >= 0.5) continue;
      const gc = decalQuad(greaseCloud(rng), 1.1 + rng.float() * 0.3, 1.1 + rng.float() * 0.3);
      gc.name = 'grease-cloud';
      gc.rotation.x = Math.PI / 2;
      gc.rotation.z = rng.float() * Math.PI * 2;
      gc.position.set(p.x, h - 0.057, p.z);
      group.add(gc);
    }

    // The rugs curled — a dark lip and trapped grit where the edge
    // lifted and never lay back down.
    for (const p of spec.props) {
      if (p.kind !== 'rug' || rng.float() >= 0.4) continue;
      const rc = decalQuad(rugCurl(rng), 0.85 + rng.float() * 0.2, 0.4 + rng.float() * 0.1);
      rc.name = 'rug-curl';
      rc.rotation.x = -Math.PI / 2;
      rc.rotation.z = rng.float() * Math.PI * 2;
      rc.position.set(p.x + (rng.float() - 0.5) * 0.5, 0.011, p.z + (rng.float() - 0.5) * 0.5);
      group.add(rc);
    }

    // The pipes sweated — condensation beads and joint weeps down
    // the service runs.
    for (const p of spec.props) {
      if ((p.kind !== 'pipe' && p.kind !== 'indPipes' && p.kind !== 'pipeManifold' && p.kind !== 'pipeLamp')
        || rng.float() >= 0.45) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const pw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = pw === 'e' || pw === 'w' ? p.z : p.x;
      wallDecal(pw, pipeSweat(rng), 1.1 + rng.float() * 0.3, 0.6 + rng.float() * 0.15, along, 1.9 + rng.float() * 0.4);
      const ps = group.children[group.children.length - 1];
      if (ps && !ps.name) ps.name = 'pipe-sweat';
    }
    // The frames leaned — rubbing pits and dust tides beside frames
    // that rest against the wall instead of hanging.
    for (const p of spec.props) {
      if ((p.kind !== 'frameStand' && p.kind !== 'standingFrame' && p.kind !== 'painting' )
        || rng.float() >= 0.35) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const fw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = fw === 'e' || fw === 'w' ? p.z : p.x;
      wallDecal(fw, frameLean(rng), 0.6 + rng.float() * 0.15, 0.6 + rng.float() * 0.15, along + (rng.float() - 0.5) * 0.3, 0.6 + rng.float() * 0.2);
      const fl = group.children[group.children.length - 1];
      if (fl && !fl.name) fl.name = 'frame-lean';
    }

    // The hearth spilled — ash fans and ember pits past the fender
    // of every fireplace that burned.
    for (const p of spec.props) {
      if ((p.kind !== 'fireplace' && p.kind !== 'firePit') || rng.float() >= 0.6) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const hw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const inx = hw === 'e' ? -1 : hw === 'w' ? 1 : 0;
      const inz = hw === 's' ? -1 : hw === 'n' ? 1 : 0;
      const hs = decalQuad(hearthSpill(rng), 0.9 + rng.float() * 0.2, 0.6 + rng.float() * 0.15);
      hs.name = 'hearth-spill';
      hs.rotation.x = -Math.PI / 2;
      hs.rotation.z = rng.float() * Math.PI * 2;
      hs.position.set(p.x + inx * 0.6, 0.0088, p.z + inz * 0.6);
      group.add(hs);
    }
    // The crates dragged — splinter fields and nail marks where a
    // crate's corner dug in.
    for (const p of spec.props) {
      if ((p.kind !== 'crate' && p.kind !== 'milCrate' && p.kind !== 'plasticCrate' && p.kind !== 'carton')
        || rng.float() >= 0.4) continue;
      const cs = decalQuad(crateSplinters(rng), 0.8 + rng.float() * 0.2, 0.55 + rng.float() * 0.1);
      cs.name = 'crate-splinters';
      cs.rotation.x = -Math.PI / 2;
      cs.rotation.z = rng.float() * Math.PI * 2;
      cs.position.set(p.x + (rng.float() - 0.5) * 0.6, 0.0082, p.z + (rng.float() - 0.5) * 0.6);
      group.add(cs);
    }
    // The umbrellas dripped — wet rings under the stands that caught
    // the rain.
    for (const p of spec.props) {
      if (p.kind !== 'umbrellaStand' || rng.float() >= 0.6) continue;
      const ur = decalQuad(umbrellaRing(rng), 0.6 + rng.float() * 0.15, 0.6 + rng.float() * 0.15);
      ur.name = 'umbrella-ring';
      ur.rotation.x = -Math.PI / 2;
      ur.rotation.z = rng.float() * Math.PI * 2;
      ur.position.set(p.x, 0.009, p.z);
      group.add(ur);
    }

    // The boards kept the knots — seam lines, knot eyes and nail
    // pairs on the floor in lived-in rooms.
    if (livedIn && rng.bool(0.4)) {
      const kh = decalQuad(knotHoles(rng), 0.9 + rng.float() * 0.3, 0.9 + rng.float() * 0.3);
      kh.name = 'knot-holes';
      kh.rotation.x = -Math.PI / 2;
      kh.rotation.z = rng.float() * Math.PI * 2;
      kh.position.set((rng.float() - 0.5) * (w * 0.5), 0.0078, (rng.float() - 0.5) * (d * 0.5));
      group.add(kh);
    }
    // The shafts fell — pale trapezoids of window light with the
    // motes still in them, on the floor beside windows.
    for (const p of spec.props) {
      if (p.kind !== 'window' || !livedIn || rng.float() >= 0.35) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const sw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const inx = sw === 'e' ? -1 : sw === 'w' ? 1 : 0;
      const inz = sw === 's' ? -1 : sw === 'n' ? 1 : 0;
      const ds = decalQuad(dustShaft(rng), 0.7 + rng.float() * 0.15, 1.0 + rng.float() * 0.2);
      ds.name = 'dust-shaft';
      ds.rotation.x = -Math.PI / 2;
      ds.rotation.z = Math.atan2(-inx, inz || 0.0001) + (rng.float() - 0.5) * 0.2;
      ds.position.set(p.x + inx * 0.7, 0.0082, p.z + inz * 0.7);
      group.add(ds);
    }

    // The flue stained — soot columns rising from fireplaces that
    // breathed up the wall for decades.
    for (const p of spec.props) {
      if ((p.kind !== 'fireplace' && p.kind !== 'firePit') || rng.float() >= 0.5) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const fw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = fw === 'e' || fw === 'w' ? p.z : p.x;
      wallDecal(fw, flueStain(rng), 0.8 + rng.float() * 0.2, 1.3 + rng.float() * 0.2, along, 1.9 + rng.float() * 0.2);
      const fs = group.children[group.children.length - 1];
      if (fs && !fs.name) fs.name = 'flue-stain';
    }

    // The plaster bulged — damp blisters with crack crowns on walls
    // that never dried.
    if (!livedIn || rng.bool(0.55)) {
      const spot = pickWallSpot(0.85);
      if (spot) {
        wallDecal(spot.wall, plasterBulge(rng), 0.7 + rng.float() * 0.2, 0.7 + rng.float() * 0.2, spot.along, 1.3 + rng.float() * 0.5);
        const pb = group.children[group.children.length - 1];
        if (pb && !pb.name) pb.name = 'plaster-bulge';
      }
    }
    // The doors dented the wall — impact pits behind the swings.
    for (const port of doorPositions) {
      if (rng.float() >= 0.3) continue;
      const hit = portLocalPos({ wall: port.wall, offset: port.offset, width: 0.9 }, w, d);
      const inx = port.wall === 'e' ? -1 : port.wall === 'w' ? 1 : 0;
      const inz = port.wall === 's' ? 1 : port.wall === 'n' ? -1 : 0;
      const along = (port.wall === 'e' || port.wall === 'w' ? hit.z : hit.x)
        + (rng.bool(0.5) ? port.width / 2 + 0.12 : -port.width / 2 - 0.12);
      wallDecal(port.wall, doorDent(rng), 0.4 + rng.float() * 0.1, 0.4 + rng.float() * 0.1, along + inx * 0 + inz * 0, 0.95 + rng.float() * 0.15);
      const dd = group.children[group.children.length - 1];
      if (dd && !dd.name) dd.name = 'door-dent';
    }

    // The drains rusted — oxidation halos around the floor grates.
    for (const p of spec.props) {
      if ((p.kind !== 'grateDrain' && p.kind !== 'ironGrate' && p.kind !== 'puddle') || rng.float() >= 0.5) continue;
      const rh = decalQuad(rustHalo(rng), 0.7 + rng.float() * 0.2, 0.7 + rng.float() * 0.2);
      rh.name = 'rust-halo';
      rh.rotation.x = -Math.PI / 2;
      rh.rotation.z = rng.float() * Math.PI * 2;
      rh.position.set(p.x, 0.0084, p.z);
      group.add(rh);
    }

    // The hooks sagged — plaster pull-halos under the mounts that
    // carried weight for decades.
    for (const p of spec.props) {
      if ((p.kind !== 'ceilingHook' && p.kind !== 'meatHook') || rng.float() >= 0.5) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const hw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = hw === 'e' || hw === 'w' ? p.z : p.x;
      wallDecal(hw, hookSag(rng), 0.5 + rng.float() * 0.1, 0.5 + rng.float() * 0.1, along, h - 0.9 - rng.float() * 0.3);
      const hs = group.children[group.children.length - 1];
      if (hs && !hs.name) hs.name = 'hook-sag';
    }

    // The leaves blew in — litter scattered inward from the sill
    // under windows left broken or open.
    for (const p of spec.props) {
      if (p.kind !== 'window' || rng.float() >= 0.3) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const lw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const inx = lw === 'e' ? -1 : lw === 'w' ? 1 : 0;
      const inz = lw === 's' ? -1 : lw === 'n' ? 1 : 0;
      const ll = decalQuad(leafLitter(rng), 0.9 + rng.float() * 0.2, 0.9 + rng.float() * 0.2);
      ll.name = 'leaf-litter';
      ll.rotation.x = -Math.PI / 2;
      ll.rotation.z = Math.atan2(-inx, inz || 0.0001);
      ll.position.set(p.x + inx * 0.55, 0.0086, p.z + inz * 0.55);
      group.add(ll);
    }
    // The bells rusted dumb — servant-bell rosettes and wire bores
    // high on walls the staff once rang.
    if (livedIn && rng.bool(0.3)) {
      const spot = pickWallSpot(0.6);
      if (spot) {
        wallDecal(spot.wall, bellRose(rng), 0.4 + rng.float() * 0.08, 0.4 + rng.float() * 0.08, spot.along, 1.7 + rng.float() * 0.3);
        const br = group.children[group.children.length - 1];
        if (br && !br.name) br.name = 'bell-rose';
      }
    }

    // The curtains threw their shade — fold shadows on the wall
    // behind curtains that hung for decades.
    for (const p of spec.props) {
      if ((p.kind !== 'curtain' && p.kind !== 'curtainLong' && p.kind !== 'drapePanel' && p.kind !== 'curtainSwag')
        || rng.float() >= 0.4) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      let cw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      if (p.yaw !== undefined) {
        const sy = Math.sin(p.yaw), cyv = Math.cos(p.yaw);
        cw = Math.abs(sy) > Math.abs(cyv) ? (sy > 0 ? 'w' : 'e') : (cyv > 0 ? 's' : 'n');
      }
      const along = cw === 'e' || cw === 'w' ? p.z : p.x;
      wallDecal(cw, curtainShade(rng), 0.9 + rng.float() * 0.2, 1.4 + rng.float() * 0.3, along + (rng.float() - 0.5) * 0.2, 1.55 + rng.float() * 0.2);
      const cs = group.children[group.children.length - 1];
      if (cs && !cs.name) cs.name = 'curtain-shade';
    }

    // The walls opened — where the render failed, the wood lath shows
    // through like a rib, plaster crumbs dropped at its foot. Only on
    // rendered walls: tile, steel, panelling and brick have no lath to bare.
    if (!livedIn && spec.wallMaterial !== 'tile' && spec.wallMaterial !== 'corrugated'
      && spec.wallMaterial !== 'woodPanel' && spec.wallMaterial !== 'brick' && rng.bool(0.5)) {
      const spot = pickWallSpot(0.9);
      if (spot) {
        wallDecal(spot.wall, lathExpose(rng), 0.7 + rng.float() * 0.2, 0.55 + rng.float() * 0.15, spot.along, 1.15 + rng.float() * 0.5);
        const le = group.children[group.children.length - 1];
        if (le && !le.name) le.name = 'lath-expose';
      }
    }

    // The drains wept — a rust ring and drip channels standing around
    // the floor grates and the coal scuttles that sweated beside them.
    for (const p of spec.props) {
      if ((p.kind !== 'grateDrain' && p.kind !== 'ironGrate' && p.kind !== 'coalScuttle') || rng.float() >= 0.45) continue;
      const dr = decalQuad(drainRust(rng), 0.6 + rng.float() * 0.15, 0.6 + rng.float() * 0.15);
      dr.name = 'drain-rust';
      dr.rotation.x = -Math.PI / 2;
      dr.rotation.z = rng.float() * Math.PI * 2;
      dr.position.set(p.x, 0.0087, p.z);
      group.add(dr);
    }

    // The dust kept what rolled under — a grey pelt and the small
    // lost things peeking out at the bed's front edge.
    for (const p of spec.props) {
      if ((p.kind !== 'bed' && p.kind !== 'bedOld' && p.kind !== 'daybed') || rng.float() >= 0.4) continue;
      const cdx = -p.x, cdz = -p.z;
      const clen = Math.hypot(cdx, cdz) || 1;
      const uh = decalQuad(underbedHaze(rng), 0.9 + rng.float() * 0.2, 0.6 + rng.float() * 0.1);
      uh.name = 'underbed-haze';
      uh.rotation.x = -Math.PI / 2;
      uh.rotation.z = Math.atan2(-cdx / clen, cdz / clen || 0.0001) + Math.PI;
      uh.position.set(p.x + (cdx / clen) * 0.7, 0.0085, p.z + (cdz / clen) * 0.7);
      group.add(uh);
    }

    // The paper let go — a wallpaper flap curls off its seam, the
    // paste stain and bare plaster showing behind it.
    if (livedIn && spec.wallMaterial !== 'woodPanel' && spec.wallMaterial !== 'tile' && spec.wallMaterial !== 'corrugated' && spec.wallMaterial !== 'brick' && rng.bool(0.35)) {
      const spot = pickWallSpot(0.9);
      if (spot) {
        wallDecal(spot.wall, paperPeel(rng), 0.6 + rng.float() * 0.15, 0.8 + rng.float() * 0.2, spot.along, 1.2 + rng.float() * 0.4);
        const pp = group.children[group.children.length - 1];
        if (pp && !pp.name) pp.name = 'paper-peel';
      }
    }

    // The tiles broke — crack webs and dark grout where the wet rooms
    // wore their floors out under boots and buckets.
    if ((spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder
      || spec.props.some((p) => p.kind === 'basinSink' || p.kind === 'puddle')) && spec.floorMaterial !== 'carpet' && rng.bool(0.4)) {
      const tc = decalQuad(tileCrack(rng), 1.2 + rng.float() * 0.3, 1.2 + rng.float() * 0.3);
      tc.name = 'tile-crack';
      tc.rotation.x = -Math.PI / 2;
      tc.rotation.z = rng.float() * Math.PI * 2;
      tc.position.set(rng.range(-w / 2 + 1.2, w / 2 - 1.2), 0.0089, rng.range(-d / 2 + 1.2, d / 2 - 1.2));
      group.add(tc);
    }

    // The scuttle spilled — coal dust, lumps and the scuffed circle
    // where it always stood beside the fire.
    for (const p of spec.props) {
      if ((p.kind !== 'coalScuttle' && p.kind !== 'fireplace' && p.kind !== 'firePit' && p.kind !== 'stove' && p.kind !== 'stoveRange') || rng.float() >= 0.4) continue;
      const cdx = -p.x, cdz = -p.z;
      const clen = Math.hypot(cdx, cdz) || 1;
      const cd = decalQuad(coalDust(rng), 0.9 + rng.float() * 0.2, 0.9 + rng.float() * 0.2);
      cd.name = 'coal-dust';
      cd.rotation.x = -Math.PI / 2;
      cd.rotation.z = rng.float() * Math.PI * 2;
      cd.position.set(p.x + (cdx / clen) * 0.55, 0.0088, p.z + (cdz / clen) * 0.55);
      group.add(cd);
    }

    // The pegs kept the shapes — a hat and a coat faded into the
    // paint beside the rails where things hung for a lifetime.
    for (const p of spec.props) {
      if ((p.kind !== 'pegRail' && p.kind !== 'hallTree') || rng.float() >= 0.4) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const gw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = gw === 'e' || gw === 'w' ? p.z : p.x;
      wallDecal(gw, coatGhost(rng), 0.7 + rng.float() * 0.15, 0.95 + rng.float() * 0.15, along + (rng.float() - 0.5) * 0.3, 1.55 + rng.float() * 0.15);
      const cg = group.children[group.children.length - 1];
      if (cg && !cg.name) cg.name = 'coat-ghost';
    }

    // The box gave way — damp bloom and pulp smear under cartons
    // left too long in the damp rooms.
    for (const p of spec.props) {
      if ((p.kind !== 'cardboardBox' && p.kind !== 'carton' && p.kind !== 'cheeseBox') || rng.float() >= 0.4) continue;
      const br = decalQuad(boxRot(rng), 0.9 + rng.float() * 0.2, 0.9 + rng.float() * 0.2);
      br.name = 'box-rot';
      br.rotation.x = -Math.PI / 2;
      br.rotation.z = rng.float() * Math.PI * 2;
      br.position.set(p.x, 0.0091, p.z);
      group.add(br);
    }

    // The feet wicked the damp — dark tide rings where the heavy
    // furniture has stood too long in the wet rooms.
    for (const p of spec.props) {
      if ((p.kind !== 'cabinet' && p.kind !== 'vintageCabinet' && p.kind !== 'dresser' && p.kind !== 'chest' && p.kind !== 'wardrobe' && p.kind !== 'desk' && p.kind !== 'counter') || rng.float() >= 0.35) continue;
      if (spec.biome !== 'maintenance' && spec.biome !== 'unlit' && !isUnder && !spec.props.some((q) => q.kind === 'basinSink' || q.kind === 'puddle')) continue;
      const lr = decalQuad(legRings(rng), 1.0 + rng.float() * 0.15, 1.0 + rng.float() * 0.15);
      lr.name = 'leg-rings';
      lr.rotation.x = -Math.PI / 2;
      lr.rotation.z = rng.float() * Math.PI * 2;
      lr.position.set(p.x, 0.0092, p.z);
      group.add(lr);
    }

    // The rail kept its dust — a grey ledge on the picture rail,
    // flyspecks and nail pits where hooks once bit.
    if (livedIn && rng.bool(0.35)) {
      const spot = pickWallSpot(1.2);
      if (spot) {
        wallDecal(spot.wall, railDust(rng), 1.4 + rng.float() * 0.3, 0.5 + rng.float() * 0.1, spot.along, 2.05 + rng.float() * 0.2);
        const rd = group.children[group.children.length - 1];
        if (rd && !rd.name) rd.name = 'rail-dust';
      }
    }

    // The basket shed — wicker splinters and fiber wisps scattered
    // under the weave where the hampers stand.
    for (const p of spec.props) {
      if ((p.kind !== 'basket' && p.kind !== 'linenHamper' && p.kind !== 'linenPress' && p.kind !== 'linenShelf') || rng.float() >= 0.4) continue;
      const bs = decalQuad(basketShed(rng), 0.8 + rng.float() * 0.2, 0.8 + rng.float() * 0.2);
      bs.name = 'basket-shed';
      bs.rotation.x = -Math.PI / 2;
      bs.rotation.z = rng.float() * Math.PI * 2;
      bs.position.set(p.x, 0.0094, p.z);
      group.add(bs);
    }

    // The boards kept the grime — a dirt tide and splash marks
    // along the baseboards of the wet and neglected rooms.
    if ((spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder
      || spec.props.some((p) => p.kind === 'basinSink' || p.kind === 'puddle')) && rng.bool(0.5)) {
      const spot = pickWallSpot(1.4);
      if (spot) {
        wallDecal(spot.wall, baseGrime(rng), 1.6 + rng.float() * 0.4, 0.5 + rng.float() * 0.12, spot.along, 0.32 + rng.float() * 0.1);
        const bg = group.children[group.children.length - 1];
        if (bg && !bg.name) bg.name = 'base-grime';
      }
    }

    // The gap kept the drift — dust and grit combed under the doors
    // by a draft that never stopped blowing.
    for (const port of doorPositions) {
      if (rng.float() >= 0.35) continue;
      const hit = portLocalPos({ wall: port.wall, offset: port.offset, width: 0.9 }, w, d);
      const inx = port.wall === 'e' ? -1 : port.wall === 'w' ? 1 : 0;
      const dd = decalQuad(doorDrift(rng), 0.9 + rng.float() * 0.15, 0.5 + rng.float() * 0.1);
      dd.name = 'door-drift';
      dd.rotation.x = -Math.PI / 2;
      dd.rotation.z = port.wall === 'e' || port.wall === 'w' ? Math.PI / 2 : 0;
      // 'n' is the +z wall and 's' the -z wall — dust piles inside.
      dd.position.set(hit.x + inx * 0.3, 0.0096, hit.z + (port.wall === 'n' ? -0.3 : port.wall === 's' ? 0.3 : 0));
      group.add(dd);
    }

    // The battens left ghosts — pale strips and nail pits on the
    // glass where boards crossed it shut.
    for (const p of spec.props) {
      if ((p.kind !== 'window' && p.kind !== 'windowArch' && p.kind !== 'transomWindow' && p.kind !== 'traceryWindow') || rng.float() >= 0.3) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const bw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = bw === 'e' || bw === 'w' ? p.z : p.x;
      wallDecal(bw, battenGhost(rng), 0.8 + rng.float() * 0.15, 0.8 + rng.float() * 0.15, along, (p.y ?? 0) + 1.45 + rng.float() * 0.2);
      const bg = group.children[group.children.length - 1];
      if (bg && !bg.name) bg.name = 'batten-ghost';
    }

    // The jug wept rings — a stubborn ring and one dried drip
    // wherever the vessels have stood unmoved.
    for (const p of spec.props) {
      if ((p.kind !== 'jug' && p.kind !== 'gallonJug' && p.kind !== 'vase' && p.kind !== 'woodenBowl' && p.kind !== 'brassPot' && p.kind !== 'enamelPot') || rng.float() >= 0.4) continue;
      const jr = decalQuad(jugRing(rng), 0.5 + rng.float() * 0.1, 0.5 + rng.float() * 0.1);
      jr.name = 'jug-ring';
      jr.rotation.x = -Math.PI / 2;
      jr.rotation.z = rng.float() * Math.PI * 2;
      jr.position.set(p.x, (p.y ?? 0) + 0.0097, p.z);
      group.add(jr);
    }

    // The lamps smoked the ceiling — a soot ring and leaning smudge
    // above the hanging flames that burned for years.
    for (const p of spec.props) {
      if ((p.kind !== 'chainBulb' && p.kind !== 'lamp' && p.kind !== 'ceilingLamp') || rng.float() >= 0.45) continue;
      const ls = decalQuad(lampSoot(rng), 0.8 + rng.float() * 0.2, 0.8 + rng.float() * 0.2);
      ls.name = 'lamp-soot';
      ls.rotation.x = Math.PI / 2;
      ls.rotation.z = rng.float() * Math.PI * 2;
      ls.position.set(p.x, h - 0.057, p.z);
      group.add(ls);
    }

    // The ceiling bloomed — water rings and blistered plaster where
    // a leak came and went in seasons overhead.
    if ((spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder
      || spec.props.some((p) => p.kind === 'basinSink' || p.kind === 'puddle')) && rng.bool(0.4)) {
      const pb = decalQuad(plasterBloom(rng), 1.1 + rng.float() * 0.25, 1.1 + rng.float() * 0.25);
      pb.name = 'plaster-bloom';
      pb.rotation.x = Math.PI / 2;
      pb.rotation.z = rng.float() * Math.PI * 2;
      pb.position.set(rng.range(-w / 2 + 1.4, w / 2 - 1.4), h - 0.056, rng.range(-d / 2 + 1.4, d / 2 - 1.4));
      group.add(pb);
    }

    // The embers jumped — scorch pits and coal shadows past the
    // hearth's edge where the fire spat and nobody stamped.
    for (const p of spec.props) {
      if ((p.kind !== 'fireplace' && p.kind !== 'firePit') || rng.float() >= 0.45) continue;
      const cdx = -p.x, cdz = -p.z;
      const clen = Math.hypot(cdx, cdz) || 1;
      const ep = decalQuad(emberPits(rng), 1.0 + rng.float() * 0.2, 0.65 + rng.float() * 0.1);
      ep.name = 'ember-pits';
      ep.rotation.x = -Math.PI / 2;
      ep.rotation.z = Math.atan2(-cdx / clen, cdz / clen || 0.0001) + Math.PI;
      ep.position.set(p.x + (cdx / clen) * 0.8, 0.0093, p.z + (cdz / clen) * 0.8);
      group.add(ep);
    }

    // Someone traced the wall — one finger line dragged through the
    // dust, a ridge piled where the finger stopped.
    if (livedIn && rng.bool(0.3)) {
      const spot = pickWallSpot(0.8);
      if (spot) {
        wallDecal(spot.wall, fingerTrace(rng), 0.9 + rng.float() * 0.2, 0.45 + rng.float() * 0.1, spot.along, 1.35 + rng.float() * 0.2);
        const ft = group.children[group.children.length - 1];
        if (ft && !ft.name) ft.name = 'finger-trace';
      }
    }

    // The mop dried mid-sweep — stroke arcs and a water edge where
    // the wet work was abandoned half-done.
    if ((spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder
      || spec.props.some((p) => p.kind === 'basinSink' || p.kind === 'puddle')) && rng.bool(0.4)) {
      const ma = decalQuad(mopArcs(rng), 1.1 + rng.float() * 0.25, 1.1 + rng.float() * 0.25);
      ma.name = 'mop-arcs';
      ma.rotation.x = -Math.PI / 2;
      ma.rotation.z = rng.float() * Math.PI * 2;
      ma.position.set(rng.range(-w / 2 + 1.3, w / 2 - 1.3), 0.0095, rng.range(-d / 2 + 1.3, d / 2 - 1.3));
      group.add(ma);
    }

    // The ladder left its rub — twin polish streaks and kicked feet
    // where the same ladder always leans in the service rooms.
    if ((spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder) && rng.bool(0.35)) {
      const spot = pickWallSpot(0.9);
      if (spot) {
        wallDecal(spot.wall, ladderRub(rng), 0.9 + rng.float() * 0.15, 0.9 + rng.float() * 0.15, spot.along, 1.3 + rng.float() * 0.15);
        const lr = group.children[group.children.length - 1];
        if (lr && !lr.name) lr.name = 'ladder-rub';
      }
    }

    // The boiler shed its skin — rust flakes and scale scattered in
    // the drip line under tanks and manifolds.
    for (const p of spec.props) {
      if (p.kind !== 'boilerTank' && p.kind !== 'boilerDrum' && p.kind !== 'pipeManifold' && p.kind !== 'masonryHeater') continue;
      if (rng.float() >= 0.45) continue;
      const bf = decalQuad(boilerFlake(rng), 0.9 + rng.float() * 0.2, 0.9 + rng.float() * 0.2);
      bf.name = 'boiler-flake';
      bf.rotation.x = -Math.PI / 2;
      bf.rotation.z = rng.float() * Math.PI * 2;
      bf.position.set(p.x + (rng.float() - 0.5) * 0.3, 0.0088, p.z + (rng.float() - 0.5) * 0.3 + 0.4);
      group.add(bf);
    }

    // The frame knocked the wall — rub arcs and plaster chips behind
    // beds that bang the same wall every time they shift.
    for (const p of spec.props) {
      if (p.kind !== 'bed' && p.kind !== 'bedOld' && p.kind !== 'daybed' && p.kind !== 'bedBench') continue;
      if (rng.float() >= 0.4) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const wall: 'n' | 'e' | 'w' | 's' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = wall === 'e' || wall === 'w' ? p.z : p.x;
      wallDecal(wall, frameRattle(rng), 0.8 + rng.float() * 0.2, 0.8 + rng.float() * 0.2, along, 1.0 + rng.float() * 0.2);
      const fr = group.children[group.children.length - 1];
      if (fr && !fr.name) fr.name = 'frame-rattle';
    }

    // The wheels kept their ruts — twin tracks and a rest smudge
    // trailing out from chairs and gurneys that always roll the same way.
    for (const p of spec.props) {
      if (p.kind !== 'wheelchair' && p.kind !== 'gurney' && p.kind !== 'bookCart') continue;
      if (rng.float() >= 0.45) continue;
      const wr = decalQuad(wheelRuts(rng), 1.2 + rng.float() * 0.3, 1.2 + rng.float() * 0.3);
      wr.name = 'wheel-ruts';
      wr.rotation.x = -Math.PI / 2;
      wr.rotation.z = rng.float() * Math.PI * 2;
      wr.position.set(p.x + (rng.float() - 0.5) * 0.4, 0.009, p.z + (rng.float() - 0.5) * 0.4 + 0.5);
      group.add(wr);
    }

    // The plants died standing — shed-leaf rings and spilled soil
    // around pots and planters nobody watered.
    for (const p of spec.props) {
      if (p.kind !== 'plant' && p.kind !== 'planter') continue;
      if (rng.float() >= 0.5) continue;
      const pd = decalQuad(plantDeath(rng), 0.9 + rng.float() * 0.25, 0.9 + rng.float() * 0.25);
      pd.name = 'plant-death';
      pd.rotation.x = -Math.PI / 2;
      pd.rotation.z = rng.float() * Math.PI * 2;
      pd.position.set(p.x, 0.009, p.z);
      group.add(pd);
    }

    // The stools scraped arcs — pivot gouges and kick drags around
    // seats that get pulled and shoved.
    for (const p of spec.props) {
      if (p.kind !== 'stool' && p.kind !== 'bench') continue;
      if (rng.float() >= 0.45) continue;
      const sd = decalQuad(stoolDrag(rng), 1.0 + rng.float() * 0.2, 1.0 + rng.float() * 0.2);
      sd.name = 'stool-drag';
      sd.rotation.x = -Math.PI / 2;
      sd.rotation.z = rng.float() * Math.PI * 2;
      sd.position.set(p.x + (rng.float() - 0.5) * 0.3, 0.0086, p.z + (rng.float() - 0.5) * 0.3);
      group.add(sd);
    }

    // The ladder's feet — pad pits and drag scars under ladders
    // that stand and get climbed.
    for (const p of spec.props) {
      if (p.kind !== 'ladder' && p.kind !== 'libraryLadder') continue;
      if (rng.float() >= 0.45) continue;
      const lf = decalQuad(ladderFeet(rng), 0.9 + rng.float() * 0.15, 0.6 + rng.float() * 0.1);
      lf.name = 'ladder-feet';
      lf.rotation.x = -Math.PI / 2;
      lf.rotation.z = rng.float() * Math.PI * 2;
      lf.position.set(p.x + (rng.float() - 0.5) * 0.2, 0.0088, p.z + 0.35);
      group.add(lf);
    }

    // The vice's grit — filings and oil crescents fanned under the
    // work stations.
    for (const p of spec.props) {
      if (p.kind !== 'benchVice' && p.kind !== 'drillPress' && p.kind !== 'toolChest') continue;
      if (rng.float() >= 0.45) continue;
      const vg = decalQuad(viceGrit(rng), 1.0 + rng.float() * 0.25, 1.0 + rng.float() * 0.25);
      vg.name = 'vice-grit';
      vg.rotation.x = -Math.PI / 2;
      vg.rotation.z = rng.float() * Math.PI * 2;
      vg.position.set(p.x + (rng.float() - 0.5) * 0.3, 0.0088, p.z + (rng.float() - 0.5) * 0.3 + 0.3);
      group.add(vg);
    }

    // The barrel's rings — hoop rust and stave weeps under barrels
    // and fuel cans that sit and sweat.
    for (const p of spec.props) {
      if (p.kind !== 'barrel' && p.kind !== 'oilCan' && p.kind !== 'jerrycan' && p.kind !== 'jerrycanP') continue;
      if (rng.float() >= 0.4) continue;
      const brr = decalQuad(barrelRings(rng), 0.9 + rng.float() * 0.2, 0.9 + rng.float() * 0.2);
      brr.name = 'barrel-rings';
      brr.rotation.x = -Math.PI / 2;
      brr.rotation.z = rng.float() * Math.PI * 2;
      brr.position.set(p.x, 0.0088, p.z);
      group.add(brr);
    }

    // The landing wore a turn — heel arcs swept round the stair's
    // elbow where every climber pivots.
    for (const p of spec.props) {
      if (p.kind !== 'stairLanding' && p.kind !== 'stairs' && p.kind !== 'grandStair' && p.kind !== 'newelPost') continue;
      if (rng.float() >= 0.5) continue;
      const lw = decalQuad(landingWear(rng), 1.0 + rng.float() * 0.25, 1.0 + rng.float() * 0.25);
      lw.name = 'landing-wear';
      lw.rotation.x = -Math.PI / 2;
      lw.rotation.z = rng.float() * Math.PI * 2;
      const stairTop = (MODEL_FOR[p.kind]?.height ?? 0) > 0 ? (MODEL_FOR[p.kind]?.height ?? 2.9) - 0.24 : 0;
      lw.position.set(p.x + (rng.float() - 0.5) * 0.3, p.kind === 'stairLanding' ? (p.y ?? 0) + 0.02 : p.kind === 'newelPost' ? 0.0089 : (p.y ?? 0) + stairTop, p.z + (rng.float() - 0.5) * 0.3 + 0.4);
      group.add(lw);
    }

    // The cage shook its rust — flake falls and grip polish under
    // caged doors that get rattled.
    for (const p of spec.props) {
      if (p.kind !== 'recordsCage' && p.kind !== 'cageLocker') continue;
      if (rng.float() >= 0.5) continue;
      const cr = decalQuad(cageRattle(rng), 0.8 + rng.float() * 0.15, 0.55 + rng.float() * 0.1);
      cr.name = 'cage-rattle';
      cr.rotation.x = -Math.PI / 2;
      cr.rotation.z = rng.float() * Math.PI * 2;
      cr.position.set(p.x, 0.0088, p.z + 0.3);
      group.add(cr);
    }

    // The call button grubbed — a finger halo on the wall beside
    // the lifts and dumb-waiters.
    for (const p of spec.props) {
      if (p.kind !== 'liftDoors' && p.kind !== 'dumbWaiterDoor' && p.kind !== 'dumbwaiter' && p.kind !== 'freightLift' && p.kind !== 'liftShaft') continue;
      if (rng.float() >= 0.45) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const wall: 'n' | 'e' | 'w' | 's' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = wall === 'e' || wall === 'w' ? p.z + rng.range(-0.5, 0.5) : p.x + rng.range(-0.5, 0.5);
      wallDecal(wall, callGrub(rng), 0.45 + rng.float() * 0.1, 0.65 + rng.float() * 0.15, along, 1.4 + rng.float() * 0.1);
      const cg = group.children[group.children.length - 1];
      if (cg && !cg.name) cg.name = 'call-grub';
    }

    // The oche wore through — a toe-gouged line on the floor a
    // throwing-step out from every dartboard.
    for (const p of spec.props) {
      if (p.kind !== 'dartboard' || rng.float() >= 0.5) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const inx2 = md === dE ? -1 : md === dW ? 1 : 0;
      const inz2 = md === dN ? -1 : md === dS ? 1 : 0;
      const oc = decalQuad(ocheLine(rng), 1.4 + rng.float() * 0.2, 0.5 + rng.float() * 0.1);
      oc.name = 'oche-line';
      oc.rotation.x = -Math.PI / 2;
      oc.rotation.z = inx2 !== 0 ? Math.PI / 2 : 0;
      oc.position.set(p.x + inx2 * 0.75, 0.0092, p.z + inz2 * 0.75);
      group.add(oc);
    }

    // The printers coughed toner — grey scatter and jam streaks
    // under the machines.
    for (const p of spec.props) {
      if (p.kind !== 'printer' && p.kind !== 'printerRow') continue;
      if (rng.float() >= 0.5) continue;
      const td = decalQuad(tonerDrift(rng), 0.9 + rng.float() * 0.2, 0.9 + rng.float() * 0.2);
      td.name = 'toner-drift';
      td.rotation.x = -Math.PI / 2;
      td.rotation.z = rng.float() * Math.PI * 2;
      td.position.set(p.x + (rng.float() - 0.5) * 0.2, 0.0087, p.z + 0.35);
      group.add(td);
    }

    // The boots kept the mud — sole stamps and dried clods under
    // the boot rack and door gear.
    for (const p of spec.props) {
      if (p.kind !== 'rubberBoots' && p.kind !== 'gardenGloves' && p.kind !== 'luggageRack') continue;
      if (rng.float() >= 0.45) continue;
      const bp = decalQuad(bootPrints(rng), 0.9 + rng.float() * 0.2, 0.9 + rng.float() * 0.2);
      bp.name = 'boot-prints';
      bp.rotation.x = -Math.PI / 2;
      bp.rotation.z = rng.float() * Math.PI * 2;
      bp.position.set(p.x, 0.0088, p.z + 0.25);
      group.add(bp);
    }

    // The beams kept the dust — films and drifts on the joists no
    // hand ever reaches.
    for (const p of spec.props) {
      if (p.kind !== 'beamRun' || rng.float() >= 0.6) continue;
      const bd = decalQuad(beamDust(rng), 1.2 + rng.float() * 0.3, 0.4 + rng.float() * 0.1);
      bd.name = 'beam-dust';
      bd.rotation.x = Math.PI / 2;
      bd.rotation.z = rng.float() * Math.PI * 2;
      bd.position.set(p.x, h - 0.3 - rng.float() * 0.3, p.z + (rng.float() - 0.5) * 0.3);
      group.add(bd);
    }

    // The buckets dripped — damp rings where they stood, spatters
    // that missed, rust kisses.
    for (const p of spec.props) {
      if (p.kind !== 'bucket' || rng.float() >= 0.55) continue;
      const br = decalQuad(bucketRing(rng), 0.45 + rng.float() * 0.1, 0.45 + rng.float() * 0.1);
      br.name = 'bucket-ring';
      br.rotation.x = -Math.PI / 2;
      br.rotation.z = rng.float() * Math.PI * 2;
      br.position.set(p.x + (rng.float() - 0.5) * 0.1, 0.008, p.z + (rng.float() - 0.5) * 0.1);
      group.add(br);
    }

    // The hoses scuffed — drag arcs and chafe beside the wall
    // reels that fed the wash-down.
    for (const p of spec.props) {
      if (p.kind !== 'wallHose' || rng.float() >= 0.6) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const hw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = hw === 'e' || hw === 'w' ? p.z : p.x;
      wallDecal(hw, hoseScuff(rng), 0.8 + rng.float() * 0.2, 0.9 + rng.float() * 0.2, along, 1.4 + rng.float() * 0.3);
      const hs = group.children[group.children.length - 1];
      if (hs && !hs.name) hs.name = 'hose-scuff';
    }

    // The lockers kept the kicks — a scuffed band runs the floor
    // in front of every row where the doors took boots.
    if (isUnder) {
      const done = new Set<string>();
      for (const p of spec.props) {
        if (p.kind !== 'locker' && p.kind !== 'cageLocker') continue;
        const gx = Math.round(p.x), gz = Math.round(p.z);
        if (done.has(`${gx}:${gz}`)) continue;
        done.add(`${gx}:${gz}`);
        if (rng.float() >= 0.8) continue;
        const lk = decalQuad(lockerKick(rng), 1.5 + rng.float() * 0.5, 0.7);
        lk.name = 'locker-kick';
        lk.rotation.x = -Math.PI / 2;
        const yaw = p.yaw ?? 0;
        lk.rotation.z = yaw + (rng.float() - 0.5) * 0.15;
        // step off the wall face toward the room
        const ox = Math.sin(yaw) * 0.5, oz = Math.cos(yaw) * 0.5;
        lk.position.set(p.x + ox, 0.0085, p.z + oz);
        group.add(lk);
      }
    }

    // The pumps kept their seep — a drip line every sump leaves
    // walking toward the floor's lowest word.
    if (isUnder) {
      const drain = spec.props.find((p) => p.kind === 'grateDrain');
      for (const p of spec.props) {
        if (p.kind !== 'sumpPump' || rng.float() >= 0.75) continue;
        const ps = decalQuad(pumpSeep(rng), 1.1 + rng.float() * 0.3, 1.1 + rng.float() * 0.3);
        ps.name = 'pump-seep';
        ps.rotation.x = -Math.PI / 2;
        ps.rotation.z = drain ? Math.atan2(drain.x - p.x, drain.z - p.z) + Math.PI : rng.float() * Math.PI * 2;
        ps.position.set(p.x, 0.009, p.z);
        group.add(ps);
      }
    }

    // The mail kept drifting — envelope fans under every cart and
    // cubby that never finished the round.
    if (isUnder) {
      for (const p of spec.props) {
        if (p.kind !== 'mailCart' && p.kind !== 'stackShelf') continue;
        if (rng.float() >= 0.7) continue;
        const md = decalQuad(mailDrift(rng), 1.0 + rng.float() * 0.4, 1.0 + rng.float() * 0.4);
        md.name = 'mail-drift';
        md.rotation.x = -Math.PI / 2;
        md.rotation.z = rng.float() * Math.PI * 2;
        md.position.set(p.x + (rng.float() - 0.5) * 0.6, 0.008, p.z + (rng.float() - 0.5) * 0.6);
        group.add(md);
      }
    }

    // The drum kept blowing back — soot fans blow sideways off the
    // burn room's mouth, the scorched signature of a cheap fire.
    if (isUnder) {
      for (const p of spec.props) {
        if (p.kind !== 'boilerDrum' || rng.float() >= 0.85) continue;
        const sf = decalQuad(sootFan(rng), 1.4 + rng.float() * 0.4, 1.4 + rng.float() * 0.4);
        sf.name = 'soot-fan';
        sf.rotation.x = -Math.PI / 2;
        sf.rotation.z = rng.float() * Math.PI * 2;
        sf.position.set(p.x + (rng.float() - 0.5) * 0.4, 0.0092, p.z + (rng.float() - 0.5) * 0.4);
        group.add(sf);
      }
    }

    // The panels kept the count — chalk tallies beside every box
    // that died often enough to earn one.
    if (isUnder) {
      for (const p of spec.props) {
        if (p.kind !== 'breakerPanel' && p.kind !== 'powerBox' && p.kind !== 'utilityBox') continue;
        if (rng.float() >= 0.7) continue;
        // tally rides the wall just beside the panel's face
        const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
        const md2 = Math.min(dE, dW, dN, dS);
        const hw: 'n' | 's' | 'e' | 'w' = md2 === dE ? 'e' : md2 === dW ? 'w' : md2 === dN ? 'n' : 's';
        const along = (hw === 'e' || hw === 'w' ? p.z : p.x) + (rng.float() < 0.5 ? -0.55 : 0.55);
        wallDecal(hw, fuseTally(rng), 0.5 + rng.float() * 0.15, 0.5 + rng.float() * 0.15, along, (p.y ?? 1.0) + 0.15);
        const ft = group.children[group.children.length - 1];
        if (ft && !ft.name) ft.name = 'fuse-tally';
      }
    }

    // The hatches kept the grease — smears under every dumbwaiter
    // lip where the cable and thumbs ran.
    if (isUnder) {
      for (const p of spec.props) {
        if (p.kind !== 'dumbwaiter' && p.kind !== 'dumbWaiterDoor') continue;
        if (rng.float() >= 0.8) continue;
        const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
        const md2 = Math.min(dE, dW, dN, dS);
        const hw: 'n' | 's' | 'e' | 'w' = md2 === dE ? 'e' : md2 === dW ? 'w' : md2 === dN ? 'n' : 's';
        const along = hw === 'e' || hw === 'w' ? p.z : p.x;
        wallDecal(hw, hatchGrease(rng), 0.45 + rng.float() * 0.1, 0.85 + rng.float() * 0.2, along, (p.y ?? 0.9) - 0.35);
        const hg = group.children[group.children.length - 1];
        if (hg && !hg.name) hg.name = 'hatch-grease';
      }
    }

    // The bunk kept the boots — paired prints that paced the nook
    // and stopped. Nobody swept the under floors.
    if (isUnder) {
      for (const p of spec.props) {
        if (p.kind !== 'bed' && p.kind !== 'bedOld' && p.kind !== 'daybed') continue;
        if (rng.float() >= 0.75) continue;
        const bb = decalQuad(bunkBoots(rng), 1.2 + rng.float() * 0.4, 1.2 + rng.float() * 0.4);
        bb.name = 'bunk-boots';
        bb.rotation.x = -Math.PI / 2;
        bb.rotation.z = rng.float() * Math.PI * 2;
        bb.position.set(p.x + (rng.float() - 0.5) * 0.8, 0.0082, p.z + (rng.float() - 0.5) * 0.8);
        group.add(bb);
      }
    }

    // The racks kept the shadows — peg silhouettes and a reach-shine
    // where a hundred hands took the same tools down.
    if (isUnder) {
      const seen = new Set<string>();
      for (const p of spec.props) {
        if (p.kind !== 'rack' && p.kind !== 'toolChest' && p.kind !== 'stackShelf') continue;
        const gx = Math.round(p.x * 2), gz = Math.round(p.z * 2);
        if (seen.has(`${gx}:${gz}`)) continue;
        seen.add(`${gx}:${gz}`);
        if (rng.float() >= 0.65) continue;
        const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
        const md2 = Math.min(dE, dW, dN, dS);
        const hw: 'n' | 's' | 'e' | 'w' = md2 === dE ? 'e' : md2 === dW ? 'w' : md2 === dN ? 'n' : 's';
        const along = hw === 'e' || hw === 'w' ? p.z : p.x;
        wallDecal(hw, hookShadow(rng), 1.2 + rng.float() * 0.3, 0.8 + rng.float() * 0.15, along, 1.35 + rng.float() * 0.2);
        const hs = group.children[group.children.length - 1];
        if (hs && !hs.name) hs.name = 'hook-shadow';
      }
    }

    // The freight kept the drag — a polished path where the chain
    // ran its length out, link kisses and a rust tail.
    if (isUnder) {
      for (const p of spec.props) {
        if (p.kind !== 'chainFence' && p.kind !== 'handTruck' && p.kind !== 'overheadCrane') continue;
        if (rng.float() >= 0.7) continue;
        const cd = decalQuad(chainDrag(rng), 1.6 + rng.float() * 0.5, 1.0 + rng.float() * 0.25);
        cd.name = 'chain-drag';
        cd.rotation.x = -Math.PI / 2;
        cd.rotation.z = rng.float() * Math.PI * 2;
        cd.position.set(p.x + (rng.float() - 0.5) * 0.7, 0.0088, p.z + (rng.float() - 0.5) * 0.7);
        group.add(cd);
      }
    }

    // The ceiling kept the leak — mineral rings where water pooled
    // overhead in wet bones before it found the floor.
    const wetCeil = spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder
      || spec.props.some((p) => p.kind === 'basinSink' || p.kind === 'puddle' || p.kind === 'washStand');
    if (wetCeil && rng.float() < 0.4) {
      const cr = decalQuad(ceilingRing(rng), 1.3 + rng.float() * 0.5, 1.1 + rng.float() * 0.4);
      cr.name = 'ceiling-ring';
      cr.rotation.x = Math.PI / 2;
      cr.rotation.z = rng.float() * Math.PI * 2;
      cr.position.set((rng.float() - 0.5) * (w - 3), h - 0.056, (rng.float() - 0.5) * (d - 3));
      group.add(cr);
    }

    // The ceiling kept the settling — a vein with tributaries where
    // the house moved and the plaster wrote it down.
    if (rng.float() < 0.3) {
      const pv = decalQuad(plasterVein(rng), 1.5 + rng.float() * 0.6, 1.2 + rng.float() * 0.4);
      pv.name = 'plaster-vein';
      pv.rotation.x = Math.PI / 2;
      pv.rotation.z = rng.float() * Math.PI * 2;
      pv.position.set((rng.float() - 0.5) * (w - 3), h - 0.056, (rng.float() - 0.5) * (d - 3));
      group.add(pv);
    }

    // The ceiling kept the ring — a pale ghost where a shade hung
    // before the house took the fixture back.
    if (livedIn && rng.float() < 0.22) {
      const pg = decalQuad(pendantGhost(rng), 0.6 + rng.float() * 0.2, 0.6 + rng.float() * 0.2);
      pg.name = 'pendant-ghost';
      pg.rotation.x = Math.PI / 2;
      pg.rotation.z = rng.float() * Math.PI * 2;
      pg.position.set((rng.float() - 0.5) * (w - 2.4), h - 0.056, (rng.float() - 0.5) * (d - 2.4));
      group.add(pg);
    }

    // The lamps wrote their soot — a smoke halo on the ceiling
    // over every burning fixture that kept its post.
    for (const p of spec.props) {
      if (p.kind !== 'chainBulb' && p.kind !== 'cageLight' && p.kind !== 'fluoroTube') continue;
      if (rng.float() >= 0.6) continue;
      const fs = decalQuad(fixtureSoot(rng), 0.8 + rng.float() * 0.3, 0.8 + rng.float() * 0.3);
      fs.name = 'fixture-soot';
      fs.rotation.x = Math.PI / 2;
      fs.rotation.z = rng.float() * Math.PI * 2;
      fs.position.set(p.x, h - 0.056, p.z);
      group.add(fs);
    }

    // The tiles kept the sag — grid ghosts and one drunk panel
    // in the service ceilings that drank a leak.
    if (!livedIn && rng.float() < 0.3) {
      const ts = decalQuad(tileSag(rng), 1.6 + rng.float() * 0.5, 1.6 + rng.float() * 0.5);
      ts.name = 'tile-sag';
      ts.rotation.x = Math.PI / 2;
      ts.rotation.z = rng.float() * Math.PI * 2;
      ts.position.set((rng.float() - 0.5) * (w - 3), h - 0.057, (rng.float() - 0.5) * (d - 3));
      group.add(ts);
    }

    // The seam kept the dust — a grey ledge where the wall hands
    // the ceiling its dirt, combed by the draft.
    if (rng.float() < 0.35) {
      const spot = pickWallSpot(1.6);
      if (spot) {
        wallDecal(spot.wall, corniceLine(rng), 1.5 + rng.float() * 0.5, 0.45, spot.along, h - 0.3);
        const cl = group.children[group.children.length - 1];
        if (cl && !cl.name) cl.name = 'cornice-line';
      }
    }

    // The ceiling kept the bloom — a broad damp spread that outgrew
    // its ring, mould freckles seeding the wet.
    if (!livedIn && rng.float() < 0.3) {
      const as = decalQuad(atticStain(rng), 1.5 + rng.float() * 0.6, 1.4 + rng.float() * 0.5);
      as.name = 'attic-stain';
      as.rotation.x = Math.PI / 2;
      as.rotation.z = rng.float() * Math.PI * 2;
      as.position.set((rng.float() - 0.5) * (w - 2.6), h - 0.058, (rng.float() - 0.5) * (d - 2.6));
      group.add(as);
    }

    // The paint kept letting go — curled tongues and the scars they
    // left where the ceiling shed its skin.
    if (livedIn && rng.float() < 0.28) {
      const pf = decalQuad(paintFlake(rng), 1.3 + rng.float() * 0.5, 1.3 + rng.float() * 0.5);
      pf.name = 'paint-flake';
      pf.rotation.x = Math.PI / 2;
      pf.rotation.z = rng.float() * Math.PI * 2;
      pf.position.set((rng.float() - 0.5) * (w - 3), h - 0.059, (rng.float() - 0.5) * (d - 3));
      group.add(pf);
    }

    // The wall kept the heat — a brown halo and convection streaks
    // over every radiator that burned through the winters.
    for (const p of spec.props) {
      if (p.kind !== 'radiatorFin' && p.kind !== 'radiatorTall' && p.kind !== 'masonryHeater' && p.kind !== 'boilerDrum' && p.kind !== 'boilerTank') continue;
      if (rng.float() >= 0.7) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md2 = Math.min(dE, dW, dN, dS);
      const hw: 'n' | 's' | 'e' | 'w' = md2 === dE ? 'e' : md2 === dW ? 'w' : md2 === dN ? 'n' : 's';
      const along = hw === 'e' || hw === 'w' ? p.z : p.x;
      wallDecal(hw, heaterGhost(rng), 1.4 + rng.float() * 0.3, 0.9 + rng.float() * 0.2, along, 1.5 + rng.float() * 0.2);
      const hg = group.children[group.children.length - 1];
      if (hg && !hg.name) hg.name = 'heater-ghost';
    }

    // The halls kept their lamps — sconce arms marching the corridor,
    // alternating walls the way the porters wired them. Emissive
    // bulbs only; the pool of thrown light is faked with a wall decal.
    if (spec.biome === 'corridor' && d > w * 1.15 && !isUnder) {
      const step = 2.6 + rng.float() * 0.6;
      const count = Math.max(1, Math.floor((d - 1.2) / step));
      let side = rng.bool(0.5) ? 1 : -1;
      for (let i = 0; i < count; i++) {
        const sz = -d / 2 + (i + 0.5) * ((d - 1.2) / count) + 0.6;
        const sx = side * (w / 2 - 0.05);
        const py = 1.9 + rng.float() * 0.15;
        // arm out from the wall
        const arm = new THREE.Mesh(texBox(0.05, 0.05, 0.14), MAT.brass());
        arm.name = 'corridor-sconce';
        arm.position.set(sx - side * 0.06, py, sz);
        group.add(arm);
        frameHardware.push(arm);
        // shade cone, mouth down
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.11, 8, 1, true), MAT.brass());
        shade.name = 'sconce-shade';
        shade.position.set(sx - side * 0.13, py + 0.06, sz);
        group.add(shade);
        frameHardware.push(shade);
        // bulb — warm emissive, sometimes dead
        const lit = rng.float() < 0.7;
        const bMat = new THREE.MeshStandardMaterial({
          color: 0x1a1208, emissive: lit ? 0xd8a050 : 0x202028,
          emissiveIntensity: lit ? 0.9 : 0.2, roughness: 0.6, metalness: 0,
        });
        bMat.userData.decalMat = true;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bMat);
        bulb.name = lit ? 'sconce-bulb-lit' : 'sconce-bulb';
        bulb.position.set(sx - side * 0.13, py + 0.02, sz);
        group.add(bulb);
        frameHardware.push(bulb);
        // the thrown pool on the plaster beneath
        if (lit && rng.float() < 0.8) {
          wallDecal(side === 1 ? 'e' : 'w', sconcePool(rng), 0.7, 0.9, sz, py - 0.45);
          const wl2 = group.children[group.children.length - 1];
          if (wl2 && !wl2.name) wl2.name = 'sconce-pool';
        }
        side = -side;
      }
    }

    // The wet walls wore their aprons — a tiled splash band behind
    // sinks, stands and drains; grout ghosted on, a tile or two lost.
    const WET_KINDS = new Set(['basinSink', 'washStand', 'grateDrain', 'washer']);
    for (const p of spec.props) {
      if (!WET_KINDS.has(p.kind) || rng.float() >= 0.6) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const md = Math.min(dE, dW, dN, dS);
      const hw: 'n' | 's' | 'e' | 'w' = md === dE ? 'e' : md === dW ? 'w' : md === dN ? 'n' : 's';
      const along = hw === 'e' || hw === 'w' ? p.z : p.x;
      const aw = 1.5 + rng.float() * 0.4;
      if (portOffsetsOn(hw).some((o) => Math.abs(along - o) < aw / 2 + 0.9)) continue;
      const ah = 1.35 + rng.float() * 0.25;
      const ap = new THREE.Mesh(texBox(aw, ah, 0.018), TEX.tilesSubway());
      ap.name = 'tile-apron';
      if (hw === 'e') ap.position.set(w / 2 - 0.016, ah / 2 + 0.35, along);
      else if (hw === 'w') ap.position.set(-w / 2 + 0.016, ah / 2 + 0.35, along);
      else if (hw === 'n') ap.position.set(along, ah / 2 + 0.35, d / 2 - 0.012);
      else ap.position.set(along, ah / 2 + 0.35, -d / 2 + 0.016);
      group.add(ap);
      frameHardware.push(ap);
      // grout ghosting across the band
      if (rng.float() < 0.7) {
        wallDecal(hw, groutLines(rng), aw * 0.92, ah * 0.85, along, ah / 2 + 0.35);
        const gl2 = group.children[group.children.length - 1];
        if (gl2 && !gl2.name) gl2.name = 'apron-grout';
      }
      // a missing tile or two — the plaster darks behind the loss
      if (rng.float() < 0.45) {
        const chip = new THREE.Mesh(texBox(0.09, 0.09, 0.006), MAT.darkOak());
        chip.name = 'tile-chip';
        const cx = along + (rng.float() - 0.5) * aw * 0.7;
        const cy = 0.5 + rng.float() * 0.8;
        if (hw === 'e') chip.position.set(w / 2 - 0.004, cy, cx);
        else if (hw === 'w') chip.position.set(-w / 2 + 0.004, cy, cx);
        else if (hw === 'n') chip.position.set(cx, cy, d / 2 - 0.004);
        else chip.position.set(cx, cy, -d / 2 + 0.004);
        group.add(chip);
        frameHardware.push(chip);
      }
    }

    // The veins ran the skirting — supply pipes hugging the wall in
    // rooms that carry heat or service kit: a horizontal run with
    // clamps, a riser at one end, sometimes a valve wheel. Segments
    // stop short of any door opening.
    {
      const HEAT = new Set(['radiatorFin', 'radiatorTall', 'masonryHeater', 'stove', 'stoveRange', 'boilerDrum', 'boilerTank', 'fireplace']);
      const heated = spec.props.some((p) => HEAT.has(p.kind)) || spec.biome === 'maintenance' || isUnder;
      if (heated && rng.float() < 0.65) {
        const pipeMat = isUnder || spec.biome === 'maintenance' ? MAT.steelDark() : MAT.brass();
        // pick a wall, then cut its span into segments clear of ports
        const walls = (['n', 's', 'e', 'w'] as const);
        const wall = walls[Math.floor(rng.float() * 4)];
        const span = (wall === 'e' || wall === 'w' ? d : w) - 0.5;
        const offs = portOffsetsOn(wall);
        // forbidden zones: port offset ±(leaf width + margin)
        const segs: [number, number][] = [[-span / 2, span / 2]];
        for (const o of offs) {
          for (let i = segs.length - 1; i >= 0; i--) {
            const [a, b] = segs[i];
            if (o - 1.0 < b && o + 1.0 > a) {
              segs.splice(i, 1);
              if (o - 1.0 - a > 0.7) segs.push([a, o - 1.0]);
              if (b - o - 1.0 > 0.7) segs.push([o + 1.0, b]);
            }
          }
        }
        const pipeY = 0.16 + rng.float() * 0.08;
        const pipeR = 0.018 + rng.float() * 0.012;
        for (const [a, b] of segs) {
          const len = b - a;
          const mid = (a + b) / 2;
          const run = new THREE.Mesh(new THREE.CylinderGeometry(pipeR, pipeR, len, 8), pipeMat);
          run.name = 'pipe-run';
          if (wall === 'e' || wall === 'w') {
            run.rotation.x = Math.PI / 2;
            run.position.set((wall === 'e' ? w / 2 : -w / 2) - Math.sign(wall === 'e' ? 1 : -1) * 0.07, pipeY, mid);
          } else {
            run.rotation.z = Math.PI / 2;
            run.position.set(mid, pipeY, (wall === 'n' ? d / 2 : -d / 2) - Math.sign(wall === 'n' ? 1 : -1) * 0.07);
          }
          group.add(run);
          frameHardware.push(run);
          // clamps pinning the run to the plaster
          const nClamps = Math.max(1, Math.floor(len / 1.3));
          for (let c = 0; c < nClamps; c++) {
            const t = a + (c + 0.5) * (len / nClamps);
            const cl = new THREE.Mesh(texBox(0.05, 0.05, 0.03), pipeMat);
            cl.name = 'pipe-clamp';
            if (wall === 'e' || wall === 'w') cl.position.set(run.position.x - (wall === 'e' ? 0.035 : -0.035), pipeY, t);
            else cl.position.set(t, pipeY, run.position.z - (wall === 'n' ? 0.035 : -0.035));
            group.add(cl);
            frameHardware.push(cl);
          }
          // riser at one end — the run turns down and drops to the floor
          if (rng.float() < 0.55) {
            const end = rng.bool(0.5) ? a : b;
            const riser = new THREE.Mesh(new THREE.CylinderGeometry(pipeR, pipeR, pipeY + 0.04, 8), pipeMat);
            riser.name = 'pipe-riser';
            if (wall === 'e' || wall === 'w') riser.position.set(run.position.x, pipeY / 2 - 0.01, end);
            else riser.position.set(end, pipeY / 2 - 0.01, run.position.z);
            group.add(riser);
            frameHardware.push(riser);
          }
          // a wheel the night porter could still turn
          if (rng.float() < 0.3) {
            const vx = wall === 'e' || wall === 'w' ? run.position.x : mid + (rng.float() - 0.5) * len * 0.6;
            const vz = wall === 'e' || wall === 'w' ? mid + (rng.float() - 0.5) * len * 0.6 : run.position.z;
            const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 12), pipeMat);
            wheel.name = 'pipe-valve';
            if (wall === 'e' || wall === 'w') { wheel.rotation.y = Math.PI / 2; wheel.position.set(vx - (wall === 'e' ? 0.05 : -0.05), pipeY, vz); }
            else { wheel.position.set(vx, pipeY, vz - (wall === 'n' ? 0.05 : -0.05)); }
            group.add(wheel);
            frameHardware.push(wheel);
          }
        }
      }
    }

    // The ceiling carried its mains — parallel conduit runs overhead
    // in the service bones, hung on straps, broken by junction boxes.
    if ((isUnder || spec.biome === 'maintenance') && rng.float() < 0.6) {
      const pipeMat = MAT.steelDark();
      const axis = rng.bool(0.5) ? 'x' : 'z';
      const runLen = (axis === 'x' ? w : d) - 0.6;
      const lanes = 1 + Math.floor(rng.float() * 2.4); // 1-3 parallel runs
      for (let lane = 0; lane < lanes; lane++) {
        const off = (lane - (lanes - 1) / 2) * 0.22 + (rng.float() - 0.5) * 0.3;
        const py = h - 0.12 - lane * 0.02;
        const run = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, runLen, 8), pipeMat);
        run.name = 'ceiling-main';
        if (axis === 'x') { run.rotation.z = Math.PI / 2; run.position.set(0, py, off); }
        else { run.rotation.x = Math.PI / 2; run.position.set(off, py, 0); }
        group.add(run);
        frameHardware.push(run);
        // hanger straps every ~1.4m reaching the slab
        const nH = Math.max(1, Math.floor(runLen / 1.4));
        for (let c = 0; c < nH; c++) {
          const t = -runLen / 2 + (c + 0.5) * (runLen / nH);
          const hg2 = new THREE.Mesh(texBox(0.035, 0.09, 0.035), pipeMat);
          hg2.name = 'main-hanger';
          if (axis === 'x') hg2.position.set(t, py + 0.045, off);
          else hg2.position.set(off, py + 0.045, t);
          group.add(hg2);
          frameHardware.push(hg2);
        }
      }
      // junction box where a feed splits — conduit stubs branch off it
      if (rng.float() < 0.5) {
        const jb = new THREE.Mesh(texBox(0.22, 0.12, 0.22), pipeMat);
        jb.name = 'main-junction';
        const jx = axis === 'x' ? (rng.float() - 0.5) * runLen * 0.4 : 0;
        const jz = axis === 'x' ? 0 : (rng.float() - 0.5) * runLen * 0.4;
        jb.position.set(jx, h - 0.1, jz);
        group.add(jb);
        frameHardware.push(jb);
        // a stub crossing the room the other way
        const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, (axis === 'x' ? d : w) * 0.4, 8), pipeMat);
        stub.name = 'main-stub';
        if (axis === 'x') { stub.rotation.x = Math.PI / 2; stub.position.set(jx, h - 0.13, jz + (rng.bool() ? 0.1 : -0.1)); }
        else { stub.rotation.z = Math.PI / 2; stub.position.set(jx + (rng.bool() ? 0.1 : -0.1), h - 0.13, jz); }
        group.add(stub);
        frameHardware.push(stub);
      }
    }

    // The water line — a room that flooded once keeps the tide mark:
    // sediment band and a sharp top edge at baseboard height.
    const wetRoom = spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder
      || spec.props.some((p) => p.kind === 'basinSink' || p.kind === 'puddle');
    if (wetRoom && rng.float() < 0.5) {
      const spot = pickWallSpot(2.0);
      if (spot) {
        wallDecal(spot.wall, waterline(rng), 1.8 + rng.float() * 0.6, 0.55 + rng.float() * 0.15, spot.along, 0.3 + rng.float() * 0.14);
        const wl = group.children[group.children.length - 1];
        if (wl && !wl.name) wl.name = 'waterline';
      }
    }

    // The count chalked a body — where someone was found, the
    // outline stayed. Maintenance bones and the under rooms only.
    if ((spec.biome === 'maintenance' || spec.biome === 'unlit' || isUnder) && rng.float() < 0.22) {
      const bo = decalQuad(bodyOutline(rng), 1.0, 1.7);
      bo.name = 'body-outline';
      bo.rotation.x = -Math.PI / 2;
      bo.rotation.z = rng.float() * Math.PI * 2;
      bo.position.set((rng.float() - 0.5) * (w - 2.2), 0.0095, (rng.float() - 0.5) * (d - 2.2));
      group.add(bo);
    }

    // The wall kept the fist — somewhere a blow landed at striking
    // height: the knuckle ring, the plaster bulge, the cracks.
    if (doorPositions.length > 0 && rng.float() < 0.35) {
      const port = doorPositions[Math.floor(rng.float() * doorPositions.length)];
      const lp2 = portLocalPos(port, w, d);
      const along = port.wall === 'e' || port.wall === 'w' ? lp2.z : lp2.x;
      wallDecal(port.wall, fistMark(rng), 0.62 + rng.float() * 0.14, 0.62 + rng.float() * 0.14,
        along + (rng.float() < 0.5 ? -1 : 1) * (0.85 + rng.float() * 0.5),
        1.4 + rng.float() * 0.3);
      const fm = group.children[group.children.length - 1];
      if (fm && !fm.name) fm.name = 'fist-mark';
    }

    // The inspector's tally — beside a hollow's seat, scratch-counts kept
    // on the nearest wall: four strokes and the crossing fifth, counting
    // the times it was checked.
    for (const spot of room.hidingSpots) {
      if (!spot.trappedBy || rng.float() >= 0.6) continue;
      const sx = (spot.volume.minX + spot.volume.maxX) / 2 - room.origin.x;
      const sz = (spot.volume.minZ + spot.volume.maxZ) / 2 - room.origin.z;
      const tc = Math.cos(-room.yaw), ts = Math.sin(-room.yaw);
      const hx = sx * tc + sz * ts, hz = -sx * ts + sz * tc;
      // nearest wall gets the count
      const dists = [
        { wall: 'e' as const, dist: w / 2 - hx, along: hz },
        { wall: 'w' as const, dist: hx + w / 2, along: hz },
        { wall: 'n' as const, dist: d / 2 - hz, along: hx },
        { wall: 's' as const, dist: hz + d / 2, along: hx },
      ].sort((a, b) => a.dist - b.dist);
      const near = dists[0];
      const span = (near.wall === 'e' || near.wall === 'w' ? d : w) / 2 - 0.5;
      const along = Math.max(-span, Math.min(span, near.along + (rng.float() - 0.5) * 0.4));
      wallDecal(near.wall, tallyMarks(rng), 0.45 + rng.float() * 0.15, 0.45 + rng.float() * 0.15, along, 0.85 + rng.float() * 0.45);
      const last = group.children[group.children.length - 1];
      if (last && !last.name) last.name = 'inspector-tally';
    }

    // The drip keeps time — under cable runs and pipework the floor
    // carries what the line has been feeding it: a wet ring, splash edge,
    // dark core. Only where the run above is already dressed.
    for (const p of spec.props) {
      if (p.kind !== 'hangingCable' && p.kind !== 'conduitRun' && p.kind !== 'indPipes' && p.kind !== 'ductRun' && p.kind !== 'ductCirc' && p.kind !== 'ductRect') continue;
      if (rng.float() >= 0.4) continue;
      if (footprintInDoorLane(spec, p.x, p.z, 0.4, 0.4)) continue;
      const m = decalQuad(dampSpot(rng), 0.5 + rng.float() * 0.3, 0.5 + rng.float() * 0.3);
      m.name = 'drip-keeps-time';
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rng.float() * Math.PI;
      m.position.set(p.x + (rng.float() - 0.5) * 0.4, 0.0072, p.z + (rng.float() - 0.5) * 0.4);
      group.add(m);
    }

    // The route reads — feet wear a lane where they always walk it: a
    // pale traffic strip from the door you came in to the one you leave.
    if (['corridor', 'lobby'].includes(spec.biome) && spec.exits.length > 0 && rng.float() < 0.4) {
      const a = portLocalPos(spec.entry, w, d);
      const b = portLocalPos(spec.exits[0], w, d);
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) - 1.4;
      if (len > 1.2) {
        const ux = dx / (len + 1.4), uz = dz / (len + 1.4);
        const m = decalQuad(wornLane(rng), 0.8 + rng.float() * 0.3, len);
        m.name = 'worn-lane';
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = Math.atan2(ux, uz);
        m.position.set((a.x + b.x) / 2, 0.0064, (a.z + b.z) / 2);
        group.add(m);
      }
    }

    // The fan sheds — dust rings under ceiling fans and vents, what the
    // blades threw off settling in a halo at the drop point.
    for (const p of spec.props) {
      if (p.kind !== 'ceilingFan' && p.kind !== 'vent') continue;
      if (rng.float() >= 0.5) continue;
      if (footprintInDoorLane(spec, p.x, p.z, 0.45, 0.45)) continue;
      const m = decalQuad(dustFall(rng), 0.9 + rng.float() * 0.4, 0.9 + rng.float() * 0.4);
      m.name = 'fan-sheds';
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rng.float() * Math.PI;
      m.position.set(p.x + (rng.float() - 0.5) * 0.2, 0.0066, p.z + (rng.float() - 0.5) * 0.2);
      group.add(m);
    }

    // The wall kept the hooks — a row of nail holes and sag shadows
    // where the coat rail hung, one ripped out of the plaster.
    if (['lobby', 'corridor', 'guest'].includes(spec.biome) && rng.float() < 0.3) {
      const dw = 0.8 + rng.float() * 0.5;
      const spot = pickWallSpot(dw);
      if (spot) {
        wallDecal(spot.wall, nailRow(rng), dw, dw * 0.6, spot.along, 1.6 + rng.float() * 0.25);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'nail-row';
      }
    }

    // The register — a pinned ledger page: neat early signatures that
    // degrade to scrawl, margin tallies in red.
    if (['lobby', 'guest', 'records'].includes(spec.biome) && rng.float() < 0.35) {
      const spot = pickWallSpot(0.6);
      if (spot) {
        wallDecal(spot.wall, registerPage(rng), 0.55, 0.72, spot.along, 1.55 + rng.float() * 0.2);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'register-page';
      }
    }

    // The eviction slip — the notice that dispossesses you, letterhead
    // intact, name field still dotted. Guest/lobby doors deserve it.
    const evictionP = ({ guest: 0.4, lobby: 0.3, records: 0.2, corridor: 0.12 } as Record<string, number>)[spec.biome] ?? 0;
    if (rng.float() < evictionP) {
      const spot = pickWallSpot(0.6);
      if (spot) {
        wallDecal(spot.wall, evictionSlip(rng), 0.5, 0.7, spot.along, 1.5 + rng.float() * 0.2);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'eviction-slip';
      }
    }

    // The repair ticket — torn stubs the maintenance wing keeps filing:
    // stamped job number, ticked boxes, a verdict in red.
    const ticketP = ({ maintenance: 0.45, unlit: 0.3, underscript: 0.2, corridor: 0.1 } as Record<string, number>)[spec.biome] ?? 0;
    if (rng.float() < ticketP) {
      const spot = pickWallSpot(0.55);
      if (spot) {
        wallDecal(spot.wall, repairTicket(rng), 0.5, 0.5, spot.along, 1.45 + rng.float() * 0.25);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'repair-ticket';
      }
    }

    // The photo strip — four frames pinned askew in the rooms that once
    // held people: a face that washes out exposure by exposure.
    const stripP = ({ guest: 0.3, lobby: 0.15, records: 0.12 } as Record<string, number>)[spec.biome] ?? 0;
    if (rng.float() < stripP) {
      const spot = pickWallSpot(0.4);
      if (spot) {
        wallDecal(spot.wall, photoStrip(rng), 0.24, 0.66, spot.along, 1.6 + rng.float() * 0.15);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'photo-strip';
      }
    }

    // The things they left — dropped belongings on the floorboards:
    // a glove slid off mid-flight, a pen that broke its ink, spectacles
    // cracked where the owner stopped wearing them.
    const leftP = ({ guest: 0.3, lobby: 0.28, records: 0.22, safe: 0.15, corridor: 0.1 } as Record<string, number>)[spec.biome] ?? 0;
    if (rng.float() < leftP) {
      const picks: [(r: import('../engine/rng').Rng) => THREE.Texture | null, number, string][] = [
        [droppedGlove, 0.45, 'left-glove'],
        [inkSpill, 0.45, 'left-pen'],
        [fallenSpecs, 0.45, 'left-specs'],
      ];
      const [tex, size, name] = picks[Math.floor(rng.float() * picks.length)];
      // belongings drop in open floor — not under the furniture where
      // nobody (and nothing) would ever find them
      for (let tries = 0; tries < 3; tries++) {
        const lx = (rng.float() - 0.5) * (w - 1.8), lz = (rng.float() - 0.5) * (d - 1.8);
        const buried = spec.props.some((p) => {
          const c = modelCollider(p.kind);
          const pr = (c ? Math.max(c[0], c[2]) : 0.5) / 2 + size / 2;
          return Math.hypot(p.x - lx, p.z - lz) < pr;
        });
        if (buried) continue;
        const m = decalQuad(tex(rng), size, size);
        m.name = name;
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = rng.float() * Math.PI * 2;
        m.position.set(lx, 0.008, lz);
        group.add(m);
        break;
      }
    }

    // The map nobody trusts — a framed route plan under old glass; the
    // red dot insists you are somewhere you are not.
    if (['lobby', 'corridor', 'safe'].includes(spec.biome) && rng.float() < 0.35) {
      const spot = pickWallSpot(0.9);
      if (spot) {
        wallDecal(spot.wall, oldMap(rng), 0.9, 0.68, spot.along, 1.7 + rng.float() * 0.15);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'old-map';
      }
    }

    // The wall was opened — a wiring-chase patch, re-plastered: pale
    // rectangle inside a hairline border crack.
    if (['maintenance', 'records', 'corridor'].includes(spec.biome) && rng.float() < 0.3) {
      const dw = 0.5 + rng.float() * 0.3;
      const spot = pickWallSpot(dw);
      if (spot) {
        wallDecal(spot.wall, chasePatch(rng), dw, dw * (1.5 + rng.float() * 0.6), spot.along, 1.4 + rng.float() * 0.4);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'chase-patch';
      }
    }

    // The mouth it eats from — a chewed arch at the baseboard, crumbs
    // scattered: something small lives in these walls.
    if (['corridor', 'guest', 'lobby', 'records', 'maintenance'].includes(spec.biome) && rng.float() < 0.3) {
      const dw = 0.35 + rng.float() * 0.2;
      const spot = pickWallSpot(dw);
      if (spot) {
        wallDecal(spot.wall, mouseHole(rng), dw, dw, spot.along, dw * 0.5);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'mouse-hole';
      }
    }

    // The inspection stamp — a faded ink seal beside the frame, the
    // house's last clean bill of health. Records and the service bones.
    if (['records', 'maintenance', 'lobby'].includes(spec.biome) && rng.float() < 0.35) {
      const port = spec.exits.length > 0 ? spec.exits[Math.floor(rng.float() * spec.exits.length)] : spec.entry;
      const side = rng.bool() ? 1 : -1;
      const span = (port.wall === 'e' || port.wall === 'w' ? d : w) / 2 - 0.4;
      const sDw = 0.3 + rng.float() * 0.12;
      let off = Math.max(-span, Math.min(span, port.offset + side * (port.width / 2 + 0.35)));
      if (tallCoverOn(port.wall, off, sDw)) {
        off = Math.max(-span, Math.min(span, port.offset - side * (port.width / 2 + 0.35)));
      }
      if (!tallCoverOn(port.wall, off, sDw)) {
        const m2 = decalQuad(inspectionStamp(rng), sDw, 0.3 + rng.float() * 0.12);
        m2.name = 'inspection-stamp';
        if (port.wall === 'e') { m2.rotation.y = -Math.PI / 2; m2.position.set(w / 2 - 0.013, 1.35 + rng.float() * 0.5, off); }
        else if (port.wall === 'w') { m2.rotation.y = Math.PI / 2; m2.position.set(-w / 2 + 0.013, 1.35 + rng.float() * 0.5, off); }
        else if (port.wall === 'n') { m2.rotation.y = Math.PI; m2.position.set(off, 1.35 + rng.float() * 0.5, d / 2 - 0.013); }
        else { m2.position.set(off, 1.35 + rng.float() * 0.5, -d / 2 + 0.013); }
        group.add(m2);
      }
    }

    // The numbers changed — a painted room numeral over the frame, the
    // one before it scratched out beneath. Hotels renumber; this one did.
    if (['guest', 'lobby', 'corridor', 'records'].includes(spec.biome)) {
      for (const port of [spec.entry, ...spec.exits]) {
        if (rng.float() >= 0.5) continue;
        wallDecal(port.wall, oldNumber(rng), 0.5 + rng.float() * 0.2, 0.5, port.offset, 2.42);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'old-number';
      }
    }

    // The runners slide — crescent scuffs swept into corridor corners
    // where bodies cut the turn at speed: sole-drags and heel digs.
    if (['corridor', 'lobby', 'maintenance', 'underscript'].includes(spec.biome)) {
      for (const crn of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
        if (rng.float() >= 0.3) continue;
        const sz = 0.9 + rng.float() * 0.5;
        const qx = crn[0], qz = crn[1];
        const m = decalQuad(cornerScuff(rng), sz, sz);
        m.name = 'corner-scuff';
        m.rotation.x = -Math.PI / 2;
        // texture's top-left corner anchors the arc at the wall corner;
        // +u/+v both point along the walls INTO the room. Same-sign
        // corners take U on the x-wall, opposite-sign corners on z.
        let ux = 0, uz = 0;
        if (Math.sign(qx) === Math.sign(qz)) { ux = -Math.sign(qx); }
        else { uz = -Math.sign(qz); }
        m.rotation.z = Math.atan2(-uz, ux);
        m.position.set(qx - Math.sign(qx) * sz * 0.46, 0.007, qz - Math.sign(qz) * sz * 0.46);
        group.add(m);
      }
    }

    // The house was hurt before — plaster plugs where the wall took a
    // wound: pale repairs ringed with the cracks that caused them.
    if (['lobby', 'guest', 'corridor', 'records', 'gallery'].includes(spec.biome) && rng.float() < 0.28) {
      const n = 1 + Math.floor(rng.float() * 2);
      for (let i = 0; i < n; i++) {
        const dw = 0.4 + rng.float() * 0.35;
        const spot = pickWallSpot(dw);
        if (!spot) break;
        wallDecal(spot.wall, patchPlug(rng), dw, dw * (0.9 + rng.float() * 0.3), spot.along, 0.7 + rng.float() * 1.2);
        const last = group.children[group.children.length - 1];
        if (last && !last.name) last.name = 'patch-plug';
      }
    }

    // The votive — where a spot is watched, someone has kept vigil:
    // a guttered stub in a wax pool, petals scattered, at the spot's feet.
    for (const spot of room.hidingSpots) {
      if (!spot.trappedBy || rng.float() >= 0.45) continue;
      const hx = (spot.volume.minX + spot.volume.maxX) / 2 - room.origin.x;
      const hz = (spot.volume.minZ + spot.volume.maxZ) / 2 - room.origin.z;
      const c = Math.cos(-room.yaw), s = Math.sin(-room.yaw);
      const lx = hx * c + hz * s, lz = -hx * s + hz * c;
      if (!footprintInDoorLane(spec, lx, lz, 0.45, 0.45)) {
        const m = decalQuad(votiveWax(rng), 0.5 + rng.float() * 0.25, 0.5 + rng.float() * 0.25);
        m.name = 'votive-watch';
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = rng.float() * Math.PI;
        m.position.set(lx, 0.0074, lz);
        group.add(m);
        // a few vigils are fresh — the stub still gutters a weak flame
        if (rng.float() < 0.22) {
          const flameMat = new THREE.MeshStandardMaterial({
            color: 0x1a1408,
            emissive: 0xffa64d,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.9,
          });
          flameMat.userData.decalMat = true;
          const flame = new THREE.Mesh(unitBox, flameMat);
          flame.name = 'votive-flame';
          flame.scale.set(0.012, 0.03 + rng.float() * 0.012, 0.012);
          flame.position.set(lx, 0.05, lz);
          flame.userData.anim = 'flame';
          flame.userData.animSeed = rng.float() * 10;
          flame.userData.baseEm = 0.55 + rng.float() * 0.2;
          group.add(flame);
        }
      }
    }

    // The dust shadow — the wall keeps the silhouette of whatever's been
    // standing against it for years: a paler patch, grime edged.
    for (const p of spec.props) {
      const tall = p.kind === 'cabinet' || p.kind === 'shelf' || p.kind === 'filing'
        || p.kind === 'locker' || p.kind === 'wardrobe' || p.kind === 'bookshelf' || p.kind === 'drawerUnit';
      if (!tall || rng.float() >= 0.5) continue;
      const dE = w / 2 - p.x, dW = p.x + w / 2, dN = d / 2 - p.z, dS = p.z + d / 2;
      const m = Math.min(dE, dW, dN, dS);
      if (m > 0.85) continue;
      const wall = m === dE ? 'e' : m === dW ? 'w' : m === dN ? 'n' : 's';
      const along = wall === 'e' || wall === 'w' ? p.z : p.x;
      const dw = 0.7 + rng.float() * 0.4, dh = 1.3 + rng.float() * 0.5;
      wallDecal(wall, dustShadow(rng), dw, dh, along + (rng.float() - 0.5) * 0.15, 0.9 + rng.float() * 0.3);
      const last = group.children[group.children.length - 1];
      if (last && !last.name) last.name = 'dust-shadow';
    }

    // The leaf remembers — a polished arc on the leaf's travel, scuffed
    // into the floor at every door that's swung a thousand times.
    if (['lobby', 'guest', 'corridor', 'records', 'gallery'].includes(spec.biome)) {
      for (const port of [spec.entry, ...spec.exits]) {
        if (rng.float() >= 0.45) continue;
        const lp = portLocalPos(port, w, d);
        const hx0 = -(port.width / 2 - 0.05);
        // hinge pos and leaf-tip tangent per wall (frame rotated per wall)
        let hx = lp.x, hz = lp.z, tx = 1, tz = 0;
        if (port.wall === 's') { hx += hx0; }
        else if (port.wall === 'n') { hx -= hx0; tx = -1; }
        else if (port.wall === 'e') { hz += hx0; tx = 0; tz = 1; }
        else { hz -= hx0; tx = 0; tz = -1; }
        const ix = -tz, iz = tx; // inward = rotate90(T)
        const leafW = port.width - 0.1;
        const size = leafW + 0.55;
        const cx = hx + (tx + ix) * size * 0.46;
        const cz = hz + (tz + iz) * size * 0.46;
        const m = decalQuad(swingWear(rng), size, size);
        m.name = 'swing-wear';
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = Math.atan2(-tz, tx);
        m.position.set(cx, 0.0068, cz);
        group.add(m);
      }
    }

    // The undertow — rooms flanking an under-passage pick up its damp:
    // water-bloom overhead and water-stained wall bases, graded by how
    // close the room sits to the gate.
    if (room.underSeep !== undefined) {
      const near = 1 - Math.min(room.underSeep, 2) / 3;
      for (let i = 0; i < 1 + Math.floor(rng.float() * 2 * near); i++) {
        const sz = 1.0 + rng.float() * 1.3;
        const m = decalQuad(ceilingDamp(rng), sz, sz);
        m.rotation.x = Math.PI / 2;
        m.rotation.z = rng.float() * Math.PI;
        m.position.set((rng.float() - 0.5) * (w - sz), h - 0.06, (rng.float() - 0.5) * (d - sz));
        group.add(m);
      }
      for (let i = 0; i < 1 + Math.floor(rng.float() * 2); i++) {
        const spot = pickWallSpot(0.8);
        if (!spot) break;
        wallDecal(spot.wall, grimeStreak(rng), 0.7 + rng.float() * 0.5, 0.4 + rng.float() * 0.3, spot.along, 0.26 + rng.float() * 0.2);
      }
      if (near > 0.5 && rng.float() < 0.8) {
        const sz = 0.9 + rng.float() * 0.7;
        const m = decalQuad(floorStain(rng), sz, sz);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = rng.float() * Math.PI;
        m.position.set((rng.float() - 0.5) * (w - sz), 0.006, (rng.float() - 0.5) * (d - sz));
        group.add(m);
      }
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
        if (mt.kind === 'securityCam') built.group.name = `cam-${room.index}`;
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
    // Direction signs on corridor walls — institutional boards that point at
    // the real exit: arrow direction is projected from the exit port's local
    // position through the sign's facing, and the label advertises what the
    // route is actually approaching (the Index, the Engine, room bands).
    if (spec.biome === 'corridor' && rng.float() < 0.5) {
      const spot = pickWallSpot(0.5);
      if (spot) {
        // Exit local position from the first (main-route) port.
        const ex = spec.exits[0];
        const exLocal = ex
          ? (ex.wall === 'e' ? { x: w / 2, z: ex.offset }
            : ex.wall === 'w' ? { x: -w / 2, z: ex.offset }
            : ex.wall === 'n' ? { x: ex.offset, z: d / 2 }
            : { x: ex.offset, z: -d / 2 })
          : null;
        // A '→' in texture space points along local +X rotated by mountYaw:
        // worldDir = (cos yaw, -sin yaw). Arrow points toward the exit when the
        // projection of (exit - spot) on that axis is positive.
        const yaw = mountYaw[spot.wall];
        let arrow = '→';
        if (exLocal) {
          const wx = Math.cos(yaw), wz = -Math.sin(yaw);
          const dx = exLocal.x - (spot.wall === 'e' ? w / 2 : spot.wall === 'w' ? -w / 2 : spot.along);
          const dz = exLocal.z - (spot.wall === 'n' ? d / 2 : spot.wall === 's' ? -d / 2 : spot.along);
          arrow = wx * dx + wz * dz >= 0 ? '→' : '←';
        }
        // Text advertises the route's upcoming landmark, else a room band.
        const next = room.index + 1;
        const text = next <= 50 && next > 44 ? 'THE INDEX'
          : next < 100 && next > 92 ? 'THE ENGINE'
          : next === 51 ? 'NIGHT DESK'
          : rng.float() < 0.5 ? `ROOMS ${String(next).padStart(3, '0')}–${String(Math.min(next + 9, 100)).padStart(3, '0')}`
          : CORRIDOR_SIGNS[Math.floor(rng.float() * CORRIDOR_SIGNS.length)].replace(/[→←]/g, '').trim();
        const label = `${text} ${arrow}`;
        const board = new THREE.Mesh(texBox(1.1, 0.28, 0.04), signMaterial(label) ?? MAT.charcoal());
        const lp2 = spot.wall === 'e' ? { x: w / 2 - 0.06, z: spot.along }
          : spot.wall === 'w' ? { x: -w / 2 + 0.06, z: spot.along }
          : spot.wall === 'n' ? { x: spot.along, z: d / 2 - 0.06 }
          : { x: spot.along, z: -d / 2 + 0.06 };
        board.position.set(lp2.x, 1.95, lp2.z);
        board.rotation.y = yaw;
        group.add(board);
      }
    }

    // Floor props — seeded dressing per biome, biased to walls, lane-clear.
    // `minDim` gates room-scale props to spaces that can take them.
    const floorSet: { kind: PropKind; p: number; wallBias?: boolean; minDim?: number }[] = ({
      corridor: [{ kind: 'wetFloor', p: 0.25 }, { kind: 'stool', p: 0.15, wallBias: true }, { kind: 'bin', p: 0.3, wallBias: true }, { kind: 'broom', p: 0.15, wallBias: true }, { kind: 'baseballBat', p: 0.12, wallBias: true }, { kind: 'handTruck', p: 0.14, wallBias: true }, { kind: 'tyre', p: 0.08, wallBias: true }, { kind: 'spade', p: 0.1, wallBias: true }, { kind: 'plunger', p: 0.1, wallBias: true }, { kind: 'hallFigure', p: 0.09 }, { kind: 'rubblePile', p: 0.08, wallBias: true }, { kind: 'hallTree', p: 0.12, wallBias: true }, { kind: 'umbrellaStand', p: 0.1, wallBias: true }, { kind: 'mailCart', p: 0.08 }],
      records: [{ kind: 'podiumLectern', p: 0.12, wallBias: true }, { kind: 'mailCart', p: 0.15 }, { kind: 'stool', p: 0.3, wallBias: true }, { kind: 'plasticCrate', p: 0.3, wallBias: true }, { kind: 'ladder', p: 0.15, wallBias: true }, { kind: 'foldingStool', p: 0.2, wallBias: true }, { kind: 'screenPanels', p: 0.15, wallBias: true }, { kind: 'cardboardBox', p: 0.25, wallBias: true }, { kind: 'shipModel', p: 0.1 }, { kind: 'watcherFigure', p: 0.07, wallBias: true }, { kind: 'deadTenant', p: 0.06, wallBias: true }, { kind: 'hallFigure', p: 0.05 }, { kind: 'rubblePile', p: 0.12, wallBias: true }],
      lobby: [{ kind: 'hallTree', p: 0.15, wallBias: true }, { kind: 'umbrellaStand', p: 0.12, wallBias: true }, { kind: 'wetFloor', p: 0.2 }, { kind: 'armchair', p: 0.35, wallBias: true }, { kind: 'bin', p: 0.35, wallBias: true }, { kind: 'screenPanels', p: 0.25, wallBias: true }, { kind: 'foldingStool', p: 0.2, wallBias: true }, { kind: 'standingFrame', p: 0.2, wallBias: true }, { kind: 'katana', p: 0.1, wallBias: true }, { kind: 'ornament', p: 0.15 }, { kind: 'dollCluster', p: 0.05, wallBias: true }, { kind: 'pianoUpright', p: 0.1, wallBias: true, minDim: 4.5 }, { kind: 'shell', p: 0.08 }],
      guest: [{ kind: 'washStand', p: 0.3, wallBias: true }, { kind: 'hallTree', p: 0.12, wallBias: true }, { kind: 'luggageRack', p: 0.12, wallBias: true }, { kind: 'television', p: 0.4, wallBias: true }, { kind: 'armchair', p: 0.25, wallBias: true }, { kind: 'nightstand', p: 0.5, wallBias: true }, { kind: 'bedOld', p: 0.3, wallBias: true }, { kind: 'screenPanels', p: 0.2, wallBias: true }, { kind: 'masonryHeater', p: 0.25, wallBias: true }, { kind: 'broom', p: 0.1, wallBias: true }, { kind: 'baseballBat', p: 0.15, wallBias: true }, { kind: 'gothicCommode', p: 0.3, wallBias: true }, { kind: 'pianoUpright', p: 0.08, wallBias: true, minDim: 4.5 }, { kind: 'rubberBoots', p: 0.12 }, { kind: 'suitcase', p: 0.2, wallBias: true }, { kind: 'crutches', p: 0.08, wallBias: true }, { kind: 'standingFrame', p: 0.1, wallBias: true }, { kind: 'sportsBall', p: 0.12 }, { kind: 'gamepad', p: 0.12 }, { kind: 'gameConsole', p: 0.1 }, { kind: 'cigaretteCase', p: 0.08 }, { kind: 'cardboardBox', p: 0.14, wallBias: true }, { kind: 'dollCluster', p: 0.14, wallBias: true }, { kind: 'fruit', p: 0.08 }, { kind: 'cakeSlice', p: 0.06 }, { kind: 'fishHat', p: 0.05 }],
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
        if (!m.isMesh || Array.isArray(m.material) || m.userData.decalMat) return;
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

  // Bakeable static props merge into one mesh per material at the end —
  // named props (Game animates them) and anything carrying userData.anim
  // stay live objects.
  const bakeable: THREE.Object3D[] = [];
  const laneSpec = { width: w, depth: d, entry: spec.entry, exits: spec.exits };
  for (const p of passthrough) {
    try {
      // Underscript furniture loosening — desk items and coolers sit askew.
      const jit = isUnder ? U_JITTER[p.kind] : 0;
      const ps = jit ? { ...p, yaw: (p.yaw ?? 0) + (rng.float() - 0.5) * jit } : p;
      const built = buildProp({ ...ps }, rng.fork(Math.floor(p.x * 97 + p.z * 13)));
      if (p.kind === 'deadTenant') built.group.name = `tenant-${room.index}`;
      if (p.kind === 'coffin') built.group.name = `coffin-${room.index}`;
      if (p.kind === 'pianoUpright') built.group.name = `piano-${room.index}`;
      if (p.kind === 'television') built.group.name = `tv-${room.index}`;
      if (p.kind === 'clock') built.group.name = `clock-${room.index}`;
      if (p.kind === 'steamVent' || p.kind === 'boilerTank' || p.kind === 'pipeManifold') built.group.name = `vent-${room.index}`;
      if (p.kind === 'fireplace' || p.kind === 'stove' || p.kind === 'masonryHeater' || p.kind === 'firePit') built.group.name = `hearth-${room.index}`;
      if (p.kind === 'payphone') built.group.name = `phone-${room.index}`;
      if (p.kind === 'mousetrap') built.group.name = `trap-${room.index}`;
      if (p.kind === 'securityCam') built.group.name = `cam-${room.index}`;
      if (p.kind === 'washer') built.group.name = `wash-${room.index}`;
      if (p.kind === 'printer' || p.kind === 'printerRow') built.group.name = `print-${room.index}`;
      if (p.kind === 'typewriter') built.group.name = `type-${room.index}`;
      if (p.kind === 'window') built.group.name = `win-${room.index}`;
      if (p.kind === 'waterCooler') built.group.name = `cool-${room.index}`;
      if (p.kind === 'statue' || p.kind === 'marbleBust') built.group.name = `stat-${room.index}`;
      if (p.kind === 'rug') built.group.name = `rug-${room.index}`;
      if (p.kind === 'chandelier') built.group.name = `chan-${room.index}`;
      // A wide prop centered beside a door can still reach into its lane —
      // drop any whose solid collider footprint overlaps the approach strip.
      // meta.laneBlock exempts authored gate pieces (portcullis, stairGate,
      // hatch) that are meant to sit inside a doorway — but a collider that
      // parks in the door throat still seals it, so shed those colliders.
      if (p.meta?.laneBlock) {
        built.colliders = built.colliders.filter(
          (c) => c.losOnly || c.walkable || (c.y ?? 0) >= 1.9 ||
            !footprintInDoorLeaf(laneSpec, c.x, c.z, c.w / 2, c.d / 2),
        );
      } else if (built.colliders.some((c) => !c.losOnly && !c.walkable && (c.y ?? 0) < 1.9 && footprintInDoorLane(laneSpec, c.x, c.z, c.w / 2, c.d / 2))) continue;
      group.add(built.group);
      if (isUnder) {
        // Fixture decay — dead tubes go dark, dying ones flicker off their
        // nearest room light, a few hang snapped at an angle.
        if (p.kind === 'fluoroTube' || p.kind === 'exitSign') {
          const sign = p.kind === 'exitSign';
          const dead = rng.float() < (sign ? 0.08 : 0.12);
          const dying = !dead && rng.float() < (sign ? 0.18 : 0.3);
          if (dead || dying) {
            built.group.traverse((o) => {
              const m = o as THREE.Mesh;
              if (!m.isMesh || Array.isArray(m.material)) return;
              const sm = m.material as THREE.MeshStandardMaterial;
              // Milled fixtures carry no emissive — the lit face is the
              // 'wax' bucket (tubes / legend strokes); procedural fallbacks
              // use a real emissive material.
              if ((sm.emissiveIntensity ?? 0) < 0.05 && sm.name !== 'wax') return;
              if (dead) { m.material = DEAD_TUBE_MAT; return; }
              const cm = sm.clone();
              if ((cm.emissiveIntensity ?? 0) < 0.05) {
                cm.emissive.setHex(sign ? 0xd82618 : 0xccd4b8);
                cm.emissiveIntensity = 1.2;
              }
              m.material = cm;
              m.userData.anim = 'flicker';
              m.userData.animSeed = rng.float() * 100;
              const ls = spec.lights?.find((l) => Math.hypot(l.x - p.x, l.z - p.z) < 2.4);
              if (ls) m.userData.lsRef = ls;
            });
          }
          if (!sign && !dead && rng.float() < 0.12) {
            built.group.rotation.z += (rng.float() < 0.5 ? -1 : 1) * (0.08 + rng.float() * 0.2);
          }
        } else if (p.kind === 'paperStack' && rng.float() < 0.15) {
          // spilling stack — slight lean, reads disturbed
          built.group.rotation.z = (rng.float() < 0.5 ? -1 : 1) * (0.06 + rng.float() * 0.1);
        }
      }
      let animated = false;
      built.group.traverse((o) => { if (o.userData.anim) animated = true; });
      if (!built.group.name && !animated) bakeable.push(built.group);
      wireColliders(built);
      groundShadow(built, p.x, p.z, p.y ?? 0);
      if (p.kind === 'puddle' || p.kind === 'steamVent') dripSpots.push([p.x, p.z]);
      // Template-declared windows spill the same moonlight pool as
      // biome-mount windows — the glow extends toward the room center.
      if (p.kind === 'window') {
        const len = Math.hypot(p.x, p.z) || 1;
        moonlightPool(p.x - (p.x / len) * 0.9, p.z - (p.z / len) * 0.9, (p.yaw ?? 0) + (rng.float() - 0.5) * 0.15);
        // Dead moths gather where the light used to be.
        if (rng.float() < 0.4) {
          const moth = decalQuad(mothDrift(rng), 0.85, 0.85);
          if (moth) {
            moth.name = 'moth-drift';
            moth.rotation.x = -Math.PI / 2;
            moth.rotation.z = rng.float() * Math.PI;
            moth.position.set(p.x - (p.x / len) * 0.22, 0.008, p.z - (p.z / len) * 0.22);
            group.add(moth);
          }
        }
      }
      // The drains drink — verdigris bloom and a floor that never
      // quite dries, pooling out from under the basin.
      if (p.kind === 'basinSink' && rng.float() < 0.5) {
        const dh = decalQuad(drainHalo(rng), 1.1, 1.1);
        dh.name = 'drain-halo';
        dh.rotation.x = -Math.PI / 2;
        dh.rotation.z = (p.yaw ?? 0) + (rng.float() - 0.5) * 0.4;
        const fy = p.yaw ?? 0;
        dh.position.set(p.x + Math.sin(fy) * 0.15, 0.0085, p.z + Math.cos(fy) * 0.15);
        group.add(dh);
      }
      // Under the bed — whatever the room kept pushed under the
      // frame: a box, a case, the dust that never got swept.
      if (p.kind === 'bed' && rng.float() < 0.35) {
        const ub = decalQuad(underBed(rng), 0.95, 0.6);
        ub.name = 'under-bed';
        ub.rotation.x = -Math.PI / 2;
        const by = p.yaw ?? 0;
        ub.rotation.z = -by + (rng.float() - 0.5) * 0.3;
        const side = rng.bool(0.5) ? 1 : -1;
        ub.position.set(p.x + Math.cos(by) * 0.5 * side, 0.008, p.z - Math.sin(by) * 0.5 * side);
        group.add(ub);
      }
      // The letters never sent — a dropped envelope where someone
      // slept, dressed, or was paid out.
      if ((p.kind === 'bed' || p.kind === 'nightstand' || p.kind === 'dresser' || p.kind === 'desk' || p.kind === 'till') && rng.float() < 0.12) {
        const ll = decalQuad(lostLetter(rng), 0.28, 0.28);
        ll.name = 'lost-letter';
        ll.rotation.x = -Math.PI / 2;
        ll.rotation.z = rng.float() * Math.PI * 2;
        const la = rng.float() * Math.PI * 2, lr = 0.55 + rng.float() * 0.3;
        ll.position.set(p.x + Math.cos(la) * lr, 0.009, p.z + Math.sin(la) * lr);
        group.add(ll);
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

  // Underscript floor weathering — paper litter drift and grime stains, all
  // on shared materials so the bake keeps them cheap.
  if (isUnder) {
    const litterGeos: THREE.BufferGeometry[] = [];
    const nSpots = 1 + Math.floor(rng.float() * 3);
    for (let i = 0; i < nSpots; i++) {
      const sx = (rng.float() - 0.5) * (w - 1.4), sz = (rng.float() - 0.5) * (d - 1.4);
      if (footprintInDoorLane(laneSpec, sx, sz, 0.3, 0.3)) continue;
      const n = 3 + Math.floor(rng.float() * 4);
      for (let j = 0; j < n; j++) {
        const g = texBox(0.24 + rng.float() * 0.1, 0.004, 0.32 + rng.float() * 0.08);
        g.applyMatrix4(new THREE.Matrix4()
          .makeRotationY(rng.float() * Math.PI * 2)
          .setPosition(sx + (rng.float() - 0.5) * 0.55, 0.006 + j * 0.0035, sz + (rng.float() - 0.5) * 0.55));
        litterGeos.push(g);
      }
    }
    if (litterGeos.length) {
      const litter = mergeGeometries(litterGeos, false);
      if (litter) {
        const lm = new THREE.Mesh(litter, MAT.paperOld());
        lm.receiveShadow = true;
        group.add(lm);
      }
    }
  }

  // Static-prop bake: merge every bakeable prop's meshes into one mesh per
  // material, in room-local space. Cuts draw calls sharply in dressed rooms —
  // dozens of prop groups become a handful of merged meshes.
  if (bakeable.length) {
    group.updateMatrixWorld(true);
    // Bucket by material + attribute signature: mergeGeometries() returns null
    // (and spams console.error) when geometries disagree on attributes, morph
    // keys, or indexing — e.g. two props sharing a material but one carrying
    // uv2/color or morph targets.
    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean }>();
    for (const grp of bakeable) {
      grp.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || Array.isArray(m.material)) return;
        const mat = m.material as THREE.Material;
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        const sig = mergeSig(g);
        const key = mat.uuid + '|' + sig;
        const b = buckets.get(key) ?? { mat, geos: [], cast: m.castShadow };
        b.geos.push(g);
        buckets.set(key, b);
      });
      grp.removeFromParent();
    }
    for (const b of buckets.values()) {
      const mat = b.mat;
      let merged: THREE.BufferGeometry | null = null;
      try { merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false); } catch { merged = null; }
      if (!merged) {
        for (const geo of b.geos) {
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = b.cast;
          mesh.receiveShadow = true;
          group.add(mesh);
        }
        continue;
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Seeded floor clutter — scattered papers and debris; door lanes stay
  // clear. Per-biome vocabulary: records/corridor paper; gallery sheds
  // fallen catalogs and books; maintenance drifts cartons, rubble and
  // cleaner bottles toward the walls. Non-paper kinds hug the walls so
  // nothing sits mid-lane.
  const CLUTTER_BY_BIOME: Record<string, [PropKind, number][]> = {
    corridor: [['paperScatter', 0.85], ['carton', 0.15]],
    records: [['paperScatter', 0.85], ['carton', 0.15]],
    guest: [['paperScatter', 0.85], ['carton', 0.15]],
    lobby: [['paperScatter', 0.8], ['carton', 0.2]],
    unlit: [['paperScatter', 0.8], ['carton', 0.2]],
    gallery: [['paperScatter', 0.5], ['books', 0.3], ['carton', 0.2]],
    maintenance: [['carton', 0.4], ['paperScatter', 0.25], ['rubblePile', 0.2], ['bleachBottle', 0.15]],
    // the under drifts too — service-camp debris on top of the litter
    // drift: work-cartons, ration bottles and cans, broken rubble
    underscript: [['carton', 0.3], ['papers', 0.3], ['wineBottles', 0.15], ['rubblePile', 0.15], ['foodCans', 0.1]],
  };
  const clutter = CLUTTER_BY_BIOME[spec.biome];
  if (clutter && (!isUnder || spec.biome === 'underscript')) {
    const n = Math.min(7, Math.floor((w * d) / 15) + rng.int(0, 2));
    for (let i = 0; i < n; i++) {
      const cx = (rng.float() - 0.5) * (w - 1.6);
      const cz = (rng.float() - 0.5) * (d - 1.6);
      const nearDoor = doorPositions.some((p) => {
        const lp = portLocalPos(p, w, d);
        return Math.hypot(cx - lp.x, cz - lp.z) < 1.5;
      });
      if (nearDoor) continue;
      let roll = rng.float();
      let kind: PropKind = clutter[clutter.length - 1][0];
      for (const [k, p] of clutter) { if (roll < p) { kind = k; break; } roll -= p; }
      // bias bulky kinds toward walls so they don't sit mid-lane
      const px = kind === 'paperScatter' ? cx : Math.sign(cx || 1) * Math.max(Math.abs(cx), w * 0.3);
      try {
        const built = buildProp({ kind, x: px, z: cz, yaw: rng.float() * Math.PI }, rng.fork(9000 + i));
        built.group.name = 'clutter-' + kind;
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
  // Glow decals tied to a light (shafts, pools, sconce throws) — the ambient
  // loop scales their opacity off the paired light's real output.
  const shafts: THREE.Mesh[] = [];
  if (sconcePos && !room.darkRoom) {
    const sl = new THREE.PointLight(0xffc878, 0.55, 4.5, 2);
    sl.position.set(sconcePos.x, sconcePos.y, sconcePos.z);
    sl.userData.baseIntensity = sl.intensity;
    sl.userData.origBaseIntensity = sl.intensity;
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
      throwMat.userData.lightRef = sl;
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.7), throwMat);
      wash.position.set(wallX, sconcePos.y + 0.15, wallZ);
      wash.rotation.y = onX ? -sgn * Math.PI / 2 : (sgn > 0 ? Math.PI : 0);
      wash.renderOrder = 2;
      group.add(wash);
      shafts.push(wash);
      // clone() JSON-copies userData — reset the light ref explicitly.
      const poolMat2 = throwMat.clone(); poolMat2.userData.decalMat = true; poolMat2.opacity = 0.2; poolMat2.userData.lightRef = sl;
      const fpool = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), poolMat2);
      fpool.rotation.x = -Math.PI / 2;
      fpool.position.set(sconcePos.x * 0.92, 0.013, sconcePos.z * 0.92);
      group.add(fpool);
      shafts.push(fpool);
    }
  }

  // The lamps take sides — a fixture over each leaf reads the door: lit
  // sconces favor open leaves, dead ones favor the locked. A readable
  // channel the house keeps imperfect — dark lamps over working doors.
  for (const door of room.doors) {
    if (rng.float() >= 0.75) continue; // a quarter of leaves go unmarked
    const ddx = door.pos.x - room.origin.x, ddz = door.pos.z - room.origin.z;
    const dc = Math.cos(-room.yaw), dsn = Math.sin(-room.yaw);
    const dp = { x: ddx * dc + ddz * dsn, z: -ddx * dsn + ddz * dc };
    const dil = Math.hypot(dp.x, dp.z) || 1;
    const inx = -dp.x / dil, inz = -dp.z / dil;
    const service = spec.biome === 'maintenance' || spec.biome === 'underscript' || spec.biome === 'unlit';
    const kind: PropKind = service ? 'cagedSconce' : 'wallSconce';
    const lit = door.locked ? rng.float() < 0.15 : rng.float() < 0.7;
    try {
      const f = buildProp({ kind, x: dp.x + inx * 0.07, z: dp.z + inz * 0.07, y: 2.35, yaw: Math.atan2(inx, inz) }, rng.fork(7700 + door.pos.x * 3 | 0));
      f.group.name = lit ? 'door-lamp-lit' : 'door-lamp-dead';
      group.add(f.group);
      if (lit && !room.darkRoom) {
        const dl = new THREE.PointLight(0xffc878, 0.4, 3.2, 2);
        dl.position.set(dp.x + inx * 0.3, 2.3, dp.z + inz * 0.3);
        dl.userData.baseIntensity = dl.intensity;
        dl.userData.origBaseIntensity = dl.intensity;
        group.add(dl);
        lights.push(dl);
      } else if (!lit) {
        // smoke stain above a fixture that burned out trying to warn you
        const sm = decalQuad(grimeStreak(rng), 0.4, 0.7);
        sm.name = 'door-lamp-smoke';
        sm.position.set(dp.x + inx * 0.04, 2.75, dp.z + inz * 0.04);
        sm.rotation.y = Math.atan2(inx, inz);
        group.add(sm);
      }
    } catch { /* dressing only */ }
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
    // Authoring intensity — lamp emissive is scaled against this, not the
    // live baseIntensity (which flicker/dim passes rewrite).
    pl.userData.origBaseIntensity = pl.intensity;
    if (quality === 'high' && !shadowAssigned && !room.darkRoom) {
      // Eligible to cast — Game enables castShadow only for the room the
      // player occupies; a point-light shadow is six scene renders, so one
      // active shadow light is the budget.
      pl.userData.shadowEligible = true;
      pl.shadow.mapSize.set(512, 512);
      pl.shadow.bias = -0.01;
      pl.shadow.camera.near = 0.2;
      pl.shadow.camera.far = ls.range;
      shadowAssigned = true;
    }
    group.add(pl);
    lights.push(pl);
    pl.userData.group = ls.group;
  }
  // Pair each built light to its authored fixture mesh (lampMeshes are
  // pushed one-per-spec-light in spec order; lights[] is a re-sorted
  // slice). Each paired mesh takes its own material clone — per-light
  // writes are live: baseIntensity jitter (Game.ts range(0.88,1.14)) and
  // alternating sweep flicker differentiate paired lights, so a shared
  // clone would collapse fixtures to whichever light wrote last.
  // Flicker/anim meshes skip pairing entirely (their own lightRef
  // coupling handles glow).
  if (!room.darkRoom) {
    const lampByLs = new Map<unknown, THREE.Mesh>();
    spec.lights.forEach((ls, i) => { const m = lampMeshes[i]; if (m) lampByLs.set(ls, m); });
    for (const l of lights) {
      const m = lampByLs.get(l.userData.ls);
      if (!m || m.userData.anim) continue;
      m.material = (m.material as THREE.MeshStandardMaterial).clone();
      l.userData.lampMesh = m;
    }
  }
  if (room.darkRoom) {
    for (const b of lampMeshes) (b.material as THREE.MeshStandardMaterial) = MAT.charcoal();
  }

  // Fake-volumetric light shafts under lit fixtures + drifting dust motes.
  // Skipped for dark rooms (no light to scatter through).
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
      shaft.userData.lsRef = ls;
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
      pool.userData.lsRef = ls;
      group.add(pool);
      shafts.push(pool);
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

    // ~1-in-5 lit rooms get a flickering main fixture. Its lampMesh (if
    // the pairing pass set one) dips in sync via the ambient loop.
    if (lights.length && rng.float() < 0.2) {
      const l = lights[0];
      l.userData.flicker = true;
      l.userData.flickerSeed = rng.float() * 100;
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
      // Sprint 230 — dress the run: pilaster-bay panelling, cornice, a
      // lantern, a runner, and a portal surround framing each end. Same
      // milled vocabulary corridorTrim lays inside rooms; colliders stay
      // out — the walls already block.
      {
        const nx = -uz, nz = ux;
        const face = (dx2: number, dz2: number) => Math.atan2(dx2, dz2);
        const trim = (kind: PropKind, t: number, side: number, y: number, yaw?: number) => {
          const px = la.x + ux * t + nx * side * 1.16;
          const pz = la.z + uz * t + nz * side * 1.16;
          const b = buildProp({ kind, x: px, z: pz, y, yaw: yaw ?? face(-nx * side, -nz * side) },
            rng.fork(si * 997 + Math.floor(t * 10) * 31 + side * 7 + (kind as string).length));
          b.group.name = `connTrim-${kind}`;
          corr.add(b.group);
        };
        const bays = Math.max(1, Math.round(len / 2.2));
        const bay = len / bays;
        for (const side of [-1, 1]) {
          for (let i = 0; i <= bays; i++) {
            const t = i * bay;
            if (t > 0.25 && t < len - 0.25) trim('pilaster', t, side, 1.25);
            if (i < bays) {
              trim('wainscotRun', t + bay / 2, side, 0.55);
              trim('corniceRun', t + bay / 2, side, 2.63);
            }
          }
          if (len > 4.5 && (si + (side > 0 ? 1 : 0)) % 2 === 0) trim('wallLantern', len / 2, side, 2.1);
        }
        if (len > 3.2) {
          const t = len / 2;
          const rug = buildProp({ kind: 'runnerRug', x: la.x + ux * t, z: la.z + uz * t, y: 0.02, yaw: Math.atan2(-uz, ux) }, rng.fork(si * 613));
          rug.group.name = 'connTrim-runnerRug';
          corr.add(rug.group);
        }
        // Portal surrounds at both ends, fronts into the corridor.
        const suA = buildProp({ kind: 'doorSurround', x: la.x + ux * 0.3, z: la.z + uz * 0.3, y: 1.25, yaw: face(ux, uz) }, rng.fork(si * 61));
        suA.group.name = 'connTrim-doorSurround';
        corr.add(suA.group);
        const suB = buildProp({ kind: 'doorSurround', x: lb.x - ux * 0.3, z: lb.z - uz * 0.3, y: 1.25, yaw: face(-ux, -uz) }, rng.fork(si * 67));
        suB.group.name = 'connTrim-doorSurround';
        corr.add(suB.group);
      }

      // The seam bleeds — a keyed set piece's tell reaches down its own
      // gap-corridor into the door: marks sit on the door-half of each
      // run, doubled on the leg that lands on the threshold.
      const seamTell = MILESTONE_TELLS[room.templateId];
      if (seamTell) {
        const nx = -uz, nz = ux;
        const lastLeg = si === pts.length - 2;
        for (const t of FORESHADOW_TELLS[seamTell] ?? []) {
          const marks = (t.n ?? 1) + (lastLeg ? 1 : 0);
          for (let k = 0; k < marks; k++) {
            const tt = len * (0.5 + rng.float() * 0.45);
            if (t.wall) {
              const side = rng.bool() ? 1 : -1;
              const m = decalQuad(t.tex(rng), t.w, t.h);
              m.position.set(la.x + ux * tt + nx * side * 1.17, t.cy ?? (1.2 + rng.float() * 0.9), la.z + uz * tt + nz * side * 1.17);
              m.rotation.y = Math.atan2(-nx * side, -nz * side);
              corr.add(m);
            } else {
              const m = decalQuad(t.tex(rng), t.w, t.h);
              m.rotation.x = -Math.PI / 2;
              m.rotation.z = t.h >= 2.5 ? Math.atan2(-ux, -uz) + (rng.float() - 0.5) * 0.3 : rng.float() * Math.PI;
              m.position.set(la.x + ux * tt + nx * (rng.float() - 0.5) * 0.9, 0.008, la.z + uz * tt + nz * (rng.float() - 0.5) * 0.9);
              corr.add(m);
            }
          }
        }
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
    for (const m of frameHardware) keep.add(m);
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
      const sig = mergeSig(m.geometry);
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

  // The seam breathes — a cold draft slides through the onward door's
  // gap when something waits past it: motes blown inward off the seam,
  // wrapping a short run. Only rooms carrying a foreshadow or set-piece
  // tell — the tell marks the wall, this marks the air.
  let draft: THREE.Points | null = null;
  if ((room.foreshadow || room.milestoneTell) && spec.exits.length > 0) {
    const port = spec.exits[0];
    const lp = portLocalPos(port, w, d);
    const od = portOutwardDir(port);
    const ix = -od.x, iz = -od.z;
    const n = 22;
    const pos = new Float32Array(n * 3);
    const speeds = new Float32Array(n), phases = new Float32Array(n), spread = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = lp.x + (rng.float() - 0.5) * port.width * 0.8;
      pos[i * 3 + 1] = 0.02 + rng.float() * 0.22;
      pos[i * 3 + 2] = lp.z + (rng.float() - 0.5) * port.width * 0.8;
      speeds[i] = 0.25 + rng.float() * 0.3;
      phases[i] = rng.float();
      spread[i] = (rng.float() - 0.5) * 0.3;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    draft = new THREE.Points(dg, draftMat);
    draft.userData.dirx = ix; draft.userData.dirz = iz;
    draft.userData.ox = lp.x; draft.userData.oz = lp.z;
    draft.userData.speeds = speeds; draft.userData.phases = phases; draft.userData.spread = spread;
    group.add(draft);
  }

  return { group, doorLeaves, lampMeshes, lights, shafts, dust, animated, drips, draft };
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
