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
import { grimeStreak, floorStain, poster, warningStripe, cobweb, decalQuad, bloodPool, bloodSmear, scratchMarks, handPrints } from './decals';

export interface BuiltRoom {
  group: THREE.Group;
  /** Door leaf meshes keyed by door id for animation. */
  doorLeaves: Map<string, THREE.Mesh>;
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
function plateMaterial(label: string): THREE.MeshStandardMaterial | null {
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
    case 'tile': wallMat = TEX.tileWall(); break;
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
    if (spec.biome === 'gallery' && roll < 0.45) wallMat = TEX.travertine();
    else if (spec.biome === 'lobby' && roll < 0.4) wallMat = TEX.woodPanel();
    else if (spec.biome === 'gallery' && roll < 0.75) wallMat = TEX.woodPanel();
    else if (spec.biome === 'records' && roll < 0.15) wallMat = TEX.woodPanel();
    else if (spec.biome === 'maintenance' && roll < 0.3) wallMat = TEX.corrugated();
    else if (spec.biome === 'maintenance' && roll < 0.55) wallMat = TEX.brick();
    else if (spec.biome === 'maintenance' && roll < 0.62) wallMat = TEX.corrugatedRust();
    else if (isUnder && roll < 0.2) wallMat = TEX.brick();
    else if (isUnder && roll < 0.34) wallMat = TEX.plasterPeeling();
    else if (isUnder && roll < 0.45) wallMat = TEX.concreteIndustrial();
    else if (spec.biome === 'lobby' && roll < 0.52) wallMat = TEX.wallpaperGrand();
    else if (spec.biome === 'guest' && roll < 0.18) wallMat = TEX.woodPaint();
    else if (spec.biome === 'maintenance' && roll < 0.68) wallMat = TEX.plasterPeeling();
    else if ((spec.biome === 'corridor' || spec.biome === 'guest' || spec.biome === 'records') && roll < 0.3) wallMat = TEX.plasterPainted();
    if (wallMat !== preRoll) isWallpaper = false;
  }
  if (isWallpaper && rng.float() < 0.55) {
    wallMat = wallMat.clone();
    wallMat.color.setHex(WALLPAPER_TINTS[Math.floor(rng.float() * WALLPAPER_TINTS.length)]);
    wallMat.userData.decalMat = true; // reuse the decal-material disposal path
  }
  const floorRoll = rng.float();
  const floorMat = isUnder
    ? (floorRoll < 0.3 ? TEX.metalWalkway() : floorRoll < 0.45 ? TEX.concreteIndustrial() : TEX.concreteFloor())
    : room.floorMaterial === 'carpet'
      ? (floorRoll < 0.12 && spec.biome === 'guest' ? TEX.carpetShag() : floorRoll < 0.25 ? TEX.carpetWorn() : TEX.carpet())
      : room.floorMaterial === 'stone' || room.floorMaterial === 'metal'
        ? (spec.biome === 'maintenance' && floorRoll < 0.45
          ? (floorRoll < 0.2 ? TEX.metalRusted() : TEX.diamondPlate())
          : TEX.concreteFloor())
        : (spec.biome === 'lobby' || spec.biome === 'gallery' || spec.biome === 'milestone') && floorRoll < 0.5
          ? (floorRoll < 0.12 ? TEX.marbleDark() : floorRoll < 0.26 ? TEX.terrazzo() : floorRoll < 0.4 ? TEX.woodParquet() : TEX.marbleFloor())
          : (floorRoll < 0.14 && spec.biome === 'maintenance' ? TEX.woodPlanksDark() : floorRoll < 0.22 ? TEX.woodFloorWorn() : floorRoll < 0.38 ? TEX.woodFloorOld() : TEX.woodFloor());
  const ceilRoll = rng.float();
  const ceilMat = isUnder
    ? TEX.concreteFloor()
    : (spec.biome === 'corridor' || spec.biome === 'records' || spec.biome === 'maintenance') && ceilRoll < 0.45
      ? TEX.ceilingAcoustic()
      : TEX.ceiling();
  const w = room.width, d = room.depth, h = room.height;

  // Floor + ceiling (texBox carries meter-scaled UVs)
  const floor = new THREE.Mesh(texBox(w, 0.1, d), floorMat);
  floor.position.y = -0.05;
  group.add(floor);
  const ceil = new THREE.Mesh(texBox(w, 0.1, d), ceilMat);
  ceil.position.y = h + 0.05;
  // Suspended drop ceiling decision — hoisted: it also gates coffers below.
  const suspended = !isUnder && spec.biome != 'maintenance' && h <= 3.6;
  const fixtureY = suspended ? h - 0.22 : h - 0.3;
  // Coffered ceiling — grand rooms get a shallow oak beam grid under the
  // slab; the dropped cross-members read as real joinery from the floor.
  if ((spec.biome === 'lobby' || spec.biome === 'gallery' || spec.biome === 'milestone') && !suspended && w >= 4 && d >= 4 && rng.float() < 0.6) {
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
  const trimMat = isUnder || spec.biome === 'maintenance' ? MAT.steelDark() : MAT.darkOak();
  const wainsMat = isUnder ? MAT.steelDark() : MAT.darkOak();
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
  const doorLeaves = new Map<string, THREE.Mesh>();
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
      plate.position.y = 2.68;
      frame.add(plate);
    }
    // leaf — painted/metal variants by biome, seeded per room
    const leafMat = isUnder
      ? MAT.steel()
      : spec.biome === 'maintenance'
        ? MAT.steelDark()
        : rng.pick([TEX.woodFloor(), TEX.woodFloor(), MAT.darkOak(), MAT.oxGreen()]);
    const leaf = new THREE.Mesh(texBox(port.width - 0.1, 2.2, 0.09), leafMat);
    // Raised 6-panel relief + brass hardware on interior (non-industrial)
    // doors — the slab reads flat otherwise.
    if (!industrial) {
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
    const hostile = room.darkRoom || spec.biome === 'unlit' || spec.biome === 'maintenance' || isUnder;
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
      records: [{ kind: 'wallClock2', y: 1.95, p: 0.35 }, { kind: 'medBox', y: 1.45, p: 0.15 }, { kind: 'securityCam', y: 2.35, p: 0.25 }, { kind: 'window', y: 1.7, p: 0.2 }],
      lobby: [{ kind: 'securityCam', y: 2.4, p: 0.5 }, { kind: 'wallClock2', y: 2.0, p: 0.4 }, { kind: 'dartboard', y: 1.7, p: 0.25 }, { kind: 'window', y: 1.7, p: 0.3 }, { kind: 'trophyHead', y: 2.05, p: 0.15 }, { kind: 'kiteShield', y: 1.8, p: 0.12 }],
      guest: [{ kind: 'wallClock2', y: 1.95, p: 0.25 }, { kind: 'dartboard', y: 1.7, p: 0.15 }, { kind: 'window', y: 1.7, p: 0.35 }],
      gallery: [{ kind: 'securityCam', y: 2.4, p: 0.35 }, { kind: 'window', y: 1.8, p: 0.25 }, { kind: 'trophyHead', y: 2.1, p: 0.25 }, { kind: 'kiteShield', y: 1.8, p: 0.2 }],
      maintenance: [{ kind: 'extinguisher', y: 1.15, p: 0.5 }, { kind: 'gasMask', y: 1.55, p: 0.25 }, { kind: 'securityCam', y: 2.3, p: 0.2 }, { kind: 'powerBox', y: 1.7, p: 0.45 }, { kind: 'utilityBox', y: 1.6, p: 0.3 }, { kind: 'pipeLamp', y: 2.45, p: 0.3 }, { kind: 'securityLight', y: 2.55, p: 0.2 }, { kind: 'wallHose', y: 1.1, p: 0.2 }, { kind: 'fireAlarm', y: 1.8, p: 0.3 }, { kind: 'cagedSconce', y: 2.3, p: 0.3 }, { kind: 'airconUnit', y: 2.35, p: 0.3 }],
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
    const floorSet: { kind: PropKind; p: number; wallBias?: boolean }[] = ({
      corridor: [{ kind: 'wetFloor', p: 0.25 }, { kind: 'stool', p: 0.15, wallBias: true }, { kind: 'bin', p: 0.3, wallBias: true }, { kind: 'broom', p: 0.15, wallBias: true }, { kind: 'baseballBat', p: 0.12, wallBias: true }, { kind: 'handTruck', p: 0.14, wallBias: true }, { kind: 'tyre', p: 0.08, wallBias: true }, { kind: 'spade', p: 0.1, wallBias: true }, { kind: 'plunger', p: 0.1, wallBias: true }],
      records: [{ kind: 'stool', p: 0.3, wallBias: true }, { kind: 'plasticCrate', p: 0.3, wallBias: true }, { kind: 'ladder', p: 0.15, wallBias: true }, { kind: 'foldingStool', p: 0.2, wallBias: true }, { kind: 'screenPanels', p: 0.15, wallBias: true }],
      lobby: [{ kind: 'wetFloor', p: 0.2 }, { kind: 'armchair', p: 0.35, wallBias: true }, { kind: 'bin', p: 0.35, wallBias: true }, { kind: 'screenPanels', p: 0.25, wallBias: true }, { kind: 'foldingStool', p: 0.2, wallBias: true }, { kind: 'standingFrame', p: 0.2, wallBias: true }, { kind: 'katana', p: 0.1, wallBias: true }, { kind: 'ornament', p: 0.15 }],
      guest: [{ kind: 'television', p: 0.4, wallBias: true }, { kind: 'armchair', p: 0.25, wallBias: true }, { kind: 'nightstand', p: 0.5, wallBias: true }, { kind: 'bedOld', p: 0.3, wallBias: true }, { kind: 'screenPanels', p: 0.2, wallBias: true }, { kind: 'masonryHeater', p: 0.25, wallBias: true }, { kind: 'broom', p: 0.1, wallBias: true }, { kind: 'baseballBat', p: 0.15, wallBias: true }, { kind: 'gothicCommode', p: 0.3, wallBias: true }, { kind: 'rubberBoots', p: 0.12 }, { kind: 'suitcase', p: 0.2, wallBias: true }, { kind: 'crutches', p: 0.08, wallBias: true }, { kind: 'standingFrame', p: 0.1, wallBias: true }],
      gallery: [{ kind: 'bench', p: 0.3 }, { kind: 'armchair', p: 0.2, wallBias: true }, { kind: 'masonryHeater', p: 0.2, wallBias: true }, { kind: 'screenPanels', p: 0.2, wallBias: true }, { kind: 'galleryStatue', p: 0.2, wallBias: true }, { kind: 'standingFrame', p: 0.25, wallBias: true }, { kind: 'katana', p: 0.15, wallBias: true }, { kind: 'spinningWheel', p: 0.12, wallBias: true }],
      maintenance: [{ kind: 'barrel', p: 0.55, wallBias: true }, { kind: 'propaneTank', p: 0.35, wallBias: true }, { kind: 'toolChest', p: 0.4, wallBias: true }, { kind: 'ladder', p: 0.35, wallBias: true }, { kind: 'bucket', p: 0.3 }, { kind: 'plasticCrate', p: 0.4, wallBias: true }, { kind: 'wrench', p: 0.25 }, { kind: 'plasticCrate2', p: 0.25, wallBias: true }, { kind: 'jerrycan', p: 0.3, wallBias: true }, { kind: 'oilTin', p: 0.25 }, { kind: 'tirePump', p: 0.2, wallBias: true }, { kind: 'woodLadder', p: 0.2, wallBias: true }, { kind: 'cementBag', p: 0.3, wallBias: true }, { kind: 'compostBags', p: 0.3, wallBias: true }, { kind: 'drillPress', p: 0.3, wallBias: true }, { kind: 'jerrycanP', p: 0.25, wallBias: true }, { kind: 'broom', p: 0.25, wallBias: true }, { kind: 'dustpan', p: 0.2 }, { kind: 'sprayCans', p: 0.2 }, { kind: 'rustCan', p: 0.2 }, { kind: 'cleanerBottle', p: 0.2 }, { kind: 'bleachBottle', p: 0.2 }, { kind: 'ammoBox', p: 0.15, wallBias: true }, { kind: 'megaphone', p: 0.1 }, { kind: 'deadTree', p: 0.05, wallBias: true }, { kind: 'crowbar', p: 0.2 }, { kind: 'boltCutters', p: 0.15 }, { kind: 'bunsenBurner', p: 0.1 }, { kind: 'rifle', p: 0.08, wallBias: true }, { kind: 'compressor', p: 0.25, wallBias: true }, { kind: 'handTruck', p: 0.3, wallBias: true }, { kind: 'tyre', p: 0.2, wallBias: true }, { kind: 'wheelRim', p: 0.2, wallBias: true }, { kind: 'spade', p: 0.15, wallBias: true }, { kind: 'powerDrill', p: 0.2 }, { kind: 'pliers', p: 0.2 }, { kind: 'tapeMeasure', p: 0.15 }, { kind: 'handPlane', p: 0.15 }, { kind: 'trowel', p: 0.12 }, { kind: 'metalDetector', p: 0.1, wallBias: true }, { kind: 'plunger', p: 0.12, wallBias: true }, { kind: 'rubberBoots', p: 0.12 }, { kind: 'gallonJug', p: 0.2 }, { kind: 'plasticBin', p: 0.25, wallBias: true }, { kind: 'thermos', p: 0.15 }, { kind: 'machete', p: 0.08 }],
      unlit: [{ kind: 'lantern', p: 0.4, wallBias: true }, { kind: 'flashlight', p: 0.2 }, { kind: 'barrel', p: 0.3, wallBias: true }, { kind: 'deadTree', p: 0.08, wallBias: true }, { kind: 'sprayCans', p: 0.15 }, { kind: 'rustCan', p: 0.15 }, { kind: 'ammoBox', p: 0.12, wallBias: true }, { kind: 'deadBranch', p: 0.3, wallBias: true }],
      milestone: [{ kind: 'lantern', p: 0.2, wallBias: true }],
      safe: [{ kind: 'lantern', p: 0.5, wallBias: true }, { kind: 'armchair', p: 0.3, wallBias: true }, { kind: 'boombox', p: 0.2 }, { kind: 'foodCans', p: 0.3 }, { kind: 'jerrycanP', p: 0.2, wallBias: true }, { kind: 'megaphone', p: 0.1 }, { kind: 'goblets', p: 0.2 }, { kind: 'rations', p: 0.3 }, { kind: 'medicalTape', p: 0.25 }, { kind: 'thermos', p: 0.2 }, { kind: 'chessSet', p: 0.15 }, { kind: 'boardGame', p: 0.12 }, { kind: 'ornament', p: 0.15 }, { kind: 'compass', p: 0.1 }, { kind: 'pocketWatch', p: 0.1 }],
      underscript: [{ kind: 'wineBarrel', p: 0.45, wallBias: true }, { kind: 'milCrate', p: 0.4, wallBias: true }, { kind: 'lantern', p: 0.3, wallBias: true }, { kind: 'barrel', p: 0.3, wallBias: true }, { kind: 'plasticCrate3', p: 0.3, wallBias: true }, { kind: 'roadBarrier', p: 0.15 }, { kind: 'hydrant', p: 0.12, wallBias: true }, { kind: 'manhole', p: 0.25 }, { kind: 'wetFloor', p: 0.2 }, { kind: 'cementBag', p: 0.2, wallBias: true }, { kind: 'compostBags', p: 0.25, wallBias: true }, { kind: 'drillPress', p: 0.2, wallBias: true }, { kind: 'jerrycanP', p: 0.2, wallBias: true }, { kind: 'deadTree', p: 0.05, wallBias: true }, { kind: 'ammoBox', p: 0.15, wallBias: true }, { kind: 'broom', p: 0.15, wallBias: true }, { kind: 'deadBranch', p: 0.2, wallBias: true }, { kind: 'crowbar', p: 0.12 }, { kind: 'boltCutters', p: 0.1 }, { kind: 'rations', p: 0.2 }, { kind: 'plasticBin', p: 0.2, wallBias: true }, { kind: 'gallonJug', p: 0.15 }, { kind: 'handTruck', p: 0.15, wallBias: true }, { kind: 'wheelRim', p: 0.12, wallBias: true }, { kind: 'compressor', p: 0.12, wallBias: true }, { kind: 'spade', p: 0.1, wallBias: true }],
    } as Record<string, { kind: PropKind; p: number; wallBias?: boolean }[]>)[spec.biome] ?? [];
    for (const fp of floorSet) {
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
      } catch { /* dressing only */ }
    }
  }

  // Props
  for (const p of spec.props) {
    try {
      const built = buildProp({ ...p }, rng.fork(Math.floor(p.x * 97 + p.z * 13)));
      group.add(built.group);
      wireColliders(built);
      // Template-declared windows spill the same moonlight pool as
      // biome-mount windows — the glow extends toward the room center.
      if (p.kind === 'window') {
        const len = Math.hypot(p.x, p.z) || 1;
        moonlightPool(p.x - (p.x / len) * 0.9, p.z - (p.z / len) * 0.9, (p.yaw ?? 0) + (rng.float() - 0.5) * 0.15);
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

  // Transform to world
  group.position.set(room.origin.x, room.origin.y, room.origin.z);
  group.rotation.y = room.yaw;

  const animated: THREE.Object3D[] = [];
  group.traverse((o) => { if (o.userData.anim) animated.push(o); });

  return { group, doorLeaves, lampMeshes, lights, shafts, dust, animated };
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
}
