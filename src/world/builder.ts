/**
 * Room mesh builder — turns a RoomInstance (data) into a THREE.Group.
 * Walls come from the spec's collider boxes so visuals and collision always
 * match. Props are procedural. Lights are cheap point lights capped by quality.
 */
import * as THREE from 'three';
import type { RoomInstance } from '../game/types';
import type { RoomSpec } from './spec';
import { buildProp } from './props';
import { MAT } from './materials';
import { SeedStreams } from '../engine/rng';
import { aabb } from '../engine/math';
import { portLocalPos } from './spec';
import { TEX } from './textures';
import { box as texBox } from './props';

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
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

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
  const wallMat = isUnder ? TEX.concreteWall() : (room.darkRoom ? TEX.plasterDamaged() : TEX.wallpaper());
  const floorMat = isUnder ? TEX.concreteFloor() : (room.floorMaterial === 'carpet' ? TEX.carpet() : room.floorMaterial === 'stone' || room.floorMaterial === 'metal' ? TEX.concreteFloor() : TEX.woodFloor());
  const ceilMat = isUnder ? TEX.concreteFloor() : TEX.ceiling();
  const w = room.width, d = room.depth, h = room.height;

  // Floor + ceiling (texBox carries meter-scaled UVs)
  const floor = new THREE.Mesh(texBox(w, 0.1, d), floorMat);
  floor.position.y = -0.05;
  group.add(floor);
  const ceil = new THREE.Mesh(texBox(w, 0.1, d), ceilMat);
  ceil.position.y = h + 0.05;
  group.add(ceil);

  // Suspended drop ceiling — tile skin + T-bar grid for interior-height rooms.
  // Service spaces keep an exposed slab with a duct trunk instead.
  const suspended = !isUnder && spec.biome != 'maintenance' && h <= 3.6;
  const fixtureY = suspended ? h - 0.22 : h - 0.3;
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
  // Trim: baseboard + crown strips along the four walls
  const trimMat = isUnder ? MAT.steelDark() : MAT.darkOak();
  const wainsMat = isUnder ? MAT.steelDark() : MAT.oak();
  for (const [sx, sz, sw2, sd] of [
    [0, d / 2 - 0.04, w - 0.3, 0.07],
    [0, -d / 2 + 0.04, w - 0.3, 0.07],
    [w / 2 - 0.04, 0, 0.07, d - 0.3],
    [-w / 2 + 0.04, 0, 0.07, d - 0.3],
  ] as const) {
    const bb = new THREE.Mesh(texBox(sw2, 0.12, sd), trimMat);
    bb.position.set(sx, 0.06, sz);
    group.add(bb);
    const cr = new THREE.Mesh(texBox(sw2, 0.1, sd), trimMat);
    cr.position.set(sx, h - 0.05, sz);
    group.add(cr);
    if (!isUnder && h >= 2.6) {
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
    // Numbered label plate above door — exit doors read the next room's number.
    const label = String(port === spec.entry ? room.index : room.index + 1).padStart(3, '0');
    const plate = new THREE.Mesh(texBox(0.55, 0.27, 0.05), plateMaterial(label) ?? MAT.brass());
    plate.position.y = 2.68;
    frame.add(plate);
    // leaf
    const leaf = new THREE.Mesh(texBox(port.width - 0.1, 2.2, 0.09), isUnder ? MAT.steel() : MAT.oak());
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

  // Props
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
  for (const p of spec.props) {
    try {
      const built = buildProp({ ...p }, rng.fork(Math.floor(p.x * 97 + p.z * 13)));
      group.add(built.group);
      wireColliders(built);
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
      } else if (isUnder || spec.biome === 'maintenance') {
        for (const sx of [-0.45, 0.45]) {
          const stem = new THREE.Mesh(texBox(0.02, 0.22, 0.02), MAT.charcoal());
          stem.position.set(ls.x + sx, ls.y + 0.11, ls.z);
          group.add(stem);
        }
        const housing = new THREE.Mesh(texBox(1.32, 0.05, 0.2), MAT.steelDark());
        housing.position.set(ls.x, ls.y, ls.z);
        group.add(housing);
        const tube = new THREE.Mesh(texBox(1.24, 0.03, 0.14), MAT.fluoro());
        tube.position.set(ls.x, ls.y - 0.035, ls.z);
        group.add(tube);
        lampMeshes.push(tube);
      } else {
        // pendant — cord + shade + bulb
        const cord = new THREE.Mesh(texBox(0.02, 0.5, 0.02), MAT.charcoal());
        cord.position.set(ls.x, ls.y + 0.25, ls.z);
        group.add(cord);
        const shade = new THREE.Mesh(texBox(0.3, 0.18, 0.3), MAT.charcoal());
        shade.position.set(ls.x, ls.y - 0.04, ls.z);
        group.add(shade);
        const bulb = new THREE.Mesh(unitBox, MAT.amberDim());
        bulb.scale.set(0.12, 0.09, 0.12);
        bulb.position.set(ls.x, ls.y - 0.14, ls.z);
        group.add(bulb);
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
  let shadowAssigned = false;
  for (const ls of sorted.slice(0, maxLights)) {
    // decay=2 physical falloff → boost authored (legacy-scale) intensities
    const pl = new THREE.PointLight(ls.color, ls.intensity * 24 * (room.darkRoom ? 0.25 : 1), ls.range * 1.3, 2);
    pl.position.set(ls.x, ls.y, ls.z);
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
        new THREE.CylinderGeometry(0.26, Math.min(0.85, ls.range * 0.22), len, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: ls.color, transparent: true, opacity: 0.045,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
          fog: false,
        }),
      );
      shaft.position.set(ls.x, topY - len / 2, ls.z);
      group.add(shaft);
      shafts.push(shaft);
      shaftCount++;
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
        color: 0xd8c9a8, size: 0.022, transparent: true, opacity: 0.3,
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

  return { group, doorLeaves, lampMeshes, lights, shafts, dust };
}

export function disposeRoom(built: BuiltRoom): void {
  built.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && m.geometry !== unitBox) m.geometry.dispose();
  });
  built.group.clear();
  built.doorLeaves.clear();
  built.lampMeshes.length = 0;
  built.lights.length = 0;
  built.shafts.length = 0;
  built.dust = null;
}
