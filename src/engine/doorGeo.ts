import type { Door } from '../game/types';
import type { Vec3 } from './math';

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
