/**
 * Rouse rules — which world-noise events wake dormant scheduled encounters
 * behind a closed door. Kept pure (no Game/THREE) so vitest drives it.
 *
 * Deliberately loud-only: walk steps (0.4) and quiet door creaks never rouse,
 * sprint strides (0.85), slams, splinters, lures and machine knocks do.
 * Entity-sourced events (source set) and the rouse tell itself ('entity-cue')
 * never feed back in — a roused thing can't rouse its neighbours for free.
 */
import type { SoundEvent } from './events';

export const ROUSE_MIN_INTENSITY = 0.55;

const ROUSE_CATEGORIES = new Set([
  'sprint', 'door', 'impact', 'item', 'puzzle-fail', 'machine', 'distraction', 'drawer',
]);

export function noiseCanRouse(e: SoundEvent): boolean {
  return !e.source && e.intensity >= ROUSE_MIN_INTENSITY && ROUSE_CATEGORIES.has(e.category);
}

/** Hearing reach of the room beyond: loud noise carries ~14m per intensity —
 *  a sprint stride reaches ~12m, a slammed door ~21m. */
export function withinRouseRadius(e: SoundEvent, x: number, z: number): boolean {
  const dx = e.x - x, dz = e.z - z;
  const r = e.intensity * 14;
  return dx * dx + dz * dz <= r * r;
}
