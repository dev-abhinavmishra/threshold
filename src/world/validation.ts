/**
 * Route validation — runs after generation to certify a seed is playable:
 * connectivity (BFS from room 0 to the exit), key-before-lock ordering,
 * hiding options near lethal-threat trigger rooms, and reachable
 * Underscript entry requirements.
 */
import type { GeneratedRoute } from './generator';
import type { RoomInstance, ScheduledEncounter } from '../game/types';
import { INCOMPATIBLE } from '../game/config';
import type { EntityId } from '../game/types';

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Connectivity check: every main-route room reachable from 0. */
export function validateRoute(route: GeneratedRoute): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rooms = route.rooms;

  // --- connectivity ---
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    const i = queue.shift()!;
    const r = rooms[i];
    for (const nxt of [i + 1, i - 1]) {
      if (nxt < 0 || nxt >= rooms.length || rooms[nxt].branchOf) continue;
      if (seen.has(nxt)) continue;
      // rooms chain through doors — a room is connected if adjacent room
      // exists and neither has a placement error.
      seen.add(nxt);
      queue.push(nxt);
    }
    // branch closets connect via parent
    for (const b of rooms) {
      if (b.branchOf === r.index && !seen.has(b.index)) {
        seen.add(b.index);
        queue.push(b.index);
      }
    }
  }
  for (const r of rooms) {
    if (!seen.has(r.index)) errors.push(`room ${r.index} (${r.templateId}) unreachable`);
  }

  // --- key-before-lock ---
  const keyByLock = new Map(route.keyPairs.map((k) => [k.lockId, k.keyRoom]));
  for (const r of rooms) {
    for (const d of r.doors) {
      if (!d.locked || !d.isMainRoute) continue;
      const keyRoom = keyByLock.get(d.lockId ?? d.id);
      if (keyRoom === undefined) {
        errors.push(`locked door ${d.id} (room ${r.index}) has no key`);
        continue;
      }
      if (keyRoom >= r.index) errors.push(`key for door ${d.id} placed at room ${keyRoom} ≥ lock room ${r.index}`);
      if (!seen.has(keyRoom)) errors.push(`key room ${keyRoom} unreachable for door ${d.id}`);
    }
  }

  // --- survival options near lethal corridor threats ---
  const lethal: EntityId[] = ['sweep', 'reprise', 'maelstrom', 'redline', 'returner'];
  for (const sch of route.rooms.flatMap((r) => r.scheduled)) {
    if (!lethal.includes(sch.entity)) continue;
    const room = rooms[sch.triggerRoom];
    if (!room) continue;
    if (!hasSurvival(room) && !hasNeighborSurvival(route.rooms, sch.triggerRoom)) {
      errors.push(`no hiding/safe option within reach of ${sch.entity} trigger room ${sch.triggerRoom}`);
    }
  }

  // --- encounter compatibility windows ---
  const byWindow = new Map<number, ScheduledEncounter[]>();
  for (const r of rooms) {
    for (const s of r.scheduled) {
      const w = Math.floor(s.triggerRoom / 6);
      const arr = byWindow.get(w) ?? [];
      arr.push(s);
      byWindow.set(w, arr);
    }
  }
  for (const [w, arr] of byWindow) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const pair: [EntityId, EntityId] = [arr[i].entity, arr[j].entity];
        if (INCOMPATIBLE.some(([a, b]) => (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a))) {
          errors.push(`incompatible encounter window ${w}: ${pair[0]}+${pair[1]}`);
        }
      }
    }
  }

  // --- underscript entry requirements ---
  if (route.underRooms.length) {
    const entrance = route.rooms.find((r) => r.templateId === 'ms-under-entrance');
    if (!entrance) warnings.push('Underscript generated but no entrance milestone');
    // resonanceKey socket before entrance index
    const keyRoom = rooms.findIndex((r) => r.sockets.some((s) => s.meta.contains === 'resonanceKey' || s.meta.item === 'resonanceKey'));
    if (entrance && (keyRoom < 0 || keyRoom > entrance.index)) {
      errors.push(`resonanceKey not placed before Underscript entrance (key@${keyRoom} entrance@${entrance?.index})`);
    }
  }

  // --- milestone ordering ---
  const idx = (id: string) => rooms.findIndex((r) => r.templateId === id);
  const checks: [string, number][] = [
    ['ms-index', idx('ms-index')],
    ['ms-lens-hall', idx('ms-lens-hall')],
    ['ms-engine', idx('ms-engine')],
  ];
  for (const [id, i] of checks) {
    if (i < 0) errors.push(`milestone ${id} missing`);
  }
  if (idx('ms-index') >= 0 && idx('ms-lens-hall') >= 0 && idx('ms-index') > idx('ms-lens-hall'))
    errors.push('Index placed after Lens Hall');
  if (idx('ms-engine') >= 0 && idx('ms-engine') !== rooms.length - 1) warnings.push('Engine is not the last room');

  return { ok: errors.length === 0, errors, warnings };
}

function hasSurvival(room: RoomInstance): boolean {
  return room.hidingSpots.length > 0 || room.safeZones.length > 0;
}

function hasNeighborSurvival(rooms: RoomInstance[], index: number): boolean {
  for (let i = index - 2; i <= index + 2; i++) {
    if (i === index) continue;
    if (i >= 0 && i < rooms.length && hasSurvival(rooms[i])) return true;
  }
  return false;
}
