/**
 * Room mesh builder — turns a RoomInstance (data) into a THREE.Group.
 * Walls come from the spec's collider boxes so visuals and collision always
 * match. Props are procedural. Lights are cheap point lights capped by quality.
 */
import * as THREE from 'three';
import type { RoomInstance } from '../game/types';
import type { RoomSpec } from './spec';
import { buildProp } from './props';
import { MAT, floorMaterial } from './materials';
import { SeedStreams } from '../engine/rng';
import { portLocalPos } from './spec';

export interface BuiltRoom {
  group: THREE.Group;
  /** Door leaf meshes keyed by door id for animation. */
  doorLeaves: Map<string, THREE.Mesh>;
  /** Breakable light meshes keyed by group. */
  lampMeshes: THREE.Mesh[];
  /** Actual THREE lights (few, quality-capped). */
  lights: THREE.PointLight[];
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

export function buildRoomMesh(room: RoomInstance, spec: RoomSpec, seed: number, quality: 'low' | 'medium' | 'high'): BuiltRoom {
  const rng = new SeedStreams('').roomStream('dressing', room.index * 31 + 7 + seed);
  const group = new THREE.Group();
  group.name = `room-${room.index}`;

  const isUnder = room.biome === 'underscript';
  const wallMat = isUnder ? MAT.concrete() : (room.darkRoom ? MAT.plasterDark() : MAT.plaster());
  const floorMat = isUnder ? MAT.concreteDark() : floorMaterial(room.floorMaterial);
  const ceilMat = isUnder ? MAT.concreteDark() : MAT.plasterDark();
  const w = room.width, d = room.depth, h = room.height;

  // Floor + ceiling
  const floor = new THREE.Mesh(unitBox, floorMat);
  floor.scale.set(w, 0.1, d);
  floor.position.y = -0.05;
  group.add(floor);
  const ceil = new THREE.Mesh(unitBox, ceilMat);
  ceil.scale.set(w, 0.1, d);
  ceil.position.y = h + 0.05;
  group.add(ceil);

  // Walls from collider boxes (local coords → room group is placed at origin with yaw,
  // so we emit wall meshes in LOCAL space matching colliders).
  for (const c of spec.colliders) {
    if (c.walkable) continue;
    if (c.w <= 0.05 || c.d <= 0.05) continue;
    if (c.h < h * 0.5 && !c.losOnly) continue; // only tall wall segments become walls
    const wallMesh = new THREE.Mesh(unitBox, wallMat);
    wallMesh.scale.set(c.w, c.h, c.d);
    wallMesh.position.set(c.x, (c.y ?? 0) + c.h / 2, c.z);
    group.add(wallMesh);
  }
  // Trim: baseboard
  const baseboard = new THREE.Mesh(unitBox, MAT.charcoal());
  baseboard.scale.set(w - 0.2, 0.12, d - 0.2);
  baseboard.position.y = 0.06;
  // only render as thin inset — skip for perf: use edge strips on n/s walls
  void baseboard;

  // Door frames at ports
  const doorLeaves = new Map<string, THREE.Mesh>();
  const doorPositions = [spec.entry, ...spec.exits];
  for (const port of doorPositions) {
    const lp = portLocalPos(port, w, d);
    const frame = new THREE.Group();
    const fw = port.width + 0.3;
    const sideW = 0.15;
    const frameMat = isUnder ? MAT.steelDark() : MAT.darkOak();
    const left = new THREE.Mesh(unitBox, frameMat);
    left.scale.set(sideW, 2.3, 0.4);
    left.position.set(-fw / 2 + sideW / 2, 1.15, 0);
    const right = left.clone();
    right.position.x = fw / 2 - sideW / 2;
    const top = new THREE.Mesh(unitBox, frameMat);
    top.scale.set(fw, 0.25, 0.4);
    top.position.y = 2.4;
    frame.add(left, right, top);
    // label plate above door
    const plate = new THREE.Mesh(unitBox, MAT.brass());
    plate.scale.set(0.5, 0.25, 0.05);
    plate.position.y = 2.62;
    frame.add(plate);
    // leaf
    const leaf = new THREE.Mesh(unitBox, isUnder ? MAT.steel() : MAT.oak());
    leaf.scale.set(port.width - 0.1, 2.2, 0.09);
    leaf.position.set(0, 1.1, 0);
    leaf.geometry = unitBox;
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
  for (const p of spec.props) {
    try {
      const built = buildProp({ ...p }, rng.fork(Math.floor(p.x * 97 + p.z * 13)));
      group.add(built.group);
    } catch {
      // skip broken prop rather than fail room
    }
  }

  // Light fixtures (visible lamp meshes) + real lights capped by quality
  const lampMeshes: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  const maxLights = quality === 'low' ? 1 : quality === 'medium' ? 2 : 3;
  const sorted = [...spec.lights].sort((a, b) => b.intensity - a.intensity);
  for (const ls of spec.lights) {
    const bulb = new THREE.Mesh(unitBox, ls.group === 'warning' ? MAT.redLamp() : MAT.amberDim());
    bulb.scale.set(0.15, 0.08, 0.15);
    bulb.position.set(ls.x, ls.y - 0.05, ls.z);
    group.add(bulb);
    lampMeshes.push(bulb);
  }
  for (const ls of sorted.slice(0, maxLights)) {
    const pl = new THREE.PointLight(ls.color, ls.intensity * (room.darkRoom ? 0.25 : 1), ls.range, 1.8);
    pl.position.set(ls.x, ls.y, ls.z);
    group.add(pl);
    lights.push(pl);
    pl.userData.group = ls.group;
    pl.userData.baseIntensity = pl.intensity;
  }
  if (room.darkRoom) {
    for (const b of lampMeshes) (b.material as THREE.MeshStandardMaterial) = MAT.charcoal();
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
      const fl = new THREE.Mesh(unitBox, floorMat);
      fl.scale.set(Math.abs(ux) > 0.5 ? len + 2.6 : 2.8, 0.08, Math.abs(ux) > 0.5 ? 2.8 : len + 2.6);
      fl.position.set((la.x + lb.x) / 2, -0.04, (la.z + lb.z) / 2);
      corr.add(fl);
      const ce = fl.clone();
      ce.position.y = 2.74;
      corr.add(ce);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(unitBox, wallMat);
        const px = -uz * side * 1.3, pz = ux * side * 1.3;
        wall.scale.set(Math.abs(ux) > 0.5 ? len + 2.6 : 0.24, 2.8, Math.abs(ux) > 0.5 ? 0.24 : len + 2.6);
        wall.position.set((la.x + lb.x) / 2 + px, 1.4, (la.z + lb.z) / 2 + pz);
        corr.add(wall);
      }
    }
    group.add(corr);
  }

  // Transform to world
  group.position.set(room.origin.x, room.origin.y, room.origin.z);
  group.rotation.y = room.yaw;

  return { group, doorLeaves, lampMeshes, lights };
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
}
