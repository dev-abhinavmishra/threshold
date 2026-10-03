/**
 * Foreshadowing — after encounters are scheduled, the 1–2 rooms before each
 * trigger room get tell-tale dressing: candles before the Whisper, mirrors
 * before the EchoSkin, a dropped lantern before a corridor chase. The pass
 * runs on the 'scare' stream so structure and dressing are untouched.
 *
 * Props land near the room's entry or along its walls where a player
 * walking the route actually sees them — never blocking the path.
 */
import type { Rng } from '../engine/rng';
import type { RoomInstance } from '../game/types';
import type { PropKind } from './spec';

const TELLS: Record<string, PropKind[][]> = {
  // two candidate sets per entity: nearer rooms pull from later sets
  whisper:    [['papers', 'candle'], ['paperStack']],
  inkling:    [['paperStack', 'papers'], ['books']],
  echoskin:   [['mirror'], ['hauntedPortrait']],
  husk:       [['rubblePile', 'deadBranch'], ['rubble']],
  hollow:     [['lantern', 'candle'], ['flashlight']],
  redactor:   [['papers', 'paperStack'], ['books']],
  witness:    [['watcherFigure'], ['securityCam']],
  grafter:    [['wrench', 'multimeter'], ['toolbox']],
  sweep:      [['paperScatter', 'lantern'], ['rubble']],
  reprise:    [['paperScatter', 'flashlight'], ['rubble']],
  maelstrom:  [['rubblePile', 'wallVent'], ['rubble']],
  returner:   [['hallFigure'], ['lantern']],
};

export function applyForeshadowing(rooms: RoomInstance[], rng: Rng): void {
  const byIndex = new Map(rooms.map((r) => [r.index, r]));
  for (const room of rooms) {
    for (const sch of room.scheduled) {
      const sets = TELLS[sch.entity];
      if (!sets) continue;
      for (let back = 1; back <= 2; back++) {
        const prev = byIndex.get(room.index - back);
        if (!prev || !prev.spec || prev.authored) continue;
        const set = sets[Math.min(back - 1, sets.length - 1)];
        const spec = prev.spec;
        const hw = spec.width / 2 - 1.2, hh = spec.depth / 2 - 1.2;
        for (const kind of set) {
          // hug the side walls so the prop reads at the door but never blocks
          const side = rng.bool(0.5) ? 1 : -1;
          const x = side * rng.range(hw * 0.55, hw * 0.9);
          const z = rng.range(-hh * 0.6, hh * 0.75);
          spec.props.push({
            kind,
            x, z,
            yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
            meta: { foreshadow: sch.entity },
          });
        }
      }
    }
  }
}
