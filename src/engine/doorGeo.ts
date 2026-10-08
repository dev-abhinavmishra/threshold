import type { Door } from '../game/types';
import { v3dist, type Vec3, type Aabb } from './math';

/** A door's leaf runs along (cos yaw, −sin yaw); its through-direction is the
 *  wall normal (sin yaw, cos yaw). `from` clearly off the leaf plane is blocked
 *  only by a `to` on the opposite side; `from` standing in the doorway itself
 *  blocks anything meaningfully through it. Shared by entities that respect
 *  doors (bellman trail-holds, warden investigations). */
export function doorBetween(d: Door, from: Vec3, to: Vec3): boolean {
  const nx = Math.sin(d.yaw), nz = Math.cos(d.yaw);
  const pSide = (from.x - d.pos.x) * nx + (from.z - d.pos.z) * nz;
  const tSide = (to.x - d.pos.x) * nx + (to.z - d.pos.z) * nz;
  if (Math.abs(pSide) > 0.45) return pSide * tSide < 0;
  return Math.abs(tSide) > 0.45;
}

/** Shut-leaf panels between two points, as LOS blockers. Doors don't ride a
 *  room's losBlockers (that list is static room geometry; leaves move), so
 *  every sight test has to sweep them itself — a shut leaf is a physical
 *  1.0×2.2 panel and sight can't pass it, including at its lateral edge
 *  where the infinite-plane `doorBetween` test loses the player. Open or
 *  mid-swing leaves and false doors don't block; far leaves whose planes
 *  merely straddle the endpoints are pruned so a leaf truly between is the
 *  only candidate. Shared by every entity/player sight rule — kill verdicts,
 *  whistles, gazes, lenses — so "a shut leaf is cover" means one thing
 *  everywhere. */
export function shutLeafBlockers(rooms: { doors: Door[] }[], a: Vec3, b: Vec3): Aabb[] {
  const out: Aabb[] = [];
  const d = v3dist(a, b);
  for (const r of rooms) {
    for (const dr of r.doors) {
      if (dr.opening || (dr.openT ?? 0) > 0.5 || dr.falseDoor) continue;
      if (v3dist(dr.pos, a) > d + 0.6 && v3dist(dr.pos, b) > d + 0.6) continue;
      const nx = Math.sin(dr.yaw), nz = Math.cos(dr.yaw);
      const tx = nz, tz = -nx; // the leaf's lateral axis
      out.push({
        minX: dr.pos.x - 0.55 * Math.abs(tx) - 0.06 * Math.abs(nx),
        minY: 0,
        minZ: dr.pos.z - 0.55 * Math.abs(tz) - 0.06 * Math.abs(nz),
        maxX: dr.pos.x + 0.55 * Math.abs(tx) + 0.06 * Math.abs(nx),
        maxY: 2.2,
        maxZ: dr.pos.z + 0.55 * Math.abs(tz) + 0.06 * Math.abs(nz),
      });
    }
  }
  return out;
}

/** A door belonging to `room` within `reach` of pos — "the entity is standing
 *  at that room's door", used to gate cross-room reactions to sounds. */
export function atRoomDoor(room: { doors: Door[] }, pos: Vec3, reach = 1.6): boolean {
  return room.doors.some((d) => Math.hypot(pos.x - d.pos.x, pos.z - d.pos.z) < reach);
}

/** Is (x,z) inside the room's yaw-rotated spec bounds (with a small skirt). */
export function pointInRoom(
  room: { origin: { x: number; z: number }; yaw: number; spec?: { width: number; depth: number } | null },
  x: number, z: number, skirt = 0.25,
): boolean {
  const spec = room.spec;
  if (!spec) return false;
  const dx = x - room.origin.x, dz = z - room.origin.z;
  const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
  return Math.abs(dx * c - dz * s) <= spec.width / 2 + skirt
    && Math.abs(dx * s + dz * c) <= spec.depth / 2 + skirt;
}
