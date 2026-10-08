import type { RoomInstance } from './types';

/** Crew-board furniture a wanted sheet can pin to — the same hosts the
 *  under's boards hang on (generator's BOARD_HOSTS). */
export const WANTED_HOSTS = new Set(['keyCabinet', 'cabinet', 'locker', 'stackShelf', 'cubicle']);

export interface WantedHost {
  /** Index into the passed rooms array (builtIndices space). */
  roomIdx: number;
  x: number;
  z: number;
}

/** Pick the crew-board hosts the sheets pin to: the first host prop in
 *  each room downstream of `fromIdx`, at most `max` rooms. Pure — the
 *  caller projects spec-local prop coords to world space. */
export function pickWantedHosts(rooms: RoomInstance[], fromIdx: number, max = 5): WantedHost[] {
  const out: WantedHost[] = [];
  for (let i = fromIdx + 1; i < rooms.length && out.length < max; i++) {
    const r = rooms[i];
    const host = r.spec?.props.find((pp) => WANTED_HOSTS.has(pp.kind));
    if (!host) continue;
    const cyr = Math.cos(r.yaw), syr = Math.sin(r.yaw);
    out.push({
      roomIdx: i,
      x: r.origin.x + host.x * cyr + host.z * syr,
      z: r.origin.z - host.x * syr + host.z * cyr,
    });
  }
  return out;
}
