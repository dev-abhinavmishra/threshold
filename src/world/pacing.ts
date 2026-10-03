/**
 * Pacing planner — turns the flat per-room spawn roll into an authored
 * tension curve. The beat plan is seeded (own 'pacing' stream) so runs stay
 * deterministic: it only decides *which tension tier each room lives in*;
 * entity selection still comes from ENTITY_TUNING inside the tier's cap.
 *
 * Tiers: 0 calm · 1 warning · 2 threat · 3 chase-window.
 * The curve rises toward room 100 with guaranteed relief valleys after any
 * high-intensity beat, and the first/last few rooms are always calm.
 */
import { Rng } from '../engine/rng';
import type { RoomInstance } from '../game/types';

export interface Beat { from: number; to: number; tier: 0 | 1 | 2 | 3 }

/** Lowest tier each entity may appear in (main floor only). */
export const ENTITY_TIER: Record<string, number> = {
  inkling: 1, hollow: 1, redactor: 1, witness: 1, whisper: 1,
  echoskin: 2, husk: 2, grafter: 2,
  sweep: 3, reprise: 3, maelstrom: 3, returner: 3, behemoth: 3,
  lurker: 2,
};

export function planBeats(rng: Rng, rooms: RoomInstance[]): Beat[] {
  const n = rooms.length;
  const beats: Beat[] = [];
  const min = (i: number) => rooms[i]?.index ?? 0;
  let i = 0;
  while (i < n) {
    const idx = min(i);
    const progress = idx / Math.max(1, min(n - 1));
    const len = 3 + rng.int(0, 4); // 3–6 rooms per beat
    // Base tension target rises along the run; early rooms damped hard.
    const base = progress < 0.08 ? 0 : progress < 0.18 ? 1 : progress < 0.5 ? 1 + rng.int(0, 2) : 1 + rng.int(0, 3);
    let tier = Math.min(3, base) as Beat['tier'];
    // Hard rules: relief after a high beat; no chase-window in the first 15.
    const prev = beats[beats.length - 1];
    if (prev && prev.tier >= 2) tier = rng.bool(0.75) ? 0 : 1;
    if (idx < 15 && tier >= 2) tier = 1;
    // Calm valleys cap at ~8 rooms of run — never let quiet outstay its welcome.
    if (tier === 0) {
      let calm = 0;
      for (let i = beats.length - 1; i >= 0; i--) { if (beats[i].tier !== 0) break; calm += beats[i].to - beats[i].from + 1; }
      if (calm + len > 8) tier = 1;
    }
    // Milestone approach (45+, 70+, 95+) lifts the floor.
    if (idx >= 95 && tier < 2) tier = 2;
    else if (idx >= 70 && idx < 76 && tier === 0) tier = 1;
    else if (idx >= 45 && idx < 51 && tier === 0) tier = 1;
    beats.push({ from: i, to: Math.min(n, i + len) - 1, tier });
    i += len;
  }
  return beats;
}

/** Tier lookup per room index — O(1) after build. */
export function tierMap(beats: Beat[], rooms: RoomInstance[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const b of beats) for (let i = b.from; i <= b.to; i++) m.set(rooms[i].index, b.tier);
  return m;
}
